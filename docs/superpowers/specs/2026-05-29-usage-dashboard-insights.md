# Usage Dashboard 重新审视：洞察整理

> 状态：**洞察阶段**，不进入实现。后续 UI 细节迭代会在 mock 页面里用 Playwright 反复打磨，本文不预设最终视觉方案。
>
> 日期：2026-05-29
> 触发：用户反馈"这个面板没那么有用"+"by provider model 等内容展示不全面、被缩略"

---

## 0. TL;DR

当前 Usage Dashboard 是一个**回望型 BI 后台**（KPI + 趋势 + 分布 + 表格）。问题不在于做得不细，而在于**做错了形态**：

1. **载体错**：dashboard 是一个被动等待用户打开的离线面板，但 90% 的 usage JTBD 是**事件驱动**的（看完一次响应、跑完一个 task、context 快满）。
2. **指标错**：raw token 数字是"时速表"，不会改变行为；行为改变需要"MPG 类"指标——**cost-per-outcome**（每条采纳笔记成本、每次有效搜索成本）。
3. **缺 agency**：研究里反复出现的反例（Cursor / AWS billing）说明，**透明 without 可执行动作 = 焦虑/无力感**。当前 dashboard 没有任何 verb。
4. **错位竞品参照**：我们是 BYOK 场景，应该参照 Cline（inline receipt = trust through receipts），而不是 Cursor（订阅制不透明 = 怒喷）。
5. **现有 UI 还有展示质量问题**（截断、密度、信息层级），但**这是次要矛盾**——形态先定对了，再用 Playwright 打磨细节才有意义。

---

## 1. 当前实现审计

### 1.1 代码结构

| 层 | 位置 |
|---|---|
| 入口命令 | `src/app/commands/Register.ts:80` (`peak-usage-dashboard`) |
| View 容器 | `src/ui/view/usage-dashboard/UsageDashboardView.ts` |
| 主组件 | `src/ui/view/usage-dashboard/UsageDashboard.tsx` |
| 子面板 | `components/{KpiCards,TrendCharts,DistributionCharts,DailyBreakdown,RecentCallsTable}.tsx` |
| 数据 hook | `hooks/useUsageData.ts` |
| 业务服务 | `src/service/usage/UsageTrackingService.ts` |
| 采集点 | `service-manager.ts:570` / `sdkAgentPool.ts:329` / `embedClient.ts:50` |
| 存储 schema | `src/core/storage/sqlite/ddl.ts:963` (`usage_log`, `usage_daily`) |
| 仓储 | `repositories/UsageLogRepo.ts` |
| 成本计算 | `service/search/support/llm-cost-utils.ts` |

### 1.2 当前展示内容

- 顶部时间范围：Today / 7d / 30d / All
- **KPI 卡 × 4**：Total Tokens / Estimated Cost / API Calls / Avg Latency（带环比箭头）
- **趋势图**：daily token trend + cost trend 折线
- **分布图**：by feature / by model / by provider（饼/条）
- **每日明细**：tokens per feature per day 堆叠
- **原始调用表**：分页 + feature 过滤

### 1.3 数据底层评估

**数据层是健全的**，不是问题来源：
- `usage_log` 字段完整（input/output/cached/reasoning tokens、cost、duration、metadata）
- `usage_daily` 聚合表 + `compactBefore` 滚动压缩
- 采集点覆盖 chat / agent / embedding 三大入口
- 成本计算在采集时入库，不是查询时计算

**结论**：未来无论形态怎么改，存储基本不需要 schema 迁移；最多增量加 `usage_outcome` 关联表。

### 1.4 已观察到的 UI 展示问题（**留给 Playwright 迭代**）

| 类别 | 现象 | 处理时机 |
|---|---|---|
| 截断 | provider/model 分布图标签溢出/缩略 | mock 阶段 |
| 密度 | 多面板挤在同屏，信息层级不清 | mock 阶段 |
| 响应式 | 不同 leaf 宽度下布局未优化 | mock 阶段 |
| 空状态 | 新装/无数据时体感未知 | mock 阶段 |
| 数字可读性 | KPI 数字大小 vs 上下文锚点缺失 | 形态定后重设 |

→ 这些**不在本文修复范围内**。形态方向确定后，在独立 mock HTML 页里用 Playwright 反复迭代。

---

## 2. 第一性原理：usage 面板**应该**解决什么

### 2.1 JTBD 分解

