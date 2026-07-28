# Composer 多块选择、合并与上下文感知 AI 操作

**状态：** Owner 需求已确认 · requirements baseline · 尚未实现
**日期：** 2026-07-28
**范围：** Peak Composer 的跨块文字选择、显式多块选择、多目标 AI 变换和 capability-specific context assembly
**关联设计：**

- [Peak Composer Editing View](2026-07-09-peak-composer-editing-view.md)
- [Composer Block AI Capability Contract](2026-07-15-composer-block-ai-capability-contract.md)
- [Peak Composer AI Capability Modularity Architecture](2026-07-24-peak-composer-ai-capability-modularity-architecture.md)
- [Composer AI Agent 流程与生成历史](2026-07-28-composer-agent-runs-and-generation-history.md)

## 1. 结论

公式拆分暴露的不是一个公式按钮缺口，而是 Composer 缺少统一的多目标编辑能力。后续应一次解决四个相互依赖的问题：

- 保住并验收跨块文字选择；
- 增加显式多块选择；
- 把“合并多个块”做成可复用的 typed capability；
- 让复杂 AI 操作按 capability 装配上下文，并进入共享 Agent Run。

“合并公式”是这套能力的第一个高价值 vertical slice，不应成为公式组件里的专用旁路。其他可安全合并的块最终也应共享相同的多目标、候选 review、事务和历史合同。

## 2. 用户工作流

### 2.1 跨块文字选择

用户可以从一个块内的文字拖到另一个块。这仍是原生文字范围，不等同于选择整个块。选区继续支持：

- 复制与评论；
- 适用的文字格式；
- 适用的 AI 操作。

该能力当前已有核心数据模型和 UI 路径，但必须按真实 Obsidian 交互重新验收。验收范围包括：

- KaTeX 公式附近的选区；
- 列表和其他结构边界；
- 正向与反向拖选。

纯函数测试不能替代这些真实交互证据。

### 2.2 显式多块选择

用户可以选择两个或更多完整块，形成一个清晰可见的 block set。选择状态必须与文字选区、表格单元格选区和对象内部选择区分。

多块选择至少要支持：

- 连续相邻块；
- 清晰的加入、移除和清空反馈；
- source-order 排序；
- 在选中集合变化后重新计算可用操作；
- 键盘与指针两种可达路径。

不连续块是否在第一阶段开放，以及具体交互手势，保留给交互设计阶段决定。

### 2.3 合并块

当选中的块满足 capability applicability 时，操作区提供“合并块”。普通兼容结构可以有确定性合并。以下情况使用“用 AI 合并”：

- 需要理解块之间的语义；
- 需要消除重复内容；
- 需要重建公式或推导结构。

AI 合并先生成一个候选结果，不直接覆盖原文。用户可以：

- 查看哪些块将被替换；
- 比较原始集合与合并结果；
- 补充定向指令并重新生成；
- 接受当前 variant；
- 标记未采用并稍后从 Generation History 找回。

接受后只产生一次原子 Document History transaction。Undo、Redo 和 Rollback 必须整组恢复原来的所有块。

### 2.4 公式合并

公式拆分后，每个公式是独立块，可以单独解释、评论和继续编辑。用户显式选中一组相关公式后，可以要求 AI：

- 合并为一个等价公式；
- 恢复为一个带辅助定义的公式组；
- 消除临时变量；
- 保留辅助定义，但重排推导顺序；
- 根据周围定义补全缺失项。

输出结构由结果合同决定，不能把“合并”硬编码成一个长 `aligned` 字符串。它可以是一个公式块，也可以是一个经过明确 review 的公式组。

## 3. 当前生产事实

### 3.1 跨块文字选择并非从零开始

当前已有：

- [`ComposerSelection`](../../../src/core/composer/selection.ts) 的 `cross-block` scope；
- [`partitionSourceRange()`](../../../src/service/composer/selection/partitionSelection.ts) 的跨 semantic unit 分区；
- [`SelectionToolbar`](../../../src/ui/view/composer/chrome/SelectionToolbar.tsx) 对 `selectionchange` 的监听；
- [`selectionMapping.ts`](../../../src/ui/view/composer/chrome/selectionMapping.ts) 的 DOM selection 与 source offset 映射；
- [`composer-selection-partition.test.ts`](../../../test/composer-selection-partition.test.ts) 的跨块模型测试。

因此，当前问题不能写成“系统完全没有跨块选区”。诚实状态是：基础合同存在，但真实 UI 是否仍可连续、准确地跨各种块选择，需要重新 characterization 和回归验收。

### 3.2 当前没有显式多块 target

