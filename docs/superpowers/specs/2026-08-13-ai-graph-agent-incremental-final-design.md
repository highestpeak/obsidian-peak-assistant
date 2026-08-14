# AI Graph Agent 增量生成：最终产品与交互设计

> 状态：**单次生成与 Composer Block 合同已修正，生产实现待收敛**
> 首次日期：2026-08-13
> 最近修正：2026-08-14
> 面向读者：产品 Owner、实现工程师、代码审查者、真实 Obsidian 验收者
> 交互原型：[Incremental AI Graph · Cytoscape Mock](../../gstack/ai-graph-incremental-cytoscape-2026-08-12/index.html)
> Composer 原型：[Composer AI Graph Block Mock](../../gstack/composer-ai-graph-block-2026-08-14/index.html)
> 实施计划：[AI Graph Agent 增量生产实施计划](../plans/2026-08-13-ai-graph-agent-incremental-production-plan.md)
> 前置公共能力：[Shared Graph Workspace 产品与交互规范](./2026-08-12-shared-graph-workspace-product-and-interaction-spec.md)

## 1. 最终结论

AI Graph 的最终产品模型是：

> **一个 AI Graph Block 可以保留多个已生成的图类型；一次 Graph Agent run 只生成或更新其中一个类型。每个类型都是有来源、有版本的独立 graph artifact，并由同一个 Cytoscape / `AtlasGraphCanvas` 渲染栈显示。**

支持的图类型是：

- `Topology`：当前知识是怎样连接的。
- `Thinking Tree`：推理分支是怎样逐步展开的。
- `Bridges`：哪些已验证概念把原本分离的领域连接起来。
- `Timeline`：事件、任务和依赖如何在时间中并行、汇合与推进。
- `Gaps`：任务所要求、但当前缺失或证据不足的连接在哪里。

它们不是同一张 canonical graph 的五个自动投影，也不是一次 run 必须同时生成的五个 entry。它们是同一个 Block 下可以逐个生成、逐个切换、分别更新和分别查看历史的图。不同类型可以引用相同来源或相同 canonical entity identity，但不共享必须同步变化的 node / relation body。

每个已生成类型独立拥有：

- `graphId`、head version 与历史版本；
- node、relation、evidence 与 provenance；
- layout、positions、viewport 与当前 explanation；
- run、Activity、Accept / Discard 与恢复状态；
- 当前 Markdown materialization 关联。

Graph Agent 以**离散、可验证、可回放的步骤**构图。每个步骤内部不展示 token 或隐藏思维链；步骤之间实时更新画布和 Activity。

Accepted graph 始终不可变。Agent run 修改的是当前类型的 working draft；只有该图校验通过且用户 `Accept` 后，才生成这个 `graphId` 的新 immutable version。其他已生成类型不被替换，也不需要重新生成。

## 2. 本设计解决的核心问题

此前的讨论暴露了五类根本问题：

1. **渲染实例被重建**：新增一个节点或一条线时整张图跳动，镜头、节点和边失去空间连续性。
2. **边与节点不在同一几何真值中**：外部 overlay、错误的动画遮罩或错误端点计算造成箭头偏移、断线、空白段。
3. **五种图只有不同名字，没有不同语义**：Tree、Bridge、Timeline、Gaps 使用同一套固定数据和同一段动画，难以理解。
4. **Agent 只有“提交整图”能力**：生产 Agent 当前更接近一次性生成完整结果，无法真实表达“先放节点、后连线、再删除、局部布局、最后 refine”。
5. **图与解释割裂**：用户看见图，却不知道这一视图在回答什么问题，也看不出 bridge 或 gap 的判定理由。

最终设计的关键不是再换一次布局参数，而是统一 operation、artifact、Block mapping 与 renderer 的真值：

```mermaid
flowchart LR
  A["Agent semantic operations"] --> B["Validated working-graph reducer"]
  B --> C["One versioned graph of the selected type"]
  C --> D["Block graph-reference map"]
  D --> E["One persistent Cytoscape renderer"]
  E --> F["Stable geometry, motion and viewport"]
```

## 3. 现状、术语与边界

### 3.1 当前已经存在的能力

当前生产源码已经完成 Shared Graph Workspace 的 renderer 收敛：

- `ContextualAIGraphView` 负责寻找并加载与当前上下文匹配的 AI Graph artifact。
- `AIGraphWorkspaceCanvas` 负责 AI Graph 的图类型、控制栏和 graph model 适配；当前多 Lens 输入是待迁移兼容路径。
- `aiLensToAtlasModel` / `aiLensLayouts` 把旧 Lens 数据转换为中立的 `AtlasGraphModel`，不再定义新的 artifact 合同。
- `AtlasGraphCanvas` 是统一 Cytoscape renderer。
- `MultiLensGraph` 与 `@xyflow/react` 已从生产路径删除；React Flow 不再是允许扩展的 Graph 技术。
- Artifact manifest、immutable versions、proposal / accept 边界、JSONL run events 已经存在。

