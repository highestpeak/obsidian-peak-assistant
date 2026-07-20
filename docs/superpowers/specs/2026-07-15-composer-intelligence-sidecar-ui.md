# Composer Intelligence Sidecar UI Contract

Date: 2026-07-15 · revised 2026-07-20

## Goal

Composer 右栏不是第二套编辑器，也不是 AI 功能卡片墙。它是一条贴着正文工作的窄 sidecar。用户可见顶层只有 `Copilot / History`：Copilot 是一个连续协作者，按任务生命周期呈现默认的主动建议 brief、围绕具体任务的协作 session，以及运行产生候选改动后的临时 Review；History 承载已经接受写入的事务、diff、定位和回滚。

Ambient 保留为 Copilot 背后的感知 runtime，并投影为 Copilot brief 中持续排序的建议、材料和未安放想法。Ambient 是主动性的来源，conversation 是协作媒介，composer 是输入控件，Review 是 pending transaction state；它们不是并列产品 tab。用户不需要理解 Ambient、Current Work State 或 trace 等内部合同名，也不需要在永久的 `工作台 / 对话` rail 中管理模式。

旧设计中的 `Changes / Insights / Sources / Trace` 只保留为**每一次 Copilot Run 的局部产物分类**。它们不恢复为产品级永久 tabs，也不与 Copilot、History 并列。问答流中的同一条 run receipt 既是 compact 摘要，也是可原位展开的 artifact browser；普通产物始终留在这条消息里。

## Capability Sources and Ownership

| Source | Stable product meaning | Runtime / product projection |
| --- | --- | --- |
| `docs/16-feature-document-copilot.html` | 对当前文档解释、改写和调用工具 | Copilot |
| `docs/superpowers/specs/2026-05-16-copilot-command-center-final-ux-flow.md` | 用户留在当前笔记；agent 选择工具；写入前 review | Copilot |
| `docs/14-feature-ambient-push.html` | 低打扰主动发现；可忽略；不抢占编辑 | Ambient runtime → Copilot `编辑建议` projection |
| `docs/superpowers/specs/2026-06-02-ambient-push-current-work-state-product-technical-review.html` | Current Work State、Recent Work Trace、Session Thought Trace | Ambient runtime → Copilot `编辑建议` projection |
| `docs/superpowers/specs/2026-07-15-composer-block-ai-capability-contract.md` | 固定块操作、上下文建议、增量生成与事务边界 | Copilot execution + History transaction |

内部 ownership 必须继续分开：Ambient 推断和排序，Copilot 装配和执行，History 记录已接受事务。合并的是用户界面，不是把三条 runtime 链路揉成一个状态对象。

## Shared Shell

- 顶部只保留产品名、同步状态和 `Copilot / History` 两个 tab。
- Copilot 默认展示针对当前对象的 brief。选择建议、能力或输入问题后进入以任务命名的 session；只有 run 产生候选 patch 时才进入临时 Review。返回和前进必须保持明确的层级关系，并保留 brief snapshot、session draft/chips/thread、review progress 和各自滚动位置。
- Progressive queue navigation 默认静默：没有 active session 且没有 review work 时不显示第二层导航。只有存在进行中任务或待审改动时，才可显示紧凑的 `建议 / 进行中 / 待审` 队列入口，帮助用户在仍然存活的工作之间切换。
- 背景、边框、圆角、字体和正文使用同一套 restrained token；禁止蓝色整栏底色、多层 card 套 card 和等权功能墙。
- 宽屏是稳定右栏；低于 `1180px` 是从右侧滑入的 fixed drawer。侧栏不得进入文档流或出现在正文末尾。
- AI 感来自知道当前对象、自动带入上下文、原位更新建议、显示真实运行状态和把结果送回正文，不来自装饰性渐变。

## Copilot

Purpose: keep the current editing work visible, turn explicit intent into a task, and review every proposed write before it becomes history.

Copilot 是一个状态驱动的连续界面，不使用永久的 `工作台 / 对话` 二级切换：

1. `brief`：默认状态，标题使用 `针对「当前对象」的建议` 一类对象导向文案；纵向展示持续排序的下一步、相关材料和未安放想法。这里不显示完整 composer。
2. `session`：用户显式提问、选择建议/能力或点击 `带入 Copilot` 后进入。session 使用实际任务命名，例如 `补清为什么结果必须回到正文`；只有这里显示 thread、quick capabilities、composer、语音和运行入口。
3. `review`：只有 run 产生一个或多个候选 patch 后才进入。它显示一个临时 ProposedChangeSet 的当前改动、进度、定位和处理动作，不是永久导航分类，也不能在没有 pending change 时出现。

`session -> brief` 只允许用户显式返回；清空草稿、运行完成或 Ambient 后台刷新不得让界面来回跳。brief、session 和 review 分别保留 snapshot、draft、chips、caret、thread、当前 change 与滚动位置。Review 完成或关闭后返回产生它的 session，而不是跳到 History 或新建对话。

