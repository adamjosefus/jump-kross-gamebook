import { assertNever } from './assert.ts';
import type { GameGraph, GraphNode } from './graph.ts';

/** Mermaid node id; prefixed because ids like `end` are Mermaid keywords. */
export const mermaidId = (nodeId: string) => `n_${nodeId.replace(/[^A-Za-z0-9_]/g, '_')}`;

const escapeLabel = (text: string) =>
  text
    .replace(/"/g, '#quot;')
    .replace(/[<>]/g, (ch) => (ch === '<' ? '#lt;' : '#gt;'))
    .replace(/\s+/g, ' ')
    .trim();

const shape = (node: GraphNode) => {
  const label = `"${escapeLabel(node.id)}"`;
  switch (node.type) {
    case 'start':
      return `([${label}])`;
    case 'end':
      return `(((${label})))`;
    case 'passage':
      return `[${label}]`;
    default:
      return assertNever(node.type);
  }
};

const truncate = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** Mermaid `flowchart` of the story. References to missing nodes are drawn, not dropped. */
export const toMermaid = (graph: GameGraph): string => {
  const lines = ['flowchart TD'];
  const missing = new Set<string>();

  for (const id of graph.order) {
    const node = graph.nodes[id]!;
    lines.push(`  ${mermaidId(id)}${shape(node)}`);
  }

  for (const id of graph.order) {
    const node = graph.nodes[id]!;
    for (const choice of node.choices) {
      if (!Object.hasOwn(graph.nodes, choice.target)) missing.add(choice.target);
      const label = `${truncate(choice.label, 28)}${choice.conditional ? ' (if)' : ''}`;
      const arrow = choice.conditional ? '-.->' : '-->';
      lines.push(
        `  ${mermaidId(id)} ${arrow}|"${escapeLabel(label)}"| ${mermaidId(choice.target)}`,
      );
    }
  }

  for (const id of missing) lines.push(`  ${mermaidId(id)}{{"${escapeLabel(id)} ?"}}`);

  lines.push('  classDef missing stroke-dasharray:5 5,opacity:0.6');
  if (missing.size > 0) lines.push(`  class ${[...missing].map(mermaidId).join(',')} missing`);
  return lines.join('\n');
};