### 3.2 当前尚未存在的能力

本设计不能误写为已经实现。当前关键缺口是：

- Graph Agent 主要仍通过 `read_sources` + `submit_graph` 一次性提交完整结果。
- UI 主要在拿到完整 `LensGraphData` 后替换 graph data，没有消费 typed incremental patch stream。
- `AtlasGraphCanvasImpl` 在 model / subgraph 更新路径上仍会销毁并重建 Cytoscape 实例，不满足连续增量渲染。
- Composer 尚无能够保留多个独立 `graphId` 的 AI Graph Block carrier、parser 与 renderer。
- 图类型菜单尚未区分“已生成可切换”和“尚未生成需先询问”的状态。
- 现有 artifact runtime 的 `graphType` 与产品图类型命名尚未统一。
- rich node card 尚未提供 AI Graph 专属的 `Explain / Expand / Focus / Evidence` 完整行为。
- per-graph explanation、Activity 的 operation receipt、最终 Refine 和场景缓存尚未接入当前生产分支。
- Mermaid / SVG / PNG 的 Composer materializer、隐藏引用和映射恢复尚未实现。

### 3.3 三个常被混淆的名字

| 名称 | 正确职责 | 是否 renderer |
| --- | --- | --- |
| `ContextualAIGraphView` | 根据当前文件 / 搜索 /入口加载正确 artifact，处理 loading、empty、error、ready | 否 |
| `AIGraphWorkspaceCanvas` | 当前 graph artifact、布局、run 状态和共享画布编排 | 否 |
| `AtlasGraphCanvas` | 统一 Cytoscape 图形渲染、交互、camera、minimap、inspect | 是 |

`MultiLensGraph` 是旧 React Flow 实现的名字，不是一个新的产品概念。它已经是迁移完成后的历史术语，不能继续增加行为。

### 3.4 AI Graph 与其他 Graph 产品的边界

AI Graph 是 sourced / versioned artifact。它不替代：

- Result Graph：搜索结果的结构投影；
- File Atlas：当前文件的一跳 / 两跳关系；
- Vault Intelligence：Vault 级 Hub、Gap、Bridge、Orphan、Drift 诊断。

AI Graph 的 Bridge / Gap 是**这个 artifact 和当前任务契约内部**的图类型；Vault Intelligence 的 Bridge / Gap 是 Vault 级维护诊断。两者可以复用视觉语言，但不能混用数据真值。

## 4. 最终信息架构

AI Graph Block 保持 Graph 为主。类型、布局和 Markdown 格式在同一条紧凑控制栏中；审计与运行细节按需展开。

```text
[Current graph type ▾]  [allowed layouts]                   [Save as ▾]
────────────────────────────────────────────────────────────────────────────

                              Graph canvas

  current operation
  Shift inspect · I pin                          Mini Map / zoom / fit tools
────────────────────────────────────────────────────────────────────────────
Graph name only
────────────────────────────────────────────────────────────────────────────
Composer actions: Insert · Copy · Comment · Explain · Expand · Focus · History
```

图类型菜单同时承担状态和导航：

- 已生成类型显示版本状态，点击后立即恢复对应 graph、layout、viewport 与 explanation；
- 尚未生成类型显示 `Not generated`，点击后打开生成询问，不直接出现假数据；
- 新建 Block 时先询问图类型，再允许输入可选 Prompt；
- Prompt 为空时使用该类型的默认生成指令和冻结上下文；
- 同一类型的 `Regenerate / Expand / Instruction` 进入该 `graphId` 的独立历史；
- 切换类型不删除、不覆盖、不重新生成其他图。

最终 UI 不保留常驻的 `Added / Changed / Removed / Validation passed` 大型 review dashboard。完整 Activity、semantic diff 和 Accept / Discard 仅在当前图存在 working draft 时出现。

## 5. 一个 Block、多个独立图，而不是一次 Run 的多视图包

### 5.1 Block graph-reference map

一个 Block 只保存引用和展示选择，不复制所有 graph body：

```ts
type ComposerAIGraphBlockState = {
  schemaVersion: number;
  blockGraphSetId: string;
  selectedType: AIGraphType;
  graphs: Partial<Record<AIGraphType, {
    graphId: string;
    headVersionId: string;
    selectedVersionId: string;
    layout: AIGraphLayout;
    viewport?: AIGraphViewport;
  }>>;
  materialization: {
    format: "mermaid" | "svg" | "image";
    graphType: AIGraphType;
    versionId: string;
    assetPath?: string;
  };
};
```

