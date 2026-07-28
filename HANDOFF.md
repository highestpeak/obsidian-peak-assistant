# HANDOFF.md — Peak Composer 设计回归与功能契约修复

- Date: 2026-07-27
- Status: `PARTIAL`
- Branch at handoff: `codex/peak-modernization-refactor`
- HEAD at handoff: `5a74b969` (`fix(composer): restore block instruction morph`)

> **接管裁决**
>
> Peak Composer 的正文静态阅读壳已经较接近设计稿；当前大差距不在纸张宽度，
> 而在连续编辑、跨块选择、源码投影与写回、图片和 native object 预览、
> Copy 输出、AI 流式状态、表格交互，以及 Intelligence sidecar 的真实信息架构
> 和数据链。不要继续按“哪里圆角不对就改哪里”的方式推进。
>
> 本轮必须先完成行为与 source contract，再收敛交互结构，最后做像素级回归。
> `build`、geometry test 或 harness 截图变绿，都不能单独把状态升级为
> `COMPLETE`。

---

## 1. 本文读者与任务

本文交给下一位主编排 Codex，以及由它启动的独立 Codex CLI/worktree workers。

接管后的目标是：

1. 以真实 Markdown/native files 为唯一事实来源；
2. 把 owner 已指出的 P0/P1 差距逐项修到设计稿和行为合同；
3. 使用同一个真实 QA 文档做 reference/current/overlay 截图对比；
4. 在真实 Obsidian 中验证输入、选择、流式、剪贴板、窄屏 drawer 和源码回写；
5. 最终给出诚实的 `COMPLETE / PARTIAL / BLOCKED` 判定。

本文不要求：

- 重写整个 Composer 架构；
- 修改现有 Obsidian CodeMirror 编辑器；
- 修改 Chat 输入器 `src/ui/view/chat-view/components/Composer.tsx`；
- 删除仍有生产 caller 的旧 Copilot/compatibility 路径；
- 用静态 HTML、fixture data 或伪预览冒充生产能力；
- 为了贴旧 mock 而推翻 owner 最新的表格和引用样式裁决。

---

## 2. Source of truth 顺序

发生冲突时按以下顺序裁决：

1. 本文记录的 owner 最新裁决；
2. `docs/gstack/peak-composer-editing-view-2026-07-09/index.html` 与同目录 README；
3. `docs/superpowers/specs/2026-07-15-composer-block-ai-capability-contract.md`；
4. `docs/superpowers/specs/2026-07-15-composer-intelligence-sidecar-ui.md`；
5. `docs/superpowers/specs/2026-07-22-peak-composer-component-consistency.md`；
6. 当前生产代码、tests 和真实 Obsidian 行为；
7. `docs/superpowers/plans/2026-07-27-peak-composer-implementation-note.md` 与
   `docs/progress.md` 中的历史完成度证据。

设计回归现有本地证据：

- `.dev/harness/shots/design-regression-2026-07-27-owner-recheck/05-reference-1728x1084.png`
- `.dev/harness/shots/design-regression-2026-07-27-owner-recheck/04-actual-exact-fixture-1728x1084-before.png`
- `.dev/harness/shots/design-regression-2026-07-27-owner-recheck/13-reference-instruction-final.png`
- `.dev/harness/shots/design-regression-2026-07-27-correction/reference-index-1440x1027.png`

`.dev/` 是本地证据目录，不随 worktree/commit 自动传播。接管者必须确认这些文件
仍存在；缺失时重新从设计真源生成，不得凭记忆还原。

---

## 3. 当前诚实状态

### 已接近设计稿

- 正文纸张的宽度、位置和主要留白；
- sidecar 外壳的大体宽度与位置；
- Frontmatter、标题和正文的基础字号；
- 普通正文的静态阅读节奏；
- 公式本身的 KaTeX 渲染；
- 多图组合的静态视觉；
- 指令入口已有基础 morph 动画。

不要整体放大正文或 sidecar，也不要推翻这些已接近部分。

### 仍未达到合同

- 不能自然跨 paragraph/heading/list/quote/table cell 选择；
- 普通编辑状态泄漏 Markdown/HTML 标记；
- 单图 wikilink embed 不显示真实图片；
- 多图 layout 改变没有可靠写回 Markdown `data-layout`；
- Easy Copy 的 image/HTML 输出丢样式、资源或 bbox；
- `在下方插入`、Copy chooser、History 的 surface ownership 错误；
- table toolbar hover corridor 和工具层级不对；
- AI rewrite/formula detail 仍会停顿、整块跳变或布局抖动；
- Mermaid/Base/Canvas/Excalidraw 仍存在摘要卡、chip 或假预览；
- Intelligence sidecar 只有接近的壳，没有完整 Brief IA 和 production findings。

历史 96 项终表仍是 `61 COMPLETE / 35 PARTIAL`。不要因为最近增加了若干视觉
commit，就自动把这 35 项改成 `COMPLETE`。

---

## 4. Owner 最新裁决

这些裁决高于旧 mock 中的冲突表现。

### 4.1 正文与块

