# Peak Composer Intelligence Sidecar 跨会话交接

Date: 2026-07-22
Status: owner-reviewed static design and integration handoff
Audience: 持有另一版完整 Peak Composer 设计、准备把正文与 Intelligence sidecar 合并的下一会话

## 交接目的

下一会话不需要重做 Intelligence，也不需要重新翻完整历史对话。它需要把本轮已经确认的 sidecar 心智、状态和交互合同，接到另一版更完整的 Composer 正文设计上。

这个交接包有三个边界：

1. 记录当前最终决策，而不是按时间罗列所有草稿。
2. 明确静态 mock、已接受设计合同和生产未实现三种状态。
3. 给出一条可执行的整合路径，保护另一会话已经完成的正文设计。

更广的历史文档索引见 [`2026-07-22-peak-composer-related-document-map.md`](../specs/2026-07-22-peak-composer-related-document-map.md)。本文件是“现在应当怎么合”的合同，不是旧材料目录。

## 五分钟结论

Intelligence 是贴着正文工作的一个 Copilot，不是后台 dashboard，也不是三个等权 AI 产品。

```text
Copilot brief
  → 用户选择建议、材料或能力
  → task session（只有这里有 composer）
  → run / streaming / receipt
  → 正文原位 Review
  → 用户接受
  → History transaction
```

当前最高优先级决策：

- 顶层只有 `Copilot / History`。
- `Ambient` 是 Copilot 背后的感知和排序 runtime，不再是第三个用户 tab。
- Copilot 生命周期是 `brief -> session -> running -> session / review`，不是永久 stage rail。
- 用户不说话时，Copilot 默认展示主动整理好的 brief；开始具体协作后才显示对话与输入框。
- AI 候选改动必须回到正文实际 anchor 审阅，侧栏不保存第二份结果真相。
- 只有真实写入进入 History；建议、来源、洞察、Trace 和拒绝项留在 Run record。
- 侧栏保留小型相关材料关系图；弹出的完整材料浏览器必须复用生产 Vault Search Result Browser。
- 窄屏始终是 fixed right drawer，绝不掉到正文下面。

选定的视觉与状态 acceptance URL：

```text
file:///Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-ia-lab.html?variant=adaptive&mode=copilot&stage=brief
```

其他直接入口：

```text
# 当前集成 owner-review
file:///Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/peak-composer-editing-view-2026-07-09/index.html?mode=copilot&stage=brief

# 同组件的小 DOM host
file:///Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-lab.html?mode=copilot&stage=brief

# adaptive lifecycle 状态
.../intelligence-ia-lab.html?variant=adaptive&mode=copilot&stage=session
.../intelligence-ia-lab.html?variant=adaptive&mode=copilot&stage=review
.../intelligence-ia-lab.html?variant=adaptive&mode=history
```

共享静态 sidecar 当前版本：`adaptive-sidecar-2026-07-21`。

## 决策优先级与冲突处理

当文档互相冲突时，按以下顺序判断：

1. 本交接文件与当前 [`Composer Intelligence Sidecar UI Contract`](../specs/2026-07-15-composer-intelligence-sidecar-ui.md)。
2. [`Composer Block AI Capability Contract`](../specs/2026-07-15-composer-block-ai-capability-contract.md)。
3. 当前共享静态组件 `intelligence-panel.js` / `intelligence.css` 与 adaptive acceptance fixture。
4. `README.md` 的 source-of-truth 与验证说明。
5. `copilot-ambient-consolidation-review-2026-07-17.md` 中仍有效的 Ambient 合并原则。
6. 更早的三-tab、Command Center、Current Work State、Floating Panel 和截图，只作为历史证据。

需要特别防止两类回退：

- 早期合同中的 `Copilot / Ambient / History` 三 tab 已被后续决策覆盖。
- 中间稿中的永久 `工作台 / 对话` 二级 rail 已被 adaptive lifecycle 覆盖；`brief` 和 `session` 是可恢复状态，不是要求用户长期管理的两个模式 tab。

`staged` 与 `hybrid` 路由仍用于比较和回归，但不能反向定义主 mock。

## 用户 mental model

用户只需要理解一个贴着当前文档工作的 Copilot：