`graphs` 中没有某个类型时，表示尚未生成。它不是空 graph，也不是等待后台自动补齐的 view entry。

### 5.2 每个类型是独立 artifact

一次 run 只绑定一个 `graphId` 和一个 `graphType`。该 artifact 独立保存：

- node、relation、source / evidence 与 provenance；
- stable object ID；
- immutable version 与 `parentVersionId`；
- accepted review state；
- graph-specific explanation；
- display scene state 的引用。

不同类型允许引用相同的 source、evidence 或 canonical entity ref，但不能因为一个类型更新就隐式改写另一个类型。

### 5.3 一个可见 Block 只保留一个 live Cytoscape instance

正确模型是：

- 可见 Block 只有一个 live `cy`；
- 切换已生成类型时，从该 `graphId` 的 scene cache 恢复 elements、positions、zoom 和 pan；
- 当前图的增量 operation 直接 patch live `cy`；
- 其他类型没有后台自动生成，也不会抢走当前 camera；
- 切回旧类型时恢复其上次 accepted 或正在 review 的状态。

### 5.4 生成前询问

新建 Block 或点击尚未生成的类型时，打开同一个生成入口：

1. 预选目标图类型；
2. 展示可选 Prompt 输入；
3. Prompt 为空时明确使用默认指令；
4. `Generate` 创建这个类型的新 `graphId` 与 run；
5. `Cancel` 不创建空 artifact，也不修改当前图；
6. run 完成并 Accept 后，把新引用加入 Block map；若用户仍停留在生成目标则显示新图，若用户已手动切走则只显示 `Graph ready` 提示，不抢回当前类型和 camera。

## 6. 五种图的真实语义与生成故事

### 6.1 Topology

回答：**这些概念当前怎样连接？**

允许的构建顺序不是固定的。Agent 可以：

1. 先放一个或一批尚未连接的候选节点；
2. 检查 evidence；
3. 后续再补 relation；
4. 更新 relation predicate；
5. 删除不成立的节点或 relation；
6. 在结构变化后请求一次局部布局；
7. 完成后整体 Refine。

未连线节点是合法的 working state，不能为了画面“完整”而伪造关系。

可选布局：

- `Constellation`
- `Flow →`

### 6.2 Thinking Tree

回答：**推理是从哪个问题出发，经过哪些分支，得到哪些结论？**

Thinking Tree 必须呈现“生长”，而不是先把全部未来节点放在画布上再逐个点亮：

1. root question 出现；
2. 发现一个分支时添加 child；
3. child 成立后继续增长其 subtree；
4. 分支被否定时，删除或标记被剪枝的 subtree；
5. 只对受影响 subtree 做局部 reflow。

Thinking Tree 仍允许 Agent 先规划一小段 coherent outline，但不能显示尚未发现的 ghost nodes。

可选布局：

- `Flow →`

不提供 Community、Folders、Orbit 或 Constellation。

### 6.3 Bridges

回答：**哪个概念或关系让原本分离的两个领域第一次拥有可验证路径？**

Bridge 不是“大节点”，也不是“跨得很远的一条线”。一个 bridge candidate 必须：

- 两端属于此前不同的 connected components / semantic domains；
- 至少有一条证据支持它连接左侧；
- 至少有一条证据支持它连接右侧；
- 通过路径验证后才从 candidate 升级为 validated bridge。

生成故事：

1. 先显示真实的分离组件；
2. 放置 bridge candidate；
3. 连接一侧时仍显示 candidate；
4. 连接两侧并验证路径后突出 bridge；
5. 只有单侧或关键词相似的假 candidate 被删除；
6. 没有 bridge 时合法输出 `No validated bridge found`。

可选布局：

- `Constellation`
- `Flow →`

### 6.4 Timeline

回答：**事件、工作和依赖如何随时间并行、汇合和推进？**

Timeline 是 temporal DAG，不是假设所有数据都是一条月份链。它必须支持：

- 同一时间点开启多个并行 branch；
- branch 内部有自己的任务序列；
- later discovery 插入较早时间的事件；
- 一个事件依赖多个前序；
- 跨 branch relation；
- 多个 branch 汇合到 gate / milestone；
- 尚未确定的时间范围；
- 横向或纵向阅读。

Phase wrapper 必须是真实 compound group，随 child nodes 的边界变化而变化；不能是与节点坐标分离的固定 SVG / HTML 框。

可选布局：

- `Timeline →`
- `Timeline ↓`

### 6.5 Gaps

回答：**为了完成当前任务，哪条必要路径不存在，或哪条路径的证据弱到不能依赖？**

Gaps 不是画布上的空白区域，也不是为了填空而生成的新 semantic node。Gap 是两个真实 endpoint 之间的 typed diagnostic：

