# Chat Studio UI/UX 讨论总图

日期：2026-07-14  
状态：Owner discussion synthesis；设计基线，不授权生产 React 实现  
交互稿：[`index.html`](./index.html)  
Composer 独立稿：[`composer-lab.html`](./composer-lab.html)
实施 master：[`2026-07-15-chat-studio-complete-implementation-spec.md`](../../superpowers/specs/2026-07-15-chat-studio-complete-implementation-spec.md)  
权威边界：本文只保留讨论 rationale、owner 决策语境和历史证据；与 implementation master 冲突时以 master 为准，本文不能覆盖它。

## 1. 这份文档解决什么

Chat Studio 的讨论跨越了当前实现、视觉反馈、交互提案、运行时核查和产品定位。为了避免把“现在已经有的能力”和“设计稿想验证的能力”写成同一件事，文档责任固定如下：

| 文档 | 唯一责任 | 不承担 |
|---|---|---|
| [`2026-07-15-chat-studio-complete-implementation-spec.md`](../../superpowers/specs/2026-07-15-chat-studio-complete-implementation-spec.md) | 完整目标、功能/数据契约、实施 DAG 与验收 | 不承担历史讨论逐轮记录 |
| [`11-feature-chat-studio-ui-ux.html`](../../11-feature-chat-studio-ui-ux.html) | 当前生产 Chat Studio 的三栏结构、状态与代码证据 | 不把设计稿写成已上线能力 |
| [`11-feature-chat-context.html`](../../11-feature-chat-context.html) | 一次 Chat 请求如何组装消息、附件、项目、Vault/Web 与能力上下文 | 不详细定义三栏视觉与 Composer 菜单 |
| [`2026-07-14-chat-studio-product-positioning-and-composer-v2.md`](../../superpowers/specs/2026-07-14-chat-studio-product-positioning-and-composer-v2.md) | 目标产品定位、Composer V2、三栏职责、实现优先级 | 不记录每一轮反馈的来龙去脉 |
| [`decisions.md`](./decisions.md) | 已接受、已否定、待定的逐轮决策 | 不重复完整产品论证 |
| [`research-and-inventory.md`](./research-and-inventory.md) | 本地能力、运行时真相、竞品与 HCI 证据 | 不替代 owner 决策 |
| 本文 | 把全部讨论按用户心智和 UI surface 汇总，并把结论路由到上述文档 | 不成为第二份实现 spec |

发生冲突时，按“生产源码与当前功能文档（回答现在有什么）→ implementation master（回答要建什么）→ accepted decisions/rationale → HTML mock → 历史概念提案”的顺序判断。Mock 中看得见，不等于生产已接线。

## 2. 已锁定的产品定义

> Chat Studio 是以 Vault 为长期记忆、以对话为临时工作台、以可追溯产物为结果的三栏知识工作空间。

它不是通用 ChatGPT 克隆，不是 Provider 控制台，也不是 Quick Search 的替代品。它的核心闭环是：

```text
找到项目或历史会话
  → 明确本轮材料与可搜索范围
  → 对话中检索、分析、生成
  → 检查来源、过程和结果
  → 追问、纠正、分支
  → 保存、更新或链接回 Vault
  → 从项目和产物继续下一轮工作
```

## 3. 全局视觉与信息架构约束

以下结论不再作为视觉 variant 反复探索：

- 页面是独立 Chat Studio，不需要模拟 Obsidian 外壳。
- 保留左 / 中 / 右三栏，但三栏必须服务于同一段工作，不是三个子产品。
- 不展示 Peak logo、Peak 产品标题、吉祥物或装饰性品牌头。
- 延续项目现有 `--pk-*` token；竞品只提供交互参考，不直接换一套产品皮肤。
- 工作区保持紧凑：优先 4 / 8 / 12 / 16px 间距和 28–34px 导航行。
- 中栏阅读与 Composer 是视觉主角；左右栏降低噪音、允许折叠或调整宽度。
- 默认只展示当前任务需要的控制；复杂能力按需展开。
- Image Gen 只能探索局部视觉变量，不能取代 HTML 中的真实状态和交互验证。

