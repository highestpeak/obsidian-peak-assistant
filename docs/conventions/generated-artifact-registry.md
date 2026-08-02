# Peak Assistant 生成产物注册表

## TL;DR

本文是 Peak Assistant **所有持久化生成产物的总目录与存储裁决表**。任何新增 writer、持久化路径、同步规则、Peak knowledge-index 规则或 Markdown 自动生成行为，都必须先在这里登记。

核心规则只有三条：

1. **Markdown / 原生文件只用于用户拥有、可编辑、可链接、可发布或明确导出的产物。**
2. **昂贵且不可廉价重建的机器事实使用 JSON / 分片 JSONL，并进入同步集合。**
3. **SQLite、全文索引、embedding、cache、telemetry 是本地可重建状态，不进入同步集合。**

配套实施设计见 [生成产物与存储治理实现设计](../superpowers/specs/2026-08-02-generated-artifact-storage-governance-implementation-design.md)。较早的 [机器运行记录 JSONL 设计](../superpowers/specs/2026-07-21-machine-record-storage-jsonl-design.md) 仍保留历史背景；两者冲突时，以本文和 2026-08-02 实现设计为准。

## Why

当前代码里，“AI 生成”“需要保留”“需要查询”“应该出现在 Vault”长期被混成了同一件事，结果产生四类问题：

- 机器记录被写成大量 Markdown，进入 Obsidian metadata、wikilink 和 graph 索引；
- SQLite 同时承担事实源和查询层，难以同步、恢复和审计；
- 用户真正需要维护的 Profile、Prompt、Skill、Brief、Hub Note 与内部 cache 混在同一目录心智里；
- 新增 writer 时没有中央清单，文档、代码路径、同步与清理策略容易漂移。

文件扩展名不能决定价值。一个名为 cache 的 AI 摘要可能花费大量 token，应该同步；一个体积很大的 embedding 数据库可以廉价重建，反而不应该同步。

## 1. 范围与术语

### 1.1 本注册表包含什么

包含插件运行时在 Vault 或插件数据目录中持久化的：

- 用户可见文档、媒体和结构化文件；
- AI 运行记录、摘要、版本、receipt 和当前状态；
- SQLite projection、全文索引、embedding、cache、telemetry；
- 已退役或待迁移但仍可能留在现有 Vault 的历史产物。

不包含：源码、bundled templates、依赖、构建产物、纯内存 UI state 和 Obsidian 自己拥有的 metadata cache。

### 1.2 五种产物类别

| 类别 | 定义 | 事实源 | 默认同步 | 默认进入 Peak knowledge index |
| --- | --- | --- | --- | --- |
| `user-artifact` | 用户明确创建、接受、编辑、链接或发布的内容 | Markdown / 原生格式 / JSON artifact | 是 | 仅适合知识图谱的文本产物进入 |
| `durable-record` | 生成昂贵、丢失后不能可靠重建的机器事实 | JSON snapshot 或分片 JSONL | 是 | 否 |
| `projection` | 从事实源重建的查询、排序、关联或 graph read model | SQLite | 否 | 否 |
| `cache` | 可重新计算的性能优化 | JSON / binary / SQLite | 否 | 否 |
| `telemetry` | 诊断、性能和行为观测 | 有界 JSONL / SQLite | 否 | 否 |

### 1.3 三个容易混淆的词

- **Artifact body**：用户或运行真正产生的内容，例如一张 AI Graph 的 version JSON、一张图片或一个 DrawIO 文件。
- **Record / receipt**：谁在什么时候用什么输入和模型产生了哪个 artifact，以及运行结果、成本、错误和采用状态。
- **Projection**：为了列表、搜索、graph、筛选和统计而建立的 SQLite 行。它不是 body，也不是 receipt。

## 2. 全局裁决规则

### 2.1 Markdown 物化门槛

只有满足至少一项时，系统才可以创建新的 Markdown：

