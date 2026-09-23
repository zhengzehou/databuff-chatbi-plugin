import type { Context } from '@deepseek-ai/cordis'
import { safeLoginUrl } from '../policy'
import { mountDataBuffHero, withSelectedRolePrompt } from './hero'

export const name = '@databuff/dsh-plugin-chatbi'
export const inject = ['conversation', 'layout']

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
  }
}

function hideNewSessionWorkspacePicker(): () => void {
  const style = document.createElement('style')
  style.id = 'databuff-chatbi-workspace-lock-style'
  style.textContent = `
    [class*="heroWorkspaceRow"] > button[aria-haspopup="menu"]:first-child {
      display: none !important;
    }
  `
  document.head.appendChild(style)
  return () => { style.remove() }
}

function lockSettingsAndPetEntrances(): () => void {
  const style = document.createElement('style')
  style.id = 'databuff-chatbi-admin-surface-lock-style'
  style.textContent = `
    [class*="settingsArea"],
    .dshp-settings-trigger,
    .dshp-pet__icon-button,
    [data-dshp-pet],
    button[aria-label="设置"],
    button[aria-label="Settings"],
    button[aria-label*="宠物"],
    button[aria-label*="Pet"] {
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
    '.dshp-settings-trigger',
    '.dshp-pet__icon-button',
    '[data-dshp-pet]',
    'button[aria-label="设置"]',
    'button[aria-label="Settings"]',
    'button[aria-label*="宠物"]',
    'button[aria-label*="Pet"]',
  ].join(',')
  const disable = () => {
    for (const node of document.querySelectorAll<HTMLElement>(selector)) {
      node.setAttribute('aria-hidden', 'true')
      node.setAttribute('tabindex', '-1')
      node.style.display = 'none'
      if (node instanceof HTMLButtonElement) node.disabled = true
      const area = node.closest<HTMLElement>('[class*="settingsArea"]')
      if (area) {
        area.setAttribute('aria-hidden', 'true')
        area.style.display = 'none'
      }
    }
  }
  const block = (event: Event) => {
    if (event.target instanceof Element && event.target.closest(selector)) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  const observer = new MutationObserver(disable)
  observer.observe(document.body, { childList: true, subtree: true })
  document.addEventListener('click', block, true)
  document.addEventListener('keydown', block, true)
  disable()
  return () => {
    observer.disconnect()
    document.removeEventListener('click', block, true)
    document.removeEventListener('keydown', block, true)
    style.remove()
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

  if (window.__DATABUFF_WORKSPACE_LOCKED__ === true) {
    ctx.effect(() => installRolePromptTransport(ctx), 'databuff-chatbi.role-prompt-transport')
    ctx.effect(hideNewSessionWorkspacePicker, 'databuff-chatbi.workspace-picker-lock')
    ctx.effect(lockSettingsAndPetEntrances, 'databuff-chatbi.admin-surface-lock')
    ctx.effect(() => collapseSidebarByDefault(ctx), 'databuff-chatbi.sidebar-default-collapsed')
    ctx.effect(mountDataBuffHero, 'databuff-chatbi.custom-hero')
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