### Task collaboration session

- thread 只在 `session` 显示。brief 中的后台变化不会自动把用户切到 thread。
- 对话流区分用户指令、AI 回复、工具/上下文反馈、运行状态和事务回执，不把所有事件伪装成同一种 AI 气泡或企业卡片。
- 用户指令包含不可变的正文引用：目标块标题、范围和摘录；点击引用可定位正文。
- live context system event 会随当前块、选区和自动关联原位更新；发送时冻结成 immutable run snapshot。之后的光标变化只影响下一轮。
- Ambient 后台 snapshot 更新本身不属于 thread event，不得把每次刷新持续追加成聊天消息。但当 runtime 判定一条新线索与**当前 active session** 直接相关并决定向用户显式呈现时，它必须成为普通 `recommendation` message item，进入现有时间线，而不是进入另一套 session clues surface。
- session 标题来自当前任务，不使用泛化的 `对话` 作为页面名。新线索 message 直接显示一句预览、来源/为什么相关和状态；用户可在该条消息自身原地展开长内容、忽略，或点击 `带入下一轮` 把它装配为下一次发送的 context/action chip。带入只更新 composer，不自动发送或运行。
- 同一个 clue ID 在 thread 中只拥有一个 message item；后台补充证据时原位更新。禁止另建 `session-clues` 列表、悬浮 shelf、抽屉或外置详情面板来展示同一批线索。
- 结果必须回到正文原位，接受、丢弃、还原和继续编辑都发生在正文；对话只保留定位与事务摘要。

### Per-run artifacts, receipt, and message browser

每次显式发送或允许的自动运行创建一个有稳定 `runId` 的 Copilot Run。Run 可以产生四类局部产物，但这些名称不是全局导航：

- `Changes`：本轮生成的 `ProposedChangeSet` 与各个原位候选；
- `Insights`：本轮可复述、可定位的关键判断或发现；
- `Sources`：本轮实际读取、引用或验证过的材料；
- `Trace`：本轮可验证的动作、状态与产物回执。

问答流不把四类产物拆成新的消息或卡片。一个 run 在原位置更新一条 compact receipt，至少说明状态、动作、目标、耗时以及 change / insight / source 数量，并在有价值时直接显示一条关键 insight。展开后仍是**同一条 Copilot 消息内的 run artifact browser**：`Changes / Insights / Sources / Trace` 在 receipt 内切换，当前分类的条目立即出现在下面；长 insight、source excerpt 和 trace group 使用 inline disclosure / `展开全文`，继续占用 thread 的同一个 body scroll，不建立嵌套滚动区。

普通 change、insight、source 和 trace 条目不得打开 modal、新页面或第二个工作台。change 条目负责定位正文原位候选，source 条目负责打开/定位来源，trace 条目只展开其可验证回执。只有关系图、超宽结构预览或其他确实无法在窄 thread 中理解的空间型 artifact，才可通过显式 `打开宽视图` 进入宽幅 explorer；关闭后恢复到原 receipt、原分类和原条目。

Trace 不是 model reasoning viewer。它默认折叠，只允许展示可核验事实：capability/tool 名称、开始/结束/取消/失败状态、输入 source reference、输出 artifact、验证结果和错误回执。不得展示 hidden prompt、raw reasoning、thinking token、chain-of-thought 或把模型自述当作事实。`Fast Lookup` 只是一项 runtime strategy/latency metadata，不是用户可见功能名、section 或 tab；用户看到的是实际 Sources 和检索回执。

Run record 与 History transaction 是两个对象：Run record 为消息内 artifact browser 提供本轮问答、产物和未接受结果；History 只记录已经发生的写入。Run record 保存 `acceptedTransactionIds`，每条 History transaction 保存 `originRunId / changeSetId / changeId`；用户可以从 receipt 内的 change 条目打开对应事务，也可以从 History 返回并定位来源 receipt。双向关联不能把多个 accepted changes 合并成一条不可独立定位或回滚的事务。

Run artifact browser 验收：

- 一个 `runId` 在 thread 中始终只有一条 receipt；stream/status 更新原位替换，不追加镜像消息。
- 展开 receipt、切换四类产物和展开长条目都不改变 URL、Copilot lifecycle、composer draft 或 thread scroll owner。
- 切换分类后该类首批条目立即可见；长列表显示总数并使用增量加载或虚拟化，不靠固定三条截断。
- 普通条目操作不创建 dialog；Change 定位正文，Insight/Trace 原位展开，Source 定位来源。宽视图入口只在 artifact 声明 `requiresSpatialView` 一类明确空间需求时出现。
- 从 History 返回可聚焦对应 receipt、选中 `Changes` 并展开关联 change；从 receipt 打开 transaction 后仍能返回原分类、原条目和滚动位置。

