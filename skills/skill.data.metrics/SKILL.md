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
