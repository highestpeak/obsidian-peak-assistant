<div align="center">

<p><a href="README.md">English</a></p>

# Peak Assistant

### 让整个 Vault 真正连接起来。

Peak Assistant 是为 Obsidian 设计的证据感知 AI 工作台：搜索并绘制知识图谱、发现 Hub 与 Gap、用 Copilot 写作、运行项目对话、生成媒体，并把不同 AI 任务路由到你选择的 Provider，同时不放弃 Markdown 所有权。

[![开发预览](https://img.shields.io/badge/状态-开发预览-c98225?style=flat-square)](#项目状态)
[![Obsidian 桌面端](https://img.shields.io/badge/Obsidian-仅桌面端-7c3aed?style=flat-square)](https://obsidian.md/)
[![GPL-3.0](https://img.shields.io/badge/许可-GPL--3.0-2d6a4f?style=flat-square)](LICENSE)

**[项目页](https://highestpeak.github.io/obsidian-peak-assistant/)** · **[快速开始](#快速开始)** · **[项目文档](docs/index.html)** · **[路线图](docs/roadmap.html)**

</div>

![File Atlas 图谱设计：当前笔记与它的局部知识邻域](website/assets/file-atlas-graph-preview.webp)

<p align="center"><sub>File Atlas 设计参考图。Graph 模式已存在于当前源码，真实 Obsidian 交互 QA 仍在收口。</sub></p>

> [!IMPORTANT]
> Peak Assistant 当前处于开发预览阶段，尚未提供官方二进制包，也尚未进入 Obsidian Community Plugins。现阶段面向早期用户和贡献者的安装方式是从源码构建。

## 为什么是 Peak Assistant

大多数 AI 工具只是增加一个聊天框。Peak Assistant 连接的是 Vault 周围的整套工作：

- **看见整个 Vault，而不只是一列结果。** 在 Search Graph、File Atlas 邻域、语义边、Hub、Gap、Bridge 与版本化 AI Graph artifact 之间继续探索。
- **让证据始终跟着结论。** AI Search 把运行过程、报告和来源列表分开呈现，你可以检查哪些笔记真正影响了结果。
- **把知识结构变成行动。** Vault Intelligence 会发现 Hub、结构洞、缺失链接、陈旧 Cluster、脆弱 Bridge、孤立笔记与维护机会。
- **在源文件所在的位置继续。** 把证据带进 Peak Composer、Chat Studio、File Atlas 或持久 artifact。
- **自己决定模型与边界。** 把文本、Agent、Embedding、Rerank、图片、视频、音乐与语音任务路由到本地或云端 Provider。

核心闭环只有一条：

```text
提出任务 → 搜索 → 检查证据 → 探索图谱 → 进入 Composer 或 Chat
```

<table>
  <tr>
    <td width="50%"><img src="website/assets/ai-search-report.webp" alt="包含执行摘要和证据章节的 AI Search 报告"></td>
    <td width="50%"><img src="website/assets/ai-search-sources.webp" alt="列出报告所使用 Vault 笔记的 AI Search 来源视图"></td>
  </tr>
  <tr>
    <td><b>结果</b> — 在同一个工作区阅读结构化报告。</td>
    <td><b>证据</b> — 不丢失本次运行，直接回看精确来源集合。</td>
  </tr>
</table>

## Peak 完整能力地图

| 系统 | 它负责什么 | 当前成熟度 |
| --- | --- | --- |
| **Vault Search + AI Search** | 全文、模糊、向量、Metadata、PPR 与 Co-citation 检索；List、Tree、Graph；Query Parser、报告、来源与 Chat handoff | 当前源码已有 |
| **File Atlas** | 工作文件 rail、文档结构、Heading、Block、Link、Resource、局部邻域与 reveal-to-editor | Preview / 真实 QA 收口中 |
| **Knowledge Graph** | Search Result Graph、Atlas Graph、语义边、方向、Community、Evidence 与不可变 AI Graph 历史 | 基础能力已有；交互 QA 收口中 |
| **Vault Intelligence** | 发现 Hub、Gap、结构洞、缺失 Backlink、陈旧 Hub、脆弱 Bridge、孤立笔记、废弃 Cluster 与 Drift | 当前源码已有 |
| **Peak Composer + Copilot** | 无损 Markdown 编辑、选区/Block/文档 AI、原生对象、Candidate、Receipt、History 与 Intelligence | Preview；数据与 QA 继续收口 |
| **Chat Studio** | Project、Conversation、Assistant、Resource、Artifact、Attachment、Branch 与长运行 Agent 工作 | 当前源码已有 |
| **Command Center + Home** | 面向 File、Workspace、Bookmark、Dashboard 与分组 Peak Action 的精选 Launcher | Build 已验证；真实 QA 待完成 |
| **AI Control Center + My Content** | Action 级模型、Tool、Approval、Budget、Output 与保存内容治理 | 开发中 |
| **图片、视频、音乐与语音** | 图片生成/编辑与 Mask、异步 Video/Music/TTS，以及 Audio/Video 理解 | 路径已构建；付费 Provider 验证未完整 |
| **Multi-provider AI Platform** | Provider Profile、角色路由、Embedding、Rerank、Peak Harness、MCP、Skill、Permission、Budget 与 Trace | 当前源码已有 |
| **Peak Sheet** | Spreadsheet、Dataset、ComputePlan、AI Formula、Chart、View 与 revision-safe 更新 | 研究候选；尚无 Dataset runtime |
| **Operations** | Onboarding、Fast/Semantic/Full Index、Usage Dashboard、成本控制、存储治理与 Debug Receipt | 当前源码已有 |

### Graph 是一等工作空间

Peak 不会把所有关系压扁成同一种边。Graph 方向会明确区分物理链接、语义关系、Co-citation、Evidence、Community、Direction、Hub 与 Gap：

- **Search Result Graph**：把一次结果集变成可导航的证据地图。
- **File Atlas Graph**：探索一跳/两跳邻域、多种 Layout、Link Direction 与 Semantic Toggle。
- **Vault Intelligence Graph**：暴露结构洞、脆弱 Bridge、废弃 Cluster、缺失 Backlink 与 Review 机会。
- **AI Graph Artifact**：保存不可变、带 Parent 历史和 Evidence Edge 的 Graph Version，SQLite 只是可重建投影。
- **Advanced Graph 研究**：继续探索 Nebula、Source–Sink 与 Vault Intelligence “Healing Ray” Overlay；这些是研究方向，不是已交付声明。

<table>
  <tr>
    <td width="50%"><img src="website/assets/chat-studio-preview.webp" alt="包含会话、资源和上下文 Composer 的 Chat Studio 设计"></td>
    <td width="50%"><img src="website/assets/command-center-preview.webp" alt="包含最近文件和分组 Action 的 Command Center 与 Home 设计"></td>
  </tr>
  <tr>
    <td><b>Chat Studio</b> — 项目对话、资源、Artifact、Agent 与媒体工作。</td>
    <td><b>Command Center + Home</b> — 与原生 Cmd/Ctrl+P 并存的精选空间 Launcher。</td>
  </tr>
</table>

### 后续能力

路线图会让未来系统可见，但不会把它们伪装成已经发布的功能：

- **当前收口：** AI Control Center + My Content、Provider Capability Gateway、Composer Intelligence、Command Center 真实交互验收，以及 Chat/Media Provider 验证。
- **已设计方向：** 面向 Image/HTML/PDF 的 Peak File Workspace、共享键盘导航系统、Ambient Current Work State 与存储治理闭环。
- **研究地平线：** Peak Sheet、Advanced Graph、Peak Share、外部来源同步、Context Inspector、Conversation Intelligence，以及本地 Workflow/Template/Focus 系统。

实际可用能力取决于你的配置。Provider 驱动的 AI、embedding、Web Search、媒体生成和外部工具都需要相应凭据或本地端点。

## 快速开始

### 前置条件

- Obsidian 桌面端
- Git
- Node.js 20 或更新版本

### 在 Vault 内构建

打开终端，把 `<你的-vault>` 替换为 Obsidian Vault 的实际路径：

```bash
cd "<你的-vault>/.obsidian/plugins"
git clone https://github.com/highestpeak/obsidian-peak-assistant.git
cd obsidian-peak-assistant
npm run install-safe
npm run build
```

完成后重启 Obsidian，进入 **Settings → Community plugins**，启用 **Peak Assistant**。首次启动向导会引导你配置 provider 和索引。

更新源码安装：

```bash
git pull
npm run install-safe
npm run build
```

构建完成后重启 Obsidian。

> [!NOTE]
> 项目当前没有发布 release package。如果你希望使用带版本、无需本地构建的安装包，请 Watch 本仓库，等待首个公开版本。

## 数据、隐私与控制权

Peak Assistant 使用清晰的存储边界，不会把所有机器生成内容都伪装成普通笔记。

| 数据类别 | 存放位置 | 需要知道的事 |
| --- | --- | --- |
| 用户拥有的源文件 | Vault 内的 Markdown 与原生文件 | 它们继续是主要 source of truth，并遵循你自己的 Vault / 同步配置。 |
| 持久机器记录 | 配置的 Peak 数据目录内的 JSON / 分区 JSONL | 用于会话、报告、receipt、review 与 history；旧 Markdown reader 只负责迁移兼容。 |
| 可重建 read model | 本地 SQLite、全文索引、embedding、cache 与本地诊断 | 它们是本地投影，不是用户文档的 canonical truth。 |
| Provider 请求 | 你配置的 AI、embedding、Web Search、媒体或外部工具服务 | 某个动作可能发送完成该动作所需的 prompt、笔记片段、附件或查询；请同时检查 provider 自己的数据政策。 |

还需要明确这些边界：

- **Fast Index 完全本地。** Semantic / Full 模式需要配置 embedding/LLM provider，构建 enrichment 时可能发送文档 chunk。
- **API Key 保存在 Obsidian 插件本地数据中。** Peak 不声称对该本地文件做额外加密，请保护好 Vault 与设备。
- **Debug trace 默认关闭。** Redacted 和 Full local 都需要主动开启；Full local 可能包含 Vault 或账户上下文，不应原样对外分享。
- **改动以可检查为目标，而不是盲目写回。** Composer 提供 candidate/history/receipt 路径，但当前预览不承诺所有功能与文件类型都能完美回滚。

完整存储合同见 [Generated Artifact Registry](docs/conventions/generated-artifact-registry.md)。

## 项目状态

Peak Assistant 仍在积极开发中。

- **仅桌面端。** 与当前插件 manifest 一致。
- **Markdown-first。** PDF、DOCX、PPTX、CSV、JSON、Canvas、Excalidraw 等主要是读取/索引或受限嵌入路径，不是完整 Peak 编辑器；XLSX 当前不支持。
- **尚无正式发布包。** 当前安装需要从源码构建。
- **真实交互 QA 仍在收口。** 最近落地的部分 Composer、File Atlas、Command Center 能力已通过 build，但在 roadmap 中仍明确标记需要真实 Obsidian QA。
- **规划不等于已交付。** 调研候选和未来产品会继续与当前能力分开标注。

当前状态看 [Roadmap](docs/roadmap.html)，实施历史看 [Progress Log](docs/progress.md)。

## 开发

```bash
npm run dev
npm run test
npm run build
```

推荐阅读入口：

- [架构与 runtime 边界](docs/01-architecture.html)
- [代码组织](docs/02-code-organization.html)
- [用户任务 Playbook](docs/05-use-case-playbook.html)
- [配置与用户视图](docs/04-configuration-and-user-views.html)
- [协作规则](AGENTS.md)

提交大型 Pull Request 之前，请先创建一个 [Issue](https://github.com/highestpeak/obsidian-peak-assistant/issues)，说明用户问题和预期 scope。保持无关改动分离，并在请求 review 前运行相关测试与生产构建。

## License

Peak Assistant 使用 [GPL-3.0](LICENSE) 许可。

Obsidian 是 Dynalist Inc. 的商标。Peak Assistant 是独立开源项目，与 Obsidian 没有关联，也未获得其官方背书。
