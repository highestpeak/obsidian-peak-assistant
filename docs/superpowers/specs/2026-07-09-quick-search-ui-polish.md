# Quick Search UI Polish — 2026-07-09 评估批次

**Status:** shipped 2026-07-09
**Date:** 2026-07-09
**Owner surface:** Vault Search / Quick Search（List / Tree / Graph 三视图 + Inspector 侧栏）
**Related root doc:** [`docs/12-feature-search.html`](../../12-feature-search.html)
**Origin:** 2026-07-09 session 对 quick-search 全流程（4 张截图：Tree / Graph / List+Inspector / List）做的 UI/UX 综合评估，逐项与产品 owner 确认取舍后的收敛结果。本 spec 是该 session 的唯一落库文档；roadmap 只登记指向本文的一行。

## Delivery Log — 2026-07-09

**全部 8 项按 Phase 1 → 3 顺序落地，零 Non-Goal 越界，全部 197 test file 通过，`npm run build` clean。**

| Item | 交付形式 |
| --- | --- |
| W1 分数归一 | 新 pure `src/service/search/query/scoreNormalize.ts`；`SearchResultItem.displayScorePercent` 字段；`queryService.textSearch` 末尾调用；`VaultSearchResult` 消费；pill tooltip "Relative to the top match in this result set" |
| W2 Isolated grid | Phase 0 build 通过——`layoutIsolatedGrid()` 在工作区中已实现（未提交前置），需真机 reload 目视确认无堆叠 |
| W3.1 去 Check 图标 | `ConnectedSection` 拿掉 `<Check>`，只留 muted 百分比 |
| W3.2 UNLINKED 降噪 | **决策变更（session end 收到）**：owner 明确不做 `+ Link` 动作按钮（写 vault 有回归风险且语义偏 UNLINKED 本身），改为降噪——UNLINKED 徽章去掉琥珀底、改小写 `unlinked` + muted 前景。**不写 vault**。原方案 A 与备选 B 均 **rejected**，落到 Session 决策记录 |
| W3.3 tooltip + `↔` 合并 | 新 pure `mergeConnectedLinks.ts`（out+in 同 target 合成 `both`，first-occurrence order 保留）；`DirectionIcon` 三态 (`ArrowRight` / `ArrowLeft` / `ArrowLeftRight`)；SEM/CO-CITE/unlinked 徽章 `title` 属性挂描述 |
| W4 高亮 cap | `SEARCH_SNIPPET_HIGHLIGHT_CAP = 4` 落 `constant.ts`；`capSpans` 在 `renderSnippetHighlights.tsx` 导出；`renderHighlightSpans(result, { cap })` 加参数，snippet 侧传 `true`，标题不 cap（Session 决策） |
| W5 Tree 密度 | 文件夹计数从 row 右缘挪到紧跟名字（flex row + `min-w-0`）；文件行增 `IntensityDot`（拆到 `intensityTier.ts` 保证可测）；三档阈值 `SEARCH_RESULT_INTENSITY_*_THRESHOLD` 进 `constant.ts` |
| W6.1 Graph 命名 | **owner 拍板保持现名**（`Constellation` / `Flow ↓` / `Flow →` / `Folder tree` / `Orbit`，Open Question #2 收敛为 B 方案），零代码改动 |
| W6.2 Semantic 开关 | 代码核对：`GraphEdgeType.SemanticRelated` 走 `mobius_edge` 本地读，无 LLM。tooltip 落"Uses pre-indexed embeddings — instant, no AI credits, no network."；`Semantic` 文字标签本就存在（源自 V2 迁移） |
| W7 List 密度 | store 字段 `treeDensity` → `resultDensity`（连带 `TreeDensity` → `ResultDensity` type、`switchedTreeDensity` → `switchedResultDensity` event kind）；`TreeDensityToggle` → `ResultDensityToggle`；toolbar 上 List/Tree 都渲染此 toggle（Graph 不渲染）；**默认值从 `compact` 改为 `detailed`**——不然 List 用户一进来会莫名少 snippet + path breadcrumb；VaultSearchResult 单行 compact 变体（title + score pill，隐藏 snippet/path） |
| W8 改名 | `SearchModal.tsx`: `Suggest` → `Refine`、`Recent Suggest` → `Recent Refine`、`AI Analysis` → `AI Search`；`templates/config/settings.json` 4 处 prose 同步（72/115 spec 显式点 + 214/225 aiAnalysis section title / recentLimit desc，保持全局命名一致） |

