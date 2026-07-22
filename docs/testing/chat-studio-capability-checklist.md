# Chat Studio 能力测试清单

- 更新日期：2026-07-21（晚 · 零缺口收口 9 track 落地后）
- 适用范围：Chat Studio 中栏、Composer、Outline / Resources、消息富内容与媒体产物
- 目标：用同一份清单区分“真的能用”“只接了底层”“尚未实现”，避免把调研目标当成生产能力

## 2026-07-20 → 2026-07-21 更新摘要（Track A-E2 + 2026-07-21 晚零缺口收口）

- **AVAILABLE 新增（Track A-E2, 2026-07-20 晨）**：Chat 内 inline 生图（`media_generate` tool + native OpenAI / fal.ai / auto）、视频生成（fal 异步 job + 成本确认 + 取消 + 恢复）、音乐生成（fal 异步 job，`mediaKind='music'` 端到端保持独立，不复用 TTS）、Chat 内 MCP tools（permission ask 门 + 真实 step timeline）、Assistant 定义（instructions/knowledgeRefs/toolPolicy/preferredModel 真实生效）。
- **2026-07-21 晚零缺口收口（9 track）**：
  - **NOT WIRED 转 AVAILABLE**（待实机验收）：**参考图 / mask 图片编辑**（Composer Plus → Edit image + `/v1/images/edits` multipart + fal image-edit codec）、**Sora native video**（`OpenAINativeVideoAdapter` submit/poll/download，无远程 cancel→本地停）、**Dataview / Excalidraw / draw.io / Extract / Reminder 结构化产物**（统一 `artifact_create` tool + 5 producer + Vault 保存 + Resources 回跳 + Reminder scheduler）。
  - **PARTIAL 转 AVAILABLE**（待实机验收）：**发送音频 / 视频**（`MediaUnderstandingPort` + OpenAI transcription + WebAudioVideoAudioExtractor + catalog audio/video input capability + 发送前门禁 + `understandingSource` 4 字段与 UI 徽标）；**发送图片**（vision 直传 + catalog 能力标注，模型能否理解由 provider capability 而非 UI 假装）。
  - **Auto 真实路由**：新 `modelRouter.ts`（能力过滤 + tier 策略）+ `templates/config/model-routing.json`；auto sentinel 持久化不回写；`TurnExecutionReceipt` 新增 `requestedSelection / modelSource / routeReason / requiredCapabilities`；零候选硬错误。
  - **消息动作强化**：Trace 打开真实 `AgentTrace`；**Retry → variant 版本化**（`variantGroupId / variantIndex / isActiveVariant`，‹N/M› 切换器）；**Branch → 真分支**（`parentConversationId / parentMessageId`，"Branched from" 链回）；permission 三态（deny / allow once / allow-for-run，run 级 allowlist 在 `useStreamChat`）。
  - **Composer 单一真值**：`CapabilitySuggestion` 归轨 `composerStore`；`SystemPromptSlot` 不再硬编码 vault 可用；`ChatRuntimeStatePort.isVaultSearchAvailable` 真值注入；requested vs actual sources 分开持久化；`chatViewStore` 旧字段保留为单向镜像（诚实遗留）。
  - **Composer 入口语义**：`+` 仅资源三项；生成动作全部迁入 `/` slash Generate 组（preflight/缺 key 诚实禁用逐路由原因）。
  - **Artifact-Turn 关联**：`TurnExecutionReceipt.artifactIds` 真实回填，按 message/conversation/project/kind 查询。
  - **Detached / A11y**：`useOwnerWindow` hook + 9 处 `ownerDocument` 修复；splitter aria + Home/End/Enter reset；`NavRow` 键盘化；msg-list `role="log"` `aria-live`；图片布局分档纯函数 + lightbox；scroll-spy re-observe。
  - **Runner 修复（重大）**：`run-test.js` 原 harness 强杀 async 断言→假绿。改 `beforeExit` 自然退场 + `unhandledRejection` 硬失败 + 8s unref 宽限；暴露 6 个长期假绿并全部修复（含 `chunk_raw` 高亮回退生产 bug + `CopilotPickerContent` 生产回归）。
- **状态语言**：所有新条目在此清单以下方基线表列明入口/route/测试文件；未做实机（Obsidian 内点击）验收的条目明确标注“待实机验收”。凭据阻塞项（fal key 未配 / OpenAI profile 未配 / OpenRouter 402）在 MEDIA-04 与凭据阻塞段单列。

## 状态说明

| 状态 | 含义 |
|---|---|
| `AVAILABLE` | 有用户可达入口，可进行端到端验收 |
| `PARTIAL` | 能完成部分链路，仍受模型、loader、成本提示或 UI 入口限制 |
| `INFRA ONLY` | 底层 port / adapter 存在，但普通用户没有完整入口 |
| `NOT WIRED` | 当前 Chat Studio 没有对应执行链路 |

## 当前能力基线

这张表是测试前的诚实基线；后续每次实现能力时，先更新状态，再补对应测试证据。

