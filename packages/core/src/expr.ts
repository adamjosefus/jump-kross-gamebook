import type { State, Value } from './types.ts'

/**
 * Condition language: `hatColor == "red" && gold >= 34`, `!(a || b)`.
 * Operators `== != < <= > >= && || !`, parentheses, string / number / boolean literals, variables.
 */

export type BinaryOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||'

export type Expr =
  | { readonly kind: 'literal'; readonly value: Value }
  | { readonly kind: 'variable'; readonly name: string; readonly offset: number }
  | { readonly kind: 'not'; readonly operand: Expr }
  | { readonly kind: 'binary'; readonly op: BinaryOp; readonly left: Expr; readonly right: Expr }

export type ExprParseResult =
  | { readonly ok: true; readonly expr: Expr }
  | { readonly ok: false; readonly message: string; readonly offset: number }

type Token =
  | { readonly type: 'value'; readonly value: Value; readonly offset: number }
  | { readonly type: 'ident'; readonly name: string; readonly offset: number }
  | { readonly type: 'op'; readonly op: BinaryOp | '!' | '(' | ')'; readonly offset: number }
  | { readonly type: 'eof'; readonly offset: number }

class ExprError extends Error {
  readonly offset: number

  constructor(message: string, offset: number) {
    super(message)
    this.offset = offset
  }
}

const OPERATORS = ['==', '!=', '<=', '>=', '&&', '||', '<', '>', '!', '(', ')'] as const

const tokenize = (source: string): Token[] => {
  const tokens: Token[] = []
  let pos = 0
  while (pos < source.length) {
    const ch = source[pos]!
    if (/\s/.test(ch)) {
      pos++
      continue
    }
    if (ch === '"' || ch === "'") {
      const close = source.indexOf(ch, pos + 1)
      if (close === -1) throw new ExprError('Neuzavřený řetězec.', pos)
      tokens.push({ type: 'value', value: source.slice(pos + 1, close), offset: pos })
      pos = close + 1
      continue
    }
    const number = /^\d+(\.\d+)?/.exec(source.slice(pos))
    if (number) {
      tokens.push({ type: 'value', value: Number(number[0]), offset: pos })
      pos += number[0].length
      continue
    }
    const ident = /^[\p{L}_$][\p{L}\p{N}_$]*/u.exec(source.slice(pos))
    if (ident) {
      const name = ident[0]
      if (name === 'true' || name === 'false') {
        tokens.push({ type: 'value', value: name === 'true', offset: pos })
      } else {
        tokens.push({ type: 'ident', name, offset: pos })
      }
      pos += name.length
      continue
    }
    const op = OPERATORS.find((candidate) => source.startsWith(candidate, pos))
    if (op === undefined) {
      if (ch === '=') throw new ExprError('Pro porovnání použij „==“.', pos)
      throw new ExprError(`Neočekávaný znak „${ch}“.`, pos)
    }
    tokens.push({ type: 'op', op, offset: pos })
    pos += op.length
  }
  tokens.push({ type: 'eof', offset: source.length })
  return tokens
}

const PRECEDENCE: Record<BinaryOp, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
}

const isBinaryOp = (op: string): op is BinaryOp => Object.hasOwn(PRECEDENCE, op)

/** Parses an expression. Offsets in the result are relative to `source`. */
export const parseExpr = (source: string): ExprParseResult => {
  let tokens: Token[]
  try {
    tokens = tokenize(source)
  } catch (error) {
    if (error instanceof ExprError) return { ok: false, message: error.message, offset: error.offset }
    throw error
  }
  let index = 0
  const peek = () => tokens[index]!
  const next = () => tokens[index++]!

  const parsePrimary = (): Expr => {
    const token = next()
    switch (token.type) {
      case 'value':
        return { kind: 'literal', value: token.value }
      case 'ident':
        return { kind: 'variable', name: token.name, offset: token.offset }
      case 'op':
        if (token.op === '!') return { kind: 'not', operand: parsePrimary() }
        if (token.op === '(') {
          const inner = parseBinary(0)
          const close = next()
          if (close.type !== 'op' || close.op !== ')') throw new ExprError('Chybí „)“.', close.offset)
          return inner
        }
        throw new ExprError(`Neočekávaný operátor „${token.op}“.`, token.offset)
      case 'eof':
        throw new ExprError('Výraz je neúplný.', token.offset)
    }
  }

  const parseBinary = (minPrecedence: number): Expr => {
    let left = parsePrimary()
    for (;;) {
      const token = peek()
      if (token.type !== 'op' || !isBinaryOp(token.op)) return left
      const precedence = PRECEDENCE[token.op]
      if (precedence <= minPrecedence) return left
      next()
      left = { kind: 'binary', op: token.op, left, right: parseBinary(precedence) }
    }
  }

  try {
    if (peek().type === 'eof') return { ok: false, message: 'Prázdná podmínka.', offset: 0 }
    const expr = parseBinary(0)
    const rest = peek()
    if (rest.type !== 'eof') return { ok: false, message: 'Nadbytečný text ve výrazu.', offset: rest.offset }
    return { ok: true, expr }
  } catch (error) {
    if (error instanceof ExprError) return { ok: false, message: error.message, offset: error.offset }
    throw error
  }
}

type RuntimeValue = Value | undefined

const truthy = (value: RuntimeValue): boolean =>
  typeof value === 'number' ? value !== 0 : typeof value === 'string' ? value !== '' : value === true

const compare = (op: '<' | '<=' | '>' | '>=', a: RuntimeValue, b: RuntimeValue): boolean => {
  if (!((typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string'))) {
    return false
  }
  switch (op) {
    case '<':
      return a < b
    case '<=':
      return a <= b
    case '>':
      return a > b
    case '>=':
      return a >= b
  }
}

const evaluateRaw = (expr: Expr, state: State): RuntimeValue => {
  switch (expr.kind) {
    case 'literal':
      return expr.value
    case 'variable':
      return state[expr.name]
    case 'not':
      return !truthy(evaluateRaw(expr.operand, state))
    case 'binary': {
      if (expr.op === '&&') return truthy(evaluateRaw(expr.left, state)) && truthy(evaluateRaw(expr.right, state))
      if (expr.op === '||') return truthy(evaluateRaw(expr.left, state)) || truthy(evaluateRaw(expr.right, state))
      const left = evaluateRaw(expr.left, state)
      const right = evaluateRaw(expr.right, state)
      if (expr.op === '==') return left === right
      if (expr.op === '!=') return left !== right
      return compare(expr.op, left, right)
    }
  }
}

/** Evaluates a condition against a state. Missing variables are `undefined`, never throw. */
export const evaluate = (expr: Expr, state: State): boolean => truthy(evaluateRaw(expr, state))

/** Variables referenced by an expression, with offsets relative to the expression source. */
export const variablesOf = (expr: Expr): { name: string; offset: number }[] => {
  switch (expr.kind) {
    case 'literal':
      return []
    case 'variable':
      return [{ name: expr.name, offset: expr.offset }]
    case 'not':
      return variablesOf(expr.operand)
    case 'binary':
      return [...variablesOf(expr.left), ...variablesOf(expr.right)]
  }
}
