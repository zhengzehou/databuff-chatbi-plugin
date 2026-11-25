import { describe, expect, it } from 'vitest'
import {
  buildReportSessionTitle,
  buildReportUrl,
  normalizeReportFileName,
  normalizeReportPublicBaseUrl,
  reportContentDisposition,
  resolveReportDirectory,
  sanitizeReportHtml,
} from '../src/report'
import { join, resolve } from 'node:path'

describe('report naming', () => {
  const now = new Date('2026-09-22T02:00:00.000Z')

  it('uses the explicit report title with the Shanghai date', () => {
    expect(buildReportSessionTitle('metrics.html', '<h1>ignored</h1>', '服务健康巡检报告', now))
      .toBe('2026-09-22 服务健康巡检报告')
  })

  it('falls back to the HTML title and avoids a duplicate date', () => {
    expect(buildReportSessionTitle(
      'metrics.html', '<title>2026-09-22 JVM 指标趋势</title>', undefined, now,
    )).toBe('2026-09-22 JVM 指标趋势')
  })

  it('keeps report file names plain and strips active content', () => {
    expect(normalizeReportFileName('服务 巡检')).toBe('服务-巡检.html')
    expect(sanitizeReportHtml('<h1>x</h1><script>alert(1)</script>')).not.toContain('<script>')
  })

  it('resolves report directories from the workspace unless an absolute path is configured', () => {
    const workspace = resolve('session-workspace')
    expect(resolveReportDirectory(workspace)).toBe(join(workspace, 'databuff-reports'))
    expect(resolveReportDirectory(workspace, 'exports/reports')).toBe(join(workspace, 'exports', 'reports'))

    const absolute = resolve('shared-reports')
    expect(resolveReportDirectory(workspace, absolute)).toBe(absolute)
  })

  it('builds browser URLs with an optional public base path', () => {
    const base = normalizeReportPublicBaseUrl('https://opt.beta.uletm.com/dsh/')
    expect(buildReportUrl(base, '/databuff-chatbi/reports/token'))
      .toBe('https://opt.beta.uletm.com/dsh/databuff-chatbi/reports/token')
    expect(buildReportUrl('', '/databuff-chatbi/reports/token'))
      .toBe('/databuff-chatbi/reports/token')
  })

  it('emits an RFC 5987 filename for direct downloads with non-ASCII names', () => {
    const header = reportContentDisposition('attachment', '服务巡检.html')
    expect(header).toContain('attachment; filename="')
    expect(header).toContain("filename*=UTF-8''")
    expect(header).toContain('%E6%9C%8D%E5%8A%A1%E5%B7%A1%E6%A3%80.html')
  })
})
