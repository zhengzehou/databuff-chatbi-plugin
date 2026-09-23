---
name: databuff-inspection
description: 执行 DataBuff 服务健康巡检、异常发现和巡检报告。用户选择“智能巡检”，或要求检查健康状态、异常服务、风险项和生成巡检报告时使用。
---

# DataBuff 智能巡检

1. 确认巡检范围和时间窗口，先发现服务与实例清单。
2. 优先调用 `inspectService`；再按流量、延迟、错误、Trace、日志、告警、实例、JVM和依赖拓扑补充证据。
3. 涉及服务器资源时同时调用 Prometheus Tool，覆盖 CPU、内存、磁盘、网络和存活状态。
4. 将结果分为正常、关注、异常、无数据四类，给出证据和影响范围。
5. 不把相关性写成确定因果；巡检统计完成后直接生成 HTML 图表报告并调用
   `saveChatbiHtmlReport`，返回直接打开、下载和授权用户分享链接。