| 能力 | 当前状态 | 已知边界 |
|---|---|---|
| 普通文本、多轮对话、流式输出 | `AVAILABLE` | 需要至少一个可用 Chat profile |
| `[[文档]]` 搜索与引用 | `AVAILABLE` | 输入框和 context shelf 只显示文件名，内部引用保留完整路径；删除行内引用时同步移除 shelf |
| 发送图片 | `AVAILABLE`（待实机验收） | Composer 预览 + Vault 上传；catalog `imageInput` 能力位显式声明，vision 直传至 provider；缺能力/不支持 model 时发送前 UI 显式提示（不再"上传即假装模型理解"）。测试：`test/media-understanding.test.ts`。 |
| 发送 PDF、Markdown、TXT、CSV、JSON、HTML、XML、DOCX、XLSX、PPTX | `AVAILABLE` | 需验证对应 loader；超大文件仍受上下文预算限制 |
| 发送 Canvas / Excalidraw | `PARTIAL` | 可作为 Vault 资源与可读文本进入检索链路，但 Chat 不提供原生画布编辑（生成侧走 `artifact_create` Excalidraw producer，见下） |
| 发送音频 / 视频 | `AVAILABLE`（待实机验收） | 入口：Composer `+` → Files & images 或 Vault document。链路：`MediaUnderstandingPort` → OpenAI transcription（`whisper-1` 可配）路径 / Gemini catalog 标注 `videoInput` / `audioInput` 走 provider 原生理解；video 经 `WebAudioVideoAudioExtractor` 抽 16k WAV 后转 transcript；发送前门禁（provider 无 audio/video 能力时明确拒绝，不静默丢）；`ChatResourceRef.understandingSource` 4 字段（route/adapter/model/note）+ UI 徽标。测试：`test/media-understanding.test.ts`。凭据阻塞：真实 OpenAI transcription 调用需 profile key。 |
| Markdown 表格、代码块、引用、列表、数学公式 | `AVAILABLE` | 由 Streamdown 渲染；需做流式中间态和长内容视觉测试 |
| Mermaid | `AVAILABLE` | Chat 内原生渲染；全屏、下载、Vault wikilink 点击需要分别验证 |
| Obsidian Bases | `AVAILABLE` | 模型输出 `base` fence；按钮保存为 `.base` 并在 Obsidian 原生打开，不在 Chat 内直接渲染 Bases |
| Dataview | `AVAILABLE`（待实机验收） | 入口：`/` slash Generate 组 / 自然语言触发 `artifact_create(kind='dataview')`。Producer 校验 DQL `dataview` fence 有效性 → 保存为 `.md`（`ChatFolder/Artifacts/Dataview/` via `AI_PATH_SUBFOLDERS.ArtifactsDataview`）→ Open in Obsidian；receipt kind=`dataview` 认得 Resources / Outline。config：`templates/config/artifact-create.json`。测试：`test/artifact-create-producers.test.ts`（15 场景）。 |
| Excalidraw / draw.io 生成 | `AVAILABLE`（待实机验收） | 入口：`artifact_create(kind='drawing')`。Excalidraw producer → 有效 `.excalidraw.md`；draw.io producer → 有效 `.drawio` XML；分别保存到 `ChatFolder/Artifacts/Excalidraw/` 与 `ChatFolder/Artifacts/DrawIO/`；Obsidian 打开 → 可编辑；失败保留源码可 retry。测试：`test/artifact-create-producers.test.ts`。 |
| 保存助手消息到 Vault | `AVAILABLE` | 通过消息操作执行；必须产生真实保存路径和 artifact receipt |
| Extract / Reminder 作为 Chat 产物 | `AVAILABLE`（待实机验收） | Extract：`artifact_create(kind='extract')` producer 从用户显式授权 message/ref 出 Markdown note，保留来源链接。Reminder：`artifact_create(kind='reminder')` 写 frontmatter（`title / due / source / status`）→ `ReminderSchedulerService` 到期弹 Obsidian `Notice` 并原位翻转文件 `status: done`；保存到 `ChatFolder/Artifacts/Extracts/` 与 `ChatFolder/Artifacts/Reminders/`。receipt kind `extract` / `reminder` Resources / Outline 认。测试：`test/artifact-create-producers.test.ts`、`test/reminder-scheduler.test.ts`。 |
| 当前笔记生成 TTS | `AVAILABLE` | 命令 `peak-media-tts-active-note`；需要 fal.ai key，产物落 `_attachments/media/` 或配置目录 |
| 当前笔记生成封面图 | `AVAILABLE` | 命令 `peak-media-cover-active-note`；需要 fal.ai key，不是 Chat 内 inline 生图 |
| Chat 内 inline 生图 | `AVAILABLE`（待实机验收） | 入口：Composer `/` Plus menu → `Generate image` / 自然语言触发 → `media_generate` tool。Route: `auto` / `native (OpenAI)` / `fal`。产物：真实 `ChatArtifactReceipt` + Vault 附件路径。测试：`test/media-generate-tool.test.ts`、`test/media-generate-chat-integration.test.ts`、`test/openai-native-image-adapter.test.ts`、`test/media-preflight.test.ts`。已知边界：gpt-image-1 `quantity` 上限 1（preflight guard，E2 R2#2），超限会显示配置错误 receipt。 |
| 参考图迭代编辑（image edit + mask） | `AVAILABLE`（待实机验收） | 入口：Composer `/` slash Generate → `Image edit`（宿主 `ComposerGenerateActions.tsx`，直接调 `service.produce`）；refs 确定性来自用户本轮显式选择的附件 / Resources（不猜 Vault）；出图后 "Insert as reference" 动作可作下一次 edit base。请求合同：`MediaGenerationRequest.operation='edit'` + `referenceImages[]` + `maskImage?` + `MediaReferenceResolver` port（`VaultMediaReferenceResolver` 读 Vault bytes）。Route：OpenAI `/v1/images/edits` multipart（`image[]` / `mask` per-model part 名，含 gpt-image-1）；fal edit codecs（`nano-banana/edit` 用 `image_urls` 数组、`flux-pro/v1/fill` 用 `image_url` + `mask_url`，data URI 直传），共享 `falPayload.ts` 消除双 adapter 漂移。batch 多输出 → N 独立 receipt + gallery。**Runner 修复过程中发现并修复 latent bug**：此前 submit 传 domain request 无 `modelId`，真实付费调用必炸。测试：`test/openai-image-edit-adapter.test.ts` / `test/fal-edit-payload.test.ts` / `test/media-edit-form-logic.test.ts` 等。凭据阻塞：OpenAI profile / fal key 未配，真实付费调用未跑。 |
| Sora 原生视频生成 | `AVAILABLE`（待实机验收） | 入口：`/` slash Generate → `Generate video` route=`native`（Auto 亦可挑到）。Adapter：`OpenAINativeVideoAdapter implements AsyncMediaAdapter` → `/v1/videos` submit / `/v1/videos/{id}` poll / `/v1/videos/{id}/content` download；模型 / seconds / size 约束读 `templates/config/media-generation.json`；`MediaJobRunner.adapters.native` 已注册；重启走同一 `resumeUnfinished()` 路径。fal 侧原有 veo3.1 / lyria2 async 保留。**远程 cancel API 不存在→本地停止跟踪即权威 cancel**（fal 与 native video 同）。凭据阻塞：OpenAI profile 未配，Sora 真实 submit / 计费未跑。 |
| 视频生成 | `AVAILABLE`（待实机验收） | 入口：Composer Plus menu → `Generate video`（与 Image 平级独立行）+ 自然语言 → `media_generate(kind='video')`。异步 job：submit → `awaiting-confirmation` receipt → 用户点 Confirm → runner poll → `saved` / `failed` / `cancelled`。恢复：boot 前 `runner.resumeUnfinished()`（保持 provider cursor 的 running job 继续 poll；无 cursor 的 queued/running 幂等 mark failed）。MEDIA-03 门槛已全项满足（含 Usage Dashboard 打点与音乐授权说明）。已知边界：默认 endpoint 已按 fal 官方文档核实为 `fal-ai/veo3.1`（旧 `veo3` 已被 fal 废弃；payload `duration` 为 `"4s"/"6s"/"8s"` 枚举串，adapter 已修正），另有 `fast` preset（`fal-ai/veo3.1/fast`，约 1/3 价格）；核实依据 [fal endpoint 核查报告](../research/2026-07-21-fal-endpoint-verification/README.md)，**真实付费调用仍待 fal key 实测**（MEDIA-04 步骤 3）。fal 侧无远程 cancel API（本地停止跟踪即为权威 cancel，fal 仍会计费）。测试：`test/media-job-runner.test.ts`（含 usage event + cross-reboot slice）、`test/media-generate-tool.test.ts`。 |
| 音乐生成 | `AVAILABLE`（待实机验收） | 入口：Composer Plus menu → `Generate music`（与 Image / Video 平级独立行）+ 自然语言 → `media_generate(kind='music')`。异步 job 生命周期与视频同构，`mediaKind='music'` 端到端保持独立（不与 TTS 共享 endpoint / preset / kind）。MEDIA-03 门槛已全项满足。已知边界：默认 endpoint `fal-ai/lyria2` 已按 fal 官方文档核实存在且标注商用（Google Lyria 模型）；输出**固定约 30s**，不接受 duration 参数（payload 已修正、上限改 30、表单显示固定时长说明）；授权/商用边界说明见 Settings → Media Generation → Music 段（SynthID 水印 / 平台披露要求 / USCO 口径 + fal ToS 链接）；核实依据 [fal endpoint 核查报告](../research/2026-07-21-fal-endpoint-verification/README.md)，**真实付费调用仍待 fal key 实测**。测试：`test/media-job-runner.test.ts::testMusicMediaKindPreservedEndToEnd`、`test/media-generate-tool.test.ts::testExecuteMusicQueuesAsyncJob`。 |
| Chat 内 MCP tools（stdio / SSE / HTTP） | `AVAILABLE`（待实机验收） | 入口：`Settings → Tools → MCP Servers` 配置后，MCP tool 自动挂入 `media_generate` 之外的 Chat tool loop；mutating（kind='edit'）触发 permission ask（`PermissionAskCard` inline + `runStatus='waiting-permission'` 覆盖到 streaming message 状态行）。测试：`test/mcp-tool-integration.test.ts`、`test/permission-guard.test.ts` 系列 + `test/chat-run-status-overlay.test.ts`（E2 R1#1 lock）。 |
| Assistant slot（instructions / knowledgeRefs / toolPolicy / preferredModel） | `AVAILABLE`（待实机验收） | Settings → AI Setup → Assistants；建/编辑后 Chat Composer 顶栏 Assistant picker 可切换。运行时：instructions 拼进 system prompt、knowledgeRefs 通过 `assistantResolver` 挂入 turn context（`actualSources.explicitRefsUsed` 记录被真正 consulted 的 ref），toolPolicy 的 allow/deny 与 permission approval 生效，preferredModel 覆盖当前 profile 的默认 model。测试：`test/assistant-runtime.test.ts`、`test/assistant-resolver.test.ts`。 |
| Assistant builder：Advanced / lifecycle / Preview | `AVAILABLE`（待实机验收） | Assistant builder Advanced 区（`knowledgeRefs` / `toolPolicy` allow+deny / `preferredModel`）；生命周期：create / edit / duplicate / archive+restore / delete / reset defaults；**Preview = ephemeral apply-without-saving**（`EphemeralAssistantRegistry` 内存级，resolver 优先，reload 消失，selector 显 "Preview" 徽标）；Save 才持久化。测试：`test/assistant-builder-lifecycle.test.ts`。 |
| Auto 真实路由（模型选择） | `AVAILABLE`（待实机验收） | 新纯函数 `src/service/chat/modelRouter.ts`（能力过滤 + tier 策略）+ `templates/config/model-routing.json`（ConfigTemplateId.ModelRouting）；接线 `service-conversation.prepareChatRequest`；auto sentinel 持久化不回写（reload 后仍是 Auto）；`TurnExecutionReceipt` 新增 `requestedSelection / modelSource / routeReason / requiredCapabilities`；零候选硬错误（`no-model-available`）而非静默降级。测试：`test/model-router.test.ts`。 |
| Composer 入口语义（`+` / `/` / `[[` / `@`） | `AVAILABLE`（待实机验收） | `+` 仅资源三项（Files & images / Vault document / Link）；生成动作（image / edit / video / music / document）全部迁入 `/` slash Generate 组，宿主 `ComposerGenerateActions.tsx`，preflight / 缺 key 逐路由诚实禁用并显示原因；`[[` Vault refs 不变；`@` 保留未占用；starter 只填不发。测试：`test/composer-entry-semantics.test.ts`。 |
| Composer 单一真值（source ownership） | `AVAILABLE`（待实机验收） | `CapabilitySuggestion` 归轨 `composerStore`；`SystemPromptSlot` 不再硬编码 vault 可用；`ChatRuntimeStatePort.isVaultSearchAvailable` 由 `main.ts` 真值注入；requested vs actual sources 分开持久化。测试：`test/composer-source-truth.test.ts`。**诚实遗留**：`chatViewStore` 旧 source 字段保留为 composer→legacy 单向镜像，port 仍读；下一波才全删。 |
| 消息动作：Trace / Retry variant / Branch / Permission 三态 | `AVAILABLE`（待实机验收） | Registry 优先级 + 反向 overflow（core 5 永不进 More）；Trace 打开真实 `AgentTrace`（copy JSON 降级）；**Retry → variant 版本化**：`variantGroupId` / `variantIndex` / `isActiveVariant`，history 只取 active，UI ‹N/M› 切换器；**Branch → 真分支**：新建 conversation 带 `parentConversationId` / `parentMessageId`，UI 展示 "Branched from" 链回；permission 三态（deny / allow once / allow-for-run，run 级 allowlist 在 `useStreamChat`）；suggested next 顶部≤2 只填 Composer；targeted follow-up 用主 Composer reply anchor。测试：`test/message-variants.test.ts`、`test/conversation-branch.test.ts`、`test/permission-chat-flow.test.ts`。 |
| Artifact-Turn 关联 | `AVAILABLE`（待实机验收） | `TurnExecutionReceipt.artifactIds` 由 `listArtifactReceiptsByMessage` 真实回填；repo 按 message / conversation / project / kind 查询。Gallery fixture 已确认 dev-only。测试：`test/artifact-turn-association.test.ts`。 |
| Detached window / A11y | `AVAILABLE`（部分待人工矩阵） | `useOwnerWindow` hook + 9 处 `ownerDocument` 修复（键盘 / drop / confirm / lightbox / scroll-spy）；splitter aria + Home/End/Enter reset；`NavRow` 键盘化；msg-list `role="log"` `aria-live`；图片布局分档纯函数 + lightbox；scroll-spy 随消息增删 re-observe。测试：`test/a11y-structure.test.ts` 等（Track 9 增补，实际以工作树里最新的 a11y / detached 相关 tests 为准）。**人工矩阵未跑（Track 8 留 10 条清单）**：detached popout 键盘全流程、light/dark 双主题、894/1440 视口、125% zoom、VoiceOver。 |
| Web 搜索 fallback | `AVAILABLE`（待实机验收） | B1 §5.2 R2 修复：`catalog.webSearch: true` 不再抑制 fallback tool；只要有一个 web search profile 就注入 tool（当前无 native web adapter）。测试：`test/chat-runtime-characterization.test.ts::testWebSearchInjectionRules`。 |
| Agent Run 真实 step timeline | `AVAILABLE`（待实机验收） | Track A-E1 全部走同一个 harness runtime；`ToolCallSummary` 从 `debugRun.spans` + `toolCalls` 派生 running/failed/completed/cancelled 状态，`AgentStepRow` 显示每步 error 消息 + duration。fixture-driven 假 spinner 已删除。测试：`test/harness-loop.test.ts`、`test/agent-loop.test.ts` 系列。 |

