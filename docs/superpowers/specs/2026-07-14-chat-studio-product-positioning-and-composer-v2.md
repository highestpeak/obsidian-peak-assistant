# Chat Studio 产品定位与 Composer V2 交互规格

> **权威边界：**本文保留产品定位、设计 rationale 和评审历史，不是当前实施 master。实施以 [`2026-07-15-chat-studio-complete-implementation-spec.md`](./2026-07-15-chat-studio-complete-implementation-spec.md) 为准；两者冲突时以 master 为准，本文不能覆盖它。

日期：2026-07-14  
状态：Design-only，等待 owner 评审；不授权生产 React 实现  
交互稿：[`docs/gstack/chat-studio-interactive-2026-07-13/index.html`](../../gstack/chat-studio-interactive-2026-07-13/index.html)  
Composer 独立稿：[`composer-lab.html`](../../gstack/chat-studio-interactive-2026-07-13/composer-lab.html)
讨论总图：[`discussion-synthesis.md`](../../gstack/chat-studio-interactive-2026-07-13/discussion-synthesis.md)  
决策记录：[`decisions.md`](../../gstack/chat-studio-interactive-2026-07-13/decisions.md)

## 1. 研究边界

本轮依据包括：

- owner 对现有 Chat Studio 的逐点反馈；
- Peak Assistant 本地 Chat、Composer、Context、Message Renderer、Conversation Index 能力盘点；
- ChatGPT、Codex、Claude、Gemini、Perplexity、NotebookLM 的官方产品资料；
- Human-AI Interaction 与 mixed-initiative 交互原则。

这属于 **产品考古 + 竞品桌面研究 + HCI 文献分析**，不是已完成的外部用户访谈。本文中的用户需求判断是待验证的产品假设，不应写成“用户研究已经证明”。

## 2. 一句话结论

> Peak Chat Studio 是一个以 Vault 为长期记忆、以对话为临时工作台、以可追溯产物为结果的知识工作空间。

它不应成为：

- 通用 ChatGPT 克隆；
- 模型提供商控制台；
- 默认暴露大量 Agent / Persona 的市场；
- 与 Obsidian Quick Search 重复的搜索产品；
- 生成答案后与 Vault 失联的聊天孤岛。

## 3. Chat 模式真正的价值

Vault 擅长长期存储、链接、检索和再次编辑，但不擅长表达模糊意图、临时组合多份材料、在不确定条件下迭代结果。Chat Studio 的价值是补上这一段：

```text
定位项目
  → 声明本轮证据边界
  → 用自然语言描述想得到的结果
  → 自动计划 / 检索 / 生成
  → 检查来源、过程与产物
  → 追问、纠正或分支
  → 保存、链接或更新 Vault
  → 下次从项目与产物继续
```

如果最后一步不能稳定回到 Vault，Chat 就只是一次性问答；如果第一步不能继承 Vault 和项目上下文，Chat 就没有 Peak 的差异化。

## 4. 五个核心用户工作

### 4.1 Recall：从已有材料中找回事实

例：从项目文档中找出证据最完整的三段面试经历。  
关键能力：项目范围、Vault 检索、引用定位、hover preview、证据不足提示。

### 4.2 Synthesize：跨材料建立结构

例：把多份架构文档整理成决策地图。  
关键能力：多资源输入、来源边界、表格/图表、分段追问、保存结构化结果。

### 4.3 Create：生成可继续使用的产物

例：生成 Markdown、DOCX、图片、Excalidraw 或 Base。  
关键能力：产物回执、预览、版本、保存位置、打开/继续编辑。

### 4.4 Maintain：更新知识而非复制答案

例：把本轮结论写回已有笔记并标出差异。  
关键能力：目标文件、Diff、权限、回滚、变更回执。

### 4.5 Research：在本地证据不足时补充外部资料

例：以 Vault 为基线，核对竞品的最新官方能力。  
关键能力：Web 授权、来源选择、研究计划、引用、事实/推断分离。

## 5. 用户的心智模型

用户在发送前实际只需要回答三个问题；模型覆盖是可选项，不是每次必填：

1. **我要得到什么？** —— 消息正文。
2. **这轮明确带了什么？** —— context shelf 中的附件、Vault 文档、链接或 reply anchor。
3. **除当前项目外，还允许去哪里找证据？** —— Vault Search 与 Web Search 是两个可独立开启、可同时开启的扩展来源。

模型、助手、工具和权限是二级或按需问题：

