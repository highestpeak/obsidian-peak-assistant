# Worktree Brief: Usage Dashboard Redesign

> **怎么用**：把整篇文件复制粘贴到一个新 Claude Code session（或 Conductor worktree session）里作为 first message。所有上下文都在里面，不需要读其他文件。

---

## 任务定位

把 Peak Assistant（Obsidian 插件）的 **Usage Dashboard** 从"回望型 BI 后台"重做成"事件驱动的 7 类载体（carrier）"。这是 Design System Unification 4 条流之一，跟 chat / onboarding-settings / copilot skin 并行。

**优先级**：第二批合并（chat 之后）。原因：dashboard 不是用户日常 surface，可以等 chat 视觉先定型再做，避免视觉返工。

**前置条件已就绪**：PR-0 (Design System Landing) 已 landed on master（commits `a7f0578` → `d3f7d16`，2026-05-30）。基于 PR-0 之后的 master。

---

## 源真理（按优先级）

| 文件 | 角色 |
|---|---|
| `docs/superpowers/specs/2026-05-29-usage-dashboard-insights.md` | **决策 spec**——尤其 §11 是 mock 阶段沉淀的具体设计决策，**逐条照做** |
| `docs/gstack/usage-dashboard-mockups-2026-05-29/index.html` + `1-overview.html` ... `6-optimization.html` | 6 屏 mock |
| `docs/gstack/usage-dashboard-mockups-2026-05-29/styles.css` + `partials.js` | mock CSS/JS（已被 PR-0 task 7 迁到生产 token 名，可直接当视觉参考） |
| `docs/gstack/usage-dashboard-mockups-2026-05-29/README.md` | mock 包说明 |

---

## 已锁定的设计决策（spec §11，**不要重谈**）

### 1. 形态：dashboard 不是默认载体
拆成 **7 类载体（A-G）**：
- A. **inline message receipt** —— 每条 AI message 末尾的"这次花了 X token，$Y 估算"
- B. **Curator runtime push** —— 触发式弹窗（context 快满 / 高额支出 / 异常）
- C. **context ring** —— 输入框边的 0-100% 满度指示
- D. **status bar** —— Obsidian 底部 bar 的 daily $ 走势
- E. **command palette quick check** —— `/cost`、`/context` 命令
- F. **dashboard view** —— 当前重做的 6 屏面板（"周末翻账本"用途，不是日常打开）
- G. **settings → usage tab** —— Settings 主面板里嵌入的简洁视图

**本 worktree 重点是 F（dashboard view 重做）+ A（inline receipt）+ C（context ring）+ B（Curator runtime push）**。D/E/G 留给后续。

### 2. MPG（cost-per-outcome）指标
spec §11.2 定义：`MPG = total_cost / count_useful_messages`，where `useful_message = ≥1 usage_outcome event`（vault_save / copilot_accept / agent_file_emit）。
触发事件 + 表 schema 已经在 PR-0 task 4 落地（见下面 telemetry hooks）。

### 3. Funnel 简化为 3 阶（spec §11.3）
- 阶 1 **invoked** —— 被调用了
- 阶 2 **inspected** —— 用户看完响应（停留 ≥3s 或滚动到底）
- 阶 3 **adopted** —— 产生了 outcome（≥1 usage_outcome 事件）

### 4. `usage_outcome` 表
PR-0 task 4 已经建好。schema：`{ id, message_id, session_id, event_type, occurred_at, target, metadata_json }`。event_type 闭合枚举：`vault_save | copilot_accept | search_click | agent_file_emit | continuation`。

### 5. `usage_log.metadata_json` per-feature 字段
spec §11.6 表定义。chat / search / agent / copilot / embed 各有约定字段。Dashboard 的 "What was this about" 详情面板按 feature switch 渲染。

### 6. 隐私策略（spec §11.7）
- `*_preview` 字段统一截断 200 字符进 `metadata_json`
- 完整 prompt/response 不进 DB，按需从 vault 回放
- 用户可关闭 preview（设置 `usagePreviewEnabled: boolean`）

### 7. "What was this about" 详情面板
spec §11.5。History 屏右侧详情面板，per-feature switch 渲染（chat: breadcrumb + prompt/response preview + 工具 + 文件 + Open in chat verb；search: query + top-3 结果 + 哪条被点；agent: task goal + step + tools；copilot: 文件 + diff + accepted；embed: 文档标题 + chunk 数 + 模型）。

### 8. 4 个 mock 阶段踩过的反模式（spec §11.9）
**不要再犯**：
- 不要在 dashboard 主面板上做 "alert fatigue"（推所有事件）
- 不要把 raw token 数字当主指标（用 MPG）
- 不要把 funnel 做成 4-5 阶（用 3 阶）
- 不要让 dashboard 成为"被动等待打开"的唯一载体（要事件驱动 carrier 配合）