- 正文静态阅读已经大体正确，后续以局部收敛为主；
- resting 状态保持干净，不永久显示粗蓝/紫 halo；
- selected/review 同时最多一个主要外框；
- block 间距必须保持文档密度，瞬态操作不得制造大空洞；
- source-first 不等于 source-visible，普通编辑不显示 Markdown/HTML 标签；
- 跨块选择是既有设计要求，当前不可用属于回归。

### 4.2 指令、插入、Copy、History

- `指令`必须在同一个 action shell 内原位 morph；
- 不能出现“大圆角壳里再套一条大输入框”的第二套组件；
- Esc、完成和离开规则必须恢复普通动作；
- `在下方插入`是 source-anchored draft，不是脱节的全宽 textarea；
- Copy chooser 和 per-block History 是锚定 overlay/details，不进入文档 source flow；
- 接受后的新内容才成为真实文档块。

### 4.3 表格

旧 mock 中“全部功能横向平铺”的长 toolbar 不再是最终目标。

功能保留，但默认只显示 4–6 个上下文高频项，其余收进：

- `结构`
- `排序 / 变换`
- `输出`
- `AI`
- `更多`

表格到 toolbar 必须有连续 hover corridor。工具栏不能横向滚动、遮挡表头，或
因为指针离开 cell 就提前消失。

### 4.4 引用和脚注

引用采用 owner 第二张参考图：

- 黑色直竖线；
- 无卡片、无圆角、无阴影；
- 阅读态不显示 `>`；
- 脚注 ref 使用紧凑 superscript；
- 脚注 definition 是普通脚注列表，不是整条灰色圆角框。

### 4.5 Intelligence sidecar

- 外壳尺寸基本合理，不要再按原始 2x Retina 像素误判为过宽；
- 顶层只保留 `Copilot / History`；
- Brief 固定同时显示：
  - `接下来可能要做`
  - `相关材料`
  - `还没安放的想法`
- 每个 section 都有独立 loading/empty/error/refresh 状态；
- 零数据不能把整个 Brief 替换成一张“暂无新项目”；
- `相关材料`一级视图需要 compact graph、选中节点详情、reason/score、
  `查看来源 / 带入协作`；
- shell 像素微调排在 production producer、真实数据和完整 IA 之后。

---

## 5. Impact Contract

### 5.1 Primary outcome

同一个真实 Vault QA 文档中，以下链路必须闭环：

```text
真实 Markdown/native source
→ Composer 正确投影
→ 原生选择或对象操作
→ 原位候选/草稿/预览
→ 显式接受
→ 原子写回
→ Reload / Markdown Preview / Undo / History 一致
```

### 5.2 Required tracks

- canonical QA 文档与截图对比基线；
- 连续编辑、跨块选择和富文本 source projection；
- 图片 embed、多图 layout、Easy Copy；
- Base/Canvas/Excalidraw/Mermaid typed preview；
- block action/insert/copy/history 状态机；
- table selection、hover corridor 和 toolbar IA；
- AI streaming、diff 与 formula detail；
- Intelligence Brief producer、三段 IA、相关材料；
- 共享组件语法与最终像素回归；
- 真实 Obsidian owner-involved QA。

### 5.3 Skip budget

P0 required tracks 的 skip budget 为 `0`。

只有以下情况可标 `BLOCKED`：

- 真实 provider credential 缺失；
- 需要 owner 主观裁决且现有设计真源无法回答；
- 外部 Obsidian 插件/文件格式不可用，且标准 fallback 已完成；
- 同一阻塞经过三次独立调查仍无法安全推进。

其余未完成项必须继续实施或诚实标 `PARTIAL`，不得用“测试绿”替代。

### 5.4 Forbidden scope

- CodeMirror；
- Chat `Composer.tsx`；
- service-layer mutable runtime singleton；
- UI 直接调用 provider；
- `src/**` import `docs/gstack/**`；
- label/substring dispatch；
- fixture-only production behavior；
- 删除 compatibility path 以换取 LOC 或完成度；
- 大范围主题重做、渐变、卡片墙、夸张圆角或装饰。

### 5.5 Stop and commit rule

每个 worktree 只在以下条件全部满足后提交：

1. 该 track 的行为测试通过；
2. source bytes/round-trip 有证据；
3. 受影响 fixture 截图已检查；
4. 没有修改保护范围；
5. commit message 为英文；
6. 提交中不混入其他 worktree 或用户文件。

---

## 6. Codex CLI / worktree 编排

主 Codex 只负责规划、边界审计、合并、截图裁决和最终报告。编码分配给独立
Codex CLI/worktree workers。最多同时运行 3 个 coding workers，避免共享
`ComposerRoot.tsx` 和 `composer.css` 的冲突失控。

模型名称以启动时 CLI 实际可用列表为准，但默认分配如下：

| 角色 | 默认模型 | Effort | Speed | 用途 |
| --- | --- | --- | --- | --- |
| 主编排 / 最终审计 | 5.6 Sol | Ultra | Standard | 依赖顺序、源码边界、合并、视觉裁决 |
| 连续编辑 / selection | 5.6 Sol | Extra High | Standard | DOM Selection、source range、Undo 合并 |
| Sidecar runtime / producer | 5.5 | High | Standard | finding producer、Brief 生命周期、数据链 |
| Image/native/copy | 5.5 或 5.4 | High | Standard | adapter、资源、HTML/raster、round-trip |
| 组件状态 / table / formula | 5.4 | High | Fast | 局部 TSX、状态机、组件结构 |
| 测试脚手架 / screenshot diff | 5.3 Codex Spark | Medium–High | Fast | QA fixture、截图、机械性 guard |
| 低风险机械修改 | 5.4 Mini | Medium | Fast | config/test/docs，不承担架构裁决 |

