# DataBuff ChatBI plugin for DSH

面向 DeepSeek Harness 的 DataBuff/APM 专用 Agent 插件。当前验证支持：

- `0.1.7-alpha.1`
- `0.1.7-alpha.2`
- `0.2.1-alpha.2`

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

插件默认以锁定模式运行：新会话固定使用 `databuff-chatbi`，服务端也不注册其他
agent preset。**设置入口与插件管理（市场）入口默认可见**，便于运维在本机检查
和调整 profile。该开关同时作用于 DSH 加载器条目和浏览器端的入口守卫，两者不会
各自为政。

默认 agent preset 由插件按启动事实推导，而不是写死：读取 profile 补丁层
（`<profile>/cordis.patch.yml`，插件开关把 `disabled: true` 写在这里）与 bundle
栈，插件启用时用 `databuff-chatbi`，插件被关闭时回落到 DSH 自带的 `standard`。
这样即使有人在插件市场或设置页把本插件关掉，新建会话也不会因为默认 preset 指向
一个已不存在的 preset 而报 `agent-preset/not-found`。

需要隐藏设置与插件入口时，在启动 DSH 的服务端环境中设置：

```powershell
$env:DATABUFF_DSH_UI_LOCKED = 'true'
```

然后重启 DSH。删除该环境变量并再次重启，即恢复可见：

```powershell
Remove-Item Env:DATABUFF_DSH_UI_LOCKED
```

Agent preset 切换（`ui-agent-preset`）仍属于锁定契约，只能用管理面开关临时解锁：

```powershell
$env:DATABUFF_DSH_ADMIN_MODE = 'true'
```

维护完成后删除该环境变量并再次重启，即恢复锁定：

```powershell
Remove-Item Env:DATABUFF_DSH_ADMIN_MODE
```

这些开关都不会暴露到浏览器配置或 Cookie，避免普通客户端自行解锁。

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
## 角色指令与上下文注入

新会话页面的角色条（智能问数 / 智能巡检 / 产品答疑 / 运维专家）决定本轮要
加载的 Skill。选定角色后，浏览器在提交消息前把角色上报给 DSH 宿主：

- `POST /dsh-chatbi-role`，请求体 `{"sessionId": "<session id>", "role": "<role key>"}`；
  该端点在 profile 作用域注册，只接受 POST，请求体超过 2 KB 时忽略。

宿主在每轮的第一个 step 通过 DSH 的上下文注入通道（`agent/pre-step`）写入一条
`user/message`，其 `source.kind` 为 `databuff-role`、`form` 为 `notice`。模型能读到
角色指令，浏览器把它渲染为一条可折叠的 context 行，**不会**出现在用户消息气泡里，
也不会进入用户自己输入的文字。

部署注意：

- 反向代理必须把 `/dsh-chatbi-role` 转发给 DSH Web 服务，否则浏览器上报失败。
  该路径刻意放在 `/webapi/*`、`/databuff/*` 之外，避免与 DataBuff 后端命名空间冲突。
- 上报失败时角色退回默认值 `query`（智能问数），对话本身不受影响。
- 只有通过 `cordis.patch.yml` 启动（同时加载 profile 作用域与 preset 作用域的插件行）
  时角色注入才完整；缺少 profile 作用域那一行时，端点不存在，行为同上降级。

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
