# AI 协作工作流效率诊断（Claude Code + Codex CLI）

日期：2026-07-28（同日二轮复查后修订）
性质：过程（meta-workflow）调研，不是产品功能调研。诊断对象是 owner 在 peak-assistant 项目上与 Claude Code / Codex CLI 的协作方式本身。

> 本报告分两部分：Part I 是首轮诊断（保留原文供追溯）；**Part II 是二轮全面复查**——补充首轮遗漏的证据维度，并对 Part I 的每条建议做多轮对抗评审（attack → 修订/保留/废弃），**最终建议以 Part II §8 为准**。

---

# Part I · 首轮诊断

## 0. 数据源与方法

| 数据源 | 规模 | 分析方式 |
|---|---|---|
| Claude Code 会话转录 | 61 个 jsonl，485.9MB，2026-06-24 → 07-28 | 流式解析：会话画像、真实用户消息提取（852 条）、纠错信号词挖掘 |
| Codex CLI 会话 | 285 个 jsonl，14GB，2026-03-11 → 07-28 | 流式解析：cwd/时间分布、任务分类、交接摩擦时间线 |
| git 历史 | 2026-05 起 908 commits；`codex/peak-modernization-refactor` 分支 390 commits | 提交节奏、fix 类占比、署名统计 |
| `docs/progress.md`（2653 行）、`docs/recurring-pitfalls.md`、Claude memory（43 个文件） | — | 返工词频、未 commit 频次、历史纠错记录 |
| 外部最佳实践 | Anthropic 官方 engineering blog / Claude Code docs、Addy Osmani、DORA、社区实践 | WebSearch 调研，来源见 §4 |

## 1. 证据画像（先看数字）

- **会话时长双峰分布**：61 个 Claude 会话中，21 个 <15 分钟（杂务型），**8 个 >24 小时**（最长 84h06m、50h41m、36h38m、36h30m、33h33m）。单会话转录最大 102MB；Codex 侧单文件最大 614MB。
- **纠错率**：852 条真实用户消息中 68 条是纠错/返工信号；重灾会话纠错率 13-22%（`0d223607` 22.2%、`b3e844c6` 21.1%、`fc38b823` 17.0%）。Codex 侧 82 个项目会话共命中 120 次纠错词。
- **返工词频**（progress.md）：纠偏 ×4、重做 ×6、复发 ×3、撤销 ×2、误判 ×2、回退 ×2、过早 ×1。fix 类 commit 占比约 15%（134/908）。
- **commit 纪律**：progress.md 的 18 个 session 条目里 **15 个标注"未 commit"**；曾出现 193 个文件改动零提交；本诊断时点工作树又积压 56 个文件（+2779/−383）；至少 4 个独立会话的唯一目的是"先提交一下"（补票）。
- **分支偏离**：`codex/peak-modernization-refactor` 自 06-12 起 390 commits，master 停在 06-11——六周半未回流。
- **署名分工实证**：该分支 390 个 commit 中 **79% 标 Co-Authored-By: Claude，1% 标 Codex**——"Codex 审计设计、Claude 写代码"的分工是真实存在的。
- **流程债**：96 份 spec + 98 份 plan（docs/superpowers/）、2270 行约定文档（ui-design.md 单文件 1215 行）；superpowers 子代理仪式已于 07-21 被 owner 叫停（"流程开销超过收益"）。
- **双规则册漂移**：项目 `AGENTS.md` 220 行 vs `CLAUDE.md` 103 行；AGENTS.md 含整词替换事故（"Factory pattern supporting **Codex**, OpenAI…"，应为 Claude）；Codex Collaboration Rules 与 Real-UI QA 协议只在 AGENTS.md 有全文。

## 2. 七个问题模式（按影响排序）

### P1 · 马拉松会话 + context rot——所有问题的放大器

**现象**：8 个 >24h 会话；一个大需求横跨 2-4 个会话才收口；Codex 侧长会话被迫"重放/续接"（06-27 新会话开场同一秒重放 217 条历史消息），用户带着"我不是说过了嘛"的语气重新确认上下文。

**机制**：Anthropic 官方明确 context rot 是真实机制——token 越多，模型回忆与判断的"注意力预算"越被稀释。失败方案留在上下文里会污染后续尝试：`fc38b823` 单会话 9 次纠错（"一点都没改啊你是毫不生效"→"很多 button 都不行"）、`83a3c694` 约一小时内 9 次"还是不行"（白屏循环），都是同一会话内越修越乱的典型。官方给出的硬阈值：**同一问题纠正超过 2 次 → `/clear` + 用吸取教训后的更精确 prompt 重来**，几乎总是优于带着纠错历史继续。

