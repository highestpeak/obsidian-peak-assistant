# Composer Intelligence Sidecar UI Contract

Date: 2026-07-15 · revised 2026-07-21

## Goal

Composer 右栏不是第二套编辑器，也不是 AI 功能卡片墙。它是一条贴着正文工作的窄 sidecar。当前静态 mock 的用户可见顶层只有 `Copilot / History`。Copilot 内部依次承载 Ambient-powered `brief`、对话与执行 `session`、以及临时 `review`；History 承载已经接受写入的事务、diff、定位和回滚。

Ambient 不是第三个 tab，也不是第二套 AI 系统。它是与 Copilot 共用 focused context 和 sensing snapshot、但保持独立 runtime ownership 的推断与排序能力；其用户界面就是 Copilot 默认 `brief`。用户从 brief 选择建议后进入 task session，真正运行仍由 Copilot 创建 run snapshot。conversation 是协作媒介，composer 是只在 session 出现的输入控件，Review 是 pending transaction state；这些内部状态不会变成永久的 `工作台 / 对话` rail。用户也不需要理解 Current Work State、Recent Work Trace 或 trace 等内部合同名。

旧设计中的 `Changes / Insights / Sources / Trace` 只保留为**每一次 Copilot Run 的局部产物分类**。它们不恢复为产品级永久 tabs，也不与 Copilot、History 并列。问答流中的同一条 run receipt 既是 compact 摘要，也是可原位展开的 artifact browser；普通产物始终留在这条消息里。

## Capability Sources and Ownership

| Source | Stable product meaning | Runtime / product projection |
| --- | --- | --- |
| `docs/16-feature-document-copilot.html` | 对当前文档解释、改写和调用工具 | Copilot |
| `docs/superpowers/specs/2026-05-16-copilot-command-center-final-ux-flow.md` | 用户留在当前笔记；agent 选择工具；写入前 review | Copilot |
| `docs/14-feature-ambient-push.html` | 低打扰主动发现；可忽略；不抢占编辑 | Ambient runtime → Copilot brief |
| `docs/superpowers/specs/2026-06-02-ambient-push-current-work-state-product-technical-review.html` | Current Work State、Recent Work Trace、Session Thought Trace | Ambient runtime → Copilot brief |
| `docs/superpowers/specs/2026-07-15-composer-block-ai-capability-contract.md` | 固定块操作、上下文建议、增量生成与事务边界 | Copilot execution + History transaction |

内部 ownership 必须继续分开：Ambient 推断和排序，Copilot 装配和执行，History 记录已接受事务。合并的是用户界面，不是把三条 runtime 链路揉成一个状态对象。

## Shared Shell

- 顶部保留产品名、同步状态和 `Copilot / History` 两个 tab。它们使用同一 focused-context projection；切换 tab 不创建新的 context、conversation 或 runtime owner。不得重新加入 Ambient 顶层 tab。
- Copilot 默认展示针对当前对象的 proactive brief。选择建议或材料后进入以任务命名的 session，只有 run 产生候选 patch 时才进入临时 Review。返回和前进必须保持明确的层级关系，并保留 brief snapshot、session draft/chips/thread、review progress 和各自滚动位置。
- `brief / session / review` 是 Copilot 内部状态，不显示永久 stage rail。选定的 adaptive shell 不使用 `建议 / 进行中 / 待审` 队列条；任务头、返回动作和正文 review navigator 提供恢复路径。
- 背景、边框、圆角、字体和正文使用同一套 restrained token；禁止蓝色整栏底色、多层 card 套 card 和等权功能墙。
- 宽屏是稳定右栏；低于 `1180px` 是从右侧滑入的 fixed drawer。侧栏不得进入文档流或出现在正文末尾。
- AI 感来自知道当前对象、自动带入上下文、原位更新建议、显示真实运行状态和把结果送回正文，不来自装饰性渐变。

### Static mock source of truth

- `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-panel.js` 与 `intelligence.css` 是共享 sidecar 组件和视觉实现的真源。
- `index.html` 是集成主 Composer View：正文仍由主 mock 管理，`mock.js` 只把 focused block、run/review 和 accepted transaction 状态投影给共享 sidecar。
- `intelligence-lab.html` 是消费同一共享组件的小 DOM 独立调试入口；其本地 CSS/JS 只负责 host fixture，不复制 sidecar 实现。
- `intelligence-ia-lab.html?variant=adaptive&mode=copilot&stage=brief` 是选定的 IA acceptance fixture；其他 staged/hybrid routes 保留为 regression comparison。fixture 不是主 mock 的运行真源，也不是 production runtime。
- 相关材料的 List / Folder / Graph browser 不属于静态 mock 真源。mock 只显示 production shared `ResultBrowser` 的 reuse slot / contract marker；该组件从现有 Vault Search / Quick Search 展示组件中抽取，但完整视图仍由 Composer 在自己的 modal 中打开。production React component 才是该 UI 的唯一 source of truth。

这次完成的是静态文档 mock 的组件合并。它不表示真实 Obsidian app-owned context、sensing、agent run、写入事务或持久化 runtime 已经实现。

## Copilot

Purpose: turn explicit intent into an inspectable run and review every proposed write before it becomes history.

