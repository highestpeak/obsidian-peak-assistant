# Chat Runtime 与生成能力闭环 — 交付报告

日期:2026-07-21
状态:**delivered · 未 commit(待 owner 审 diff 后提交)**
规格:[2026-07-20-chat-runtime-capability-closure-claude-handoff.md](./2026-07-20-chat-runtime-capability-closure-claude-handoff.md)
读者:owner 与后续在 Chat/媒体链路上工作的实施者

> 本文是 handoff §9 要求的最终交付记录。11 个任务(Stage 0 审计 + Track A–E 拆分)按 subagent-driven 流程实施,每任务经独立 review + 修复回环,终审全分支 review 判定 **Ready to merge**。改动规模:115 文件,+18.4k/−0.5k(src/test/templates/main.ts/docs-testing 范围)。零 commit,HEAD 保持 `726f494a`。

## 1. 真实新增能力

| 能力 | 用户入口 | 实际路由 | 产物 | 规格对照 |
| --- | --- | --- | --- | --- |
| Chat 内生成图片 | Composer `+` → Generate image(route/model/数量/比例/预估费用表单);或自然语言触发 `media_generate` 工具 | preflight 一次性决策:Native OpenAI(真实 `POST /v1/images/generations`)/ fal / Auto;决策后不静默换计费方 | Vault 媒体目录 + 持久化 `ChatArtifactReceipt`(route/provider/model/jobId/estimated cost)→ 消息 gallery + 右栏 Resources | §5.4 R1 / §5.5 |
| 视频 / 音乐生成 | 同上(Generate video / Generate music;duration 受 config 上限) | fal durable async job:`awaiting-confirmation` → 成本确认卡(真实 route/model/时长/费用)→ poll → completed/failed/cancelled;重启可恢复 | 同上;进行中显示真实 job 状态,无假进度条 | §5.4 R4 / §5.5.4 |
| MCP 工具进 Chat | 已配置且已连接的 MCP server 工具自动进入 Agent 工具列表 | Harness ToolDef + PermissionGuard ask → 消息内 `PermissionAskCard`(允许/拒绝双向挂起) | Agent Run 时间线真实 step | §5.2 |
| Assistant 真实生效 | Composer assistant 选择器(原有 UI) | instructions→`AssistantSlot`;knowledgeRefs→context 流 + receipt `explicitRefsUsed`;toolPolicy→deny-first 过滤 + guard;preferredModel→conversation fixed > assistant > Auto | receipt 记录 effectiveModel / modelSource / 实际 refs | §5.3 |
| Web 假路由修正 | Sources 开关 | catalog `webSearch` metadata 不再抑制 fallback;native 判定单点接口(当前无 adapter = 恒不可用) | 来源保持文本提取限制的诚实标注 | §5.2 |
| Settings → Media Generation | 新 settings tab | 默认 route / fal key / 输出目录 / 逐 kind preset(music≠TTS)/ Native 支持矩阵(只声称 image)/ route×kind 可用性表 / Validate(纯本地校验+时间戳) | 所有 needs-configuration receipt 与菜单项的 Configure 按钮真实跳转对应 tab | §5.6 |

## 2. 运行时改造

- **双 loop 退役**:`ConversationService.streamChat()` 唯一运行时 = Harness `runAgentLoop`,经 `src/service/chat/harnessChatRunner.ts` 事件翻译层(harness event → `LLMStreamEvent`)。`AgentLoop` 从 `generateText` 升级为 `streamText` 流式引擎(`onStreamEvent` 单订阅点:text delta / tool input / tool result / step finish / permission / run status),typewriter 保留,VaultSearch/Copilot 等非流式调用方零破坏。
- **run id 贯通**:RunEnvelope = AgentLoop runId = trace debugRunId = `TurnExecutionReceipt.runId`(修复该字段从未填写的旧 bug);状态 completed/cancelled/timeout/failed(+ 运行期 waiting-permission)贯通。
- **端到端旧 bug 修复**:`useStreamChat` 吞 provider error 事件(→ ERROR 消息 + receipt + 可重试)、abortSignal 未传 fetch(→ 真实中止)、迁移途中发现并修复 outputControl 六个采样参数丢失回归。
- **媒体统一**:`MediaGenerationService`(唯一入口/唯一 Vault writer/唯一 receipt producer)+ `MediaJobService`(SQLite `chat_media_job` 状态机)+ `MediaJobRunner`(app 层,poll/取消/恢复,boot 时 resume **先于** failAllUnfinished);旧 `MediaRingService` 路径迁入,TTS/封面图命令兼容。
- **组合根**:MCPClientManager / MediaGenerationService / MediaJobRunner 全部 `main.ts` 组合注入,零新增 service 层 singleton。

## 3. 配置与失败恢复

- 配置真源:`templates/config/chat-runtime.json`(maxSteps/预算/超时)、`templates/config/media-generation.json`(preset/路由/估价/字符串)、`settings.ai.mediaDefaults`(用户覆盖层,merge 单点 = `composeMediaRuntime.loadConfigWithOverlay`)。
- 缺 fal key:`+` 菜单三入口诚实禁用(逐路由原因);Settings 表 `Not ready / missing-key`;Validate 给 fal dashboard 指引;模型侧因工具不进列表而如实回答无能力,不编造完成。
- Native 不可用:`missing-profile` + configureAction `profiles` 真实跳转;native 只声称 image。
- 视频/音乐:确认前零 provider 请求零扣费;失败保留 prompt 可重试可换 route;重启后 running job 凭 providerRequestId/responseUrl 恢复 poll,不可恢复标 failed(可重试),awaiting-confirmation 保留,不留僵尸。
- MCP 断连:availability `disconnected` + configureAction `mcp`,不出现假工具。
- 兼容:legacy 消息行/旧 receipt/空 data.json/旧 fal 命令均有测试;`chat_media_job` 幂等建表。