---

## 视觉决策（可以被 PR-0 改写——已经改写了）

PR-0 task 7 已经把 dashboard mock 从 dark-only 改成 light+dark 双模 + accent purple `#7c3aed` + Catppuccin Mocha dark anchor `#1e1e2e`。**继承 PR-0 的 token 改造**——不要回滚到 warmer `#0a0d17` 或 blue accent。

### Dashboard 自创的 9 个原语（spec §11.8）
- **brand letter avatar**（`.brand-av`）—— provider 识别 → **已升级到 PR-0 的 `<BrandAvatar>`**
- **inline table bar**（`.tbl-bar`）—— 表格 % 列内嵌 bar + 数值 → **dashboard 专属**
- **horizontal bar list**（`.hbar`）—— 4-column grid（`label / bar / $ / %`，**$ 永远在条外**）→ **dashboard 专属**
- **KPI top-right action slot**（`.kpi__action`）—— KPI 卡右上角独立 verb 按钮 → **dashboard 专属**
- **savings dial**（`.savings-dial`）—— 小 ring + 文案 → **dashboard 专属**
- **help affordance**（`.help`）—— ⓘ + native tooltip → **建议升级到全局原语**（chat/onboarding 也需要）
- **explainer panel**（`.explainer`）—— `<dl>` 定义清单 → **dashboard 专属**
- **numbered pager**（`.pager`）—— History 表分页 → **dashboard 专属**
- **outline pill button**（`.btn--pill`）—— 轻量行动 → **已对应 PR-0 的 `<Pill>`**

**dashboard 专属的 5-7 个原语**放在 `src/ui/view/usage-dashboard/components/charts/` 下，不进核心层。**help affordance** 如果发现 chat / onboarding 也确实需要，提一个小 PR-0.x 升级到全局。

---

## PR-0 已交付的地基（你可以直接用）

### 设计 tokens
`src/styles/peak-tokens.css`，包括 `--pk-prov-{openai,anthropic,google,openrouter,perplexity,ollama}` + `-soft`（light + dark）—— provider 颜色直接用。

### 共享 CSS 原语（`src/styles/peak-components.css`）
10 个原语。Dashboard 主要用：
- `.pk-modal-*`（对于 "What was this about" 详情面板）
- `.pk-popover` + `.pk-pop-item`（对于行动菜单）
- `.pk-chip`（status badge）
- `.pk-pill`（filter button）
- `.pk-segmented`（time range toggle: Today / 7d / 30d / All）
- `.pk-brand-av`（provider letter avatar）
- `.pk-row`（如果 history 表的行用 row 而不是 `<table>`）

### React 原语（`src/ui/components/primitives/`）
导入：`import { Modal, Popover, Segmented, BrandAvatar, Chip, Pill, ... } from '@/ui/components/primitives'`

### Capability 适配器层（`src/service/capabilities/`）
Dashboard 本身不是一个 capability provider（它消费数据，不报 readiness）。**不需要注册 adapter**。

### Telemetry hooks（`src/service/usage/UsageOutcomeService` —— **dashboard 是最大消费方**）
- 表 `usage_outcome` 已经建好
- `UsageOutcomeService.getInstance()` 提供：`outcomesForMessage(id)`, `outcomesForSession(id, since)`, `countByType({from,to})`, `countUsefulMessages({from,to})`
- 跟 `UsageLogRepo` 配合 join：根据 message_id 把 `usage_log` 和 `usage_outcome` 关联，算出 MPG / funnel

**注意**：dashboard 的责任只是**展示** outcome 数据；**写入** outcome 数据是 chat / copilot / search worktree 各自的事（他们的 brief 已经说了要调 `recordVaultSave / recordCopilotAccept` 等）。如果他们还没 land，dashboard 看到的 outcome 表会是空的——这是正常的渐进集成顺序。

### Templates 字符串外置
`templates/config/dashboard.json`（空壳）—— dashboard 所有用户面字符串迁过去。

---

## 现有 dashboard 实现位置

| 层 | 路径 |
|---|---|
| 入口命令 | `src/app/commands/Register.ts:80`（`peak-usage-dashboard`） |
| View 容器 | `src/ui/view/usage-dashboard/UsageDashboardView.ts` |
| 主组件 | `src/ui/view/usage-dashboard/UsageDashboard.tsx` |
| 子面板 | `src/ui/view/usage-dashboard/components/{KpiCards,TrendCharts,DistributionCharts,DailyBreakdown,RecentCallsTable}.tsx` |
| Hooks | `src/ui/view/usage-dashboard/hooks/useUsageData.ts` |
| Service | `src/service/usage/UsageTrackingService.ts` + `UsageOutcomeService.ts`（PR-0 task 4 新增） |
| Cost 计算 | `src/service/search/support/llm-cost-utils.ts` |

