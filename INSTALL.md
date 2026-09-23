# DataBuff ChatBI DSH plugin

This package is a DSH bundle for the DataBuff/APM ChatBI agent.

## Requirements

- DSH `0.1.7-alpha.1` or `0.1.7-alpha.2`
- A reachable DataBuff MCP endpoint
- Node.js supported by the installed DSH release

## Install from the shared tarball

Use an absolute path to the `.tgz` file. The profile manager installs the
bundle into the selected profile and automatically activates its `dsh.bundle`
patch; no manual editing of `cordis.patch.yml` is needed.

```powershell
$env:DATABUFF_MCP_URL = 'http://127.0.0.1:27403/mcp'
$env:DATABUFF_DSH_WORKSPACE_ROOT = 'D:\databuff\dsh-workspace'

dsh plugin --profile web add 'C:\Downloads\databuff-dsh-plugin-chatbi-0.1.3.tgz'
```

Replace `web` with the profile that runs your DSH service if it is different.
Restart that service after installation. For a Tauri profile, use:

```powershell
dsh plugin --profile tauri add 'C:\Downloads\databuff-dsh-plugin-chatbi-0.1.3.tgz'
```

The package resolves its preset and bundled skills from the installed profile,
so the installation directory may differ on every machine.

For a Linux shell, the equivalent installation is:

```sh
export DATABUFF_MCP_URL='http://127.0.0.1:27403/mcp'
export DATABUFF_MCP_TOKEN='replace-with-a-scoped-service-token'
export DATABUFF_DSH_WORKSPACE_ROOT='/data/logs/dsh/workspace'
dsh plugin --profile web add '/opt/packages/databuff-dsh-plugin-chatbi-0.1.3.tgz'
```

The `export` values above only affect commands started from that shell. A
systemd-managed DSH process must receive the same values through its unit's
`EnvironmentFile`.

## MCP and authentication

Set `DATABUFF_MCP_URL` before starting DSH when the MCP server is not on the
local default address. You can provide the endpoint either as a complete URL
or as host settings:

```sh
# Preferred when the endpoint has a non-default path or scheme:
export DATABUFF_MCP_URL='http://databuff:27403/mcp'

# Or let the plugin construct http://HOST:PORT/PATH:
export DATABUFF_MCP_HOST='databuff'
export DATABUFF_MCP_PORT='27403'
export DATABUFF_MCP_PATH='/mcp'
```

`DATABUFF_MCP_URL` takes precedence over `DATABUFF_MCP_HOST`. `DATABUFF_MCP_HOST`
may be a plain hostname/IP or an `http(s)://` base URL; the default `/mcp` path
is appended when needed. If the MCP endpoint requires a service token, set
`DATABUFF_MCP_TOKEN`; the plugin sends it as `Authorization: Bearer ...`.
For a preformatted header, use `DATABUFF_MCP_AUTHORIZATION` instead.

On Linux, these variables must be present in the DSH service process. For a
systemd deployment, put them in an environment file referenced by the DSH
unit, for example `/etc/dsh/databuff.env`:

```ini
DATABUFF_MCP_HOST=databuff
DATABUFF_MCP_PORT=27403
DATABUFF_MCP_PATH=/mcp
DATABUFF_MCP_TOKEN=replace-with-a-scoped-service-token
DATABUFF_DSH_WORKSPACE_ROOT=/data/logs/dsh/workspace
```

Then restart the service. If DSH and DataBuff run in different containers,
do not use `127.0.0.1`; use the DataBuff service DNS name or host address.
The plugin creates `/data/logs/dsh/workspace` automatically when the service
user has permission. Otherwise create it and grant ownership before startup,
for example `sudo mkdir -p /data/logs/dsh/workspace` followed by `sudo chown`.

For a container deployment, pass the same values in the container environment,
for example in Docker Compose:

```yaml
environment:
  DATABUFF_MCP_HOST: databuff
  DATABUFF_MCP_PORT: "27403"
  DATABUFF_MCP_PATH: /mcp
  DATABUFF_DSH_WORKSPACE_ROOT: /data/logs/dsh/workspace
```

In production, set `DATABUFF_AUTH_REQUIRED=true` and configure
`DATABUFF_AUTH_STATUS_URL`, `DATABUFF_LOGIN_URL`, and
`DATABUFF_DSH_REDIRECT_URL` for the DataBuff deployment.

`DATABUFF_AUTH_REQUIRED=false` is intended only for local testing.

## Verify

After restart, `databuff-chatbi` should be the default agent preset. Create a
new session and verify that the DataBuff MCP tools are available.
