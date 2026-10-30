import { describe, expect, it } from 'vitest'
import { parseDocument } from '../src/index.ts'
import { SAMPLE } from './fixtures.ts'

const errors = (source: string) => parseDocument(source).diagnostics.filter((d) => d.severity === 'error')

describe('parseDocument', () => {
  it('parses the sample without diagnostics', () => {
    const { graph, diagnostics } = parseDocument(SAMPLE)
    expect(diagnostics).toEqual([])
    expect(graph.order).toEqual(['A1', 'A2', 'B1', 'C1', 'C2'])

    const a1 = graph.nodes['A1']!
    expect(a1).toMatchObject({ type: 'start', theme: 'intro', initialState: { hatColor: 'red', gold: 100 } })
    expect(a1.choices.map((c) => [c.label, c.target])).toEqual([
      ['Možnost jedna', 'B1'],
      ['Možnost dvě', 'A2'],
    ])
    expect(a1.choices[1]!.changes).toEqual([
      { variable: 'hatColor', op: 'set', value: 'green' },
      { variable: 'gold', op: 'delta', value: -20 },
    ])
    expect(graph.nodes['A2']).toMatchObject({ type: 'passage', scan: 32 })
    expect(graph.nodes['B1']!.choices[1]!.condition).toBeDefined()
    expect(graph.nodes['C1']!.type).toBe('end')
  })

  it('keeps Markdown lists in the body that are not choices', () => {
    const { graph } = parseDocument('--- A ---\n\n- jablko\n- hruška\n\nText.\n\n- Dál [A]\n')
    expect(graph.nodes['A']!.choices).toHaveLength(1)
    expect(graph.nodes['A']!.body).toEqual([{ kind: 'text', text: '\n- jablko\n- hruška\n\nText.\n\n' }])
  })

  it('isolates a broken config to its node', () => {
    const source = SAMPLE.replace('--- A2 --- { scan: 32 }', '--- A2 --- { scan 32 }')
    const { graph, diagnostics } = parseDocument(source)
    expect(graph.order).toEqual(['A1', 'A2', 'B1', 'C1', 'C2'])
    expect(graph.nodes['A2']!.broken).toBe(true)
    expect(graph.nodes['B1']!.broken).toBe(false)
    expect(diagnostics.filter((d) => d.severity === 'error')).toHaveLength(1)
  })

  it('isolates an unclosed config brace', () => {
    const { graph } = parseDocument('--- A --- { type: "start"\n\nText\n\n- Dál [B]\n--- B --- { type: "end" }\nKonec\n')
    expect(graph.nodes['A']!.broken).toBe(true)
    expect(graph.nodes['B']).toMatchObject({ type: 'end', broken: false })
  })

  it('isolates an unclosed <if>', () => {
    const source = SAMPLE.replace('pokrývku hlavy</if>', 'pokrývku hlavy')
    const { graph } = parseDocument(source)
    expect(graph.nodes['B1']!.broken).toBe(true)
    expect(graph.nodes['A1']!.broken).toBe(false)
    expect(graph.nodes['B1']!.choices).toHaveLength(2)
  })

  it('reports a bad condition with its position', () => {
    const source = '--- A --- { type: "start" }\n- Dál [A] { if: \'gold = 3\' }\n'
    const [error] = errors(source)
    expect(error!.message).toContain('==')
    expect(source.slice(error!.from, error!.from + 1)).toBe('=')
  })

  it('reports missing targets, duplicates and invalid ids', () => {
    const messages = errors('--- A --- { type: "start" }\n- Dál [X]\n--- A ---\n--- ž ---\n').map((d) => d.message)
    expect(messages).toEqual([
      expect.stringContaining('„X“ neexistuje'),
      expect.stringContaining('už existuje'),
      expect.stringContaining('Neplatné id'),
    ])
  })

  it('warns about dead ends, unreachable nodes, unknown variables and themes', () => {
    const source = '--- A --- { type: "start", theme: "into" }\n- Dál [B] { if: \'klic\' }\n--- B ---\n--- C --- { type: "end" }\n'
    const warnings = parseDocument(source).diagnostics.map((d) => d.message)
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Neznámé téma „into“'),
        expect.stringContaining('„klic“ se nikde nenastavuje'),
        expect.stringContaining('nemá žádnou volbu'),
        expect.stringContaining('nedosažitelný'),
      ]),
    )
  })

  it('rejects `if` as a variable name', () => {
    expect(errors('--- A --- { type: "start", initialState: { if: 1 } }\n')[0]!.message).toContain('rezervované')
  })

  it('warns about scan to an unknown location when locations are given', () => {
    const { diagnostics } = parseDocument(SAMPLE, { locations: [1, 2] })
    expect(diagnostics.map((d) => d.message)).toEqual([expect.stringContaining('Místo 32')])
  })

  it('never throws on arbitrary input', () => {
    for (const source of ['', '---', '--- A ---{', '--- A --- {"', '--- A ---\n<if condition=\'(\'>', '- [', '<else></if>']) {
      expect(() => parseDocument(source)).not.toThrow()
    }
  })
})
