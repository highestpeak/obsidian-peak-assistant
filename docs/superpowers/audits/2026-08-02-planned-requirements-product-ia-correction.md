# Planned Requirements 产品 IA 纠偏与逐项 Review 清单

日期：2026-08-02
分支：`codex/planned-requirements-20260731`
对象：`docs/planned-requirements.html` 登记的 11 个需求 ID
状态：9 个 active capability；1 个 merged；1 个 retired
真实 Obsidian：`INTERACTION NOT VERIFIED`

## 1. 本次纠偏结论

| 原需求 | 当前决定 | 生产 surface |
| --- | --- | --- |
| Vault Graph Segment | 能力保留，迁出旧 Copilot picker | Quick Search → Vault Intelligence |
| Document Local Graph | 能力保留，迁出 Document tab | File Atlas context row + Graph subview |
| Search Hub Drawer | 不再作为独立能力 | Search → Open in File Atlas handoff |
| Ambient Floating Panel | 撤销 | Ambient sensing → Composer Intelligence lifecycle |

这四项不是换标签。实现层已经同步改动：Search Modal 不再挂载 `CopilotPickerContent` 来显示 Vault Intelligence；Copilot picker 不再插入 Vault graph 或 Document graph strip；Search inspector 不再渲染 Hubs section；本分支新增的 Ambient floating host、drag / collapse / refresh chrome 与 CSS 已删除。

## 2. 逐项 Review 清单

### 需求 1：Vault Graph Segment

当前能力：Vault-wide graph overview、hub 列表、结构断点、notes / words / communities / orphans stats、recent Vault reviews，以及显式 Quick / Complete review。

我做了什么：

- 新建 Quick Search 自有的 `VaultIntelligenceWorkspace`。
- `SearchModal` 的 `vault-intelligence` mode 直接渲染该 workspace。
- 删除旧 `src/ui/view/copilot/vault/VaultMaintenanceSegment.tsx`。
- 普通切换 mode 只读取 digest 和 history；只有点击 review 按钮才启动既有 run modal。
- 删除 “Open Copilot Vault workspace” 产品路径。

怎么 review：

1. 打开 [AI Search 交互 Mock](../../gstack/ai-search-unified-modes-2026-07-28/index.html)。
2. 点击右侧 `AI Search` selector，选择 `Vault Intelligence`。
3. 确认看见 stats、Vault graph overview、Hubs、Recent reviews。
4. 确认没有旧 Copilot Vault tab 或 `Open Vault workspace`。
5. 在真实 Obsidian 中确认切换 mode 不触发 run；点击 Quick / Complete review 才触发。

自动证据：`test/planned-requirements-production-contract.test.ts`；build。
剩余：真实 Obsidian mode switch、review modal、history record opening。

### 需求 2：Document Local Graph

当前能力：当前文件的 primary / candidate hubs、inbound / outgoing link counts 与 local / two-hop neighborhood graph。

我做了什么：

- 删除旧 Copilot Document tab 的 `DocumentContextGraphStrip`。
- 新建 `FileAtlasDocumentContext`，放在 File Atlas 文档信息行下方。
- `Open local graph` 在同一个 File Atlas 内切到 Graph subview。
- 继续复用现有 `FileAtlasGraph` 的 local / two-hop、semantic toggle 与五种 layout，不新建第二套图谱 runtime。

怎么 review：

1. 在真实 Obsidian 打开任意有 wikilink / backlink 的 Markdown 文件。
2. 打开 File Atlas。
3. 确认顶部 context row 显示 Hubs、inbound、outgoing。
4. 点击 `Open local graph`，确认切到 Graph subview，并以当前文件为中心。
5. 双击 graph node，确认打开文件；切 local / two-hop，确认节点范围变化。

自动证据：contextual graph contract、File Atlas focused tests、build。
剩余：真实索引数据、真实 node interaction。

### 需求 3：Search Hub Drawer

当前决定：`MERGED`，不再建设独立 drawer。

