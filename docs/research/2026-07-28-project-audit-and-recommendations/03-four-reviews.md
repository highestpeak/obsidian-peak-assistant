# 03 · 四维评审全文：产品战略 / 功能设计 / 文档体系 / 执行风险

> 四个评审代理（Opus 5，高推理强度）拿全量内部盘点 + 外部调研后的裁决。打分为 0-10。
> **注**：owner 于同日复议三处（Chat 保留为稳定管道 / File Atlas 修断点继续做深 / Usage Dashboard 保真删假），最终行动以 [README 的复议记录](./README.md) 为准；下文为评审原始记录，保持原样。

## 一、产品战略评审

**总裁决**：六能力不是一个组合，是三个真能力（Composer / Ambient / AI Analysis）拖着三个负债（Chat Studio / Atlas / Usage Dashboard）。护城河不在架构——Reflect Open 已把同款架构开源——而在「ambient 提议 + 块级来源 + 可回放证据链」，但它今天完全是纸面的：ingestFinding 与 sidecar 执行器双双零调用。投入结构 100% 是单作者自用，而 manifest 仍冒充 Obsidian 官方、24MB bundle 依赖 external native 模块：公开发布不是补几项，是独立立项；低成本 v0 应是导出 SKILL.md + MCP 而非上架商店。

### 打分

| 项 | 分 | 理由 |
|---|---|---|
| 能力1 General Search（检索管线） | 7 | 管线完整（5 retriever+RRF+PPR）且是另四能力共同上游；但本身 table stakes，官方 CLI 也有 search。价值全押在「索引不崩不过期」——而启动不对账目前硬关 |
| 能力2 AI Analysis / 深度检索报告 | 8 | 生态近乎空白（最大竞品 10,616 下载），已生产可用 + JSONL 落库根治 vault 污染。风险：引用事实性随工具调用掉约 42%，未设上限即失信源 |
| 能力3 Composer 自绘编辑视图 | 7 | 字节级 round-trip + 8 golden fixture 是真资产，同类全 <1 万下载说明门槛真高。但 InlineAI/Smart Composer 已用原生 CM6 做 diff 审阅，「自绘」的可感知增量尚未论证 |
| 能力3a Document Copilot（sidecar 会话） | 5 | 战略上是 Composer 存在的理由（Script&Shift RCT 支持进入式过程视图），实现上是全插件唯一「假可用」：mark* 零调用、发消息永远 assembling。概念 9 分、交付 2 分 |
| 能力3b Ambient push（Composer Brief） | 8 | 全生态真空（最大竞品 191 下载）+ 学术已给触发器命中分层。但 ingestFinding 零调用、自绘视图不发 editor-change，桥根本不存在 |
| 能力4 File Atlas / Doc Switch | 3 | 六能力最弱：Modal 阅后即焚、图布局不持久、Send to Copilot 死按钮，Atlas 与 File Workspace 命名未仲裁、两份 spec 互不承认。取代 Recent Files 属零差异化收益 |
| 能力5 Chat Studio | 4 | 引擎成熟但战场已失：Claudian 7.7 个月 154 万下载 MIT 免费、Copilot v4 内嵌 opencode。自建 chat UI 只能算管道；ribbon 默认入口至今指向旧三 leaf 布局 |
| 能力6a Onboarding | 3 | 7 步向导+Curator 真实写回，工程完成度不低；但 System Check 硬编码全绿，且 Onboarding 只在公开发布场景有价值——而公开发布结构性不可行，属定位错配投入 |
| 能力6b Usage Dashboard | 2 | 6 屏、8+ 死按钮、写死金额、Apply 不落地。BYOK 单作者可直接看厂商控制台，ROI 近零，是 disabled-never-fake 纪律最大破口 |
| 能力6c Command Center | 1 | 已撤入口，openCopilotCommandCenter 全仓零调用方，index.html 仍当产品能力介绍。代码与文档双向残留，只剩维护税 |
| 差异化护城河强度 | 4 | Reflect Open 已开源同款架构；真身只剩「ambient 提议+块级来源+可回放证据链」三层叠加——今天全是零调用 |
| 与官方演进的对齐度 | 5 | 官方定案不做内建 AI、只做 agent 可读 vault；Peak 尚未导出任何 SKILL.md/MCP 入口，反而在 Terminal（红海）与 Bases 视图（官方吞并中）留有立项 |
| 公开发布就绪度 | 1 | manifest 是 sample 模板（author=Obsidian）、main.js 24MB、better-sqlite3/playwright external 需目标 vault 有 node_modules、telemetry/ 未 ignore、无 release 流程 |
| 投入结构与定位匹配度 | 5 | 引擎层测试极厚、UI 层零测试与「自用重深度」一致；但 Onboarding/皮肤/Dashboard/Command Center 全是公开发布才需要的投入。378 commit 未合、master 停 47 天，两个定位都不成立的中间态 |

