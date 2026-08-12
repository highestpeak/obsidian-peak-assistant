# 23 · Canvas 与 Excalidraw AI 原生编辑宣传与演示

> [返回上线前 TODO](../pre-launch-todo.md)
>
> 优先级：P1 · 原生画布重点宣传任务
>
> 状态：production typed-patch 链路存在；真实 Obsidian E2E 与公开素材待完成
>
> 前置任务：[剩余功能完成与 Release Candidate 冻结](16-remaining-feature-closure.md)、[Owner Dogfood](05-owner-dogfood.md)
>
> 下游任务：[网站内容与首页演示视频](06-website-and-demo-videos.md)、[Final Demo](22-final-demo-continuous-context-story.md)、[朋友试用与外部内容检查](07-external-beta.md)

## 任务目标

重点宣传 Peak Assistant 可以让 AI 直接修改 Canvas 和 Excalidraw 的原生结构。用户看到的不应只是聊天回复、生成图片或一段 JSON，而应是 AI 对画布中的节点、连线和元素提出结构化修改，用户审阅后再写回原文件。

这项能力的“炫酷感”来自画布在真实操作中发生可解释变化，但可信度来自一条完整控制链：修改先形成 candidate，用户明确 accept 后才写入；revision guard 与可恢复 source 负责保护原文件。最终素材必须同时呈现这两层，不能只留下一个无法判断真假的 before/after 动画。

## 1. 当前能力真值与宣传门槛

当前源码与项目记录提供以下证据：

- [Roadmap](../roadmap.html) 记录 Canvas/Excalidraw 固定操作、对象级 review 和 native source-of-truth 已进入 Composer production tracks，但 Composer 整体仍是 partial。
- [Composer implementation note](../superpowers/plans/2026-07-27-peak-composer-implementation-note.md) 将 typed Canvas node/edge patching 与 typed Excalidraw patching 标为自动化 COMPLETE。
- [Composer native capability pack](../superpowers/specs/2026-07-24-peak-composer-ai-capability-modularity-architecture.md) 定义 native-object patch、增量重渲染和显式 accept/reject。
- 真实 Obsidian 中由实际 Provider 发起、审阅、接受、重开原文件的完整录制尚未成为公开验收证据。

因此本任务开始时的对外状态是：**能力有生产实现与自动化证据，但强宣传必须等待真实 E2E 和素材验收。**

## 2. 只宣传真实支持的操作

### Canvas 当前操作

- [ ] 移动节点到指定坐标。
- [ ] 按偏移量微调节点。
- [ ] 修改节点文字。
- [ ] 修改节点标签。
- [ ] 修改节点颜色。
- [ ] 添加连线。
- [ ] 删除连线。
- [ ] 删除节点，并处理悬空连线。

当前 Canvas typed patch 没有通用 `add-node` operation。除非 Release Candidate 前完成实现并验收，否则不能演示或宣传 AI 可以任意创建 Canvas 节点。

### Excalidraw 当前操作

- [ ] 设置画布背景。
- [ ] 添加一个合法 Excalidraw element。
- [ ] 删除指定 element。
- [ ] 修改受支持的 scene field。

当前没有独立的 `move-element`、`bind-elements` 或通用 auto-layout operation。不能把 `add-element` 或 `set-scene-field` 扩大解释成 AI 已经能够像完整 Excalidraw 编辑器一样自由拖拽、绑定和重新布局所有对象。

### 共享审阅与写回

- [ ] 模型输出经过 schema validation，不把 raw JSON 直接展示给用户。
- [ ] candidate 按操作列出结构化 change summary。
- [ ] 用户可以追加指令后 regenerate。
- [ ] 用户可以 accept 或 discard。
- [ ] accept 通过 native-file port 写入对应 Canvas/Excalidraw 文件。
- [ ] revision 发生漂移时拒绝覆盖外部修改。

## 3. 核心宣传信息

重点不是“AI understands diagrams”，而是以下差异：

- 普通聊天只能描述应该怎样改。
- 图片生成会创建新的扁平结果。
- Peak Assistant 对原生 Canvas/Excalidraw 对象提出 typed edits。
- 用户在写回前仍拥有审阅和拒绝权。
- 接受后文件仍能在原来的 Canvas/Excalidraw 工具中继续编辑。

候选英文方向：

- `AI that edits the canvas—not just talks about it.`
- `From instruction to native, reviewable canvas edits.`
- `Let AI work with the same nodes, connections, and elements you do.`
- `Your canvas stays native. Every AI change stays reviewable.`

这些是文案输入，不在本任务中直接批准。最终措辞必须匹配已经通过的 operation matrix。

## 4. Canvas 演示脚本

使用一个与 Final Demo 主任务直接相关的项目 Canvas，例如发布计划、研究流程或知识工作流。

- [ ] 初始画布具有清楚的节点、阶段和连线，观众能快速看懂。
- [ ] 用户给出一个具体修改目标，而不是泛泛说“优化画布”。
- [ ] 指令同时触发两到四个当前已支持的操作。
- [ ] 推荐组合：移动一个节点、修改文字或颜色、补一条缺失连线。
- [ ] 生成期间显示真实状态，但不展示 raw patch JSON。
- [ ] candidate 清楚列出目标节点和各项 change。
- [ ] 用户至少修改一次 instruction 后 regenerate，或 discard 整个不合适的 candidate；只有产品真实支持逐项处理时，才演示逐项拒绝。
- [ ] accept 后在 Composer preview 中看到画布变化。
- [ ] 打开原生 Obsidian Canvas，确认同一个文件中的节点和连线已经更新。
- [ ] reload 或重开后变化仍然存在。

