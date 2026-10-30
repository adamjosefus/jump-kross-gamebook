import { parseExpr, variablesOf } from './expr.ts'
import { isConfigObject, parseObject } from './object.ts'
import { parseTemplate, type VariableRef } from './template.ts'
import type {
  Choice,
  ConfigObject,
  Diagnostic,
  GameGraph,
  GameNode,
  NodeType,
  ParseResult,
  Span,
  State,
  StateChange,
  Value,
} from './types.ts'

export interface ParseOptions {
  /** Known `theme` values; anything else is a warning. */
  readonly themes?: readonly string[]
  /** Known location ids; when given, `scan` to an unknown location is a warning. */
  readonly locations?: readonly number[]
}

export const DEFAULT_THEMES = ['intro'] as const

const HEADER = /^---[ \t]*(\S+?)[ \t]*---(.*)$/
const NODE_ID = /^[A-Za-z0-9_]+$/
const CHOICE_LIKE = /^[ \t]*-[ \t]+.*\[[^\]\n]*\]/
const CHOICE = /^([ \t]*-[ \t]+)(.*?)[ \t]*\[([^\]]*)\][ \t]*(.*?)[ \t]*$/
const RESERVED_VARIABLES = new Set(['if'])
const NODE_KEYS = new Set(['type', 'theme', 'initialState', 'scan'])

interface Line {
  readonly from: number
  readonly to: number
  readonly text: string
}

const splitLines = (source: string, from = 0, to = source.length): Line[] => {
  const lines: Line[] = []
  let start = from
  while (start <= to) {
    let end = source.indexOf('\n', start)
    if (end === -1 || end > to) end = to
    lines.push({ from: start, to: end, text: source.slice(start, end) })
    if (end === to) break
    start = end + 1
  }
  return lines
}

interface Header {
  readonly line: Line
  readonly id: string
  readonly idSpan: Span
  /** Offset where the text after the closing `---` starts. */
  readonly restFrom: number
  readonly rest: string
}

const findHeaders = (source: string): Header[] =>
  splitLines(source).flatMap((line) => {
    const match = HEADER.exec(line.text)
    if (!match) return []
    const id = match[1]!
    const idFrom = line.from + line.text.indexOf(id, 3)
    const rest = match[2]!
    return [
      {
        line,
        id,
        idSpan: { from: idFrom, to: idFrom + id.length },
        restFrom: line.to - rest.length,
        rest,
      },
    ]
  })

class NodeParser {
  readonly diagnostics: Diagnostic[] = []
  readonly variables: VariableRef[] = []
  readonly assigned = new Set<string>()
  broken = false
  readonly source: string

  constructor(source: string) {
    this.source = source
  }

  error(span: Span, message: string) {
    this.broken = true
    this.diagnostics.push({ ...span, severity: 'error', message })
  }

  warning(span: Span, message: string) {
    this.diagnostics.push({ ...span, severity: 'warning', message })
  }

  /** Locates a key inside an object literal for diagnostics; falls back to the whole object. */
  keySpan(object: Span, key: string): Span {
    const text = this.source.slice(object.from, object.to)
    const match = new RegExp(`(^|[\\s{,])(["']?)${key.replace(/[$]/g, '\\$')}\\2\\s*:`).exec(text)
    if (!match) return object
    const from = object.from + match.index + match[1]!.length
    return { from, to: from + key.length + match[2]!.length * 2 }
  }

  condition(source: string, at: number): ReturnType<typeof parseExpr> {
    const result = parseExpr(source)
    if (!result.ok) {
      this.error(
        { from: at + result.offset, to: at + Math.max(result.offset + 1, source.length) },
        `Chybná podmínka: ${result.message}`,
      )
    } else {
      for (const v of variablesOf(result.expr))
        this.variables.push({ name: v.name, offset: at + v.offset })
    }
    return result
  }