### 建议

| 优先级 | 动作 | 依据 |
|---|---|---|
| P0 | 修 manifest.json 四字段（sample 残留冒充官方）+ .gitignore 补 telemetry/ 与 composer-comments/ | 商标事故 + 交互日志误提交风险（对照 Copilot brevilabs 事件反噬强度） |
| P0 | 打 WIP checkpoint commit（含 6 个被 import 的 untracked 源文件 + 12 测试） | 一次 git clean 即不可恢复断构建；证据悬空时谈战略无意义 |
| P0 | Document Copilot 三件套排成唯一主线：sidecar 执行器接通 mark*、ingestFinding 接 AmbientPushRuntime、Composer 补原生 ambient 触发源 | 护城河三层零调用=纸面；不做则自绘编辑器没有对抗 InlineAI 的理由 |
| P0 | 三份 07-28 spec 标 "frozen until Composer wave = COMPLETE"，停止实现类投入 | 单人 + owner 独占 QA 门的吞吐撑不住；AI Graph 另有 LinkQ 反向证据 |
| P1 | 块级 provenance 产品化：markdown 内纯文本可见标记（禁用后仍可读）+「6 天后来源回放」视图 | AI Memory Gap 37.7%；用户已自发 quarantine；竞品无一具备且成本极低 |
| P1 | SQLite 索引崩溃安全：增量重建 + 损坏检测 + 过期提示条；启动不对账代价显式化 | Copilot/SC 共同致命伤，四能力共同上游，可感知差异最大单点 |
| P1 | 六能力导出 SKILL.md 能力包 + Peak MCP server（search / analysis artifact / composer transaction 三入口）作公开发布 v0 | 官方路线已定；寄生比对抗便宜，绕开商店审核/native/能力披露三道墙 |
| P1 | Usage Dashboard 砍到 Overview 一条成本条：删 Budget 死按钮与写死金额、删 Optimization Apply | ROI 近零 + disabled-never-fake 最大破口 |
| P1 | Chat Studio 冻结新投入：ribbon 默认入口改指 Studio、下线旧三 leaf、删 src/ui/view/copilot/ 25+ 无入口组件 | 生态最商品化一层，旧壳只交维护税 |
| P1 | 写 ADR 落定官方关系：不做通用 Bases 视图；Peak Sheet 不托管 Bases，仅写回 frontmatter 供其消费 | BasesEntry=文件、无写回、不认 inline field；254 个 Bases 插件正被官方吞并 |
| P1 | Terminal / Agent CLI 集成正式撤项，移 #backlog 标 declined | 103 个同类、Claudian 免费碾压。六能力里唯一确定打不赢的战线 |
| P1 | 价值主张与北极星改写：「想得更清楚 + 留得住」；指标=编辑后留存率 + 自我效能双测，删采纳率主指标 | Script&Shift 质量无差异 + Authorship Drift 信任/效能反向 |
| P2 | AI Analysis 设工具调用上限 + 引用抽检（核不上标「未验证」） | 事实准确率随调用数掉 42%；最无对手的能力也最怕一次翻车 |
| P2 | 公开发布 go/no-go 备忘：四项结构性阻塞写清，明确当前定位单作者自用 | 停止在仅公开发布才需要的面上投入 |

