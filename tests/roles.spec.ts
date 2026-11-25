import { describe, expect, it } from 'vitest'
import { parseChatbiRoleSyncPayload } from '../src/roles'

describe('role sync payload validation', () => {
  it('accepts a known role and trims the session id', () => {
    expect(parseChatbiRoleSyncPayload({ sessionId: ' session-1 ', role: 'inspection' }))
      .toMatchObject({ sessionId: 'session-1', role: { key: 'inspection' } })
  })

  it('rejects empty session ids and unknown roles', () => {
    expect(parseChatbiRoleSyncPayload({ sessionId: ' ', role: 'query' })).toBeUndefined()
    expect(parseChatbiRoleSyncPayload({ sessionId: 'session-1', role: 'admin' })).toBeUndefined()
  })

  it('rejects non-object payloads', () => {
    expect(parseChatbiRoleSyncPayload(null)).toBeUndefined()
    expect(parseChatbiRoleSyncPayload([])).toBeUndefined()
  })
})
