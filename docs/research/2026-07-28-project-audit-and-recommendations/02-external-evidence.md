# 02 · 外部证据原稿：用户之声 / Obsidian 生态 / 产品格局 / 学界 / 技术趋势

> 五个联网调研代理（Opus 5）的完整发现，均以 07-27/07-28 已有调研结论为去重基线、只做增量。evidence 为 URL 或论文名；时点 2026-07-28。

## 一、用户之声（2025-2026 真实用户声音）

**Headline**：Peak 面临的不是「AI 好不好用」而是四条硬约束——钱要 BYOK 且订阅锚点是 LLM 本身、写入必须可中断可隔离、vault 与索引不许污染或崩、而官方已把生态推向「外部 agent + CLI + 开放格式」，插件内 AI 正被 Claudian 这类终端方案吞并。

| 发现 | 细节 | 证据 | 强度 |
|---|---|---|---|
| 【信任】供应链事件后「任何插件都能做任何事」成共识 | 2026-05 插件被用于投放 RAT(366 分/229 评)；官方随即上自动审查并预告权限系统；用户仍视自愿披露为安全表演。「Meanwhile, any plugin can do anything.」—yencabulator | news.ycombinator.com/item?id=48088576 ; obsidian.md/blog/future-of-plugins/ | 强 |
| 【弃用·付费】收回已有免费功能=背叛 | Smart Connections 4.x 把 Ollama/本地嵌入挪进 Pro，直接触发卸载并迁移到 Claude Code。「Monetising is totally fine. It is bit unfair to remove the existing features.」 | github.com/brianpetro/obsidian-smart-connections/issues/1269 | 强 |
| 【付费】订阅锚点是 LLM 订阅本身；无地域定价即失客 | Copilot Plus $14.99/月、SC Pro $9/月。「almost 50% of an OpenAI subscription…for a plugin that won't work on its own」 | 同上 issue 评论区 | 强 |
| 【付费·BYOK】把「用我自己的 key」放进付费墙最招恨 | 「Making an API call to my own server or with my own API key is not a pro feature IMO」；Copilot 有 issue 要求 autocomplete 改 BYOK、拆「不含自家模型」低价层 | github.com/logancyang/obsidian-copilot/issues/1706 ; /1534 | 强 |
| 【隐私】最致命的是未披露的中间商与持久追踪 ID | 用户审计发现 Copilot Plus 全部消息先过 api.brevilabs.com 做意图分析并附持久 UUID，README 未披露 | github.com/logancyang/obsidian-copilot/issues/2064 | 强 |
| 【噪音】三大噪音源 | 内置模型清单（「this is noise」#1747）、thinking 块外泄进正文（#2075）、抢焦点通知致模态关不掉（SC #1285） | 各 issue | 中 |
| 【vault 污染】AI 插件默认散落多个目录，一挪就崩 | Copilot 5 个独立 folder 设置（projectsFolder 无 UI 须手改 data.json），移动后项目消失历史丢失；索引文件塞 .obsidian 根 | github.com/logancyang/obsidian-copilot/issues/2432 ; /2360 | 中 |
| 【性能】大 vault 索引是硬墙：跑不完并留下损坏索引 | 「indexing does not complete at all…Obsidian can become unstable or crash」，重启后向量库 corrupted 被迫反复重建 | github.com/logancyang/obsidian-copilot/issues/2592 ; /1936 | 强 |
| 【控制权】agent 批量改文件「停不下来」是最尖锐信任缺口 | STOP AGENT 只停 token 生成，队列里的 rename/write 继续执行；作者自认「dangerous when the Agent is hallucinating」 | github.com/allenhutchison/obsidian-gemini/issues/294 ; /329 | 强 |
| 【ownership】主流不是拒绝 AI，而是「隔离 AI 写的东西」并保留摩擦 | 用户自建 Templater 模板把 AI 文本 quarantine；「The friction keeps me from…turning brain off」 | news.ycombinator.com/item?id=47661572 | 强 |
| 【最高频愿望】要 Cursor 式在编辑器内改稿，不要 sidebar 聊天 | 「I wanted Cursor-style AI assistance in my notes, not just a chatbot bolted onto sidebar」；卡点在词/字符级 diff 粒度与 apply 延迟（30s vs Cursor <1s） | github.com/glowingjade/obsidian-smart-composer/issues/478 ; /292 ; /247 | 强 |
| 【真实场景】高频用途是回忆/周报/找漏掉的连接与打标，几乎没人要「代笔」 | 「summarize everything I did last week」「search for ideas and links that I might have missed」；反面顾虑「dumping ground」 | forum.obsidian.md/t/99936 | 强 |
| 【移动端】AI 插件事实上桌面专属 | 连续崩溃/Buffer 未定义/索引无法重建报障；Note Companion 作者宣布暂停移动端 | github.com/logancyang/obsidian-copilot/issues/2186 等 | 中 |
| 【生态位移·增量最大】官方路线=外部 agent+CLI+开放格式 | kepano/obsidian-skills 6 个月 43.5K star；Claudian 8 个月 14.4K star > Copilot 3.5 年 7.5K；Smart Composer 停更 | github.com/kepano/obsidian-skills ; github.com/YishenTu/claudian | 强 |

