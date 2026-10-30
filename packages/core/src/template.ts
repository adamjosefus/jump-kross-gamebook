import { evaluate, parseExpr, variablesOf } from './expr.ts';
import type { BodySegment, Diagnostic, State } from './types.ts';

/** Variable reference inside a body condition, with an absolute document offset. */
export interface VariableRef {
  readonly name: string;
  readonly offset: number;
}

export interface TemplateParseResult {
  readonly segments: readonly BodySegment[];
  readonly variables: readonly VariableRef[];
  readonly diagnostics: readonly Diagnostic[];
}

const TAG = /<if\s+condition\s*=\s*(?:'([^']*)'|"([^"]*)")\s*>|<else\s*\/?>|<\/if\s*>/g;

interface OpenIf {
  readonly from: number;
  readonly condition: ReturnType<typeof parseExpr>;
  readonly then: BodySegment[];
  readonly else: BodySegment[];
  inElse: boolean;
}

/**
 * Parses `<if condition='…'>…<else>…</if>` in a node body. `offset` is the absolute position of
 * `text` in the document. Errors are reported and recovered from: an unclosed `<if>` is closed at
 * the end of the body, a stray `<else>` or `</if>` is kept as text.
 */
export const parseTemplate = (text: string, offset: number): TemplateParseResult => {
  const diagnostics: Diagnostic[] = [];
  const variables: VariableRef[] = [];
  const root: BodySegment[] = [];
  const stack: OpenIf[] = [];

  const current = (): BodySegment[] => {
    const top = stack.at(-1);
    return top === undefined ? root : top.inElse ? top.else : top.then;
  };
  const pushText = (value: string) => {
    if (value === '') return;
    const target = current();
    const last = target.at(-1);
    if (last?.kind === 'text')
      target[target.length - 1] = { kind: 'text', text: last.text + value };
    else target.push({ kind: 'text', text: value });
  };
  const close = (open: OpenIf) => {
    if (!open.condition.ok) return; // error already reported; drop the branch content
    current().push({
      kind: 'if',
      condition: open.condition.expr,
      // oxlint-disable-next-line unicorn/no-thenable -- AST branch, never awaited (then is an array)
      then: open.then,
      else: open.else,
    });
  };

  let last = 0;
  for (const match of text.matchAll(TAG)) {
    const at = match.index;
    pushText(text.slice(last, at));
    last = at + match[0].length;
    const tag = match[0];
    if (tag.startsWith('<if')) {
      const source = match[1] ?? match[2] ?? '';
      const sourceAt = offset + at + tag.indexOf(source, tag.indexOf('='));
      const condition = parseExpr(source);
      if (!condition.ok) {
        diagnostics.push({
          from: sourceAt + condition.offset,
          to: sourceAt + Math.max(condition.offset + 1, source.length),
          severity: 'error',
          message: `Chybná podmínka: ${condition.message}`,
        });
      } else {
        for (const v of variablesOf(condition.expr))
          variables.push({ name: v.name, offset: sourceAt + v.offset });
      }
      // oxlint-disable-next-line unicorn/no-thenable -- AST branch, never awaited (then is an array)
      stack.push({ from: offset + at, condition, then: [], else: [], inElse: false });
    } else if (tag.startsWith('<else')) {
      const top = stack.at(-1);
      if (top === undefined || top.inElse) {
        diagnostics.push({
          from: offset + at,
          to: offset + last,
          severity: 'error',
          message:
            top === undefined ? '„<else>“ mimo „<if>“.' : 'Druhé „<else>“ ve stejném „<if>“.',
        });
        pushText(tag);
      } else top.inElse = true;
    } else {
      const top = stack.pop();
      if (top === undefined) {
        diagnostics.push({
          from: offset + at,
          to: offset + last,
          severity: 'error',
          message: '„</if>“ bez „<if>“.',
        });
        pushText(tag);
      } else close(top);
    }
  }
  pushText(text.slice(last));
  while (stack.length > 0) {
    const open = stack.pop()!;
    diagnostics.push({
      from: open.from,
      to: open.from + 3,
      severity: 'error',
      message: 'Neuzavřené „<if>“: chybí „</if>“.',
    });
    close(open);
  }
  return { segments: root, variables, diagnostics };
};

/** Resolves conditions against the state and returns plain Markdown. */
export const renderTemplate = (segments: readonly BodySegment[], state: State): string =>
  segments
    .map((segment) =>
      segment.kind === 'text'
        ? segment.text
        : renderTemplate(evaluate(segment.condition, state) ? segment.then : segment.else, state),
    )
    .join('');
