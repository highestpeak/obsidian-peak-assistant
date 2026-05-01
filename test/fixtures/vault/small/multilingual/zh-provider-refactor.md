---
tags: [refactor, 中文]
---
# Provider 重构的核心动机

这份重构的根本目的是**降低认知负担**：所有 LLM 调用都走同一条路径，所有配置都落在
同一个 Profile Registry 里，不需要再回答"这个功能走哪个 SDK"。

见 [[provider-v2-overview]] 的英文概览。