  parseConfig(config: ConfigObject, span: Span) {
    let type: NodeType = 'passage'
    let theme: string | undefined
    let initialState: State = {}
    let scan: number | undefined

    for (const [key, value] of Object.entries(config)) {
      const at = this.keySpan(span, key)
      switch (key) {
        case 'type':
          if (value === 'start' || value === 'end' || value === 'passage') type = value
          else this.error(at, '„type“ musí být "start" nebo "end".')
          break
        case 'theme':
          if (typeof value === 'string') theme = value
          else this.error(at, '„theme“ musí být text.')
          break
        case 'scan':
          if (typeof value === 'number' && Number.isInteger(value) && value > 0) scan = value
          else this.error(at, '„scan“ musí být kladné celé číslo (id místa).')
          break
        case 'initialState': {
          if (!isConfigObject(value)) {
            this.error(at, '„initialState“ musí být objekt.')
            break
          }
          const state: Record<string, Value> = {}
          for (const [name, initial] of Object.entries(value)) {
            if (RESERVED_VARIABLES.has(name))
              this.error(at, `„${name}“ je rezervované slovo, nemůže být proměnnou.`)
            else if (isConfigObject(initial))
              this.error(at, `Výchozí hodnota „${name}“ musí být text, číslo nebo true/false.`)
            else {
              state[name] = initial
              this.assigned.add(name)
            }
          }
          initialState = state
          break
        }
        default:
          if (!NODE_KEYS.has(key)) this.warning(at, `Neznámá vlastnost uzlu „${key}“.`)
      }
    }
    return { type, theme, initialState, scan }
  }

  parseChoice(line: Line): Choice | undefined {
    const match = CHOICE.exec(line.text)
    if (!match) {
      this.error(line, 'Volba musí mít tvar „- Popisek [CÍL] { … }“.')
      return undefined
    }
    const [, bullet, label, target, rest] = match as unknown as [
      string,
      string,
      string,
      string,
      string,
    ]
    const labelFrom = line.from + bullet.length
    const targetFrom =
      line.from + line.text.indexOf(`[${target}]`, bullet.length + label.length) + 1
    const span = { from: line.from, to: line.to }
    if (label === '') this.error({ from: labelFrom, to: targetFrom }, 'Volba nemá popisek.')
    if (!NODE_ID.test(target)) {
      this.error(
        { from: targetFrom, to: targetFrom + target.length },
        `Neplatné id cíle „${target}“.`,
      )
    }

    let condition: Choice['condition']
    const changes: StateChange[] = []
    if (rest !== '') {
      const restFrom = line.from + line.text.lastIndexOf(rest)
      if (!rest.startsWith('{')) {
        this.error({ from: restFrom, to: line.to }, 'Za cílem volby smí být jen objekt { … }.')
      } else {
        const parsed = parseObject(this.source, restFrom, line.to)
        for (const d of parsed.diagnostics) this.error(d, d.message)
        if (parsed.end < line.to && this.source.slice(parsed.end, line.to).trim() !== '') {
          this.error({ from: parsed.end, to: line.to }, 'Nadbytečný text za objektem volby.')
        }
        const objectSpan = { from: restFrom, to: parsed.end }
        for (const [key, value] of Object.entries(parsed.value ?? {})) {
          const at = this.keySpan(objectSpan, key)
          if (key === 'if') {
            if (typeof value !== 'string') {
              this.error(at, '„if“ musí být podmínka v uvozovkách.')
              continue
            }
            const valueAt = this.source.indexOf(value, at.to)
            const result = this.condition(value, valueAt === -1 ? at.from : valueAt)
            if (result.ok) condition = result.expr
          } else if (isConfigObject(value)) {
            const keys = Object.keys(value)
            if (keys.length === 1 && typeof value['delta'] === 'number') {
              changes.push({ variable: key, op: 'delta', value: value['delta'] })
              this.assigned.add(key)
            } else this.error(at, `Změna „${key}“ musí být hodnota, nebo { delta: číslo }.`)
          } else {
            changes.push({ variable: key, op: 'set', value })
            this.assigned.add(key)
          }
        }
      }
    }
    return { label, target, condition, changes, span }
  }
}

interface ParsedNode {
  readonly node: GameNode
  readonly parser: NodeParser
}

