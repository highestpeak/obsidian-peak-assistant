# 12 · AI 生成 HTML 与图片产物管理定位

> [返回上线前 TODO](../pre-launch-todo.md)
>
> 优先级：P1 · 条件式宣传任务
>
> 状态：候选产品叙事，尚未批准为当前公开主张
>
> 前置任务：[上线范围与历史任务审计](01-release-scope-and-task-audit.md)、[Owner Dogfood](05-owner-dogfood.md)、[网站与视频](06-website-and-demo-videos.md)

## 任务目标

为 Landing Page、README、发布帖和功能演示准备一条更具体的 HTML/Image 产品叙事：Codex、Claude Code 等 AI 编码工具会生成大量 HTML 报告、交互 mock、可视化、截图和图片，Peak Assistant 可以帮助用户把这些散落产物放回本地知识库中，进行浏览、整理、关联、规划和后续工作。

这不是简单宣传“支持 HTML 和图片格式”，而是回答一个真实问题：AI 生成了越来越多文件之后，用户如何保留上下文、找到它们、理解它们之间的关系，并继续推进项目。

## 1. 用户问题

- [ ] Codex、Claude Code 或其他 AI 工具持续生成 HTML 报告、设计 mock、研究页面、流程图、截图和候选图片。
- [ ] 这些产物容易散落在临时目录、session、浏览器标签页和聊天记录中。
- [ ] 用户很难知道某个文件对应哪个需求、源文档、实现任务或决策。
- [ ] 文件虽然已经生成，但没有真正进入可浏览、可检索、可维护的知识系统。
- [ ] 下一次继续工作时，用户往往需要重新解释上下文或重新寻找材料。

## 2. 候选话术

### 直接描述 AI 编码场景

- [ ] `Codex and Claude Code generate the artifacts. Peak Assistant helps you keep, review, connect, and continue them.`
- [ ] `A local workspace for the HTML reports, visualizations, and images your AI coding tools generate.`
- [ ] `Turn AI-generated HTML, images, and reports into an organized local workspace.`
- [ ] `Manage the output, not just the prompt.`
- [ ] `From generated files to a navigable knowledge system.`

### 不依赖品牌名称的版本

- [ ] `Your workspace for the files AI coding agents leave behind.`
- [ ] `Keep generated reports, visuals, and project context connected.`
- [ ] `Organize AI-generated artifacts alongside the knowledge and decisions that created them.`

最终页面可以把 Codex 和 Claude Code 作为用户熟悉的例子，但不能暗示 Peak Assistant 与这些产品存在官方集成、授权或合作关系。即使删除品牌名称，这条叙事也必须仍然成立。

## 3. 应该展示的真实流程

- [ ] AI 编码工具在 Vault 或项目目录中生成 HTML、截图或图片。
- [ ] Peak Assistant 发现文件，并在真实 File Workspace 中安全打开。
- [ ] 用户可以查看文件信息、来源、相关任务和关联材料。
- [ ] 用户可以通过 Search、File Atlas 或其他真实入口重新找到它。
- [ ] 用户可以把产物连接到需求、研究、Roadmap、源码或决策文档。
- [ ] 用户可以从产物继续进入 Composer、Chat Studio 或对应的后续工作面，而不必重新解释全部上下文。
- [ ] 如果版本、candidate review、批注或编辑能力已经上线，演示保存、比较、接受或恢复流程。

“规划你的知识库”应通过这个具体工作流表达：把生成产物作为项目材料和决策证据组织进知识库，而不是声称 Peak Assistant 会自动替用户设计完整的知识架构。

## 4. HTML 主张启用门槛

启用 HTML 工作区强主张前，至少需要证明：

- [ ] 已有普通用户可达的 production HTML File Workspace，而不只是 loader、index、spec 或 mock。
- [ ] HTML 在受控 sandbox 中打开，任意脚本不会进入 Obsidian 主窗口执行。
- [ ] 外部资源、本地资源、缺失资源和不安全内容具有清晰处理方式。
- [ ] 如果宣传 Source、Preview、Split 或编辑能力，这些模式已真实实现并可恢复。
- [ ] 用户可以从文件回到来源、任务或相关知识，而不只是孤立预览。
- [ ] 大型或复杂 HTML 的性能、失败状态和恢复路径通过 Owner Dogfood。
- [ ] 真实 Obsidian 中完成打开、导航、重开和持久化 E2E 验收。

