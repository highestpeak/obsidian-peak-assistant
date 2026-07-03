# Graph Advanced Visualization — 2026-07-03

## 一句话结论

**"Nebula 星云图 / Healing Ray 修复射线 / Source-Sink 流向图" 三个视角都可以复用现有 `@xyflow/react` + `service/lint/signals` + `IndexGraphPort`。推荐先做 Nebula（用户视觉冲击最强）+ Source-Sink（对写作场景最实用）；Healing Ray 挂在 Vault Intelligence lint 结果上作为 "actionable overlay"，不做独立视图。**

参考 `docs/research/doc-network-visualization/README.md`（前调研）。

## 三个视角分析

### 1. Nebula 星云图

**语义**：整个 vault 按 PageRank / degree / community 密度呈现为星云；hub 是亮星，island 是暗星，semantic edges 是雾。用户可以从整体感知 vault 的形状。

**技术**：`@xyflow/react` + custom layout（force-directed with clustering weight）。Community 决定颜色。已有 `MobiusEdgeRepo` + Louvain data。

**成本**：3-4 天。

### 2. Healing Ray 修复射线

**语义**：Vault Intelligence 发出的 finding（S-ORPHAN / S-SOFT-ORPHAN / C-DUPLICATE / T-STALE-HUB 等）在图上高亮，一条 "ray" 从 finding 起点射到建议连接的目标。

**技术**：不做独立视图，做 overlay。VaultXRayView 已有基础；扩展 marker + ray。

**成本**：1-2 天。低复杂度。

### 3. Source-Sink 流向图

**语义**：把 vault 分成"信息源"（多出边，如 daily note / meeting note）和"信息汇"（多入边，如 hub / synthesis）。视觉上用左右分栏 + Sankey-like 边显示流向。

**技术**：`@visx/sankey` 或自制 React Flow 布局。数据来自 `listDocDegrees`（B7 landed）。

**成本**：3-4 天。

## 竞品参考

- **Obsidian core Graph**：粗糙，无 community 无语义。
- **Heptabase**：白板 + 卡片但无 vault-wide 视角。
- **InfraNodus**：图 + centrality + 文本分析，最接近 Nebula 语义。参考它的 hub 显示方式。
- **Tana Graph**：只显示 tag hierarchy。

## 决策

- **必要性**：**高**（Nebula）· **中**（Source-Sink）· **低独立**（Healing Ray → overlay）。
- **优先级**：Wave 6。Nebula 先，Source-Sink 跟进，Healing Ray 挂在 Vault Intelligence 上不做独立视图。
- **依赖**：`IndexGraphPort`（已 landed）+ Vault Intelligence findings（已 landed）。

## Next steps

1. Nebula PoC (React Flow + force layout + community coloring)
2. Source-Sink PoC (Sankey with degree buckets)
3. Vault Intelligence overlay hook