Copilot 是一个连续的主动感知、对话与执行界面，不使用永久的 `工作台 / 对话` 或 stage rail：

1. `brief`：Copilot tab 的默认状态。它把 Ambient sensing 投影为建议、相关材料和未安放想法的连续工作面；这里没有完整 composer。
2. `session`（含 `running` 子状态）：用户从 brief 讨论建议、点击 `问 Copilot` 或恢复任务后进入。发送时冻结本轮 context snapshot；thread、quick capabilities、composer、语音、工具进度和 run receipt 都属于这里。
3. `review`：只有 run 产生一个或多个候选 patch 后才进入。它显示一个临时 ProposedChangeSet 的当前改动、进度、定位和处理动作，不是永久顶层 tab，也不能在没有 pending change 时出现；这里不显示普通 composer。

brief 到 session 的显式 handoff 会装配 action/context chips 并聚焦 composer，但不自动发送；Ambient 后台刷新不得抢占 session。brief 与 session 分别保留 snapshot/scroll 和 draft/chips/caret/thread；Review 完成或关闭后返回产生它的 session，而不是跳到 History 或新建对话。

### Task collaboration session

- thread 只在 Copilot `session/running` 显示。Ambient 后台变化不会自动把用户切到 Copilot。
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

## Ambient Runtime Projection in Copilot Brief

Purpose: infer and continuously organize the user's current editing work in a visible work surface without creating a second AI system.

- 不显示 `Ambient` 顶层 tab。内容标题使用 `针对当前正文，接下来值得处理什么` 或具体写作任务；不把 Current Work State、Recent Work Trace、Session Thought Trace 等内部合同名直接暴露成模块。
- proactive brief 是 Copilot 的默认完整、可滚动 body，并占满主导航以下的可用高度；这里不显示完整 composer。它不是 composer 上方的有限高度 shelf，也不是后台 dashboard。
- `接下来可能要做 / 相关材料 / 还没安放的想法` 按固定顺序纵向同时存在，不使用分类 tab，也不默认只展示其中一类。
- 三类都支持长列表，没有“每类最多 3 条”或“全局最多 2–3 条”的产品上限。默认视口可以只渲染每组最高优先级摘要，但必须显示总数和明确的完整列表入口；生产长列表使用分页、增量加载或虚拟化。
- 只有 session composer 附近的 quick capabilities 维持 2–3 项限制；它与 brief 的候选数量无关。
- Current Work State 不恢复为大诊断模块，只用一句人话说明当前正在整理的对象；只有低置信且会显著改变排序时才出现可纠正确认。
- 每条建议直接给一句人话原因。详细 Recent Work Trace 只在用户点击 `为什么这些排在前面？` 后按需展开。
- `更新排序` 保留旧 snapshot，后台完成后 latest-wins 原位替换，并显示新增、归档、重排或无变化回执；不得自动切换到 Copilot、追加聊天消息或抢占 review。
- 查看、忽略、刷新和展开留在 brief；`讨论 / 问 Copilot / 带入协作` 装配 action/context chips 并进入任务 session，但不自动运行、不直接写正文。
- brief 使用一个 body scroll；禁止为三个 section 建立三个嵌套滚动区。narrow drawer 的 brief 同样不显示完整 composer；进入 session 后 composer 才固定在 viewport 底部。
- 进入 session 后继续保留 brief snapshot 与滚动位置；返回 brief 时恢复现场。
- 忽略、预览、刷新和未执行的带入不进入 History。

### Related-material browser

`相关材料` 不是一排置信度卡片，也不是新的顶层工作面。它在 Copilot brief 的同一 section 内提供两层渐进披露：

1. **局部图**：侧栏只展示当前正文对象、5–7 个最强材料节点和主要连接。弱关联默认隐藏；点击节点只原位更新一条材料详情，说明标题、路径、关联理由、分数及 `查看来源 / 带入协作`。它不改变 Copilot stage、不自动运行能力，也不直接写正文。
2. **宽幅材料浏览器**：`打开完整视图` 在 Composer 内打开明显宽于 sidecar 的 modal，并挂载 shared controlled `ResultBrowser` 的 related-material mode。它浏览的是 Composer 已经找到并冻结的相关资料集合，不跳转到 Vault Search / Quick Search，也不把用户带离当前文档。`列表 / 文件夹 / 图谱`、toolbar、density、graph layouts、keyboard 和 inspector 语法由从现有搜索结果组件中抽取的共享 production component 提供；Composer 不实现第二套 renderer。Composer 只提供 related-material snapshot 与 host actions。窄屏 modal 接近全屏，inspector 移到内容下方，不产生横向页面滚动。

一级视图的视觉与键盘语法沿用 Vault Search：List/Folder 可切换 compact/detailed density；Folder 保留 path hierarchy、folder-first ordering、聚合数量与 collapse state；List/Folder 的 leaf IDs 必须完全一致。Graph 才显示二级 layout controls，preset 精确锁定为 `constellation / flow-tb / flow-lr / folder / orbit`；一级 `文件夹` 与 Graph 的 `folder` layout 是两个独立状态。Graph 区分当前对象、普通材料、弱关联、引用实线和 Semantic 虚线；Orbit 自动打开 Semantic，其他 preset 自动关闭。Semantic 只切换已索引语义边，不调用模型、不走网络、不消耗 AI credit。Graph 支持 wheel/pinch zoom、drag pan、真实 fit、悬停邻域、节点选择、Mermaid 与 PNG export。