[`ComposerTarget`](../../../src/core/composer/types.ts) 当前只有单目标 variants。它没有一个可以冻结多个完整块、保留 source order 并参与 applicability 的 multi-block target。

这意味着“选中多个块后合并”不能可靠地复用现有单目标 capability。它需要新的多目标合同，而不是把多个 block ID 临时塞进 instruction。

### 3.3 当前上下文范围过窄

[`contextAssembler.ts`](../../../src/service/composer/capabilities/contextAssembler.ts) 当前只冻结精确 target、可选 selection text，以及固定字符数的 `nearby.before / nearby.after`。

公式还有一条更具体的限制：[`buildFormulaContext()`](../../../src/service/composer/packs/math/formulaModel.ts) 会主动跳过相邻 math block，只收集附近非公式文本。这对保持单公式解释边界有帮助，但无法支持跨公式推导、变量依赖和公式合并。

### 3.4 复杂操作尚未进入完整 Agent Run

[Composer AI Agent 流程与生成历史](2026-07-28-composer-agent-runs-and-generation-history.md) 已确认所有真正的 AI 操作最终都进入共享 Agent Run。当前生产仍主要是单轮文字 stream，尚未接通完整运行事件和 Context Assembly Receipt。

多块合并不应在现有 stream handler 上继续加 prompt 拼接。它需要复用共享 Agent Loop，并保留 typed candidate、Generation History 和 Document History 的分离。

## 4. 目标合同

### 4.1 两种选择必须分开

| 选择类型 | 用户选择的是什么 | 主要用途 | 写回边界 |
| --- | --- | --- | --- |
| 文字范围 | 一个或多个块中的部分文字 | 格式、复制、评论、局部 AI 修改 | partition 后的 source ranges |
| 多块集合 | 两个或更多完整块 | 合并、重组、批量 AI 变换 | multi-target transaction |

文字拖选不能暗中升级成 block set；点击块也不能破坏仍在使用的文字选区。UI 必须让用户看出当前操作针对文字还是完整块。

### 4.2 Multi-block target

后续技术设计至少要表达以下信息：

```ts
// Proposed requirements shape — not final implementation.
interface ComposerMultiBlockTarget {
  kind: 'multi-block';
  documentId: string;
  revision: string;
  blocks: Array<{
    blockId: string;
    sourceFrom: number;
    sourceTo: number;
    sourceHash: string;
  }>;
  order: 'source';
}
```

Target 在 run 创建时冻结。任何目标块被外部修改、删除或重排后，接受动作必须 fail closed 或进入明确 rebase，不得静默作用到“当前位置附近的块”。

### 4.3 Capability applicability

每个 capability 明确声明：

- 支持的 block kind 组合；
- 是否要求连续；
- 最少和最多块数；
- 是否允许不连续块；
- 输出是一个块、多个块还是原位 patch set；
- 是否为确定性操作或 AI Agent Run；
- 结构不兼容时的 disabled reason。

“合并块”不是全局永远可点的按钮。只有目标集合与输出合同可证明安全时才显示或启用。

### 4.4 原子写回

AI 可以在 review 中产生一个或多个 typed patch，但一次接受形成一个逻辑 transaction：

- 删除或替换所有选中目标；
- 在确定的 insertion anchor 写入结果；
- reparse 后校验预期 block delta 和目标结构；
- 一次写入 History；
- 一次 Undo 恢复全部原块；
- transaction 反向引用产生它的 run、generation 和 active variant。

对于不连续目标，插入位置和中间未选中内容的保留规则必须在技术设计中先定清楚，不能由模型临场决定。

## 5. 上下文装配

### 5.1 不使用统一固定窗口

上下文范围按 capability 声明，而不是所有操作共用一个字符数。固定窗口可以作为低成本 fallback，但不能成为公式、表格和多块重组的唯一上下文策略。

### 5.2 公式上下文槽

公式解释、拆分、合并和补全至少区分以下 slots：

| Slot | 优先级 | 内容 |
| --- | --- | --- |
| selected formulas | required | 用户选择的完整 LaTeX、顺序、稳定锚点 |
| local formula neighborhood | required/optional by action | 前后相邻公式和公式组边界 |
| symbol definitions | required when referenced | 附近变量、常量、集合和归一化定义 |
| derivation section | required | 所在 heading 下的推导段落和说明 |
| explicit references | optional/retrievable | 用户指定笔记、定理、来源或附件 |
| prior run context | optional | 上次生成、用户反馈和未采用 variant |

“附近”由结构和引用关系决定，不只是向前后各截固定字符。大型来源先保留可取回引用；Agent 在权限和预算允许时读取，而不是把整篇 Vault 内容无边界塞进 Prompt。