- 它知道当前块、选区、邻近内容和相关材料。
- 它会在用户没有提问时整理“现在值得处理什么”。
- 用户选择一件事后，进入围绕该任务的协作 session。
- 发送时冻结本轮上下文；之后移动光标不会改变正在运行的任务。
- AI 的读取、检索、执行和验证过程在消息流中有可核验反馈。
- 若产生正文改动，改动出现在正文原位。
- 用户逐项接受或拒绝；接受后才成为可定位、可回滚的 History 事务。

用户不应被迫理解 `Ambient`、`Current Work State`、`Recent Work Trace`、`Session Thought Trace`、`projection` 或 `Fast Lookup` 等内部名词。界面只回答：

- 现在有什么值得处理？
- 为什么此刻推荐？
- 哪些材料能帮上忙？
- AI 正在做什么？
- 正文哪里有候选变化？
- 哪些变化最终真正写入？

## 最终信息架构

### 顶层：Copilot / History

- `Copilot`：主动建议、对话、能力执行、Run receipt 和临时 Review 的连续生命周期。
- `History`：真实写入的事务账本、diff、定位和安全回滚。
- 切换顶层 tab 只切 projection，不创建第二套 focused context、conversation、sensing runtime 或 transaction store。

### Copilot brief

brief 是 Copilot 默认打开的主动工作面，不是聊天历史，也不是 dashboard。这里没有完整 composer。

一个 body scroll 中按固定顺序同时显示：

1. `接下来可能要做`
2. `相关材料`
3. `还没安放的想法`

交互规则：

- 三类内容不能压成互斥 tab。
- 每类可能有几十或上百项；默认只摘要显示高优先项，但必须显示总数和 `查看全部`。
- 使用 stable item ID、增量加载或虚拟化支持长列表。
- 后台重排不得让用户正在 hover、键盘选择或阅读的条目突然跳动。
- `更新建议` 保留旧 snapshot，后台完成后 latest-wins 原位替换，并说明新增、归档、重排或无变化。
- 更新 brief 不自动切换当前 body，也不追加聊天消息。
- 每条推荐直接用人话说明 why now，不永久摊开内部 trace。
- 忽略放入三点菜单或低权重动作，支持短暂撤销；不要把“本轮忽略”做成突兀主按钮。
- `讨论 / 问 Copilot / 带入协作` 只装配 action/context chips 并进入 session，不自动发送、运行或写入。
- “还没安放的想法”不是 todo；是否整理或写入由用户决定。
- 不显示“Ambient 只负责……”这类设计说明。

### 建议更新设置

感知频率与执行策略必须分开。

用户可见文案：

- `仅手动`：只在点击“更新建议”时检查。
- `停笔后更新（推荐）`：切换文件或停止编辑后检查。
- `编辑时定期更新`：编辑期间定期检查，会消耗更多 token。
- 独立开关 `自动准备待审改动`：符合策略时可以生成候选，但仍需用户审阅。

任何组合都不能自动接受、自动提交或静默写入正文。UI 不再直接使用“智能 / 持续 / 自动运行”这些难懂名字。

### Copilot session

只有用户进入具体任务 session 后，才显示 thread、quick capabilities、全部能力、voice 和固定底部 composer。

session 标题来自任务本身，不使用空泛的“对话”作为页面名。消息流至少覆盖：

- live-context 更新；
- 带不可变正文引用的用户指令；
- 用户消息；
- AI 回复；
- recommendation；
- tool / context / validation 进度；
- streaming / cancelled / error / no-change；
- run receipt；
- accepted-write receipt。

用户指令必须显示它引用的正文对象：块标题、范围和原文摘录；点击可定位回正文。不能只写“这段判断有点跳”，却不让用户知道是哪一段。

上下文分两层：

- `live context` 随当前块、选区、邻近内容和自动关联更新。
- `run snapshot` 在发送时冻结；运行期间后续光标变化只影响下一轮。

工具进度只展示可核验动作，例如读取当前块、检索材料、筛选来源、生成候选和验证格式。Trace 不是 chain-of-thought viewer。

### session 中的新线索

后台发现、且与当前 active session 直接相关的新线索，是普通 `recommendation` message item。