- 用户明确执行 Create / Save / Export / Materialize / Promote；
- 用户会在 Obsidian 中直接阅读、编辑或链接它；
- 它需要进入原生 Obsidian Graph，且产品明确说明物化的后果；
- 它本身就是产品定义格式，例如 Prompt override、Vault Skill 或 Reminder note。

后台运行、列表展示、历史恢复、索引查询和 AI 内部传递都不构成 Markdown 理由。

### 2.2 JSON 与 JSONL

- **JSON snapshot**：一个逻辑对象只有“当前完整状态”最重要，例如 project state、resource summary、comments。
- **JSONL stream**：需要保留追加历史、失败、取消、未采用候选或审计顺序，例如 conversation、run、document history、Copilot generation history。
- 大 body 按对象或版本分片保存；禁止把整个知识库写进一个全局 JSONL。
- JSONL 事件通过稳定 ID 引用大 body，不重复内嵌同一份大内容。

### 2.3 同步与索引是两条独立轴

- `sync=yes` 表示数据跨设备或备份时不能丢；不等于让 Obsidian 索引它。
- `peak-index=no` 表示它应位于配置化 data root，并被 Peak Search / AI context indexing 排除；不等于可以删除。
- 具体使用 Git、iCloud、Syncthing 或其他 transport，由部署决定；本注册表只定义 inclusion policy。

Peak index policy 不等于 Obsidian metadata policy。任何 Vault 内 Markdown 都可能被 Obsidian 解析；若用户把目录加入 Obsidian Excluded files，它又不会进入原生 Graph。Hub Markdown 的显式物化正是让用户主动选择这项原生能力与成本。

## 3. 用户拥有的产物

这些产物默认进入同步集合。是否进入 Obsidian 索引由其知识价值决定。

| ID | 产物 / 触发方式 | 当前载体 | 目标裁决 | Peak index | Markdown / 原生文件门槛 |
| --- | --- | --- | --- | --- | --- |
| UA-01 | User Profile | `system/User-Profile.md`，启动时可能自动创建 | 保留 Markdown；改为用户启用、编辑或接受 AI proposal 时才创建 | 否，属于控制上下文 | 用户拥有的长期指令，可读可改 |
| UA-02 | Prompt override | `Prompts/*.prompt.md` | 保持 Markdown | 否，属于控制定义 | 仅用户创建 override 时生成；bundled default 不复制 |
| UA-03 | Vault Skill | `Skills/*.md` | 保持 Markdown | 否，属于能力定义 | 用户安装、创建或编辑 Skill 时生成 |
| UA-04 | Project Brief / Bridge | 当前混在 `Project-Summary.md` | 只把用户选择维护的 Brief / Bridge 保留 Markdown；机器 project state 与 summary 拆到 JSON | 是 | 用户显式创建、编辑或 promote |
| UA-05 | Materialized Hub Note | 当前后台自动写 `Hub-Summaries/*.md` | 默认 Hub 为 JSON + SQLite virtual node；仅用户要求原生 Graph / 可编辑笔记时物化 Markdown | 是 | 显式 Materialize / Promote；物化后受 user-owned 保护 |
| UA-06 | AI Analysis export | 显式保存的 `.md` | 保持独立 Export，不作为 analysis history 事实源 | 是 | 用户显式 Export |
| UA-07 | AI Graph export | 显式保存的 `.md` | 保持独立 Export；graph body 仍由 JSON artifact 拥有 | 是 | 用户显式 Export |
| UA-08 | Dataview artifact | `Artifacts/Dataview/*.md` | 保持 Markdown | 是 | 用户显式运行 `artifact_create` |
| UA-09 | Excalidraw artifact | `Artifacts/Excalidraw/*.excalidraw.md` | 保持 Excalidraw 原生格式 | 是 | 用户显式运行 `artifact_create` |
| UA-10 | DrawIO artifact | `Artifacts/DrawIO/*.drawio` | 保持 DrawIO 原生格式 | 否，由对应插件读取 | 用户显式运行 `artifact_create` |
| UA-11 | Extract artifact | `Artifacts/Extracts/*.md` | 保持 Markdown并保留来源链接 | 是 | 用户显式运行 `artifact_create` |
| UA-12 | Reminder artifact | `Artifacts/Reminders/*.md` | 保持 Markdown；调度状态与运行 receipt 另存 durable record | 是 | 用户显式运行 `artifact_create` |
| UA-13 | 生成或编辑的媒体 | `Attachments/media/*` 或 Composer 目标目录 | 保持图片、音频、视频等原生 binary | 否 | 用户请求生成、接受编辑或插入文档 |
| UA-14 | Copilot / Composer 接受写回 | 修改既有用户文档，或显式创建新 note | 继续由用户文档拥有；不再复制一份机器 Markdown truth | 是 | Accept / Apply / Create note |
| UA-15 | Canvas、Base、HTML、PDF 等文件产物 | 各自 native format | 保持 content-type-aware；版本和 run receipt 另存 durable record | 依格式而定 | 用户创建、接受或显式保存版本 |