## 4. 验证证据

- 测试(编排者独立复跑):全套 **239/239**;handoff §8 指定 targeted(`chat-execution-strategy` / `chat-studio-contracts` / `harness-loop` / `media-ring-service`)4/4;`npm run build` 绿。新增 ≈25 个测试文件(characterization 8、harness 流式 12、availability 11、permission 4、assistant 23 slice、媒体域 40+ slice、legacy 兼容 5、状态矩阵 9 等)。
- Review:11 任务逐个 task review + 修复回环(8 轮 fix,含 3 个 Critical:跨重启 receiptId 断链、图片渲染 URI、outputControl 回归);终审全分支 review:§7 五条必达全达成、§3.2 八条禁止零违反、跨任务事件/receipt/config 零漂移。
- 实机 Obsidian 1.12.7(2026-07-21 截图逐面):reload 正常 boot(media runtime 组合 + job 恢复静默);`+` 菜单缺 key 诚实态;Media Generation tab 五段全渲染;Validate 真实(时间戳跨重启保留);"Generate an image" 真实 turn → 统一运行时流式 + Agent Run 真实 steps + 诚实拒绝;实机发现 2 个表格显示缺陷(fal Reason 空、fal/tts 误标 unsupported)当场修复并二次实机确认。
- 过程材料(审计矩阵/任务 brief/report/review diff/账本)在 `.superpowers/sdd/`(gitignored,本地保留)。

## 5. 未完成项目(诚实边界)

| 项 | 原因 | 证据 | 最小后续步骤 |
| --- | --- | --- | --- |
| fal / Native 真实付费生成端到端 | 无 API key 与计费授权 | adapter 合同已 mock 锁定(endpoint/auth/body/b64+url 双响应/错误映射) | 配 key 后按 [capability checklist](../../testing/chat-studio-capability-checklist.md) MEDIA-04 九步实机清单执行 |
| OpenAI native 的 `app://obsidian.md` CORS | 需真实 key 验证 | `OpenAINativeImageAdapter` 留 `fetchImpl` 注入缝 | 若被拦截换 Obsidian `requestUrl`(单点替换) |
| `fal-ai/lyria2`(music)/`veo3`(video)endpoint 占位 | 无法远端验证 | checklist 双处警告;Settings 可覆盖 | 实测后改 `media-generation.json` 默认值 |
| video/music 状态 = `PARTIAL` | MEDIA-03 门槛两项未做:Usage Dashboard 记录未接入、音乐授权/商用边界说明未写(门槛语句已恢复原文,升 AVAILABLE 属产品决策) | checklist MEDIA-03 | 接 Usage Dashboard 行 + 写授权说明,或 owner 明示豁免 |
| `approval:'always'` 仍自动放行只读工具 | PermissionGuard 分层设计,ask 模式对 read 工具 auto-allow | task-b2 报告 | 需要时扩展 `buildAssistantPermissionRules` |
| 12 项 accepted Minor | 终审逐项定夺非阻断(fal 无远程 cancel、单槽 permission ask、submitting 中间态等) | `.superpowers/sdd/final-review-minors.md`(本地) | 按需 backlog |

## 6. 追补（2026-07-21 晚）：video/music 完整化

交付报告 §5 中三项未完成项已闭合：

| 原未完成项 | 闭合方式 |
| --- | --- |
| `fal-ai/lyria2` / `veo3` endpoint 占位 | WebSearch 对照 fal 官方文档核实（[核查报告](../../research/2026-07-21-fal-endpoint-verification/README.md)）：`veo3` 已被 fal 废弃 → 默认改 `fal-ai/veo3.1`（+`fast` preset）；payload 三处 CRITICAL 修正（video `duration` 改 `"4s"/"6s"/"8s"` 枚举串、TTS 字段 `text`→`prompt`、music 删除无效 duration 字段）；`lyria2` 核实存在、商用标注、输出固定 ~30s；成本估算表按官方定价校准（video $3.20/8s、fast $1.20、music $0.10、image ~$0.0023）。真实付费调用仍待 fal key（checklist MEDIA-04）。 |
| Usage Dashboard 记录未接入 | `MediaUsageEmitter` port + 组合根闭包 dispatch `UsageRecordedViewEvent`（feature `media_generation`）；sync（image/TTS/cover）与 async（video/music）成功/失败双路径打点；`costUsd` 为预估且 `metadata.costConfidence='estimated'`；emitter 故障不影响生成。测试 4 slice。 |
| 音乐授权/商用边界说明未写 | Settings → Media Generation → Music 段 licensing note（fal ToS 不担保版权、SynthID 水印、平台/EU AI Act 披露、USCO 口径、TTS 条款独立），fal ToS 链接，文案 config 化（settings.json `musicLicensing*`）。 |

Checklist 更新：MEDIA-03 六项全勾，视频/音乐 `PARTIAL` → `AVAILABLE`（待实机验收）。
