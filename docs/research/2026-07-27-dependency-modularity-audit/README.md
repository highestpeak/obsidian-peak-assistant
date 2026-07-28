# 依赖关系 + 模块化 + 冗余 全景审计：六大能力的架构判决

> 2026-07-27。四路 rg 实地审计原稿：[01 AI 内核](./01-ai-kernel.md)、[02 数据层](./02-data-layer.md)、[03 域间耦合/分层](./03-coupling-layering.md)、[04 冗余清单](./04-redundancy.md)。体量基线：src 21.2 万行 TS/TSX、test 6.4 万行。姊妹篇：[产品能力矩阵](../2026-07-27-capability-walkthrough-ecosystem-strategy/capability-matrix.md)（功能面）、本篇是架构面。

## 〇、一句话判决

**骨架是优等生，内脏有三处分裂。** 四层分层纪律（app→service→core←ui）被 21 个守卫测试锁到 0 违规——这在同体量项目里罕见；但三个最核心的横切面各有 3-4 套并行实现：**谁调模型（4 入口）、用哪个模型（4 套路由）、谁摸数据库（图存储 50 文件直连）**。冗余代码本身不多且大都有明确 canonical；真正的浪费是"看起来存在、实际到不了/不生效"的资产：1 万行无入口的 copilot 面板、失效的 promptModelMap、零消费的统一后端层、死表死注册。

## 一、四维评分卡

| 维度 | 评分 | 一句话 |
|---|---|---|
| 分层纪律（app/service/core/ui） | 🟢 **高** | 跨层方向 0 违规 + 21 个守卫测试 + AppContext 快捷方式在 service 层清零 + 组装 100% 集中在 3 个 app 文件 |
| AI 内核（执行入口/prompt/路由） | 🔴 **中低 4/10** | 4 并行执行入口、3 套 SDK 客户端、模型路由 4 套解析并存、promptModelMap 完全失效、27 个 `as PromptId` 强转真类型错 |
| 数据层（表/事件/settings） | 🟡 **中低** | 图存储 50 文件直连（4 个 Index Port 零消费方=形同虚设）、`mobius_operation` **确认双写 bug**、物理库边界与域不对齐；但 chat_* 族/SearchClient 是模范 |
| 冗余度 | 🟡 **中** | 真重复有限且有 canonical（结果列表 ×2、layout 格式 ×2 是 bug、Modal 样板 ×7、config 骨架 ×18、slugify ×3 含中文 bug）；LLM substrate ×3 / 双图栈是"分工清楚暂不动" |

## 二、六大能力的依赖画像（谁靠什么活）

| 能力 | AI 内核依赖 | 数据依赖 | 模块化评语 |
|---|---|---|---|
| **Composer** | 唯一执行器 + 100% PromptId（全库纪律冠军） | 独占 comment/telemetry 落点，service/composer 是唯一有 facade 且 100% 被遵守的域 | **最模块化的域**，可作其他域的整改模板 |
| **Chat** | 主链 runAgentLoop 尊重 tier；但 UI 组件直连 prompter ×2 | chat_* 表族单一网关（模范）；但 chat↔agents 34 条边是全库最重循环依赖 | 引擎强、边界烂——出度 51 全库第一 |
| **Search / AI Analysis** | 三套路由互不复用 + 2 处硬编码 prompt + C 入口 ×8 | 图存储 owner 但被 8 域穿透；mobius_operation 双写的两个当事方之一 | 功能最厚、内核最杂 |
| **Ambient** | 单点 C 入口 + 绕过 tier | port 化干净（ambient_push_log 模范） | 小而净，问题在产品层不在架构层 |
| **Atlas** | **零 AI 调用**（纯消费索引产出） | 只读 | 天然干净 |
| **辅助面（copilot/usage/onboarding）** | copilot 占 58% prompt 模板 + 两套路由；usage/curator 各 1 处直连 | copilot 表落 chat.sqlite 命名错位 | copilot 入度 0 出度 20——纯消费者可自由重构，但 **10,092 行 UI 无可达入口** |

**共享内核依赖关系**（所有能力共同踩的地基）：TemplateManager（38 文件直连，其中 13 个绕过用户覆写机制）、EventBus（17 处 service 层单例调用）、sqliteStoreManager（50 文件）、ProfileRegistry（34 处）——**这四个全局单例是事实上的"隐形第五层"，而且不受任何守卫约束**（AppContext 被锁死了，它们没有）。

