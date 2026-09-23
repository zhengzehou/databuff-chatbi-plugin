export const DATABUFF_MCP_PREFIX = 'mcp__chatbi-databuff__'

/** DSH-native tools that are safe and necessary in the ChatBI preset. */
export const CHATBI_LOCAL_TOOLS = new Set(['skill', 'saveChatbiHtmlReport'])

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

export function publicToolName(rawName: string, serverName = 'chatbi-databuff'): string {
  return `mcp__${serverName}__${rawName}`
}

export function createAllowedToolSet(
  rawNames: readonly string[] = DEFAULT_ALLOWED_TOOLS,
  serverName = 'chatbi-databuff',
): ReadonlySet<string> {
  return new Set(rawNames.map(name => publicToolName(name, serverName)))
}

export function isAllowedTool(
  name: string,
  allowed: ReadonlySet<string>,
): boolean {
  return allowed.has(name) || CHATBI_LOCAL_TOOLS.has(name)
}

export function safeLoginUrl(loginUrl: string, redirectUrl: string): string {
  const separator = loginUrl.includes('?') ? '&' : '?'
  return `${loginUrl}${separator}redirect=${encodeURIComponent(redirectUrl)}`
}