**方法论警示（该代理自报）**：Reddit / YouTube / Discord 三源被抓取层封锁，结论主要来自 GitHub issue + HN + Forum，系统性偏向技术用户；需人工补采 Reddit 验证。其余 open questions：Claudian 碾压的归因（终端形态 vs 订阅额度经济学，需下载量时间序列）；Anthropic 封第三方 OAuth 对「用户自带订阅」路线是否硬约束；Peak 是否把能力导出为 Agent Skills 让外部 agent 调用（对抗 vs 寄生）；自动审查逐版本下架对发布节奏的影响（BRAT/手动分发？）；用户自发 quarantine 模板 vs Peak 内部元数据（provenance 是否应退化为纯文本可见标记）；JSONL change feed 已有第三方做成插件，Peak 的 JSONL 是否对外暴露同一契约；大 vault 索引崩溃安全可能是最易做出可感知差异的单点。

## 二、Obsidian 生态竞品动态（截至 2026 年中）

**Headline**：官方明确「不做内建 AI、只把 vault 变成 agent 可读底座」（CLI + Skills 43.5k star），生态重心整体迁移到「内嵌 coding agent」——Claudian 7.7 个月 154 万下载、Copilot v4 改内嵌 opencode/Claude Code；终端集成已成红海、Bases 视图正被官方吞并，而 ambient 推送、深度检索报告、自绘 AI 编辑视图仍是近乎无人的真空白。