- `missing-path`：任务契约需要连通，但当前没有路径；
- `weak-path`：存在路径，但 evidence / provenance 不足；
- `conflicting-path`：存在相互冲突、尚未决议的支持链；
- `coverage-gap`：一个必须覆盖的 group / phase 没有足够对象。

Agent 必须先证明任务契约要求该路径，再声明 Gap。若已存在有效路径，candidate 必须被拒绝。零 Gap 是合法结果。

布局：

- `Diagnostic map`，固定语义布局；不提供无意义的通用布局切换。

### 6.6 Bridges 与 Gaps 的区别

| | Bridges | Gaps |
| --- | --- | --- |
| 观察对象 | 已经存在并经过验证的连接 | 应该存在但缺失、过弱或冲突的连接 |
| 是否进入 canonical graph | 已验证 bridge node / relation 会进入 | diagnostic 本身不进入 canonical semantic graph |
| 主要证据 | 两侧路径与 relation evidence | task contract + 缺失 / 证据不足证明 |
| 合法空结果 | 没有 validated bridge | 没有 actionable gap |
| 主要视觉 | 分离组件与中间 connector | endpoint、现有路径、缺失 / 弱路径 overlay |

## 7. Layout 控件的最终映射

| 图类型 | Layout 选择 | 说明 |
| --- | --- | --- |
| Topology | `Constellation · → Flow` | 网络或有向关系 |
| Thinking Tree | `→ Flow` | 固定横向树生长 |
| Bridges | `Constellation · → Flow` | 看组件或跨域方向 |
| Timeline | `→ Timeline · ↓ Timeline` | 同一个 temporal DAG 的横纵阅读 |
| Gaps | `Diagnostic map` | 语义固定，不暴露无意义的通用布局 |

按钮组必须复用 Shared Graph Workspace 的 Segmented 视觉与文案规则：

- 方向只表达一次；
- 横向显示为一个向右图标加 `Flow`，纵向显示为一个向下图标加 `Flow`；
- Timeline 显示为向右 / 向下图标加 `Timeline`；
- 不出现重复的“箭头图标 + Flow →”双重方向；
- 不给 AI Graph 暴露 `Community / Folders / Orbit`，除非未来某个具体图类型的语义明确需要并重新评审。

## 8. Graph Agent 的能力模型

### 8.1 Agent 决定语义，renderer 决定几何

Graph Agent 可以决定：

- 添加、更新或删除哪个对象；
- relation 的方向、predicate 和证据；
- 哪个对象构成 group、bridge、timeline phase 或 gap diagnostic；
- 何时请求局部 layout 或最终 Refine；
- 何时完成当前 graph run。

Graph Agent 不可以决定：

- `x / y` 坐标；
- zoom / pan；
- node bbox；
- edge control points；
- collision offset；
- 动画时长与 easing。

### 8.2 公共 operation envelope

所有工具调用最终收敛为同一种 operation envelope：

```ts
type AIGraphOperationEnvelope<TPayload> = {
  runId: string;
  graphId: string;
  graphType: AIGraphType;
  operationId: string;
  baseRevision: number;
  expectedRevision: number;
  type: AIGraphOperationType;
  payload: TPayload;
  evidenceRefs: string[];
  requestedAt: string;
};
```

关键约束：

- `operationId` 幂等；
- `baseRevision` 不匹配则拒绝，不做 silent merge；
- endpoint、stable ID、evidence ref 和 graph-type constraint 在 reducer 前校验；
- 一个 operation 可以原子地包含一组 coherent nodes / relations，但不能把整次 run 包成一个巨大 snapshot；
- UI 动画完成与 operation 是否持久化无关。

### 8.3 Agent 工具词汇

Read tools：

```text
graph.inspect
graph.inspectNeighborhood
graph.inspectComponents
graph.inspectPath
graph.inspectGraph
```

Canonical working graph tools：

```text
graph.addNode
graph.updateNode
graph.removeNode
graph.addRelation
graph.updateRelation
graph.removeRelation
graph.attachEvidence
graph.detachEvidence
```

Graph presentation tools：

```text
graph.beginGraph
graph.addGroup
graph.addDiagnostic
graph.removeDiagnostic
graph.requestLayout
graph.setExplanation
graph.completeGraph
```

Run tools：

```text
graph.validate
graph.completeRun
```

UI 可以给模型暴露多个有意义的 tool name，但它们在内部必须转换为同一个 reducer contract，不能各自直接修改 React state、Cytoscape 或 artifact 文件。

### 8.4 运行时所有权

`AIGraphRunCoordinator` 由 app / `AppContext` 组合和持有：

