import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-tools'
import {
  createAllowedToolSet,
  DEFAULT_ALLOWED_TOOLS,
  isAllowedTool,
} from './policy'
import { registerReportTool } from './report'

export const name = '@databuff/dsh-plugin-chatbi'
export const inject = ['tools', 'webServer', 'sessionTitle']

export interface Config {
  /** Register only the browser contribution when loaded at profile scope. */
  presentationOnly?: boolean
  /** MCP namespace configured on @deepseek-ai/dsh-mcp-client. */
  serverName?: string
  /** Raw DataBuff MCP tool names permitted for this agent. */
  allowedTools?: string[]
  /** Require the browser to have a valid DataBuff login. */
  authRequired?: boolean
  /** Same-origin or CORS-enabled endpoint returning 2xx for a valid login. */
  authStatusUrl?: string
  /** DataBuff login page. */
  loginUrl?: string
  /** URL restored after login. Defaults to the current DSH page. */
  redirectUrl?: string
  /** Milliseconds before the browser rechecks login state. */
  authCheckIntervalMs?: number
  /** Visible warning when authentication is intentionally disabled. */
  showTestModeBanner?: boolean
}

interface BrowserConfig {
  authRequired: boolean
  authStatusUrl: string
  loginUrl: string
  redirectUrl: string
  authCheckIntervalMs: number
  showTestModeBanner: boolean
}

export function normalizeConfig(config: Config = {}): Required<Config> {
  return {
    presentationOnly: config.presentationOnly ?? false,
    serverName: config.serverName?.trim() || 'chatbi-databuff',
    allowedTools: config.allowedTools?.length
      ? [...new Set(config.allowedTools.map(value => value.trim()).filter(Boolean))]
      : [...DEFAULT_ALLOWED_TOOLS],
    authRequired: config.authRequired ?? true,
    authStatusUrl: config.authStatusUrl?.trim() || '/webapi/api/v1/dsh/auth/status',
    loginUrl: config.loginUrl?.trim() || '/databuff/login',
    redirectUrl: config.redirectUrl?.trim() || '',
    authCheckIntervalMs: Math.max(10_000, config.authCheckIntervalMs ?? 60_000),
    showTestModeBanner: config.showTestModeBanner ?? true,
  }
}

const MCP_TOOL_WAIT_TIMEOUT_MS = 15_000

async function waitForMcpTools(
  ctx: Context,
  allowed: ReadonlySet<string>,
): Promise<string[]> {
  const deadline = Date.now() + MCP_TOOL_WAIT_TIMEOUT_MS
  let visibleTools: string[] = []
  while (Date.now() < deadline) {
    visibleTools = ctx.tools.schemas().map(schema => schema.name)
    if (visibleTools.some(toolName => allowed.has(toolName))) return visibleTools
    await new Promise<void>(resolve => setTimeout(resolve, 50))
  }
  return visibleTools
}

export async function apply(ctx: Context, input: Config = {}): Promise<void> {
  const config = normalizeConfig(input)
  if (config.presentationOnly) return
  const allowed = createAllowedToolSet(config.allowedTools, config.serverName)

  // This is the only filesystem mutation exposed to ChatBI. It is scoped to
  // the agent and can write only sanitized HTML below databuff-reports.
  registerReportTool(ctx)

  // The MCP row is mounted before this policy row. Snapshot the tools visible
  // in this preset and deny every non-DataBuff entry explicitly. This avoids
  // DSH's empty allow-mask also hiding sibling scoped MCP registrations.
  // Preset child entries start concurrently. Wait for the scoped MCP client
  // to finish discovery before taking the security snapshot.
  const visibleTools = await waitForMcpTools(ctx, allowed)
  const configuredTools = visibleTools.filter(toolName => isAllowedTool(toolName, allowed))
  if (configuredTools.length === 0) {
    throw new Error(
      `DataBuff MCP server "${config.serverName}" is not configured, not connected, or exposes no supported tools. `
      + 'Set DATABUFF_MCP_URL or DATABUFF_MCP_HOST (plus optional port/path) to the reachable '
      + 'streamable-http endpoint and, when required, set DATABUFF_MCP_TOKEN before starting DSH.',
    )
  }
  const deniedTools = visibleTools
    .filter(toolName => !isAllowedTool(toolName, allowed))
  ctx.tools.restrict({ deny: deniedTools })

  // Final, monotonic execution guard. Even if another preset row accidentally
  // adds a local tool later, it cannot execute unless explicitly allow-listed.
  ctx.tools.guard(exec => isAllowedTool(exec.name, allowed)
    ? undefined
    : `DataBuff ChatBI denied non-APM tool "${exec.name}".`)

  const browserConfig: BrowserConfig = {
    authRequired: config.authRequired,
    authStatusUrl: config.authStatusUrl,
    loginUrl: config.loginUrl,
    redirectUrl: config.redirectUrl,
    authCheckIntervalMs: config.authCheckIntervalMs,
    showTestModeBanner: config.showTestModeBanner,
  }

  ctx.effect(() => ctx.webServer.tapIndex((html) => {
    const json = JSON.stringify(browserConfig).replaceAll('<', '\\u003c')
    const script = `<script>window.__DATABUFF_CHATBI_CONFIG__=${json}</script>`
    const index = html.indexOf('<head>')
    return index === -1
      ? `${script}${html}`
      : `${html.slice(0, index + 6)}${script}${html.slice(index + 6)}`
  }), 'databuff-chatbi.browser-config')
}

export {
  createAllowedToolSet,
  DEFAULT_ALLOWED_TOOLS,
  isAllowedTool,
  publicToolName,
  safeLoginUrl,
} from './policy'
