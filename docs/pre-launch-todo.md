# Peak Assistant 上线前 TODO

> 状态：临时 owner 工作清单，不是公开文档，也不代表所有条目都已承诺实施。
>
> 目标：为首次公开上线或公开 Beta 建立统一收口顺序。
>
> 最后更新：2026-08-10。

## 怎么使用这份清单

任务分成三个优先级：

- **P0 · 上线闸门**：未完成就不应公开上线。
- **P1 · Release Candidate 收口**：原则上应完成；若延后，必须公开说明限制或移除相关产品主张。
- **P2 · 可选决策**：记录下来，但不阻塞上线。

[Roadmap](roadmap.html) 是当前产品状态快照，[Progress Tracker](progress.md) 是历史流水。Roadmap 中的调研候选、远期 Backlog 和旧 Codex session 不能自动升级为上线任务。

上线前只继续完成以下工作：

- 已经进入首次公开版本范围的能力；
- 阻塞真实用户完成核心流程的问题；
- 与隐私、数据安全、发布内容真实性有关的问题；
- 上线所需的验证、文档、演示和发布工程。

## 0. 冻结首次公开版本

### P0 · 确定上线承诺

- [ ] 明确本次是公开 Beta、正式版还是仅邀请试用。
- [ ] 冻结首次公开版本包含的功能清单。
- [ ] 为每项功能写一句对外能力主张，避免继续扩充功能边界。
- [ ] 标出需要联网、Provider API key、付费调用或额外系统依赖的能力。
- [ ] 明确桌面端、移动端、操作系统和 Obsidian 版本支持范围。
- [ ] 明确已知限制、暂不支持的流程和上线后再做的事项。
- [ ] 范围冻结后，除 P0/P1 问题外不再添加新功能。

### 完成条件

- [ ] 网站、README、视频和公开文档只介绍冻结清单中的能力。
- [ ] 每项公开主张都能对应到当前版本中的可达入口和真实验证证据。
- [ ] 无法完成真实验证的能力被移出主宣传路径，或明确标记为 Preview / In development。

## 1. 清理 Roadmap、Codex session 和历史任务

### P0 · 建立唯一的上线任务清单

- [ ] 盘点 `docs/roadmap.html` 中所有已决策待建项。
- [ ] 盘点 `docs/progress.md` 中仍写着 pending、未验证或未完成的历史项。
- [ ] 盘点尚未结束的 Codex task、Codex session、Claude Code session、隔离 worktree 和未合并分支。
- [ ] 检查是否存在未提交、未 cherry-pick、只在 worktree 中完成或已经失去 owner 的实现。
- [ ] 检查完成过代码但仍缺真实 Obsidian 交互验收的任务。

每个遗留项必须被判成以下一种状态：

- [ ] 上线阻塞，必须完成。
- [ ] 已实现，只缺 owner 真机验收。
- [ ] 已实现，只缺文档、视频或网站同步。
- [ ] 已被新实现或新产品归属替代。
- [ ] 仅调研，不进入首次公开版本。
- [ ] 重复、失效或不再需要，可以关闭。
- [ ] 需要 owner 决策，暂时不能实施。

### 完成条件

- [ ] 不再存在“看起来没完成，但不知道是否还要做”的 session。
- [ ] 所有 task/worktree 都有明确 owner、状态和下一步。
- [ ] 不为了上线而完成全部 Researching 或远期 Backlog。

## 2. Owner 代码接管与理解

这是一条贯穿整个上线周期的持续工作，不应留到最后集中处理。目标不是记住每一行代码，而是能够解释、诊断、评审和安全修改核心流程。

### P0 · 掌握系统主干

- [ ] 能解释插件启动、依赖组装、View 注册和命令注册流程。
- [ ] 能解释 Chat、Vault Search、AI Search、Composer、File Atlas、Graph 和 Settings 的主要入口。
- [ ] 能说明一次 AI 请求如何从 UI 到 Provider，再回到持久化与 UI。
- [ ] 能说明索引、搜索、Graph 和文档读写之间的关系。
- [ ] 能区分 canonical JSON/JSONL、SQLite projection、索引、缓存和 telemetry。
- [ ] 能找到配置、模板、权限、错误处理、日志和迁移入口。
- [ ] 能独立运行 focused tests、全量测试、生产构建和插件 reload。
- [ ] 能根据错误现象找到首个排查文件和相关测试。

