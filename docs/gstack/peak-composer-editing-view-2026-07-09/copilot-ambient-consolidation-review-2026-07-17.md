# Copilot + Ambient Workbench 产品决策

> 日期：2026-07-17 · confirmed 2026-07-18  
> 状态：已确认产品方向；sidecar spec 与轻量 lab 已按此 consolidation 更新  
> 目标：记录 Ambient 用户表面并入 Copilot 默认 workbench、conversation 按明确意图进入、内部 runtime ownership 保持分离的最终合同

## 结论

Intelligence 顶层正式从三个工作面收敛为两个：

- `Copilot`：用户主动对话、系统自动建议、能力装配、运行与正文预览。
- `History`：只记录已经真实发生的正文事务，并负责 diff、定位与回滚。

`Ambient` 不再作为用户必须理解的 tab 或产品术语，但保留为 Copilot 背后的自动感知层：它继续负责监听编辑现场、检索与图谱发现、判断相关性、组织未落位想法、排序建议和学习忽略反馈。

一句话概括：

> Ambient 是 Copilot 的自动感知层，不是另一个需要用户学习的工作模式。

这里应该“合并产品表面，不合并内部职责”。如果直接删掉 Ambient runtime，会丢掉主动发现；如果继续保留独立 Ambient tab，用户又必须先理解一组内部概念，主动建议与后续对话也会被人为拆开。

## 一、当前 Ambient 面板到底在做什么

当前 lab 把多种不同性质的信息放在一个 tab 中，因此看起来像一组并列的后台模块。它们原本分别在回答这些问题：

| 当前区域 | 原本要回答的问题 | 实际责任 |
| --- | --- | --- |
| 当前工作状态 | 系统认为我现在在做什么？ | 一条用于推荐排序的临时上下文假设 |
| 可用材料 | 哪些 Vault 内容可能帮助当前写作？ | 文本检索、链接图谱、近期编辑和证据来源的合并结果 |
| 可推进动作 | 当前段落最值得做的下一步是什么？ | 从正文缺口映射到 Copilot 能力 |
| 为什么现在出现 | 系统为什么此刻推这些？ | 最近文件、主题、编辑与动作形成的解释 trace |
| 本次会话未落位想法 | 哪些刚出现的念头还没有进入正文？ | Session Thought Trace；不是 todo list |
| 知识库动态 | Vault 中有什么值得重新关注的变化？ | Morning Briefing、变化 hub、旧连接和弱关联发现 |
| 深查当前章节 | 我是否要主动运行一次更重的检查？ | 有明确边界的 Copilot capability |

这些能力大多有价值，问题不在“有没有用”，而在于当前界面要求用户先理解系统内部如何组织它们。

### 圈出的“当前工作状态”是什么

它不是任务进度，不是正文摘要，也不是 AI 已经完成的结果。它更像系统内部维护的一条假设：

> 我猜你现在正在围绕 X 编辑，所以接下来优先给你 Y 类动作和 Z 类材料。

这条假设有三个后台用途：

1. 让自动推荐共享同一个当前目标，而不是每条建议各猜各的。
2. 决定检索、图谱关系、最近编辑和未落位想法的排序。
3. 判断跑偏时允许用户修正 focus，避免后续建议连续偏离。

当前稿难懂，是因为它把这条内部假设做成了视觉上最重的模块，并同时暴露了“纠正理解”“判断较稳定”“最近编辑”“显式链接”等系统语言。用户会自然地问：这是任务、结论，还是让我操作的东西？

这已经违背了 2026-06-02 设计稿自己的标准：用户应该在几秒内看懂“系统以为我在做什么、当前缺什么、点击后会发生什么”。

因此建议：