### 5.3 Agent 可以主动补上下文

复杂公式合并属于 Agent Run。运行时先拿到冻结 target 和必需 slots，然后可以通过允许的工具：

- 读取同一推导段落中的完整定义；
- 沿明确链接读取被引用笔记；
- 检查符号是否在当前文档其他位置定义；
- 在生成前报告缺少的信息；
- 在结果校验阶段比较等价性和符号完整性。

Agent 不能自行扩张写回目标。工具可以增加读取证据，但最终 patch 仍只能作用于冻结并通过 revision 校验的目标集合。

### 5.4 Context Assembly Receipt

每个 run 保存：

- 请求、使用、压缩和省略的 slots；
- tool-loaded sources；
- token budget 与截断原因；
- document revision 和每个目标块的 source hash；
- Prompt、模型、工具权限和结果校验记录。

这样 Generation History 中的结果可以解释“当时 AI 看到了什么”，而不是只留下一个无法复现的最终公式。

## 6. 目标流程

```mermaid
flowchart LR
    Select["文字范围或多块集合"] --> Target["冻结 target<br/>revision · source hashes"]
    Target --> Plan["按 capability 装配 context slots"]
    Plan --> Run["共享 Agent Run<br/>步骤 · 工具 · 来源"]
    Run --> Candidate["typed candidate<br/>一个或多个结果块"]
    Candidate --> Review{"用户 review"}
    Review -->|"重新生成"| Run
    Review -->|"未采用"| Generation["仅 Generation History"]
    Review -->|"接受"| Transaction["一个原子 Document transaction"]
    Transaction --> History["Document History<br/>Undo · Redo · Rollback"]
```

阅读要点：

- 选择状态只定义目标，不直接写文档；
- Agent 可以补充读取上下文，但不能扩大写回范围；
- 未采用结果进入 Generation History，不进入 Document History；
- 接受多个 patch 仍是一个原子事务。

## 7. 实施顺序

### Phase 0：Characterization

- 在真实 Obsidian 中复现普通段落、列表、KaTeX 和混合块的正向/反向跨块文字选择；
- 补齐 selection mapping、焦点和 toolbar 显示的回归测试；
- 明确哪些路径是现有 regression，哪些是尚未实现。

### Phase 1：Multi-block target

- 设计多目标类型、稳定身份、revision guard 和 applicability；
- 支持连续块集合；
- 让 selection state、toolbar 和 keyboard navigation 共享一个 app-owned owner。

### Phase 2：通用合并 capability

- 先实现兼容块的 preview 与原子事务；
- 明确一个结果块、多结果块和不连续目标的写回规则；
- 接通 History、Undo、Redo、Rollback。

### Phase 3：Context assembly 与 Agent Run

- 让 capability 声明 required、optional 和 retrievable slots；
- 接入共享 Agent Loop、工具和 Context Assembly Receipt；
- 持久化 generation、variant 和来源。

### Phase 4：公式 vertical slice

- 公式上下文纳入相邻公式、变量定义和推导段落；
- 支持多公式合并、消除临时变量和公式组重排；
- 增加结构校验、符号完整性和等价性验证。

## 8. 验收

完成实现前至少证明：

1. 普通文本与 KaTeX 附近的跨块文字选择在真实 Obsidian 中可用，正反向选择结果一致。
2. 用户可以明确选中多个完整块，选择反馈不会与文字选区或表格选区混淆。
3. 操作只在兼容 block set 上启用，并显示准确 disabled reason。
4. AI 合并先产生 typed candidate，不直接写 Markdown。
5. 接受后只新增一条 Document History transaction；一次 Undo 恢复全部原块。
6. 外部 revision drift 会拒绝接受，不会把结果写到错误块。
7. 公式 run 的 Context Assembly Receipt 能证明相邻公式和相关变量定义是否进入上下文。
8. 不相关的远处内容不会仅因字符窗口扩大而被默认塞入 Prompt。
9. 重新生成追加 variant；未采用结果仍可从 Generation History 找回。
10. Composer 继续使用共享 Agent Runtime，不新增公式专用 AI runtime 或 store。

## 9. 非目标与待决问题

本需求不修改标准 Obsidian CodeMirror 编辑器，也不要求自动合并检测后直接改文档。它不把整个文档、整个 Vault 或所有相邻公式无条件送给模型。

后续交互设计需要决定：

- 连续与不连续多块选择的第一阶段边界；
- 指针、键盘和块手柄的具体手势；
- 合并结果的 insertion anchor；
- 混合 block kind 的支持矩阵；
- 确定性合并与 AI 合并的命名和优先级；
- 公式等价性校验的能力、成本和失败文案。