主要 writer 证据：

- [`UserProfileService.ts`](../../src/service/chat/context/UserProfileService.ts)
- [`PromptService.ts`](../../src/service/prompt/PromptService.ts)
- [`SkillRegistry.ts`](../../src/service/skills/SkillRegistry.ts)
- [`ObsidianVaultHubDocAdapter.ts`](../../src/app/hub/ObsidianVaultHubDocAdapter.ts)
- [`AppArtifactVaultWriterAdapter.ts`](../../src/app/chat/AppArtifactVaultWriterAdapter.ts)
- [`ObsidianMediaAttachmentWriter.ts`](../../src/app/platform/media/ObsidianMediaAttachmentWriter.ts)
- [`AppCopilotPanelVaultAdapter.ts`](../../src/app/copilot/panels/AppCopilotPanelVaultAdapter.ts)

## 4. 需要同步的机器记录

这些数据默认位于 `DataStore/records/` 或 `DataStore/artifacts/`，需要同步，但不进入 Obsidian 知识索引。

| ID | 机器记录 | 当前事实 | 目标载体 / 分片 | 状态 |
| --- | --- | --- | --- | --- |
| DR-01 | Chat conversation | SQLite metadata + `Conv-*.md` 正文 | `records/chat/conversations/<conversation-id>.jsonl` | 待迁移 |
| DR-02 | Chat project state / AI summary | `Project-Summary.md` 混合用户与机器字段 | `records/chat/projects/<project-id>/state.json`；需要审计时追加 `events.jsonl` | 待迁移 |
| DR-03 | Resource summary | `resources-summary-cache/Resource-*.md` | `records/resources/<resource-id-or-hash>.json`，包含来源 hash、模型和 provenance | 待迁移 |
| DR-04 | AI Analysis snapshot | `DataStore/ai-analysis/*.json` | 保持分片 JSON；若需要完整运行时间线，再增加 per-run JSONL | 已部分符合 |
| DR-05 | Chat turn / run receipt | 当前主要写 SQLite JSON 字段 | `records/runs/<run-id>/events.jsonl`，SQLite 只投影 | 待迁移 |
| DR-06 | Chat artifact receipt | 当前 `chat.sqlite` 中的 receipt JSON | run JSONL 引用 UA artifact；SQLite 提供 Gallery / Resources 查询 | 待迁移 |
| DR-07 | Media job lifecycle | 当前 SQLite job / receipt | per-job 或 per-run JSONL，binary body 仍指向 UA-13 | 待迁移 |
| DR-08 | Hub manifest | 当前事实隐含在 Hub Markdown 与 `hub_constituent` | `records/hubs/<hub-id>/manifest.json`，稳定 hub ID、membership、summary version、materialized path | 待实现 |
| DR-09 | Hub curation / materialization history | curation plan 仅在 SQLite 且会裁剪 | `records/hubs/<hub-id>/events.jsonl` 或 run JSONL；大 summary body 独立分片 | 待实现 |
| DR-10 | AI Graph manifest / immutable versions | graph JSON 仍可能嵌在 analysis snapshot | `artifacts/ai-graphs/<graph-id>/manifest.json` + `versions/<version-id>.json` | 已设计、待实现 |
| DR-11 | 通用 Run artifact body | `VaultArtifactStore` 支持 `.peak/artifacts`，当前未接生产 runtime | `artifacts/runs/<run-id>/<artifact-id>.<ext>`；统一进入 registry | 基础类存在、未接线 |
| DR-12 | Composer comments | `DataStore/composer/comments/*.json` | 保持 JSON snapshot | 已符合 |
| DR-13 | Composer workspace state | `records/composer/workspaces/current.jsonl` | 保持 JSONL | 已符合 |
| DR-14 | Document History | `records/document-history/<record-id>.jsonl` + identity index | 保持 JSONL；identity index 是可同步的小型映射 | 已符合 |
| DR-15 | Composer Copilot generation history | `records/copilot/sessions/<record-id>.jsonl` | 保持 JSONL，包含失败、取消、stale、未采用候选 | 已符合 |
| DR-16 | User Profile AI proposals | 当前可能直接覆盖 Profile Markdown | proposal / accept / reject 写 run JSONL；只有 accepted current content 写 UA-01 | 待收口 |