- 后台继续保留 Current Work State 数据。
- 用户界面不再显示“当前工作状态”这个大标题和整块诊断信息。
- 高置信度时最多显示一行具体对象，例如：`针对「AI 旁路段落」的 3 个建议`。
- 只有判断不稳定、且错误会显著改变推荐时才询问：`我理解你正在补清“结果为什么必须回到正文”，对吗？`，提供 `是的 / 调整`。
- 如果系统说不出一个具体、可修正的理解，就完全不显示这条假设。

### 圈出的说明句为什么不该显示

`Ambient 只负责感知：现在在做什么……` 是设计评审中的职责说明，不是最终产品内容。它帮助设计者区分 Copilot、Ambient 和 History，但不会帮助用户完成当前写作，应该从产品 UI 中直接移除。

## 二、历史设计到底沉淀了哪些能力

### 2026-05-01：从“不知道该搜什么”开始

最初的 Ambient Push 不是任务管理器，也不是第二个聊天窗口。它解决的是：相关知识埋在 Vault 中，但用户不知道应该搜索什么，又不想中断写作去搜索。

这一阶段确定了至今仍应该保留的合同：

- 写作停顿、切换文档或手动触发后才运行，不持续打断。
- 自动发现必须说明为什么相关。
- 默认只给少量结果，并采用渐进披露。
- 只提供建议，绝不静默修改正文。
- 用户可以查看、忽略和反馈。

Phase 2 又增加了 2-hop graph、shared tag、co-citation、hub、去重与反馈排序；Phase 3 增加稀疏的 serendipity；Phase 4 尝试过 session-start Morning Briefing。

### 2026-05-14 至 05-16：Copilot 成为 intent hub

Copilot Command Center 的设计已经把 related notes、source review、gap analysis 和 follow-up chat 放进同一条用户旅程：用户表达意图或选择建议，系统选择能力，输出可审阅 artifact，用户继续追问或写回正文。

这说明“相关材料”和“写作缺口”并不天然属于另一个产品模式。它们可以是 Copilot 在用户开口前准备好的入口。

### 2026-06-02：从 Related Notes 升级为 Current Work State

这一轮不再把“找到几篇相关笔记”当成产品终点，而是增加：

- Current Work State：系统现在如何理解用户的工作。
- Open Writing Moves：当前段落可以怎样推进。
- Recent Work Trace：这个理解来自哪些近期信号。
- Session Thought Trace：本次会话中哪些想法还没有安放。

这是重要的能力升级，但历史视觉稿也暴露了现在的问题：内部概念越来越多，右栏逐渐变成用户需要学习的 dashboard。

### 2026-07-03 至 07-07：要求稳定、可停留，而不是通知

后续反馈明确否定闪动状态栏和反复弹出的 Morning Briefing，要求结果拥有一个稳定、可刷新、可关闭、可停留的位置。Floating Panel 是为满足这个 surface 要求做的一次探索，并不是 Ambient 必须独立存在的产品合同。

### 2026-07-15：三 tab 是一次界面选择

当前 Composer sidecar spec 把 Copilot、Ambient、History 拆成三个 tab。但同一份合同又规定：点击 Ambient 的动作后，必须回到 Copilot，把能力变成 action chip，把材料变成 context chips，然后再运行。

换句话说，领域责任确实不同，但用户旅程早已连在一起。独立 Ambient tab 是最近一次 surface 决策，不是不可改变的运行时边界。

### 历史视觉稿的共同结论

历史稿并没有证明 Ambient 需要成为独立工作面，反而反复证明了两件事：

- Current Work State 最初使用的是 `I think you are doing…` 这种可纠正推断，而不是确定性的“工作状态”；当前 lab 把不确定假设包装成事实，理解成本因此更高。
- Open Writing Moves、Find notes、Check gaps、Place thought、Draft bridge 等真正可行动的内容，点击后都需要能力装配、追问、预览或写回；这些闭环天然属于 Copilot。
- Floating Panel 中值得保留的是 fixed、refresh-in-place、可收起和可忽略，不是再建立一个新的主要入口。
- Copilot Command Center 的历史流程已经让 Auto 与手动意图共享同一个 Agent Run，并把 Changes、Insights、Sources 与 Chat 放在同一闭环中。
- 当前三 tab Ambient 视觉稿最明显的问题正是 Current Work State、材料、trace 和 briefing 逐层堆叠，最后形成 dashboard card wall。

