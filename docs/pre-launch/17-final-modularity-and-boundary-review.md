# 17 · 最终模块化与代码边界梳理

> [返回上线前 TODO](../pre-launch-todo.md)
>
> 优先级：P1 · 最终架构收口
>
> 状态：等待功能、公开材料和真实试用稳定
>
> 前置任务：[剩余功能收口](16-remaining-feature-closure.md)、[朋友试用与外部内容检查](07-external-beta.md)
>
> 下游任务：[Owner 代码接管](02-owner-code-readiness.md)、[Owner 人工通读](10-owner-manual-code-and-doc-reading.md)

## 任务目标

在剩余功能、Landing Page、README、Dogfood 和朋友试用基本稳定之后，对最终 Release Candidate 做一次有边界的模块化与架构收口。目标是让 Owner 面对更稳定、更清楚的最终代码结构，而不是先读懂一个仍在持续重构的中间状态。

本任务保留全部已批准的用户功能。重点是明确模块责任、消除有证据的重复 runtime 和旧路径、降低高风险耦合，并留下可由 Owner 阅读和维护的最终架构说明。

## 1. 锁定审计基线

- [ ] 记录 branch、commit、版本、源代码规模和日期。
- [ ] 确认首次公开版本功能已经冻结。
- [ ] 确认 Dogfood 与朋友试用的 P0/P1 问题已经处理。
- [ ] 汇总历史 modularity、boundary、retirement 和 architecture audit，只作为候选输入。
- [ ] 对每条旧结论重新核对当前 caller、runtime lifecycle 和用户可达性。

## 2. 模块边界检查

- [ ] 检查 `app -> service -> core -> ui` 的当前依赖和例外。
- [ ] 检查 runtime 是否由 app composition、`AppContext` 或 app-owned registry 负责。
- [ ] 检查 service 侧 module singleton、隐式全局状态和反向 UI 依赖。
- [ ] 检查重复 adapter、重复 store、重复 command 和同一能力的双 runtime。
- [ ] 检查超大模块、循环依赖、跨 feature 私有实现引用和隐式副作用。
- [ ] 检查 template/config、schema、storage writer 和 generated artifact ownership。
- [ ] 检查废弃入口、兼容路径、debug/QA 代码和无法到达的模块。

## 3. 候选判决

每个候选必须进入一种状态：

- [ ] 必须在上线前修复的安全、数据或维护风险。
- [ ] 可安全合并、迁移或删除，并能完整复测。
- [ ] 有价值但风险过高，记录为上线后任务。
- [ ] 仍有真实 caller 或兼容责任，明确保留。
- [ ] 缺少证据，停止处理并记录需要的验证。

## 4. 实施边界

- [ ] 优先处理边界泄漏、重复 runtime、死路径和明显 owner 不清的模块。
- [ ] 每次改变都保持用户功能、数据兼容和公开主张不变。
- [ ] 只有在候选具有精确 caller/lifecycle 证据和复测计划时才实施删除。
- [ ] 高风险或大范围候选先做只读计划与 Owner 审核。
- [ ] 模块化修改后运行 focused tests、必要全量验证、生产构建和真实 Obsidian 回归。
- [ ] 如果修改导致 Release Candidate 不稳定，停止扩展并恢复到可解释的窄范围。

## 5. Owner 阅读输入

- [ ] 形成最终模块责任地图和主要 runtime lifecycle。
- [ ] 标出 canonical data owner、projection、cache 和外部 Provider 边界。
- [ ] 标出仍然保留的例外、兼容层和已知架构债务。
- [ ] 为核心功能列出推荐代码阅读顺序。
- [ ] 将无法在上线前安全完成的事项移入明确的上线后 Backlog。

## 完成条件

- [ ] 所有高风险边界和重复 runtime 候选都有明确判决。
- [ ] 已实施的模块化修改保持全部已批准功能和数据兼容。
- [ ] focused tests、必要全量验证、build 和真实 Obsidian 回归具有证据。
- [ ] 最终模块地图、阅读顺序和保留债务已经交给 Owner。
- [ ] 代码结构可以进入最终 Owner 接管和人工通读阶段。

## 不要做

- 不在剩余功能和公开材料仍频繁变化时提前完成最终模块化。
- 不为了减少 LOC、模块数量或依赖数字删除用户功能。
- 不把历史 audit 直接当成当前删除授权。
- 不在最后阶段重新设计产品或引入新的大型抽象体系。
- 不把 build/test 通过当成删除和边界迁移的唯一证据。
- 不让“模块化还可以更好”变成无限延迟发布的理由。