| 发现 | 细节 | 证据 | 强度 |
|---|---|---|---|
| Claudian 是生态史上增长最快的 AI 插件 | 2025-12-05 建仓，7.7 个月 1,538,564 下载（≈19.9 万/月，为 Copilot 生涯均速 5 倍），14.4k star。MIT 免费、用户自带 Claude 订阅。自绘 UI 非终端：inline edit 带 word-level diff、plan mode、@mention、多 tab、MCP | github.com/yishentu/claudian + community-plugin-stats.json | 强 |
| Copilot v4 放弃自研 agent，改内嵌 opencode/Claude Code/Codex | 「run the most capable coding agents natively inside your vault」，需 Supporter 订阅；另已落地 Bases 只读工具与 Obsidian CLI agent tools | github.com/logancyang/obsidian-copilot README ; issues/2257 | 强 |
| 官方 AI 战略定案：不做内建 AI | roadmap 零 AI 条目；CEO kepano 个人建 obsidian-skills（43,487 star），含 obsidian-markdown/bases/json-canvas/obsidian-cli/defuddle 五 skill。官方不会吞 AI 能力，只会吞「接入层」 | obsidian.md/roadmap ; github.com/kepano/obsidian-skills | 强 |
| 官方 CLI 既是威胁也是福利 | search/read/create/daily/tasks/tags/diff + devtools、plugin:reload、eval、dev:screenshot/errors/css/dom；desktop-only。dev 系列可直接替代 Peak 的 .dev/harness 调试链路 | obsidian.md/cli | 强 |
| 【答空白】Bases API 可用但边界硬 | registerBasesView 已正式文档化；但 BasesEntry 恒等于一个文件（行=文件）、Obsidian 独占过滤/公式、API 无写回、数据仅 frontmatter。AI 抽取的多行/块级数据无法建模——Peak Sheet 只能借查询引擎，不能托管 AI 派生行 | docs.obsidian.md/plugins/guides/bases-view | 强 |
| 官方正在吞并 Bases 社区视图 | roadmap Active 列 Kanban view for Bases、Planned 列 Calendar；社区 254 个 Bases 相关插件在抢同一块地。教训：凡官方 roadmap 已列的视图形态不要立项 | obsidian.md/roadmap | 强 |
| 【答空白】终端/Agent CLI 集成已是红海 | 103 个相关插件：Claudian 154 万、Terminal 36.9 万、Agent Client 21.5 万（ACP）、Lean Terminal（xterm.js+node-pty）等；PTY 方案抄现成即可。建议 Peak 终端立项降级或放弃自建 | github.com/polyipseity/obsidian-terminal 等 | 强 |
| Ambient/proactive 推送是真空白 | 仅玩具级实验：Hypermnesic Companion 82 下载、Prior Art 23、Auto Link Suggester 191；内联补全整体停滞在 2024。无人做任务边界推送+可撤销 review | community-plugin-stats.json 扫描 | 强 |
| 深度检索报告同样近乎空白 | 同类仅 8 个插件，最大 AI Research Assistant 10,616 下载。Peak AI Analysis 几无正面竞品 | community-plugins.json 扫描 | 强 |
| 老一代竞品集体失速 | Smart Composer 2026-01 停更（114 open issues）；Cannoli 停 2025-10；Text Generator 卡 beta；SystemSculpt 最新版仅 222 下载；Smart Connections 仍健康（111 万）但其 License 明文禁止用于竞品、代码不可借鉴 | 各仓库 ; smartconnections.app/legal/license | 强 |
| 【答空白】自绘编辑视图有一批实践但无人破圈 | 2026 年集中冒出 Wysimark(3.7k)/Rich Text Editor(1.1k)/Butter(819)/Notion block(2.9k)/Document Comments(1.1k，「注释存 markdown 内以便 agent 读」)；全部 <1 万。方向被反复验证、技术门槛卡死所有人 | 各仓库 | 强 |
| YOLO 是最接近 Peak 六能力全栈形态的对手 | 71,256 下载高频更新，MIT+捐赠；覆盖 chat/RAG/agent/cursor chat+tab completion/Skills/MCP + Learning Mode（提纲+闪卡+交互知识图）；中文作者，与 Peak 中文重度自用场景正面重叠 | github.com/lapis0x0/obsidian-yolo | 中 |
| 【答空白】实体消解有可抄的「廉价优先」七级级联 | Simple Graph Builder：持久缓存→会话缓存→精确名 hash→别名 hash→embedding>0.90 自动合并→0.80-0.90 交 LLM→新建；JSON schema 强校验、非法实体丢弃。缺合并可逆性/变更追踪——正是 Peak 该补的差异点 | github.com/junhewk/simple-graph-builder | 强 |
| 生态门槛 2026-05-13 崩塌 | 自动化审核取代人工、数日清空 2300+ 积压，插件数达 6,117；近 700 新注册里 108 条 AI 类。注意力稀缺下「逐能力窄叙事」比 all-in-one 更易被发现 | obsidian.md/blog/future-of-plugins | 中 |

**Open questions**：Obsidian 1.13 declarative settings API 与 OKLCH 迁移对 Peak 自绘设置面板是否破坏性；付费 AI 插件商业模式在 Obsidian 内是否已被 Claudian 免费同质化证伪；obsidian-skills 算官方承诺还是个人项目、Peak 的 prompt/template 层是否改产出标准 Agent Skills；官方 CLI dev 命令能否替代 .dev/harness；Bases ViewOption 之外的 side-car 存储惯例；Claudian/Copilot v4 的 diff review 是否已是「多条待审队列」（若是则「无插件有 review queue agent 层」结论被推翻）；中文分词在 Obsidian 内的实证基准；defuddle 能否做 Web Annotation 式 evidence locator 的抓取层。