## 0. 每轮测试准备

- [ ] 先运行 `Peak Assistant: Chat Studio: Rebuild Component Gallery`，按[组件画廊回归说明](./chat-studio-component-gallery.md)检查真实组件的完整基线。
- [ ] `npm run build` 成功，Obsidian 已重新加载插件。
- [ ] 准备一个文本模型 profile；多模态用例另准备一个明确支持图片的 profile。
- [ ] 准备 fal.ai key，仅在执行 TTS / 封面图测试时启用。
- [ ] 准备测试 Vault 文件：Markdown、PDF、PNG/JPEG、CSV、DOCX、XLSX、PPTX、Canvas、Excalidraw、MP3、MP4。
- [ ] 开发者控制台无新的 uncaught error；记录 provider、model、主题、窗口类型和构建版本。
- [ ] 同一组关键用例至少覆盖主窗口和 Chat Studio popout；视觉用例覆盖亮色与暗色主题。

## 1. Composer 与引用

### COMP-01 `[[文档]]` 搜索菜单

1. 在靠近窗口底部的 Composer 输入 `[[` 和查询词。
2. 观察菜单位置，连续按 `↑` / `↓`，再用鼠标 hover 不同行。
3. 按 Enter 选择结果。

验收：

- [ ] 菜单在 Composer 上方展开，不被窗口底部裁切。
- [ ] 主窗口和 popout 都使用所属窗口的 viewport 定位。
- [ ] 键盘选中背景始终可见；hover 与 keyboard-selected 状态可区分。
- [ ] 滚动长结果列表时，当前选中项会进入可视区。
- [ ] 选中后输入框只显示可读的 `[[文件名.md]]`，不会暴露完整 Vault 路径，也不会只剩附件 chip。
- [ ] context shelf 同时出现显式 Vault 引用，只显示文件名；完整 Vault 路径保留在 hover 提示和内部 URI 中。
- [ ] 删除输入框里的完整 wikilink 后，配对的 context shelf 引用同步消失；普通上传和 URL 不受影响。
- [ ] 发送、切换会话、重新加载后，引用和正文按 Composer draft 规则恢复或清空。