## 三、合并后的 Copilot

### 默认信息架构

```text
┌──────────────── Intelligence ────────────────┐
│ [ Copilot ]                         [History 9]│
├──────────────────────────────────────────────┤
│        [ 工作台 94 ]       [ 对话 4 ]         │
├──────────────────────────────────────────────┤
│ 持续整理 · 正在整理「AI 旁路段落」          ↻  │
│ 94 条线索 · +7 新增 · 3 条已归档              │
├──────────────────────────────────────────────┤
│ 接下来可能要做                           38   │
│ 01 补清结果为什么必须回到正文          改写   │
│ 02 补一个反方比较                      预览   │
│ 查看全部 38                                 │
├──────────────────────────────────────────────┤
│ 相关材料                                 37   │
│ 知识库.md · 为什么与当前判断有关       带入对话│
│ Base 使用判断.md · 生成结果要回到原对象 带入对话│
│ 查看全部 37                                 │
├──────────────────────────────────────────────┤
│ 还没安放的想法                           19   │
│ “原生对象也应保留增量过程”             找落点  │
└──────────────────────────────────────────────┘
```

顶层仍只有 `Copilot / History`。Copilot 内部使用固定位置的 `工作台 / 对话` 二级切换，两个 body 共用同一组按钮：

1. `workbench`：默认状态。Ambient 的当前判断、写作动作、相关材料和未落位想法在这里持续整理。
2. `conversation`：用户显式点击“对话”、选择建议/能力或 `带入对话` 后进入；quick capabilities、全部能力、voice 与 composer 只在这里显示。

两个切换按钮在两种状态下位置、顺序和尺寸完全相同，不再在 workbench header 与 conversation thread 内分别放置单向跳转。Composer 在 workbench 中隐藏，但 draft、chips、caret 与上下文状态不清空。从 conversation 返回 workbench 必须显式切换；清空草稿、运行结束和后台刷新都不能让界面自动跳来跳去。

### 为什么默认是工作台

- 用户没有主动说话时，最有价值的是系统已经发现并整理好的当前工作，而不是一段旧对话。
- `下一步 / 相关材料 / 还没安放的想法` 同时可见，用户不用先猜应该切哪个分类。
- 建议可以持续增加、移除和重排。总数、变化回执和完整列表入口比“固定 3 条”更符合真实工作。
- quick capabilities 只在 conversation 贴着 composer；workbench 不显示输入壳，也不承担能力启动入口。

### 长列表密度

- 三类没有 2–3 条上限。默认视口可以只显示每组最高优先级摘要，但必须同时显示 section、总数和 `查看全部`。
- 90+ 项使用稳定 item ID、增量加载或虚拟化；用户正在 hover、预览、键盘选中或阅读的行暂时锁位。
- 用户滚离顶部时，后台排序先显示 `7 条已更新`，不要让指针下的内容突然跳动。
- 三类共享一个 workbench body scroll，不建立三个嵌套滚动区，也不做卡片墙。

## 四、用户主动说话与系统自动感知如何共存

```mermaid
flowchart LR
    A["正文编辑现场"] --> B["Ambient 自动感知 runtime"]
    B --> C["latest-wins workbench snapshot"]
    C --> D["Copilot 默认工作台"]
    D -->|"显式打开或带入对话"| E["conversation + action/context chips + composer"]
    E -->|"用户发送"| F["冻结本轮上下文并运行"]
    F --> G["正文原位预览"]
    G -->|"接受写入"| H["History 事务"]
    G -->|"拒绝或取消"| E
```

### 用户停留在工作台

