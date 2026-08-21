# 22 · Final Demo 与 One Continuous Context 场景

> [返回上线前 TODO](../pre-launch-todo.md)
>
> 优先级：P0/P1 · 最终产品叙事与演示
>
> 状态：待 Release Candidate 与公开主张冻结后制作
>
> 前置任务：[Owner Dogfood](05-owner-dogfood.md)、[Composer 多文件 Session 验收](20-composer-multi-file-mixed-file-session-qa.md)、[Graph 多视图演示](21-graph-multi-view-launch-showcase.md)、[Canvas/Excalidraw AI 编辑演示](23-canvas-excalidraw-native-ai-editing-showcase.md)
>
> 下游任务：[网站内容与首页演示视频](06-website-and-demo-videos.md)、[朋友试用与外部内容检查](07-external-beta.md)

## 任务目标

制作一个最终端到端 Demo，用一个自然、完整的真实任务呈现几乎所有公开核心操作。观众看到的应是一段工作如何在 Peak Assistant 中持续推进，而不是一组为了覆盖功能而拼接的按钮演示。

Demo 的核心主张是 **one continuous context**：用户在 AI Search 中建立的问题、来源和选择，进入 Graph 后仍然可解释；从 Graph 或 File Atlas 进入 Composer 后，同一任务的上下文、文件和证据继续可见，不需要用户重新描述问题或手工重新收集材料。

`One continuous context` 是当前工作名。最终英文表达需要在 Landing Page 文案阶段单独审查，但本任务先用它约束产品叙事和验收证据。

## 1. 暂定主场景

### 新材料到达后，更新一个正在推进的项目

用户已经在本地 Vault 中维护一个真实项目。新的研究笔记、用户反馈、网页报告或其他已支持材料进入知识库后，用户需要完成以下目标：

- 找出新材料与现有项目的关系。
- 识别冲突、桥梁和知识缺口。
- 更新项目的核心文档与相关文件。
- 审阅 AI 修改并保留可恢复的决策记录。
- 得到一个可以继续使用或分享的最终成果。

这个场景适合作为默认方向，因为它可以自然串联检索、关系理解、文档导航和实际修改。它同时符合“本地知识库中的个人助手”定位，而不需要虚构企业审批、团队 CRM 或与产品无关的工作流。

## 2. 场景定稿前的选择门

正式录制前比较不超过三个候选场景：

- **项目更新**：新研究与反馈到达后，更新项目 brief、README 或计划。
- **研究综合**：从分散资料中形成一份有来源的研究结论，并修订相关笔记。
- **知识库维护**：发现过期、断裂或缺少连接的内容，再完成修复与重组。

每个候选场景都要检查：

- [ ] 普通用户能在十秒内理解目标。
- [ ] AI Search、Graph 和 Composer 的出现都由任务需要推动。
- [ ] 至少一个关键发现只有通过 Graph 才容易看见。
- [ ] 最终产物值得修改多个文件，而不是为了演示强行拆分。
- [ ] 可以自然展示失败、审阅或撤销，而不破坏故事节奏。
- [ ] Demo Vault 可以公开，不包含私人内容或难解释的内部术语。

默认优先选择“项目更新”。只有其他候选明显更自然、更能体现 Release Candidate 的真实优势时才更换。

## 3. 主叙事流程

### Scene 0 · 明确任务

- [ ] 从 Home、Command Gateway 或最终批准的稳定入口开始。
- [ ] 用户用一句自然语言说明目标，例如：`New feedback and research arrived. Help me update the launch brief and related project files.`
- [ ] 画面清楚显示本次 task/session 已建立。
- [ ] 初始上下文只包含用户明确选择的项目和材料，不假装系统知道一切。

### Scene 1 · AI Search 找到证据

- [ ] 使用 AI Search 查找与目标相关的新材料、旧决策和冲突信息。
- [ ] 展示 query plan、来源或等价的可解释过程，但不长时间停留在内部 trace。
- [ ] 打开至少一个关键结果，证明来源真实存在。
- [ ] 将有价值的结果加入当前 task context。
- [ ] 明确展示哪些内容是搜索结果，哪些已经成为用户选择的上下文。

### Scene 2 · Graph 理解结构