### COMP-02 文件选择与拖放

对每种文件分别执行“`+` 选择”和拖入 Composer：PNG、PDF、DOCX、CSV、MP3、MP4。

- [ ] 同一文件重复加入会按 hash 去重。
- [ ] 图片显示缩略图；其他文件显示文件名和稳定的类型图标。
- [ ] 删除附件不会删除 Composer 正文或显式 Vault 引用。
- [ ] 发送失败时正文与附件保留，成功后清空。
- [ ] 发送成功后消息资源和右侧 Resources 都能看到对应文件。
- [ ] 音频 / 视频明确显示为“已上传但理解能力未保证”，不得伪装成已完成多模态分析。

## 2. 会话顺序、Outline 与 Resources

### INDEX-01 全局时间倒序

构造消息时间线：`Topic A(旧) → Topic B → Topic A(新)`，并让输入数组顺序与时间顺序不同。

- [ ] Outline 从上到下严格按 `createdAtTimestamp` 新到旧排列。
- [ ] 时间相同使用稳定 tie-break，不因重新渲染跳动。
- [ ] message 的 process / error / artifact 子节点紧跟父 message，不漂到其他消息上方。

### INDEX-02 只聚合连续 Topic

- [ ] 相邻且 topic 相同的消息进入同一个 group。
- [ ] 中间出现不同 topic 后，再次出现同名 topic 必须形成新的 group。
- [ ] 展开 / 折叠状态按连续 group id 保存，不会同时折叠所有同名 topic。
- [ ] 搜索过滤后仍保持原始时间顺序与 group 边界。