```text
有效编辑 / 切换文档 / 当前块改变 / 手动刷新
  → 等待写作停顿并满足 cooldown
  → 保留旧 snapshot，后台重新感知
  → 原位更新三类队列与排序
  → 显示新增、归档、重排或无变化回执
```

后台刷新不切到 conversation，也不写进 thread。查看、忽略、展开和解释排序都留在 workbench。

### 用户进入对话

- 用户显式点击固定二级 rail 的 `对话`，或在 workbench 选择能力、建议、`带入对话` 后进入 conversation。
- 后台感知继续运行，但只在固定 `工作台` tab 上显示轻量 `+N` 更新标记，不在 thread 内制造另一个位置不同的返回入口。
- 用户发送时才冻结 run snapshot；结果仍回到正文原位预览。
- 点击建议只装配 chips 和可编辑草稿，不立即调用模型，更不能直接写正文。

## 五、原 Ambient 内容分别去哪里

| 旧概念 | 新位置 | 用户看到的名字 | 展示规则 |
| --- | --- | --- | --- |
| Current Work State | workbench 的紧凑范围头 | 正在整理 | 只说当前对象与整理方向；低置信且会改变排序时才允许调整 |
| Open Writing Moves | workbench 第一段 | 接下来可能要做 | 动作优先，说明当前缺口和点击结果 |
| Evidence Source / Related Push | workbench 第二段 | 相关材料 | 标题、来源、关联理由、查看/带入对话/忽略 |
| Session Thought Trace | workbench 第三段 | 还没安放的想法 | 显示原句或摘要与可能归属，永远不是 todo |
| Recent Work Trace | 每条建议的按需解释 | 为什么推荐 | 默认折叠，不永久铺开 files/themes/actions |
| Morning Briefing | 只作为当前工作候选的信号来源 | 知识库变化 | 只有和当前编辑直接相关时进入对应 workbench section，不保留 recurring modal |
| Serendipity | 最多一个低权重探索项 | 也许有关 | 必须能说明结构桥接，默认弱化或折叠 |
| Deep Check | composer 的显式 capability | 检查本节 | 只有用户选择后才运行 |

“为什么现在出现”不再是一个抽象大栏目。每条建议直接给一句人话原因：

- `因为本段只有结论，还没有边界例子。`
- `因为你刚编辑了“回写边界”，而这篇笔记定义了同一事务模型。`
- `因为这句话在本次会话出现过两次，但还没有放入正文。`

更详细的 recent files、链接和行为 trace 只在用户点 `为什么推荐` 后展开。

## 六、完整能力如何进入这套交互

全部能力仍由 composer 附近的 capability picker 提供，不把能力做成常驻卡片墙。Composer 附近只展示 2–3 个当前对象的 quick capability；这个数量限制不适用于 workbench 内容。Ambient runtime 会分别对三类候选持续排序，workbench 保留完整可访问列表。

| 信号或缺口 | workbench 中对应的动作 | 绑定到 composer 后的能力 |
| --- | --- | --- |
| 当前段落表达含混或逻辑跳跃 | 修清这段判断 | Correct Content / Rewrite Selection |
| 当前结论缺证据 | 找一条支撑材料 | Add Evidence / Suggest Links |
| 当前概念与多个 Vault 节点有结构关系 | 看图谱里的关联 | Suggest Links Graph / select links graph |
| 段落尚未完成 | 继续当前段落 | Continue Writing / concurrent content |
| 文档结构松散 | 整理结构或制定计划 | Format Polish / Writing Plan |
| 内容过长或范围过大 | 总结或建议拆分 | Summarize / Suggest Split |
| 需要全篇质量检查 | 审阅文章 | Review Article / Polish Document |
| 当前块可能需要标签或概念归档 | 补标签或抽概念 | Suggest Tags / Extract Concepts |
| 任务列表与正文不一致 | 检查任务 | Check Task List |
| 用户选择文本、链接或图谱上下文 | 基于已选对象执行 | select text / select link / select links graph |

