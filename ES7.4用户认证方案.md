# Elasticsearch 7.4 用户认证方案

## 1. 方案概览

| 方案 | 适合场景 | 主要特点 |
| --- | --- | --- |
| Native Realm 用户名密码 | 大多数内部系统 | 免费、用户集中存储、支持 RBAC，优先推荐 |
| File Realm | 应急管理员、少量静态用户 | 用户保存在各节点本地文件，需要保持同步 |
| API Key | 应用、采集程序、定时任务 | 可限制权限和有效期，优于共享账号密码 |
| LDAP / Active Directory | 企业统一账号体系 | 可对接域账号，通常需要商业许可 |
| SAML / OIDC / Kerberos / PKI | 企业 SSO、证书认证 | 配置相对复杂，部分功能需要商业许可 |
| Nginx 或 API 网关认证 | 不方便修改 ES 或使用 OSS 发行版 | 可接入 Basic、JWT、OAuth2，但必须防止绕过代理 |
| 第三方安全插件 | 无法使用 X-Pack | 存在版本匹配、升级和长期维护成本 |
| 业务服务代理 | 面向互联网或最终用户 | 用户不直接访问 ES，安全边界最好 |

Elasticsearch 7.4 默认发行版可以在 Basic License 下免费使用 TLS、Native/File 用户认证和基于角色的访问控制（RBAC）。这些核心安全能力从 Elasticsearch 7.1 开始免费。

## 2. 推荐方案

推荐采用：

> X-Pack Security + Native Realm + RBAC + TLS

该方案由 Elasticsearch 原生支持，不需要额外安装插件，能够同时解决：

- 用户身份认证；
- 集群及索引级权限控制；
- 节点之间的通信加密；
- 客户端到 Elasticsearch 的 HTTPS 加密；
- 不同应用使用独立账号或 API Key。

## 3. 开启 X-Pack Security

在所有 Elasticsearch 节点的 `elasticsearch.yml` 中添加：

```yaml
xpack.security.enabled: true
```

如果是生产模式下的多节点集群，还需要启用节点间 Transport TLS：

```yaml
xpack.security.transport.ssl.enabled: true
xpack.security.transport.ssl.verification_mode: certificate
xpack.security.transport.ssl.keystore.path: elastic-certificates.p12
xpack.security.transport.ssl.truststore.path: elastic-certificates.p12
```

可以使用 Elasticsearch 自带工具生成 CA 和节点证书：

```bash
bin/elasticsearch-certutil ca
bin/elasticsearch-certutil cert --ca elastic-stack-ca.p12
```

将生成的证书文件复制到各节点的配置目录，并保证 Elasticsearch 进程拥有读取权限。

## 4. 初始化内置账号密码

完成配置并重启集群后，在任意一个节点执行：

```bash
bin/elasticsearch-setup-passwords interactive
```

该命令会要求设置 `elastic`、`kibana`、`logstash_system` 等内置账号的密码。

验证认证是否生效：

```bash
curl -u elastic:密码 http://localhost:9200/_cluster/health
```

启用认证以后，Kibana、Logstash、Beats 和业务应用访问 Elasticsearch 时也必须提供相应凭证。

## 5. 开启 HTTP HTTPS

生产环境不应通过明文 HTTP 传输用户名和密码。建议配置 HTTP TLS：

```yaml
xpack.security.http.ssl.enabled: true
xpack.security.http.ssl.keystore.path: http.p12
```

启用后，客户端使用 HTTPS 访问：

```bash
curl --cacert ca.crt -u elastic:密码 \
  https://localhost:9200/_cluster/health
```

## 6. 创建最小权限角色和用户

业务程序不要使用 `elastic` 超级管理员账号，应为每个应用创建独立角色和用户。

创建只读角色：

```http
PUT /_security/role/order_reader
{
  "cluster": ["monitor"],
  "indices": [
    {
      "names": ["order-*"],
      "privileges": ["read", "view_index_metadata"]
    }
  ]
}
```

创建用户：

```http
PUT /_security/user/app_reader
{
  "password": "请替换为强密码",
  "roles": ["order_reader"],
  "full_name": "Order application"
}
```

客户端通过 HTTP Basic Authentication 访问：

```http
Authorization: Basic base64(app_reader:密码)
```

## 7. 应用访问使用 API Key

