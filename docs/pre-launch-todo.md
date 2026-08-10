# Peak Assistant 上线前 TODO

> 状态：临时 owner 工作入口，不是公开文档。
>
> 目标：为首次公开上线或公开 Beta 提供任务顺序、优先级和最终闸门。
>
> 最后更新：2026-08-10。

## 使用规则

这份文件只维护任务入口和总体状态。具体范围、实施步骤、证据要求和完成条件放在各自任务文档中。

任务分成三个优先级：

- **P0 · 上线闸门**：未完成就不应公开上线。
- **P1 · Release Candidate 收口**：原则上应完成；若延后，必须公开说明限制或移除相关产品主张。
- **P2 · 可选任务**：记录下来，但不阻塞上线。

[Roadmap](roadmap.html) 是当前产品状态快照，[Progress Tracker](progress.md) 是历史流水。调研候选、远期 Backlog 和旧 Codex session 不能自动升级为上线任务。

## 执行顺序

### 范围与接管

- [ ] **P0** · [01 · 上线范围与历史任务审计](pre-launch/01-release-scope-and-task-audit.md)
  - 冻结首次公开版本。
  - 判决 Roadmap、Codex/Claude session、worktree 和历史任务。
- [ ] **P0/P1 · 持续工作** · [02 · Owner 代码接管与理解](pre-launch/02-owner-code-readiness.md)
  - 掌握核心 runtime、数据真值、验证与排障。
  - 每完成一个功能收口，同步完成该功能的代码走读。
- [ ] **P0/P1 · Owner 人工任务** · [10 · Owner 人工通读全部文档与代码](pre-launch/10-owner-manual-code-and-doc-reading.md)
  - Owner 主动阅读全部 first-party 文档与代码，不由 AI 摘要代替。
  - 优先核对 Landing Page，并保留相关 Codex 调研的直达链接。

### 公开材料准备

- [ ] **P0** · [03 · 公开仓库边界与英文化](pre-launch/03-public-repository-and-english.md)
  - 分离私有历史与公开内容。
  - 处理 Git 历史风险、发布包边界和英文扫描。
- [ ] **P0** · [04 · README 与公开文档包](pre-launch/04-public-documentation-package.md)
  - 建立用户文档、数据/SQL 文档和贡献指南。
  - 让 README 只承担定位、安装和导航。
- [ ] **P1 · 条件式宣传任务** · [11 · Landing Page 类比定位与主张门槛](pre-launch/11-landing-page-comparison-positioning.md)
  - 评估 `Your local-first Airtable` 与 `Cursor for your documents` 等类比话术。
  - 只有 Peak Sheet 与 Composer 对应能力完成并通过真实验收后才启用强主张。
- [ ] **P1 · 条件式宣传任务** · [12 · AI 生成 HTML 与图片产物管理定位](pre-launch/12-ai-generated-html-image-workspace-positioning.md)
  - 把 Codex、Claude Code 等工具生成的大量 HTML、mock、截图和图片，包装为可整理、关联和继续工作的本地项目材料。
  - 只有 HTML/Image File Workspace 真正交付并通过真实验收后才启用强主张。

### 真实使用验证

- [ ] **P0/P1** · [05 · 独立知识库完整 Dogfood](pre-launch/05-owner-dogfood.md)
  - Owner 在隔离 Vault 中批量使用全部公开功能。
  - 验证失败、恢复、持久化、升级和真实 Obsidian 交互。
- [ ] **P0/P1** · [06 · 网站内容与首页演示视频](pre-launch/06-website-and-demo-videos.md)
  - 对齐网站主张与 Release Candidate。
  - 在 UI 稳定后录制顺滑、无隐私问题的功能视频。
- [ ] **P0/P1** · [07 · 朋友试用与外部内容检查](pre-launch/07-external-beta.md)
  - 让未参与开发的人仅依靠公开材料完成核心任务。
  - 根据真实卡点修复产品、网站和文档。

### 发布

- [ ] **P0** · [08 · 发布工程与 Go / No-Go](pre-launch/08-release-and-go-no-go.md)
  - 验证最终 artifact、版本、License、内容和回滚。
  - P0 清零后才能创建最终 tag/release。

### 可选任务

- [ ] **P2 · 待决定是否执行** · [09 · GitHub Pages 自定义域名](pre-launch/09-github-pages-custom-domain.md)
  - 可以继续使用默认 Project Site URL。
  - 购买域名、DNS、HTTPS、metadata 更新和回滚步骤放在独立任务中。
  - 本任务不阻塞首次公开版本。

## 总体 Go / No-Go

- [ ] 首次公开版本的功能、平台和限制已经冻结。
- [ ] 所有历史 task/session 都有明确判决。
- [ ] Owner 完成独立 Vault 全量 dogfood。
- [ ] 至少一位外部试用者完成核心流程。
- [ ] 所有公开主张具有真实版本和验收证据。
- [ ] 私有文档与 Git 历史风险已经处理。
- [ ] README、公开文档、贡献指南和数据说明已经完成。
- [ ] 网站与视频使用同一个版本真值。
- [ ] Owner 已完成人工通读文档与代码任务。
- [ ] Owner 能解释并维护核心代码和数据流。
- [ ] Owner 能执行发布失败回滚。

## 明确不做

- 不把所有 Roadmap、Researching 和历史 session 都当成上线阻塞项。
- 不用 mock、source inspection 或绿色 build 冒充真实 Obsidian E2E。
- 不在 UI 和功能范围稳定前反复录制最终视频。
- 不在没有备份和 Git 历史方案时直接删除私有 `docs/`。
- 不为了清除中文而破坏多语言处理和中文用户内容支持。
- 不让自定义域名、远期功能或装饰性改进拖延可用版本上线。

## 临时文档边界

这组清单暂时保存在私有 `docs/` 中。公开仓库或公开文档站点上线前，需要将 `docs/pre-launch-todo.md` 与 `docs/pre-launch/` 移回私有工作区，或确保它们不进入公开发布快照。