研究 + 自有判断融合后的 JTBD 排序：

| # | JTBD | 触发频率 | 谁有 | 最佳载体 | 当前 dashboard 是否合适 |
|---|---|---|---|---|---|
| 1 | "快撞墙了吗？"（context / quota） | 每个 session | 所有人 | **inline 指示器** | ❌ 离工作流太远 |
| 2 | "刚那次值不值？" | 每次贵的任务后 | 成本敏感者 | **post-task receipt**（Cline 式） | ❌ |
| 3 | "我这一轮花了多少？" | 每条响应 | 所有人（默认隐式） | **行内 micro-pip** | ❌ |
| 4 | "月底前会用光吗？" | 每周 | 订阅/限额用户 | **status bar 灯 + 预算条** | ❌ |
| 5 | "我在哪里超支？怎么优化？" | 偶尔 | 优化型 power user | **Curator 推荐 feed** + dashboard | ⚠️ 现状是 raw 数字没建议 |
| 6 | "为什么这次烧了 token？" | 罕见 | 调试者 | **trace / agent log 跳转** | ❌ 聚合图不是答案 |
| 7 | "学习成本模型" | 仅头几天 | 新用户 | **inline ghost text** | ❌ |
| 8 | "设上限，set-and-forget" | 一次 | 焦虑/自费用户 | **settings 入口** | ❌ |
| 9 | "复盘 / 好奇画像" | 偶发 | 好奇者 | dashboard | ✅（但是低优先级） |

**结论**：9 个 JTBD 里，dashboard 只对 #9 是默认答案，对 #5 是"组合载体之一"。**其余 7 个都被错位投递了**。

### 2.2 当前面板的根本问题

| 维度 | 现状 | 问题 |
|---|---|---|
| 时机 | 用户主动打开 | 关心是事件驱动的，被动面板永远晚一拍 |
| 指标 | 总 tokens / 总 $ | "时速表"，没有锚点、没有 outcome |
| 动作 | 0 个 verb | 看完就关，没有任何可执行链路 |
| 关联 | 与 project / session / Curator 完全断开 | 没接上产品其他系统 |
| 受众 | 所有人 | 实际只 #9（好奇者）匹配，其他用户体感不到价值 |

---

## 3. 竞品研究（核心摘录）

完整原文见研究报告，这里只留下对我们最有用的判断。

### 3.1 反面教材：Cursor（2025-06 之后）

- 从"500 fast requests"清晰计数 → 改成不透明 credit pool
- 没有阈值通知；slow mode 启动时**用延迟惩罚代替了 dashboard 警告**
- 用户怒喷 → 公开道歉 + 退款

**对我们的启示**：**透明 + 无 agency = 灾难**。我们是 BYOK 不是订阅制，但同样的陷阱依然存在——如果只显示数字不给可点的动作，等于让用户盯着 AWS 账单。

### 3.2 正面教材：Cline / Roo Code（BYOK agentic）

- 每个 task 在对话流里直接显示 `tokens · $ · model`
- "Trust through receipts"——既然是你的 key，你看自己花了多少是天经地义
- Roo Code 社区主动要求增加"workspace 跨任务聚合视图"（issue #6822）—— 说明 inline 足够好，dashboard 是补充
- 与 Cursor 区别的关键：**BYOK 让数字回到正确的心理账户**（mental accounting），不引发"我已经付钱了你还扣我？"的失调

**对我们的启示**：**我们是 Cline 阵营**。Obsidian 插件 + BYOK 默认 → inline receipt 是正确的 anchor pattern。

### 3.3 最强 pattern：Claude Code `/cost` + `/context`

- 不是常驻 UI，是**召唤式命令**
- 关键引用："target 60% context utilization, well before the ~80% threshold where auto-compact activates"——**每个数字都映射到 verb**（`/compact`、`/clear`、换 1M 模型）
- 平时不打扰，需要时随叫随到

**对我们的启示**：dashboard 不一定要是面板，可以是 hotkey + 弹层。Obsidian 的 command palette 是天然载体。

### 3.4 其他

- **ChatGPT Plus**：几乎零透明，靠"产品够快所以限额没人在意"。**故意不透明也是一种设计选择**——但只在产品体验足够无感时才能成立。
- **GitHub Copilot**：官方 dashboard 用户不满，社区自建 `github-copilot-usage-metrics-viewer`——**官方不够好的强信号**。
- **NotebookLM**：完全没有 usage UI，限额作为错误状态出现——"absence as design"。
- **Perplexity**：基本的"剩余 Pro 搜索数"，用户用油猴脚本加颜色条——再次说明官方做得不够。

