import { describe, expect, it } from 'vitest'
import { applyChoice, applyScan, evaluate, parseDocument, parseExpr, renderNode, startPosition, toMermaid } from '../src/index.ts'
import { SAMPLE } from './fixtures.ts'

const { graph } = parseDocument(SAMPLE)

const expr = (source: string) => {
  const result = parseExpr(source)
  if (!result.ok) throw new Error(result.message)
  return result.expr
}

describe('expressions', () => {
  it.each([
    ['hatColor == "red" && gold >= 34', true],
    ['hatColor != "red" || gold < 34', false],
    ['!(gold > 100)', true],
    ['gold > 10 && gold <= 100 && !missing', true],
    ['missing == 3', false],
    ['gold > "x"', false],
    ['1 || 0 && 0', true],
  ])('%s → %s', (source, expected) => {
    expect(evaluate(expr(source), { hatColor: 'red', gold: 100 })).toBe(expected)
  })
})

describe('engine', () => {
  const start = startPosition(graph, 'A1')!

  it('renders a node with choices', () => {
    expect(renderNode(graph, start)).toMatchObject({
      id: 'A1',
      theme: 'intro',
      choices: [
        { index: 0, label: 'Možnost jedna' },
        { index: 1, label: 'Možnost dvě' },
      ],
      scan: undefined,
    })
  })

  it('branches and merges with state changes', () => {
    const viaB = applyChoice(graph, start, 0)
    const viaA2 = applyChoice(graph, start, 1)
    if (!viaB.ok || !viaA2.ok) throw new Error('move failed')
    expect(viaB.position).toEqual({ node: 'B1', state: { hatColor: 'blue', gold: 100 } })
    expect(viaA2.position).toEqual({ node: 'A2', state: { hatColor: 'green', gold: 80 } })

    // A2 is left by scanning location 32, which leads to the same B1.
    expect(renderNode(graph, viaA2.position)).toMatchObject({ choices: [], scan: 32 })
    expect(applyChoice(graph, viaA2.position, 0)).toEqual({ ok: false, error: 'scan-required' })
    expect(applyScan(graph, viaA2.position, 31)).toEqual({ ok: false, error: 'wrong-location' })
    const merged = applyScan(graph, viaA2.position, 32)
    expect(merged.ok && merged.position.node).toBe('B1')
  })

  it('resolves conditional text and hides unavailable choices', () => {
    const red = renderNode(graph, { node: 'B1', state: { hatColor: 'red', gold: 100 } })!
    expect(red.markdown).toBe('Pohodlně si nosil svojí červenou čepici.')
    expect(red.choices.map((c) => c.label)).toEqual(['Bojovat', 'Koupit meč'])

    const poor = renderNode(graph, { node: 'B1', state: { hatColor: 'green', gold: 80 } })!
    expect(poor.markdown).toBe('Pohodlně si nosil svojí chudou pokrývku hlavy.')
    expect(poor.choices.map((c) => c.label)).toEqual(['Bojovat'])
    expect(applyChoice(graph, { node: 'B1', state: { gold: 80 } }, 1)).toEqual({ ok: false, error: 'unavailable-choice' })
  })

  it('stops at end nodes', () => {
    expect(renderNode(graph, { node: 'C1', state: {} })).toMatchObject({ type: 'end', choices: [] })
    expect(applyChoice(graph, { node: 'C1', state: {} }, 0)).toEqual({ ok: false, error: 'finished' })
  })
})

describe('toMermaid', () => {
  it('draws every node, scan edges dashed and missing targets as placeholders', () => {
    const { graph: broken } = parseDocument(SAMPLE.replace('- Bojovat [C1]', '- Bojovat [X9]'))
    const text = toMermaid(broken)
    expect(text).toContain('n_A1(["A1"])')
    expect(text).toContain('n_A2 -.->|"QR 32"| n_B1')
    expect(text).toContain('n_X9{{"X9 ?"}}')
    expect(text).toContain('class n_X9 missing')
  })
})
