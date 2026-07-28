# Peak Assistant 产品能力矩阵：六大能力现状 × 断点 × 离 smooth 的距离

> 2026-07-27。基于四份代码实地盘点（[audit-01](./audit-01-search-analysis.md) 搜索/分析、[audit-02](./audit-02-composer-ambient.md) Composer/Ambient、[audit-03](./audit-03-chatstudio-kernels.md) ChatStudio/内核、[audit-04](./audit-04-atlas-aux.md) Atlas/辅助面）+ git/progress 状态核查。分支 `codex/peak-modernization-refactor`（领先 master 378 commits，Composer wave 进行中）。测试基线：307/309 passed。

## 一、总览矩阵

| 能力 | 成熟度 | 一句话现状 | 最重断点 | 测试密度 |
|---|---|---|---|---|
| **1. General Search** | 🟢 生产可用 | 检索管线完整（5 retriever + RRF + PPR + boosts + 高亮），result-browser 三视图深度复用 | 索引新鲜度：启动不对账（`main.ts:1058` 硬关）+ fast/full 等级 → 结果可能过期/不全 | 厚（30+ 文件） |
| **2. AI Analysis / Vault Copilot** | 🟢 生产可用 | harness 真实、JSON 落库根治 OOM、历史可回放 | Sources 视图自写一套 List/Graph，不用 result-browser（双实现分叉、无 Tree） | 中（AIGraphAgent/V2SourcesView 零测试） |
| **3. Composer**（编辑器本体） | 🟢 生产可用 | 字节级 round-trip 架构扎实（8 golden fixture 全过），表格/图片/数学/拖拽/撤销/复制块完整 | 跨块选择回归不可用；`![[img]]` embed 不显示真图；两套图片 layout 格式互不识别 | 最厚（52 文件） |
| **3a. Document Copilot**（= block morph + sidecar 会话，**Composer 内能力**） | 🔴 断裂 | block 级指令 morph 真实可用；**但 sidecar 会话框发消息永远卡"assembling"（执行器未接，mark* 零调用）**——sidecar 就是 Document Copilot 本体，不是附属 | 全插件唯一"假可用"交互，违反自家 disabled-never-fake 纪律 | 状态机有测试，驱动器不存在 |
| **3b. Ambient push**（**新载体 = Composer Brief**；旧四载体为过渡态） | 🟡 桥未建 | 数据层完整（触发/混合信号搜索/去重/580 行集成测试）；Brief 壳已建、相关材料真实（vectorSearch）；**Ambient→Brief 的桥（ingestFinding producer）不存在**，Brief findings 恒空——即 progress.md 所记"无 Ambient-backed Brief 数据" | **触发层与新载体脱节**：AmbientEditorTrigger 监听 CM `editor-change`，Composer 是自绘视图不发此事件 → **在 Composer 里打字不会触发 ambient**；需要 Composer 原生触发源（事务提交流/输入活动） | 数据层厚，桥与 UI 层零 |
| **4. Atlas / Doc Switch** | 🟡 半成品 | Tree+Graph 两视图可用，但是 Modal（关即销毁），Phase 2/3 未做 | Tray "Send to Copilot" 永久禁用死按钮；图布局不持久化 | 薄（仅解析器） |
| **5. ChatStudio** | 🟢 引擎成熟 / 🔴 入口错位 | 流式管线完整（rAF 打字机 + 原子 commit + 1325 行消息渲染） | **ribbon 默认入口打开的是旧三 leaf 布局，不是 Studio**；两条壳并存；`copilot/` 25+ 面板组件无可达入口（孤儿 surface） | 中（10 文件纯逻辑） |
| **6a. Onboarding** | 🟡 假全绿 | 7 步向导 + Curator 真实调用 + 写回 HarnessSettings，测试全 | System Check / Ready-to-Try 汇总行硬编码"全绿"（PR-E 从未落地） | 厚（~1079 行） |
| **6b. Usage Dashboard** | 🟡 半接线 | 6 屏（不是 3 屏），Overview/信号数据真实（SQL + 规则/LLM 引擎） | Budget & Alerts 8+ 死按钮 + 写死金额；Optimization Apply 不落地 | 底层有，屏组件零 |
| **6c. Command Center** | ⚫ 已撤下 | meta-planner 代码+单测在，入口按治理决定移除 | 死代码路径（连同 openCopilotPanel 等 4 个孤儿函数） | service 有测试 |

共享内核现状：**ResultList（result-browser）**存在、2 host 消费、AI Analysis 未搭上；**Transcript** 不存在——消息渲染四套实现 0% 复用；**VoiceInput** 不存在（约定明确列为未来项，非遗漏）。

## 二、五个跨能力的系统性主题

