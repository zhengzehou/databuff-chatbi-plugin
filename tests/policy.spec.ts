import { describe, expect, it } from 'vitest'
import {
  createAllowedToolSet,
  isAllowedTool,
  publicToolName,
  safeLoginUrl,
} from '../src/policy'
import { normalizeConfig } from '../src/index'

describe('DataBuff tool policy', () => {
  it('qualifies raw MCP names with the configured server namespace', () => {
    expect(publicToolName('queryMetricData')).toBe('mcp__chatbi-databuff__queryMetricData')
    expect(publicToolName('queryMetricData', 'apm')).toBe('mcp__apm__queryMetricData')
  })

  it('allows only exact configured DataBuff tools', () => {
    const allowed = createAllowedToolSet(['queryMetricData', 'getTableSchema'])
    expect(isAllowedTool('mcp__chatbi-databuff__queryMetricData', allowed)).toBe(true)
    expect(isAllowedTool('mcp__chatbi-databuff__queryDorisBusinessData', allowed)).toBe(false)
    expect(isAllowedTool('skill', allowed)).toBe(true)
    expect(isAllowedTool('saveChatbiHtmlReport', allowed)).toBe(true)
    expect(isAllowedTool('bash', allowed)).toBe(false)
    expect(isAllowedTool('read', allowed)).toBe(false)
  })

  it('normalizes empty values and clamps the auth interval', () => {
    const config = normalizeConfig({
      serverName: ' ',
      allowedTools: [' queryMetricData ', '', 'queryMetricData'],
      authCheckIntervalMs: 100,
    })
    expect(config.serverName).toBe('chatbi-databuff')
    expect(config.allowedTools).toEqual(['queryMetricData'])
    expect(config.authCheckIntervalMs).toBe(10_000)
    expect(config.authRequired).toBe(true)
  })

  it('builds an encoded login redirect', () => {
    expect(safeLoginUrl('/databuff/login', 'https://example.test/ai?a=1')).toBe(
      '/databuff/login?redirect=https%3A%2F%2Fexample.test%2Fai%3Fa%3D1',
    )
    expect(safeLoginUrl('/login?lang=zh', '/ai')).toBe('/login?lang=zh&redirect=%2Fai')
  })
})