弱模型若连续两次无法通过行为或 source contract，立即升级给 5.6 Sol，不要反复
微调同一 CSS。

### Worktree 规则

1. 每个 worker 从主编排确认过的最新 integration HEAD 建独立分支；
2. 开工前运行 `git log -1 --oneline`，防止使用陈旧基线；
3. 每个 worktree 只拥有一个 track 的明确文件范围；
4. worker 不直接合并别人的分支；
5. 主编排逐个 cherry-pick，冲突后重新跑该 track 验证；
6. 共享 `src/styles/composer.css` 的最终收敛由单一 integration pass 完成；
7. 不在 dirty 主 checkout 中运行 `git add -A`。

`HANDOFF.md` 本身在生成时尚未提交。由 `5a74b969` 新建的 worktree 看不到当前
版本，因此主编排必须二选一：

1. 只提交 `HANDOFF.md`，再以该 commit 为 integration base；
2. 把对应 Track 的完整目标、allowlist、denylist 和验收原样嵌入 worker prompt，
   不假设 worker 能从自己的 worktree 读到本文件。

本 handoff 生成时，主 checkout 的 dirty ownership 为：

- `HANDOFF.md` — 当前 Composer handoff 任务；
- `docs/roadmap.html` — 用户/其他任务；
- `docs/research/2026-07-27-capability-walkthrough-ecosystem-strategy/` — 用户/其他任务；
- `telemetry/` — runtime/其他任务。

只允许单独处理 `HANDOFF.md`。另外三项不属于 Composer 修复，不得回滚、删除、
暂存或混入提交。

### Shared-file owner

普通 workers 禁止直接修改以下共享文件：

- `src/ui/view/composer/ComposerRoot.tsx`
- `src/styles/composer.css`
- `src/styles/composer-fm-math.css`
- `src/app/composer/composeDocumentComposerRuntime.ts`
- `src/app/composer/capabilities/composeComposerCapabilityRuntime.ts`
- `templates/config/composer.json`

这些文件由主编排在 integration pass 中统一接线。worker 若确认 track 无法在
allowlist 内完成，必须停止编码，返回 exact patch plan、接口需求和测试影响；
不得自行扩大 ownership。

Track B 不拥有 `EasyCopyMenu.tsx`，只负责 copy payload/raster/source contract；
Track E 独占 `EasyCopyMenu.tsx` 和 action surface。Track E 独占
`ComposerCandidateHost.tsx` 的结构，Track G 只修改具体 candidate/formula surfaces。

---

## 7. 执行 DAG

### Phase 0 — Canonical QA document 和 characterization

Owner 要求“生成一个和设计稿一样的文档，再用 Composer View 对比”。本轮不再
新造第二份 fixture，以下文件就是唯一 canonical QA document：

- Vault root：
  `/Users/zhangjike/code/my-code/mobius-highestpeak-kb`
- Markdown：
  `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/Peak Composer Visual Parity QA.md`
- 当前 source SHA-256：
  `6d7f15c0cc64f4f2f726d626f448dbf6d5556ed203be8b29056e363d35b23029`
- 单图 attachment：
  `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/public-image/20250703182542769.png`
- Native/layout assets：
  `/Users/zhangjike/code/my-code/mobius-highestpeak-kb/Peak Composer Visual Parity Assets/`
  - `101-A-产品类别分析.excalidraw.md`
  - `ai-knowledge-workflow-illustration.png`
  - `pkm-composer.base`
  - `pkm-composer.canvas`
  - `real-map-auckland-route.png`

开工时重新计算 SHA。若与上面的值不同，不得还原或覆盖 owner 新内容；先记录新
SHA、检查变更，再把新 revision 写进截图 manifest。不能继续拿不同内容、不同
scroll position 的文档做肉眼比较。

文档必须覆盖：

- Frontmatter；
- H1/H2、段落、列表、task list；
- inline bold/italic/underline/strike/highlight/color/link；
- quote + footnote；
- inline/display formula；
- 单图 `![[路线图|720]]`；
- 一个四图 raw HTML layout block；
- Markdown table；
- fenced YAML/code block；
- Mermaid、Base、Canvas、Excalidraw；
- block instruction、insert、copy、history、AI rewrite；
- Intelligence brief/session/history。

首轮 reference/actual 固定为：

- CSS viewport `1728×1084`，backing scale `2`，实际截图 `3456×2168`；
- light theme，app zoom `100%`；
- 左侧原生 sidebar 收成 icon rail；右侧原生 sidebar 关闭，Composer sidecar 打开；
- 输出目录：
  `.dev/harness/shots/composer-owner-closure-2026-07-27/`；
- reference 生成命令：

  ```bash
  node .dev/harness/capture-composer-reference.mjs \
    .dev/harness/shots/composer-owner-closure-2026-07-27/reference-brief-1728x1084.png \
    1728 1084
  ```

