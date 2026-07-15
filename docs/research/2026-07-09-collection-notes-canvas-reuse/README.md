# Collection Notes + Obsidian Canvas 复用（Graph Builder 重分类）

**Status:** 讨论存档（pre-research）。Backlog 级，未立项；升"调研候选"前需补齐文末的调研问题。
**Date:** 2026-07-09
**来源:** File Atlas mock v2 review 时对 graph builder（自定义图保存/编辑）的产品讨论
**关联:** `docs/superpowers/specs/2026-07-08-file-atlas-design.md`（Decision Log → "Graph Subview Is Read-Only; Custom Graph Editing Is Cut"）· `docs/gstack/file-atlas-mock-2026-07-08/index-v2.html`（被砍功能的原始形态）

## TL;DR

File Atlas v2 mock 里长出了一个完整的 graph builder（新建图、搜索加节点、手动连线、删边、draft/save 状态机、自定义图持久化）。讨论结论：**"保存一组笔记"是真需求，但正确的容器是 vault-native 的 MOC collection note，不是私有 graph 数据；手动连边是影子数据反模式；空间排布复用 Obsidian Canvas，不自建 graph editor。** Graph builder 整块从 File Atlas 砍掉，未来以 "Collection notes + Canvas 复用" 形态回归。

## 背景：被砍掉的东西是什么

v2 mock 的 Graph 子视图包含：

- System views（1-hop / 2-hop 自动图）之外的 **Custom views 管理**：新建 / 复制 / 删除已保存的图
- **节点编辑**：搜索 vault notes 逐个添加进图
- **边编辑**：手动在两个节点间连线、点击边删除、edge label
- **draft / save 状态机**：编辑 auto graph 自动派生 draft，需要显式 Save changes
- 5 种布局预设 + semantic 开关 + 节点拖拽

这个体量等于甚至超过 Atlas Tree 本身，而 spec 的 Non-Goals 明确写着 "should not become a vault-wide graph"。用户自己的直觉也是"越来越觉得很复杂好像没啥用，但是好像又觉得有用"。

## Mock review 暴露出的具体问题

这轮对话里并不是简单说"graph builder 太复杂"，而是逐项把复杂度拆开看，最后发现多数交互都在服务一个错误容器。

### 1. Graph 的数据边界必须先收窄

一开始 graph 里混进了 external link、Copilot insight、block、resource 等元素，用户明确纠正：**graph 暂时只看 note 之间的关系**。互联网链接、Copilot claim/evidence、当前文件里的 block tree 都可以在 Atlas Tree 或 Inspector 里出现，但不应该进入 note graph 的节点集合。否则 graph 的语义会从"笔记关系"漂成"任意对象关系"，后续所有操作都会变得不可解释。

结论：

- File Atlas Tree 可以枚举 heading / paragraph / table / image / code / claim / evidence / issue 等文档 block。
- File Atlas Graph 只看 vault notes 和 note-to-note relation。
- External link 与 vault link 必须区分；external link 不进入当前 graph builder 的节点模型。

### 2. Layout view mode 是 graph 的工具，不是 Atlas 全局 filter

旧 Vault Search mock 里 `Constellation / Flow ↓ / Flow → / Folder tree / Orbit / Semantic` 是 graph view mode：它们和画布绑定，用来回答"这张图怎么看"。最初 v2 mock 把这些控制放在 Atlas toolbar 里，离 graph 本体太远，用户反馈"view mode 离 graph 本身太远"。

正确理解：

- `Constellation`：看聚类和中心性。
- `Flow ↓ / Flow →`：看引用/依赖方向，只是纵向或横向表达。
- `Folder tree`：看这些 note 在 vault 目录中的位置。
- `Orbit`：围绕当前 note 或 hub 看一圈邻居。
- `Semantic`：graph 内 note-to-note semantic edge 的显示开关，不是全局搜索语义开关。

如果保留 read-only graph，这组 controls 应该贴在 graph title / canvas header 附近，而不是和 Blocks / Resources / Insights filters 混在一起。它们可以保留，因为这是"读图方式"，不是"建图能力"。

### 3. 搜索语义混乱

mock 里同时出现了两个搜索：

- 顶部 document search：搜索当前文档的 blocks、links、saved insights。
- Graph builder search：搜索 vault notes，把 note 加进当前 custom graph。

用户指出这两个语义完全不同。顶部搜索看起来属于 Atlas / current document；graph 里的 `Search vault notes` 是给某个 map 加 note，不能共享同一个视觉层级。后续又进一步指出：搜索结果行应该点击整行直接加入，不应该让用户移动到最右侧点一个加号。

这暴露了 builder 的核心问题：只要允许在 graph 内"找 note 加进去"，它就需要独立搜索、候选列表、已加入状态、空结果、draft/save，复杂度马上膨胀。

