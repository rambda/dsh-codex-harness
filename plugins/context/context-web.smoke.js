import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import { apply, latestReportedBudget } from './context-web.js'
import { initializeContextState, writeActiveNote } from './context-state.js'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-context-web-'))
process.env.DSH_CODEX_CONTEXT_DIR = root
const ctx = new Context()
new SessionProjections(ctx)
try {
  const session = { id: 'web-context-test', header: { agentPreset: 'codex' }, seq: 0,
    snapshotEvents: () => [], requestContext: () => ({ provider: 'test', model: 'test', contextWindow: 8192 }),
    requestHeader: () => undefined }
  initializeContextState(session, 'startup')
  writeActiveNote(session, 'private handoff')
  let route
  let coldDisposed = false
  apply({ sessionProjections: ctx.sessionProjections, connection: { fetch: { register: definition => { route = definition } } },
    sessions: { get: id => id === session.id ? session : undefined },
    sessionQuery: { observeSession: async id => {
      if (id !== 'cold-context-test') throw new Error('not found')
      return { header: { agentPreset: 'codex' }, events: [], [Symbol.dispose]() { coldDisposed = true } }
    } },
    tokenMeter: { measure: () => ({ totalTokens: 1200 }) }, llm: {}, logger: { warn: () => {} } })
  // 使用真实投影服务，覆盖所有 preset 的冷读、缓存恢复及实时事件路径。
  // 仅 mock register() 会漏掉 schema 缺少 .parse() 导致全部历史加载失败的问题。
  const registry = ctx.sessionProjections
  for (const agentPreset of ['standard', 'codex']) {
    assert.equal(registry.restore({}, [], 0, { agentPreset }, 0).snapshot.values.codexContextVersion, 0)
  }
  const projectionEvents = [
    { seq: 0, type: 'turn/start' },
    { seq: 1, type: 'tool/result' },
    { seq: 2, type: 'turn/end' },
  ]
  const live = { header: { agentPreset: 'standard' }, inheritedEventCount: 0, seq: 3,
    snapshotEvents: (from = 0, until = projectionEvents.length) => projectionEvents.slice(from, until),
    eventAt: seq => projectionEvents[seq] }
  assert.equal(registry.snapshot(live).values.codexContextVersion, 3)
  const checkpoint = registry.checkpoint(live)
  assert.equal(registry.viewCheckpoint(checkpoint).codexContextVersion, 3)
  assert.equal(registry.restore(checkpoint, [], 3, live.header, 0).snapshot.values.codexContextVersion, 3)
  assert.equal(registry.restore({}, projectionEvents, 0, live.header, 0).snapshot.values.codexContextVersion, 3)
  assert.deepEqual(registry.viewCheckpoint({ codexContextVersion: { ver: 1, seq: 2, val: 'invalid' } }), {})
  let changed
  registry.onChanged((_session, key, value) => { changed = { key, value } })
  const nextEvent = { seq: 3, type: 'compaction/end' }
  projectionEvents.push(nextEvent)
  live.seq = 4
  registry.drive(live, nextEvent)
  assert.deepEqual(changed, { key: 'codexContextVersion', value: 4 })
  assert.equal(registry.snapshot(live).values.codexContextVersion, 4)
  assert.equal(route.path, '/api/codex-context.state')
  assert.deepEqual(route.methods, ['GET', 'HEAD'])
  const head = await route.fetch(new Request(`http://localhost${route.path}?sessionId=${session.id}`, { method: 'HEAD' }))
  assert.equal(head.status, 204)
  assert.equal(head.body, null)
  const response = await route.fetch(new Request(`http://localhost${route.path}?sessionId=${session.id}`))
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.equal(body.note.content, 'private handoff')
  assert.equal(body.budget.estimatedRemaining, 8192 - 1200)
  const result = (seq, callId, remaining, isError = false) => ({ seq, time: 1233 + seq, type: 'tool/result',
    data: { message: { source: { callId }, content: [{ type: 'tool-result', isError,
      content: [{ type: 'text', text: JSON.stringify({ estimatedRemaining: remaining, capacity: 8192 }) }] }] } } })
  const events = [
    { seq: 0, type: 'tool/call', data: { name: 'get_context_remaining', callId: 'our-call' } },
    result(1, 'our-call', 500),
    { seq: 2, type: 'tool/call', data: { name: 'get_context_remaining', callId: 'failed' } },
    result(3, 'failed', 9, true),
  ]
  assert.deepEqual(latestReportedBudget({ snapshotEvents: (from = 0) => events.slice(from) }, 0),
    { modelRemaining: 500, toolCapacity: 8192, modelUpdatedAt: 1234 })
  assert.deepEqual(latestReportedBudget({ snapshotEvents: (from = 0) => events.slice(from) }, 2), {})
  initializeContextState({ ...session, id: 'cold-context-test' }, 'startup')
  const cold = await route.fetch(new Request(`http://localhost${route.path}?sessionId=cold-context-test`))
  assert.equal((await cold.json()).enabled, true)
  assert.equal(coldDisposed, true)
  const invalid = await route.fetch(new Request(`http://localhost${route.path}?sessionId=../secret`))
  assert.equal(invalid.status, 400)
  assert.equal((await route.fetch(new Request(`http://localhost${route.path}?sessionId=someone-else`))).status, 500)
  console.log('context authenticated route smoke: ALL PASS')
} finally {
  await ctx.fiber.dispose()
  fs.rmSync(root, { recursive: true, force: true })
  delete process.env.DSH_CODEX_CONTEXT_DIR
}