- 消息内直接预览最重要内容和 why relevant。
- 长内容在同一消息原地展开。
- 可忽略、标记 stale 或 `带入下一轮`。
- `带入下一轮` 只更新 chips / draft，不修改当前冻结 snapshot，也不自动运行。
- 同一 clue ID 原位更新，不重复追加另一套 unread 模型。

禁止另建 `session-clues` shelf、底部抽屉、外置列表或详情面板。

### Run receipt 与旧 Insights / Trace

旧设计里的 `Changes / Insights / Sources / Trace` 仍然保留，但只属于一个具体 `runId`。

一条 assistant/run receipt 折叠时显示：

- 本轮目标与状态；
- 耗时；
- 改动、洞察、来源、过程记录数量；
- 最多一条关键洞察。

展开后仍在同一消息里显示 run-local artifact browser：

- `Changes`：本轮 ProposedChangeSet 和各候选状态。
- `Insights`：有依据、可定位、可追问或可转成改动的判断。
- `Sources`：本轮冻结并实际使用的材料。
- `Trace`：可验证的读取、检索、工具、验证、错误和产物回执。

普通 artifact 条目直接可见，长内容在消息内展开；不要为每个条目开 modal。只有关系图等确实需要空间理解的 artifact 才可显式打开宽视图。

历史 Run 必须能重新展开，查看哪些改动已接受、拒绝、调整后接受或未处理。`Fast Lookup` 只是 runtime metadata，不是用户可见栏目。

### Composer 输入与能力

输入区遵循 [`Prompt Input Consistency`](../../conventions/prompt-input-consistency.md)，视觉基线来自 Chat Studio，生产共享内核是 `src/ui/component/prompt-input/`。

硬规则：

- composer 固定在 session 底部；brief 和 review 不显示完整 composer。
- quick capabilities 紧贴输入区上方。
- `全部能力` 固定在 quick capability 行最右侧。
- 输入 shell 自己拥有唯一 focus ring；textarea/search input 不再绘制第二层 outline。
- 编辑内容横向 inset 约 14px；footer divider、icon/send、模型和附件入口使用项目统一 token。
- `Enter` 发送，`Shift+Enter` 换行，IME composition 时不提交。
- voice 状态为 `requesting -> listening -> transcribing -> draft / error`；只形成可编辑草稿，绝不自动发送。
- `+` 可添加文件、图片、知识库文档、链接、当前选区或图谱上下文。
- 在 brief、History、review 之间切换时，draft、chips、caret、IME 和 voice 状态可恢复。

全部能力 picker：

- 支持搜索中文名、英文名和结果类型；
- 按能力域分组；
- 推荐当前对象的 2–3 项；
- 对不可用项解释 disabled reason；
- 每项使用真实语义 icon，不用“AI / 证 / 链”等文字方块充当 icon；
- 选择能力只生成 action chip，不自动运行；
- 选择文本、链接、链接图谱、并行内容或材料只生成 context chip。

能力全集至少包括：

`Suggest Tags`、`Suggest Links`、`Suggest Links Graph`、`Correct Content`、`Translate`、`Continue Writing`、`Review Article`、`Polish Document`、`Format Polish`、`Writing Plan`、`Write Article`、`Suggest Split`、`Summarize`、`Extract Concepts`、`Add Evidence`、`Check Task List`、`Rewrite Selection`。

上下文至少包括：

`select text`、`select link`、`select links graph`、`concurrent content`、当前块、邻近段落和 Vault / Ambient 相关材料。

运行产生 `ProposedChangeSet`，不能在聊天线程中堆一组结果卡片。

### 正文原位 Review

正文是候选改动的唯一主审阅表面。Sidecar queue、编号 pin 和底部 navigator 都只是同一个 `activeChangeId` controller 的投影。

正文提供三种 view state：

- `current`：只展开当前 active change 的完整原位 diff。
- `all`：所有候选在各自 anchor 原位显示，仍只有一个 active change。
- `original`：显示 committed source，不显示 pending candidate，但保留轻量定位 pin。

每个候选拥有稳定、按 source order 编号的 pin。以下入口必须选择同一个 active change：

- 正文 pin；
- 侧栏 pending queue；
- 正文底部 previous / next；
- 侧栏定位动作。

接受和拒绝始终只作用于 active change；`all` 不是隐式批量处理。

表现与安全：

