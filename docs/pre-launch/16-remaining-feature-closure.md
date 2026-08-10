# 16 · 剩余功能完成与 Release Candidate 冻结

> [返回上线前 TODO](../pre-launch-todo.md)
>
> 优先级：P0 · 功能收口
>
> 状态：等待范围审计
>
> 前置任务：[上线范围与历史任务审计](01-release-scope-and-task-audit.md)
>
> 下游阶段：[Landing Page、README 与公开材料](../pre-launch-todo.md)

## 任务目标

完成范围审计后被明确纳入首次公开版本的剩余功能、Codex/Claude task、session、worktree 和验收缺口，形成一个功能稳定的 Release Candidate。完成本任务之后才进入 Landing Page、README、公开文档和最终演示定稿。

本任务不是继续实现所有历史想法。只有被正式判定为首次公开版本必须项的工作才可以进入；其余事项必须延后、降级、替代或关闭。

## 1. 建立唯一收口清单

每个剩余项至少记录：

- [ ] 功能或问题名称。
- [ ] 对应 Roadmap、Codex/Claude task、session、branch 或 worktree 链接。
- [ ] 为什么属于首次公开版本。
- [ ] 当前完成状态和精确缺口。
- [ ] 代码、文档、数据和 runtime owner。
- [ ] 依赖关系、风险和阻塞项。
- [ ] focused test、build 和真实 Obsidian 验收要求。
- [ ] 最终判决：完成、退出范围、公开降级或关闭。

## 2. 执行顺序

- [ ] 先处理会影响多个功能的 runtime、数据和发布阻塞问题。
- [ ] 再完成首次成功路径中的缺失功能。
- [ ] 再处理失败、取消、恢复、升级和数据保护路径。
- [ ] 再完成真实 Obsidian 交互验收和必要性能检查。
- [ ] 最后更新功能状态与公开主张输入，不在此阶段定稿宣传文案。

## 3. 单项完成合同

每个剩余功能必须同时满足：

- [ ] 普通用户具有稳定可达入口。
- [ ] 核心流程、失败路径和恢复路径已实现。
- [ ] canonical data、projection、cache 和外部 Provider 边界清楚。
- [ ] focused tests 与必要全量验证通过，或 baseline failure 被精确隔离。
- [ ] 真实 Obsidian 中完成与公开主张相匹配的交互验收。
- [ ] 当前 Roadmap 状态、限制和验收记录已经同步。
- [ ] 不再依赖未合并 worktree、个人临时文件或无法恢复的 session 状态。

## 4. 范围控制

- [ ] 新发现的想法默认进入上线后候选，不自动扩大 Release Candidate。
- [ ] P0/P1 缺陷必须修复，或将对应功能和公开主张移出首次公开版本。
- [ ] 纯视觉润色只有在影响可用性、可信度或演示时才进入收口。
- [ ] 与当前功能可靠性无关的大规模模块化工作延后到[最终模块化任务](17-final-modularity-and-boundary-review.md)。
- [ ] 无法证明用户价值和上线必要性的历史任务不进入本阶段。

## 完成条件

- [ ] 首次公开版本中的每项剩余功能都已完成或明确退出。
- [ ] 不再存在没有判决的 Codex/Claude task、session、branch 或 worktree。
- [ ] 所有公开候选功能具有普通用户可达路径和真实验收状态。
- [ ] Release Candidate 功能范围、版本和 commit 已锁定。
- [ ] Landing Page、README、公开文档和视频可以基于同一稳定版本开始定稿。

## 不要做

- 不因为历史任务已经花费很多时间就自动把它纳入上线范围。
- 不在功能收口阶段无限增加新功能。
- 不把绿色 build、source inspection、mock 或 simulator 当成真实用户验收。
- 不为了完成模块化指标删除用户可见功能。
- 不一边大幅修改功能，一边反复定稿 Landing Page 和最终视频。