这里的“复用 Vault Search / Quick Search 组件”只描述组件来源，不描述导航目标。宽幅 modal 挂载同一个 production React `ResultBrowser`，但仍属于 Composer 当前工作面；它不是外观仿制，也不是把完整 Quick Search modal、搜索请求或 `vaultSearchStore` 嵌进 Composer。侧栏局部关系预览与宽幅浏览器消费同一份冻结 related-material snapshot。若宽幅浏览器提供搜索框，只能本地过滤该 snapshot，不能隐式发起新检索。静态 docs modal 只保留 reuse slot / contract marker，不复制或模拟完整浏览器的控件和投影。用户界面只使用 `相关材料`、`打开完整视图` 等产品文案，不显示内部组件名 `ResultBrowser`。

关系图操作边界：

- `查看来源` 打开或定位 Vault 来源；`带入协作` 只装配 context chip 并进入 task session。
- 视图切换、row/node 选择、density、folder collapse、preset、Semantic、缩放、pan、fit、导出、预览和关闭都不进入 History。
- modal 支持 Escape、关闭后恢复 opener focus；view tabs、List rows、Folder tree、Graph nodes 和 layouts 必须可键盘操作。
- 不新增顶层 Graph tab，不让完整 Vault graph 永久占据窄 sidecar，也不把每个节点包装成 card wall。

### Shared Result Browser 同源与复用合同

“Mock 标了复用入口”不等于“生产已经有 shared Result Browser”。当前状态必须按层说明：

| 层 | 当前状态 |
| --- | --- |
| Static docs mock | 保留受限的侧栏局部关系预览；宽幅 modal 只展示 production Result Browser 的 reuse slot / contract marker，不实现 toolbar、List、Folder、完整 Graph layouts 或 inspector |
| Vault Search subgraph | 已实现；`resultSubgraph.ts` 是 structural graph source |
| Vault Search List/Tree/Graph hosts | 已实现但绑定 search store/context；不能原样嵌入 Composer |
| Shared controlled projections | 生产目标，尚未实现 |
| Composer material snapshot adapter | 生产目标，尚未实现 |

生产“同源”定义：

- snapshot 包含完整 ranked `items` 和其 Graph projection；List/Folder 消费全部 items，Graph node-cap 不得截断 List/Folder。
- brief 局部图和 explorer 消费同一个 immutable snapshot `revision`；打开或切换视图不重新 query 或 build snapshot。
- List leaf IDs 与 Folder file IDs 必须完全同源；Graph source node IDs 是 items source IDs 的子集，且当前 selected source 必须被强制保留在 Graph projection 中。
- 在 production adapter 中，完整数量只来自 `items.length`，不能从 graph node count 或 `ResultSubgraphOutput.overflowCount` 推算；overflowCount 只表示 builder node-cap overflow。静态 mock 不用固定 37-item fixture 验证此合同。
- Vault document/hub 使用真实 graph node ID；Composer block locator 放在 `focus.anchorId`，不能伪装成 Vault source/node ID。
- Composer 的关联理由和 weak overlay 放在 app-owned envelope；正式 edge kind 保持 `reference | semantic | hub_constituent`，不能发明 `weak` edge kind。

Composer adapter input envelope（尚未实现；它不是另一套 renderer props）：

```ts
type ResultGraphPreset =
  | 'constellation' | 'flow-tb' | 'flow-lr' | 'folder' | 'orbit';

interface ComposerRelatedMaterialSnapshot {
  revision: string;
  focus: { anchorId: string; rootNodeId: string };
  items: readonly RelatedMaterialItem[];
  graph: ResultSubgraphOutput;
  sourceIdByNodeId: Readonly<Record<string, string>>;
  reasonBySourceId: Readonly<Record<string, string>>;
  weakNodeIds: readonly string[];
  weakEdgeKeys: readonly string[];
}

```

Shared projections 只负责 result rows、path tree、Cytoscape lifecycle、element projection、layout、selection、keyboard 与 viewport。Vault Search / Quick Search host 继续负责自己的 query lifecycle、search store、global cursor、copy 和 hub navigation；Composer host 继续负责 immutable brief snapshot、source inspector、`查看来源`、`带入协作` 与 task session。Composer 打开完整视图时不导航到搜索 host，也不重新 query。`MultiLensGraph` 属于另一套 AI-analysis graph domain，不是这里的数据或组件合同。

#### Production Result Browser extraction boundary

生产组件不是“把 Quick Search modal 搬进 Composer”，也不是让 docs fixture 进入 bundle。目标是一个 query-agnostic、controlled `ResultBrowser`；它是 List / Tree / Graph UI 的唯一 source of truth，Composer 与 Quick Search 分别通过 host adapter 使用它。Composer 传入当前已发现的材料 snapshot，并在自己的 modal 中保留生命周期、焦点和关闭返回路径：