### 测试

- `test/quick-search-score-normalize.test.ts` — 7 case（含 spec 示例 [1.48, 1.44, 0.5] → [100, 97, 34]、单元素、空集、全零、保序、finalScore→score fallback、混合 scoreless）
- `test/inspector-link-merge.test.ts` — 7 case（out+in→both、纯 out/in 通过、跨 target 不合并、多路径混合、merge policy for context/convergence/relevance、同向 dup 不误 flip）
- `test/snippet-highlight-cap.test.ts` — 5 case（低于/等于/高于 cap、类型不加权、空输入）
- `test/result-tree-intensity.test.ts` — 12 case（三档阈值边界 66/33、null/undefined、全同分）
- 全套 `npm run test` 197/197 绿

### 决策变更 & Open Questions 收敛

- **W3.2**：spec 原方案（`+ Link` 动作按钮 + 文末 `## Related` 追加）在实施时被 owner 拒绝。理由：从搜索 UI 直接写用户 vault 内容是首例，回归风险与语义偏差（UNLINKED 本意是"就地包 wiki-link"，"文末 See also 段"是另一件事）合并起来不值这个功能。终选：**只降视觉噪音**。原 Risks/Tradeoffs 表 W3.2 一行降级为"已避险"
- **Open Question #1** (auto-review JSON snippet 泄漏) — owner 未表态，仍未在本批次范围，spec 保留 Open
- **Open Question #2** (W6.1 命名) — owner 拒绝 A/B 混合方案，选保持现名，本 spec 中 W6.1 已按此调整
- **Open Question #3** (`+ Link` 插入位置) — 因 W3.2 整体取消，此问题自动作废
- **Open Question #4** (Quick Search label 全量外置) — 仍未立项，本批次接受硬编码字面量改名的例外

## Summary

评估结论：quick-search 的信息架构骨架（三视图 + Inspector 分层 + 键盘导航 + 性能标注）是对的，问题集中在**语义表达层**——分数、徽章、开关、命名把系统内部概念未经翻译就暴露给了用户。本批次共 8 个工作项（W1–W8），全部是 UI 表达层修正，不动 ranking / 索引 / 图布局算法本身。

其中两个问题在评估时已经在工作区改掉但未构建验证（Inspector hub 双 section 重复、Graph isolated 节点堆叠），列为 Phase 0 验证项而非新工作。

## Reader And Goal

本文读者是实施这批 UI 修正的工程师或 coding agent。读完后应能：知道每项改动的确切文件位置和期望行为；知道哪些方案是评估时被明确否决的（不要"顺手优化"回去）；知道每项怎么验证通过。

本文不改 RRF / PPR / rerank 排序逻辑，不改 highlight 窗口选取算法（只加渲染上限），不改 Graph 布局引擎。

## Session 决策记录（明确否决项，禁止回改）

评估中以下建议被产品 owner **明确否决**，实施时不得引入：

