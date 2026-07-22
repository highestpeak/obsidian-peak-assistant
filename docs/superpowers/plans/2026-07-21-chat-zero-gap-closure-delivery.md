# Chat Studio 零缺口收口 — 交付报告

- 日期：2026-07-21（晚）
- 状态：**delivered · 未 commit · Outcome: PARTIAL（凭据阻塞项 + 人工矩阵未竟，代码能力全量落地）**
- 规格：[2026-07-21-chat-zero-gap-closure-claude-handoff.md](./2026-07-21-chat-zero-gap-closure-claude-handoff.md)
- 前置：[2026-07-20-chat-runtime-capability-closure-claude-handoff.md](./2026-07-20-chat-runtime-capability-closure-claude-handoff.md) 与其[交付报告](./2026-07-21-chat-runtime-capability-closure-delivery.md)
- 相关：[Chat Studio 能力清单](../../testing/chat-studio-capability-checklist.md)、[Chat Studio 实施 spec §17](../specs/2026-07-15-chat-studio-complete-implementation-spec.md#17-requirement-验收矩阵)
- 读者：owner 与后续在 Chat / 媒体 / 结构化产物链路上工作的实施者

> 本文对照 handoff §4-§8 的 Track A-H，五段式记录。执行方式：编排者串行派 8 个实现代理，每步全量测试；最终 **264/264 test files 绿、build 绿**、`validate.mjs` 通过；Obsidian 1.12.7 实机（CDP 驱动）验收核心面。工作树未 commit（129 tracked files +13.5k/−11.9k + 新增文件）。

## 1. 已实现能力

对照 handoff §1「必达能力」表：

| Handoff Track | 落地内容 | Session 中的 Track ID |
| --- | --- | --- |
| **A · Media request + reference contract / 图片编辑** | `MediaGenerationRequest.operation='edit'` + `referenceImages[]` + `maskImage?`；`MediaReferenceResolver` port + `VaultMediaReferenceResolver`；Composer `/` slash `Image edit` 表单（refs 确定性来自用户显式选择） | Track 6（媒体全量） |
| **B · Provider adapters / Native Sora + 真正异步 routing** | `OpenAINativeVideoAdapter implements AsyncMediaAdapter`（Sora `/v1/videos` submit/poll/download，无远程 cancel→本地停）；OpenAI `/v1/images/edits` multipart（`image[]/mask` per-model part 名）；fal edit codecs（`nano-banana/edit` `image_urls` / `flux-pro/v1/fill` `image_url+mask_url`）；共享 `falPayload.ts` 消除双 adapter 漂移；Auto 路由 `src/service/chat/modelRouter.ts`（纯函数 + `templates/config/model-routing.json`） | Track 1（Auto 路由）+ Track 6（媒体全量） |
| **C · 媒体附件理解、预览与复用** | `MediaUnderstandingPort`；`OpenAITranscriptionAdapter`（`whisper-1` 可配）；`WebAudioVideoAudioExtractor` → 16k WAV；Gemini catalog 标注 `videoInput/audioInput` 直传；发送前门禁（provider 无音/视频能力时明确拒绝）；`ChatResourceRef.understandingSource` 4 字段 + UI 徽标；batch 多输出 → N 独立 receipt + gallery + lightbox | Track 6（媒体全量）+ Track 9（图片布局分档 + lightbox） |
| **D · 结构化 Chat 产物** | `artifact_create` ToolDef（`kind='edit'` 走 PermissionGuard）+ 5 producer：Dataview（`.md` fence 校验）/ Excalidraw（有效 `.excalidraw.md`）/ drawio（有效 XML）/ Extract（带来源链接）/ Reminder（frontmatter + `ReminderSchedulerService` 到期弹 Notice + 文件 `status: done` 原位翻转）；`ChatArtifactKind` 增 `dataview/extract/reminder`；`folderPaths` 增 `Artifacts/*` 子目录；渲染 / Resources / Outline 全认；config `templates/config/artifact-create.json` | Track 7（结构化产物） |
| **E · Usage / 授权 / 设置 / 文档** | Usage Dashboard "Media generation · run detail"（恒标 `estimated`，不伪装账单）；music terms 首次确认（`policyVersion/confirmedAt` 入 settings + receipt）；Settings 能力矩阵 `generate/edit × image/video/music/tts × native/fal`；[capability checklist](../../testing/chat-studio-capability-checklist.md) 迁移；spec §17 46 ID 逐项状态标注 | Track 6（媒体全量）+ 本文档 + checklist 更新 |
| **F · Composer 单一真值 / 入口语义** | `CapabilitySuggestion` 归轨 `composerStore`；`SystemPromptSlot` 不再硬编码 vault 可用；`ChatRuntimeStatePort.isVaultSearchAvailable` 真值注入；requested vs actual sources 分开持久化；`+` 仅资源三项，生成动作全部迁入 `/` slash Generate 组，preflight/缺 key 诚实禁用 | Track 2（单一真值）+ Track 3（入口语义） |
| **G · Assistant Builder / 消息动作** | Advanced 区（`knowledgeRefs / toolPolicy / preferredModel`）；生命周期 create/edit/duplicate/archive+restore/delete/reset；**Preview = ephemeral apply-without-saving**（`EphemeralAssistantRegistry`，reload 消失）；registry 优先级 + 反向 overflow（core 5 永不进 More）；Trace 打开真实 `AgentTrace`；**Retry → variant 版本化**；**Branch → 真分支**；permission 三态；`artifactIds` 真实回填 | Track 4（Builder）+ Track 5（artifact-turn 关联）+ Track 8（消息动作） |
| **H · Tests + Obsidian verification + checklist** | 264/264 test files 绿；`npm run build` 绿；`validate.mjs` 通过；Obsidian 1.12.7 CDP 实机核心面通过；checklist 迁移；spec §17 状态标注；[progress.md](../../progress.md) 2026-07-21 晚条目；本文档 | Track 9（Detached / A11y）+ Runner 修复 + 文档收口 |

## 2. 实际路由（关键运行链路）

- **文本 turn**：`useStreamChat` → `service-conversation.prepareChatRequest` → `modelRouter`（auto 时按 tier + 能力过滤）→ Harness `runAgentLoop`（沿用 2026-07-20 landed）；permission 三态 allow-for-run allowlist 在 `useStreamChat` 层强制。
- **Image generate**：Composer `/` Generate image → preflight → `media_generate` tool 或 `service.produce` → `MediaGenerationService` → OpenAI Native `/v1/images/generations` 或 fal sync → `ObsidianMediaAttachmentWriter` → `ChatArtifactReceipt`。
- **Image edit**：Composer `/` Edit image（refs 用户显式选择）→ `MediaGenerationRequest.operation='edit'` + `MediaReferenceResolver` 读 Vault bytes → OpenAI `/v1/images/edits` multipart 或 fal edit codec（`nano-banana/edit` 或 `flux-pro/v1/fill`）→ batch 多输出 N 独立 receipt + gallery。
- **Video / Music**：`awaiting-confirmation` → 用户 Confirm → `MediaJobRunner` submit → poll → completed / failed / cancelled；重启走 `resumeUnfinished()`（先于 `failAllUnfinished()`）；fal 与 Sora native 同一状态机，均无远程 cancel API（本地停止即权威 cancel）。
- **音视频理解（send audio/video）**：Composer 附件 → send 前检查 provider capability（`imageInput/audioInput/videoInput`）→ 有 `videoInput` 走原生（Gemini）；否则 video → `WebAudioVideoAudioExtractor` 16k WAV → `OpenAITranscriptionAdapter` `whisper-1` → transcript 入 turn context；`ChatResourceRef.understandingSource` 4 字段（route/adapter/model/note）持久化 + UI 徽标。
- **结构化产物**：模型调 `artifact_create(kind, payload)` → 对应 producer（Dataview/Excalidraw/drawio/Extract/Reminder）校验 → `ObsidianMediaAttachmentWriter` 或 markdown writer → `ChatArtifactReceipt` → Resources/Outline 认 kind → `TurnExecutionReceipt.artifactIds` 回填。
- **消息动作 Retry variant**：Retry → 新 message 带 `variantGroupId` + `variantIndex` + `isActiveVariant=true`，旧同组 message `isActiveVariant=false`；history 只取 active；UI ‹N/M› 切换器切换 active。
- **消息动作 Branch**：Branch → 新建 conversation 带 `parentConversationId` + `parentMessageId`；UI 顶部 "Branched from" 链回。

## 3. 设置与失败恢复

- **配置真源**：`templates/config/model-routing.json`（Auto route）、`templates/config/artifact-create.json`（producer schemas + fence 校验规则）、`templates/config/media-generation.json`（media preset / route / cost / strings，含 edit codec）、`settings.ai.mediaDefaults`（用户覆盖层）；music licensing 文案在 `templates/config/settings.json` `mediaGeneration.presets.musicLicensing*`。
- **缺凭据**：`/` slash Generate 组的 image / edit / video / music / TTS 逐路由诚实禁用并显示原因（无 fal key / 无 OpenAI profile 分别不同 copy）；Settings 矩阵 `Not ready / missing-key / missing-profile / Not supported` 四态；Configure 按钮跳目标 tab；模型侧因工具不进列表而如实回答无能力。
- **Native 不可用**：`missing-profile` + `configureAction='profiles'` 真实跳转；Sora 只在配了 OpenAI profile + adapter 就绪时 route 显 available。
- **视频 / 音乐 / edit job**：Confirm 前零 provider 请求零扣费；失败保留 prompt 可 retry 可换 route；重启后 running job 凭 `providerRequestId/responseUrl` 恢复 poll，不可恢复标 failed（可 retry），awaiting-confirmation 保留，不留僵尸。
- **Structured artifact producer 失败**：任一 schema/写盘/validate 失败渲染 failed receipt，保留原始 content 支持 retry，不静默丢。
- **Reminder scheduler**：到期弹 Obsidian `Notice` 并把 reminder 文件 frontmatter `status` 从 `pending` 翻为 `done`，原位可编辑。
- **Runner 修复**：`run-test.js` 原 `require; setImmediate(exit 0)` harness 强杀 async 断言→假绿。改 `beforeExit` 自然退场 + `unhandledRejection` 硬失败 + 8s unref 宽限。同时暴露 6 个长期假绿失败并全部修复（含 `chunk_raw` 高亮回退生产 bug、`CopilotPickerContent` 生产回归）。

## 4. 测试与实机证据

### 4.1 自动化

- **测试全套**：**264/264 test files 绿**（编排者独立复跑），零挂起零真实失败。
- **构建**：`npm run build` 绿。
- **Interactive mock**：`node docs/gstack/chat-studio-interactive-2026-07-13/validate.mjs` 通过。
- **本轮新增 / 修复测试文件**（关键，均已在 `test/` 目录）：`model-router.test.ts`、`composer-source-truth.test.ts`、`composer-entry-semantics.test.ts`、`assistant-builder-lifecycle.test.ts`、`artifact-turn-association.test.ts`、`artifact-create-producers.test.ts`（15 场景）、`reminder-scheduler.test.ts`、`openai-image-edit-adapter.test.ts`、`fal-edit-payload.test.ts`、`media-edit-form-logic.test.ts`、`media-understanding.test.ts`、`openai-video-adapter.test.ts`、`openai-native-image-adapter.test.ts`、`openai-native-availability-probe.test.ts`、`message-variants.test.ts`、`conversation-branch.test.ts`、`harness-permission.test.ts`、`permission-chat-flow.test.ts`、`a11y-structure.test.ts` 等。
- **Runner 修复暴露并修复的假绿**：AgentLoop reasoning fixture、`highlight-source-resolver` `chunk_raw` 回退（生产 bug，按 2026-07-07 spec 修）、t11n/o/p/q 过时路径断言、`CopilotPickerContent` ui→app 真实回归（生产：`ServiceContext` 注入 `copilotActionRuntime`，floor 收紧回 0）。

### 4.2 实机（Obsidian 1.12.7，CDP 驱动，截图在 `/tmp/peak-acceptance/`）

- **Boot**：完成无 Chat Studio 错误（冷启动慢 = 既有全库索引维护，非本轮引入）。
- **COMP-01 单 Composer**：DOM 恰 1 Composer；空态 Composer 居中，Auto model 标签，starters 只填不发。
- **`/` slash 面**：WORKFLOW（Plan）+ GENERATE（Image generation / **Image edit** / Video / Music）；缺 key 全部诚实禁用 + 逐路由原因。
- **`+` 面**：仅三资源项（Files & images / Vault document / Link），生成动作已迁走。
- **Settings → Media Generation**：route / presets / **矩阵含 Op 维度**（Not ready / missing-key / missing-profile / Not supported）/ Validate 时间戳跨重启保留。
- **Usage → Outcome Value**：`Media generation · run detail` 区 + "Cost is a preset estimate — never a settled bill" 文案 + 空态。
- **Console**：无本轮新增未捕获错误；既有：PatternDiscovery OpenRouter 402 欠费（凭据问题，非本轮引入）、一条 IndexService 背景索引错误。

## 5. 凭据阻塞与遗留

### 5.1 凭据阻塞（credential-blocked · 代码全落地锁在测试里，等 owner 凭据实机）

见 [capability checklist §5.5](../../testing/chat-studio-capability-checklist.md#55-凭据阻塞项-credential-blocked-2026-07-21-晚) 完整表；关键项：

- fal 付费 image edit（`nano-banana/edit`、`flux-pro/v1/fill`）、video（`veo3.1`、`veo3.1/fast`）、music（`lyria2`）真实调用；
- OpenAI 付费 image generate（`gpt-image-1`）/ edit（`/v1/images/edits`）/ Sora video（`/v1/videos` submit/poll/download）/ transcription（`whisper-1`）真实调用；
- MEDIA-04 九步实机清单；
- CORS 实测（`app://obsidian.md` 到 OpenAI，若拦截换 Obsidian `requestUrl` 单点替换缝已留）；
- 真实流式 turn E2E（当前 OpenRouter 402 欠费，非本轮引入）。

### 5.2 诚实遗留（不算 zero-gap 完成的部分）

| 项 | 现状 | 下一波方向 |
| --- | --- | --- |
| `chatViewStore` 旧 source 字段单向镜像未全删 | port 仍读，composer→legacy 单向镜像 | 下一波把 port 消费者全迁 `composerStore` 后删旧字段 |
| allow-for-run 仅 `useStreamChat` 层强制 | run 级 allowlist 未下沉 harness | 后续把 allow-for-run 移入 `AgentLoop.permission` context，与 harness deny 语义对齐 |
| 原始拖拽附件（未入 vault）不能作 edit base | `MediaReferenceResolver` 需稳定 content identifier | 引入本地 draft cache，给未入 vault 的附件分配稳定 id 后即可 |
| 实机人工矩阵未跑部分 | Track 8 代理留了 10 条人工检查点清单 | detached popout 键盘全流程、light/dark 双主题、894/1440 视口、125% zoom、VoiceOver |
| "Generate document" 是 workflow fill 语义（非独立表单） | 沿用 workflow prompt fill | 若产品要独立文档 producer，需要单独 spec |

## 6. 变更清单（未 commit）

- **规模**：129 tracked files +13.5k / −11.9k + 新增文件（含 templates/config、新 tests、新 producers、Composer generate actions、Assistant builder Advanced 区、runner 修复）。
- **HEAD**：保持 `726f494a`（2026-07-20 三 commit 之后未再 commit）。
- **交付材料**：本文（`docs/superpowers/plans/2026-07-21-chat-zero-gap-closure-delivery.md`）+ [capability checklist 迁移](../../testing/chat-studio-capability-checklist.md) + [spec §17 状态标注](../specs/2026-07-15-chat-studio-complete-implementation-spec.md#17-requirement-验收矩阵) + [progress.md 2026-07-21 晚条目](../../progress.md)。

## 7. Owner 侧下一步建议

1. 审 diff（129 files）→ 拆 commit（建议按 Track 1-9 各 1 commit + Runner 修复 1 commit + 文档收口 1 commit，共 ~10-11 commit）→ 落 master。
2. 配 fal key / OpenAI profile / 充 OpenRouter → 按 checklist §5.5 凭据阻塞表逐项实机；MEDIA-04 九步作为最小 owner-side smoke。
3. 跑 Track 8 遗留 10 条人工 a11y / 视口 / 主题 / detached 矩阵（本轮代码 pass 未实测）。
4. 参考本文 §5.2 遗留表规划下一波（`chatViewStore` 旧字段清理 + allow-for-run 下沉 harness + draft cache 稳定 id）。
