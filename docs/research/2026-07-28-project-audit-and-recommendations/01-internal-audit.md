# 01 · 内部审计原稿：文档体系 / Spec 语料 / 执行现状

> 三个只读审计代理（Opus 5）的完整发现。evidence 均为审计时点（2026-07-28）的文件位置或 git 命令，signal 为该代理的证据强度自评。

## 一、文档体系审计

**Headline**：三文件分工在纸面清晰但实际已双向越界——progress.md 停摆 6 天且退化成任务看板，roadmap #decided 里至少 4 项已完成或已废弃却未迁移，六大功能中 3 份根目录正稿（01/02/12/16）落后于代码 3 周以上，最活跃的 Composer 工作流在三份登记文件里几乎不可见。

| 发现 | 细节 | 证据 | 强度 |
|---|---|---|---|
| progress.md 已停摆 6 天，62+ commit 无流水记录 | 最后条目 2026-07-27；07-22(1)/07-24(7)/07-25(25)/07-26(29) 的 commit 无对应条目；今日 roadmap/index/planned-requirements 三份都改了，progress.md 零改动 | docs/progress.md:2590；git log --since=2026-07-20 | 强 |
| roadmap 两处「未 commit」已与事实相反 | #done Chat Studio 行写「零缺口未 commit」、#decided Chat Runtime 行「built · 未 commit」；实际已由 8d18281c(2026-07-22) 落盘 | docs/roadmap.html:156、:260-262；git log -1 8d18281c | 强 |
| T12 Command Gateway 已完成却仍挂「已决策待建」 | roadmap 说「剩余：main.ts 命令换 gateway.dispatch(id)」，但 main.ts 自 2026-07-03 即该形态，progress B1 条目也记为完成；滞留 3.5 周 | docs/roadmap.html:271-274 vs main.ts:465-487、docs/progress.md:109 | 强 |
| Quick Search UI Polish 同时躺在 #done 和 #decided | #done 记 W1-W8 全交付且 owner 否决 `+ Link`；#decided 仍把「Inspector 徽章重构 + `+ Link`」列待做 | docs/roadmap.html:155 vs :325-328 | 强 |
| AN/AO/AP 行把状态托管给一份已死的 progress 待办板 | roadmap 标「landed 未验证」指向 progress Next §Pending；该段引用的 DebugCommandActions.ts 已删除，要验证的命令已不存在 | docs/roadmap.html:313-316 → docs/progress.md:241-261 | 强 |
| 三文件分工被双向越界 | progress.md 内嵌 9 个「### 0.」任务看板段（97-290 行）干 roadmap 的活；planned-requirements 反向承载两个已有正式 spec 的能力，AI Graph 卡与 roadmap #decided 重复且内容不等 | docs/progress.md:97-290；docs/planned-requirements.html:185-204 vs docs/roadmap.html:295-299 | 强 |
| Command Palette 治理约定与代码差一条命令 | 约定声明六项 owner-approved，代码 PALETTE_COMMAND_MANIFESTS 有 7 项（peak-open-document-composer，64d958ba 加入）；allowlist 测试同步了，约定文档没同步——违反其自身「同一变更中更新本清单」条款 | docs/conventions/command-palette-governance.md:25-33 vs src/app/commands/gateway/manifests.ts:131-139 | 强 |
| 16 号 Document Copilot 正稿的入口已不存在 | 10 处教用户「Command Palette → Open Copilot」，该命令 2026-07-23 下线，src/ grep 零命中 | docs/16-feature-document-copilot.html:194/:391/:413/:574/:752 vs docs/progress.md:2567 | 强 |
| 12 号 Search 正稿停在 2026-07-07 | 零提 Tree view / Heading mode / Result Graph / Cytoscape preset / Refine；仍称第二 tab 为「AI Analysis」（10 处），07-09 已改名 AI Search | docs/12-feature-search.html:196/:217/:259 vs docs/roadmap.html:155 | 强 |
| 01/02 架构正稿漏掉全部最活跃子系统 | 两份停在 2026-07-03，Composer / Chat Studio / Media / File Atlas / JSONL 零提及；02 目录职责表缺 src/{app,service}/composer、media、file-atlas、capabilities、usage | docs/01-architecture.html、docs/02-code-organization.html vs `ls src/service src/app` | 强 |
| index 把没建成的 Command Center 当产品能力入口 | 「六大功能→辅助设置」下有功能描述并链 2026-05-14 spec、无状态标记；roadmap 标 planned (spec only)，openCopilotCommandCenter 全仓零调用方 | docs/index.html:280 vs docs/roadmap.html:307-310、src/app/commands/PeakCommandActions.ts:347 | 强 |
| 最活跃的 Composer spec 族在三份登记文件里近乎不可见 | 6 份 spec（07-14/07-15 sidecar/07-22×2/07-24 modularity/07-28 agent-runs）在 roadmap/index/progress 零登记；#decided 里 Composer 只有一行 | docs/superpowers/specs/2026-07-{14,15,22,24,28}-*.md；docs/roadmap.html:283-287 | 强 |
| spec-and-tests 约定在 07-15 后的新 spec 上全面失守 | 七份新 spec 验收段零 test 文件路径；07-07/07-09/07-21 三份老 spec 分别有 2/8/7 条；仓库已有 69 个 composer 测试可引 | docs/conventions/spec-and-tests.md:22-28 vs 七份 spec | 强 |
| conventions 完全不覆盖 Composer 架构约束 | app-owned runtime、无 module 级单例、禁按 presentation label 分派、CM/Chat Composer 保护域四条硬约束只活在 guard 测试文件头注释 | docs/conventions/README.md:25-32 vs test/composer-architecture-source-guards.test.ts:1-13 | 中 |