```mermaid
flowchart LR
  U["Instruction + frozen sources"] --> R["App-owned AIGraphRunCoordinator"]
  R --> A["Graph Agent"]
  A --> T["Typed graph tools"]
  T --> V["Schema + evidence + revision validation"]
  V --> L["Append operation event"]
  L --> D["Working graph reducer"]
  D --> P["Current graph projection"]
  P --> C["Composer AI Graph Block / AIGraphWorkspaceCanvas"]
  C --> Y["Persistent AtlasGraphCanvas / Cytoscape"]
  D --> X["Accept boundary"]
  X --> J["Immutable artifact JSON version"]
```

Service 层不能新增 module singleton 或通过 `AppContext.getInstance()` 偷取 runtime。

## 9. Step-stream 的状态机

每一步是一个可观察事务：

```mermaid
stateDiagram-v2
  [*] --> Proposed
  Proposed --> Rejected: schema, evidence or revision invalid
  Proposed --> Appended: validation passed
  Appended --> Reduced: reducer applies atomically
  Reduced --> Projected: current graph projection updates
  Projected --> Animated: renderer patches elements
  Animated --> Complete: visual settle ends
  Rejected --> [*]
  Complete --> [*]
```

状态顺序必须是 event-first：先校验并追加 durable operation event，再修改 working projection。若崩溃，replay 相同 events 必须产生与 live reducer 字节语义等价的 working state。

Activity 只显示 operation、对象、结果、revision 与 evidence receipt，不显示隐藏 chain-of-thought。

## 10. 增量绘制与镜头交互

### 10.1 Run 中的默认行为

- run 开始前已经锁定一个 `graphType`；Agent 不能在运行中改成另一个类型。
- 新建 Block 不默认偷偷生成 Topology，必须先询问类型。
- 用户可以提供 Prompt，也可以依赖该类型的默认指令。
- 当前 run 只更新目标 `graphId`；其他已生成类型保持可切换和可读。
- 新节点默认放在 semantic anchor 附近的最近可用位置；没有 anchor 时进入稳定的 free / staging region。
- 新节点允许暂时无 relation。
- 新 relation 可以晚于节点出现。
- 删除是正式能力，不是假装失败后把节点透明度调低。
- 普通 patch 不运行 whole-graph layout，不调用全图 `fit()`。
- 结构变化较大时，Agent 可以请求受影响 component / subtree 的 local layout。

### 10.2 Off-canvas focus

新增对象超出 viewport 时：

- 用户当前没有拖拽、缩放、hover card 或文本选择：camera 平滑 pan 到新增对象，保持现有 zoom；
- 用户正在操作画布：不抢 camera，在边缘显示 `New changes` chip；点击后再 focus；
- 不为了看见一个新节点而全图 fit；
- 同一 operation 批量新增时 focus 整个 changed bounding box，而不是逐个节点来回跳。

### 10.3 Refine

生成期间 layout control 锁定，避免每一步在 `Constellation` / `Flow` 间反复切换。

当前 graph run 完成后执行一次明确的 Refine stage：

1. 当前图使用自身保存的 display layout；
2. layout 读取真实 rendered label bbox；
3. 运行 deterministic collision settle；
4. compound wrapper 重新包住 children；
5. edge geometry 重新计算；
6. 当前图只做一次平滑 fit；
7. 保存当前图的 scene state，不改动其他 graph type 的 scene cache。

Refine 是显示层操作，不创建新的 semantic artifact version。

## 11. 几何、碰撞与 resize

新增节点不能继续使用少量固定 offset。Placement solver 必须：

- 从 anchor 外围逐圈搜索候选位置；
- 使用 Cytoscape 的真实 rendered bounding box；
- 计入完整 label、border、badge 和可配置 gutter；
- 排除现有 node、compound group 与 UI-safe regions；
- 优先保持 relation 方向和当前 view orientation；
- 多节点批量加入时同时求解，不逐个占用同一点；
- 在 `layoutstop` 后做一次 deterministic overlap check；
- resize 或 drawer 开合只更新 viewport / overlay anchoring，不重新随机布局。

建议验收阈值不是写死在逻辑中的常量，应来自 `templates/config/`：

- node-to-node minimum gutter：建议初始值 24px；
- node-to-wrapper minimum gutter：建议初始值 18px；
- focus padding：建议初始值 56px。

## 12. 边、箭头与动画

边必须完全由 Cytoscape 在同一坐标系绘制。禁止使用与 Cytoscape node 分离的 SVG / HTML overlay 来模拟 edge animation。

连续线条规则：

- Cytoscape 的最终 edge path 从第一帧就以低透明度存在；
- enter animation 通过 opacity / color / width emphasis 渐进，不通过会产生空洞的 dash mask 截断基础路径；
- source / target intersection 由 renderer 根据真实 node shape 计算；
- arrowhead 固定在 target，方向与 relation truth 一致；
- 动画期间 pan、zoom、resize 也必须保持 path 连续；
- label 与 edge 同步淡入，不能先漂浮在空白处。

