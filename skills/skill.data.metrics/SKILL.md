---
name: skill.data.metrics
description: DataBuff APM 指标、Trace、日志和告警查询口径。
---

# DataBuff APM 查询规则

1. 查询动态数据前必须先确定时间范围。
2. 服务名称不确定时先调用服务发现工具，不猜测 serviceId。
3. 指标查询优先使用 `queryMetricData`，Trace 使用 Trace 工具，日志使用日志工具。
4. 只有结构化工具无法满足问题时，才读取表结构并调用受控只读 SQL。
5. 返回结果必须注明查询时间范围；无数据不等于系统正常。
6. 对比趋势时保持过滤条件、聚合维度和时间粒度一致。
7. 问题涉及服务器、主机、节点、容器、虚拟机、操作系统或硬件资源时，必须使用
   DataBuff Prometheus Tool。CPU、Load、内存、Swap、磁盘、文件系统、磁盘 IO、网络、
   GPU、温度、功耗和主机存活状态都属于此规则覆盖范围。
8. 当前值使用 `prometheus_query`，区间趋势使用 `prometheus_query_range`；指标名、标签、
   实例或节点不明确时，先使用 `prometheus_metadata` 或 `prometheus_series` 发现真实值。
9. 同一请求同时涉及应用与系统指标时，分别查询结构化 APM Tool 和 Prometheus Tool，
   使用相同时间范围关联分析，并在答案中标明各项数据来源。
10. 完成指标统计、趋势、排行、对比或异常汇总后，直接生成包含 KPI、图表和明细的独立 HTML，
    调用 `saveChatbiHtmlReport` 保存，并返回可打开、下载和分享的链接。
