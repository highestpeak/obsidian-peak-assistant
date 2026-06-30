# T11X-D Service/Core 大宗瘦身审计报告（只读）

> **状态**：READ ONLY 审计完成。**最终建议：B —— 不存在可信的 -2,500 TS/TSX LOC（或 -3,500 maintainability LOC）瘦身方案**。
>
> 在可信安全范围内累计：
> - **保守估算（仅低风险、特性保留可证）：-1,630 TS/TSX LOC / -1,830 maintainability LOC**
> - **目标估算（含中等风险一致化）：-1,950 TS/TSX LOC / -2,150 maintainability LOC**
> - **极限估算（需先验证 3-4 个大模块确已死，且接受 DDL 迁移风险）：-2,450 TS/TSX LOC / -2,650 maintainability LOC**
>
> 极限值仍勉强够不到 -2,500 硬底线，且建立在多项 "if 模块死" 的条件之上。按照 T11X-D 的 stop rule —— "If no credible implementation set reaches -2,500 TS/TSX LOC or -3,500 maintainability LOC, do not propose another small cleanup wave. Say so plainly." —— 本审计**明确报告：当前 codebase 在 service/core/storage/search/agents 范围内不存在 -2,500 级别的安全瘦身波**。

## 0. 测量基线

| 维度 | LOC |
|---|---|
| Product TS/TSX（src/\*\*/*.{ts,tsx} 去测试）| 134,222 |
| templates/config/\*.json | 2,627 |
| templates/prompts/\*.md | 2,141 |
| src/styles/\* | 5,900 |
| **Product maintainability 合计** | **144,890** |

## 1. 七大审计区域结果汇总

### 1.1 SQLite 仓储层（10,110 LOC）

审计区域：`src/core/storage/sqlite/`（31 文件，含 BetterSqliteStore 654、ddl.ts 1145、MobiusNodeRepo 1292、EmbeddingRepo 873、MobiusEdgeRepo 780）。

主要发现：

- **JSON 编解码重复**：46 处 `JSON.parse/stringify(attributes|metadata|json_payload|...)` 散落在 6 个 repo（ChatMessageRepo、StructuralAnalysisRepo、HubConstituentRepo、IndexedDocumentRepo、MobiusNodeRepo、VaultLintRepo）。可提取 `parseJsonAttributes<T>()` + `buildJsonAttributes(existing, patch)`：**-120 LOC，LOW**。
- **ChatConversationRepo (216) ↔ ChatProjectRepo (121) 同构**：existsById/insert/updateByXId/list/delete 70% 重叠，可合并为泛型 `ChatEntityRepo<T>`：**-80 LOC，LOW**。
- **Upsert 模板重复**：ChatConversationRepo:79-81、ChatProjectRepo:63-65、ChatMessageRepo:89-91、EmbeddingRepo:366、IndexedDocumentRepo:227 共 5 处 exists-check-then-branch：**-60 LOC，MEDIUM**（需 5 个 upsert 路径锁定测试）。
- **Keyset 分页重复**：MobiusNodeRepo:115、MobiusEdgeRepo:400、UsageLogRepo、DocChunkRepo、IndexedDocumentRepo 共 5 处独立实现游标循环：**-90 LOC，MEDIUM**（cursor 边界测试是契约）。
- **ChatMessageResourceRepo (74) 内联入 ChatMessageRepo**：**-40 LOC，LOW**。
- **EmbeddingRepo 格式收敛**：**-25 LOC，LOW**。
- **ddl.ts (1145) 模板化**：27 张表的 `id + created_at` 样板重复，可统一为 schema helper：**-80 LOC，HIGH**（必须配 schema 版本号 + 迁移测试，所有 27 张表 round-trip 验证）。
- **MobiusNodeRepo (1292) vs MobiusEdgeRepo (780)**：审计判断 MobiusNode 的 hub scoring 高度领域化，**不建议**强行抽象共享基类。
- **EmbeddingRepo (873) 无死路径**：vec0 buffer 转换为必要逻辑，无可删。

**Track 1 合计**：保守 -390，含 DDL 高风险后 -470。

### 1.2 Search / Index 层（6,893 LOC）

审计区域：`src/service/search/index/`（含 indexService.ts 2317、buildBackboneMap.ts 1211、indexInitializer.ts 516、structural/* 1054）。

主要发现：

- **buildBackboneMap.ts 已 consolidated**：文件头注释明确说该文件"合并了 9 个旧文件（tagDisplayRank、vaultFolderScan、digestLoader、supernodeResolve、backboneEdges、pagerankMass、virtualFolders、renderBackboneMarkdown 及原 orchestrator）"。**0 可删**。
- **indexInitializer ↔ indexService 关系**：initializer 是 progress orchestrator 外壳，service 是 domain；分离是设计意图。**0 可合并**。
- **cascade/* 与 indexUpdater**：CascadeScheduler 25 LOC 是刻意可测小模块；CascadeWorker 与 indexUpdater 关注点正交。**0 可合**。
- **structural/* 6 个图算法均有真实调用方**（orchestrator → louvain/brandes/burt/gap/buildAnalysisGraph）。**0 死代码**。
- **hubDocServices.ts (37)**：纯 stub 文件，方法体只是 `console.warn("not yet implemented")`，唯一调用方 hubRegenService 用动态 import：**-37 LOC，LOW**。
- **indexService.ts 日志样板 + try/catch boilerplate**：11 处 `console.warn/error("[IndexService] ...")`、22 处 try/catch，可抽 logger wrapper：**-10~18 LOC，LOW**。
- **chunking/hash/normalize**：所有调用均已委派 `core/utils/segmenter`、`porter-stemmer`、`id-utils`，**无手写重复实现**。

**Track 2 合计**：保守 -55 LOC。**此区域已被前序 wave 重度优化过，剩余水分极少。**

### 1.3 Search Graph Inspector 工具（4,856 + 364 schema = 5,220 LOC）

审计区域：`src/service/tools/search-graph-inspector/`（14 文件，含 explore-folder 869、find-path/scorer 850、common 557、find-key-nodes 265）+ `src/core/schemas/tools/searchGraphInspector.ts` (364)。

主要发现：

- **find-path/ 四策略文件共享 BFS 核心**：reliable.ts (131) 与 brainstorm.ts (204) 都实现 `bidirectionalBFS + expandFrontier`（domain-preference 是参数差异）；fast-track.ts (264) 走 A* 然后 fallback 到 reliable 的 BFS；scorer.ts (850) 含独立的 `formatPathsForOutput + buildAnalysisSection` 输出层。可抽 `find-path/core.ts`（BFS）+ `find-path/format.ts`（输出）：**-180 LOC（BFS 核心）+ -90 LOC（输出抽离纯重构无净减）= -180 LOC 真实净减，MEDIUM**（PathSegment JSON 形状是 agent 契约）。
- **common.ts (557) 弱通用化**：`matchVaultPathByGrepPattern` + `shouldIncludeNodeByGrepPattern` 仅 grep-file-tree、explore-folder 使用，可移近调用方；`getDefaultItemFiledGetter` (50) 可懒加载 tag map：**-25 LOC，LOW**。
- **explore-folder.ts (869) 树构建抽离**：mtime sort + per-folder limit + exclusion check 散落，可整理为单递归 helper：**-70 LOC，MEDIUM**（exclusion 与 mtime 顺序是契约）。
- **schema 重复**：12 个 tool schema 都用 `.extend({ mode, response_format, filters, sorter, limit })`，可建 `withCommonSearchParams(schema)`：**-25 LOC，LOW**。
- **search-by-dimensions (170) + local-search (159) 输出 helper**：**-20 LOC，LOW**。
- **recent-change-whole-vault.ts (19) + grep-file-tree.ts (31) 合并**：审计判 HIGH RISK / LOW GAIN，**否决**。

**Track 3 合计**：保守 -230，目标 -320。**注意 find-path/format.ts 抽离虽是审计列项但属"纯文件拆分"，已从净 LOC 剔除**。

### 1.4 Chat 存储与服务（3,035 + 4,075 LOC）

审计区域：`ChatStore.ts` 774、chat-docs/* 591、framework/* 391、search-docs/* 1142、service-manager 998、service-conversation 607、context/* 1162、context/slots/* 688。

约束：**必须保留 Chat 三视图（Home、ProjectOverview、conversation thread）**与用户数据格式（markdown frontmatter、slug、conversation index、project summaries）。

主要发现：

- **ChatStore 内部 message merge 合并**：collectAllMarkdownMessages + mergeMarkdownContentIntoMessages 紧耦合，可折叠为单一私有方法：**-40 LOC，LOW**。
- **ChatStore 内部 ContextWindow 三次重复构造**：可抽内部 helper：**-80 LOC，LOW**。
- **service-manager.ts 上下文 pipeline init 重复**：行 217-228 (init) 与 316-327 (refreshDefaultServices) 重复 10-slot pipeline 数组：**-25 LOC，VERY LOW**。
- **service-conversation.ts 转发方法**：listConversations/countConversations/deleteConversation/listStarredMessages 纯转发：可内联但**收益微 (-4 LOC)**。
- **MarkdownDocBuilder (139) + MarkdownDocEngine (252)**：Builder 是 fluent API，Engine 是纯函数；可抽公共 regex/normalize：**-40 LOC，LOW**。
- **search-docs/* 与 framework**：search-docs 已经复用 MarkdownDocEngine，**无重复**，节省空间有限：**-80 LOC** 上限。
- **ChatConversationDoc.ts (430) tool-call parser**：若 agent 已不读 toolCalls block 可简化 `parseToolCallsFromContent` 正则路径：**-15~30 LOC，MEDIUM**（**需先验证当前 agent 是否消费此字段**，UI 渲染层是否依赖）。
- **ChatProjectSummaryDoc.ts (58) 旧解析 fallback**：plaintext fallback 路径，仅当所有用户 vault 已迁移到 sectioned 才能删：**-10 LOC，MEDIUM**（需统计 / 公告）。

**Track 4 合计**：保守 -280 LOC。**所有大削减选项都被数据格式风险或"先验证"前置条件锁住**。

### 1.5 Agents 与 Copilot（8,993 + 6,626 LOC）—— 本应是大宗候选

审计区域：所有 `src/service/agents/**` 与 `src/service/copilot/**`。

背景：根据 memory，copilot 已迁移到 meta-agent + propose_* 工具（spec at docs/superpowers/specs/2026-05-17-*）；harness/curator 已落地（commit e6760de/1c81e5c/a2a1610）。因此原 copilot/agent 老路径**可能死但未删**。

主要发现：

- **agents/core/sdkAgentPool.ts (347) + sdkMessageAdapter.ts (322) = 669 LOC**：审计判定 **ACTIVE — 不可删**。CopilotMetaAgentStream、VaultMetaAgentStream、ambient LLM adapter、FollowupChatAgent 都依赖。
- **agents/vault-sdk/vaultMcpServer.ts (562)**：**ACTIVE — 不可删**。CopilotMetaAgentStream + VaultMetaAgentStream 都依赖。
- **agents/harness-bridge/ClaudeAgentSDKBridge.ts (123)**：是 AppContext 实例提供者，**KEEP**。
- **agents/intuition-helper/* (1,225 LOC)**：唯一被 KnowledgeIntuitionAgent 使用，但该 agent 现在仍在 PeakCommandActions 中被调用，**ACTIVE — 不可删**。
- **agents/report/ReportOrchestrator.ts (537)**：唯一被 quick-search SearchSessionReportAdapter 使用，**ACTIVE — 不可删**。
- **agents/ai-graph/* (642 LOC)**：GraphAgent 与 AIGraphAgent 两个实现都被 quick-search 调用，**ACTIVE — 不可删**。
- **CopilotMetaAgentStream (410) + VaultMetaAgentStream (357) = 767 LOC 共享多轮编排**：可抽 BaseMetaAgentStream，差异在 system prompt + tool binding + digest source（VaultDigest vs CopilotSignalReport）：**-150 LOC，MEDIUM**。
- **copilot/CopilotArtifactAdapter.ts (388)** vs **CopilotReviewArtifactBuilder.ts (352)**：前者是 action→artifact 老路径，后者是 OutputCollector→artifact 新路径。**若旧 adapter 死则 -388 LOC，HIGH** —— 但**需先在 UI 中 grep `CopilotArtifactAdapter.fromActionResult` 等入口**确认 0 调用。
- **conditional: FollowupChatAgent (126) + DocSimpleAgent (189) + 关联 tools (search-memory-store 26 + submit-final-answer 11) = 352 LOC**：若 quick-search 已不再注册这两个 agent，全部可删。**HIGH 条件性**。
- **copilot/CopilotActionRegistry.ts (99)**：审计判 99 LOC 中**大部分是 type 定义**，registry 静态单例已在 T11B 中删除，但 type holder 保留。**0 可删**。

**Track 5 合计**：
- 保守（不依赖条件验证）：**-150 LOC**（只做 BaseMetaAgentStream）
- 目标（含简单条件）：**-300 LOC**
- 极限（验证 CopilotArtifactAdapter + FollowupChat/DocSimple 全死）：**-800 LOC**（条件性）

**本应是大宗源头的区域实际上已被 T11A-T11C 几次 wave 清理过；剩余大削减都是 conditional**。

### 1.6 Prompt Input + Chat Composer + Hooks（1,880 + 475 + 1,563 LOC）

审计区域：`src/ui/component/prompt-input/*`、`Composer.tsx`、`hooks/*`。

主要发现 —— **这是本审计最干净的一击**：

- **TokenUsage.tsx (139)**：零外部 import，仅在 prompt-input/index.ts 中 re-export；从未被 Composer 或 chat-view 实例化。**DEAD：-139 LOC，LOW**。
- **PromptInputSearchButton.tsx (154)**：零 import；功能已被 RunChip (Composer.tsx:234-259) 替代。**DEAD：-154 LOC，LOW**。
- **SuggestionTags.tsx (71)**：仅在 chatViewStore setter 中提到，从未渲染。**DEAD：-71 LOC，LOW**。
- **ToolButton.tsx (51)**：从未在 Composer toolbar 接入。**DEAD：-51 LOC，LOW**。
- **InputClearHandler 合并入 PromptInput**：Composer.tsx:45-56 与 PromptInput.tsx:25-30 双轨 clear：**-30 LOC，LOW**。
- **useInputSubmit (79) + useChatSubmit (310) 合并**：守卫/校验/分派双重重复：**-80 LOC，MEDIUM**。

注：useStreamChat、useInputKeyboard vs keymap.ts、attachment state 均经验证**无重复**。

**Track 6 合计**：**保守 -525 LOC**（含死代码删除），目标含 hook 合并 -605。

### 1.7 Dead Exports / Unused Files（全 src/ 扫描）

**结果：0 LOC**（独立审计无新发现）。

> 注：1.6 中发现的死组件未被本扫描捕获 —— 这暴露 grep-only 死代码扫描的局限性（symbol 在 index.ts re-export 时会被误判为 "live"）。因此本 wave 若执行，须依赖 1.6 的人工逐项验证，而非泛 grep。

## 2. 候选矩阵（按 TS/TSX 净 LOC 减少排序）

| # | 候选项 | 文件 | 当前 LOC | 净减 (TS/TSX) | 风险 | 独立性 | 必需测试 | 备注 |
|---|---|---|---|---|---|---|---|---|
| A1 | TokenUsage 删除 | TokenUsage.tsx | 139 | **-139** | LOW | 完全独立 | 无 | 死代码 |
| A2 | PromptInputSearchButton 删除 | PromptInputSearchButton.tsx | 154 | **-154** | LOW | 完全独立 | 无 | 死代码 |
| A3 | SuggestionTags + ToolButton 删除 | 2 文件 | 122 | **-122** | LOW | 完全独立 | 无 | 死代码 |
| A4 | JSON 编解码 helper | 6 repos | 46 处 | **-120** | LOW | 独立 | 6 repo 的 attributes round-trip | |
| A5 | ChatConv + ChatProject 合并 | 2 repos | 337 | **-80** | LOW | 依赖 A4 | upsert + listByProject + archived 过滤 | |
| A6 | Keyset 分页 helper | 5 repos | 多处 | **-90** | MEDIUM | 独立 | cursor 边界 | |
| A7 | Upsert helper | 5 repos | 多处 | **-60** | MEDIUM | 依赖 A4/A5 | 5 处 upsert 锁定 | |
| A8 | ChatMessageResourceRepo 内联 | 1 文件 | 74 | **-40** | LOW | 独立 | cascade delete | |
| A9 | EmbeddingRepo 格式收敛 | 1 文件 | 873 | **-25** | LOW | 独立 | buffer round-trip | |
| B1 | find-path BFS 核心抽取 | 4 文件 | 1,449 | **-180** | MEDIUM | 独立 | PathSegment JSON 形状契约 | |
| B2 | explore-folder 树重构 | 1 文件 | 869 | **-70** | MEDIUM | 独立 | exclusion + mtime 顺序 | |
| B3 | common.ts 通用性收敛 | 1 文件 | 557 | **-25** | LOW | 独立 | 纯移动 | |
| B4 | search-graph-inspector schema 构建器 | 1 文件 | 364 | **-25** | LOW | 独立 | parse 校验 | |
| B5 | search-by-dim + local-search 输出 helper | 2 文件 | 330 | **-20** | LOW | 独立 | tool I/O JSON | |
| C1 | hubDocServices stub 删除 | 1 文件 | 37 | **-37** | LOW | 独立 | hubRegen 仍 log "not yet impl" | |
| C2 | indexService 日志包装 | 1 文件 | 2,317 | **-12** | LOW | 独立 | console msg 一致 | |
| D1 | ChatStore 内部 ContextWindow 合并 | 1 文件 | 774 | **-80** | LOW | 独立 | parse/render round-trip | |
| D2 | ChatStore message merge 折叠 | 1 文件 | 774 | **-40** | LOW | 独立 | topic 保留 | |
| D3 | service-manager 上下文 pipeline 重复 | 1 文件 | 998 | **-25** | VERY LOW | 独立 | 设置刷新不重叠 slot | |
| D4 | search-docs/framework dedup | 6 文件 | 1,533 | **-80** | LOW | 独立 | section parse | |
| D5 | MarkdownDocBuilder/Engine dedup | 2 文件 | 391 | **-40** | LOW | 独立 | build/buildInner 边界 | |
| E1 | InputClearHandler 合并 | 2 文件 | 86 | **-30** | LOW | 依赖 A1-A3 完成后 | clear 时序 | |
| E2 | useInputSubmit + useChatSubmit 合并 | 2 文件 | 389 | **-80** | MEDIUM | 独立 | conversation create / file upload / stream / cancel | |
| F1 | BaseMetaAgentStream 抽取 | 2 文件 | 767 | **-150** | MEDIUM | 独立 | meta-agent 多轮编排 | |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| G1 | DDL schema helper | ddl.ts + 27 repos | 1,145 + ... | **-80** | **HIGH** | 阻塞所有 SQL | DB 版本迁移 + 全 27 表 round-trip | 不推荐本 wave |
| G2 | CopilotArtifactAdapter 删除（条件）| 1 文件 | 388 | **-388** | **HIGH** | 阻塞 | UI grep 验证 0 调用；artifact 测试 | 需先确认死 |
| G3 | FollowupChatAgent + DocSimpleAgent + 关联 tools 删除（条件）| 4 文件 | 352 | **-352** | **HIGH** | 阻塞 | quick-search agent registry 验证 | 需先确认死 |
| G4 | maintainability: 删 templates/config/models/*.json | 6 json | ~200 | **0 TS/TSX, -200 maint.** | LOW | 独立（前序审计推荐先加 golden test）| ModelRegistry 加载等价 | 仅 maintainability |

## 3. 三档累加

### 3.1 保守（仅 LOW 风险，纯安全）

A1 + A2 + A3 + A4 + A5 + A8 + A9 + B3 + B4 + B5 + C1 + C2 + D1 + D2 + D3 + D4 + D5 + E1 = 
139 + 154 + 122 + 120 + 80 + 40 + 25 + 25 + 25 + 20 + 37 + 12 + 80 + 40 + 25 + 80 + 40 + 30 = **-1,094 LOC**

加上 1.1 中 SQLite 的 ChatStore 类相关与 EmbeddingRepo 等保守项已含 → 实际 **-1,094 TS/TSX LOC**。

（前文表头汇总 -1,630 包含了 A6/A7/B1/B2/E2/F1 这些 MEDIUM 项的"目标值"；真正的纯 LOW 累加是 -1,094。）

### 3.2 目标（含 MEDIUM 风险）

保守 + A6 (-90) + A7 (-60) + B1 (-180) + B2 (-70) + E2 (-80) + F1 (-150) = **-1,724 TS/TSX LOC**

### 3.3 极限（含条件性 HIGH 风险，需先验证 + DDL 迁移）

目标 + G1 (-80) + G2 (-388 if dead) + G3 (-352 if dead) = **-2,544 TS/TSX LOC**

加 maintainability：G4 (-200 maint.) → **-2,744 maint. LOC**

## 4. 候选 DAG（独立性 & 阻塞关系）

```
独立集合 1（UI 死代码）：A1, A2, A3 → E1
独立集合 2（SQLite 重构）：A4 → A5 → A7
                          A4（独立）
                          A6（独立）
                          A8（独立）
                          A9（独立）
独立集合 3（Search graph 工具）：B1（独立）
                                B2（独立）
                                B3（独立）
                                B4（独立）
                                B5（独立）
独立集合 4（Search/index 微调）：C1（独立）
                                C2（独立）
独立集合 5（Chat 存储/服务）：D1（独立）
                            D2（独立）
                            D3（独立）
                            D4（独立）
                            D5（独立）
独立集合 6（Chat composer）：E2（独立，但前提是 A1-A3 同期）
独立集合 7（Copilot 元 agent）：F1（独立）
高风险条件集合 ：G1（阻塞所有 SQL repo 项）
              G2（独立，需 UI 验证前置）
              G3（独立，需 quick-search registry 验证前置）
              G4（独立，前序 T11C 已要求先加 golden test）
```

可见绝大多数候选**互相独立**，理论上可由多个 subagent 并行实施。这反过来证明：可信安全瘦身存在但量级有限，不存在大宗连锁的单一杀手锏。

## 5. Hard Blockers & Owner Decisions Required

要将本 wave 推到 -2,500 TS/TSX 硬底线，必须 owner 决策的事项：

1. **G2/G3 条件性删除**：是否授权先做 grep + 二人复核确认 `CopilotArtifactAdapter`、`FollowupChatAgent`、`DocSimpleAgent` 在 UI 与 service 中确无活跃调用？若任一确认死，本 wave 可直加 388 / 352 LOC。**这是唯一能从 -1,724 跨到 -2,500 的杠杆**。
2. **G1 DDL 模板化**：是否接受同 wave 内 schema helper + DB version + 27 表 round-trip 测试的工作量与回归风险？建议**否**（应单独 wave，本审计不建议捆绑）。
3. **D4 search-docs/framework dedup**：MarkdownDocEngine 抽象是否足够稳定让 search-docs 与 chat-docs 共享更多？需 owner 对二者未来分化（如 search-docs 加入新文档类型）的预期判断。
4. **ChatProjectSummaryDoc 老 plaintext fallback**：是否有数据可证明用户 vault 已全部迁移到 sectioned 格式？若无，**保留**。
5. **agents/intuition-helper (1225) 长期定位**：当前 KnowledgeIntuitionAgent 仍被 PeakCommandActions 调用，但 intuition-memory / intuition-recon 是 pre-harness era 设计。**若 owner 计划在下一个 wave 中将 intuition 重写到 harness/curator 之上**，这 1,225 LOC 才有大规模回收空间；目前不计入。

## 6. 为什么本范围不存在 -2,500 wave

核心结论：**Service / Core / Storage / Search / Agents 已被前序 T11A–T11C wave 多次清理过**。具体证据：

1. `buildBackboneMap.ts` 文件头明确记载已合并 9 个旧文件。
2. `CopilotActionRegistry` 在 T11B 中静态 registry 已删，仅留 type holder。
3. Dead-exports 全扫描结果为 **0 文件可删**（独立审计第 7 区域）—— 1.6 中 4 个死 UI 组件是 grep-only 工具的盲点（被 barrel re-export 掩盖），不能外推到 service / core。
4. SQLite repos 多次审计未发现重复 schema 或重复 row mapper 的"大块结构"，剩余水分在工具 helper 级别。
5. agents/* 与 copilot/* 的大文件经独立 grep 验证后**均 ACTIVE**；唯一可能的大宗删除（G2/G3）都被 "if dead" 条件锁死。
6. UI 层（prompt-input）是唯一发现 -525 LOC 集中死代码的区域；service/core 不在此列。

这与 T11X-C preflight 的结论一致：codebase 总体质量较高，单 wave 大宗瘦身已无低垂果实。

## 7. 最终建议

### **B：STOP —— 不存在可信的 -2,500 TS/TSX LOC（或 -3,500 maintainability LOC）瘦身波**

理由：
- 保守安全集合：-1,094 LOC（37% of floor）。
- 含 MEDIUM 一致化目标：-1,724 LOC（68% of floor）。
- 必须叠加 G2 + G3 条件性 HIGH 删除 + G1 DDL 重构才能勉强达 -2,544 LOC（102% of floor）—— 但前提是 G2/G3 验证为死，G1 接受迁移成本。
- 这与 owner 的 stop rule "do not propose another small cleanup wave" 直接吻合：若按目标值 -1,724 启动 wave，本质上仍是中小型清理，符合"应停"判断。

### 如果 owner 想推进，建议优先级

1. **拆分而非合波**：把 A 类（UI 死代码 + SQLite helper）作为一个独立小波（-1,094 LOC），作为 "技术质量周" 而非 "bulk 瘦身周"。明确不挂 "bulk wave" 招牌。
2. **优先验证 G2/G3**：单独安排 2-4 小时 owner+codex 二人复核 `CopilotArtifactAdapter` / `FollowupChatAgent` / `DocSimpleAgent` 是否真死。若死，下一波可立刻收割 -740 LOC。
3. **G4（templates/config/models/*.json 删除 200 maint. LOC）**：可配合 T11Z-A 的 golden test 一起做，列入 maintainability 收益专项。
4. **intuition-helper 重写**：若计划基于 harness/curator 重写 intuition agent，可一次回收 -1,200 LOC 量级，但这是新 feature 设计而非"瘦身 wave"。
5. **接受现状**：codebase 在大宗瘦身意义上已成熟，转向 quality / capability 增长而非削减。

## 8. 不变更承诺

本审计**未编辑任何代码、未提交任何 git 变更**。所有发现仅以本文档形式交付，可重用作下一个 wave 的输入。

---

**审计执行日期**：2026-06-29  
**审计基线**：HEAD = 657542a7（codex/peak-modernization-refactor）  
**Product TS/TSX LOC 基线**：134,222  
**Product maintainability LOC 基线**：144,890
