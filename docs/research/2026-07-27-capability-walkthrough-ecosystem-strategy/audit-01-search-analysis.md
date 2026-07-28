# Audit 01 · General Search + AI Analysis / Vault Copilot 现状盘点

> 2026-07-27 代码库实地盘点原稿（Explore agent 产出）。所有结论带 file:line。

## 0. 术语对照

- **General Search** = Quick Search 弹窗 "Vault Search" tab（`src/ui/view/quick-search/SearchModal.tsx:861-866`，内容 `SearchModal.tsx:621-772`，渲染 `tab-VaultSearch.tsx`）。
- **AI Analysis / Vault Copilot** = 同弹窗 "AI Search" tab（`SearchModal.tsx:867-873`），两个子模式：`vaultFull`（Vault Analysis）与 `aiGraph`（AI Graph）（`SearchModal.tsx:83-86`）。
- 第三个 tab "Vault Intelligence"（`SearchModal.tsx:894-907`，复用 CopilotPickerContent）。

## 1. 入口

- 命令 `Quick Search`（`peak-quick-search`）：`src/app/commands/Register.ts:57-61` → `PeakCommandActions.ts:81-84` → `QuickSearchModal.tsx:20-140`。
- **无 ribbon 图标、无默认快捷键**——唯一 ribbon 是聊天视图（`ViewManager.ts:91`）。
- AI Search 模式切换 ⌥↑/⌥↓（`SearchModal.tsx:83-130`）；Web 开关 `@web@`（278-296）；"✦ Refine/Suggest" AI Query Rewrite（464-582）。
- 维护/索引命令收在 Settings → Advanced → Maintenance（`Register.ts:16-21` 注释、`composeSettingsActions.ts:72-77`、`MaintenanceTab.tsx:53`）。

## 2. 端到端流程

**Vault Search**：输入 → 400ms 防抖（`hooks/useVaultSearch.ts:120-148`）→ `SearchClient.search()`（`SearchClient.ts:36-68`，含可选 NL→语法编译 :50）→ `QueryService.textSearch()`（`query/queryService.ts:81-348`）：parseQuery → 5 retriever 并行（fts/fts-stem/vector/meta/fuzzy，`retriever/registry.ts:11-31`）→ rrfMerge → PPR 图重排（435-537）→ ranking boosts → 高亮 → store → List/Tree/Graph 三视图（经 `QuickSearchResultBrowserAdapter.ts` 桥接共享 result-browser）。点击记录 SearchClickRepo（`tab-VaultSearch.tsx:220-229`）。

**Vault Analysis**：Analyze → `useSearchSession.performAnalysis()`（174-327）→ `VaultSearchAgent.startSession()`（`VaultSearchAgent.ts:70-340`）：pre-search context（415-453）→ playbook prompt → `buildVaultHarnessTools()`（`vaultHarnessTools.ts:55-122`）→ TierController → `runAgentLoop()`（stopWhen=vault_submit_plan，调用点 268-286）→ TraceBus → searchSessionStore → V2 视图。批准计划后 `reportOrchestrator.generateReport()`（`useSearchSession.ts:333-368`）。里程碑处 `persistSessionToVault()`（`analysisDocPersistence.ts:59-187`）→ JSON + sqlite + 事件。

**AI Graph**：`useSearchSession.ts:257-277` → `AIGraphAgent.startSession()`（38-57）：search 30 条 → `buildLensGraphFromSources()` → aiGraphStore → MultiLensGraph 渲染（不复用 result-browser）。

## 3. 完成度

**完整无 stub**：检索管线全链、Vault Analysis harness、AI Graph agent、Pattern 建议系统（`PatternMergeService.ts` + `PatternDiscoveryTrigger.ts`）、AI Query Rewrite（LLM 优先规则回退，`AIQueryRewriteService.ts:246-268`）、历史回看链路。

**Stub / 不可达**：
- Hub 重生成 legacy stub：`hubDocServices.ts:1-37` 只 console.warn；生产被 `HubRegenService.init()` 注入的真实 fn 绕过（`hubRegenService.ts:46-61,142-151`），但 wiring 断裂时**静默假成功**。
- Gap detection 语义桥接是占位启发式（`gapDetection.ts:192` "placeholder — would use embeddings"）。
- **LLM Rerank：实现完整但生产不可达**——`enableLLMRerank` 默认 false（`queryService.ts:83,299-320`；`Reranker.rerank()` 完整 68-120），全部调用点（`useVaultSearch.ts:70,128`、`VaultSearchAgent.ts:149-155`、`local-search.ts:137-144`、`PeakCommandActions.ts:735-744`）**无一传 true**，Settings 也无 rerankModel 配置项。孤儿功能。