建议 motion token：

| Motion | 建议范围 |
| --- | --- |
| Node enter | 360–520ms |
| Node move / local settle | 480–700ms |
| Edge enter | 720–1000ms |
| Remove | 260–420ms |
| Camera focus | 420–650ms |
| Local reflow | 550–800ms |
| Final Refine | 900–1400ms |

最终值全部来自 graph motion config，并提供 `prefers-reduced-motion` 分支。`+ node` / `+ relation` marker 放在节点右下角或 edge label 旁，不能遮盖节点正文。

## 13. Node rich card 与操作

Hover / inspect card 复用其他 Graph 的 rich card 交互：

- hover 节点显示；
- pointer corridor 允许从节点移动到 card；
- click node 或 `I` 可 pin；
- pan / zoom 后 card 继续锚定节点；
- `Esc` 关闭并恢复正确 focus。

AI Graph node card 的动作是：

| Action | 行为 |
| --- | --- |
| Explain | 解释此节点在当前图中的角色、证据与上下游 |
| Expand | 从此节点启动新的 Graph Agent draft expansion |
| Focus | 平滑居中该节点及其一跳邻域，不改变布局 |
| Evidence | 打开来源、quote locator、revision / hash 与 provenance |

### 13.1 Expand 的完整交互

`Expand` 必须是真正执行，不是显示“staged”后结束：

1. 点击后立即关闭 rich card；
2. 整个 expansion sequence 期间设置 inspect suppression，不能因 hover 或状态更新再次弹出；
3. 从当前 accepted version 建立 next-version draft；
4. `inspectNeighborhood` 读取真实邻域；
5. Agent 添加一个或一批 candidate nodes；
6. placement solver 把它们放在互不覆盖的可用位置；
7. evidence 足够后再添加 relation；
8. validate 后显示 `Accept expansion / Discard expansion`；
9. sequence 完成后才恢复 hover card；不会自动重新打开旧 card。

多节点 expansion 必须以批量 changed bbox 做放置与 focus，不能把所有节点叠在 anchor 的同一个 offset 上。

## 14. 每张图的文字解释

每个已生成 graph version 都必须有一段 version-bound explanation，因为图不能假设用户天然看懂。

```ts
type AIGraphExplanation = {
  headline: string;
  body: string;
  keyObjectIds: string[];
  evidenceRefs: string[];
  generatedFromRevision: number;
};
```

规则：

- 只解释当前可见 graph、diagnostics 与证据；
- 不输出隐藏 chain-of-thought；
- 明确回答当前 graph type 的问题；
- Bridges 说明连接了哪两个 domain、为什么成立；
- Gaps 说明任务为何要求这条路径、缺的是什么；
- Timeline 说明关键并行、汇合和依赖；
- 可折叠，默认在当前图完成后展开一次；
- 切换已生成类型时同步恢复该 graph version 的 explanation；
- explanation 与 graph version 一起接受，不能用后来的文字解释旧图。

## 15. Activity 的最终角色

Activity 是可选的 operation log，不是主界面。

Canvas 上只保留一个紧凑 current-operation indicator，例如：

```text
Adding 3 evidence nodes · revision 12 → 13
```

Activity drawer 中每项显示：

- tool / operation；
- affected object count；
- evidence receipt；
- base / expected / resulting revision；
- validation result；
- rejected 原因；
- local layout / focus 等 display action。

最终 semantic diff 作为 `Review changes` 的按需内容，而不是常驻右栏。

## 16. Persistence 与版本边界

### 16.1 写入顺序

```text
validated operation
→ append JSONL run event
→ reduce working draft
→ update current graph projection
→ patch Cytoscape
→ animate
```

### 16.2 Canonical carrier

- Accepted AI Graph：immutable artifact JSON version；
- Artifact history：manifest head + `parentVersionId` chain；
- Run operation history：partitioned JSONL；
- Working draft：可从 event replay 重建的临时状态；
- Block-to-graph mapping：app-owned durable record，并进入 SQLite / graph index 供快速查询；
- SQLite / graph index：可从 hidden ref、artifact manifest 与 durable mapping record 重建，不是唯一恢复来源；
- positions / viewport：display scene state，不是 semantic truth。

### 16.3 Markdown hidden ref

Composer 在可见 materialization 旁保存稳定隐藏引用。示例仅说明字段，不是最终 parser 语法：

```md
<!-- peak-ai-graph blockGraphSetId="..." graphId="..." type="timeline" versionId="..." format="svg" -->
![[graph-name.svg]]
```

隐藏引用至少需要：