主要 writer 证据：

- [`ChatStore.ts`](../../src/core/storage/vault/ChatStore.ts) 与 [`ChatProjectSummaryDoc.ts`](../../src/core/storage/vault/chat-docs/ChatProjectSummaryDoc.ts)
- [`ResourceSummaryService.ts`](../../src/service/chat/context/ResourceSummaryService.ts)
- [`AiAnalysisJsonStore.ts`](../../src/core/storage/vault/search-docs/AiAnalysisJsonStore.ts)
- [`ComposerStorageConfig.ts`](../../src/app/composer/ComposerStorageConfig.ts)
- [`ObsidianComposerHistoryPersistence.ts`](../../src/app/composer/ObsidianComposerHistoryPersistence.ts)
- [`VaultArtifactStore.ts`](../../src/service/run-envelope/VaultArtifactStore.ts)
- [AI Graph Artifact Platform](../superpowers/specs/2026-07-28-ai-graph-artifact-platform.md)

## 5. 本地可重建数据

这些产物默认不进入同步集合。删除后必须能从用户文件与 durable records 重建，或者只损失短期诊断信息。

| ID | 产物 | 当前载体 | 保留策略 | 重建 / 丢失语义 |
| --- | --- | --- | --- | --- |
| LP-01 | Vault text / graph / chunk projection | `vault.sqlite` | 本地，允许 backup rotation | 从 Vault 用户文件、durable records 重建 |
| LP-02 | Chat / run / artifact read model | `chat.sqlite` | 本地，允许 backup rotation | 从 conversation / run JSONL 与 artifact manifests 重建 |
| LP-03 | Full-text index | SQLite FTS tables | 本地 | 重新扫描和分词；不消耗 AI token |
| LP-04 | Embedding / vector index | SQLite + sqlite-vec | 本地 | 重新 embedding；可能花算力/API 成本，但体积和平台耦合决定默认不同步；部署可提供独立备份策略 |
| LP-05 | Hub graph projection | `hub_constituent`、`hub_doc` 等表 | 本地 | 从 Hub manifests 重建 |
| LP-06 | Summary preview / list cache | JSON / SQLite projection | 本地、有界 | 从 durable summary body 重建 |
| LP-07 | Composer telemetry | `telemetry/composer/composer-intelligence.jsonl` | 本地、有界、可轮转 | 丢失只影响诊断 |
| LP-08 | Debug trace / dev snapshots | debug store 或开发输出目录 | 本地、默认有界 | 丢失只影响诊断；不得包含未脱敏隐私 |
| LP-09 | Native module metadata / extracted binary | 插件运行目录 | 本机安装基础设施 | 由插件包重建；不属于知识库同步 |
| LP-10 | SQLite backups | `*.sqlite.backup*` | 本地、有限保留 | 仅灾难恢复便利，不是 canonical truth |