## 二、功能设计评审

**总裁决**：八项里只有 JSONL 存储和 07-28 两份新 spec 达到可执行标准。真正的问题不是设计不好，而是设计层已落后于代码层：Composer 八件套没有有效索引、sidecar 与 07-28 契约直接矛盾、modularity 的目录提议会让人照着建一棵重复树。更严重的是两处空洞——ambient push 八条宪法（生态唯一真空白、最大差异化赌注）至今只活在一份 research README 里，唯一的 ambient spec 触发器恰好违反宪法第一条；三共享内核里 VoiceInput 在 src 中零命中。同时 File Workspace 以 1223 行三 workspace 的体量抢在 Composer wave 仍 PARTIAL 时开战线，是最差的复杂度/收益比。

### 打分

| 设计 | 分 | 裁决要点 |
|---|---|---|
| Peak Composer 总体 | 7 | round-trip 真落地（composer-source-roundtrip.test.ts 断言 reconstruct(parse(src))===src）、块协议被 Tiptap/BlockNote 收敛验证；但 modularity 目录分叉、sidecar 契约未同步、八份 spec 无索引 |
| Ambient push 落地设计 | 2 | 宪法零 spec 承接；唯一 ambient spec（05-01 Draft）§3.2「cursor idle ≥5s after ≥30 chars」正是宪法第一条禁止的打字流中触发；UI 右栏 panel 非 gutter 两档；无 why-now/双模态/冷启动。而 src/service/ambient/ 已有 8 文件在跑 |
| AI Graph artifact platform | 6 | 外部锚点最硬、验证矩阵与不做清单齐备；但 LinkQ 反向证据零回应（confidence 全文一处）、无工具调用上限、§18 六项验证全未做、引入第四套 capability 注册模型违反 modularity §0 |
| JSONL 机器记录存储 | 8 | 结构最完整：现状→布局→合同→事件边界→五阶段验证回滚→测试矩阵→风险→被拒方案→验收；dual-write+shadow replay 纪律罕见；外部三重独立验证。扣分：compaction/retention 推给「后续」、无快照阈值、无 upcasting |
| 三共享内核 | 2 | ResultBrowser 生产存在但属事后追认无 contract spec；Transcript 仅 chat-view 内部；VoiceInput src 零命中。三内核是「六窄插件共享内核」叙事的全部承重结构，现在是空的 |
| Peak File Workspace | 4 | 边界判断正确，但 1223 行三 workspace 齐上最差复杂度/收益比；与 File Atlas 完全重叠未仲裁；引入第三套注册模型；悬空引用未定义的 AI Capability Gateway |
| 键盘导航系统 | 7 | 抽象层级正确（F6/Tab/方向键/Escape 逐层退栈）；§16.3「失败即阻塞」六项是八项里最可执行的验收；与既有约定严丝合缝。扣分：无 test 清单、依赖未仲裁的 File Atlas |
| Shared AI instruction composer + agent runs/generation history | 8 | 论证最诚实（先 file:line 指证当前链路截断处再给契约）；「步骤可见≠展示 CoT」「未采用/失败不得无声消失」正击最尖锐信任缺口。扣分：§9 漏回写 sidecar、无 test 清单 |

### 建议