const parseNode = (source: string, header: Header, blockEnd: number): ParsedNode => {
  const parser = new NodeParser(source)
  if (!NODE_ID.test(header.id)) {
    parser.error(
      header.idSpan,
      `Neplatné id uzlu „${header.id}“: povolená jsou písmena bez diakritiky, číslice a „_“.`,
    )
  }

  let config = {
    type: 'passage' as NodeType,
    theme: undefined as string | undefined,
    initialState: {} as State,
    scan: undefined as number | undefined,
  }
  let bodyFrom = Math.min(header.line.to + 1, blockEnd)
  const restTrimmed = header.rest.trimStart()
  if (restTrimmed !== '') {
    const restFrom = header.restFrom + (header.rest.length - restTrimmed.length)
    if (restTrimmed.startsWith('{')) {
      const parsed = parseObject(source, restFrom, blockEnd)
      for (const d of parsed.diagnostics) parser.error(d, d.message)
      if (parsed.value !== undefined)
        config = parser.parseConfig(parsed.value, { from: restFrom, to: parsed.end })
      let lineEnd = source.indexOf('\n', parsed.end)
      if (lineEnd === -1 || lineEnd > blockEnd) lineEnd = blockEnd
      if (parsed.closed && source.slice(parsed.end, lineEnd).trim() !== '') {
        parser.error(
          { from: parsed.end, to: lineEnd },
          'Za konfigurací uzlu nesmí být na stejném řádku další text.',
        )
      }
      bodyFrom = parsed.closed
        ? Math.min(lineEnd + 1, blockEnd)
        : Math.min(header.line.to + 1, blockEnd)
    } else {
      parser.error(
        { from: restFrom, to: header.line.to },
        'Za hlavičkou „--- ID ---“ smí být jen konfigurace { … }.',
      )
    }
  }

  // Trailing run of choice lines (blank lines allowed between them).
  const lines = splitLines(source, bodyFrom, blockEnd)
  let firstChoice = lines.length
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!
    if (line.text.trim() === '') continue
    if (!CHOICE_LIKE.test(line.text)) break
    firstChoice = i
  }
  const choiceLines = lines.slice(firstChoice).filter((line) => line.text.trim() !== '')
  const choices = choiceLines.flatMap((line) => parser.parseChoice(line) ?? [])
  const bodyTo = firstChoice < lines.length ? lines[firstChoice]!.from : blockEnd

  const template = parseTemplate(source.slice(bodyFrom, bodyTo), bodyFrom)
  for (const d of template.diagnostics) parser.error(d, d.message)
  parser.variables.push(...template.variables)

  const node: GameNode = {
    id: header.id,
    ...config,
    body: template.segments,
    choices,
    span: { from: header.line.from, to: blockEnd },
    headerSpan: { from: header.line.from, to: header.line.to },
    broken: parser.broken,
  }
  return { node, parser }
}

/**
 * Parses a gamebook document. Each `--- ID ---` block is parsed on its own, so an error in one
 * node never affects the others: the result always contains every node that has a header.
 */
export const parseDocument = (source: string, options: ParseOptions = {}): ParseResult => {
  const diagnostics: Diagnostic[] = []
  const headers = findHeaders(source)

  const preamble = source.slice(0, headers[0]?.line.from ?? source.length)
  if (preamble.trim() !== '') {
    const from = preamble.length - preamble.trimStart().length
    diagnostics.push({
      from,
      to: preamble.trimEnd().length,
      severity: 'warning',
      message: 'Text před prvním uzlem „--- ID ---“ se ignoruje.',
    })
  }

  const nodes: Record<string, GameNode> = {}
  const order: string[] = []
  const variables: VariableRef[] = []
  const assigned = new Set<string>()

  headers.forEach((header, i) => {
    const blockEnd = i + 1 < headers.length ? headers[i + 1]!.line.from : source.length
    const { node, parser } = parseNode(source, header, blockEnd)
    diagnostics.push(...parser.diagnostics)
    if (Object.hasOwn(nodes, node.id)) {
      diagnostics.push({
        ...header.idSpan,
        severity: 'error',
        message: `Uzel „${node.id}“ už existuje, tento se ignoruje.`,
      })
      return
    }
    nodes[node.id] = node
    order.push(node.id)
    variables.push(...parser.variables)
    for (const name of parser.assigned) assigned.add(name)
  })

  const graph: GameGraph = { order, nodes }
  diagnostics.push(...validate(graph, { variables, assigned, options }))
  diagnostics.sort((a, b) => a.from - b.from)
  return { graph, diagnostics }
}