- **模型**是引擎；默认使用当前对话模型或默认 Agent Profile，用户可搜索并手动固定具体模型。
- **助手**是长期可复用的身份、规则、默认知识和允许工具；选择后成为当前对话默认，默认助手不露出，非默认助手必须在 Composer 回显。
- **工作流**是完成任务的方法，通过 `/` 调用，例如研究、规划、生成图片或文档。
- **权限**只在真实动作发生时出现，而不是常驻开关。

## 6. Composer V2 信息架构

```text
┌ explicit context shelf: 只在有内容时出现 ┐
│ reply anchor / [[Vault doc]] / file / URL │
├──────────────────────────────────────────┤
│ 问你的项目、资料或当前工作…               │
├──────────────────────────────────────────┤
│ +   项目上下文            自动模型          ↑ │
└──────────────────────────────────────────┘
```

新对话且没有消息时，Composer 位于可视区域中部，和短问候 `今天想推进什么？`、一句范围说明及最多三个 Peak 知识工作起点形成一个起点。建议覆盖继续最近工作、总结最近笔记、查找相关材料；点击只填入可编辑草稿，不自动发送，出现草稿后建议退场。这里借鉴的是当前对话产品的“短问候 + 起始建议”心智，不复制竞品皮肤或承诺某个固定英文文案。项目主页同样属于启动/恢复态，并沿用同一模型：`今天想在这个项目里推进什么？`、项目范围说明、同一个 Composer，以及继续项目工作 / 总结项目进展 / 规划下一步三个项目化起点。Composer 内联在项目身份摘要之后、项目集合之前；进入具体对话或发送第一条消息后，同一个 Composer 再回到底部固定位置。空态不应迫使用户先扫过一整块无内容的聊天区域，也不应在项目主页底部制造一个与上方 Dashboard 分离的输入孤岛。

### 6.1 语法所有权

| 语法 | 唯一含义 | 不应承担 |
|---|---|---|
| `[[` | 选择 Vault 文档或文件夹 | 助手、项目、命令 |
| `/` | 调用工作流或明确动作 | 模型、Persona |
| `@` | 暂不占用；未来只在存在真实助手/应用提及源时启用 | 与 `[[` 重复搜索 Vault |

### 6.2 添加菜单

只放本轮新增资源：

- 文件或图片；
- Vault 文档（复用 `[[` 选择器）；
- 链接。

`+` 不承载 Web Search、模型、助手或生成动作。Web 只由“来源”控制；研究、规划、生成图片、生成文档等工作流只由 `/` 调用。鼠标入口与键盘语法若指向同一能力，必须打开同一个 surface 并更新同一份状态。

### 6.3 来源范围

**当前项目不是三选一中的一个来源，而是项目对话的基础上下文。** 显式引用的文档仍随消息发送。用户可以在此基础上独立组合：

- **Vault Search**：允许检索项目之外的 Vault 文档；
- **Web Search**：允许补充外部最新来源；
- 两者都关闭：只使用项目资料与显式引用；
- 两者都开启：项目资料为基线，同时允许 Vault 与 Web 扩展。

项目上下文使用固定状态徽标（例如“始终”），不使用 disabled-but-on switch；Vault Search 与 Web Search 使用独立 switch/check 状态。触发器摘要可显示 `项目上下文 + Vault + Web`。来源控制不等于附件、不等于工作流、不等于模型。

### 6.4 模型与运行边界

Composer 一级只显示当前实际生效的模型状态：**自动模型**或被固定的具体模型。这里的“自动模型”明确指当前对话模型覆盖优先，否则回落到默认 Agent Profile；它不暗示已经存在按任务/附件智能路由。模型列表必须支持：

- 自动模型；
- 搜索 Profile 名称、Provider 和 model id；
- 按 catalog 声明的 vision、tools、reasoning、PDF、本地等 capability 多选筛选；多个能力使用 AND 语义；
- 按 context window 门槛筛选，例如全部、至少 128K、至少 1M；未知 context 不通过正向门槛；
- 按已启用的 **Profile** 分组，同一 Provider 下的不同 Profile 不得被压扁成一组；
- 明确选择一个具体模型；
- 手动覆盖状态回显；
- 一键恢复自动推荐。

每个模型条目只展示真实 metadata：Provider/Profile、model id、context window，以及 vision、PDF input、tools、web search、reasoning、image generation 等 capability。没有 metadata 时写“未知”或不显示，禁止从模型名猜测。当前 catalog 没有声明 `imageGeneration: true` 时，设计稿也不能伪造“可生成图片”标签。

生产实现必须从现有 model catalog、TemplateManager runtime override、已启用 Profile 和 Provider 可用性数据驱动；HTML mock 中出现的模型名称只是用于验证选择层级与回显，不是内置名单规格。

