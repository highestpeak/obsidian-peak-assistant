# 01 · 学术界调研原稿：Human-AI 协同写作 / 主动式 AI / PKM 实证（2026-07-27）

> 调研 agent 原始产出，供 README.md 综合分析引用。文献以 CHI/UIST/CSCW/IUI/OOPSLA/TOCHI 为主，2019–2026。

## 1. Human-AI Co-Writing

### CoAuthor（Lee, Liang, Yang — CHI 2022, Honorable Mention）
- 63 位写作者 × GPT-3，1,445 个写作 session（创意 + 议论文）。
- **建议采纳率 72.3%**；但最终文本平均 **72.6% 仍是写作者自己写的**——高采纳后大量编辑/删减。
- ~13% 的 AI 建议引入新命名实体，其中 ~20% 被下游复用 → AI 的主要创意贡献是**拓宽思路（ideational breadth）**而非产出成品文字。
- 启示：**采纳率是糟糕的价值指标——要跟踪"编辑后留存率"**。被接受后大改的建议是在履行"播种"职能，不是失败。
- 来源：https://arxiv.org/pdf/2201.06796 ；https://dl.acm.org/doi/fullHtml/10.1145/3491102.3502030

### Wordcraft（Yuan et al., Google — IUI 2022）
- 25 位业余写作者：Wordcraft 组 engagement 更高、helpfulness 评分更高、用时更少、故事更长。
- helpfulness 与 enjoyment/ease 正相关——**当交互模型匹配写作者意图时，"有帮助"和"心流"不是对立的**。
- 启示：良好收敛的文档内交互（不是外挂 chat 侧栏）同时提升产出和主观轻松感——支持"自建编辑器视图、不做悬浮层"的押注，前提是请求/响应回路足够低摩擦。
- 来源：https://arxiv.org/pdf/2107.07430 ；https://dl.acm.org/doi/10.1145/3490099.3511105

### A Design Space for Intelligent and Interactive Writing Assistants（CHI 2024，115 篇论文综述）
- 五大维度：Task / User / Technology / Interaction / Ecosystem。
- 核心张力：**proactivity vs. flow**（建议越多越频繁，打断风险越高）；**visibility vs. non-interference**。
- 区分 **user-initiated**（低风险）vs **system-initiated**（高心流打断风险，"initiative transfer" 处理不当会侵蚀 authorship）。
- 启示：ambient push 正是该分类学标记的高风险分支——必须配强 presence/context 信号。
- 来源：https://arxiv.org/abs/2403.14117 ；https://dl.acm.org/doi/10.1145/3613904.3642697

### The AI Ghostwriter Effect（Draxler et al. — TOCHI 2024）
- 两项研究（n=30, n=96）：用户**私下不觉得 AI 生成文本是自己的**，但**公开又不声明 AI 作者身份**——私下/公开认知割裂。
- 个性化 AI 输出**不能**缓解此效应；**提升用户对文本的可见控制/参与度才能恢复 ownership**。
- 启示：对 AI 产出内容要引导显式编辑（不只是 accept/reject）——被动接受 ghost text 正是该论文记录的失败模式。
- 来源：https://arxiv.org/abs/2303.03283 ；https://dl.acm.org/doi/10.1145/3637875

## 2. Mixed-Initiative Interaction

### Horvitz — Principles of Mixed-Initiative UI（CHI 1999，奠基之作）
- Agent 界面的命名问题：**乱猜用户目标、不做成本/收益权衡、时机糟糕、缺少用户引导/修正机制**。
- 关键原则：① 只自动化显著增值的部分；② 显式建模对用户目标的不确定性，用对话消解关键不确定而非按猜测行动；③ 考虑用户**注意力状态**再决定时机；④ 权衡"现在行动 vs 推迟"；⑤ 最小化**无谓打扰**成本（误报建议的成本不对称于漏报）；⑥ 提供高效修正 + undo；⑦ 从反馈中持续学习时机与推断。
- 启示：问题不是"AI 该不该推送"，而是"系统对注意力状态和不确定性的建模是否好到让推送净收益为正"——这是实证门槛，不是 UI 门槛。
- 来源：https://dl.acm.org/doi/10.1145/302979.303030 ；http://erichorvitz.com/mixedinit.htm