原来是什么意思：在 Vault Search 结果 inspector 里再放一块 Hubs / candidate hubs / orphan / local graph UI。这会与 File Atlas 重复，所以你觉得它不清楚是合理的。

我做了什么：

- 删除 `HubSection.tsx`。
- Search inspector 删除 Hubs collapsible section。
- inspector header 增加 `Open in File Atlas` icon action。
- Quick Search app host 增加窄的 `openFileAtlas(path)` handoff；先打开该文件，再用它作为 File Atlas initial document。

怎么 review：

1. 在 Vault Search 运行一次搜索并打开 inspector。
2. 确认 inspector 仍有 Connected / Discovered / AI Graph，但没有 Hubs drawer。
3. 点击地图 icon（tooltip 为 `Open in File Atlas`）。
4. 确认 File Atlas 以选中的 search result 为当前文档，并在那里显示 hubs / local graph。

自动证据：production contract test；build。
剩余：两个 modal 的真实 handoff 和 focus behavior。

### 需求 4：Ambient Floating Panel

当前决定：`RETIRED`，不要实现 floating panel。

保留的能力：Ambient sensing、working theme、related material、finding producer、run / receipt；这些结果进入 Composer Intelligence 的 Brief / Copilot lifecycle。

我做了什么：

- 删除 `AmbientFloatingPanelHost.tsx`。
- `ViewManager` 不再挂载 window-local floating host。
- 删除 drag、collapse、close、manual refresh 的 floating-only UI。
- 删除 `.peak-ambient-floating-host` 与 floating header button CSS。
- 旧 Related Notes leaf 只作为历史 workspace compatibility 保留，不代表新产品方向。

怎么 review：

1. 全库搜索 `AmbientFloatingPanelHost` 和 `.peak-ambient-floating-host`，结果应为空。
2. 打开 Composer Intelligence，review Brief / Copilot 的 sensing / finding lifecycle，而不是寻找 Ambient tab 或浮层。
3. 确认没有新 Command Palette entry 或自动弹出的浮层。

自动证据：production contract 反向断言；build。
剩余：Composer Intelligence 对 Ambient finding 的真实完整生产闭环属于对应 Composer requirement，不由本条重复实现。

### 需求 5：File Atlas Work File Rail

当前能力：Open / Recent 分段、加宽 rail、稳定容量、recent / frequent / name 排序、可拖动宽度。

我做了什么：

- 聚合各 tab group / split / pop-out 的打开 Markdown 文件。
- 最近文件补足固定容量，不复制顶部 tab order。
- 添加 sort preference 与 width preference；frequent order 在一次打开中稳定。
- rail 与 File Atlas context / graph 共存。

怎么 review：

1. 打开多个 tab、split 和 pop-out 的 Markdown 文件。
2. 打开 File Atlas，确认 Open 分组没有重复路径，Recent 只补足容量。
3. 依次切换 Recent / Most used / File name。
4. 拖动 rail 宽度，关闭并重开 File Atlas，确认偏好恢复。

自动证据：`file-atlas-rail-model`、`file-atlas-rail-preference`、work-file-rail contract tests。
剩余：pop-out 与真实 workspace event QA。

### 需求 6：Copilot Intelligence Native Modal

当前能力：不进入 Composer View，也能在原生 Markdown editor 上围绕当前文件 / 选区使用 Copilot Intelligence；顶层只保留 Copilot / History。

我做了什么：

- 构建 native editor context snapshot，包括 selection、heading、source revision。
- Copilot projection 复用 Composer Intelligence runtime；复杂写入 handoff 到 Composer Review。
- History 显示当前文件的真实写入记录。
- modal 保存并恢复之前 focus。

怎么 review：

1. 在原生 Markdown editor 选中一段文字，打开 Copilot Intelligence。
2. 确认顶层只有 Copilot / History，没有 Ambient / Session / Candidate tab。
3. 确认 context 显示当前文件和选区；触发复杂 review，确认 handoff 到 Composer。
4. 关闭 modal，确认 focus 回到原 editor。
5. 打开 History，确认只显示当前文件真实记录。

