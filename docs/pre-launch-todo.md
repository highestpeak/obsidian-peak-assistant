# Peak Assistant 上线前 TODO

> 状态：临时 owner 工作入口，不是公开文档。
>
> 目标：为首次公开上线或公开 Beta 提供任务顺序、优先级和最终闸门。
>
> 最后更新：2026-08-24。

## 使用规则

这份文件只维护任务入口和总体状态。具体范围、实施步骤、证据要求和完成条件放在各自任务文档中。

任务分成三个优先级：

- **P0 · 上线闸门**：未完成就不应公开上线。
- **P1 · Release Candidate 收口**：原则上应完成；若延后，必须公开说明限制或移除相关产品主张。
- **P2 · 可选任务**：记录下来，但不阻塞上线。

[Roadmap](roadmap.html) 是当前产品状态快照，[Progress Tracker](progress.md) 是历史流水。调研候选、远期 Backlog 和旧 Codex session 不能自动升级为上线任务。

## 执行顺序

### 阶段一 · 范围冻结与剩余功能收口

- [ ] **P0 · 产品边界与历史保护** · V1 全线范围冻结、退役审计与裁剪前完整快照 Tag
  - V1 冻结为 General Search、Chat Studio、File Atlas、Composer、AI Search、AI Graph 六个核心能力，以及受限范围内的 Peak Sheet；从本裁决开始不新增一级产品概念。
  - Vault Intelligence 只保留 `Community Discovery → Hub Discovery → Hub Generation`；通用 Scan、Tag / Summary enrichment、评分、复杂 Findings / Work Queue、Split / Merge、单文档结构建议和自动重构不进入 V1。
  - 先完成全产品 surface / runtime / writer / persistence / shared-dependency 裁决矩阵；每项标记为 V1 Core、Supporting System、Merge Into Core、Hidden Compatibility 或 Retired。
  - 审阅并提交所有应保留的裁剪前基线，排除运行数据和临时产物；通过基线验证后创建 annotated Tag `archive/pre-v1-scope-cut-2026-08-24`，推送远端并验证 Tag 指向准确 commit。
  - Tag 是不可移动的历史保护点，不持续 rebase master，也不承担日常 V2 开发；未来真正启动 V2 时才从 Tag 新建分支。master 只承载 V1，裁剪先在独立工作分支完成并通过验收后再合入。
  - 退役顺序固定为：冻结公开承诺 → 取消入口和 runtime reachability → 验证六个核心能力与 Peak Sheet 不再依赖旧路径 → 停止旧 writer → 保留历史数据安全读取 → 删除无消费者代码和兼容链。
  - 本 P0 完成前，完整 Vault Scan 扩张、Scan 专属模型路由策略和其他未裁决产品面不得继续升级为上线任务。
- [ ] **P0** · [01 · 上线范围与历史任务审计](pre-launch/01-release-scope-and-task-audit.md)
  - 冻结首次公开版本。
  - 判决 Roadmap、Codex/Claude session、worktree 和历史任务。
- [ ] **P0 · 功能收口** · [16 · 剩余功能完成与 Release Candidate 冻结](pre-launch/16-remaining-feature-closure.md)
  - 只完成审计后明确进入首次公开版本的剩余功能、历史任务和真实验收。
  - 功能范围稳定后再开始 Landing Page、README 和公开材料定稿。
- [ ] **P2 · 范围判决** · Session 独立产品对象
  - 当前 Sessions 卡是 planned 占位，未实现数据合同、持久化、详情或动作；不能将现有 Chat、Project、Composer 或 activity session 计数挪作 Session 数字。
  - 在 Release Candidate 范围冻结时，明确决定其延后并保持“planned”，或补齐独立合同与真实验收后再纳入公开功能。