- actual 必须由 Computer Use 从真实 Obsidian 获取；harness 截图不能冒充真机；
- 在输出目录写 `manifest.json`，至少记录 source SHA、attachment paths、
  theme、zoom、CSS viewport、backing scale、native sidebars、scroll anchor、
  Composer display state、sidecar stage、finding/session revision 和 capture time。

对每个受影响 surface 保存下列状态，而不是只截 resting：

- document resting / block hover / block selected；
- instruction `0ms / 120ms / final`；
- insert draft；
- AI `first-token / streaming / completed / variants`；
- History open；
- table selection + toolbar；
- formula detail `generating / completed`；
- native `Preview / Source`；
- sidecar `Brief / History`；
- narrow drawer `open / closed / focus-restored`。

产出：

- reference screenshot；
- current screenshot；
- 50% opacity overlay 或 pixel diff；
- 每个差距对应的 requirement/track；
- QA 文档源文件的 byte snapshot。

Phase 0 未完成前，禁止宣称后续 UI “贴稿”。

### Phase 1 — P0 source/runtime tracks

依赖顺序必须按下面执行：

1. Track A 先定义连续 selection/source-range contract；
2. Track B1（image resolver/layout）与 Track A、Track C 可并行；
3. Track B2（selection copy）等待 Track A 的 selection contract 合入；
4. Track D 在 B1 的 asset/native adapter 边界确认后开始；
5. Track E 在 A/B/C 的 integration contract 稳定后开始；
6. Track F 在 A 的 text/object selection 分界稳定后开始；
7. Track G 在 E 的 candidate/action shell owner 稳定后开始；
8. Phase 3 最后统一修改 shared Root/CSS/config。

不能把 A/B/C 简化成完全互不依赖的三个并行大包。

#### Track A — 连续编辑、跨块选择、富文本投影

Worker allowlist：

- `src/ui/view/composer/chrome/EditableText.tsx`
- `src/ui/view/composer/chrome/StyledRuns.tsx`
- `src/ui/view/composer/chrome/selectionMapping.ts`
- `src/service/composer/render/inlineRuns.ts`
- `src/service/composer/selection/partitionSelection.ts`
- `src/service/composer/selection/markSerializer.ts`
- Track A 新增的相邻 selection/source-map tests。

`ComposerRoot.tsx` 的接线由 shared-file owner 完成，Track A worker 不直接修改。

目标：

- 一个连续的 document selection experience；
- selection 可跨 `p/h/li/quote/td`；
- 正向、反向、键盘和 autoscroll 都成立；
- 普通编辑只显示 rendered inline text；
- raw Markdown/HTML 只在显式 Source 模式出现；
- 多 source unit 格式化形成一个 transaction/Undo；
- selection toolbar 不得抢走编辑器 focus 或破坏 selection；
- candidate 创建时冻结 source revision/range；接受前必须重新验证。

验收：

- drag 与 Shift+Arrow 都能跨块；
- Copy/comment/AI 取得完整 selection；
- `**`、`~~`、`<span>`、`<mark>` 不在普通编辑态泄漏；
- fenced YAML/code 的源码原样保留，rich formatting disabled，Copy source 精确，
  且编辑时不得插入 HTML-enhanced marks；
- Save/reload 后原始 source 语义无损；
- 新增 DOM-level selection QA，不只测试纯函数 partition；
- 在标准编辑器外部修改同一 source range 后，旧 candidate 的 Accept 必须检测
  revision mismatch 并 fail closed，不能覆盖新内容；只允许显式 revalidate/
  relocate 或 regenerate；
- 新增 `test/composer-source-stale-revalidation.test.ts`。

#### Track B — 图片、layout、Easy Copy

Worker allowlist：

- `src/ui/view/composer/blocks/embed/EmbedBlockView.tsx`
- `src/ui/view/composer/blocks/image/ImageBlockView.tsx`
- `src/ui/view/composer/blocks/image/PeakImageLayoutBlockView.tsx`
- `src/ui/view/composer/chrome/rasterize.ts`
- `src/service/composer/clipboard/easyCopy.ts`
- `src/service/composer/packs/image/imageLayout.ts`
- `src/service/composer/packs/image/imageWritebackAdapters.ts`
- Track B 新增的 resolver/layout/copy tests。

`EasyCopyMenu.tsx` 属于 Track E。Track B 只提供 payload/raster/source contract。
其中 B1 image resolver/layout 可与 A 并行；B2 selection copy 必须等待 A 的
selection contract 合入。

目标：

- `![[路线图|720]]` 解析真实 Vault attachment 并显示 bitmap；
- Unicode/path/width alias 正确；
- Grid/Hero/Strip/Story 修改 raw HTML block 的 `data-layout`；
- reload 和标准 Markdown Preview 保持布局；
- Copy image 使用点击时目标 element 的真实 bbox；
- HTML 输出内联必要样式和资源，排除 Composer chrome。

验收：

- PNG 高 DPI、无大空白、无工具栏；
- HTML 独立打开后图片、布局、KaTeX 和文字样式完整；
- Markdown 为精确 source；
- 权限失败有明确 fallback；
- layout 切换、Undo/Redo、reload 的 source bytes 有证据。