Elasticsearch 7.4 支持 API Key。API Key 适合微服务、定时任务、采集组件等非人工调用场景。

创建 API Key：

```http
POST /_security/api_key
{
  "name": "order-service",
  "expiration": "30d"
}
```

返回结果包含 `id` 和 `api_key`。调用时将 `id:api_key` 进行 Base64 编码：

```http
Authorization: ApiKey <base64(id:api_key)>
```

注意事项：

- API Key 应设置合理的过期时间；
- 不同应用应使用不同的 API Key；
- API Key 权限不应超过创建它的用户权限；
- 密钥只在创建时返回，应存放在安全的密钥管理系统中；
- Elasticsearch 7.4 在生产模式下启用 API Key 服务时，应同时启用 HTTP TLS。

## 8. File Realm

File Realm 将用户和角色映射保存在每个节点的本地文件中：

- `config/users`
- `config/users_roles`

它适合作为集群故障或安全索引不可用时的应急账号机制，不推荐作为主要用户管理方式。多节点环境必须确保所有节点上的文件内容一致。

## 9. LDAP、AD 和单点登录

如果企业已有统一身份平台，可以考虑：

- LDAP；
- Microsoft Active Directory；
- SAML；
- OpenID Connect；
- Kerberos；
- PKI 客户端证书。

这些方式通常还需要配置角色映射，将目录组、证书 DN 或身份提供方属性映射为 Elasticsearch 角色。使用前应根据 Elasticsearch 7.4 对应的订阅矩阵确认许可要求。

## 10. Nginx 或网关认证

如果使用的是 `elasticsearch-oss-7.4.x`，该发行版不包含 X-Pack，可以暂时在 Elasticsearch 前部署 Nginx：

```nginx
server {
    listen 443 ssl;

    location / {
        auth_basic "Elasticsearch";
        auth_basic_user_file /etc/nginx/es.htpasswd;

        proxy_pass http://127.0.0.1:9200;
    }
}
```

采用该方案必须同时满足：

- Elasticsearch 只监听 `127.0.0.1` 或受控内网地址；
- 防火墙禁止用户直接访问 Elasticsearch 的 9200 端口；
- 所有外部请求只能经过 Nginx 或网关；
- 网关对外启用 HTTPS；
- 不使用简单 URL 过滤规则代替 Elasticsearch RBAC。

如果任何 Elasticsearch 节点能够绕过网关被直接访问，网关认证就会失效。

## 11. 面向互联网用户的架构

不建议让浏览器、移动端或外部用户直接访问 Elasticsearch。推荐调用链为：

```text
用户 -> 业务服务/统一网关 -> Elasticsearch
```

由业务服务负责：

- 用户登录和会话管理；
- 租户、数据范围和业务权限检查；
- 查询参数校验与限流；
- 使用受限用户或 API Key 访问 Elasticsearch；
- 隐藏 Elasticsearch 的内部地址和数据结构。

## 12. 选型建议

- 小型内部系统：Native Realm + RBAC + HTTPS。
- Java 服务、Logstash、定时任务：独立用户或独立 API Key。
- 企业域账号：LDAP/AD，并确认商业许可。
- 企业单点登录：SAML/OIDC，通过 Kibana 或业务系统接入。
- 面向互联网用户：通过业务服务访问，禁止直接暴露 Elasticsearch。
- 使用 OSS 包且暂时无法更换：Nginx 或网关认证作为过渡方案。

## 13. 版本风险

Elasticsearch 7.4 已经停止维护，不再获得漏洞修复。即使在现有系统上补充认证，也无法解决旧版本自身可能存在的安全漏洞。

建议将以下工作一起规划：

1. 先限制 Elasticsearch 的网络暴露范围；
2. 启用认证、RBAC 和 TLS；
3. 为业务应用替换超级管理员账号；
4. 建立密钥轮换机制；
5. 升级到仍在官方维护的 Elasticsearch 版本。

## 14. 参考资料

- [Elastic：Security for Elasticsearch is now free](https://www.elastic.co/blog/security-for-elasticsearch-is-now-free)
- [Elasticsearch 7.4：Create API key API](https://www.elastic.co/guide/en/elasticsearch/reference/7.4/security-api-create-api-key.html)
- [Elastic 产品版本生命周期](https://www.elastic.co/support/eol)