## 4. 左栏：恢复工作

### 4.1 信息顺序

```text
新对话
搜索知识库
置顶
项目及项目内会话
最近对话 → 查看全部
```

### 4.2 已接受交互

- 需要足够多的真实项目、置顶和最近条目，才能验证密度、滚动和层级。
- “查看全部”位于最近对话区标题，打开只筛选已加载对话标题的独立 picker。Picker 可按生产已有的 `ConversationType` 单选过滤：`chat / agent / plan / canvas / template / custom`；搜索词与类型使用 AND 语义。项目归属、主题图标和 `/研究` 等单轮工作流都不是对话类型。重复 id 只保留一条，置顶的 HTML 设计文档不混入对话结果，重新打开时恢复“全部”。
- 项目行拆成两个明确目标：chevron 只展开/收起会话；项目名只打开项目主页，不能让一次点击同时导航和展开。
- 项目主页是长期工作的恢复面，继续承载项目身份、统计、项目对话、收藏、资源、计划和项目范围 Composer；不能为了“简洁”把它削成只剩两条最近工作和大片空白。密度优化采用缩小 Hero、把四格统计压成同行摘要、收紧 Tabs 与列表行。Hero 只保留主动作“新对话”，但描述文本本身可就地编辑：hover / focus 出现低噪音铅笔，进入同一 textarea；“AI 改写”只生成可继续修改的草稿，必须显式保存，取消则恢复原说明。项目态 Composer 跟随启动心智，内联在项目身份摘要之后、项目集合之前；进入具体会话后，同一个 Composer 才回到底部。计划属于项目持久状态，不能冒充单次 Agent run 的临时步骤。
- 行菜单必须是不透明 surface，使用状态特定的“置顶”或“取消置顶”，不能写成合并动作。
- 长标题省略，但 hover、选中态和时间信息仍需清楚。

### 4.3 Search 的真实边界

“搜索知识库”调用生产已有的 `QuickSearchModal`，Chat Studio 不重画其内部 UI。文档责任解释为：

- Vault Search = Raw retrieval；
- AI Search = Generative synthesis；
- Vault Intelligence = Vault-wide review。

这三个解释不改生产 Tab 名，也不代表 Chat Studio 拥有它们。文件型 mock 只显示明确标注为 mock-only 的 handoff receipt；不伪造 Web、Refine、Tree、Graph、结果列表或 Vault Intelligence 状态。

对话标题筛选和 Composer 的 `[[` 文档 picker 是两个更窄的独立 surface，不能冒充 Quick Search。

## 5. 中栏：当前任务与结果

### 5.1 线程身份

- Header 只突出会话标题与必要动作，不重复产品品牌。
- 标题重新生成必须经历“思考 → 可见逐字替换 → 完成”，不能只转一下图标。
- 只有默认助手时不显示 `AI Assistant` 身份头。
- 只有自定义助手、多 Agent handoff、模型归属变化或调试语境需要身份说明。

### 5.2 用户输入必须覆盖的类型

- 普通文字与 Markdown；
- 图片组合；
- PDF、DOCX、Markdown 和其他文件；
- URL 富预览；
- `[[wikilink]]` 与明确 Vault 文档；
- 项目级上下文；
- reply anchor / 对旧回答的定向追问。

知识库文档应允许 hover preview 或原文定位，但这属于真实 preview/navigation 能力，不应只画一张无法操作的卡。

### 5.3 回答与产物类型

普通富文本继续属于消息正文：段落、列表、表格、代码、Diff、数学、Mermaid 和 wikilink 不应全部套成 Artifact 卡。只有可继续使用、保存或打开的结果才使用产物回执，例如：

- 生成图片；
- Markdown / DOCX 等文档；
- Excalidraw / Canvas / Diagram；
- Obsidian Base 或结构化数据；
- patch / Diff 或其他有明确后续动作的结果。

每种回执必须说明真实状态和动作：预览、打开、保存位置、继续编辑、失败或等待授权。没有数据合同的能力只能标为 proposal。