#### Track C — Intelligence sidecar producer 与完整 Brief

Worker allowlist：

- `src/service/composer/intelligence/IntelligenceRuntime.ts`
- `src/service/composer/intelligence/findingIdentity.ts`
- `src/service/composer/intelligence/relatedMaterials.ts`
- `src/service/composer/intelligence/runSession.ts`
- `src/app/composer/DocumentComposerRuntime.ts`
- `src/app/composer/ObsidianComposerAdapters.ts`
- `src/ui/view/composer/sidecar/CopilotView.tsx`
- `src/ui/view/composer/sidecar/IntelligenceSidecar.tsx`
- `src/ui/view/composer/sidecar/RelatedMaterialsModal.tsx`

当前根因：

- `IntelligenceRuntime.ingestFinding()` 没有生产 producer；
- production Brief 只投影部分 section；
- loader 异常被吞成空数据；
- related materials 只显示文字列表；
- `还没安放的想法` 没有生产模型与渲染。

目标：

- app-owned producer 从真实 Current Work State/Open Writing Moves 输入 finding；
- Brief 首屏显示当前关注对象、更新时间、文档 revision、`问 Copilot`、
  `更新建议`和 sensing 菜单；
- finding 保持 stable ID、fingerprint/evidence-revision dedup；正文 mark 与 Brief
  投影同一记录，consume/dismiss/undo 在两处同步；
- 三段 Brief 始终存在；
- 每段独立 loading/empty/error/retry；
- refresh 保留旧 snapshot，latest-wins 原位替换；
- 显示更新时间和变化回执；
- 建议显示编号、why-now、稳定 source order 和 `查看全部 N`；后台 refresh 不得
  让 hover/selected/read 项跳动，长列表使用分页、增量加载或 virtualization；
- related compact graph 只显示 5–7 个 strongest nodes；selected detail 至少包含
  title/path/reason/score；
- `查看来源 / 带入协作 / 打开完整视图`全部真实工作；
- Full View 复用同一 immutable snapshot/revision，不因打开 modal 重新查询；
- History tab 显示 accepted transaction count；
- brief/session/review/close-reopen 恢复 active tab、stage、body scroll、draft、
  selected finding/material 和原 focus。

验收：

- 一个真实 Vault 文档产生非空 finding；
- 同一 finding refresh 后不重复；正文接受后 Brief 变 consumed，任一 surface
  dismiss 后两边同步消失且可 undo；
- related refresh 不再无解释地返回 0；
- 无相关项时仍显示三个诚实 empty section；
- 失败可重试，不伪装成“暂无新项目”；
- narrow drawer 有 scrim、background inert、focus trap、明确初始焦点、Escape、
  opener focus restore，且无 horizontal overflow；
- sidecar body 使用一个 scroll。

### Phase 2 — Native object 与 interaction tracks

#### Track D — Mermaid/Base/Canvas/Excalidraw typed previews

Worker allowlist：

- `src/ui/view/composer/blocks/mermaid/MermaidBlockView.tsx`
- `src/ui/view/composer/blocks/base/BaseBlockView.tsx`
- `src/ui/view/composer/blocks/canvas/CanvasBlockView.tsx`
- `src/ui/view/composer/blocks/excalidraw/ExcalidrawBlockView.tsx`
- `src/ui/view/composer/blocks/nativeBlockShared.tsx`
- `src/app/composer/ObsidianNativeFileAdapter.ts`
- `src/service/composer/packs/native/*`

目标：

- Mermaid shell fit content，不再“小图 + 巨大空卡片”；
- Base 是 typed view，不是 metadata summary；
- Canvas 保留位置、大小、颜色、group、edge 和箭头；
- Excalidraw 有真实 adapter preview；
- Preview/Source 属于对象 header；
- adapter 不可用时退化为标准 Obsidian embed/link，不伪造预览；
- incremental typed patch 在同一 shell 重渲染，accept 前不写源。

验收：

- Mermaid/Base/Canvas/Excalidraw 在 canonical fixture 中都显示真实 preview；
- adapter 不可用时显示可用的标准 embed/link 和原因，不显示假 preview；
- typed incremental patch 每次都在原 shell 重渲染，滚动位置不跳；
- preview、切换 Source、cancel 前 source bytes 完全不变；
- accept 后只写对应 typed source，reload 后仍能被原生插件/格式读取；
- 每种对象都有 round-trip 与 unavailable fallback 测试。

#### Track E — Block action、instruction、insert、copy、history

Worker allowlist：

- `src/ui/view/composer/chrome/BlockActionRow.tsx`
- `src/ui/view/composer/chrome/BlockHistoryPanel.tsx`
- `src/ui/view/composer/chrome/DisplayStateSwitch.tsx`
- `src/ui/view/composer/chrome/EasyCopyMenu.tsx`
- `src/ui/view/composer/candidates/ComposerCandidateHost.tsx`
- `src/service/composer/blockOps.ts`

目标：