- 文本默认在同一上下文显示删除线与新增高亮；Before / After 只是辅助检查视图。
- 流式候选未完成时不可接受。
- 新增内容要成为真实 paragraph、list、table、formula、image 或 native object draft，不是解释卡。
- 接受后变成普通正文，不永久保留大号 AI 标签。
- 每次提交前重新检查 source revision；stale/error candidate 不可接受。
- rejected/stale pin 保留到本次 Review 结束，编号不复用。

窄屏点击定位正文时，关闭右侧 drawer、聚焦真实 anchor，并保留紧凑 bottom navigator；review mode、active change、scroll 和 draft 都不能丢失。

### History

History 只记录真实改变：

- 用户直接编辑；
- AI 辅助且用户已接受；
- AI 建议后用户调整再接受；
- 系统回滚。

列表按日期分组，一眼显示作者来源、动作、目标、时间和范围，并支持很长时间线。

点击事务打开 modal，而不是在窄侧栏内永久展开长 diff。Modal 默认是 source-ordered unified inline diff，可切换完整 `Before / After`，并提供定位和安全回滚。

只有当前目标仍等于该事务的 accepted snapshot 时，才允许直接 inverse rollback；后续已经修改时必须说明冲突并停止破坏性覆盖。

同一 run 的多个 accepted change 可以按 batch 视觉分组，但每个 change 都是独立、可定位、可 diff、可回滚的事务。

Run 与 History 双向关联：

- Run record 保存 `acceptedTransactionIds`。
- History 保存 `originRunId / changeSetId / changeId`。
- History 可返回并定位原 Copilot receipt。
- rejected、stale、preview-only、Insights、Sources 和 Trace 不复制进 History。

### 相关材料与 Vault Search

这是本轮最后一次明确纠偏，必须完整保留。

侧栏 `相关材料` section 保留 Composer-owned 的小型关系预览：

- 当前正文对象；
- 约 5–7 个最强材料节点；
- 主要引用与 Semantic 连接；
- 点击节点原位切换选中材料；
- 显示标题、路径、相关理由和分数；
- `查看来源 / 带入协作`；
- `打开完整视图`。

只有弹出的宽幅 modal 复用生产 Vault Search Result Browser。Composer static mock 不得重新实现或仿制：

- List；
- Folder / Tree；
- 完整 Graph；
- graph layouts；
- Semantic / weak controls；
- zoom / pan；
- keyboard navigation；
- inspector。

生产复用合同：

- 一个 immutable material snapshot 同时包含完整 ranked items 与 capped graph projection。
- List / Folder 使用全部 items；Graph node cap 不能截断列表。
- List leaf ID 与 Folder file ID 完全同源；Graph source ID 是 items source ID 的子集。
- 侧栏预览与 explorer 使用同一 snapshot revision 和 selected source；切换 view 不重新检索。
- Vault Search 与 Composer 共用 controlled renderers，不共享 host store。
- Vault Search 保留 query lifecycle、search store、global cursor、hub navigation 和 telemetry。
- Composer adapter 负责 frozen snapshot、当前对象、关联理由、source inspector、context chips 和 session handoff。

当前 static modal 只显示 production reuse slot / contract marker。这不是生产组件已经实现的证据。

现有生产代码可作为抽取起点，但还不是中立大组件：

- `src/service/search/graph/resultSubgraph.ts`：结构图数据合同与 builder；
- `src/ui/view/quick-search/components/result-tree/buildTree.ts`：可复用的纯 Tree 派生逻辑；
- `src/ui/view/quick-search/components/result-graph/ResultGraphView.tsx`：现有 Cytoscape 能力，但仍绑定 Quick Search store/context；
- 当前没有 neutral `ResultBrowser`、`ComposerRelatedMaterialsAdapter` 或 `QuickSearchResultBrowserAdapter`。

生产抽取计划见 [`2026-07-21-vault-result-browser-shared-component.md`](./2026-07-21-vault-result-browser-shared-component.md)。旧 `vault-relation-graph.js/css` 已退役，不能恢复。

## 视觉与响应式合同

视觉方向：与正文同一个克制、现代、干净的文档世界。

