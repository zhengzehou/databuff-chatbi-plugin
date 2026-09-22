import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-tools'
import {
  createAllowedToolSet,
  DEFAULT_ALLOWED_TOOLS,
  isAllowedTool,
} from './policy'

export const name = '@databuff/dsh-plugin-chatbi'
export const inject = ['tools', 'webServer']

export interface Config {
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
    serverName: config.serverName?.trim() || 'databuff',
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

export function apply(ctx: Context, input: Config = {}): void {
  const config = normalizeConfig(input)
  const allowed = createAllowedToolSet(config.allowedTools, config.serverName)

  // Hide every globally inherited DSH tool (shell, files, web, git, etc.).
  // The preset mounts its MCP row before this policy row, and DSH keeps scoped
  // registrations visible when applying a restriction to inherited tools.
  ctx.tools.restrict({ allow: [] })

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