示例场景：Graph 发现项目计划缺少“human review”到“launch”之间的关系，用户让 Composer 调整项目 Canvas 的 Review 节点、改清标签并补上连线。这个动作可以自然接入[最终 Demo](22-final-demo-continuous-context-story.md)。

## 5. Excalidraw 演示脚本

使用一个简洁的流程草图、架构草图或概念说明图。fixture 需要让新增/删除元素和背景变化在录制分辨率下明显可见。

- [ ] 记录 Excalidraw 插件版本、文件格式 variant 和测试前 source SHA。
- [ ] 使用当前 operation matrix 可以完成的明确指令。
- [ ] 推荐组合：添加 decision rectangle/text/arrow elements，或删除过期元素并调整背景。
- [ ] candidate 显示 element 类型和目标文件，不暴露模型原始 JSON。
- [ ] 用户先 review，再 accept 或 regenerate。
- [ ] accept 后 Composer 中的实际 Excalidraw embed 重新渲染。
- [ ] 打开原生 Excalidraw 编辑器，确认元素仍然可选择和继续编辑。
- [ ] 验证 frontmatter、Text Elements 和原文件 wrapper 没有被破坏。
- [ ] 验证未知 scene/element fields 得到保留。
- [ ] parsed 与 compressed-json variant 按最终支持范围分别验收。

如果 Excalidraw 插件缺失、版本不兼容或某种格式只能 fallback preview，必须在公开文档中说明前置条件，不能用开发机环境冒充零配置能力。

## 6. 动态素材设计

这项能力必须用短视频或 GIF 展示，单张图无法证明编辑过程。

### 首页短循环

- [ ] 画布初始状态停留约一秒。
- [ ] 显示一条足够短的自然语言指令。
- [ ] 快速呈现 typed candidate summary。
- [ ] 用户点击 accept。
- [ ] 画布在同一视口中更新并停留，让观众看清差异。
- [ ] 总时长控制在首页可循环播放的范围内。

### 功能详情视频

- [ ] Canvas 与 Excalidraw 分开录制，不把两个产品边界混在一个快切镜头中。
- [ ] 同时保留 source file、candidate 和 native editor 的身份线索。
- [ ] 使用 before/after 对照标出真正发生变化的对象。
- [ ] 至少展示一种可信控制，例如 regenerate 或 revision conflict。
- [ ] 字幕解释“AI 修改了什么”和“用户何时批准”，而不只说画面很酷。

### 社区素材

- [ ] 准备一个 10–20 秒的 Canvas 操作片段。
- [ ] 准备一个 10–20 秒的 Excalidraw 操作片段。
- [ ] 准备各一组 before/candidate/after 截图。
- [ ] 为无自动播放环境提供文字版操作说明和 alt text。

## 7. 真实 Obsidian 验收

遵循 [Obsidian Real-UI QA](../conventions/obsidian-real-ui-qa.md)，分别验证 Canvas 与 Excalidraw：

- [ ] 普通用户可以从生产入口找到对应 AI action。
- [ ] 实际 Provider 收到正确的 native source 与 format。
- [ ] typed-object streaming 期间不泄露 raw JSON。
- [ ] preview、candidate summary 和最终 native file 表达同一组 changes。
- [ ] accept 前 source 保持不变。
- [ ] accept 后只有目标 native file 发生预期修改。
- [ ] 外部并发修改触发 revision conflict，并保留外部内容。
- [ ] 所有取消、重试、重新生成与丢弃路径都不产生隐藏写入。
- [ ] 插件 reload 与 Obsidian 重启后结果仍能打开。
- [ ] 原生 Canvas/Excalidraw 中可以继续进行人工编辑。

需要录制短视频，因为生成、审阅、接受、重渲染和原生文件重开属于连续交互。source inspection、自动化测试和 mock 只能作为辅助证据。

## 8. 对外分级

- **完整通过**：可以宣传 AI 对已列明 Canvas/Excalidraw 对象执行 native, reviewable edits。
- **Canvas 通过、Excalidraw 未通过**：只宣传 Canvas，不用合并话术暗示两者均可用。
- **Excalidraw 通过、Canvas 未通过**：只宣传 Excalidraw，并说明插件与格式前置条件。
- **仅自动化通过**：只能写 Preview / QA closing，不能放入正式首页成片。
- **只能生成新图片或描述**：不能使用 native editing 主张。

## 完成条件

- [ ] Canvas 与 Excalidraw 各自的最终 operation matrix 已冻结。
- [ ] 每个对外 operation 都有从真实 Obsidian 入口到原文件重开的完整证据链。
- [ ] 所有 stale 与中断恢复路径都没有隐藏写入或数据损失。
- [ ] 首页短循环、功能详情视频和社区素材已经完成。
- [ ] 公开文案准确区分原生画布编辑、Graph exploration 与 image generation。
- [ ] 公开文案分别说明 Canvas 和 Excalidraw 的能力边界。
- [ ] 如果进入 Final Demo，画布修改由同一项目任务自然触发，并延续此前上下文。
- [ ] 朋友试用者能说明 AI 修改了哪些原生对象，以及修改何时真正写入。

## 不要做

- 不把生成一张新图片写成编辑原生 Canvas/Excalidraw。
- 不把 AI 的文字建议写成已经修改画布。
- 不展示 raw JSON 来冒充专业或透明。
- 不把当前不存在的 Canvas 新建节点能力写进演示。
- 不把 Excalidraw 的 `add-element` 扩大成完整自由布局能力。
- 不隐藏 Excalidraw 插件、版本和文件 variant 前置条件。
- 不在没有真实 accept 和原文件重开证据时使用强宣传语。