```ts
interface ResultBrowserState {
  view: 'list' | 'tree' | 'graph';
  density: 'compact' | 'detailed';
  selectedKey: string | null; // docId ?? path ?? id，三种投影只认这一份选择
  inspectorOpen: boolean;
  collapsedFolderPaths: readonly string[];
  graphPreset: ResultGraphPreset;
  graphShowSemantic: boolean;
}

interface ResultBrowserProps {
  items: readonly SearchResultItem[];
  state: ResultBrowserState;
  subgraph: ResultSubgraphOutput;
  onStateChange(next: ResultBrowserState, reason: ResultBrowserStateChangeReason): void;
  onOpen(item: SearchResultItem, disposition: 'same' | 'tab' | 'keep-browser'): void;
  onRevealFolder?(path: string): void;
  renderInspector?(item: SearchResultItem | null): React.ReactNode;
  renderItemActions?(item: SearchResultItem): React.ReactNode;
}
```

推荐 production 文件边界：

- `src/ui/component/result-browser/ResultBrowser.tsx`：toolbar、当前 projection、scoped keyboard 与 inspector slot；根节点拥有 focus，禁止继续用 `window` keyboard listener。
- `ResultBrowserToolbar.tsx`：受控 List / Tree / Graph、density、Graph preset 与 Semantic controls；不 import Zustand。
- `ResultListView.tsx`：只负责呈现、稳定 key、selection 与 injected actions；打开文件、SearchClickRepo 和 BehaviorRecorder 全部留给 adapter。
- `result-tree/`：迁入现有纯 `buildTree.ts`，collapse/cursor 变为受控 props；Reveal Folder 通过 callback。
- `result-graph/`：复用 `resultSubgraph.ts` 的 output，Cytoscape lifecycle 留在组件内部；不得读取 `vaultSearchStore`、`ServiceContext` 或自己重新 query/build snapshot。
- `QuickSearchResultBrowserAdapter.tsx`：唯一负责 query lifecycle、search store、recent/fuzzy/filter syntax、Vault navigation、telemetry、pinned hub 和 modal close policy。
- `ComposerRelatedMaterialsAdapter.tsx`：唯一负责 frozen brief snapshot、`查看来源`、`带入协作`、context chip、task session 与 Composer inspector。

迁移必须按 `contract tests → controlled toolbar/tree/list → controlled graph → Quick Search 回接 → Composer 回接` 执行。只有 Quick Search 与 Composer 都消费上述 production surface 后，才可在 release note 中写“复用 Vault Search 组件”。docs mock 只标注待挂载的 component/adapter contract，不能以相同外观、共享 vanilla JS 或固定结果数据充当 reuse 证据。

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

用户界面不得直接暴露 `smart`、`continuous`、`auto-run` 这些内部词。设置面板必须拆成两个问题：

- **什么时候检查新建议**：`仅手动` / `停笔后更新（推荐）` / `编辑时定期更新`；
- **发现新建议后**：`自动准备待审改动`，并明确“候选仍需审阅”。

入口摘要使用 `建议更新 · 仅手动/停笔后/编辑时`；手动动作使用 `更新建议`。设置底部固定说明：任何设置都不会自动接受或写入正文。

## Proactive Intelligence Evaluation Contract

主动智能不能只用建议接受率评价。提高建议数量或降低建议门槛也可能提高接受总数，同时增加打扰、错误和后续返工。北极星指标应是：

> 每次主动介入产生的、在下一个文档检查点仍被保留的有用结果。

“有用结果”包括用户接受并保留的变更，以及用户明确确认有帮助但不需要写入的判断；“文档检查点”至少覆盖本次 session 完成、下一次保存或重新打开后的可验证状态。所有指标必须能够按 sensing policy、finding kind、capability、document size 和来源类型分段，不能只看全局平均值。

### Quality and outcome

- useful finding rate、unsupported/incorrect finding rate、duplicate rate、stale rate 和 anchor mismatch rate；
- accepted-and-retained rate、accepted-then-substantially-edited rate、rollback rate，以及 AI change 引入新问题的比例；
- Markdown/native-file round-trip validity 和来源是否真实支持最终表述。

### Autonomy and interruption

- brief open、preview、ignore、dismiss、snooze、disable/sensing-policy change 的比例；
- 同类 finding 连续被忽略或关闭的次数；
- 主动介入后恢复原编辑任务的时间，以及用户认为出现过早、过晚或不该出现的反馈；
- proactive finding 与 explicit user invocation 的比例。它用于判断系统是否抢走用户主导权，不作为“主动越多越好”的目标。

### Review, control, and efficiency

- evidence/source open rate、partial acceptance、edit-before-accept 和 rejection reason；
- time to first useful finding、brief-to-session conversion、review completion time、steps per completed task、run cancel/retry rate；
- Related Materials 的打开、带入协作、实际引用和最终使用率；
- undo/rollback invocation、rollback success 和 conflict-safe refusal。

### Reliability and local performance guardrails

- stale apply prevented、partial write、History/source mismatch、crash recovery 和 cross-surface finding-state mismatch；
- Composer open time、typing/input latency、background sensing CPU/memory、first-result latency、complete-result latency、model/token cost 和 cancellation stop latency；
- 大文档和大型 Vault 下的退化必须单独统计，不能被小 fixture 的平均值掩盖。

### Measurement boundary