## 三、AI-native 知识/写作产品格局（2026 年中）

**Headline**：文档 AI 的交互范式已收敛到「提议→审阅→落盘」，微软押注 agent-first 是最大反向赌注；更值得警觉的是 Reflect Open 与 OpenKnowledge 已把 Peak 的架构（markdown 事实源 + SQLite 索引 + BYOK + patchset 审阅）开源实现——护城河必须从架构转向 Composer 块级能力与六能力闭环。

| 发现 | 细节 | 证据 | 强度 |
|---|---|---|---|
| 收敛共识：「提议→审阅→落盘」成默认安全 UI | Google Docs「Gemini 建议仅你可见直到批准」、Notion Plan Mode、Cursor Plan Mode、Tiptap autoAccept 三态，多家独立收敛 | workspaceupdates.googleblog.com 2026-04 ; tiptap.dev/docs/content-ai | 强 |
| 最大分歧：微软宣布「AI 建议的时代结束了」 | Build 2026 Agent Mode 成 Word/Excel/PPT 默认，与 Google 待批准范式正面对立 | Build 2026 报道 | 强 |
| 证伪：Notion 从未上 ghost-text 内联补全 | 官方 release/帮助文档只有 space 起手、/AI block、选中 Ask AI、选区内 agent 就地改；二手站所称「灰字 Tab 接受」查无实据，勿据此立项 | notion.com/releases/2026-02-24 ; /2026-04-14 | 强 |
| Lex 是散文侧 inline 的幸存形态 | `++自然语言` 就地起草可接受/拒绝；Run Checks 按语法/冗长/陈词/被动逐条高亮一键采纳；$18/月。直接对应 Peak 的审阅队列 | creatorstackclub.com/software/lex | 中 |
| Reflect Open 与 Peak 架构近乎镜像（含 Peak 缺失的隐私开关） | markdown 事实源、.reflect/ SQLite 只做索引、右侧 copilot 仿 Cursor、BYOK 直连、patchset 审阅、frontmatter `private:true` 硬屏蔽云 AI | github.com/team-reflect/reflect-open | 强 |
| 一手理由：为何放弃私有格式与 E2EE | 「制造了大量复杂度，尤其在 Markdown 成为人与 AI 的共同语言之后」；桌面 MIT 开源、移动收费 | reflect.app/blog/reflect-open | 强 |
| OpenKnowledge：离 Peak Composer 最近的实现 | Inkeep 开源(GPL-3)：WYSIWYG markdown + yjs CRDT 双观察者字节级同源 + 原生 MCP/skills + Orama 混合检索；PH/HN 双第一 | github.com/inkeep/open-knowledge | 强 |
| 小厂集体放弃自建 AI UI，改做 MCP context 供给方 | Reflect 上 MCP、让 coding agent 直接改笔记；Capacities 接 ChatGPT/Claude/Cursor；Obsidian 官方不自建 AI | reflect.app ; capacities.io/whats-new | 强 |
| Granola：从记笔记跃迁为「企业 context layer」 | $125M、估值 $1.5B（一年 6x）；论点=价值不在笔记本身，在让对话知识被别的 AI 系统消费 | thenextweb.com 报道 | 强 |
| 图谱产品化三分化，用户为「结构税」买单有限 | Tana/Capacities 加倍下注可被 AI 写入的结构；NotebookLM Mind Map 退化为交互式目录；Tana 流失主因=AI 成本+学习曲线 | capacities.io ; makerstack.co/reviews/tana-review | 中 |
| 记忆形态已收敛：项目隔离 + 可见可编辑 + 后台整理 | Claude 按 project 独立记忆+可编辑 summary+incognito；ChatGPT 三层互不串+后台整理 | claude.com/blog/memory | 强 |
| 「打扰等级分类法」不必原创 | Anthropic autonomy×risk 双轴 1-10；实测 agent 自停原因分布（给选项 35%/诊断 21%/澄清 13%）与人打断原因（补上下文 32%/嫌慢 17%） | anthropic.com/research/measuring-agent-autonomy | 强 |
| SKILL.md 已成跨厂开放标准 | 2025-10 开放后 60 天内 OpenAI/Cursor/Gemini/Windsurf/OpenCode 跟进，2026 年中约 40 个产品支持 | agentman.ai 生态报告 | 中 |
| 定价：AI 从加购变捆绑，agent 单独计量 | Notion AI 并入 $20/席、agent 另计 credits；个人 PKM 稳定 $10-18/月 | costbench.com 等 | 中 |

