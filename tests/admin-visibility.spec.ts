import { describe, expect, it } from 'vitest'
import { isAdminAccessGranted } from '../src/admin-access'

describe('admin UI visibility', () => {
  it('enables admin UI for the server admin mode or the exact localStorage value', () => {
    expect(isAdminAccessGranted(true)).toBe(true)
    expect(isAdminAccessGranted(false, 'zmzAdmin')).toBe(true)
  })

  it('keeps admin UI hidden when neither condition matches', () => {
    expect(isAdminAccessGranted(false)).toBe(false)
    expect(isAdminAccessGranted(false, 'zmzadmin')).toBe(false)
    expect(isAdminAccessGranted(false, 'other')).toBe(false)
  })
})
