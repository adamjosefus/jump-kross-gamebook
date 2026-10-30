import type { Expr } from './expr.ts'

export type Value = string | number | boolean
export type State = Readonly<Record<string, Value>>

export type ConfigValue = Value | ConfigObject
export interface ConfigObject {
  readonly [key: string]: ConfigValue
}

/** Half-open range of character offsets into the source document. */
export interface Span {
  readonly from: number
  readonly to: number
}

export type Severity = 'error' | 'warning'

export interface Diagnostic extends Span {
  readonly severity: Severity
  readonly message: string
}

export type NodeType = 'start' | 'passage' | 'end'

export interface StateChange {
  readonly variable: string
  readonly op: 'set' | 'delta'
  readonly value: Value
}

export interface Choice {
  readonly label: string
  readonly target: string
  readonly condition: Expr | undefined
  readonly changes: readonly StateChange[]
  readonly span: Span
}

export type BodySegment =
  | { readonly kind: 'text'; readonly text: string }
  | {
      readonly kind: 'if'
      readonly condition: Expr
      readonly then: readonly BodySegment[]
      readonly else: readonly BodySegment[]
    }

export interface GameNode {
  readonly id: string
  readonly type: NodeType
  readonly theme: string | undefined
  readonly initialState: State
  /** Location id whose QR code must be scanned to leave this node. */
  readonly scan: number | undefined
  readonly body: readonly BodySegment[]
  readonly choices: readonly Choice[]
  /** Whole node block, header included. */
  readonly span: Span
  readonly headerSpan: Span
  /** True when the node had at least one error; it is still part of the graph. */
  readonly broken: boolean
}

export interface GameGraph {
  /** Node ids in document order. */
  readonly order: readonly string[]
  readonly nodes: Readonly<Record<string, GameNode>>
}

export interface ParseResult {
  readonly graph: GameGraph
  readonly diagnostics: readonly Diagnostic[]
}