### 5.4 过程、状态与消息动作

- reasoning、tool run、检索摘要和运行状态属于过程 disclosure，不与最终正文争夺主层级。
- Streaming、Error、Cancelled、Timeout 必须有不同且可恢复的状态。
- 回答操作栏采用真实宽度驱动的优先级溢出，而不是永久展示三点：Copy、Retry、Star、Branch、Trace 是不可移入 More 的核心动作，极窄时只收起文字标签；定向追问、Save to Vault、View raw、Copy Markdown、Copy JSON 按该优先级尽量直接展示，空间不足时从 JSON 开始反向收入 More。More 只列当前被压缩的动作，宽度足够时完全消失，不复制已显示按钮。
- “定向追问”设置 reply anchor 并聚焦主 Composer，不在消息内部复制第二个输入框。它是对生产 `Reply inline` 能力的目标交互改写，不是假装能力不存在。

### 5.5 Suggested next

- 最多两个高置信建议常驻在回答下方；选择后只填入主 Composer，不自动发送。
- `更多` 弹层分成“继续追问”和“处理这条回答”两组，避免把下一问、改写、清单、保存混在一条横向 chip 流里。
- 自定义追问复用同一个 reply anchor；保存动作必须给出 Vault 写回回执。

## 6. Composer：唯一输入路口

### 6.1 空态与活跃态

- 新对话没有消息时，Composer 位于中栏视觉中心；上方只显示短问候 `今天想推进什么？` 和一句范围说明，下方最多三个 Peak 知识工作起点：继续最近工作、总结最近笔记、查找相关材料。它借鉴“短问候 + 起始建议”的心智，不复制竞品皮肤或固定文案。
- 项目主页沿用同一心智，不另造一套 Dashboard 输入方式：显示 `今天想在这个项目里推进什么？`、一句项目范围说明、同一个 Composer，以及继续项目工作 / 总结项目进展 / 规划下一步三个项目化起点。
- 起始建议只把完整 prompt 填进 Composer，用户仍可编辑并明确发送；出现草稿后建议退场，不能因点击 chip 直接运行。
- 第一条消息发送后，Composer 回到底部 rail。
- 输入区多行增长但有最大高度，正文始终比工具栏优先。
- 发送、运行中停止、需要授权和失败重试必须保持稳定位置。

### 6.2 唯一所有权

| 入口 | 唯一职责 |
|---|---|
| `+` | 添加文件、图片、链接；Vault 文档复用同一个 `[[` picker |
| `[[` | 选择 Vault 文档或文件夹并加入显式上下文 |
| `/` | 研究、规划、编码、生成图片、生成文档等工作流 |
| 来源 | 在项目基础上独立开启 Vault Search 和 Web Search |
| 模型 | 自动模型或明确的 `{profileId, modelId}` 覆盖 |
| 助手 | 当前对话长期复用的身份与规则 |
| `@` | 暂不占用；存在真实 Assistant/App mention source 后再设计 |

同一能力不能在底栏同时出现两个图标、两个语法或两个不同菜单。

### 6.3 来源组合

当前项目是基础上下文，不是三个互斥来源之一。固定项目项使用“始终”状态徽标，不画成一个无法点击却看似可切换的 switch。Vault Search 与 Web Search 是两个独立 switch，可以分别开启或同时开启。触发器只总结当前组合，例如 `项目上下文 + Vault + Web`。图标使用 24px 容器内的 13px glyph，文字保持 12px/10px 两级，避免图标压过信息。

### 6.4 模型、助手与工作流不能混为一种 mode

- 模型 picker 支持搜索 Profile、Provider 和 model id，并按启用 Profile 分组。
- 能力筛选支持 vision、tools、reasoning、PDF、本地等已声明 capability 的多选 AND 组合；上下文筛选提供全部、至少 128K、至少 1M 等门槛。筛选条件数在触发器回显，并可一次清除。
- 只展示 catalog/runtime 真实声明的 context 和 capability；未知则省略或标未知。
- Auto 目前只表示“当前对话覆盖，否则默认 Agent Profile”，不承诺按任务智能路由。
- Settings 推荐配置、Search Harness 层级与 reasoning/verbosity 是三套不同系统，不能再包装成 Composer 的“快速 / 平衡 / 最佳”。
- Assistant picker 可搜索。非默认 Assistant 成为当前对话默认并持续回显，不是仅下一条消息参数。
- AI 创建 Assistant 采用 prompt-first：AI 生成可检查草稿；知识、工具、详细规则和模型偏好按需展开；用户明确保存后才生效。