---

## 4. HCI / 学术研究（对我们有指导意义的部分）

### 4.1 Mohan & Buell（HBS）"Lifting the Veil"
透明**会**提升信任，**前提是用户感知花销公平**。如果感知浪费，透明加速流失。
→ 我们必须把"花在哪"展示得能让用户判断是否值得。光给总数 = 给油门数据但不给油耗。

### 4.2 Thaler / Skwara：Mental Accounting
- 按次计费比平价订阅心理更"贵"，因为每次都触发"值不值"评估
- **订阅制 + 显示按次成本 = 心理失调**（用户已经付过钱了）
- **BYOK + 显示按次成本 = 一致**（这就是你的账单）

→ 再次确认我们应该走 BYOK 透明路线，不要怕显示 per-message 成本。

### 4.3 Froehlich 等：Eco-feedback / "MPG 效应"
- 家庭电表 20:60:20 现象：raw 数字 dashboard 只让 20% 的人减少消耗，另 20% 反而**用得更多**
- 驾驶研究：**MPG 显示比时速表更能改变行为**，因为绑了"产出"
- **feedback 单独无效，feedback + goal-setting 才有效**（15.1% 减幅）

→ 我们必须有：**(a) outcome 配对的指标（MPG 类）；(b) 用户可设的目标（预算 cap）**。光画图无效。

### 4.4 NN/g：Alert Fatigue
绿 95% 的时间 → 红出现时用户已失去关注习惯。
→ 不要做"绝大多数时候没事"的常驻警告；要做**事件驱动的高信噪比通知**（context 80%、月预算 80% 等）。

### 4.5 AWS Billing PTSD（行业经验）
对用户无法直接节流的服务做实时账单 dashboard → 习得性无助。
→ 我们的每一个 cost 数字旁边都要有"如何降低"的 verb；没有 verb 的数字不要做成 always-on。

---

## 5. Anti-patterns 清单（我们要主动规避）

来源：研究 + 现状反思。

| # | Anti-pattern | 我们当前是否中招 |
|---|---|---|
| 1 | 不透明变动成本（Cursor）| 否（我们是 BYOK） |
| 2 | 隐形悬崖（无预警直接撞墙）| **是**（context 快满没提示） |
| 3 | "95% 时间是绿的"的疲劳 dashboard | **是**（趋势/分布常态稳定） |
| 4 | 没锚点的时速表（raw token 数）| **是**（KPI 卡纯数字） |
| 5 | 透明 without agency（AWS billing PTSD）| **是**（数字旁无可执行 verb） |
| 6 | 对比羞辱（"你比平均高 3 倍"）| 否（未做对比） |
| 7 | 可游戏化指标（"省 token 排行"）| 否 |
| 8 | Dashboard 当墓地（关键信息埋在分析页）| **是**（context % 完全没有） |
| 9 | 只有 cost 不配 outcome | **是**（无 MPG 类指标） |
| 10 | 一刀切 UI（小白/重度共用一个面板）| **是** |

→ 当前 dashboard **正中 6/10 个反模式**。这是"用户觉得没用"的结构性原因。

---

## 6. 重新设计的方向（草案，待 mock 阶段细化）

> 这里只锁定**方向和载体分布**，不锁定视觉/排版/具体字段。视觉细节进入 Playwright mock 迭代阶段后再定。

### 6.1 载体重新分布（**最关键的决策**）

把"一个面板"拆成**多个事件驱动的载体**，每个载体只解决 1–2 个 JTBD：

| 载体 | 解决的 JTBD | 触发 |
|---|---|---|
| **A. Chat 行内 receipt**（每条 assistant message 底栏 micro-pip）| #3 这一轮花了多少 | 每条响应自动 |
| **B. Agent post-task summary card** | #2 值不值 + #5 优化建议 | task 完成 |
| **C. Chat 顶部 context ring** | #1 快撞墙了吗 | 持续可见 |
| **D. Status bar 灯 + 月预算条** | #4 月底前会用光吗 | 持续可见 |
| **E. Settings → Usage 区** | #5 优化（Curator feed）+ #8 设上限 | 主动打开 |
| **F. 召唤式 `/cost` / `/context` 命令** | #1 / #3 power user 路径 | command palette |
| **G. 详细历史面板**（当前 dashboard 降级）| #9 好奇 + #6 调试 | 二级入口 |

