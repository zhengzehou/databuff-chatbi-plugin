import { afterEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_LINUX_WORKSPACE_ROOT,
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