### P1 · 建立模块级阅读闭环

对首次公开版本中的每个主要功能，完成一次代码走读：

- [ ] 用户入口与 UI owner。
- [ ] runtime/service owner。
- [ ] 读取和写入的数据。
- [ ] 外部依赖和 Provider 调用。
- [ ] 失败、取消、重试和恢复路径。
- [ ] 对应测试及真实 Obsidian 验证方法。

### 完成条件

- [ ] Owner 可以不依赖 Codex/Claude Code 解释核心数据流。
- [ ] Owner 可以审核 AI 生成的改动是否破坏既有架构和数据边界。
- [ ] Owner 可以独立完成常见故障定位、回滚和小范围修复。

## 3. 私有历史与公开文档分离

### P0 · 先处理公开边界

- [ ] 盘点当前 `docs/` 中的内容，分别标为公开、私有、历史、过期或待重写。
- [ ] 确认 Codex/Claude handoff、内部审计、产品决策、个人计划和历史 session 不进入公开文档站点。
- [ ] 选择一个新的公开文档目录，从公开读者需求重新组织内容。
- [ ] 确认 GitHub Pages、README、仓库链接和发布包不再把读者导向私有 `docs/`。
- [ ] 检查 npm/package/release artifact 是否会包含内部文档或测试资料。
- [ ] 在删除或迁移当前 `docs/` 前保留可靠的私有备份和访问方式。
- [ ] 公开前将本临时清单移入私有工作区，或确保它不进入公开仓库/发布快照。

### P0 · Git 历史隐私检查

仅从当前目录删除文件不会清除 Git 历史。公开仓库前必须选择并验证一种方案：

- [ ] 保留现有私有仓库，创建干净的公开仓库或发布快照。
- [ ] 对现有仓库执行经过审查的历史清理。
- [ ] 证明历史内容可以公开，因此只需要调整当前目录和发布内容。

### 完成条件

- [ ] 公开仓库、Git 历史、Pages 站点和发布包中不存在不应公开的历史材料。
- [ ] 新公开文档目录只包含用户、贡献者和维护者真正需要的内容。
- [ ] 网站当前指向 `master/docs` 的 Docs 链接已经切换到新的公开文档入口。

## 4. 英文化与公开文本审计

### P0 · 必须英文化的范围

- [ ] 产品 UI、命令、Notice、错误信息和 Settings。
- [ ] 默认模板、演示数据、空状态和错误恢复文案。
- [ ] README、公开文档、网站、视频字幕和截图中的文字。
- [ ] 公开的配置说明、Provider 说明、隐私说明和贡献指南。

### P1 · 有意保留的非英文内容

以下内容不能为了“源码零中文”而盲目删除：

- [ ] 多语言搜索、语言检测和中文处理规则。
- [ ] 明确用于国际化能力的测试 fixture。
- [ ] 用户自己的 Vault 内容和迁移样例。
- [ ] 保留在私有空间、不随产品公开的 owner 工作文档。

### 完成条件

- [ ] 对公开代码与内容执行一次中文扫描。
- [ ] 每个保留命中都进入小型 allowlist，并说明其功能性理由。
- [ ] 产品实际支持中文与“产品默认公开语言为英文”没有被混为一谈。

## 5. README 与公开文档包

### P0 · README

- [ ] 一句话产品定位与目标用户。
- [ ] 当前真实可用的核心能力。
- [ ] 安装、首次配置和快速开始。
- [ ] Provider、API key、费用和数据发送边界。
- [ ] 平台支持、已知限制和项目状态。
- [ ] 演示视频或截图。
- [ ] 公开文档、问题反馈和贡献入口。
- [ ] License、隐私和安全说明入口。

### P0 · 用户文档

- [ ] 安装与升级。
- [ ] 首次启动和 Provider 配置。
- [ ] 每项公开功能的详细说明。
- [ ] 常见工作流和功能间 handoff。
- [ ] 故障排查、FAQ 和已知限制。
- [ ] 数据存储、同步、删除和恢复说明。
- [ ] Provider 请求内容、成本和隐私边界。