## 三、"假存在"资产清单（比冗余更贵的浪费）

| 资产 | 规模 | 状态 |
|---|---|---|
| `src/ui/view/copilot/` 面板树 | **10,092 行** | 无可达入口（openCopilotPanel 孤儿） |
| `promptModelMap` 按 Prompt 配模型 | 功能级 | 无 UI 写入点、执行路径不读——文档宣称支持、生产不生效 |
| LLM Rerank | 完整实现 | enableLLMRerank 无一调用点传 true，Settings 无开关 |
| BackendStrategyRegistry 统一后端层 | 3 文件 | main.ts:461 `void backendStrategies`——注册了零消费 |
| `harness_reflection` 表 | 表级 | 零写入方（M3 只交付存储层） |
| `ConfigTemplateId.Models*` ×6 | 注册项 | 被 model-catalog.json 静态 import 取代后的死注册 |
| `buildChatTools` / `bridge-note-template.hbs` / `isLayoutBlockSource` / `composeImageCapabilityRuntime` / 4 个孤儿命令函数 | 函数/文件级 | 全库零调用 |
| **355 个 tsc 类型错误、无 typecheck 网关** | 全库 | esbuild 不查类型——27 个 `as PromptId` 强转这类真错永远不会被发现 |

这与功能面审计发现的"最后一公里不接线"（sidecar 会话、Dashboard 死按钮）是**同一种病在不同层的表现：建设完成度按"写完"计算，不按"接通"计算**。

## 四、修复优先级（架构面）

### A0 · 先上锁（低成本、防止恶化）
1. 域间依赖矩阵 floor 测试（t11r 风格）——锁 chat↔agents 等 5 组环不再增长。
2. 非 AppContext 单例 getInstance 用量锁（起始基线 100）。
3. facade 绕行检测（capabilities 域 2 处违规做起点）。
4. **tsc --noEmit 进 CI**（先锁 355 为 floor，只准降不准升）。

### A1 · 模型路由归一（最大一致性风险）
resolveSlot 已是设计上的唯一真源（2026-07-23 统一重构的产物），但消费方迁移没扫全——把 `requireActiveProfile`/`resolveCopilotProfileAndModel`/`getActiveAgentFastConfig` 直读 ×2/`resolveFastLookupBinding` 手写版全部改走 resolveSlot；顺带裁决 promptModelMap（接通或删除）。

### A2 · 数据层收口
1. **mobius_operation 双写修复**（删 `AIAnalysisHistoryService.ts:58` 直写或去掉事件订阅路径之一）。
2. 图存储收口：让 4 个 Index*Port 真的被消费——非 search 域的 17 个直连文件按域换成 port 注入（ambient/lint 已示范怎么做）。

### A3 · "假存在"大扫除
逐项裁决：copilot 面板树（接入口或归档）、promptModelMap、LLM rerank、BackendStrategyRegistry（Wave 1 还做不做）、死表死注册死函数（直接删）。

### A4 · 低成本收敛（顺手做）
图片 layout 双格式 bug（P0，功能性）、slugify 中文 untitled bug（先验证）、7 Modal 迁 ReactModalHost、18 处 config loader 工厂化、13 处 TemplateManager 直连改走 PromptService.render（恢复用户覆写）。

### 观察不动
3 套 LLM substrate（成本高于收益，规定新功能只走 AgentLoop）、cytoscape/xyflow 双图栈（分工清楚，文档写明防选错）、5 套遥测（职责不重叠）、chat 旧壳（等入口整顿一并裁决）。

## 五、整体价值评估

**这不是一个需要重写的代码库，是一个需要"收口"的代码库。** 价值集中在三块硬资产：检索/索引管线（14.5K 行 + 最厚测试）、Composer 引擎（13.7K 行 + 字节级 round-trip）、agent harness（AgentLoop 1001 行完整实现 tier/budget/trace/权限）——这三块的工程质量放到开源生态里都是稀缺品。分层守卫测试体系（21 个文件、历史上从 ≤15 收紧到 =0）说明架构自律是真实存在且在变强的。

负债不是"烂代码"而是"半接线"：横切面的多套并行实现会对**每一个新功能**征税（新功能作者要在 4 个 AI 入口、4 套路由里选，选错就加深分裂），"假存在"资产会误导未来的自己。按 A0→A3 收口后，六能力共享的地基才配得上上面盖的楼。