→ 当前 dashboard 整个降级为 G，不再是默认体验。

### 6.2 必须配套的能力

1. **每个数字旁的 verb**（解决 anti-pattern 5/8）
   - context 80% → "Compact this chat"
   - 月预算 80% → "Set lower default model"
   - 某模型占比异常 → Curator 推荐 + 一键切换

2. **MPG 类指标**（解决 anti-pattern 4/9）
   - Cost per accepted artifact（采纳进 vault 的内容）
   - Cost per triggered action（点击搜索结果、跳转链接）
   - Cost per completed agent task
   - 需要新增 `usage_outcome` 表关联 outcome 信号

3. **Curator runtime**（解决 anti-pattern 5）
   - 复用已有 Curator backend（onboarding 时用过）
   - 输入：最近 7d `usage_daily` + 当前 settings
   - 输出：可执行建议卡片（带"应用"按钮）
   - 投递点：Settings → Usage 区头条 / 偶发的 toast

4. **预算 + 阈值通知**（解决 anti-pattern 2）
   - settings 一次性设 `monthlyBudgetUsd` + 告警阈值
   - 越过阈值时**单次**通知（避免 alert fatigue）

### 6.3 优先级建议

第一梯队（最大杠杆 → 替换现状）：
- A. 行内 receipt
- B. Agent post-task summary
- C. Context ring
- D. Status bar + 预算条

第二梯队（差异化壁垒）：
- E. Settings → Usage 区 + Curator feed

第三梯队（增量 MPG 维度）：
- 新增 outcome 追踪 → MPG 指标 → 接入 B / E

第四梯队（降级保留）：
- G. 当前 dashboard 改为详细历史，移入二级入口

### 6.4 显式不做的

- ❌ 排行榜 / 对比 / 社交化
- ❌ always-on 大数字 KPI 卡（替换为载体 A/B/C/D）
- ❌ 不可执行的红色警告
- ❌ 在订阅模型下假装 BYOK，或反过来
- ❌ Mock 阶段前定死视觉/排版/字段顺序

---

## 7. 数据层影响评估

| 项 | 是否动 | 说明 |
|---|---|---|
| `usage_log` schema | 不动 | 字段足够 |
| `usage_daily` schema | 不动 | 聚合维度够用 |
| 采集点 | 不动 | 三处已覆盖核心入口 |
| 新增 `usage_outcome` 表 | 是 | 关联 message_id / session_id 与 outcome 信号（采纳、点击、agent 完成、文档保存）|
| 新增 settings 字段 | 是 | `monthlyBudgetUsd`、`budgetAlertThreshold`、`usageVerbosity`（行内 pip 详尽度）|
| Curator runtime | 复用 backend，新增"持续观察模式" | 输入 `usage_daily`，输出建议 JSON |
| Cost 计算 | 不动 | `llm-cost-utils.ts` 已足够 |

→ **数据层改动小，主要工作量在 UI 分布重构 + Curator runtime + outcome 信号采集**。

---

## 8. 下一步与开放问题

### 8.1 下一步（不在本文范围）

1. 用户审本文，确认形态方向
2. 进入 mock 阶段：
   - 用独立 mock HTML 页面在浏览器里反复迭代 A/B/C/D/E 的视觉
   - **用 Playwright 自动化截图 + 对比 + 调试**
   - 解决当前已观察到的截断/密度/响应式/空状态问题
3. Mock 通过后写正式 spec + 拆 PR
4. 实施时优先级按 §6.3

### 8.2 待回答的开放问题

| # | 问题 | 影响 |
|---|---|---|
| Q1 | "Accepted artifact" 怎么定义？需要用户手动点"采纳"还是隐式（保存即采纳）？ | MPG 指标的可信度 |
| Q2 | Curator runtime 推送频率？被动展示 vs 主动 toast？ | 反 alert fatigue |
| Q3 | 行内 receipt 是否默认开启？还是 onboarding 选项？ | 新用户体感 |
| Q4 | Context ring 与现有"messages" 流程的视觉冲突如何处理？ | UI 一致性 |
| Q5 | BYOK vs 自带 key 用户群的 onboarding 默认怎么分？ | 透明度 default |
| Q6 | 详细历史面板（降级后）是否值得保留全部图表，还是只保留"原始调用表 + 简单趋势"？ | 维护成本 |

