import type { ConfigObject, ConfigValue, Diagnostic } from './types.ts'

/**
 * Relaxed object literal: unquoted keys, string / number / boolean values, nested objects,
 * properties separated by commas or newlines.
 *
 *   { theme: "intro"
 *     initialState: { gold: 100, hatColor: 'red' } }
 */

export interface ObjectParseResult {
  readonly value: ConfigObject | undefined
  /** Offset just after the closing brace (or the end of the scanned range when unclosed). */
  readonly end: number
  readonly closed: boolean
  readonly diagnostics: readonly Diagnostic[]
}

/** Finds the brace matching the one at `start`, skipping string contents. Returns -1 when unclosed. */
export const findClosingBrace = (source: string, start: number, limit = source.length): number => {
  let depth = 0
  let quote: string | undefined
  for (let i = start; i < limit; i++) {
    const ch = source[i]
    if (quote !== undefined) {
      if (ch === '\\') i++
      else if (ch === quote) quote = undefined
      continue
    }
    if (ch === '"' || ch === "'") quote = ch
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return i
  }
  return -1
}

class ObjectSyntaxError extends Error {
  readonly at: number

  constructor(message: string, at: number) {
    super(message)
    this.at = at
  }
}

const isIdentStart = (ch: string) => /[\p{L}_$]/u.test(ch)
const isIdentPart = (ch: string) => /[\p{L}\p{N}_$]/u.test(ch)

/** Parses the object literal starting with `{` at `start`; never reads past `limit`. */
export const parseObject = (source: string, start: number, limit = source.length): ObjectParseResult => {
  const close = findClosingBrace(source, start, limit)
  const end = close === -1 ? limit : close + 1
  if (close === -1) {
    return {
      value: undefined,
      end,
      closed: false,
      diagnostics: [
        { from: start, to: start + 1, severity: 'error', message: 'Neuzavřený objekt: chybí „}“.' },
      ],
    }
  }

  let pos = start

  const skipSpaces = (newlines: boolean) => {
    while (pos < end) {
      const ch = source[pos]!
      if (ch === ' ' || ch === '\t' || ch === '\r' || (newlines && ch === '\n')) pos++
      else break
    }
  }

  /** Skips separators; returns true when at least one comma or newline was consumed. */
  const skipSeparators = () => {
    let found = false
    for (;;) {
      skipSpaces(false)
      const ch = source[pos]
      if (ch === ',' || ch === '\n') {
        found = true
        pos++
      } else return found
    }
  }

  const readString = (): string => {
    const quote = source[pos]!
    pos++
    let out = ''
    while (pos < end) {
      const ch = source[pos]!
      if (ch === '\\') {
        const next = source[pos + 1]
        out += next === 'n' ? '\n' : (next ?? '')
        pos += 2
        continue
      }
      if (ch === quote) {
        pos++
        return out
      }
      if (ch === '\n') break
      out += ch
      pos++
    }
    throw new ObjectSyntaxError('Neuzavřený řetězec.', pos)
  }

  const readIdent = (): string => {
    const from = pos
    while (pos < end && isIdentPart(source[pos]!)) pos++
    return source.slice(from, pos)
  }

  const readValue = (): ConfigValue => {
    skipSpaces(true)
    const ch = source[pos]
    if (ch === undefined || pos >= end) throw new ObjectSyntaxError('Chybí hodnota.', pos)
    if (ch === '{') return readObject()
    if (ch === '"' || ch === "'") return readString()
    const number = /^-?\d+(\.\d+)?/.exec(source.slice(pos, end))
    if (number) {
      pos += number[0].length
      return Number(number[0])
    }
    if (isIdentStart(ch)) {
      const from = pos
      const word = readIdent()
      if (word === 'true') return true
      if (word === 'false') return false
      throw new ObjectSyntaxError(
        `Neznámá hodnota „${word}“. Text dej do uvozovek.`,
        from,
      )
    }
    throw new ObjectSyntaxError(`Neočekávaný znak „${ch}“.`, pos)
  }

  const readObject = (): ConfigObject => {
    pos++ // {
    const result: Record<string, ConfigValue> = {}
    skipSpaces(true)
    skipSeparators()
    skipSpaces(true)
    while (source[pos] !== '}') {
      if (pos >= end) throw new ObjectSyntaxError('Chybí „}“.', pos)
      const keyAt = pos
      const ch = source[pos]!
      let key: string
      if (ch === '"' || ch === "'") key = readString()
      else if (isIdentStart(ch)) key = readIdent()
      else throw new ObjectSyntaxError(`Očekávám název vlastnosti, ne „${ch}“.`, pos)
      skipSpaces(false)
      if (source[pos] !== ':') throw new ObjectSyntaxError(`Za „${key}“ chybí dvojtečka.`, pos)
      pos++
      if (Object.hasOwn(result, key)) throw new ObjectSyntaxError(`Duplicitní vlastnost „${key}“.`, keyAt)
      result[key] = readValue()
      const separated = skipSeparators()
      skipSpaces(true)
      if (source[pos] !== '}' && !separated) {
        throw new ObjectSyntaxError('Vlastnosti odděl čárkou nebo novým řádkem.', pos)
      }
    }
    pos++ // }
    return result
  }

  try {
    return { value: readObject(), end, closed: true, diagnostics: [] }
  } catch (error) {
    if (!(error instanceof ObjectSyntaxError)) throw error
    const at = Math.min(error.at, end - 1)
    return {
      value: undefined,
      end,
      closed: true,
      diagnostics: [{ from: at, to: at + 1, severity: 'error', message: error.message }],
    }
  }
}

export const isConfigObject = (value: ConfigValue | undefined): value is ConfigObject =>
  typeof value === 'object' && value !== null