### Capabilities next to the composer

- quick capabilities、全部能力 picker、voice 和完整 composer 只属于 `session`；brief 不显示输入壳，review 使用专用 navigator/actions 而不是普通 composer。
- 当前对象默认只推荐 2–3 个能力；`全部能力` 固定在推荐行最右侧，不参与推荐排序或换行。
- capability picker 在 composer 上方打开，支持搜索、分组、当前推荐和 disabled reason。
- 选择能力只生成 action chip；选择文本、链接、链接图谱、并行内容或相关材料只生成 context chips。
- 选择建议或能力不自动调用模型。用户可以继续输入或语音补充，真正发送时才冻结上下文并运行。
- 运行状态进入 session，候选进入正文与临时 Review，已接受写入才进入 History。

### Shared Prompt Input Contract

- Chat Studio `index.html` / `composer-lab.html` 是输入壳视觉基线；生产共享内核是 `src/ui/component/prompt-input/`。完整规则见 [`Prompt Input Consistency`](../../conventions/prompt-input-consistency.md)。
- Intelligence composer 必须复用同一套 token、单层 focus owner、14px editor inset、context shelf、footer divider、icon/send 尺寸、trigger registry、键盘与 picker 语法。内部 input 不得绘制第二层 outline。
- Sidecar 只适配窄栏宽度、横向 context chips、action chip、voice-to-draft、focused document scope 与 immutable run snapshot；不得导入 Chat-specific store、draft、submit hook 或 conversation runtime。
- 语音只转成可编辑草稿，包含 requesting / listening / transcribing / error / cancel 状态；绝不自动发送。
- `Enter` 发送，`Shift+Enter` 换行，IME composition 期间不提交。

## Proactive Brief inside Copilot

Purpose: infer and continuously organize the user's current editing work without creating a third product surface.

- 用户可见名称使用 `针对「当前对象」的建议` 或具体写作任务，不展示 Ambient、工作台、Current Work State、Recent Work Trace、Session Thought Trace 等内部术语。
- brief 是 Copilot 的默认、完整、可滚动 body，并占满主导航以下的可用高度；这里不显示完整 composer。它不是 composer 上方的有限高度 shelf，也不是后台 dashboard。
- `接下来可能要做 / 相关材料 / 还没安放的想法` 按固定顺序纵向同时存在，不使用分类 tab，也不默认只展示其中一类。
- 三类都支持长列表，没有“每类最多 3 条”或“全局最多 2–3 条”的产品上限。默认视口可以只渲染每组最高优先级摘要，但必须显示总数和明确的完整列表入口；生产长列表使用分页、增量加载或虚拟化。
- 只有 session composer 附近的 quick capabilities 维持 2–3 项限制；它与 brief 的候选数量无关。
- Current Work State 不恢复为大诊断模块，只用一句人话说明当前正在整理的对象；只有低置信且会显著改变排序时才出现可纠正确认。
- 每条建议直接给一句人话原因。详细 Recent Work Trace 只在用户点击 `为什么这些排在前面？` 后按需展开。
- `更新排序` 保留旧 snapshot，后台完成后 latest-wins 原位替换，并显示新增、归档、重排或无变化回执；不得切换到 session、追加聊天消息或抢占 review。
- 查看、忽略、刷新和展开留在 brief；`带入 Copilot` 装配 action/context chips 并进入任务 session，但不自动运行、不直接写正文。
- brief 使用一个 body scroll；禁止为三个 section 建立三个嵌套滚动区。narrow drawer 的 brief 同样不显示完整 composer；进入 session 后 composer 才固定在 viewport 底部。
- 进入 session 后继续保留 brief snapshot 与滚动位置；显式返回时恢复现场。
- 忽略、预览、刷新和未执行的带入不进入 History。

### Related-material evidence graph

`相关材料` 不是一排置信度卡片，也不是新的 Graph 工作面。它在同一 brief section 内提供两层渐进披露：

1. **局部图**：侧栏只展示当前正文对象、5–7 个最强材料节点和主要连接。弱关联默认隐藏；点击节点只原位更新一条材料详情，说明标题、路径、关联理由、分数及 `查看来源 / 带入协作`。它不改变 Copilot stage、不自动运行能力，也不直接写正文。
2. **宽幅探索器**：`放大关系图` 打开明显宽于 sidecar 的 modal。大图与局部图共享 selection 和 source IDs；主区用于关系探索，右侧 inspector 解释当前节点。窄屏 modal 接近全屏，inspector 移到图下方，不产生横向页面滚动。

