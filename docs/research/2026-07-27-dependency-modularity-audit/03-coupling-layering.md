# 03 · 域间耦合 + 分层纪律审计原稿

> 2026-07-27 rg 全量扫描 + 与仓库自带 `scripts/audit/boundary-baseline.mjs`、`test/t11r-zero-obsidian-boundary-regression.test.ts` 交叉验证（数字完全吻合）。

## 1. AppContext 快捷方式普查

正则 `AppContext\.getInstance\(\)|AppContext\.get[A-Z]\w*\(`：src/ 命中 209 处。

| 层 | 命中 | 活代码 |
|---|---:|---|
| app/ | 139 | 122 活 + 17 注释 |
| service/ | 46 | **0 活代码——46 处全是注释/文档**（历史迁移痕迹，如 `PromptService.ts:41`、`service-manager.ts:99,584`） |
| core/ | 12 | 0 活（全在 `core/ports/*` 注释） |
| ui/ | 12 | 0 活 |

**这条 CLAUDE.md 债务已清零且被 `test/boundary/service-layer-boundaries.test.ts`（Rule B，基线空数组）锁死。**

### 1.3 但同构的单例逃逸口没被规则覆盖——service 层其他 `.getInstance()` 活调用 100 处

| 单例类 | service 层调用数 |
|---|---:|
| ProfileRegistry.getInstance() | 34 |
| TemplateManager.getInstance() | 22 |
| EventBus.getInstance(app) | 17 |
| DocumentLoaderManager.getInstance() | 14 |
| SqliteStoreManager.getInstance() | 5 |
| HubRegenService / SessionContextService / RerankProviderManager | 8 |

按域：chat 38、search 24、agents 19、context 6、copilot 4、其余零散。代表：`service-manager.ts:243,352,725,765`（EventBus）、`service-conversation.ts` 9 处 EventBus、`indexInitializer.ts:148-621`。

## 2. service 域间 import 邻接表

19 个域、438 个非测试 .ts；**38 组有向域对、149 条跨域 import（值 74 / 类型 75）**。

Top 边（Total≥7）：

| From → To | Total | 值 | 型 | 代表 |
|---|---:|---:|---:|---|
| chat → agents | 23 | 13 | 10 | `harnessChatRunner.ts:32,43` |
| agents → chat | 11 | 2 | 9 | **`FollowupChatAgent.ts:1` 值导入 AIServiceManager（环的闭合边）** |
| agents → tools | 11 | 8 | 3 | `FollowupChatAgent.ts:13-17` |
| chat → prompt | 11 | 5 | 6 | `service-manager.ts:9` |
| copilot → agents | 9 | 9 | 0 | `CopilotMetaAgentStream.ts:17-19` |
| agents → search | 7 | 2 | 5 | `VaultSearchAgent.ts:28` |
| chat → media | 7 | 2 | 5 | `service-conversation.ts:49,50` |
| tools → search | 7 | 1 | 6 | `content-reader.ts:5` |

### 出/入度定位

| 域 | 出 | 入 | 定位 |
|---|---:|---:|---|
| chat | 51 | 20 | 最大需求方 + 被高度依赖 |
| agents | 41 | 40 | 双向枢纽 |
| copilot | 20 | **0** | 纯消费者（可自由重构） |
| tools | 8 | 17 | 健康共享域 |
| search | 11 | 19 | 中枢 |
| prompt | 0 | 11 | chat 的私有卫星域（入度 100% 来自 chat） |
| run-envelope | 0 | 10 | 纯共享内核（设计意图，`InMemoryRunRecorder.ts:1-10` 注释） |
| debug-trace/maintenance | 0 | 0 | 完全独立 |

### 循环依赖

直接 2 域环 5 组：**chat↔agents（23+11，最重）**、agents↔context（6+1 全值）、agents↔mcp（2+2）、chat↔search（2+6）、search↔tools（2+7）。3 节点环（agents→search→chat→agents 等 3 条）根因都是 chat↔agents。

### facade 纪律

只有 3 域有 index.ts：composer（100% 遵守，ui 50 次引用全走门面）、run-envelope（100% 遵守）、**capabilities（被绕过 2 次**：`documentRuntime.ts:45`、`CopilotCommandCenterService.ts:7`）。其余 16 域无门面。

## 3. ui → service 依赖

| Surface | 依赖（Total/值/型） | 走门面 | 深层导入 |
|---|---|---:|---:|
| composer | composer(50/33/17) | **50/50** | 0 |
| copilot | copilot(76/14/62) | 0 | 76 |
| chat-view | chat(33/15/18), media(5) | 0 | 37 |
| quick-search | search(16), agents(15), copilot(4), context(3), chat(2) | 0 | 39 |
| usage-dashboard | usage(19/1/18) | 0 | 18 |

composer 是唯一走 facade 的 surface（也是唯一有 facade 可走的）。其余是"缺 facade"而非"绕 facade"的债。单文件最广耦合：`SearchModal.tsx` 深挖 copilot 域 4 个内部模块。

## 4. core 纯净度

core→app 0、core→ui 0、core→service **19 处全部 type-only**，全在 `core/ports/*` 9 个文件——与 boundary-baseline.mjs 和 t11r 测试锁定的 19 完全对齐，是显式承认+锁死的已知债务（`CopilotPanelPorts.ts:1-17` 留有说明）。

## 5. 组装根

app/ 下 33 个 compose*/create* 函数，调用方 100% 在 app 层：main.ts（10 个）+ AppContext.ts（5 个）+ ReactElementFactory.tsx（6 个）。`rg "compose[A-Z]" src/service src/ui` 命中 0。service 层跨域 new 共 12 处：9 处是设计如此的 `new InMemoryRunRecorder`，3 处普通构造注入（`service-conversation.ts:724`、`harnessChatRunner.ts:174`、`service-manager.ts:143`）。

副发现：`composeImageCapabilityRuntime`（`src/app/composer/composeImageCapabilityRuntime.ts:45`）全仓无调用点，疑似死代码。

## 6. 架构守卫测试盘点

21 个守卫文件。已锁死：四层方向性（5 层测试交叉，历史从 T11J≤15 收紧到 T11R=0）、service 层 AppContext、obsidian 渗透 =0、5 个具名域的逃逸+退役单例复活、composer 域模块级单例（唯一真正测了 CLAUDE.md 单例规则的域）。

**裸奔的高风险边界**：① service 域间耦合矩阵（邻接表/环完全无守卫——baseline 脚本粒度停在 4 层，看不见 19 个域）；② service 层非 AppContext 单例 getInstance（100 处无锁）；③ facade 绕行检测；④ 组装根集中度（现状干净但无回归防护）。

## 7. 判决

**分层纪律：高**。四层方向性铁锁 + AppContext 债务清零 + 组装集中 + core 纯净（19 条显式锁定的 type-only 例外）。扣分：单例规则只覆盖了 AppContext 一种（100 处同构逃逸）、域间横向耦合零度量。

**耦合最重三对**：① chat↔agents（34 边+真环+FollowupChatAgent 反向值导入编排巨类）；② agents→tools / chat→prompt（各 11）；③ search↔tools（9，真环）/ copilot→agents（9，单向）。

**最该加的三个守卫**：① 域间依赖矩阵 floor 测试（t11r 风格）；② 非 AppContext 单例用量锁（起始基线 100）；③ facade 绕行检测（capabilities 2 处违规做起点）。