## 4. result-browser 复用情况

**Vault Search 深度复用**（adapter `QuickSearchResultBrowserAdapter.ts:1-96` + toolbar 绑定 `ResultPaneHeader.tsx:59-107` + 三视图组件）；**Composer sidecar 也复用**（`ComposerResultBrowserAdapter.ts`、`RelatedMaterialsModal.tsx`）。
**AI Analysis 完全没用**：`V2SourcesView.tsx:1-206` 自写 List/Graph 切换（List 是手写 div 分组 121-197，Graph 用 MultiLensGraph :8,53-67），无 Tree 视图，`tab-AISearch.tsx` grep result-browser 零命中。**双实现分叉，架构不一致点**。

## 5. AI Analysis 产出落地与回看

- 自动落地 JSON：`<rootFolder>/DataStore/ai-analysis/`（`AiAnalysisJsonStore.ts:1-203`，v1 schema；触发 `analysisDocPersistence.ts:59-187`）。动机：旧版 1139 个 markdown 报告把 Obsidian 索引撑到 2-2.9GB 白屏（`docs/recurring-pitfalls.md:386-402`）。
- sqlite 历史：`ai_analysis_record`（`AIAnalysisHistoryService.ts:28-98`；insertOrIgnore 同时写 mobius_operation 并触发 pattern discovery :56-67）。
- 显式导出 markdown：V2Footer "Save"（`tab-AISearch.tsx:204,213-214`）→ `save-ai-analyze-to-md.ts:59-118`；AI Graph 对应 132-166。
- 回看：空闲态 `RecentAnalysisList`（59-151，sqlite 无限滚动）→ `onSelectRecord`（`SearchModal.tsx:386-423`）→ `resolveAnalysisSnapshotFromVault()`（JSON 优先、legacy md 回退）→ 重放到 searchSessionStore。

## 6. 测试覆盖

覆盖扎实的：harness 迁移守卫（`vault-search-harness.test.ts` 321 行）、查询解析×4、retriever×4、融合/重排/PPR×5、高亮×3、result-browser 契约×3、持久化×2、pattern 系统×6、后台 runtime 边界×2（498+318 行）、索引端口×6、Hub×5、RunEnvelope 接线×3。
**零覆盖**：AIGraphAgent、V2SourcesView、analysisDocPersistence 的 folder 失败回退分支。
另有 `test/scenarios/vault-search/*.yaml` 是手动评测脚本输入（不进 npm test）。

## 7. 断点/风险清单

1. **启动不自动对账索引**：`main.ts:1058` 硬编码 `AUTO_STARTUP_INDEX_RECONCILE = false`（大 vault OOM 防御，理由 1048-1057）→ **外部改动（git sync/外部编辑器）不会被发现**，只能手动 Update index。搜索返回过期/缺失结果的直接根因之一。
2. 历史 bug 已修但可复发：AI Analysis 纯文本规划轮被误判 final answer 提前结束（fix `fb7b40c1`：`VaultSearchAgent.ts:135-143` proceed-nudge + :280-281 `treatBareTextAsFinal: false`）。prompt/模型漂移时理论可复现。
3. 实时增量索引依赖 vault 事件 + 5s 防抖（`indexUpdater.ts:56,66-89`），且监听要等 `onLayoutReady`（`main.ts:1026-1031`）——启动窗口内改动丢失。
4. 语义边/Hub 摘要经 CascadeWorker 空闲回填，前台分析时主动让步（`main.ts:1015`）→ 新文档写入后 PPR/Hub 信号有不确定滞后。
5. fast/full 两级索引：用户停在 fast 时 VectorRetriever 拿不到向量（`SearchUpgradePrompt.tsx:12` 有提示），语义召回打折。
6. LLM rerank 不可达（见 §3）。
7. result-browser 双实现分叉（见 §4）。
8. Hub regen stub 静默假成功风险（见 §3）。