---

## 9. 参考

### 9.1 内部
- `docs/superpowers/specs/2026-04-10-provider-mcp-skills-design.md` — provider/MCP/Skills 整体重设计
- `docs/superpowers/specs/2026-05-29-onboarding-design-brief.md` — Curator onboarding
- 内存：`project_curator_onboarding.md`、`project_provider_mcp_skills_design.md`

### 9.2 外部（核心引用）
- Cursor 6 月定价道歉：https://cursor.com/blog/june-2025-pricing
- Claude Code costs 文档：https://code.claude.com/docs/en/costs
- Roo Code aggregate view request：https://github.com/RooCodeInc/Roo-Code/issues/6822
- Mohan & Buell — Lifting the Veil：https://www.hbs.edu/ris/Publication%20Files/15-017_f67df7f5-8336-47fc-a0c1-098838aa550d.pdf
- Froehlich — Eco-Feedback Technology：https://vs.inf.ethz.ch/edu/HS2011/CPS/papers/froehlich10_eco-feedback.pdf
- NN/g — Alert Fatigue：https://www.nngroup.com/videos/alert-fatigue-user-interfaces/
- 20:60:20 electricity monitor 研究：https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3958409/

---

## 10. 一句话总结

**现在的 Usage Dashboard 是把 7 个 JTBD 中的 5 个错位投递了，且踩中 10 个反模式中的 6 个。重做不是 UI 调整，是把"一个面板"拆成"多个事件驱动载体 + 召唤命令 + 降级历史页"，并把每个数字配上可执行 verb 和 outcome 锚点。**

---

## 11. Mock 迭代决策（2026-05-29 追加）

> 本节是在 mock 包 `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/usage-dashboard-mockups-2026-05-29/` 迭代过程中沉淀下来的、对前面 §6 / §7 有约束力的具体设计决策。后续 spec 应直接采用这些定义。

### 11.1 Mock 包位置

- 6 屏 HTML mock + 共享 CSS + 简单 JS：`/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/usage-dashboard-mockups-2026-05-29/index.html`
- 文档：`/Users/zhangjike/code/my-code/mobius-highestpeak-kb/.obsidian/plugins/obsidian-peak-assistant/docs/gstack/usage-dashboard-mockups-2026-05-29/README.md`
- 验证截图：`/tmp/usage-mock-shots/` (本地，不入库)

### 11.2 MPG 指标正式定义

替代 §6.2 里"cost-per-useful-artifact"的笼统说法，固化两个具体 KPI：

| KPI | 公式 | 触发事件 |
|---|---|---|
| **Cost / saved artifact** | Σ (cost of calls that ended in a save event) ÷ count of save events，统计窗口默认 7d | `outcome.event_type` ∈ `vault_save` ∪ `copilot_accept` ∪ `agent_file_emit` |
| **Cost / useful click** | Σ (cost of search + rerank calls in window) ÷ count of search result open events | `outcome.event_type = search_click` |

**UI 呈现要求**：每张 MPG KPI 必须带一个 `ⓘ` help 图标 + 一行人话副标题（mock §1 / §3 已落地）。**没有 outcome 信号埋点 = 这俩 KPI 显示 "—"，不要假装有数。**

### 11.3 Funnel 形态：3 阶（不是 4 阶）

原 §6.2 里隐含 4 阶（Total / Useful / Lifted / Saved）。**`Lifted to artifact` 砍掉**——定义模糊，且和 "复制到剪贴板" 类信号需要 hook clipboard 才能可靠捕获。

正式定义：

| Stage | 定义 | 数据来源 |
|---|---|---|
| **Total calls** | 时间窗内所有 AI 调用 | `usage_log` 行 |
| **Useful calls** | 调用结束后 60 秒内有任意 outcome 事件 | `usage_outcome` JOIN `usage_log`，事件类型 ∈ {`vault_save`, `search_click`, `copilot_accept`, `continuation`} |
| **Saved artifacts** | 关联到 vault commit 的调用 | `usage_outcome.event_type` ∈ {`vault_save`, `copilot_accept`, `agent_file_emit`} |

`continuation` = 用户在 60s 内发了下一条 message（同一 session）。这是把"延续对话"也算作 useful 信号——是 BYOK 场景下最易获得的弱信号。