> Embedding 是一个有意的例外：它可能有计算或 API 成本，但仍属于模型版本、设备架构和索引实现高度相关的 projection。若用户需要节省重建成本，应设计独立、可选的 index backup，而不是把它提升成知识事实源。

## 6. 历史与退役候选

| ID | 历史产物 | 当前处理 | 目标处理 |
| --- | --- | --- | --- |
| LG-01 | `Conv-*.md` Chat 历史 | 仍是当前正文事实之一 | JSONL 校验完成后停止新增；保留可回滚期，再由用户确认归档或清理 |
| LG-02 | 混合式 `Project-Summary.md` | 用户字段与机器 summary 同文件 | 迁出 machine state；只有用户选择的 Brief/Bridge 留 Markdown |
| LG-03 | `resources-summary-cache/Resource-*.md` | 机器摘要进入 Vault Markdown | 导入 JSON、校验 hash 后停止新增；旧文件不自动删除 |
| LG-04 | 自动 Hub Markdown | Hub membership 依赖解析链接进入 SQLite | 导入 Hub manifest；默认改 virtual；已物化 note 保留并标记 ownership |
| LG-05 | 旧 AI Analysis Markdown | 历史版本可能仍存在 | 导入/确认 JSON 后仅作为用户 export 或 archive |
| LG-06 | `peak-system/auto-review/*.md` | 旧 Copilot Auto Review 历史 | 随旧能力退役；不接入新 Composer ledger，不自动删除 |
| LG-07 | `peak-system/vault-reviews/*.md` | 旧 Vault Review report | 同上，保留历史证据直到 owner 决定归档 |
| LG-08 | `.peak/artifacts/artifact-index.json` | store 实现存在但未发现生产 runtime owner | 不建立第二套 catalog；接线时迁入统一 artifact registry / projection |

旧 writer 证据：

- [`CopilotReviewHistoryService.ts`](../../src/service/copilot/CopilotReviewHistoryService.ts)
- [`ObsidianVaultReviewReportAdapter.ts`](../../src/app/copilot/vault/ObsidianVaultReviewReportAdapter.ts)

## 7. Hub 的特殊边界

Hub 同时有“机器聚类节点”和“用户知识文档”两种形态，不能强迫二选一。

目标链路是：

```text
Hub manifest / events (JSON + JSONL canonical)
  -> SQLite hub projection
  -> Peak Graph 中的 virtual Hub node
  -> 用户显式 Materialize
  -> 可编辑、可链接、可进入原生 Obsidian Graph 的 Hub Markdown
```

约束：

- Peak Graph 必须能直接显示 SQLite projection 的 virtual Hub；不能为了显示节点而自动创建 Markdown。
- 原生 Obsidian Graph 只能看到已物化的 Hub，这是明确的产品差异，不应伪装成完全等价。
- `hubId` 是稳定身份；路径只是可选 materialization location。
- Markdown 物化后，AI 更新通过 proposal / review，不得静默覆盖用户区。
- Hub membership 从 manifest 重建；不再以解析 Markdown outgoing links 作为唯一事实源。

## 8. 目标目录契约

目录名可以在实施阶段经 migration plan 调整，但数据责任必须保持：