视觉入口：[Native modal mock](../../gstack/copilot-intelligence-native-modal-2026-07-29/index.html)。
自动证据：native context test、composer entry semantics、production contract。
剩余：selection、focus restoration、Composer handoff 的真实 Obsidian QA。

### 需求 7：File Atlas Copilot Suggestions / Flatten

当前能力：Atlas inspector 展示共享 Copilot suggestion projection；toolbar 的 filter / flatten 是 icon-only；flatten 保留 path crumb。

我做了什么：

- File Atlas host 读取 Composer Intelligence findings，而不是新建 Atlas-only agent。
- selected element 只过滤 / 呈现匹配 suggestion；写入动作 handoff 到 native Copilot / Composer。
- flatten 只改变 tree projection，不改变 source hierarchy。
- Filter / Flatten / AI Graph 均使用 icon action 与可访问名称。

怎么 review：

1. 打开 [Atlas Copilot / flatten mock](../../gstack/file-atlas-copilot-flatten-2026-07-29/index.html)。
2. 在真实 File Atlas 选择 heading / block / resource，检查右侧建议与 source range 对齐。
3. 点击 flatten icon，确认正文顺序不变、path crumb 仍可见。
4. hover icon，确认 tooltip；键盘 focus 时确认 `aria-label` 可用。

自动证据：File Atlas model / preference / production contract tests。
剩余：真实 suggestion 数据与 toolbar geometry。

### 需求 8：Shared AI Instruction Composer

当前能力：Chat Studio、Composer Copilot、AI Graph 等 surface 共享 instruction controller、PromptInput body、附件、draft / history、IME 与 submit / stop 状态机。

我做了什么：

- 新建 app-independent `SharedAIInstructionController` 和 typed submission contract。
- 新建 `AIInstructionComposer` projection，复用 PromptInput components。
- 统一 `@`、`[[`、`/` trigger 解析、附件去重、draft / recent history。
- 各 surface 只提交自己的 capability ID、surface context 与 adapter。

怎么 review：

1. 分别在 Chat Studio、Composer Copilot、AI Graph Update 输入相同文本。
2. 检查 Enter / Shift+Enter / Escape、中文 IME composition、附件去重。
3. 输入 `@`、`[[`、`/`，确认 trigger 语义一致。
4. 确认 surface 的输出不同，但输入行为与 draft/history 一致。

自动证据：shared controller test、production contract。
剩余：中文 IME、focus、stop / regenerate 的真实交互视频。

### 需求 9：AI Search Unified Modes

当前能力：Quick Search 顶层只有 Vault Search 和 AI workspace selector；AI selector 内有 AI Search、AI Graph、Vault Intelligence。

我做了什么：

- 普通打开默认 AI Search；low-frequency mode 不跨普通 open 粘住。
- AI Graph / history deep link 可恢复相应 mode。
- 删除输入框内重复 mode pill。
- AI Graph 用紧凑 history rows；Vault Intelligence 用专用 workspace。
- 修复交互 Mock 缺失的 `styles.css`。
- 新增真正可看的 [可视化正式设计](../../gstack/ai-search-unified-modes-2026-07-28/design-review.html) 与 [交互 Mock](../../gstack/ai-search-unified-modes-2026-07-28/index.html)。

怎么 review：

1. 先看可视化正式设计，确认三种 mode 的职责。
2. 再打开交互 Mock，测试 selector click、方向键、Enter、Escape focus restore。
3. 分别切 AI Search / AI Graph / Vault Intelligence，确认内容与历史来源不同。
4. Reset demo，确认回到 AI Search。
5. 真实 Obsidian 普通关闭 / 重开，确认不会留在低频 mode。

自动证据：Mock Playwright validate、production contract、build。
剩余：真实 modal geometry、IME 与 deep-link restore。