### INDEX-03 Resources 诚实性

- [ ] 本轮引用和本轮生成分区正确。
- [ ] 图片、音频 / music、视频、文档、表格、代码、diagram、Base 类型映射正确。
- [ ] 点击资源回跳到来源消息；不会假装已经打开或管理了 Vault 文件。
- [ ] 真实保存产物有 artifact receipt、Vault path 和可执行 open / copy 等动作。

## 3. 消息与富内容视觉

对同一条助手回复一次性生成：两段正文、列表、blockquote、宽表格、长代码块、Mermaid、数学公式、普通图片链接和 wikilink。

### RENDER-01 阅读层级

- [ ] 用户消息是右对齐的轻量文本块，不像第二个 Composer 输入框。
- [ ] Reasoning 是正文流中的轻量 disclosure，不是大面积灰色卡片；折叠时只显示名称，展开后用左侧细线与正文区分。
- [ ] Reasoning 只承载模型 reasoning 文本，不混入工具调用、工具参数、结果、耗时或 runtime span。
- [ ] Composer、消息正文与主要富内容共享同一阅读宽度。
- [ ] 窄窗口仍保留正文优先级，左右栏不挤压到不可读。

### RENDER-01B Agent Run 与 Diagnostic Trace

准备四种消息：单工具成功、多工具运行中、中间工具失败、带嵌套 `DebugRun` spans 的 agent run。

