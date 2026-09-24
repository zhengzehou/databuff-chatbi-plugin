# DataBuff ChatBI plugin for DSH

面向 DeepSeek Harness 的 DataBuff/APM 专用 Agent 插件。当前验证支持：

- `0.1.7-alpha.1`
- `0.1.7-alpha.2`

插件只把完成兼容验证的 DSH 发行版标记为兼容；未来版本需要通过类型检查、测试、
构建和集成启动验证后再加入 `package.json#dsh.compatibility.dshReleases`。

它提供以下边界：

- 使用完整 persona，将 Agent 限定为 DataBuff 和 APM 问题；
- Uses the chatbi-databuff MCP server registered by DSH;
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

当前 DataBuff `/webapi/mcp` 已实现基础 APM Tool，并已加入下列标准 MCP 能力：

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
- `/webapi/mcp` 在生产环境必须校验短期用户 Token 或受限服务 Token。

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
pnpm dsh web --patch E:/workspace/vscode/dsh/databuff-chatbi-plugin/cordis.patch.yml
```

## DSH MCP configuration

The plugin consumes the MCP server already registered by DSH. Configure one
streamable-http server with the exact name chatbi-databuff and endpoint
https://opt.uletm.com/webapi/mcp. Keep any Authorization header in the DSH
MCP entry. The plugin does not register a URL or token.
## 锁定模式与运维入口

插件默认以锁定模式运行：新会话固定使用 `databuff-chatbi`，普通用户看不到设置、
插件管理和会话模式切换入口，服务端也不注册其他 agent preset。

需要维护 DSH 配置时，只能在启动 DSH 的服务端环境中临时设置：

```powershell
$env:DATABUFF_DSH_ADMIN_MODE = 'true'
```

然后重启 DSH。维护完成后删除该环境变量并再次重启，即恢复锁定模式：

```powershell
Remove-Item Env:DATABUFF_DSH_ADMIN_MODE
```

该开关不会暴露到浏览器配置或 Cookie，避免普通客户端自行解锁。

## 服务端工作区锁定

锁定模式下，插件会在宿主 API 层覆盖客户端提交的 `cwd`、`workspaceId` 和
`agentPreset`，所有新会话固定使用服务端目录和 `databuff-chatbi`：

```powershell
$env:DATABUFF_DSH_WORKSPACE_ROOT = 'D:\databuff\dsh-workspaces'
$env:DATABUFF_DSH_WORKSPACE_LOCKED = 'true'
```

未配置时，非 Linux 默认使用当前 DSH profile 下的 `workspace` 目录；Linux 默认使用
`/data/logs/dsh/workspace`。修改变量后必须重启 DSH。管理员模式会临时解除工作区覆盖
并恢复目录选择器。生产多用户环境应在身份接入后把根目录进一步划分为
`<tenantId>\<userId>`，避免用户间共享可写目录。插件会尝试递归创建 Linux 默认目录，
若 DSH 服务用户没有权限，启动/新建会话时会提示具体目录和权限错误；也可以通过
`DATABUFF_DSH_WORKSPACE_ROOT` 指定其他可写目录。

生产模式示例：

```powershell
$env:DATABUFF_AUTH_REQUIRED='true'
$env:DATABUFF_AUTH_STATUS_URL='/webapi/api/v1/dsh/auth/status'
$env:DATABUFF_LOGIN_URL='/databuff/login'
$env:DATABUFF_DSH_REDIRECT_URL='/ai/'
pnpm dsh web --patch E:/workspace/vscode/dsh/databuff-chatbi-plugin/cordis.patch.yml
```

MCP authorization remains a DSH process-level setting; configure it in the DSH MCP server entry rather than in this plugin.
## 鉴权说明

`DATABUFF_AUTH_REQUIRED=false` 只跳过 DSH 页面登录检查。以下限制始终生效：

- DSH 通用工具不可用；
- DataBuff MCP Tool 精确白名单；
- DataBuff 后端的只读 SQL、表/列白名单、时间范围、最大行数和 PromQL 限制；
- MCP 服务端网络隔离。

当前 DSH 官方 MCP Client 的 HTTP headers 是进程级配置，不是每个浏览器用户动态配置。


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