以下三个概念不能再合并成“快速 / 平衡 / 最佳”：

1. **Settings Recommended setup**：Balanced / Lowest cost / Research quality / Local-private / Manual 是设置页的推荐配置概念；当前不是 Composer 的逐条运行状态。
2. **Harness tiers**：`local-fast → local-deep → online` 属于 Vault Search / Followup Agent 的执行升级路径，不是普通 Chat 模型档位。
3. **Reasoning / output control**：Low / Medium / High 与 verbosity 属于模型输出控制；只有在请求链路真实消费并可验证时才允许在 Composer 出现。

因此本轮 Composer 不展示“快速 / 平衡 / 最佳”，也不展示尚未完整接线的 reasoning/verbosity 控件。未来接入时，应以模型 capability 和真实请求回执为准，而不是重新造一套含义模糊的三档按钮。

二级“助手”列表支持：

- 默认助手；
- 已保存的自定义助手；
- “用 AI 创建助手”。

助手选择是**当前对话级默认**，不是“仅下一条消息”的运行参数。选择非默认助手后，Composer shelf 必须持续显示 `对话助手 · 名称`；恢复默认助手后该 chip 消失。助手选择器必须支持搜索，并按默认、自定义/已保存等稳定分组展示。

### 6.5 AI 创建助手

创建入口采用 **prompt-first**：先用一个足够大的自然语言输入让用户说明“希望助手如何帮助我”，AI 只生成可检查的草稿，不能直接静默保存。

首屏只需要：

- 自然语言说明；
- 生成草稿；
- 草稿名称与一句话行为摘要；
- 预览、继续修改、保存。

默认知识、允许工具、推荐模型和更细的行为规则放进“高级设置”，由 AI 从 prompt 提议，用户按需展开修改。它们不是创建助手前必须逐项填写的固定表单。流程：自然语言描述 → AI 生成草稿 → 用户检查/可选高级设置 → 预览对话 → 保存。

## 7. 左、中、右三栏职责

### 左栏：恢复工作，而不是展示全部数据

顺序：新对话、搜索知识库、置顶、项目、最近。  
“搜索知识库”直接调用现有生产 `QuickSearchModal`。Chat Studio 不拥有也不重画其中的 Vault Search、AI Search、Vault Intelligence、Refine、结果视图或运行状态；文件型 HTML mock 只能显示一条明确标注为“不会出现在产品中”的 handoff receipt。责任解释为：Vault Search = Raw retrieval，AI Search = Generative synthesis，Vault Intelligence = Vault-wide review；这只是文档语义，不改生产 Tab 名。`[[` 使用独立的紧凑 Vault 文档选择器，只负责回填显式上下文。“查看全部”属于最近对话 section header，打开单独的 conversation title filter；它不冒充 Vault Search，也不默认承诺消息正文全文检索。该 Picker 允许按生产 `ConversationType` 的 `chat / agent / plan / canvas / template / custom` 单选过滤，类型与标题查询采用 AND 语义。项目归属、主题图标、`/研究` 等单轮工作流不是 ConversationType；重复 id 去重，HTML 设计文档排除，重新打开恢复“全部”。

行菜单：必须有不透明 surface、边框、阴影、分隔线和单一动作名称。“置顶”与“取消置顶”根据当前状态互斥，不写成“置顶 / 取消置顶”。项目行的 disclosure 与 navigation 必须拆开：chevron 只展开，项目名只打开项目主页。

项目主页：展示紧凑的项目身份、同行统计摘要以及 Conversations / Starred / Resources / Plans。不得把完整主页削成稀疏的最近工作列表；“不堆砌”通过弱化统计容器、收紧间距与列表密度实现，不通过删除项目能力实现。Hero 只保留主动作“新对话”，但项目说明文本本身是可发现的就地编辑入口：hover / focus 显示铅笔，点击后在原位置进入 textarea；AI 改写与人工修改共用同一草稿和保存边界，AI 结果不自动覆盖。项目 Composer 继承项目归属，但不继承上一条消息的临时 workflow、附件、Assistant、模型覆盖或 Vault/Web switch；它位于项目摘要与集合导航之间，成为页面的主要启动动作，而不是固定在长空白之后。Plans 是持久项目状态，生产实现前必须先定义 schema、storage 和 ownership。

### 中栏：当前任务与结果

- 默认助手只有一个时不显示身份头；
- 只有自定义助手、多 Agent handoff、模型切换归属或调试上下文才显示身份；
- 富文本仍属于正文，不把所有表格、代码和图表包装成 Artifact 卡；
- 生成文件、图片、Drawing、Base 等可继续使用的结果才用 Artifact receipt；
- 标题重新生成使用“思考 → 可见逐字输入 → 完成”，不隐藏中间文字。

