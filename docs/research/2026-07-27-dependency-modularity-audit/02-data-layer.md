# 02 · 数据/存储/事件层依赖图审计原稿

> 2026-07-27 rg + 源码通读（ddl.ts / SqliteStoreManager / eventBus / trace / run-envelope / settingsTypes / folderPaths）。

## 1. SQLite 表普查

- **物理事实**：`migrateSqliteSchema()`（`ddl.ts:636`）对两个库无差别执行——vault.sqlite 与 chat.sqlite 物理上拥有**完全相同的 39 张表**；"两个库"的边界纯由应用层"谁把 handle 传给哪个 repo"决定（`SqliteStoreManager.init()`, 206-256）。
- 表→owner→落点详表见原稿要点：chat_* 族在 chat.sqlite（chat 域）；索引/图表双 tenant；`usage_log/usage_daily/usage_outcome`（usage 域）、`ai_analysis_record`（search 域）、`tag_suggestion`（copilot 域）、`query_pattern`（context 域）**全部物理落在 chat.sqlite**——物理边界与域边界不对齐，按域备份/迁移做不到。
- `harness_reflection`：已建表**零写入方**（`rg "new ReflectionStore("` 零命中）——M3 只交付存储层，死表。
- `user_profile_processed_hash`：挂 vault.sqlite，唯一消费方却是 chat 域（`BuildUserProfileRunner.ts`）——owner/consumer 倒置。

## 1.3 图存储层全局暴露（最大结构问题）

`getMobiusNodeRepo()/getMobiusEdgeRepo()` 等 getter 被 **50 个文件**直接调用：search 自域 20、tools/search-graph-inspector 13、**其余 8+ 域 17 个文件**（agents/intuitionPrep、context/PatternDiscoveryTrigger、ambient/SerendipitySearcher + 2 个 app adapter、copilot 2 个 adapter、lint 2 处、**chat/VaultIntuitionSlot 直接读 search 原始图表**、hub、commands/devtools）。
**四个 Index*Port（Reader/Writer/Graph/Maintenance）只被 indexService.ts 自己 implements，外部零消费**（`rg ": IndexReaderPort"` 零命中）——port 存在但形同虚设。

## 1.5 mobius_operation 确认双写（代码级可复现）

- 写入方 A：context 域 `SessionContextService.recordActivity()`（180-194，订阅 5 类事件）。
- 写入方 B：search 域 `AIAnalysisHistoryService.insertOrIgnore()` :58 直写。
- **同一流程双触发**：`analysisDocPersistence.ts:172` 调 insertOrIgnore（B）→ :179 dispatch `AIAnalysisCompleteEvent`（触发 A）→ **一次分析完成插两行**。

## 1.6 结构分析/Hub 表跨域穿透

`StructuralAnalysisRepo`（owner search）被 hub/agents、copilot、lint、vault-sdk 4 域直读；`HubConstituentRepo`（owner hub）反被 search 直读（`inspectorService.ts:138,164`）——互相穿透。

## 1.7 模范案例

chat_* 族全部读写只经 `ChatStore.ts` 单入口；media 域经注入的 `ChatArtifactReceiptSink` 接口间接落库——**单一写入网关模板**，可作整改参照。

## 2. SearchClient vs IndexService

- **SearchClient：干净的 DI 范例**——chat/composer/copilot/agents 全部构造注入或 AppContext getter，无人直接 new，main.ts:985 一次构造分发。
- **IndexService：封装被系统性绕过**——非 search 域零 import，它们直接落到裸 sqliteStoreManager repo 调用。

## 3. 事件系统：三套并行

1. **EventBus**（core/eventBus.ts:187，全局单例，11 种事件）：`SessionContextService`（context 域）订阅 chat/search/usage/copilot 四域事件做"最近活动"聚合（设计意图）；`USAGE_RECORDED` 有 5 个发布方、1 个订阅方（正规）。
2. **TraceBus**（harness 私有，每 run 各 new，15 种事件）：收敛良好，非跨域总线。
3. **RunEnvelope**（pull-mode）：**8 个域各自 new InMemoryRunRecorder**（copilot/lint/search×3/chat/agents×2/capabilities），UI 侧对应 5 份并列 store（chat/copilot/analysis/harness/feature RunEnvelopeStore）互不引用——并行而非统一。

三套职责边界清楚但零桥接，可观测性数据分散三处。

## 4. Settings

- 巨型 `MyPluginSettings` 对象整体注入 AppContext，任何拿到 AppContext 的代码可读其他域设置。
- service 层直读 settings 的历史耦合已清理（T11J，活跃调用 0）。
- **隐性契约**：`ai.rootFolder` 裸 string 全域透传；`'ChatFolder'` 兜底字面量在 `composeMediaGenerationService.ts:241`、`AdvancedTab.tsx:257` 至少复制 2 次（没引用 `DEFAULT_AI_ROOT_FOLDER`）。

## 5. 文件系统落点

- Vault 内：常量集中在 folderPaths.ts，各落点单一写入方，基本干净。AI 分析结果存在 JSON（DataStore/ai-analysis）+ Markdown（AI-Analysis 可选自动保存）两份表示——同域一致性风险。
- 插件目录：composer-comments/、telemetry/ 均 composer 独占，无跨域问题。

## 6. 判决

**数据层模块化：中低。** 会做对（chat_* 族、ambient/lint port 化、SearchClient DI），但图存储层放弃封装（50 文件直摸 + 4 个 port 虚设）+ mobius_operation 确认双写 + 物理库边界与域不对齐。

**风险清单**（高→低）：mobius_operation 双写（高，已确认）；mobius_node/edge 8 域直访（中高）；structural_* 4 域直读（中）；tag_suggestion UI 跳过 adapter 直连（中）；search_click 3 处各自 new repo（低）；query_pattern UI 绕过单例（低中）；harness_reflection 死表（债）。
