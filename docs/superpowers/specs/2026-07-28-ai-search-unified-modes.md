# AI Search 统一模式入口设计

日期：2026-07-28
产品方向：**Decided**
设计状态：**Owner-corrected**
生产状态：**Implemented in isolated worktree; real Obsidian interaction pending**

配套材料：

- [可视化正式设计](../../gstack/ai-search-unified-modes-2026-07-28/design-review.html)
- [可交互 mock](../../gstack/ai-search-unified-modes-2026-07-28/index.html)
- [AI Graph Artifact Platform](./2026-07-28-ai-graph-artifact-platform.md)
- [Shared AI Instruction Composer](./2026-07-28-shared-ai-instruction-composer.md)
- [Peak 全键盘导航系统](./2026-07-24-peak-keyboard-navigation-system.md)
- [Vault Intelligence](../../13-feature-vault-intelligence.html#user-workflows)
- [Roadmap](../../roadmap.html)

> 2026-08-02 owner correction：本文同时记录当前实现边界。Vault Intelligence 的完整 graph / health / review projection 归本 modal，不再转跳旧 Copilot Vault workspace；选择 mode 本身仍不启动扫描。

## 1. 核心裁决

Quick Search modal 顶层只保留两个位置：

1. `Vault Search`：确定性搜索。
2. AI workspace selector：默认显示 `AI Search`，下拉可切换 `AI Graph` 与 `Vault Intelligence`。

不再提供独立的 All AI Graphs Library，也不再让 Vault Intelligence 独占顶栏按钮。AI Graph 的全量浏览就是 `AI Search → AI Graph` 模式下的紧凑历史列表；artifact repository、版本和 Graph Detail 继续保持独立事实边界。

## 2. 为什么需要改

当前生产已经有一部分正确基础，但入口语义彼此竞争：

| 当前事实 | 证据 | 设计响应 |
| --- | --- | --- |
| AI Search 输入框内已有 `Vault Analysis / AI Graph` mode menu | [`SearchModal.tsx`](../../../src/ui/view/quick-search/SearchModal.tsx) | mode selector 上移到顶栏，输入框不再重复显示 mode |
| Vault Intelligence 是顶栏右侧独立按钮 | [`SearchModal.tsx`](../../../src/ui/view/quick-search/SearchModal.tsx) | 收进同一个 AI workspace selector |
| Recent history 已能区分普通 analysis 与 graph record | [`RecentAnalysisList.tsx`](../../../src/ui/view/quick-search/components/RecentAnalysisList.tsx) | 复用同一列表心智，不另造 Graph card grid |
| 现有 `Tab` handler 直接切换 Vault / AI | [`SearchModal.tsx`](../../../src/ui/view/quick-search/SearchModal.tsx) | 回到全键盘规格：`Tab` 在组件间走，mode menu 使用标准 listbox/menu 键盘 |
| 旧稿把完整 Vault graph / maintenance projection 放在 Copilot Vault tab | [Vault Intelligence](../../13-feature-vault-intelligence.html#user-workflows) | 该 projection 迁入 Quick Search 的 Vault Intelligence workspace；不复制旧 picker panel |

根因不是视觉样式，而是同一个 modal 同时暴露了三种层级：

- 顶层 search surface；
- 输入框内 analysis preset；
- 顶栏外置的 expensive review。

用户需要选择的是“现在要做什么”，不应该先理解三套实现来源。

## 3. 目标与非目标

### 3.1 目标

- 正常打开时默认进入 AI Search。
- AI Graph 与 Vault Intelligence 可发现，但不与高频入口争抢视觉空间。
- 三种 AI mode 复用 Shared AI Instruction Composer、历史列表和键盘语法。
- 所有已持久化 graph 都能在 AI Graph mode 找到并重开。
- 取消低价值的 Graph source/type filter 与 preview card grid。
- 与已接受的全键盘导航系统保持一致。

### 3.2 非目标

- 不合并 Vault Search 与 AI Search 的 runtime。
- 不从 Quick Search 再跳回或复制旧 Copilot Vault workspace。
- 不删除 AI Graph artifact repository、version、source、evidence 或 Graph Detail。
- 不让 mode selection 自动触发 Web、Vault scan 或昂贵 AI run。
- 不为三个 mode 新增 Command Palette 命令。
- 本轮不修改生产代码。

## 4. 目标信息架构

```text
Quick Search modal
├── Vault Search
└── AI workspace selector
    ├── AI Search · default
    ├── AI Graph
    └── Vault Intelligence
```

`AI Search` 是用户可见的默认产品名。`Vault Analysis` 可以继续作为内部 recipe / execution profile，但不再占据一级或二级可见导航。

### 4.1 顶栏对齐

- 保持原有的左右等分布局：左侧 `Vault Search`，右侧 AI workspace selector。
- 两侧可点击区域占满同一顶栏高度，label 的垂直中心必须一致。
- AI workspace selector 虽然包在 menu anchor 内，其 button 仍必须撑满父容器高度，不能贴近顶边。
- active underline 保持原有半栏宽度；mode menu 保持在 modal 边界内。

### 4.2 正常打开与恢复

- 普通打开：默认 `AI Search`。
- 关闭后再次普通打开：仍回到 `AI Search`，不跨 modal 记住低频 mode。
- 恢复正在运行的 session：打开该 session 所属 mode。
- 从 AI Graph history、related graph 或 artifact link 打开：直接进入 Graph Detail。
- 从 Vault Intelligence review history 打开：直接进入相应 review detail。
- 返回列表时：恢复进入 detail 前的 mode、滚动和活动行。

这个规则防止“上次偶尔看了一次 Vault Intelligence，下一次普通搜索却落在低频页面”的意外。

## 5. 三种 AI mode

### 5.1 AI Search

Primary job：向 Vault 提问、做分析、重开最近结果。

页面保留：

- shared PromptInput；
- Web 显式开关；
- Suggestions；
- active sessions；
- Recent analyses。

页面移除：

- 输入框里的 `Vault Analysis` mode pill；
- `AI Analysis` 与 `AI Search` 混用的旧命名。

### 5.2 AI Graph

Primary job：描述一张新图、查找已有图、重开并继续维护。

列表是一列紧凑 history row，不使用 preview card grid。每行只显示能帮助重开的信息：

- title；
- node / relation / source count；
- current version；
- needs-review 或 source-changed 状态；
- updated time。

不提供以下首版筛选：

- Vault / Web / Mixed；
- Any type / Concept / Entity / Evidence / Causal / Timeline；
- Active / Draft / Archived 常驻 chips；
- graph preview thumbnail grid。

理由：

- source kind 属于 provenance，不是高频 browse intent；
- graph type 主要指导 extraction，不是用户每次找图的第一条件；
- graph 数量不足以证明多排 filters 的价值；
- title 搜索、最近更新时间与紧凑列表足够支持首版重开。

当数据规模真实增长后，可以基于使用证据增加一个 search field 或 sort menu；不能预先恢复整排 taxonomy chips。

### 5.3 Vault Intelligence

Primary job：快速询问 Vault 健康与结构、重开最近 Vault review。

本模式可以展示：

- 最近一次 Vault health 摘要；
- stale hub / structural hole 等少量高层计数；
- recent reviews；
- `Open Vault workspace`。

本模式直接拥有只读 Vault graph / health projection 与显式 review entry：

- overview graph、hubs、structural holes；
- notes / words / communities / orphans stats；
- recent review history；
- Quick review / Complete review 显式动作。

它不挂载 <code>CopilotPickerContent</code>，也不提供 “Open Copilot Vault workspace”。切到本模式只读取 projection，不自动运行 complete review。

## 6. 共享输入与 mode adapter

三种 AI mode 消费平级的 [Shared AI Instruction Composer](./2026-07-28-shared-ai-instruction-composer.md)。Quick Search 不再为每个 mode 建输入栈。

每个 mode adapter 只提供：

```ts
// Proposed design contract
interface AISearchModeAdapter {
  mode: 'search' | 'graph' | 'vault-intelligence';
  label: string;
  placeholder: string;
  suggestions: SuggestionProjection[];
  historyProjection: HistoryProjection;
  submit(input: SharedPromptSubmission): Promise<RunRef>;
  restore(ref: HistoryRef | RunRef): Promise<void>;
}
```

共享能力拥有：

- input、IME 与 focus；
- context shelf、附件与 draft；
- submit / stop / error；
- history query field 的基本交互。

mode adapter 拥有：

- placeholder 与建议；
- 自动 context；
- run envelope；
- history projection；
- detail route。

## 7. 键盘与焦点

本 modal 继承 [Peak 全键盘导航系统](./2026-07-24-peak-keyboard-navigation-system.md) 的 `Zone → Component → Item` 模型。

### 7.1 标准路径

- `F6 / Shift+F6`：在 surface switcher、query、content/history 与 detail/actions 之间换 zone。
- `Tab / Shift+Tab`：在当前 zone 的组件间移动，不再切换 Vault Search / AI mode。
- mode trigger 的 `Enter / Space / ArrowDown`：打开 mode menu。
- menu 内 `Up / Down`：移动 option。
- menu 内 `Enter / Space`：选择 mode。
- `Escape`：关闭 menu 并把 focus 恢复到 trigger。
- history list 内 `Up / Down`：移动活动行；`Enter` 重开。

### 7.2 加速层

既有 `Alt/Option + Up/Down` 可以作为 mode cycling 的 secondary accelerator，但必须满足：

- keyboard map 可发现；
- Obsidian Hotkeys 冲突可见；
- input、textarea、contenteditable 与 IME composition 时不拦截；
- 没有该快捷键时仍可走完整标准路径。

## 8. Screen inventory

| Screen / state | Primary job | Reads | Writes | Exit |
| --- | --- | --- | --- | --- |
| AI Search landing | 提问与重开分析 | suggestions + analysis history | analysis run ref | analysis detail / close |
| AI Graph history | 找到、重开或创建 graph | artifact browse projection | create run ref | Graph Detail |
| Vault Intelligence landing | 看 Vault graph、摘要并重开 review | digest + review projection | explicit review run ref | review detail / close |
| Mode menu | 切换 AI task | current session mode | transient modal state | selected landing |
| Graph Detail | 阅读、审阅和更新 graph | canonical artifact version | semantic draft / new version | AI Graph history |

## 9. 数据与 runtime 边界

统一入口不等于统一事实源：

- analysis history 继续读取 analysis records；
- AI Graph history 读取 artifact repository 的 browse projection；
- Vault Intelligence history 读取 vault review records；
- UI 可以把三者投影成相同 row component，但不能把 graph body 塞回 analysis snapshot；
- normal modal mode 是 transient UI state，不写入 artifact 或 machine record；
- run / deep-link restore 可以携带 mode，但不能改变普通打开的默认值。

## 10. 被拒绝的方案

### 10.1 独立 All AI Graphs Library

拒绝。它复制了 AI Search 已有的 history browse 心智，还要求用户理解 source/type taxonomy 才能重开一张图。

### 10.2 三个等权顶栏 tab

拒绝。AI Graph 与 Vault Intelligence 都是低频能力，长期占据顶栏会放大其使用频率并压缩主任务。

### 10.3 保留输入框 mode pill，再把 Vault Intelligence 加进去

拒绝。它继续让 surface、preset 和 expensive review 混在输入组件内部，也与顶栏 AI Search 名称重复。

### 10.4 跨次记忆最后 mode

拒绝作为默认。它优化了极少数连续工作，却让绝大多数普通打开失去可预测性。恢复 run 或 deep link 是明确例外。

## 11. 验收标准

设计实施完成后，必须同时满足：

- 普通打开默认 AI Search。
- 顶层只显示 Vault Search 与一个 AI workspace selector。
- 输入框内不再出现 Vault Analysis / AI Graph 的重复 selector。
- AI Graph mode 以单列 history 展示全部 persisted graphs。
- AI Graph history 没有 source/type filter chip rows 和 preview card grid。
- 顶栏保持原有左右等分布局，Vault Search 与 AI workspace selector 高度一致、严格垂直居中。
- 每个 graph row 显示不可变的创建 surface 与主要创建上下文；File Atlas 来源必须显示精确文件名。
- graph row 可打开同一个 Graph Detail，并能返回原列表位置。
- Vault Intelligence mode 不因被选中而自动运行 complete review。
- Vault Intelligence 直接显示 Vault graph / health / recent reviews，不进入旧 Copilot Vault workspace。
- `Tab` 不切 mode；mode menu、history list 与 Escape focus restoration 可全键盘完成。
- input / IME 不被 mode shortcut 截获。
- UI 与 docs 明确标记真实 Obsidian interaction pending，不能把 build 升级为实机验收。

## 12. 明确不要做

- 不把“合并入口”误写成“合并三个 runtime”。
- 不为了展示能力而恢复所有 Graph taxonomy filters。
- 不把 AI Graph card thumbnail 当成必须信息。
- 不让选择 Vault Intelligence 自动产生费用。
- 不在未实施前把 mock 描述成生产 UI。