1. **入口层是最大的系统性弱点（产品有肌肉、没有脸）**。ribbon 开旧布局；Chat Studio 只能靠命令；Quick Search 无 ribbon 无默认快捷键；Atlas 是阅后即焚 Modal；copilot 面板树无入口；Command Center 无入口。六能力各自能跑，但"从 Obsidian 日常动线自然进入 Peak"这条路几乎不存在——这正是走查框架里"入口"段全线失分的原因。
2. **"最后一公里不接线"模式**。UI 建好、数据源/执行器没接：sidecar 会话（执行器）、Optimization Apply（写回）、Budget 按钮群（onClick）、Atlas Send to Copilot（Phase 3）、Onboarding System Check（PR-E）、Phase D 诊断（TODO）。与 2026-07-09 AI Surfaces UI review 发现的"假状态/死按钮"病根同源，部分至今未清。
3. **双实现分叉**。消息渲染 ×4（ChatStudio/InsightInlineChat/CommandCenterModal/RunReceiptCard）、结果列表 ×2（result-browser vs V2SourcesView）、图片 layout ×2（pk- vs peak-）、chat 壳 ×2（Studio vs 旧三 leaf）、输入框 ×3（PromptInput ×2 + 裸 textarea）。每一处分叉都是未来"改一处忘一处"的事故点。
4. **索引新鲜度是搜索系能力的共同上游风险**。启动不对账（OOM 防御的合理代价）+ onLayoutReady 前事件丢失 + 5s 防抖 + Cascade 空闲回填滞后 + fast/full 两级——Search、AI Analysis、Ambient、Atlas Graph 全部下游受影响，而用户看到的表象只是"搜不到/不相关"。
5. **测试分布与风险倒挂**。引擎层（检索、composer 事务）测试极厚，恰恰是最不会坏的地方；UI 层、AIGraphAgent、Dashboard 屏、Ambient 呈现层零测试，恰恰是死按钮/假状态高发区。

## 三、修复优先级

### P0（走查前必修——都是"用户第一次认真用就会撞上"的）

| # | 事项 | 依据 |
|---|---|---|
| 1 | **Document Copilot 收口三件套（sidecar 即本体）**：① 会话执行器接通（mark* 驱动）；② Ambient→Brief finding producer（`ingestFinding` 接上 AmbientPushRuntime 信号）；③ Composer 原生 ambient 触发源（CM `editor-change` 在自绘视图内不触发，需挂事务提交流/输入活动） | audit-02 §3.2/§4 + progress.md"无 Ambient-backed Brief 数据"；3a/3b 两个能力的存在性都押在这三条线上 |
| 2 | **入口整顿**：ribbon 指向 Chat Studio（或可配置）；决定旧三 leaf 布局去留（保留则明确双形态定位，不保留则下线）；给 Quick Search 提示默认快捷键 | audit-03 §2；入口错位让最成熟的能力藏在命令面板后面 |
| 3 | **Usage Dashboard 死按钮群**：Budget & Alerts 8+ 个无 onClick 按钮——接线或摘除；Optimization Apply 落地写回或改为"复制建议" | audit-04 §3；违反 disabled-never-fake |
| 4 | **Onboarding System Check 接真实 readiness**（OverviewTab 已有 useProvidersReadiness/useIndexCoverage 可复用），或明示"示例" | audit-04 §2；新用户第一屏就是假的 |
| 5 | **Ambient 旧四载体去留决策**（RelatedNotes 侧栏 / gutter / 晨间简报 / 状态栏）：维护冻结、不再投入（含不做 Settings UI）；Brief 落地后其中三个走删除门。**晨间简报例外**——它是 vault 级 ambient（"今天该看什么"），不属于任何一篇文档，天然归宿是未来的 Command Center / HomePage，保留后路 | audit-02 §4；文档级 ambient 归 Composer Brief、vault 级归 Command Center 的双粒度拆分 |
| 6 | **copilot/ 面板树定去留**：接回入口或归档删除（连同 4 个孤儿函数） | audit-03 §7；25+ 组件的维护税不能白交 |
| 7 | **Atlas "Send to Copilot"**：做 Phase 3 或摘除按钮 | audit-04 §1 |

### P1（架构性收敛——对应共享内核决策）

- V2SourcesView 迁移到 result-browser（补 AI Analysis 侧 Tree 视图，消灭结果列表分叉）。
- Transcript kernel：从 MessageViewItem 抽取消息渲染层，InsightInlineChat 第一个迁入（顺带消灭裸 textarea）。
- 图片 layout 双格式统一（pk-/peak- 二选一 + 迁移）。
- 跨块选择回归修复（HANDOFF 合同项）。
- `![[img]]` embed 真图渲染（HANDOFF 合同项）。
- 索引新鲜度策略：轻量启动对账（mtime-only 扫描，避开全量读文件）或"索引可能过期"提示条。

### P2（能力补全，对齐深度调研结论）

- VoiceInput kernel（push-to-talk 形态，见 [deep-research](../2026-07-27-ai-editor-landscape-deep-research/README.md)）。
- Ambient 在 Composer 内的呈现按"八条设计宪法"设计（块级左侧徽标 + Brief 卡片；gutter 徽标形态已被产业验证）；vault 级 ambient（晨间简报类）待 Command Center / HomePage 立项时迁入。
- Atlas Modal → 持久 View + 图布局持久化。
- LLM rerank：暴露开关或删除（不留"看起来存在实则不可达"的路径）。

## 四、与走查框架的衔接

[README](./README.md) 第九节的五段式走查脚本（入口→输入→执行→产出→二次进入）现在有了逐能力的已知断点清单：走查执行时 P0 表就是预期失分点，走查的价值在于发现**这张表之外**的问题。建议顺序：P0 修复 → 真机走查 → gap 清单二轮 → P1 收敛。