`Translate`、`Write Article` 等不一定能被当前编辑现场稳定推断的能力，继续留在“全部能力” picker 中，不为证明能力齐全而强行进入 Ambient workbench。

## 七、建议区里的三种内容不能混成卡片墙

三类内容按固定顺序纵向排列在同一个 workbench 中，同时可见，但有不同的动作语义：

### 下一步

- 先显示正文缺口，再显示建议动作。
- 主操作是 `预览` 或 `带入对话`。
- 例：`补一个反方边界：本段只有结论，没有说明何时不应回写。`

### 相关材料

- 显示标题、来源、关联理由和置信度。
- 操作是 `查看`、`带入`、`忽略`。
- 不应只展示“91% 相关”，必须用一句话解释它能帮助什么。

### 待整理想法

- 显示原句或短摘要，以及可能适合放入的位置。
- 操作是 `带入对话`、`放入提纲`、`暂时保留`。
- 不自动变成任务，不使用 todo 心智。

三类共享一个 workbench body scroll，不创建分类 tab 或三个嵌套滚动区。每段都显示总数、排序状态和明确的 `查看全部`；列表可以很长，生产实现通过稳定 ID、增量加载或虚拟化控制 DOM，而不是把内容上限写成 3 条。

## 八、刷新、忽略、带入和已处理

- `刷新`：保留当前 snapshot，后台重新比较；结束后说明具体变化，避免闪动后回到原样。
- `忽略`：仅从本轮建议中移除，短暂显示 `已忽略 · 撤销`；作为排序负反馈，但不进入 History。
- `带入对话`：切换到 conversation，装配 action/context chips 与可编辑草稿并聚焦输入框；不自动发送、不运行模型。
- `查看`：在正文或来源预览中定位，不制造一条新的聊天消息。
- `已处理`：正文变化后不再成立、已经使用或明确忽略的项目，在下一次 snapshot 中退出。
- `调整理解`：只在系统 focus 确实影响推荐时出现；调整结果影响后续排序，但不进入 History。

## 九、与 History 的边界

History 继续作为独立顶层工作面，因为它解决的是事务与恢复，而不是建议或对话：

- 对话、自动建议、刷新、查看、忽略、带入但未执行，都不进入 History。
- 只有真实正文事务进入 History：用户直接编辑、用户接受的 AI 写入、接受后再次编辑、回滚。
- Copilot 可以显示轻量写入回执，并提供 `查看这次变更`。
- 完整 unified diff、split before/after、定位、冲突检查和回滚由 History modal 负责。

## 十、需要保留与需要退役的东西

### 必须保留

- 用户不发消息时，系统仍能低频、事件驱动地感知。
- debounce/cooldown、latest-wins、不阻塞编辑。
- 每条建议都有来源和人话版的 why relevant。
- 所有正文修改 preview-first、用户确认、原位写回。
- 用户能刷新、忽略、调整理解，反馈进入后续排序。
- 自动发现有稳定、可停留的位置，不是闪动通知。
- trace 默认折叠，未落位想法不变成 todo。
- Ambient runtime、Copilot execution、History transaction 的内部 ownership 继续分离。

### 应从用户界面退役

- 独立 `Ambient` tab。
- `Current Work State / Recent Work Trace / Session Thought Trace / Open Writing Moves` 这些内部英文术语。
- 当前 lab 的功能说明句。
- 把“纠正理解”做成醒目、长期存在的大按钮。
- recurring Morning Briefing modal。
- 状态栏闪动数字作为主入口。
- 永久摊开的 files/themes/actions trace。
- 每次自动刷新都追加一条聊天消息。
- 把所有能力做成等权卡片墙。

## 十一、v7 lab 的当前验证目标

本轮只修改小 DOM 的 `intelligence-lab.*`，没有回到完整 `index.html`。v6 的 fixed shelf 已被本决策替代；v7 需要覆盖以下状态：