### 4. `Add selected block` 和 `Add tray items` 都是错层级

`Add selected block` 看似方便，但 Tree 里的 selected item 可能是 heading、table、image、claim、issue 等 block；Graph 的节点却应该是 vault note。block 和 graph note 不是同一层对象，因此这个按钮会制造模型错位。

`Add tray items` 也类似。Selection Tray 可以收 block、external link、Copilot insight、code block 等任意上下文；把 tray 直接灌进 note graph 会再次打破 note-only 边界。

结论：graph builder 不应该从 block selection / tray 批量吃对象。未来如果要保存集合，应从明确的 **note selection** 生成 collection note，而不是把任意 Atlas selection 变成 graph nodes。

### 5. Custom graph list 变成了另一个产品

Custom views 管理开始需要：

- System views 与 Custom views 的分组。
- System views 固定在上面，不可删除，只能 duplicate。
- Custom views 按最近编辑时间倒排，新建 / 复制后插入 custom 第一位。
- 每个 custom view 需要 duplicate / delete，且按钮要对齐、不能遮挡标题。
- Auto graph 编辑时要 fork 成 draft，之后有 save changes。

这些需求本身都合理，但合在一起已经是一个"saved graph manager"。它不再是 File Atlas 的辅助视图，而是一个新的 collection 管理系统。既然本质是"保存一组 note"，就应该转成 vault-native collection note，让 Obsidian 文件系统、Git、搜索和链接系统来承担管理。

### 6. Node / edge 操作把 read-only graph 推成 editor

对话中逐步暴露了这些 builder 交互：

- node 点击菜单：Open / Focus / 1-hop / Add / Connect / Hide。
- Hide node 后，所有相连 edge 也必须消失。
- 节点必须可拖动。
- 边必须可点击删除。
- 手动 connect 后可能还要写 edge label。
- 菜单不能离节点太远，popover 要贴近触发对象。

这些都是一个 graph editor 必须解决的问题。它们不是 File Atlas 的核心价值，而是自建 Canvas/Excalidraw 式编辑器的起点。尤其是 manual edge 和 edge label，会制造 markdown 里不存在的关系数据。

因此保留方向应改成：

- read-only graph node：Open / Focus / Expand 1-hop / Add to tray 可以保留。
- ephemeral hide from view 可以作为临时阅读过滤，但不持久化。
- 删除 node、删除 edge、手动 connect、edge label、save changes 全部移出 File Atlas。

### 7. Inspector 对 builder 没有提供足够价值

Graph builder 期间右侧 Inspector 曾经尝试展示 `Why this matters`、`Block details`、`Saved state`、`Available handoff` 等。用户多次指出这些内容大多是同类型模板话术，对实际决策没有帮助。真正有用的是 preview / reveal / open 这类直接操作，而不是解释这个 block 为什么重要。

这也支持了砍 builder：如果右侧无法提供稳定、高价值的编辑上下文，graph editor 只会增加一堆无解释力的状态面板。

## 可以沉淀下来的 graph UX 原则

即使 graph builder 被砍，以下原则仍应进入 File Atlas Graph / Collection note 后续设计：

1. **Graph read-only first**：Atlas Graph 是查看 note neighborhood 的表面，不是建图工具。
2. **Note-only graph**：节点只放 vault notes；block、external link、Copilot insight 走 Tree / Inspector / Tray。
3. **View mode 贴近画布**：layout presets 属于当前 graph canvas，应放在 graph title/header，而不是 Atlas 全局 toolbar。
4. **System views 与 saved collections 分离**：1-hop / 2-hop 是自动系统视图；用户保存的是 collection note，不是 plugin-private graph。
5. **Whole-row actions**：搜索候选、列表项这类高频操作尽量点击整行，不把主要动作藏在最右侧小按钮。
6. **No shadow edges**：如果要表达关系，写成 markdown link；如果只是空间排布，导出 Canvas。
7. **Lucide/SVG icons only**：生产 UI 不使用 emoji icon，统一正规 icon。
8. **单一 graph 渲染栈**：File Atlas 的 graph 子视图必须复用 Vault Search Result Graph View（`src/ui/view/quick-search/components/result-graph/ResultGraphView.tsx`，cytoscape.js + fcose/cise/cola/dagre，presets constellation / flow-tb / flow-lr / folder / orbit）——抽成共享组件喂不同 subgraph，禁止出现第二套 graph renderer；两个 surface 的 preset、节点/边样式、交互语法保持一致。

## 讨论：拆成三个 job 分别判断

graph builder 实际上把三个价值完全不同的能力捆在了一起：

### ① 圈定一组相关笔记 —— 真需求