- [ ] 从当前结果进入 Graph，不重新输入同一问题。
- [ ] 使用[Graph 多视图任务](21-graph-multi-view-launch-showcase.md)中已批准的视图。
- [ ] 至少完成一次 layout 或 lens 切换。
- [ ] 至少完成一次 structural/semantic relation 对比，前提是该能力已通过验收。
- [ ] 找到一个与任务直接相关的 bridge、cluster、timeline 或 gap。
- [ ] 选择真实 node/edge，并打开来源、inspector 或相关文件。

### Scene 3 · File Atlas 检查工作上下文

- [ ] 围绕一个关键文件查看 local 或 two-hop neighborhood。
- [ ] 证明 Graph 中的发现可以回到具体文件和可操作上下文。
- [ ] 将需要处理的文件加入当前工作集合。
- [ ] 不因为浏览相关文件而自动授予写权限。

### Scene 4 · Composer 延续同一任务

- [ ] 从 Search、Graph 或 File Atlas handoff 进入 Composer。
- [ ] 同一个 task/session、选定来源和文件集合继续存在。
- [ ] 用户不需要重新粘贴 prompt 或重新解释目标。
- [ ] Composer 针对真实文档产生 anchored candidate/diff。
- [ ] 若[多文件 Session 验收](20-composer-multi-file-mixed-file-session-qa.md)完整通过，同一个 run 修改两个或更多文件。
- [ ] 若 mixed-file editing 通过，加入一个自然的跨类型修改；否则明确只演示已验证类型。
- [ ] 若[Canvas/Excalidraw 专项验收](23-canvas-excalidraw-native-ai-editing-showcase.md)通过，让同一任务基于前面的 Graph 发现更新项目画布或草图。

### Scene 5 · 审阅、调整与恢复

- [ ] 用户接受一个 change。
- [ ] 用户拒绝或改写另一个 change。
- [ ] 展示 stale、Undo、History 或 rollback 中最能说明可信度的一项。
- [ ] 从 accepted transaction 返回来源 task/run，证明结果仍有上下文。
- [ ] 不把所有 AI 输出自动写入 source。

### Scene 6 · 回到结果

- [ ] 打开更新后的核心产物。
- [ ] 简短对照任务开始前后的变化。
- [ ] 展示仍保留的来源、Graph 发现和 History。
- [ ] 用一句结果导向文案收束，而不是以 Settings 或功能菜单结束。

## 4. Continuous Context 证据合同

“同一上下文延续”不能只靠旁白声称。视频和真实验收至少要证明：

- [ ] Search run、Graph selection 和 Composer task 具有可追踪的 identity 或 handoff reference。
- [ ] Search 中选择的来源在 Graph 或 Composer 中仍可识别。
- [ ] Graph 中选中的 node/edge 能定位到真实文件、来源或关系证据。
- [ ] Composer 显示的是同一 task 的 context，而不是重新构造的相似列表。
- [ ] 浏览文件不会静默扩大 write permission。
- [ ] 返回上一个 surface 后，query、selection、viewport 或等价工作状态按产品约定恢复。
- [ ] 插件 reload 后，承诺持久化的 task、artifact 和 History 可以恢复。

可以在画面中使用短字幕帮助观众识别上下文延续，例如：

- `Same task, same sources.`
- `Search became context—not copy and paste.`
- `From evidence to relationships to reviewed edits.`

这些字幕只作为候选，最终由公开英文文案任务统一定稿。

## 5. “几乎所有操作”的范围

最终 Demo 覆盖的是所有**公开核心用户能力**，不是每个设置项、菜单项或失败分支。录制前建立一次 Release Candidate coverage map。

### 主线必须覆盖

- [ ] 稳定任务入口或 Command Gateway。
- [ ] AI Search。
- [ ] Graph 入口、关键视图切换和真实后续动作。
- [ ] File Atlas 或等价的具体文件上下文检查。
- [ ] Composer 的 candidate、diff 和 accept/reject。
- [ ] History、Undo 或 rollback。
- [ ] source/provenance 和 context continuity。

### 条件式加入

