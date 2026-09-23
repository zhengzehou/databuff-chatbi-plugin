import { describe, expect, it } from 'vitest'
import { buildReportSessionTitle, normalizeReportFileName, sanitizeReportHtml } from '../src/report'

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
})
