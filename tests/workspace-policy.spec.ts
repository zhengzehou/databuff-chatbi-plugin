import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_LINUX_WORKSPACE_ROOT,
  resolveAdminMode,
  resolveWorkspaceLock,
  resolveWorkspaceRoot,
} from '../src/workspace-policy'

const originalWorkspaceRoot = process.env.DATABUFF_DSH_WORKSPACE_ROOT

afterEach(() => {
  if (originalWorkspaceRoot === undefined) delete process.env.DATABUFF_DSH_WORKSPACE_ROOT
  else process.env.DATABUFF_DSH_WORKSPACE_ROOT = originalWorkspaceRoot
})

describe('workspace root resolution', () => {
  it('prefers an explicit root over the environment', () => {
    process.env.DATABUFF_DSH_WORKSPACE_ROOT = '/env/workspace'
    expect(resolveWorkspaceRoot(' /explicit/workspace ')).toBe('/explicit/workspace')
  })

  it('uses the environment override when configured', () => {
    process.env.DATABUFF_DSH_WORKSPACE_ROOT = '/env/workspace'
    expect(resolveWorkspaceRoot(undefined, 'linux', '/profile')).toBe('/env/workspace')
  })

  it('uses the stable Linux service path by default', () => {
    delete process.env.DATABUFF_DSH_WORKSPACE_ROOT
    expect(resolveWorkspaceRoot(undefined, 'linux', '/profile')).toBe(DEFAULT_LINUX_WORKSPACE_ROOT)
  })

  it('keeps profile-relative defaults on non-Linux platforms', () => {
    delete process.env.DATABUFF_DSH_WORKSPACE_ROOT
    expect(resolveWorkspaceRoot(undefined, 'win32', 'C:/dsh-profile')).toBe('C:\\dsh-profile\\workspace')
  })
})

describe('workspace locking', () => {
  it('lets the explicit hide switch override admin mode', () => {
    expect(resolveWorkspaceLock('true', 'false', 'true')).toBe(true)
    expect(resolveWorkspaceLock('false', 'true', 'false')).toBe(false)
  })

  it('preserves the legacy lock and admin switches when unset', () => {
    expect(resolveWorkspaceLock(undefined, 'true', 'false')).toBe(true)
    expect(resolveWorkspaceLock(undefined, 'true', 'true')).toBe(false)
  })

  it('recognizes the server-wide admin mode for browser UI visibility', () => {
    expect(resolveAdminMode('true')).toBe(true)
    expect(resolveAdminMode('false')).toBe(false)
    expect(resolveAdminMode(undefined)).toBe(false)
  })
})
