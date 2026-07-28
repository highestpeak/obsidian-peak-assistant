# Audit 02 · Composer / Document Copilot / Ambient Push 现状盘点

> 2026-07-27 代码库实地盘点原稿（Explore agent 产出，HEAD `5a74b969`，与 HANDOFF.md 交叉验证，52+7 个相关测试实测全通过）。

## 1. Composer 形态与 block 模型

- 独立主区 ItemView：`DOCUMENT_COMPOSER_VIEW_TYPE`（`src/app/composer/viewType.ts:12`）、`DocumentComposerView`（`src/app/composer/DocumentComposerView.ts:28`）。**不触碰 CM6**，自建文本 splice 引擎。
- Block kind 约 20 种（`src/core/composer/types.ts:43-64`）：frontmatter/heading/paragraph/list/task/quote/callout/divider/code/math/table/image/mermaid/dataview/html/comment/footnote-def/embed/base/canvas/excalidraw + unknown。
- 扁平顶层 block 数组（无嵌套树，子级用 units/SubBlockAnchor 表示；`documentParser.ts:65-92`）。调度：`ComposerRoot.tsx:626-650` + `BlockKindView.tsx:31-71`。

## 2. Markdown round-trip：**verbatim-slice 架构，不是模型重序列化**（关键架构事实）

- `parseComposerDocument`（`documentParser.ts:57-92`）只定位字节偏移，block 内容永远是原样切片（:9-11 注释"从不重新序列化"）。
- 写回是纯文本 splice：`ComposerOperation`（replaceRange/insertBlock/removeBlock/moveBlock，`operations.ts:42-53`）→ TextEdit 降序应用（101-118）。
- 事务引擎三段保证（`transactionEngine.ts:138-183`）：revision 校验 → 原子应用 → **写盘前 re-parse 断言 `reconstruct(next)===nextText`** + block 计数校验，失败零字节落盘。
- **round-trip 测试存在且通过**：`test/composer-source-roundtrip.test.ts`（8 个 golden fixture g1-g8，字节级相等断言，覆盖 %%comment%%/callout/dataview/mermaid/excalidraw embed/wikilink/块级公式）+ native-roundtrip + source-truth + transaction-atomicity，实测 4/4 ✅。
- 局部序列化器例外（仍只产出替换文本）：表格（`tableModel.ts:224-226`）、canvas JSON（`canvasFile.ts:96`）、图片 caption（`imageCaption.ts:114`）、多图 layout HTML（`imageLayout.ts:172-217`）。
- **代价**：block 内部结构编辑能力取决于该 kind 是否有 parse/patch/serialize 三件套（表格/图片有，多数 kind 没有）。

## 3. Document Copilot：两条腿完成度天差地别

### 3.1 Block 级指令 morph + AI 快捷动作 —— 真实接线端到端可用
- `BlockActionRow.tsx:67-181` 原位 morph（`5a74b969` 修复项）→ `ComposerRoot.tsx:274-281` invoke → 7 个 capability pack 注册（`composeComposerCapabilityRuntime.ts:86-122`：prose/native/link/frontmatter/math/table/chart）→ 真实 LLM 流（`ComposerAiExecutorAdapter.ts:26-35` 走 IAgentPrompter.queryStream）。materializer/writeback 测试全过。

### 3.2 Sidecar 自由文本 Copilot 会话 + Findings —— **UI/状态机建好但生产无驱动器，死路**
- `SessionView` 输入 → `CopilotSessionMachine.send()`（`runSession.ts:198-224`）**只冻结上下文、置 receipt 为 'assembling' 就结束**。
- 推进状态的 `markStreaming/markProposed/markNoChange/markError/markCancelled`（`runSession.ts:232-276`）**全仓生产代码零调用**（grep 验证）→ 用户发消息后永远卡在"组装中"，不调 LLM、无返回。**比死按钮更隐蔽的"假可用"——全插件唯一违反 "disabled — never fake" 纪律的地方**。
- Findings 管道同样空：`ingestFinding()`（`IntelligenceRuntime.ts:52-62`）生产零调用 → Brief "接下来可能要做"恒为空。
- 健康部分：Brief 的"相关材料"真实调用 `client.vectorSearch`（`ObsidianComposerAdapters.ts:250-278`）。
- 与 HANDOFF.md:94 自评吻合且更严重（不是"不完整"，是"完全未接线"）。

## 4. Ambient Push 现状

