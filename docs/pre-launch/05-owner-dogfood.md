# 05 · 独立知识库完整 Dogfood

> [返回上线前 TODO](../pre-launch-todo.md)
>
> 优先级：P0/P1 · Release Candidate 收口
>
> 状态：未开始
>
> 前置任务：[上线范围与历史任务审计](01-release-scope-and-task-audit.md)

## 任务目标

Owner 在与开发 Vault 隔离的知识库中，从干净安装开始完整使用所有公开承诺功能，并把问题转化为可复现、可复测的缺陷记录。

## 1. 测试环境

- [ ] 创建与日常开发 Vault 隔离的全新知识库。
- [ ] 使用不包含私人信息的测试材料。
- [ ] 测试材料接近真实使用规模和内容结构。
- [ ] 记录 Obsidian 版本和插件版本。
- [ ] 记录主题、系统、Provider 和模型。
- [ ] 覆盖空 Vault。
- [ ] 覆盖小型 Vault。
- [ ] 覆盖有一定规模的 Vault。
- [ ] 从干净安装开始，不复用开发环境残留设置。

## 2. 核心流程

- [ ] 安装、启用、首次启动和 onboarding。
- [ ] Provider、模型、API key、索引深度和权限配置。
- [ ] Chat Studio 的普通对话和 Agent。
- [ ] Chat Studio 的资源、取消、恢复和历史。
- [ ] Vault Search 的主要模式、导航、预览和打开文件。
- [ ] AI Search 的计划、工具调用、报告和来源。
- [ ] AI Search 的历史和失败恢复。
- [ ] Composer 的编辑、AI action、历史和文档切换。
- [ ] File Atlas 的文档关系、文件类型、过滤和跳转。
- [ ] File Atlas 与 Composer 的 handoff。
- [ ] Graph、Vault Intelligence、Command Center 和 Settings 中承诺公开的流程。
- [ ] 网站和 README 中出现的每项功能。

## 3. 可靠性与边界

- [ ] 空状态。
- [ ] 错误 API key。
- [ ] 网络失败。
- [ ] Provider 不可用或额度不足。
- [ ] 取消、重试和重复点击。
- [ ] 并发 session 和插件 reload。
- [ ] Obsidian 重启后的数据恢复。
- [ ] 老版本升级和 legacy 数据读取。
- [ ] 迁移保护和数据 quarantine。
- [ ] Markdown、图片、PDF、表格和其他公开支持的文件类型。
- [ ] 大文档、大 Vault 和长时间使用。
- [ ] 索引期间的内存和响应表现。
- [ ] 本地数据、同步数据和外部 Provider 数据边界。

## 4. 缺陷记录

每个问题至少包含：

- [ ] 测试环境和版本。
- [ ] 复现步骤。
- [ ] 预期结果。
- [ ] 实际结果。
- [ ] 严重度：P0、P1、P2 或观察项。
- [ ] 截图、视频、DOM、日志或数据证据。
- [ ] 修复后的复测结果。

真实 Obsidian 验证遵循 [Obsidian Real-UI QA](../conventions/obsidian-real-ui-qa.md)。旧的 [Manual Testing Checklist](../90-old-root-docs/manual-testing-checklist.md) 只能作为历史候选池；Chat 可参考 [Chat Studio Capability Checklist](../testing/chat-studio-capability-checklist.md)，但都需要重新对照当前源码和 UI。

## 完成条件

- [ ] Owner 连续完成所有公开核心流程，没有 P0 问题。
- [ ] P1 问题已修复，或对应功能/主张从首次公开版本移除。
- [ ] 所有交互结论都有真实 Obsidian 证据。
- [ ] mock、source inspection 和绿色 build 没有被当作 E2E。

## 不要做

- 不在日常开发 Vault 中完成唯一一轮验收。
- 不只验证按钮能点，忽略数据恢复和失败路径。
- 不用朋友试用替代 owner 自己的完整 dogfood。