Funnel UI 必须配 "How we count this" 三行 `<dl>` 说明（mock §3 已落地）。

### 11.4 Outcome 事件分类法

把 §7 里笼统的 `usage_outcome` 表落实成具体 schema：

```sql
CREATE TABLE usage_outcome (
  id INTEGER PRIMARY KEY,
  message_id TEXT NOT NULL,        -- 关联触发它的 usage_log 行
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,        -- 见下表
  occurred_at INTEGER NOT NULL,    -- unix ms
  target TEXT,                     -- 视事件类型：vault path / search result path / file path
  metadata_json TEXT               -- 事件特定字段（点击位次、采纳的行数等）
);

CREATE INDEX idx_outcome_message ON usage_outcome (message_id);
CREATE INDEX idx_outcome_session_time ON usage_outcome (session_id, occurred_at);
```

`event_type` 枚举（不接受未列举值）：

| event_type | 触发点 | target 含义 |
|---|---|---|
| `vault_save` | 用户在 AI message 上点 Save / Copy to note | vault 文件路径 |
| `copilot_accept` | 接受 copilot 内联建议 | 被修改的文件路径 |
| `search_click` | 用户在搜索结果里点开一条 | 被点开的 vault 文件路径 |
| `agent_file_emit` | Agent 执行中产出文件并写入 vault | 写入路径 |
| `continuation` | 用户 60s 内发下一条 message | 下一条 message_id |

**Useful = ≥1 event；Saved = `event_type` ∈ {`vault_save`, `copilot_accept`, `agent_file_emit`}**。

### 11.5 "What was this about" 详情面板

History 屏（mock §5）的右侧详情面板，在 Token / Cost / Metadata 之前**先**展示"这次调用在干嘛"。**载体（panel）位置确认**，per-feature 内容渲染按下表 switch：

| feature | 展示内容 |
|---|---|
| `chat` | 顶部 breadcrumb（`chat → "session title" → turn N/M`）+ user prompt 前 200 字（蓝 accent 引用框）+ assistant response 前 200 字（绿 accent 引用框）+ Attached files + Tools used + "Open in chat" verb |
| `search` | query 全文 + top-3 检索结果（list）+ 哪条被点开（高亮）+ "Open in search" verb |
| `agent` | task goal + step N/M（带步名）+ 本步工具调用列表 + 上一步输出 1 行摘要 + "Open trace" verb |
| `copilot` | 文件路径 + selection 改动前后 diff 片段 + 是否接受 + "Open in editor" verb |
| `embed` | 被索引文档标题 + chunk 数 + 模型 |

**实现路径**：每个 feature 的具体字段约定写入 `usage_log.metadata_json`，schema 不动。

### 11.6 `usage_log.metadata_json` 字段约定（per-feature）

| feature | metadata_json 字段 |
|---|---|
| `chat` | `{ session_title, turn_index, turn_count, prompt_preview, response_preview, attached_files: [...], tools_used: [{name, count}] }` |
| `search` | `{ query, top_results: [{ path, score }], clicked_result?: path }` |
| `agent` | `{ task_goal, step_index, step_count, step_name, tools_in_step: [...], previous_step_summary? }` |
| `copilot` | `{ file_path, selection_before_preview, selection_after_preview, accepted: bool }` |
| `embed` | `{ document_title, chunk_count, embedding_model }` |

**所有 `*_preview` 字段统一截断到 200 字符**。

### 11.7 隐私策略

- **`*_preview` 字段是常态**：截断版进 `metadata_json`，DB 里永远只存截断版。
- **完整 prompt / response 不进 metadata_json**：用户点 "Show full prompt" 时，按 `session_id + turn_index` 实时回放 vault 里的 chat 持久化文件。
- **`usage_outcome.target` 存路径而非内容**。
- 用户可在 Settings → Usage 关闭 preview（落地为 `metadata_json` 只存数字字段，不存 preview）—— 新增 setting `usagePreviewEnabled: boolean = true`。

### 11.8 UI 设计原语（mock 验证过的）

固化为后续 React 组件实现时的形态约束：