**Open questions**：Notion 选区内 agent 就地改是否带 diff/撤销层；Tiptap AI Changes（先落盘后审）vs AI Suggestion（先审后落盘）Peak 该选哪种、autoAccept 三态是否移植；`private:true` 是否跟进为跨工具约定；bounded agent 数据能否迁移到长文写作场景；OpenKnowledge yjs 字节级同源如何实现、能否借鉴到 round-trip validator；SKILL.md 承载 Peak capability pack 的安全边界；转 MCP 后「自建 AI UI 对单人插件是否仍必要」的留存数据；NotebookLM 可编辑导出后 source-grounded notebook 与可编辑文档合流对 AI Analysis 报告（应否可编辑、可回写 vault）的启示。

## 四、学界补充（2025-2026 新文献）

**Headline**：新文献没有推翻七公理，但把其中三条从「方向正确」逼成「必须带具体机制」——ownership 需要 provenance + 文风个性化（光「可见」不够）、信任复利必须与自我效能脱钩计量、ambient 时机论拿到触发器命中率分层硬数据；同时 AI Graph 方向拿到一条强反向证据：可视化本身会制造专家级过度信任。

| 发现 | 细节 | 证据 | 强度 |
|---|---|---|---|
| 【修正 ownership】控制感是幻觉：感知与实际 ownership 解耦 | 19 访谈+1291 会话：评估 AI 建议取代了自主构思；写作者感觉全程可控，但表达观点与事后立场双双漂移 | Reactive Writers, CHI 2026, arXiv:2603.10374 | 强 |
| 【硬化 ownership】6 天后用户记不清哪句是自己写的，混合工作流最差 | N=184：全人工来源判定 92.4%，AI 出点子+人扩写仅 37.7%，全 AI 反而 79.3%；自评比实际高 12pp | The AI Memory Gap, CHI 2026, arXiv:2509.11851 | 强 |
| 【ownership 可操作解】文风个性化是唯一见效干预 | N=176：AI 辅助使心理所有权降 0.85-1.0（7 点量表）；按用户既有样本做风格个性化回补 +0.43、采纳率 +5pp；人格化 coaching 无效 | Who Owns the Text?, arXiv:2601.10236 | 强 |
| 【补充信任公理】信任上升与自我效能下降同时发生 | N=302 逐轮：协作抬高信任压低效能；效能跌者更爱让 AI 直改，效能稳者实际+感知作者身份都最高。北极星须双测 | Authorship Drift, CHI 2026, arXiv:2602.05819 | 强 |
| 【补齐空白】Codellaborator 正文量化数据 | 398 次干预：有效 53.3%/干扰 12.1%/忽略 34.7%；多行改动 73.1%、写注释 69.2%、运行程序 66.7% 触发最有效，idle 最差；presence 指示器把干扰分 4.61→3.78 | Codellaborator, CHI 2025, arXiv:2502.18658 | 强 |
| 【验证时机论】任务边界推送五天零衰减，但「可靠」感知仅 27% | N=15 五天实地：post-commit 参与 52%/拒 20%；被拒后追推仅 31% 参与、62% 拒；SUS 72.8、易学 93% | Five-Day Field Study, IUI 2026, arXiv:2601.10253 | 强 |
| 【时机论升级】确认点按回滚成本排期 | CDCR 循环+决策论模型放置周期性确认点；81% 偏好中间确认胜过 confirm-at-end，耗时降 13.54% | When Should Users Check?, CHI 2026, arXiv:2510.05307 | 强 |
| 【进入式 vs 嵌入式已有 RCT】专用过程视图完胜 chat，但不提升成文质量 | N=90 三臂：控制感 6.59(专用)/5.83(编辑器)/3.34(chat)，知识转化显著更高；成文质量三组无差异。TreeWriter 同向复现 | Script&Shift, arXiv:2506.20595；TreeWriter, arXiv:2601.12740 | 强 |
| 【硬化留存公理】AI 辅助存在倒 U，偏好与认知收益反向 | N=30：中档（实时摘要）后测最高、全自动最低，用户却偏好全自动。满意度不可当北极星 | AI Assistance Dilemma in Note-Taking, CSCW 2025, arXiv:2509.03392 | 强 |
| 【质疑 AI Graph】可视化本身制造过度信任，KG 专家不能幸免 | 14 位 KG 从业者用 LinkQ（五种校验可视化）：正因「看着靠谱」，LLM 出错时仍过度信任 | LinkQ 后续, arXiv:2505.21512 | 强 |
| 【AI Analysis 风险】检索越深，引用事实性越差 | 14 模型评测：链接可用>94%、相关性>80%，但事实核对仅 39-77%；工具调用 2→150 时事实准确率平均掉约 42% | Cited but Not Verified, arXiv:2605.06635 | 强 |
| 【AI Graph 正向证据的两个前提】渐进披露 + 用户可改写 | GraphTide 渐进嵌套图理解度显著更优；MindTrellis 双向共建胜过 retrieval-only。一次铺全图与只读图都不成立 | arXiv:2604.12624；arXiv:2604.23129 | 中 |
| 【Smooth 量化增量】外在认知负荷影响≈内在负荷 3 倍 | 34 名专业人士 1178 子任务：「模型发起的任务切换」是绩效下降最强预测因子——可直接埋点为摩擦微信号 | Precision Proactivity, TOCHI, arXiv:2505.10742 | 中 |
| 【纵向留存规律】用户不会「学会用」，强度而非新奇度决定留存 | WildChat-4.8M：提示策略基本不随时间演化；微软数万工程师四个月：留存与活跃度相关、采纳者合并 PR 多约 24% 且不衰减 | arXiv:2605.29018；arXiv:2607.01418 | 中 |