- [ ] **P1 · 模型基础设施** · [23 · 在线模型目录与能力证据收口](pre-launch/23-online-model-catalog-and-capability-registry.md)
  - 把当前 bundled catalog、未接线的 server sync 骨架和 Ollama 探测收口成可缓存、可回滚、可解释的统一目录。
  - 提供模型隐藏、别名、能力证据与新鲜度的唯一 AI & Models 管理入口，并为 Peak Hermes 提供 fail-closed capability gate。
- [ ] **P1 · 模型路由策略** · Scan 首次自动推荐的候选优先级
  - 为每类 Scan operation 建立 template-backed、可审计的候选优先级；优先级必须能表达 provider / model / capability、local 与 privacy 偏好、成本与用户设置，不能由 catalog 顺序或“第一个 Ready”隐式决定。
  - 生效顺序固定为：仍有效的上次成功 Scan 路由 → 明确的全局默认绑定 → 该优先级策略的可解释推荐 → 无匹配时说明原因并引导配置；用户手动覆写只作用于当前 operation。
  - 验收覆盖 Ollama、LM Studio、OpenRouter 和其他 profile：每次默认与降级都有证据，历史模型失效不会静默换成任意 Ready 模型。

### 阶段二 · Landing Page、README 与公开材料

- [ ] **P0** · [03 · 公开仓库边界与英文化](pre-launch/03-public-repository-and-english.md)
  - 分离私有历史与公开内容。
  - 处理 Git 历史风险、发布包边界，并把私有中文工作文档移出公开项目。
- [ ] **P0 · 大型语言收口** · [18 · English Default 与多语言配置收口](pre-launch/18-english-default-and-i18n-closure.md)
  - 所有产品自有的默认 UI、网站、错误提示、模板和公开文案使用英文。
  - 非英文只能进入明确的 locale/config 资源；保留中文内容处理、用户数据和多语言测试能力。
- [ ] **P0** · [04 · README 与公开文档包](pre-launch/04-public-documentation-package.md)
  - 建立用户文档、数据/SQL 文档和贡献指南。
  - 让 README 只承担定位、安装和导航。
- [ ] **P1 · 条件式宣传任务** · [11 · Landing Page 类比定位与主张门槛](pre-launch/11-landing-page-comparison-positioning.md)
  - 评估 `Your local-first Airtable` 与 `Cursor for your documents` 等类比话术。
  - 只有 Peak Sheet 与 Composer 对应能力完成并通过真实验收后才启用强主张。
- [ ] **P1 · 条件式宣传任务** · [12 · AI 生成 HTML 与图片产物管理定位](pre-launch/12-ai-generated-html-image-workspace-positioning.md)
  - 把 Codex、Claude Code 等工具生成的大量 HTML、mock、截图和图片，包装为可整理、关联和继续工作的本地项目材料。
  - 只有 HTML/Image File Workspace 真正交付并通过真实验收后才启用强主张。
- [ ] **P1 · 品牌宣传任务** · [19 · Peak Assistant 品牌宣传语与 AI Harness 定位](pre-launch/19-brand-tagline-and-peak-wordplay.md)
  - 评估 `Your personal assistant. Your Peak Assistant.` 与 `An AI harness, designed for your notes.` 两条品牌方向。
  - 将品牌记忆点、具体价值说明和功能证据分层，避免只剩一句无法解释产品的口号。
- [ ] **P1 · 本地 AI 宣传任务** · [24 · 本地大模型与 Gemma 4 能力宣传](pre-launch/24-local-model-gemma4-launch-positioning.md)
  - 重点展示本地模型如何完成真实笔记工作，而不只展示 Ollama 连接或模型列表。
  - 以 Gemma 4 为主要案例，按设备、workload 和能力证据收窄公开主张。

### 阶段三 · 稳定版本验证与公开材料定稿

- [ ] **P0/P1** · [05 · 独立知识库完整 Dogfood](pre-launch/05-owner-dogfood.md)
  - Owner 在隔离 Vault 中批量使用全部公开功能。
  - 验证失败、恢复、持久化、升级和真实 Obsidian 交互。
