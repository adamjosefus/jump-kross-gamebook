import type { GameGraph, GameNode } from './types.ts'

/** Mermaid node id; prefixed because ids like `end` are Mermaid keywords. */
export const mermaidId = (nodeId: string) => `n_${nodeId.replace(/[^A-Za-z0-9_]/g, '_')}`

const escapeLabel = (text: string) =>
  text.replace(/"/g, '#quot;').replace(/[<>]/g, (ch) => (ch === '<' ? '#lt;' : '#gt;')).replace(/\s+/g, ' ').trim()

const shape = (node: GameNode) => {
  const label = `"${escapeLabel(node.id)}"`
  switch (node.type) {
    case 'start':
      return `([${label}])`
    case 'end':
      return `(((${label})))`
    case 'passage':
      return node.scan === undefined ? `[${label}]` : `[/${label}/]`
  }
}

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/**
 * Mermaid `flowchart` of the story. Broken nodes and references to missing nodes are drawn,
 * not dropped, so the picture never disappears while the document is being edited.
 */
export const toMermaid = (graph: GameGraph): string => {
  const lines = ['flowchart TD']
  const missing = new Set<string>()

  for (const id of graph.order) {
    const node = graph.nodes[id]!
    lines.push(`  ${mermaidId(id)}${shape(node)}`)
  }

  for (const id of graph.order) {
    const node = graph.nodes[id]!
    for (const choice of node.choices) {
      if (!Object.hasOwn(graph.nodes, choice.target)) missing.add(choice.target)
      const parts = [
        node.scan === undefined ? truncate(choice.label, 28) : `📷 ${node.scan}`,
        choice.condition === undefined ? '' : '❓',
      ].filter((part) => part !== '')
      const arrow = node.scan === undefined ? '-->' : '-.->'
      lines.push(`  ${mermaidId(id)} ${arrow}|"${escapeLabel(parts.join(' '))}"| ${mermaidId(choice.target)}`)
    }
  }

  for (const id of missing) lines.push(`  ${mermaidId(id)}{{"${escapeLabel(id)} ?"}}`)

  lines.push('  classDef broken stroke:#dc2626,stroke-width:3px')
  lines.push('  classDef missing stroke-dasharray:5 5,opacity:0.6')
  lines.push('  classDef intro font-style:italic')
  const broken = graph.order.filter((id) => graph.nodes[id]!.broken)
  const intro = graph.order.filter((id) => graph.nodes[id]!.theme === 'intro' && !graph.nodes[id]!.broken)
  if (broken.length > 0) lines.push(`  class ${broken.map(mermaidId).join(',')} broken`)
  if (missing.size > 0) lines.push(`  class ${[...missing].map(mermaidId).join(',')} missing`)
  if (intro.length > 0) lines.push(`  class ${intro.map(mermaidId).join(',')} intro`)
  return lines.join('\n')
}