| 优先级 | 动作 |
|---|---|
| P0 | sidecar spec :319/:356/:362/:410 改引 07-28 §3.4；全库 rejected/丢弃/还原 统一替换为 not-adopted |
| P0 | modularity §6.2/§6.3 目录改写为现状路径；§8.3 candidate variant / ProposedChangeSet 改指 Generation History |
| P0 | 新建 2026-07-28-ambient-push-landing-design.md 承接八条宪法；05-01 标 superseded 并显式作废 idle-in-typing 触发器 |
| P0 | guard 测试补两条 + conventions 新增 composer-architecture.md：插件禁用后文件纯文本可用；复用同一份 CM6 禁 import 第二份 |
| P0 | round-trip 测试补「块编辑 writeback → 重 parse → 语义等价」闭环；golden fixture 扩到 table/image/callout/math/native/link 六类块 |
| P1 | 新建 Composer canonical index（替代过期的 07-22 map，附冲突优先级规则） |
| P1 | AI Graph spec 增「反过度信任」节：低 confidence 强制视觉降级+抽检提示+不一致暴露；抽取 run 设工具调用上限与引用校验（引 LinkQ 与 Cited but Not Verified） |
| P1 | JSONL spec 把 compaction/retention 提为正式设计节（summary sidecar fold 规则、upcasting、「N 条 record 后 replay 不阻塞」测试项）；文首状态与附录对齐 |
| P1 | 裁决 Atlas/Workspace 边界与命名；file-workspace 拆 Image 先行 + HTML/PDF 独立立项；删 §14.4 悬空 Gateway 引用 |
| P1 | 裁决四套 capability 注册模型收敛；或先落独立 Gateway spec 再三处引用 |
| P1 | 三内核收口：ResultBrowser 补 contract spec；VoiceInput 落 push-to-talk spec 或降 backlog；Transcript 明确是否抽共享层 |
| P2 | 七份新 spec 验收段补 test/*.test.ts 路径（引仓库已有 69 个 composer 测试） |
| P2 | 键盘导航排期后置到 Composer wave COMPLETE；本轮只落 §16.3 六项 guard test |
| P2 | specs/ 统一 front-matter，首批处理 04-18 AI Graph Agent、Provider v2 五件套、旧 Copilot 四件套 |

## 三、文档体系评审

**总裁决**：制度设计合格，执行已系统性失效。三文件分工写得比多数团队清楚，但 progress.md 停摆 6 天/62 commit 无记录，roadmap #decided 16 行里 4 行与事实相反，83 份 md spec 中 63 份连 Status 行都没有，34 个 research 目录只登记 5 个（15%）。唯一真正诚实的是 96 项需求终表的 PARTIAL 纪律。结论：不是文档写得不够多，是登记闭环从未被强制执行——现在最缺的不是新文档，是一次裁决加一条能被测试守卫的登记规则。

### 打分

| 项 | 分 | 理由 |
|---|---|---|
| 三文件分工 — 制度设计 | 8 | 职责表 + 状态迁移条件在 CLAUDE.md 与 roadmap #update-rule 双写，罕见完整；扣分在无机器校验 |
| 三文件分工 — 实际执行 | 2 | progress 停摆 + 内嵌 9 个任务看板段，双向越界 |
| roadmap 状态快照准确度 | 2 | #decided 16 行 4 行失效（T12 / Chat Runtime / Quick Search / AN-AO-AP） |
| 根目录正稿时效性 | 3 | 20 份 HTML 中 7 份停 07-03；12 号落后三批发布；16 号 10 处教已下线命令 |
| spec status 纪律 | 1 | 83 份 md 仅 20 份有 Status；全库唯一显式 superseded 是 07-06 那份 |
| spec 索引与可发现性 | 2 | index.html 只链 9/92；Composer map 过期；4 份 review HTML 错放 specs/ |
| spec 跨份契约一致性 | 3 | 07-28 §9 漏 sidecar；modularity 目录与代码分叉 |
| spec+tests 约定执行 | 3 | 07-15 后七份验收段零 test 路径 |
| research 落库纪律 | 8 | 34 个目录格式统一、复杂主题拆册一致、带学术锚点 |
| research → roadmap 登记闭环 | 1 | 登记率 15%；07-27/07-28 四份最重要调研全部未登记 |
| 状态语言诚实度 — PARTIAL 纪律 | 8 | 96 项终表明写判据并禁自升，全项目最硬纪律，值得推广到 roadmap |
| 状态语言诚实度 — roadmap 层 | 4 | 「session-in-progress」「零缺口未 commit」等 session 级/过期措辞充当里程碑 |
| conventions 覆盖完整度 | 5 | 6 条质量高；零覆盖 Composer 四硬约束/三 kernel/round-trip/登记闭环；自身与代码差一条 Palette 命令 |
| 冷启动导航（新读者 10 分钟） | 3 | index 骨架好但指路错：Command Center 当能力入口、File Atlas 指向在改的 spec、recurring-pitfalls 不在索引、HANDOFF 是影子状态文件 |

### 建议

| 优先级 | 动作 |
|---|---|
| P0 | 83 份 spec 加统一 front-matter；首批硬裁决：05-01 五件套+07-21 标 shipped；旧 Copilot 四件套指向 07-14 chat-studio-positioning、04-18 指向 07-28 ai-graph 标 superseded |
| P0 | Provider v2 标 superseded（写明 package.json 7 个 @ai-sdk 依赖与 roadmap 反向证据），五件套补 supersedes 链，修 10 份引用文档指向 |
| P0 | roadmap #decided 四行清洗（T12 迁 #done / Chat Runtime 改 shipped 8d18281c / Quick Search 删重复行 / AN-AO-AP 改指可验证载体或降 backlog） |
| P0 | progress.md 补记 07-22~07-28 62 commit（或改约定为 git log 清单 + 人写 what/why）；9 个内嵌任务板段迁 roadmap 或删除 |
| P0 | 修 16 号正稿 10 处死入口（Open Copilot → peak-open-document-composer），grep 全 docs/ 一并替换 |
| P0 | 新建 specs/INDEX.md（92 份按 status 分组，每行=文件+status+一句话+取代关系）；4 份 review/handbook HTML 迁 audits/ |
| P1 | Composer canonical index（升级 07-22 map + 冲突优先级规则）；顺手全库统一 not-adopted |
| P1 | 回写 07-28 契约两处遗漏（sidecar 四行 + modularity §8.3/§6.2/§6.3） |
| P1 | 34 个 research 目录批量补 roadmap 登记（先补 07-27×3 + 07-28）；#update-rule 补「research/ 什么算调研」判定 |
| P1 | 新增 conventions/composer-architecture.md（guard 测试五条硬约束成文）+ CLAUDE.md 加指针 |
| P1 | 新增 conventions/shared-kernels-and-roundtrip.md（三 kernel 复用规则 + 自绘视图三硬约束） |
| P1 | 新增 conventions/docs-registration-loop.md + test/docs-registration.test.ts（三断言：research 登记 / spec status / index 链接，纯文件扫描可实现） |
| P2 | 更新 01/02 目录职责表（补 composer/media/file-atlas/capabilities/usage）；更新 12 号（Tree view/Heading mode/Result Graph/Refine + AI Analysis→AI Search 改名） |
| P2 | 三处定位裁决写进 #update-rule：HANDOFF 迁 docs/ 设退场条件；Atlas vs Workspace 定名并统一 src 与 docs；index 的 Command Center 加 planned 标记或移出，recurring-pitfalls 入索引 |

## 四、执行风险评审

**总裁决**：项目最大风险不是代码质量，是「无备份的单点」。115 项 dirty 里含 6 个已被 tracked 代码 import 的 untracked src 模块，一次 git clean 即不可恢复断构建；telemetry/ 与 composer-comments/ 未 gitignore 且当日仍在写，随时被 git add -A 误提。同时 78 万行改动堆在领先 master 378 commit 的分支上，master 47 天未动。收口侧更糟：82 条 brief_refreshed 遥测只带一个 revision hash、零 related 事件——related=0 在数据上根本不可诊断，却挂在只有 owner 在场才能做的 QA#2 上。先止损、再补可观测性、最后才谈六能力走查。

### 打分

| 项 | 分 | 理由 |
|---|---|---|
| 未提交工作丢失风险 | 2 | 115 dirty；6 个 untracked 模块已进 import 图 |
| master 与分支策略 | 1 | master 停 2026-06-11；HEAD 领先 378 commit；事实主干迁移无人宣告 |
| 运行时产物落盘卫生 | 2 | telemetry/、composer-comments/ 均无 check-ignore 命中；pluginDir 即仓库根 |
| Brief related 可观测性 | 1 | 遥测 399 finding_ingested + 82 brief_refreshed，related 相关记录 0 条 |
| related 端口失败可区分度 | 2 | 三条降级路径（无 client / 无 focusText / vectorSearch 抛错）全部静默返回空快照 |
| 测试基线可信度 | 3 | 309 / 317 / 321 三个互斥数字并存 |
| 两个长期失败测试处置 | 3 | 不修也无隔离，红基线掩盖新回归 |
| T6 三双路径处置 | 5 | NO-GO 判据成立有据，但无退场条件=默认永久双维护面 |
| QA#2 收口门吞吐 | 2 | 唯一人工门全依赖 owner 在场；凭据阻塞挂一周以上；35 项 PARTIAL 全堵单串行点 |
| 多 AI 并行分支纪律 | 3 | AGENTS.md 与 CLAUDE.md 分叉六条，两份都未 commit |
| HANDOFF 协议有效性 | 4 | 内容质量高但自陈 worker 读不到当前版本，协议对自己失效 |
| worktree / stash 卫生 | 5 | 实测 11 个 worktree 全 clean、共享 ODB，风险是「不知道哪些已进 HEAD」的盲区而非丢失 |
| 战线宽度控制 | 3 | wave 未收口即开三条 07-28 新战线，全部 untracked |
| 六能力走查就绪度 | 4 | capability-matrix 已有代码基线，缺可复跑旅程脚本与打分口径；现在启动只会再产一份手写快照 |

### 建议

| 优先级 | 动作 |
|---|---|
| P0 | 先补 .gitignore 两行，再打 WIP checkpoint commit（显式 add 6 模块 + 12 测试 + 3 spec + 4 research）；禁 git clean / stash / checkout |
| P0 | HANDOFF.md 单独 commit + 文首写「有效版本 = hash」，删 §6 二选一悬置 |
| P0 | 写权独占约定：codex 独占写 + 定期 WIP checkpoint；claude 只读；HANDOFF 顶部写明当前持有者与时间窗 |
| P0 | 遥测补两条事实：brief_refreshed 加 findings/related/unplaced 计数；新增 related_snapshot_built 带 degradeReason（no-client / no-focus-text / search-error / empty-result）；Adapters 三条降级路径可区分 |
| P1 | related=0 从 QA#2 摘出单独结案：新遥测跑一次真机按 degradeReason 定性 |
| P1 | 建 test/BASELINE.json（文件总数 / 期望 pass / quarantine 列表）+ 校验脚本自动比对 |
| P1 | 两个失败测试显式 quarantine（skip + 文件头写原因/归属/复检触发条件），禁止顺手修 |
| P1 | master 定位裁决：default branch 切到现分支、master 打 tag 归档；不做一次性合并 378 commit（无人能审、永久悬置） |
| P1 | 5 条含未合 commit 的分支逐条判定（已重做则 -D 并记录，否则 cherry-pick）；删 4 个 /private/tmp worktree |
| P1 | T6 三双路径各写退场触发条件进 progress.md（caller 归零即删 / modal 管线下线即删 / 接入 capability runtime 即删）；只设触发不设日期 |
| P1 | QA#2 切片：非 owner 项（display state / reload / History 空态 / drawer / dark / 125%）转 CDP/harness 自动化留证据；owner 只留 IME/clipboard/bitmap/drag/凭据/设备矩阵 |
| P1 | AGENTS.md 收敛为一行指向 CLAUDE.md，删分叉内容 |
| P2 | 六能力走查推迟到 QA#2 切片后，形式=可复跑脚本 + 遥测断言，成绩单落 docs/research/ |
| P2 | 三份 07-28 spec 文首标「排期冻结至 Composer wave COMPLETE」，只写 spec 不开代码 |