| 被否决的建议 | 决策 | 原因 |
| --- | --- | --- |
| Snippet 里 `[[wikilink]]` 渲染成纯文本样式 | **保持原样展示** | wikilink 语法本身是用户熟悉的信息 |
| Hub 机器 ID（`Hub-000031ae70fe`）替换为可读标签 | **本批次忽略**，已单独登记 roadmap backlog「Hub 可读标签」 | 不属于本需求 |
| 标题里的命中词不高亮、只高亮摘要 | **标题高亮保留** | 会破坏"橙色 = 匹配证据"的扫视契约：标题命中但正文无命中的结果会整行无橙色，像误报 |
| Graph 布局模式从 5 种砍到 2–3 种 | **5 种全保留**，只改命名 | 不同视图适应不同情况 |
| Isolated matches 改横向 chip 流式排列 | **改 grid 布局**（仅 isolated 区，主图不动） | owner 偏好 grid |
| AI 入口合并收敛 | **不合并**。四个入口功能各自独立（query 改写 / AI 搜索 / 库健康 / 图谱生成），只改两处命名 | 见 W8 |

命名终选（AskUserQuestion 确认）：`Suggest` → **Refine**；`AI Analysis` → **AI Search**；`Vault Intelligence` **保持不变**（为未来信号中心留扩展空间）；`Generate AI Graph` 保持不变。

## Current Facts

| Fact | Evidence | Why It Matters |
| --- | --- | --- |
| 分数 pill 直接 `Math.round(rawScore * 100)` 加 `%`，无上限截断。 | `src/ui/view/quick-search/components/VaultSearchResult.tsx:140-142`（计算）、`:196-198`（渲染） | `finalScore` 是加法 boost 合成值，天然可 >1，于是出现 148%。 |
| `finalScore = base + freqBoost + recencyBoost + graphBoost + anchorBoost + clickBoost + hubDocBoost + keywordBoost`。 | `src/service/search/query/rankingBoosts.ts:184`（公式）、`reranker.ts:373`（赋值） | 分数不是概率，任何"绝对百分比"展示都是语义错位；只能做**相对**归一。 |
| Isolated 节点 grid 布局已实现（未提交）：按字母排序、`regionLabel` 置于主图 bounding box 下方、`cellW=160 cellH=44`、列数 4–8。 | `src/ui/view/quick-search/components/result-graph/ResultGraphView.tsx:405-431` `layoutIsolatedGrid()` | 截图里的堆叠来自旧构建。Phase 0 先验证，仍重叠才算 bug。 |
| Inspector hub 双 section 重复已修（未提交）：`HubReferenceBlock.tsx` 已删除（-183 行），只剩单一 `Hubs` section。 | git working tree：`InspectorSidePanel.tsx:130`（唯一 Hub section）；`HubReferenceBlock.tsx` deleted | 同上，Phase 0 构建验证即可，无新工作。 |
| Connected 链接的 `✓ 67%` = lucide `<Check>` 图标 + 百分比，仅 `hasQuery && score > 0.3` 时显示。 | `src/ui/view/quick-search/components/inspector/ConnectedSection.tsx:66-67`（计算）、`:91-94`（渲染） | 勾号（确认语义）与百分比（不确定语义）打架。 |
| `SEM` / `CO-CITE` / `UNLINKED` 徽章来自硬编码 lookup map，无 tooltip 解释。 | `src/ui/view/quick-search/components/inspector/DiscoveredSection.tsx:9-13`（`TYPE_BADGE`）、`:78-83`（渲染） | 开发者术语直接上屏。 |
| 方向箭头 `→`/`←` 按 `link.direction === 'out'` 三元渲染，同一目标的双向链接显示为两条。 | `ConnectedSection.tsx:2`（import）、`:80-82`（渲染） | 双向对可合并为一条 `↔`。 |
| Highlight engine 只产出 `HighlightSpan[]`（`exact`/`stem`/`fuzzy`），`<mark>` 包裹在 UI 层。 | `src/service/search/query/highlight-engine.ts:11`（类型）、`:207`（`highlightSnippet`）；`src/ui/view/quick-search/components/snippet/renderSnippetHighlights.tsx:11-39` | 高亮上限最自然的落点是渲染前截断 spans，engine 不用动。 |
| Tree 视图文件夹计数徽章在行内 `pktw-ml-2` 位置，但文件行**无任何相关度指示**（只有命中次数 `HitBadge`，count ≤ 1 时还隐藏）。 | `src/ui/view/quick-search/components/result-tree/ResultTreeView.tsx:326-333`（folder 徽章）、`:455-465`（`HitBadge`） | 用户在 Tree 里无法判断先点哪个文件。 |
| Graph 布局模式标签在 `PRESET_LABELS` 数组：Constellation / Flow ↓ / Flow → / Folder tree / Orbit。 | `src/ui/view/quick-search/components/ResultPaneHeader.tsx:27-32` | 改名只动这一处。 |
| `SemanticToggle` 无可见文字标签，只有 `title` 属性。 | `ResultPaneHeader.tsx:86-100+` | 用户不知道开关后果（算什么、要不要钱、要多久）。 |
| Compact/Detailed 密度切换是 Tree-only：`density` prop 只穿入 `ResultTreeView`，List/Graph 无引用。 | `ResultPaneHeader.tsx:213`（组件注释自述 "for Tree view"）、`ResultTreeView.tsx:261/347/370` | List 每条结果占三行，更需要 compact。 |
| Quick Search 全部 UI 字符串是 TSX 硬编码字面量；`ConfigTemplateId` 无 `QuickSearch` 条目（已外置的只有 Onboarding/Settings/Chat/Dashboard/RichOutputTypes）。 | `SearchModal.tsx:519`（Suggest）、`:871`（AI Analysis）、`:892`（Vault Intelligence）；`src/core/template/TemplateRegistry.ts:127-145` | 本批次改名先改字面量；label 全量外置另立项（见 Open Questions）。 |
| `templates/config/settings.json:72/115` 的描述文案里以文字提到 "the ✦ Suggest button" 和 "AI Analysis"。 | 同文件 | W8 改名后这两处 prose 引用要同步，否则 Settings 描述指向不存在的按钮名。 |