**Open questions**：recurring-pitfalls.md 要不要进 index 索引；8 份未登记 research 目录是漏登记还是本就属 mock（需补「research/ 下什么算调研」判定）；File Atlas 要不要补根目录正稿（现指向仍在改的 spec）；HANDOFF.md 作为第四份状态文件的定位与退场条件；File Atlas vs File Workspace 命名口径（commit 5132b4f5 改名 host 但 src 目录仍叫 file-atlas）；roadmap #done 出现「session-in-progress」等 session 级措辞是否统一清洗。

## 二、Spec 语料审计（92 份）

**Headline**：Composer 八件套与 Provider 五件套是两处真正的雷区——状态标注整体失效（仅 16 份有 supersede 标注、5 份已上线仍写 Draft），07-28 新契约只回写 3 份漏掉 Sidecar，modularity 提议目录与已落地代码分叉，Provider v2 与当前依赖和 roadmap 方向完全相反却仍被 10 份文档引用。

| 发现 | 细节 | 证据 | 强度 |
|---|---|---|---|
| Composer 系列没有有效根索引，唯一 map 已过期 | 07-22 map 零提 07-28 两份新 spec 与 file-workspace/keyboard；07-09 父文档只前向指向 07-15/07-22 | specs/2026-07-22-peak-composer-related-document-map.md:44-58 | 强 |
| Generation History 契约未同步 Sidecar spec，直接矛盾 | 07-28 §9 只更新 block-AI/modularity/JSONL；sidecar:319 仍写 pending/rejected 留 session cache 永不入 History，:410 用 rejected 非 not-adopted | specs/2026-07-15-composer-intelligence-sidecar-ui.md:319,356,362,410 vs 07-28 §3.4/:508-517 | 强 |
| modularity §8.3 所有权表与 07-28 持久化要求冲突 | §5.4 已加 07-28 指针，§8.3 仍把 candidate variant 标 session cache、ProposedChangeSet 标 transient | specs/2026-07-24-…modularity-architecture.md:445 vs :672-682 | 中 |
| modularity 提议目录与已落地生产代码不一致 | §6.2/§6.3 提议 service/composer-capabilities/ 与 ui/view/composer/capabilities/ 均不存在；实际在 service/composer/capabilities/ 与 packs/；照 spec 执行会建重复树 | 同上 :507-551 vs src/service/composer/capabilities/packs/ | 强 |
| 三份 Composer spec 状态严重滞后于已交付实现 | roadmap 记 13 生产 track 已集成；07-09 仍称 static mock、07-15 sidecar 22 个 checkbox 全空、07-24 称 pending | docs/roadmap.html:283-286 vs src/app/composer/capabilities/ | 强 |
| Provider v2 spec 与代码及 roadmap 方向相反，仍被 10 份文档引用 | v2 称移除全部 @ai-sdk/* 统一走 Agent SDK query()；package.json 仍有 7 个 ai-sdk 依赖，roadmap 反向要退役 Agent SDK 直连；v1 仍标 Approved | specs/2026-04-11-provider-system-v2-design.md:1-20；package.json；docs/roadmap.html:265-266 | 强 |
| 04-18 AI Graph Agent 已被 07-28 平台 spec 取代未标注 | 07-28 §4/§17 把 v2GraphJson、path-as-identity 列为 legacy 迁移源；04-18 无 Status 行、零 inbound 引用 | specs/2026-04-18-ai-graph-agent-design.md vs 07-28:85-92,688-712 | 中 |
| AI Capability Gateway 是悬空前向引用 | file-workspace §14.4 让能力挂 Gateway 并声明能力 ID；specs/ 无任何 Gateway 定义，只有 roadmap 一行 backlog | specs/2026-07-24-peak-file-workspace.md:871-882 | 中 |
| 四套并行 capability 注册模型同时在设计 | core CapabilityManifest / ComposerCapability / FileSurfaceManifest / AIGraphCapability 各自建栈，违反 modularity §0「不得引入第三套 runtime」 | modularity:46；file-workspace:579-615；ai-graph:651-680 | 中 |
| File Atlas 与 File Workspace 的 surface 边界未仲裁 | 两者都定义左侧文件轨/打开入口/AI sidecar；互相几乎零引用 | specs/2026-07-08-file-atlas-design.md:660-707 vs file-workspace:105-150 | 中 |
| spec+tests 约定：验收段尚可、test 清单普遍缺失 | 25 份 7 月 md spec 中 18 份有验收段、仅 8 份列 test 路径；bad-case 复现仅 2 份 | conventions/spec-and-tests.md:53-63 | 强 |
| Status 字段整体失效 | 92 份仅 16 份带 supersede 标注；05-01 批五项已有生产代码仍标 Draft；07-21 头称 not started、附录记 1139/1139 迁移完成 | specs/2026-05-01-ambient-push-design.md:3 vs src/service/ambient/；07-21:4 vs :568-580 | 强 |
| 旧 Copilot 面板四份 spec 描述已无入口的死代码 | 04-24/05-07/05-10/05-17 均围绕 CopilotPickerModal 等；roadmap 记面板 10,092 行无入口；四份均未标 superseded | specs/2026-05-17-copilot-meta-agent-redesign.md:5-6；roadmap:241 | 中 |
| 孤儿 spec 与 review 文档错放，目录缺 index | 6 份零 inbound；audits/ 已存在却有 4 份 review HTML 留在 specs/；index.html 仅索引 9/92 | specs/2026-05-18、2026-05-30 等 | 中 |

**Open questions**：Composer 八件套合并成 canonical + 附录还是分册+带冲突规则的 index；候选状态词全库统一（not-adopted vs rejected vs 还原）；modularity 目录提议改现状还是迁代码；Provider v2 是否正式作废及五件套取代链重排；AI Capability Gateway 是否先落独立 spec；Atlas/Workspace 是同一 shell 两投影还是两产品；07-03 audit Part A/B 是否已有 owner 决定；specs/ 引入统一 front-matter + 自动 index。

## 三、执行现状审计

**Headline**：项目实际风险不在代码质量而在交付流程——378 个 commit 未合入 47 天未动的 master、当日全部产出零 commit 悬在工作树（含被 import 的 untracked 源文件），测试基线三版互斥，收口全部卡在 owner 本人才能做的 QA#2 上，同时又已开出三条新战线。

| 发现 | 细节 | 证据 | 强度 |
|---|---|---|---|
| 全天零 commit，当日产出只存在于工作树 | 最后 commit 2026-07-27 20:22 (5a74b969)；工作树 115 条 dirty：81 个 tracked +6678/−1537 + 34 条 untracked | git log -1；git status --porcelain | 强 |
| untracked 的 src 模块已被 tracked 代码 import | briefState.ts / openWritingMoves.ts / sourceVisualProjection.ts / visibleSegments.ts / streamFrameCoalescer.ts / BriefView.tsx 均 untracked，被 IntelligenceRuntime.ts、CopilotView.tsx、ComposerCandidateHost.tsx 等 import；clean/stash 即不可恢复断构建 | src/service/composer/intelligence/briefState.ts 等 | 强 |
| 分支领先 master 378 commit，master 47 天未动 | master=origin/master=4fa5bd2b (2026-06-11)；累计 diff 2044 文件 +343689/−41687；事实主干已迁移但无人宣告 | git rev-list --left-right --count | 强 |
| HANDOFF.md 自身未 commit，且自陈 worker 读不到它 | +1103 行 dirty；§6 写明由 5a74b969 派生的 worktree 看不到当前版本，要求二选一但均未执行 | HANDOFF.md:262-267 | 强 |
| 测试基线存在三个互斥版本 | progress 记 309、HANDOFF §8.1 记 317、工作树实际 321 个顶层 .test.ts（12 个 untracked） | docs/progress.md:2635；HANDOFF.md:709-711 | 强 |
| 2 个既有失败长期红，不修也不隔离 | chat-studio-message-state-ui、code-block-theme-settings 约定「不得顺手修」但无隔离机制，红基线掩盖新回归 | HANDOFF.md:713-718 | 中 |
| 旧路径删除门 NO-GO，三对双路径无限期并存 | legacy Copilot 28-action dispatch / actionResultToArtifacts() / ReviewPanel.handleFix() DocPolish 直调，均因活跃 caller 判 NO-GO 且无退场条件 | docs/progress.md:2622-2631 | 中 |
| 96 项需求终表 61 COMPLETE / 35 PARTIAL，判据挂在未发生的 QA#2 | PARTIAL = 只有 harness/fixture/headless 证据；8 项即使自动化绿也需 owner QA#2 升级；禁止因视觉 commit 自升 | plans/2026-07-27-peak-composer-implementation-note.md:237-247 | 强 |
| QA#2 完全依赖 owner 在场 | 真实 provider 凭据、bitmap/clipboard、中文 IME、drag、detached/dark/125%、设备矩阵均需真机人工；凭据阻塞已挂一周以上 | docs/progress.md:2643-2648、:24 | 强 |
| Brief related=0 的可疑根因：SearchClient 空窗静默降级 | related 端口注释写明「SQLite 初始化前降级为空」，safeGetSearchClient() catch 后返回 null；OOM 修复把索引重活 gate 到 layout-ready 放大了空窗。属可验证假设非定论 | src/app/composer/composeDocumentComposerRuntime.ts:52-64,132-134 | 中 |
| 运行时产物写进插件源码根目录且未 gitignore | telemetry/composer-intelligence.jsonl（435 行仍在写）与 composer-comments/ 均 untracked 且不在 .gitignore | composeDocumentComposerRuntime.ts:48-50；git check-ignore 无命中 | 中 |
| AGENTS.md 与 CLAUDE.md 规则分叉，两份都未 commit | AGENTS.md 缺 .dev/、Docs&Research Workflow、primitive-usage 等六条；:37 provider 列表被误替换、:45 仍旧 shadcn 表述 | AGENTS.md:37,45,52-57 vs CLAUDE.md | 中 |
| 11 个 worktree + 30 余分支 + 6 条陈年 stash 无人回收 | 4 个 composer-parity worktree 在 /private/tmp（重启即丢）；分支 commit 是否已 cherry-pick 进 HEAD 无从判断（后续评审实测：worktree 全 clean、共享 ODB，风险为「盲区」而非丢失） | git worktree list；git branch -a -vv | 中 |
| 旧 wave 未收口即开新战线 | 三份 07-28 spec 均标 Decided·Implementation pending + 4 个 research 目录 + 1 个 gstack 原型全部 untracked；Composer wave 仍 PARTIAL + QA#2 未做 | specs/2026-07-28-*.md；git status | 中 |

**Open questions**：写权归属（codex 独占写 + 定期 checkpoint、claude 只读？）；是否接受先打无证据 WIP checkpoint；master 定位（巨型合并 vs 切 default branch）；telemetry/composer-comments 落盘位置裁决；QA#2 能否切片（非 owner 项自动化）；related=0 是否已被今日未提交的 briefState 处理；两个失败测试的处置（修/删/显式 quarantine + 机器可校验 baseline）；三份 07-28 spec 是否冻结排期。

## 四、已有调研摘要（作为外部调研的去重基线）

已定案、本轮不再重复检索：七条第一性公理；六项产品决策裁决表（自建 Composer ✅ / chat UI 复用 ✅ / 不做 DQL ✅ / 皮肤市场不做 ✅ / Terminal 窗口仍开 / 语音 push-to-talk 定案）；ambient push 八条设计宪法；生态取代/结合三层裁决；六能力=6 个可独立关闭窄插件+共享内核；自建 editor view 三条硬约束（字节级 round-trip / 禁用后纯文本可用 / 复用同一份 CM6）；六能力代码级现状基线（capability-matrix.md）；Smooth 量化方案；AI Graph 外部标准映射（RDF/SKOS/Wikidata/Web Annotation/PROV/GraphRAG）。

已知信息空白（本轮外部调研的目标）：CSP+单 bundle 下开源 chat UI 案例；Bases API 能力边界；Terminal/中文分词等衍生立项；AI Graph 六项实现前验证；打扰等级分类法；证据薄弱三处（Cursor 估值单源二手、「少于 20 插件安全线」买家指南口径、主动式语音综述仅读到摘要）。
