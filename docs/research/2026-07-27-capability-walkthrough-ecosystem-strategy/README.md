# 六大能力走查框架 + 插件生态取代/结合策略评估

> 2026-07-27。Owner 给出六大能力清单与插件生态"取代 / 结合"两张清单，要求评估并把能力"从头到尾捋顺"。本文是策略评估结论；逐能力的实际走查（跑真实旅程、打分、出 gap 清单）是后续执行项。
>
> **同日续作**：① 四份代码实地盘点原稿 [audit-01 搜索/分析](./audit-01-search-analysis.md)、[audit-02 Composer/Ambient](./audit-02-composer-ambient.md)、[audit-03 ChatStudio/内核](./audit-03-chatstudio-kernels.md)、[audit-04 Atlas/辅助面](./audit-04-atlas-aux.md)；② 汇总产出 **[产品能力矩阵（现状 × 断点 × P0/P1/P2）](./capability-matrix.md)** ——走查执行前的基线；③ 外部证据参照系见姊妹篇 [AI 编辑器格局深度调研](../2026-07-27-ai-editor-landscape-deep-research/README.md)。

## 一、总评

六大能力的骨架**成立且大部分已经建成**：Search（V2 UI 已落地）、AI Analysis（JSON 落库根治 vault 污染）、Composer（当前活跃分支）、Atlas（file-atlas view + harness）、ChatStudio（已 shipped）、辅助面（Curator onboarding 已 shipped、Usage Dashboard 三屏 mock 已复刻、Copilot Command Center 已有雏形）。**真正的风险不在能力设计，而在两张生态清单带来的边界失控**——"取代 7 个插件 + 结合 20 个组件"如果不分层，会把六能力的 smooth 目标拖死。

核心裁决：**生态扩张全部 gate 在六能力走查通过之后**。"smooth" 必须被定义成可验收的旅程脚本（入口 → 输入 → 执行 → 产出 → 二次进入），逐条打分（顺 / 卡 / 断），先修 P0 摩擦。且 memory 记录显示大量已完成工作未 commit（OOM 根治、model slot 统一、Usage Dashboard、Chat Runtime 闭环）——**smooth 的第一步是把这些 land 掉**。

## 二、两个"与其…不如…"判断的评估

### 2.1 "与其 ambient 悬浮/sidebar，不如写新 editor view" — 方向正确，且事实上已在做

Composer 当前就是自绘 block 渲染（block instruction morph / image layouts / native embed previews / inline math atoms），这个决定已经被实践验证。但要明确三个代价并写进设计约束：

1. **第三方 editor 插件在自绘 view 里全部失效**（Outliner、Highlightr、vim mode、Templater 的 in-editor expansion 都是 CM6 扩展）。这与"结合 Outliner / Highlightr"**直接矛盾**——二选一。裁决：不承诺在 Composer 内跑第三方 CM6 扩展；Outliner 式折叠/拖拽、Highlightr 式标色作为 **Composer 原生 block 能力**自己实现。
2. **Markdown round-trip 是生死线**。Composer 里的所有编辑必须无损写回标准 markdown，用户随时能退回默认编辑器且文件不变形。这条要有回归测试兜底。
3. **定位是"进入式 AI 写作模式"，不是默认编辑器替代**。Ambient push 因此收敛为 Composer 内能力，默认编辑器里不做悬浮/侵入——接受这个减法，它同时消灭了"悬浮层遮正文"这一整类 UI 返工（见 hover UI 三条硬偏好）。

### 2.2 "与其自己写 chat UI，不如复刻别人的一套" — 已经是现状，不要再重写

Chat Studio 已 shipped，技术栈（shadcn/ui + streamdown + Radix）本质上就是"用别人的一套"的务实版。Obsidian 的约束（CommonJS 单 bundle、主题 CSS 污染、无 CSP 外链）决定了 LobeChat 级别的整套引入不现实，**组件级引入 + 自组装就是上限**。真正该做的不是换壳，而是把 message 渲染层抽成共享内核给 Copilot 复用——即下面的 Transcript kernel。