```text
ChatFolder/
├── system/User-Profile.md                 # user-artifact，按需创建
├── Prompts/*.prompt.md                    # user-artifact
├── Skills/*.md                            # user-artifact
├── Projects/<project-id>/Brief.md         # user-artifact，按需创建
├── Hub-Summaries/*.md                     # user-artifact，按需物化
├── Artifacts/**                           # user-artifact / native formats
├── Attachments/**                         # user-artifact / binary
└── DataStore/
    ├── records/**                         # durable-record，sync=yes
    ├── artifacts/**                       # durable artifact body，sync=yes
    ├── projections/*.sqlite               # projection，sync=no
    ├── cache/**                            # cache，sync=no
    └── telemetry/**                        # telemetry，sync=no
```

迁移第一阶段不要求立刻移动现有 `vault.sqlite` / `chat.sqlite`；先让 policy 与 writer ownership 生效，再移动物理路径，避免一次改动同时改变格式、位置和读取链。

## 9. 当前 Vault 快照（2026-08-02）

这只是审计基线，不是长期 schema：

- `DataStore/ai-analysis/`：约 1,144 个 JSON；
- ChatFolder 根目录：33 个 conversation Markdown；
- `Hub-Summaries/`：26 个 Hub Markdown；
- `Prompts/`：4 个 Prompt Markdown；
- Composer：2 个 document-history JSONL、1 个 workspace JSONL、1 个 Copilot session JSONL、1 个 comments JSON、1 个 document identity JSON、1 个 telemetry JSONL；
- SQLite：2 个主库及其 backups；
- `system/User-Profile.md`：1 个；
- `peak-system/`：README、7 个 auto-review Markdown、2 个 vault-review Markdown；
- 当前未发现 `Skills/`、`Artifacts/`、`Attachments/`、`Bases/`、`Inbox/` 目录实例。

根 Vault `.gitignore` 当前整体忽略 `ChatFolder/` 和 `*.sqlite`。如果 Git 是预期同步 transport，这会同时排除 user-artifact 与 durable-record，和本文的 inclusion policy 冲突；实施前必须通过精确 include/exclude 或独立同步 manifest 解决，不能简单取消所有 ignore。

## Do

- 新增持久化 writer 前先选择一个注册表 ID，或在本文件新增一行。
- 在 domain service 中表达“写 durable record / user artifact”，不要直接推导文件扩展名。
- 让 app layer 组合 storage registry、路径配置和 Vault/SQLite adapter。
- 给每个 durable format 提供 schema version、stable ID、created/updated timestamp 和 provenance。
- 给 projection 提供完整 rebuild test。
- 迁移旧文件时先 copy/import、校验、切读、观察，再讨论归档；不自动删除用户已有内容。

## Don't

- 不因内容是 AI 生成就自动写 Markdown。
- 不把 SQLite row 当作唯一的昂贵生成结果。
- 不把所有历史塞进一个全局 JSONL。
- 不把 cache 名称当作“可删除”的充分证据。
- 不让 UI surface 自己发明新目录或第二套 artifact catalog。
- 不用同步需求作为让数据进入 Obsidian 索引的理由。
- 不以 build 通过代替 migration round-trip、rebuild 和 sync boundary 验证。

## Checklist

评审任何新增或修改的持久化产物时检查：

- [ ] 注册表已有唯一 ID、owner、触发方式和目标载体。
- [ ] 已回答“丢失后能否无 AI 成本、无信息损失地重建”。
- [ ] Markdown 创建满足显式物化门槛。
- [ ] JSON / JSONL 已选择 snapshot 或 stream，而不是按偏好随意选择。
- [ ] 大 body 与事件记录分离，事件只引用稳定 artifact ID。
- [ ] sync policy 与 Peak knowledge-index policy 分开声明。
- [ ] SQLite 可从 canonical data 重建，并有自动化验证。
- [ ] 旧格式迁移幂等、有校验、有回滚期，不自动删除。
- [ ] app layer 拥有 runtime composition；没有新增 service singleton 或 `AppContext.getInstance()` 捷径。
- [ ] 本注册表、相关 spec、roadmap 和代码测试使用同一组产物名称。