视觉与交互语义沿用 Vault Search Graph：区分当前对象、普通材料、弱关联、引用实线和 Semantic 虚线；preset 精确锁定为 `constellation / flow-tb / flow-lr / folder / orbit`。切到 Orbit 自动打开 Semantic，切到其他 preset 自动关闭；Semantic 只切换已索引语义边，不调用模型、不走网络、不消耗 AI credit。explorer 支持 wheel/pinch zoom、drag pan、真实 fit、悬停邻域、节点选择、复制当前可见关系为 Mermaid，以及复制当前完整布局为 PNG。不得复制完整 Vault Search 搜索工具条，也不得为了复用而把搜索 store 直接嵌入 sidecar。

关系图操作边界：

- `查看来源` 打开或定位 Vault 来源；`带入协作` 只装配 context chip 并进入 task session。
- 节点选择、preset、Semantic、缩放、pan、fit、导出、预览和关闭都不进入 History。
- modal 支持 Escape、关闭后恢复 opener focus；节点和布局选择必须可键盘操作。
- 不新增顶层 Graph tab，不让完整 Vault graph 永久占据窄 sidecar，也不把每个节点包装成 card wall。

### Vault Graph 同源与可复用 Surface 合同

“Lab 已抽成独立文件”不等于“生产已经复用 Vault Search Graph”。当前状态必须按层说明：

| 层 | 当前状态 |
| --- | --- |
| Lab graph | 已验证交互；fixture data、静态坐标与 vanilla renderer 不进入生产 |
| Vault Search subgraph | 已实现；`resultSubgraph.ts` 是 structural graph source |
| Vault Search graph host | 已实现但绑定 search store/context；不能原样嵌入 Composer |
| Shared controlled surface | 生产目标，尚未实现 |
| Composer graph adapter | 生产目标，尚未实现 |

生产“同源”定义：

- brief 局部图和 explorer 消费同一个 immutable snapshot `revision`；打开 explorer 不重新 query 或 build graph。
- compact 是同一 snapshot 的有界 projection，其 node IDs 必须是 explorer node IDs 的子集；selection 在两层按稳定 node ID 同步。
- `ResultSubgraphOutput.overflowCount` 只表示 builder node-cap overflow，不能冒充 compact 隐藏数量。
- Vault document/hub 使用真实 graph node ID；Composer block locator 放在 `focus.anchorId`，不能伪装成 Vault source/node ID。
- Composer 的关联理由和 weak overlay 放在 app-owned envelope；正式 edge kind 保持 `reference | semantic | hub_constituent`，不能发明 `weak` edge kind。

拟议 production API（尚未实现）：

```ts
type ResultGraphPreset =
  | 'constellation' | 'flow-tb' | 'flow-lr' | 'folder' | 'orbit';

interface ComposerRelatedGraphSnapshot {
  revision: string;
  focus: { anchorId: string; rootNodeId: string };
  graph: ResultSubgraphOutput;
  sourceIdByNodeId: Readonly<Record<string, string>>;
  reasonBySourceId: Readonly<Record<string, string>>;
  weakNodeIds: readonly string[];
  weakEdgeKeys: readonly string[];
}

interface ResultSubgraphSurfaceProps {
  graph: ResultSubgraphOutput;
  projection: { kind: 'compact'; nodeLimit: number } | { kind: 'explorer' };
  rootNodeId?: string;
  selectedNodeId: string | null;
  preset: ResultGraphPreset;
  showSemantic: boolean;
  showWeak: boolean;
  onSelectedNodeIdChange(nodeId: string): void;
  onPresetChange?(preset: ResultGraphPreset): void;
  onShowSemanticChange?(visible: boolean): void;
  onShowWeakChange?(visible: boolean): void;
}
```

Shared surface 只负责 Cytoscape lifecycle、element projection、layout、selection、keyboard 与 viewport。Vault Search host 继续负责搜索 store、toolbar、copy 和 hub navigation；Composer host 继续负责 source inspector、`查看来源`、`带入协作` 与 task session。`MultiLensGraph` 属于另一套 AI-analysis graph domain，不是这里的数据或组件合同。

### Internal source mapping

| Internal contract | Brief section | Rule |
| --- | --- | --- |
| Current Work State | `正在整理「当前段落」` scope hint / 低置信确认 | 高置信时弱化，不做 dashboard header |
| Open Writing Moves | `接下来可能要做` | 动作优先，显示总数、排序和点击后会发生什么 |
| Evidence Source / AmbientPushItem | `相关材料` | 局部证据图 + 可展开宽图；标题、路径、关联理由、查看、带入、忽略，不只显示置信度 |
| Session Thought Trace | `还没安放的想法` | 保留原句或摘要和可能落点；永远不是 todo |
| Recent Work Trace | `为什么这些排在前面？` | 默认折叠，按需显示当前块、最近编辑和链接信号 |
| Morning Briefing | 当前写作相关候选来源 | 不再拥有常驻栏目；无关 Vault 变化不进入 sidecar |
| Deep Check | capability picker | 用户显式选择后才运行 |
| Serendipity | 最多一个弱探索项 | 必须解释结构桥接，默认弱化 |