## 三、通用能力 → 三个共享内核（最高杠杆项）

Owner 列的三条通用能力，对齐现有 `docs/conventions/prompt-input-consistency.md` 的模式，固化为三个 kernel，各自一个 owner surface + 消费方清单：

| Kernel | 内容 | Owner | 消费方 | 现状 |
|---|---|---|---|---|
| **VoiceInput** | Whisper 语音输入（录音、转写、插入光标） | PromptInput 内核 | ChatStudio、Copilot、Composer | 未建 |
| **ResultList** | 多视图文件列表（list / card / graph / timeline） | `src/ui/component/result-browser/` | Search、Copilot、Atlas、AI Analysis | **雏形已在**（result-browser 已是共享组件） |
| **Transcript** | 消息流渲染（气泡、streaming、tool call、引用） | ChatStudio message 层 | ChatStudio、Copilot 对话 | 需从 chat-studio-view 抽出 |

这三条直接决定 smooth 的下限：同一能力在不同 surface 表现不一致，是用户感知"不顺"的最大来源。建议为每个 kernel 补一份 `docs/conventions/` 条目（参照 prompt-input-consistency 的写法）。

## 四、Composer 皮肤 + 社区贡献 — 内部架构做，公开市场不做

- **做**：内部皮肤架构（design token 化 + 布局变体），因为它逼出渲染层与数据层的干净分离，对代码质量是正收益。CSS 变量继承 Obsidian 主题是廉价中间态（顺便回应"和 Theme 结合"的诉求）。
- **不做（现在）**：社区皮肤市场。皮肤 API = 公开 API 承诺 + 版本化 + 社区 CSS/JS 注入的安全审查 + 维护税。2026-07-03 的 Template Marketplace 调研已给出结论（GitHub central repo + 签名分级、不做 SaaS）——皮肤市场如果将来做，直接挂进同一套分发机制，不另起炉灶。

## 五、Command Center — "并存的策展启动器"，不是替代 Cmd+P

与 `docs/conventions/command-palette-governance.md` 同源，方向对。但"替代 Command P"改为"并存"：Cmd+P 是全插件命令聚合点 + 用户肌肉记忆，替代它会破坏其他插件的可发现性。定位：

- Command Center = **Pin 的 Peak 入口 + HomePage 看板**，自己的快捷键；
- 这同时吸收"结合 HomePage"的诉求——两个 idea 合并成一个 surface（美化看板 + 常用入口 + 最近文件），顺带覆盖 Recent Files 的取代；
- 现有 `CopilotCommandCenterModal` 是 copilot 域的，全局启动器是另一个 surface，注意命名区分，避免词族漂移。

## 六、Command Gateway 集成 — 按差异化排序

| 集成 | 判断 | 优先级 |
|---|---|---|
| **Terminal（codex / claude code）** | 唯一差异化项，也是取代 Claudian 的路径。PTY + 进程管理是实打实的基建；**desktop-only，与 mobile 计划冲突，必须明确降级策略** | 高（独立立项调研） |
| **Templater / Git** | 薄适配器：检测插件存在 → 暴露策展命令进 Command Center，不做深 API 耦合 | 中，便宜 |
| **Excalidraw / 官方 Canvas** | 中等成本；Canvas 已有 2026-07-03 调研结论（API 不足以嵌深度 UI，只做轻量视图切换） | 低-中 |
| **Theme 结合** | 目标模糊，不立项；由 Composer 皮肤的 CSS 变量继承间接覆盖 | 不立项 |

## 七、取代清单 — 分三层

### 射程内（基本达成或顺手赢）
- **Copilot / Smart Connections / Smart Second Brain**：AI chat + 语义搜索 + agent 本来就是 Peak 主航道，已基本覆盖。
- **Claudian**：靠 Terminal 集成实现（见上）。
- **Recent Files**：Command Center / Atlas 顺带覆盖。