### Need Help? Designing Proactive AI Assistants for Programming（CHI 2025）
- 65 人随机实验：**主动协助让完成任务数提升 12–18%**，且当建议"给出带具体例子的明确答案"时被评为有帮助且不打扰。
- 启示：主动性的胜利条件是**立即可执行的具体性**（带集成预览），不是"存在"本身。
- 来源：https://arxiv.org/pdf/2410.04596 ；https://dl.acm.org/doi/full/10.1145/3706598.3714002

### Assistance or Disruption?（"Codellaborator"，CHI 2025）
- N=18 被试内实验：纯 proactive 条件**效率提升但工作流被显著打断**；**加上 presence 指示器 + 交互上下文展示后，打断感显著降低**、信任提升。
- 缓解之道不是"少推"，而是**"带可读上下文地推"**；同时标记了 user control / ownership / 代码理解的代价。
- 给出与任务阶段绑定的主动介入时机设计原则（不是简单的 idle 启发式）。
- 来源：https://arxiv.org/pdf/2502.18658 ；https://dl.acm.org/doi/10.1145/3706598.3713357

### Grounded Copilot（Barke et al. — OOPSLA 2023, Distinguished Paper）
- 20 人扎根理论研究：交互呈**双模态**——**acceleration mode**（用户知道要做什么，AI 帮打字：偏好小而快验证的建议以保心流）vs **exploration mode**（用户不确定方向，AI 拓选项：偏好大建议、觅食式浏览多候选、摘取片段）。
- 启示：单一 ambient push 行为对两种模式都错——需推断用户处于哪个模式并调整建议粒度；这是"何时不该推大建议"的可测试启发式。
- 来源：https://arxiv.org/abs/2206.15000

## 3. 中断与注意力代价

### Iqbal & Horvitz — Disruption and Recovery of Computing Tasks（CHI 2007，实地研究）
- 被打断后，用户**往往 10–15 分钟都没回到原任务**（先漂去无关任务）。
- 即使立即恢复，中断仍**显著拖慢主任务并提高错误率**。
- 在**自然任务边界（breakpoints）**打断，恢复延迟、挫败感和错误都显著更低。
- 反直觉发现：一味压制通知不是解药——用户会**自我中断**去主动查看，认知成本可能更高。目标是**打断得好**，不是零打断。
- 来源：http://erichorvitz.com/CHI_2007_Iqbal_Horvitz.pdf

### Interrupt Me（Computers in Human Behavior, 2016）
- **自我中断比外部定时中断更具破坏性**——"只让用户拉、永不推"并非默认安全设计；真正的设计杠杆是**中断质量/时机**，不是推 vs 拉的二元选择。
- 来源：https://www.sciencedirect.com/science/article/abs/pii/S0747563216304654

## 4. Sensemaking 与 PKM

### Pirolli & Card — 信息觅食 + Sensemaking 双环
- **觅食环**（找、滤、排、组织）与 **sensemaking 环**（把信息炼成 schema/假设/洞见）双向耦合，非线性管道。
- 人类按"单位成本信息增益"分配觅食精力，快速放弃低产出信息块。
- 启示：只返回"答案"的搜索只服务觅食环，对 sensemaking 环（合成为结构）毫无贡献。如果产品目标是"帮用户思考"，检索质量必要但不充分——更难也更稀缺的那半是帮用户把找到的笔记转成修订后的结构/洞见，即呈现"这和你已有的认知如何连接"而不只是"这些笔记匹配"。

### Barreau & Nardi — Finding and Reminding（SIGCHI Bulletin, 1995，经典 PIM 实证）
- 用户**强烈偏好位置式查找而非搜索**——位置携带"提醒（reminding）"功能（看到文件在原地会触发上下文/下一步记忆），搜索结果没有。
- 用户实践中**回避精细的归档/标签体系**；**归档很少**——大部分信息停留在 ephemeral / working 状态。
- 启示：反对"搜索将取代浏览"的纯押注——空间/结构线索（backlink、文件夹位置、最近可见性）承载的 reminding 功能是搜索替代不了的；**搜索和浏览是互补，不是替代层级**。