- [ ] **P0/P1 · Composer 条件式验收** · [20 · Composer 同一 Session 多文件与混合文件类型验收](pre-launch/20-composer-multi-file-mixed-file-session-qa.md)
  - 验证同一个 Composer task session 能显式纳入、导航并编辑多个文件，而不是用多个独立 session 拼出结果。
  - 覆盖最终公开支持的混合文件类型、逐文件授权、审阅、冲突和恢复；能力缺失时回到任务 16 收口或收窄主张。
- [ ] **P0/P1** · [06 · 网站内容与首页演示视频](pre-launch/06-website-and-demo-videos.md)
  - 对齐网站主张与 Release Candidate。
  - 在 UI 稳定后录制顺滑、无隐私问题的功能视频。
- [ ] **P1 · Graph 重点宣传任务** · [21 · Graph 多视图能力宣传与切换演示](pre-launch/21-graph-multi-view-launch-showcase.md)
  - 把 Graph 作为核心能力展示，并解释不同视图各自帮助用户看见什么。
  - 用真实产品视频展示 scope、layout、lens 和 semantic relation 的切换效果，不用单张静态截图代替。
- [ ] **P1 · 原生画布宣传任务** · [23 · Canvas 与 Excalidraw AI 原生编辑宣传与演示](pre-launch/23-canvas-excalidraw-native-ai-editing-showcase.md)
  - 展示 AI 对 Canvas 节点/连线和 Excalidraw 元素执行可审阅的原生结构修改，而不只是生成图片或描述画布。
  - 通过真实指令、typed candidate、accept 和原文件重开证明修改成立；只宣传当前实际支持的操作。
- [ ] **P0/P1 · 最终产品叙事** · [22 · Final Demo 与 One Continuous Context 场景](pre-launch/22-final-demo-continuous-context-story.md)
  - 用一个自然的真实任务贯穿几乎所有公开核心操作，而不是制作互不相干的功能巡礼。
  - 重点证明同一上下文能从 AI Search 延续到 Graph、File Atlas 和 Composer，并最终形成可审阅的成果。
- [ ] **P0/P1** · [07 · 朋友试用与外部内容检查](pre-launch/07-external-beta.md)
  - 让未参与开发的人仅依靠公开材料完成核心任务。
  - 根据真实卡点修复产品、网站和文档。

### 阶段四 · 最终模块化与 Owner 接管

- [ ] **P1 · 最终架构收口** · [17 · 最终模块化与代码边界梳理](pre-launch/17-final-modularity-and-boundary-review.md)
  - 在功能、Landing Page、README、Dogfood 和朋友试用完成后，再检查模块边界、重复 runtime、旧路径和高风险耦合。
  - 只做有证据、可完整复测的必要收口，不在最后阶段重新展开产品范围。
- [ ] **P0/P1 · Owner 接管任务** · [02 · Owner 代码接管与理解](pre-launch/02-owner-code-readiness.md)
  - 基于稳定的 Release Candidate 掌握核心 runtime、数据真值、验证与排障。
  - 确认 Owner 能独立评审 AI 生成的改动和处理发布故障。
- [ ] **P0/P1 · Owner 人工任务** · [10 · Owner 人工通读全部文档与代码](pre-launch/10-owner-manual-code-and-doc-reading.md)
  - 在最终模块化和公开材料定稿后，Owner 主动阅读全部 first-party 文档与代码。
  - AI 摘要不能代替原文阅读；相关 Codex 调研链接只作为跳转入口。

### 阶段五 · 发布

- [ ] **P0** · [08 · 发布工程与 Go / No-Go](pre-launch/08-release-and-go-no-go.md)
  - 验证最终 artifact、版本、License、内容和回滚。
  - P0 清零后才能创建最终 tag/release。

### 宣传发布与反馈运营