Ambient runtime 不拥有聊天历史、块工具、accepted patch 或回滚。brief 是它在 Copilot 中的产品投影，不是新的 runtime owner。

### Sensing policy is not execution policy

感知频率与能力执行必须是两条独立设置：

- `off`：不做主动 brief refresh；用户仍可显式提问、选择能力和手动刷新；
- `smart`：默认策略，只在对象切换、相关编辑、链接变化或预算允许时增量感知；
- `continuous`：更持续地更新 proactive snapshot，但仍只更新 brief，不自动创建聊天消息、能力 run 或正文写入。

`auto-run` 是独立于上述三档的 execution policy，默认关闭。即使用户显式开启，也只能启动符合策略的只读分析或生成候选，结果仍进入 run receipt、正文原位 preview 和 Review；它永远不能 auto-accept、auto-commit 或绕过用户确认写入 Markdown/native source。切换 sensing 档位本身也不能隐式改变 auto-run。

## Proposed Change Set and Review Navigator

Purpose: make every pending write locatable, reviewable and reversible before it becomes History.

A Copilot run may create one `ProposedChangeSet` containing one or more `ProposedChange` records in document source order. A suggestion is not yet a change: brief items remain reorderable/ignorable discovery objects until a capability run produces a typed patch.

Each change set contains:

- a stable `changeSetId`, `runSnapshotId`, task title, ordered change IDs, current change ID and set status;
- one or more changes with stable `changeId`, target object/source range, frozen source snapshot, typed patch, preview mode and `pending / accepted / rejected / stale / error` status;
- enough provenance to return to the originating session and group accepted History transactions without merging their individual locations.

Review behavior:

- Run 开始后，候选必须在真实正文 anchor 原位出现并随 token/source patch 流式更新：文本直接在段落上展示候选与 diff，插入/结构/native 结果挂载真实 draft object 或重渲染 preview。sidecar 不复制一份脱离正文的结果卡。
- 第一项候选可审阅后即显示 `改动 N / Total`、`上一处 / 下一处` 和当前项 `接受 / 拒绝`；后续候选到达时按 source order 稳定插入。仍在 streaming 的候选可以停止或拒绝，但完成并通过 source-revision 校验前不得接受。
- The navigator always shows `改动 N / Total`, `上一处` and `下一处`. Navigation follows document source order, synchronously scrolls/focuses the editor target and updates the sidecar explanation.
- The editor-local review surface is the source of truth. Text uses a unified inline diff; list/table/formula transforms use vertical original/proposed objects; insertions mount real draft objects; native files re-render their typed patch.
- Current-change actions include `接受`, `拒绝` and `编辑后接受`. Batch actions such as `全部接受` must expose scope and require confirmation when the set crosses objects or files.
- Accepting or rejecting the current item automatically advances to the next pending change. The user may navigate back to already handled changes without changing their status silently.
- If the current target no longer equals its frozen source snapshot, the change becomes `stale`; Review must explain the conflict and must not destructively overwrite later edits.
- Pending, rejected, stale and preview-only changes remain in the active review-session cache and never enter History. Each accepted change creates an addressable History transaction; transactions from one set share `changeSetId/runSnapshotId` and may be visually grouped as one batch.
- Closing Review preserves unresolved changes and returns to the originating session. Completing or cancelling the set does not create a new chat thread or switch the top-level tab.

## History

Purpose: accepted transaction playback.

- 只记录真实写入：用户直接编辑、用户接受的 AI 写入、接受后调整和系统回滚。生成中、预览、忽略和丢弃不进入 History。
- 时间线按日期分组，行内一眼显示来源、动作、目标、时间和变动摘要。
- 点击事务打开 modal；狭侧栏内不展开长 diff。
- modal 默认是 source-ordered inline diff，在同一上下文中标出删除和新增；可切换到纵向 `Before / After`。
- 每条事务可定位正文。只有目标仍等于该事务的 accepted snapshot 时才允许直接回滚；后续已编辑时必须解释冲突并停止破坏性覆盖。
- 每个 accepted change 创建一条独立事务，即使同一 run/change set 在视觉上按 batch 分组，也必须分别定位、diff 和回滚。事务保存来源 run/change IDs；Run record 保存对应 transaction IDs，双方都提供返回入口。
- rejected、stale、preview-only changes、Insights、Sources、Trace 和其他 run artifacts 留在 Run record/session retention 中，不复制进 History。
- Markdown、Base、Canvas、Excalidraw 与附件变更共享事务模型。Markdown/native file 仍是 source of truth。

## Visual Grammar

