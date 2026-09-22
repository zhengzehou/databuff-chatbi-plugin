export const DATABUFF_MCP_PREFIX = 'mcp__databuff__'

export const DEFAULT_ALLOWED_TOOLS = [
  'getCurrentTimeRange',
  'getTimeRangeAroundTime',
  'drawTrendCharts',
  'queryServicesAll',
  'queryServicesByServiceType',
  'queryServiceTopology',
  'queryTraceListByCondition',
  'queryTraceDetail',
  'queryServiceAlarms',
  'queryMetricData',
  'queryLogTrend',
  'queryLogDetail',
  'queryLogsByTraceId',
  'queryLogsBySpanId',
  'inspectService',
  'listDataTables',
  'getTableSchema',
  'searchDataFields',
  'getMetricCatalog',
  'queryDorisBusinessData',
  'querySelfMonitorMetrics',
  'prometheus_query',
  'prometheus_query_range',
  'prometheus_series',
  'prometheus_metadata',
] as const

export function publicToolName(rawName: string, serverName = 'databuff'): string {
  return `mcp__${serverName}__${rawName}`
}

export function createAllowedToolSet(
  rawNames: readonly string[] = DEFAULT_ALLOWED_TOOLS,
  serverName = 'databuff',
): ReadonlySet<string> {
  return new Set(rawNames.map(name => publicToolName(name, serverName)))
}

export function isAllowedTool(
  name: string,
  allowed: ReadonlySet<string>,
): boolean {
  return allowed.has(name)
}

export function safeLoginUrl(loginUrl: string, redirectUrl: string): string {
  const separator = loginUrl.includes('?') ? '&' : '?'
  return `${loginUrl}${separator}redirect=${encodeURIComponent(redirectUrl)}`
}
