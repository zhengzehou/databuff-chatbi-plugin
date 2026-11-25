import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-tools'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import {
  createAllowedToolSet,
  DEFAULT_ALLOWED_TOOLS,
  isAllowedTool,
} from './policy'
import { registerReportTool } from './report'
import {
  CHATBI_ROLE_SOURCE_KIND,
  CHATBI_ROLE_SYNC_PATH,
  parseChatbiRoleSyncPayload,
  resolveChatbiRole,
  roleDirectiveSummary,
  roleDirectiveText,
} from './roles'

export const name = '@databuff/dsh-plugin-chatbi'
export const inject = ['agents', 'tools', 'webServer', 'sessionTitle']

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    /** One DataBuff ChatBI role directive injected as model-facing context. */
    'databuff-role': {
      readonly kind: 'databuff-role'
      readonly form: 'notice'
      /** One-line account rendered on the collapsed context row. */
      readonly summary: string
    }
  }
}

export interface Config {
  /** Register only the browser contribution when loaded at profile scope. */
  presentationOnly?: boolean
  /** MCP namespace configured by the DSH profile MCP settings. */
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
  /**
   * Hide the DSH administration surfaces (Settings, Plugins) in the browser.
   * Defaults to DATABUFF_DSH_UI_LOCKED, the same switch the profile patch uses,
   * so the loader entries and the client guard cannot drift apart.
   */
  uiLocked?: boolean
}

interface BrowserConfig {
  authRequired: boolean
  authStatusUrl: string
  loginUrl: string
  redirectUrl: string
  authCheckIntervalMs: number
  showTestModeBanner: boolean
}

/** Read one boolean environment switch; anything but "true" counts as off. */
function envFlag(name: string): boolean {
  return (process.env[name] || 'false').toLowerCase() === 'true'
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
    uiLocked: config.uiLocked ?? envFlag('DATABUFF_DSH_UI_LOCKED'),
  }
}

// MCP 首次发现可能发生在启动后数十秒；15 秒太短，会在工具上线前误报。
const MCP_TOOL_WAIT_TIMEOUT_MS = 60_000

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

/** Largest accepted role report; the payload is two short strings. */
const ROLE_SYNC_MAX_BODY_BYTES = 2048
/** Upper bound on remembered sessions so a long-lived host cannot grow without limit. */
const ROLE_SYNC_MAX_SESSIONS = 1024

/**
 * Selected role per agent identity.
 *
 * Module scope, not instance scope: the profile-scoped instance owns the HTTP
 * endpoint while each preset-scoped instance owns the pre-step listener, and
 * every instance shares this one module.
 */
const roleBySession = new Map<string, string>()
let roleSyncRouteRegistered = false

/** Remember one session's role, evicting the oldest entry past the bound. */
function rememberRole(sessionId: string, roleKey: string): void {
  roleBySession.delete(sessionId)
  roleBySession.set(sessionId, roleKey)
  while (roleBySession.size > ROLE_SYNC_MAX_SESSIONS) {
    const oldest = roleBySession.keys().next()
    if (oldest.done) break
    roleBySession.delete(oldest.value)
  }
}

type JsonBodyResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413 }

/** Read one bounded JSON body and distinguish malformed input from oversized input. */
async function readJsonBody(req: IncomingMessage): Promise<JsonBodyResult> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > ROLE_SYNC_MAX_BODY_BYTES) return { ok: false, status: 413 }
    chunks.push(buffer)
  }
  try {
    return { ok: true, value: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown }
  } catch {
    return { ok: false, status: 400 }
  }
}

/**
 * Bind the browser-facing role report endpoint.
 *
 * Registered once per process, from the profile-scoped instance so it outlives
 * every session. A deployment that omits the profile-scoped row keeps the
 * default role instead of failing.
 */
