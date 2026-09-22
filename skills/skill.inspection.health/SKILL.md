---
name: skill.inspection.health
description: DataBuff 服务健康巡检和故障诊断流程。
---

# 服务巡检流程

优先调用 `inspectService` 获取综合巡检结果。需要展开原因时，按入口指标、错误 Trace、
异常日志、告警、实例/JVM、依赖拓扑和下游延迟的顺序补充查询。最终区分事实、推断、
影响范围和建议，不把相关性描述成确定因果。
