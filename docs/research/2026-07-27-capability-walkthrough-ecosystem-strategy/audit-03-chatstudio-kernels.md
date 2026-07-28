# Audit 03 · ChatStudio / Copilot 对话 / 三大共享内核 现状盘点

> 2026-07-27 代码库实地盘点原稿（Explore agent 产出）。所有结论带 file:line。

## 1. ChatStudio 入口与管线

- 注册：`ViewManager.ts:41-43` → `ChatStudioView.ts:16-32`；命令 "Open Chat Studio"（`manifests.ts:100-102`）；打开逻辑含提升旧 leaf/popout（`ViewManager.ts:186-249`）。
- 组件树：`chat-studio-view/ChatStudioView.tsx:38-230` 只是三栏外壳；左=ProjectListView（:180）、中=`ChatViewComponent`（:208，来自 chat-view）、右=ConversationIndex（:224）。布局逻辑 `chatStudioLeftLogic.ts`（205 行）+ `chatStudioLayoutStorage.ts`（持久化）。
- 流式管线：`useStreamChat.ts:210/359` → `chatDataStore.ts:262-288`（**rAF 打字机缓冲**+completeStreaming flush）→ `useChatSubmit.ts:78` 原子 commit → `MessageListRenderer.tsx:26-143` → `MessageViewItem.tsx`（1325 行，reasoning 折叠/工具摘要/action registry）。

## 2. chat-view vs chat-studio-view：**chat-view 不是 legacy，是共享引擎；真正的 legacy 三 leaf 布局仍在且是默认入口**

- `chat-view/` 74 个文件是全部业务实现；`chat-studio-view/` 仅 3 个文件外壳。
- 旧版 `ChatView`（'Peak Chat'）仍注册（`ChatView.ts:9-22`），渲染同一 `ChatViewComponent`。
- **唯一 ribbon 图标 "Open Peak Assistant"（`ViewManager.ts:90-94`）调用 `activateChatView()`——旧三 leaf 布局（中心 CHAT_VIEW + 左 PROJECT_LIST + 右 CONVERSATION_OUTLINE，`ViewSwitchConsistentHandler.ts:61-138`），不是 Chat Studio**。Studio 只能靠命令打开。
- `openChatStudio()` 会提升/清理旧 leaf（197-233），但三个旧视图类型仍注册可被重新拉起——**两条壳并存**。

## 3. Copilot 对话 UI vs ChatStudio 消息渲染：**0% 复用，四套实现**

| 位置 | 消息渲染 | 输入 | 数据 |
|---|---|---|---|
| ChatStudio | MessageViewItem（1325 行）+ MessageListRenderer | PromptInput 内核 | chatDataStore + useStreamChat |
| `copilot/review/InsightInlineChat.tsx`（279 行） | 自写 span + StreamdownIsolated（206-236） | **裸 textarea**（250-263） | 局部 state 直调 `manager.queryTextStream`（126-181），不持久化（文件头 1-11 自注） |
| `CopilotCommandCenterModal.ts` | 静态计划列表 | 裸 Modal textarea（:48） | 孤儿入口 |
| `composer/sidecar/CopilotView.tsx`（377 行，**与 copilot/ 同名不同物**） | RunReceiptCard（99 行） | PromptInput（317-335） | sidecar session runtime |

`copilot/` 其余 25+ panel 是一次性结果展示面板（`TextStreamPanel.tsx:55-100`），非多轮消息流。

## 4. PromptInput 内核实际共用情况

- 内核：`src/ui/component/prompt-input/`（8 文件）。
- 消费方恰好两个 surface：chat adapter（7 文件，`Composer.tsx` 等）+ composer sidecar（`CopilotView.tsx:13,317-335`）。
- 与 `docs/conventions/prompt-input-consistency.md` 对照：声明的 source of truth 与现状一致、引用文件都存在；**差距**：约定说"未来所有 AI 输入面共享内核"（:5），但 `InsightInlineChat` 的裸 textarea 不在治理范围——事实上存在第三套不受治理的输入实现。
- 语音：约定 :88 列 voice-to-draft 为未来扩展、:102 禁止 Web Speech fallback 成为生产事实——与"未实现"现状吻合（刻意搁置非遗漏）。

## 5. result-browser

- 模式：list / graph / tree（`model/types.ts:19`）；graph 5 preset：constellation/flow-tb/flow-lr/folder/orbit（`ResultBrowserToolbar.tsx:22-28`）。自称 "single production UI source of truth"、host-neutral（`index.ts:1-7`）。
- 消费方仅 2 host：Quick Search（adapter+三视图）、Composer sidecar（`ComposerResultBrowserAdapter.ts`、`RelatedMaterialsModal.tsx:106-160` 三视图全用）。ChatStudio/Copilot/AI Analysis 均未消费。

## 6. 语音输入：确认不存在

- `Composer.tsx:44-45` 注释原文："No Mic（no transcription runtime）… fake controls were removed per RUN-07"。
- 全库 grep SpeechRecognition/MediaRecorder/getUserMedia/Mic：零命中。
- 唯一 transcription 是**音频文件附件**转写降级门禁（`OpenAITranscriptionAdapter.ts` + `understandingGate.ts:32-90`），非录音入口。

## 7. TODO / stub / 死按钮 / 孤儿入口

| file:line | 问题 |
|---|---|
| `copilot/CopilotPickerContent.tsx:149` | TODO(Phase D)：诊断按钮只 setShowAll，不跑真实诊断 |
| `copilot/PickerReadinessAdapters.tsx:263-268` | TODO(Phase D)：settingReadiness 返回硬编码假 chip（"index ready"/"1 model warning"） |
| `copilot/CopilotResultContent.tsx:439` | 死按钮：onCreateProposal 只弹 Notice('not wired yet') |
| `chat-view/components/composer/ComposerSourcesPopover.tsx:16-18` | Vault Search 开关故意禁用（有 disabledReason，合规未完成态） |
| `PeakCommandActions.ts:347-364` + CopilotCommandCenterModal 整文件 | 孤儿入口（唯一 addCommand 循环不含它） |
| `PeakCommandActions.ts:97-99`（openCopilotPanel → CopilotPickerModal → copilot/ 面板树） | **孤儿入口：`src/ui/view/copilot/` 下 25+ 面板组件 + service/copilot 大部分服务在已注册命令/菜单/ribbon 体系里无确认可达入口**（已核查 main.ts import、ViewManager、Register.ts、editor-menu/file-menu） |

## 8. 测试覆盖

- chat-studio ×10 文件（纯逻辑断言）；copilot ×10+（服务/模型层；**InsightInlineChat / CopilotResultContent UI 零测试**）。
- result-browser：contract + host-parity（只覆盖现有 2 host）。
- PromptInput 组件本体无独立测试（仅纯函数间接覆盖）。
- conversation-outline-view 无专属测试（20 行包装）。
