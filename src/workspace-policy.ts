import type { Context } from '@deepseek-ai/cordis'
import { access, constants, mkdir, realpath } from 'node:fs/promises'
import { resolve } from 'node:path'

export const name = '@databuff/dsh-plugin-chatbi/workspace-policy'
export const inject = ['sessionController', 'workspaceRegistry', 'webServer']
export const DEFAULT_LINUX_WORKSPACE_ROOT = '/data/logs/dsh/workspace'

export interface Config {
  locked?: boolean
  root?: string
  agentPreset?: string
}

interface SessionControllerLike {
  create(request: Record<string, unknown>): unknown
}

interface WorkspaceLike {
  id: string
  title?: string
}

interface WorkspaceRegistryLike {
  create(path: string, title?: string): Promise<WorkspaceLike>
}

interface BrowserWorkspaceConfig {
  locked: boolean
  workspaceId?: string
  label?: string
}

export function resolveWorkspaceRoot(
  configuredRoot?: string,
  platform = process.platform,
  cwd = process.cwd(),
): string {
  const explicitRoot = configuredRoot?.trim() || process.env.DATABUFF_DSH_WORKSPACE_ROOT?.trim()
  if (explicitRoot) return explicitRoot
  return platform === 'linux' ? DEFAULT_LINUX_WORKSPACE_ROOT : resolve(cwd, 'workspace')
}

export async function apply(ctx: Context, input: Config = {}): Promise<void> {
  const locked = input.locked !== false
  const browserConfig: BrowserWorkspaceConfig = { locked }
  ctx.effect(() => ctx.webServer.tapIndex((html) => {
    const json = JSON.stringify(browserConfig).replaceAll('<', '\\u003c')
    const script = `<script>window.__DATABUFF_WORKSPACE_CONFIG__=${json};window.__DATABUFF_WORKSPACE_LOCKED__=${JSON.stringify(locked)}</script>`
    const index = html.indexOf('<head>')
    return index === -1 ? `${script}${html}` : `${html.slice(0, index + 6)}${script}${html.slice(index + 6)}`
  }), 'databuff-chatbi.workspace-browser-config')
  if (!locked) return

  const configuredRoot = resolveWorkspaceRoot(input.root)
  let workspaceRoot: string
  try {
    await mkdir(configuredRoot, { recursive: true })
    workspaceRoot = await realpath(configuredRoot)
    await access(workspaceRoot, constants.W_OK)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new Error(
      `DataBuff workspace directory "${configuredRoot}" cannot be created or is not writable. `
      + 'Set DATABUFF_DSH_WORKSPACE_ROOT to a writable path, or create the directory '
      + `and grant the DSH service user access. Detail: ${detail}`,
    )
  }
  const registry = ctx.get('workspaceRegistry') as unknown as WorkspaceRegistryLike
  const fixedWorkspace = await registry.create(workspaceRoot, 'DataBuff 默认工作区')
  browserConfig.workspaceId = fixedWorkspace.id
  browserConfig.label = fixedWorkspace.title?.trim() || 'DataBuff 默认工作区'
  const agentPreset = input.agentPreset?.trim() || 'databuff-chatbi'
  const controller = ctx.get('sessionController') as unknown as SessionControllerLike
  const original = controller.create

  controller.create = function createLockedSession(request) {
    const {
      workspaceId: _workspaceId,
      reuseWorkspaceBlank: _reuseWorkspaceBlank,
      cwd: _cwd,
      agentPreset: _agentPreset,
      ...remaining
    } = request
    return original.call(controller, {
      ...remaining,
      workspaceId: fixedWorkspace.id,
      agentPreset,
    })
  }

  ctx.effect(() => () => {
    controller.create = original
  }, 'databuff-chatbi.workspace-lock')
}