- [ ] 有工具调用时显示独立的 `Agent run`，按真实执行顺序连接成时间线；不得伪装成 Reasoning。
- [ ] running / completed / failed / cancelled 状态、步骤数、总耗时和 token 信息与实际运行一致。
- [ ] 每个步骤能区分输入摘要、结果摘要、错误和耗时；长参数与长结果不会撑破消息列。
- [ ] 只有消息存在精确匹配的 `debugRunId` 且能读到 spans 时，才显示 `Diagnostic trace`。
- [ ] trace 根据 `parentSpanId` 展示嵌套栈，失败 span 明确标红；没有 trace 时不生成假的空栈或静态占位。
- [ ] 折叠 Agent run 不影响正文阅读；展开 trace 不遮挡 Composer，窄窗口仍能辨认层级。

### RENDER-02 表格

- [ ] 表头有轻量区分，没有渐变、厚阴影或强斑马纹。
- [ ] 宽表格只在表格自身横向滚动，不撑破消息列。
- [ ] 单元格换行、中文、长 URL、inline code 与最后一行边界正常。
- [ ] 亮色与暗色主题均有足够文字 / border 对比度。

### RENDER-03 代码

- [ ] header、body、copy / download actions 构成一个结构面，没有双重边框和浮起阴影。
- [ ] 长行可滚动，长代码块不会压住 Composer。
- [ ] 流式中未闭合 fence 不产生白屏、布局跳跃或无法复制的残片。
- [ ] 暗色 Obsidian 主题下 code body 不出现刺眼白底。
- [ ] `Settings → Peak Assistant → Advanced → Message appearance` 可切换 GitHub Dark、One Dark Pro、Nord、Dracula、Vitesse Dark，消息、Reasoning 与报告内代码即时同步。

### RENDER-04 图片与 Mermaid

- [ ] 图片保留自然比例，最大宽度不超过正文，超高图片不会无限拉长会话。
- [ ] 点击生成图片会在当前 Obsidian 窗口打开可关闭的放大预览；不误开到主窗口或浏览器。
- [ ] 图片没有额外 glossy card shadow；加载失败时不破坏周围正文。
- [ ] 没有真实媒体 URL 的 video / audio receipt 只显示紧凑图标、文件名和状态，不画假的波形或大片空白播放器。
- [ ] Mermaid 小图、宽图、错误语法、全屏和导出动作都可恢复；全屏复制真正的 diagram SVG，不得误放大工具栏 icon。
- [ ] Mermaid 节点内真实 `peak://wikilink/` 可以打开 Vault 文件；不存在的路径不得由模型编造。

## 4. 结构化产物

### ART-01 Obsidian Bases

提示模型生成带 `# filename: active-projects.base` 的 `base` fence。

- [ ] fence 在 Chat 中显示为代码并出现 `Save & Open in Bases`。
- [ ] 保存前 filename hint 被清除，目标路径位于配置的 AI Bases 目录。
- [ ] Obsidian 以新 tab 打开 `.base`；重复保存不会静默覆盖用户文件。
- [ ] 成功后记录真实 artifact receipt；失败时保留源代码并显示可行动错误。

### ART-02 保存消息到 Vault

- [ ] More / 自适应动作中可找到 Save to Vault。
- [ ] 成功提示包含真实路径；Resources / 项目资源页可看到产物。
- [ ] 消息 Markdown、表格、code fence、图片引用和 wikilink 在保存后不丢失。
- [ ] 权限、目录不存在和文件名冲突有明确降级结果。

### ART-03 尚未接入能力的防误导（2026-07-21 晚更新）

原“未接入”名单里的 Dataview / Excalidraw / draw.io / Reminder / Extract / 参考图·mask edit / 原生 Sora video route **已由零缺口收口全部接入并锁在测试里**。当前防误导只剩以下真实边界：

- [ ] 缺 fal key / OpenAI profile 时 `/` slash Generate 组的 Image / Edit / Video / Music 显示为 disabled + 逐路由原因（不是伪装 available）。
- [ ] `music` 生成不复用 TTS（`mediaKind='music'` 独立端到端）；音乐 licensing 首次确认（`policyVersion / confirmedAt` 入 settings + receipt）。
- [ ] `artifact_create` 5 producer 任一 schema/写盘/validate 失败时渲染 failed receipt，保留原始 content 支持 retry，不静默丢；`kind='edit'` 走 PermissionGuard。
- [ ] 原始拖拽附件（未入 vault）**不能**作 edit base（resolver 需稳定 content identifier；诚实遗留，需要下一波解决）。
- [ ] 未来新增入口时，必须同时补状态、成本、取消、失败恢复、Vault 生命周期和 artifact receipt。

## 5. 媒体生成

### MEDIA-01 当前笔记 TTS

1. 打开非空 Markdown 笔记。
2. 运行 `Peak Assistant: Generate TTS for active note` 对应命令。

- [ ] 未配置 fal.ai key 时只提示配置，不发请求。
- [ ] 成功生成 MP3 / WAV 并写入配置目录；提示包含路径和大小。
- [ ] 空笔记、网络失败、超时和 provider 错误均关闭进度 notice，并给出错误。
- [ ] 不把单次 TTS 命令描述成“Chat 内音频生成”。

### MEDIA-02 当前笔记封面图

- [ ] 标题和正文摘要进入 prompt；产物为 PNG / JPEG / WebP。
- [ ] 16:9 输出写入 Vault 配置目录，原笔记不会被自动改写。
- [ ] 未配置 key、空笔记、网络失败和超时行为可恢复。
- [ ] 生成结果不会被错误标记为 Chat inline image。