**重点**：现有 dashboard 大幅重做（form 改 carrier-aware 7 面），不是 patch。但 service 层（UsageTrackingService / cost-utils）保留。

---

## 4-PR Chain

| PR | 范围 |
|---|---|
| `PR-Dash-1` | **载体拆分骨架** —— dashboard view 重做成 6 屏（Overview / Provider-Model / Outcome-Value / Budget-Alerts / History / Optimization），跟 mock 的 6 屏对应。用 PR-0 原语 + dashboard 专属原语（charts/）。 |
| `PR-Dash-2` | **MPG + funnel + outcome 数据流** —— hooks 从 `UsageOutcomeService` 查 useful messages count + countByType；funnel 3 阶 query；MPG 公式。 |
| `PR-Dash-3` | **"What was this about" 详情面板** —— Modal 复用 PR-0 `<Modal>` 原语，per-feature switch 渲染（按 spec §11.5 表）。 |
| `PR-Dash-4` | **inline receipt + context ring + Curator runtime push（载体 A/B/C）** —— chat 视图的 message 行末加 receipt（依赖 chat worktree 提供的 message render hook —— **跟 chat worktree 协调**）；composer 旁边加 context ring；Curator push 模态由 settings 的 `usagePreviewEnabled` 控制。 |

---

## 不要做的事

- 不要回滚 PR-0 task 7 把 dashboard 改 light+dark 的工作（不再 dark-only）
- 不要把 dashboard 专属图表原语提升到全局（chart / savings-dial / hbar / tbl-bar / pager / explainer / kpi__action 留 dashboard 局部）
- 不要让 dashboard 成为唯一载体（inline receipt + context ring + Curator push 是 spec §6.1 的必要配套）
- 不要在 metadata schema validation per event_type 这块做扩展（spec §11.6 写好就 OK）
- 不要碰 chat / onboarding-settings / copilot 的代码（只有 PR-Dash-4 的 inline receipt 需要跟 chat 协调 hook）

---

## 验证

- `npm run build` green
- `npm test` green
- `usage-outcome-*` 单测仍 9/9 pass（PR-0 task 4 引入的）
- 在 Obsidian 里打开 dashboard，跟 6 屏 mock 对比
- light + dark 都要测
- chat 视图 message 末尾能看到 inline receipt（依赖 chat 已 land）
- composer 旁边 context ring 显示当前 ctx 利用率
- `usagePreviewEnabled` 关掉后，dashboard 详情面板不显示 prompt/response preview

---

## 已知开放问题

- **inline receipt 跟 chat worktree 怎么协调**：chat worktree 需要在 message render 处暴露一个 hook 让 dashboard worktree 渲染 receipt slot。需要跨 worktree 同步——可以在 PR-Dash-4 开工时跟 chat worktree session 沟通约定 hook 签名。
- **context ring 的实时数据来源**：要么 chat 暴露 `useCurrentContextUtilization` hook，要么 dashboard 自己订阅 chat store。前者更解耦。
- **Curator push 触发频率** spec §11.10 Q2 还 open —— 默认推荐 "1/session + threshold 触发"，先这么做，跟用户走查后再调。
- **G 载体（settings → usage tab）跟 onboarding-settings worktree 怎么衔接**：可以在他们 PR-D（settings IA 重排）的时候预留 tab slot，dashboard worktree 后续填充。

---

## 上下游联动

- **依赖**：PR-0 已 landed。如果 PR-Dash-4 涉及 inline receipt，需要 chat worktree 已 land（至少 PR-Chat-2 message 形态完工）。
- **被依赖**：onboarding-settings worktree 的 PR-D（settings IA）可能要预留 Usage tab slot 让 G 载体后续填。
- **冲突边界**：动 `src/ui/view/usage-dashboard/` + `src/service/usage/`（仅查询层，不改 writes）+ `templates/config/dashboard.json` + 可能动 chat view 的 message render（需协调）。

---

## 开 worktree 命令

git worktree：

```bash
cd /Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant
git worktree add ../../../../../peak-dashboard -b dashboard-redesign master
cd ../../../../../peak-dashboard
npm install
npm run dev
```

Conductor：新建 worktree 命名 `dashboard-redesign`。

---

## 完工标准

- 4 PR merge 完
- 6 屏 dashboard 视觉对齐 mock（light + dark）
- MPG / funnel / outcome 数据真实查询出来
- "What was this about" 详情面板 per-feature switch 渲染正确
- inline receipt + context ring + Curator push 在 chat 视图可见（如果 chat 已 land）
- `npm run build` + `npm test` green

完工后在 `docs/progress.md` 追加日志。