| 原语 | 用途 | mock CSS class |
|---|---|---|
| **brand letter avatar** | provider 识别（O / A / G / R / P 字母 + brand 软色） | `.brand-av` |
| **inline table bar** | 表格 % 列内嵌横向 bar + 数值 | `.tbl-bar` |
| **horizontal bar list** | provider cost 等 4-column grid（`label / bar / $ / %`，**值永远在条外**） | `.hbar` |
| **KPI top-right action slot** | 每张 KPI 卡右上角的独立 verb 按钮 | `.kpi__action` |
| **savings dial** | 小型 ring + 文案，用于 "X% of recommended savings applied" | `.savings-dial` |
| **help affordance** | ⓘ 圆点 + native tooltip，定义型术语必带 | `.help` |
| **explainer panel** | `<dl>` 排版的定义清单（如 funnel "How we count this"） | `.explainer` |
| **numbered pager** | History 表分页 | `.pager` |
| **outline pill button** | Apply / Preview 等轻量行动 | `.btn--pill`, `.btn--pill-primary` |

### 11.9 UI 反模式（再确认一遍，mock 阶段踩过）

- ❌ 把 `$ value` 印在 hbar 内部 → 小条会截断。**永远外置**。
- ❌ button 元素不 reset 默认 background → 浏览器默认色透出来撞设计。任何自定义 button 都要 reset `background / border / padding`（mock 的 `.tog` 修过）。
- ❌ grid 列宽度小于子元素宽度（toggle 30px 塞在 18px 列里） → 子元素溢出吃下一列。**列宽必须 ≥ 子元素宽度**。
- ❌ 直接展示原始 token 数当 headline KPI → 时速表反模式。**所有 KPI 必须带 verb 或定义**。

### 11.10 §8.2 开放问题状态更新

| # | 原问题 | 当前结论 |
|---|---|---|
| Q1 | "Accepted artifact" 怎么定义？ | **已答**：见 §11.4，`event_type` ∈ {vault_save, copilot_accept, agent_file_emit}，皆是显式事件 |
| Q2 | Curator runtime 推送频率？ | 仍 open，进 spec 阶段决 |
| Q3 | 行内 receipt 是否默认开启？ | 仍 open |
| Q4 | Context ring 与现有 messages 视觉冲突？ | 仍 open，需要 chat-surface mock 验证 |
| Q5 | BYOK vs 自带 key onboarding default？ | 仍 open |
| Q6 | 详细历史面板是否保留全部图表？ | **已答**：保留并降级为二级入口（mock §5）；外加"What was this about" panel 让它真有 audit 价值（§11.5） |
| Q7 | MPG 指标统计窗口（默认 7d）是否可配置？ | **已答（2026-05-29）**：默认 7d 不暴露在 dashboard 上；settings 里允许切 30d / 自定义。涉及 §11.2。 |
| Q8 | `continuation` 信号的 60s 阈值是否合理？是否可配？ | **已答（2026-05-29）**：spec 阶段先以 60s 实施，shadow-log 几周后再回归校准；**不**暴露为用户可调参数。涉及 §11.4。 |
| Q9 | chat 详情面板的 prompt / response preview 截到 200 字符是否够？ | **已答（2026-05-29）**：prompt 200 字符 / response 400 字符（response 信息密度更高）；保留 "Show full prompt" verb 兜底。涉及 §11.5 / §11.6。 |
| Q10 | `continuation` 会不会把"重试 / 不满意"误算成 useful，导致 funnel 数字虚高？ | **已答（2026-05-29）**：走方案 (a) — 保留 `continuation`，过滤负向信号。**`continuation` 只在以下条件全部满足时记一条**：(1) 下一条 message 不是 regenerate / retry 按钮触发的；(2) 下一条 message 开头不含拒绝词 (`不对 / 再试 / 错了 / 不对的 / no / wrong / retry / nope` 等，词表写进 spec)；(3) 距离上一条 assistant message ≥ 10 s 且 ≤ 60 s。涉及 §11.3 / §11.4。 |

### 11.11 下一步

1. ~~Mock 阶段~~ ✅ 完成
2. 用户审本节的 §11.2–§11.7 决策；如无异议，进 spec 阶段
3. spec 阶段输出：
   - `usage_outcome` 表 DDL + 仓储
   - 每个 feature 的 metadata adapter（写入 `metadata_json` 时的字段保证）
   - "What was this about" 详情面板的 React 组件契约（输入：`usage_log` row + `metadata_json`；输出：feature-specific render）
   - Curator runtime "持续观察模式" 的输入输出 schema
   - PR 拆分（按 §6.3 优先级）
4. 实施时优先级仍按 §6.3
