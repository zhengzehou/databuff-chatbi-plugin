import type { Context } from '@deepseek-ai/cordis'
import { safeLoginUrl } from '../policy'
import { mountDataBuffHero, withSelectedRolePrompt } from './hero'

export const name = '@databuff/dsh-plugin-chatbi'
export const inject = ['conversation', 'layout', 'sessions', 'workspaces', 'uiWorkspace']

type SendSession = (
  session: unknown,
  text: string,
  attachmentIds: readonly unknown[],
  mode: unknown,
  signal?: AbortSignal,
) => Promise<unknown>

interface ConversationTransport {
  sendSession: SendSession
}

interface LayoutController {
  toggleSidebar: () => void
}

interface LockedWorkspaceConfig {
  locked: boolean
  workspaceId?: string
  label?: string
}

interface WorkspaceSnapshotLike {
  phase?: string
  items?: readonly { workspaceId: string }[]
}

interface WorkspaceStateLike {
  list: {
    getSnapshot: () => WorkspaceSnapshotLike
    subscribe: (listener: () => void) => () => void
  }
}

interface UiWorkspaceLike {
  startSession: (workspaceId?: string) => void
}

interface SessionSummaryLike {
  agentPreset?: string
  projectionValues?: Record<string, unknown>
  retainedBy?: { mainView?: number }
}

interface SessionListSnapshotLike {
  current?: string
  byId?: Record<string, SessionSummaryLike>
}

interface SessionListLike {
  getSnapshot: () => SessionListSnapshotLike
  subscribe: (listener: () => void) => () => void
}

interface SessionsStateLike {
  list?: SessionListLike
}

interface ContextWithSessions {
  sessions?: SessionsStateLike
  get?: (key: string) => unknown
}

function getSessions(ctx: Context): SessionsStateLike | undefined {
  const context = ctx as Context & ContextWithSessions
  try {
    const sessions = context.get('sessions') as SessionsStateLike | undefined
    return sessions?.list ? sessions : undefined
  } catch {
    return undefined
  }
}

function isChatBiMode(sessions: SessionsStateLike | undefined): boolean {
  const snapshot = sessions?.list?.getSnapshot()
  const byId = snapshot?.byId
  if (!byId) return false
  const isChatBi = (session: SessionSummaryLike): boolean => (
    (session.agentPreset ?? session.projectionValues?.agentPreset) === 'databuff-chatbi'
  )
  const current = snapshot.current === undefined ? undefined : byId[snapshot.current]
  if (current !== undefined) return isChatBi(current)
  return Object.values(byId).some((session) => (
    (session.retainedBy?.mainView ?? 0) > 0
    && isChatBi(session)
  ))
}
/** Inject the selected ChatBI role after the composer has captured the draft. */
function installRolePromptTransport(ctx: Context): () => void {
  const conversation = ctx.get?.('conversation') as ConversationTransport | undefined
  if (!conversation || typeof conversation.sendSession !== 'function') return () => {}

  const original = conversation.sendSession
  const wrapped: SendSession = function (this: ConversationTransport, session, text, attachmentIds, mode, signal) {
    return original.call(this, session, withSelectedRolePrompt(text), attachmentIds, mode, signal)
  }
  conversation.sendSession = wrapped
  return () => {
    if (conversation.sendSession === wrapped) conversation.sendSession = original
  }
}

interface BrowserConfig {
  authRequired: boolean
  authStatusUrl: string
  loginUrl: string
  redirectUrl: string
  authCheckIntervalMs: number
  showTestModeBanner: boolean
}

declare global {
  interface Window {
    __DATABUFF_CHATBI_CONFIG__?: BrowserConfig
    __DATABUFF_WORKSPACE_LOCKED__?: boolean
    __DATABUFF_WORKSPACE_CONFIG__?: LockedWorkspaceConfig
  }
}