### P0 · 数据和 SQL 文档

SQL 表说明不能暗示 SQLite 是所有数据的事实源。文档需要同时说明：

- [ ] 每类数据的 canonical carrier。
- [ ] JSON/JSONL 的 owner、路径、生命周期和同步策略。
- [ ] SQLite 数据库和表的用途、关键字段、关系和写入方。
- [ ] 哪些 SQLite 表属于可重建 projection、索引、缓存或 telemetry。
- [ ] schema 版本、迁移、quarantine、保留和删除规则。
- [ ] 哪些数据会进入 Peak knowledge index。
- [ ] 哪些内容可能发送给外部 AI Provider。

参考当前治理真值：[Generated Artifact Registry](conventions/generated-artifact-registry.md)。

### P0 · 贡献指南

- [ ] 开发环境、安装依赖和本地启动。
- [ ] 目录结构与四层架构边界。
- [ ] 构建、focused tests、全量测试和真实 Obsidian QA。
- [ ] 代码、配置、模板、UI 和持久化规则。
- [ ] Issue、branch、commit 和 Pull Request 流程。
- [ ] 如何添加 Provider、功能、命令、持久化 writer 和公共按钮组件。
- [ ] 隐私、安全、测试 fixture 和敏感信息规则。
- [ ] 哪些内部/private 文档不接受进入公开仓库。

### 完成条件

- [ ] 新用户只依靠 README 和公开文档就能完成第一次成功使用。
- [ ] 新贡献者不依赖私聊即可构建、测试并提交小改动。
- [ ] 文档描述与当前 Release Candidate 一致，不把 spec、mock 或测试当成已发布行为。

## 6. 独立知识库完整 dogfood

### P0 · 测试环境

- [ ] 创建与日常开发 Vault 隔离的全新知识库。
- [ ] 使用不包含私人信息、但接近真实使用规模的测试材料。
- [ ] 记录 Obsidian 版本、插件版本、主题、系统、Provider 和模型。
- [ ] 分别覆盖空 Vault、小型 Vault 和有一定规模的 Vault。
- [ ] 从干净安装开始，不复用开发环境残留设置。

### P0 · 核心流程

- [ ] 安装、启用、首次启动和 onboarding。
- [ ] Provider、模型、API key、索引深度和权限配置。
- [ ] Chat Studio 的普通对话、Agent、资源、取消、恢复和历史。
- [ ] Vault Search 的主要模式、导航、预览和打开文件。
- [ ] AI Search 的计划、工具调用、报告、来源、历史和失败恢复。
- [ ] Composer 的编辑、AI action、历史、切换文档和异常恢复。
- [ ] File Atlas 的文档关系、文件类型、过滤、跳转和 Composer handoff。
- [ ] Graph、Vault Intelligence、Command Center 和 Settings 中承诺公开的流程。
- [ ] 所有网站和 README 中出现的功能。

### P1 · 可靠性与边界

- [ ] 空状态、错误 API key、网络失败、Provider 不可用和额度不足。
- [ ] 取消、重试、重复点击、并发 session 和插件 reload。
- [ ] Obsidian 重启后的数据恢复。
- [ ] 老版本升级、legacy 数据读取和迁移保护。
- [ ] Markdown、图片、PDF、表格和其他公开声称支持的文件类型。
- [ ] 大文档、大 Vault、长时间使用和索引期间的内存/响应表现。
- [ ] 本地数据、同步数据、外部 Provider 数据和删除行为。

### 缺陷记录规则

每个问题至少包含：

- [ ] 测试环境和版本。
- [ ] 复现步骤。
- [ ] 预期结果与实际结果。
- [ ] 严重度：P0、P1、P2 或观察项。
- [ ] 截图、视频、DOM/日志或数据证据。
- [ ] 修复后的复测结果。

真实 Obsidian 验证遵循 [Obsidian Real-UI QA](conventions/obsidian-real-ui-qa.md)。旧的 [Manual Testing Checklist](90-old-root-docs/manual-testing-checklist.md) 只能作为历史候选池，不能直接当作当前功能真值；Chat 可参考 [Chat Studio Capability Checklist](testing/chat-studio-capability-checklist.md) 后再对照当前源码和 UI 更新测试范围。

### 完成条件

