# DataBuff ChatBI plugin for DSH

面向 DeepSeek Harness `0.1.1-rc.1` 的 DataBuff/APM 专用 Agent 插件。

它提供以下边界：

- 使用完整 persona，将 Agent 限定为 DataBuff 和 APM 问题；
- 通过官方 `@deepseek-ai/dsh-mcp-client` 接入 DataBuff `/mcp`；
- 隐藏所有继承的 DSH 全局工具，并通过最终 guard 只允许明确配置的 DataBuff MCP Tool；
- 浏览器定期验证 DataBuff 登录，未登录或登录失效时跳转 DataBuff 登录页；
- `DATABUFF_AUTH_REQUIRED=false` 时进入测试模式并显示警告横幅；
- 附带问数、巡检 Skill 文档和 DataBuff 专用 preset。

## 安全边界

插件不会连接 Doris 或 Prometheus。表结构、只读业务查询、DataBuff 系统 Tool 和
Prometheus API 都应由 DataBuff 后端包装成 MCP Tool。数据库及 Prometheus 凭据只保存在
DataBuff 服务。

Prompt 不是安全边界。实际约束由 preset 中未装载通用工具、`tools.restrict({ allow: [] })`
以及精确 MCP Tool allow-list 三层共同完成。

## 依赖的 DataBuff 后端能力

当前 DataBuff `/mcp` 已实现基础 APM Tool，并已加入下列标准 MCP 能力：

- `listDataTables`
- `getTableSchema`
- `searchDataFields`
- `getMetricCatalog`
- `queryDorisBusinessData`
- `querySelfMonitorMetrics`
- `prometheus_query`
- `prometheus_query_range`
- `prometheus_series`
- `prometheus_metadata`

`tools/list` 当前返回 25 个 Tool。未由 MCP 服务发布的 Tool 不会出现在 DSH 中。

DataBuff 同时提供：

```http
GET /webapi/api/v1/dsh/auth/status
```

- 登录有效：返回任意 `2xx`；
- 未登录或过期：返回 `401`；
- 建议支持浏览器 Cookie；跨域部署需允许 credentials 和精确 Origin；
- `/mcp` 在生产环境必须校验短期用户 Token 或受限服务 Token。

## 本地安装

前提：本机已有 `E:/workspace/vscode/dsh/deepseek-harness`，Node.js 满足 DSH 要求。

```powershell
cd E:\workspace\vscode\dsh\databuff-chatbi-plugin
pnpm install
pnpm run typecheck
pnpm test
pnpm run build
```

把插件加入 DSH Web profile：

```powershell
cd E:\workspace\vscode\dsh\deepseek-harness
pnpm dsh plugin --profile web add "E:/workspace/vscode/dsh/databuff-chatbi-plugin"
```

测试模式启动：

```powershell
$env:DATABUFF_AUTH_REQUIRED='false'
$env:DATABUFF_MCP_URL='http://127.0.0.1:27403/mcp'
pnpm dsh web --patch E:/workspace/vscode/dsh/databuff-chatbi-plugin/cordis.patch.yml
```

生产模式示例：

```powershell
$env:DATABUFF_AUTH_REQUIRED='true'
$env:DATABUFF_AUTH_STATUS_URL='/webapi/api/v1/dsh/auth/status'
$env:DATABUFF_LOGIN_URL='/databuff/login'
$env:DATABUFF_DSH_REDIRECT_URL='/ai/'
$env:DATABUFF_MCP_URL='http://ai-apm-web:27403/mcp'
$env:DATABUFF_MCP_TOKEN='<short-lived-or-service-token>'
pnpm dsh web --patch E:/workspace/vscode/dsh/databuff-chatbi-plugin/cordis.patch.yml
```

## 鉴权说明

`DATABUFF_AUTH_REQUIRED=false` 只跳过 DSH 页面登录检查。以下限制始终生效：

- DSH 通用工具不可用；
- DataBuff MCP Tool 精确白名单；
- DataBuff 后端的只读 SQL、表/列白名单、时间范围、最大行数和 PromQL 限制；
- MCP 服务端网络隔离。

当前 DSH 官方 MCP Client 的 HTTP headers 是进程级配置，不是每个浏览器用户动态配置。
因此，多用户生产部署不能仅靠 `DATABUFF_MCP_TOKEN` 实现逐用户数据授权。推荐部署方式是：

1. 网关验证 DataBuff 登录后才放行 DSH 页面；
2. DSH 使用范围受限的服务 Token 连接 MCP；
3. DataBuff MCP 先保持只读和租户固定；
4. 后续增加“DSH 会话 → DataBuff 用户短期 Token”的服务端会话交换插件，再实现逐用户租户授权。

在完成第 4 项前，不要将一个可访问所有租户的管理 Token 配置给 DSH。

## 默认允许的 Tool

白名单维护在 `src/policy.ts`。它包含现有 APM、Trace、日志、告警和巡检 Tool，以及规划中的
Schema、只读 Doris、自监控与 Prometheus Tool。工具必须同时满足：

1. DataBuff MCP 确实发布；
2. 名称在插件白名单中；
3. DataBuff 服务端权限校验允许。

任意 Shell、文件、Git、Browser、Web、插件管理和子 Agent Tool 都会被拒绝。