**Open questions**：写作域任务边界触发器命中率需自测（编程域数据不能直接套）；块级 provenance 是否必须持久化并做 6 天来源回放（阈值与形式无先例）；文风个性化在中文长文+单作者 vault 的可复现性与语料量；AI Graph 需要什么「反可视化」手段（不一致暴露/置信度着色/强制抽检在图谱界面均无对照研究）；AI Analysis 工具调用上限拐点需自建校验集实测；价值主张是否改口「想得更清楚+留得住」（连带 Onboarding 文案与北极星）；块级 vs 文档级 AI 对照研究缺失、可能需自做小样本；打扰等级分类法仍需基于 04 号原稿光谱表原创并写进 conventions。

## 五、技术趋势对 Peak 架构赌注

**Headline**：整体利好 JSONL 事件流、多 provider 与块级 AI 编辑三项赌注（Claude Code/Codex/Tiptap/BlockNote 独立收敛验证），但「自绘 Composer 的必要性」与「桌面重插件的分发可行性」出现新反证：官方 CLI + 逐版本安全扫描 + 能力披露已上线，ACP 已成 agent harness 嵌入编辑器的事实标准（Obsidian 在官方客户端列表）——自建 AgentLoop 与自绘视图都需要重新论证增量。

| 发现 | 细节 | 证据 | 强度 |
|---|---|---|---|
| 【威胁+机会】MCP 2026-07-28 规范大改 | 无状态化（取消 initialize 握手与 Session-Id）；Tasks/Apps 降为扩展按 reverse-DNS 协商；Sampling/Roots/Logging 12 个月弃用期；治理归 Linux Foundation AAIF | blog.modelcontextprotocol.io 2026-07-28 RC | 强 |
| 【威胁】外部 agent 已可绕过插件访问 vault | 官方 CLI（eval/plugin:reload/dev:*）官方口径即「给 agentic 工具访问 vault」；另有 4+ MCP 服务端插件 | obsidian.md/cli | 强 |
| 【威胁】ACP 成事实标准，Obsidian 在官方客户端列表 | Zed 发起、JetBrains 合作；12 客户端 + 50+ agents（Claude/Codex/Copilot/Gemini）；复用 MCP JSON 类型并补 diff 展示类型 | zed.dev/acp ; agentclientprotocol.com | 强 |
| 【填补空白】内嵌 agent CLI 的两条 PTY 路线已被验证 | node-pty 需按 Obsidian Electron 版本重编译；或 Python PTY 脚本 base64 内嵌启动落盘。均 desktop-only | github.com/dternyak/claude-code-terminal 等 | 强 |
| 【威胁】分发门槛结构性抬高 | 逐版本自动安全/质量扫描出评分卡；即将强制披露网络/文件系统/剪贴板能力；不再接受闭源 | obsidian.md/blog/future-of-plugins | 强 |
| 【支持】块编辑器 AI 协议收敛到 blockId + op + 审阅层 | Tiptap tiptapRead/tiptapEdit/editThreads、Shorthand 称省 80% token、先块级后块内 diff；BlockNote add/update/delete + accept/rejectChanges。与 Peak Composer 同构 | tiptap.dev ; blocknotejs.org | 强 |
| 【需重估】原生 CM6 内 AI diff 审阅插件已存在 | InlineAI ~7.7k 下载行内增删标记一键接受；Smart Composer Cursor 式 diff；AI Co-Editor 把外部 agent 改动转逐词 track-changes | obsidianstats.com/plugins/inlineai | 中 |
| 【支持】编辑指令格式之争 | Morph 押 apply 模型（7B/10,500 tok/s/98%）；反方指 Anthropic/OpenAI 均用结构化 search-replace、Devin 弃用 apply 模型（双模型=双失败点） | morphllm.com ; 反方分析 | 中 |
| 【强支持】append-only JSONL + 派生索引双独立收敛 | Claude Code 每行 typed record 用 parentUuid 串链；Codex rollout-*.jsonl + session_index.jsonl 元数据缓存 | code.claude.com/docs session-storage ; codex discussions/3827 | 强 |
| 【可照抄】Agent SDK SessionStore 契约 | append/load 必需、delete 可选（no-op 适合 append-only）；重试按 entry.uuid 去重；摘要 sidecar 在 append 内 fold；压缩后视图与原始 entry 并存 | code.claude.com/docs/en/agent-sdk/session-storage | 强 |
| 【支持+风险】LiveStore 证明「事件溯源+反应式 SQLite 读模型」可产品化 | 事件流物化本地 SQLite、materializer hash 校验、事件弃用机制；ES 通病仍需自解（replay 成本/快照/upcasting） | docs.livestore.dev | 中 |
| 【限制】本地模型撞两堵墙 | 27B+ 内存带宽天花板（MLX 与 llama.cpp 持平）；>30k 上下文 prefill 塌陷（51→3 tok/s） | modelfit.io ; groundy.com 实测 | 强 |
| 【方向修正】本地优先应分层 | embedding（Qwen3-Embedding-0.6B ~639MB、中文强；EmbeddingGemma <200MB）与 STT（Parakeet 亚 100ms）已成熟本地化；生成与工具调用留云端 | huggingface.co/Qwen/Qwen3-Embedding-0.6B | 中 |
| 【支持但被商品化】多 provider 路由验证但差异化收窄 | OpenRouter $113M、月 100T token；美国模型份额 70%→30% 印证无单一主导；AI SDK v6 已内建 gateway/failover/agent 抽象 | 融资报道 ; ai-sdk.dev | 强 |

**Open questions**：自建 AgentLoop 是否降级为 ACP 客户端（可控性 vs 维护量的量化）；能力披露后 Peak 的 native 组合能否进官方目录（vs BRAT）；自绘 Composer 相对 InlineAI 路线的可感知增量（需并排可用性对比）；Shorthand 省 token 能否在 Peak 块模型复现（先测现有序列化每千字 token 成本）；JSONL 是否引入 entry.uuid 去重 + summary sidecar + 快照阈值；本地模型在 Peak 哪些环节可用需在自身中文语料 A/B；MCP Apps 的 sandbox iframe 与 Obsidian CSP/单 bundle 如何共存；官方 CLI 能否替代 .dev/harness 回路。