- [ ] **P1 · 社区基础设施** · [13 · Discord 社区搭建](pre-launch/13-discord-community-setup.md)
  - 建立公告、入门、支持、反馈和作品分享的长期社区入口。
  - 首期保持精简并由 Owner 人工管理，不提前引入复杂机器人和自动化。
- [ ] **P1 · 多渠道宣传任务** · [14 · 社区与平台发布计划](pre-launch/14-community-launch-distribution.md)
  - 为 Dev.to、Obsidian 社区、Product Hunt、小红书、Reddit 等渠道分别准备原生内容。
  - 记录渠道规则、发布节奏、素材、CTA 和最终帖子链接，避免无差别复制粘贴。
- [ ] **P1 · 持续运营任务** · [15 · 人工反馈监控与回流](pre-launch/15-manual-feedback-monitoring.md)
  - 暂时由 Owner 手动巡检各平台、Discord、GitHub 和网站反馈。
  - 将问题分类后回流到产品、代码、网站、文档或宣传修正任务。

### 可选任务

- [ ] **P2 · 待决定是否执行** · [09 · GitHub Pages 自定义域名](pre-launch/09-github-pages-custom-domain.md)
  - 可以继续使用默认 Project Site URL。
  - 购买域名、DNS、HTTPS、metadata 更新和回滚步骤放在独立任务中。
  - 本任务不阻塞首次公开版本。

## 总体 Go / No-Go

- [ ] 裁剪前完整基线已经提交、验证，并由远端 annotated Tag 锁定；本地与远端 Tag 指向同一 commit。
- [ ] 每个非 V1 surface、runtime、writer、持久化输出和历史数据读取路径都有明确裁决，没有仅靠隐藏 UI 冒充退役。
- [ ] master 上的 V1 不再依赖已退役产品路径；未来 V2 只能从完整快照 Tag 显式创建，不通过长期 V2 分支整体 rebase master。
- [ ] 首次公开版本的功能、平台和限制已经冻结。
- [ ] 所有历史 task/session 都有明确判决。
- [ ] 所有纳入首次公开版本的剩余功能已经完成并通过对应验收。
- [ ] Owner 完成独立 Vault 全量 dogfood。
- [ ] 至少一位外部试用者完成核心流程。
- [ ] 所有公开主张具有真实版本和验收证据。
- [ ] 私有文档与 Git 历史风险已经处理。
- [ ] 默认产品语言和所有公开正稿为英文，非英文资源具有明确配置边界。
- [ ] README、公开文档、贡献指南和数据说明已经完成。
- [ ] 网站与视频使用同一个版本真值。
- [ ] 最终模块化与代码边界梳理已经完成，没有借收口重新扩大功能范围。
- [ ] Owner 已完成人工通读文档与代码任务。
- [ ] Owner 能解释并维护核心代码和数据流。
- [ ] Owner 能执行发布失败回滚。

## 明确不做

- 不在完整基线 commit、验证和远端 Tag 建立前物理删除产品代码或历史数据。
- 不维护一个持续整体 rebase master 的长期 V2 分支；V1 删除提交不得反复污染完整产品历史。
- 不把“移动到另一个分支”理解为复制文件或维护两套共享底座；Tag 保存完整历史，V1 通过可验证退役收缩。
- 不把所有 Roadmap、Researching 和历史 session 都当成上线阻塞项。
- 不用 mock、source inspection 或绿色 build 冒充真实 Obsidian E2E。
- 不在 UI 和功能范围稳定前反复录制最终视频。
- 不在没有备份和 Git 历史方案时直接删除私有 `docs/`。
- 不为了清除中文而破坏多语言处理和中文用户内容支持。
- 不让自定义域名、远期功能或装饰性改进拖延可用版本上线。

## 临时文档边界

这组清单暂时保存在私有 `docs/` 中。公开仓库或公开文档站点上线前，需要将 `docs/pre-launch-todo.md` 与 `docs/pre-launch/` 移回私有工作区，或确保它们不进入公开发布快照。