## 7. 右栏：当前工作的导航地图

右栏不再同时承担目录、文件库、trace console 和全局搜索。目标只保留两个一级视图：

- **大纲**：主题、消息、过程节点与当前位置；
- **资源**：本轮引用和本轮生成，可按方向和类型筛选。

右栏以“存在一个当前会话”为出现条件。项目主页已经在中栏拥有对话、收藏、资源和计划，不显示右栏，也不保留可聚焦的 splitter；进入具体会话后恢复右栏。这样它始终是 conversation recall / navigation index，而不是项目主页的第二套目录。

方向/类型过滤只在资源视图出现，不能在大纲顶端单独放一行突兀按钮。类型至少覆盖图片、文件、链接、Vault 上下文、表格/数据、代码/Diff、图表、Drawing/Canvas、Bases 和运行过程。

每个条目必须定位真实中栏 DOM 目标并短暂高亮。若产物需要打开、保存、版本或编辑，应由真实产物回执承担，而不是让右栏假装成文件管理器。

## 8. 被否定或已退役的方向

- 从零复制 ChatGPT / Codex 的视觉皮肤。
- 保留 Peak 大标题、产品 logo 或装饰性 masthead。
- 把 Chat Studio 重新画成 Obsidian 三个 leaf 的截图。
- 永久占据左栏的第二个搜索框。
- 在 Chat Studio 伪造原生 Quick Search 内部 UI。
- 每条默认回答重复 `AI Assistant`。
- 给局部 follow-up 再造一个 Composer。
- 用 Fast / Balanced / Best 同时代表设置推荐、模型、reasoning 和运行策略。
- 把模型、角色、工作流、来源塞进同一个大菜单。
- `+`、`[[`、`/` 和 `@` 多路重复同一能力。
- 在右栏大纲中单独放一排只有一个 filter 的工具条。
- 把所有 Markdown 块都称为 Artifact。
- 在运行链路尚未消费状态时，把控件画成已经可用。

## 9. 仍待 owner 或运行时确认

1. 新建项目会话继承了哪些项目上下文，用户从哪里检查？
2. 具体模型还需要哪些可靠 metadata，尤其是输出上限和图片生成能力？
3. Assistant 的最小持久合同是什么：名称、主 prompt、知识、工具策略、模型偏好分别如何存储？
4. reasoning / verbosity 真正接线后放在模型 picker、二级运行设置，还是只对支持模型显示？
5. 哪种产物先建立正式数据合同：文档、图片、Drawing、Base 还是 Diff？
6. 右栏是否长期保留过程节点，还是交给独立 Trace view？
7. 三栏宽度、折叠状态和 popout 是否需要跨会话持久化？

## 10. 从讨论进入实现的门槛

一个设计控件只有同时满足以下条件，才能从 mock 进入生产：

1. 有明确状态 owner；
2. 请求或运行时真实消费该状态；
3. 用户能看到动作回执或失败原因；
4. 有键盘、窄宽度和错误状态；
5. 有测试证明不是只改变视觉；
6. 不与已有 Quick Search、Context、Preview、Model/Profile 或 Agent Harness 形成第二套系统。

## 11. 后续讨论工作流

为了缩短收敛时间，后续 browser comment 默认按增量处理：

1. 一条评论只修改被指出的 surface；
2. 涉及真实能力时先核对一个 source of truth；
3. 不确定内容标为 proposal，不补画成现成功能；
4. 小改动不启动并行 agent；
5. 每条评论只跑定向断言和一张截图；
6. 累计一批评论后再同步本文、`decisions.md` 和完整 QA。