- acceptance rate 只能作为诊断指标，不能成为单一北极星；
- 任何优化不得以提高打扰次数、隐藏错误、降低 evidence threshold 或让 rollback 更困难来换取接受率；
- 产品护栏至少锁定 incorrect/unsupported rate、dismiss/ignore rate、stale/anchor mismatch、rollback failure 和 editor input regression；
- 默认只记录结构化事件、时间、状态和匿名分类。正文内容、prompt、来源全文和用户输入不得为指标而上传或持久化，除非有明确的用户同意与保留策略。

## Proposed Change Set and Review Navigator

Purpose: make every pending write locatable, reviewable and reversible before it becomes History.

A Copilot run may create one `ProposedChangeSet` containing one or more `ProposedChange` records in document source order. A suggestion is not yet a change: brief items remain reorderable/ignorable discovery objects until a capability run produces a typed patch.

Each change set contains:

- a stable `changeSetId`, `runSnapshotId`, task title, ordered change IDs, current change ID and set status;
- one or more changes with stable `changeId`, target object/source range, frozen source snapshot, typed patch, preview mode and `pending / accepted / rejected / stale / error` status;
- enough provenance to return to the originating session and group accepted History transactions without merging their individual locations.

Review behavior:

- Run 开始后，候选必须在真实正文 anchor 原位出现并随 token/source patch 流式更新：文本直接在段落上展示候选与 diff，插入/结构/native 结果挂载真实 draft object 或重渲染 preview。sidecar 不复制一份脱离正文的结果卡。
- 第一项候选可审阅后，document-owned bottom controller 立即出现；它不等待 sidecar 跳入 transient Review。controller 显示 `第 N 处`、待审数量、`上一处 / 下一处` 和当前项动作。字符、单元格或行级增删统计属于具体 anchor，不挤进全局 controller。仍在 streaming 的候选可以停止或拒绝，但完成并通过 source-revision 校验前不得接受。
- Navigation follows document source order, synchronously scrolls/focuses the editor target and updates the sidecar explanation.
- The editor-local review surface is the source of truth. Text uses a unified inline diff; list/table/image/Frontmatter/formula changes render inside the real object; insertions mount real draft objects; deletions remain recoverable at the original position; native files re-render their typed patch. Larger vertical or Before/After comparison is optional inspection, not the primary preview.
- Current-change actions include `接受`, `拒绝` and `编辑后接受`. Batch actions such as `全部接受` must expose scope and require confirmation when the set crosses objects or files.
- Accepting or rejecting the current item automatically advances to the next pending change. The user may navigate back to already handled changes without changing their status silently.
- If the current target no longer equals its frozen source snapshot, the change becomes `stale`; Review must explain the conflict and must not destructively overwrite later edits.
- Pending, rejected, stale and preview-only changes remain in the active review-session cache and never enter History. Each accepted change creates an addressable History transaction; transactions from one set share `changeSetId/runSnapshotId` and may be visually grouped as one batch.
- Closing Review preserves unresolved changes and returns to the originating session. Completing or cancelling the set does not create a new chat thread or switch the top-level tab.

### Document is the primary review surface

Review 的主表面是正文，不是右侧待审列表。每个 `ProposedChange` 在真实 document anchor 上拥有一个稳定、可点击的编号 pin；编号按 `sourceOrder` 固定为 `1…N`，不会因为接受、拒绝、stream arrival 或队列筛选而重排。pin 显示 active 与 `streaming / pending / accepted / rejected / stale / error` 状态，不能只靠颜色区分。点击 pin 会选中该 `changeId`、滚动/聚焦真实 anchor，并同步右侧说明与所有辅助导航。

正文 bottom controller 提供三个互斥文档状态，它们只改变呈现，不改变 change 状态：

- `工作视图 (work)`：默认状态。显示 Composer 渲染正文、AI insight/claim/warning 和轻量 change pins，但不展开 pending candidate/diff。这是写作与分析状态，不是 `current change` 的别名。
- `全部改动 (all)`：在各自 anchor 原位渲染本 set 的全部候选/diff；active change 使用更强的 focus treatment，但接受/拒绝仍只作用于 active change。
- `纯净阅读 (clean)`：只显示 Composer 渲染的 committed source，不显示 insight、claim、warning、pending diff 或 change pin。bottom controller 仍在，用户可随时返回工作或审阅。它不是 frozen before snapshot，也不会撤销已接受写入。

永久 `当前一处` 模式被删除。点击正文 pin、sidecar queue 或 previous/next 会更新同一 `activeChangeId`；若用户需要看候选，controller 切入 `全部改动` 并聚焦对应对象，而不是建立第四种显示状态。

右侧 `待审` queue 与正文底部 `上一处 / 下一处` navigator 都只是同一 `activeChangeId` controller 的辅助投影：它们不得拥有第二套排序、selection 或 change status。点击 queue row、编号 pin 或 previous/next 得到完全相同的 active anchor。任何 `接受 / 拒绝 / 编辑后接受` 操作只处理 active change；在 `all` 模式看到多个 diff 不等于批量选择。批量动作若存在，必须是单独命名、显示 scope 并二次确认。

Keyboard 与窄屏合同：