### MEDIA-03 Video / Music 上线前门槛

以下全部满足前，状态不得从 `INFRA ONLY` / `NOT WIRED` 改为 `AVAILABLE`（本次 E2 已交付大部分，逐条现状如下）：

- [x] 有用户入口和明确 model / duration / aspect / voice 控件。
      入口：`ComposerPlusMenu` 三行（Generate image / video / music），form 里 model / duration / aspect（image only）/ voice（TTS 专属，Composer 未开新入口）；也可自然语言触发 `media_generate`。测试：`test/media-preflight.test.ts`、`test/media-generate-tool.test.ts`。
- [x] 单次调用前显示估算成本，高成本调用需要确认。
      Composer form 内 preflight-driven `costHint`；视频/音乐 receipt 一律进 `awaiting-confirmation` 状态，`ArtifactReceiptCard` 显示 route / provider / model / duration / quantity(image only) / 估算成本 + 置信度或“Estimate unavailable”诚实兜底。测试：`test/artifact-confirm-cost-details.test.ts`（E2 新增，5 slice）。
- [x] 有异步 job 状态、取消、超时、重试和应用重启后的恢复策略。
      `MediaJobRunner` 状态机：`awaiting-confirmation → running → completed/failed/cancelled`；`pollDeadlineMs` 300s；`resumeUnfinished()` 在 boot 时优先于 `failAllUnfinished()`；`dispose()` 挂到 plugin unload。测试：`test/media-job-runner.test.ts`（11+2 slice，含 cross-reboot orphan case）。
- [x] 产物保存到 Vault，可预览、打开、再次作为 reference 使用。
      writer = `ObsidianMediaAttachmentWriter`；输出目录 `settings.ai.mediaAttachmentFolder` fallback `_attachments/media/`。preview 在 Chat gallery/lightbox 里渲染；Resources 面板从 `chat_artifact_receipt` 表读，可回跳到源 message。
- [x] Usage Dashboard 记录。
      `MediaUsageEmitter` port（`src/service/media/MediaUsageEmitter.ts`）+ 组合根闭包（`composeMediaGenerationService.ts` dispatch `UsageRecordedViewEvent`，feature=`media_generation`）；成功/失败双路径打点（sync image / TTS / cover 走 `MediaGenerationService`，async video/music 走 `MediaJobRunner` 完成回调），`costUsd` 为预估值且 `metadata.costConfidence='estimated'`（不伪装实际账单）；emitter 抛错不影响生成。测试：`test/media-generation-service.test.ts`（success / failure / throwing-sink 3 slice）、`test/media-job-runner.test.ts`（confirm→poll→completed 记 1 条 usage event）。
- [x] 音乐授权 / 商用边界说明。
      Settings → Media Generation → Music 段固定展示 licensing note（事实性要点：fal ToS 不担保产物版权归属；Lyria 输出含不可去除 SynthID 水印；主流分发平台与 EU AI Act 要求 AI 披露；纯 prompt 生成音乐按 USCO 口径推定不可注册版权；TTS/Kokoro 为独立条款不复用），附 fal Terms of Service 链接；文案全部走 `templates/config/settings.json`（`mediaGeneration.presets.musicLicensing*`）。要点来源与出处：[fal endpoint 核查报告 §6](../research/2026-07-21-fal-endpoint-verification/README.md)。lyria2 端点本身已核实存在且标注商用。

### MEDIA-04 Chat 内生成 · 实机验收步骤（E2 新增）

Track D-E1 已交付端到端链路；下面给出 Obsidian 内需要真人跑一次的实机步骤。已用自动测试覆盖的行为在括号里标注锁定的测试文件。

1. **Image · 自然语言路径**：Chat 里输入 “Generate an image of a red flower”，模型应调用 `media_generate(kind='image')` → receipt `saved` → 图片出现在 gallery 里。
   - 未配置 fal key 且未启用 native profile：receipt state=`needs-configuration`，`availableActions=['configure','retry']`，Configure 按钮跳 `mediaGeneration` tab。（测试：`test/media-generate-tool.test.ts::testExecuteImageFailurePersistsFailedReceipt`）
   - Auto route 挑到 native + `gpt-image-1` 时，quantity>1 → 立即被 preflight 挡下（测试：`test/media-preflight.test.ts::testNativeQuantityOverMaxSurfacesPreflightConfig`）；Configure 按钮跳 `mediaGeneration` tab。
