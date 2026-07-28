# Audit 04 · Atlas / Doc Switch + 辅助面（Onboarding / Usage Dashboard / Command Center / Settings / Morning Briefing）现状盘点

> 2026-07-27 代码库实地盘点原稿（Explore agent 产出）。所有结论带 file:line。

## 1. File Atlas

**入口**：唯一入口是命令 `Open File Atlas`（`peak-file-atlas-open`）→ `openFileAtlas()` 动态 import `FileAtlasModal`（`src/app/commands/PeakCommandActions.ts:132-135`；注册链 `src/app/commands/gateway/composeCommandGatewayBindings.ts:102-109` → `main.ts:476`）。**是 Modal 不是持久 View/Leaf**（`src/app/file-atlas/FileAtlasModal.tsx:21`），关闭即销毁，无工作区状态保存。

**功能**：
- 左侧 `FileRail`：当前打开的 markdown 文档列表，可切换/关闭（`src/ui/view/file-atlas/FileAtlasHost.tsx:21-79`）。
- 主区两个 tab（`src/ui/view/file-atlas/FileAtlasPanel.tsx:264-290`）：**Tree**（block 解析树 + 搜索 + kind 过滤 + Inspector + Tray 收集篮，`FileAtlasPanel.tsx:296-364`）；**Graph**（只读 1-hop/2-hop 邻域图，复用 `AtlasGraphCanvas`，数据来自 `composeFileAtlasHost.ts:162-215`，未建索引返回空数组 `composeFileAtlasHost.ts:166`）。
- **Tray "Send to Copilot" 是永久禁用的死按钮**，注释标明 "Phase 3 handoff"（`src/ui/view/file-atlas/components/AtlasTray.tsx:5-6, 61-70`）。

**图布局未持久化**：`FileAtlasGraph.tsx:90` 的 `layout` 是纯 `useState('constellation')`，无 localStorage/vault 写入；同一 `AtlasGraphCanvas` 在 Vault Search Result Graph（`src/ui/component/result-browser/graph/ResultBrowserGraph.tsx`）同样不持久化。Spec（`docs/superpowers/specs/2026-07-08-file-atlas-design.md:582-621`）讨论的持久化对象是洞察节点，不是图布局。

**完成度**：Phase 0（解析器）、Phase 1（Tree MVP）完成有测试；Graph 只读版完成；**Phase 2（Persisted Insight Display）、Phase 3（Tray→Copilot 交接）未做**。

**测试**：仅 `test/file-atlas-parser.test.ts`、`test/file-atlas-config.test.ts`；`atlasTreeModel.ts`、Host/Panel 组件、`loadNeighborhood` 无测试。

## 2. Onboarding

**入口**：首启自动弹（`main.ts:696-703`，ProfileRegistry 为空时延迟 500ms 打开 `HarnessOnboardingModal`）；手动重跑命令 `Setup Wizard`（`PeakCommandActions.ts:86-91`）；Settings Overview "Run setup"（`src/ui/view/settings/tabs/OverviewTab.tsx:98`）。

**步骤**：状态机 **7 主步骤**（`src/ui/view/onboarding/OnboardingStateMachine.ts:36-57`）：welcome → capabilities → provider → ai-behavior → index-readiness → system-check → ready-to-try；ai-behavior 内含 6 子步骤（Curator 流程，`OnboardingStateMachine.ts:67-73`）。文案漂移：`manifests.ts:50` 写 "9-step"。

**关键缺口**：`system-check` 与 `ready-to-try` 的汇总行**全部是硬编码静态"全绿"文案**（`templates/config/onboarding.json` 的 `systemCheck.checkRows` / `indexReadiness.readinessRows` / `readyToTry.summaryRows` 写死 `state: "ready"`；渲染在 `HarnessOnboardingWizard.tsx:627-715`）。注释自陈 "Detailed row data is computed live from CapabilityRegistry in PR-E"（`OnboardingStateMachine.ts:130-134`）——**PR-E 从未落地**。

**接线**：其余全接通（Curator 真实调用 + 写回 HarnessSettings）。测试较全（4 个测试文件约 1079 行）。

## 3. Usage Dashboard（实际是 6 屏，不是 3 屏）

屏清单：overview / provider-model / outcome-value / budget-alerts / history / optimization（`src/ui/view/usage-dashboard/UsageDashboard.tsx:22-28, 345-352`）。