- pin 是真实 button，使用 `aria-label="改动 N / Total：动作，状态"`；`Enter / Space` 选择并定位。document-state control 使用 `role="group" + aria-pressed` 的三段选择器语义，`ArrowLeft / ArrowRight` 切换状态并恢复焦点。
- editor review chrome 获得焦点且当前不在可编辑文本/IME 时，`Alt+ArrowUp / Alt+ArrowDown` 触发 previous/next；接受和拒绝不设置单键快捷键，必须显式聚焦动作。
- 窄屏右侧 drawer 仍只承载 queue/说明。`定位正文` 会关闭 drawer、聚焦 active anchor，并保留一个紧凑的 document-owned bottom navigator；重新打开 drawer 后保持 review mode、active change 与正文滚动位置。
- `全部改动` 在窄屏仍保持原位语义，但允许按 viewport 增量挂载 diff；不得因为性能退化成 sidecar-only list。`纯净阅读` 必须可随时恢复 committed document reading。

Document review 验收：

- `工作视图` 显示 insight/warning 与 change pins，但不展开 pending candidate；`全部改动` 展示所有可呈现 change 的原位 preview，并保持一个且仅一个 active change；`纯净阅读` 不显示 AI decoration、candidate 或 pin。
- pin、queue row 与 previous/next 共享同一 active ID 和 source-order；任一路径选择后 editor、sidecar 和底部 navigator 同步。
- 在三个 mode 中执行接受/拒绝都只改变 active change；其他 change 的 status、preview 与 transaction count 不变。
- accepted/rejected/stale pin 保留到本次 Review 结束，编号不复用；stale/error 不可接受。
- 键盘可完成 mode 切换、pin 选择、previous/next 和显式动作聚焦；focus indicator、状态文本和 screen-reader announcement 完整。
- 窄屏定位不会把正文放入 drawer 流，也不会产生页面横向 overflow；关闭/重开 drawer 后 active/mode/scroll 均恢复。

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
- change pin 使用克制的小号圆形编号和清晰 focus ring；active、resolved、stale 状态依赖形状/图标/文字而非只靠色彩。pin 不扩大成正文 badge card，也不盖住可编辑文本。
- brief 是连续白底的平面长列表，用 section header、分隔线和留白组织，不加大卡片背景、独立阴影或多层圆角。
- 导航与 focus 使用 quiet violet；关联/成功使用 muted teal；风险沿用正文 amber/red。
- 元数据下限 9.5px，正文 UI 10.5–12px；不用营销式大标题。
- 动画只表达 tab、展开、sensing 和真实 streaming 状态，遵守 reduced motion。

## IA Acceptance Fixture and Variant Coverage

`intelligence-ia-lab.html?variant=adaptive&mode=copilot&stage=brief` 是当前 sidecar 的选定 acceptance fixture。它锁定两项最重要的认知边界：顶层只有 `Copilot / History`，Copilot 内部以无永久 stage rail 的 `brief -> session -> review` 完成主动感知、协作与审阅。当前 `index.html` 与 `intelligence-lab.html` 都消费 `intelligence-panel.js` / `intelligence.css`，这两个共享文件才是运行真源。

同一 IA lab 的 `staged` 和 `hybrid` routes 继续作为 comparison/regression fixtures，不得反向定义主 mock。旧 `?mode=ambient` 兼容落到 Copilot brief。

Acceptance fixture 与共享入口继续覆盖：

- fixture 与两个共享入口的顶层都只有 `Copilot / History`，默认进入 Copilot brief，且没有永久 stage/queue rail；
- 三类 proactive content 在一个 brief body scroll 中纵向同时存在，并支持长列表、刷新、忽略、查看来源和带入 session；
- `相关材料` 在静态 fixture 中保留可选择节点、原位更新详情的局部图；点击 `打开完整视图` 后只展示 production Result Browser reuse slot / contract marker，不复制宽幅浏览器内部的 `列表 / 文件夹 / 图谱`、toolbar、layouts 或 inspector；这些交互由 production component tests 覆盖；
- session 展示 live context、不可变正文引用、用户/AI 消息、推荐、工具进度和事务回执；
- 每个 run 的 receipt 在同一条消息内折叠/展开 artifact browser，四类产物可切换、条目直接可见、长内容 inline expand；普通条目不打开 modal，只有关系图等空间型 artifact 可进入宽视图；
- active session 中被显式推送的新线索使用普通 `recommendation` message item；预览、inline expand、忽略和 `带入下一轮` 都发生在该条消息内，不存在独立 session-clues 列表或外置详情面板；
- quick capabilities、`全部能力`、voice 和共享 prompt input 只在 session 出现；
- 一个包含多处 change 的真实 review fixture，验证 `N / Total`、previous/next、接受/拒绝、editor locator、stale 和批次完成；
- 正文 review fixture 覆盖 `工作视图 / 全部改动 / 纯净阅读`、稳定编号 pins、pin/queue/prev-next 同步、active-only accept/reject、键盘路径和窄屏 drawer→正文定位恢复；
- History 按日期和来源分组，使用 modal、inline diff、Before / After、定位和安全回滚；
- 宽屏右栏和窄屏 fixed drawer 使用同一生命周期与事务语义。

旧 v5 card-wall 三-tab、v6 fixed-shelf、v7 fixed `工作台 / 对话` rail，以及 staged/hybrid 的永久队列表达只作为历史交互证据，不再是当前 surface baseline。

