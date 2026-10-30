import { encodeQr } from '@gamebook/core'
import { afterAll, describe, expect, it } from 'vitest'
import { SAMPLE } from '../../core/test/fixtures.ts'
import { makeHandler, MemoryStoreLayer, type ServerConfigShape } from '../src/server/index.ts'

const config: ServerConfigShape = {
  adminPassword: 'heslo',
  qrSecret: 'qr-secret',
  sessionSecret: 'session-secret',
  insecureCookies: true,
}
const { handler, dispose } = makeHandler(config, MemoryStoreLayer(SAMPLE))
afterAll(() => dispose())

/** Minimal client with its own cookie jar, like one phone. */
const device = () => {
  const jar = new Map<string, string>()
  return async (method: string, path: string, body?: unknown) => {
    const response = await handler(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; '),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    )
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';')
      const [name, value] = pair!.split('=')
      jar.set(name!, value!)
    }
    const text = await response.text()
    return { status: response.status, body: text === '' ? undefined : JSON.parse(text) }
  }
}

describe('api', () => {
  const admin = device()

  it('protects admin endpoints', async () => {
    expect((await admin('GET', '/api/admin/overview')).status).toBe(401)
    expect((await admin('POST', '/api/admin/login', { password: 'špatně' })).status).toBe(401)
    expect((await admin('POST', '/api/admin/login', { password: 'heslo' })).status).toBe(204)
    expect((await admin('GET', '/api/admin/overview')).status).toBe(200)
  })

  it('plays a game end to end', async () => {
    expect((await admin('POST', '/api/admin/publish')).body).toEqual({ versionId: 1 })
    await admin('PUT', '/api/admin/locations/32', { name: 'Studna', kind: 'progress' })
    const team = (await admin('POST', '/api/admin/teams', { name: 'Vlci', startNode: 'A1' })).body
    expect(team).toMatchObject({ id: 1, name: 'Vlci', step: 0 })

    const codes = (await admin('GET', '/api/admin/codes')).body as { kind: string; code: string }[]
    const login = codes.find((c) => c.kind === 'T')!.code
    const studna = codes.find((c) => c.kind === 'L')!.code
    expect(studna).toBe(await encodeQr(config.qrSecret, { kind: 'L', id: 32 }))

    const phone = device()
    const tablet = device()
    expect((await phone('GET', '/api/player/state')).status).toBe(401)
    expect((await phone('POST', '/api/player/login', { code: studna })).status).toBe(400)
    expect((await phone('POST', '/api/player/login', { code: 'T:1:AAAA' })).status).toBe(400)

    const start = await phone('POST', '/api/player/login', { code: login })
    expect(start.status).toBe(200)
    expect(start.body).toMatchObject({ team: { name: 'Vlci' }, status: 'playing', node: { id: 'A1', theme: 'intro' } })
    await tablet('POST', '/api/player/login', { code: login })

    // Both devices see step 1; the tablet decides first, the phone gets a conflict.
    const step = start.body.step
    const moved = await tablet('POST', '/api/player/choose', { index: 1, expectedStep: step })
    expect(moved.body).toMatchObject({ node: { id: 'A2', scan: 32, choices: [] } })
    const late = await phone('POST', '/api/player/choose', { index: 0, expectedStep: step })
    expect(late).toMatchObject({ status: 409, body: { _tag: 'StepConflict' } })

    const view = (await phone('GET', '/api/player/state')).body
    expect(view.node.id).toBe('A2')
    expect((await phone('POST', '/api/player/choose', { index: 0, expectedStep: view.step })).body.reason).toBe(
      'scan-required',
    )
    expect((await phone('POST', '/api/player/scan', { code: login, expectedStep: view.step })).status).toBe(400)

    const scanned = await phone('POST', '/api/player/scan', { code: studna, expectedStep: view.step })
    expect(scanned.body).toMatchObject({ status: 'playing', node: { id: 'B1' } })
    expect(scanned.body.node.markdown).toContain('chudou pokrývku hlavy')
    expect(scanned.body.node.choices).toEqual([{ index: 0, label: 'Bojovat' }])

    const end = await phone('POST', '/api/player/choose', { index: 0, expectedStep: scanned.body.step })
    expect(end.body).toMatchObject({ status: 'finished', node: { id: 'C1', type: 'end' } })

    const overview = (await admin('GET', '/api/admin/overview')).body
    expect(overview.teams[0]).toMatchObject({ node: 'C1', finished: true, devices: 2, state: { gold: 80 } })
    expect(overview.log.map((e: { action: string }) => e.action)).toEqual(['choice:0', 'scan:32', 'choice:1', 'start'])
  })

  it('refuses to publish a document with errors', async () => {
    await admin('PUT', '/api/admin/draft', { source: '--- A --- { type: "start" }\n- Dál [X]\n' })
    expect((await admin('POST', '/api/admin/publish')).body).toMatchObject({ _tag: 'DocumentHasErrors', count: 1 })
  })

  it('resets a team to its start', async () => {
    const reset = (await admin('POST', '/api/admin/teams/1/reset')).body
    expect(reset).toMatchObject({ node: 'A1', finished: false, state: { gold: 100 } })
  })
})