- 明确 `resting → hover → instruction → submitted/cancelled → resting` 状态机；
- action row 与 instruction 使用同一 DOM shell/morph geometry；
- 离开再回来显示普通动作；
- Insert 创建真实 source-anchored draft；
- Esc cancel 不修改源；
- Copy/History 作为 overlay/details，不推走后续内容；
- `工作视图 / 全部改动 / 纯净阅读`由一个 document-owned controller 驱动，
  保持稳定底部位置，不复制成 top/global 状态 owner；
- 打开/关闭瞬态 UI 不改变 scroll anchor 和 source order。

精确动作顺序：

`在下方插入 / 复制 / 评论 / contextual AI / History / 指令`

验收：

- 同一 action shell 完成 hover → 指令 morph，Enter 提交、Esc 取消；
- 指令框关闭或指针离开 block 后，再进入必须恢复普通动作；
- instruction/copy/history/insert surface 均不改变下方 block 的几何位置；
- Insert cancel 前 source bytes 不变；Accept 只产生一次原子 transaction；
- Copy chooser 与 History 锚定当前 block，关闭后 focus/scroll 恢复；
- display state 只有一个 controller，切换后 block order 和 source 不变。

#### Track F — Table selection 与 toolbar IA

Worker allowlist：

- `src/ui/view/composer/blocks/table/TableBlockView.tsx`
- `src/ui/view/composer/blocks/table/TableToolbar.tsx`
- `src/ui/view/composer/blocks/table/useTableObjectSelection.ts`
- `src/service/composer/packs/table/tableSelection.ts`
- `src/service/composer/packs/table/tableModel.ts`
- `src/service/composer/packs/table/htmlPort.ts`

目标：

- native inline text selection 与 object cell selection 分开；
- drag/Shift 连续矩形选择；
- Cmd/Ctrl 离散选择；
- toolbar hover corridor 稳定；
- 4–6 个默认动作，无横向滚动；
- 低频动作两次点击内可达；
- merge 仅完整矩形可用；
- 第一次 rowspan/colspan 只升级该 table block 为 raw HTML。

验收：

- inline text、连续矩形 cells、Cmd/Ctrl 离散 cells 三种 selection 明确分开；
- 从 cell 移到 toolbar 的整条 corridor 不丢 hover；
- 默认 toolbar 不横向滚动、不遮表头，全部旧动作最多两次点击可达；
- 非完整矩形时 merge disabled 且说明原因；
- 第一次 merge 只把当前 table 升级为 raw HTML，其他 Markdown blocks 不变；
- accept/Undo/Redo/reload 后 table source 与视觉一致。

#### Track G — AI streaming、diff、formula detail

Worker allowlist：

- `src/ui/view/composer/candidates/StreamingTextCandidateCard.tsx`
- `src/service/composer/render/wordDiff.ts`
- `src/ui/view/composer/blocks/math/FormulaDetailPanel.tsx`
- `src/ui/view/composer/blocks/math/formulaDetailStore.ts`
- `src/app/composer/capabilities/ComposerFormulaDetailGenerator.ts`

目标：

- transport buffer 与 presentation cadence 分离；
- first token 直接出现在候选 body；
- stable prefix + live tail + caret；
- 不发生完整 body swap；
- 中文按稳定词组/短语 diff，不做抖动的字符碎片墙；
- streaming 时 Accept/版本切换 disabled；
- formula detail 按 `(formulaId, detailType)` 独立；
- explain/split/variables 可并存；
- footer 位置稳定，正文渐进增长。

公式动作顺序固定为：

`解释 / 拆分 / 变量表 / History / 指令`

该动作行是 formula shell 的直接子级，不得再生成第二条 AI toolbar。

验收：

- first token 直接进入 body，stable prefix 不被重排，最终不做整块 body swap；
- Stop 立即终止 presentation 和 transport；
- Regenerate 追加新 variant，不覆盖旧 variant；
- previous/next 可查看旧 variant，只有当前已完成 variant 可 Accept；
- streaming 时 Accept、variant switch disabled；
- Discard 不写 source；Accept 只写当前 active completed variant；
- targeted instruction 进入下一次 run 的 frozen context，但不提前写入 Markdown；
- 多个 `(formulaId, detailType)` 可独立并行且互不覆盖；
- 新增 `test/composer-candidate-variants.test.ts`，并保留 source-byte 证据。

### Phase 3 — 单一 visual integration pass

Phase 1/2 合并并通过行为 gate 后，才能统一收敛：

- `src/styles/composer.css`
- `src/styles/composer-fm-math.css`
- component-local class names/config

严格使用组件家族：

- block action capsule：28px，pill；
- compact toolbar：28px，`radius-md`；
- rail：30×30，`radius-md`；
- review action：30px，`radius-md`；
- status chip：20–22px，pill；
- shell/panel：一个外层 border、一个 shadow rung。

AI action 只通过 sparkle、短 divider 或 wording 区分，不创建第二套高度、圆角、
背景和 hover grammar。

视觉整合必须处理：

- block 垂直密度；
- selected halo；
- frontmatter 单层结构；
- quote/footnote owner 新裁决；
- native header 和 Preview/Source 归属；
- formula detail 层级；
- icon 统一为 Lucide；
- focus/hover/disabled/busy/reduced-motion。

---

## 8. 测试与视觉回归

### 8.1 当前基线

本 handoff 生成时重新运行：