function registerRoleSyncRoute(ctx: Context): void {
  if (roleSyncRouteRegistered) return
  ctx.effect(() => {
    const dispose = ctx.webServer.register({
      kind: 'exact',
      path: CHATBI_ROLE_SYNC_PATH,
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { allow: 'POST', 'content-type': 'text/plain' })
          res.end('method not allowed')
          return
        }
        const body = await readJsonBody(req)
        if (!body.ok) {
          res.writeHead(body.status, {
            'cache-control': 'no-store',
            'content-type': 'text/plain; charset=utf-8',
          })
          res.end(body.status === 413 ? 'payload too large' : 'invalid JSON body')
          return
        }
        const payload = parseChatbiRoleSyncPayload(body.value)
        if (!payload) {
          res.writeHead(400, {
            'cache-control': 'no-store',
            'content-type': 'text/plain; charset=utf-8',
          })
          res.end('invalid role payload')
          return
        }
        rememberRole(payload.sessionId, payload.role.key)
        res.writeHead(204, { 'cache-control': 'no-store' })
        res.end()
      },
    })
    roleSyncRouteRegistered = true
    return () => {
      roleSyncRouteRegistered = false
      dispose()
    }
  }, 'databuff-chatbi.role-sync-route')
}

/**
 * Queue the selected role as model-facing context on each turn's first step.
 *
 * The directive is appended after the admitted user batch, matching how DSH's
 * own producers attach context to the message it qualifies, and it reaches the
 * client as a collapsible context row rather than as user-visible text.
 */
function registerRoleContextInjection(ctx: Context): () => void {
  return ctx.on('agent/pre-step', async ({ agent, step, signal }, next) => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted || step !== 1) return decision
    if (decision.messages.length === 0) return decision
    const role = resolveChatbiRole(roleBySession.get(String(agent.id)))
    return {
      ...decision,
      messages: [
        ...decision.messages,
        createUserMessage({
          content: [{ type: 'text', text: roleDirectiveText(role) }],
          source: {
            kind: CHATBI_ROLE_SOURCE_KIND,
            form: 'notice',
            summary: roleDirectiveSummary(role),
          },
        }),
      ],
    }
  })
}

export async function apply(ctx: Context, input: Config = {}): Promise<void> {
  const config = normalizeConfig(input)

  // Profile scope owns the browser-facing role endpoint; preset scope owns the
  // per-agent injection below. The module-level guard keeps it registered once.
  registerRoleSyncRoute(ctx)

  if (config.presentationOnly) return
  const allowed = createAllowedToolSet(config.allowedTools, config.serverName)

  // This is the only filesystem mutation exposed to ChatBI. It is scoped to
  // the agent and can write only sanitized HTML below databuff-reports.
  registerReportTool(ctx)

  // The selected hero role reaches the model as injected context instead of
  // user text, so the transcript bubble keeps the prompt the user typed.
  ctx.effect(() => registerRoleContextInjection(ctx), 'databuff-chatbi.role-context')

  // The DSH profile owns the MCP connection. Snapshot the inherited tools
  // visible in this preset and deny every non-DataBuff entry explicitly.
  // Preset child entries may start concurrently, so wait for MCP discovery
  // to finish before taking the security snapshot.
  const visibleTools = await waitForMcpTools(ctx, allowed)
  const configuredTools = visibleTools.filter(toolName => isAllowedTool(toolName, allowed))
  if (configuredTools.length === 0) {
    const sample = visibleTools.slice(0, 20).join(', ') || '(none)'
    const expected = `mcp__${config.serverName}__${DEFAULT_ALLOWED_TOOLS[0]}`
    throw new Error(
      `DataBuff MCP server "${config.serverName}" is not available in the DSH MCP settings, `
      + 'is not connected, or exposes no supported tools. Configure a streamable-http MCP server '
      + `named "${config.serverName}" in DSH before starting this preset. `
      + `Visible tools (${visibleTools.length}): ${sample}. `
      + `Expected tool names look like "${expected}".`,
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
    // The client guard consumes this flag instead of duplicating the switch,
    // so the loader entries and the DOM guard cannot drift apart.
    const lock = `window.__DATABUFF_UI_LOCKED__=${JSON.stringify(config.uiLocked)}`
    const script = `<script>${lock};window.__DATABUFF_CHATBI_CONFIG__=${json}</script>`
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