定向追问：消息动作设置 reply anchor，主 Composer 承担输入。禁止在每条消息内部复制第二个 Composer。

消息动作：Copy、Retry、Star、Branch、Trace 是始终保留的核心动作，极窄时允许隐藏标签但不允许把动作移入 More。定向追问、Save to Vault、View raw、Copy Markdown、Copy JSON 是按顺序排列的自适应动作；空间不足时从最低优先级 JSON 开始反向压入 More。More 只在至少一个动作被隐藏时出现，只列当前隐藏项，宽度足够时消失，禁止与 inline 动作重复。Suggested next 最多展示两个 inline 建议，其余进入独立 More；其中将继续追问与改写、清单、保存、自定义追问分组。选择建议只回填 Composer，禁止自动发送。

### 右栏：当前工作的导航地图

出现条件是**存在当前会话**。项目主页已经在中栏拥有 Conversations / Starred / Resources / Plans，不显示右栏或可聚焦 splitter；打开项目中的具体会话后恢复。右栏不得复制项目集合导航。

两个视图：

- **大纲**：按对话主题组织消息与过程节点；
- **资源**：本轮引用与本轮生成，按方向与类型筛选。

类型/方向过滤只在 **资源** 视图出现。大纲视图首行不放一个孤立 filter 按钮；若未来需要大纲层级控制，应作为完整的大纲工具组单独设计。

右栏条目必须定位真实 DOM 目标，不允许所有条目都滚到顶部。定位后短暂高亮，滚动过程中应能建立当前位置反馈。

类型筛选至少覆盖：消息、图片、文档、链接、知识库上下文、表格/数据、代码/Diff、图表、Canvas/Drawing、Bases、运行过程。

## 8. 竞品结论及 Peak 取舍

| 参考 | 值得学习 | Peak 不照搬 |
|---|---|---|
| ChatGPT | 默认自动路由；项目上下文；复杂能力渐进展开；分支与历史搜索 | 把所有能力塞进 `+` 或模型菜单 |
| Codex | 项目绑定的线程；运行中 steer；产物与 review；动作发生时授权 | 代码环境/权限常驻在普通知识 Chat |
| Claude | 模型与 effort 相邻；Project knowledge；Artifact 独立持续编辑 | 普通 Markdown 内容一律 Artifact 化 |
| Gemini | 可选具体模型；AI 创建 Gems；Deep Research 来源选择 | 把角色、模型和工作流合并成一种 mode |
| Perplexity | 自动最佳模型与手动模型并存；研究模式关注来源 | 把 Chat 变成纯搜索答案页 |
| NotebookLM | source selection；引用 hover 与原文定位；保存为 Note | 封闭在上传 source 集合里，失去 Vault 全局连接 |

## 9. HCI 原则映射

依据 Amershi 等人的 Human-AI Interaction Guidelines、Horvitz mixed-initiative 原则与 Google PAIR mental-model guidance：

- 开始前说明能力与证据范围，而不是让用户猜；
- 让用户高效调用、打断、纠正与恢复；
- 系统不确定时缩小范围并解释原因；
- 默认自动化必须可见、可逆、可覆盖；
- 渐进披露复杂功能，不要求用户先理解内部技术；
- 每次动作后给与用户目标一致的结果回执。

## 10. 本地能力与缺口

### 已有优势

- 项目和 Chat 持续上下文；
- Vault 文档检索、附件、hover preview；
- 图片、PDF、Office、链接等输入渲染；
- Markdown、代码、表格、Mermaid、数学、wikilink、Base 输出；
- 模型/Provider、tool、streaming、error 等运行信息，以及部分 reasoning/output-control 状态基础；
- exact model persistence 的基础设施。

### 真实运行边界

本文和 HTML 都是 **design proposal**。它们可以验证信息层级、状态回显和交互路径，不能证明生产运行链路已经支持对应行为。

| 设计概念 | 当前真实边界 | 实现前置条件 |
|---|---|---|
| 自动模型 | 当前对话覆盖，否则默认 Agent Profile | 不得文案化为按任务/附件智能路由，除非路由器真实存在 |
| 具体模型 | 已有 `{profileId, modelId}` 与 catalog/runtime override 基础 | UI 必须从启用 Profile 与 capability metadata 数据驱动 |
| Vault / Web 来源 | 现有能力可作为独立开关表达 | 请求回执需证明本轮实际启用了哪些来源 |
| reasoning / verbosity | 有设置与持久化概念，但不能据此假定 provider 请求已消费 | 端到端接线、Provider 支持检测、回执和测试完成后才在 Composer 暴露 |
| 自定义助手 | 本轮为产品交互提案 | 需要 durable contract、存储、当前对话绑定与工具授权模型 |
| 资源类型/产物 | 部分已有 renderer，部分只是 proposal | 先定义真实 receipt/data contract，再承诺保存、打开与版本能力 |

