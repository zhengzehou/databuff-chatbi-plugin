import type { Context } from '@deepseek-ai/cordis'
import { safeLoginUrl } from '../policy'

export const name = '@databuff/dsh-plugin-chatbi'

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
