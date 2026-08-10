# 08 · 发布工程与 Go / No-Go

> [返回上线前 TODO](../pre-launch-todo.md)
>
> 优先级：P0 · 最终上线闸门
>
> 状态：未开始
>
> 前置任务：[外部试用](07-external-beta.md)、[最终模块化](17-final-modularity-and-boundary-review.md)、[Owner 代码接管](02-owner-code-readiness.md)、[Owner 人工通读](10-owner-manual-code-and-doc-reading.md)

## 任务目标

使用最终发布包完成技术、内容、隐私和恢复能力检查，然后做一次明确的 Go / No-Go 决策。

## 1. 发布身份

- [ ] 确定版本号。
- [ ] 确定 release channel。
- [ ] 确定发布日期。
- [ ] 确定支持平台和 Obsidian 版本。
- [ ] 确定已知限制。
- [ ] 确定问题反馈和安全报告入口。

## 2. 自动验证

- [ ] 运行相关 focused tests。
- [ ] 运行全量测试。
- [ ] 运行 TypeScript 检查。
- [ ] 运行生产构建和 bundle checks。
- [ ] 区分本次回归与既有 baseline failure。
- [ ] 为无法通过的检查记录精确原因和 owner 决策。

## 3. 最终发布包

- [ ] 使用最终 artifact 在干净 Vault 安装。
- [ ] 完成首次启动 smoke test。
- [ ] 完成一个核心搜索流程。
- [ ] 完成一个核心 AI 流程。
- [ ] 重启 Obsidian 并验证数据恢复。
- [ ] 检查 manifest 和版本。
- [ ] 检查依赖、License、NOTICE 和第三方资源。
- [ ] 检查 artifact 不含私有文档。
- [ ] 检查 artifact 不含 fixture、日志、凭证和本地数据。

## 4. 发布内容

- [ ] README 指向正确版本和公开文档。
- [ ] 网站与当前版本一致。
- [ ] 首页视频与当前 UI 一致。
- [ ] Changelog 完成。
- [ ] Release notes 完成。
- [ ] 已知限制完成。
- [ ] 升级和迁移说明完成。
- [ ] 所有公开页面使用英文正稿。

## 5. 回滚与恢复

- [ ] 记录上一稳定版本。
- [ ] 记录插件回滚方式。
- [ ] 记录数据迁移失败的恢复方式。
- [ ] 记录 Pages 网站回滚方式。
- [ ] 记录停止发布和撤下下载入口的方式。
- [ ] 确认 owner 能独立执行回滚。

## 6. 最终 Go / No-Go

- [ ] P0 清零。
- [ ] P1 已完成，或对应范围已移除/公开降级。
- [ ] Owner 已完成独立 Vault 全量 dogfood。
- [ ] 至少一位外部试用者完成核心流程。
- [ ] 所有公开主张具有真实版本和验收证据。
- [ ] 私有文档与 Git 历史风险已经处理。
- [ ] README、公开文档、贡献指南和数据说明已经完成。
- [ ] 产品默认语言、公开文案和 release artifact 已通过 English Default 与多语言配置验收。
- [ ] 网站与视频使用同一个版本真值。
- [ ] 最终模块化与代码边界梳理已经完成。
- [ ] Owner 已人工通读最终 first-party 文档与代码。
- [ ] Owner 能解释并维护核心代码和数据流。
- [ ] Owner 能执行发布失败回滚。

## 决策记录

- [ ] **Go**：所有闸门满足，允许创建最终 tag/release。
- [ ] **No-Go**：记录阻塞项、owner 和下一次复核时间。

## 完成条件

- [ ] Go / No-Go 结论明确。
- [ ] 若为 Go，最终 tag、release、网站和公开文档使用同一版本。
- [ ] 若为 No-Go，没有通过删除证据或降低验收标准强行上线。

## 不要做

- 不用“基本通过”掩盖发布阻塞。
- 不把已有 baseline failure 自动视为与发布无关。
- 不在最终 artifact 之外的开发环境完成唯一一次 smoke test。