- 连续白底、分隔线和留白优先于卡片背景。
- 禁止蓝色整栏底色、企业后台 card wall、card 套 card、装饰性渐变和无意义阴影。
- 外栏约 16px radius；composer / modal 约 12–14px；button / chip 约 7–10px。
- quiet violet 用于导航和 focus；muted teal 用于关联和成功；风险使用正文已有 amber/red。
- header 中 `Intelligence / 正在跟随正文` 作为一组几何居中；spark 是无方框的 18px mark；close 独立贴右。
- 不用极小字号和密集错位按钮。
- AI 感来自当前对象、自动上下文、流式状态、能力装配和正文原位结果，而不是装饰。

响应式：

- 宽屏为稳定右侧 sidecar。
- 低于约 `1180px` 为 fixed right drawer。
- drawer 可关闭、可重开、独立滚动；关闭后完全移出 viewport。
- drawer 不进入正文流，不掉到正文底部，不撑宽文档，不产生 horizontal overflow。
- 关闭/重开恢复 stage、draft、scroll、active change 和 opener focus。

## 状态与 ownership 合同

不要把所有 fixture state 合成一个大 store。生产 ownership 应保持：

| 对象 | Owner | 关键边界 |
| --- | --- | --- |
| Focused context | app / Composer host | 当前块、选区、邻近内容和关系投影 |
| Ambient sensing snapshot | app-owned sensing runtime | latest-wins、budget/cooldown、只投影到 brief |
| Copilot session | Copilot execution owner | thread、draft、chips、run snapshot、工具状态 |
| Run record | app-owned run store | Changes / Insights / Sources / redacted Trace 与未接受结果 |
| ProposedChangeSet | app-owned review controller | stable IDs、source order、revision/stale、active change |
| Document review projection | Composer editor | anchors、pins、current/all/original、streaming draft |
| History transaction | append-only transaction owner | 只有真实写入、source snapshot、定位、回滚、provenance |
| Related Result Browser | shared controlled UI + host adapters | renderer 同源，Quick Search / Composer host state 分离 |

关键对象不能混淆：

- `SuggestionFinding` 是发现，不是写入。
- `ProposedChangeSet` 是本轮待审集合，不是 History。
- `ProposedChange` 是一个可独立处理的候选。
- `Run record` 保存本轮完整产物，不等于 accepted transaction。
- `History transaction` 表示已经真实发生的单项写入。

## 当前 artifact 与 source of truth

| Artifact | 当前角色 |
| --- | --- |
| `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-panel.js` | 共享静态 sidecar 行为真源；版本 `adaptive-sidecar-2026-07-21` |
| `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence.css` | 共享静态 sidecar 视觉真源 |
| `docs/gstack/peak-composer-editing-view-2026-07-09/index.html` | 当前集成 owner-review host，不是 sidecar markup 真源 |
| `docs/gstack/peak-composer-editing-view-2026-07-09/mock.js` / `mock.css` | 主文档 fixture、focused-block/run/review/history host bridge |
| `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-lab.html` | 小 DOM sidecar 调试 host；必须保留 |
| `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-lab.js` / `.css` | 小文档 fixture 与 host adapter，不是 shared sidecar 真源 |
| `docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-ia-lab.html?variant=adaptive&mode=copilot&stage=brief` | 选定 IA/visual acceptance fixture |
| `intelligence-ia-lab.*` 的 staged/hybrid routes | 比较与 regression fixtures |
| `vault-result-browser.js` / `.css` / `-fixtures.js` | 侧栏 compact preview 与 expanded-modal reuse contract |
| `docs/conventions/prompt-input-consistency.md` | Composer / Chat Studio 输入一致性合同 |
| `docs/superpowers/plans/2026-07-21-vault-result-browser-shared-component.md` | production shared Result Browser 抽取 DAG |

共享静态 controller / host bridge 当前使用的主要事件：

- `peak:intelligence-submit`
- `peak:intelligence-run-state`
- `peak:intelligence-stage`
- `peak:intelligence-review-location`
- `peak:intelligence-review-action`
- `peak:intelligence-history-locate`
- `peak:intelligence-history-rollback`
- `peak:intelligence-open-source`

生产实现应把这些 fixture 事件转成 typed ports/adapters，不要原样搬 timer、确定性 voice transcript、固定计数、静态坐标或内存 History。