- 外层 sidecar 使用约 16px radius；composer 和 modal review 容器使用 12–14px；tab、button、chip 使用 7–10px。
- sidecar header 的 `Intelligence / 正在跟随正文` 作为一个组在面板中几何居中；spark 是无背景、无边框的 18px mark，close action 独立贴右。Session/Review 返回按钮保留点击区和 hover/focus，但不常驻方框；返回、任务标题与右侧动作共享顶部对齐轴。
- brief 是连续白底的平面长列表，用 section header、分隔线和留白组织，不加大卡片背景、独立阴影或多层圆角。
- 导航与 focus 使用 quiet violet；关联/成功使用 muted teal；风险沿用正文 amber/red。
- 元数据下限 9.5px，正文 UI 10.5–12px；不用营销式大标题。
- 动画只表达 tab、展开、sensing 和真实 streaming 状态，遵守 reduced motion。

## Lab IA Variant Coverage

`intelligence-ia-lab.html` 是独立于旧 `intelligence-lab.html`、`intelligence-panel.js` / `intelligence.css` 和完整 `index.html` 的小 DOM 评审面。本轮比较三种共享同一数据/事务合同的 IA，不把任一 variant 静默合回主 mock；旧 lab 保留为 v7 fixed-rail 历史证据：

- **Variant A · Adaptive Copilot（静默边界参照）**：无永久二级 tab；默认 brief，选择建议或输入意图后进入任务 session，产生 patch 后进入 transient review。优点是符合“一个协作者”的 mental model、mode tax 最低；要求返回层级、任务标题和状态恢复足够清楚。
- **Variant B · Explicit lifecycle**：使用固定位置的 `建议 / 协作 / 审阅` 阶段 rail；完整 composer 只在协作阶段出现，审阅只在存在 change set 时可用。优点是阶段更容易发现；风险是增加一层导航并重新滑向 dashboard。
- **Variant C · Progressive queues（当前 fusion candidate）**：默认沿用 A 的静默 brief，不显示二级 rail；一旦出现 active session 或 review work，才显示 `建议 / 进行中 / 待审` 三个紧凑队列入口。它吸收 A 的低 mode tax 和 B 的可恢复性，但队列只表达仍然存活的工作，不表达强制生命周期步骤。

Variant C 的队列合同：

- 默认状态完全静默；没有进行中任务和待审改动时，用户直接看到 brief，不能为了布局对称而显示三个空入口。
- active session 或 non-idle review 出现后显示 queue navigation；当二者都结束且没有需要恢复的工作时再次隐藏。
- `建议 +N` 表示自当前任务开始或用户上次查看 brief 后新增/重排的可行动建议，不是建议库总量；完整总量留在 brief section 内。
- `进行中 N` 表示仍可恢复的 active task session 数，不是 thread message 数，也不是模型 run 次数。
- `待审 N` 表示尚未处理的 pending change 数；接受、拒绝或 stale resolution 后实时减少，不使用 change set 的历史总数冒充待办数。
- 完整 composer、quick capabilities、voice 和 send 只在 `进行中` session 显示；`建议` 保持阅读/挑选，`待审` 使用 Review navigator/actions。
- 三个入口是可自由跳转的 queue switcher，不是 stepper：没有 completed step、进度连线、必须按左到右前进或“建议已完成”的含义。无 pending change 时 `待审` 不可进入；用户可随时返回建议或仍在进行中的任务。

三个 variant 都必须覆盖：

- 顶层只有 `Copilot / History`，旧 `?mode=ambient` 兼容落到 Copilot brief；
- 三类 proactive content 在一个 brief body scroll 中纵向同时存在，并支持长列表、刷新、忽略、查看来源和带入 session；
- `相关材料` 使用共享 selection 的局部证据图与宽幅关系探索器；大图不是新的顶层 tab，窄屏 inspector 位于图下方；
- session 展示 live context、不可变正文引用、用户/AI 消息、推荐、工具进度和事务回执；
- 每个 run 的 receipt 在同一条消息内折叠/展开 artifact browser，四类产物可切换、条目直接可见、长内容 inline expand；普通条目不打开 modal，只有关系图等空间型 artifact 可进入宽视图；
- active session 中被显式推送的新线索使用普通 `recommendation` message item；预览、inline expand、忽略和 `带入下一轮` 都发生在该条消息内，不存在独立 session-clues 列表或外置详情面板；
- quick capabilities、`全部能力`、voice 和共享 prompt input 只在 session 出现；
- 一个包含多处 change 的真实 review fixture，验证 `N / Total`、previous/next、接受/拒绝、editor locator、stale 和批次完成；
- History 按日期和来源分组，使用 modal、inline diff、Before / After、定位和安全回滚；
- 宽屏右栏和窄屏 fixed drawer 使用同一生命周期与事务语义。

旧 v5 三-tab、v6 fixed-shelf 和 v7 fixed `工作台 / 对话` rail 只作为历史交互证据，不再是当前 surface baseline。Variant C 是当前融合候选，不等于已经选定的 production baseline；owner review 完成前继续保留 A/B 作为边界对照。

## Interaction State Contract