### P2 · "假完成 / 假 PASS"——视觉还原任务缺确定性验收 gate

**现象**：纠错量最大的类别是 UI/视觉保真度（三个会话合计 26+ 次命中）。典型：「等等你哪里忠实还原了...几乎完全不对应」；07-27 出现"首轮视觉通过判断错误 → 撤销 `PASS_WITH_NONBLOCKING_DIFFERENCES` → 二轮结构纠偏"，平均一轮视觉对齐要 5-9 个"还是不行"回合才收敛。

**机制**：官方定性最准——"Claude 会在**看起来完成**的时候停下。没有一个它能跑的 pass/fail 检查，'看起来完成'就是唯一信号，于是你自己变成 verification loop"。目前项目已有 geometry gate（49/49）、design fixture（5/5）、.dev/harness 截图链，但**像素/样式层面的 PASS 判定仍靠肉眼**，这正是假阳性的来源。业界成熟做法是把"看着不像"变成数值差：用 Playwright 对渲染结果跑 `getComputedStyle()` / `getBoundingClientRect()`，与参考稿数值逐项 diff，把"font-size 差 4px、padding 差 6px"直接喂给 agent 修。

### P3 · Claude↔Codex 人肉中转 + 角色边界反复拉扯

**现象**：owner 在 06-13 亲口点破「我经常反复在这里粘贴来和去」；06-26 再次抱怨「一次次去输入，这太浪费时间」；同一会话内至少 5 次重新裁决"这个任务到底给 Codex 还是 Claude"（06-27「不需要 claude 去调研」→ 06-28「该交给 claude 哪个?」→ 06-29「你不要让 claude 去做」）。06-29 把教训写进 AGENTS.md（Codex Collaboration Rules）只缓解了"prompt 粒度"问题，**结果回传仍靠人肉粘贴**（"这是 claude 的输出"）。07-21 owner 还在调研第三方桥接方案（YishenTu/claudian），说明痛点未解。

**机制**：Claude 的推理过程、被拒方案、踩过的坑不会自动到达 Codex 侧，全靠 owner 复述的"人工带宽"；角色规则写了文档但每任务仍需临场裁决，认知负担没有转移给系统。另有结构性维护成本：两本规则册（AGENTS.md / CLAUDE.md）手工同步已出现分叉与替换事故。

### P4 · 大批量交付：长期不 commit + 巨型长寿分支

**现象**：15/18 session"未 commit"；单 session 交付 193 个文件改动零提交；多个并行 session 共享同一个脏工作树（"并行 session 的 composer-sidecar docs 改动原样保留"）；390 commits 六周半不回 master。

**机制**：批量越大，返工代价越放大——一旦方向错（如首轮视觉 PASS 误判），推倒的是几十小时的自主工作而非一个小 commit；混在一个工作树里的多任务改动无法精确回滚（`/rewind` / `git revert` 都失去粒度）。DORA 量化数据：AI 采用率每 +25%，交付吞吐 −1.5%、稳定性 −7.2%，主因就是"AI 让大 diff 变容易，但批量大到 review 跟不上"。**AI 时代更需要小批量，而不是更能容忍大批量**。

### P5 · 防御性指令通胀——教训没有制度化，每次靠临场重申

**现象**：跨 6/27 → 7/26 整月、5 个独立会话，扫描到 19 处防御性前置声明：「不要停在计划或静态 mock」「不要只写 spec」「不要 revert」「Owner 已明确授权立即实施」「不要再拆成小回合」。睡前委派会话两次几乎逐字重复同一段开场白。

**机制**：每一条反复手打的防御性指令，都是一个"已知失败模式没有被固化进规则文件"的证据。这些教训散落在临场 prompt 和 Claude memory 里——而 owner 自己定过的规则恰好点破要害：**"任务/计划状态只写仓库文件，别的 coding 工具看不到 Claude 记忆"**。同理，行为规则只有进了仓库内的 CLAUDE.md/AGENTS.md 才对两个工具同时生效。

### P6 · 模型路由无默认策略，且有实际用错的代价

**现象**：委派会话开场都要手写「你先规划接下来的任务使用什么模型 opus 还是 fable」；`b3e844c6` 事后发现生产级实现全程用了 fable 而非 opus，明确投诉「你要善于使用 opus4.8 来完成任务啊」。