**数据真实性**：
- Overview：真实（`useOverviewSnapshot`、`useDashboardMetrics` 查 sqlite `usage_log`/`usage_outcome`）。
- Budget & Alerts：预算规则读写真实 `HarnessSettings.budget`（`BudgetAlerts.tsx:458-490`）；**但** "What users will see" 预览卡无数据时回退写死 `$14.20`/`$40.00`（`BudgetAlerts.tsx:379-380`）；**死按钮群**："Edit thresholds"（223-225）、"Manage"（310-312）、"Customize"（359-361）、预览卡内 "Open Optimization"/"Snooze"/"Compact Now"/"Dismiss"/"Open Trace"（394-395, 417-418, 437）均无 onClick；"Test Alerts" 只弹 `Notice('preview only')`（257-263）。
- Optimization：信号真实——`UsageOptimizationService.collectSignals`（`src/service/usage/optimization/UsageOptimizationService.ts:91-114`）跑 3 条真实 SQL（feature/model 聚合 167-207、高成本无结果 209-251、超长会话 253-288）；LLM 优先、规则引擎兜底（R1-R4，`src/service/usage/optimization/rules.ts`）。**但 "Apply"/"Preview" 只写本地 state + Notice，不落 HarnessSettings**（`Optimization.tsx:32-34, 64-68`，注释自陈 future PR）；"Open Budget" 无 onClick（163）。
- Overview 屏 "View all {count}"、"This week" 是无 onClick 的纯 span（`Overview.tsx:345-349, 405`）。

**测试**：底层 repo/outcome 有测试；`UsageOptimizationService`、`useOptimization`、全部 Dashboard 屏组件**零测试**。

## 4. Command Center

- `CopilotCommandCenterModal` 是**全局自然语言 meta-planner**（goal → LLM 从 CommandGateway.all() 挑命令排步骤 → 逐步 Execute/Revise/Cancel；`src/app/ui-host/modals/CopilotCommandCenterModal.ts:1-155`、`src/service/copilot/CopilotCommandCenterService.ts:38-86`）。
- **生产不可达**：`openCopilotCommandCenter()`（`PeakCommandActions.ts:347-364`）无任何注册/调用方——符合 `docs/conventions/command-palette-governance.md:14-16` 的撤下决定，但代码+单测仍在，属死代码路径。
- **实际进入命令面板的只有 7 个命令**（经 `composeCommandGatewayBindings.ts:77-135` + `main.ts:463-487` 唯一注册点）：peak-open-settings / peak-harness-setup-wizard / peak-quick-search / peak-file-atlas-open / peak-usage-dashboard / peak-open-chat-studio / peak-open-document-composer。
- 孤儿函数（全仓库无调用方）：`openCopilotPanel`（97）、`openCopilotReviewHistory`（101）、`openRelatedNotes`（117）、`openCopilotCommandCenter`（347）。
- 文档漂移：governance 文档写"六项"，代码 allowlist 是 7 项（多 composer）。
- allowlist 测试扎实：`test/command-gateway-wire-in.test.ts`（精确 id 断言 + `addCommand` 出现次数=1 断言，已跑通 PASS）。

## 5. Settings 信息架构

6 个 tab（`SettingsView.tsx:63-70`；文件头注释还写"5-tab IA"，漂移）：Overview / AI Setup / Knowledge Index / Tools / Media Generation / Advanced。
- Overview 的 Providers/AI behavior/Knowledge Index readiness 接真实数据（`OverviewTab.tsx:164-222`）；**Web Access 行硬编码 'Not configured'**（`OverviewTab.tsx:78-82`）。
- `settingsStrings.ts:62-64` 留有 PR-D "legacy stub copy" 未清理（注释自认）。

## 6. Morning Briefing

- 晨间简报 Modal：未充分链接的近编辑笔记 / 更新的知识簇 / 久未访问的重要笔记（`MorningBriefingPanel.tsx:7-32`），来自 Ambient 子系统。
- **完整接线非死代码**：`main.ts:940-957` initSqlite 后延迟 3s 经 `AmbientPushRuntime.tryShowMorningBriefing()`（`src/service/ambient/AmbientPushRuntime.ts:76-98`）门槛判断（Ambient 总开关 + enableMorningBriefing + 间隔 + 有新条目）。卡片交互接真实导航/store，无死按钮。
- 测试：仅 `test/briefing-item-builder.test.ts`；门槛逻辑与 UI 无测试。

## 7. 问题清单汇总（TODO/stub/假数据/死按钮）

| 位置 | 问题 |
|---|---|
| `AtlasTray.tsx:61-70` | "Send to Copilot" 永久 disabled（Phase 3 未落地） |
| `templates/config/onboarding.json` + `HarnessOnboardingWizard.tsx:627-715` | System Check / Ready-to-Try 硬编码"全绿"假状态（PR-E 未落地） |
| `BudgetAlerts.tsx` 多处 | 8+ 个无 onClick 死按钮 + 写死金额 + 假 Test Alerts |
| `Optimization.tsx:32-34, 64-68, 163` | Apply/Preview 不落地、Open Budget 无 onClick |
| `Overview.tsx:345-349, 405` | link 样式的纯 span |
| `OverviewTab.tsx:78-82` | Web Access readiness 硬编码 |
| `settingsStrings.ts:62-64` | legacy stub copy 未清理 |
| `PeakCommandActions.ts:97, 101, 117, 347` | 4 个孤儿入口函数 |
| `command-palette-governance.md:27` / `SettingsView.tsx:1-14` / `manifests.ts:50` | 3 处文档/注释漂移（六项 vs 7 项；5-tab vs 6-tab；9-step vs 7-step） |