- [ ] Owner 连续完成所有公开核心流程，没有 P0 问题。
- [ ] P1 问题已修复，或对应功能/主张从首次公开版本移除。
- [ ] 所有交互结论都有真实 Obsidian 证据；mock、source inspection 和 build 不冒充 E2E。

## 7. 网站与首页视频

### P0 · 网站内容真值

- [ ] 网站每条能力主张映射到冻结功能清单。
- [ ] 区分 Current source、Preview / QA closing、In development 和 Research direction。
- [ ] 移除无法从当前 Release Candidate 到达或验证的主张。
- [ ] 检查安装、Docs、GitHub、隐私、贡献和问题反馈链接。
- [ ] 将当前指向私有 `docs/` 的链接替换为新的公开文档入口。
- [ ] 检查 Open Graph、Twitter card、favicon、分享图片和 canonical URL。
- [ ] 让实际试用者检查网站内容是否与产品体验一致。

### P1 · 首页功能视频

每个视频先固定以下内容：

- [ ] 对应的产品主张。
- [ ] 起始状态、操作脚本和成功结果。
- [ ] 使用的独立演示 Vault 和无私人信息 fixture。
- [ ] 录制窗口、主题、缩放、分辨率和鼠标样式。
- [ ] 目标时长、字幕、剪辑节奏和失败重录条件。
- [ ] 对应公开文档链接。

视频达到以下标准才算完成：

- [ ] 无等待事故、鼠标乱找、调试面板或无关窗口。
- [ ] 无私人 Vault 内容、API key、账号和通知泄露。
- [ ] UI、主题、窗口大小和字幕风格一致。
- [ ] 功能入口、过程和结果都能被第一次看到的人理解。
- [ ] 网站文案、视频和当前发布版本完全一致。
- [ ] 视频在真实线上页面完成一次播放、加载和移动端基础检查。

### 完成条件

- [ ] 首页所有视频顺滑、清晰、无隐私问题。
- [ ] 视频不依赖只有开发者环境才存在的状态。
- [ ] 网站、视频、README 和公开文档使用同一个版本真值。

## 8. 朋友试用与外部内容检查

### P0 · 独立试用

- [ ] 选择至少一位没有参与开发的朋友。
- [ ] 让试用者只根据公开 README/文档完成安装和首次配置。
- [ ] 准备 3–5 个代表核心价值的真实任务，不现场提示具体点击路径。
- [ ] 记录第一次成功所需时间、卡点、误解、错误和放弃点。
- [ ] 记录对隐私、费用、Provider、数据位置和可信度的疑问。
- [ ] 观察试用者是否能从错误中自行恢复。

### P1 · 网站与文档审查

- [ ] 试用产品以后，再让同一试用者检查网站功能介绍。
- [ ] 检查网站是否夸大、遗漏前提或使用内部术语。
- [ ] 检查 README 是否足够完成首次成功。
- [ ] 检查详细文档是否能解决试用中真实出现的问题。
- [ ] 检查贡献指南是否能让技术读者找到正确入口。

### 完成条件

- [ ] 试用者不依赖 owner 口头指导即可完成核心流程。
- [ ] 外部试用暴露的 P0/P1 问题已修复并复测。
- [ ] 无法立即修复的问题已变成公开限制，或相关功能退出首次公开版本。

## 9. 发布工程与最终闸门

### P0 · 发布准备

- [ ] 确定版本号、release channel、发布日期和支持范围。
- [ ] 运行 focused tests、全量测试、TypeScript 检查和生产构建。
- [ ] 区分本次回归与既有 baseline failure，不能用“基本通过”掩盖阻塞。
- [ ] 用最终发布包在干净 Vault 安装并完成 smoke test。
- [ ] 检查 manifest、版本、依赖、License、NOTICE 和第三方资源。
- [ ] 检查 release artifact 不包含私有文档、fixture、日志、凭证或本地数据。
- [ ] 准备 changelog、已知限制、升级说明和回滚方案。
- [ ] 创建最终 tag/release 前确认网站、视频和文档已经指向相同版本。

### 最终 Go / No-Go