interface ValidationInput {
  readonly variables: readonly VariableRef[]
  readonly assigned: ReadonlySet<string>
  readonly options: ParseOptions
}

const validate = (
  graph: GameGraph,
  { variables, assigned, options }: ValidationInput,
): Diagnostic[] => {
  const diagnostics: Diagnostic[] = []
  const themes = new Set(options.themes ?? DEFAULT_THEMES)
  const locations = options.locations === undefined ? undefined : new Set(options.locations)
  const nodes = graph.order.map((id) => graph.nodes[id]!)

  for (const node of nodes) {
    for (const choice of node.choices) {
      if (!Object.hasOwn(graph.nodes, choice.target)) {
        diagnostics.push({
          ...choice.span,
          severity: 'error',
          message: `Cílový uzel „${choice.target}“ neexistuje.`,
        })
      }
    }
    if (node.type === 'end' && node.choices.length > 0) {
      diagnostics.push({
        ...node.headerSpan,
        severity: 'warning',
        message: 'Koncový uzel má volby, ty se nezobrazí.',
      })
    }
    if (node.type !== 'end' && node.choices.length === 0 && !node.broken) {
      diagnostics.push({
        ...node.headerSpan,
        severity: 'warning',
        message: 'Uzel nemá žádnou volbu a není koncový (type: "end").',
      })
    }
    if (node.scan !== undefined) {
      if (node.choices.length === 0) {
        diagnostics.push({
          ...node.headerSpan,
          severity: 'error',
          message: 'Uzel se „scan“ potřebuje volbu, kam sken vede.',
        })
      } else if (node.choices.filter((c) => c.condition === undefined).length > 1) {
        diagnostics.push({
          ...node.headerSpan,
          severity: 'warning',
          message: 'Uzel se „scan“ má víc voleb bez podmínky; sken povede na první z nich.',
        })
      }
      if (locations !== undefined && !locations.has(node.scan)) {
        diagnostics.push({
          ...node.headerSpan,
          severity: 'warning',
          message: `Místo ${node.scan} není mezi místy hry.`,
        })
      }
    }
    if (node.theme !== undefined && !themes.has(node.theme)) {
      diagnostics.push({
        ...node.headerSpan,
        severity: 'warning',
        message: `Neznámé téma „${node.theme}“.`,
      })
    }
  }

  const starts = nodes.filter((node) => node.type === 'start')
  if (nodes.length > 0 && starts.length === 0) {
    diagnostics.push({
      from: 0,
      to: 0,
      severity: 'warning',
      message: 'Dokument nemá žádný startovní uzel (type: "start").',
    })
  }

  const reached = new Set(starts.map((node) => node.id))
  const queue = [...reached]
  while (queue.length > 0) {
    for (const choice of graph.nodes[queue.pop()!]?.choices ?? []) {
      if (!reached.has(choice.target)) {
        reached.add(choice.target)
        queue.push(choice.target)
      }
    }
  }
  if (starts.length > 0) {
    for (const node of nodes) {
      if (!reached.has(node.id)) {
        diagnostics.push({
          ...node.headerSpan,
          severity: 'warning',
          message: 'Uzel je nedosažitelný z žádného startu.',
        })
      }
    }
  }

  for (const v of variables) {
    if (!assigned.has(v.name)) {
      diagnostics.push({
        from: v.offset,
        to: v.offset + v.name.length,
        severity: 'warning',
        message: `Proměnná „${v.name}“ se nikde nenastavuje.`,
      })
    }
  }
  return diagnostics
}

/** 1-based line and column of an offset. */
export const lineColumn = (source: string, offset: number): { line: number; column: number } => {
  const before = source.slice(0, offset)
  const line = before.split('\n').length
  return { line, column: offset - before.lastIndexOf('\n') }
}