| Command | Result |
| --- | --- |
| `npm run test` | `315 passed / 2 failed`，共 317 |
| `npm run build` | 通过；仅有 `caniuse-lite` 过期 warning |

两个已知失败：

- `chat-studio-message-state-ui`
- `code-block-theme-settings`

它们不属于 Composer。本波次不得增加第三个失败，也不得顺手修改 Chat Studio
来“清零”基线。

本次只重新跑了 tests/build，没有重新跑 geometry、fixture screenshot 或完整
真机矩阵。因此以前的 geometry green 只能作为历史证据，不是当前视觉 PASS。

### 8.2 每个 track 的自动化 gate

至少运行：

```bash
npm run test
npm run build
git diff --check
```

按 track 增加：

```bash
npm run test -- test/composer-selection-partition.test.ts
npm run test -- test/composer-selection-range-writeback.test.ts
npm run test -- test/composer-source-stale-revalidation.test.ts
npm run test -- test/composer-inline-runs.test.ts
npm run test -- test/composer-easy-copy.test.ts
npm run test -- test/composer-image-layout.test.ts
npm run test -- test/composer-native-preview.test.ts
npm run test -- test/composer-native-roundtrip.test.ts
npm run test -- test/composer-table-selection.test.ts
npm run test -- test/composer-table-merge-html.test.ts
npm run test -- test/composer-candidate-variants.test.ts
npm run test -- test/composer-formula-details.test.ts
npm run test -- test/composer-intelligence-session.test.ts
npm run test -- test/composer-related-materials.test.ts
```

UI 相关还需：

```bash
node test/composer-chrome-geometry.qa.mjs
node test/composer-block-instruction.qa.mjs
node test/composer-table-toolbar-hover.qa.mjs
node test/composer-image-canvas.qa.mjs
```

若本地 Vite 占用端口，先确认目标进程确为本项目，再终止；不要盲目
`pkill -f vite` 杀掉用户其他任务。

### 8.3 Screenshot gate

每个视觉 track 固定：

1. 同一个 Markdown/native fixture；
2. 同 viewport；
3. 同 Obsidian theme；
4. 同 zoom；
5. 同 scroll anchor；
6. 同 interaction state；
7. reference/current/overlay 三张图；
8. Retina 截图先归一化 CSS pixel 尺寸。

最低截图状态矩阵：

| Surface | 必截状态 |
| --- | --- |
| document/block | resting、hover、selected |
| instruction | before、`0ms`、`120ms`、final、Esc restored、leave/re-enter restored |
| insert/copy/history | draft/open、cancel/closed、focus restored |
| text AI | first-token、mid-stream、stopped、completed、variant navigation、accepted/discarded |
| table | text selection、rectangular cells、discontinuous cells、toolbar corridor、group menus |
| formula | resting、generating、completed、multi-detail、variant navigation |
| native blocks | Preview、Source、unavailable fallback |
| sidecar | Brief populated、three independent empties、error/retry、History、related detail |
| narrow drawer | open、scrim/focus trap、closed、opener focus restored |

每张 actual 文件名或 manifest entry 必须能反查 source SHA、viewport、scroll anchor
和 interaction state；不能把多次不同运行的图片混成一组 overlay。

禁止：

- 用不同内容比较；
- 只看 geometry 数字；
- 只截静态 resting state；
- 把 2x backing pixels 当作 CSS 宽度；
- 看到“大致像”就停止；
- 截图改了一点就宣称“已趋向设计稿”。

### 8.4 真实 Obsidian QA

必须覆盖：

- light/dark；
- 100%/125%；
- wide/narrow；
- sidecar close/reopen；
- detached window；
- 中文 IME；
- forward/reverse cross-block selection；
- drag/autoscroll；
- table text/cell/discontinuous selection；
- image paste 和 clipboard PNG；
- instruction Enter/Esc/leave/re-enter；
- AI first-token、stable prefix、stop、regenerate、previous/next variant、discard、accept；
- 外部修改同一 source range 后旧 candidate fail closed；
- Markdown source bytes；
- reload；
- standard Markdown Preview；
- Undo/Redo；
- History locate/rollback；
- drawer Escape/focus restore/no overflow。

owner-involved QA 未完成前，不得把最终视觉和设备矩阵标成 `COMPLETE`。

---

## 9. 已知失败教训

1. **Harness 不等于真机。** 输入、IME、Obsidian lifecycle、clipboard 和
   detached window 必须在真实 Obsidian 复验。
2. **不要在下游对流式文本去重。** transport semantics 与 presentation
   cadence 分离，重复/全文块问题从源头处理。
3. **不要以 blockId 直接做跨 revision React key。** 过去曾因此全量 remount、
   caret 丢失和滚动跳变。
4. **不要把 source-first 误写成 source-visible。** 隐藏标记必须通过
   projection/source map 完成，不能用 CSS `display:none`。
5. **不要用 placeholder renderer 冒充 native preview。** adapter 缺失时走
   诚实标准 fallback。
6. **不要让临时 UI 进入 document flow。** overlay、draft、accepted object
   必须各有唯一 owner。
7. **不要继续零碎调 CSS。** state machine 或 DOM shell 错时，圆角微调不会
   趋近设计稿。