- Copilot lifecycle: `brief -> session -> review`。`brief -> session` 来自显式提问、选择建议/能力或带入材料；`session -> review` 只在 run 产生 pending change 时发生；`review -> session` 在关闭、完成或取消 change set 后发生；`session -> brief` 只允许显式返回。
- Copilot run: `idle -> action/context composed -> assembling -> streaming -> proposed change set / no-change / error / cancelled`。
- Run artifact browser: `receipt collapsed -> expanded(category) -> item inline-expanded -> collapsed`；状态属于同一条 `runId` 消息，切换 `Changes / Insights / Sources / Trace` 不改变 Copilot lifecycle、thread scroll owner 或 URL。空间型 artifact 例外使用 `wide view closed -> open(artifactId) -> closed`，关闭后恢复 receipt/category/item focus。
- Sensing: `off | smart | continuous`；auto-run 是独立的 `disabled | enabled-by-policy`。任何组合都只能产出 brief 更新、只读分析或 pending candidates，不能自动接受或写入。
- Brief data: `idle -> loading -> ready / empty / error`；refresh 使用 `ready -> refreshing(previous snapshot retained) -> ready(new revision) / error(previous retained)`，并保证 latest-wins。后台刷新不改变 lifecycle state。
- Brief sections: `summary -> expanded -> summary`；三类始终同时存在并共享一个 body scroll。
- Related-material graph surface: `compact <-> explorer`，共享 snapshot revision 与 selection。新 revision 仍含 selected ID 时保留，否则回到 `rootNodeId`；preset、Semantic、weak、zoom/pan 都是 explorer-only view state，不改变 snapshot、不运行能力、不产生事务。Dialog `closed -> open -> closed`，Escape 关闭并恢复 opener focus；`带入协作` 只增加一次 context chip 并进入 session。
- Voice: `idle -> requesting -> listening -> transcribing -> draft / error`。
- Thread kinds: `user | assistant | recommendation | tool | receipt`；`receipt` 必须区分 compact run receipt 与 accepted transaction receipt。后台 projection refresh 不是 thread kind，细粒度 Trace 也不逐条膨胀为 thread message。
- Session clue: `discovered -> recommendation preview -> inline-expanded / queued-for-next-run / dismissed / stale`。`queued-for-next-run` 只装配 chips/draft，不改变 lifecycle、不冻结 run snapshot，也不自动运行；同一 clue 的补充信息原位更新现有 recommendation。
- Review set: `generating -> reviewable -> partially-accepted -> completed / cancelled`；change: `pending -> accepted / rejected / stale / error`。
- Selecting a brief item updates chips, enters a task session and focuses the composer. It never changes the top-level tab or starts a run.
- Accepting one change writes at the frozen target and creates one addressable History transaction；同一 set 的事务共享 batch identity，其他状态都不创建事务。
- Rollback 是 confirmed inverse transaction；原 accepted row 保留并标记已回滚。

## Production Handoff

当前 lab 用于比较 adaptive、explicit lifecycle 与 progressive queues IA，仍是 fixture，不是生产 runtime。主 mock 继续保持未合并；只有完成 variant owner review 和显式 merge decision 后，才把选定 shell 移入 `intelligence-panel.js` / `intelligence.css`。

生产集成必须保留 capability IDs、action/context chip 语义、live-context/run-snapshot 分离、voice-to-draft-only、Ambient runtime → Copilot brief、task session、message-embedded artifact receipt/browser、app-owned ProposedChangeSet、append-only source-aware History、editor-local streaming review surface 和 responsive drawer。不得复制 lab 的固定文案、timer、确定性语音 transcript、固定队列计数或内存事务存储。

## Production Roadmap