function hideNewSessionWorkspacePicker(): () => void {
  const style = document.createElement('style')
  style.id = 'databuff-chatbi-workspace-lock-style'
  style.textContent = `
    [class*="heroWorkspaceRow"] > button[aria-haspopup="menu"] {
      display: none !important;
    }
  `
  document.head.appendChild(style)

  const config = window.__DATABUFF_WORKSPACE_CONFIG__
  const lockedLabel = config?.label?.trim()
    ? `默认工作区：${config.label.trim()}`
    : '默认工作区'
  const placeholders = new Set(['选择一个工作区开始', 'Choose a workspace to start'])
  const sync = () => {
    for (const node of document.querySelectorAll<HTMLElement>('[data-composer-placeholder]')) {
      if (!placeholders.has(node.textContent?.trim() ?? '')) continue
      node.textContent = lockedLabel
      node.dataset.databuffWorkspacePlaceholder = 'true'
    }
    for (const node of document.querySelectorAll<HTMLElement>('[data-placeholder]')) {
      if (!placeholders.has(node.dataset.placeholder?.trim() ?? '')) continue
      node.dataset.placeholder = lockedLabel
      node.setAttribute('aria-label', lockedLabel)
    }
  }
  const observer = new MutationObserver(sync)
  observer.observe(document.body, { childList: true, subtree: true, attributes: true })
  sync()
  return () => {
    observer.disconnect()
    style.remove()
  }
}

/** Start the server-selected Workspace once the remote Workspace snapshot is ready. */
function startLockedWorkspace(ctx: Context): () => void {
  const config = window.__DATABUFF_WORKSPACE_CONFIG__
  if (!config?.locked || !config.workspaceId) return () => {}

  const workspaces = (ctx as Context & { get?: (key: string) => unknown }).get?.('workspaces') as WorkspaceStateLike | undefined
  const uiWorkspace = (ctx as Context & { get?: (key: string) => unknown }).get?.('uiWorkspace') as UiWorkspaceLike | undefined
  if (!workspaces?.list || typeof uiWorkspace?.startSession !== 'function') return () => {}

  let started = false
  const start = () => {
    if (started) return
    const snapshot = workspaces.list.getSnapshot()
    if (snapshot.phase !== 'ready' || !snapshot.items?.some(item => item.workspaceId === config.workspaceId)) return
    started = true
    uiWorkspace.startSession(config.workspaceId)
  }
  const unsubscribe = workspaces.list.subscribe(start)
  start()
  return () => {
    unsubscribe()
  }
}

/** Hide administrative surfaces while the active session runs ChatBI. */
function lockSettingsAndPetEntrances(ctx: Context): () => void {
  const style = document.createElement('style')
  style.id = 'databuff-chatbi-admin-surface-lock-style'
  style.textContent = `
    html[data-databuff-chatbi-ui-lock="true"] [class*="settingsArea"],
    html[data-databuff-chatbi-ui-lock="true"] .dshp-settings-trigger,
    html[data-databuff-chatbi-ui-lock="true"] .dshp-pet__icon-button,
    html[data-databuff-chatbi-ui-lock="true"] [data-dshp-pet],
    html[data-databuff-chatbi-ui-lock="true"] [class*="panelRow"][aria-label="插件"],
    html[data-databuff-chatbi-ui-lock="true"] [class*="panelRow"][aria-label="Plugins"],
    html[data-databuff-chatbi-ui-lock="true"] button[aria-label="设置"],
    html[data-databuff-chatbi-ui-lock="true"] button[aria-label="Settings"],
    html[data-databuff-chatbi-ui-lock="true"] button[aria-label*="宠物"],
    html[data-databuff-chatbi-ui-lock="true"] button[aria-label*="Pet"] {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
      min-width: 0 !important;
      min-height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      pointer-events: none !important;
    }
  `
  document.head.appendChild(style)

  const selector = [
    '[class*="settingsArea"]',
    '.dshp-settings-trigger',
    '.dshp-pet__icon-button',
    '[data-dshp-pet]',
    '[class*="panelRow"][aria-label="插件"]',
    '[class*="panelRow"][aria-label="Plugins"]',
    'button[aria-label="设置"]',
    'button[aria-label="Settings"]',
    'button[aria-label*="宠物"]',
    'button[aria-label*="Pet"]',
  ].join(',')
  const sessions = getSessions(ctx)
  let locked = false
  const sync = () => {
    const next = isChatBiMode(sessions)
    if (next === locked) return
    locked = next
    if (locked) document.documentElement.setAttribute('data-databuff-chatbi-ui-lock', 'true')
    else document.documentElement.removeAttribute('data-databuff-chatbi-ui-lock')
  }
  const unsubscribe = sessions?.list?.subscribe(sync) ?? (() => {})
  sync()
  const block = (event: Event) => {
    if (!locked) return
    if (event.target instanceof Element && event.target.closest(selector)) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  document.addEventListener('click', block, true)
  document.addEventListener('keydown', block, true)
  return () => {
    unsubscribe()
    document.removeEventListener('click', block, true)
    document.removeEventListener('keydown', block, true)
    document.documentElement.removeAttribute('data-databuff-chatbi-ui-lock')
    style.remove()
  }
}

/** Keep the role transport aligned with the active preset. */
function watchChatBiModeEffects(ctx: Context): () => void {
  const sessions = getSessions(ctx)
  let active = false
  let disposeModeEffects: () => void = () => {}
  const sync = () => {
    const next = isChatBiMode(sessions)
    if (next === active) return
    active = next
    disposeModeEffects()
    if (!next) {
      disposeModeEffects = () => {}
      return
    }
    const disposeRolePrompt = installRolePromptTransport(ctx)
    const disposeHero = mountDataBuffHero()
    disposeModeEffects = () => {
      disposeRolePrompt()
      disposeHero()
    }
  }
  const unsubscribe = sessions?.list?.subscribe(sync) ?? (() => {})
  sync()
  return () => {
    unsubscribe()
    disposeModeEffects()
  }
}
/** Start the locked DataBuff workspace with the navigation rail collapsed. */
function collapseSidebarByDefault(ctx: Context): () => void {
  const layout = (ctx as Context & { layout?: LayoutController }).layout
  if (!layout || typeof layout.toggleSidebar !== 'function') return () => {}

  let applied = false
  const collapse = () => {
    if (applied) return
    const overlay = document.querySelector<HTMLElement>('[data-shell-overlay]')
    const frame = overlay?.parentElement
    if (!frame) return
    if (!frame.hasAttribute('data-sidebar-collapsed')) layout.toggleSidebar()
    applied = true
  }

  const observer = new MutationObserver(collapse)
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-sidebar-collapsed'],
  })
  collapse()
  return () => {
    observer.disconnect()
  }
}