- [ ] P0 清零。
- [ ] P1 已完成，或对应范围已移除/公开降级。
- [ ] Owner 已完成独立 Vault 全量 dogfood。
- [ ] 至少一位外部试用者完成核心流程。
- [ ] 所有公开主张具有真实版本和验收证据。
- [ ] 私有文档与 Git 历史风险已经处理。
- [ ] README、公开文档、贡献指南、数据说明和网站均为英文正稿。
- [ ] Owner 能解释并维护核心代码和数据流。

## 10. P2 · GitHub Pages 自定义域名候选

### 当前状态

GitHub Pages 对 Project Site 的默认地址结构是：

```text
https://<owner>.github.io/<repository>/
```

因此当前默认地址为：

```text
https://highestpeak.github.io/obsidian-peak-assistant/
```

这不是博客专属域名，也不要求上线前必须购买独立域名。保持默认地址不会阻塞首次公开版本。

本仓库通过 `.github/workflows/pages.yml` 使用 GitHub Actions 发布 `website/`。可见页面资源大多使用相对路径，但 `website/index.html` 中的 `og:url`、`og:image` 和 `twitter:image` 当前仍写死默认 Pages 地址；如果切换域名，需要同步更新并验证分享预览。

### 待决策

- [ ] 继续使用默认 Project Site URL。
- [ ] 使用子域名，例如 `peak.<domain>` 或 `assistant.<domain>`。
- [ ] 购买并使用独立根域名。
- [ ] 决定域名购买、续费、DNS 和账号恢复的长期 owner。

若已有其他网站使用同一根域名，优先考虑独立子域名。只有在品牌、可信度或未来网站结构确实需要时再配置，不为“看起来更正式”阻塞发布。

### 如果选择子域名

- [ ] 购买或选定具体域名和 DNS 服务商。
- [ ] 先在 GitHub 验证自定义域名，降低域名接管风险。
- [ ] 在仓库 **Settings → Pages → Custom domain** 填入完整子域名。
- [ ] 在 DNS 中创建 CNAME：名称为子域名前缀，目标为 `highestpeak.github.io`。
- [ ] CNAME 目标不附加 `/obsidian-peak-assistant`。
- [ ] 不使用 `*.example.com` 这类 wildcard DNS 记录。
- [ ] 使用 `dig` 或 DNS 服务商工具确认记录生效。
- [ ] DNS 生效后开启 **Enforce HTTPS**。
- [ ] 验证默认 Pages URL 到自定义域名的跳转。
- [ ] 更新并验证 Open Graph、Twitter card、canonical、站内链接和分享图片 URL。
- [ ] 验证首页、所有资源、深链接、刷新、HTTPS 和社交分享预览。

GitHub Actions 发布模式不需要在 `website/` 中维护 `CNAME` 文件。GitHub 官方说明：自定义 Actions workflow 不会创建该文件，现有 `CNAME` 也会被忽略。

### 如果选择根域名

- [ ] 在 GitHub Pages 中配置根域名。
- [ ] 根据 DNS 服务商能力配置 `ALIAS`、`ANAME` 或 GitHub Pages 的 `A` 记录。
- [ ] 如需 IPv6，再配置官方 `AAAA` 记录，并保留 `A` 记录。
- [ ] 评估是否同时配置 `www`，并验证 HTTPS 与重定向。

### 完成条件

- [ ] 决策结果明确记录为“保留默认 URL”或“启用具体域名”。
- [ ] 若启用域名，DNS、HTTPS、跳转、资源、metadata 和分享预览全部通过线上验证。
- [ ] 域名未决定时，本项保持 P2，不影响默认 GitHub Pages 地址上线。

### 官方参考

- [GitHub Pages 的站点类型与默认 URL](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
- [管理 GitHub Pages 自定义域名](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [排查 GitHub Pages 自定义域名](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages)

## 明确不做

- [ ] 不把所有 Roadmap、Researching 和历史 session 都当成上线阻塞项。
- [ ] 不用 mock、source inspection 或绿色 build 冒充真实 Obsidian E2E。
- [ ] 不在 UI 和功能范围稳定前反复录制最终视频。
- [ ] 不在没有备份和 Git 历史方案时直接删除私有 `docs/`。
- [ ] 不为了清除中文而破坏多语言处理和中文用户内容支持。
- [ ] 不让自定义域名、远期功能或装饰性改进拖延可用版本上线。