如果当前仅支持读取、提取和索引 HTML，只能准确描述这些能力，不能宣传为完整的 HTML workspace 或 browser-like editing。

## 5. 图片主张启用门槛

启用图片工作区强主张前，至少需要证明：

- [ ] 已有普通用户可达的 production Image Workspace，而不只是附件预览或聊天中的单张图片。
- [ ] 用户可以稳定查看原图、文件信息、来源和相关材料。
- [ ] 如果宣传区域选择、AI 编辑、candidate review 或版本保存，对应闭环已真实可用。
- [ ] 编辑默认保护源文件，并清楚说明覆盖、另存版本和恢复规则。
- [ ] 常见尺寸、格式、缺失文件和大图性能通过 Owner Dogfood。
- [ ] 真实 Obsidian 中完成打开、查看、继续工作、保存和恢复 E2E 验收。

如果当前仅支持图片展示或引用，不能使用暗示完整编辑、审阅或版本管理的文案。

## 6. 知识库管理主张启用门槛

- [ ] HTML 和图片能够被 Search、File Atlas 或等效入口稳定发现。
- [ ] 用户可以看到或建立文件与项目、任务、来源和文档之间的关系。
- [ ] 文件身份、路径变化和重命名不会静默破坏关键关联。
- [ ] 用户能够将产物带入后续的 Composer、Chat Studio 或 agent 工作流。
- [ ] 系统明确区分用户拥有的源文件、AI 生成的 candidate 和可重建索引。
- [ ] 页面展示的“管理”动作与产品中真实可完成的动作一致。

## 7. 页面使用方式

- [ ] 用一个真实项目演示从 AI 生成文件到知识库内继续工作的完整过程。
- [ ] 优先展示“找到、理解、关联、继续”四个动作，不只展示格式预览。
- [ ] HTML 与图片分别使用真实产品截图或短视频，并标明 Preview、Beta 或已发布状态。
- [ ] 在功能卡中列出当前确实支持的格式和限制。
- [ ] 将 Codex、Claude Code 放在示例或 launch post 中，Hero 仍然讲 Peak Assistant 自身价值。
- [ ] 同时保留不依赖任何品牌名称的 evergreen 版本。
- [ ] 发布前核对产品名称、商标语境和是否需要免责声明。

## 8. 主张证据

每条被采用的文案都要记录：

- [ ] 对应的用户痛点和可观察结果。
- [ ] 当前源码入口和 runtime owner。
- [ ] 普通用户可达路径。
- [ ] 安全边界和已知限制。
- [ ] 真实 Obsidian 验收证据。
- [ ] Landing Page 使用的真实截图或演示视频。
- [ ] 最终批准的页面位置和状态标签。

## 完成条件

- [ ] 已选择一条品牌相关话术和一条品牌无关话术。
- [ ] HTML、图片和知识库管理三类主张分别具有 Go / No-Go。
- [ ] 被采用的话术与上线版本能力一致。
- [ ] 至少有一个真实项目证明生成产物可以被找到、关联并继续使用。
- [ ] 未达到门槛的编辑、版本或自动规划主张已经降级、延后或移除。
- [ ] 页面没有暗示与 Codex、Claude Code 或其所属公司存在官方关系。

## 不要做

- 不把 HTML/Image loader 或索引能力包装成完整的用户工作区。
- 不把任意生成 HTML 当成可信内容直接放入 Obsidian 主窗口执行。
- 不在实现仍处于 roadmap/spec 阶段时使用当前时态的强主张。
- 不把“整理项目材料”夸大成“自动规划整个知识库”。
- 不暗示 Peak Assistant 是 Codex 或 Claude Code 的官方配套产品。
- 不用 mock、静态页面或 build 通过冒充真实 Obsidian 交互验收。
