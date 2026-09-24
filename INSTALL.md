# DataBuff ChatBI DSH plugin

This package is a DSH bundle for the DataBuff/APM ChatBI agent.

## Requirements

- DSH 0.1.7-alpha.1 or 0.1.7-alpha.2
- DSH MCP settings containing a streamable-http server named chatbi-databuff
- Node.js supported by the installed DSH release

## Install from the shared tarball

The plugin consumes MCP tools already registered by DSH. It does not own the
MCP URL, transport, or token. Install it into the profile that runs DSH:

```powershell
$env:DATABUFF_DSH_WORKSPACE_ROOT = 'D:\databuff\dsh-workspace'

dsh plugin --profile web add 'C:\Downloads\databuff-dsh-plugin-chatbi-0.1.6.tgz'
```

Replace web with the profile that runs your DSH service if it is different.
Restart that service after installation. For a Tauri profile, use:

```powershell
dsh plugin --profile tauri add 'C:\Downloads\databuff-dsh-plugin-chatbi-0.1.6.tgz'
```

For Linux:

```sh
export DATABUFF_DSH_WORKSPACE_ROOT='/data/logs/dsh/workspace'
dsh plugin --profile web add '/opt/packages/databuff-dsh-plugin-chatbi-0.1.6.tgz'
```

The workspace variable is independent of MCP and is optional when the default
Linux workspace path is acceptable.

## DSH MCP settings

Configure the MCP server once in the DSH profile MCP settings or patch. The
server name must exactly be chatbi-databuff:

```yaml
- id: mcp-chatbi-databuff
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: chatbi-databuff
    transport: streamable-http
    url: https://opt.uletm.com/webapi/mcp
    headers:
      Authorization: Bearer <token-if-required>
```

Do not set DATABUFF_MCP_URL, DATABUFF_MCP_HOST, DATABUFF_MCP_PATH, or
DATABUFF_MCP_TOKEN for this plugin. If an old value remains in the DSH service
environment, remove it so it cannot create a second or conflicting connection.

The plugin only checks that DSH exposes the configured server's allowed tools.
If the server is missing, disconnected, or exposes no supported tools, session
creation will fail with the server name shown in the error.

## Workspace and authentication

The plugin creates /data/logs/dsh/workspace automatically when the service
user has permission. Otherwise create it and grant ownership before startup.

In production, set DATABUFF_AUTH_REQUIRED=true and configure
DATABUFF_AUTH_STATUS_URL, DATABUFF_LOGIN_URL, and DATABUFF_DSH_REDIRECT_URL
for the DataBuff deployment. DATABUFF_AUTH_REQUIRED=false is intended only
for local testing.

## Verify

After restart, databuff-chatbi should be the default agent preset. Create a
new session and verify that the DataBuff MCP tools are available.