## Work Items

### W1 — 相关度分数：绝对百分比 → 相对归一

**现状**：`scorePercent = Math.round(rawScore * 100)`，加法 boost 合成分穿着百分比外衣，出现 148%。

**改法**：按**当前结果集内相对最大值**归一——`displayScore = Math.round(rawScore / maxScoreInResultSet * 100)`，top 结果恒为 100%，其余按比例。保留 `%` 和 pill 样式不变（视觉零改动，只改数值语义）。归一逻辑做成纯函数放在结果处理层（`queryService` 输出后、UI 前），不进 `VaultSearchResult.tsx` 组件内——Inspector 等其他消费方也要用同一份归一值。

**边界**：结果集为空或 maxScore ≤ 0 时不显示 pill；单结果时显示 100%。

### W2 — Graph isolated matches grid 布局（Phase 0 验证项）

`layoutIsolatedGrid()` 已在工作区实现。`npm run build` + 重载插件后用 bad-case 查询复验：isolated 节点应成 4–8 列网格、互不重叠、位于 "Isolated matches" 区域标签下方。仍重叠才转为 bug 修复（优先怀疑 `regionLabel` 定位与 bounding box 计算）。

### W3 — Inspector 徽章体系重构

三个子项，全部在 `components/inspector/` 内：

1. **`✓ 67%` 二选一**：去掉 `<Check>` 图标，只留百分比（用 W1 的归一值语义对齐）。勾号的"已确认"语义与置信度数值冲突，且绿色勾 + 绿色数字信息重复。
2. **`UNLINKED` 徽章 → `+ Link` 动作按钮**：这是本批次唯一"消除噪音之外还增加产品价值"的项。行为：点击后在被检视笔记的**文末**追加一个 `## Related` 小节（不存在则创建）并写入 `[[目标笔记]]`，toast 确认；写入成功后该条从 Discovered 视觉上标记为已链接（下次 inspect 时自然进入 Connected）。写文件走既有 Vault 修改路径，不新开 service 单例（遵守 runtime ownership 规则）。插入位置如需调整见 Open Questions #3。
3. **`SEM` / `CO-CITE` 加 tooltip**；同一目标的 `→` + `←` 双条合并为一条 `↔`（direction 归并逻辑做成纯函数，方便测试）。