- `blockGraphSetId`；
- 当前 materialized `graphId`、`graphType` 与 `versionId`；
- `format` 与可选 `assetPath` / checksum；
- schema version。

隐藏引用不是 graph body，也不复制历史。它用于在数据库 projection 丢失、Vault 同步到另一台设备或 Markdown 被重新解析时，定位 durable Block mapping 和 artifact。

### 16.4 Mermaid / SVG / Image materialization

`Save as` 没有 `Graph` 选项。用户选择什么，Markdown 就保存什么：

- `Mermaid`：写入当前选中图的 Mermaid fenced block；
- `SVG`：写入 SVG asset，并在 Markdown 中写 native embed；
- `Image`：写入 PNG asset，并在 Markdown 中写 native embed。

规则：

- 只 materialize 当前选中的 graph type、version 与 layout；
- 其他已生成类型仍保存在 Block mapping 和各自 artifact history 中；
- 切换已生成类型会使用当前 `Save as` 格式重物化该 Block，但不会生成新 semantic graph version；
- 切换 `Save as` 会在一个 Composer transaction 中替换可见 representation 和 hidden ref；
- SVG / PNG 的创建、替换、Undo / Redo、孤儿 asset 清理和 checksum 必须进入 generated artifact governance；
- Mermaid 是可编辑的简化表达，不能假装保留 Cytoscape 专属样式和交互。

### 16.5 Accept / Discard

- run 中的每一步不创建 artifact version；
- `completeRun` 只表示当前图 draft 完整、可 review；
- `Accept` 原子创建新 version 并更新 manifest head；
- 首次生成 Accept 后把 `{ graphType → graphId }` 加入 Block mapping；
- `Discard` 不创建 graph version，但保留 run receipt / rejection reason；
- 单纯切 layout、pan、zoom、focus、Refine 不创建 semantic version。

## 17. Validation contract

### 17.1 所有图类型共有

- stable ID 唯一；
- relation endpoints 存在；
- directionality 合法；
- evidence refs 可解析；
- operation revision 连续；
- projection object 必须引用当前 artifact object，除明确声明为 diagnostic / group；
- operation、artifact 与 Block mapping 的 `graphType` 必须一致；
- explanation revision 与 graph revision 相同。

### 17.2 Type-specific

- Topology：允许孤立节点，但必须标明 working / accepted 状态。
- Thinking Tree：除 root 外，每个可见 tree node 有唯一 tree parent；cross-reference 不冒充 parent。
- Bridges：validated bridge 必须让两个先前分离的 component 建立路径。
- Timeline：temporal edge 不得制造未声明的 cycle；并行与 join 语义可判定；wrapper 包含真实 children。
- Gaps：每个 diagnostic 有 contract reason、两个真实 endpoint 和 path check result；diagnostic 不写入 canonical semantic graph。

### 17.3 Complete run

一次 run 必须只完成一个已锁定 `graphType`。Bridge / Gap 等类型可以是经过验证的合法空结果，但不能为了让类型看起来“有内容”而伪造节点、relation 或 diagnostic。其他类型不属于本次 run 的完成条件。

## 18. 错误与恢复

- stale revision：拒绝 operation，Agent 重新 inspect；
- duplicate operation ID：幂等返回原结果；
- invalid endpoint / evidence：拒绝且不触发动画；
- animation 中断：re-render 当前 reducer state，不回滚已追加事件；
- UI reload：从 accepted artifact + active run events replay working draft；
- layout 失败：保留上一次 positions，标记 display failure，不破坏 semantic draft；
- graph generation 失败：其他已生成类型仍可查看；当前 run 不能 Accept，允许 retry 当前类型；
- Agent 取消：停止新 operation，等待已接受 operation settle，保留可恢复 draft receipt。

## 19. 不采用的方案

- **恢复或新增 React Flow**：违反统一 renderer 治理，也无法解决第二套交互语义的问题。
- **五个图类型各自一套 React component / renderer**：会复制 camera、card、Activity、layout 和修复。
- **后台同时常驻多个 Cytoscape instance**：内存和生命周期成本不必要；当前可见 Block 只需要一个 live instance。
- **每个 operation 重建整个 model / Cytoscape**：导致跳图、焦点丢失和动画断裂。
- **每加一个节点就全图自动布局**：破坏空间记忆，也会抢用户 camera。
- **Agent 输出坐标**：把不稳定的模型输出当成几何真值，无法保证碰撞与 resize。
- **把 Gap 画成虚构节点**：混淆诊断与 semantic truth。
- **把五个类型塞进一个 `viewPackage` 并要求一次生成**：与用户选择、独立 Prompt、独立历史和合法的“尚未生成”状态冲突。
- **只在 SQLite 保存 Block 映射**：Projection 丢失后无法仅凭 Markdown 和 artifact 恢复。
- **只写可见 Mermaid / SVG / PNG 而没有 hidden ref**：重新打开后退化成普通 Mermaid / Image，失去 AI Graph 操作和历史。

