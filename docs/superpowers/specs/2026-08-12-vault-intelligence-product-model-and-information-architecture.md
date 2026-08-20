# Vault Intelligence 产品 Overview

> 状态：产品方向稿，供 owner 审阅；不是实现承诺
>
> 日期：2026-08-12
>
> 文档类型：产品 Overview
>
> 本文只回答：Vault Intelligence 是什么、用户会看到什么、可以做什么、结果和安全边界是什么
>
> 本文只保留产品总览。页面布局、运行过程、队列、AI Review 和技术边界分别进入第 11 节链接的专项设计文档。
>
> Scan 产生的维护事项如何分组、展开、批量覆盖、纠正 Peak 建议并安全写入，统一见[《Scan maintenance review 共享规则》](./2026-08-15-vault-scan-follow-up-and-work-queue-contract.md#scan-maintenance-review-shared-rules)。

---

## 1. 先用 30 秒理解 Vault Intelligence

> **Vault Intelligence 是 Peak 的全库观察与维护中心。它让用户看清当前 Vault 里有什么、这些对象如何连接、哪些地方需要关注，并从同一处扫描、处理和验证结果。**

它有两个同等重要的职责：

| 用户目的 | Vault Intelligence 提供什么 |
|---|---|
| 看整个 Vault | 文件与 Peak 工作对象、Vault map、Search 状态、Community、Hub、Orphan、Gap、近期变化 |
| 维护整个 Vault | Scan Vault、Work queue、按需补充 Search / AI 信息、安全 proposal、运行进度与结果验证 |

如果只有第一部分，它只是静态 dashboard；如果只有第二部分，它只是一个看不见全局结果的任务运行器。

### 它不是什么

- 不是一个只有 `Health 86` 的健康分数页面；
- 不是另一个文件编辑器、Graph 编辑器或 Command Center；
- 不是打开后自动花费 AI 成本的后台任务；
- 不是把所有文件强行当作 Markdown；
- 不是允许 AI 未经审阅批量修改用户文件的入口。

---

## 2. 用户会在这里看到什么

Vault Intelligence 观察的是当前 Vault 的完整对象和状态，而不只是 Markdown 笔记。

### 2.1 Vault map：整个 Vault 的对象与关系

Vault map 是核心全局视图，但只有两个并列视角：`Vault contents` 和 `Activity`。

Vault contents 同时包含：

- Vault 内容：Markdown、PDF、图片、音视频、Canvas、Bases、Excalidraw、`.peaksheet` 和未来 `.peakaigraph`；
- Peak 文件型对象：AI Graph、Peak Sheet 与用户显式物化的产物；
- 内容关系：链接、语义邻居、AI Graph source、文件与 Community / Topic 的归属；
- 结构分析：Community、Hub、Orphan、Gap、Bridge、Broken reference；
- Search / AI 状态：Readable、Search ready、vectors、Summary、AI Tags、Not used、Failed。

Activity 使用文件、Chat context、Project change、Composer activity、AI Graph revision 和 Run 作为时间证据，回答用户近期在什么主题上工作、关注点如何移动。Chat、Project 和 Composer 不与 Community 并列画成知识节点。

```text
Vault map
├── Vault contents
│   ├── Files / file types / Search & AI status
│   └── Community / Topic / Hub / Orphan / Gap / Bridge
└── Activity
    ├── topic volume / focus movement / event clusters
    └── file / Chat / Project / Composer / AI Graph evidence
```

对象出现在 Vault map 中，不代表它必须参加所有分析。例如普通 Chat 可以是工作节点，但不会因此被判断为 orphan；每种分析只处理适合的对象。

### 2.2 Search status：哪些内容现在可以被找到

Overview 不展示难以解释的 `Maintenance coverage`，只回答一个直接问题：有多少文件现在能被 Search 找到，剩下的为什么找不到。

```text
Search status · 4,860 files
├── Ready                 4,133  Search 现在可以找到
├── Waiting for update      388  等待读取或更新
├── Needs attention          27  读取失败，需要处理
└── Not used by Search       312  该类型或目录不参与 Search
```

这些数字只是界面语言示例。`Not used by Search` 是范围说明，不是错误。

### 2.3 Continue work：哪些事情真的需要继续

对象存在，不代表工作未完成。只有具有明确状态和下一步的事项才进入 Continue work，例如：

- blocked Project Plan；
- Composer proposal 等待 review；
- AI Graph 的来源已经变化；
- 文件读取失败；
- Scan Vault 运行失败或暂停；
- metadata proposal 等待确认。

普通 Chat、Project 或 Peak Sheet 不会仅因为存在或很久没有打开就被标成未完成。

### 2.4 不设计综合 Health score

旧界面的 `Health 86` 无法告诉用户问题来自 Search、Orphan、broken link、Project blocked 还是扫描失败。第一版完全删除综合分数和二级趋势，改为显示具体事实、变化和下一步。

---

## 3. 页面结构

Vault Intelligence 使用独立 View，而不是继续放在大型 Modal 中。顶层只有四个页面：

| 页面 | 用户问题 | 主要内容 |
|---|---|---|
| Overview | 我的整个 Vault 现在怎么样？ | Vault map 摘要、Search status、Continue work、What changed、活动运行 |
| Vault map | Vault 内容如何组织，工作关注如何随时间变化？ | Vault contents 与 Activity 两个并列视图 |
| Work queue | 现在有什么值得处理？ | 所有可行动问题、建议、待审事项和失败 |
| Runs | 正在做什么，之前做了什么？ | active、paused、failed、completed，以及恢复和验证 |

以下内容使用二级页面，不增加顶层 tab：

- Scan preflight、Active run、Completed run；
- Vault contents：文件类型、Search / AI 状态与完整知识结构图；
- Activity：密度概览、主题流、事件簇与证据；
- Vault object、Community、Hub、Orphan、Gap、Work item 详情；
- AI Review result 与 Proposal review。

Overview 是 Vault map 的摘要，Work queue 是其中可行动状态的投影；它们不是另外两套数据。

---

## 4. Overview 第一屏

用户打开页面后三秒内应该知道：数据是否新鲜、Vault 里有什么、Search 是否可用、什么需要继续，以及是否有运行正在进行。

```text
┌────────────────────────────────────────────────────────────────────┐
│ Vault Intelligence        Updated 2h ago                [Scan Vault]│
├────────────────────────────────────────────────────────────────────┤
│ Overview | Vault map | Work queue | Runs                            │
├────────────────────────────────────────────────────────────────────┤
│ 4,860 files │ 128 chats │ 12 projects │ 8 graphs │ 11 need attention│
├──────────────────────────────────────┬─────────────────────────────┤
│ Vault map preview                    │ Continue work               │
│ Objects / connections / structure    │ Status + reason + next step │
├──────────────────────────────────────┼─────────────────────────────┤
│ Search status                        │ What changed                │
│ Ready / Waiting / Failed / Not used  │ Objects / relations / state │
├──────────────────────────────────────┴─────────────────────────────┤
│ Active run strip appears here whenever a run is still in progress │
└────────────────────────────────────────────────────────────────────┘
```

空闲时只有一个主动作。当前建议名称是 `Scan Vault`；第一次使用显示 `Prepare Vault`，有暂停运行时显示 `Resume scan`。

---

## 5. 六条用户视角流程

左侧说明用户为什么来和最后得到什么，右侧显示用户看到的页面变化。点击流程图可查看原尺寸。

<table style="table-layout: fixed; width: 100%;">
  <colgroup>
    <col style="width: 25%;">
    <col style="width: 75%;">
  </colgroup>
  <thead>
    <tr><th>用户任务与结果</th><th>页面流程 · Mermaid</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>A · 浏览整个 Vault</strong><br>立即读取上次成功结果，不运行 AI，不修改文件。</td>
      <td><a href="../../assets/vault-intelligence-flows/flow-a-overview.svg"><img src="../../assets/vault-intelligence-flows/flow-a-overview.svg" alt="从 Overview 进入 Vault map 并查看对象详情" style="width: 100%; height: auto;"></a></td>
    </tr>
    <tr>
      <td><strong>B · 重新扫描</strong><br>先交付确定性 facts，再由 AI Review 形成 insights；全程显示实时进度。</td>
      <td><a href="../../assets/vault-intelligence-flows/flow-b-scan.svg"><img src="../../assets/vault-intelligence-flows/flow-b-scan.svg" alt="从数据过期到确定性扫描、AI Review 和完成摘要" style="width: 100%; height: auto;"></a></td>
    </tr>
    <tr>
      <td><strong>C · 处理 Orphan</strong><br>Vault Intelligence 负责发现和验证；编辑交给正确工作面。</td>
      <td><a href="../../assets/vault-intelligence-flows/flow-c-orphans.svg"><img src="../../assets/vault-intelligence-flows/flow-c-orphans.svg" alt="筛选 Orphan、查看证据、处理并在下次扫描验证" style="width: 100%; height: auto;"></a></td>
    </tr>
    <tr>
      <td><strong>D · 修复 Search 缺失</strong><br>查看原因，只更新选定范围，并验证 Search status。</td>
      <td><a href="../../assets/vault-intelligence-flows/flow-d-search.svg"><img src="../../assets/vault-intelligence-flows/flow-d-search.svg" alt="查看 Search 缺失原因、运行定向索引更新并刷新状态" style="width: 100%; height: auto;"></a></td>
    </tr>
    <tr>
      <td><strong>E · 让 AI 解释结构</strong><br>先选择范围；默认只读，写入必须进入 proposal review。</td>
      <td><a href="../../assets/vault-intelligence-flows/flow-e-ai-review.svg"><img src="../../assets/vault-intelligence-flows/flow-e-ai-review.svg" alt="选择结构范围、运行 AI Review 并查看证据和候选动作" style="width: 100%; height: auto;"></a></td>
    </tr>
    <tr>
      <td><strong>F · 查看 Peak 工作对象</strong><br>先看它们在 Vault map 中的关系；只有明确 continuation 状态进入 Work queue。</td>
      <td><a href="../../assets/vault-intelligence-flows/flow-f-peak-work.svg"><img src="../../assets/vault-intelligence-flows/flow-f-peak-work.svg" alt="筛选 Peak 工作对象、查看关系和 attention 状态并回到 owner surface" style="width: 100%; height: auto;"></a></td>
    </tr>
  </tbody>
</table>

---

## 6. Scan Vault：更新全局状态

用户使用 `Scan Vault` 是为了让 Vault Intelligence 重新认识当前 Vault，而不是为了选择某条内部管线。

### 点击后会发生什么

1. 页面先说明本次处理范围、会做哪些事情、是否使用 AI，以及大致时间和成本；
2. 用户确认后立即进入 Active run，不需要再点 `View progress`；
3. 运行中持续显示当前阶段、处理进度、当前对象、速度、剩余量、warning 和 failure；
4. 用户可以切换页面或关闭 View，运行状态不会消失；
5. 完成后展示新增、更新、跳过、失败，以及哪些全局数字和 Work queue 项发生变化。

默认处理上次成功扫描以后发生的变化。用户也可以从 Vault map、Work queue 或文件详情对一个明确范围重新处理；完整 Vault 扫描应是显式选择。

### 它可能包含什么

- 发现新增、修改、移动和删除；
- 更新 Search 所需的信息；
- 更新 Community、Hub、Orphan、Gap 和 broken reference；
- 运行确定性检查；
- 使用 AI 审阅本次 findings、相关对象和历史变化，形成 insight、可能根因、优先级与行动建议；
- 按用户选择补充 semantic search、AI summary 或 AI topics；
- 生成需要单独审阅的 metadata proposal。

这里有两个连续但职责不同的层级：

| 层级 | 负责什么 | 用户得到什么 |
|---|---|---|
| Deterministic scan | 用规则发现稳定、便宜、可复现的事实 | raw findings、阈值、证据和变化 |
| AI Review | 读取这些事实、Vault map、相关文件与历史，寻找跨 finding 的模式 | insight、根因假设、趋势、优先级和候选动作 |

因此，“detector 不需要 LLM”不等于“detector 结果不需要 AI”。确定性结果一完成就应立即可见；AI Review 是其上的第二层理解。如果 AI 不可用，扫描仍可完成，但必须明确显示 `Facts ready · AI review pending / failed`，不能把未完成的 AI 分析说成“没有问题”。

打开 Vault Intelligence 本身不会自动运行这些步骤，也不会自动产生 AI 成本。

> Preflight、Index 判断、Active run、进度真值和恢复规则见[《Scan Vault 与 Runs 设计》](./2026-08-12-vault-intelligence-scan-and-runs-design.md)。

---

## 7. Files、Search 与 AI 信息

Vault Intelligence 必须让用户知道所有文件类型的存在和处理状态，但不会假装所有类型能力相同。

### 用户能看到什么

| 用户问题 | 页面回答 |
|---|---|
| Vault 里有哪些文件类型？ | 数量、最近变化、是否可读取，以及应由哪个专用 View 打开 |
| 为什么 Search 找不到某个文件？ | Waiting、Failed、Not used 的具体原因和可执行动作 |
| 能否使用语义 Search？ | Ready、Missing 或 Not available |
| 是否已有 AI 摘要和机器主题？ | Available、Missing 或 Not used |
| Peak 是否建议修改 metadata？ | Pending review 或 None；它不属于 Search readiness |

基础 Search 与可选 AI 信息是并列状态：缺少 AI summary 不等于 Search 失败，也不代表 Vault 不健康。

### 所有文件类型都被看见，但处理方式不同

- Markdown、文本和代码可以根据能力进入 Search、结构分析和检查；
- PDF、图片、音视频显示提取、OCR、转录或 multimodal 状态，不假装所有内容都已被理解；
- Canvas、Bases、Excalidraw 使用专用结构处理，不通过通用文本 patch 修改；
- `.peaksheet` 和未来 `.peakaigraph` 作为一等 Peak 文件类型出现，并由各自 View 打开；
- 当前不支持或被策略排除的格式也显示原因，不从 inventory 中消失。

Indexed AI summary 和 AI topics 是可重建的机器信息；用户 frontmatter、tags 和 links 属于用户文件。任何文件写入都必须经过 proposal、证据、diff、用户选择和冲突检查。

> 完整文件类型矩阵、per-file 状态和 Summary / AI Tags / frontmatter 边界见[《Vault contents、Search 与 AI 状态设计》](./2026-08-12-vault-intelligence-contents-search-and-ai-design.md)。

---

## 8. Work queue：所有可处理事项的统一入口

Overview 只展示少量最值得关注的事项；Work queue 才是完整列表。它同时包含：

- Project Plan、Composer review、AI Graph source change 等明确需要继续的 Peak 工作；
- Search、读取和 AI 信息处理失败；
- Orphan、broken link、stale hub、Gap 和脆弱 Bridge；
- empty、stub、duplicate、命名、tag 和 metadata 问题；
- 失败或暂停的运行；
- 等待 review、apply 或 verify 的 proposal。

每个 Work item 必须回答五个问题：

1. 发生了什么；
2. 影响哪些对象；
3. 证据是什么；
4. 用户可以做什么；
5. 处理后如何确认问题已经解决。

用户可以按对象类型、问题类型、状态、文件类型和运行筛选；也可以选择一批事项进行忽略、稍后处理、重试或生成 proposal。可能修改用户文件的动作必须进入独立 review。

Overview 中的 Priority work 只是完整队列的 3–5 个高影响入口。每一项都必须说明 `Why this is here`，不能让用户误以为首页展示的就是全部能力。

> Queue source、排序、筛选、批量动作、Work item 详情和 detector 清单见[《Work queue 与 Findings 设计》](./2026-08-12-vault-intelligence-work-queue-and-findings-design.md)。

---

## 9. AI Review：把检查结果变成 Insight

AI Review 不是孤立的“再问一次 AI”，而是 Vault Intelligence 的核心理解层。它有两类入口：

- **扫描结果入口**：审阅本次或历史 run 的 findings，解释哪些问题属于同一模式、可能有什么共同根因、影响什么，以及先处理什么；
- **对象范围入口**：用户从 Vault map、Work queue 或对象详情选择 Community、Hub、Gap、文件集合或 work item，请 AI 深入解释这个范围。

它不作为全局 Header 中没有上下文的 `Run AI Review` 按钮。扫描结束后可以自动进入已在 preflight 中确认的 AI Review 阶段，也可以先保留确定性结果，等待用户从完成页或 Work queue 显式发起。

运行前说明范围、模型、成本和预期输出；运行中显示正在读取的证据；结果必须包含结论、证据、置信度、不确定性和下一步。

结果必须明确区分三层：

| 层级 | 含义 | 例子 |
|---|---|---|
| Observed facts | detector 已验证的事实 | 42 个 orphan，其中 31 个来自同一导入目录 |
| AI insights | AI 基于事实形成的可追溯推断 | 这更像一次未完成导入，而不是 31 个独立知识缺口 |
| Suggested actions | 等待用户选择的候选动作 | 先标记 staging，再审阅剩余 11 个 orphan |

AI Review 默认只读，不能覆盖 raw finding。它可以生成 candidate proposal，但不能直接修改文件。

> 入口、运行展示、结果结构和 proposal 流程见[《AI Review 与 Proposal 设计》](./2026-08-12-vault-intelligence-ai-review-and-proposal-design.md)。

---

## 10. 安全边界：什么时候会修改文件

大多数 Vault Intelligence 操作只更新本地可重建信息，不修改用户文件：

| 操作 | 是否修改用户文件 |
|---|---|
| 查看 Overview、Vault map、Work queue 或历史结果 | 否 |
| Scan Vault、Search update、结构分析和确定性检查 | 否 |
| semantic search、AI summary、AI topics | 否 |
| AI Review | 否 |
| 生成 metadata / link / Bridge proposal | 否 |
| Apply 用户接受的 proposal | 是，只修改用户明确接受的文件 |

真正写入前必须展示证据和逐文件 diff，检查文件是否在 proposal 生成后发生变化，只应用用户接受的部分，并在写入后重新扫描验证。

---

<a id="vault-intelligence-design-docs"></a>

## 11. 详细设计文档

本文到这里结束。需要评审某个页面或准备实现时，直接进入对应的专项设计，不再在总览里重复页面字段和技术细节。

如果要按本轮反馈逐项检查，先打开[《Owner Review Index》](./2026-08-12-vault-intelligence-owner-review-index.md)。

| 专项设计 | 回答的问题 | 包含内容 |
|---|---|---|
| [Overview 与 Vault map](./2026-08-12-vault-intelligence-overview-and-vault-map-design.md) | 整个 Vault 如何在一个全局视图中被理解？ | Overview 第一屏、对象模型、Community / Hub / Orphan / Gap、进入和离开路径 |
| [Activity 时间可视化调研与设计](./2026-08-12-vault-intelligence-activity-visualization-research.md) | 大量活动如何在同一页面被概览、缩放和下钻？ | 密度 Navigator、主题流、聚合粒度、事件簇、组件建议与证据边界 |
| [Scan Vault 与 Runs](./2026-08-12-vault-intelligence-scan-and-runs-design.md) | 一次扫描如何准备、运行、恢复并交付结果？ | Preflight、Index 判断、Active run、实时进度、完成页、Runs |
| [Vault contents、Search 与 AI 状态](./2026-08-12-vault-intelligence-contents-search-and-ai-design.md) | 每种文件为什么 Ready、Waiting、Failed 或 Not used？ | 文件类型、读取与索引、Summary、AI Tags、vectors、定向重试 |
| [Work queue 与 Findings](./2026-08-12-vault-intelligence-work-queue-and-findings-design.md) | 所有待处理事项如何进入同一队列？ | Queue source、优先级、详情、批量动作、19 个确定性 detector |
| [Scan maintenance review 共享规则](./2026-08-15-vault-scan-follow-up-and-work-queue-contract.md#scan-maintenance-review-shared-rules) | 不同维护事项如何共享同一套安全评审合同？ | Canonical atom、多种 projection、分级作用域、owner correction、Apply / Verify；File Property 的完整合同见第 12 节 |
| [AI Review 与 Proposal](./2026-08-12-vault-intelligence-ai-review-and-proposal-design.md) | AI 如何把 findings 变成 insight，又如何安全进入修改建议？ | 输入、过程、结果、事实与推断分层、proposal、验证 |
| [技术产物与交付边界](./2026-08-12-vault-intelligence-technical-and-delivery-reference.md) | 当前有什么、还缺什么，运行会保存什么？ | 输入与产物、持久化、current / planned / future、Mock 验收、开放决定和源码证据 |