### 重新定义，而不是兼容取代
- **DataView**：**不做 DQL 兼容**——那是无底洞，且 Obsidian 核心 Bases 正在吞掉这个场景。Peak 的增量是"AI Query block"（自然语言 → 索引查询 → 活视图），且 2026-07-22 的 **Peak Sheet（Dataset + Compute Engine）** 调研已经是这个方向的正式提案——DataView 的取代路径就挂在 Peak Sheet 上，不另立项。
- **Advanced Tables**：只在 Composer 内做原生表格块（同样归入 Peak Sheet 的 Table view），不碰默认编辑器。

### 不碰
- 默认编辑器里的行为增强类（与 2.1 的裁决一致）。

## 八、结合清单 — 大半应重新归类为"Composer 原生能力"

原清单 20 项按归属拆开后，真正的"外部集成"所剩无几：

| 归类 | 项目 | 说明 |
|---|---|---|
| **Composer 原生编辑能力**（不是集成，是 Composer 的 feature backlog） | Paste URL into selection、Image Converter、Paste image rename、Dragger、Creases、Easy Copy、Highlightr 式标色 | 全部自绘 block 内实现，正因为有自己的 editor view 才可控。这组合起来就是"Composer 编辑体验清单" |
| **Atlas / 文档多视图家族**（backlog） | Mind Map（可押 markmap）、Advanced Slides | 都是 markdown 的替代渲染视图，挂在 Atlas 的"一文多视图"概念下；Slides 注意上游插件已疲态，按需自实现 |
| **小开关能力** | Periodic Notes 自动归档 | 一个 opt-in 规则：生成文件按年/月/日归入日记系列，挂 folderPaths 体系 |
| **需要基建，已有调研** | Share Note | **已被 2026-07-22 Peak Share 产品线调研覆盖**（Share 是发布底座），不重复立项 |
| **需要基建，新立项** | 中文分词（jieba/盘古 wasm） | 两个落点：搜索 tokenization（提升中文 vault 检索质量）+ Composer 内双击选词。值得独立调研 |
| **低成本必做** | Persistent Graph（自家图） | 自家 xyflow 图（AtlasGraphCanvas / ResultBrowserGraph）保存布局与位置状态；**不碰核心 Graph view** |
| **待调研** | Vault Operator | 登记调研候选，未评估 |

## 九、六能力走查框架（后续执行项）

每个能力写一条端到端旅程脚本，按"入口 → 输入 → 执行 → 产出 → 二次进入"五段打分（顺 / 卡 / 断）：

1. **General Search**：唤起 → 输入（中文/混合 query）→ 结果列表（ResultList kernel）→ 打开/预览 → 再次搜索的历史与连续性。已知未结：vault 工具"0 结果"待查。
2. **AI Analysis / Vault Copilot**：触发分析 → 进度可见 → 结果落 JSON（不再污染 vault）→ 结果回看入口 → 与 Copilot 对话衔接。
3. **Composer / Document Copilot / Ambient**：进入 Composer → block 编辑 → AI 指令（morph）→ ambient 建议出现与采纳 → 退出后 markdown round-trip 校验。
4. **Atlas / Doc Switch**：唤起 → 浏览/切换 → 图视图状态保存 → 回到编辑。
5. **ChatStudio**：新会话 → 流式回复 → 工具调用可见 → 历史回访 → 会话管理。
6. **辅助面**：全新 vault 的 Onboarding 一次通过率；Usage Dashboard 数据真实性；Command Center Pin 流程。

走查产出 gap 清单后，P0 修复完毕才解锁第六、七、八节的生态扩张项。

## 十、登记与迁移

- 本文登记 `docs/roadmap.html` `#researching`。
- 衍生立项建议：① Terminal/Agent CLI 集成调研；② 中文分词调研；③ 三个 kernel 的 conventions 条目；④ Vault Operator 调研。