## 20. 讨论到设计的追踪矩阵

| 讨论中发现的问题 | 最终设计决策 | 实施工作包 |
| --- | --- | --- |
| 新增节点时整张图跳 | persistent `cy` + element patch + local layout | P4 Renderer |
| 箭头起点不准、线断开 | 单一 Cytoscape geometry；连续 base path | P4 Renderer / P8 QA |
| 节点新增时覆盖旧节点 | bbox-aware ring placement + collision settle | P4 Renderer |
| 节点超出画布 | idle auto-focus；busy 状态显示 chip | P5 UI |
| 节点可先无边、后连线、再删除 | typed independent node / relation operations | P1–P2 Runtime |
| Agent 有时主动 layout | explicit local `requestLayout` | P1–P4 |
| 完成后整体重排 | one final Refine per view | P4–P5 |
| 线绘制太快 | configurable 720–1000ms edge enter | P4 Motion |
| `+` 遮盖正文 | marker 锚定右下角 / edge label | P4 UI overlay |
| Review 右栏太重 | 主画布 + optional Activity / Review drawer | P5 UI |
| 图类型组件过多 | one orchestrator + one renderer + type-specific validators | P2–P4 |
| Timeline 太线性 | temporal DAG、parallel lanes、join、cross-dependency | P3 Timeline |
| Bridge 看不懂 | 两个分离 domain + validated connector | P3 Bridges |
| Gaps 看不懂 | task-required missing / weak path diagnostic | P3 Gaps |
| 每个图动画一样 | 每个 graph type 有自己的 operation grammar | P2–P3 |
| 生成期间 layout 是否生效 | generation 锁 display layout；local layout 仅显式请求；结束 Refine | P4–P5 |
| Expand 只是提示 | revision-guarded executable expansion | P2 / P5 |
| Expand card 重新出现 | run-scoped inspect suppression | P5 UI |
| Expand nodes 堆叠 | batch placement + changed bbox focus | P4 Renderer |
| 用户看不懂图 | version-bound per-graph explanation | P3 / P5 / P6 |
| 生成前不知道会生成什么 | type-first 生成询问 + optional Prompt | P3 / P5 |
| 新类型覆盖上一张图 | Block graph-reference map；已生成类型可切回 | P1 / P5 / P6 |
| Save as 与图内容不一致 | 当前 type + version + layout 的事务性 materialization | P5 / P6 |
| 重新打开丢失 AI Graph 身份 | hidden ref + durable mapping + rebuildable DB projection | P1 / P6 |

## 21. 完成定义

只有同时满足以下条件，才能把本设计标记为 production complete：

- 一次 run 只生成或更新一个已锁定图类型；
- 一个 Block 可逐个生成多个类型，并无损切换已生成图；
- 未生成类型打开 type-first、optional-Prompt 生成入口；
- operation stream 可验证、幂等、可 replay；
- incremental patch 不销毁 Cytoscape instance；
- 普通 patch 不触发 whole-graph fit / layout；
- 五种图具有不同且真实的 operation story；
- edge animation 无断线、无空白、箭头端点正确；
- placement 在批量 Expand、Refine 和 resize 后均无不可接受覆盖；
- rich card 的 Explain / Expand / Focus / Evidence 可真实执行；
- Expand 全程 card 不重开；
- 每个已生成图有 version-bound explanation；
- Accept 创建 immutable version，Discard 不污染 accepted graph；
- Block mapping、hidden ref 与数据库 projection 可互相校验并可恢复；
- Mermaid / SVG / PNG 均按当前 type、version 与 layout 正确 materialize；
- backward-compatible reader 可打开旧 artifact；
- focused tests、生产 build、storage / architecture checks 通过；
- 在真实 Obsidian 中用 DOM / geometry assertion 与短视频验证关键 motion、focus、resize、drawer、hover / pin / Escape。

## 22. 当前验证声明

本文件是对交互 Mock、现有生产源码、artifact contract 和全部 owner 反馈的当前设计真值。2026-08-14 修正废止了“一次 run 同时生成五视图 package”的旧结论。

- `DESIGN CONTRACT CORRECTED`
- `ISOLATED INCREMENTAL RUNTIME EXISTS · CURRENT BRANCH INTEGRATION PENDING`
- `COMPOSER AI GRAPH BLOCK NOT IMPLEMENTED`
- `REAL OBSIDIAN INTERACTION NOT VERIFIED`

静态 HTML Mock 证明的是交互方向与构图语法，不证明生产 Obsidian 行为。实施与验收必须遵循配套计划。