- [ ] 用 app-owned Current Work State runtime 替换 fixture 推断和排序。
- [ ] 实现 latest-wins brief snapshot，sensing 时保留旧结果并处理 error/no-change。
- [ ] 为 90+ 项队列实现稳定 ID、虚拟化/增量加载、后台重排锁位和 `N 条已更新` 应用提示。
- [ ] 持久化 brief / session / review 的独立现场；composer 只在 session 可见，但 draft、chips、IME、voice 与 caret 不因返回 brief 或进入 review 而丢失。
- [ ] 从真实 Markdown source ranges、Ambient relation IDs 和 link graph 填充 context chips。
- [ ] 实现 app-owned Composer adapter：把 proactive source candidates 映射成 `ResultSubgraphInput`，生成带 revision/focus/reason/weak overlay 的 immutable snapshot；同一 refresh 只 build 一次。
- [ ] 从 store-bound `ResultGraphView` 抽取 neutral controlled surface；把 `GraphPreset`、preset 常量、element projection、layout、selection 与 Cytoscape lifecycle 移入共享层。
- [ ] 让 Quick Search host 与 Composer host 同时使用该 shared surface；前者保留 search toolbar/store/hub navigation，后者装配 inspector/context/session actions，禁止复制 renderer/layout 实现。
- [ ] 先解决 `hub_constituent` 当前“计入 connected 但画布丢弃、isolation 只看 reference”的语义差异，再锁 shared acceptance tests。
- [ ] 实现 app-owned ProposedChangeSet controller、source-order navigator、editor/sidecar focus synchronization、stale detection 和 active-session candidate cache。
- [ ] 定义 app-owned Run record schema 与 compact receipt projection；把 Changes / Insights / Sources / redacted Trace 绑定到稳定 `runId`，由同一消息内 artifact browser 分页/虚拟化读取，并保存 active category、展开条目和滚动锚点。
- [ ] 把 active-session clue projection 接入现有 `recommendation` event store：stable clue/message ID、inline preview/expand、dismiss/stale、`带入下一轮` chip assembly 和原位更新；不得实现第二套 session-clues collection UI。
- [ ] 让 run stream 同步驱动正文 anchor 上的 candidate rendering、稳定 previous/next navigator 与 per-change accept/reject；禁止在 sidecar 复制第二份结果。
- [ ] 让同一 set 的 accepted changes 产生独立可定位、共享 batch identity 的 History transactions。
- [ ] 建立 Run record `acceptedTransactionIds` 与 History `originRunId/changeSetId/changeId` 的双向索引；从 History 返回时定位并展开来源 receipt，而不是打开普通 Run detail modal。
- [ ] 实现独立的 sensing `off / smart / continuous` 与 auto-run policy；加入“任何模式都不能 auto-accept/write”的 runtime guard。
- [ ] 把 History modal snapshot 绑定到 accepted transaction 的 immutable run snapshot。
- [ ] 通过共享 Composer transaction port 持久化 accepted 和 debounced direct-editor transactions。
- [ ] 选择并 app-own Obsidian/Electron microphone/transcription adapter。
- [ ] 在 History 后添加 document-history / Git adapter，不增加顶层 UI。
- [ ] 补键盘 focus order、drawer close、screen-reader announcement 和 interruption metrics。

## Rejected Patterns

- 独立 Ambient tab。
- 永久 `工作台 / 对话` 二级 switch，或把 conversation medium 当作产品任务分类。
- Current Work State 作为大诊断模块。
- 用户必须理解 Ambient 内部术语。
- 自动 snapshot refresh 追加成聊天消息。
- 固定在 composer 上方、只容纳 2–3 项的 Ambient shelf。
- 只允许查看一类内容的 `下一步 / 相关材料 / 待整理想法` 分类 tab。
- session 作为 Copilot 默认 body，或清空草稿后自动跳回 brief。
- brief 常驻完整 composer，或在 lifecycle 内容内部放置位置不一致、无法恢复现场的单向返回按钮。
- 把 pending review 塞进 thread 或 History，或只保存一个无法表达多处候选改动的 draft patch。
- 把 `Changes / Insights / Sources / Trace` 恢复成永久 sidecar tabs，或让四类 run artifacts 与 Copilot/History 等权竞争。
- 普通 run artifact 点击后打开 modal、新页面或独立工作台，或给 artifact browser 建立脱离 thread 的嵌套滚动区。
- 为 session 自动发现新建 `session-clues` 列表、外置详情面板、悬浮 shelf 或第二套 unread/navigation model，而不是使用现有 recommendation message item。
- 为了“信息更全”默认展开所有 artifact/Trace；默认只保留 compact receipt、关键 insight 和用户主动展开的分类/条目。
- 把所有 artifact 都塞进窄栏，即使关系图等空间型内容已经无法理解；宽视图只能作为明确、少量的空间需求例外。
- 把 Trace 做成 chain-of-thought/model reasoning viewer，或把每个 tool event 追加成独立聊天气泡。
- 把 `Fast Lookup` 暴露成产品功能名、section 或 tab，而不是 runtime metadata。
- 把 rejected changes、sources、insights、trace 或其他 run artifacts 复制进 History。
- 让 `continuous` sensing 隐式开启 auto-run，或让任何 auto-run 自动接受、写入或提交正文。
- 三个 section 各自拥有嵌套滚动区。
- recurring Morning Briefing 作为 editing sidecar 常驻栏目。
- state、trace、related notes 和 capability 的等权卡片墙。
- 把 lab 的 fixture nodes、静态坐标或 vanilla renderer 搬进 production。
- 在 Composer 中直接 import store-bound `ResultGraphView` / `vaultSearchStore`，或为 compact/explorer 分别 query/build graph。
- 把 `weak` 发明成第四种 edge kind，或未经 adapter 就改用不同 domain 的 `MultiLensGraph`。
- 把 Composer block locator 当作 Vault source/node ID。
- 永久蓝色整栏底色、装饰性渐变和多层圆角容器。
- scope selector 出现在每条 Copilot 消息之前。
- 建议静默写入 Markdown。
- History 记录生成过程却不能定位、diff 或回滚真实来源。