## Interaction State Contract

- Top-level surface: `copilot | history`；切换只改变 projection，不创建新的 focused context、sensing runtime 或 transaction store。
- Copilot lifecycle: `brief -> session -> running -> session / review / error / cancelled`。`session -> review` 只在 run 产生 pending change 时发生；`review -> session` 在关闭、完成或取消 change set 后发生。brief 的显式 handoff 只进入 session 并装配 chips，不自动运行。
- Copilot run: `idle -> action/context composed -> assembling -> streaming -> proposed change set / no-change / error / cancelled`。
- Run artifact browser: `receipt collapsed -> expanded(category) -> item inline-expanded -> collapsed`；状态属于同一条 `runId` 消息，切换 `Changes / Insights / Sources / Trace` 不改变 Copilot lifecycle、thread scroll owner 或 URL。空间型 artifact 例外使用 `wide view closed -> open(artifactId) -> closed`，关闭后恢复 receipt/category/item focus。
- Sensing: `off | smart | continuous`；auto-run 是独立的 `disabled | enabled-by-policy`。任何组合都只能产出 brief 更新、只读分析或 pending candidates，不能自动接受或写入。
- Brief data: `idle -> loading -> ready / empty / error`；refresh 使用 `ready -> refreshing(previous snapshot retained) -> ready(new revision) / error(previous retained)`，并保证 latest-wins。后台刷新不改变 lifecycle state。
- Brief sections: `summary -> expanded -> summary`；三类始终同时存在并共享一个 body scroll。
- Related-material browser: `compact graph <-> explorer(list | tree | graph)`，共享 snapshot revision、complete items 与 selected source。新 revision 仍含 selected ID 时保留，否则回到最高 ranked item；density、collapsed folders、preset、Semantic、weak、zoom/pan 都是 view state，不改变 snapshot、不运行能力、不产生事务。Dialog `closed -> open -> closed`，Escape 关闭并恢复 opener focus；`带入协作` 只增加一次 context chip 并进入 session。
- Voice: `idle -> requesting -> listening -> transcribing -> draft / error`。
- Thread kinds: `user | assistant | recommendation | tool | receipt`；`receipt` 必须区分 compact run receipt 与 accepted transaction receipt。后台 projection refresh 不是 thread kind，细粒度 Trace 也不逐条膨胀为 thread message。
- Session clue: `discovered -> recommendation preview -> inline-expanded / queued-for-next-run / dismissed / stale`。`queued-for-next-run` 只装配 chips/draft，不改变 lifecycle、不冻结 run snapshot，也不自动运行；同一 clue 的补充信息原位更新现有 recommendation。
- Review set: `generating -> reviewable -> partially-accepted -> completed / cancelled`；change: `pending -> accepted / rejected / stale / error`。
- Document review: `view = work | all | clean`，`activeChangeId = stable change ID`。pin/queue/previous/next 只发送 `selectActiveChange(changeId)`；view switch 只改变原位 projection。Accept/reject 先读取 active ID、重新校验 source revision，再提交单项状态转换。
- Selecting a brief item may preview it in place；只有显式 `讨论 / 问 Copilot / 带入协作` 才进入 session、更新 chips 并聚焦 composer，且不会自动开始 run。
- Accepting one change writes at the frozen target and creates one addressable History transaction；同一 set 的事务共享 batch identity，其他状态都不创建事务。
- Rollback 是 confirmed inverse transaction；原 accepted row 保留并标记已回滚。

## Production Handoff

选定 adaptive shell 已经合并进静态主 mock：`intelligence-panel.js` / `intelligence.css` 是共享实现，`index.html` 与 `intelligence-lab.html` 是两个 host；`intelligence-ia-lab.html?variant=adaptive&mode=copilot&stage=brief` 是 acceptance fixture，其他 variant 保留回归价值。这个合并不等于 production runtime 完成；相关材料浏览器在 mock 中只是 reuse slot，不是另一套 UI 实现。

生产集成必须保留 capability IDs、action/context chip 语义、live-context/run-snapshot 分离、voice-to-draft-only、shared context/sensing runtime → Copilot brief → Copilot execution、task session、message-embedded artifact receipt/browser、app-owned ProposedChangeSet、append-only source-aware History、editor-local streaming review surface 和 responsive drawer。不得复制 lab 的固定文案、timer、确定性语音 transcript、固定计数或内存事务存储。

## Production Roadmap