### W4 — 摘要高亮密度上限

标题高亮不动（Session 决策）。摘要侧：在 `renderSnippetHighlights.tsx` 渲染前截断 spans——每条摘要最多着色前 N 处命中，N 作为常量进 `src/core/constant.ts`（建议 `SEARCH_SNIPPET_HIGHLIGHT_CAP = 4`），超出的命中保留文本但不再包 `<mark>`。截断按 span 在文本中的出现顺序，不按类型加权（`exact`/`stem`/`fuzzy` 一视同仁，避免"前 4 处全是 fuzzy"的反直觉）——如实测观感差再调整为 exact 优先。

### W5 — Tree 视图信息密度

1. **计数徽章位置**：文件夹计数从行右缘移到紧跟文件夹名之后（消除全宽 modal 下的长眼动距离）。
2. **文件行相关度弱指示**：文件行增加三档强度点（相对当前结果集 maxScore 的高/中/低），视觉用小圆点色阶或行首细边框，克制处理——Tree 的主信息是结构，强度只是辅助。档位阈值进 `constant.ts`。

### W6 — Graph 模式命名 + Semantic 开关说明

1. **模式重命名**（只动 `PRESET_LABELS`，布局逻辑零改动）。候选方案待 owner 终选（Open Questions #2）：

| 现名 | 候选 A（去开发者味） | 候选 B（保守微调） |
| --- | --- | --- |
| Constellation | Clusters | Constellation（不变） |
| Flow ↓ | Hierarchy | Flow ↓（不变） |
| Flow → | Timeline flow | Flow →（不变） |
| Folder tree | Folders | Folder tree（不变） |
| Orbit | Radial | Orbit（不变） |

2. **Semantic 开关**：加可见文字标签 `Semantic`（现在只有滑块），并加 tooltip 说明三件事——叠加什么（语义相似边）、代价是什么（用已有 embedding 本地计算，不耗 AI credits——**此说法需实施时对照代码确认**，若实际会触发 LLM 调用则 tooltip 必须写明并标注 credits）、大致耗时。

### W7 — List 视图密度切换

把 Compact/Detailed 从 Tree-only 扩展到 List：`density` 状态提到两视图共享（存 `useVaultSearchStore`，Tree 已在用的字段直接复用或改名），`VaultSearchResult` 增加 compact 变体——单行：标题 + 分数 pill，无摘要无路径。Graph 视图不接入密度概念。

### W8 — AI 入口重命名（两处字面量）

1. `SearchModal.tsx:519` `Suggest` → `Refine`。
2. `SearchModal.tsx:871` `AI Analysis` → `AI Search`。
3. 同步 `templates/config/settings.json:72/115` 里对旧名的 prose 引用。
4. `Vault Intelligence`、`Generate AI Graph` 不动。

## Implementation Plan

### Phase 0 — 验证工作区既有修复（零代码预期）
- `npm run build` + 重载插件。
- 验证 Inspector 单 Hub section（`HubReferenceBlock` 已删）。
- 验证 W2 isolated grid；仍重叠则按 bad-case 修 `layoutIsolatedGrid`。

### Phase 1 — 纯文案与数值语义（低风险，先发）
- W1 归一纯函数 + `VaultSearchResult.tsx` / Inspector 接入。
- W8 两处改名 + settings.json prose 同步。
- W6.2 Semantic 标签 + tooltip（含 credits 事实核对）。
- W6.1 模式重命名（等 Open Questions #2 终选后一并进）。

### Phase 2 — 组件层
- W3.1 去 Check 图标；W3.3 tooltip + `↔` 归并纯函数。
- W3.2 `+ Link` 动作（含 Vault 写入路径 + toast + Discovered 状态翻转）。
- W5 Tree 徽章移位 + 三档强度点。
- W7 List compact 变体 + density 状态共享。

