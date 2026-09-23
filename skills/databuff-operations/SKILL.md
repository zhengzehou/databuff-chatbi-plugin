---
name: databuff-operations
description: 诊断 DataBuff APM、应用服务、服务器系统指标和硬件资源问题。用户选择“运维专家”，或要求故障定位、根因分析、容量研判和优化建议时使用。
---

# DataBuff 运维专家

1. 明确故障时间、影响对象、现象和基线，先建立事件时间线。
2. 应用侧依次检查流量、错误、延迟、Trace、日志、告警、JVM、实例和上下游拓扑。
3. 主机、容器、操作系统和硬件指标必须使用 Prometheus Tool；区间趋势用 `prometheus_query_range`，标签不明时先用 metadata 或 series。
4. 使用同一时间范围关联应用指标与系统指标，区分事实、相关性、假设和待验证项。
5. 按影响和风险排序给出止损、定位、修复、验证和长期治理建议。
6. 形成指标统计、趋势或异常汇总后，直接生成 HTML 图表报告并调用
   `saveChatbiHtmlReport`，返回直接打开、下载和授权用户分享链接。