8. **worktree 基线曾陈旧。** 每个 worker 开工前核对 HEAD，合并后查冲突标记、
   全量测试和 build。
9. **真实数据为空不能用 fixture 掩盖。** sidecar empty/error 必须诚实，
   producer 和 search readiness 要真实接通。
10. **旧路径删除必须有 parity。** Chat Composer、CodeMirror 和活跃兼容路径
    绝对保留。

---

## 10. Definition of Done

一个 requirement 只有同时满足以下条件才可标 `COMPLETE`：

- 与同状态设计 reference 在 CSS pixel 尺寸上接近；
- 行为状态机通过 pointer/keyboard/IME；
- mutation requirement：Accept 后精确、原子地修改真实 Markdown/native source；
- read-only/transient requirement：关闭、取消或只预览后 source byte-identical；
- 对需要持久化的 requirement，reload 与标准 Preview 一致；
- Undo/Redo 和 History 语义正确；
- 失败、权限、stale 和 unavailable 有诚实反馈；
- 自动化测试和真实 Obsidian evidence 都存在；
- 没有触碰保护范围或引入第二套 runtime/state owner。

最终报告必须列出：

- 每个 track 的状态；
- commit；
- 修改文件；
- 自动化命令与结果；
- reference/current/overlay 证据；
- source byte/round-trip 证据；
- 真机矩阵；
- remaining `PARTIAL/BLOCKED`；
- 是否满足 Impact Contract；
- 是否允许旧路径删除。

---

## 11. 可直接复制给主 Codex 的接管提示词

```text
你接手 Peak Composer 的设计回归与功能契约修复。

先完整阅读仓库根目录 HANDOFF.md，再按 HANDOFF §2 的 source-of-truth 顺序读取
Composer mock/README、block AI contract、sidecar spec、component consistency spec、
implementation note 和 progress checkpoint。

你的角色是主编排、边界审计、worktree 合并、真实截图裁决和最终报告。
不要自己包办全部编码。按 HANDOFF §6 启动独立 Codex CLI/worktree workers：
复杂 selection/source 交给 5.6 Sol Extra High；sidecar runtime 交给 5.5 High；
image/native/copy 交给 5.5 或 5.4 High；组件状态和 table/formula 交给 5.4 High；
QA/test/screenshot diff 优先用 5.3 Codex Spark Medium–High Fast。
启动时以 CLI 实际可用模型为准，弱模型连续两次失败就升级。

先执行 Phase 0。唯一 canonical fixture 是 Vault 根目录的
Peak Composer Visual Parity QA.md；按 HANDOFF 中记录的 attachment 清单和 SHA
复核，不要新造第二份文档。锁定 source revision、attachments、viewport、theme、
zoom、scroll、interaction state 和 sidecar stage，产出 reference/current/overlay。
actual 必须由 Computer Use 从真实 Obsidian 截取，禁止拿不同文档或不同 viewport
比较，也禁止用 harness 冒充真机。

然后按 HANDOFF §7 执行：
Phase 1 先让 A 定义 selection/source contract；B1 image resolver/layout 与 A、
C 可并行，但 B2 selection copy 等 A 合入；
Phase 2 中 D 等 B1 的 adapter 边界，E 等 A/B/C integration contract，F 等 A，
G 等 E 的 candidate/action shell；
Phase 3 由单一 integration pass 收敛 composer CSS 和组件语法。

每个 worker 必须有明确文件 ownership、行为测试、source round-trip 验收和英文 commit。
主编排逐个 cherry-pick；普通 worker 禁止修改 HANDOFF §6 的 shared files，
ComposerRoot.tsx、composer.css 和 config 只由 integration owner 修改。

HANDOFF.md 若仍未提交，新 worktree 看不到它。先只提交 HANDOFF.md 作为新 base，
或者把目标、allowlist、denylist、依赖和验收完整嵌入每个 worker prompt；不能只让
worker 去读不存在于其 worktree 的 handoff。

保护范围：
- 不修改 CodeMirror；
- 不修改 src/ui/view/chat-view/components/Composer.tsx；
- 不删除活跃 compatibility path；
- 不引入 service singleton、UI provider call、label dispatch 或 docs/gstack import；
- 不用 fixture/static HTML/fake card 冒充 production。

当前基线是 HEAD 5a74b969；npm run test 为 315 passed / 2 known failed
(chat-studio-message-state-ui, code-block-theme-settings)；npm run build 绿。
重新核对当前 HEAD 和工作树后再开 worktree。不要触碰或提交用户已有的
docs/roadmap.html、docs/research/2026-07-27-capability-walkthrough-ecosystem-strategy/
和 telemetry/ 改动。

每个 track 完成后运行相关测试、npm run test、npm run build、git diff --check。
涉及 UI 必须做同 fixture screenshot overlay；涉及 source 必须保存 reload/Preview/
Undo/History 证据。完整 owner-involved real Obsidian QA 未完成前，不得把项目标成
COMPLETE。

持续执行到 Impact Contract 达成或出现 HANDOFF §5.3 定义的真实 BLOCKED。
最终按 HANDOFF §10 输出逐轨状态、commits、文件、验证结果、截图、source 证据、
真机矩阵和诚实 verdict。
```
