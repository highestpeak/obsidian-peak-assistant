# 11 · Landing Page 类比定位与主张门槛

> [返回上线前 TODO](../pre-launch-todo.md)
>
> 优先级：P1 · 条件式宣传任务
>
> 状态：候选话术，尚未批准为当前公开主张
>
> 前置任务：[上线范围与历史任务审计](01-release-scope-and-task-audit.md)、[Owner Dogfood](05-owner-dogfood.md)、[网站与视频](06-website-and-demo-videos.md)

## 任务目标

为 Landing Page 准备一组容易理解的产品类比，让普通用户快速建立心智模型。类比必须以届时已经交付并通过真实验收的能力为前提，不能把规划中的 Peak Sheet 或 Composer 的局部能力提前描述成完整产品。

## 1. 候选话术

### Peak Sheet / structured data

- [ ] `Your local Airtable.`
- [ ] `Your local-first Airtable for knowledge.`
- [ ] `Think Airtable, but local-first and inside your vault.`
- [ ] 不依赖竞品名称的版本：`A local-first workspace for structured knowledge.`

### Peak Composer / document editing

- [ ] `Cursor for your documents.`
- [ ] `Cursor-style AI editing for your documents.`
- [ ] `Work with AI inside the document—not beside it.`
- [ ] 不依赖竞品名称的版本：`Context-aware AI editing, directly inside your source documents.`

原始想法可以保留，但最终英文需要单独做可读性、准确性和品牌语境审查。`Cursor for your documents` 比 `your Cursor for the document` 更自然。

## 2. Airtable 类比启用门槛

启用强类比前，Peak Sheet 至少需要证明：

- [ ] 已有 production Peak Sheet/Dataset runtime，而不只是 research、spec 或 mock。
- [ ] 数据拥有稳定 schema、record identity 和 canonical persistence。
- [ ] 用户可以创建、导入、编辑并保存结构化数据。
- [ ] Table/Sheet 是可日常使用的真实工作面。
- [ ] 排序、过滤、分组或等效结构化操作达到对外演示质量。
- [ ] 公式或 ComputePlan 具备可检查的 preview/accept 流程。
- [ ] 至少一种额外 projection/view 已真实可用，或文案明确限制为 Sheet/Table。
- [ ] Markdown/CSV/XLSX 等声称支持的输入输出边界与实际实现一致。
- [ ] 数据恢复、版本和失败路径通过 owner dogfood。
- [ ] 真实 Obsidian 交互与性能达到公开演示标准。

如果上述门槛没有完成，只能使用不依赖 Airtable 的通用描述，或者明确标记为 Preview / In development。

## 3. Cursor 类比启用门槛

启用强类比前，Peak Composer 至少需要证明：

- [ ] AI 在真实文档内部工作，而不是只在旁边生成聊天回复。
- [ ] Selection、Block、Table 和 Document target 与公开文案一致。
- [ ] 修改以可审阅的 candidate/diff 呈现。
- [ ] 用户可以 accept、reject、继续调整和撤销。
- [ ] History 能恢复或解释重要编辑决策。
- [ ] AI action 能获得明确的文档上下文。
- [ ] 来源、证据或相关 context 不会在 surface handoff 时静默丢失。
- [ ] 原始 Markdown/native file 继续是 source of truth。
- [ ] 错误、取消、stale source 和恢复路径通过真实验收。
- [ ] 如果话术暗示 multi-file/agentic editing，对应能力必须真实可用；否则文案必须限定为 document editing。

在能力尚未达到完整 Cursor 心智时，优先使用较窄的 `Cursor-style AI editing for your documents`，不要直接声称替代 Cursor。

## 4. 页面使用方式

- [ ] Hero 先讲 Peak Assistant 自己解决的问题，不只依赖竞品名称。
- [ ] 类比话术放在能力卡、解释段或 launch post 中。
- [ ] 每个类比旁边展示一个真实产品结果。
- [ ] Airtable 类比链接到 Peak Sheet 的真实演示或文档。
- [ ] Cursor 类比链接到 Composer 的真实审阅式编辑演示。
- [ ] 不使用 `replacement`、`clone` 或 `same as`，除非产品范围真的支持。
- [ ] 不暗示与 Airtable 或 Cursor 存在官方关系。
- [ ] 发布前复查竞品名称、商标写法和必要说明。

## 5. 主张证据

每条候选文案都要记录：

- [ ] 对应的用户价值。
- [ ] 当前源码入口。
- [ ] 普通用户可达路径。
- [ ] 真实 Obsidian 验收证据。
- [ ] 演示视频或截图。
- [ ] 已知限制。
- [ ] 最终批准使用的页面位置。

## 完成条件

- [ ] Peak Sheet 和 Composer 的强类比各有明确 Go / No-Go。
- [ ] 被采用的文案与上线版本能力一致。
- [ ] 每条强主张都有真实产品演示和公开说明。
- [ ] 未达到门槛的类比已降级、延后或移除。
- [ ] 页面即使移除竞品名称，仍能独立讲清 Peak Assistant 的价值。

## 不要做

- 不在 Peak Sheet 仍是 research/spec/mock 时使用 `Your local Airtable`。
- 不把局部 rewrite 功能包装成完整的 `Cursor for documents`。
- 不让竞品名称取代 Peak Assistant 自己的产品定位。
- 不用未来计划支撑当前时态的公开主张。