1. Copilot 默认打开完整 workbench，三类长列表纵向常显，workbench 不显示 composer。
2. `工作台 / 对话` 使用固定位置的统一二级 rail；显式打开或选择建议/材料进入 conversation，显式返回时恢复 workbench 的 snapshot 和滚动位置。
3. 自动感知更新保留旧 snapshot，原位标出新增、归档和重排，不切换当前 body，也不追加 thread event。
4. `带入对话` 绑定 chips 与可编辑草稿，不自动运行。
5. Copilot streaming / 正文预览留在 conversation；后台更新只显示轻量 workbench badge。
6. History 保持独立，点击事务打开大 diff modal。
7. Narrow drawer 的 workbench 占满 body；conversation 才使用固定底部 composer，不把侧栏推到正文下方。

视觉验证可以集中在方向完成后做一次，不需要每个小改动都截图。

## 十二、建议阅读顺序

先读能够解释产品方向的文档，再看实现计划：

1. [Ambient Push 原始设计](../../superpowers/specs/2026-05-01-ambient-push-design.md)
2. [Copilot Command Center 最终用户流](../../superpowers/specs/2026-05-16-copilot-command-center-final-ux-flow.md)
3. [Ambient Current Work State 产品与技术复盘](../../superpowers/specs/2026-06-02-ambient-push-current-work-state-product-technical-review.html)
4. [Ambient Floating Panel 探索](../../superpowers/specs/2026-07-07-ambient-floating-panel.html)
5. [Composer block AI capability contract](../../superpowers/specs/2026-07-15-composer-block-ai-capability-contract.md)
6. [当前 Intelligence sidecar spec](../../superpowers/specs/2026-07-15-composer-intelligence-sidecar-ui.md)
7. [Ambient 当前 feature 入口](../../14-feature-ambient-push.html)

关键视觉证据：

- [Current Work State 历史稿](../ambient-current-work-state-2026-06-02/ambient-current-work-state-v1.png)
- [Session Thought Trace 历史稿](../ambient-current-work-state-2026-06-02/ambient-session-thought-trace-v1.png)
- [Copilot Command Center 完整流程图](../copilot-command-center-redesign-2026-05-14/final-ux-flow-screenshot.png)
- [Copilot entry panel](../copilot-command-center-redesign-2026-05-14/assets/final-flow/01-copilot-entry-panel.png)
- [自动 insight review](../copilot-command-center-redesign-2026-05-14/assets/final-flow/02-auto-review-resizable-insights.png)
- [归档三-tab Ambient lab 截图](./preview-intelligence-ambient-v3.png)

## 已确认的产品决策

1. 顶层正式采用 `Copilot / History`。
2. Copilot 默认 body 是完整 Ambient workbench；用户表面使用 `正在整理 / 接下来可能要做 / 相关材料 / 还没安放的想法`，不要求理解 Ambient 术语。
3. Copilot 内部固定使用 `工作台 / 对话` 二级 rail；两种状态下位置、顺序和尺寸一致，不再散落单向返回按钮。
4. 三类按固定顺序纵向常显并支持长列表，不设置 2–3 项内容上限；2–3 只属于 conversation composer 的 quick capabilities。
5. workbench 不显示 composer；显式打开对话、选择能力/建议或 `带入对话` 时进入 conversation，返回也必须显式切换。
6. composer 状态在切到 workbench 时只隐藏不清空，draft、chips、caret 与上下文仍可恢复。
7. 自动 snapshot refresh 只更新 workbench，不切换 body、不追加聊天消息；固定 `工作台` tab 可显示轻量更新标记。
8. Morning Briefing 不再拥有当前编辑 sidecar 的独立栏目，只有与当前写作直接相关的变化才进入对应 workbench section。
9. v6 fixed shelf 已归档；当前实现仍停留在轻量 v7 lab，完整 `index.html` 与生产 panel 是否合并仍需单独决定。
