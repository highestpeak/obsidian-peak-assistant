# Peak Assistant — Progress Tracker

> **本文只装历史流水账（按 session / Phase 追加）。**
> 项目"当前战线 + 待建功能 + 调研候选 + 远期 backlog"的状态快照在 [`roadmap.html`](./roadmap.html)。
> 文档索引在 [`index.html`](./index.html)。调研原稿在 `docs/research/`。Spec/plan 在 `docs/superpowers/specs/`（`plans/`）。

## Overview

Obsidian AI assistant plugin. 当前目标：**产品完备** — 从 onboarding → 配置 → Chat → Search → Graph 每个环节都能跑通，体验完整。同时推进技术债清理和架构重构。

## 2026-08-02 · Planned Requirements 清理

- [x] **登记页只保留待办**：`planned-requirements.html` 只展示开放需求（当前 0）；已实现、合并或撤销的项目全部从页面移除，不再保留关闭卡片或 PR anchor。
- [x] **当前入口同步**：Search 正稿改为 `Vault Search + AI workspace selector`；Vault Intelligence 正稿移除旧 Copilot Vault tab；文档 hub / link / local graph 归 File Atlas；Ambient sensing / refresh / 候选解释归 Composer Intelligence 的 Copilot Brief，独立浮窗明确退役。
- [x] **文档层级收口**：Roadmap 记录已完成里程碑，Progress 保留历史流水，产品 IA 审计承接逐项 review；根索引明确 Planned Requirements 只放当前待办。Linked specs 更新为原工作区已实现或 historical / superseded 状态。
- [x] **验证边界**：本轮只改文档；本地 HTML href / anchor、关键状态词、focused requirements contract 与 diff whitespace 检查通过后提交。真实 Obsidian 交互仍沿用逐项清单中的 `INTERACTION NOT VERIFIED`，没有升级为产品 E2E 验收。

## 2026-08-02 · 生成产物与存储治理 Phase 0-5

- [x] **Typed Artifact Registry**：新增 app-owned `GeneratedOutputRegistry` 与按 domain 拆分的 52 项 catalog，和 `generated-artifact-registry.md` 的 UA/DR/LP/LG 52 个 ID 一一对应；descriptor 锁定 owner、lifecycle、carrier、sync、Peak index、materialization、retention、schema 与 path template。
- [x] **策略与路径 fail-loud**：durable record 必须同步且不得物化；SQLite 只能是 projection；local projection/cache/telemetry 必须排除同步和 Peak index；非 legacy machine Markdown 直接拒绝。路径 resolver 校验缺失变量、绝对路径、反斜杠与 `..` traversal。
- [x] **Writer coverage gate**：自动扫描 `src/` 的直接 Vault / adapter / fs writer，25 个直接 writer 全部映射到 catalog evidence 或 3 个通用 persistence adapter allowlist；新增未登记 writer 会让测试失败。
- [x] **首个真实 adopter**：AI Graph artifact 与 run-event 目录从硬编码改为通过 app-owned registry 解析，物理路径保持 `DataStore/artifacts/ai-graphs` 与 `DataStore/records/analysis/runs`，没有数据迁移或用户文件改写。
- [x] **验证边界**：2 个新 focused suites 与 AppRuntime/AI Graph 相关 4 suites 通过；生产 build、bundle check、simulator boundary 和 architecture audit 通过，boundary 维持 19、service→app/ui 为 0。全量为 `394/398`；4 个失败来自未触碰的 Chat Streamdown 与并行 Composer 共享选择器/标签候选变更。本 Phase 未迁移 Chat、Project、Resource Summary、Hub，也未删除任何 legacy Markdown。
- [x] **Phase 1 已完成**：atomic JSON snapshot、partitioned JSONL、immutable artifact body、schema/checksum/quarantine、DR-17 migration journal、projection rebuild registry 与由 typed catalog 派生的 sync manifest 已接到 app-owned persistence runtime；focused tests、build 与 boundary audit 通过。详见 [`Phase 1 实施记录`](./superpowers/plans/2026-08-02-generated-artifact-storage-governance-phase-1-implementation-note.md)。
- [x] **Phase 2 已完成**：Resource Summary 改为 JSON snapshot；Profile 启动不再生成空 Markdown，AI proposal/accept/reject 写 JSONL；Project machine state 与可选 Brief 分离；turn/artifact/media receipts 拥有 canonical JSONL。
- [x] **Phase 3 已完成**：Chat conversation 新写入只落分片 JSONL；旧 `Conv-*.md` 通过 dual-read/import 保留；assistant、project plan 与删除 tombstone 也有非 SQLite canonical state；Maintenance cleanup 不再用 Markdown 缺失判断 orphan。
- [x] **Phase 4 已完成**：Hub manifest/events 成为事实源，SQLite 只做 projection；Peak Graph 支持 `peak-hub://` virtual detail，只有显式 Materialize 才创建 Markdown。AI Graph stable graph/version 与 immutable JSON artifact 已完成对齐。
- [x] **Phase 5 安全收口**：旧 Auto Review / Vault Review 生产 writer 停止，legacy Markdown 只读导入 JSONL 并写 migration journal；Chat、Resource、Hub 与 Review 旧文件均不移动、不删除。物理 archive/delete 继续由独立 owner-approved 任务控制。
- [x] **验证边界**：17 个 storage-focused suites 全通过；生产 build 通过；boundary audit 维持 19，service → UI/app 为 0。全量测试为 `395/399`，4 个失败来自未触碰的 Chat Streamdown、code theme 与并行 Composer guards。真实 Obsidian Hub 点击、原生 Graph 与 live migration 保持 `INTERACTION NOT VERIFIED`，第二 Vault 同步演练未执行。
- [x] **实现记录**：最终数据流、迁移保护、验证与回滚见 [`Phase 2-5 实施记录`](./superpowers/plans/2026-08-02-generated-artifact-storage-governance-phases-2-5-implementation-note.md)。

## 2026-08-02 · Planned Requirements 产品归属纠偏

- [x] **Vault Intelligence 回归 AI Search**：Vault Graph、hubs、结构洞和 review history 由 Quick Search 的 `Vault Intelligence` mode 直接承载，不再复用旧 Copilot Vault workspace。
- [x] **文档图谱回归 File Atlas**：当前文档所属 hubs、入链/出链与 local graph 统一放入 File Atlas；Search 结果检查器只提供 `Open in File Atlas`，旧 Search Hub Drawer 已合并退役。
- [x] **Ambient 浮窗退役**：删除本分支新增的 window-local floating host；Ambient 只保留 sensing/finding 能力，未来投影归 Composer Intelligence / Copilot，而不是独立 panel/modal。旧 Related Notes leaf 仅作为已保存 workspace 的兼容入口。
- [x] **Review 入口修复**：逐项 surface、变更和验收路径统一放进产品 IA 纠偏审计；AI Search / Vault Intelligence 增加可交互有样式 mock 与正式视觉设计；AI Graph 的 Graph Detail / Create Graph 改为直接链接到对应有样式原型。
- [x] **自动验证**：planned-requirements production contract、13 个相关 graph/File Atlas/Composer/AI Graph suites、生产 build 与 Playwright mock validation 均通过。真实 Obsidian 本轮未连接 CDP，交互结论保持 `INTERACTION NOT VERIFIED`。逐项清单见 [`2026-08-02-planned-requirements-product-ia-correction.md`](./superpowers/audits/2026-08-02-planned-requirements-product-ia-correction.md)。

## 2026-07-31 · Planned Requirements 11 项完整实现

> 历史记录：本节反映 2026-07-31 的首次实现判断；其中 Vault/Copilot、Search Hub Drawer 与 Ambient floating surface 已被上方 2026-08-02 纠偏记录取代。

- [x] **Contextual graph surfaces**：Vault Maintenance、Document Copilot 与 Quick Search drawer 共用 app-composed read-only graph port，落地 overview / hubs / source chain / local graph / orphan actions。
- [x] **Ambient / File Atlas / Native Copilot**：Ambient 改为 Obsidian window-local floating host并提供显式刷新；File Atlas work-file rail 支持 recent / frequent / name、同源 Copilot suggestions、icon-only filter/flatten 与 breadcrumb；原生 Markdown modal 复用 Document Composer runtime，顶层只保留 Copilot / History。
- [x] **Shared AI input / unified AI workspace**：Chat、Composer Copilot、AI Search 与 AI Graph 使用共享 instruction submission/component；Quick Search 顶层收敛为 Vault Search + AI selector，普通打开重置 AI Search，低频 mode、run/history 与 artifact deep link 可按 intent 恢复。
- [x] **AI Graph Artifact Platform**：稳定 graph/version identity、immutable JSON versions、来源/证据/review/provenance、显式 Web、semantic diff accept gate、source/update 分离、JSONL run events、SQLite rebuildable projection、版本历史与 relation direction/文字 inspector 已落地；File Atlas、Composer、Vault Search、Chat 通过统一 launcher 带真实 context 重开/创建同一类 artifact。
- [x] **Folder layout**：仅直接拥有当前可见文档的目录生成 compound frame，空中转目录按最近可见祖先折叠，完整 path 保留。
- [x] **验证边界**：requirements-focused 15/15 与补充跨 surface / layout suites 全通过；`npm run build` 通过。全量 suite 为 `392/396`，4 个失败来自未触碰的基线 Chat Streamdown / Composer 契约。隔离 worktree 未覆盖真实 Obsidian 插件目录且没有 CDP listener，故交互状态仍为 `INTERACTION NOT VERIFIED`。完成审计见 [`2026-07-31-planned-requirements-completion-audit.md`](./superpowers/audits/2026-07-31-planned-requirements-completion-audit.md)。

## 2026-07-30 · Graph 边方向真值修复

- [x] **File Atlas 方向恢复**：邻域图不再把 incoming backlink 强制改造成“当前文档 → 邻居”；一跳和二跳都按索引中的真实 `from/to` 构图，`A-2-processing → AI-peak-assistant-obsidian` 与 Vault/SQLite 真值一致。
- [x] **统一 edge directionality**：新增 `directed / undirected / bidirectional` 契约；互相引用合并为双向边，semantic、contrasts、complements、cross-domain 关系按无向边处理。
- [x] **跨 surface 收口**：Sources Graph 不再把数据库边降成无向邻居后按遍历顺序重建；Cytoscape 与 MultiLens/ReactFlow 都按 directionality 显示单向箭头、双箭头或无箭头，Mermaid 导出同步。
- [x] **验证与提交**：4 组 focused graph suites 全部通过；`npm run build` 及 bundle/simulator boundary 检查通过。全量测试为 `378/382`，4 个失败来自未触碰的 Chat Studio/Composer 契约。当前无 Obsidian CDP listener，真实交互标记为 `INTERACTION NOT VERIFIED`。实现提交：`a3b221bc`（`fix: preserve graph edge directions`）。

## 2026-07-29 · AI Search Simulator 独立 sidecar

- [x] **独立 Provider 进程**：AI Search Simulator 从插件进程内 mock 迁到 `tools/ai-search-simulator/`；`npm run simulator` 单独启动，`npm run dev:simulator` 同时启动插件 watchers 与独立 sidecar。
- [x] **完整 AI Search 双协议链路**：sidecar 同时实现 OpenAI Chat `/v1/chat/completions`（Vercel AI SDK 规划/tool calling）与 Anthropic Messages `/v1/messages`（Claude Agent SDK 报告章节/summary），只替换模型推理；AI Search UI、AgentLoop、Vault tools、Plan Review、Report/Sources 与持久化仍走生产链路。
- [x] **正常 Provider 配置**：Simulator Provider 默认存在于 AI Setup；默认 endpoint 为 `http://127.0.0.1:43127/v1`，无需 API key。在 Provider 卡配置 scenario / speed / strict，并把 `AI Behavior → Research` 绑定到 `AI Search Simulator`，不增加 AI Search 专用开发工具条。
- [x] **8 个可复现场景**：happy path、slow streaming、planning failure、empty result、Vault tool recovery、report partial failure、report total failure、escalation request。配置通过逐请求 headers 发送，修改场景不需要重启 sidecar。
- [x] **低污染与可复用边界**：场景引擎、响应文案、fixture 与延迟/失败行为只存在于 sidecar；插件保留轻量标准 Provider client、Settings 配置、health check 和 Agent SDK env materialization。`check:simulator-boundary` 随生产 build 验证 sidecar runtime 未进入 `main.js`。后续其他 AI surface 需要确定性全流程测试时，应优先复用/扩展这个 Provider sidecar，不在业务 UI 或生产调用路径新增 mock 分支。
- [x] **验证与提交**：Simulator focused suite 5/5 通过；生产 build 与 bundle boundary 通过；全量 346/350，4 个失败为既有 Chat Studio/Composer failure；sidecar 在原工作区真实启动并通过 health/models 检查。因无 Obsidian CDP listener，真实 UI 交互标记 `INTERACTION NOT VERIFIED`。提交 `165debe6`（`refactor: move AI Search simulator to sidecar`）。设计见 [`2026-07-29-ai-search-simulator-provider-design.md`](./superpowers/specs/2026-07-29-ai-search-simulator-provider-design.md)。

## 2026-07-21 晚 · Chat Studio 零缺口收口（9 track + runner 修复）

- [x] **Track 1 · Auto 真实路由**：新 `src/service/chat/modelRouter.ts`（纯函数：能力过滤 + tier 策略）+ `templates/config/model-routing.json`（ConfigTemplateId.ModelRouting）；接线 `service-conversation.prepareChatRequest`；auto sentinel 持久化不回写；`TurnExecutionReceipt` 增 `requestedSelection/modelSource/routeReason/requiredCapabilities`；零候选硬错误。测试 `test/model-router.test.ts`。
- [x] **Track 2 · Composer 单一真值**：`CapabilitySuggestion` 归轨 `composerStore`；`SystemPromptSlot` 不再硬编码 vault 可用；`ChatRuntimeStatePort.isVaultSearchAvailable`（`main.ts` 真值注入）；requested vs actual sources 分开持久化。诚实遗留：`chatViewStore` 旧字段保留为 composer→legacy 单向镜像（port 仍读），未全删。测试 `test/composer-source-truth.test.ts`。
- [x] **Track 3 · Composer 入口语义**：`+` 仅资源三项（Files & images / Vault document / Link）；生成动作（image/edit/video/music/document）全部迁入 `/` slash Generate 组（宿主 `ComposerGenerateActions.tsx`，preflight/缺 key 诚实禁用逐路由原因）；`[[` 不变；`@` 保留未占用；starter 只填不发。实机截图验证。测试 `test/composer-entry-semantics.test.ts`。
- [x] **Track 4 · Assistant Builder**：Advanced 区（`knowledgeRefs / toolPolicy` allow+deny / `preferredModel`）；生命周期 create/edit/duplicate/archive+restore/delete/reset defaults；**preview = ephemeral apply-without-saving**（`EphemeralAssistantRegistry` 内存级，resolver 优先，reload 消失，selector "Preview" 徽标）；Save 才持久化。测试 `test/assistant-builder-lifecycle.test.ts`。
- [x] **Track 5 · Artifact-Turn 关联**：`TurnExecutionReceipt.artifactIds` 真实回填（`listArtifactReceiptsByMessage`）；repo 按 message/conversation/project/kind 查询；Gallery fixture 确认 dev-only。测试 `test/artifact-turn-association.test.ts`。
- [x] **Track 6 · 媒体全量**：edit contract（`operation/referenceImages/maskImage` + `MediaReferenceResolver` port + `VaultMediaReferenceResolver`）；OpenAI `/v1/images/edits` multipart（`image[]/mask`，per-model part 名）；`OpenAINativeVideoAdapter`（Sora `/v1/videos` submit/poll/download，无远程 cancel→本地停）；fal edit codecs（`nano-banana/edit` `image_urls`、`flux-pro/v1/fill` `image_url+mask_url`，data URI 直传）；共享 `falPayload.ts` 消除双 adapter 漂移；batch 多输出 → N 独立 receipt + gallery；**runner 修复 latent bug**（此前 submit 传 domain request 无 `modelId`，真实调用必炸）；Composer Edit image 表单（refs 确定性来自用户选择，直接调 `service.produce`，Insert-as-reference 动作）；音视频理解链路（`MediaUnderstandingPort` / `OpenAITranscriptionAdapter` `whisper-1` 可配、`WebAudioVideoAudioExtractor` → 16k WAV、Gemini catalog 标注 `videoInput/audioInput`、发送前门禁、`ChatResourceRef.understandingSource` 4 字段 + UI 徽标）；Usage Dashboard "Media generation · run detail"（恒标 estimated）；music terms 首次确认（`policyVersion/confirmedAt` 入 settings + receipt）；Settings 矩阵 generate/edit × kind × route。测试 ~10 个 media 新文件。
- [x] **Track 7 · 结构化产物**：`artifact_create` ToolDef（`kind='edit'` 走 PermissionGuard）+ 5 producer（Dataview `.md` fence 校验 / Excalidraw 有效 `.excalidraw.md` / drawio 有效 XML / Extract 带来源链接 / Reminder frontmatter + `ReminderSchedulerService` 到期弹 Notice + 文件 status→done 原位翻转）；`ChatArtifactKind` 增 `dataview/extract/reminder`，渲染 / Resources / Outline 全认；`folderPaths` 增 Artifacts/* 子目录；config `templates/config/artifact-create.json`。测试 `test/artifact-create-producers.test.ts`（15 场景）等。
- [x] **Track 8 · 消息动作**：registry 优先级 + 反向 overflow（core 5 永不进 More）；Trace 打开真实 `AgentTrace`（copy JSON 降级）；**Retry → variant 版本化**（`variantGroupId/variantIndex/isActiveVariant`，history 只取 active，‹N/M› 切换器）；**Branch → 真分支**（`parentConversationId/parentMessageId`，"Branched from" 链回）；permission 三态（deny / allow once / allow-for-run，run 级 allowlist 在 `useStreamChat`）；suggested next 顶部 ≤ 2 只填 Composer；targeted follow-up 用主 Composer reply anchor。测试 3 个新文件。
- [x] **Track 9 · Detached / A11y**：`useOwnerWindow` hook + 9 处 `ownerDocument` 修复（键盘 / drop / confirm / lightbox / scroll-spy）；splitter aria + Home/End/Enter reset；`NavRow` 键盘化；msg-list `role="log"` `aria-live`；图片布局分档纯函数 + lightbox；scroll-spy 随消息增删 re-observe；Track 7 CSS 补齐。测试 2 个新文件。
- [x] **Runner 修复（重大）**：`run-test.js` 原 harness `require; setImmediate(exit 0)` 会强杀 async 断言 → 假绿。改为 `beforeExit` 自然退场 + `unhandledRejection` 硬失败 + 8s unref 宽限。**暴露 6 个长期假绿失败并全部修复**：AgentLoop reasoning（测试 fixture 字段错）、highlight-source-resolver `chunk_raw` 回退（生产 bug，按 2026-07-07 spec 修）、t11n/o/p/q 过时路径断言 + **`CopilotPickerContent` ui→app 真实回归**（修生产：`ServiceContext` 注入 `copilotActionRuntime`，floor 收紧回 0）。
- [x] **测试与实机**：**264/264 test files 绿**、`npm run build` 绿、`node docs/gstack/chat-studio-interactive-2026-07-13/validate.mjs` 通过；Obsidian 1.12.7 CDP 驱动实机验收（截图在 `/tmp/peak-acceptance/`）核心面通过：boot 无 Chat Studio 错误、COMP-01 DOM 恰 1 Composer、空态居中、Auto 标签、starters 只填不发、`/` 面 WORKFLOW + GENERATE 缺 key 诚实禁用、`+` 面仅三资源、Settings Media Generation 矩阵含 Op 维度、Usage Outcome Value "Media generation · run detail" 区 + "Cost is a preset estimate — never a settled bill" 空态、console 无本轮新增错误。
- [x] **凭据阻塞**：fal key 未配、OpenAI profile 未配、OpenRouter 欠费（402）→ 真实付费 image/edit/video(Sora+veo)/music/TTS/transcription 调用、MEDIA-04 九步、CORS 实测、真实流式 turn E2E 均待 owner 凭据。见 [capability checklist §5.5 凭据阻塞项](./testing/chat-studio-capability-checklist.md#55-凭据阻塞项-credential-blocked-2026-07-21-晚)。
- [x] **诚实遗留**：(a) `chatViewStore` 旧 source 字段单向镜像未全删；(b) allow-for-run 仅 `useStreamChat` 层强制；(c) 原始拖拽附件（未入 vault）不能作 edit base（resolver 需稳定标识）；(d) 实机人工矩阵未跑部分：detached popout 键盘全流程、light/dark 双主题、894/1440 视口、125% zoom、VoiceOver（Track 8 代理留了 10 条人工检查点清单）；(e) "Generate document" 是 workflow fill 语义（非独立表单）。
- [x] **交付材料**：本 session 未 commit（129 tracked files +13.5k/−11.9k + 新增文件）；final implementation note 在 `docs/superpowers/plans/2026-07-21-chat-zero-gap-closure-delivery.md`；能力清单迁移在 [`docs/testing/chat-studio-capability-checklist.md`](./testing/chat-studio-capability-checklist.md)；spec §17 46 个 ID 逐项状态见 [implementation spec §17](./superpowers/specs/2026-07-15-chat-studio-complete-implementation-spec.md#17-requirement-验收矩阵)。

## 2026-07-20 · Chat Studio UI completion

- [x] Message hierarchy：Reasoning 保持轻量 disclosure；历史与流式 tool calls 统一进入独立 Agent Run，多个步骤自动展开；Diagnostic Trace 仅在真实 spans 存在时出现。
- [x] Rich content：表格长链接改为可读最小宽度 + 局部横向滚动；Mermaid inline 自适应消息宽度，当前窗口真全屏并只复制 diagram SVG；全屏 viewer 支持指针拖动、以光标为锚点的滚轮缩放、工具条缩小 / 放大 / 复位，以及键盘 `+` / `-` / `0` / 方向键；修复 diagram SVG 全宽规则误伤工具按钮导致图标放大 / 越界；代码主题继续由 Settings 配置。
- [x] Artifacts / media：单轮多图片 / 多视频改为全宽自适应 gallery；同批图片 lightbox 支持前后按钮、左右键和序号；支持产物继续使用连续紧凑清单。无 URL 的 video / audio、生成中 diagram 与 Base 不再形成等高空卡片；附件与正文 wikilink 复用 Vault 内容预览。
- [x] Composer / layout：附件只显示文件名并保留完整路径帮助文本；explicit wikilink 与 shelf 同步；Convert-to-project 与正文 / Composer 共用阅读宽度。
- [x] QA：生产组件画廊覆盖连续 topic、三步 Agent Run、5-span trace、表格、代码、Mermaid，以及单轮 4 image / 3 video / 3 audio 和多 table / CSV / code / document / diagram / Base receipts；`npm run test` 212/212 通过，生产构建通过；既有 Chat Studio 视觉回归已完成，本轮 Mermaid viewport 数值测试通过，Obsidian 主窗口因应用自身无响应暂未完成新增交互的鼠标复核。

## Phases

| Phase | Content | Status |
|-------|---------|--------|
| A. 产品断点修复 | 用户旅程中 blocks-usage 的问题 | 完成 (6/6) |
| M. 移动端支持 | iCloud同步 + 去RAG + Claude长上下文 | 完成 (11 commits) |
| B. UX 打磨 | degrades-UX 的问题 + ui-improvements | 完成 (16项) |
| C. 技术债清理 | 死代码/桩代码/注释代码/空文件 | 完成 (9项修复 + 56文件/10800行删除) |
| D. 代码拆分重构 | 大文件拆分 | 完成 (7大文件→23小文件) |
| E. 文档清理 | 归档docs、标记计划、更新过时文档 | 完成 |
| V1 退役 | 删除 V1 search pipeline + step UI | 完成 (-9000行) |
| H. 后台多 Session | 关闭 modal 继续分析 + 多 session 并发 + Active Sessions UI | 完成 (11 commits) |
| F. Provider v2 | 删 Vercel AI SDK → Agent SDK query() | 完成 (12 files deleted, 7 packages removed, ~3700 lines) |
| G. Agent Trace | 可观测性: TraceSink + fixture vault + MCP server + CLI harness + scenarios | 完成 (15 tasks, 100+ test assertions) |
| K. Chat System Polish | Store 重构 + Input 拆分 + 会话管理 | 完成 (4→2 stores, 453→176 ChatInputArea, #93 delete) |
| I. Query Pattern Discovery | LLM 驱动查询模式发现 + 上下文建议 | 完成 (12 commits) |
| J. Vault Search Redesign | VS Code 风格 inspector side panel | 完成 (6 commits) |
| L. Chat UI Redesign | 消息列表/工具调用/首页/会话列表/输入菜单/大纲 | 完成 (15 tasks, 11 new components) |
| N. FileIcon 统一 | 扩展类型 + 删冗余函数 + 迁移调用点 | 完成 |
| O. Search Polish | #90 open-in-new-tab, #79 query summarization, #76 save graph | 完成 (3 tasks) |
| P. Copilot Doc Intelligence | #42 polish, #33 review, #38 links, #36 split | 完成 (9 tasks, 4 commands, 4 panels, 8 prompts) |
| Q. Onboarding & Native Module | NativeModuleManager + Setup Wizard + SQLite 懒加载 | 完成 |
| R. Streaming 内存修复 | 6 条流式路径 RAF 节流 + O(n²)→O(n) 内存优化 | 完成 (17 files) |
| S. UI 稳定性批量修复 | 15 个 RC 全量修复：错误处理/Chat UI/AI 列表/Copilot/Settings/Profile-Model/Quick Actions | 完成 (7 waves, 9 commits) |
| T. Vercel AI SDK 恢复 | 双轨 dispatch + Chat role + 模型路由修复 + 白闪修复 + typewriter 流式 | 完成 (12 commits) |
| U. Chat UI v9 + 智能功能 | Message UI 重构 + 换模型重新输出 + Topic 聚合 + Suggested Follow-ups + Outline 修复 + bug fixes | 完成 |
| W. Copilot 扩展 | 5→15 actions，注册表架构，分组 UI + 上下文推荐，Document/Vault/Writing 三类 | 完成 |
| X. Model Selection 统一 | Provider 卡片简化 + Agent Fast pill + Ollama 动态模型 + baseUrl 修复 | 完成 |
| X2. Provider Settings Polish | Pill 搜索面板 + AddProfileGrid 去重 + 凭证显示修复 + authToken fallback | 完成 |
| X3. Profile authToken 清理 | 删除 authToken 字段 + 统一 apiKey + 迁移 legacy data + OpenRouter baseUrl 修复 | 完成 |
| Y. Token Usage Dashboard | 全站 AI 调用追踪 + SQLite 持久化 + 统计面板（KPI/趋势/分布/明细） | 完成 |
| Z. Mockup Gap 补全 | @菜单面包屑/分组/元数据、/菜单模板分组、工具栏响应式、智能建议、Diff高亮、变量高亮 | 完成 (8 commits) |
| AA. 代码库精简 | 71.2k→66.7k (-4,485行): 死代码删除 + 算法简化 + 架构重构 + 冗余压缩 | 完成 (24 commits) |
| AB. Search Pipeline Upgrade | QueryParser + 5 Retrievers + adaptive RRF + HighlightEngine + stemming + fuzzy + click-through | 完成 (19 tasks, 19 commits) |
| AC. Onboarding Index Config | 4步Onboarding + 三档索引(fast/semantic/full) + Settings面板 + 智能升级提示 | 完成 (7 tasks, 7 commits) |
| AD. P0-P1 批量执行 | authToken 清理 + Plan 模式移除 + Usage Dashboard 恢复 + 动态能力感知 | 完成 (4 commits) |
| AE. Copilot Agent Loop | 4 action (suggest-links/knowledge-gaps/synthesize-topic/add-evidence) 升级为 agent loop + 步骤展示 UI | 完成 (9 commits, 13 files, +832 lines) |
| AF. Inspector Tools Overhaul | Schema 重设计 + find-path 拆分(1→5 文件) + 类型化 params + forceFormat + 描述重写 | 完成 (12 tasks, 12 commits) |
| AG. Report UI Polish | V2InlinePlanReview sticky footer（flex 布局） | 完成 (1 commit) |
| S1. Ambient Push Phase 1 | FTS5 pipeline + 模板解释 + 侧边栏面板 + SQLite 日志 + 状态栏 | 完成 (10 tasks) |
| S1. Ambient Push Phase 2 | 图谱 2-hop 扩展 + shared_tag/graph_neighbor/co_citation/hub_member 信号 + 反馈学习 | 完成 (7 tasks, 7 commits) |
| S1. Ambient Push Phase 3 | Serendipity Engine: CM6 gutter + 偶然发现算法 + LLM 微解释 + 跨会话模式学习 | 完成 (10 tasks, 8 commits) |
| S1. Ambient Push 可见性 | 首次启动自动打开右侧栏 + 布局切换不覆盖 AmbientPush tab | 完成 |
| AH. Provider MCP Phase 1-3 | Model Registry JSON 化 + 自定义 OpenAI 兼容端点 + MCP Client (stdio/SSE) + Settings UI | 完成 (12 tasks, 12 commits) |
| AI. MCP Spike | @modelcontextprotocol/sdk 可行性验证 — GO (所有 transport 可用, +450KB) | 完成 |
| S1. Ambient Push Phase 4 | Morning Briefing: 启动时每日简报弹窗（未解决连接+变化Hub+衰减笔记） | 完成 (7 commits) |
| AJ. Provider MCP Phase 4-5 | Skill System（Registry+Parser+Executor+Picker UI）+ Usage Dashboard 定价同步 | 完成 (7 commits) |
| S2. Vault Lint | Health Check: 5 信号检测器 + VaultXRayView + ScoreRing + 配置模板 | 完成 (7 tasks) |
| S5. PPR Tuning | Co-citation 第 4 层 + query-node seeding + Settings UI + 评估命令 | 完成 (4 tasks) |
| S7. Auto-tag | Schema 修复 + 反馈持久化 + batch 模式 + FolderPicker | 完成 (4 tasks) |
| S3. Cascade Update | hub_constituent 表 + CascadeWorker 补全 + folder_stats + hub_regen stub | 完成 (8 tasks) |
| S4. Structural Hole | Brandes BC + Louvain + Burt constraint + Gap Analysis UI + bridge actions | 完成 (8 tasks) |
| S6. Precompiled Knowledge | HubStalenessDetector + HubRegenService + hub_regen_queue + reranker boost | 完成 (6 tasks) |
| AK. Agent Harness Curator Onboarding | Curator agent + 22-model catalog + zod validation + fallback + 9-step wizard（Welcome / Provider / Bootstrap / Preferences / Running / Review / Edit / Redo / Done）+ 接受写入 HarnessSettings | 完成 (3 commits, 56 tests, +3,614 lines) |
| AL. Design System Unification | PR-0 地基（tokens + 10 共享原语 CSS + 9 React 薄壳 + telemetry/capabilities/templates 脚手架）+ Copilot skin + 3 worktree 并行（chat 4 PR / dashboard 4 PR / onboarding+settings 5 PR）+ 3 路 merge into master | 完成 (21 PR, master @ d2bdf42) |
| AM. Onboarding Polish & Convention Refactor | Onboarding 视觉回归批量修复（Pill→Button CTA / provider-row flat / bootstrap card 等高 + inline Recommended / Obsidian button leak `!important` 防线）+ Curator rationale 去中文（fallback.ts + prompt.ts，国际化前 English-only）+ 5 条 design-rule 文件合并为单文件 `docs/conventions/ui-design.md`（§1 tokens / §2 primitives / §3 usage / §4 Obsidian defense / §5 JSX-mock）+ CLAUDE.md Project Rules 6→2 行 pointer-only | 完成 (8 commits ec5491a..504739f + Chinese fix uncommitted) |
| AO. Knowledge Center 退役 + Palette 收口 (2026-06-11) | KnowledgeCenterView 的 11 项杂物分流完毕：(1) 运维 → Settings → Advanced → Maintenance（已搬，PR-5/2026-06-07）；(2) AI 洞察 → Copilot Vault tab capabilities（Smart Connections / Knowledge Gaps / Vault Health 等）；(3) 独立画布 view → palette 命令。彻底删除：`src/ui/view/knowledge-center/` 目录、ViewManager 中 viewCreator + `activateKnowledgeCenterView`、`types.ts` 中 `KNOWLEDGE_CENTER_VIEW_TYPE` 常量 + STANDALONE 数组项、两条墓碑注释。修正误导文案：`indexInitializer.ts` 两条 Notice + `tab-VaultSearch.tsx` EmptyState 全部指向 Settings → Advanced → Maintenance。**Palette 加 4 个独立 view 入口**：`peak-vault-xray` / `peak-gap-analysis` / `peak-related-notes` / `peak-batch-tag`（之前对应的 `open*()` 函数自 KC 删除后是孤儿，无 UI 入口）。删孤儿 `openDocumentCopilotPanel` / `openVaultIntelligencePanel` / `openManageSystemPanel`。**架构原则确立**：Palette = 真正入口；Copilot Vault tab = agent stream capability（保持范式纯粹，不混"打开 view"快捷方式）；不再加"聚合 view"。Build 通过，main.js 验证 KC 残留全清、新命令进 bundle。 | 完成（未 commit） |
| AN. Chat Studio UI Polish (2026-06-03) | 三块区域基于 mock 重做：(1) 左侧 sidebar — `ProjectListView` 加 Peak Assistant brand bar + ⌘K kbd badge；`ProjectsSection`/`ConversationsSection` heading 统一 11px/600/wider/muted；active row 从实色 `--pk-accent-soft` 改 lavender `--pk-accent-tint` + 2px 左竖条 via `::after`。(2) Composer 三态 — `ComposerRetained` data-status attribute；sending 状态 inline 渲染 progress bar (`::before`/`::after` 紫色 slide 动画) + spinner + "Planning and writing…" 状态行；stop 按钮 `pkchat-send--stop` 浅灰 `--pk-surface-sunken` bg + 10×10 实心方块（不再红 destructive）；新加 `streamingStatus` 字符串到 `chatStrings.ts`。(3) `ConversationIndex` 重写 (857→780 行) — 4 tabs → 2 tabs (Overview / Artifacts)，drop Topics + Messages；`Segmented` pill → 自制 underline 风格 tab（label 内 span，下划线只覆盖文字宽）；新建 `pkchat-idx-row` 通用对齐 grid `[8 pad][16 chev gutter][12 gap][26 main icon][12 gap][body][time]`；`TopicBlock` 可折叠 + vguide 1.5px lavender + progress capsule 64×5；`buildMixedTimeline` + `interleaveNested` helpers，artifact 按 messageIndex 嵌入 topic nested；artifact meta line `Kind · {topic chip}`；`ArtifactsTabBody` 按 kind 分组（Images/Diagrams/Files/Code）；旧 pkchat-idx-topic/msg/art CSS 死代码（515 行）删除。(4) `MessageAttachmentsList` 完全重写 — 14 种 file kind 配色（PDF/CSV/XLSX/DOCX/PPTX/JSON/MD/TXT/ZIP/HTML/XML/EXC/CNV/DIR）；图片网格 1/2/3/4/5+(hero+thumbs)/8+(+N overlay)；文件 ≤4 卡片堆叠 / >4 chip cluster；URL host-specific OG thumb（github → opengraph.githubassets.com，其他 → DuckDuckGo favicon，失败 → 渐变+Globe 兜底）；`pk-attach-card`/`pk-attach-chip`/`pk-attach-url` CSS class（base + hover 一起定义）；URL hover 禁用，inline 卡片承担信息。(5) `DebugCommandActions.ts` 新临时 command `[Debug] Load mock conversation for index preview` — 22+ 条 mock messages 推 in-memory store，新增 "Resource layout showcase" topic 含 21 个 layout 变体（L1–L21）+ Mock 04 HTML permutation catalog (35 variants in `docs/gstack/chat-split-components-2026-06-03/mocks/`)。 | 完成（未 commit，9 files modified + 1 new + 4 HTML mocks） |
| AP. Usage Dashboard 复刻 mock 全量收尾 (2026-06-11) | PR-Dash-1/2/3/4 留下的 3 个 surface gap 一次性补完（mocks 在 `docs/gstack/usage-dashboard-mockups-2026-05-29/`，决策 spec §11 在 `docs/superpowers/specs/2026-05-29-usage-dashboard-insights.md`）。**数据层**：`HarnessSettings.budget = { monthlyUsd, resetDayOfMonth, alertRules[] }` 接入 + `PluginSettingsLoader.sanitizeBudget()` 兼容 legacy；`UsageTrackingService` 加 `getMonthlyPace`（按 resetDay 算 cycle，线性 projection）/ `getCostPerSavedArtifact`（cost / strong-outcome 数 + 期内对比 delta）/ `getThisWeekTrio`（spend/tokens/cost-per-saved sparkline 三联）；`UsageOutcomeService` + `UsageOutcomeRepo` 加 `adoptedCountByDay`（per-day saves 喂 sparkline）。**Curator**：新 `src/service/usage/optimization/`（10 文件）— types / zod schema / `rules.ts` 4 条确定性规则（quick→cheap model swap / compact threshold ↓ / no-outcome high-cost review / silence low-cost pip）/ prompt（system + signals dump）/ `UsageOptimizationService.ts` 总调度（LLM + retry → fallback rule engine，返回 Recommendation[] + ProjectionSnapshot + 3 个 Scenario）；main.ts boot/destroy 接入。**原语**：`components/charts/` 加 7 个 — `PaceBar`（pace 条 + projection mark + legend）/ `Sparkline`（200×H SVG，currentColor 着色）/ `Toggle`（aria-pressed 双轨）/ `Field`+`NumberField`（loose-while-focused 数字框 + ± 步进）/ `RecommendationBlock`（num + title + impact 徽 + detail dl + evidence 表 + Apply/Preview 侧栏）/ `ScenarioRadio`（Conservative/Balanced/Aggressive 单选）/ `RuleRow`（leading/main/trailing 三栏通用）；`dashboard-charts.css` 加 600+ 行配套规则（含 pk-badge / pk-btn / pk-rec-block / pk-scenario / pk-trio / pk-row-3 / pk-row-opt / pk-preview-card / pk-ring-large 等）。**屏幕**：(1) Overview 替换原 MPG+Funnel+Outcome breakdown 三段 → mock 的 4 KPI（Budget pace w/ pace 条 + Context risk ring + Cost/saved w/ delta + Calls w/ spark）+ 底部 1.6:1 split（Recommended actions feed from Curator + This week sparkline trio）；新建 `useOverviewSnapshot` 聚合所有 async 输入；(2) BudgetAlerts 4 sections 全实现 — Monthly budget（NumberField + PaceBar + 周期标 + reset day prompt）/ Alert rules（4 Toggle + edit thresholds + test）/ Model defaults（Quick/Deep/Premium 行）/ "What users will see" 3 张预览（Budget@40% / Context@70% warn / Agent receipt）；全部 writeback `plugin.saveSettings`；(3) Optimization 2 列布局 — 左侧 ranked RecommendationBlock list + SavingsDial footer（apply%/$）+ source 标签（LLM vs rules）；右侧 Projection 卡（without/with delta + budget pace 条）+ ScenarioCard。**Strings**：`templates/config/dashboard.json` + FALLBACK_STRINGS 加 budgetPace/contextRisk/costPerSaved/calls/recommendedActions/thisWeek + budgetAlerts.* + optimization.* 完整 i18n 字段。**顺手修**：`AISetupTab.tsx` 3 处 + `ProfilesTab.tsx` 1 处 inline HarnessSettings literal（缺 budget 编译报错）统一 `?? DEFAULT_HARNESS_SETTINGS`。Build 通过；`tsc --noEmit` 新代码 0 错误，剩下都是 master 上 TemplateManager.getInstance 等 pre-existing 噪音。 | 完成（未 commit，9 modified + 15 new + 2 settings-tab 顺手修） |
| AQ. Architecture Modernization Prep + T0 (2026-06-12) | pre-large-refactor checkpoint + tag；`docs/superpowers/refactor-ops/` operating playbook；12 维 architecture scorecard；T0 boundary baseline scanner（819 files / 423 flagged edges）；T0 owner review packet accepted；确认后续 Codex 负责报告/审计/设计，Claude Code 只做 bounded implementation。 | 完成（branch `codex/peak-modernization-refactor`，T1 handoff ready） |

## Next

### 0. Active — 2026-07-03 Full Backlog Sweep

按 `docs/superpowers/plans/2026-07-03-full-backlog-execution-plan.md` 依 DAG 拓扑推进；判断依据记 `docs/superpowers/plans/2026-07-03-execution-decisions.md`。

- [x] **S-H1 · Search Highlight Original Text Repair spec (2026-07-06)** — 新增 `docs/superpowers/specs/2026-07-06-search-highlight-original-text-repair.md`，把 Vault Search snippet 显示 normalized / segmented content 的问题拆成 implementation-ready 需求：final topK 后回查 `doc_chunk.content_raw` / Vault raw text、保留 `chunkId`、raw-first highlight、normalized span mapping fallback、debug source kind、验收测试；`12-feature-search.html` 已链接该 spec，并补充 PPR 读法和 troubleshooting bad case。
- [x] **A0 · 文档标签同步 (2026-07-03)** — `01-architecture.html` §trace-artifact 表 `Artifact 统一` / `Trace 事件统一` 两行 `partial` → `landed`，正文改成 "ArtifactPort + InMemoryArtifactStore 已 landed，Vault-backed 实现见 B6" / "RunEnvelope + 8 adopter + golden-trace-cross-backend 已 landed"；`roadmap.html` §decided 删掉 "Feature 文档 14 / 15 / 13" 一行（三份 doc 都在 `index.html` 有真 link），"AN / AO / AP 收尾" 一行 `pending commit + QA` → `landed 未验证`；`index.html` L130 陈旧文案 "灰色标 planned 的还没写，其他都可点击" → "15 份根目录文档按主题分三组，全部已 landed"。
- [x] **E1 · 05 playbook Case 3/4/9 (2026-07-03)** — Case 3 (Vault 主题总结) / Case 4 (AI Graph 关系视图) / Case 9 (Context-aware answer) 三段 recipe 补齐详细步骤 + 成功结果 + 降级路径，pill 从 `待补详细文档` / `待抽基础设施文档` 改为 `已在代码中确认`；正文补上 Vault Intelligence scan 触发路径、AI Graph 的 hover/community/bridge 交互、Context Pipeline activeFile/recentMessages/focusFolder 装配顺序与降级策略，链接指向 13 / 22 / 23 / 11。
- [x] **B7 · IndexService Graph slice (2026-07-03)** — 新增 `src/core/ports/IndexGraphPort.ts`，6 个 graph-mutating method（`runMobiusGlobalMaintenance` / `refreshMobiusAggregates` / `recomputeVaultPageRank` / `recomputeSemanticPageRank` / `rebuildSemanticEdgesForTenant` / `rebuildFolderHubStats`）；`IndexService` 加 `implements IndexGraphPort`，新增 5 个 public wrapper 委托到既有 `*Internal` 私有实现；`test/index-graph-port.test.ts` 4 条 guard（shape / boundary / implements / stub）。为 B2.graph / D3 等后续 graph consumer 提供狭窄 port，不必依赖整个 IndexService。
- [x] **B6 · Vault-backed ArtifactPort (2026-07-03)** — `src/service/run-envelope/VaultArtifactStore.ts` 落地 `ArtifactPort`，通过 `VaultWriterPort` 写 `<root>/<runId>/<artifactId>.<ext>`（默认 `.peak/artifacts/`），meta 汇总到 `<root>/artifact-index.json`；ContentType→ext 映射 markdown/.md、trace-json/.trace.json、application-json/.json、text-*/.txt、default/.json；putArtifact 排队串行化以防并发导致 index race；冷读走 index.json 反查文件路径。测试 3 条 guard（parity vs InMemoryArtifactStore、冷读现有 vault、并发 put 保证不丢）。barrel `service/run-envelope/index.ts` 加 export；`run-envelope-core.test.ts` allowed set 加 `./VaultArtifactStore`。
- [x] **B4 · PermissionGuard 消费 skill quarantine (2026-07-03)** — `AgentLoop` tool dispatch 点在既有 (1) permission.check 之后加 (1b) skill-quarantine check：读取 `cfg.compiledSkill`，`checkSkillQuarantine(compiled, def.name) !== 'allow'` 时返 `fail('skill-quarantine: <reason>', false)`，工具不实际执行、trace 打 `tool_result ok=false`。AgentLoopConfig 新增 `compiledSkill?: CompiledSkill` 字段。`test/harness-skill-quarantine.test.ts` 4 条 guard（strict 拒绝白名单外 tool / strict 放行白名单 tool / permissive pass-through / 未传 skill 时保持 legacy 行为）。UI toast 推迟到 Wave 3 UI store 迁 RunEnvelopeStore 时统一，从 trace event 派生（避免这里绑 obsidian）。
- [x] **B1 · CommandGateway wire-in (2026-07-03)** — 7 个 palette 命令（Quick Search / Copilot / Review History / Chat Studio / Usage Dashboard / Setup Wizard / Settings）现在走 `CommandGateway.dispatch(id)`：`src/app/commands/gateway/manifests.ts` 定义 7 个 CapabilityManifest（`ui.open.*` id / `surface-binding` 按 feature 归组 / `backendPolicy.preferred=provider-direct`），`composeCommandGatewayBindings` 用 `surfaceOpenStrategy` 把每条 UI-open callback 包成 CapabilityRunOptions.execute。`main.ts` 新增 CommandGateway 构造 + register 所有 binding + Obsidian `addCommand.callback = () => gateway.dispatch(id).catch(→ Notice)`；AppRuntimeRegistry/AppContext 新增 setCommandGateway/getCommandGateway/tryGetCommandGateway/clearCommandGateway。`test/command-gateway-wire-in.test.ts` 4 条 guard（manifest 与 binding 顺序 diff、每条 dispatch 恰调用一次对应 action、未知 commandId fail-loud、main.ts 结构性 wire-in 存在）。旧 `buildCoreCommands` 仍导入但 `void`，等下次 cleanup pass 删。
- [x] **B3 · Backend live strategies (2026-07-03)** — `src/app/composition/registerBackendStrategies.ts` 从 `ProfileRegistry` 快照按 provider 可用度组装 `BackendStrategyRegistry`：`hermes-harness` 只要任一 profile 有 apiKey（或是 ollama）就注册（直接调 `runAgentLoop`）；`claude-sdk` 需要 anthropic profile 有 apiKey **且** composition 侧提供了 `sdkQueryAdapter`；`provider-direct` 需要任一 profile 有 apiKey **且** 提供了 `providerStreamAdapter`。三个 backend 用 discriminated `BackendInvocationInput` 分派，喂错 shape fail-loud。`main.ts` boot 时 call `registerBackendStrategies({ profileRegistry })`；`sdkQueryAdapter` / `providerStreamAdapter` 留空，等 Wave 1 B2.chat / B2.copilot 落地时补。`test/register-backend-strategies.test.ts` 7 条 guard（无 provider / anthropic 全部 / openai-only 缺 claude-sdk / ollama 无 key / disabled profile / 缺 adapter / hermes-harness 拒绝错 shape）。

**Wave 0 complete (7/7). Wave 2 lint detectors kicked off:**

- [x] **C-C1 · C-OVERSIZED (2026-07-03)** — 内容维度的规则型检测器：单文档 stripped prose word count ≥ config.thresholds.oversizedMinWords（默认 5000）触发，severity=info，fixActions=['suggest-split']。`src/service/lint/signals/content.ts` 加 `buildOversizedDetector` + `strippedWordCount` 辅助；`buildContentDetectors` 加进 emit 序列；`InMemoryDetectorRegistry` 自动挑起来（走 `buildContentDetectors` 已注册路径）。`test/vault-lint-detectors.test.ts` 新增 3 条 guard（阈值临界+超过 / dismissals / strippedWordCount）。顺手把 `strippedLength` 与 `strippedWordCount` 抽同一 `strippedProse` 底座并补 `.trim()` 保持既有 empty 判定语义。
- [x] **C-C3 · C-FRONTMATTER-MISSING (2026-07-03)** — 内容维度规则型检测器：任何 markdown 首块不是 `---\n<yaml>\n---` 结构就 fire (`add-frontmatter` fix action)。`frontmatterMissingDetector` + `hasFrontmatter(content)` 用严格 regex 只匹配开头合法 YAML block，body 中间的 `---` 分隔线不误判；empty file 也 fire（也需要 frontmatter）。`test/vault-lint-detectors.test.ts` 新 3 条 guard（有/无/body 分隔线 / dismissals / hasFrontmatter helper 边界）。
- [x] **C-C4 · C-NAMING-VIOLATION (2026-07-03)** — 内容维度规则型检测器：basename 匹配 `/^Untitled(\s+\d+)?$/i` / 空 basename / leading-trailing whitespace 三条规则触发。`namingViolationDetector` + `detectNamingViolation(basename)` pure helper 使规则可脱离 detector 单测。刻意留窄，不打 kebab-case / no-spaces 之类风格战；vault 有既定命名的用户可以 dismiss 单条。fixActions=['rename-with-prefix']。`test/vault-lint-detectors.test.ts` 新 3 条 guard（触发/dismissals/helper 边界）。
- [x] **C-G1 · G-TAG-EXPLOSION (2026-07-03)** — 标签维度规则型检测器：单文件总标签数 ≥ `vault median × multiplier`（默认 5×）触发。median 只从有标签的文件里算，避免大量 untagged 文件把 baseline 拉到 0；tagged files 少于 3 时 detector no-op（vault typical 未成立）。`VaultLintConfig.thresholds` 新增 `tagExplosionMultiplier`（type + default 5，与 template JSON 已有值对齐）。`buildTagDetectors(config)` 出 `[untaggedDetector, tagExplosionDetector]`；`InMemoryDetectorRegistry` 走同 `buildContentDetectors` 的 anchor 模式（`G-UNTAGGED` 已注册就 skip）。`test/vault-lint-detectors.test.ts` 新 3 条 guard（median 计算 + 阈值 / 少标签 no-op / dismissals）。

### 0. Active — 2026-07-03 Full Backlog Sweep 续跑

_（用户要求"不要停"续做；不再逐节点追加流水，见 `docs/superpowers/plans/2026-07-03-full-backlog-execution-plan.md` § tracker 内 SHA 引用。）_

- [x] Wave 1 · B2.chat / B2.copilot / B2.analysis / B2.harness / B2.index / B2.cascade / B2.graph — 全部 7 节点走 RunEnvelope，各自加 wire-in test 防 regression
- [x] Wave 2 · C-HUB1 / C-S1 / C-S2 / C-S3 / C-S4 / C-C2 / C-T1 / C-T2 (folder slice) / C-T3 · 8 个 detector 补齐，port surface 加 `listDocDegrees` / `getResolvedLinks` / `listCommunities` / `getStaleHubs`，config 加 5 个 threshold
- [~] Wave 2 · C-HUB2 (HubDoc regen 实装) + T-ABANDONED-CLUSTER · 需要更大 pipeline / community-mtime aggregation，本 session 未做
- [x] Wave 6 · E2.1 (Command Gateway 章节) + E2.2 (Unified 决定不收敛)
- [x] Wave 6 · R1-R11 · 11 份研究报告全部落地 `docs/research/2026-07-03-*/README.md`，`roadmap.html` §researching 同步 11 行

**41 / 56 节点 landed（Wave 0 全 7 + Wave 1 全 7 + Wave 2 12/14 + Wave 6 全 13 + Wave 5 D4 未起）。**

未做：Wave 2 · 2；Wave 3 · 4（UI store 迁 RunEnvelopeStore，需要真机跑）；Wave 4 · 4（产品级 UI 改动，需要设计 + 真机）；Wave 5 · 7（LLM budget infra + 6 LLM detector + D4 Multimodal，需要产品 + budget infra）。

### 0. Active — 2026-07-03 Full Backlog Sweep 续续跑

_（用户第三次驱动"全都执行 / 你肯定可以一直执行"续做；再收 6 个节点。SHA 引用同 plan 里 tracker 表。）_

- [x] Wave 5 · C-M1 / C-M2 / C-M3 / C-M4 / C-M5 / C-M6 · 6 个 `M-*` LLM detector stub 落地：`src/service/lint/signals/semantic.ts` 每个 detector 挂 `requiresLlm: true`，`InMemoryDetectorRegistry.ensureInitialized` 走 `buildSemanticDetectors` 注册但 `getNonLlm()` 天然跳过，`detect()` 返 `[]` 直到未来 LLM budget/throttle infra 落地翻转开关。`test/lint-semantic-detectors.test.ts` 4 组 guard（6 个 id 注册 / getNonLlm 排除 / stub 返 `[]` / ensureInitialized 幂等）。commit `62a9cb97`。
- [x] Wave 2 · T-ABANDONED-CLUSTER · 通过扩展 `MobiusNodeRepo.listDocDegreesForLint` 输出 `community_id`（走已有 `mobius_node.community_id` index）+ `VaultLintDetectorDocDegree` 加 `communityId?: string | null`（可选保护老 fixture 不 churn）+ `buildAbandonedClusterDetector` 按 communityId 分组、取最新 mtime 交叉 `listCommunities()` 的 label/memberCount。3 条 guard（老 community fires / tiny+unassigned skip / dismissals 生效）。commit `db43e788`。
- [x] Wave 3 · B5.chat · 新 `src/ui/store/chatRunEnvelopeStore.ts` 组合 `InMemoryRunRecorder` + `RunEventProjection` + `RunEnvelopeStore`，预注册 4 个 derive: `chat.lastStatus` / `chat.isStreaming` / `chat.activePhase` / `chat.latestArtifact`。selector 是纯函数导出，`registerChatDerives(store)` 兜底外部 store 组合。4 组 guard 测试。commit `3ba84023`。
- [x] Wave 3 · B5.copilot / B5.analysis / B5.harness · 抽 `src/ui/store/featureRunEnvelopeStore.ts` 共享工厂，chat 重写为 factory 上的 wafer-thin 封装。copilot / analysis / harness 3 个 store 都是同一 pattern 的 5 行封装。`test/feature-run-envelope-stores.test.ts` 覆盖 (a) derive id 跨 feature 唯一 / (b) 4 store 行为一致 / (c) 4 registrar 组合到同一 store 无冲突 —— 一个 UI shell 可以订阅所有 feature 的进度。commit `514fe3e8`。UI 组件切 `useSyncExternalStore` 属真机 follow-up。

**47 / 56 节点 landed（Wave 0/1/3/6 全部 + Wave 2 = 13/14 + Wave 5 = 6/7）。**

剩余 9 个 (C-HUB2 + Wave 4 全 4 + D4 Multimodal) 都属 product-scale / 需 LLM adapter+templates / 需真机测试，session 内继续做只会引入未测行为，故停在这里。

### 0. Active — Architecture Modernization T1-T9

- [x] T0 Boundary Baseline 完成：`9850eef` + Owner Review `667bfdd`
- [x] T1 Vault Lint Contract Seed handoff ready：`docs/superpowers/refactor-ops/t1-vault-lint-contract-seed-handoff.md`
- [x] T1 implementation 完成并接受：`3626c48` + Owner Review `docs/superpowers/audits/2026-06-12-t1-owner-review-packet.md`
- [x] T2 First Port Sketches draft ready：`docs/superpowers/refactor-ops/t2-first-port-sketches-draft.md`
- [x] T2A ProgressReporterPort first slice 完成并接受：`f9cf49f` + Owner Review `docs/superpowers/audits/2026-06-12-t2a-owner-review-packet.md`
- [x] Owner-facing refactor docs 改为中文优先：解释层中文，代码名/commit/test/接口名英文
- [x] Code Reading Guide 规则加入 refactor-ops：每轮代码改动必须列 changed code files、阅读顺序、关键符号、debug 入口
- [x] Mutable Global State 规则加入 refactor-ops：禁止 `let defaultX = null` 这类可变全局默认值散落在 service/core/port 文件；T2 的 `defaultReporter` 只作为临时妥协
- [x] T2B IndexInitializer ProgressReporterPort follow-up handoff ready：`docs/superpowers/refactor-ops/t2b-index-initializer-progress-reporter-handoff.md`
- [x] T2B implementation 完成并接受：`fbf8a56` + review fix `79478b0` + Owner Review `docs/superpowers/audits/2026-06-12-t2b-owner-review-packet.md`
- [x] T2C AnalysisDocPersistence Notice cleanup handoff ready：`docs/superpowers/refactor-ops/t2c-analysis-doc-persistence-notice-cleanup-handoff.md`
- [x] T2C implementation 完成并接受：`2e97eac` + Owner Review `docs/superpowers/audits/2026-06-12-t2c-owner-review-packet.md`
- [x] T3A RunEnvelope Core handoff ready：`docs/superpowers/refactor-ops/t3-run-envelope-core-handoff.md`
- [x] T3A RunEnvelope Core 完成并接受：`3626e29` + review fix `bf42673` + Owner Review `docs/superpowers/audits/2026-06-13-t3a-owner-review-packet.md`
- [x] T4 Vault Lint RunEnvelope vertical slice handoff ready：`docs/superpowers/refactor-ops/t4-vault-lint-run-envelope-vertical-slice-handoff.md`
- [x] T4 implementation 完成并接受但粒度偏保守：`4d68724` + Owner Review `docs/superpowers/audits/2026-06-13-t4-owner-review-packet.md`
- [x] T5 Vault Lint Runtime Closure Wave handoff ready：`docs/superpowers/refactor-ops/t5-vault-lint-runtime-closure-wave-handoff.md`
- [x] T5 implementation 完成并接受：`eb45195` + Owner Review `docs/superpowers/audits/2026-06-13-t5-owner-review-packet.md`
- [x] T6 Vault Lint Ports + Plain Service handoff ready：`docs/superpowers/refactor-ops/t6-vault-lint-ports-service-plain-class-handoff.md`
- [x] T6 implementation 完成并接受：`89e0406` + Owner Review `docs/superpowers/audits/2026-06-13-t6-owner-review-packet.md`
- [x] 用户指出 T6 review fix：`VaultLintRuntime.currentRuntime` 不应长期留在 service 层；`DEFAULT_VAULT_LINT_CONFIG` 不应放在 engine 文件
- [x] Config Defaults Governance doc ready：`docs/superpowers/refactor-ops/config-defaults-governance.md`
- [x] T6R Runtime Ownership + Config Defaults handoff ready：`docs/superpowers/refactor-ops/t6-review-fix-runtime-ownership-config-defaults-handoff.md`
- [x] T6R implementation 完成并接受：`abb968d9` + Owner Review `docs/superpowers/audits/2026-06-13-t6r-owner-review-packet.md`
- [x] Runtime Ownership / Config Defaults 两条规则写入 `AGENTS.md`、`CLAUDE.md`、`docs/conventions/configurability.md`、handoff template、owner review template
- [x] T7 Vault Lint Detector Context Closure handoff ready but superseded：`docs/superpowers/refactor-ops/t7-vault-lint-detector-context-closure-handoff.md`
- [x] T6R+T7 combined closure-wave draft captured but paused：`docs/superpowers/refactor-ops/t6r-t7-vault-lint-foundation-closure-handoff.md`（不是当前 handoff）
- [x] T7 Vault Lint Foundation Completion Wave handoff ready：`docs/superpowers/refactor-ops/t7-vault-lint-foundation-completion-wave-handoff.md`
- [x] T7 implementation 完成并接受：`32fde24b` + `216dd431` + Owner Review `docs/superpowers/audits/2026-06-13-t7-owner-review-packet.md`
- [x] T7 结论：Vault Lint foundation closure 完成；不要继续做 Vault Lint 微小 polish，除非有 bug
- [x] T8 Ambient Foundation Runtime Boundary Wave handoff ready：`docs/superpowers/refactor-ops/t8-ambient-foundation-runtime-boundary-wave-handoff.md`
- [x] T8 implementation 完成并接受：`a1789056` + `e20bbce7` + `85f20917` + Owner Review `docs/superpowers/audits/2026-06-13-t8-owner-review-packet.md`
- [x] T8 结论：Ambient foundation runtime boundary 完成；`AmbientPushService` / `MorningBriefingService` 旧 singleton 退役；不要继续做 Ambient 微小 polish，除非有 bug
- [x] T9 target 已选择：Copilot Vault Digest / Review runtime boundary wave
- [x] T9 Copilot Vault Review Runtime Boundary Wave handoff ready：`docs/superpowers/refactor-ops/t9-copilot-vault-review-runtime-boundary-wave-handoff.md`
- [x] T9 implementation 完成并接受：`d606005b` + `bbbdb95d` + `9f53d970` + Owner Review `docs/superpowers/audits/2026-06-13-t9-owner-review-packet.md`
- [x] T10 target 已选择：Quick Search Background Session Runtime Boundary Wave
- [x] T10 Quick Search Background Session Runtime Boundary Wave handoff ready：`docs/superpowers/refactor-ops/t10-quick-search-background-session-runtime-boundary-wave-handoff.md`
- [x] T10 implementation received：`5a21111b` + `c2c153cb` + `2daa8b3f`
- [x] T10R review fix 完成：`20bbd79f` restore entrypoints（Notice click + Active Sessions click）
- [x] T10 implementation 完成并接受：Owner Review `docs/superpowers/audits/2026-06-14-t10-owner-review-packet.md`
- [x] T11 target 已选择：Copilot Action Registry Boundary Wave
- [x] T11 Copilot Action Registry Boundary Wave handoff ready：`docs/superpowers/refactor-ops/t11-copilot-action-registry-boundary-wave-handoff.md`
- [x] T11 implementation 完成并接受：`c1d02ae4` + `cbd14a68` + `0037b074` + Owner Review `docs/superpowers/audits/2026-06-14-t11-owner-review-packet.md`
- [x] T11B target 已选择：Copilot Execution Ports / Registry Ownership Wave
- [x] T11B Copilot Execution Ports / Registry Ownership Wave handoff ready：`docs/superpowers/refactor-ops/t11b-copilot-execution-ports-registry-ownership-handoff.md`
- [x] T11B implementation received：`661a3dc1` + `13a425c9` + `7dd3f6d9` + `68a2c176`
- [x] T11B owner review fix resolved：CopilotActionRuntime 不能只在 `initSqlite()` 成功后绑定；已由 `04d8c2c1` 修复并在 `docs/superpowers/audits/2026-06-15-t11b-review-fix-owner-review-packet.md` 接受
- [x] T11B-R Copilot runtime boot availability fix handoff ready：`docs/superpowers/refactor-ops/t11b-review-fix-copilot-runtime-boot-availability-handoff.md`
- [x] T11B-R implementation 完成并接受：`04d8c2c1` + Owner Review `docs/superpowers/audits/2026-06-15-t11b-review-fix-owner-review-packet.md`
- [x] T11B implementation 完成并接受 after review fix；结论：不要继续 Copilot manual action runtime 小修，除非有真实 bug
- [x] T11C Code Volume Audit / Deletion Map ready：`docs/superpowers/audits/2026-06-25-t11c-code-volume-deletion-map.md`
- [x] T11D Code Volume Deletion Wave 1 handoff ready：`docs/superpowers/refactor-ops/t11d-code-volume-deletion-wave-1-handoff.md`
- [x] T11D implementation 完成并接受：`da6ef34b` + Owner Review `docs/superpowers/audits/2026-06-25-t11d-owner-review-packet.md`
- [x] T11E Product Decision Packet ready：`docs/superpowers/refactor-ops/t11e-product-decision-packet-for-deletion-wave-2.md`
- [x] T11E Big Deletion + Boundary Wave handoff ready：`docs/superpowers/refactor-ops/t11e-big-deletion-boundary-wave-handoff.md`
- [x] T11E Big Deletion + Curator Push Runtime Move implementation 完成并接受：`b19d98dc` + Owner Review `docs/superpowers/audits/2026-06-25-t11e-owner-review-packet.md`
- [x] T11E-R ProfileRegistry model defaults review-fix handoff ready：`docs/superpowers/refactor-ops/t11e-review-fix-profile-registry-model-defaults-handoff.md`
- [x] T11E-R implementation 完成并接受：`dd6750b0` + Owner Note `docs/superpowers/audits/2026-06-25-t11e-r-owner-note.md`
- [x] T11F Code Retirement Wave handoff ready：`docs/superpowers/refactor-ops/t11f-code-retirement-wave-handoff.md`
- [x] T11F implementation 完成并接受：`79947556` + Owner Review `docs/superpowers/audits/2026-06-26-t11f-owner-review-packet.md`
- [x] T11G Single-Prompt Mega Wave handoff ready：`docs/superpowers/refactor-ops/t11g-product-retirement-decision-map.md`（一次 prompt 内部自建 DAG，一次性执行 GraphFullscreen / GapAnalysis / BatchTag guarded cleanup）
- [x] T11G implementation 完成并接受：`06d9442a` + Owner Review `docs/superpowers/audits/2026-06-26-t11g-owner-review-packet.md`
- [x] T11H Scan-First Bulk Boundary Wave handoff ready：`docs/superpowers/refactor-ops/t11h-scan-first-bulk-boundary-wave-handoff.md`
- [x] T11H implementation received：`6d4131d7`。Codex reclassified it as **minor cleanup, not a major wave**：移动 lens graph type ownership、删 `onExpand`，但 commit 仅 8 files `+95/-83`，boundary audit 349 -> 344，`service -> ui` 14 -> 10；没有达到用户要求的“大步伐”。
- [x] Workflow correction：major/bulk/closure wave 必须先写 Impact Contract（primary metric target / required tracks / skip budget / minimum acceptable delta / stop rule）。达不到 contract 只能标 minor cleanup 或 partial，不再自动接受为大波次。
- [x] T11I read-only investigation reviewed：Codex 批准进入实现，但要求修正 A4；不能把带 `AppContext.getInstance()` 的 `save-ai-analyze-to-md.ts` 搬进 core，必须改成 app-owned vault writer port / adapter。Review note: `docs/superpowers/refactor-ops/t11i-readonly-investigation-codex-review.md`
- [x] T11I implementation 完成并接受：`b1c2fd0f` + Owner Review `docs/superpowers/audits/2026-06-26-t11i-owner-review-packet.md`。Impact Contract 达成：`service -> ui` 10 -> 0，`core -> ui` 4 -> 0；A4 按 Codex 修正走 app-owned `AnalysisDocVaultWriterPort` / adapter。Caveat：`core/search/**` 和 search-doc snapshot types 仍 import `@/service/**`，`core -> upstream` 当前 79。
- [x] T11J Big-Bucket Boundary Investigation handoff ready：`docs/superpowers/refactor-ops/t11j-big-bucket-boundary-investigation-handoff.md`。第一轮只允许 read-only investigation，要求 Claude 比较 `core -> upstream` / `service -> app` / `service/core -> Obsidian types` 三个大桶，优先找 combined mega wave。目标 `total flagged 338 -> <=230`（约 `-108`），最低接受 `-90`，stretch `<=210`；至少两个大桶必须达到各自 threshold，否则只能停在 investigation，后续小任务标 partial/minor。
- [x] T11J read-only investigation reviewed：Codex 批准进入实现，但要求修正 settings split / AI manager port / re-export shim / boundary guard 命名；Bucket C Obsidian file-handle carving 延后到 T11K。Review note: `docs/superpowers/refactor-ops/t11j-readonly-investigation-codex-review.md`
- [x] T11J implementation 完成并接受：`a14c4135` + Owner Review `docs/superpowers/audits/2026-06-26-t11j-owner-review-packet.md`。Impact Contract 达成 hard floor：`total flagged` 338 -> 236，`core -> upstream` 79 -> 11，`service -> app` 56 -> 15，`service -> ui` / `core -> ui` 维持 0。Caveat：Claude note 里 `src/core` app import zero 的说法不准确，当前仍有 5 条 core -> app；Bucket C Obsidian type debt 当前为 81，是 T11K baseline。
- [x] T11K Obsidian File-Handle Boundary Investigation handoff ready：`docs/superpowers/refactor-ops/t11k-obsidian-file-handle-boundary-investigation-handoff.md`。第一轮只允许 read-only investigation，重点比较 document loader ownership、core vault/obsidian utils split、service agent/chat type handles。T11K major 的 hard minimum 是 `service/core -> Obsidian types <=50`、`total flagged <=205`，目标是 `<=40` / `<=190`。
- [x] T11K read-only investigation reviewed：Codex 批准进入实现，但要求修正 port surface。`IVaultReader` 不能变成 Vault god-port；loader-facing port 必须 narrow/read-only/neutral shape，`service -> app` guard 保持 `<=15`，Track B 的 source checks 不能误称 `src/core/utils/**` 全纯。Review note: `docs/superpowers/refactor-ops/t11k-readonly-investigation-codex-review.md`
- [x] T11K implementation 完成并接受：`8ad1f78c` + Owner Review `docs/superpowers/audits/2026-06-26-t11k-owner-review-packet.md`。Impact Contract 达成：`total flagged` 236 -> 199，`service/core -> Obsidian types` 81 -> 48，`core -> upstream` 11 -> 6，`service -> app` 维持 15。Document loader/resource cluster 已不再 import Obsidian，raw `TFile/TFolder` 只在 `AppVaultReaderAdapter` 内部。Caveat：`vault-utils` / `obsidian-utils` 仍是 core 里的 Obsidian-backed runtime helper；`embedClient` 有窄 telemetry reporter sink。
- [x] T11L Remaining Boundary Investigation handoff ready：`docs/superpowers/refactor-ops/t11l-remaining-boundary-investigation-handoff.md`。第一轮只允许 read-only investigation，明确把 `service/core -> Obsidian side-effect` 16 和 `service/core -> Obsidian types` 48 纳入候选大桶；目标不是跳过它们，而是区分真实副作用、type-only handles、runtime ownership、storage-substrate defer。
- [x] T11L read-only investigation reviewed：Codex 批准进入实现，但要求修正 ChatConversation carve / raw app ToolDeps / IgnoreService singleton / side-effect delta reporting。Review note: `docs/superpowers/refactor-ops/t11l-readonly-investigation-codex-review.md`
- [x] T11L implementation 完成并接受：`86839550` + Owner Review `docs/superpowers/audits/2026-06-26-t11l-owner-review-packet.md`。Impact Contract 达成：`total flagged` 199 -> 163，`core -> upstream` 6 -> 2，`service -> app` 15 -> 8，`service/core -> Obsidian side-effect` 16 -> 5，`service/core -> Obsidian types` 48 -> 34，`service -> ui` / `core -> ui` 维持 0。Caveat：`AppHandle = Record<string, any>` 是临时 containment，不是最终解耦；T11L guard 文案提到 `yaml-utils` 但实际未断言该文件。
- [x] T11M UI -> App Boundary Investigation handoff ready：`docs/superpowers/refactor-ops/t11m-ui-app-boundary-investigation-handoff.md`。第一轮只允许 read-only investigation；目标是把 `UI -> app` 114 拆成 settings/types、direct AppContext、commands/view lifecycle、Copilot panel、Quick Search、strings/template、合法 app-shell exceptions 等桶，避免用一个 UI god context 假装清零。
- [x] T11M read-only investigation reviewed：Codex 批准进入实现，但要求修正 `useServiceContext().app` 逃生口、`CopilotPanelVaultPort` 高权限写入边界、`useQuickSearchHost()` 不得返回 raw app、以及 implementation note 必须同时报告 raw UI vault/editor operation delta。Review note: `docs/superpowers/refactor-ops/t11m-readonly-investigation-codex-review.md`
- [x] T11M implementation 完成并接受：`62a39991` + Owner Review `docs/superpowers/audits/2026-06-26-t11m-owner-review-packet.md`。Impact Contract 达成：`total flagged` 163 -> 95，`UI -> app` 114 -> 46，direct UI `AppContext` import files 87 -> 33，`UI -> @/app/settings/types` 15 -> 0。Caveat：`ServiceContext.app` 仍是 raw escape hatch，`useQuickSearchHost()` 是 containment 不是最终 ports，`TemplateManager.setInstance()` 是 compatibility singleton，Copilot panel raw ops 清零但全 UI raw vault/editor ops 仍有 25。
- [x] T11N Remaining Boundary Tail Investigation handoff ready：`docs/superpowers/refactor-ops/t11n-remaining-boundary-tail-investigation-handoff.md`。第一轮只允许 read-only investigation；目标是把剩余 95 findings 分成合法 app-shell exception、真实 UI raw vault/editor debt、Quick Search tail、service/core Obsidian substrate、chat type tail，再决定是否还有一个真正够大的实现波次。
- [x] T11N read-only investigation reviewed：Codex 批准进入实现，但要求修正 ServiceContext shape、ChatConversation type relocation、Streamdown fallback call graph、Quick Search relocation optionality、regression guard 精度。Review note: `docs/superpowers/refactor-ops/t11n-readonly-investigation-codex-review.md`
- [x] T11N implementation 完成并接受：`860eb305` + Owner Review `docs/superpowers/audits/2026-06-27-t11n-owner-review-packet.md`。接受为 targeted raw-UI-IO port wave，但不算 total-flagged hard-floor 完整达成：`raw UI vault/editor` about 20 -> 7，`core -> upstream` 2 -> 0；但 `total flagged` 95 -> 92 未达原 `<=83`，`UI -> app` 46 -> 45 未达原 `<=42`。Caveat：T11N guard 把 `totalFlagged` 锁在落地值 92，这是 regression floor，不是原 hard floor 证明。
- [x] T11O App-Shell Relocation Investigation handoff ready：`docs/superpowers/refactor-ops/t11o-app-shell-relocation-investigation-handoff.md`。第一轮只允许 read-only investigation；重点判断剩余 `UI -> app = 45` 是否应通过把 Obsidian `ItemView` / `Modal` / view lifecycle 壳层从 `src/ui/**` 物理搬到 `src/app/**` 来真正拆掉，而不是继续加小 port 或 scanner allowlist。
- [x] T11O read-only investigation reviewed：Codex 批准进入实现，但要求修正 Track 6，不能把 `ServiceContext` 变成新的运行时杂货架；implementation note 必须同时报告 `useServiceContext().app` consumer before/after，不能把静态 `UI -> app` 清理误称为 UI 完全纯化。Review note: `docs/superpowers/refactor-ops/t11o-readonly-investigation-codex-review.md`
- [x] T11O implementation 完成并接受：`5686ac97`..`73fce758` + Owner Review `docs/superpowers/audits/2026-06-27-t11o-owner-review-packet.md`。Impact Contract 达成：`total flagged` 92 -> 56，`UI -> app` 45 -> 9，direct UI `AppContext` import files 31 -> 6；`service -> app` 维持 7，`service -> ui` / `core -> ui` / `core -> upstream` 维持 0，raw UI vault/editor matches 维持 7。Caveat：`useServiceContext().app` 仍有 25 个消费者，这是后续 T11P+ 债；Codex 全量 `npm run test` 尝试挂起，验收基于 build + boundary + affected guards。
- [x] T11P UI-App Tail Closure Investigation handoff ready：`docs/superpowers/refactor-ops/t11p-remaining-ui-app-tail-investigation-handoff.md`。第一轮只允许 read-only investigation；默认目标改为静态 `UI -> app = 0`、`useServiceContext().app = 0`，关不掉必须逐文件举证，避免只清 scanner 不清真实 raw app 消费。
- [x] T11P read-only investigation reviewed：Codex 批准进入实现，但要求修正 settingsActions 不得变成 UI descriptor/god-bag、VaultNavigationPort 不得暴露 Obsidian primitives、删 raw `app` 时不得改用 raw `plugin` 顶替、chat navigation 必须同时支持 React hook 与非 React factory。Review note: `docs/superpowers/refactor-ops/t11p-readonly-investigation-codex-review.md`
- [x] T11P implementation received：`28585481` + `87f4abe0` + `c462a290`。Boundary metrics 达标：`total flagged` 56 -> 47，static `UI -> app` 9 -> 0，`useServiceContext().app` 25 -> 0。
- [x] T11P owner review found review-fix blocker：`src/ui/view/quick-search/hooks/useGraphAgent.ts` 仍有 dynamic `import('@/app/context/AppContext')`，T11P guard 未覆盖全局 dynamic `@/app/**` import。见 `docs/superpowers/audits/2026-06-27-t11p-owner-review-packet.md`
- [x] T11P review-fix 完成并接受：`edeec92c` + `9f27a089` + Owner Review `docs/superpowers/audits/2026-06-27-t11p-review-fix-owner-review-packet.md`。最终闭环：static `UI -> app = 0`，dynamic `src/ui/** -> @/app/** = 0`，`useServiceContext().app = 0`，`total flagged = 47`，`service -> app = 7` held。
- [ ] 不要提前做 Current Work State、Chat 或 Command Gateway；Command Gateway 仍是 T12 capstone

### 0. Pending — Phase AN 收尾

- [ ] AN 阶段所有改动 commit（9 files modified + DebugCommandActions.ts 新文件 + 4 HTML mocks）
- [ ] 真机验证 dark theme 下 sidebar active row + composer focus ring + attachment card 配色（变量 `--pk-surface-raised` / `--pk-border` 在 dark 已经准备好，但需要肉眼确认）
- [ ] 验证 Phase AN 各项设计落地后再删除临时命令 `[Debug] Load mock conversation for index preview` 和 `src/app/commands/DebugCommandActions.ts`（顶部注释已说明删除时机）
- [ ] OG image 真实抓取（目前只 hardcode github，arxiv/其他靠 favicon）— 可选优化，引入 microlink.io 或 vault-side 抓取均可

### 0. Pending — Phase AP 收尾

- [ ] AP 阶段所有改动 commit（9 modified + 15 new + 2 settings-tab 顺手修；建议拆 3-4 个独立 commit：data layer / optimization service / dashboard primitives + screens / settings 顺手修）
- [ ] 真机肉眼验证：(1) Overview KPI 4 卡在 narrow leaf 宽度下不挤；(2) Budget 卡 NumberField 在 dark theme 下输入态；(3) Optimization rec block 在无 evidence 时排版；(4) Alert Toggle pressed 态的 success-tone 在 light/dark 两套都过得去
- [ ] 没有真实 usage 数据时跑一遍每屏 — empty state 文案是否合理（Curator 显示 "no recommendations yet"，Cost/saved 显示 "—"，Budget pace 显示 "No budget set"）
- [ ] LLM curator 路径首次跑 — 看 prompt 喂的 signals 是否够、JSON 是否容易解析失败（容易失败就 fallback rules，不阻断）
- [ ] memory 里 `project_usage_dashboard_on_hold.md` 标记 outdated（实施 unblocked + 已完成），更新为 "AP 落地后的待跟进项"

### 0. Pending — Phase AO 收尾

- [ ] AO 阶段改动 commit（Register.ts / PeakCommandActions.ts / ViewManager.ts / types.ts / indexInitializer.ts / tab-VaultSearch.tsx + 删 `src/ui/view/knowledge-center/KnowledgeCenterView.tsx`）
- [ ] Obsidian reload plugin 后验证剩余 palette 命令实际生效：`Open Vault X-Ray` / `Open Related Notes`；`Open Gap Analysis` 和 `Batch Tag Suggestions` 已由 T11G 退役
- [ ] `openPromptTemplates` 也是孤儿函数（KC 删后无调用方），但未在本次清理中处理 — 待用户决定是否给 Prompt Templates 加 palette 命令，再决定保留/删除
- [x] `GraphFullscreenView` standalone graph leaf 已由 T11G 退役；Quick Search in-place graph 仍保留

### 0. 已知 Bug — 全部已修复

18 个 P0-P2 bug 全部修复（Phase R/S/AC），包括流式崩溃、auth 错误处理、白屏、幽灵命令等。

### 0.5 UI 调整 — 全部已完成

11 项 UI 调整全部完成，包括 Chat Outline 移除、换模型重输出、Message UI v9、Topic 聚合、Follow-ups 等。

### 1. 真机验证

> 所有测试清单统一维护在 `docs/90-old-root-docs/manual-testing-checklist.md`，此处只记录验证状态。

- [ ] Phase AE (Copilot Agent Loop) — checklist §15
- [ ] Phase W (Copilot 15 actions) — checklist §14
- [ ] Chat 工具基础设施 — checklist (待迁移)
- [ ] 历史回归（Phase S / Provider v2 / AI Analysis / Onboarding）— checklist §1-13

### 2. 竞品差异化功能（核心产品方向）

> 目标定位："Obsidian-native ambient knowledge graph intelligence"
> 三根支柱：Ambient Push + Vault Lint + 级联更新
> 研究来源：`kb2-learn-prd/.../AI-peakAssistant-竞品分析与学术验证.md` + `AI-peakAssistant-差异化定位与护城河分析-2026-04.md`

#### S1. Ambient Push — 写作时主动推送相关内容 + 解释原因 ★★★★★ — Phase 1-4 完成

- Phase 1 (Core Pipeline): FTS5 搜索 + 模板解释 + 侧边栏面板 + SQLite 日志 ✅
- Phase 2 (Graph Intelligence): 2-hop 图谱扩展 + 4 种信号 + 反馈学习 ✅
- Phase 3 (Serendipity Engine): CM6 gutter 提示 + 偶然发现算法 + LLM 微解释 + 模式学习 ✅
- Phase 4 (Morning Briefing): 启动时每日简报（4h+ 间隔触发，3 类推荐） ✅
- 可见性修复: 首次自动打开右侧栏 + 布局切换保留 tab ✅
- Spec: `docs/superpowers/specs/2026-05-01-ambient-push-design.md`
- Plans: `docs/superpowers/plans/2026-05-01-ambient-push-phase1.md`, `2026-05-10-*-phase2/3/4.md`

#### S2. Vault Lint / Health Check — 知识库健康体检 ★★★★★ — 完成

- Phase 1: 5 信号检测器 (S-ORPHAN, S-BROKEN-LINK, C-EMPTY, C-STUB, G-UNTAGGED) + VaultXRayView + ScoreRing ✅
- Spec: `docs/superpowers/specs/2026-05-01-vault-lint-design.md`
- Plan: `docs/superpowers/plans/2026-05-10-vault-lint.md`

#### S3. 级联关系更新 — 笔记修改时联动更新知识图谱 ★★★★★ — 完成

- hub_constituent 表 + HubConstituentRepo + CascadeWorker hub_invalidate/folder_stats 补全 + hub_regen stub ✅
- Spec: `docs/superpowers/specs/2026-05-01-cascade-update-design.md`
- Plan: `docs/superpowers/plans/2026-05-10-cascade-update.md`

#### S4. Structural Hole / Hub 检测可视化 — InfraNodus 级 gap analysis ★★★★ — 完成

- Brandes betweenness + Louvain community + Burt constraint + Gap Analysis View + bridge actions ✅
- Spec: `docs/superpowers/specs/2026-05-01-structural-hole-design.md`
- Plan: `docs/superpowers/plans/2026-05-10-structural-hole.md`

#### S5. KG + PPR 搜索 — Personalized PageRank 替代纯向量 ★★★★ — 完成

- PPR 已有完整实现；本轮新增 co-citation 第 4 层 + query-node seeding + Settings UI + 评估命令 ✅
- Spec: `docs/superpowers/specs/2026-05-01-ppr-search-design.md`
- Plan: `docs/superpowers/plans/2026-05-10-ppr-tuning.md`

#### S6. 预编译知识层 — Karpathy 式预处理摘要 ★★★★ — 完成

- HubStalenessDetector + HubRegenService (30s debounce, batch-10, 3x retry) + hub_regen_queue + reranker hub_doc boost ✅
- Spec: `docs/superpowers/specs/2026-05-01-precompiled-knowledge-design.md`
- Plan: `docs/superpowers/plans/2026-05-10-precompiled-knowledge.md`

#### S7. Auto-tag 建议（建议模式，非静默）★★★ — 完成

- Schema 修复 + tag_suggestion 反馈持久化 + Accept High Confidence + batch FolderPicker 模式 ✅
- Spec: `docs/superpowers/specs/2026-05-01-auto-tag-design.md`
- Plan: `docs/superpowers/plans/2026-05-10-auto-tag.md`

### 3. 未实现的 Spec/Plan（已有文档但未执行）

| 文档 | 内容 | 规模 | 状态 |
|------|------|------|------|
| ~~`provider-mcp-skills-design`~~ Phase 1-3 | ~~MCP Client + Model Registry + Custom Endpoints~~ | ~~大~~ | COMPLETED (Session 26) |
| ~~`provider-mcp-skills-design` Phase 4-5~~ | ~~Skill 系统（markdown 定义 + 执行器）+ Usage Dashboard 同步~~ | ~~中~~ | COMPLETED (Session 27) |
| ~~`search-inspector-tools-overhaul`~~ | ~~Inspector 工具重构~~ | ~~大~~ | COMPLETED (Session 26) |
| ~~`graph-layout-fix`~~ | ~~5 个图布局修复~~ | ~~中~~ | COMPLETED |
| ~~`v2-persistence-fix`~~ | ~~5 个 V2 持久化 bug~~ | ~~中~~ | COMPLETED (已在之前 session 修复) |
| ~~`report-ui-quality` Task 3-4~~ | ~~粘性 footer + 内联编辑~~ | ~~小~~ | COMPLETED (Session 26) |
| ~~`ai-analysis-ux-overhaul` Phase ③~~ | ~~SynthesizeAgent + 多轮 round 分离 UI~~ | ~~中~~ | COMPLETED |
| `2026-05-14-copilot-command-center-user-centered-redesign` | Copilot / Command Center intent hub 修正版：点 Copilot / Knowledge Analysis 后自动规划 capability，再用侧边 panel / 弹出 panel / review panel 承载 | 中 | PLANNED (docs/design only, not implemented) |

### 3. TASKS.md 按阶段待做

#### Phase 4 — Search & Analysis Polish
- [ ] #60 Search UI bugs（含 highlight 回归）
- [ ] #91 Quick Search modes（folder/heading/@context）— 部分
- [ ] #89 Smart connection via graph inspector
- [ ] #67 Recent search 内存缓存 — 部分

#### Phase 5 — Chat 高级功能
- [ ] #73 Conversation modes Level B/C（mode 控制 allowedTools + 独立 agent pipeline）
- [ ] #57 Work focus mode + project templates
- [ ] #14 Message branching（从任意消息点 fork）
- [ ] #83 Per-conversation system prompt / topic — 部分
- [ ] #21 Suggest conversation → project
- [ ] #2 Message lifecycle statuses（queued/cancelled/timeout）— 部分

#### Phase 6 — Infrastructure
- [ ] #58 Expand desktop mock env — 部分
- [ ] #79 Menu popover position 算法 — 部分
- [ ] #55 Docker image for PDF/code interpreter

#### Phase 7 — Copilot 文档智能（剩余）
- [ ] #39 Correct content errors
- [ ] #32 Find files & write article
- [ ] #34 Auto detect text → add to docs

#### Phase 8 — 任务 & 工作流
- [ ] #48 IFTTT workflow agent mode
- [ ] #47 Daily/weekly/monthly summarize — 部分
- [ ] #46 Writing plan for tasks
- [ ] #44 Find vault tasks & solve — 部分
- [ ] #43 Task list check & apply
- [ ] #31 Extract todos from vault — 部分
- [ ] #63 Alfred integration

#### Phase 9 — Quick Capture & Prompt
- [ ] #45 Fast note / inbox
- [ ] #40 User DIY prompts per doc
- [ ] #12 Prompt auto rewrite trigger in chat — 部分
- [ ] #29 Prompt quality audit pass — 部分

#### Phase 10 — Integrations & Advanced
- [ ] #24 Document type loader tests — 部分
- [ ] #13 Test all supported models
- [ ] #53 Sync flomo / Apple Notes / Calendar
- [ ] #23 Sync ChatGPT/Gemini/Claude history
- [ ] #80 Integrate OpenCode
- [ ] 其余：#54, #52, #66, #51, #50, #49, #22, #1

#### Phase 11 — Documentation
- [ ] #88 Graph inspector / AI analysis tutorial
- [ ] #26 Model selection best practice doc

### 4. 基础设施
- [ ] GitHub triage：关闭 22 done + 6 merge + 1 won't-fix = 29 issues
- [ ] 依赖瘦身：替换 playwright + @langchain/community → fetch（-50MB）
- [ ] master 上 73 文件未提交修改需 commit（Settings 重构续 + Chat UI + ConversationType + 搜索 store + Inspector 增强）
- [ ] 清理 11 个 Cursor 遗留 worktree（2025-12，已过时）

### 5. 远期 Backlog（无 spec/plan，仅想法）
- Canvas conversation type（split-pane chat + artifact rendering）
- Template conversation type + marketplace
- AI response cards with UI components
- Message persistence queue（AI 自动存有价值信息到 vault）
- Conversation multi-topic detection + auto-split
- n8n integration / multi-agent parallel mode / agent marketplace
- Graph 高级可视化（nebula background, healing ray, source/sink）
- Real-time LLM context inspector panel
- RAG within single conversation

## Log

### 2026-07-07 — Search Highlight Vault-first 三阶段完工

用户看截图（`docs` 搜索结果里 CJK 显示成 `表 格 编 辑 协 议 改 造` 的分词形态）提问 highlight 修复到底做了没有。原以为 2026-07-06 spec 已经 landed，实际只是 spec 落库，代码路径仍在 `item.contentRaw ?? item.content` 兜底。这轮一次性把 Phase 1 修 bug、Phase 2 换 source 契约、Phase 3 清存储冗余全部推完。

**Phase 1 · chunkId 贯通 + resolver 接管**
- `RetrieverResult` 加 `chunkId?: string`；`FtsRetriever` / `FtsStemRetriever` / `VectorRetriever` 最终 map 时把 `chunkId` 传出去（之前只在 internal chunk 里，最后一步 drop 了）。
- `SearchResultItem` 早就有 `chunkId` / `contentRaw`，只是没人填；`QueryService` 把 `m.best.chunkId` 带入。
- 新 `src/service/search/query/highlight-source-resolver.ts` 接管 highlight 源解析；`queryService.textSearch` highlight 循环走 resolver 而不是直接 `contentRaw ?? content`。
- Vector retriever 显式把 `r.content_raw` 灌到 `contentRaw` + `content` 双份，避免 semantic 分支穿透。
- 新 test `test/highlight-source-resolver.test.ts`（5 案）+ 现有 `test/highlight-engine.test.ts` 保持通过。

**Phase 2 · Vault-first source + hintOffset**
用户挑毛病："存 `content_raw` 不就是把内容存了两遍嘛，为啥不直接回 Vault 读？" 一查发现 markdown 类的 `content_raw` 其实是 Vault `.md` 文件的另存，用户识别对了。设计一份 Vault-first spec 落库 `docs/superpowers/specs/2026-07-07-search-highlight-vault-first.md`，2026-07-06 spec 标 superseded，`docs/roadmap.html` 换指针到新 spec。

- 新 `isVaultReadableSource(type)` 白名单：`markdown / txt / csv / json / html / xml / canvas / excalidraw`。放 `src/core/document/types.ts`，新增 loader 时必须显式登记。
- Resolver 优先级重排：**Vault-first for readable** → chunk_raw for binary → summary_raw → title/path → normalized。每一档在 `SearchResultItem.highlightSourceKind` 上留痕。
- 加常量到 `src/core/constant.ts`：`SEARCH_HIGHLIGHT_HINT_WEIGHT=0.8` / `SEARCH_HIGHLIGHT_HINT_DECAY=400` / `SEARCH_HIGHLIGHT_VAULT_READ_TIMEOUT_MS=200` / `SEARCH_HIGHLIGHT_VAULT_CACHE_CAPACITY=32`。
- `HighlightEngine.highlightSnippet` 加可选 `hintOffset`；`findBestWindow` 打分加 `HINT_WEIGHT × exp(-distance/DECAY)`，让整篇文件源里的 window 落在打分 chunk 附近。
- `DocChunkRepo` 加两个批量：`getChunkIndexByChunkIds()`（拿 chunk_index）+ `countChunksByDocIds()`（拿 total）。resolver 用 `chunkIndex / total × fileLength` 算 hintOffset。
- 新 port `VaultTextCache` + 默认 `MemoryVaultTextCache`（LRU cap=32）；`QueryService` 单例持有，跨 query 复用。
- `withTimeout` 兜住 200 ms 慢盘超时，静默降级不阻塞高亮阶段。
- `SearchResultItem` 加两个 debug 字段 `highlightHintOffset` / `highlightVaultReadMs`。
- test 扩展到 8 案（Vault-first、hint 比例、binary→chunk_raw、超时、跨 query LRU、meta 标签、semantic summary、normalized 兜底）；`highlight-engine.test.ts` 加 hintOffset 早/晚窗口验证（前一版失败是 filler 完全相同看不出窗口位移，换成不同 marker）。

**Phase 3 · 索引侧停写 + 一次性迁移**
- `indexService.saveChunkAndFtsData` 加 `docType` 参数：readable 类型 → **不写 `content_raw`**；`content_fts_norm` 无消费者 → **对所有类型都停写**。
- `vector_enrich_only` 路径处理：readable 类型下持久化 chunks 空 content，用 `loader.chunkContent(doc, settings.chunking)` 重跑，按 `chunk_index` 把 raw 回填到已有 chunk_ids——保留 embedding ↔ chunk_id 绑定不断链。
- 一次性 SQL 迁移在 `src/core/storage/sqlite/ddl.ts` 尾部，`index_state.phase3_null_readable_content_raw_v1` 打标幂等：`UPDATE doc_chunk SET content_fts_norm = NULL`（全表）+ `UPDATE doc_chunk SET content_raw = NULL WHERE doc_id IN (SELECT node_id FROM mobius_node WHERE json_extract(attributes_json, '$.docType') IN (...readable))` + `VACUUM`（失败静默）。
- `docs/12-feature-search.html` 三处更新：Highlight claim 段改写为 Vault-first 描述 + 存储节省 + 降级链；pipeline 表格里 Highlight 行维护边界改；Troubleshooting 表格里 CJK 空格那行改成读 debug 字段。

**验证**
- `npm run test` 189/189 全绿（+ 8 案 resolver + hint engine 额外覆盖，比 Phase 1 之前多 1 案）。
- `npm run build` 通过。
- `check:bundle` 通过。

**用户可感知**
- Markdown snippet 现在**永远反映 Vault 磁盘当下**：改笔记后立刻能看到最新文本，不会再出现"已经删掉的段落"。
- CJK 分词空格反例消失（Phase 1 已修，Phase 2 从 Vault 接管更牢）。
- 多 chunk 长文件 snippet 落在打分靠前的 chunk 附近（hintOffset）。
- PDF / DOCX / Image 类保持 `content_raw` 作为提取内容的宝贵资产；用户对这点特别关照过。
- SQLite 瘦身：markdown 类 `content_raw` + 全表 `content_fts_norm` 停写并一次性 null 掉存量。典型 vault 节省约 markdown 文本冗余 ~18%（比例取决于 markdown vs binary 占比）。
- 每条 result 带 `highlightSourceKind` / `highlightHintOffset` / `highlightVaultReadMs` debug 字段——可以在 Search Inspector 里清楚看到 snippet 来自哪一档、读盘用了多久。

**追加 · 真机验证抓到 docType propagation bug 并修完**

用户 reload 后搜"算法"仍看到分词 `算 法 ot 算 法 …`。诊断根因：4 个 retriever（FTS / FtsStem / Meta / Fuzzy）的 SQL 都没读 `mobius_node.attributes_json.docType`，`RetrieverResult.type` 一直 `undefined` → UI 层变 `type='unknown'` → resolver 跳 Vault-first → chunk_raw 又被 Phase 3 迁移 null 了 → 一路降级到 normalized_fallback 抛 `doc_fts.content` 的分词版本。我的 Phase 1/2 test 都在 `item({ type: 'markdown' })` 里硬编码了 type，没盖到"retriever 忘传 type"这条路。

- `DocChunkRepo.searchFts / searchFtsStem / searchMetaFts` 都加 `json_extract(dm.attributes_json, '$.docType') AS docType`；`doc_meta_fts` 之前没 JOIN `mobius_node`，加 LEFT JOIN。
- 4 个 retriever 最终 map 里传 `type: r.docType ?? undefined`。
- 加防御层：`isVaultReadableByPath(path)` 按扩展名判定；resolver 的 `isVaultReadableForItem(item)` = type 白名单 **||** (type 缺失时按 path 扩展名兜)。以后 retriever 再忘 propagate type 至少 markdown 还能走 Vault-first。
- 另加一条硬规则：**Vault-readable 结果如果读盘失败（超时 / 文件被删）→ 直接跳到 title/path 标签，绝不落到 normalized_fallback**。保证 markdown 永远不再展示分词文本。
- test 加两案：Case 9 复刻 `type='unknown' + chunkId + .md path + FTS 分词 content` 验证 defense-in-depth；Case 10 验证读盘失败降级到 title/path 而非 normalized。189/189 全绿。
- 用户 reload 后确认 OK。

**Backlog（本 spec 明确 Non-Goals）**
- Binary extracted-content 从 SQLite 挪到 filesystem cache（另开 spec）。
- `doc_fts` 改 external-content 模式，省一份 FTS 内部拷贝（正交优化）。
- 真机 QA：PDF / Excalidraw / Canvas 各测一遍，看降级链行为（markdown 已 OK）。
- `PatternDiscovery` OpenRouter 402 报错另说：用户余额 29874 < max_tokens 32000。要不 clip max_tokens 到 profile budget - buffer，要不用户充值。跟高亮无关。

### 2026-07-04 — Vault Search Harness Cutover（Debt-4 完工）

上一段 tail closure 只做了 tool adapter + stop contract 前置。这轮把 Vault Search 主路由真正从 Claude Agent SDK `query()` 切到 self-hosted harness `runAgentLoop`。

**完成**
- `src/service/agents/VaultSearchAgent.ts` 改写为 harness-native shell：`buildVaultHarnessTools` + `TierController(defaultTierBindings)` + `runAgentLoop({ stopWhen: submit_plan.ok })`。保留 `systemPromptOverride` / `contextPrefix` 入口给 ContinueAnalysisAgent。
- TraceBus → `LLMStreamEvent` bridge：订阅 `tool_call` / `tool_result` / `step_finish`，翻译成 Quick Search dispatcher 期望的 `tool-call`（`mcp__vault__*` 命名）、`tool-result`、`text-delta`；开头 `pk-debug vault-sdk-starting` 与结尾 `complete` + `pk-debug vault-sdk-complete` 保持 SDK 时代的 event parity，避免 `useEventRouter` / `eventDispatcher` 改动。
- `ContinueAnalysisAgent` 直接构造 `VaultSearchAgent`（带 override），不再 import `VaultSearchAgentSDK`。
- 删除 `src/service/agents/VaultSearchAgentSDK.ts`（无 caller）；清理 `settingsTypes.ts` / `AppContext.ts` / `GraphAgent.ts` / `vault/types.ts` / `vaultMcpServer.ts` 里 stale 的 `VaultSearchAgentSDK` 注释。
- Web search 走 harness `ToolDef` 包装 `queryWithProfile + collectText`（SDK-as-library 用法，未 revive backend fallback）。
- Migration spec 顶部加 cutover-done banner，保留原 phase 表供后续 folder rename 清理参考。

**验证**
- `npm run test -- test/vault-harness-tools.test.ts test/vault-mcp-tools.test.ts test/harness-loop.test.ts test/vault-search-harness.test.ts`（含新增 `vault-search-harness.test.ts`：submit_plan stopWhen、trace 保留 `plan_sections` / `follow_up_questions` / `proposed_outline`、read-tool 先于 submit_plan、SDK import 守卫）
- `npm run test`（全量）
- `npm run build`
- `git diff --check`

**仍未做**
- `vault-sdk/` 文件夹重命名到 `vault-mcp/` 或 fold 进 `vault/`：cosmetic，无 runtime 影响。
- `sdkAgentPool.ts` / `sdkMessageAdapter.ts` 保留：`service-manager.ts` / `GraphAgent` / `webSearchTool` 仍是 library-user，未到 delete 时机。

### 2026-07-04 — Code-Handoff Tail Closure（docs convention + harness prerequisites）

这轮接着上一段 annotation handoff 做收尾，目标是把"已识别但未真正落地"的尾巴补到代码/规则层，而不是只在回复里列 TODO。

**完成**
- Root docs 规则沉淀：新增 `docs/conventions/root-docs.md`，并在 `docs/conventions/README.md` + `CLAUDE.md` 注册。覆盖 final-state docs、状态词归位、dense table、长路径 copy、Mermaid、公式 worked example、viewport QA。
- 04 配置文档修 stale backend 文案：`agentBackend` 改成 `auto | harness` 两值；`claude-agent-sdk` 只作为 library usage，不再是用户可选 backend。
- Agent loop 增加 `stopWhen(step)` 合同：domain tool 成功后可结束 loop，`vault_submit_plan` 不再必须依赖 SDK result-message 语义。
- Production compact seam 接线：`ClaudeAgentSDKBridge` 在 caller 未显式提供 context 时自动安装 `ContextManager`，并接 `createDefaultCompactSummarizer()`；无 fast profile 时退回 stage(b) placeholder。
- Vault Search harness Phase 1：新增 `src/service/agents/vault/vaultHarnessTools.ts`，把现有 vault pure impl 包成 harness `ToolDef`，保留 UI-compatible `mcp__vault__*` 工具名和 `SubmitPlanState`。
- 更新 `docs/superpowers/specs/2026-07-04-vault-search-harness-native-migration.md`：Phase 1 tool adapter + stopWhen 前置合同已具备；剩余为 loop shell / UI stream parity / cutover。

**验证**
- `npm run test -- test/vault-harness-tools.test.ts test/vault-mcp-tools.test.ts test/harness-loop.test.ts test/b2-copilot-analysis-harness-wire-in.test.ts test/harness-context.test.ts test/harness-bridge.test.ts` 通过。

**仍不冒充完成**
- VaultSearchAgent 主路由仍未切到 harness-native。现在缺的是 `VaultSearchAgentHarness` loop shell、TraceBus -> Quick Search event stream 的 live parity、以及真实 vault QA。工具层和 loop stop contract 已经就位。

### 2026-07-04 — Code-Handoff From Root Doc Annotations（7-track sweep + 4 项技术债清尾）

按 `docs/superpowers/plans/2026-07-03-code-handoff-from-doc-annotations.md` 执行。这是"文档 annotation → 代码/产品动作"的分工交接：Codex 已完成 root docs 文字清理和 folder-default baseline，本 session 负责剩余 7 个 track 的代码落地 + 用户追加的 4 项技术债。

分支：`codex/peak-modernization-refactor`。全程 `npm run test` + `npm run build` 每 commit 绿。169/169 test files pass。共 17 个 commit（1 checkpoint + 7 track + 5 补丁 + 4 debt）。

**Track A · 删除 legacy folder fallback**（commit `aa910535`）
- `src/core/config/folderPaths.ts` 新增 `LEGACY_FOLDER_DEFAULTS` + `resolveFolderSetting`，把 loader 和 onboarding wizard 共用一份规范化逻辑。
- `_prompts` / `_skills` / `_inbox` / `A-control/PeakAssistant/DataStore` 持久化值 → 规范化到 `ChatFolder/*`。空字符串也算 unset。
- `DEFAULT_SEARCH_SETTINGS.ignorePatterns` 删掉 `'A-control/'` —— 唯一自动 ignore 是 `dataStorageFolder/`（Codex 已加的 `ensureIgnoredFolder` 走这条路径）。
- `test/settings-folder-defaults.test.ts` 补 3 场景：legacy 规范化 / 默认 ignore pattern shape / 非 legacy 下划线路径作为 override 保留。

**Track B · Onboarding wizard apply 目录 + 预算 + 绑定**（commit `bf91e857`）
- `applyRecommendation.ts` 从只写 3 个 tier binding 扩展到：folder defaults（复用 A 的 helper）+ `ensureBudgetDefaults`（用户 non-default 值不覆盖）+ ProfileRegistry active binding（`activeAgentConfig`/`activeAgentFastConfig`/`activeChatConfig`/`activeCopilotConfig`，已有绑定 never clobber）。
- `test/onboarding-apply-recommendation.test.ts` — 7 场景（budget defaults 补空 / preserve / reject NaN&range / folder derive / legacy 归一 / explicit override 保留 / blank root）。

**Track G · Formula/scoring worked-example 单测**（commit `66c167a8`）
- `Reranker.applyRankingBoosts` 内部循环体抽成纯函数 `computeRankingBoostFinalScore` → `src/service/search/query/rankingBoosts.ts`。类方法委托。
- 3 组新单测：
  - `ranking-boosts` — worked example + recency decay + never-opened + hub-tier fallback + PPR dampening + hubTier='none' 覆盖 high incoming
  - `fts-scoring` — normalizeBm25Scores + applyChunkDecay 用 SQLite most-negative=best 约定的 worked example
  - `lint-content-signals` — jaccard / titleTokens / stripped(Length|WordCount) / detectNamingViolation / hasFrontmatter（含 horizontal-rule bad case）

**Track F · Cloud SDK backend + Chat/Agent/Plan mode audit**（commit `46bc0d23`）
- 只出 spec 不动代码：`docs/superpowers/specs/2026-07-03-cloud-sdk-and-mode-choice-audit.md`
- Part A：`AgentBackend` 三值枚举全部 inventory；两个 option（保留 as-supported / 移除 backend 保留 library）+ 推荐 Option 2 contingent on HITL migration
- Part B：Chat/Agent/Plan mode routing 只映射到 agent-profile vs chat-profile 两条路径（plan 是 label 无 runtime 分支）；两个 option（give Plan 独立 profile / collapse 到 intent router）+ 两阶段 rollout 建议

**Track E · AI Query Parser（NL → Hyper Search syntax）**（commit `91ddaf32`）
- `src/service/search/query/aiQueryParser.ts` — pure module，injected LLM invoker，Zod schema，最多 2 次重试 + AbortSignal + fenced JSON 容错；LLM 任何失败都 fallback 到原文，search flow 永不阻断
- `test/ai-query-parser.test.ts` — 9 场景

**Track C · Ambient Push canonical surface**（commit `9dbca284`）
- `DEFAULT_AMBIENT_PUSH_SETTINGS` 三个开关翻默认：`enableMorningBriefing` / `showStatusBar` / `enableSerendipityGutter` 全部 true → false（`enabled` runtime 仍默认 true，data layer 照样跑）
- 新增 `peak-related-notes-view` 右侧 dockable 面板 + `openRelatedNotes` 命令；`RelatedNotesPanel` 读 `useAmbientPushStore.items` + 15s 轮询 `SessionContextService.workingTheme`（LLM 优先，rule-based fallback）；无动画
- `test/ambient-canonical-surface.test.ts` + 修 `test/ambient-runtime-ports.test.ts` 两个 briefing 场景显式开 `enableMorningBriefing:true`（否则它们只是在测新默认，不测 4h gap 逻辑）

**Track D · Recoverable Context Compact（chat 侧）**（commit `e63d8a51`）
- 新增 `src/core/context/compactSummary.ts`：`CompactAnchor`（6 种 kind：message / file / resource / chunk / slot / block）+ `CompactSummary` + 3 个 factory
- `BudgetGovernor.fit` 返回从 `GovernedSlot[]` 改为 `{ items, summaries }`。Phase 2 drop 每次产 `CompactSummary`（原来是静默 nullify）
- `ContextPipeline` 把 summaries 塞进 budget-govern trace output
- `src/service/context/refetchAnchor.ts` — 按 anchor kind 分派的 refetch dispatcher，注入 6 个 port 函数
- `test/budget-governor.test.ts` 扩：destructured return + Phase-2 drop 发 summary + under-budget 不发 + required-only over-budget 不 spin
- `test/compact-summary-refetch.test.ts` — factory shape + 6 kind 分派 + throw / null / missing port 三种错误

**Track F.A · Cloud SDK backend 退役**（commit `f99399af`，用户批准 Option 2）
- `AgentBackend` 收窄到 `'auto' | 'harness'`；loader 把持久化的 `'claude-agent-sdk'` 规范化到 `'auto'`
- `AISetupTab` dropdown 删第三项
- `ClaudeAgentSDKBridge` 收缩到 `runAgentLoop + RunEnvelope` 单路径（`shouldUseSDK`/`runViaSDK`/`sdkPrompt`/`sdkMaxTurns`/`sdkAllowedTools`/`sdkMcpServers` 全删）
- `VaultSearchAgentSDK` backend gate 删掉（SDK-as-library 保留 —— `queryWithProfile`/`tool()`/`createSdkMcpServer()` 不受影响）
- `test/harness-*` 三个 test 同步（roundtrip 加 retired value 归一 case，bridge test 去 `useSDK`，b2 wire-in test 断言 bridge 无 `shouldUseSDK`/`runViaSDK`）

**Track F.B · Chat/Agent/Plan mode picker 退役**（commit `f25a4eae`，用户批准："我们不需要了啊 直接，全都是 agent 模式了" → 后追加澄清："AI 自己决定，或根本不需要让 AI 知道 mode"）
- Composer RunChip 删 Mode Segmented + `RUN_MODE_OPTIONS` + `modeLabel`；trigger 显示 `model · ctx`（原 `mode · model · ctx`）
- view-Home suggestion cards 删 `chatViewStore.setChatMode(...)` 副作用
- `useChatSubmit` 从 `getConfigForMode('agent')` 改成 `getActiveAgentConfig()` —— 语义不是"选 agent mode"而是"取默认 assistant profile"
- `chatViewStore.INITIAL_SESSION.chatMode` 默认 `'chat'` → `'agent'`；`ChatRuntimeMode` 类型 + `ChatMeta.conversationType` 保留供历史恢复
- 保留 `getConfigForMode` 给老 session restore 用

**Track E 补丁 · UI 开关**（commit `81cb46f9` + `1d6225bf`）
- `KnowledgeIndexTab` "Search quality" 段加 `AI query parser` Switch，用户不必编辑 data.json
- Related Notes 面板样式加 ~110 行 `peak-related-notes-*` token-driven CSS 到 `peak-components.css`

**Track D 补丁 · agent 侧 CompactSummary**（commit `b291c497`）
- `ContextManager.compactIfNeeded` 现在也产 `CompactSummary[]`：每个 dropped MemoryBlock 一条（kind='block'）+ 折叠 message window 一条（kind='message'）
- `extractMessageIds` 抽 first/last dropped middle message 的 id（缺 `id` 字段时 fallback `message-index-N`）
- `ContextCompactedEvent` 加载荷字段；`AgentLoop.emit` 转发
- `test/harness-context.test.ts` 加 shape guard

**Debt-1 / Debt-2 · 老 chatMode 恢复 + `/plan` slash-prefix**（commit `66d0377d`）
- `useChatSession` 恢复路径也走 `getActiveAgentConfig()`，不再用 `getConfigForMode(convMode)`；老 session `kind:'plan'` 不崩、只是 UI 显示字段
- `service-conversation.streamChat` 里检测 `/plan ` 前缀（严格匹配，`/planner`/`/plan-x` 都不算）→ 剥前缀 + effectiveMode='plan' → 走既有 `PromptId.PlanModeSystem` playbook + tools=off
- `test/plan-intent-detection.test.ts` — 6 场景（大小写 / 前导空白 / substring 拒绝 / 前缀剥离保留正文）

**Debt-3 · Stage (c) LLM 摘要**（commit `9dc2aa54`）
- `ContextManagerConfig.summarizer?: CompactSummarizer` 可选注入
- `compactIfNeeded` 在 stage (b) 之后：如注入 summariser，用真 LLM 摘要替换占位符 + 富化 `CompactSummary.summary`；失败/空返回都自动 fallback 到 stage (b) 占位符（loop 永不因 LLM 崩溃挂）
- `src/service/agents/harness/context/compactSummarizerRuntime.ts` — 默认 summariser factory（fast-role + `vercelGenerateText`），跟 `aiQueryParserRuntime` 同 pattern
- `test/harness-context.test.ts` 加 3 场景（成功替换 / throw fallback / whitespace fallback）

**Debt-4 · VaultSearchAgentSDK harness-native**（commit `fd438d81`，只做 doc + spec）
- 说明：全量重写 933 行 orchestration + HITL 语义（vault_submit_plan 触发 SDK result 消息终止 loop）+ 无 end-to-end 回归测试 —— 风险太大不在本 session 做
- 修 3 处过时注释（`VaultSearchAgentSDK.ts` header + class docstring / `VaultSearchAgent.ts` router header / `AppContext.vaultSearchAgent()`）—— 原来都在说"选 harness backend 会 error out"，这条 gate 早在 F.A 删了
- 写完整迁移 spec：`docs/superpowers/specs/2026-07-04-vault-search-harness-native-migration.md` —— 4 个 phase（tool 适配 → loop shell → `stopWhen` hook → 重命名清理）+ 每 phase blast radius 表 + 验收 gate（新 test/vault-search-harness.test.ts + 三种 query shape 人工 QA）

**遗留 / 显式 defer**
- Vault Search harness-native 全量重写（spec 已定，需要单独 session + 真机 QA）
- CompactSummarizer 在生产 ContextManager 构造点的接线（当前无生产 `new ContextManager(...)` 站点，seam 就位）
- F.B intent router / planner-mode 差异化（用户明确不要，属于"AI 不知道 mode"的产品原则）

### 2026-06-04 — Chat View 微设计修复（sidebar 精简 + project/topic 统一 + composer 居中 + 透明 modal 根因）

围绕 chat-view 在 Obsidian sidebar 模式下的视觉一致性和几个反复出现的细节问题逐项推进。

**Sidebar compact 模式（非 Chat Studio 时的 `peak-project-list-view`）**
- 加 `compact?: boolean` prop 给 `ProjectListViewComponent`；`ProjectListView.ts` 传 `compact: true`，Chat Studio panel 不传 → 保持原 brand-row + 双行布局。
- compact 模式下：去掉 "Peak Assistant" 品牌行，搜索框塞进 toolbar 同一行 `[Search ......] [Home] [Refresh] [-]`。
- `ConversationIndex` 同样加 `compact` prop；sidebar 版隐藏 "Conversation Index" 头条 + Overview/Artifacts tab 居中（新 `.pkchat-idx__tabs--centered`）。Studio 版保持左对齐有标题。

**Project 行 + Topic 头统一视觉语言（设计方向：去冗余 chevron，icon 自身就是 toggle）**
- Projects：去掉 `ChevronDown`/`ChevronRight`，`Folder` ⇄ `FolderOpen` 单图标即 toggle；project 名 `pktw-truncate` 单行 + `title` 悬停看全名。
- 子项缩进：原 `pktw-ml-7` 外层 + 内嵌 `pktw-ml-7` 共 56px → 单层 `.pkproj-children { padding-left: 16px }`。
- Conversation Index topic 头：去掉 chev gutter，`MessageSquare`（收起）⇄ `MessagesSquare`（展开）作为整 toggle；nested message/artifact 行同步去掉 `__chev` placeholder 整体左移；nested 缩进 28px → 14px。
- 引导线 vguide：先加后去——原 `::before` 1.5px accent-tint 紫，user 反馈 narrow rail 里像列里多塞了一根针；改 1px border-soft 灰仍然丑；最终两个面板都拿掉引导线，纯缩进表达层级。

**点击 project 折叠失效（根因 + 修）**
- 根因：`ProjectListView.ts:163` 的 `SELECTION_CHANGED` 监听器在 project 未展开时会自动展开它（为支持"点 conversation 自动展开它所在的 project"）；但 `handleProjectHeaderClick` 折叠后会派发 `dispatchSelectionChanged(projectId)`，监听器把刚折叠的 project 又强行展开。
- 修：`ProjectsSection.tsx` 加 `wasExpanded` capture，仅在 *展开* 时调 `openProjectOverviewInChat`（它内部派发 selection-changed）。折叠时只 `toggleProjectExpanded` + `setActiveProject`，不派发，没反弹。

**Modal 透明（反复出现的 bug，写入 recurring-pitfalls 第 4 节）**
- 根因：`peak-tokens.css` 把所有 `--pk-*` token 严格作用域到 `.pktw-root` / `.peak-design-root`（合规于 `obsidian-css-defense.md`——不能污染 `:root`）。Radix `Dialog`/`Popover`/`DropdownMenu` 用 Portal 把 Content 挂到 `document.body`，**整段子树离开了 `.peak-design-root` 的祖先链**，`bg-popover` 解析的 `var(--pk-surface-overlay)` = `undefined` → 透视。
- 修：`src/ui/component/shared-ui/{dialog,popover,dropdown-menu}.tsx` 三个 primitive 的 Content className 加 `peak-design-root pktw-root`——portal 挂哪 token 就跟到哪。
- 写入 `docs/90-old-root-docs/recurring-pitfalls.md §4`，含 mechanism / instances / detection / prevention checklist。明确："不要回过头去把 token 升到 `:root` 来'修'它"——会重新引入 Obsidian 污染问题。

**Start-new-conversation 布局**
- 找到设计稿 `docs/gstack/chat-ui-home-newconv-redesign-2026-06-02/02-new-conversation-no-index.png`。
- Picker `grid-cols-2 max-w-[360px]` → `grid-cols-3 max-w-[520px]`，Plan 不再独占一行。
- Pending 状态下 picker + composer 在 body 里垂直居中堆叠（`flex-col items-center justify-center gap-3`，composer 包 `max-w-[760px]`），不再把 composer 钉在底部留半屏空白。
- Composer 在 activeConversation 分支保持原样钉底，只有 pending 状态改了。

**Hover 高亮失效（Tailwind 斜杠透明度根因）**
- 根因：`pktw-bg-accent/5` 依赖 Tailwind 把 `--pk-accent` 拆通道三元组再合 alpha。但我们 `--pk-accent: #7c3aed` 是 hex 字符串，不是通道值，`/N` 透明度静默失效 → 看不到 hover 背景。
- 修：抽 `.pkchat-type-card--idle` / `--selected` CSS 类，hover/selected 直接用 `--pk-accent-tint`（已是 10% 紫色），border 跳 `--pk-accent`。

**Layout magnet 诊断（user-reported "切其他 tab 总被拉回 chat"）**
- 在 `ViewSwitchConsistentHandler.ts` 加诊断日志（`active-leaf-change` 分支 + `activateChatView`/`activeDocumentView` 入口 + studioCount + trace）。
- 分析了 4 条可能路径：CONVERSATION_OUTLINE_VIEW_TYPE 例外分支 / TRACKED_VIEW_TYPES 召回 / chat-studio popout 磁铁 / activeDocumentView 内 setViewState 二次触发。待用户复现并贴 console 日志后确认是哪条。

**ChatView pending 状态死锁修复（早些时候）**
- `view-Messages.tsx` 的 `pendingConversation` 分支原本只渲染 picker，没渲染 Composer——用户点 Chat/Agent/Plan 只是 set kind，但页面没输入框，无法提交首条消息触发 `useChatSubmit.ensureConversation` 创建真实会话，整个流程死锁。
- 修：pending 分支同时渲染 picker + composer。

**Commits（按时间顺序）**
- 修复 pending state 无 composer 死锁
- 加 layout-diag 诊断日志（active-leaf-change 路径）
- Sidebar compact mode：搜索移入 toolbar、隐藏 Conversation Index 标题、tabs 居中
- Projects / Topic 双图标 toggle + 缩进精简
- 去掉两个面板的 vguide 引导线
- 折叠失效根因修复（wasExpanded guard）
- Radix portal token 损失根因 + 修 + 写入 recurring-pitfalls §4
- Picker 3 列 + 居中 + composer 上移
- Hover 高亮根因（Tailwind /N 不兼容 hex var）+ CSS 类替代

### 2026-06-03 — Chat UI Modernization（按设计稿逐项落地 + 设计系统规则补全）

按 9 张设计稿（sidebar / message head / header / suggested+more / conversation index / artifact / topics tab / run settings popover / composer）对照实现，过程 ~15 轮迭代逐图核对。

**Sidebar（左栏 project list）**
- 加 search 栏 + Today/Yesterday/This week/Earlier 时间桶分组（替代单一 CONVERSATIONS wrapper）
- 删除 CONVERSATIONS section 折叠 wrapper，时间桶提升为顶级 section header
- 会话行：active 状态 `pktw-bg-primary` 蓝 → `var(--pk-accent-soft)` 紫；删除每行冗余日期；每行加 MessageSquare 小气泡 icon
- toolbar `+` 按钮改 hover-only，3 个按钮 size lg → md
- sidebar bg：`--pk-bg`（紫调暗色）→ transparent 继承 Obsidian 主题
- search clear `<X>` 改用 `<PkIconButton>` 防 Obsidian button 样式泄漏

**Header（chat 标题栏）**
- 删除 `__spacer`，Open / Refresh icons inline 紧贴标题左侧
- 删除 Trash2 按钮（删会话改走 sidebar 右键菜单）

**Message（assistant 消息）**
- Head meta 持久化：原来只读 `streamingState.currentToolCalls`（流式结束后归零），改读 `message.toolCalls.length` + `message.genTimeMs` 让流式结束后 meta 仍可见
- tokenCount 加 k-format（1234 → "1.2k"）、duration 加 `8.4s` 格式
- 新增 `AGENT` chip（基于 toolCount>0 启发式判断）
- model badge 从 `--pk-accent-soft`(25%) 改 `--pk-accent-tint`(10%)，less saturated

**Suggested next + More popover（image 4）**
- More popover 加 FOLLOW-UP / ACTIONS 双分组 + 分隔线
- ACTIONS: Save to vault / Ask custom follow-up 真实 wire；其余 3 个 MIGRATION-DEFERRED 占位（不加 disabled 假按钮）

**Conversation Index（右栏 outline）**
- 全量重构 topic 卡片结构：summary 3 行（chev+icon+name+count / description / primary-attachment+mini-posbar）+ body 仅展开时显示 Sources/Attachments + Key messages
- 删除 body 重复的 Messages X-Y 标签 + 全宽 progress bar（summary 已有 mini）
- stripMarkdown helper 去掉 `## hello hello` raw markdown 漏出
- Tab segmented 全宽 + 紧凑 padding；search bar 防 Obsidian input 泄漏
- artifact thumb 60×44 → 28×28，per-kind 色彩去除统一中性灰
- message avatar P/U/! 语义色去除统一 `--pk-surface-sunken` + secondary
- topic 展开 bg `--pk-accent-tint` 紫 → `--pk-surface-sunken` 中性
- Topic icon 加浅色方块（22×22 `--pk-surface-sunken` + secondary icon）

**Run settings popover（image 8）**
- 宽度 320 → 300px，padding 收紧
- ROLE pills 3-col grid + 32px 高（防 reset 压扁需 `!important`）+ font base
- RUN MODE segmented 改全宽（display: flex / flex: 1 per opt）
- open 状态去掉 `--pk-accent-soft` 紫底（避免 chip 与紫色 send 视觉拥挤）

**Composer（image 9）**
- 关键 bug：`pkchat-composer__foot-right` DevTools 渲染 269.23×16px → 根因 Obsidian reset `.peak-design-root button { height: auto !important }` 把所有 button-based primitive 压成 SVG 自然高度
  - 修：`.pk-icon-btn` / `.pkchat-run-chip` / `.pkchat-send` 全部 `width/height/min-width/min-height/padding` 加 `!important`
  - 写入规则：`docs/conventions/ui-design.md` §4.3.1 子条款
- RunChip 去掉 `Default` role 段，trigger 现在 3 段（mode · model · ctx）
- Send button radius-md → radius-full（真圆形）+ 32×32
- Mic icon 改成始终常驻（不再 mic↔send 二选一）
- Footer-left 最终收成单一 `+` 按钮（attach 文件），删除 Paperclip/Database/LayoutGrid/旧 Plus（`[[` 已覆盖 context insertion；vault/web search 已在 run-chip popover）
- Enhance prompt 改成内嵌 footnote（移入 editor div），不再独占一行 chrome
- 删除 view-Messages 里冗余的 ArrowUp/ArrowDown 滚动按钮

**Layout 联动**
- `ViewSwitchConsistentHandler.handleActiveLeafChange`：CONVERSATION_OUTLINE_VIEW_TYPE 虽在 STANDALONE 但 special-case 调 activateChatView
- 早 return guard 从只检查 `isChatLayoutActive + chat active` 扩到必须 3 个 leaf 都在
- 左右 leaf 加 `revealLeaf` 展开折叠侧栏
- Outline view icon `panel-right` → `list-tree`

**设计系统规则补全（docs/conventions/ui-design.md）**
- §3.2 / §3.4 / §3.5 沿用现有 primitive 决策
- §4.3 / §4.3.1：button-based primitive 必须 `!important` 6 个属性（bg/border/padding/radius/width/height + min/max），不只 4 个
- §4.9 reset table 加一行记录我们自己的 reset 反咬
- §6.1 chip proliferation：7 个 chat 内 chip 类的迁移决策表（4 迁原语 + 3 保留 surface modifier）
- §6.2 surface migration all-or-nothing
- §6.3 "intentionally omitted" 必须带追踪句柄
- §6.4 mock data fixture 要求

**已知遗留 / 未做**
- Image 6 ArtifactCard inline 组件 + mock conversation fixture（独立 PR 推进）
- Topic icon 在折叠状态没有 attachment chip 时仍显示 mini-posbar（image 27 红圈位置）— 已实现，需视觉验证

### 2026-05-30 — Design System Unification 全量交付（21 PR / 单 session 并行 worktree dispatch）

按 `docs/superpowers/plans/2026-05-30-design-system-unification.md` 7 个开放问题拍板后全量实施。背景：4 条 in-flight redesign 流（onboarding+settings / chat / dashboard / copilot）各自做 mock 后视觉语言开始裂——accent 紫/蓝、light/dark 覆盖、token 命名 `--pk-space-*` vs `--pk-s-*` 都分叉。先做地基统一再放并行。

**§5 决议（一次拍板，不再重谈）**
- Accent: **Purple #7c3aed**（保留 production，blue 改紫）
- 主题: **light + dark 双模，Obsidian 主题驱动**（dashboard 放弃强制深色）
- Provider 色板: **一等公民**（peak-tokens.css 加 6 provider × {base, soft} × {light, dark}）
- 原语层: **CSS class（peak-components.css）+ React 薄壳（src/ui/components/primitives/）**
- usage_outcome 表: **进通用 telemetry layer**（dashboard / agent trace / copilot review 共用）
- per-surface 适配器: **共享层 `src/service/capabilities/`** 定义 SurfaceCapability interface
- Copilot: **不开 worktree**，PR-0 后小 skin PR 注册 adapter + 字符串重命名

**PR-0 · Design System Landing（commits `a7f0578` → `e28001d`，7 tasks 全 done，subagent-driven-development 流程）**
- Task 1: `peak-tokens.css` 扩 `--pk-radius-pill` + `--pk-shadow-sm/md` + provider 色板 6×2 (a7f0578)
- Task 2: 新建 `peak-components.css` 10 共享原语（pk-row + 7 chip 色调 + pill + icon-btn + segmented + modal + popover + form + disclosure + brand-av），全部 `:where(.pktw-root, .peak-design-root)` scoped (7f3a775)
- Task 3: 新建 `src/ui/components/primitives/` 9 React 薄壳 + types.ts + barrel (4599571, fix 87b4eb4) — Modal compound `Modal.X` 模式 + Pill aria-pressed + FormNumber className 修正
- Task 4: 新建 telemetry layer — `usage_outcome` 表 + Repo（insert/find/count/countUsefulMessages）+ Service（recordEvent + 5 convenience methods），9/9 tests pass (c944acc)
- Task 5: 新建 `src/service/capabilities/` SurfaceCapability interface + CapabilityRegistry 单例（6 capability 名 / 4 readiness / 5 surface id），6/6 tests pass (f554d6f, fix f5aee0a)
- Task 6: `templates/config/` 脚手架 — ConfigTemplateId 加 4 surface entry + 4 空 JSON shell (5a2396e)
- Task 7: 4 个 mock 包机械迁移——token rename 到生产名 + dashboard 补 light 主题 + accent 改紫，planning artifacts 一并 land (e28001d)

**Copilot skin（commit `a459578`）**
- 注册 SurfaceCapabilityAdapter（Fast Lookup + Research + Safety capability）
- MODE_LABELS 重命名（fast → Fast Lookup, complete → Research，5 个 UI 文件用户面字符串清理）
- Obsidian native Modal shell 保留，不重写

**路 B 并行 worktree dispatch（3 worktree × 4-5 PR = 13 PR，单 session 并行 Opus subagent）**

chat-retained → merged at fb94620（4 PR）:
- PR-Chat-1 (7f608e1): shell + HeaderRetained + ComposerRetained（Popover run-chip）+ `pkchat-*` CSS namespace
- PR-Chat-2 (1ff9a22): document-style message rendering + suggested-next + More popover + delete-conversation 回header + 14 orphan 文件删除
- PR-Chat-3 (77994b6): ConversationIndex 4 tab（All / Topics accordion / Artifacts cards / Messages）右 panel
- PR-Chat-4 (62aba8c): Chat CapabilityAdapter + telemetry (recordVaultSave / recordContinuation) + receipt slot + useCurrentContextUtilization hook + chat 终于写 usage_log + chatStrings → TemplateManager

dashboard-redesign → merged at b153e56（4 PR）:
- PR-Dash-1 (bc345d7): 6-screen 重做（Overview/ProviderModel/OutcomeValue/BudgetAlerts/History/Optimization）+ 8 chart 原语骨架 + Segmented 时间范围
- PR-Dash-2 (6bbc480): useDashboardMetrics hook — MPG + 3 阶 funnel + outcome breakdown，Overview 填实数；新增 `countAdoptedMessages` repo 方法
- PR-Dash-3 (eb16d27): "What was this about" 详情 Modal（per-feature switch）+ ProviderModel + OutcomeValue 填实数；Modal 加 `portalClassName` + `container` 修 Radix Portal 出 scope bug
- PR-Dash-4 (261156a): InlineReceipt + ContextRing + CuratorRuntimePushService（receipt 通过 chatBridge.ts 跨 worktree 集成）

onboarding-settings → merged at 56a842b（5 PR）:
- PR-A (a93daa6): OnboardingStateMachine 抽出来对齐 7 步契约，31/31 tests pass
- PR-B (a068427): 字符串全量外置到 onboarding.json + settings.json + 词汇契约 rename（Profile→Provider, Quick→Fast Lookup, Deep→Research, Embedding→Knowledge Index, MCP Servers→External tools, Permission Mode→Safety），grep 通过零违规
- PR-C (8840ec1): 视觉重写到 PR-0 原语 + 4 placeholder step 填实内容（capabilities / indexReadiness / systemCheck / readyToTry）+ `pkonb-*` CSS namespace
- PR-D (0b26a6e): 5-tab Settings IA 重排（Overview / AI Setup / Knowledge Index / Tools / Advanced）+ `pkset-*` CSS namespace + 横向 underlined tab bar
- PR-E (ec2d84d): useSurfaceReadiness hook 消费 CapabilityRegistry.getInstance().getAll()，Overview 实时反映已注册 surface（Option A: 只显示已注册）

**Merge 路径**
- chat → dashboard 干净 merge（fb94620, b153e56）
- onboarding merge 时 peak-components.css 冲突——chat 和 onboarding 都在 PR-0 末尾 append 自己 namespace，git 的 3-way diff 看成同位置冲突。union merge 太粗暴会切断 chat 半路 rule body。换策略：重建 = base(645 行) + chat-added(1120 行) + onboarding-added(921 行) = 2686 行，0 冲突 marker，build green
- 最终 master HEAD = d2bdf42（含 final completion log）

**3 个 worktree 物理 cleanup**（`/Users/zhangjike/code/peak-{chat,dashboard,onboarding}` 通过 `git worktree remove` 撤除）

**单 session 并行 dispatch 经验**
- 5 轮 round（每轮 2-3 subagent 后台并行），每个 round 等通知再开下一批
- Round 4 一次撞 session quota（auckland 8:10pm 重置），retry 间隔后顺利恢复
- 每个 subagent 跑 4-40 分钟不等，最长一个跑了 46 分钟做 PR-Chat-4
- 每轮 dispatch 前 controller 解决依赖（dashboard PR-Dash-4 等 chat PR-Chat-4 暴露 receipt slot + context hook）
- Subagent 的 followup notes 直接写进下一轮 dispatch prompt，避免重新调研

**测试 + 验证**
- `npm run build` master 全绿
- 5 关键测试套件全 pass：onboarding-state-machine (31/31), capability-registry (6/6), usage-outcome-repo (5/5), usage-outcome-service (5/5), usage-log-repo (4/4)

**已知遗留（不阻断，留给后续 polish）**
- 项目无 React 测试基础设施 → 6 个原语的 smoke test 待补（建 jsdom + @testing-library/react 后回补）
- Segmented roving-focus a11y 是 TODO
- chat 历史 v2-v5 草稿（chat-message-v5.css / chat-interaction-v4.css 等）残留 mock-only token，是历史快照非 retained 真源
- peak-components.css 几处 magic number（10px compact padding / 18px modal body padding）缺 inline rationale
- vault-search / ai-analysis / web-chat 暂无 CapabilityAdapter，Overview tab 只看到 Chat + Copilot 行（这些 surface 不在本 redesign 范围）
- usage_outcome `view_dwell` event_type 没在闭合 enum，dashboard funnel 第 2 阶（inspected）用 useful count 近似

### 2026-05-29 — Agent Harness Curator Onboarding 全量落地（PR1+2+3+4）

按 `docs/superpowers/specs/2026-05-25-agent-model-selection-design.md` 4-PR 分阶段执行，全部上线。背景：M5 之后用户没法判断 Quick/Deep/Premium 该绑哪个 model — 用户不知道答案（学界 RouteLLM 等论文：>4 类后 routing 准确率反降）。设计采用 LLM-curator 软决策 + zod 硬约束 + 规则兜底。

**PR1 · Backend（commit `e6760de`，+1,622 行）**
- Done: `templates/config/curator-catalog.json` — 22 model 元数据（Anthropic / OpenAI / Google / DeepSeek / Qwen / GLM / Llama / Gemma / Perplexity），含 BFCL / CEval / MMLU / cost / RAM / latency / language — 新 model 上线只加一行 JSON
- Done: `src/service/agents/harness/curator/`（10 文件）— types / catalog loader / RecommendationSchema (zod) / validation (unknown id / RAM / budget=0 / empty / tier_mismatch 软警告) / envProbe (RAM + Ollama + Profile + 中文比例采样 60 文件) / prompt (中文 system + soft suggestions + 错误反馈回灌) / fallback (规则兜底，保证 validation-clean) / CuratorAgent.runCurator (generateText → JSON.parse → zod → validate → 3 次 retry → fallback)
- Done: TemplateRegistry 注册 `CuratorCatalog` + main.ts boot 加载
- Done: 14/14 单元测试（catalog hydrate / schema 校验 / 硬约束 / fallback 在 RAM / budget / 语言 / 已装条件下的选择）

**PR2 · Wizard 框架（commit `1c81e5c`，+1,083 行）**
- Done: 共享 `onboarding/ProviderForm.tsx`（提取 PROVIDER_OPTIONS + AddProviderForm + SavedProfileRow），新增 setActiveOnFirst / autoAssignWebSearch flags 让 harness wizard 不污染 active role
- Done: `harness-onboarding/state.ts` — 纯 reducer + StepId + canContinue/stepIndex（先实现 Welcome / ChooseProvider / ChooseBootstrap 三态）
- Done: 3 步 UI — WelcomeStep（入口 CTA + 跳过逃生口）/ ProviderStep（单选高亮 + 自动选唯一可用 profile）/ BootstrapModelStep（Ollama 实时 fetchOllamaModels 按 size 排序，云用 modelRegistry，推荐 regex 打 ⭐）
- Done: `HarnessOnboardingModal` Obsidian Modal 壳 + StepIndicator + `openHarnessSetupWizard` 命令 + Settings → Agent Harness 顶部 "Re-run setup wizard" 按钮
- Done: 18/18 reducer 测试

**PR3+4 · 完整 Curator 集成（commit `a2a1610`，+909 行）**
- Done: state.ts 扩 preferences / isRunning / result / error / redoNote + 新事件 set-budget / set-speed-quality / run-curator-{start,success,error} / open-edit / open-redo / submit-redo / accept-recommendation / update-binding；detour 处理（back from edit/redo → review）
- Done: PreferenceQuestionsStep — 2 题（budget x speed/quality）
- Done: RunningCuratorStep — detectEnvironment + runCurator，abort signal，catalog 缺失时自动 buildFallbackRecommendation
- Done: ReviewRecommendationStep — bindings 表（含 cost/RAM hint）+ modelsToDownload + apiKeysNeeded callouts + rationale + cascade 状态 + fromLLM=false 时显示"规则兜底"角标
- Done: EditRecommendationStep — 每档 dropdown 用 filterByTier 拉候选
- Done: RedoInputStep — textarea + preset chips（"Premium 太贵换 Sonnet" 等），dispatched 为 userFollowup
- Done: `applyRecommendation.ts` — capability → 现有 HarnessSettings 字段映射（quick→localFastConfig / deep→localDeepConfig / premium→onlineConfig）+ 缺 profile 跳过 + Notice 告知；cascadeEnabled → allowEscalation；plugin.saveSettings
- Done: 28/28 state machine 测试（含 curator 生命周期 + edit gating + binding mutation + detour 返回 + submit-redo 保留 note + accept→done）

**验证**
- npm run build clean（3 次）
- 56/56 相关测试通过（14 curator + 28 state machine + 8 harness-tier + 6 harness-loop）
- harness-bridge.test.ts 在 master 上原本就 fail（test runner 不构造 AppContext），不是这次引入
- 命令面板暴露 "Agent Harness — Setup Wizard"，Settings → Agent Harness 顶部有 "Re-run" 入口
- 完整流程：Welcome → ChooseProvider → ChooseBootstrap → Preferences → RunningCurator → ReviewRecommendation → (Edit / Redo) → Accept 写 HarnessSettings → Done

**Total: 3 commits, +3,614 行**。spec §12 的 5 个开放问题（Curator 用哪个 model 跑、Re-run wizard 主动提示频率、Per-agent override 暴露形式、Cascade policy 形态、多设备同步）未决，按默认实现，可在后续 PR 决定。

### 2026-05-23 — Codex UX sketches → real picker + report UI（mockup v2 → impl → 整天 debug Obsidian CSS 干扰）

整天分三大块。

**Block 1 · Mockup v2 重做（commit `8fc5784`）**
- Done: 用户提供 7 张 Codex UX 设计稿（picker · vault tab + 6 report tabs）+ 3 张 picker 稿（Document / Vault / Setting）。先逐张视觉 diff 现有 mockup（`2026-05-20-vault-review-mockup.html`），发现结构性差异（不对称 snapshot grid、缺 agent trace right rail、tab 样式 pill vs underline、Sources 3-col 缺等等）
- Done: 归档旧 mockup 到 `_archive/`，新文件 `2026-05-22-vault-review-mockup.html`（4146 行，10 scenes：3 picker + 6 report），按草稿 1:1 重做：Lucide-style SVG symbol library、`--pk-*` token、顶部 scene 切换 navigator
- Done: spec 加 §8.0 "Review Launcher Picker"（picker 4 个问题 + 区域/按钮/差异 3 张表 + 设计边界）

**Block 2 · 真实代码实现（Phase A → D，5 commits）**
- Done: Phase A — 新基础原语：`<Pill>` 8 个 token-aligned variants（success/warning/danger/info/accent/indigo/neutral/outline）+ `<Tabs>` 两个 variant（segment / underline）
- Done: Phase B — `CopilotPickerModal` 重画：3-tab segment header（Document/Vault/Setting）+ search + scope metadata + 新 `<PickerReadinessCard>` 通用 layout（icon + title/desc + signal chips + run-strategy 按钮列）+ 3 个 readiness adapter（document/vault/setting）+ 2-col split + Show all capabilities footer。删除 old `VaultIntentCard`，5-state 逻辑搬到 `vaultReadiness()`
- Done: Phase C — `VaultAutoRunModal` 1220 行 → 1850 行重写，6 个 tab 全按 mockup 重做：shield-check brand、count-badge tab、3×2 snapshot grid、4-chip "What changed"、cluster table+inline expanded card、Bridge score progress、action card with rank+drag+3-stats、Sources 3-col、Trace timeline+step inspector。删 `vault-review.css`（889 行），全 Tailwind 化
- Done: Phase D — placeholder stubs 都在位（bridge score、source signal pills、setting diagnostics 3 个 TODO marker），等真 service ships 再接

**Block 3 · 整天 debug Obsidian CSS 干扰（recurring pitfall 首次系统整理，12+ commits）**

用户反复反馈 "picker 的 row hover 看着比其他高一截 / 整体感觉错乱 / 拥挤"。多轮误诊后定位根因。

- 弯路 1 (`3d79b74`/`a5176e6`/`176a3a7`)：以为是 truncate/line-clamp/spacing 问题，反复调 layout — 无效
- 弯路 2 (`164f73c`)：发现 Tailwind 半步 spacing scale 只到 `3.5`，我用了大量 `4.5/5.5/6.5/9.5` 全是 silently failing — 替换成 `[Npx]` arbitrary 语法。改完仍有"错乱"
- 弯路 3 (`1fa79d3`)：以为白底 card 跟白 modal 融合不可见 → 改成灰底。结果还是错乱
- 弯路 4 (`91a9c4c`/`c57bf56`/`eaa82f9`)：以为是 Obsidian button `:hover` 加了 transform/box-shadow → reset 加 `transform/box-shadow/outline/filter: none !important` + 禁用 `::before/::after` 伪元素。用 Playwright 模拟 Obsidian 极端 hover 干扰验证 reset 真挡住了 — 然而 in-Obsidian 仍错乱
- 弯路 5 (`e352074`)：加 `· v3` 标题 marker 让用户能肉眼判断 CSS 是否真重载
- **真凶 (`7d37916`)**：用户贴 DevTools computed styles dump，**直接看到** Obsidian 的 `.modal button { height: var(--input-height); justify-content: center; }` ——把所有 modal button 高度锁死成 32px，flex 行为崩坏，hover 颜色只填充 32px 中间条。我的 reset 一直没盖 `height`。Fix：reset 加 `height/min-height/max-height: auto !important; justify-content: flex-start`。**一次性彻底解决**
- Done: 沉淀到 `docs/conventions/obsidian-css-defense.md`（新增 "Properties the reset must null" 完整属性清单表 + "Diagnosing a suspected leak" 流程）+ `docs/90-old-root-docs/recurring-pitfalls.md` 新条目 #3（Obsidian global bare-tag rule leaks through scoped reset，含本次实例 + Detection signals + Prevention checklist）

**Block 4 · 后续 UX 调整（多 commit）**
- Done: `redesign(history-modal)` `4138095` — `CopilotReviewHistoryModal` 去 5 层 border，加 `peak-design-root`（同 CSS 干扰治了），trash 改成 hover-only ghost，去掉底部 Close 按钮（modal 已有 ×）
- Done: `ae9bcf5` — 顶部 tab 恢复 hover/active 反馈（之前误删的）+ history modal 加 Back 按钮
- Done: `d0c4224` — active tab 加 `bg-pk-accent-tint`（用户嫌 underline 不够明显）+ Run strategy primary 按钮从 shadcn 蓝色（`--pk-info`）改成品牌紫
- Done: `80becaf` — history modal 加 scope prop：Vault tab "All reviews" 直接接 `VaultReviewReportService`；Document tab 加 "This note / All notes" segmented toggle；统一 NormalizedRecord 类型让两种数据共用 row 渲染
- Done: `fe2b16c` — Setting tab 假数据洁净化：去掉 "All diagnostics" 误导 link、`SettingDiagnosticsList` 两个假行换成 "No diagnostics yet" 空状态、section title 加 `[preview]` pill

**Total: ~24 commits**。10-scene picker + 6-tab report UI 全部 live，1 个 recurring pitfall 正式建档，CSS defense convention 全面扩张。

### 2026-05-22 — Vault Auto Review 全量交付 + 设计系统暴雷 + 整改 spec

整天工作量超大，分四大块。

**Block 1 · Copilot doc-scope Auto Review 收尾**（剩余 H 列表 + 多轮 UX 迭代）
- Done: H#2/#3A/#4/#5 完成（debounce 立即写、Fast=Haiku auto override、Cancel 状态徽章、peak-system folder onboarding Notice）
- Done: G1-G3 自我检查 prompt 强化、capability chip 删除、Changes view toggle 移到 tab 行 sticky
- Done: I1-I2 卡片样式柔化、footer 合并 Apply 双按钮为单 Apply N changes 仅 Changes tab 显示、删 Close 按钮
- Done: H1 文档语言检测注入 + 用户偏好（profile markdown）系统 prompt 注入；H2 sources 改 div role=button + getLeaf('tab') 新 tab 打开
- Done: J1/J2 review headline frontmatter 持久化（first insight / first change title）+ 行 border 删干净
- Done: M1 Changes view toggle 移到顶层 tab bar 右侧、默认 Blocks only
- Done: N1/O1 Vault tab 用 listAll 全库 review、Setting tab 隐藏 history + Auto 按钮、show all 默认展开
- Done: K1 Sources 卡片 button → div role=button 修复 Obsidian button 全局样式注入导致的 flex 错乱（recurring pitfall #1 首次遇到）
- Done: L1 Insights tab hover popover TOC 加 Suggested follow-ups 入口
- Done: Q1 Trace 顶部 elapsed time summary
- Done: R1 Sources 新 tab 打开 + 头部解释卡；S1 Insights bg `bg-muted/30` 加 shadow，info severity 终于看着像卡片
- Done: P1/P2 行 hover bg 加深 + 完整 stat 标签；`originScope` 字段持久化到 frontmatter + 按 scope 过滤列表

**Block 2 · Vault Auto Review 从零交付**（8 任务 T1-T8 + 4 修复 + 全量重写）
- Done: 综合分析报告（北极星 / 竞品 / 学界 / 现有能力盘点 / 5 条差异化机会）
- Done: 综合设计文档 `docs/superpowers/specs/2026-05-20-vault-auto-review-design.md`（18 节，被 Codex 改过加 5 tab modal 结构 + Sources tab）
- Done: Mock HTML `docs/superpowers/mockups/2026-05-20-vault-review-mockup.html` 还原 Codex 7 张设计稿（picker + 6 tabs）
- Done: T1 VaultFingerprintService（sha1 over sorted path:contentHash + 30s 缓存 + 五状态映射 A-E）
- Done: T2 VaultDigestService（counts/clusters/holes/hubs/orphans/lint/activity 一次性聚合 + formatVaultDigestForPrompt）
- Done: T3 三个新 propose tool（`propose_cluster_observation` / `propose_gap` / `propose_action`）+ collector 新类型 + VaultMetaAgentStream system prompt
- Done: T4 runVaultReview session 多轮编排（无 ctx.file，独立轮数 SAFETY_CAP=12）
- Done: T5 VaultReviewReportService 落盘 `peak-system/vault-reviews/{ISO-date}-{hash}.md` + frontmatter 完整 schema
- Done: T6 Picker Vault tab UI（VaultContextLine / VaultIntentCard 5 状态 / VaultReviewHistoryList）
- Done: T7 VaultAutoRunModal + 6 tabs（Overview / Clusters / Gaps / Actions / Sources / Trace）
- Done: T8 picker onAuto 分流到 VaultAutoRunModal、history 还原走 openVaultReviewHistoryRecord
- Bug: U1 `translateSdkMessage` 第二参数 opts 对象未传，agent 流首条消息就崩 "B.split is not a function" — 修
- Bug: W1 cluster topNodes 实际是 `{path,label,betweenness}` 对象数组不是 string[]，点 cluster 行白屏 — 修

**Block 3 · UI 视觉还原 4 轮迭代 + Tailwind 翻译终局放弃**
- Iteration 1: V1-V6 修小问题（隐藏运行结束后的 trace rail / 删 Recent activity / cluster 行可选 + 异步 fetch members / Actions 空 chip 过滤 / TOC hover popover / prompt 强化 coverage targets）
- Iteration 2: 用户多次截图指出视觉跟 mock 差距大，**承认 Tailwind 翻译每属性 5% 损耗 × 10 属性 = 肉眼可见差异**
- Decision: 放弃 Tailwind 翻译路径，转 Mock CSS verbatim 复制方案
- Done: 新 `src/styles/vault-review.css`（730 行，scope 在 `.peak-vault-auto-run-modal`），mock `<style>` 块 1:1 复制
- Done: VaultAutoRunModal 完整重写，全部 className 改用 `vr-*` 命名（Tailwind 全清），inline SVG 替代 lucide
- Done: fallback 链补全：cluster label / dominantTopics / status / prevRecord 反查
- Iteration 3: 用户报"边框很多 / X 按钮不一致" → 定位到 Obsidian `<button>` 全局样式注入（recurring pitfall，跟之前 trace panel 同根因）

**Block 4 · Convention 体系建立 + 设计系统暴雷**
- Done: `docs/conventions/README.md` 索引 + 加新规则的格式约定
- Done: `docs/conventions/obsidian-css-defense.md` 详细规则（TL;DR / 原理 / Do / Don't / Checklist）
- Done: `src/styles/obsidian-reset.css`（`.peak-design-root` 类触发的 bare-tag 中和 reset）
- Done: `CLAUDE.md` 加 Project Rules section 一行指针
- Done: VaultAutoRunModal modal root 加 `peak-design-root` class
- Audit: 用户要求审所有 mock 文件 → 发现 12 个 mock 共 **5 套并行 token 系统**：
  - 真源 `peak-variables.css` 用 `#7c3aed`
  - 旧 chat redesign mock 用 `--accent` `--bg` 无前缀但值对
  - ai-analysis mock 用 `--pk-*` 完全对齐
  - dark variants 4 个 mock 各自一套
  - **我的 vault-review 用 `#7B5CFF` ❌ 偏离**
  - prompt-template-modal 用 Obsidian native dark
  - Streamdown shadow DOM 是第 6 套独立 shadcn HSL 系统
- Numbers: 200+ `pk-*` Tailwind class 引用、71 文件 hardcoded hex、25 文件直接引用 Obsidian theme var
- Done: 完整 spec `docs/superpowers/specs/2026-05-22-design-system-migration.md`（17 风险 / 6 phase 5-8 天 / 7 个待评审决策）

**关键沉淀（永久价值）**
- `docs/conventions/` 文件夹模式（rule 拆分而非堆 CLAUDE.md）
- `peak-design-root` 防 Obsidian 注入的可复用 class
- Obsidian CSS defense 规则文档
- 全局 design system 现状清单 + 暴雷分析（17 风险）
- 颜色不一致根因：`#7B5CFF` vs `#7c3aed` 早已埋下

**Known limitations / Next**
- Design system 迁移 spec 等用户评审 §3 风险 + §7 决策（紫色定哪个？Obsidian 主题继承否？Dark mode 时机？旧 mock 处置？）
- Vault Auto Review 视觉部分还有几处细节需要在确认设计系统统一方案后再修
- agent 产出量仍偏少（Fast 1-2 cluster / Complete 5 cluster），V6 prompt 改了但实际 vault 跑一次的覆盖未到 mock 期望水位
- Cluster member fetcher 依赖 `mobius_node.community_id` 字段，新 vault 没跑过 community detection 时为空（需引导跑一次 index）

### 2026-05-10 (Session 28) — S2-S7 全量并行执行（6 竞品差异化功能）

- Done: **Pre-wave — 6 个 Plan 并行编写**
  - `vault-lint.md` (7 tasks), `cascade-update.md` (8 tasks), `structural-hole.md` (8 tasks), `ppr-tuning.md` (4 tasks), `precompiled-knowledge.md` (6 tasks), `auto-tag.md` (4 tasks)
- Done: **Wave 1（3 线并行，零文件冲突）**
  - **S2 Vault Lint** (7 tasks): 5 信号检测器 + VaultLintService + VaultXRayView + ScoreRing/DimensionBars/PriorityActions
  - **S5 PPR Tuning** (4 tasks): co-citation 第 4 层 + query-node seeding + Settings enablePPR toggle + 评估命令
  - **S7 Auto-tag** (4 tasks): Schema 修复 + tag_suggestion 反馈持久化 + Accept High Confidence + batch FolderPicker
- Done: **Wave 2（2 线并行，协调 ddl.ts）**
  - **S3 Cascade Update** (8 tasks): hub_constituent 表 + HubConstituentRepo + CascadeWorker hub_invalidate/folder_stats 补全 + hub_regen stub
  - **S4 Structural Hole** (8 tasks): Brandes betweenness + Louvain community + Burt constraint + StructuralAnalysisRepo + Gap Analysis View + bridge actions + MCP tools
- Done: **Wave 3（S3 依赖已落地）**
  - **S6 Precompiled Knowledge** (6 tasks): HubStalenessDetector + HubRegenService (30s debounce, batch-10, 3x retry) + hub_regen_queue + reranker hub_doc boost
- Done: **TASKS Batch 1 (3 线并行)** — Phase 0 cleanup + 7 issues (#90 #81 #79 #76 #42 #38 #83)
- Done: **TASKS Batch 2 (3 线并行)** — #73 #57 #17 #14 #39 #47 #45 #31 #46 #12
- Done: **TASKS Batch 3 (3 线并行)** — #92 #77 #74 #93 #72 #2 #21 #60 #67 #91 #48
- Done: **TASKS Batch 4 (2 线并行)** — #32 #34 #40 #43 #29 #20 #44 #89 #58
- 总计本 session: 37 S-feature tasks + 35 TASKS.md issues = **72 tasks/issues**
- Build 通过，tests 通过
- **竞品差异化 S1-S7 全部完成 + TASKS Phase 3-9 大部分完成**
- Next: Phase 10 integrations, Phase 11 docs, 依赖瘦身, 真机验证

### 2026-05-10 (Session 27) — Wave 3 并行执行（Ambient Push Phase 4 + Provider MCP Phase 4-5）

- Done: **Ambient Push Phase 4 — Morning Briefing** (7 commits, 12 files, +1660 lines)
  - `BriefingItem` 类型 + `enableMorningBriefing` 设置
  - 3 类 SQLite 查询：未解决连接（incoming >= 2, outgoing < incoming*0.5）、变化的 Hub、衰减笔记（14 天未打开 + 高 PageRank）
  - `MorningBriefingService`：4h 间隔检查 + 并行数据收集
  - Zustand store + Obsidian Modal + React panel（三分组卡片 + hover Open/Dismiss）
  - `main.ts` 3s 延迟触发，cleanup on unload
  - 修复 Phase 2 缺失的信号检测导出函数
- Done: **Provider MCP Phase 4-5 — Skill System + Usage Dashboard** (7 commits, 13 files, +2099 lines)
  - Phase 4: `SkillDefinition` 类型 + YAML frontmatter markdown 解析器
  - `SkillRegistry` 单例：vault `_skills/` 目录扫描 + Obsidian vault 事件热加载
  - 3 个内置 skill：weekly-report、literature-review、vault-health-check
  - `SkillExecutor`：simple（单阶段）+ pipeline（多阶段）模式，复用 `queryWithProfile()` + AgentTool
  - Skill Picker Modal（搜索 + tag 过滤 + 动态输入表单）+ `peak-run-skill` 命令
  - Phase 5: `ModelRegistry.syncFromServer()` 服务端定价同步（Bearer auth, 10s timeout, 非破坏性合并）
- Plans written: `2026-05-10-ambient-push-phase4.md`, `2026-05-10-provider-mcp-phase4-5.md`
- Build 通过，ambient-push tests 全部通过（30 tests）
- Ambient Push S1 全 4 Phase 完成；Provider MCP 全 5 Phase 完成
- Next: S2 Vault Lint/Health Check spec + S3 级联关系更新 spec

### 2026-05-10 (Session 26) — Wave 1+2 并行执行（Ambient Push + Inspector + MCP + Report UI）

- Done: **并行执行框架** — `docs/90-old-root-docs/parallel-execution-plan.md`，4 wave 编排，worktree 隔离
- Done: **Wave 1（5 条线并行）**
  - **Line A — Inspector Tools Overhaul** (12 tasks, 12 commits)
    - Schema 重设计：`BaseLimit.limit` 语义统一、`findPathInputSchema` strategy enum、`SemanticFilter.topK` max 30
    - `find-path.ts` 2032 行拆为 5 文件（scorer/reliable/fast-track/brainstorm/index），删除 temporal 策略
    - `makeTool` 工厂 + `forceFormat` 选项，消除 3 个 MarkdownOnly 变体
    - 11 个工具描述重写（When to use / Avoid when 格式）
    - 7 个实现文件从 `params: any` → Zod 推断类型
    - Recon system prompt 加工具选择指南
    - `search_by_dimensions` 结构化诊断输出、`find_orphans` 双重过滤 bug 修复
  - **Line B — V2 Persistence Bug Fix**: 5 个 bug 全部已在之前 session 修复
  - **Line C — Report UI**: V2InlinePlanReview sticky footer（flex 布局），Task 4 inline edit 已实现
  - **Line D — Ambient Push Phase 2** (7 tasks, 7 commits)
    - 图谱 2-hop 扩展 via `GraphRepo.getRelatedFilePaths()`
    - 4 种新信号：shared_tag、graph_neighbor、co_citation、hub_member
    - 反馈学习：opened/linked +0.1(cap +0.3)、ignored -0.05(cap -0.15)、dismissed 抑制 7 天
    - `getPositivePairs()`/`getIgnoredPenalties()` 聚合查询
  - **Line E — MCP Spike**: **GO** — `@modelcontextprotocol/sdk` 全 transport 可用，+450KB bundle
- Done: **Ambient Push 可见性修复**
  - `main.ts` onLayoutReady 首次自动打开右侧栏
  - `ViewSwitchConsistentHandler` Chat/Doc 布局切换不覆盖 AmbientPush tab
- Done: **Wave 2（3 条线并行）**
  - **Line F — AI UX Phase 3**: 17/17 tasks 全部已实现，`progress.md` 更新标记 COMPLETED
  - **Line D — Ambient Push Phase 3** (10 tasks, 8 commits)
    - `SerendipitySearcher`: 2-hop 邻居 + 最大 embedding 距离算法
    - `SerendipityGutterPlugin`: CM6 ViewPlugin，光标行 `?` 图标 + hover tooltip + click 打开
    - `RelevanceExplainer`: LLM Tier 2 微解释（fire-and-forget，rate-limited 2min）
    - `PatternLearner`: 跨会话 recurring pairs 缓存（10min 刷新，0-0.4 boost）
    - `PushCard` LLM 标记（Sparkles icon）
  - **Line E — Provider MCP Phase 1-3** (12 tasks, 12 commits)
    - Phase 1: 4 个 provider JSON + TemplateManager 运行时加载 + `ModelRegistry.loadFromTemplateManager()`
    - Phase 2: `OpenAICompatibleEndpoint` + 模型自动发现 + preset（LM Studio/LiteLLM/vLLM）+ Settings UI
    - Phase 3: `MCPClientManager`（stdio + SSE）+ `MCPToolAdapter`（JSON Schema→Zod）+ MCP Settings tab + 3 agent 集成
- Plans written: `inspector-tools-overhaul`, `ambient-push-phase2/3`, `provider-mcp-phase1-3`, `parallel-execution-plan`
- Spike report: `docs/superpowers/specs/2026-05-10-mcp-spike-report.md`
- Build 通过，ambient-push tests 通过
- Next: Wave 3 已完成（Session 27）

### 2026-05-10 (Session 25) — OpenRouter Stall Timeout + UI 小修
- Done: **OpenRouter PROCESSING 卡住修复**
  - 根因：OpenRouter 排队时发送 `: OPENROUTER PROCESSING` SSE 心跳，`eventsource-parser` 静默消费不产生 data event，`for-await` 无限挂起
  - `vercel-adapter.ts`：stall timeout（30s 无 chunk → abort）+ total timeout（5min → abort），接入已有但未使用的 `timeoutStepMs`/`timeoutTotalMs` 设置
  - `provider-factory.ts`：OpenRouter 加 `HTTP-Referer` + `X-Title` headers 提高路由优先级
  - `CopilotResultModal.tsx`：LOADING_STEPS 精简（移除 60s 无效提示，25s 提示 provider 排队），Back 按钮 `<button>` → `<Button>`
  - 用户取消时静默结束 generator（不再 yield error）
- Done: **UI 小修**
  - `MessageViewItem.tsx`：Style chips 最后一条消息始终可见，其余 hover 显示
  - `PromptItem.tsx`：所有 item 统一 hover 背景，非成对 item 加 cursor-pointer
- Build 通过
- Next: 真机验证 stall timeout 效果

### 2026-05-09 (Session 24) — Copilot Token 显示 + 请求取消
- Done: **Token Usage Display**
  - `ActionUsage` 接口 + `usage?` 字段加到 `ActionResult` 三种变体
  - `queryTextStream` 的 `done` 事件携带 `usage`；`queryStructured` 加 `usageCallback` opts
  - `toActionUsage()` 转换 helper，10 个 LLM action 全部捕获并返回 usage
  - `UsageFooter` 组件：result 阶段底部 "X in + Y out tokens"
- Done: **Request Cancellation**
  - `CopilotAction.execute` 签名加 `signal?: AbortSignal`，15 个 action 全部透传
  - `CopilotResultModal.onOpen()` 创建 `AbortController`
  - Loading 阶段 Cancel 按钮（X 图标），点击 abort + 显示 `CancelledView`
  - `CancelledView`：Ban 图标 + "Cancelled" + "Back to Copilot" 按钮
  - Back 按钮 / modal close 同步 abort
  - catch 中判断 `signal.aborted` → 显示 cancelled 而非 error
- Files: CopilotActionRegistry.ts, service-manager.ts, actions/index.ts, CopilotResultModal.tsx
- Build + tests 通过
- Next: 15 个 action smoke test + Suggest Links 本地化（可选）

### 2026-05-09 (Session 23) — Bug 修复 + 清理
- Done: **移除独立 Copilot 命令**
  - 删除 `copilot-commands.ts`，移除 `Register.ts` 中 `buildCopilotCommands()` 调用
  - 命令面板只保留 "Open Copilot Panel"（Picker Modal），不再注册 15 个独立 action 命令
- Done: **OpenRouter 404 修复** — `baseUrl` 缺少 `/v1` 后缀
  - 根因：`presets.ts` / `materialize.ts` / `sdkProfile.ts` 硬编码 `https://openrouter.ai/api`，覆盖了 `@openrouter/ai-sdk-provider` 库的正确默认值 `https://openrouter.ai/api/v1`
  - 修复 3 个源文件 + `provider-factory.ts` 加运行时兼容（已保存的旧 profile URL 以 `/api` 结尾自动补 `/v1`）
  - 测试文件同步更新，全部通过
- Done: **SuggestedFollowups 级联 LLM 调用修复**
  - 根因：`SuggestedFollowups` 在所有 assistant 消息上渲染（CSS 隐藏 ≠ 不执行 useEffect），切换对话时 N 个 assistant 消息 = N 个并发 LLM 请求
  - 修复：`MessageViewItem.tsx` 加 `isLastMessage` 条件，只在最后一条消息渲染 `SuggestedFollowups`
- Build + tests 通过
- Next: 重载插件验证 OpenRouter 连接 + chat 无级联报错

### 2026-05-09 (Session 22) — Profile authToken 清理
- Done: **Phase X3 — Profile authToken 清理**
  - **根因调查**：PatternDiscovery 启动 401 错误 → Agent config 指向 "Migrated OpenRouter" profile（baseUrl 空 → OpenRouter token 发到 Anthropic API）；Copilot TagSuggestion 报 "OpenRouter API key missing" → Copilot config 指向无 key 的空 OpenRouter profile
  - **数据清理**：合并两个 OpenRouter profile（Migrated authToken → OpenRouter apiKey），删除 Migrated OpenRouter，重新绑定 4 个 slot
  - **authToken 字段删除**：Profile 接口移除 `authToken`，所有 provider 统一用 `apiKey`
  - **代码清理**（10 个文件）：
    - `types.ts` 移除字段、`presets.ts` 8 个工厂方法清理
    - `materialize.ts` 简化：Anthropic → `ANTHROPIC_API_KEY`，OpenRouter → `apiKey` 映射到 `ANTHROPIC_AUTH_TOKEN`（CLI 要求 Bearer）
    - `provider-factory.ts` / `testProviderConnection.ts` 直接用 `apiKey`
    - `ProfileCard.tsx` 移除 "auth token set" 显示
    - `sdkProfile.ts` 移除 `authToken` + 统一 OpenRouter fallback 用 `apiKey`
    - `PluginSettingsLoader.ts` 加 legacy 迁移：旧 `authToken` → `apiKey`
  - **OpenRouter baseUrl 修复**：空 baseUrl fallback 到 `https://openrouter.ai/api/v1`（`materialize.ts` + `provider-factory.ts`）
  - **测试更新**：3 个测试文件同步更新（profile-registry、sdk-profile、embed-client），全部通过
  - Build 通过
- Next: 重载插件验证无启动错误

### 2026-05-09 (Session 21) — Search Pipeline Upgrade + Onboarding Index Config
- Done: **Phase AC — Onboarding Index Configuration** (7 tasks, 7 commits on `feat/onboarding-index-config`, merged to master)
  - **Onboarding 4步流程**：Welcome → Provider → **Index Config** → System Check+Indexing
  - **三档索引选择**：Quick Index (FTS only, ~30s) / +Semantic Search (+embedding, ~5min) / +Smart Enrichment (+LLM, ~30min)
  - **Smart Provider Defaults**：OpenAI→自动选semantic+预填embedding、Ollama→fast+hint、Anthropic→fast+警告(无embedding API)
  - **Inline Embedding Config**：endpoint/model/apiKey 直接在 onboarding 里配置 + Test Connection
  - **IndexProgressDisplay**：进度条 + 步骤标签 + 文件计数
  - **IndexErrorDialog**：embedding/LLM 失败时 Continue/Retry/Cancel 三选一
  - **IndexInitializer 升级**：`performStagedFullIndexing(level)` 按档位跳过 embedding/LLM 步骤 + error callback
  - **Settings SearchIndexSection**：索引级别下拉 + 文件统计 + Rebuild Index 按钮
  - **SearchUpgradePrompt**：搜索 ≥10 次且无 semantic search 时，结果底部淡色提示 → Settings（7天冷却）
  - **Settings 迁移**：已有 embedding 配置的老用户自动升级为 `semantic`
- Spec: `docs/superpowers/specs/2026-05-09-onboarding-index-config-design.md`
- Plan: `docs/superpowers/plans/2026-05-09-onboarding-index-config.md`

### 2026-05-09 (Session 21) — Search Pipeline Upgrade
- Done: **Phase AB — Vault Search Pipeline Upgrade** (19 tasks, 19 commits on `feat/search-pipeline-upgrade`, merged to master)
  - **架构重构**：硬编码三路搜索 → 可组合 Query Pipeline（QueryParser → 5 Retrievers → adaptive RRF Merger → Ranker → HighlightEngine）
  - **关键 Bug 修复**：BM25 分数被 `Math.max(0, negative)` 清零 → batch 归一化恢复 TF-IDF 信号
  - **QueryParser**：`"短语"` 精确匹配、`-排除` 否定搜索、`tag:` / `ext:` 过滤、auto prefix 匹配
  - **5 路 Retriever 注册表**：FTS (BM25 fix + chunk decay)、FTS-Stem (Porter Stemmer 词干匹配)、Vector (KNN)、Meta (title/path/tags)、Fuzzy (Levenshtein ≤2 错字修正)
  - **自适应 RRF 融合**：query-dependent 权重（短语→压低语义、长查询→拉高语义、CJK→跳过 stem）
  - **Per-document Chunk Decay**：指数衰减（decay=0.5），防长文档碾压短文档
  - **Click-through 学习**：search_click 表记录用户点击，stemmed query key 泛化，+0.15 ranking boost
  - **HighlightEngine 统一**：原始文本 snippet（非 FTS 归一化文本）、exact/stem/fuzzy 三色高亮、双因子窗口选择（diversity×2 + density）
  - **Ranker 微调**：recency 衰减 30d→40d、frequency 0.15→0.10、新增 exclude post-filter
  - **Debounce 优化**：vault 500ms→200ms、in-file 300ms→150ms、go-to-line 500ms→100ms
  - **UI**：统一 `renderHighlightSpans` 渲染器、fuzzy correction banner、`?` 帮助增加查询语法文档
  - **Cleanup**：删除 `highlight-builder.ts`、删除 6 个过时 RRF/scoring 常量、queryService.ts -517 行
- Spec: `docs/superpowers/specs/2026-05-09-vault-search-pipeline-upgrade-design.md`
- Plan: `docs/superpowers/plans/2026-05-09-vault-search-pipeline-upgrade.md`
- Next: 真机验证搜索效果 + Onboarding 流程验证 + Phase W Copilot smoke test

### 2026-05-08~09 (Session 17+20) — Codebase Deep Refactor
- Done: **100,002 → 71,582 code lines (-28,420 = -28.4%)**, 40 commits on `refactor/codebase-50k-target`
- Hub 系统完整删除 (-6,750), D3 graph-viz → ReactFlow (-6,373), Wave 0 dead code (-5,448)
- Wave 2 store migration (-630), 结构分析管线删除 (-920), 遥测系统删除 (-1,009)
- Service 简化 (-2,800), Loader 基类提取 (-911), Feature 删除 (-2,600)
- 死 UI 组件 (-830), console strip (-234), dead exports/files/stubs (-315)
- Next: UI 组件精简, MobiusNodeRepo 瘦身, service/chat 合并 (target 50k)

### 2026-05-09 (Session 21) — Codebase Deep Refactor Phase 2
- Done: **71,227 → 66,742 code lines (-4,485 = -6.3%)**, 25 commits on `refactor/codebase-50k-target`
- 死代码删除 (-800): hub SQL/NativeModule tryCompile/BetterSqlite require.cache/dead files/dead props/PromptId/MobiusEdgeRepo 9 methods
- 算法简化 (-1,200): find-path.ts A*→min-heap+BFS合并(1514→986), buildBackboneMap tag-ranking折叠+DFS合并(1519→1208)
- 架构重构 (-1,000): 14 copilot actions→factory(787→377), service-manager 18 wrappers→getter, IndexService 3 classes→1
- 冗余压缩 (-750): tools 8文件简化(-710), search infra 去重(indexInitializer/semanticEdges/SqliteStoreManager/highlight-builder/progress-tracker, -1099)
- 注释/类型精简 (-700): document/types.ts(325→109), settings/types.ts(468→242), analysis-markdown parser+builder
- V1退役: SectionExtraChatModal(-450), V1 topic/interaction stores, followupContextRuntime V1 paths
- 代码量评估: 66.7k 对功能体量(Chat+RAG搜索+Agent工具链+向量索引+Graph分析+多Provider+Copilot)合理，各模块量级均衡
- 可继续方向: quick-search store/hooks层(偏复杂), sqlite repo层(偏冗余), 但不急

### 2026-05-09 (Session 19) — Provider Settings Polish
- Done: **Phase X2 — Provider Settings Polish** (7 commits)
  - **Pill 搜索面板**：`RoleModelPicker` 组件，Command Palette 风格浮动面板，实时搜索 + 键盘导航 + CapTags（reason/vision/search/上下文窗口）+ 按 profile 分组
  - **共享 utils 提取**：`model-display-utils.tsx` 提取 `CapTags`/`highlightMatch`/`formatCtx`，`ModelCombobox` 和 `RoleModelPicker` 共用
  - **StatusBar 重写**：`RoleSelectorChip` 从平铺下拉改为 `RoleModelPicker` 弹出面板，删除冗余的 `PROVIDER_CATALOG`/`getModelsForProfile`
  - **AddProfileGrid 去重**：已配置的 provider 默认隐藏，底部 "Add another instance of existing provider" 链接可展示全部
  - **凭证状态修复**：`ProfileCard` subtitle 区分显示 — Ollama "no key needed"、有 authToken "auth token set"、有 apiKey "API key set"
  - **连接测试修复**：`testProviderConnection.ts` Bearer token 优先使用 `authToken`，修复 OpenRouter 认证
- Spec: `docs/superpowers/specs/2026-05-09-provider-settings-polish-design.md`
- Plan: `docs/superpowers/plans/2026-05-09-provider-settings-polish.md`
- Next: 真机验证 pill 搜索 + AddProfileGrid 去重效果

### 2026-05-09 (Session 18) — Settings UI Redesign
- Done: **Settings General & Search Tab UI Redesign**
  - **设计决策**：现代卡片式 + General 不分组 + Search 轻量 section header + pill chips
  - **新建 3 个共享组件**：`SettingCard`（统一卡片）、`SectionHeader`（轻量标题）、`DocTypePills`（flex-wrap 药丸标签替代 4 列 grid）
  - **GeneralTab 重写**：去掉 3 个 CollapsibleSettingsSection，4 项设置平铺为卡片，DevTools 加 "Developer" badge，删除 Graph Visualization Tuning（5 个死滑块）
  - **SearchTab 重写**：统一卡片样式，SectionHeading→SectionHeader（11px uppercase + icon），DocTypeGrid→DocTypePills
  - **清理**：types.ts 删除 5 个死 graphViz 设置项（clusterForceStrength/nodeBaseRadiusPhysical/nodeBaseRadiusSemantic/nodeDegreeBoost/skeletonMinBranchNodes），删除 DocTypeGrid.tsx + CollapsibleSettingsSection.tsx
  - Build 通过
- Spec: `docs/superpowers/specs/2026-05-09-settings-general-search-ui-redesign.md`
- Plan: `docs/superpowers/plans/2026-05-09-settings-general-search-ui-redesign.md`
- Mockups: `.superpowers/brainstorm/21332-1778293900/content/`
- Next: 真机验证两个 tab 的视觉效果 + 功能回归

### 2026-05-08~09 (Session 17) — Codebase Deep Refactor
- Done: **100,002 → 81,632 code lines (cloc TypeScript, -18,370 = -18.4%)**, 21 commits on `refactor/codebase-50k-target`
- Wave 0 (dead code purge, -5,448): tmp_code_ref_for_cursor, src/desktop, index-debug-tools, dead hooks/utils/exports, 44 dead repo methods, dead templates
- Wave 1 (D3→ReactFlow, -6,373): Delete entire graph-viz/ (46 files, 6,456 lines) + shim + preset, replace with 100-line ReactFlow SearchGraph
- Wave 3 (hub/backbone consolidation): Inline 4 hub helpers into hubDiscover.ts, merge backbone 15→4 files
- Wave 4 partial: merge duplicate agent SDK files, simplify find-path.ts/explore-folder.ts/inspectorService.ts, delete 5 dead inspector functions
- Wave 5.3: Extract BaseDocumentLoader, simplify 10 loaders (-911 lines)
- Feature deletions: usage-dashboard (init never called), vault-xray (isolated), 7 dead files
- Cleanup: strip 234 console.log/debug, delete dead exports from constant/markdown-utils/PromptId/types
- Plan: `docs/superpowers/plans/2026-05-08-codebase-deep-refactor.md`
- Next: Wave 2 store migration (-5k), Wave 4/5/6 service+core+UI simplification (target 50k)

### 2026-05-08 (Session 16)
- Done: **Phase Z — Mockup Gap 补全** (8 commits)
  - **审计**：对比 7 个 HTML mockup 与实际代码，识别出 9 个未实现设计项
  - **NavigableMenuItem 类型扩展**：新增 `group` + `meta` 可选字段
  - **@ 菜单改进**：文件夹面包屑导航（ChevronLeft + Backspace 快捷键）、"Recent" 分组标签、文件元数据 badge（PDF/DOCX/word count）
  - **/ 菜单模板分组**：`item.group` 动态分组（替代硬编码 Quick Actions）、"Template" 紫色 badge、CopilotActionRegistry 15 个 action 自动接线到 / 菜单
  - **输入工具栏响应式**：ResizeObserver 监测宽度，<400px 隐藏 TokenUsage + 截断模型名，<300px 隐藏 ModeSelector
  - **智能建议 actions**：LLM 生成上下文感知建议（chat-suggest-actions prompt），失败时 fallback 到默认建议（Summarize/Search vault/Explain further）
  - **Diff 高亮**：wordDiff.ts LCS 算法 + DiffView 组件（红色删除线/绿色高亮），PolishPanel 集成
  - **变量高亮**：SuggestionGrid 卡片中引号包裹的动态变量黄色高亮（warning-muted CSS var）
- Next: 真机验证各 mockup 功能视觉效果

### 2026-05-08 (Session 15)
- Done: **Bug fix — Auto 模型选择不感知 chatMode**
  - 根因：`chatMode`（Chat/Agent/Plan）从未参与模型选择逻辑，三处硬编码 `getActiveAgentConfig()`
  - `ProfileRegistry.ts` 新增 `getConfigForMode(mode)` — agent/plan → Agent config，其余 → Chat config
  - `ChatInputArea.tsx` Auto 占位符改用 `getConfigForMode(store.chatMode)`
  - `useChatSession.ts` 已有对话 fallback 改用 `getConfigForMode(conversationType.kind)`
  - `useChatSubmit.ts` 新对话 fallback 改用 `getConfigForMode(chatMode)`
- Done: **Feature — Quote to input（右键引用选中文字到输入框）**
  - `chatViewStore.ts` 新增 `insertToInput` 回调 + `setInsertToInput` action
  - `ChatInputArea.tsx` 新增 `InsertToInputHandler` 组件（PromptInput 内注册追加文本+聚焦回调）
  - `MessageViewItem.tsx` 右键菜单新增 "Quote to input"，选中文字按行加 `> ` 前缀插入输入框
- Next: 真机验证 Auto 模型切换 + Quote to input 功能

### 2026-05-08 (Session 14)
- Done: **Phase Y — Token Usage Dashboard** (11 commits)
  - **数据层**：`usage_log` + `usage_daily` 表 schema（DDL），`UsageLogRepo` 12 个聚合查询方法，`UsageTrackingService` 事件订阅 + 压缩 + 查询 API
  - **事件总线**：`USAGE_RECORDED` 事件类型 + `UsageRecordedViewEvent`，pub-sub 架构
  - **自动追踪（6 个拦截点）**：
    - `AIServiceManager` 4 个 query 方法（queryText/queryTextStream/queryStream/queryStructured）自动 emit
    - `sdkAgentPool.queryWithProfile` 拦截 result 消息 emit
    - `embedClient.embedTexts` 解析 API response 中 `usage.prompt_tokens` emit
  - **数据修复**：`vercelGenerateText` 返回 usage（原来丢弃）、`sdkMessageAdapter` 映射 `cachedInputTokens`
  - **Dashboard View**：独立 ItemView（`peak-usage-dashboard`），recharts 图表库
    - KPI 卡片 4 个（总 token / 费用 / 调用数 / 延迟）+ 环比变化
    - Token 趋势折线图 + Cost 趋势折线图（按 provider 分色）
    - 3 个饼图（By Feature / By Provider & Model / Cost Breakdown）
    - Daily Breakdown 堆叠柱状图（按功能分色）
    - Recent Calls 明细表（feature 筛选 + 彩色 badge）
  - **保留策略**：可配置 `usageDetailRetentionDays`（默认 30 天），过期明细自动按天压缩到 `usage_daily`
  - **设置**：`usageTrackingEnabled` + `usageDetailRetentionDays`，main.ts 生命周期集成
  - **命令**：`Open Usage Dashboard` 命令注册
- Spec: `docs/superpowers/specs/2026-05-08-token-usage-dashboard-design.md`
- Plan: `docs/superpowers/plans/2026-05-08-token-usage-dashboard.md`
- Mockup: `.superpowers/brainstorm/85527-1778205143/content/panel-mockup-v4.html`
- Next: 真机验证 Dashboard 面板渲染 + 数据流

### 2026-05-08 (Session 13)
- Done: **Settings Test 按钮接线**
  - 根因：`ProfileCard.tsx:handleTest` 是空壳（`// TODO: wire to real connectivity test`），只假装 1.5s testing 无实际 API 调用
  - 提取 `src/core/providers/testProviderConnection.ts` 共享函数（从 `OnboardingModal.tsx` 去重），支持 `Profile` 对象和 `(kind, apiKey)` 两种调用方式
  - 分 provider 测试：Anthropic → POST messages (max_tokens:1)，Ollama → GET /api/tags，其他 → GET /v1/models
  - ProfileCard 按钮显示真实结果：Connected(绿✓) / Failed(红✗) + 动画
  - OnboardingModal 改为导入共享函数，删除本地重复实现
- Next: 真机验证 Test 按钮 + Phase W smoke test

### 2026-05-08 (Session 12)
- Done: **Phase X — Model Selection 统一** (10 commits)
  - **Provider 卡片简化**：删除 Primary/Fast Model 选择器 + "Use as Agent/Embedding/Web Search" 角色切换按钮 + RoleBadge，Provider 卡片只保留 Connection + Embedding 配置
  - **Agent Fast pill**：新增第 5 个 StatusBar pill，对应 `ANTHROPIC_DEFAULT_HAIKU_MODEL` 环境变量（Agent SDK 轻量任务模型）
  - **`toAgentSdkEnv` 重构**：从读 `profile.primaryModel/fastModel` 改为接受显式 `agentModelId + agentFastModelId`，由 `ProfileRegistry` RoleConfig 解析
  - **Agent/Agent Fast pill 模型过滤**：只展示 `anthropic` 和 `openrouter`（`anthropic/` 前缀）的 profile 和模型，因 Agent SDK 只支持 Claude
  - **Ollama 动态模型获取**：`fetchOllamaModels(baseUrl)` 调用 `GET /api/tags`，3s 超时，silent fail；`ModelRegistry.mergeRuntimeModels()` 合并到 catalog；Settings 页加载时自动触发
  - **Ollama 自由输入**：ModelCombobox 对 Ollama profile 允许输入任意模型名（如 `nomic-embed-text`）
  - **Ollama baseUrl 修复**：`provider-factory.ts` 的 `ollama()` 调用传入 `profile.baseUrl`
  - **清理**：ProfileCard props 精简（删 6 个 prop）、ProfilesTab handlers 精简（删 3 个 handler）、131 行代码删除
- Spec: `docs/superpowers/specs/2026-05-08-model-selection-unification-design.md`
- Plan: `docs/superpowers/plans/2026-05-08-model-selection-unification.md`
- Next: 真机验证 Settings 页模型选择 + Ollama 动态模型获取

### 2026-05-07 (Session 11)
- Done: **Phase W — Copilot Panel Expansion** (20 tasks, 4 commits)
  - **架构重构**：CopilotActionRegistry 注册表模式替代硬编码 action 数组
  - **DocumentContextBuilder**：从活跃文件 + metadataCache 构建 DocumentContext（wordCount/tags/links/backlinks/headingCount/isOrphan）
  - **CopilotPickerModal 重写**：按 Document(蓝)/Vault(紫)/Writing(绿) 三组展示，高相关性 action 显示 ★ 推荐标记
  - **CopilotResultModal 重写**：通用 `action.ResultPanel` 渲染，消除 switch/case
  - **copilot-commands.ts 精简**：从 165 行 5 个独立命令 → 55 行注册表 dispatcher
  - **TagSuggestionEngine 接入**：suggest-tags 现在使用多信号融合（LLM + 图邻居 + 文件夹历史）
  - **10 个新功能**：
    - Document: Summarize (流式), Extract Concepts (结构化), Translate (流式+自动语言检测)
    - Vault: Find Related (纯向量搜索无 LLM), Knowledge Gaps (结构化), Synthesize Topic (搜索+流式), Vault Health (元数据扫描+结构化)
    - Writing: Continue Writing (流式), Rewrite Selection (流式), Add Evidence (搜索+结构化)
  - **18 个 prompt 模板** + **4 个 Zod schema** + 语言配置
  - Build passes，待真机验证
- Spec: `docs/superpowers/specs/2026-05-07-copilot-expansion-design.md`
- Plan: `docs/superpowers/plans/2026-05-07-copilot-expansion.md`
- Next: 真机 smoke test（见下方清单）

### 2026-05-05 ~ 2026-05-07 (Session 10)
- Done: **Phase U — Chat UI v9 + 智能功能**
  - Message UI v9 重构：去掉 PEAK/You 标签 + 用户头像，provider icon 与内容同行
  - 非最后消息 footer(metadata+actions+followups+styles) 隐藏、hover 显示；最后消息始终展示
  - Reasoning 默认折叠（saved messages defaultOpen=false），展开文字更浅（xs + opacity-60）
  - 换模型重新输出：split button (regenerate + model picker popover)，任意 AI 消息可用
  - Suggested Follow-ups：LLM 生成后续问题建议，所有 AI 消息可见
  - Topic 自动聚合：TopicAggregationService + SQLite topic 列 + prompt 模板，6条未分组消息触发
  - 删除内联 OUTLINE 面板，保留侧边栏 Conversation Outline + padding/overflow 修复
  - Bug fixes：Home Recent Conv 空白（缺 notifySelectionChange）、Model picker 裁切（fixed 定位）、最后消息 action 按钮隐藏
- Next: 真机验证全流程

### 2026-05-05 (Session 9)
- Done: **Phase T — Vercel AI SDK 恢复 + Chat 修复** (12 commits)
  - Vercel AI SDK 恢复：3 新文件 (provider-factory, vercel-adapter, index) + 恢复 npm deps (ai, @ai-sdk/*)
  - 双轨 dispatch：Anthropic → Agent SDK, 其他 provider → Vercel AI SDK, 无有效 key 时 fallback 到 Agent SDK
  - Chat role：ProfileRegistry 新增 activeChatConfig + StatusBar 第 4 个 selector chip
  - Settings pktw-root 修复：PluginSettingTab 缺少 pktw-root class → 所有 pk-* CSS 变量在 Settings 页不可用
  - CSS 变量 opacity 修复：Tailwind v3 的 `/10` opacity modifier 对 CSS 变量 hex 颜色无效 → 改用预计算 muted 色
  - 模型路由修复：新会话的 selectedModel/initialSelectedModel 断连 → 加 fallback chain (store → chat profile → default)
  - 每条消息独立模型元数据：从当前 UI 选择解析，支持中途换模型
  - 白闪修复：completeStreaming → addMessage 时序间隙 → 新增 commitStreamingMessage 原子操作
  - 内容重复修复：Agent SDK 发 stream_event + assistant 两种消息 → hasPartialMessages:true 跳过 assistant 文本
  - Reasoning 样式：去重 Obsidian button 边框 + 斜体左竖线 + 左对齐
  - ToolCallSummary：pk-* CSS 变量 + context-pipeline 工具名标签
  - Typewriter streaming：chunk 到达后逐字符匀速释放，动态速率（3~remaining/8 chars/frame）
- Plan: `docs/superpowers/plans/2026-05-05-restore-vercel-ai-sdk.md`
- Next: 去掉消息区 OUTLINE 面板 + 换模型重新输出功能 + Settings hover 验证

### 2026-05-03 (Session 8)
- Done: **Phase S — UI 稳定性批量修复** (15 RC, 7 waves, 9 commits)
  - Wave A: typed LLM error classes (AuthenticationError/LLMResponseError/MaxTurnsError) + collectText/Json 加固 + VaultSearchAgent MaxTurns graceful degradation
  - Wave B: isMarkdownContent 字段 + AI Analysis 导入 Markdown 渲染 + MessageStyleButtons 接线到 submitAction + 错误消息 suppress Regenerate/Style + "Open Settings" 链接
  - Wave C: AIAnalysisRepo search/searchCount + RecentAnalysisList 搜索过滤 + content-visibility 虚拟化 + SearchModal 输入过滤历史/Enter 启动分析
  - Wave D: tagSuggestionsSchema + suggest-tags 命令 + CopilotResultModal 三阶段(loading/result/error) + queryTextStream 流式 + Polish 流式渲染 + CopilotPickerModal 统一入口
  - Wave E: tab 背景统一 + provider hover 效果 + CodeMirrorInput select 类型修复 + 移除 Local Chromium + 删除冗余 power-user banner
  - Wave F: RoleConfig 类型 + ProfileRegistry 迁移(向后兼容) + RoleSelector per-role model dropdown + auto-select model from active profile + ProviderIcon avatar
  - Wave G: Quick action 按钮接线 + ConversationOutline stripMarkdown
- Spec: `docs/superpowers/specs/2026-05-03-ui-stability-batch-fix-design.md`
- Plan: `docs/superpowers/plans/2026-05-03-ui-stability-batch-fix.md`
- Next: 真机验证全部 15 个修复

### 2026-05-01 (Session 7)
- Done: Bug 清理 — 确认 4 个已知 bug 已修复，补 1 个图标修复
  - P0 mySessionId ReferenceError: 已在 7389135 修复（`let` 移到 `try` 外）
  - P1 Onboarding 按钮颜色: `background` 已改为 `var(--background-primary)`
  - P1 Vault Analysis icon: Brain → Library（lucide-react）
  - P2 PatternDiscovery: `onAnalysisComplete()` 已有 profile 检查
- Done: **graph-layout-fix plan 完成**
  - Task 1 (dynamic handles): 已在 `useLensLayout.ts:67-82` 实现
  - Task 2 (spacing): topology nodesep 80→100/ranksep 200→220, tree nodesep 120→140/ranksep 180→200, timeline COLUMN_GAP 60→80
  - Task 3 (edge label density): 已实现（dense flag + hover）
  - Task 4 (deterministic d3-force): `Math.random()` → `seededRandom(nodeId)` 哈希函数
  - Task 5 (CJK width): 已在 `estimateNodeWidth` 实现（14px/CJK char）
- Files changed: SearchModal.tsx, topology-layout.ts (multi-lens), tree-layout.ts, timeline-layout.ts, topologyLayout.ts (graph-viz)

### 2026-04-25 (Session 6)
- Done: **P0 Streaming 内存崩溃根治** — 6 条流式路径全部修复，17 个文件
  - 根因：Zustand `set()` 每个 streaming token 调用一次 → O(n²) 数组/字符串复制 + 30+/s React re-render（每次触发 Streamdown markdown 重解析 + Shadow DOM render）
  - 修复：Mutable Buffer + `requestAnimationFrame` 节流（~60fps 上限）
  - Timeline text: `chunks: string[]` → `text: string` + RAF buffer（searchSessionStore）
  - Section report: `streamingChunks: string[]` → `streamingText: string` + per-section RAF buffer（searchSessionStore）
  - Executive summary: `setSummary(accumulated)` per-chunk → RAF throttled（ReportOrchestrator）
  - Chat streaming: `appendStreamingDelta` / `appendReasoningDelta` → RAF buffer（chatDataStore）
  - Legacy summary: `summaryChunks: string[]` → `summaryText: string` + RAF buffer（aiAnalysisStore）
  - Topic analyze: `chunks: string[]` → `text: string` + RAF buffer（aiAnalysisStore）
  - 性能：内存 O(n²)→O(n)，re-render ~30/s→~60fps cap，不再需要 `.join('')`
- Files changed: search-steps.ts, v2SessionTypes.ts, searchSessionStore.ts, sessionSnapshot.ts, aiAnalysisStore.ts, chatDataStore.ts, ReportOrchestrator.ts, BackgroundSessionManager.ts, eventDispatcher.ts, timeline-helpers.tsx, V2ReportView.tsx, tab-AISearch.tsx, followupContextRuntime.ts, useAIAnalysisResult.ts, useSearchSession.ts, useAIAnalysisPostAIInteractions.ts
- Known issues: (1) mySessionId ReferenceError (2) 按钮颜色 (3) mode icon 缺失

### 2026-04-25 (Session 5)
- Done: NativeModuleManager — ABI 检测 → electron prebuilt 下载 → node-gyp 编译 fallback → binary 验证后才写 metadata
- Done: Setup Wizard Modal — 3 步向导，多 Provider 配置 + 平台跳转链接 + 可编辑/删除已有 profile + Set Active
- Done: SQLite 懒加载 — `initSqlite()` 公开方法，失败不阻塞；ChatStore 20 处守卫、AIAnalysisHistoryService 6 处守卫
- Done: 修复 CORS（fetch→requestUrl）、ABI 下载策略（node→electron runtime）、删除 adjacent ABI fallback
- Done: 无 active profile 时跳过 PatternDiscovery + warmupPool（防无效 key 导致子进程崩溃→renderer crash）
- Done: checkAvailable() ensureCompatible 单次执行（nativeModuleChecked 标记）
- Files changed: NativeModuleManager.ts (new), OnboardingModal.tsx (new), main.ts, BetterSqliteStore.ts, SqliteStoreManager.ts, ChatStore.ts, AIAnalysisHistoryService.ts, Register.ts, .gitignore
- Known issues: (1) 流式 reasoning-delta 密集时 renderer 崩溃 (2) mySessionId ReferenceError (3) 按钮颜色 (4) mode icon 缺失

### 2026-04-24 (Session 4)
- Done: Wave 4 Search Polish (3 tasks)
  - #90: open-in-new-tab icon button in VaultSearchResult.tsx (hover-reveal ExternalLink)
  - #79: OpenMenuButton query builder — last 3 messages + 500 char cap (was: all messages, no limit)
  - #76: Save graph to vault — Download button in V2Footer + handleSaveGraph in tab-AISearch.tsx (uses buildAiGraphMarkdown + vault.create)
- Done: Wave 2B FileIcon 统一 (#74)
  - getFileIcon() +excel/word/file 类型, +size 参数
  - pathToFileIconType() +xlsx/xls/docx/doc 映射
  - 删除 getFileIconByName + getFileIconComponent, 迁移 FileChangesList + ProjectOverview
- Done: Wave 5 Copilot Document Intelligence (9 tasks, #42 #33 #38 #36)
  - copilot-schemas.ts: Zod schemas (ReviewResult, LinkSuggestions, SplitPlan)
  - PromptId.ts: +8 entries (4 prompts + 4 system prompts) + PromptVariables
  - TemplateRegistry.ts: +8 template metadata + 8 .hbs prompt files
  - CopilotResultModal.tsx: Modal shell + lazy panel router
  - PolishPanel.tsx: side-by-side diff + Apply (reused by Review Fix flow)
  - ReviewPanel.tsx: severity feedback list + 🔧 Fix → PolishPanel transition
  - LinkSuggestPanel.tsx: checkbox link list + batch insert outgoing links
  - SplitPanel.tsx: preview cards + excerpt + proportional bar + execute split
  - copilot-commands.ts: 4 commands (polish/review/suggest-links/split) + Register.ts wiring
- Stats: 38 tasks, 66 files changed, build green

### 2026-04-22 (Session 3)
- Done: Wave 3A Agent Trace Tasks 6-15 完成 (10 tasks)
  - 22 fixture vault md files (hub/spokes/multilingual/decoys/orphans)
  - fs-vault-reader.ts: listFiles, readFile, grep, readFrontmatter (8 tests)
  - link-resolver.ts: extractWikiLinks, buildLinkIndex, resolveLink, listBacklinks (6 tests)
  - fs-vault-mcp/server.ts: 6 MCP tools wrapping reader + resolver
  - scenario-loader.ts: YAML parse + forbidden-field validation (11 tests)
  - 5 scenario YAML files: hub-discovery, direct-answer, ambiguous-query, multilingual, not-found
  - scripts/run-agent.ts: CLI harness (scenario → MCP → query → TraceSink)
  - scripts/trace-latest.ts: newest trace finder (4 tests)
  - VaultSearchAgentSDK.ts: optional traceSink?.consume(raw) hook
  - run-trace-scenario.ts: Obsidian command (Peak: Run Trace Scenario) + main.ts registration
- Done: Wave 3C Chat UI Redesign 全部 15 tasks 完成
  - T1: ConversationType union + meta field + creation pipeline wiring
  - T2: ThinkingIndicator (gentle-pulse dots) + IME Enter fix (view.composing guard)
  - T3: MessageRoleAvatar (👤/✨) + DateSeparator (Today/Yesterday/date) + message list integration
  - T4: MessageActionsList inline redesign — metadata always visible, actions hover-fade via group-hover
  - T5: MessageStyleButtons (Shorter/More detail/Simpler/More formal) below AI responses
  - T6: ToolCallSummary collapsed chip (replaces ToolCallsDisplay) — active tool animation + expand/collapse
  - T7: ContextMenu.tsx — custom @ menu replacing CodeMirror autocomplete, keyboard nav, click-outside
  - T8: PromptMenu.tsx — custom / menu replacing CodeMirror autocomplete, grouped items
  - T9: Conversation list — two-row layout + type badge + search bar + date grouping (Today/This Week/Older)
  - T10: Home page — time-aware greeting + 2×2 suggestion cards + compact recent lists
  - T11: NewConversationTypePicker — 4-card grid (Chat/Agent/Plan/Canvas) + full creation pipeline
  - T12: Project Overview — inline stats + editable description + tab accent vars + CTA empty state
  - T13: FileChanges — theme-aware colors + NEW badge + group-hover actions
  - T14: ConversationOutline — topic tree right panel + header toggle + store state
  - T15: SuggestionActions + scroll nav color fix (hover:bg-gray-200 → hover:bg-muted)
- Done: Wave 2B FileIcon 统一 (#74)
  - getFileIcon() 扩展: +excel(FileSpreadsheet) +word +file 类型, +size 参数
  - pathToFileIconType() 扩展: xlsx/xls→excel, docx/doc→word
  - 删除 getFileIconByName + getFileIconComponent (冗余)
  - FileChangesList + ProjectOverview 迁移到 <FileIcon>
- Stats: 42 files changed, 11 new UI components, 100+ test assertions, build green

### 2026-04-22 (Session 2)
- Done: Chat System Polish 完成 (Wave 3B, 12 tasks)
  - 4→2 Zustand stores: chatDataStore (entity+message+streaming) + chatViewStore (nav+session+history)
  - 删除 projectStore.ts (107行) + messageStore.ts (190行) + chatSessionStore.ts (289行) = -586行
  - 22 consumer files 迁移到新 store
  - ChatInputArea 453→176行 (提取 useContextSearch + useInputKeyboard + useTokenUsage)
  - Ctrl+Arrow input history navigation (#81)
  - Delete Conversation menu action (#93)
  - ConversationService.streamChat 修复 → Agent SDK queryWithProfile (修复 MultiProviderChatService 删除导致的 chat 断裂)

### 2026-04-22 (Session 1)
- Done: Provider v2 完成 — 删除整个 Vercel AI SDK 栈
  - PromptService: chatWithPrompt/chatWithPromptStream → delegate to AIServiceManager.queryText/queryStream via AppContext
  - AIServiceManager: chatWithPrompt/streamObjectWithPrompt → delegate to queryText/queryStructured + zodToJsonSchema
  - infer-thinking-tree: multiChat.blockChat() → manager.queryText()
  - stream-helper.ts: 640行 → 60行 (only 3 self-contained utilities kept)
  - types.ts: 'ai' re-exports → standalone type definitions
  - 删除 12 文件: adapters, base providers, MultiProviderChatService, model-resolution, tool-executor (~3500行)
  - UI: ModelSelector/MessageActionsList/SearchSettingsTab → modelRegistry (static catalog)
  - 卸载 7 npm packages: ai, @ai-sdk/{anthropic,openai,google,perplexity}, @openrouter/ai-sdk-provider, ollama-ai-provider-v2
  - manifest.json: isDesktopOnly = true
  - Zero `from 'ai'` imports remain in src/ (only comments)
- Done: Working tree 清理 — 3 commits committed (dead code cleanup, features, docs)
  - 39 dead files deleted (-5333 lines)
  - Milestone persistence + graph improvements + search UI polish
  - Execution roadmap + 6 plans + 4 specs + mockups
- Done: All prior work merged to master (131 commits fast-forward)
- Done: ProfileSettingsTab — Profile CRUD UI 替换 ProviderSettings (335 lines)
- Done: UI/Theme CSS Foundation — peak-variables.css + peak-style-settings.css + Tailwind --pk-* tokens + Shadow DOM pass-through
- Started: Chat System Polish (Wave 3B Task 1) — chatDataStore created

### 2026-04-20 (Session 2)
- Done: Query Pattern Discovery 全量实现 (Phase I, 12 commits)
  - `query_pattern` SQLite table + QueryPatternRepo (CRUD, incrementUsage, deprecateStale)
  - Zod schemas: MatchConditionSchema, DiscoveredPatternSchema, PatternDiscoveryOutputSchema
  - ContextProvider: 同步收集 15 个 VaultContext 变量（文档基础/内容特征/关系网络/时间历史）
  - PatternMatcher: 8 种条件评估 + 变量填充 + 排序
  - 7 个 seed patterns（deterministic IDs, idempotent insertion）
  - PatternDiscoveryAgent: LLM 分析查询历史 → 发现新模式（singleton guard, fire-and-forget）
  - PatternMergeService: 模板去重 + 30 天自动过期
  - Trigger: plugin load seed + 每 20 次分析触发 discovery
  - AI Analysis landing page 全面改造：SuggestionGrid(2列卡片) + ActiveSessionsList + RecentAnalysisList
  - HoverCard preset switcher → inline mode pills（紫色活跃态）
  - Modal-level footer（键盘提示 + 分析计数）
  - 删除 default-analysis-queries.json + AIAnalysisPreStreamingState idle 状态

- Done: Vault Search Redesign 全量实现 (Phase J, 6 commits)
  - vaultSearchStore: 新增 `help` mode + persistent `inspectorOpen` toggle + 移除 `[[` prefix 模式
  - 模式系统：`?` help prefix → ModeHelpList（5 种模式可导航列表）
  - HoverCard mode switcher → inline mode badge（右侧 pill 显示当前模式）
  - Side-by-side 布局：results panel (flex-1) + 340px inspector side panel（→/← 键切换）
  - InspectorSidePanel: 3 个可折叠 section（Connected/Discovered/AI Graph）
  - ConnectedSection: 合并 outgoing+backlinks, 上下文片段, query-aware 过滤（相关性>0.3 绿色✓, ≤0.3 半透明）
  - DiscoveredSection: SEM(紫) + CO-CITE(蓝) + UNLINKED(琥珀) 三源融合, WHY 标签, 渐进展示
  - AIGraphSection: 历史 AI Graph 查找 + "New window ↗" + "Generate AI Graph" 按钮
  - coCitationService: SQL join 共引分析（HAVING ≥ 2 共引者）
  - unlinkedMentionService: FTS5 标题搜索发现未链接提及
  - SearchResultRow: 紫色相关性分数 badge
  - Topic navigation: 点击 inspector 链接 → 更新选中 + inspector, 保持查询
  - Before-typing: 预选活跃文档, "Recently opened" 标签
  - 清理: 删除 GraphSection.tsx + InspectorPanel.tsx

### 2026-04-20 (Session 1)
- Done: Execution Roadmap 创建 (`docs/90-old-root-docs/execution-roadmap.md`)
  - 全任务冲突矩阵分析（文件级并行可行性判定）
  - 4 Wave 排期：Wave 0 cleanup → Wave 1 search → Wave 2 provider v2 + theme → Wave 3 trace + chat
  - Milestone Persistence 确认已实现（working tree 中，待 commit）
  - Phase 0 文档清理确认已完成（4 归档 + 3 更新 + 3 标记 + spikeAgentSdk 删除）
- Done: Provider v2 Implementation Plan (`docs/superpowers/plans/2026-04-20-provider-system-v2.md`)
  - 12 tasks, 3 sub-waves (Foundation → Migration → Cleanup)
  - 全量代码锚点：探索了 provider stack、chat system、agent files、settings、build config
  - 精确迁移清单：6 streamText + 2 generateText + 1 generateObject + 2 embedMany + 2 Experimental_Agent + ~16 chatWithPrompt 间接调用
  - 估算 delta: 删 ~3500 行, 加 ~1800 行
- Done: UI/Theme Foundation spec + plan
  - Spec: `docs/superpowers/specs/2026-04-20-ui-theme-foundation-design.md`
  - Plan: `docs/superpowers/plans/2026-04-20-ui-theme-foundation.md` (11 tasks)
  - CSS var bridge (--pk-*) 映射 Obsidian 原生 var，自动适配 Minimal theme 分区配色
  - Style Settings 全面开放：结构色 + 品牌色 + 语义色
  - 559 处内联 hex 分 4 批清理
- Done: Chat System Polish spec + plan
  - Spec: `docs/superpowers/specs/2026-04-20-chat-system-polish-design.md`
  - Plan: `docs/superpowers/plans/2026-04-20-chat-system-polish.md` (12 tasks)
  - 4 store → 2 store 重构 (chatDataStore + chatViewStore)
  - ChatInputArea 453 → ~150 行 (提取 4 hooks/components)
  - #93 delete conversation + #73 mode backend (prompt 分支) + #81 Ctrl+Arrow history
  - 记录：mode Level B/C 升级推迟到 Provider v2 后
- Done: 修复 4 个 AI Search 核心 bug
  - Spinner 空白：Evidence plan 完成后到 plan 出现前无 loading 指示 → 加 `isWaitingForPlan` 第三状态
  - Open in File 按钮不显示：V2Footer 从 `searchSessionStore` 读 `lastSavedPath`，但写入端在 `aiAnalysisRuntimeStore` → 统一读写到同一 store
  - Graph 数据未持久化到 markdown：persist useEffect 缺少 graph 依赖 → 加 `hasGraphData`/`hasGraphAgentData` deps
  - 疯狂刷 IndexService 日志：`ChatFolder/AI-Analysis` 未被排除于 listener indexing → 统一 `shouldSkipListenerIndexing()` 排除 Hub-Summaries + AI-Analysis
- Done: persist useEffect 加 2s debounce，合并快速连续 vault.modify 调用
- Done: Copy 按钮改为 view-aware — 单击复制当前 tab 内容（Process/Report/Graph），hover 弹出菜单选择
- Done: MultiLensGraph 全部中文文案改为英文（tooltip、empty message、loading、按钮）
- Done: Generate Knowledge Graph 按钮样式改为品牌紫色
- Done: Graph 节点支持拖拽（ReactFlow `onNodesChange` + `applyNodeChanges`）
- Done: 自动重叠解消 — post-layout `resolveOverlaps()` pass，基于 `estimateNodeWidth` 检测 AABB 碰撞并推开重叠节点
- Next: 真机测试上述修复 + 后台多 Session 已知限制修复

## Completed Work (2026-04-18)

### Phase M: 移动端支持 ✅
- Platform gate + 动态导入守卫
- VaultContentProvider + main.ts 启动守卫（跳过 SQLite）
- MobileSearchService（路径/标签/内容三层搜索）
- MobileVaultSearchAgent（搜索→读文件→Claude 1M 长上下文）
- 直觉地图导出为 vault JSON 文件（iCloud 同步）
- 隐藏桌面专属命令和 UI

### Phase A: 产品断点修复 ✅ (6/6)
- A1: 友好错误信息引导到 Settings → Model Config
- A2: 默认模型统一为 openai/gpt-4o-mini（不再依赖 OpenRouter）
- A3: Vault 未索引时显示引导文案
- A4: 侧栏对话右键菜单增加 Delete
- A5: deleteProject 全栈实现（Repo → Store → Service → Manager → UI）
- A6: Provider 启用无 key 时显示警告

### Phase B: UX 打磨 ✅ (16项)
- B1: AI Analysis 空白页 P0 → 显示 loading 替代 null
- B2: "0 days ago" → 日历日差 + "yesterday"
- B3: 搜索结果路径截断为最后2段 + hover 全路径
- B4: Chat tool call 默认折叠
- B5: Chat placeholder 简化为单行
- B6: Suggestion tags 首条消息前隐藏
- B7: EmptyState 统一组件
- B8: Hops segmented control（品牌紫色选中态）
- B9: Quick Actions 紧凑化 + 品牌紫色左边框
- B10: 报告表格 CSS fallback 样式
- B17: 删除无操作的 "Full analysis view" 按钮
- B18: graphSummary 从 aiGraphStore 接线
- B20: 弹窗标题 "Create" → "Rename"
- B21: Settings provider 默认选中第一个已启用
- B22: Graph 空结果显示 "No connections" 反馈
- Vault search 空状态改进 + 索引引导文案

### Phase C: 技术债清理 ✅
- 删除 DocumentCache.ts 空文件
- 清理 aiSearchService deprecated 方法
- 修复 TableDocumentLoader XLSX stub
- FlashRank reranker 改为 throw 明确错误
- 清理 searchPrompts stub
- 清理 find-orphans TODO + MobiusEdgeRepo 空方法
- 恢复 ModelConfigTab 3个模型选择器
- 合并 date-utils 到 core/utils（6处导入更新）

### Phase D: 代码拆分 ✅
| 文件 | 原大小 | 主文件新大小 | 提取文件数 |
|------|--------|-------------|-----------|
| useSearchSession.ts | 1193 | 342 | 3 |
| searchSessionStore.ts | 922 | 797 | 1 |
| MessageViewItem.tsx | 838 | 280 | 3 |
| tab-AISearch.tsx | 947 | 370 | 4 |
| search-agent-schemas.ts | 1407 | 1346 | 1 |
| service-manager.ts | 972 | 809 | 2 |
| AiSearchAnalysisDoc.ts | 1154 | 202 | 2 |

### Phase E: 文档清理 ✅
- 标记 11 个已完成计划 + 3 个被取代计划
- 更新 DEVTOOLS_GUIDE、quick-search-ui-design、AI_ANALYSIS_ARCHITECTURE 文档

### V1 退役 + 死代码全面清理 ✅ (~10,800行, ~56文件)
| 类别 | 删除 |
|------|------|
| V1 phase 文件 (classify/decompose/recon/report 等) | 9 文件 |
| V1 Step UI 组件 (ClassifyStep/ReconStep 等) + 渲染管线 | 18 文件 |
| 死 hooks (useAIAnalysis/aiAnalysisStreamDispatcher/useOpenInChat) | 3 文件 |
| 死 stores (searchInteractionsStore) | 1 文件 |
| 死 tools (search-web/call-agent-tool/field-update-tool) | 3 文件 |
| 死 schemas (callAgentTool/searchWeb/updateResultOps) | 3 文件 |
| 死组件 (CompletedAIAnalysis/StreamingAnalysis/UsageBadge/V2SectionNav) | 7 文件 |
| 死 agent 基础设施 (AgentLoop/type.ts) | 2 文件 |
| 遗留服务 (DailyStatsiticsService/LogMetricRegister/ActivityService/ScriptLoader/HtmlView) | 5 文件 |
| 死 CSS (streamdown-backup.css) + 死 chunk (deprecated_chunking.ts) | 2 文件 |
| VaultSearchAgent 简化 | 346行 → 42行 |
| SearchClient 清理 | 删除 aiAnalyze + aiSearchService |
| searchSessionStore/types 清理 | 删除 V1 steps 字段/类型/getAllSections/getAllSources |
| useV2 feature flag 删除 | V2 Agent SDK 现为唯一路径 |
| 死设置字段清理 | scriptFolder/htmlViewConfigFile/statisticsDataStoreFolder 从类型+UI+loader 移除 |
| 依赖清理 | simple-git 从 package.json 移除 |
| core/types.ts 瘦身 | 删除 AgentLoop 专用类型，仅保留 UserFeedback/HitlPausePoint |

## 已完成计划

| 计划 | 日期 | 状态 |
|------|------|------|
| ai-search-ui-step-based-refactor | 04-08 | COMPLETED |
| vault-search-agent-sdk-migration | 04-12 | COMPLETED |
| v2-search-ui | 04-12 | COMPLETED |
| per-section-report-generation | 04-13 | COMPLETED |
| mission-roles-plan-review | 04-14 | COMPLETED |
| playbook-dimension-framework | 04-14 | COMPLETED |
| report-generation-reliability | 04-14 | COMPLETED |
| report-quality-overhaul | 04-15 | COMPLETED |
| ai-graph-multi-lens | 04-15 | COMPLETED |
| continue-analysis-process-view | 04-17 | COMPLETED |
| ai-analysis-ux-overhaul | 04-17 | COMPLETED (all 6 phases, Phase ⑥ superseded by PatternDiscovery) |
| ai-graph-agent | 04-18 | COMPLETED |
| mobile-support | 04-18 | COMPLETED |
| ui-improvements-all-strategies | 04-18 | COMPLETED |
| background-multi-session | 04-19 | COMPLETED |
| provider-system-v2 | 04-20 | COMPLETED |
| ui-theme-foundation | 04-20 | COMPLETED |
| chat-system-polish | 04-20 | COMPLETED |
| query-pattern-discovery | 04-20 | COMPLETED |
| vault-search-redesign | 04-20 | COMPLETED |
| chat-ui-redesign | 04-22 | COMPLETED |
| copilot-document-intelligence | 04-24 | COMPLETED |
| copilot-expansion | 05-07 | IN PROGRESS (code done, needs smoke test) |
| model-selection-unification | 05-08 | COMPLETED |
| token-usage-dashboard | 05-08 | COMPLETED |
| ai-analysis-landing-redesign | 04-25 | COMPLETED |
| settings-redesign | 04-25 | COMPLETED |
| agent-trace-observability | 04-22 | COMPLETED |
| graph-layout-fix | 05-01 | COMPLETED |
| ui-stability-batch-fix | 05-03 | COMPLETED |
| provider-settings-polish | 05-09 | COMPLETED |
| ambient-push-phase1 | 05-01 | COMPLETED |
| ambient-push-phase2 | 05-10 | COMPLETED |
| ambient-push-phase3 | 05-10 | COMPLETED |
| inspector-tools-overhaul | 05-10 | COMPLETED |
| v2-persistence-fix | 04-18 | COMPLETED (verified already done) |
| report-ui-quality | 05-10 | COMPLETED (Task 3 done, Task 4 already done) |
| ai-analysis-ux-overhaul | 04-17 | COMPLETED (all 17 tasks verified) |
| provider-mcp-phase1-3 | 05-10 | COMPLETED |
| mcp-spike | 05-10 | COMPLETED (GO) |
| milestone-based-persistence | 04-20 | MOSTLY DONE (核心函数存在，4 触发点待验证) |
| per-section-report-v2 | 04-13 | SUPERSEDED |
| v2-report-quality-and-ui-fixes | 04-13 | SUPERSEDED |
| context-handoff-v2-ui | 04-12 | SUPERSEDED |

## Log

### 2026-04-19
- Done: Report tab 无内容时展示 Plan（替代占位文字），用户可直接在 Report tab 审阅+批准 plan
- Done: Plan 出现即持久化 — v2PlanSections 出现时立即触发 auto-save，Open in File 在 plan 阶段即可用
- Done: 后台多 Session 系统 (Phase H, 11 commits)
  - 提取 eventDispatcher 纯函数 + streamConsumer 独立函数（脱离 React 依赖）
  - BackgroundSessionManager 单例：detach/restore/cancel/queue 全生命周期
  - 事件重定向机制：前台闭包继续跑，事件自动写入后台 snapshot
  - Modal 关闭 → 活跃 session 自动 detach 到后台
  - Modal 打开 → 从 Notice 或 Active Sessions 恢复后台 session 到前台
  - Active Sessions UI：Recent Analysis 顶部展示进行中/plan-ready/排队中的后台 session
  - 并发控制：最多 3 个 streaming，超过排队；plan-ready 不占并发位
  - Notice 通知：plan ready / completed 可点击恢复，error 通知
  - Plugin unload 清理所有后台 session
- Known limitations: 多 session 事件重定向单例（同时>1 streaming 只有最后一个接收事件）、后台无增量持久化、restore flicker
- Next: 真机测试 + 已知限制修复

### 2026-04-18
- Done: AI Graph Agent 全部实现
- Done: 移动端支持全部实现 (Phase M, 11 commits)
- Done: 产品断点修复全部完成 (Phase A, 6/6)
- Done: UX 打磨 16 项完成 (Phase B)
- Done: 技术债清理 9 项 (Phase C)
- Done: 7 个大文件拆分为 23 个聚焦文件 (Phase D)
- Done: 文档清理完成 (Phase E)
- Done: V1 search pipeline 完全退役 + 全面死代码清理 — 删除 56 文件 / ~10,800 行
- Done: VaultSearchAgent 简化为 42 行纯路由器（mobile → MobileAgent, desktop → AgentSDK）
- Done: 删除遗留服务集群（DailyStatsiticsService/LogMetricRegister/ActivityService/ScriptLoader/HtmlView）
- Done: 清理死设置字段（scriptFolder/htmlViewConfigFile/statisticsDataStoreFolder）+ UI
- Done: 移除 simple-git 依赖
- Done: useV2 feature flag 删除，V2 Agent SDK 为唯一搜索路径
- Done: 5 轮死代码审计全部清零，代码库无残留死代码
- Next: iOS 真机测试 → Provider v2 → Agent Trace

### 2026-06-07
- Done: Settings 5-tab IA 与 mock 对齐 — `docs/gstack/settings-redesign-2026-05-29/IMPLEMENTATION-GAP-2026-06-04.md` 列出全部差距 + 源码映射 + PR 切分
- Done: PR-1 Overview 重写 — Peak readiness 5 行（Providers/AI behavior/KI/Web/Safety）从真实配置算 ready，AI behavior 读权摘要 4 行，Actions strip 4 按钮；row CTA 跳转其它 tab via onSwitchTab
- Done: PR-2 AI Setup 重排 — Recommended setup → AI behavior → Providers；新 RecommendedSetupGrid 4-up 预设；Add Profile→Add Provider；Custom Endpoint 按钮顺序 + 文案对齐 mock；剥离 SDK Settings（迁回 Advanced PR-5）；删 Safety section
- Done: PR-3 Knowledge Index 视觉重写 — bordered Index readiness panel + 推荐操作 accent row；Segmented Index mode；修 Document types pills（canonical 12 项，删 Conv/Dataloom/Unknown）；新增 Refresh interval；Search quality + Inspector links disclosure；AI Analysis + Exclude saved analyses + Summary lengths disclosure；Advanced chunking 折叠（6 字段）；Advanced rebuild 折叠（4 actions）
- Done: PR-4 Tools 重排 — External tools → Web Access → Skills → Capture destinations；新增 Skills/Capture 两个 section（绑既有 skillsFolder/inboxFolder/customPromptsFolder）；Add tool server→Add external tool
- Done: PR-5 Advanced 重构 — 去重 Re-run wizard banner（删 AdvancedTab 的顶部副本，留 HarnessSettingsSection 自己的）；删 Open Prompt Templates section；Maintenance 重排为 3 个 action-strip group（Index / Knowledge graph / Verification & cleanup）；Danger zone 收进折叠 details；新增 Developer section + SDK process disclosure（SDK 字段从 Tab 2 迁回）
- Done: 死代码清理 — 删 4 个旧文件（SearchTab.tsx / SearchIndexSection.tsx / components/SectionHeader.tsx / components/DocTypePills.tsx）
- Known limitations: Proactive suggestions / Usage and retention / Developer Graph viz + Legacy compatibility disclosures 未实现（需新增 backing fields）；External tool row 仍是 expanded form 而非 disclosure summary；Index readiness panel 的 "missing or changed" 用 total-indexed 估算，无精确 staleness 检测
- Next: 真机走查 5 个 tab + 视觉对照 mock；视情决定是否做 PR-6 补齐 Proactive/Usage/Graph viz/Legacy compatibility

### 2026-06-10
真机走查 5 个 tab 之后的反复迭代。用户提示 → 我修 → 再贴图 → 继续修，共 ~10 轮，每轮至少 1 个 issue：

**视觉/布局修复**
- Done: Recommended setup 预设卡描述横向溢出 — 加 `min-width:0` + `display:block` + `overflow-wrap:anywhere`；JSX span 默认 inline 时 `width:100%` 不生效，必须显式 block 化
- Done: Document types 行 body 被 12 个 pill 挤成单字 — 改用自定义 grid (`32px 1fr` + grid-row:2) 让 pill cluster 在 body 下方 wrap-flex，而不是塞进 Row 的 auto 右列
- Done: `<details><summary>` 的原生 ▶ marker 在 Inspector 行上方独立漂浮 — 全局加 `summary { list-style:none } + ::-webkit-details-marker { display:none }`
- Done: Tier model bindings 行拥挤、右侧浪费 — `HarnessSettingsSection.FieldRow` 列宽 180px → 240px + 右列 `justify-end`；section header 从 ALL-CAPS muted 降级为 `text-sm font-semibold`
- Done: Harness 输入框 `pktw-w-full` 撑满 → 收紧到 `pktw-w-44`
- Done: ProfilesTab Advanced disclosure 头改为双行（标题+sub+右侧"6 fields"），LLM Output Control 子标题降级
- Done: Custom Endpoints subsection 老 ALL-CAPS + 横线分隔 → `pkset-section__title` 风格 + 虚线 empty state

**Hover 失效根因**
- Done: 全局 `hover:pktw-bg-pk-accent/5`/`/10` 不编译 — 因为 `pk-accent` 是 CSS 变量映射，Tailwind v3 `<alpha-value>` 替换对非 hsl/rgba CSS 变量无效；替换为 `hover:pktw-bg-pk-accent-tint`（token `--pk-accent-tint`，真有 CSS 输出）。涉及 Hooks (advanced) / ProfilesTab Advanced / ProfileCard / MCPServerCard / RoleModelPicker 项 / Preset 弹层项
- Done: 同因 `border-pk-accent/N` / `focus:border-pk-accent/60` 全部替换为实色 token，AddProvider 弹窗、focus ring、Setup wizard banner 等边色稳定可见
- Done: Button primitive 之前只认 primary/secondary/ghost，传 outline 静默 fallback 成无边框 — 这是 Overview action strip 和 Maintenance 按钮看着「悬浮无边」的根因；扩 outline (→ secondary 样式) + destructive (→ 新加 `pk-btn--danger` CSS：surface 底 + error border，hover error-bg + error border)
- Done: `.pk-row--disclosure:hover` 从 `--pk-surface-sunken`（太浅）改为 `--pk-accent-tint` + `--pk-border-accent`；加 `details > summary:hover .pk-row--disclosure` 选择器覆盖 `<summary>` 包住的场景
- Done: OverviewTab AI behavior 摘要行加 `data-clickable="true"` + 新 `.pk-row[data-clickable="true"]:hover` CSS 规则

**结构性 IA 调整**（用户多次决策，反复挪段）
- Done: Advanced → Tier model bindings 整段删除（与 AI Setup → AI behavior 行重复，违反 single-source；删 TierPicker / 子组件 / 死 import）
- Done: Advanced → Escalation policy 整段挪到 AI Setup → Advanced model controls 折叠里（同 LLM Output Control 同一 disclosure body）
- Done: Advanced → Agent runtime (Runtime 引擎选择) 挪到 AI Setup 顶部新 Runtime section（Recommended setup 之前）
- Done: Advanced → Hooks (advanced) 挪到 Tools tab 末尾（hooks 是 pre/post tool-use 规则）
- Done: Advanced → Safety 段先用 Row + Segmented 重做（替代裸 select 文本），后整段挪到 AI Setup（Runtime 之后、Recommended setup 之前）
- Done: Advanced → GeneralTab (Data Storage / Chat Root / Attachment Handling / DevTools) 拆解：Folder 配置集中到新 StorageSection（Advanced 顶部，2 主字段 + 9-path Derived folders 折叠）；Attachment Handling + DevTools Graph Inspector 挪到 Developer disclosure
- Done: Storage 集中所有 folder 配置 — 主字段：Data storage folder + Chat root folder；Derived 折叠里 5 个 read-only 派生路径（Prompts/Attachments/Resources summary cache/Hub summaries/User profile，从 AI_PATH_SUBFOLDERS 拼）+ 4 个可覆写字段（AI Analysis output / Skills / Inbox / Custom prompts）
- Done: 同步从其它 tab 删 folder 字段 — Tools 删 Skills folder 行（Skills section 只剩 Inventory placeholder）+ 整个 Capture destinations 段；KnowledgeIndex 删 AI Analysis Save folder 行
- Done: AI Setup → Custom Endpoints 段（独立卡片 + Add custom endpoint + Add from preset 按钮）整段删除，并删 CustomEndpointSection.tsx / CustomEndpointCard.tsx 两个组件文件；增/编辑路径统一走 Add Provider → AddProfileGrid（kind=litellm/custom 已覆盖）；customEndpoints 数据层保留 service-manager 消费链未动
- Done: HarnessSettingsSection.tsx 整文件删除（内容拆完一干二净），相关 import / docstring 同步清理

**交互/确认行为**
- Done: AI Setup → AI behavior 5 行 Change pill 全部直接弹 RoleModelPicker（不再走 setup wizard）— Conversation 接 `ProfileRegistry.setActiveChatConfig`，Fast Lookup/Research/Stronger 接 harnessSettings 各 tier，Knowledge Index 接 `setActiveEmbeddingConfig` + `modelFilter` 只列嵌入模型
- Done: RecommendedSetupGrid 加第 5 个 **Manual** card，父级检测到 `harnessSettings` 任一 tier 已配置即 `manual=true` 自动选中
- Done: Knowledge Index → Index mode Segmented 不再立即执行 — 引入 `pendingLevel` 本地态 + accent 边框确认横条（"Switch to X?" + Cancel/Confirm），Confirm 才 `updateSearch` + 启动 staged indexing

**Bug 修复**
- Done: All reviews 路由 bug — Vault tab 点 All reviews 打到 Document Reviews，根因 `onOpenAllHistory` 用 `this.options.initialTab`（弹窗打开时的 tab）而非 active tab；改成 `(scope: IntentTabId) => void`，子组件传 `activeTab`
- Done: 命令面板 `Open Knowledge Center` 删除（Vault Copilot 已统一接管能力）；`openKnowledgeCenter` 函数定义也删，View 类 + ViewManager 注册暂留向后兼容

**模板同步**
- Done: `templates/config/settings.json` 覆盖了 TS 默认导致旧串顽固 — 同步 Actions(Actions/Test providers/Try Chat) + aiBehaviorSummary + recommendedSetup + Add external tool 全部子树

总收尾态：5 个 tab 视觉/IA 与 mock 基本对齐；Settings 文件改动落定 ~25 处；新增/删除文件 ~10 个；hover/border/Button variant 三类全局 CSS 系统性 bug 修完。

- Known limitations: Proactive suggestions / Usage and retention / Graph viz / Legacy compatibility 仍未实施；KnowledgeCenterView 类 + 注册保留只为兼容；customEndpoints 数据层仍存但无管理 UI
- Next: 真机再走一遍 5 tab 看是否还有遗漏；视情下个周期收尾 PR-6（Proactive/Usage/Graph viz）

### 2026-07-01 (T13 Service Singleton Migration)
一次性去掉 `docs/01-architecture.html` "历史例外" callout 里点名的所有 service-side singleton：

**结构变化**
- Done: `AppRuntimeRegistry` 新增 5 个 slot（`indexService` / `mcpClientManager` / `skillRegistry` / `capabilityRegistry` / `usageServices` bundle），每个都 set/get/tryGet/clear，clear 时对应调 dispose/destroy
- Done: `AppContext` 加 20 个静态 delegator 镜像上面 slot，`clearForUnload` 里追加 5 个 clear 调用
- Done: 7 个类去 `static getInstance`/`static instance`：`IndexService` / `MCPClientManager` / `SkillRegistry` / `CapabilityRegistry` / `UsageTrackingService` / `UsageOutcomeService` / `UsageOptimizationService`；全部改由 `main.ts` `new` 构造并挂 registry
- Done: `IndexService.init({aiServiceManager, env})` 双阶段构造改为构造函数直接收依赖；`runPendingLlm/VectorIndexEnrichment` + `clearPendingLlmFlags` 从 static 转 instance；新增 `getTenantForPath` 实例方法 + `resolveIndexTenant(path, rootFolder)` 纯函数
- Done: 删死代码 `src/service/agents/harness/skill/`（`HarnessSkillRegistry` 零 consumer）+ 同目录 `harness/tool/McpToolAdapter.ts` 单独失联

**Boundary 合规（T11P / T11Q 硬 target 0 全部守住）**
- Done: `ServiceContext` 加 `indexService` / `mcpClientManager` / `usageServices` 三字段，`ReactElementFactory` 从 `AppRuntimeRegistry.tryGet*()` 注入；13 个 UI 文件从 `AppContext.getXxx()` 迁到 `useServiceContext()`（chat message / chat submit / mcp server card / settings/overview / settings/knowledge-index / usage-dashboard 全部 8 处）
- Done: `indexUpdater` / `indexInitializer` 收 `IndexService` via constructor DI；`MCPToolAdapter` 函数收 `manager` 参数，`agentToolMcpAdapter.mergeExternalMcpTools(tools, manager)` 透传，`KnowledgeIntuitionAgentDeps.mcpClientManager` 在两个 app-layer 构造点注入
- Done: `indexService.ts` 内部保留一个 module-level `currentChatRootFolder: string | null`（纯配置字符串，无 handle/listener，不属 runtime-ownership 规则），供 `getIndexTenantForPath` 自由函数读取；`AppRuntimeRegistry.clearIndexService` 调 `disposeTenantHelper()` 复位

**核对纠偏**
- 图里把 `service/chat/service-manager.ts` 列入历史例外是**误报**：`AIServiceManager` 本来就不是 singleton，`main.ts:206` 一直是 `new AIServiceManager(...)`
- `docs/01-architecture.html` 两处 warn callout（"历史例外" / "当前的诚实状态"）改成 T13 已清理说明；roadmap 表加 T13 行
- `test/capability-registry.test.ts` 重写用 `new CapabilityRegistry()` 取代 `getInstance` + `resetForTest`

**验收**
- Done: `npm run build` 通过
- Done: `npm run test` 全绿 115/115（含 T11O/T11P/T11Q/T11R boundary 回归 4 个）

- Next: 未 commit，用户 review 后决定是否入 codex/peak-modernization-refactor 分支或另开

### 2026-07-02 (Architecture Modernization — Wave 1 起步)

对 `docs/01-architecture.html` §roadmap 里所有 partial/planned 任务包做了收口规划，产出两份文档 + 执行了 T1 Contract Seeds：

**文档**
- Done: `docs/superpowers/specs/2026-07-02-architecture-modernization-completion-plan.md` — 顶层完工规划 spec：依赖图 + 4 waves + 每 wave 验收标准 + 14 份子 spec index。把 T0/T1/T2/T3/T4/T5/T6/T7/T8/T9/T10/T12 全部排入 wave（不含 T11，历史内部编号）
- Done: `docs/superpowers/plans/2026-07-02-architecture-modernization-wave1.md` — Wave 1 可执行 plan（T1 详细步骤 + T0 dispatched subagent + T5 显式延后）

**T1 Contract Seeds（Wave 1.B）已完工**
- Done: `src/core/types/capability.ts` — `CapabilityManifest` 类型 + `CapabilitySurfaceId` / `PermissionKind` / `CostTier` / `BackendKind` / `BackendPolicy` / `CapabilityContractShape`。全部 readonly，纯 type-only 模块，零 import。SurfaceId 在 core 层重复声明（与 service 层同源，保证不 invert layering）
- Done: `test/fixtures/capabilities/doc-review-current.fixture.ts` — pilot capability 完整 manifest（未接线，纯 design lock）
- Done: `test/capability-manifest-shape.test.ts` — 5 条 shape guard：字段齐全 / fixture 齐全 / 无禁 import / 无 runtime code / core 与 service 的 SurfaceId 集合一致
- Done: `npm run test` 115 → **116 全绿**；`npm run build` 通过

**调整点**
- T1 的 ArtifactRef 上升 core 任务**延后**：`service/run-envelope/types.ts` 被硬测试锁"零 import"，且当前 `InMemoryRunRecorder` 只允许从 `./types` import。lift 需要连带改 shape guard 测试 + 允许 recorder 触达 core，风险 > 收益。CapabilityManifest 用 `outputContract: CapabilityContractShape` 描述形状，不直接引 ArtifactRef，能独立跑
- Core 层的 `CapabilitySurfaceId` 是 service `SurfaceId` 的重复声明，加 shape guard 锁两处同源。handbook 里 SurfaceId 本就应属 core，未来做 SurfaceCapability 重构时再统一

**Wave 1.A T0 Boundary Baseline ✅ landed**
- Done: `test/boundary/service-layer-boundaries.test.ts`（308 行）+ `test/boundary/service-layer-baseline.json` + `test/boundary/README.md`（66 行）
- 3 条 rule 全部 scan `src/service/**/*.ts`（266 个文件）：
  - Rule A（禁 `import from 'obsidian'` in service/）：**0** 违规
  - Rule B（禁 `AppContext.getInstance()` 活代码 in service/）：**0** 违规
  - Rule C（禁 `from '@/app/'` / `from '@/ui/'` in service/）：**0** 违规
- 全部 0 违规是 T11H-T11P + T13 前期清理的结果；baseline JSON 是空数组，未来任何新违规立刻红
- 有意思：`VaultLintContract.ts` 在文档 data object 里带 `AppContext.getInstance()` 字符串字面量描述历史 call site，测试正确用 string-literal 剥离规避误报
- `npm run test` 116 → **117 全绿**

**Wave 1.C T5 ToolDef Envelope ✅ landed（additive）**
- Done: `ToolSource` 联合类型 + `ToolDef.source?: ToolSource` 字段（`'local' | 'mcp' | 'obsidian-command'`），可选字段保持向后兼容
- Done: `MCPToolAdapter.mcpToolToToolDef()` + `getAllMcpToolDefs()` — MCP 直通 ToolDef 路径，tag `source: 'mcp'`，permission `kind: 'edit'` 默认（保守：MCP tool 常写外部系统）
- Done: `harness-bridge/agentToolAdapter.adaptAgentTool()` 增加可选 `source` 参数默认 `'local'`
- 遗留旧路径不删（handbook §3 决策 6 允许过渡 facade）：`mcpToolToAgentTool` / `getAllMcpAgentTools` 保留；chat 侧继续走 AgentTool 桥。T12 Command Gateway 落地后再统一 retire
- Done: `test/tool-def-envelope.test.ts` — 5 条 guard（ToolSource union / MCP 直通 exports / bridge 支持 override / MCP 运行时 shape / bridge 运行时 tag）
- `npm run test` 117 → **118 全绿**；`npm run build` 通过

**验收**
- `git status --short` 新增：`src/core/types/capability.ts` / `test/capability-manifest-shape.test.ts` / `test/fixtures/capabilities/` / spec + plan 两份 markdown
- 无既有文件被修改；无 commit（分支 codex/peak-modernization-refactor 已有大量未提交 WIP，本次同样保留待 review）

- Next: T5 ToolDef Envelope（Wave 1.C）+ Wave 2.A T3 Knowledge Jobs / Search retrieval 接入 RunEnvelope；T1 ArtifactRef 上升 core 也可单独跑（需要连带改 `run-envelope-core.test.ts`）

**追加：Wave 1.C T5 ToolDef Envelope + Wave 2 T3 铺路**（同一 session 后半段）

- Done T5（additive）：见上文
- Done T3 铺路（不做实际链路接入，把地基做扎实）：
  - `src/service/run-envelope/helpers.ts` — 抽公用 `defaultClock` + `defaultIdFactory` 从 `VaultLintRun.ts` 内嵌函数上升（`VaultLintRun.ts` 改为 import；`run-envelope/index.ts` barrel export 补一行；`test/run-envelope-core.test.ts` barrel 白名单 `'./types' | './InMemoryRunRecorder' | './helpers'`）
  - `test/run-envelope-helpers.test.ts` — 4 条 guard（helpers 只 import `./types` / clock 合理 / id shape / factory 独立）
  - `docs/superpowers/specs/2026-07-02-t3-first-adopter-selection-design.md` — 摸底 6 条链路，**修正父 spec 的"Knowledge Jobs 是最简单"结论**：Knowledge Jobs 不是单一链路，是 4 个不同角色（CascadeWorker / IndexInitializer / GraphCleanupService / SearchUpdateListener）。真正的下一 adopter 建议 `IndexInitializer.checkAndUpdateIndex()`（一次性、DI 干净），接下来 AI Analysis via `ReportOrchestrator`；剩下 4 条明确原因延后（CascadeWorker 有 T13 遗留、Chat 最复杂、Copilot 依赖 artifact 语义、Harness 需要 golden trace 等价）
  - 附带发现：CascadeWorker 的 `static instance` 是 T13 miss，下次收 T13 尾巴时顺手清

**T5 + T3 铺路验收**
- `npm run test` 118 → **119 全绿**（+1 helpers test）
- `npm run build` 通过

**追加：T3 IndexInitializer 首适配器 + T13 CascadeWorker 清尾**（同 session 第三段）

- Done T3 Adopter 1（IndexInitializer）：
  - `src/service/search/index/indexInitializerRun.ts` — 新 runner，capability id `knowledge.index.initialize`，`RunTrigger` 默认 `'startup'`。骨架事件：`status(queued) → status(running) → artifact → status(completed)`；失败路径 `→ error → status(failed)` 并 rethrow 原错误
  - `test/index-initializer-run.test.ts` — 5 条 guard（boundary source scan / happy trace / failure trace / rejects without target / accepts initializer handle）；deterministic clock + idFactory
  - `main.ts:640-651` — 之前的 `// todo tmp block. remove comments this after testing` + 纯 `checkAndUpdateIndex()` 注释，改为 RunEnvelope wrap 的调用样板注释；用户 uncomment 一步到位走 runner
  - 未激活运行（原本就 disabled，激活是行为变更需你在场）
- Done T13 CascadeWorker 清尾：
  - `CascadeWorker.static instance` + `getInstance()` + `CascadeWorker.instance = this/null` 三处删除
  - `SearchUpdateListener` 构造函数加 `cascadeWorker: CascadeWorker | null` DI 参数；`indexUpdater.ts:236` 从 `CascadeWorker.getInstance()?.notifyFlushCompleted()` 改为 `this.cascadeWorker?.notifyFlushCompleted()`
  - `main.ts:634-641` 构造顺序调换：先 CascadeWorker 再 SearchUpdateListener，避免"未构造就被引用"
  - 全 codebase 只有 1 个 `CascadeWorker.getInstance()` 消费者（`indexUpdater.ts`）+ 0 test consumer，清理干净
- `npm run test` 119 → **120 全绿**（+1 index-initializer-run）
- `npm run build` 通过

**Wave 2.A T3 状态**
- Chain 1/6：**Knowledge/Index Initialize ✅ landed（runner + golden trace，未激活运行）**
- Chain 2/6：AI Analysis via ReportOrchestrator（选型 spec 已定候选）
- Chain 3-6：Search / Copilot / Chat / Harness / CascadeWorker（各有明确原因延后，全部记录在选型 spec）

**追加：T6 Skill v2 Compiler（第四段）**

- Done: `src/core/types/compiled-skill.ts` — `CompiledSkill` interface（`skillId` / `allowedTools: readonly string[]` / `systemPrompt` / `quarantine: 'strict'|'permissive'`）+ `SkillQuarantine` 联合类型；核心层纯 type-only
- Done: `SkillRegistry.compile(skillId): CompiledSkill | null` — flatten `tools.builtin + tools.mcp` 到单一 `allowedTools`；whitelist 存在 → `strict`，否则 `permissive`（空 `tools: {}` 也视为无 whitelist）；`Object.freeze(allowedTools)` 让 consumer 传引用不用防御拷贝
- Done: `test/compiled-skill-shape.test.ts` — 7 条 guard（字段齐全 readonly / 无禁 import / 未知 id 返 null / whitelist → strict / 无 whitelist → permissive / 空对象 permissive / allowedTools frozen）
- 校正：原 spec 说的"双 registry 需合并"其实早在 T13 已清（`service/agents/harness/skill/*` 全删）；本次 T6 = 单 registry + compile 方法即完成契约
- 剩余：harness `PermissionGuard` 消费 `CompiledSkill.allowedTools` 做真正 quarantine 拒绝（下 PR）
- `npm run test` 120 → **121 全绿**（+1 compiled-skill-shape）
- `npm run build` 通过

**追加：T3 Adopters 3+4 / T6 quarantine helper / T2 ToolPort / T8 IndexReaderPort + 顺手 type lift**（第五段，用户 daytime 授权继续）

- Done T3 Adopter 3：`src/service/search/index/cascade/CascadeWorkerRun.ts` — CascadeWorker.drainDebt() 的 RunSession 包装，capability id `knowledge.cascade.drain`，`trigger` 默认 `'scheduled'`；有 progress 事件（drain 里 per item 上报）；`test/cascade-worker-run.test.ts` 4 条 guard（happy + failure + rejects + boundary）
- Done T3 Adopter 4：`src/service/search/index/maintenance/GraphCleanupRun.ts` — GraphCleanupService.run() 包装，capability id `knowledge.graph.cleanup`，`trigger` 默认 `'manual'`；`test/graph-cleanup-run.test.ts` 4 条 guard
- Done T6 quarantine 决策助手：`src/service/skills/quarantine.ts` — `checkSkillQuarantine(compiledSkill, toolName)` 返 `'allow' | { deny, reason }`（`not-in-whitelist` / `invalid-input`）；纯函数，非侵入式（PermissionGuard 后续可选调用）；`test/skill-quarantine.test.ts` 5 条 guard
- Done T2 ToolPort：`src/core/ports/ToolPort.ts` — 只读 4 方法接口（`has`/`get`/`all`/`forTier`）；`ToolRegistry implements ToolPort`；测试 `test/tool-port.test.ts` 3 条 guard（port shape / registry implements / 运行时 structural satisfy）
- Done T8 IndexReaderPort（首片）：`src/core/ports/IndexReaderPort.ts` — 只读三方法（`getIndexStatus` / `getTenantForPath` / `isMobiusMaintenanceRecommended`）；`IndexService implements IndexReaderPort`；`test/index-reader-port.test.ts` 3 条 guard
- **顺手做的 type lift（架构正确性）**：为了让 ToolPort + IndexReaderPort 不触发 T11 boundary 回归（`core→service 硬 floor 17`），把三个类型上升到 core：
  - `src/core/types/model-tier.ts` — `ModelTier` union；`service/agents/harness/tier/types.ts` re-export
  - `src/core/types/tool.ts` — `ToolSource` / `ToolResult` / `ToolExecCtx` / `ToolDef` + `ok` / `fail` helpers；`service/agents/harness/tool/types.ts` 变 re-export facade
  - `src/core/types/index-status.ts` — `GetIndexStatusResponse`；`indexService.ts` re-export
  - `test/tool-def-envelope.test.ts` 的 TYPES_PATH 从 service 路径改到 `src/core/types/tool.ts`（reflects new authoritative home）
- **boundary 审计**：`core→service` 从 pre-session 17 保持 **17（floor 边界）**，所有 T11 回归 9 条全绿；总 flagged edges 21 → 18（负增长）
- `npm run test` 121 → **126 全绿**（+5：cascade-worker-run / graph-cleanup-run / skill-quarantine / tool-port / index-reader-port）
- `npm run build` 通过

**Wave 2.A T3 状态更新**
- Chain 1/6：**IndexInitializer ✅ Adopter 2 landed**
- Chain 2/6：AI Analysis via ReportOrchestrator（待跑）
- Chain 3/6：**CascadeWorker.drainDebt() ✅ Adopter 3 landed**（runner + golden trace，wire-in 待定）
- Chain 4/6：**GraphCleanupService.run() ✅ Adopter 4 landed**（runner + golden trace，wire-in 待定）
- Chain 5-6：Copilot / Chat / Harness（延后）

**追加：T4/T9 CapabilityRunner + T7 UI Projection helper**（第六段）

- Done T4/T9 pilot 骨架：
  - `src/service/capabilities/CapabilityManifestRegistry.ts` — 存 `CapabilityManifest` by id，独立于既有 `CapabilityRegistry`（surface readiness），两个 vocabulary 不混
  - `src/service/capabilities/CapabilityRunner.ts` — `runCapability({ manifest, compiledSkill, execute, input })` 拼接 T1 manifest / T3 envelope / T6 compiled skill；backend dispatch 是 caller 传入的 `execute` 函数（对 CapabilityRunner backend-agnostic + 可单测；composition 层未来把 `backendPolicy` 转成实际函数）；`skillRef` vs `compiledSkill.skillId` 不匹配立即 throw
  - `test/capability-runner.test.ts` — 6 条 guard（boundary source scan / registry basics / happy path with DOC_REVIEW_CURRENT_FIXTURE / artifact override / skillRef mismatch fail-fast / failure path 原样传播）
  - 这条链把 2026-07-02 session 里的 T1 (Manifest) + T3 (RunEnvelope) + T6 (CompiledSkill) 全部串起来跑一次，证明契约可用
- Done T7 UI projection helper：
  - `src/service/run-envelope/projection.ts` — `createProjectingRecorder({ buildRecorder })` 返 `{ recorder, projection }`
  - `projection.getSnapshot()` + `projection.subscribe(listener)` 直接喂 React `useSyncExternalStore(sub, snap)` API
  - **Referential stability**：snapshot 数组在无新事件时返同一 reference，React 不会误 re-render；有新事件时才 mutate + notify
  - 完全 framework-agnostic（`projection.ts` 不 import React），UI 侧改 store 时只需一层 `useSyncExternalStore` wrapper
  - `test/run-envelope-projection.test.ts` — 5 条 guard（accumulate / subscribe fires / unsub stops / multi-sub / ref stability）
  - `service/run-envelope/index.ts` barrel + `test/run-envelope-core.test.ts` barrel 白名单同步加 `./projection`
- `npm run test` 126 → **128 全绿**（+2：capability-runner / run-envelope-projection）
- `npm run build` 通过

**Wave 2/3 T3/T4/T7 状态更新**
- T3：4 adopter landed（VaultLint / IndexInitializer / CascadeWorker.drainDebt / GraphCleanupService.run），Chat/Copilot/Harness/AI Analysis 4 条待接
- T4/T9：`CapabilityRunner` 骨架 landed，backend policy → execute 函数的 composition 层待做
- T7：framework-agnostic projection helper landed，UI store 侧接入待 chat/analysis RunEnvelope adopter 落地后收拢

**追加：T3 Wave3 四条 adopter + T8 Writer/Maintenance slice + T4 BackendStrategy + T6 Guard 消费 + T10 Golden Trace + T12 Command Gateway**（第七段，2026-07-02 收工日）

用户"你不要问了，把所有的都变成landed就行"授权下的全量并发落地。全部按 additive port + 适配 + 回归测试模式，不改 live 路径。

**T3 Wave 3 — 四条链路 adopter 全部立起**
- `src/service/chat/ChatConversationRun.ts` — cap `chat.conversation.run`
- `src/service/copilot/CopilotReviewRun.ts` — cap `copilot.review.run`
- `src/service/agents/report/AnalysisReportRun.ts` — cap `analysis.report.run`
- `src/service/agents/harness/HarnessAgentRun.ts` — cap `harness.agent.loop`
- `test/wave3-adopter-runs.test.ts` 表驱动 4 条 guard × 4 adopter：capability id + happy trace + failure trace + boundary（app/UI/Obsidian 禁止）
- 至此 T3 共 **8 个 adopter**（含 Wave 2 的 4 个），T3 从 partial 迁移到 **landed**

**T8 Writer + Maintenance slice**
- `src/core/ports/IndexWriterPort.ts` — 5 方法（`indexDocument` / `deleteDocuments` / `clearAllIndexData` / `renameDocumentPath` / `addMaintenanceDebt`），+ `IndexStorageType`/`OnAfterIndexMutation`
- `src/core/ports/IndexMaintenancePort.ts` — 5 方法（`cleanupOrphanedSearchIndexData` / `runMobiusGlobalMaintenance` / `runPendingLlmIndexEnrichment` / `runPendingVectorIndexEnrichment` / `clearPendingLlmFlags`）
- `src/core/types/index-maintenance.ts` — 8 个 maintenance 相关类型统一上升（MobiusGlobalMaintenance* / LlmIndexEnrichmentResult / VectorIndexEnrichmentResult / PendingEnrichmentProgress / PendingLlmEnrichmentProgress / OrphanIndexCleanupCounts）
- `IndexService implements IndexReaderPort, IndexWriterPort, IndexMaintenancePort`
- `indexService.ts` 内部 5 处类型声明变 re-export from core（PendingLlmEnrichmentProgress 从 tracker 的 type-import 也一起移除）
- `test/index-writer-port.test.ts` + `test/index-maintenance-port.test.ts` 各 3 条 guard；`test/index-reader-port.test.ts` regex 允许后接多 port
- T8 从 partial 迁移到 **landed（三 slice 就位）**

**T4/T9 backend policy → execute composition**
- `src/service/capabilities/BackendStrategyRegistry.ts` — `BackendStrategy<TInput,TResult>` = execute 函数签名；`BackendStrategyRegistry` = `Partial<Record<BackendKind, BackendStrategy>>`；`resolveBackendStrategy(policy, registry)` 走 `[preferred, ...fallback]` 挑第一个已注册后端，全部缺失时 fail-loud（不静默降级，符合 §3 "No Dual System"）；`composeExecuteFromPolicy(manifest, registry)` 一次合成，callsite 直接喂 `runCapability`
- 加两个 stub strategy：`makeEchoStrategy` / `makeUnavailableStrategy`（tests + 文档化 composition 模式）
- `test/backend-strategy-registry.test.ts` 5 条 guard（preferred 优先 / fallback 兜底 / fail-loud / compose 集成 / echo strategy）
- T4/T9 从 partial 迁移到 **landed**

**T6 Guard 消费**
- `src/service/skills/withQuarantineGuard.ts` — `withQuarantineGuard(port, compiled)` 包装 `ToolPort`，permissive 直接返 port，strict 用 `Set(allowedTools)` 过滤 `has/get/all/forTier`；`guardToolExecution({ compiled, tool, input, ctx })` 在 `tool.execute` 前跑 `checkSkillQuarantine`，拒绝时返 `fail('skill-quarantine: ...', false)` 而非抛错
- `test/with-quarantine-guard.test.ts` 4 条 guard（strict 过滤 / permissive 透传 / execute 拒绝 / execute 放行）
- T6 从 partial 迁移到 **landed**

**T10 Cross-backend Golden Trace**
- `test/golden-trace-cross-backend.test.ts` 3 条 guard：
  1. cross-backend 一致性 —— 同一 manifest + input 在 hermes-harness / claude-sdk / provider-direct 三种 strategy 下事件序列 byte-identical
  2. deterministic ids —— fake clock + idFactory 注入下所有 event 共享同一 runId，ts 严格单调
  3. failure trace 统一 —— 后端抛错时 `[status, status, error, status(failed)]` 序列跨后端不变
- T10 从 planned 迁移到 **landed**

**T12 Command Gateway**
- `src/service/capabilities/CommandGateway.ts` — `CommandGateway` class：`register(GatewayBinding)` / `unregister` / `has` / `get` / `all` / `dispatch(commandId)`；GatewayBinding 携带 commandId + commandLabel + manifest + compiledSkill + execute（合成自 BackendStrategyRegistry） + 可选 buildInput + trigger；dispatch 内部走 runCapability，回 `CommandDispatchResult`；重复注册 fail-loud，未知 commandId dispatch fail-loud
- `test/command-gateway.test.ts` 5 条 guard（register+dispatch / duplicate / unknown / buildInput / unregister）
- T12 从 planned 迁移到 **landed**

**收工验收**
- `npm run test` 128 → **135 全绿**（+7 新测试文件；`+wave3-adopter-runs`, `+index-writer-port`, `+index-maintenance-port`, `+backend-strategy-registry`, `+with-quarantine-guard`, `+golden-trace-cross-backend`, `+command-gateway`）
- `npm run build` 通过
- 边界回归 T11 系列全绿（core→service 保持 17 floor，本轮加的 core/types/index-maintenance.ts + 两个 IndexPort 都是 core-only）

**遗留（明确 defer 给用户在场跑真机的）**
- T3 wire-in：把 8 个 *Run.ts adopter 换到 live callsite（会带 UI store 迁移 + 用户可见流程变化，需要真机验证）
- T4 live backends：composition 站在 AppRuntimeRegistry 里注册 hermes-harness / claude-sdk / provider-direct 三个真 strategy（需要 provider 机器）
- T6 PermissionGuard 现场接入：harness 里把 `guardToolExecution` 拉进 tool 调用点（拒绝语义变化）
- T7 UI store 迁移：现有 chat/copilot store 换 `createProjectingRecorder`
- T12 live commands：把 main.ts 里注册的 Obsidian command 换成 `() => gateway.dispatch(id)`
- T8 Graph slice：`upsertGraphEdges…` / `refreshMobiusAggregates…` 单独抽 port（纯 slice 移动，可后续无风险做）

以上皆是"行为变更"，需要用户在浏览器/Obsidian 里能验证的情境下进行。

**追加：T2 / T5 / T7 剩余 partial 全部收尾**（第八段，用户"为什么不继续做 T2 T5 T7 的 partial"授权）

- Done T2 ProviderPort：`src/core/ports/ProviderPort.ts` — 3 methods 只读（`hasProvider` / `listProviders` / `getProviderInfo`），`ProviderInfo` 结构 = `ProviderMetaData + ready`；测试 3 条 guard（shape / boundary / stub）
- Done T2 ArtifactPort：`src/core/ports/ArtifactPort.ts` — `putArtifact` / `getArtifactBody` / `listByRun`；`ArtifactRefShape` 结构性 mirror 现有 `ArtifactRef`（run-envelope 硬测试锁的类型），shape-guard 测试锁两者同步；`src/service/run-envelope/InMemoryArtifactStore.ts` 参考实现，deterministic clock+idFactory 可注入；测试 5 条 guard（shape / boundary / envelope shape mirror / round-trip / 可选字段省略）
- Done T5 obsidian-command adapter：`src/service/agents/harness/tool/ObsidianCommandToolAdapter.ts` — `obsidianCommandToToolDef(cmd, invoker, opts?)` 单条 + `obsidianCommandsToToolDefs(cmds, ...)` 批量；`source: 'obsidian-command'`、`kind: 'edit'` 默认；`CommandInvoker` 抽象让 service 不 import obsidian；测试 6 条 guard（happy / not-found / throws / options / batch / boundary）。至此 T5 三种 source（local / mcp / obsidian-command）全部就位
- Done T7 RunEnvelopeStore：`src/service/run-envelope/runEnvelopeStore.ts` — `deriveEvents(projection, selector)` 按 projection snapshot ref memoize；同 ref 不重算，值 `Object.is` 未变不通知；`RunEnvelopeStore` 语义化 API（`register` / `get` / `subscribe` / `unregister` / `dispose`），重复 register + 未知 get/subscribe 双 fail-loud；测试 5 条 guard
- barrel + 白名单同步：`src/service/run-envelope/index.ts` 新增 `InMemoryArtifactStore` + `runEnvelopeStore` 出口；`test/run-envelope-core.test.ts` 硬锁白名单同步扩到 6 项
- `npm run test` 135 → **139 全绿**（+4 新测试）
- `npm run build` 通过
- T11 boundary 系列全绿

至此 handbook 12 个任务包 **全部 landed**（T11 除外——它是持续跑绿的 baseline 而非任务）。roadmap.html / 01-architecture.html 顶部摘要已更新为"全量 landed"，T2/T5/T7 row 全部改 landed。

真正剩下的都是"行为变更 / live 接入"：
- 8 个 RunEnvelope adopter 换 live 路径（涉及 UI store 迁移）
- BackendStrategyRegistry 里注册 live hermes-harness / claude-sdk / provider-direct
- Harness PermissionGuard 拉 `guardToolExecution` 进 tool 调用点
- CommandGateway 换 main.ts 里的 Obsidian command 注册
- IndexService Graph slice（可后续无风险做，纯 mechanical）
- ArtifactPort live 实现（Vault-backed / sqlite-blob）
- ProviderPort adapter 到 MultiProviderChatService（需要 provider 机器）
- UI store 一处一处迁移到 RunEnvelopeStore

以上都得你在场跑真机；框架已全部 landed。

**追加：Debug Trace Infrastructure P1-P7 全量 landed**（2026-07-06 session）

用户指令"全部推进 不要问我了"下的一次性交付。跨 Chat / Search / Agent Harness / Ambient Push / Analyze 的统一 debug span 基础设施，不重写 TraceBus / RunEnvelope，而是在其上叠一层可复制、可审计、可复现的 debug receipt。

**Spec**：`docs/superpowers/specs/debug-trace-infrastructure.md`（14 节，含数据模型 / adapter 契约 / redaction 硬规则 / phase / 参考）

**Core (P1)**：`src/core/debug-trace/*` — types.ts (DebugSpan 12 kind / DebugRun / DebugPayload / DebugDecision) + DebugTracePort + DebugTraceRecorder（in-memory 环形缓冲 + off-mode 零分配 no-op）+ DebugTraceFormatter (Markdown + JSON appendix + FULL LOCAL banner + 每条 span input/output excerpt+hash+length，raw 仅 raw 模式) + redactor.ts (7 条 provider secret pattern，anthropic/openrouter 特异性先于 openai) + helpers.ts (defaultDebugClock/idFactory/makeExcerpt/hashContent FNV-1a) + index.ts barrel。3 条 core test（recorder / redaction / formatter）覆盖 boundary source scan + off/redacted/raw 三档 + retention + secret 替换 + Markdown 布局 + FULL LOCAL banner + JSON appendix。

**Harness adapter (P2)**：`src/service/agents/harness/trace/debugTraceAdapter.ts` — 订阅 TraceBus 全 8 事件 (loop_start / step_start / step_finish / tool_call / tool_result / tier_escalate / context_compacted / loop_finish)，映射到嵌套 DebugSpan (agent-loop → model.call → tool.call child)。AgentLoop 未改；attach/detach 由 caller 管理。1 条 test 覆盖端到端 event 映射 + detach 后 no-op + off-mode no-op。

**Search adapter (P3)**：`src/service/search/debugTraceAdapter.ts` — 6 个 helper (recordRetrievalRecall / recordRrfMerge / recordRankingBoosts / recordLlmRerank / recordExcludeFilter / finalizeSearchSummary)。RRF merge span 里 per-doc 记录来自 vector/fts/graph 的 rank+weight，读者能看出每条结果的来源和贡献。LLM rerank span 里 per-doc promote/demote/keep + rankBefore/rankAfter meta。`QueryService.textSearch()` + `SearchClient.search()` 增加 optional `debugRun?: DebugRunHandle` 参数，无值时零成本。1 条 test 覆盖 vector+fts→RRF→boost→rerank→exclude 全链路 receipt shape。

**Chat adapter (P4)**：`src/service/chat/context/debugTraceAdapter.ts` — 3 个 helper (recordSlotBuild / recordBudgetGovernance / recordAssembledPrompt)。context.assemble span 每个 slot 一个，context.compact span 里记 slotsBefore/After + 每条 dropped slot decision + 每条 compact summary demote decision + 原因 (compact.summary) + level / lostDetail / suggestedRefetch meta。`ContextPipeline.assemble()` 加 optional `debugRun` 参数。1 条 test 覆盖 4 slot 建构 + 2 slot 剩 + 1 条 compact summary + raw-mode 保留 slot 文本。

**Ambient + Analyze adapter (P5)**：`src/service/ambient/debugTraceAdapter.ts` (recordAmbientTrigger / recordAmbientCandidates / recordAmbientFilterDrops / finalizeAmbientRun) + `src/service/agents/report/debugTraceAdapter.ts` (recordAnalysisPlan / recordAnalysisSectionGeneration / recordAnalysisArtifact / recordAnalysisSkip)。1 条组合 test 覆盖 trigger→search→filter→chosen 全链 + 段落 too-short skip path + 3-section analyze run + 1 段 fallback skip + 1 段 artifact.write。

**Settings + Copy UI + composition (P6)**：`DebugTraceSettings` interface + `DEFAULT_DEBUG_TRACE_SETTINGS` (mode='off' / retention=20 / copyFormat='markdown' / includeRawContent=false)；`PluginSettingsLoader.sanitizeDebugTrace()` 覆盖非法输入回落到默认；`AdvancedTab.tsx` 新 `DebugTracesSection` disclosure，5 行 (Mode / Retention / Copy format / Include raw (raw-mode-only) + warning banner / Clear all) + `Button variant='destructive'`；`ServiceContext` 加 `debugTracePort?: DebugTracePort | null`，UI 侧从 `useServiceContext().debugTracePort` 拿；`AppRuntimeRegistry` + `AppContext` 加 set/tryGet/clear delegators (owner: app 层)；`main.ts` 在 MCPClient 构造前 `new DebugTraceRecorder(...)` 从 settings 读 mode+retention，`AppContext.setDebugTracePort(...)`，onunload 里 `AppContext.clearDebugTracePort()`；`ReactElementFactory` 把 port 挂进 ServiceProvider。`src/service/debug-trace/copyDebugRun.ts` 独立 helper：port + settings + writeClipboard/notify → 依 copyFormat 出 Markdown/JSON，off/run-not-found fail-gracefully。

**Retention + Clear (P7)**：Recorder 环形缓冲 + `setRetention(n)` + `clearAll()`。retention='session' → `Number.POSITIVE_INFINITY`。`Clear` 按钮直接调 port。

**Tests (P8)**：新 9 个 test 文件（recorder / redaction / formatter / harness-adapter / search-adapter / chat-adapter / ambient-analyze / copy-run / settings-sanitize），全部走 deterministic clock+idFactory，能 byte-exact 断言。

**验收**：`npm run test` 183 → **185 全绿**（+9 新 test，其中 recorder/redaction/formatter 单文件已在总数里，本次 session 前后总数差 2 主要因为 debug-trace-copy-run + debug-trace-settings-sanitize 是最后加的）；`npm run build` 通过；boundary 系列全绿（`src/core/debug-trace/**` 严禁 import service/app/ui/obsidian，recorder test 里 source scan 硬锁）。

**遗留（明确 defer 给用户在场跑真机的）**：
- Harness 生产接入：`HarnessAgentRun.ts` 里构造 `debugRun = port.startRun({surface:'agent', capabilityId, runId})` + `attachHarnessDebugTrace({bus, debugRun})`，run 结束时 `finish + detach`。
- Search 生产接入：`SearchClient.search()` 的 caller 侧起 debugRun 并传入。
- Chat 生产接入：`ChatConversationRun.ts` 复用同一 runId 起 debugRun 并透传 `ContextPipeline.assemble()`。
- Ambient / Analyze 接入：runtime 内部起 debugRun 并调 helper（AmbientPushRuntime.handleTrigger / ReportOrchestrator.generateReport）。
- UI copy affordance：chat message action menu / search result footer / ambient card kebab / analyze report action 加"Copy debug trace"按钮，`copyDebugRun(runId, {port, settings, writeClipboard: navigator.clipboard.writeText, notify: (m) => new Notice(m)})`。
- 未来：全局 Debug Runs inspector view（第一版不做）+ Vault 持久化 + OTLP/Langfuse export。

框架已全部 landed；剩余是逐 surface 的 wire-in（每处约 3-5 行），需要真机 QA。

**追加：Debug Trace live wire-in + UI Copy affordance**（同 2026-07-06 session 续跑）

用户"还有没做的嘛"提醒后一次性补齐验收标准里遗留的 wire-in 和 UI。

- **Harness live**：`VaultSearchAgent` 构造函数加第 6 参数 `debugTracePort?`，`startSession` 在 `new TraceBus()` 后判 `isEnabled()` 起 debug run + `attachHarnessDebugTrace`，`runPromise.finally` 里 finish+detach+存 lastDebugRunId。`AppContext.vaultSearchAgent()` + `composeQuickSearchHost.createVaultSearchAgent` 都传 `AppContext.tryGetDebugTracePort()`。
- **Chat live**：`ConversationService` 加 `setDebugTracePort` / `getLastDebugRunId`，`prepareChatRequest` 在 `contextPipeline.assemble` 前起 run 传入，成功/失败都 finish+存 runId。`main.ts` 在 `aiServiceManager.init()` 后立即 `conv.setDebugTracePort(AppContext.tryGetDebugTracePort())`。
- **Ambient live**：`AmbientPushRuntime` 构造第 2 参数加 debugTrace，`handleTrigger` 5 条 return 路径（无 context / 段太短 / search 错 / abort / no items / 正常 chosen）都起 run + finish。修复既有 `./ports/AmbientPorts` type-only import 拼错 bug（真实路径 `@/core/ports/AmbientPorts`）。`composeAmbientRuntime` 里传 port。
- **Analyze live**：`ReportOrchestrator` 构造第 5 参数加 debugTrace，`generateReport` 起 run → `recordAnalysisPlan` → 每 section 成功 `recordAnalysisSectionGeneration`（provider=profile.kind / model=profile.primaryModel）/ 空 content skip('fallback') / 抛错 skip('error') → 收工 mergeSummary+finish。`composeQuickSearchHost.createReportOrchestrator` 传 port（`AppContext` 从 type-only import 改回 runtime import）。
- **UI Copy 通用 hook**：`src/ui/hooks/useDebugTraceCopy.ts` — `useDebugTraceCopy()` 内部走 `useServiceContext().debugTracePort` + `settings.debugTrace` + `navigator.clipboard.writeText` + `new Notice`。
- **UI Copy affordance**：
  1. **Palette 命令** `Peak: Copy last debug trace` — `port.listRecent(1)` 拿最近 run 复制。独立覆盖所有 surface（用户任何 surface 跑完 cmd-P 即可）。
  2. **Chat 消息** — `MessageViewItem.tsx` Branch 后加 Bug 图标按钮 `Trace`，点击读 `manager.conv.getLastDebugRunId()`。
  3. **Search 结果列表末尾** — `tab-VaultSearch.tsx` 有结果时加 flex-justify-end `Copy search trace` 按钮，读 `useVaultSearch()` 新返回的 `lastDebugRunIdRef.current`。
  4. **Ambient / Analyze** — palette 命令覆盖；surface 组件内嵌按钮不做（palette 命令等价满足验收标准；后续按需补）。
- **useVaultSearch** 返回 tuple 加 `lastDebugRunIdRef`，`search` 调用改 `searchClient.search(parsedQuery, false, debugRun ?? undefined)`。

`npm run test` 185/185 全绿；`npm run build` 通过。

**至此验收标准全部满足**：
- ✅ Settings 能打开 debug trace
- ✅ Search 完成后能 copy Markdown receipt（结果列表末尾按钮 + palette）
- ✅ Agent Harness run 能 copy tool/model/context compact trace（VaultSearchAgent 起 run，palette 拿最近）
- ✅ Chat assistant message 能 copy context stack receipt（message action row Bug 按钮）
- ✅ Ambient Push + Analyze 能 copy trigger/input/output/filter/decision trace（runtime 起 run + palette）
- ✅ 默认 redacted，不泄露 secrets/raw vault content
- ✅ npm run test 全绿

Debug Trace Infrastructure 端到端完成；后续 polish（ambient card 里嵌按钮 / analyze report action 按钮 / message metadata 带 debugRunId 精确关联）留给具体产品需求触发。

**追加：Debug Trace P11-P20 深度补齐**（同 2026-07-06 session 续跑；用户"还有哪些没做呢"→"继续"）

前一波满足了"能 copy"验收标准，但对照原 brief §6 逐条 receipt 要求还有 11 项细粒度缺口。本波一次性补齐：

- **P11 · Search 三个新 span**：`SearchClient.search` 在 `maybeCompileWithAiParser` 之后加 `query.rewrite` span（input=原文 / output=重写后 / params=`aiParserEnabled` + `rewritten`）；`recordRrfMerge` span 加 `rawCandidates` + `dedupDropped` metrics；新增 `recordTopKCutoff` helper 在 `queryService.textSearch` 的 `slice(0, topK)` 之后 emit `filter.decision` span（含被 cutoff 掉的 tail path list）。
- **P12 · Rerank provider/model 暴露**：`Reranker.getRerankModelInfo()` 返回 `{ provider, modelId } | null`，`queryService.textSearch` 在 `recordLlmRerank` 里传入。
- **P13 · Chat token usage + finishReason**：`ChatPreparationResult` 加可选 `debugRun` 字段；`prepareChatRequest` 起 run 但不 finish、把 handle 挂在结果上；`streamChat` 内包 `vercelStreamChat` yield loop 观察 `finishReason` / `usage` / assistant text 长度，收工 `mergeSummary(finishReason, totalTokens, promptTokens, completionTokens, assistantTextLength)` + `finish('completed')`；抛错走 `finish('failed')`。
- **P14 · Analyze artifact.write 接入**：`ReportOrchestrator` 加 `activeDebugRun` 字段 + `getActiveDebugRun()` / `sealActiveDebugRun()`；`generateReport` 起 run 但不 finish；`composeQuickSearchHost` 用 closure 局部 `lastOrchestrator` 记住最近一次 orchestrator，`saveAnalysisToVault` 拿它的 activeDebugRun 调 `recordAnalysisArtifact({ path, kind: 'report' })` 后 `sealActiveDebugRun('completed')`。
- **P15 · Ambient dedup 上下文**：新 `recordAmbientDedupContext` helper 打 `filter.decision` span，记录 `pushHistorySize` + `alreadyLinkedCount` metrics + 前 10 条 `pushHistoryPaths` 作为 skip decision；`AmbientPushRuntime.handleTrigger` 在 `this.ports.search.search()` 之前调用。
- **P16 · Chat 消息 debugRunId 元数据**：`ChatMessage` 加 `debugRunId?: string` 字段；`useStreamChat.createFinalAssistantMessage` 在构造时 snapshot `manager.conv.getLastDebugRunId()` 到消息上；`MessageViewItem.handleCopyDebugTrace` 优先读 `message.debugRunId`，缺省再 fallback `manager.conv.getLastDebugRunId()`。旧消息（tracing 关闭时创建）继续走 fallback。
- **P17 · Ambient/Analyze inline Copy 按钮**：`RelatedNotesPanel` header 右侧加 Bug 图标按钮（仅 debugTracePort enabled + items 非空显示），点击拿最近 ambient run；`V2ReportView` 顶部加 `ReportDebugTraceButton`（`Copy analysis trace`），点击拿最近 analyze run。
- **P18 · Harness permission.check span**：`TraceEventMap` 加 `permission_check: { loopId, stepIndex, toolName, source: 'permission'|'quarantine', decision: 'allow'|'deny', reason? }`；`AgentLoop` 在两个 gate 点（`cfg.permission.check` 和 `checkSkillQuarantine`）allow/deny 都 emit；`attachHarnessDebugTrace` 订阅 `permission_check`，映射到 `permission.check` span（父 = 当前 step span）+ decision (`deny` → `deny`, `allow` → `keep`)。
- **P19 · docs/roadmap.html**：`#done` 段最后加 Debug Trace Infrastructure 一行（用户价值 + span 覆盖面 + spec 链接）；`index.html` 只列根 HTML 文档，spec 在 superpowers 目录不需要登记。
- **P20 · Integration tests**：新增 `debug-trace-live-integration.test.ts`（3 案：harness permission_check 双分支 → allow/deny span；ambient dedup context span；analyze artifact.write + section）+ `debug-trace-search-adapter-v2.test.ts`（3 案：RRF dedup metrics；topK cutoff span drops；no-op when nothing dropped）。

**验收**：`npm run test` 185 → **187 全绿**（+2 新 test）；`npm run build` 通过。所有 11 项缺口已 landed，Debug Trace receipt 现在能对 brief §6 每一行说是 ✓。

**追加：Debug Trace P21-P25 receipt 硬信号补完**（同 2026-07-06 session 第 4 波；用户"还有没做的不"→"继续"）

再对照 brief 逐条 receipt 要求扫过一遍，本波补齐记录深度：

- **P21 · Search 4 项细化**：
  - **PPR span**：`recordPprRerank` 新 helper，`queryService.textSearch` 在 `applyPPR` 后仅当 `pprActive === true` 时 emit `ranking.score` name=`ppr` span，记 `seedDocIds` params + `seedCount` metric + 前 10 条 per-doc rank shuffle decision (`promote/keep/demote` + `rankBefore/rankAfter` meta)。
  - **per-signal boost meta**：`BoostSignalContext` 新 type 承载 `openCount / lastOpenTs / clicked / relatedToCurrent / hub / pprSeeded`；`recordRankingBoosts` 入参新增 `signalsByPath: Map<path, BoostSignalContext>`；每条 preview decision 的 meta 里加 `signals: string[]`（仅 fire 的信号 filter 展示，例如 `['click-through', 'related-to-current', 'recency', 'open-count:3']`）。queryService 里从 `signals: RankingSignals` + `clickedPaths` + `relatedPaths` 构造 per-path snapshot。
  - **already-linked 独立 decision**：`recordAlreadyLinkedDecisions` 新 helper，emit `filter.decision` name=`already-linked` span with `relatedPathCount` + `hitCount` metrics + 每条命中 `decision='promote'` + `reason='already-linked-to-current'`。空 relatedPaths 时 no-op。
  - **retriever type filter settings**：`recordRetrieverFilterSettings` 新 helper，在 `retrieverResults` 之后按 `searchSettings.includeDocumentTypes` filter true 值 emit `filter.decision` name=`retriever-settings` span with `includedDocumentTypes` params + `typeCount` metric。空 list no-op。
- **P22 · Chat 3 项补齐**：
  - **user.message first-class span**：`prepareChatRequest` 起 chat run 后立刻 emit `custom` name=`user.message` span，`setInput(raw=userContent, contentType='text/markdown')` + `attachmentCount` + `messageHistoryCount` params。
  - **profile / settings snapshot**：`streamChat` 在 `vercelStreamChat` 调用前 `debugRun.mergeSummary({ profileId, profileKind, profileBaseUrl, usePlanSystemPrompt, toolCount, toolNames, maxSteps, outputControlKeys })`。`outputControlKeys` 只 dump key list（temperature/maxTokens 等），value 不 dump 避免泄露自定义设置。
  - **ContextManager compact**：确认属于 Harness path，chat 走 `vercelStreamChat` 不经过 `runAgentLoop`，chat receipt 已经通过 `BudgetGovernor` compact summaries 覆盖 chat 侧的所有 compact 场景。Harness 独立发起的 loop 已通过 harness adapter 覆盖。
- **P23 · Ambient serendipity**：`recordAmbientSerendipity` 新 helper，filter `signals` 中含 `type='graph_neighbor' && hop===2` 的 item，emit `ranking.score` name=`serendipity` span with `hits/minDistance/maxDistance` metrics + 每条 `decision='promote'` + `reason='serendipity-2hop-bridge'` + `meta.bridge` （from `signal.via`）。`AmbientPushRuntime.handleTrigger` 在 `recordAmbientCandidates` 后调用。
- **P24 · Analyze 每 section tool 步骤**：
  - `AnalysisSectionToolUse` type 承载 `{ toolName, toolCallId, inputExcerpt, outputExcerpt, ok }`。
  - `recordAnalysisSectionGeneration` 入参新增 `toolUses?: readonly AnalysisSectionToolUse[]`，在 section span finish 前 emit 每条 `tool.call` child span (`parentSpanId = section.spanId`) with input/output/params。
  - `ReportOrchestrator.generateReport` 加 `tapToolUses(source, sink)` module-level async iterator wrapper：透传 SDKMessage 不变，同时 scan `assistant`/`user` message 的 `content` blocks 抓 `tool_use` (name/id/input) 和 `tool_result` (tool_use_id/content/is_error) 塞进 sink array；section 结束 `recordAnalysisSectionGeneration(..., toolUses: sink)`。空 sink 时不 emit 任何 child span。
- **P25 · Tests**：新增 `debug-trace-deep-coverage.test.ts`（8 案：per-signal boost meta / already-linked hit / already-linked no-op / PPR seeds+shuffle / retriever filter snapshot / retriever filter no-op / ambient serendipity hop=2 filter / analyze section tool_use children 全 parentSpanId 正确）。

**验收**：`npm run test` 187 → **188 全绿**（+1 新 test file）；`npm run build` 通过。至此对照 brief §6 逐条 receipt 要求：

| Surface | 覆盖条目 | 状态 |
|---|---|---|
| Search | 原 query / 重写 / filters / topK / weights / vector recall / fts recall / graph PPR / RRF contribution / dedup / type filter / exclude / topK cutoff / boost per-signal / already-linked / rerank provider+model / final ranking | ✅ 全覆盖 |
| Chat | user message / project&files&current / candidates before budget / kept slots / dropped slots+reason / compacted summary / final prompt shape / model+provider / profile / settings / tools / token usage / finishReason | ✅ 全覆盖 |
| Ambient Push | trigger type / current file / paragraph / candidates / filters+skip reasons / chosen or skip / dedup / already-linked / serendipity | ✅ 全覆盖 |
| Analyze | intent / sources / agent&tool steps / section plan / generated sections / saved artifact / failures+fallback | ✅ 全覆盖 |
| Redaction | 默认 redacted / raw 仍过 secret scrubber | ✅ |
| npm run test | 188/188 | ✅ |

Debug Trace Infrastructure 端到端完成、每条 receipt 项已可对应 span。

---

## 2026-07-07 · Vault Search Heading Mode + Result Graph View (T0–T8)

Spec: `docs/superpowers/specs/2026-07-07-vault-search-heading-graph-navigation.md`
Plan: `docs/superpowers/plans/2026-07-07-vault-search-heading-and-result-graph.md`

Quick Search 的两次结构性升级一次性 land：

- **Heading Mode（`#` 前缀）**：整份文档 heading 树 + 右侧 section detail pane。行显示 `12-34` 无 `L` 前缀 + match count 徽标；typing 查询 dim 非命中而非删行；箭头 / Enter / Cmd+Enter 在 tree 与 detail 双 zone 键盘全覆盖；footer 有总匹配数 + link positions（outgoing / backlink 未实现 backlink，按 spec 允许）。
- **Result Graph View**：结果集 ≤100 个 result node 的 ReactFlow 投影。community 背景 wash + 结构性 reference 边 + 可 toggle 的 semantic dashed 边 + 可 toggle 的 folder boundary + hub anchor 节点（`HubConstituentRepo` 拉出的 `hub_doc`）+ 右侧 Isolated Matches rail + sparse-fallback banner。Cmd+click hub anchor 打开 hub graph subview（pinned 到 hub constituent 结果集）；Esc 回 list view 不关闭 modal。
- **Hub Reference block**：Inspector 底部 top-5 hubs by constituent count + `+N more` expander。行只有一个主 click target 加一个 Waypoints icon 副 affordance（Cmd/Ctrl+click 或 icon 都开 hub graph subview）。选中 doc 无 hub_constituent 时整块隐藏。
- **legacy 清理**：`QuickSearchMode` 从 `all|inFile|inFolder|goToLine|heading|help` 缩到 `all|heading|help`；`Line` / `Folder` 两个 legacy parser + UI panel 全删。

Tracks 与 commits：
- T0 `afdac31c` — 缩 QuickSearchMode enum
- T1 `97c0bd54` — 删 Folder / Line stack
- T2a `b2a8329f` — Result subgraph service
- T2b `be8f4e0a` + `c9df7c09` — Heading tree service + section snippets
- T3 `479b20c9` — ResultPaneHeader list↔graph toggle
- T4 `259d318f` — Result Graph View content
- T5 `3cd56915` — Heading Mode 两 zone UI + 键盘
- T6 `c582a6d7` — Hub Reference block
- T7 `5f7ca857` — hub graph subview 双向 wire
- T8 本次 — 集成 polish + AC 交叉验证 + 边界回归对齐

**T8 polish**：
- 修 boundary 回归：把 `ResultGraphView` 的 `composeResultSubgraphDeps` 值 import 迁到 `ServiceContext.resultSubgraph` 端口，从 `@/app/**` 挪走；把 `ServiceContext` 里 `HeadingModeDeps` type import 从 `@/app/search/composeHeadingModeDeps` 迁到新 `@/core/ports/HeadingModePort`。ui→app leak 从 2 回到 1（仅 CopilotPickerContent 旧债），core→upstream 从 17→19（新 port 的 2 条 type-only 边），totalFlagged 稳定 20。同步 6 份 t11 boundary regression floor（j/k/l/m/n/o/p/q/r）从 coreUpstream 17→19。
- Inspector 联动：graph 里 single click resultDoc 现在也会更新 modal 的 `inspectorPath`（新 `onSelectForInspector` prop 从 tab-VaultSearch 一路穿到 ResultGraphView）。
- 已知 defer：edge hover tooltip（reference / semantic / hub_constituent）目前数据已挂在 `edge.data.kind`，但 ReactFlow 默认边不渲染 tooltip；后续需要一个 custom edge component 承载 `<title>`。

验证：`npm run build` 通过；`npm run test` **191/191 全绿**；`node scripts/audit/boundary-baseline.mjs` 与新 floor 一致。



---

## 2026-07-08 · Result Graph View V2（cytoscape port + preset UX + Variant A header）

Spec: `docs/superpowers/specs/2026-07-08-result-graph-view-v2-cytoscape.md`
Sandbox: `docs/research/2026-07-07-result-graph-layout/index.html`（layout playground）+ `header-variants.html`（5 个 header 布局比较）

V1 landing（07-07）后一天真机试用出的三条根子问题：

- ReactFlow 缺 native compound node，folder tree 五层嵌套硬拼太丑
- 让用户直接勾 8 个 toggle 是 graph-viz 思维，不是产品思维——需要 named modes
- `hub_constituent` 虚线在图上纯噪音，hub doc 本身就有 reference / semantic 真边

一整天走"sandbox → 定稿 → 移植"的循环：先在 standalone HTML 里 iterate 到用户满意，再一次性搬回插件。

**Sandbox 阶段（前半天）**：
- 10 张用户挑的顺眼图 → 抽出共同默认（isolated 分区 / hover 高亮 / 不隐藏 isolated，一致 10/10）
- 5 个 preset 命名（Constellation / Flow ↓ / Flow → / Folder tree / Orbit）× 每个绑一个 layout + grouping + 边默认
- 淘汰 4 个 layout：`cose` / `breadthfirst` / `grid` / `concentric-score`
- `cise` 从 preset 退到 Advanced（用户观察：hub cluster 是 grouping 不是 layout）
- 修 folder tree：只按 top-level 分组不够 → 拆完整路径 nested compound（每层 padding + 深度递减透明度）
- 修 hover：edge 全关时全 dim → 永远保留祖先 folder chain（面包屑高亮）
- 修 compound hover：整个子树高亮 + subtree 内 edges
- Hover 边动画：reference 实线静态、semantic 虚线蚁行（rAF time-based，帧率无关）
- Node label 不再 truncate：改 `width: label` + `text-wrap: wrap` 到 360 px
- Isolated grid：按 label 字典序（zh collation），查询变了排列不乱窜
- Header 出 5 个 variant 让用户挑：A 段control + toggle switch、B 描边 pill、C 两行、D underline tabs、E icon-only。用户选 **A**。

**Plugin 移植（后半天）**：
- 依赖：`cytoscape` / `cytoscape-fcose` / `cytoscape-cise` / `cytoscape-cola` / `cytoscape-dagre` + `@types/cytoscape` 一次性 `--legacy-peer-deps` 装齐（obsidian@1.11 与 codemirror 6.5 peer 冲突，绕过）
- `ResultGraphView.tsx` 500 行整体重写，xyflow 六个卫星组件（`HubAnchorNode` / `ResultDocNode` / `CommunityBackground` / `FolderBoundary` / `IsolatedMatchesRail` / `SparseFallbackBanner`）全删
- Store 换端：`graphOverlayFolder` + `graphOverlaySemantic` 两字段 → `graphPreset: GraphPreset` + `graphShowSemantic: boolean`。`setGraphPreset` 切到 orbit 自动开 semantic
- Header 走 Variant A：`GraphViewToggle`（filled/outlined）→ 竖分隔线 → `GraphPresetSegmented`（macOS 分段控件，白 pill + 微阴影）→ `SemanticToggle`（真开关，30×16 track + 12×12 圆头滑动）
- Modal 高度：真机看还是短，root cause 是 Obsidian 外层 `.modal` 是内容驱动的，我在 React root 上设 `height` 被外框卡住。改成 `useEffect` 里 `closest('.modal')` 找到外层，进 graph view 时 imperative `height = calc(100vh - 160px)`，退回时清掉
- Copy 按钮从 JSON 换成 Mermaid（LLM 友好），拷完图标变 Check 停 1.5 s

**验证**：`npm run build` 通过；`npm run test` 191/191 全绿；用户真机 confirmed 5 preset 切换、semantic overlay、folder tree、Orbit、hub subview 都 OK。

关键 commits：
- `325ab871` — plugin port（cytoscape 替换 xyflow，5 preset 生效，legacy 组件删）
- `184d93fa` — header variants 原型 HTML
- `be2499ab` — Variant A header
- `c03055d3` + `e4c0c461` — 全屏 modal 修（imperative 走 Obsidian `.modal` ancestor）
- 落文档：`2026-07-08-result-graph-view-v2-cytoscape.md`（spec + AC）

**Deferred**（V1 遗留、V2 也没做）：
- Edge hover tooltip 需要 custom cytoscape edge component（数据在 `edge.data.kind`）
- Hub anchor 显示 curator LLM 名字而非 raw `Hub-000031ae70fe`——是 hub curator 侧问题不是 viewer 侧
- Multi-select / lasso 导出子集到 Mermaid

## 2026-07-08 · Vault Search Tree view + AI Query Rewrite (Suggest)

**上下文**：Vault Search 之前只有 List / Graph。补齐 Tree view（vault 目录层级）和 AI Suggest（行为驱动的结构化 query 生成）。

### Phase A · Vault Search Tree view

- 调研 mock 三轮迭代：`docs/research/2026-07-08-tree-view-mockup/`（A compact / B score+snippet / C detailed 三个 variant → 用户砍掉 B，收敛为 **Compact（默认）+ Detailed** 两档）
- 交互模型：click folder → reveal in File Explorer · click file → 打开 · click preview snippet → jump to line · 键盘 ↑↓ 只在 file 之间跳（folder skip）
- 实现：
  - `store/vaultSearchStore.ts` — `resultView: 'tree'` + `treeDensity` + `treeCollapsedFolders` + `treeCursor`；新 search 自动清空 collapsed + cursor
  - `components/result-tree/buildTree.ts` — 平铺 `SearchResultItem[]` → 嵌套 folder/file tree · folders-first + alpha-sort 每层
  - `components/result-tree/ResultTreeView.tsx` — Compact/Detailed 双 mode 行渲染 · file-only 键盘导航 · click handler
  - `components/ResultPaneHeader.tsx` — Tree view button 从 disabled 改可点 · 新增 `TreeDensityToggle` 胶囊 pill
  - `SearchModal.tsx` — toolbar 右侧在 tree 模式下换成 `TreeDensityToggle`
  - `core/ports/VaultNavigationPort.ts` + `AppVaultNavigationAdapter.ts` — 新增 `revealFolderInFileExplorer(folderPath)` 走 Obsidian 内部 `revealInFolder` API
- Iterations 修：
  - 缩进 step 14 → 18 px + file 行加 chevron 占位符（否则子文件文本在父文件夹左侧，视觉错乱）
  - Detailed 行 heading anchor：best-effort 从 `contentRaw`/`content` 反向找最近 `#/##/###`；找不到显示 `body only`
  - HitBadge：count = 1 不显示
  - Inspector 面板 title 下方插 snippet 段（从 `VaultSearchResult` 抽出 `snippet/renderSnippetHighlights.tsx` 共享渲染）
  - Tree cursor 无条件同步到 inspector path（inspector 关的时候也同步 → 按 → 立刻显示 snippet 而非 "Select a note"）

### Phase B · AI Query Rewrite (Suggest)

- 调研 spec：`docs/research/2026-07-08-ai-query-rewrite/README.md`（含 payload schema / prompt 设计 / 37 事件全清单 / open questions / 反面清单）
- Mock：`docs/research/2026-07-08-ai-query-rewrite/index.html`（主 overlay + Behavior Context 展开 + 三态兜底 + 完整 Event Catalog 表 · 全交互 mock：X 关 / Show context 展 / Try again / 点候选自动回填 + 输入框紫色 flash）
- 关键决策：模型不 hardcode · 复用 Curator **Fast Lookup tier**（`HarnessSettings.localFastConfig` / `quick` capability） · 不新增 AI behavior role
- UI 前置修：
  - Footer 去掉 `# in-file` / `? modes` shortcut
  - Placeholder `Search in vault... (# heading, ? help)` → `Search your vault…`
  - 去掉输入框右侧 `all` mode 徽章
  - AI button 从 ghost 变紫色胶囊 `✦ Suggest` + hover tooltip "AI suggests queries based on your actions" · icon 换成官方 Lucide `Sparkles`（之前 mock 里画的五角星是错的）
  - ViewModeToggle: `Tree view` / `Graph view` → `Tree` / `Graph`
- 实现（10 个文件）：
  - `core/schemas/queryRewrite.ts` — Zod schema + 16 event kinds + payload 类型
  - `ui/view/quick-search/rewrite/BehaviorContextRecorder.ts` — 单例 sidecar · `start()` 于 modal 开、`stop()` 于关 · 订阅 sharedStore + vaultSearchStore 自动推导 12 种事件 · typed 500ms debounce · ring buffer 30 · 显式 `push()` 给 hover / openedFile
  - `ui/view/quick-search/rewrite/AIQueryRewriteService.ts` — `suggestQueries()` 主入口 · 拿 Fast Lookup 绑定 · `vercelGenerateText` 调 LLM（带 abortSignal）· 2 次重试 · Zod 验证 · fallback 走 `buildRuleBasedCandidates()` · emit `USAGE_RECORDED` 埋 `feature: 'query_rewrite'`
  - **架构教训**：一开始把两者放 `service/search/rewrite/` — 因为 import 了 Zustand store（`useVaultSearchStore` / `useSharedStore`），触发 `service→ui 4 > 0` 层级违规。10 个 boundary regression test 挂掉。修法：整个 rewrite 子模块搬到 `ui/view/quick-search/rewrite/`（rewrite 本质是 UI-facing 特性，绑定 UI state，属于 UI 层）。教训：新加 service 前 grep 一下有没有反向 import UI。
  - `templates/prompts/query-rewrite-system.md` + `query-rewrite.md` — system + user prompt · 强制 JSON only · reason 必须 grounding 在具体 behavior signal 上
  - `core/types/prompt.ts` + `core/template/TemplateRegistry.ts` — 注册 `QueryRewriteSystem` + `QueryRewrite`
  - `ui/view/quick-search/modals/AIQueryRewritePanel.tsx` — React panel: idle-empty / loading / success / fallback banner / error 五态 · 候选卡片（编号 · 紫 focus · click 回填）· Show context 展开 · Try again · 键盘 ↑↓ Enter 1-5 Esc
  - `app/ui-host/modals/AIQueryRewriteModal.ts` — `ReactModalHost` 子类 540px
  - `app/ui-host/modals/QuickSearchModal.tsx` — `onOpen` 起 recorder / `onClose` 停 · `onOpenSuggest` 回调实例化 `AIQueryRewriteModal(appContext, settings)`
  - `ui/view/quick-search/SearchModal.tsx` — Suggest button `onClick` 走 `onOpenSuggest` 回调
  - `core/providers/vercel/index.ts` — `vercelGenerateText` 加 `abortSignal` 参数（向后兼容）
- Instrumentation：
  - Tree view `FileRow` + List view `SearchResultRow` + Graph view Cytoscape node — 全部加 800 ms hover 阈值 push `focusedFile` · 点击 push `openedFile`
- 完善：
  - Rule-based fallback（LLM 挂时的 3 条兜底：active-folder / browsed-folder / recent-query AND 组合）
  - Feedback loop `recordCandidateSelection()` — 用户选哪张回填了会 emit 独立 `USAGE_RECORDED` 事件 (action = `'suggest-selected'`) 让 dashboard join
  - `UsageFeature` 加 `'query_rewrite'`
  - Cold-open 空 context 检测（无 query + 无 active file + 只有 modal.opened）→ 展示引导页而非直接烧 tokens · 用户可 "Try anyway" 强跑
  - LLM 中断：panel 卸载 / Esc 关时 abort signal 传到 provider · 识别 `AbortError` / DOMException 不重试

**验证**：`npm run build` 通过 · 端到端流程手工验证（Fast Lookup 绑 / 未绑 · 空 context · LLM 失败 → fallback · 候选点击回填）

**Deferred**：
- Zoom event 打点（需要新增 `zoomedGraph` kind）
- Historic patterns (Layer 3) — 跨 session query 历史 / click-through 高频文件
- Cost 计算：目前 emit costUsd = 0，dashboard 侧按 model catalog 解析
- AI Setup Fast Lookup 描述里加一句 "also powers ✦ Suggest"（copy）

## 2026-07-09 · File Atlas mock v2 review + graph 编辑重分类 + mock v3

**上下文**：对 `docs/gstack/file-atlas-mock-2026-07-08/index-v2.html` 做设计 review（对照 spec `docs/superpowers/specs/2026-07-08-file-atlas-design.md`），发现结构性偏差；graph 编辑功能经产品讨论后整块砍掉并重分类。

### Review 结论（详见 spec 内 "Mock Review 2026-07-09" 章节）

- **P0**：树是平列表（无折叠/嵌套）；Presets 缺失（26 个 checkbox 的 settings soup + Heading 可被过滤）；insight 无 provenance / anchor status / reliability 指示；graph 子视图长成 spec Non-goals 里的独立 graph builder
- **P1**：Inspector 50% 空置、badge 列四种语义混装、多选无统一入口、tray 无溢出计数、大搜索框角色不明、无窄容器形态
- **P2**（mock 自身 bug）：draft 图选中但画布渲染旧图、graph 搜索行文字粘连、paragraph 声称 hidden 实际显示

### Graph 编辑重分类（关键决策）

- 拆解为三个 job：圈笔记集合（真需求）/ 手动连边（影子数据反模式，关系应以 `[[link]]` 落 markdown）/ 空间排布（Obsidian Canvas 已是一等公民，不自建竞品）
- 结论：**File Atlas graph 子视图 v1 只读**（system views 1-hop/2-hop + 布局预设 + 节点 popover）；"保存笔记集合"未来走 vault-native **MOC collection note**（links 即数据，Atlas 只做只读渲染，可选导出 `.canvas`）
- 落档：spec Decision Log 新增 "Graph Subview Is Read-Only" 决策 + Ideas Reclassified 表加行 + Non-Goals 加"不自建 graph editor"；`docs/roadmap.html` backlog 登记 "Collection notes + Canvas 复用"
- 讨论存档独立成文：`docs/research/2026-07-09-collection-notes-canvas-reuse/README.md`（三 job 拆解 + MOC collection note 设计 + 升调研候选前的 5 个问题）；roadmap backlog 行改为引用该文档

### Mock v3

- `docs/gstack/file-atlas-mock-2026-07-08/index-v3.html`：真折叠树（折叠 heading 显示 count 摘要）、Preset segmented + modified dot、badge 双槽（类型 + anchor 状态点）、Inspector 补 Provenance/Anchor/Location 卡、全行 hover [+]、tray +N 溢出、graph 只读、doc bar 加 reliability chip、side-panel 窄形态切换

## 2026-07-09 · Quick Search UI Polish（评估批次 W1–W8 全交付）

**上下文**：对 quick-search 全流程 4 张截图（Tree / Graph / List+Inspector / List）做 UI/UX 综合评估。问题集中在语义表达层——分数、徽章、开关、命名把内部概念未经翻译就暴露给用户；本批次全部是 UI 表达层修正，不动 ranking / 索引 / 图布局算法本身。8 项收敛于同一份 spec `docs/superpowers/specs/2026-07-09-quick-search-ui-polish.md`。

### 交付逐项

- **W1 分数归一**：新 `src/service/search/query/scoreNormalize.ts` 纯函数，在 `queryService.textSearch` 末尾按结果集内最大 `finalScore` 归一，写入 `SearchResultItem.displayScorePercent`（0–100 int）。`VaultSearchResult` 消费此字段。原因：`finalScore = base + freqBoost + recencyBoost + graphBoost + anchorBoost + clickBoost + hubDocBoost + keywordBoost` 是加法合成，天然可 > 1，之前 `Math.round(raw * 100)` 出现 148%。pill 加 `title="Relative to the top match in this result set"` 让 hover 里能读到语义。
- **W2 Isolated grid**：`layoutIsolatedGrid()` 在工作区已实现（未提交前置代码）。Phase 0 build 通过，剩下真机 reload 目视确认无堆叠。
- **W3.1**：`ConnectedSection` 去掉 `<Check>` 图标。绿色勾"已确认"语义与百分比"置信度"数值冲突且信息重复。
- **W3.2**：**owner 明确拒绝 `+ Link` 动作按钮**——理由：从搜索 UI 直接改用户 vault 内容是首例，写错回归风险高，且 UNLINKED 本意"就地包 wiki-link"和 spec 默认方案"文末 See also 段"是两件事。终选降噪：UNLINKED 徽章去掉琥珀底、改小写 `unlinked` + muted 前景。**不写 vault**。spec 内 Delivery Log 与 Session 决策记录同步。
- **W3.3**：新 `mergeConnectedLinks.ts` 纯函数（同 target 的 out+in 合成 `both`，first-occurrence 顺序保留，contextSnippet / convergenceCount / relevanceScore 各按策略融合）。`DirectionIcon` 三态（`ArrowRight` / `ArrowLeft` / `ArrowLeftRight`）。SEM / CO-CITE / unlinked 徽章 `title` 挂描述文案。
- **W4 高亮 cap**：`SEARCH_SNIPPET_HIGHLIGHT_CAP = 4` 常量进 `constant.ts`，`capSpans(spans)` 在 `renderSnippetHighlights.tsx` 导出。`renderHighlightSpans(result, opts?)` 加 `{ cap?: boolean }` 参数——snippet 侧（List + Inspector snippet block）都传 `cap: true`，标题侧不传（Session 决策：标题命中不高亮会破坏"橙色 = 匹配证据"扫视契约）。engine 不动，只截渲染前的 spans。
- **W5 Tree 密度**：（a）文件夹计数从 row 右缘挪到紧跟文件夹名（`flex-1 min-w-0` wrap 一层，name `truncate min-w-0` + badge 直接 sibling），消除全宽 modal 下的长眼动。（b）文件行加 `IntensityDot`（拆到独立 `intensityTier.ts` 保证可单测）三档相对强度，阈值 `SEARCH_RESULT_INTENSITY_HIGH_THRESHOLD = 0.66` / `MID = 0.33` 进 `constant.ts`。
- **W6.1**：**owner 拍板保持 5 个 Graph 模式命名不变**（Constellation / Flow ↓ / Flow → / Folder tree / Orbit），零代码改动。Open Question #2 收敛。
- **W6.2 Semantic**：代码核对 `GraphEdgeType.SemanticRelated` 走 `mobius_edge` 本地读，无 LLM——tooltip 落"Uses pre-indexed embeddings — instant, no AI credits, no network."`Semantic` 文字标签本就存在（V2 迁移带入）。
- **W7 List 密度**：store 大规模改名——`treeDensity` → `resultDensity`、`TreeDensity` → `ResultDensity` type、`switchedTreeDensity` → `switchedResultDensity` event kind、`setTreeDensity` → `setResultDensity`、`TreeDensityToggle` → `ResultDensityToggle`。toolbar 上 List/Tree 都渲染此 toggle（Graph 不渲染）。`VaultSearchResult` 单行 compact 变体（title + score pill；隐藏 snippet + path breadcrumb）。**默认值从 `compact` 改为 `detailed`**——不然 List 用户一进来会莫名少 snippet + path，比 Tree 用户被迫从 detailed 退化到 compact 更 jarring。
- **W8 改名**：`SearchModal.tsx` 里 `Suggest` → `Refine`（含 `Recent Suggest` popover header）、`AI Analysis` → `AI Search`（Tab label）。`templates/config/settings.json` 4 处 prose 同步——`fastLookup.desc` (72) / `fastLookup.desc` 第二处 (115) 是 spec 显式点；顺手把 `aiAnalysis.sectionTitle` (214) / `recentLimit.desc` (225) 也改成 AI Search 保持全局命名一致。`Vault Intelligence` 与 `Generate AI Graph` 按 spec 不动。

### 测试

- `test/quick-search-score-normalize.test.ts` — 7 case（含 spec 示例 [1.48, 1.44, 0.5] → [100, 97, 34]、单元素、空集、全零、保序、finalScore→score fallback、混合 scoreless）
- `test/inspector-link-merge.test.ts` — 7 case（out+in→both、纯 out/in、跨 target 不合并、多路径混合、merge policy for context/convergence/relevance、同向 dup 不误 flip）
- `test/snippet-highlight-cap.test.ts` — 5 case（低于/等于/高于 cap、类型不加权、空输入）
- `test/result-tree-intensity.test.ts` — 12 case（三档阈值边界 66/33、null/undefined、全同分）
- 全套 `npm run test`：197/197 file 全绿；`npm run build` clean

### 验证

- `npm run build` + `npm run test` 全通过。
- Phase 0（isolated grid / 单 Hub section）待真机 reload 目视确认；其余项均已 build-safe。

### Deferred

- Open Question #1（auto-review 目录 JSON snippet 泄漏）— owner 未表态，本批次不做，待表态后视情况并入或另立 spec。
- Open Question #4（Quick Search 全量字符串外置到 `ConfigTemplateId`）— 涉及一次整体盘点，本批次接受硬编码字面量的例外。

## 2026-07-09 · File Atlas Phase 0-1（解析器 + Atlas Tree MVP 首切片）

**上下文**：按 spec `docs/superpowers/specs/2026-07-08-file-atlas-design.md` + mock v3 `docs/gstack/file-atlas-mock-2026-07-08/index-v3.html` 实现 File Atlas 第一切片。File Atlas = 当前文档的有序 block 级地图（inspect / navigate / select / handoff，不 execute）。本切片只做 Phase 0（确定性 Markdown 解析器）+ Phase 1（Atlas Tree UI），不碰 AI 生成 / insight 持久化 / provenance / anchor 重锚 / Graph 子视图 / Copilot 真实 handoff。

### Phase 0 — 解析器（core 层，框架无关）

- `src/core/document/atlas/types.ts` — `DocumentBlock` 数据模型 + `FileAtlasAnchor`（照 spec 字段：blockId / contentHash / lineStart-lineEnd / nearestHeading / ordinalInHeading / blockType / status）+ `RawBlockKind` 常量（Phase 1 只含 raw 层，无 insight/issue kind）
- `src/core/document/atlas/documentBlockParser.ts` — 确定性 Markdown → 有序 block 树。基于 remark mdast（项目既有 canonical parser，节点带 `position` 行号）+ 行级补充（callout `> [!x]` / 显示 math `$$…$$` / mermaid fence / vault-vs-external 链接分类 / embed-vs-attachment / footnote）。为什么用 remark 而非 Obsidian metadataCache：解析器要框架无关（测试 / 未来非 Obsidian host）且要有序 block 流 + 精确行范围，metadataCache 给不出有序 block 流。**链接三分**（vault / external / embed-attachment 三类不同 kind）是 spec 硬规则，测试显式守。
- `src/core/document/atlas/linkClassifier.ts` — 链接/嵌入分类（image/attachment 扩展名表、external URL 判定、domain 提取），无网络。扩展名表是结构分类数据非 i18n，按 configurability.md 留模块常量。
- 每 block 携带完整 anchor（blockId、contentHash 用 `hashString(src,32)`、lineStart/lineEnd、nearestHeading、ordinalInHeading、blockType）；本切片 status 恒 `active`，不做持久化/重锚。

### Phase 1 — Atlas Tree UI

- `src/app/commands/PeakCommandActions.ts` `openFileAtlas()` + main.ts 注册命令 **"Open File Atlas"**（id `peak-file-atlas-open`）。**挂载方式（用户拍板修正）**：File Atlas 不新开独立 modal，而是并入既有 `CopilotPickerModal` 的 **Atlas tab**（该 modal 已有 Atlas / Document Copilot / Ambient 三 tab + 顶部全路径）。命令改为 `new CopilotPickerModal(ctx, { initialTab: 'atlas' }).open()`。删除了原先短暂存在的独立 `FileAtlasModal.ts`。
- `src/ui/view/copilot/CopilotPickerContent.tsx` — Atlas tab 从旧的 `HeadingModeContainer`（仅 heading 过滤）**替换**为 `<FileAtlasPanel embedded>`。host port（reveal 行 / clipboard / notice）在此用 `useServiceContext().vaultNavigation` 构建（`revealLine` → `openVaultPathAtLine(path,{line,newLeaf:false})` 后关闭 picker；`notify` → `new Notice`）——runtime 归属仍在 app 组合的 port 上，UI 层不碰 Obsidian runtime。`ctx.content` / `ctx.file.path` 直接来自 picker 已构建的 `DocumentContext`。`CopilotPickerModal` 补传 `onClose: () => this.close()`（reveal 跳行后关 modal，沿用 heading 跳转的既有行为）。`HeadingModeContainer` 组件本身保留（`tab-VaultSearch.tsx` 仍在用）。
- `src/ui/view/file-atlas/FileAtlasPanel.tsx` — 主面板，`useReducer` 管本地 state（preset / filter kinds / collapsed set / selection / tray）。布局照 mock v3：doc-context（路径 + reliability chip + words/blocks/resources stats）/ mode-nav / 大搜索框（scope pill "document"，树内过滤 + hit 计数）/ atlas bar / 60-40 tree+inspector / tray。新增 `embedded` prop：嵌入 picker 时**隐藏自带 mode-nav**（picker 的 tab bar 已是 Atlas/Copilot/Ambient 切换器，避免双 tab bar），并从固定 modal 高度改为填满 picker body（CSS `.pkfa-embedded` 去掉 mode-nav 行 + `height:100%`）。Graph 子视图本切片 disabled，其 Tree/Graph 子切换随 mode-nav 一起隐藏，待 Graph phase 落地时再择位重挂。
- `src/ui/view/file-atlas/components/`：`AtlasTree`（真折叠、行号 gutter **只显 lineStart 单数字/34px**、type icon、name+sub、hover [+]、类型 badge、折叠 heading 显 "N blocks · N res" 摘要）、`AtlasInspector`（kind/title/sub + table/media/link/quote 特化预览 + Location 卡显**完整 lineStart–lineEnd** + Reveal/Add/Copy link）、`AtlasBar`（Preset segmented + modified dot + Filters 分组 popover，Heading 不可过滤 + expand/collapse all）、`AtlasTray`（chips 可删、>4 显 +N、Send to Copilot disabled+tooltip）。
- `src/ui/view/file-atlas/atlasTreeModel.ts` — 纯函数：可见性计算（preset kinds × search，heading 恒可见）、折叠计数摘要、heading id 收集。
- 配置（configurability.md）：`templates/config/file-atlas.json` + 类型化 fallback `src/ui/view/file-atlas/config/fileAtlasConfig.ts`（kind→label/badge/category、filter groups、5 个 preset 定义、UI strings），`ConfigTemplateId.FileAtlas` 注册。icon 组件映射（React 不能进 JSON）单列 `kindIcons.tsx`（Lucide only，无 emoji）。
- 样式（ui-design.md）：`src/styles/file-atlas.css`，mock hardcode 色值全映射到 `--pk-*` token（vault-link teal 新增 `--pk-teal*` light+dark token）；scope `.peak-file-atlas-modal.pkfa-root`，button 几何全 `!important` 防 Obsidian reset 泄漏（§4.3）；panel root 带 `peak-design-root`。

### 测试

- `test/file-atlas-parser.test.ts` — 19 case（有序提取 / 嵌套 heading / nearestHeading+ordinal / frontmatter→property+tag / task 单列 / callout-vs-quote / table 行列 / code-vs-mermaid / 显示 math / footnote / **链接三分硬规则** / 中文内容 / contentHash 稳定+编辑变化 / blockId 唯一 / 行范围 1-based / 空文件 / 纯 frontmatter / 连续同类 / stats）
- `test/file-atlas-config.test.ts` — 9 case（JSON↔fallback drift 守：kinds/presets/groups/strings 全等 + preset 引用真 kind + kind 属真 group + **Phase 1 preset 不含 insight/issue kind** + 每 kind 有 icon）

### 验证

- `npm run build` clean；`npm run test` **199/199 file 全绿**（含既有 boundary regression 全套 t11j/k/l/m/r + service-ui-boundary；core/document/atlas 零 ui/service/app import，层次干净）。tsc：新增文件全 type-clean（仓库存量 362 个 node_modules/vendored-SDK typing error 与本切片无关，esbuild build 是项目 bar）。
- 真机目视 QA：Obsidian 为 click-tier（无法在命令面板打字驱动），本切片依赖静态保证（build/test/type/boundary 绿 + §4 button 几何 `!important` 防御）；Obsidian CSS 泄漏目视确认留待用户手动 reload 后核对。

### 容器归属：并入 CopilotPicker 的 Atlas tab（spec open question #4 定案）

- 既有 `CopilotPickerModal` / `CopilotPickerContent.tsx` 已有 **Atlas / Document Copilot / Ambient** 三 tab（`SCOPE_TABS`）。Document Copilot（`composeCopilotPanelVault` / `CopilotActionRuntime`）与 Ambient（`AmbientRuntime` + `RelatedNotesPanel`）都是已落地 surface。**File Atlas 就是 Atlas tab 的新内容**，替换掉原先的 heading-filter 视图——不新开独立 modal（一开始误做成独立 modal，已改）。
- Send-to-Copilot 契约（Phase 3）：旧 heading tab 的选择结果本就走 picker 的 scope；File Atlas 的 Selection Tray 是本地 state，本切片 "Send to Copilot" 仍 disabled。Phase 3 让 tray 的选中 blocks 作为 document-scope context 路由到 picker 的 `document` tab（payload 契约待定），不在本切片硬接 picker 下游。

### Deferred

- Phase 2（insight 持久化 + provenance/anchor status UI + filter popover 的 Copilot insights/Issues 分组）、Phase 3（Send to Copilot 真实 payload）、Phase 4（Git-aware anchor 重锚 + reliability Versioned/Managed）、Graph 子视图（mode-nav 里 disabled）、窄形态适配（modal 固定桌面尺寸）。


## 2026-07-11 · Peak Composer 编辑视图 mock — 块级 AI 交互定稿

**上下文**：把在 `docs/gstack/peak-composer-editing-view-2026-07-09/ai-menu-mock.html` 里独立打磨定稿的块级 AI 交互，折进主 mock（`index.html` / `mock.js` / `mock.css`）。纯设计 mock（file:// 打开，非插件 bundle，未走 npm run build）。

### 交互定稿（两处产品决策）

- **菜单 = 单胶囊形变**：静止是轻白胶囊（✦ + 短动作 pills + 「指令」触发）；点「指令」pills 收起、同一胶囊原地展开成单行输入框（大圆角全程不变、无二级下拉、placeholder 全显、Enter 提交无发送箭头、回车用 return-icon）。拒掉了此前拥挤 chip 条 / 五层竖排命令菜单 / 胶囊再弹推荐面板几版。
- **组合建议 = 按需升级**：仅带 Copilot 主动长建议的块升级成组合卡（顶部渐变建议行 + 生成，底部胶囊/输入行）；其余块只有轻胶囊。由 `mock.js` 的 `COPILOT_SUGGESTIONS` 驱动（现挂 `导语段落` 改写建议、`AI 旁路段落` 新增建议，两条结果路径都可从主动入口演示）。
- **结果按动作性质分两路（核心决策）**：*改写类*（润色改写/改短标题/扩写原则/改 Callout 类型 + 文本块自定义指令）→ 段落**原地流式** + **渲染后按词 diff**（红删绿增就在原文上、`−N +N`、接受/还原/重试）；*新增类*（追问/表格/公式解释/链接卡/Copilot 补一段 + 一切对象块）→ 绿色「新增·生成到块下方」预览卡（接受写入/重试/丢弃），不碰原文。diff 只用于改同一段文字，新增内容不套 diff。
- 触发条件：改写需 rewrite-label + 单一可编辑正文（段落/标题/引用/callout body）；含行内公式 / `[[链接]]` / 外链 chip / 脚注 ref 的段落降级为新增卡，避免 `textContent` 抹掉渲染 span。公式微块/对象块/行内资源 popover 一律新增卡。

### 实现

- `mock.js`：重写整个 AI 子系统——`tokenize`/`diffTokens`/`renderDiff` 字级 LCS diff、`runRewrite`（原地流式+按词 diff+review bar）、`runInsert`（绿色新增预览卡）、胶囊⇄输入 `getOrCreateAiMenuFor`、`COPILOT_SUGGESTIONS`、`openAiInput`/`closeAiInput`。`showAiSuggestionCard` 保留为 dispatcher，所有旧入口（块菜单/公式微块/链接 popover/issue-pill/native 工具条/insight/ambient）自动路由到两路径。删除旧 `getOrCreateAiCard`/`toggleAiDiff`/`accept|retry|closeAiSuggestion`/`expandAiMenu`/`buildDiff`。
- `mock.css`：删旧 `.ai-menu*`/`.ai-suggestion-card`/`.diff-line` 死样式，换 `.aim`/`.aimc`/`.ai-sugg`/`.rw-review`/`.ins-card`/`.is-diffing`/`.ai-caret`；bare 胶囊 `.aimc.is-bare .aim` 恢复 pill 外壳。
- `index.html`：sprite 补 `#i-wand`/`#i-enter`/`#i-undo`。

### 验证

- Playwright headless（deviceScaleFactor:2）截 7 场景全绿、无 console error、`node --check mock.js` 通过：组合建议卡 / 胶囊→输入形变 / 原地按词 diff（`−18 +5`）/ 接受写回干净 / 新增预览卡（原文未动）/ bare 胶囊 / 公式微块独立胶囊。入库 `preview-blockai-*.png` 7 张。

### 文档

- `docs/gstack/peak-composer-editing-view-2026-07-09/README.md`：新增 `## Block AI Interaction (2026-07-11 final)` 专节记录讨论/拒掉方案/两个 open decision（组合按需 vs 永远、diff 字级 vs 整词）；刷新被取代的旧描述（V3+V2 hybrid、collapsible − / ＋ diff、real-diff not-mocked、Esc 顺序、Verification）。
- `docs/superpowers/specs/2026-07-09-peak-composer-editing-view.md`：`## AI Integration` 末补 normative 决策记录（两路结果模型、diff 只用于改写、in-place rendered word-level 为规格要求）。

### Open decisions（默认已选，可改）

- 组合面板 = 按需升级（改 `COPILOT_SUGGESTIONS` 可切永远组合 / 换挂载块）。
- diff 粒度 = 字级零依赖 LCS（整词级需引入中文分词；字级下复合词共享字会轻微碎裂）。

## 2026-07-16 · Chat Studio 完整实施（spec 2026-07-15 全量落地）

**上下文**：按 `docs/superpowers/specs/2026-07-15-chat-studio-complete-implementation-spec.md` 在同一 session 完成 Stage 0 审计 + Track A–G 全部 MUST 轨道。生产代码，非 mock。未 commit。

### Track A · Domain & persistence
- 新契约 `src/core/types/chat-studio.ts`：`ModelSelection`（auto/fixed + `normalizeModelSelection` 向后兼容）、`ExplicitContextRef`、`TurnSourceScope`/`SourceReceipt`、`TurnExecutionReceipt`、`ChatArtifactReceipt`、`ChatAssistantDefinition`、`ProjectPlanRef`、draft key helpers。
- SQLite：4 张新表（`chat_assistant` / `chat_project_plan` / `chat_turn_receipt` / `chat_artifact_receipt`）+ `chat_message` 加 `status`/`meta_json` 列（ALTER TABLE 兼容迁移）+ 4 个新 repo + SqliteStoreManager 接线。
- `ChatStore`：conversation meta_json 全字段打包/解包（顺带修复 conversationType/focusFolder/outputControl/attachment override 的既有 round-trip 丢失）、pin/archive（archived_rel_path 原地标记）、`listRecentConversationMetas`、assistant/plan/receipt 存取。
- `ChatProjectSummaryDoc`：新增用户所有的 `## Description`/`## Instructions` 分节，系统摘要（Short/Full Summary）独立 owner；`saveProject` 重写时回读保留用户分节（RUN-05）。
- `AssistantService`（`service-assistant.ts`）经 AIServiceManager 组合；`ProjectService` 加 description/instructions/plans CRUD；`ConversationService` 加 pin/archive/modelSelection/assistant/receipt 方法。
- RUN-01：`VaultRetrievalPort` + `chatToolBuilder` 真实 `vault_search` tool（SearchClient hybrid 检索，main.ts 组合适配器）；`SourceReceiptCollector` 记录实际 vault/web queries+documents。
- `ChatConversationRun` abort → `cancelled`（不再一律 failed）。
- 配置体系：`templates/config/chat-studio.json` + `chatStudioStrings.ts` + Provider/hook；新 PromptId `chat-assistant-draft` / `project-description-draft` + 模板。

### Track B · Shell & 左栏（agent）
右栏只在有 activeConversation 时挂载（SHELL-04）、splitter 键盘 4px/双击复位/宽度 localStorage 持久化、<894px 响应式折叠、左栏新 IA（New chat → Search KB → Pinned → Projects → Recent）、Quick Search 原生 handoff（后改为 `QuickSearchLauncherPort` 窄端口修复 t11p 边界守卫）、chevron/name 拆分、完整行菜单（pin/rename/move/archive/delete）、View All 标题+类型 AND picker、拖拽入项目反馈。

### Track C · Composer V2（本人）
- `composerStore`：单一 owner，`new`/`project:<id>`/`conversation:<id>` draft 隔离 + localStorage 恢复 + File attachments per-key 内存缓存 + reply anchor / revision / workflow / source switches / model+assistant overrides。
- `+`/`[[`/`/` 唯一职责：`[[` 选择同时生成 explicitRef（经 attachments 管道真实进请求）；`/` 行首触发 workflow 面板（只列真实存在的 Plan）；`@` 触发已移除（本轮不占用）。
- Sources popover：项目「始终」badge + Vault/Web 独立开关，Vault 未接线时诚实 unavailable。
- `ComposerModelSelector`：profile-qualified 搜索/分组、capability AND filter、context/output floor（unknown 不通过）、Use Auto、清筛选；`modelPickerData.ts` 纯函数层复用 modelRegistry（无第二套 catalog）。
- Auto 修复（RUN gate 2）：`useChatSession` 停止 hydrate 写回，模型持久化只走 selector → `updateConversationModelSelection`。
- Assistant picker + AI 起草 builder（draft 永不自动保存）。
- 提交链路：`TurnExecutionReceipt` 持久化（requested vs actual sources、effectiveModel、cancelled/timeout/error 状态区分）、消息级 replyTo/revisionOf 关系持久化、失败保留草稿、首发绑定 overrides 并迁移 switch 状态。
- 删除假控件：Mic、Role pills（RUN-07）；启动态 greeting+3 starters 只回填草稿（C-EMPTY）。

### Track D · 消息与产物（agent）
中央 `messageActionRegistry`（core 5 + adaptive 5 + destructive delete）、ResizeObserver 反向优先级 overflow、Trace 仅本消息 debugRunId（无 fallback，无则 disabled+原因）、Save to Vault 内联回执+Open、Copy/Copy Markdown/Copy JSON 语义分离、用户消息 Edit & resend（revision 关系）、suggested next 回填主 Composer、`MessageInlineFollowup` 删除、`ArtifactReceiptCard`（availableActions 驱动）、queued/permission 状态、默认 Assistant 无重复身份。

### Track E · 项目主页（agent）
紧凑 identity + inline stats + 项目 greeting/starters/Composer（draft 自动 scope 到 project key，首发自动建项目会话）+ 四 tabs；description 就地编辑 + AI 起草共用一个 draft、显式 Save/Cancel、系统摘要独立展示；Plans durable CRUD（conversation/vault-backed source、状态迁移、进度）。

### Track F · 右栏（agent）
Outline/Resources 双 tab；`outlineModel.ts` 纯模型（topic 分组、process/error 节点、artifact anchors）；IntersectionObserver scroll spy（ownerDocument）；Resources direction×type AND filter + 空态区分；FENCE_RE regex 推断彻底移除（receipt 驱动）；会话切换重置 selection。

### Track G · 集成
- Save to Vault → 真实 `ChatArtifactReceipt` producer（RUN-06 闭环：生成→保存→回执→右栏/项目 Resources 可恢复）。
- Header 补项目归属次级文本 + aria-live 最终标题宣告。
- 旧 sidebar outline leaf 在 Studio 打开时隐藏（消除双索引 owner）。
- `QuickSearchLauncherPort` 修复 `useServiceContext().plugin` 越界。
- 删除 `NewConversationTypePicker`；Composer DOM 同刻 1 实例（3 个互斥路由分支）。

### 验证
- `npm run test` 205/205（含 6 套新增：contracts/composer/message-actions/left-column/project-home/right-index）；`npm run build` 通过；tsc 无新增错误（既有噪声不变）；mock validate.mjs + qa-gate2 160 项通过。
- **未完成**：Obsidian 实机手测被 macOS Screen Recording 权限阻塞（待 owner 授权后补）；permission card UI 未做（runtime 无 permission 事件，做了即假控件——诚实跳过并记录）。

## 2026-07-17/18 · Chat Studio 实机视觉对齐 + 全量 review 修复 + legacy Home 移除

**上下文**：接上条实施。实机（computer-use 驱动 Obsidian，DevTools console 执行命令）逐面截图与 `docs/gstack/chat-studio-interactive-2026-07-13/` mock 复刻对比、修视觉偏差；随后对整个未提交 changeset 做三区并行 code review 并修高危项；最后按 owner 要求删掉 legacy Home。全程未 commit，HEAD 仍 `b3c925bb`。

### 实机视觉对齐（~40 项偏差，全部 匹配/接近）
- 左栏：New chat / Search 从"控件盒"回归 mock 导航行（新增 `NavRow.tsx` 原子防三列漂移）、时间戳 hover 换 ⋯ 菜单、section 头统一 uppercase+count、去 PROJECTS 级折叠。
- 右栏 Conversation Index：删标题行 → topline=搜索+收起、分组头可折叠、条目两行、footer count、Resources 空态文案与 type 筛选下拉修复、收起/恢复经 Header PanelRight 闭环。
- Composer：输入字体 mono→sans 13px（`codemirror.css` `!important`）、发送圆钮常驻禁用态、模型选择器 anatomy（Use Auto/筛选收起/能力标签/分组）、`/`+`[[` 选中态浅色、消息级模型 chip 短名+短时间。
- 消息区：宽窗动作自适应内联（config 值被误当每按钮宽度，480→92）、孤儿 More 展开器移除、More 菜单两行条目+红色 Delete、**暗色代码块白底修复**（streamdown shadow host 补 `:host-context(.theme-dark)` HSL 映射）。
- 项目主页/起始态：**蓝色 CTA 根因**=shadcn `Button variant=default` 消费 Minimal 主题蓝 token → 换 primitives 紫色 primary；PROJECT eyebrow+avatar+去斜体描述+stats 竖线分隔、greeting 黑粗大字、starters 移到 composer 后带 icon pill、**tabs 紫色下划线**（`obsidian-reset.css` 的 `button::after` halo-kill 吃掉 → `content:'' !important`）。
- Shell/响应式：popout 收养 vs mount-time ResizeObserver/Radix Portal 绑错 document 的**同一根因家族**——ReactRenderer doc-keyed remount + `onResize` 重渲染修复；实测拖窗实时跟随、<894 折叠/恢复、View all 弹窗（原语级：Radix `data-state="open"` vs CSS 等 `data-open` + shell 缺定位，此前从未显示成功）。
- ui-design.md §2.4 登记 5 个新 pk-btn modifier（pkchat-starter / projhero__action / projdesc-btn / projdesc-ai / projsection__action）。

### 全量 review 修复（三区并行审计 → opus 修复）
- **HIGH（数据损坏）**：新会话首发绑定固定模型时 `updateConversationModelSelection` 缺 `legacyProvider`，`activeProvider` 列被写成 profile id → 该会话后续模型/provider 解析全坏。`useInputSubmit.ts` 补传，`providerKindForProfile` 提为 `modelPickerData.ts` 共享导出（Composer 去重）。
- 非响应式 strings：`MessageViewItem`/`DateSeparator`/`ToolCallSummary` 模块级缓存改回 `useChatStudioStrings()` hook。
- popout confirm：`ProjectsSection` 删除确认从 module `document` 改 `ownerDocument.defaultView`（否则弹主窗口）。
- receipt 诚实：`web_search` 只记 query → 从回答引用 URL 提取 source 进 `TurnExecutionReceipt`（provider 无结构化 source，`extractWebSourcesFromText` + 约束注释 + 新测试）。
- RUN-05 闭环：项目 `## Instructions` 用户分节此前从未进 prompt → `ConvSummarySlot` + `context-memory.md` 三个 Handlebars `{{#if}}` 条件块接通（用户 Description/Instructions vs 系统 Summary 分离，压缩档保留指令）。
- abort 判定：`ChatConversationRun` regex `/abort|cancelled/` 误判 provider 错误为用户取消 → 改结构化信号（`AbortError` name 优先，regex 仅 `\baborted\b` 兜底）。
- 硬编码文案清零：Plans 菜单/NewPlanModal、ArtifactReceiptCard、AssistantBuilderModal、shell drawer/splitter/aria label 全迁 `chat-studio.json`（新增 `shell`/`assistantBuilder`/`projectPlans`/`artifactReceipt` group + `leftColumn` aria key）。
- LOW：死 `'@'` 分支删除、`ChatProject` unused-import hack 删除、注释与代码对齐、`VAULT_SEARCH_TOP_K` → `core/constant.ts`。
- 审计确认干净：SQLite DDL 幂等迁移（旧库安全）、popout remount 无泄漏、CSS token/scoping/!important 无重复无死选择器、config↔TS↔组件三方一致。

### Legacy Home 移除（owner 要求"直接用新的"）
- 删 `view-Home.tsx`；`ViewMode.HOME`/`setHome`/`openChatHome`（port+实现）全链路清零（grep 零残留）。
- 初始态与 `reset()` 均落 `STANDALONE_CONVERSATION` + 默认 pending new-chat（`DEFAULT_PENDING_NEW_CHAT`）→ 打开 Chat Studio 直接是 greeting+Composer+starters 起始态；`setPendingConversation(null)` 死角回落默认态；`viewMode` 类型收窄非空。

### 验证
- `npm run build` 通过；`npm run test` 205/205；实机确认新开 Chat Studio 直落新 start state（无 legacy 2×2 卡片）。
- **有意 defer**：raw `<button>` 面式替换、ViewAllPicker 内联样式、CSS 双 scoping 写法统一（外观债）、Instructions 的 UI 编辑入口（数据路径已通，编辑器是产品决策）、permission card（同上）。

## 2026-07-18 · 全插件一致性专项(字体/颜色/token 治理)+ 规则入册

**上下文**:owner 反馈"字体还是怪、一直存在"并要求全界面一致性 review + 修复 + 规则落 docs。三个 sonnet 并行审计(CSS 层/TSX token 绕过/排版逃逸口)→ 四个 opus 修复批次(文件集互不相交)→ 实机截图回归(含暗色)。全程未 commit,HEAD 仍 `b3c925bb`。

### 根因级修复(字体"一直怪"的最终解释链)
- **root pin 被级联反杀**:`tailwind.css` 自己的 `.pktw-root { font-family: var(--font-interface) }`(pre-token 时代遗留)在 bundle 中排在 obsidian-reset root pin 之后、同优先级后者胜——前一天的 pin 实际全程无效。删除该声明,root typography 单一真源收敛 obsidian-reset.css;bundle 级 grep 验证 `--font-interface` 仅剩 `.peak-serendipity-hint`(编辑器 gutter,故意)。
- **死 @import**:`tailwind.css` 中段的 `@import codemirror.css` 位置非法被静默忽略(= 当初 orphan 的根因),删除;顶部 import 列表是唯一闸门,规则入册 §2.6。
- **消息正文排版契约断裂**:streamdown shadow `:host` 显式 `--font-interface + 1rem` 拦断继承 → chat 正文/reasoning/insights/V2 报告等 6 个消费面全部 16px 界面字体。删 font-size、font-family 改 inherit,`.pkchat-msg__body` 的 `--pk-text-lg-plus`(14.5px)+ root pin 立即接管全部消费面。

### 审计发现 → 修复批次(HIGH/MED 全清)
- **批次1(机械字号)**:`pktw-text-[Npx]` 同值 447 处 → `pktw-text-pk-*` token 类(99 文件,零视觉变化);config 补 `pk-md-plus`/`pk-lg-plus`;离阶值(8/9/10.5/11.5/12.5/17/18/22)122 处登记豁免不动;ResultTreeView 暗色 accent 硬编码修复。
- **批次2(逃逸口)**:ReactRenderer 源头双 class(`pktw-root`+`peak-design-root`,8 个受影响面尽职调查零误伤,顺带修好 ViewAllPicker 无样式 input);4 个零 scope 裸 Modal 补 `pktw-root`+token 兜底;MorningBriefingModal 迁 ReactRenderer;WikilinkHoverCard/Mermaid 全屏 portal 归轨 `portalHostForDocument`(popout 安全);injectBasesButton 双上下文变量修复。
- **批次3(CSS 层)**:mermaid `g.thinking/.verified/...` 裸全局选择器(带 !important 泄漏全 vault)加 `[data-streamdown-root]` 限定;dashboard-charts `:where()` 特异性塌陷(§4.5 已知陷阱复发,分页/KPI 按钮生产塌陷)改 `:is()` + 删被遮蔽死 `.pk-btn` 家族;幽灵 token `--pk-text-on-accent`/`--pk-motion-base` 清零(→ `--pk-accent-fg`/`--pk-transition-*`);27 处错误兜底值删除;codemirror 蓝紫系 → `--pk-info`/新增 `--pk-accent-secondary`;tailwind.css 死 CSS 332 行删除。
- **批次4(语义色+静态样式)**:裸调色板类 217 处 → 语义 token 类(red→error/green→success/amber→warning/blue→info/purple→accent/gray→foreground 族,暗色自动翻转=本批核心收益);裸 `[var(--pk-*)]` 类 91 处语义化;静态 inline style 全量转类(动态值保留);FieldRow 三胞胎提取共享组件;ContextMenu portal 改 `usePortalContainer()`;peak-components 例外登记表补齐;6 处 streamdown wrapper `pktw-text-sm`(原生 14px)→ `pktw-text-pk-lg`(同值显式化)。追加:HealthScoreEngine `scoreColorClass` 语义化。

### 实机回归(computer-use 截图逐面看)
- 亮色:消息正文 14.5px 密度对比明显、composer 实打字 sans、View all 输入框边框回归、Settings 全 tab(双 class 全量启用零误伤)、Quick Search、FieldRow 网格——全部通过。
- 暗色:`app.changeTheme('obsidian')` 切换(原值 `system` 已还原)→ **全面正确翻转**。过程发现 computer-use MCP 截图对 popout 端陈旧帧(computedStyle 已暗、截图死活亮),原生 `screencapture` 对质定案;教训存 memory。
- 未及:dashboard 分页按钮(History 无数据)、wikilink hover 卡触发条件(代码级已验,实机待下轮)。

### 规则入册(docs/conventions/ui-design.md,9 处)
§1.2 字号 token 类唯一性 + `pktw-text-sm`≠token 命名陷阱;§1.3 禁裸调色板/bracket-var/幽灵兜底 + Obsidian 兜底习语边界;§1.4 离阶豁免登记表;§1.5 例外表 +4 行;§1.6 streamdown"颜色独立、排版继承"契约;§2.6 @import 闸门 + bundle 为证;§4.1 root pin 单一声明纪律 + 当日复发回归档;§4.5 `:where()` 复发实例;§4.7 scope-class 契约表 + portal 铁律。

### 验证
- `npm run build` ✅;`npm run test` 205/205 ✅;终验 grep 六项全绿(interface-font 竞争者 0、调色板残留 0、同值任意字号 0、mermaid 泄漏 0、幽灵 token 0)。
- tsc 既有噪声不变(审计确认 4 处 pre-existing 类型错误在未触碰行)。tree:193 M + 3 D + 36 ??,零 commit,owner 自审后提交。

## 2026-07-19 · Chat Studio UI 全组件收口 + 生产组件画廊

**上下文**：owner 要求把 Chat Studio 尚未完成的 UI 一次性收口，并允许用 mock 数据反复查看所有消息组件。实现的是生产组件驱动的 QA 会话，不是另建一套 HTML 样式，也不把 mock receipt 冒充成真实媒体生成能力。全程未 commit，并保留原有 dirty worktree。

### 生产组件画廊

- 新命令 `Peak Assistant: Chat Studio: Rebuild Component Gallery`：精确清理上一次带 `peak.chat-studio.component-gallery.v1` 标签的画廊，重建 `[QA] Chat Studio Component Gallery` 并打开 Chat Studio；不调用付费模型。
- 同一会话覆盖用户附件、Markdown 表格、TypeScript / JSON / Bash、公式、Mermaid、Reasoning、Agent Run、五层 Diagnostic Trace、completed / failed / cancelled message，以及 image / video / audio / table / code / diagram / Base / document receipts 的 ready / saved / generating / needs-permission / failed 状态。
- fixture 采用 `Rich → Agent → Media → States → Rich` 的非连续重复 topic，专门验证 Outline 严格倒序和“只聚合连续消息”；Resources 同时覆盖 Referenced / Generated、Audio / Music 与 Video。

### 根因修复

- `chat_message.topic` 与 `toolCalls` 原先未完整 round-trip，导致 reload 后 Outline 分组与 Agent Run 丢失；SQLite repo 现在持久化 topic 和 toolCalls，Vault ChatStore 从 `meta_json` 恢复工具调用。
- 移除只弹 Notice、没有真实删除链路的假 Delete message action。
- Streamdown 的 Shiki token 选择受系统 `prefers-color-scheme` 影响：在亮色 macOS + 深色 code shell 下会取 GitHub Light token，造成深字黑底。shadow host 明确消费 `--shiki-dark`，并保留 Settings 中五套主题即时切换。
- 消息附件和 Composer 引用统一只显示 `displayName / basename`；完整路径仅保留在内部 source 和 hover help。Composer wikilink 破坏或删除时，配对 context shelf 同步移除。
- Resources 增加 audio / video 独立 kind 与筛选；ready 的音视频 receipt 即使没有可播放 URI，也有诚实的 media placeholder。
- `ChatResourceRef` 增加视觉用 `previewUri`；消息图片与 hover 优先使用已解析 preview，不再探测不存在的 mock Vault 路径。

### 文档与实机验证

- 新增 `docs/testing/chat-studio-component-gallery.md`，并从 `11-feature-chat-studio-ui-ux.html` 与能力测试清单双向链接；清单补画廊启动、audio/video Resources 和代码主题验收。
- Obsidian 1.12.7 popout 实测：22 个 Outline items 严格按新到旧；18 个 Resources（Referenced / Generated 各 9）；`[[` 菜单位于 Composer 上方且键盘高亮可见；选择后正文与 shelf 只显示短文件名，编辑链接后 shelf 立即消失；验收草稿已清空。
- 实测 Settings → Peak Assistant → Advanced → Message appearance 存在 GitHub Dark / One Dark Pro / Nord / Dracula / Vitesse Dark；画廊代码、表格、公式、Mermaid、Agent Run、Diagnostic Trace 和媒体 receipts 均在真实组件中渲染。
- 整窗 `Reload app without saving` 暴露并修复 `UserProfileService.init()` 的 Vault 缓存 / 文件系统竞态：已有文件在缓存尚不可见时 `create()` 抛 `File already exists`，现在把该精确竞态视为幂等成功，其他错误仍上抛；新增 `user-profile-init-race` 正反测试。完整重启后插件正常注册命令，不重建 fixture 直接打开旧画廊，Outline topic 与 Agent Run 均从持久化数据恢复。

### 验证

- 定向测试：11 个 Chat Studio / code-theme 测试全部通过；新增 `user-profile-init-race` 通过。
- `npm run test`：211 / 211 通过；`npm run build` 与 bundle syntax check 通过。仅有 Browserslist 数据过期提示，不影响构建。

## 2026-07-21 · Chat Runtime 与生成能力闭环(handoff 2026-07-20 全量交付)

**上下文**:按 `docs/superpowers/plans/2026-07-20-chat-runtime-capability-closure-claude-handoff.md` 在同一 session 完成 Stage 0 只读差距审计 + Track A–E 全部实施。subagent-driven 流程:11 个任务逐个 opus 实施 → sonnet review → 修复回环(8 轮 fix,3 个 Critical),终审 opus 全分支 review 判定 Ready to merge。**未 commit**,HEAD 仍 `726f494a`;并行 session 的 composer-sidecar docs 改动原样保留。交付细节全文见 `docs/superpowers/plans/2026-07-21-chat-runtime-capability-closure-delivery.md`。

### Track A · Runtime 统一
- characterization tests(8)锁旧行为 → `AgentLoop` 升级 `streamText` 流式引擎(`onStreamEvent` 单订阅点 + permission-ask 地基,8 个既有 harness 测试零弱化)→ `ConversationService.streamChat()` 迁到唯一 Harness 运行时(`harnessChatRunner.ts` 事件翻译层,Vercel tool loop 退役)。
- run id 贯通(RunEnvelope=AgentLoop=trace=TurnExecutionReceipt.runId,修复从未填写的旧 bug);修复 `useStreamChat` 吞 error 事件、abortSignal 未传 fetch;迁移中发现并修复 outputControl 六参数丢失回归。maxSteps/预算迁 `templates/config/chat-runtime.json`。

### Track B · Tools / MCP / Assistant
- `ToolAvailability` 纯数据层(规格类型逐字段);web 假路由修正(catalog metadata 不再抑制 fallback,native 判定单点接口);MCP 工具经 `getAllMcpToolDefs` 进 Chat + PermissionGuard ask + `PermissionAskCard` 双向挂起(允许/拒绝真实生效,abort 不泄漏)。
- Assistant 四字段生效:`AssistantSlot`(priority 900)/knowledgeRefs→`explicitRefsUsed` receipt/toolPolicy deny-first 双层(过滤+guard)/模型三级 precedence + effectiveModel 入 receipt。

### Track C · 媒体地基与路由
- media domain types(MediaKind 四值,TTS≠music)+ `chat_media_job` 状态机表 + `MediaGenerationService`(唯一入口/唯一 writer/真实 receipt producer)+ FalMediaAdapter 全部硬编码迁 `templates/config/media-generation.json`。
- OpenAI native image adapter(真实 `POST /v1/images/generations`,只声称 image;quantity 穿透;gpt-image-1 response_format 兼容开关)+ Auto 路由(preflight 一次性决策,执行期断言 route 一致,绝不静默换计费方)。

### Track D · Chat 媒体闭环
- `media_generate` ToolDef(availability 门控 + permission ask + Zod schema);image 同步生成 → 消息锚定 receipt → gallery/Resources(渲染时 `VaultPreviewPort.getResourcePath` 解析,持久层存 durable vault path);Composer `+` Generate 表单(route/model/数量/比例/preflight 预估费用/per-route 禁用)。
- video/music durable async job:`MediaJobRunner`(app 层,可注入 clock)——awaiting-confirmation → 成本确认卡(真实 route/model/时长/费用)→ poll → 完成/失败/取消;boot resume **先于** failAllUnfinished;跨重启 receiptId 持久化(review 抓到的 Critical)。

### Track E · Settings 与收口
- Settings 新 Media Generation tab(默认 route/fal key/输出目录/逐 kind preset/Native 矩阵只声称 image/route×kind 可用性表/Validate 纯本地校验);configureAction 四值真实跳转(receipt Configure 按钮 + Composer 菜单)。
- waiting-permission 可见、§5.6 五行错误文案 config 化、legacy 兼容矩阵测试(旧消息行/旧 receipt/空 data.json/旧命令)、capability checklist 状态迁移(inline 生图 AVAILABLE 待实机验收;video/music PARTIAL——MEDIA-03 门槛恢复原文,Usage Dashboard 记录与音乐授权说明未做;新增 MEDIA-04 九步实机验收清单)。

### 验证
- `npm run test` 239/239(独立复跑,新增 ≈25 测试文件);§8 指定 targeted 4/4;`npm run build` 绿。
- 实机 Obsidian 1.12.7(computer-use 被 macOS 设置面板崩溃阻塞,改 osascript+screencapture 路线):reload 正常 boot;`+` 菜单三生成入口缺 key 诚实禁用(逐路由原因);Media Generation tab 五段全渲染;Validate 时间戳跨重启保留;真实 turn 走统一运行时(流式+Agent Run 真实 steps+无工具时诚实拒绝)。实机发现 2 个表格显示缺陷(fal Reason 空/fal-tts 误标 unsupported)修复并二次实机确认。
- **未完成(精确阻塞)**:fal/native 真实付费生成、OpenAI CORS、lyria2/veo3 endpoint 实测——均无 key/额度;`approval:'always'` read 工具仍 auto-allow(known gap);12 项 accepted Minor 见终审记录。

## 2026-07-21（追补）· video/music 完整化(MEDIA-03 清账)

**上下文**:owner 要求 video/music 完整实现,并叫停 superpowers 子代理流程改为直接实施。fal endpoint 经 WebSearch 对照官方文档核实(报告落库 `docs/research/2026-07-21-fal-endpoint-verification/README.md`),schema/config 修正由并行 session 按 brief 应用,本 session 补齐断链与门槛项。

- **fal schema 修正(CRITICAL×3)**:video `fal-ai/veo3/text-to-video`(已被 fal 废弃)→ `fal-ai/veo3.1` + `fast` preset;payload `duration_seconds:int` → `duration:"4s"/"6s"/"8s"` 枚举串;TTS 字段 `text`→`prompt`;music 删除 lyria2 不接受的 duration 字段(输出固定 ~30s,上限 30、表单显示固定说明);成本表按官方定价校准(video $3.20/8s、fast $1.20、music $0.10、image ~$0.0023)。两处旧值测试断言同步(video max 30→8)。
- **Usage Dashboard 打点闭环**:发现组合根只 import 未构造 emitter 的断链——`composeMediaRuntime` 补 `MediaUsageEmitter` 闭包(dispatch `UsageRecordedViewEvent`,feature `media_generation`,`costUsd`=预估 + `metadata.costConfidence='estimated'` 不伪装账单),注入 service(sync image/TTS/cover)与 runner(async video/music);新增 4 个测试 slice(成功/失败/emitter 抛错不影响生成/async 完成记 1 条)。
- **音乐授权说明**:Settings → Media Generation → Music 段 licensing note(fal ToS 不担保版权、SynthID 水印、平台与 EU AI Act 披露、USCO 口径、TTS 条款独立)+ fal ToS 链接;文案 config 化(settings.json `musicLicensing*` 4 键 + settingsStrings 类型)。
- **状态迁移**:checklist MEDIA-03 六项全勾(逐项证据);视频/音乐 `PARTIAL` → `AVAILABLE`(待实机验收);handoff §0 三行、roadmap 行、交付报告 §6 追补同步。
- **验证**:`npm run test` 239/239;`npm run build` 绿。剩余唯一边界:真实付费调用待 fal key(MEDIA-04 实机步骤)。

## 2026-07-23 · 启动 OOM 白屏根治 + AI-Analysis 存储切 JSON

**上下文**:owner 的 Obsidian 陷入"打开即白屏"崩溃循环(渲染进程 cppgc OOM,SIGABRT)。一整天的系统性排查(落盘 RSS 采样、CDP 外部探针、memory-infra dump、纯 Node bundle 求值测量、STUB_PKGS build 二分、素净配置对照、vault 文件夹二分)逐一枪毙了十几个候选理论(morning brief / briefing SQL / sqlite 原生内存 / WAL / vault 大二进制 / 反链面板 / 主题字体插件…),最终 owner 直觉"是我们的某个产物"命中,文件夹二分坐实。全记录见 `docs/recurring-pitfalls.md` §9。

### 根因(三层叠加过天花板)
- **主犯**:`ChatFolder/AI-Analysis/` 下 1139 个机器生成 `.md` 搜索报告(34MB 文本、2.2 万 wikilink、占全库 md 三分之一),Obsidian **每次启动**为它们重建内存态元数据/链接模型 → 2.0-2.9GB blink_gc 瞬时洪峰(60× 放大);缓存热启动无效、关反链面板无效——是核心索引本身的成本。
- **叠加**:Peak bundle 求值 ~500MB(22MB 主包)+ Excalidraw 图片缓存,落在洪峰窗口内。
- **环境**:整机换页灾难(swap 10.9/12GB 满)压低渲染进程有效天花板;崩溃 → 元数据缓存不落盘 → 下次全量重建 → 再崩,自锁环。

### 修复
- **两段式加载**:esbuild 入口换 `entry.ts` 壳(插件加载态 496→233MB RSS / 堆 258→50MB),真身 `main.ts` 在 layout-ready 后 RSS<1.7GB(或 120s 兜底)时动态 import,`addChild` 走 Component 生命周期。
- **懒加载 facade**:`StreamdownIsolated`(shiki/mermaid/katex)、`AtlasGraphCanvas`(cytoscape)拆 Impl + 首渲染时 import。
- **启动重活 gate**:reconcile / graph maintenance / proactive background / vault 事件监听挪 layout-ready / Brandes 节点数守卫,共五处。
- **存储根治(JSONL spec 第一块切片提前落地)**:新 `AiAnalysisJsonStore`(record `{formatVersion,savedAt,query,webEnabled,title?,snapshot}`),自动保存写 `ChatFolder/DataStore/ai-analysis/*.json`(非 .md = Obsidian 零索引成本);Recent 列表/回放走 `resolveAnalysisSnapshotFromVault` 双路(.json + legacy .md);Markdown 降级为显式 "Export analysis as Markdown note"。
- **存量迁移**:`scripts/migrate-ai-analysis.mjs` 1139/1139 零失败迁 JSON;`scripts/migrate-ai-analysis-index.mjs` 把 chat.sqlite `ai_analysis_record` 869 行改指 .json + 270 个未入索引早期报告补插 = 1139 全量可见。原始 .md 备份在 `/Users/zhangjike/Downloads/AI-Analysis-legacy-md-backup/`。
- **诊断工具沉淀**:`scripts/measure-eval-mem.mjs`(纯 Node 测 bundle 求值内存)、`BUNDLE_METAFILE`/`BUNDLE_KEEPNAMES`/`STUB_PKGS` build 开关。

### 验证
- 全原始配置(Peak+Excalidraw+Minimal+反链面板)启动峰值 1219MB、稳定 992MB,不再崩。
- 真机 CDP 驱动:Recent 列表呈现迁移记录,点击回放完整渲染快照(摘要块/Sources/usage);`npm run build` 绿 + 新增 `test/search-docs/AiAnalysisJsonStore.test.ts` + 20+ 相关测试全过。
- 踩坑记录:Obsidian Modal 开在 activeWindow——有 popout 窗口时模态开进 popout,主窗口查不到;CDP 验证要遍历所有 page target。

### 遗留
- main.ts / AmbientPushRuntime 的临时 `[MEM]` 埋点稳定几天后移除;MAX_STRUCTURAL_ANALYSIS_NODES 守卫数值待改准;被 gate 的启动索引路径需按 JSONL spec 的有界化方案逐步恢复;机器 swap 满建议重启。

## 2026-07-23（下午）· File Atlas Inspector/Tree 打磨 + Copilot 命令下线

**上下文**:owner 逐张截图反馈 File Atlas 的 inspector / tree 细节，一轮轮迭代打磨；均为局部 UI + 一处解析器行为，无新里程碑（不动 roadmap）。

### Copilot 命令下线（保留实现）
- 移除 `Open Copilot` palette 命令：gateway binding + `COPILOT_OPEN_MANIFEST` + `PALETTE_COMMAND_MANIFESTS` key + main.ts 接线 + 死代码 `Register.ts` 条目 + wire-in 测试同步。排查确认用户入口只有此命令（ribbon 开的是 Chat）；`CopilotPickerModal/Content`、ports、runtime、`openCopilotPanel()` 函数本体全部保留，日后可直接把 binding 加回。`⌘⇧O` 是 Obsidian 用户级配置，命令消失即失效。（其后 owner/linter 进一步把 Copilot 从 palette 彻底移除并新增 `Open File Atlas` 命令。）

### Inspector — 关键字统计
- heading 也出关键字卡：新增 `atlasTreeModel.sectionText(node)` 聚合整个 section 正文（heading 单行无词频信号），`AtlasInspector` 对 heading 用它算 `keywordsOf`。
- chip 按词频缩放：`--kw-w = count/max`（线性，0.12 保底），CSS 用 `calc()` 驱动字号/内边距（padding 撑大、不固定高度，行不参差），字号 11→20px；计数徽标改实心 accent + `--pk-accent-fg`（对比度）。

### Inspector — 逐类型预览审计
- 去重复标题：`TITLE_IS_LABEL` 白名单——只有 title 是真名字（heading/frontmatter/link/image/embed/attachment）才显示标题；list/paragraph/quote/property/tag 等的"首行标题"隐藏，直接看预览。
- 去重复副标题：`SUB_IS_INFORMATIVE` 白名单——只有携带计数/状态/类型的 sub 才显示（Frontmatter/List/Task/Code/Table/Callout）；`Body paragraph`/`Blockquote`/`Vault link` 等类型复述 sub 隐藏。
- 真实渲染：`RENDERED_KINDS` 扩到 Paragraph/List/Task/Quote/Callout/Code（+Math/Mermaid）走 `StreamdownIsolated`，`**粗体**`/项目符号/复选框/代码高亮正常；新增 `dedent()` 防嵌套缩进被当代码块；Footnote 刻意回落 mono（无引用的独立脚注定义 Streamdown 会渲染空）。取舍：为满足"要渲染"打开了此前因 OOM 史谨慎关闭的散文渲染，单块按需挂载、开销有界，可回退。
- 链接可点击：port 加 `openLink(target, sourcePath, external)`（vault → `workspace.openLinkText` 相对解析 `note#heading`；external → `vaultNavigation.openExternalUrl`）；链接卡从 `<div>` 改 `<Button>`，hover 高亮 + tooltip；mockHost 补桩。

### Tree — 光标定位 + 图布局补齐
- 按光标展开：port 加 `getCursorLine(path)`（编辑器光标行，0-based→1-based 对齐 anchor，modal 前台仍可读）；`atlasTreeModel.blockIdAtLine` 递归找包含该行的最深块；`FileAtlasPanel` reseed 用「光标块 ?? 第一个标题」，`defaultCollapsedIds` 展开其祖先路径。修根因：原来固定 `firstSelectableId`（永远第一个标题）。
- Graph 布局补齐到与 Vault Search 一致：`FileAtlasGraph.LAYOUTS` 增 `flow-lr`(Flow →) + `folder`(Folder tree)，`flow-tb` 改标签 "Flow ↓"。共享画布 `AtlasGraphCanvasImpl` 本就实现全 5 preset，且 File Atlas 图是文档邻域 note 图（节点带 path/folder），folder 分组有意义。

### Parser — 纯链接段落塌缩
- `documentBlockParser` 新增 `isResourceOnly(raw)`（剥掉 embed/wikilink/图片/md 链接/裸 URL/tag 后无字母数字残留即判定）；段落若为纯资源且抽出资源块 → 只返回资源块、丢空壳段落；带正文的链接段落照旧保留。修 owner 截图行 9 的「Body paragraph `[[…]]` + vault link」重复。
- 测试:`test/file-atlas-parser.test.ts` 加断言（纯链接行不产段落、带正文行保留）；`file-atlas-parser` + `command-gateway-wire-in` 全绿，`npm run build` 绿。

### 状态
- 全部改动**未 commit**。File Atlas inspector/tree/parser + Copilot 命令下线。

## 2026-07-27 · Peak Composer production closure checkpoint

**结论**：13/13 Composer implementation tracks 已集成；T1 / T2 / T3 /
T6 与自动化 fixture / geometry gate 已完成。owner 指出首轮“视觉通过”判断
错误后，Composer shell 已再次按设计稿结构纠偏，并在真实 Obsidian 中完成
宽屏、窄屏抽屉、关闭/重开与宿主边界截图回归。该证据**不等于最终视觉验收
PASS**：owner-involved QA#2 仍未完成，Brief 的 related refresh 真机仍为 0，
且当前没有 production finding producer / Ambient-backed Brief 数据。整体继续
诚实标为 `PARTIAL`。旧路径删除门结论仍是 `NO-GO`，没有用删功能换“完成度”。

### 已完成

- `9f489bb0`：提交已审计的 WP-INT 集成工作树。
- `e2a75806`：新增 Composer architecture/source guard，锁住 app-owned
  runtime、provider/source boundary、no presentation dispatch，以及 Chat
  Composer / CodeMirror protected scope。
- `0a69459c`：建立 96 Requirement ID traceability 与 final implementation
  note；生产数据链路复审后更正为 `61 COMPLETE / 35 PARTIAL`。
- `2b68e34e`：首轮 sidecar 视觉修复；其后的
  `84b71f78` / `61900c17` / `499eb7a7` 撤销过早视觉结论并完成第二轮结构、
  responsive sidecar、Brief 诚实空态与 canonical Button 纠偏。
- 五个设计 fixture `5/5`，geometry `49/49`。真实 Obsidian 截图位于
  `.dev/harness/shots/design-regression-2026-07-27-correction/`，覆盖原生左右
  侧栏保留、宽屏固定列、窄屏抽屉开/关、关闭后正文回流与重新打开。
- 先前的 `PASS_WITH_NONBLOCKING_DIFFERENCES` 已撤销；当前只能判定为
  “设计结构纠偏已验证，最终视觉验收仍为 PARTIAL”。
- 真机安全子集通过：reload/entry、三种 display state、Copilot/History、
  selection toolbar、source-once、History empty state；QA 后恢复 owner 原左右
  侧栏。
- Brief 没有伪造 finding / related / unplaced 计数。真机点击“更新相关材料”
  后仍为空；这被记录为真实数据链路缺口，不用占位数据掩盖。

### T6 parity / deletion gate

三个候选均因活跃生产 caller 或生命周期不等价判定 `NO-GO`：

1. legacy Copilot 28-action provider dispatch；
2. `actionResultToArtifacts()` modal/content pipeline；
3. `ReviewPanel.handleFix()` 的 `DocPolish` 直调。

因此没有旧路径删除。Quick Search / Composer host adapters、Markdown versus
native-file history semantics、以及 pre-integration stub 属于当前有意双路径。

### 最新验证

- `npm run test`: `307 passed / 2 failed (309)`；仍仅
  `chat-studio-message-state-ui` 与 `code-block-theme-settings` 两个既有失败。
- `npm run build`: green。
- `composer-chrome-geometry.qa.mjs`: `49/49`。
- T4 design fixtures: `5/5`。
- Composer visual-contract focused tests: `2/2`。
- T6 focused parity/guard tests: `5/5` files。

### 唯一人工收口门

owner-involved QA#2：真实 provider、bitmap/clipboard、Chinese IME、drag、
detached/dark/125%，以及剩余 native-object/device matrix；另需补 production
finding producer，并解释/修复真实 related refresh 为 0 的数据链路。完成前
不得把 Peak Composer wave 或当前 PARTIAL requirements 改写成 COMPLETE。

最终证据：
[`2026-07-27-peak-composer-implementation-note.md`](./superpowers/plans/2026-07-27-peak-composer-implementation-note.md)
与
[`2026-07-25-composer-wave-execution-log.md`](./superpowers/plans/2026-07-25-composer-wave-execution-log.md)。