- **触发**（`ObsidianAmbientEditorContextAdapter.ts:93-212`）：editor-change 防抖（minCharDelta + writingPauseMs）→ writing_pause；file-open → doc_switch；manual。跳过 Hub-Summaries/AI-Analysis 路径。
- **计算**（`AmbientPushRuntime.handleTrigger`，117-241）：短段落跳过 → AmbientSearcher 混合信号（tag 共现/图邻接/co-citation/hub 聚类/语义近邻/加权学习）→ projection.setItems → 可选 top1 LLM 微解释 → 推送历史去重。
- **呈现层默认全静默**（`DEFAULT_AMBIENT_PUSH_SETTINGS`，`ambient.ts:75-89`）：`enabled:true` 但 `showStatusBar:false, enableSerendipityGutter:false, enableMorningBriefing:false`。产品方向注释：`RelatedNotesView.ts:8-11`"替代旧的抢注意力状态栏+晨间弹窗"。
- UI 形态清单：① 侧栏 RelatedNotesView（唯一默认可见入口，仅命令面板打开，无 ribbon）；② CM6 serendipity gutter（默认关）；③ 晨间简报 Modal（默认关，接线完整，`main.ts:940-957` + 4h 冷却门控）；④ 状态栏文本（默认关）。
- **三个开关没有任何 Settings UI**（grep 验证）——只能手改 data.json。
- 测试：数据层有 580 行集成测试（`ambient-runtime-ports.test.ts`）+ 540 行纯函数单测；**UI 呈现层零测试**。

## 5. 问题清单

| 位置 | 问题 |
|---|---|
| `runSession.ts:232-276` | Copilot 会话死路（mark* 零生产调用，发消息永远 assembling） |
| `IntelligenceRuntime.ts:52-62` | ingestFinding 零生产调用，Brief findings 恒空 |
| `BlockKindView.tsx:51-52` | image 分支死代码（被 ComposerRoot.tsx:646-648 提前接管） |
| `imageLayout.ts` | **两套互不识别的 layout 格式**：AI 生成 `pk-image-layout`/`data-pk-layout`/row-grid-masonry-hero-thumbs vs vault 手工 `peak-image-layout`/`data-layout`/grid-hero-strip-story（且强制恰好 4 个 figure，:120）→ AI 生成的布局块在 Composer 内落 MonoView 纯文本展示，无法富渲染/编辑。HANDOFF.md:88 的代码根因 |
| Settings 全目录 | Ambient 三开关无 UI |
| `main.ts:91-105, 940-956` | 晨间简报路径遗留 [MEM] 调试日志 |
| `EmbedBlockView.tsx:19-58` | `![[photo.png]]` bare wikilink embed 不显示真图（只引用卡片；HANDOFF.md:87 吻合） |
| HANDOFF.md:85,112 | **跨块选择不可用，属回归** |

TODO/FIXME 标记：composer/ambient 目录零命中——未完成项以"disabled + 原因提示"表达（如 `MathBlockView.tsx:97-98`），纪律良好，唯一例外即 Copilot 会话框。

## 6. 渲染完成度

- **math**：高。KaTeX 卡片 + 4 格式复制 + 解释/拆分/变量表 AI 面板；行内 `$...$` 投影引擎（`inlineMathProjection.ts:128-155` 正确避开代码 run/双美元/转义）→ InlineMathAtom（`061412de`）。
- **image（`![]()` 标准语法）**：高。真实 img + 失败兜底 + caption + AI 改图/配文（`ImageBlockView.tsx:90-96`）。
- **embed（`![[...]]`）**：引用卡片非真图。
- **native（.base/.canvas/.excalidraw）**：真实 JSON 解析的结构摘要卡（`CanvasBlockView.tsx:5-8` "绝不是占位图"），但保真度低于设计稿（HANDOFF.md:93）。

## 7. 编辑能力矩阵

| 能力 | 状态 |
|---|---|
| 表格编辑 | 完整（增删行列/对齐/排序/合并拆分/转置/CSV/图表/AI 五动作，`TableToolbar.tsx:64-189`） |
| 粘贴图片 | 完整（位图检测+原子事务，`pasteImage.ts:36-48`；URL 粘贴另一路径 `ComposerRoot.tsx:325-372`） |
| 拖拽块重排 | 完整（`ComposerRoot.tsx:284-322`） |
| 折叠 | 实现（纯视图态不写 markdown，标题级联折叠 section，`foldStore.ts`） |
| 复制块 | 完整（EasyCopyMenu 按 kind 区分 markdown/富文本光栅化） |
| 跨块选择 | **不可用（回归）** |
| 评论 | 完整（锚定 overlay，测试过） |
| 撤销/重做 | 完整 |

## 8. 测试密度对比

Composer：52 个测试文件全过（含视觉契约类）。Ambient：6-7 个文件（多纯函数），UI 层零测试。测试投入密度与完成度差距吻合。
