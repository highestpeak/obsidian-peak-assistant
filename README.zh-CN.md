<div align="center">

<p><a href="README.md">English</a></p>

# Peak Assistant

### 把散落的笔记，变成可以核查的工作成果。

Peak Assistant 是为 Obsidian 设计的证据感知 AI 工作台。它能跨 Vault 搜索、保留答案背后的笔记来源，并让你在不放弃 Markdown 所有权的前提下审阅改动。

[![开发预览](https://img.shields.io/badge/状态-开发预览-c98225?style=flat-square)](#项目状态)
[![Obsidian 桌面端](https://img.shields.io/badge/Obsidian-仅桌面端-7c3aed?style=flat-square)](https://obsidian.md/)
[![GPL-3.0](https://img.shields.io/badge/许可-GPL--3.0-2d6a4f?style=flat-square)](LICENSE)

**[项目页](https://highestpeak.github.io/obsidian-peak-assistant/)** · **[快速开始](#快速开始)** · **[项目文档](docs/index.html)** · **[路线图](docs/roadmap.html)**

</div>

![在 Obsidian 中打开的 Peak Composer：左侧是 Markdown 文档，右侧是 Intelligence 侧栏](website/assets/peak-composer.webp)

> [!IMPORTANT]
> Peak Assistant 当前处于开发预览阶段，尚未提供官方二进制包，也尚未进入 Obsidian Community Plugins。现阶段面向早期用户和贡献者的安装方式是从源码构建。

## 为什么是 Peak Assistant

大多数 AI 工具停在“给出一个回答”。Peak Assistant 则把回答周围的工作过程继续留在视野里：

- **理解整个 Vault，而不只是一篇笔记。** 先用全文、模糊、语义、树和图视图查找，再按需进入更深入的分析。
- **让证据始终跟着结论。** AI Search 把运行过程、报告和来源列表分开呈现，你可以检查哪些笔记真正影响了结果。
- **在源文件所在的位置继续工作。** Peak Composer 仍以 Markdown 为主工作面，Copilot、Intelligence 和 History 就在文档旁边。
- **自己决定模型与边界。** 可按角色连接本地或云端 provider；Fast Index 保持本地，语义和完整索引则是需要明确配置 provider 的可选能力。

核心闭环只有一条：

```text
提出真实任务 → 搜索 Vault → 检查报告与来源 → 审阅或继续行动
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

## 当前预览包含什么

### 搜索与调查

- Vault Search：紧凑/详细列表、目录树和图谱探索
- AI Search：进度、报告、来源检查、已保存快照，以及继续进入 Chat
- Vault Intelligence：hub、知识缺口、陈旧结构、链接等知识健康信号

### 写作与审阅

- 以 Markdown 为主工作面的 Peak Composer
- 面向选区、block 和整篇文档的 Document Copilot
- 紧贴源文档的 Intelligence 与 History
- 以 candidate、receipt 和 history 路径保持改动可检查

### 带上下文对话

- 支持项目、会话、附件与 Vault 上下文的 Chat Studio
- 统一管理工具、权限、trace、预算和取消的 agent runtime
- OpenAI、Anthropic、Google、Perplexity、OpenRouter、Ollama 与兼容自定义端点的 provider profile

### 保持控制权

- 本地 Fast Index 与本地 SQLite read model
- 按角色显式绑定本地/云端模型
- 可查看运行成本和 runtime 行为的 Usage / Diagnostic 界面
- External tools 与外部插件命令默认受权限控制

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