### More AI Assistance Reduces Cognitive Engagement（PACM HCI, 2025/2026）
- N=30 被试内实验，三条件：Minimal（原始转录）/ Intermediate（实时摘要，用户自己组笔记）/ Automated（AI 全自动出结构化笔记）。
- **Intermediate 学习/理解得分最高；全自动最低**——尽管用户因省力**更喜欢**全自动。
- 命名"AI Assistance Dilemma"：用户偏好的（最大自动化）恰恰对工具存在的目的（留存理解）伤害最大；甜点位是 AI 提供**用户仍需主动组织的原材料**。
- 佐证："ChatGPT produces more 'lazy' thinkers"（arXiv 2507.00181）——跨任务收敛证据。
- 启示：**这是对 ambient push 设计最有分量的一篇**——推"提示/脚手架/片段"（用户仍需补完或编辑后接受），不推成品段落。
- 来源：https://arxiv.org/pdf/2509.03392 ；https://dl.acm.org/doi/10.1145/3757632

## 5. AI 建议采纳行为

### Expectation vs. Experience（Vaithilingam et al. — CHI 2022）
- N=24：Copilot **没有提升完成时间或成功率**，但大多数人仍偏好用它——偏好与实测生产力背离。
- **5 个任务失败中 3 个由误导性建议直接导致**。
- Ghost text（常显灰字）比 lightbulb/菜单触发在可发现性/可用性上显著更好——**ghost text 作为交互模式本身被验证**，独立于生产力问题。
- 启示：ghost text 是好 UX 但有特定风险——流畅表象的错误建议被信任；要靠"短到一眼可验证"或不确定性提示来防御。
- 来源：https://dl.acm.org/doi/fullHtml/10.1145/3491101.3519665

### Understanding and Predicting Accepted Code Suggestions（PACM SE, 2025，66,329 条工业日志）
- 采纳由**该用户/项目的历史采纳率**（信任复利）、更长生成间隔、更短前置上下文等中介——**采纳不纯是建议质量的函数，是累积信任的函数**。
- 启示：冷启动用户信任系统性偏低；**onboarding 应先推几个高可读、易验证的建议把信任比率养起来**，再尝试更微妙/更长的建议。
- 来源：https://dl.acm.org/doi/abs/10.1145/3808125

### Do Users Write More Insecure Code with AI Assistants?（Perry et al. — CCS 2023）
- N=47：AI 辅助组 5 项任务中 4 项代码更不安全，**同时更相信自己的代码是安全的**——"虚假安全感"效应：AI 在场会劣化用户自身的校准能力。
- 投入更多精力写 prompt 的用户产出更安全——**参与度调节结果质量**（与第 4 节 Intermediate AI 发现同构）。
- 来源：https://arxiv.org/pdf/2211.03622

## 6. 量化"旅程顺滑度"

- **NASA-TLX**：6 维主观负荷（脑力/体力/时间压力/绩效/努力/挫败），Raw TLX 已成主流；适合逐旅程对比（如"搜索后阅读" vs "推送后接受"）。
- **GOMS/KLM**：从任务分解**预测**专家完成时间，不需要跑被试——适合**设计期**对比候选交互序列的按键+心智步骤成本（如 "ghost text→Tab 接受" vs "侧栏卡片→点击→粘贴"）。
- **Flow(FSS-2) + ESM**：心流 9 维度量表；**经验采样法（ESM）**在真实使用中打微型问卷，比事后回忆更适合验证"ambient push 是否破坏心流"（心流破坏的记忆衰减快且会被事后合理化）。注意 FSS-2 因子结构有效性受批评——只做自身条件间的相对比较，不当绝对数。
- **组合实践**：SUS + NASA-TLX + UEQ 互补；工业界摩擦检测模式——在交互日志上标注 **waiting / searching / retrying / scrolling / confusion / error / ambiguity** 微信号，汇总成宏观分。
- **对 Peak 的两层方案**：(a) 持续的遥测摩擦标注（每次真实 session 都有）；(b) 周期性人工评测（SUS+TLX+UEQ 或 FSS-2）验证遥测推断的摩擦与主观体验相关。