**机制**：任务复杂度 → 模型选择之间没有稳定的自动映射（全局 CLAUDE.md 有一张表，但执行不稳定、且和"fable 只做规划"的 memory 规则分散两处），每次靠人裁决，裁决失误时整段实现质量打折。

### P7 · 补丁式修复 → 同类问题复发

**现象**：`83a3c694`「刚才不是有一次都好了嘛 为什么你又改了不行了」；recurring-pitfalls.md 里 `:where()` 特异性塌陷标注"已知陷阱复发"；boot 链 UI 注册问题历史上重复多次；07-23 OOM 排查烧掉一整天、枪毙十几个候选理论后，最终命中的是 owner 的直觉"是我们的某个产物"。

**机制**：pitfalls 登记册已经是很好的资产（9 个 bug class、症状→机制→预防清单），但"debug 前先查册"目前只存在于 Claude memory，Codex 看不到、Claude 也非每次执行；OOM 案例还揭示假设排序问题——"我们自己最近生产/改动了什么"应该排在候选理论最前面。

## 3. 改进方案

### P0 —— 立刻可做、杠杆最大

**1. 会话三条铁律**（写进项目 CLAUDE.md + AGENTS.md，不再靠临场记忆）：
- 同一问题纠正 >2 次 → 停止在原会话里继续修，`/clear`（或新会话）+ 把失败教训写成更精确的新 prompt。
- 探索/规划与实现物理分离：spec 定稿后**开新会话**做实现（干净上下文 + 书面 spec 对照，正对"探索垃圾混进实现上下文"的 100MB 会话根因）。
- 任务切换必 `/clear`——杜绝 kitchen sink 会话。

**2. commit 存档点纪律**：一个能用一句话描述的任务 = 一个 commit（feature 分支上，build/test 绿后立即提交）。agent 侧默认行为改为"task 完成即主动 commit"，不再等 owner 说"先提交一下"。同时给 modernization 分支定回流节奏：每完成一个 WP/里程碑就 merge 回 master，不让偏离量继续涨。

**3. 视觉还原验收数值化**：在既有 .dev/harness + geometry gate 基础上，补一个"参考稿 vs 实现"的 computed-style/geometry 逐项数值 diff 脚本，规定**视觉类任务的 PASS 只能来自脚本输出，禁止肉眼 PASS**（人只做最终审美确认，不做逐项比对）。这是对纠错量最大类别（P2）的结构性修复——把 5-9 轮"还是不行"压缩成一轮数值报告。

### P1 —— 本月内落地

**4. Claude↔Codex 文件握手替代人肉粘贴**：固定一个 handoff 目录（如 `docs/handoff/`），约定：Codex 的审计/设计产出写成文件，Claude 开工第一步读该文件；Claude 完工后 Codex 直接读 **git diff**（而不是读 owner 的转述）做独立 review。角色一锤定音并写进两本规则册：**Claude = builder，Codex = 只读 reviewer/auditor**；review 收敛后用全新上下文做一次终审（防"改着改着觉得这样也行"的 sycophancy）；并明确 reviewer 只报 correctness / 需求 gap，其余标 optional——防 review 通胀导致过度工程。

**5. 统一规则源**：把 AGENTS.md 与 CLAUDE.md 的共享正文（Build/Architecture/Storage/Conventions 指针）收敛为单一来源，两个文件只保留各自工具特有段落（或脚本生成两份）；顺手修掉 "supporting Codex" 替换事故；把目前只在 AGENTS.md 的 Real-UI QA 全文与只在 Claude memory 的行为规则（debug 先查 recurring-pitfalls、改完主动 build、生成文件去向等）统一落到仓库文件。

**6. 模型路由写死默认值**：项目 CLAUDE.md 固化一条规则（例如：生产实现/复杂 debug = opus；规划/审计/编排 = fable；机械执行/测试 = 低档模型），委派会话使用固定模板文件（把两次逐字重复的"睡前仪式"开场白沉淀成 `docs/handoff/dispatch-template.md`），不再每次手写。

### P2 —— 结构性优化

**7. 跨会话/跨工具进度快照瘦身**：progress.md（304KB）是好的历史流水账但太大，不适合作为每会话开场必读。增设一个 <100 行的 `docs/handoff/NOW.md`（当前 phase、在飞任务、阻塞点、下一步），任何工具的任何新会话先读它 + 最近 git log 即可接力——这是 Anthropic 长跑 agent harness（progress file + feature list）的最小实现。

**8. 委派任务批量瘦身**：睡前无人值守委派保留（它符合工作节奏），但每批任务的验收标准前置写清（每个任务一个可判定的 done 条件），并要求 agent 每完成一个任务 commit 一次——醒来验收的对象从"一大坨工作树"变成"一串可单独回滚的 commit"。