### Phase 3 — 高亮渲染
- W4 spans 截断 + `SEARCH_SNIPPET_HIGHLIGHT_CAP` 常量。

## Acceptance Criteria

用户可观察判定：

- 搜索任意词，List 视图 top 结果分数恒为 `100%`，任何结果不出现 >100% 的数值；Tree/Inspector 若展示分数与 List 同源同值。
- Graph 视图下 isolated 节点呈整齐网格排列，任意两节点文字不重叠，网格位于 "Isolated matches" 标签下方、主图 bounding box 之外。
- Inspector Connected 列表：无绿色勾号；同一目标笔记的双向链接只出现一条，方向图标为 `↔`。
- Inspector Discovered 列表：`SEM` / `CO-CITE` 徽章 hover 出现中文/英文解释 tooltip；原 `UNLINKED` 位置是 `+ Link` 按钮，点击后目标笔记文末出现 `## Related` 小节含 `[[目标]]`，并有 toast 反馈。
- List 摘要中 `<mark>` 数量 ≤ cap 值（默认 4），标题高亮不受影响；`0611-全面整理PeakAssistant` 这类"标题命中、正文无命中"的结果标题仍有橙色。
- Tree 视图：文件夹计数紧跟名称；文件行有三档强度指示，且与 List 的分数排序方向一致（List 前排的文件在 Tree 里是高档）。
- Graph 工具条：Semantic 开关有可见 "Semantic" 文字与 tooltip；5 个模式名与终选一致。
- List 视图右上出现 Compact/Detailed 切换；Compact 下每结果单行（标题 + 分数）；切换状态在 List/Tree 间共享且本 session 内保持。
- 搜索框旁按钮显示 `Refine`；第二个标签页显示 `AI Search`；Settings 面板描述文案无 "Suggest" / "AI Analysis" 残留。

Test 文件清单：

- `test/quick-search-score-normalize.test.ts`（新增）— 归一纯函数：输入 `[1.48, 1.44, 0.5]` → `[100, 97, 34]`；单元素 → `[100]`；空集/全零 → 不产出展示值；保序性（归一前后排序不变）。
- `test/inspector-link-merge.test.ts`（新增）— `↔` 归并纯函数：同目标 out+in → 单条 both；仅 out / 仅 in 保持原方向；不同目标不误并。
- `test/highlight-engine.test.ts`（扩展）— spans 截断：8 处命中 cap=4 → 前 4 处按出现顺序保留；cap 大于命中数 → 全保留；截断只作用于摘要 spans 不影响 engine 输出本身。
- `test/result-tree-build.test.ts`（扩展既有 buildTree 测试）— 三档强度分档：maxScore 归一后 ≥0.66 高 / ≥0.33 中 / 其余低（阈值以 constant.ts 终值为准）；全同分时全部高档。

通过 gate：`npm run test` 全绿 + `npm run build` 成功 + Phase 0 两项真机验证截图确认。

## Bad-case Repro

评估源自真实 vault 查询 `peak assistant`（50 results / 325ms），四张截图存于 session 记录。复现要点：

| Bad case | 复现 | 期望（修后） |
| --- | --- | --- |
| 分数 148% / 144% / 130% | 查询 `peak assistant`，看 List 前三条 pill | top = 100%，递减，无超百 |
| Isolated 节点文字堆叠成一团 | 同查询切 Graph 视图，看底部 ISOLATED MATCHES 区 | 整齐网格 |
| Inspector 双 Hub section | 同查询 List 选中第一条开 Inspector，滚到底 | 只有一个 Hubs section |
| 摘要高亮连片 | 看 `AI-peak-assistant-obsidian` 结果的摘要（wikilink 密集段） | ≤4 处 `<mark>` |

## Risks / Tradeoffs