## 当前完成度：不要过度宣称

| 能力 | 静态 mock | 设计合同 | 生产 runtime |
| --- | --- | --- | --- |
| Copilot / History shared shell | 已有 | 已锁定 | 未完成 |
| brief / session / review lifecycle | 已有完整 fixture | 已锁定 | 未完成 |
| Ambient brief projection | 已有 fixture | 已锁定 | app-owned sensing 未完成 |
| Chat Studio-compatible composer | 已有视觉/交互 fixture | 已锁定 | production adapter 未完成 |
| capability picker / voice | 已有 fixture | 已锁定 | registry/permission/transcription 未完成 |
| run messages / receipts / artifacts | 已有 fixture | 已锁定 | schema、stream 与 persistence 未完成 |
| document-local review | 已有主 mock bridge | 已锁定 | editor controller 未完成 |
| History diff / rollback | 已有 fixture | 已锁定 | transaction persistence/safe rollback 未完成 |
| compact related graph | 已有 static preview | 已锁定 | Composer snapshot adapter 未完成 |
| shared expanded Result Browser | modal 只有 reuse marker | 已锁定 extraction plan | 未实现 |
| narrow fixed drawer | 已有 static behavior | 已锁定 | production focus/a11y integration 未完成 |

本轮成果是 owner-reviewed static design、状态合同和 QA。它不是 Obsidian production sidecar，也不证明真实 AI、voice transcription、editor write、JSONL/SQLite History、shared Result Browser 或 persistence 已接通。

当前工作树包含未提交的 sidecar 波次。下一会话必须以 working tree 为准，先检查重叠文件；不得从 Git HEAD 恢复这些文件，也不得删除 untracked 的新 Result Browser fixture/QA。

IA fixture 为了验证复杂语义，展示了更多候选改动、多 Run receipt 和较丰富的 recommendation message；shared host 的演示数据更少。合流时要对齐状态语义和 ownership，不要复制某个 fixture 的 `8 / 38 / 37 / 19` 数量、静态文案或整套 IA CSS/JS。

## 推荐阅读顺序

不要一上来读完整 `index.html` 大 DOM。

1. 本交接文件。
2. [`README.md`](../../gstack/peak-composer-editing-view-2026-07-09/README.md)。
3. [`Composer Intelligence Sidecar UI Contract`](../specs/2026-07-15-composer-intelligence-sidecar-ui.md)。
4. [`Composer Block AI Capability Contract`](../specs/2026-07-15-composer-block-ai-capability-contract.md)。
5. [`Prompt Input Consistency`](../../conventions/prompt-input-consistency.md)。
6. [`Vault Result Browser Shared Component Plan`](./2026-07-21-vault-result-browser-shared-component.md)。
7. 小 DOM `intelligence-lab.html` 及其 host CSS/JS。
8. adaptive `intelligence-ia-lab.html` acceptance fixture。
9. shared `intelligence-panel.js` / `intelligence.css`。
10. 另一会话的完整 Composer design 与它自己的 source-of-truth 文档。
11. 最后才按 integration point 局部读取 `index.html`、`mock.js` 和 `mock.css`。

如果需要追溯历史，再按 [`related document map`](../specs/2026-07-22-peak-composer-related-document-map.md) 定向阅读；不要无差别打开所有旧 HTML 和截图。

## 与完整 Composer 合流的执行 DAG

### Phase 0：锁正文 owner

- 以另一会话的完整 Composer 正文方案为 host baseline。
- 记录它的 block IDs、focus/selection、source ranges、native object adapters、document footer 和 narrow layout。
- 不把当前 `index.html` 的正文 wholesale 覆盖过去；当前 index 只提供 sidecar host bridge 参考。
- 明确 protected scope：正文排版、block 编辑、Atlas 边界和 native file source ownership 不因接入 sidecar 被重做。

### Phase 1：挂 shared sidecar shell

- 让完整 Composer host 挂载当前共享 sidecar API/contract。
- 顶层只保留 `Copilot / History`。
- 默认进入 adaptive brief；不复制 IA lab DOM，不重建三-tab 或永久 stage rail。
- 继续保留 `intelligence-lab.html` 作为同组件快速调试入口。

### Phase 2：建立 host adapter

