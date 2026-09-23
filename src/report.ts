import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { basename, join, resolve } from 'node:path'

export const REPORT_TOOL_NAME = 'saveChatbiHtmlReport'
export const MAX_REPORT_BYTES = 2 * 1024 * 1024

const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

function timestamp(): string {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z').replace('T', '-')
}

export function normalizeReportFileName(input?: string): string {
  const raw = input?.trim() || `databuff-report-${timestamp()}.html`
  if (basename(raw) !== raw || raw.includes('/') || raw.includes('\\')) {
    throw new Error('Report fileName must be a plain file name without directories')
  }
  const withExtension = raw.toLowerCase().endsWith('.html') ? raw : `${raw}.html`
  const stem = withExtension.slice(0, -5)
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
  if (!stem) {
    throw new Error('Report fileName must contain a visible name before .html')
  }
  return `${stem.slice(0, 115)}.html`
}

export function sanitizeReportHtml(input: string): string {
  let html = input
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<(?:iframe|object|embed|applet|form)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed|applet|form)\s*>/gi, '')
    .replace(/<(?:iframe|object|embed|applet|form)\b[^>]*\/?>/gi, '')
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s+(?:href|src|action|formaction)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*(["'])?refresh\1?[^>]*>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')

  const csp = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`
  if (/<head\b[^>]*>/i.test(html)) {
    html = html.replace(/<head\b[^>]*>/i, match => `${match}\n${csp}`)
  } else if (/<html\b[^>]*>/i.test(html)) {
    html = html.replace(/<html\b[^>]*>/i, match => `${match}\n<head>${csp}</head>`)
  } else {
    html = `<!doctype html><html><head><meta charset="utf-8">${csp}</head><body>${html}</body></html>`
  }
  return html
}

interface SaveReportArgs {
  html: string
  fileName?: string
  reportTitle?: string
  overwrite?: boolean
}

function parseArgs(value: unknown): SaveReportArgs {
  if (!value || typeof value !== 'object') throw new Error('Report arguments must be an object')
  const args = value as Record<string, unknown>
  if (typeof args.html !== 'string' || !args.html.trim()) throw new Error('html is required')
  if (args.fileName !== undefined && typeof args.fileName !== 'string') throw new Error('fileName must be a string')
  if (args.reportTitle !== undefined && typeof args.reportTitle !== 'string') throw new Error('reportTitle must be a string')
  if (args.overwrite !== undefined && typeof args.overwrite !== 'boolean') throw new Error('overwrite must be a boolean')
  return { html: args.html, fileName: args.fileName, reportTitle: args.reportTitle, overwrite: args.overwrite }
}

function reportDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

function titleFromHtml(html: string): string | undefined {
  const raw = html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1]
    ?? html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1\s*>/i)?.[1]
  const value = raw?.replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ').trim()
  return value || undefined
}

export function buildReportSessionTitle(
  fileName: string,
  html: string,
  reportTitle?: string,
  now = new Date(),
): string {
  const fileStem = fileName.replace(/\.html$/i, '').replace(/[-_]+/g, ' ')
  const label = reportTitle?.trim() || titleFromHtml(html) || fileStem || 'DataBuff 分析报告'
  const withoutDate = label.replace(/^\d{4}-\d{2}-\d{2}\s*/, '').trim()
  return `${reportDate(now)} ${withoutDate}`.slice(0, 80)
}

export function registerReportTool(ctx: Context): void {
  const reports = new Map<string, string>()
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/databuff-chatbi/reports',
    handler(req, res) {
      if (req.method !== 'GET') {
        res.writeHead(405, { Allow: 'GET' })
        res.end()
        return
      }
      const requestUrl = new URL(req.url ?? '/', 'http://localhost')
      const pathname = requestUrl.pathname
      const token = pathname.slice('/databuff-chatbi/reports/'.length)
      const reportPath = /^[A-Za-z0-9_-]{32}$/.test(token) ? reports.get(token) : undefined
      if (!reportPath) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Report not found or the DSH service has restarted.')
        return
      }
      const disposition = requestUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline'
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': CSP,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'Cache-Control': 'private, no-store',
        'Content-Disposition': `${disposition}; filename="${basename(reportPath).replace(/["\\]/g, '_')}"`,
      })
      const stream = createReadStream(reportPath)
      stream.on('error', () => {
        if (!res.headersSent) res.writeHead(404)
        res.end()
      })
      stream.pipe(res)
    },
  }), 'databuff-chatbi.report-preview')

  ctx.tools.register(defineTool({
    name: REPORT_TOOL_NAME,
    description: 'Save a sanitized standalone DataBuff/APM HTML report under the current workspace databuff-reports directory for repeated viewing.',
    parameters: {
      html: { type: 'string', required: true, description: 'Complete standalone HTML report content.' },
      fileName: { type: 'string', description: 'Optional plain .html file name. Directories are not allowed.' },
      reportTitle: { type: 'string', description: 'Concise report name or content summary used to rename the current session after saving.' },
      overwrite: { type: 'boolean', description: 'Overwrite an existing report. Defaults to false.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          fileName: { type: 'string', required: true },
          path: { type: 'string', required: true },
          previewUrl: { type: 'string', required: true },
          downloadUrl: { type: 'string', required: true },
          shareUrl: { type: 'string', required: true },
          sessionTitle: { type: 'string', required: true },
          sessionRenamed: { type: 'boolean', required: true },
          bytes: { type: 'integer', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: [
          `HTML report saved on the DSH server: ${value.path}`,
          `[直接打开报告](${value.previewUrl})`,
          `[下载 HTML 文件](${value.downloadUrl})`,
          `[分享报告](${value.shareUrl})（仅分享给有权访问当前 DSH/DataBuff 环境的用户）`,
          value.sessionRenamed ? `会话已重命名为：${value.sessionTitle}` : `建议会话名称：${value.sessionTitle}`,
        ].join('\n\n'),
      }],
    },
    async execute(rawArgs, exec) {
      const args = parseArgs(rawArgs)
      const cwd = exec.agent?.session.header.cwd
      if (!cwd) throw new Error('saveChatbiHtmlReport requires a session workspace')
      if (Buffer.byteLength(args.html, 'utf8') > MAX_REPORT_BYTES) {
        throw new Error(`HTML report exceeds the ${MAX_REPORT_BYTES} byte limit`)
      }
      if (exec.signal.aborted) throw exec.signal.reason

      const fileName = normalizeReportFileName(args.fileName)
      const reportDir = resolve(cwd, 'databuff-reports')
      const reportPath = join(reportDir, fileName)
      const html = sanitizeReportHtml(args.html)
      const bytes = Buffer.byteLength(html, 'utf8')
      if (bytes > MAX_REPORT_BYTES) throw new Error(`Sanitized HTML report exceeds the ${MAX_REPORT_BYTES} byte limit`)

      await mkdir(reportDir, { recursive: true })
      await writeFile(reportPath, html, {
        encoding: 'utf8',
        flag: args.overwrite === true ? 'w' : 'wx',
        signal: exec.signal,
      })
      const token = randomBytes(24).toString('base64url')
      reports.set(token, reportPath)
      const previewUrl = `/databuff-chatbi/reports/${token}`
      const downloadUrl = `${previewUrl}?download=1`
      const shareUrl = previewUrl
      const sessionTitle = buildReportSessionTitle(fileName, html, args.reportTitle)
      let sessionRenamed = false
      try {
        const titleService = ctx.get?.('sessionTitle') as {
          rename?: (session: unknown, title: string) => unknown
        } | undefined
        if (titleService?.rename && exec.agent?.session) {
          titleService.rename(exec.agent.session, sessionTitle)
          sessionRenamed = true
        }
      } catch {
        // Report creation must remain successful if a title projection is
        // temporarily unavailable; the suggested title is still returned.
      }
      return {
        fileName, path: reportPath, previewUrl, downloadUrl, shareUrl,
        sessionTitle, sessionRenamed, bytes,
      }
    },
  }))
}