"面试准备的 9 篇笔记"、"Command Gateway 相关的 11 篇"——这组东西经常一起用，不想每次重新找。本质是**可复用的上下文集合**，对接 Document Copilot 时价值最直接：一次圈定，反复 send。用户摇摆中"觉得有用"的部分全部来自这个 job。

### ② 声明笔记间的关系（手动连边）—— 伪需求，反模式

如果两篇笔记的关系是真的，它应该以 `[[link]]` 写进 markdown——那才是 Obsidian 的数据真相，backlinks、native graph、本插件自己的索引全都能消费。画在自定义 graph 里的边是**只存在于插件私有存储里的影子数据**：

- vault 里看不到，git diff 里没有
- 笔记删除/改名后悬空
- 换任何一个入口（native graph、backlinks 面板）看到的关系都和它不一致
- draft/save 状态机、edge popover、删边确认——全部复杂度都在为这份影子数据擦屁股

"很复杂好像没啥用"的直觉是对的：**复杂度全花在了错误的数据模型上。**

### ③ 空间排布 / 自由可视化 —— Obsidian Canvas 已经做了

自由空间排布、手动连线、分组，就是 Canvas 的核心产品。在插件里手搓一个减配版 graph editor 去和宿主的一等公民功能竞争，赢不了也没必要赢。

## 结论：未来形态 = MOC collection note + Canvas 导出

把 "Save graph" 重定义为 "**Save as collection note**"：

```markdown
---
type: collection
---
# Interview Rehearsal
- [[2-Story Cards]]
- [[Speaking Practice Loop]]
- [[Toastmasters Story Notes]]
...
```

这一步解掉所有复杂度：

| 原 graph builder 的问题 | collection note 的答案 |
| --- | --- |
| 私有 graph 持久层 + draft/save 状态机 | 文件即数据，git 管版本，编辑集合 = 编辑 markdown |
| 手动连边的影子数据 | MOC 里的链接就是边；File Atlas graph 渲染任何笔记的 local neighborhood，打开 collection note 自动得到这张图（只读） |
| Send to Copilot 的 payload 来源 | 解析这篇笔记的 links，和 Selection Tray 同一条通路 |
| 空间排布 | "Export to Canvas" 动作生成 `.canvas` 文件，排布交给宿主 |
| 生成文件放哪 | ChatFolder 下 `collections/` 子目录（`folderPaths.ts` 的 `AI_PATH_SUBFOLDERS` 加一项） |

**使用流设想**：Selection Tray / graph 里圈笔记 → Save as collection → 以后在 Atlas 打开这篇 collection note 图自动是它，或直接 send 给 Copilot。

## 与 File Atlas 的边界

- File Atlas 当前 graph 子视图**只读**：system views（1-hop / 2-hop）+ 布局预设 + 节点 popover（Open / Focus / Expand 1-hop / Add to tray）。无 create / connect / save / delete。
- 布局预设属于 graph canvas：`Constellation / Flow ↓ / Flow → / Folder tree / Orbit / Semantic` 应贴近图标题与画布，不放在 Atlas 全局过滤条。
- Graph 节点仅限 vault note。External link、Copilot insight、file block 仍由 Tree / Inspector / Tray 承担。
- Collection notes 是独立小 feature：本质是 "selection → markdown note" 的一个写盘动作 + Atlas 对 `type: collection` 笔记的识别渲染。体量小，价值密度比 graph editor 高。

## 升"调研候选"前要回答的问题

1. `.canvas` JSON schema 的稳定性与官方文档现状；第三方插件读写 Canvas 文件的惯例（JSON Canvas 开放规范 vs Obsidian 内部实现的差异）
2. MOC collection note 的 frontmatter 约定：`type: collection` 够不够？要不要 `members` 属性冗余一份结构化列表，还是纯靠正文 links？
3. Export to Canvas 时节点初始布局怎么给（复用 Atlas graph 当前布局坐标？）；Canvas 文件后续被用户手动编辑后，与 collection note 的关系（单向导出即可，还是要识别回读？倾向：单向，不做同步）
4. Selection Tray → collection note 的写盘动作放哪层（Command Gateway capability？）；与已有 ChatFolder 生成文件约定的对齐
5. Atlas 识别 collection note 后的渲染：members 作为一跳邻居渲染即可，还是需要专门的 collection 视图？

## 决策记录位置

- Spec 正式决策：`docs/superpowers/specs/2026-07-08-file-atlas-design.md` → Decision Log "Graph Subview Is Read-Only; Custom Graph Editing Is Cut (2026-07-09)" + Ideas Reclassified 表 + Non-Goals
- Roadmap 登记：`docs/roadmap.html` `#backlog` 段 "Collection notes + Canvas 复用"（引用本文档）
- 流水账：`docs/progress.md` 2026-07-09 条目