| Risk | Mitigation |
| --- | --- |
| W1 相对归一后，同一文档在不同查询下分数不可比（用户可能困惑"昨天 100 今天 80"）。 | 本来加法 boost 分数跨查询就不可比；相对归一只是把这个事实诚实化。pill tooltip 可注明 "relative to top match"。 |
| W3.2 `+ Link` 写入用户笔记是首个"从搜索 UI 直接改 Vault 内容"的路径，写错文件/写坏格式的代价高。 | 只做**文末追加**（不插入正文中间）；写前读文件确认 `## Related` 是否已存在；失败静默不改文件并 toast 报错。 |
| W4 截断后用户可能想看"还有多少处命中没高亮"。 | `HitBadge` 已承载命中次数信息；不在本批次加"+N more"角标，观察反馈再说。 |
| W7 density 状态共享后，Tree 用户的既有偏好可能被 List 切换意外改动。 | 共享正是产品意图（一个"信息密度"心智）；如反馈冲突再拆分。 |
| W6.2 Semantic tooltip 若写"不耗 credits"而实际耗，比没有说明更糟。 | 实施时以代码为准核对 semantic edge 来源（预期是已索引 embedding 的本地相似度，无 LLM 调用），核对结论写进 PR description。 |

## Non-Goals

- 不改 `rankingBoosts.ts` 加权公式、RRF/PPR、rerank——W1 只改展示层归一。
- 不改 `highlight-engine.ts` 的窗口选取算法（`pickAnchorWindows` 不动）。
- 不砍 Graph 布局模式，不动 cytoscape 布局参数（W2 除非验证失败）。
- 不做 Quick Search 字符串全量外置到 `ConfigTemplateId`（本批次接受硬编码字面量改名；全量外置见 Open Questions #4）。
- 不动 wikilink 原样展示、Hub 机器 ID、标题高亮（Session 明确否决项）。

## Open Questions

1. **Snippet 泄漏原始 JSON**（`auto-review/1203-...-249Z.md` 的摘要是 `"snippet": ... "score": ...` 机器内容）：要不要在摘要提取时对代码块/JSON 降权跳过？owner 未表态，**不在本批次范围**，表态后视情况并入或另立 spec。
2. **W6.1 模式命名终选**：候选 A（Clusters / Hierarchy / Timeline flow / Folders / Radial）vs 候选 B（保持现名）vs 混合。owner 只确认了"可以改"，未选定目标名。
3. **W3.2 `+ Link` 插入位置**：默认方案是文末 `## Related` 小节；备选是 frontmatter `related:` 列表。默认方案更可见、不依赖 frontmatter schema，如无异议按默认实施。
4. **Quick Search label 外置**：`ConfigTemplateId` 缺 `QuickSearch` 条目，本 surface 未跟上 configurability 惯例。是否值得单独立项补齐（涉及全部 quick-search 字符串盘点），还是接受该 surface 的例外。

## Code Reading Order

实施前按序读：

1. `src/ui/view/quick-search/components/VaultSearchResult.tsx:130-200` — 分数计算与 List 行渲染（W1/W7）。
2. `src/service/search/query/rankingBoosts.ts:19-31` 头注释 — 理解 finalScore 为什么可 >1（W1 背景）。
3. `src/ui/view/quick-search/components/inspector/ConnectedSection.tsx` + `DiscoveredSection.tsx` 全文（各 <120 行）— W3 全部落点。
4. `src/ui/view/quick-search/components/snippet/renderSnippetHighlights.tsx` — W4 截断落点。
5. `src/ui/view/quick-search/components/ResultPaneHeader.tsx:27-32, 86-110, 213-250` — W6/W7 的控件层。
6. `src/ui/view/quick-search/components/result-tree/ResultTreeView.tsx:261-465` — W5 落点 + density 消费方式（W7 参照）。
7. `src/ui/view/quick-search/SearchModal.tsx:457-530, 860-895` — W8 三个字面量位置。