### 需求 10：AI Graph Artifact Platform

当前能力：稳定 `graphId`、immutable versions、sources / evidence / review status、semantic diff update、version compare / restore / duplicate、JSON artifact + JSONL run events + SQLite projection。

我做了什么：

- 新建 domain、repository、runtime、Obsidian storage、run event store 与 browse projection。
- AI Search 的 Graph mode 创建、浏览并打开同一 artifact。
- Graph Detail 支持 source management、freshness、Update graph、semantic diff、accept 后新版本。
- 节点 / relation selection 有 evidence 与 relation review；directionality 进入 renderer。
- origin 保存 creation surface 与稳定 context；File Atlas 精确到文件。
- 把原来模糊的一个链接拆成三个可定位入口：
  - [正式产品设计](../../gstack/ai-graph-artifact-platform-2026-07-28/index.html#judgment)
  - [Graph Detail prototype](../../gstack/ai-graph-artifact-platform-2026-07-28/index.html#detail)
  - [Create Graph prototype](../../gstack/ai-graph-artifact-platform-2026-07-28/index.html#create)

怎么 review：

1. 从统一入口 Mock 的 AI Graph mode理解 browse 入口。
2. 打开 Graph Detail prototype：切 lens、选节点、看 evidence、打开 Sources。
3. 点击 Update graph，输入自然语言；确认先出现 added / changed / removed semantic diff。
4. Accept 后确认 version 递增；Sources 变化本身不应直接生成 version。
5. 打开 Create Graph prototype，检查 graph type、Vault / Web / manual source 与 cost 提示。
6. 真实生产中创建 graph，关闭 modal 后从 history 重开同一 graphId。

自动证据：AI Graph runtime / generated import / typed extraction tests；build；docs browser validation。
剩余：真实 provider run、Web source、version round-trip 和 canvas interaction。

### 需求 11：Graph Empty Folder Collapse

当前能力：Folder layout 只为拥有直接可见内容的 folder 画 compound frame；纯目录中转链折叠，路径信息仍保留。

我做了什么：

- 新建 `folderCompoundModel` 区分 direct folders 与 parent path。
- renderer/layout 只为 direct-visible folder 建 compound group。
- filter 后重新按可见节点判断，不把空父目录恢复成大框。

怎么 review：

1. 准备三种 fixture：深层单链、同级多分支、filter 后父目录空。
2. 在 Folder tree lens 逐个打开。
3. 确认纯中转目录没有空 frame；真正有直接文件的目录仍有 frame。
4. 打开 node inspector / tooltip，确认完整 Vault path 没有丢失。

自动证据：`graph-folder-compound-model.test.ts`；build。
剩余：真实大图布局与缩放后的视觉 QA。

## 3. 建议的 Owner Review 顺序

1. 先开 `docs/planned-requirements.html`，确认 9 active / 1 merged / 1 retired 的产品裁决。
2. Review 需求 9 的可视化正式设计与交互 Mock，先把 AI Search / AI Graph / Vault Intelligence 的关系看清。
3. Review 需求 10 的 Graph Detail 与 Create Graph，两者是不同 screen，不再从同一个页面顶部猜入口。
4. 在真实 Obsidian 依次验收需求 1、2、3、6、7；这些最依赖 surface ownership 和 handoff。
5. 用短视频验收需求 8 的 IME / focus / stop，以及需求 9 的 keyboard / deep-link restore。
6. 最后用真实 graph 数据验收需求 10、11。

## 4. 证据等级

- `VERIFIED`：focused automated tests、production build、local docs link / browser checks。
- `PARTIAL`：source composition、runtime contracts 与 static / interactive mock。
- `INTERACTION NOT VERIFIED`：真实 Obsidian renderer 中的 focus、keyboard、modal handoff、graph pointer interaction、provider run。

不要把 Mock、绿色 build 或 contract test 描述成真实 Obsidian E2E。