- 将 host 的 focused block、selection、nearby content 和 source revision 投影为 sidecar live context。
- 保存 brief snapshot、session draft/chips/thread、review state、History state 和各自 scroll/focus。
- 生产实现使用 typed ports；static mock 可暂时保留现有 event bridge。

### Phase 3：接 brief 与 session handoff

- Ambient sensing 只更新 brief snapshot。
- brief 三类内容同时纵向常显。
- 选择建议/材料只装配 chips/draft 并进入 task session。
- composer 只在 session 固定到底部，并遵循 shared PromptInput contract。

### Phase 4：接 run stream 与消息产物

- 发送时冻结 run snapshot。
- 将 agent/tool/progress 映射为标准 thread items。
- 每个 run 只维护一条原位更新的 receipt。
- Changes / Insights / Sources / Trace 作为 receipt 内 artifact browser，不创建永久导航。

### Phase 5：接正文原位 Review

- 使用真实 document anchors 渲染 streaming candidates。
- 统一 `activeChangeId`、stable pins、pending queue 和 previous/next。
- 实现 `current / all / original` projection。
- accept/reject active-only，并在提交前做 source revision/stale validation。

### Phase 6：接 History

- 每个 accepted change 创建独立 transaction。
- 保存 author/source、before/after、origin run/change IDs 和 rollback safety。
- History modal 默认 unified inline diff，可切 Before/After。
- Run receipt 与 History 支持双向定位。

### Phase 7：接相关材料

- 保留 sidecar compact graph preview。
- 实现 Composer immutable material snapshot adapter。
- 先抽 production controlled Result Browser，再让 Quick Search 与 Composer 两个 adapter 同时接入。
- 不把 static modal marker、vanilla renderer 或 store-bound Quick Search host 当作生产复用。

### Phase 8：响应式、可访问性与回归

- 宽屏稳定右栏；窄屏 fixed right drawer。
- 验证 close/reopen、focus restore、scroll/draft/review restore 和无 horizontal overflow。
- 验证 keyboard、IME、screen-reader announcement、reduced motion 和长列表。
- 主 host 与小 lab 必须消费同一 sidecar implementation/version。

## 合流验收清单

- [ ] 顶层只有 Copilot / History。
- [ ] Ambient 只作为 Copilot brief 的 runtime projection。
- [ ] brief、session、review 是生命周期，不是永久 rail。
- [ ] brief 三类内容同时纵向可见，并支持长列表。
- [ ] composer 只在 session，固定到底部且与 Chat Studio 输入语法一致。
- [ ] 能力 picker 有真实 icon、搜索、分组、推荐和 disabled reason。
- [ ] 选择能力/材料只生成 chips，不自动运行。
- [ ] 发送冻结 run snapshot；后续 focus 变化只影响下一轮。
- [ ] recommendation、tool、receipt 都使用统一 message-item grammar。
- [ ] 每个 run 的四类 artifacts 内嵌在同一 receipt。
- [ ] 候选改动流式出现在正文真实 anchor。
- [ ] current/all/original、pin、queue、previous/next 共享 active change。
- [ ] History 只记录真实写入，按日期/作者展示并支持安全回滚。
- [ ] 侧栏 compact related graph 保留。
- [ ] expanded related modal 使用共享 Vault Search Result Browser；static mock 只显示 reuse marker。
- [ ] 窄屏是 fixed right drawer，不掉到正文下面，不产生横向 overflow。
- [ ] `index.html` 与 `intelligence-lab.html` 消费同一 sidecar version。
- [ ] 未把 fixture timer、固定数据、静态坐标、内存事务或 deterministic voice 搬入生产。

## 当前快速验证命令

不需要为每个小改动截图。先运行无截图快速回归：

```bash
node --check docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-panel.js
node --check docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-lab.js
node --check docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-ia-lab.js
CAPTURE_SCREENSHOTS=0 node docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-entrypoints.qa.mjs
CAPTURE_SCREENSHOTS=0 node docs/gstack/peak-composer-editing-view-2026-07-09/intelligence-ia-lab.qa.mjs
```

截至本交接，当前 working tree 的静态基线已经通过上述语法检查与两套无截图 QA：