**9. debug 假设排序规则化**：把 OOM 事件的教训固化为 debug 开场清单第一条——"先列出我们自己最近生产/改动了什么"（自产 artifact、新 onload 步骤、新依赖），再考虑外部理论；配合"debug 前 grep recurring-pitfalls.md"一起写进仓库规则文件。

### 有意不建议的方向

- **不建议**恢复 superpowers 式多层子代理仪式——owner 07-21 的叫停判断与业界经验一致（常规任务流程开销 > 收益；并行 agent 实践上限 2-4 个）。
- **不建议**追求全自动 Claude↔Codex 桥接工具链——文件握手 + 读 diff 已消除 90% 的人肉带宽，自动化桥接的维护成本目前不划算。

## 4. 外部来源

- [Effective context engineering for AI agents（Anthropic）](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) — context rot 机制与 compaction / note-taking / sub-agent 三种对策
- [Best practices for Claude Code（官方文档）](https://code.claude.com/docs/en/best-practices) — 纠正两次即 `/clear`、kitchen sink 反模式、Explore→Plan→Implement→Commit、"展示证据而非断言成功"、对抗式复核
- [Effective harnesses for long-running agents（Anthropic）](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) — progress file + feature list 的跨会话 handoff
- [How Claude Code works in large codebases（Claude blog）](https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start) — 分层 CLAUDE.md 渐进加载
- [My LLM coding workflow going into 2026（Addy Osmani）](https://medium.com/@addyosmani/my-llm-coding-workflow-going-into-2026-52fe1681325e) — commit 即存档点、"永远不要提交你解释不了的代码"
- [Agentic AI Coding: Best Practice Patterns（CodeScene，引 DORA 数据）](https://codescene.com/blog/agentic-ai-coding-best-practice-patterns-for-speed-with-quality) — 批量大小与交付稳定性
- [Pixel-Perfect UI with Playwright and Figma MCP](https://vadim.blog/pixel-perfect-playwright-figma-mcp/) — computed-style 数值 diff 喂给 agent
- [Visual Regression Testing in the Age of AI UIs（Augment Code）](https://www.augmentcode.com/guides/visual-regression-testing-ai-generated-uis) — Detect→Mask→Classify→Review 分层视觉回归
- [Automating the Claude Code × Codex Review Loop（SmartScope）](https://smartscope.blog/en/blog/claude-code-codex-review-loop-automation-2026/) — 交叉审查三级成熟度与防 sycophancy 终审
- [Git Worktrees for AI Coding（MindStudio）](https://www.mindstudio.ai/blog/git-worktrees-parallel-ai-coding-agents) — 并行 agent 硬隔离与 2-4 个上限
- [Trust, But Verify 五阶段模式](https://theitsolutionist.com/2026/07/18/trust-but-verify-a-five-stage-pattern-for-working-with-claude-code-to-build-basic-modern-web-applications/) — Plan→Critique→Implement→Mechanical Check→Acceptance

---

# Part II · 二轮全面复查与对抗评审

## 5. 首轮遗漏的证据维度（补充调查结果）

### 5.1 测试红灯正在增殖（首轮完全漏掉，证据最硬的新发现）

本次实测 `npm run test`：**5 failed / 339 passed**。progress.md 07-27 记录是"307/309，仅 `chat-studio-message-state-ui` 与 `code-block-theme-settings` 两个**既有失败**"——即当前未提交的工作树又新增了 3 个失败（`composer-architecture-source-guards`、`composer-frontmatter-inline-tag-candidate`、`composer-inline-candidate-placement`，全部对应在飞的 composer 改动）。

机制：一旦"2 个既有失败"被常态化，测试输出就从二值信号（绿=可交付）退化为需要人工解读的模糊信号——agent 和人都要记住"哪几个红是可以忽略的"，新增的红灯就混在噪音里溜进来。同类噪音容忍还有：tsc"既有噪声不变"、Browserslist 过期提示。**破窗效应在这个仓库不是理论，是正在发生的事实。**

### 5.2 progress.md 自身已结构性腐化

首轮只读了文件尾部，误以为它是整齐的流水账。全文结构实际是：顶部混着 07-20/07-21 的条目（prepend）→ `## Phases`（43 个已完成 Phase 的巨表，单行最长 900+ 字）→ `## Next`（三个不同日期的 "0. Active" 小节并存）→ `## Log` → `## Completed Work (2026-04-18)` → `## 已完成计划` → **第二个** `## Log` → 尾部按日期 append 的 session 条目。同一份文件里至少混了四代组织方式，新条目有时前插有时后追。它作为"每 session 开场必读的定位文件"已经失效——304KB、无稳定入口点，这正是各会话开场要靠用户重新口述上下文的原因之一。

### 5.3 "CSS 没生效"9 轮循环的根因不是上下文腐化，是环境验证缺失

首轮把 `fc38b823` 的 9 轮纠错归入 context rot 证据。复查 recurring-pitfalls.md §3 发现更精确的解释：**插件 CSS 不热重载**（"Cmd+R does NOT reload the plugin's bundled CSS，必须 disable+re-enable"），且该文档明确建议"UI 里放 v1/v2/v3 marker 先确认最新 build 真的加载了再继续 debug"。也就是说，"一点都没改啊你是毫不生效"的循环里，相当一部分轮次烧在了**改动根本没被加载**上——这是 QA 前置检查缺失，`/clear` 解决不了它。同类环境摩擦还有：computer-use 陈旧帧（截图与 computedStyle 矛盾）、macOS 录屏权限阻塞、popout 窗口 modal 开错窗、DevTools 抢焦点——记忆库里有 4 条独立记录，说明环境预检问题反复烧掉 QA 轮次。

### 5.4 规则系统内部存在活的矛盾

- **模型分工 vs 仪式禁令**：memory `model-division-fable-opus`（07-17，"实施派 opus subagent"）与 `no-superpowers-ceremony`（07-21，"不要派子代理，直接干"）互相拉扯。后者自称覆盖前者"用于常规工作"，但"常规工作 vs 大规模编排"的边界没有定义——而 07-21 当天 owner 一边叫停子代理仪式、一边投诉"不要全用 fable 要用 opus"，两个诉求只有通过"轻量单个实施 subagent ≠ 仪式"的区分才能同时满足。这个区分至今没有写下来，agent 每次都在赌 owner 想要哪种。
- **Claude 会话从不主动 commit 的直接原因找到了**：Claude Code 的默认约束是"用户不叫就不 commit"。owner 从没在仓库规则里写"checkpoint commit 已预授权"，于是 15/18 session 零提交 + 4 个专门"补票"会话是**默认行为的必然结果**，不是 agent 偷懒。修复只需一行书面授权。
- 双规则册（AGENTS.md/CLAUDE.md）漂移已在 Part I §2-P3 记录，此处不重复。

### 5.5 首轮没有说的：这套工作流做对了什么（必须保留的资产）

公平的复查必须承认体系的强项，避免"改革"误伤：

- **产出量惊人**：Phases 表 43 个已完成 Phase、roadmap #done 82 行、两个月 908 commits——这套"dispatcher + 无人值守 wave"模式的吞吐是真实的，诊断目标是降返工率，不是推翻模式。
- **诚实文化**：progress.md 里"诚实标 PARTIAL""不用占位数据掩盖""撤销过早视觉结论"——假 PASS 最终被抓住，靠的就是这个文化。它是体系的免疫系统。
- **recurring-pitfalls.md 与 guard test 模式**：9 个 bug class 的"症状→机制→预防清单"登记册,以及"规则入册 + 架构 guard test 锁住"的做法（palette allowlist 测试、composer source guard 测试）是业界少见的好实践——**"把散文规则升级为机械强制"这条路在本仓库已被证明有效**，应该扩展到工作流规则本身。
- **conventions 指针化**：项目 CLAUDE.md 已经是"一行指针 → 详细文档"结构,符合分层加载最佳实践,不需要推倒。

### 5.6 其他补充观察

- **规划库存 vs 实施带宽**：roadmap #decided 20 项待建 + #backlog 17 项 + 96 份 spec。owner 的验收带宽（每天能认真 review 的产出量）才是系统瓶颈——继续放大 agent 吞吐只会加深"生成 > 验收"的堆积，7/27 假 PASS 正是验收队列过载的症状。
- **开发环境与生产 vault 同体**：插件开发直接在真实知识库 vault 内进行。07-23 OOM 事件里，插件自产的 1139 个 vault 文件把 Obsidian 本体搞崩、烧掉一整天——QA fixture（组件画廊、mock 会话）也持续写入真实 vault。爆炸半径没有隔离。
- **近数据损失**：记忆库记录过"误删 gitignored 目录靠旧 transcript 恢复"——gitignored 的 .dev/ 资产没有任何备份机制。

## 6. 对 Part I 建议的对抗评审（反复 judge）

逐条 attack，结论分：**保留 / 修订 / 降级 / 废弃**。

### R1 会话三铁律（纠正 2 次即 /clear；探索与实现分会话；任务切换必 /clear）

- **Attack A**：马拉松会话有相当部分是无人值守 wave，`/clear` 纪律管不到。→ 部分成立：抽查最大会话（0836f2a0，25h42m，542 条真实用户消息）确认交互密集型马拉松真实存在，铁律对这类适用；对无人值守型，对应物是"每任务独立会话"（派发模式本来就支持）。
- **Attack B**：重开会话的成本不低（重新加载上下文、重新读代码），而 progress.md 已腐化（§5.2），没有廉价的"接力入口"，`/clear` 纪律会因为重启太贵而被放弃。→ 成立。**R1 依赖 R7'（进度快照修复）先行**，顺序不能反。
- **Attack C**：9 轮"没生效"循环的根因是环境验证缺失（§5.3），换新会话带着同样的盲区照样循环。→ 成立。R1 只防"越修越乱的复利"，不防"第一轮就在修一个没加载的 build"。
- **判定：保留但降权**——从"核心修复"降为"止损机制"，且必须与 N5（QA 环境预检）和 R7'（快照）捆绑。

### R2 commit 存档点纪律

- **Attack A**：owner 的习惯是"自审后提交"（progress.md 原话），agent 自动 commit 侵犯审查权。→ 修订：agent 在**工作分支**上打 checkpoint commit（不 push、不碰 master），owner 的审查单位从"一坨 193 文件的工作树"变成"一串可单独 revert/squash 的 commit"——审查权不减，粒度变细。
- **Attack B**：Codex wave 明明产出了 390 个 commit，说明"会 commit"，问题没那么大？→ 反驳不成立：390 commits 是 Codex 侧行为；Claude 侧 15/18 session 零提交的直接原因是默认约束 + 从未书面授权（§5.4）。两侧行为差异恰恰证明这是**规则问题不是能力问题**，一行授权就能修。
- **Attack C**：多个并行 session 共享脏工作树时，checkpoint commit 会互相打架。→ 成立，补充：并行 session 必须各用 git worktree 隔离（业界并行 agent 的标准做法，上限 2-4 个），否则串行。
- **判定：保留并升级**——加"书面预授权"与"并行必须 worktree"两个精确化。

### R3 视觉还原验收数值化（computed-style diff gate）

- **Attack A（最致命）**：7/27 假 PASS 发生时 geometry gate 49/49 是绿的、design fixture 5/5 是绿的——**数值 gate 已经存在且全绿，照样假 PASS**。失败的不是"没有数字"，而是（a）gate 测的是"建成之物的几何自洽"，不是"与设计稿的相似度"；（b）PASS 判定由**写代码的同一个上下文**做出——运动员兼裁判，且它已经"想要"通过。再加一个脚本解决不了 (b)。→ 基本推翻原建议的机制设计。
- **Attack B**：真实 Obsidian 里截图比对本身不可靠（陈旧帧事件有记录）。→ 成立：像素/样式层比对应放在 .dev/harness 浏览器渲染里做（该基础设施已存在且被验证），真实 Obsidian 只负责交互/环境证明——这与项目自己的 obsidian-real-ui-qa 约定完全一致，首轮建议反而违背了它。
- **修订后的方案（R3'）三件套**：
  1. **裁判独立**：视觉 PASS 判定必须由一个**全新上下文**（未参与实现的会话/子代理，或 Codex 侧）拿"实现截图 + 设计稿"并排逐区域出"匹配/接近/偏离"表——tool-collaboration.md 复刻模式本来就要求这张表，失效原因是让实现者自己填。
  2. **首屏先行**：任何多屏/多组件视觉 wave，先做**一个**代表性屏幕并交 owner 确认后再展开其余——7/27 的教训是系统性理解偏差（shell 结构错）复制到了全部产出，首屏 gate 能把返工半径从"整个 wave"缩到"一个屏"。
  3. **数值 diff 作为辅助**：token 级数值（字号/间距/圆角）在 harness 里跑 computed-style 对比，作为独立裁判的证据输入，不作为 PASS 的充分条件。
- **判定：大幅修订**——核心从"加脚本"改为"裁判独立 + 首屏先行"。

### R4 Claude↔Codex 文件握手

- **Attack A**：handoff 文件其实已在用（`docs/superpowers/plans/*-handoff.md`），此建议是不是已经存在？→ 部分成立：**去程**（设计→实现的 handoff）已制度化，缺的是**回程**——实现结果回到 Codex 靠 owner 粘贴"这是 claude 的输出"。修订：回程标准化为"Codex 直接读 git diff + harness 截图目录"，owner 只发一句"去看 diff"。checkpoint commit（R2'）是回程的前提——没有 commit，diff 就没有稳定边界。
- **Attack B**：角色是否该固定为"Claude=builder，Codex=reviewer"？6-7 月证据显示角色其实已稳定（79% vs 1% 署名），拉扯发生在**边缘任务**（调研给谁、小修给谁）。→ 修订：不需要重新发明分工，只需把**已经稳定的分工 + 边缘任务的默认路由**写进两本规则册，消除每次临场裁决。
- **判定：修订保留**——重心从"建握手"移到"补回程 + 固化路由"。

### R5 统一规则源

- **Attack**：指针/import 的可靠性——CLAUDE.md 支持 `@file` import，AGENTS.md 无官方 import 机制；让任一方做纯指针都有被忽略的风险。→ 修订为务实版：共享正文（Build/Architecture/Conventions 指针/协作分工）单独成文，CLAUDE.md 用 `@` import 引入；AGENTS.md 因无 import 机制保留内联副本,但文件头加"本节由 <共享文件> 生成/同步，勿单独编辑"标记 + 一个 5 行的 diff 检查脚本挂进 `npm run build` 或 guard test（本仓库已验证 guard test 模式有效，§5.5）。
- **附带必做**：修掉 AGENTS.md 的 "supporting Codex" 替换事故；清理记忆矛盾对（§5.4），把裁决结果写进仓库规则。
- **判定：保留**，机制精确化。

### R6 模型路由写死默认值

- **Attack A**：全局 CLAUDE.md 的模型表**已经存在**，还是被违反了——再写一遍有什么用？→ 关键修订：失败根因不是"没写"，而是（a）两条 memory 互相矛盾（§5.4），agent 无所适从；（b）"主循环模型"只有 owner 能选（/model），agent 侧只能通过 subagent 路由兑现"用 opus 干活"，而 subagent 恰好被仪式禁令冷冻。修复 = 在仓库规则里写清三行裁决："仪式（多 agent brief/review 回环）默认禁止；**轻量单实施 subagent 派 opus 不算仪式，Edit/Write 密集任务默认这么做**；探索/审计用低档模型"。同时删除/改写矛盾 memory。
- **Attack B**：模型用错只有一次显式投诉，是否高估了优先级？→ 成立，降为中优先级；但因为修复成本极低（写三行 + 删两条 memory），性价比仍高。
- **判定：修订保留，降优先级**。

### R7 新增 NOW.md 快照

- **Attack**：给"文件太多"的体系再加第 4 个状态文件，与"流程债"诊断自相矛盾；且 progress.md 的真问题是自身腐化（§5.2），加新文件是绕着病灶走。→ **废弃原方案**，替换为 **R7'：修复 progress.md 本身**——顶部固定一个有界的 `## NOW` 节（当前 phase / 在飞任务 / 阻塞 / 下一步，硬上限 ~50 行，每次 session end 重写而非追加），其下才是 append-only 的历史条目；把 Phases 巨表、双 Log、"已完成计划"等历史断层归档到 `docs/progress-archive-2026H1.md`。零新文件，入口唯一。
- **判定：废弃→替换**。

### R8 委派任务批量瘦身 / R9 debug 假设排序

- Attack 无实质命中。R8 补充一个上限依据：批量大小 ≤ owner 次日能逐项验收的量（验收带宽是系统瓶颈，§5.6）。R9 维持：debug 开场先答"我们自己最近改/产出了什么"+ grep recurring-pitfalls.md，写进仓库规则。
- **判定：保留**。

### 对"有意不做"清单的复查

- 不恢复 superpowers 仪式：**维持**，但精确化——R3' 的"独立裁判"是单次、只读、无回环的验证步骤，不属于被叫停的仪式范畴；无人值守大 wave 收尾时它的开销/收益比最好。
- 不建全自动桥接：**维持**（R4' 的读-diff 回程已消除主要人工带宽）。

## 7. 二轮新增建议（首轮遗漏）

- **N1 · 测试零红灯政策（本周最优先）**：先修或显式 quarantine 当前 5 个失败（2 个遗留 + 3 个本轮新增），使 `npm run test` 恢复二值信号；规则一行："红灯时不得宣称任何任务 done，不得开始新任务"。这是所有"agent 声称完成可信吗"问题里最便宜、最机械的那一半。tsc 既有噪声同理，逐步清零或显式豁免清单化。
- **N2 · QA 环境预检清单**：真实 Obsidian QA 每轮开始前跑固定三问：build 时间戳比改动新？插件已 disable+re-enable（或版本 marker 可见）？目标窗口/主题/权限就绪？——固化为 obsidian-real-ui-qa.md 里的一个前置小节 + 可选的一个预检脚本。直接针对"9 轮没生效"这类最冤枉的返工。
- **N3 · 验收带宽即规划上限（WIP limit）**：在飞的"已实现待 owner 验收"工作不超过 N 个（建议 2）；#decided 库存冻结新增，直到在飞项清零。dispatcher 模式保留，但派发速率对齐验收速率。
- **N4 · 爆炸半径隔离**：开发/QA fixture 默认落在一个 sandbox vault（真实 vault 只装稳定构建做 dogfood + 性能验证）；`.dev/` 等 gitignored 资产纳入 Time Machine/简单 rsync 备份。防的是 OOM 级"环境全灭一整天"和近数据损失的重演。
- **N5 · 散文规则机械化的持续通道**：凡是被违反 ≥2 次的工作流散文规则，升级为 guard test / build 检查 / hook（本仓库已有成功先例）；反过来，凡是三个月没被引用过的约定条文，归档瘦身。规则总量守恒，强度上移。

## 8. 修订后的最终建议（以此为准，按 杠杆×置信度÷成本 排序）

| # | 建议 | 对症 | 置信度 | 成本 |
|---|---|---|---|---|
| 1 | **N1 测试零红灯**：修/隔离当前 5 红，"红灯不 done、不开新活"入规则 | 假完成、破窗 | 高（红灯增殖已实证） | 极低 |
| 2 | **R2' checkpoint commit 预授权** + 并行 session 必须 worktree 隔离 | 大批量返工放大、脏树互扰 | 高（因果链完整） | 极低 |
| 3 | **R3' 视觉验收三件套**：裁判独立（全新上下文出对比表）+ 首屏先行 gate + harness 数值 diff 辅助 | 最大返工类别 | 高（7/27 事故直接检验） | 中 |
| 4 | **N2 QA 环境预检清单**（build 加载确认 / 插件重载 / 窗口权限） | "没生效"型冤枉轮次 | 高（pitfalls 已有半成品） | 极低 |
| 5 | **R7' progress.md 修复**：顶部有界 NOW 节 + 历史断层归档 | 跨会话/跨工具接力贵 | 高 | 低 |
| 6 | **R1' 会话止损纪律**：交互纠正 2 次即重开（带教训重写 prompt）；探索与实现分会话；依赖 #5 先行 | 上下文腐化复利 | 中高 | 低（习惯成本） |
| 7 | **R5' 规则单源化** + 修 "supporting Codex" 事故 + 清理矛盾 memory + **R6' 三行模型裁决**（仪式禁止 ≠ 单实施 subagent 禁止） | 规则漂移、路由歧义 | 高 | 低 |
| 8 | **R4' 回程标准化**：Codex 读 git diff + 截图目录做 review，owner 不再当传输层；边缘任务默认路由入册 | 人肉中转 | 中高 | 低 |
| 9 | **N3 WIP limit**：在飞待验收 ≤2，#decided 冻结新增 | 验收带宽过载→假 PASS | 中 | 低（心理成本高） |
| 10 | **R8'/R9' 派发模板**（每任务 done 条件 + 每任务 commit）+ debug 开场两问 | 委派返工、排查绕路 | 中 | 低 |
| 11 | **N4 sandbox vault + .dev 备份** | 环境全灭、数据损失尾险 | 中 | 中 |
| 12 | **N5 规则机械化通道 + 条文瘦身** | 散文规则失效的系统病 | 中高 | 持续小额 |

**首轮建议的最终处置**：R1 降权保留、R2 升级、R3 机制推翻重设、R4 重心迁移、R5/R6 精确化、R7 废弃替换、R8/R9 保留、"有意不做"维持并精确化。

**一条元结论**：这套体系的病根不是"缺规则"——恰恰相反，规则很多、写得也好，但（a）关键规则留在临场 prompt 和 memory 里而非仓库，（b）散文规则没有机械强制,（c）验收判定与实现共用同一个上下文。三个病根都指向同一个方向：**把"应该怎么做"从自然语言层面下沉到机械层面（授权行、guard test、独立裁判、二值信号），让规则不再依赖任何一方的记性和自觉。**