### 需要优先补齐

1. Composer 清晰的信息架构与具体模型选择 UI；
2. 定向追问复用主 Composer；
3. 完整消息 More 菜单与分组式 Suggested next；
4. 项目 disclosure/navigation 拆分和项目主页；
5. 右栏真实导航、方向/类型过滤与 scroll spy；
6. 产物数据契约与保存/打开/版本回执；
7. AI 创建助手的 prompt-first 草稿与可选高级设置；
8. 证据引用、定位与“写回 Vault”闭环。

### 暂不投入

- 公共助手商店；
- 常驻 Provider/temperature/token 控制台；
- 与 Vault Search 重复的第二套全文搜索；
- 每条回答重复 Assistant/Peak 身份；
- 每个 tool 都在 Composer 放图标；
- 内嵌 follow-up Composer；
- 未有真实 source 前占用 `@`。

## 11. 优先级

### P0：先验证核心心智

- Composer V2 的正文、显式上下文、扩展来源与可选模型覆盖；
- Auto + specific model；
- Project 基础上下文 + Vault/Web 独立来源开关；
- reply anchor；
- 右栏大纲/资源与真实定位；
- 菜单和标题动效的基础完成度。

### P1：形成 Peak 闭环

- citation/source bundle；
- Artifact receipt、版本与写回 Vault；
- Assistant builder；
- 运行中 steer、权限和恢复；
- 当前项目与全 Vault 的检索解释。

### P2：规模化与专业场景

- 多 Agent handoff；
- 多产物 bundle；
- Diff/patch review；
- 项目模板与可复用工作流；
- 复杂运行 trace 的专业视图。

## 12. 下一轮用户验证

建议用 5 位真实知识库用户完成任务式可用性测试，而不是询问“喜欢哪个 UI”：

1. 只根据一个项目的三份文档回答问题；
2. 从 Chat Studio 调用原生 Quick Search，并能区分该入口、Composer 的 Vault/Web 来源开关、`[[` 文档选择和对话标题筛选；
3. 从自动模型切换到具体模型，再恢复自动；
4. 用能力和上下文门槛筛出可接受模型，再清除筛选；
5. 对一条旧回答查看 raw、复制 Markdown，并定向追问；
6. 从项目展开箭头和项目名分别完成“展开”和“进入项目主页”，再查看项目资源与计划；
7. 找到本轮生成的文档并保存回 Vault；
8. 用一段自然语言创建一个证据优先助手，搜索并重新选择它，再按需检查高级设置。

观察指标：

- 首次成功发送时间；
- 是否能正确解释附件、来源、工作流、模型、助手的区别；
- 错误进入错误菜单的次数；
- 生成结果回到 Vault 的完成率；
- 中断、纠正和恢复成功率；
- 任务结束后是否知道“下一次从哪里继续”。

## 13. 参考资料

- [ChatGPT Projects](https://help.openai.com/en/articles/10169521-using-projects-in-chatgpt)
- [Creating a GPT](https://help.openai.com/en/articles/8554397-creating-a-custom-gpt)
- [Deep research in ChatGPT](https://help.openai.com/en/articles/10500283-deep-research)
- [Introducing the Codex app](https://openai.com/index/introducing-the-codex-app/)
- [Claude model, effort, and thinking settings](https://support.claude.com/en/articles/8664678-change-the-model-effort-and-thinking-settings)
- [Claude Projects](https://support.claude.com/en/articles/9519177-how-can-i-create-and-manage-projects)
- [Gemini Deep Research](https://support.google.com/gemini/answer/15719111?hl=en)
- [Perplexity Research mode](https://www.perplexity.ai/help-center/en/articles/10738684-what-is-research-mode)
- [Perplexity Pro Search](https://www.perplexity.ai/help-center/en/articles/10352903-what-is-pro-search)
- [NotebookLM citations](https://support.google.com/notebooklm/answer/16179559?hl=en)
- [Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/wp-content/uploads/2019/01/Guidelines-for-Human-AI-Interaction-camera-ready.pdf)
- [Principles of Mixed-Initiative User Interfaces](https://www.microsoft.com/en-us/research/wp-content/uploads/2016/11/chi99horvitz.pdf)
- [Google PAIR: Mental Models](https://pair.withgoogle.com/guidebook-v2/chapter/mental-models/)