function renderBanner(text: string, background: string): HTMLDivElement {
  const banner = document.createElement('div')
  banner.id = 'databuff-chatbi-auth-banner'
  banner.textContent = text
  banner.style.cssText = [
    'position:fixed',
    'left:0',
    'right:0',
    'top:0',
    'z-index:2147483647',
    `background:${background}`,
    'color:#fff',
    'font:600 13px/32px system-ui,sans-serif',
    'text-align:center',
    'box-shadow:0 1px 4px rgba(0,0,0,.2)',
  ].join(';')
  document.body.appendChild(banner)
  return banner
}

export function redirectToLogin(config: BrowserConfig): void {
  const redirectUrl = config.redirectUrl || window.location.href
  window.location.assign(safeLoginUrl(config.loginUrl, redirectUrl))
}

export async function checkAuthentication(config: BrowserConfig): Promise<boolean> {
  if (!config.authRequired) return true
  try {
    const response = await fetch(config.authStatusUrl, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    return response.ok
  } catch {
    return false
  }
}

export function apply(ctx: Context): void {
  const config = window.__DATABUFF_CHATBI_CONFIG__

  ctx.effect(() => lockSettingsAndPetEntrances(ctx), 'databuff-chatbi.admin-surface-lock')
  ctx.effect(() => watchChatBiModeEffects(ctx), 'databuff-chatbi.mode-effects')

  if (window.__DATABUFF_WORKSPACE_LOCKED__ === true) {
    ctx.effect(() => startLockedWorkspace(ctx), 'databuff-chatbi.default-workspace-session')
    ctx.effect(hideNewSessionWorkspacePicker, 'databuff-chatbi.workspace-picker-lock')
    ctx.effect(() => collapseSidebarByDefault(ctx), 'databuff-chatbi.sidebar-default-collapsed')
  }
  if (!config) return

  ctx.effect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let banner: HTMLDivElement | undefined

    if (!config.authRequired && config.showTestModeBanner) {
      banner = renderBanner('DataBuff ChatBI 测试模式：登录鉴权已关闭', '#b45309')
    }

    const verify = async () => {
      const authenticated = await checkAuthentication(config)
      if (stopped) return
      if (!authenticated) {
        if (!banner) banner = renderBanner('DataBuff 登录已失效，正在跳转登录页…', '#b91c1c')
        redirectToLogin(config)
        return
      }
      timer = setTimeout(verify, config.authCheckIntervalMs)
    }

    void verify()
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      banner?.remove()
    }
  })
}