- [ ] Chat Studio：只有当它承担场景中的讨论或结果解释时加入。
- [ ] Peak Sheet：只有当结构化材料和 typed edit 对任务自然有用时加入。
- [ ] HTML/Image Workspace：只有当场景本身包含这些材料且能力通过验收时加入。
- [ ] Canvas/Excalidraw：使用[任务 23](23-canvas-excalidraw-native-ai-editing-showcase.md)中已经通过的原生 typed operations。
- [ ] Gemma 4：只有[本地模型专项验收](24-local-model-gemma4-launch-positioning.md)通过后，才让它自然承担一个主线步骤。
- [ ] Vault Intelligence：只有当它自然发现本次需要处理的问题时加入。
- [ ] 多文件与混合文件编辑：严格跟随[任务 20](20-composer-multi-file-mixed-file-session-qa.md)的能力分级。

### 不进入主线

- 安装、API key 和完整 Settings 浏览。
- 所有空状态与错误矩阵。
- 仅供开发或调试的 surface。
- 与场景无关、只是为了增加功能数量的操作。

这些内容可以放入 Quick Start、专项视频或 Troubleshooting，不必破坏最终 Demo 的故事。

## 6. 节奏与成片结构

- [ ] 完整版控制在能讲清故事的最短长度，暂定 5–8 分钟。
- [ ] 开头 15 秒内说明用户目标和最终价值。
- [ ] 每次 surface 切换前都由当前问题自然推动。
- [ ] 删除重复等待、无意义鼠标移动和重复解释。
- [ ] 保留关键生成、切换和 review 的真实状态，不伪造瞬时完成。
- [ ] 从完整版裁出首页短循环、Graph 专项片段和社区短视频。
- [ ] 短版可以省略步骤，但不能改变因果关系或扩大能力主张。

## 7. Demo Vault 与最终产物

- [ ] Vault 使用公开、安全并允许长期复用的内容。
- [ ] 数据同时支持 AI Search 结果、Graph 结构和可验证的 Composer 修改。
- [ ] 新材料与旧项目之间存在一个真实冲突或变化。
- [ ] 至少存在一个 bridge 或 gap，确保 Graph 不是装饰。
- [ ] 核心文档在修改前后都有可读版本。
- [ ] 准备与主任务直接相关的 Canvas 或 Excalidraw fixture，避免为了炫技插入无关画布。
- [ ] 所有文件类型与写回方式匹配首发 capability matrix。
- [ ] 固定版本、commit、主题、窗口、模型和网络条件。
- [ ] 为所有关键节点保存 source SHA、截图和必要视频证据。

## 8. 朋友试用与叙事验证

将 rough cut 或现场演示交给未参与开发的朋友，询问：

- [ ] 他能否复述用户一开始要完成的任务。
- [ ] 他能否解释为什么需要 AI Search。
- [ ] 他能否解释 Graph 切换带来了什么新理解。
- [ ] 他能否看出 Composer 沿用了此前上下文。
- [ ] 他是否知道哪些修改已接受，哪些没有写入。
- [ ] 他能否说出 Peak Assistant 与普通聊天窗口的差异。

如果试用者只记住“功能很多”或“Graph 很漂亮”，但无法复述任务和上下文延续，说明叙事仍未通过。

## 完成条件

- [ ] 一个主场景已经定稿，并由完整脚本、fixture 和 capability coverage map 支撑。
- [ ] Demo 在一个连续故事中覆盖 AI Search、Graph、File Atlas 和 Composer。
- [ ] `one continuous context` 具有可见、可追踪的产品证据。
- [ ] 所有进入成片的功能均来自同一个冻结 Release Candidate。
- [ ] 多文件、混合类型、Graph 视图和 Canvas/Excalidraw 原生编辑主张与各自专项验收一致。
- [ ] 朋友试用者能理解故事、关键发现和最终结果。
- [ ] 完整版、首页短版和社区切片之间不存在能力矛盾。

## 不要做

- 不把最终 Demo 拍成菜单和按钮巡礼。
- 不为覆盖功能而频繁切换无关任务。
- 不在每个 surface 重新输入同一 prompt，再把它称为连续上下文。
- 不用旁白掩盖 context handoff 实际丢失。
- 不把 Graph 当作过场动画或背景装饰。
- 不自动接受所有 AI change 来让流程看起来更快。
- 不把尚未通过专项验收的功能剪进最终成片。
