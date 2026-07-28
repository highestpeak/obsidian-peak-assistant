# 01 · AI 内核依赖图审计原稿（LLM 执行入口 / Prompt 管理 / 模型路由）

> 2026-07-27 rg + 源码通读 + `tsc --noEmit` 交叉验证。

## 1. LLM 执行入口：4 个顶层入口 + 3 套底层 SDK，非统一门面

| # | 入口 | 位置 | 消费方 |
|---|---|---|---|
| A | `IAgentPrompter`（AIServiceManager 实现，queryText/queryStream/queryStructured/queryTextStream） | `IAgentPrompter.ts:27-51` / `service-manager.ts:829,872,916,984` | 33 处，跨 6 域 |
| B | `runAgentLoop`（harness canonical） | `AgentLoop.ts:76` | 6 处（chat 主链、VaultSearchAgent、Bridge、SubAgentDispatcher） |
| C | `queryWithProfile`（Claude Agent SDK 子进程） | `sdkAgentPool.ts:246` | **14 处绕过门面**（ReportOrchestrator×5、GraphAgent、Ambient、copilot Meta ×2、agent-actions、webSearchTool、harnessChatTools、intuition.recon、VaultSearchAgent:477） |
| D | `vercelGenerateText/StreamChat` 直连 | `providers/vercel/index.ts:19,36` | **5 处绕过门面**（aiQueryParserRuntime、AIQueryRewriteService、UsageOptimization、CuratorAgent、compactSummarizer） |

- **同一 Provider 两条 SDK**：走 A（isAgentSdkProfile）→ Claude Agent SDK 子进程；走 B → Vercel `@ai-sdk/anthropic` HTTP（`bindings.ts:42`）。AgentLoop.ts:251 的 streamText 也不复用 vercel-adapter.ts。
- **设计中的统一层零接管**：BackendStrategyRegistry + registerBackendStrategies 在 main.ts:461 `void backendStrategies; // consumers wire in during Wave 1`——策略注册了没人消费；`composeExecuteFromPolicy` 全库零调用。
- 死代码：`chatToolBuilder.ts:116 buildChatTools` 整体零调用（含其中的 queryWithProfile 网络搜索实现）。

## 2. Prompt 管理：部分统一 + 真实类型漏洞 + 一个失效功能

- `PromptId` 枚举 124 成员、292 处引用/59 文件；但 TEMPLATE_METADATA 的 prompts 条目有 **151** 个——**27 个 "-system" 伴生条目不在枚举里，靠 `as PromptId` 强转**。`tsc --noEmit` 证实为真实类型错误（TS2353）。**项目共 355 个既有类型错误，build 全程 esbuild 无 typecheck 网关**——永远不会被发现。
- 纪律冠军：Composer——唯一执行器 + 明文规则 "Template-registered PromptId (never inline prompt text)"（`executorPort.ts:16-17`）。
- 绕过 PromptId 硬编码 system prompt ×2：`aiQueryParser.ts:29-46`、`compactSummarizerRuntime.ts:17-26`（对照组 Curator/UsageOptimization 已在 T11Y-6 迁移——迁移没扫全）。
- UI 组件直连 IAgentPrompter ×4：ProjectDescriptionEditor.tsx:91、PromptEnhanceSuggestion.tsx:60、InsightInlineChat.tsx:153、ReviewPanel.tsx:42。
- **`promptModelMap`（按 Prompt 配模型）完全失效**：无 Settings 写入点；`getModelForPrompt` 只被 token 估算展示调用（`llm-enrichment-progress-tracker.ts:49`）；真正执行路径 `requireActiveProfile()` 不读它；BuildUserProfileRunner 解析出的 model 只用于算截断、没传给真正调用（:135-138）。**文档宣称支持、生产不生效**。

## 3. TemplateManager：注册充分 + 孤儿条目 + 第三条平行加载通道

- 201 个 TemplateId（prompts 151/config 22/indexing 11/tools 9/agents 5/stopwords 3）；磁盘 630 文件，除 config 外一一对应。
- `templates/config/` 5 个孤儿文件：`bridge-note-template.hbs` 零引用死文件；**`models/model-catalog.json` 被 `model-registry.ts:1` 静态编译期 import**——与 TemplateManager 平行的第三条配置加载机制。
- `ConfigTemplateId.Models*` 六条注册全库零 loadJson 调用——被 model-catalog 取代后的死注册。
- **TemplateManager 直连（38 文件）中 ~13 个 Agent/Service 绕开 `PromptService.render()` 的用户覆写机制**——这些 PromptId 在设置面板可见、用户放覆写文件却不生效。

## 4. 模型路由：4 套互不联动的解析逻辑

- `ProfileRegistry.resolveSlot()` 自称 "THE single model-binding resolver"，实际只 **5 个调用点**（sdkAgentPool ×2 + tier/bindings ×3）。
- 绕行者：`requireActiveProfile()`（A 入口主路径，Composer/Copilot 多数/reranker 等——永远 Agent 角色不看 tier）；`resolveCopilotProfileAndModel()`（第三条）；`getActiveAgentProfile()` 直查 ×6（GraphAgent/Ambient/Meta ×2/useOptimization…）；`getActiveAgentFastConfig()` 直读 ×2（跳过 Harness Fast Lookup 覆盖，用户只配新版时静默拿不到模型）；**`AIQueryRewriteService.resolveFastLookupBinding()` 手写重实现 resolveSlot('fast') 回退链**。
- 即"fast 档位怎么选模型"有三份独立实现并存。

## 5. 能力域 × AI 依赖矩阵（要点）

| 域 | 入口 | Prompt | 路由 |
|---|---|---|---|
| Composer | 唯一 A（ComposerAiExecutorAdapter） | 100% PromptId | requireActiveProfile（不感知 tier） |
| Chat | 主 B（respects tier）+ UI 直连 A ×2 + C ×1 | slots 经 PromptService（可覆写） | 主链 tier / 直连不感知 |
| AI Analysis | 主 B + C ×8 | 混合（部分不可覆写） | 主链 tier / GraphAgent 绕过 |
| Search | D ×2 + A ×1 | 1 处硬编码 + 混合 | 三套互不复用 |
| Ambient | C ×1 | TemplateManager 直连（不可覆写） | getActiveAgentProfile 绕过 |
| Copilot | A(queryStructured) ×8 + C ×2 | 占 151 模板中 ~58% | 两套 |
| Atlas | **零 AI 调用** | — | — |
| Usage/Curator | D 各 1 | 已规范化 PromptId | 绕过 / 合理例外 |

## 6. 判决：**中低（4/10）**

正向：注册表模式设计合理；Composer 证明单入口 + 100% PromptId 可落地；T11Y-6 迁移证明团队知道正确做法。
负向：4 并行入口 / 3 套 SDK / resolver 只 5 调用 8+ 绕行 / promptModelMap 失效 / 27 个 as PromptId 强转（tsc 真错、无 CI 网关拦截）/ 19 处绕门面直连。

**三大问题**：① "用哪个模型"4 套解析并存——改一处 Settings 不会同步生效到所有功能；② promptModelMap"看起来存在实际不生效"，误导维护者且无测试可捕获；③ 19 处绕门面直连各自决定 prompt 来源/模型解析/usage 上报——门面实际覆盖不到一半的真实调用面。