2. **Image · Composer Plus 表单路径**：点 Composer `+` → `Generate image` → 填 prompt + 选 route + 数量 → 显示 costHint（无 fake number；未配置时显示 “Cost estimate unavailable”，测试 `test/media-preflight.test.ts` 覆盖）→ 点 “Insert into composer” 会把结构化提示插入 → Send → 与自然语言路径同链路。
3. **Video · 提交与确认门**：Composer Plus → `Generate video` → 填 prompt + duration（`max` 由 config 驱动，测试 `test/media-generation-config.test.ts::testMaxDurationSecondsFromConfigDrivesUiBound`）→ Send → 消息内出现 `awaiting-confirmation` receipt 卡，卡上显示 Route/Provider/Model/Duration/Estimated cost（测试 `test/artifact-confirm-cost-details.test.ts` 覆盖所有分支）→ 点 “Confirm” → runner 提交 → poll 到 `saved` → 卡片变为可播放视频。
4. **Video / Music · 取消**：`awaiting-confirmation` 或 `running` 状态下点 “Cancel” → receipt 变 `cancelled`（+ `retry` action）。fal 侧无远程 cancel API，本地停止跟踪即为权威取消；Confirm 前 cancel 不产生任何 provider 请求（测试 `test/media-job-runner.test.ts::testCancelDenyStopsPipeline`）。
5. **Video / Music · 重试**：`failed` / `cancelled` receipt 点 Retry → 重新走 `media_generate` → 新 job（新 jobId + 新 receiptId），不复用旧 job（测试 `test/media-generate-tool.test.ts`）。
6. **Video / Music · 应用重启恢复**：Confirm 视频后立即 disable plugin → re-enable → boot 时 `resumeUnfinished()` 找到 `running` job + `providerResponseUrl` → 继续 poll；无 provider cursor 的孤儿 job 幂等标 `failed`（`retry` 可用）（测试 `test/media-job-runner.test.ts::testResumeUnfinishedOrder` + `testResumeAwaitingThenConfirmCompletesReceipt`）。
7. **Music kind 独立性**：Music 请求走 `mediaKind='music'` 全链路，不会退化成 TTS；Composer 里 Generate music 与 Image / Video 是三行独立入口。测试：`test/media-job-runner.test.ts::testMusicMediaKindPreservedEndToEnd`。
8. **Composer 预告**：video / music 表单在 costHint 下方显示 “You will confirm the estimated cost on the receipt card before the {video|music} job starts.”，用户提前知道 Send 不会直接扣费（E2 R1#2，测试 `test/media-error-copy-spec.test.ts::testE2R1_2_ConfirmPreDisclosureExists`）。
9. **Waiting-permission 状态**：MCP mutating tool（或未来 media_generate `writes` approval）触发 permission ask 时，streaming 消息的状态行从 `Generating` 覆盖为 `Permission required`；点 Allow / Deny 后状态复原（E2 R1#1，测试 `test/chat-run-status-overlay.test.ts`）。

## 5.5 凭据阻塞项（credential-blocked · 2026-07-21 晚）

以下项**代码能力全量落地并锁在测试里**，仅缺 owner 提供真实凭据 / 计费授权即可 owner 侧实机验收，不再是"未实现"：

| 项 | 阻塞凭据 | 实机方式 |
|---|---|---|
| OpenAI native image generation (`gpt-image-1`) 付费调用 | OpenAI profile key + 计费授权 | 配 profile → `/` Image → send |
| OpenAI `/v1/images/edits` image edit + mask 付费调用 | 同上 | 配 profile → 选 base image → `/` Edit → send |
| Sora `/v1/videos` submit / poll / download 付费调用 | 同上 | 配 profile → `/` Video route=`native` → confirm |
| fal video (`veo3.1` / `veo3.1/fast`) 付费调用 | fal key | 配 fal key → `/` Video route=`fal` → confirm |
| fal music (`lyria2`) 付费调用 | fal key | 配 fal key → `/` Music → confirm |
| fal image edit codecs (`nano-banana/edit`, `flux-pro/v1/fill`) 付费调用 | fal key | 配 fal key → `/` Edit route=`fal` → send |
| OpenAI transcription (`whisper-1`) 付费调用 | OpenAI profile key | 附音频/视频 → send（provider 需 audio/video capability） |
| MEDIA-04 九步实机清单 | 上述任一凭据 | 逐条按 §MEDIA-04 步骤 |
| CORS 实测 (`app://obsidian.md` 到 OpenAI) | OpenAI profile key | 若拦截换 Obsidian `requestUrl`（单点替换） |
| 真实流式 turn E2E（Chat + provider 真实 token） | 任一 provider key（当前 OpenRouter 402 欠费） | 配 key → 普通对话触发 turn |

**OpenRouter 402**：当前 OpenRouter 侧欠费（PatternDiscovery 报 402），非本轮引入；owner 侧充值即恢复。

## 6. 回归与证据记录

每次发布保留以下最小证据：

| 证据 | 必填内容 |
|---|---|
| 自动测试 | Outline 顺序 / 连续 topic、popup 定位、wikilink 行内保留、Composer draft |
| 构建 | `npm run build` 结果 |
| 主窗口截图 | 完整 Chat Studio，包含用户消息、Analysis、富正文和 Outline |
| popout 截图 | `[[文档]]` 菜单、键盘高亮和 Composer 边界 |
| 主题截图 | 表格、代码、图片、Mermaid 的亮色 / 暗色结果 |
| 媒体记录 | provider、model、输入、耗时、Vault path、失败原因、实际成本（若可得） |

相关资料：

- [Chat Runtime 与生成能力闭环 · 交付报告](../superpowers/plans/2026-07-21-chat-runtime-capability-closure-delivery.md)（本清单 2026-07-21 状态迁移的依据）
- [Chat Studio 组件画廊与视觉回归](./chat-studio-component-gallery.md)
- [Chat Studio UI/UX 功能图](../11-feature-chat-studio-ui-ux.html)
- [Chat Context](../11-feature-chat-context.html)
- [多模态生成能力调研](../research/2026-07-01-multimodal-generation-studio/README.md)
- [Chat 富生成能力调研](../research/2026-07-01-rich-generation-in-chat/README.md)