- `index.html` 与 `intelligence-lab.html` 都报告 shared version `adaptive-sidecar-2026-07-21`；
- adaptive brief/session/review、History、capability picker、voice fixture、run artifacts、正文 Review、compact material preview 与 expanded reuse marker 均通过；
- `760 x 900` fixed drawer 的关闭、重开、边界和无横向 overflow 通过；
- IA harness 覆盖 adaptive/staged/hybrid 比较路线，共 18 个 desktop/narrow 与 run/review 状态；
- console errors 为 0；本轮截图数为 0；
- 未运行 production build/test，因为这里验证的是 docs/static mock，不是 production runtime。

方向收口后再做一次集中视觉 QA，至少覆盖：

- wide brief；
- wide session；
- run receipt expanded；
- document review current/all/original；
- History modal；
- compact material graph 与 expanded reuse boundary；
- narrow drawer close/reopen/locate document。

## 可直接复制到下一会话的任务提示

```text
我们要把已经确认的 Peak Composer Intelligence sidecar，合并到你当前会话中那版更完整的 Composer 设计里。

工作目录：
/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant

先读：
1. docs/superpowers/plans/2026-07-22-peak-composer-intelligence-sidecar-handoff.md
2. docs/gstack/peak-composer-editing-view-2026-07-09/README.md
3. docs/superpowers/specs/2026-07-15-composer-intelligence-sidecar-ui.md
4. docs/superpowers/specs/2026-07-15-composer-block-ai-capability-contract.md
5. docs/conventions/prompt-input-consistency.md
6. docs/superpowers/plans/2026-07-21-vault-result-browser-shared-component.md

先不要通读完整 index.html。先检查小 DOM intelligence-lab.html、选定 acceptance fixture：
intelligence-ia-lab.html?variant=adaptive&mode=copilot&stage=brief
以及 shared source：intelligence-panel.js + intelligence.css。最后只按 integration point 局部读主 mock。

目标：
- 保留你当前完整 Composer 正文设计作为 host baseline，不 wholesale 替换正文。
- 把共享 Intelligence shell、brief/session/review 生命周期、正文原位 Review、History、PromptInput 和相关材料合同接进去。
- intelligence-lab.html 继续作为同组件小 DOM 调试入口。
- 主 host 与 lab 使用同一 sidecar implementation/version。

硬约束：
- 顶层只有 Copilot / History；Ambient 是 Copilot brief 背后的 runtime，不是第三个 tab。
- brief 三类内容纵向同时可见；composer 只在 task session 底部出现。
- 选择能力/建议/材料只装配 action/context chips，不自动运行。
- 一个 run 的 Changes / Insights / Sources / redacted Trace 内嵌在同一 receipt。
- AI 候选必须回到正文真实 anchor；正文是 Review 真相。
- History 只记录 accepted/direct/rollback transactions。
- sidecar compact material graph 保留；expanded modal 复用 production Vault Search Result Browser，不在 Composer mock 重画 List/Folder/Graph。
- 窄屏必须是 fixed right drawer，不能掉到正文下面。
- 不恢复三-tab、永久工作台/对话 rail、永久 queue rail、card wall 或蓝色整栏底色。

先做 read-only overlap audit，列出完整 Composer host 与 sidecar 的 ownership/DOM/state/event 冲突，再给出最小合流 DAG。确认没有覆盖用户现有正文设计后再实施。保留当前 dirty worktree 中的 sidecar 文件，不从 Git HEAD 回滚。完成后跑无截图快速 QA；只有方向收口时集中截图一次。

交付：
1. 合并后的 Composer mock；
2. 更新后的 source-of-truth / integration spec；
3. static mock、accepted contract、production pending 的诚实状态矩阵；
4. 验证结果与未完成 production adapters；
5. 改动文件清单和真正的 source of truth。
```

## 本轮不应替下一会话做的决定

本交接没有看到另一会话的完整 Composer source，因此没有替它决定：

- 使用哪一个完整 Composer HTML 作为最终 host；
- 是否继续沿用当前 `index.html` 的正文 DOM；
- 生产 React Composer owner 的最终文件路径；
- shared Result Browser 的最终 package API；
- sensing、run record、History 的最终 persistence schema。

下一会话应先做 overlap audit，再在不改变上述产品合同的前提下选择最小、单一的整合 owner。