- [ ] 用 app-owned Current Work State runtime 替换 fixture 推断和排序。
- [ ] 实现 latest-wins brief snapshot，sensing 时保留旧结果并处理 error/no-change。
- [ ] 为 90+ 项队列实现稳定 ID、虚拟化/增量加载、后台重排锁位和 `N 条已更新` 应用提示。
- [ ] 持久化 Copilot brief / session / review 的独立现场；composer 只在 session 可见，但 draft、chips、IME、voice 与 caret 不因返回 brief、切换 History 或进入 review 而丢失。
- [ ] 从真实 Markdown source ranges、Ambient relation IDs 和 link graph 填充 context chips。
- [ ] 实现 app-owned Composer adapter：把 proactive source candidates 映射成完整 ranked items + `ResultSubgraphInput`，生成带 revision/focus/reason/weak overlay 的 immutable snapshot；同一 refresh 只 build 一次。
- [ ] 从 store-bound Vault Search host 抽取 neutral controlled List、Tree 与 Graph surfaces；复用 result row、path-tree derivation、GraphPreset、element projection、layout、selection 与 Cytoscape lifecycle。
- [ ] 让 Quick Search host 与 Composer host 同时使用 shared projections；前者保留 query/search store/global cursor/hub navigation，后者装配 immutable snapshot、inspector/context/session actions，禁止复制 renderer/layout 或共享 host state。
- [ ] 先解决 `hub_constituent` 当前“计入 connected 但画布丢弃、isolation 只看 reference”的语义差异，再锁 shared acceptance tests。
- [ ] 实现 app-owned ProposedChangeSet controller、source-order navigator、editor/sidecar focus synchronization、stale detection 和 active-session candidate cache。
- [ ] 定义 app-owned Run record schema 与 compact receipt projection；把 Changes / Insights / Sources / redacted Trace 绑定到稳定 `runId`，由同一消息内 artifact browser 分页/虚拟化读取，并保存 active category、展开条目和滚动锚点。
- [ ] 把 active-session clue projection 接入现有 `recommendation` event store：stable clue/message ID、inline preview/expand、dismiss/stale、`带入下一轮` chip assembly 和原位更新；不得实现第二套 session-clues collection UI。
- [ ] 让 run stream 同步驱动正文 anchor 上的 candidate rendering、稳定 previous/next navigator 与 per-change accept/reject；禁止在 sidecar 复制第二份结果。
- [ ] 实现 document-owned review controller：稳定 source-order pin numbering、`work/all/clean` projections、active-only mutation、queue/pin/bottom-nav selection convergence、keyboard/focus announcements 和 narrow drawer locate/restore。
- [ ] 让同一 set 的 accepted changes 产生独立可定位、共享 batch identity 的 History transactions。
- [ ] 建立 Run record `acceptedTransactionIds` 与 History `originRunId/changeSetId/changeId` 的双向索引；从 History 返回时定位并展开来源 receipt，而不是打开普通 Run detail modal。
- [ ] 实现独立的 sensing `off / smart / continuous` 与 auto-run policy；加入“任何模式都不能 auto-accept/write”的 runtime guard。
- [ ] 把 History modal snapshot 绑定到 accepted transaction 的 immutable run snapshot。
- [ ] 通过共享 Composer transaction port 持久化 accepted 和 debounced direct-editor transactions。
- [ ] 选择并 app-own Obsidian/Electron microphone/transcription adapter。
- [ ] 在 History 后添加 document-history / Git adapter，不增加顶层 UI。
- [ ] 实现本合同的 proactive-intelligence measurement：retained useful outcome、quality/outcome、autonomy/interruption、review/control、efficiency、reliability 与 local-performance guardrails；补键盘 focus order、drawer close 和 screen-reader announcement。

## Rejected Patterns

- 拥有独立 context、conversation 或 execution runtime 的第二套 Ambient AI 系统。
- 把 Ambient 重新做成与 Copilot / History 并列的顶层 tab，而不是 Copilot 默认 brief 的感知能力来源。
- 永久 `工作台 / 对话` 二级 switch，或把 conversation medium 当作产品任务分类。
- Current Work State 作为大诊断模块。
- 用户必须理解 Ambient 内部术语。
- 自动 snapshot refresh 追加成聊天消息。
- 固定在 composer 上方、只容纳 2–3 项的 Ambient shelf。
- 只允许查看一类内容的 `下一步 / 相关材料 / 待整理想法` 分类 tab。
- 把 Ambient brief 与 Copilot thread 塞进一套需要永久 `工作台 / 对话` rail 才能理解的 body，或清空草稿后自动切换工作面。
- brief 常驻完整 composer，或在 lifecycle 内容内部放置位置不一致、无法恢复现场的单向返回按钮。
- 把 pending review 塞进 thread 或 History，或只保存一个无法表达多处候选改动的 draft patch。
- 把右侧待审 queue 当成主审阅表面，让正文只被动高亮；或让 queue、pin 和 bottom navigator 各自维护 active/order/status。
- `all` 模式中的接受/拒绝隐式作用于全部可见 diff，或让用户无法确认当前 active change。
- `纯净阅读` 显示 frozen before snapshot 冒充 committed source，或通过切换状态改变真实 change status。
- 用覆盖正文的大 badge/card 代替轻量编号 pin，或在窄屏把正文 review surface 塞进 drawer。
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
- 让 Graph node-cap 截断 List/Folder，或用 graph node count / overflowCount 冒充完整材料数量。
- 把一级 `文件夹` 结果视图与 Graph 的 `folder` layout 合并成一个状态，导致用户无法区分路径浏览和空间布局。
- 把 `weak` 发明成第四种 edge kind，或未经 adapter 就改用不同 domain 的 `MultiLensGraph`。
- 把 Composer block locator 当作 Vault source/node ID。
- 永久蓝色整栏底色、装饰性渐变和多层圆角容器。
- scope selector 出现在每条 Copilot 消息之前。
- 建议静默写入 Markdown。
- History 记录生成过程却不能定位、diff 或回滚真实来源。
