# 02 · Owner 代码接管与理解

> [返回上线前 TODO](../pre-launch-todo.md)
>
> 优先级：P0/P1 · 最终 Owner 接管
>
> 状态：未开始
>
> 前置任务：[剩余功能收口](16-remaining-feature-closure.md)、[最终模块化与代码边界梳理](17-final-modularity-and-boundary-review.md)

## 任务目标

让 owner 能够解释、诊断、评审和安全修改首次公开版本的核心流程。这不是逐行背诵代码，也不能让 AI 摘要代替真实理解。

日常开发期间可以随手理解局部代码，但本任务的正式接管放在剩余功能、公开材料、真实试用和最终模块化基本稳定之后。这样 Owner 阅读和掌握的是准备发布的最终结构，而不是持续变化的中间版本。

## 0. 执行时点

- [ ] 剩余功能已经完成或明确退出首次公开范围。
- [ ] Landing Page、README 和公开文档已经基本定稿。
- [ ] Owner Dogfood 和朋友试用发现的 P0/P1 问题已经处理。
- [ ] 最终模块化与代码边界任务已经完成。
- [ ] 锁定接管使用的 branch、commit、版本和日期。

## 1. 掌握系统主干

- [ ] 能解释插件启动、依赖组装、View 注册和命令注册流程。
- [ ] 能解释 Chat Studio 的入口、runtime、数据和失败路径。
- [ ] 能解释 Vault Search 与索引的主要链路。
- [ ] 能解释 AI Search 的计划、工具调用、报告和历史链路。
- [ ] 能解释 Composer 的文档读写、AI action 和历史链路。
- [ ] 能解释 File Atlas、Graph 与 Vault Intelligence 的数据来源。
- [ ] 能解释 Settings、模板、Profile 和 Provider 的配置链路。
- [ ] 能说明一次 AI 请求如何从 UI 到 Provider，再回到持久化与 UI。

## 2. 掌握数据真值

- [ ] 能区分 canonical JSON/JSONL 与 SQLite projection。
- [ ] 能区分用户文档、机器记录、索引、缓存和 telemetry。
- [ ] 能说明哪些数据会同步，哪些只保留在本地。
- [ ] 能说明数据迁移、quarantine、删除和恢复入口。
- [ ] 能说明哪些内容可能发送给外部 AI Provider。

当前数据治理以 [Generated Artifact Registry](../conventions/generated-artifact-registry.md) 为准。

## 3. 掌握验证与排障

- [ ] 能独立运行 focused tests。
- [ ] 能独立运行全量测试和 TypeScript 检查。
- [ ] 能独立完成生产构建和插件 reload。
- [ ] 能发现并区分本次回归与既有 baseline failure。
- [ ] 能根据错误现象找到首个排查文件和相关测试。
- [ ] 能按照 [Obsidian Real-UI QA](../conventions/obsidian-real-ui-qa.md) 获取真实交互证据。
- [ ] 能独立完成常见故障回滚和小范围修复。

## 4. 每个功能的阅读记录

首次公开版本中的每个主要功能都要回答：

- [ ] 用户从哪里进入。
- [ ] UI owner 在哪里。
- [ ] runtime/service owner 在哪里。
- [ ] 读取和写入哪些数据。
- [ ] 调用哪些外部依赖或 Provider。
- [ ] 如何取消、重试和恢复。
- [ ] 对应哪些 focused tests。
- [ ] 如何在真实 Obsidian 中验证。

## 完成条件

- [ ] Owner 可以不依赖 Codex/Claude Code 解释核心数据流。
- [ ] Owner 可以审核 AI 生成的改动是否破坏架构和数据边界。
- [ ] Owner 可以独立定位常见故障。
- [ ] Owner 可以说明发布失败时如何回滚。

## 不要做

- 不在主要功能和模块边界仍大幅变化时宣称完成最终接管。
- 不把“看过文件”当成已经理解运行时。
- 不只阅读 happy path，忽略取消、错误和恢复路径。
- 不继续接受无法解释的 AI 生成大改动。
