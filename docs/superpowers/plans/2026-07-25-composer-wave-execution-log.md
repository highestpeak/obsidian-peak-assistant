# Peak Composer 生产波次执行日志（execution log）

Date started: 2026-07-25
Orchestrator: fable（编排/审计）；实现全部由 opus 子代理完成
Contract: [`2026-07-24-peak-composer-complete-implementation-handoff.md`](./2026-07-24-peak-composer-complete-implementation-handoff.md)
编排计划真值：本文件 + `/Users/zhangjike/.claude/plans/opus-sunny-stroustrup.md`

> 本文件是跨会话续跑的唯一状态真值。每过一个审计门即更新。任何新 session 接手时：读 handoff 合同 → 读本文件 → 从第一个非 done 的 WP 继续。

## Owner 决策（2026-07-25 已确认）

1. C0 先提交 4 个 dirty docs（已完成，commit `c363f267`）。
2. 并行隔离用 git worktree（S6 验证失败自动退化为同树目录分工）。
3. 真机 Obsidian QA 两次：WP4 后中期 + WP10 最终。
4. fable 审计门通过后自动 checkpoint commit。

## WP 状态表

| WP | 范围 | 状态 | 审计门 | commit |
| --- | --- | --- | --- | --- |
| C0 | handoff docs 落库 | done | n/a | c363f267 |
| WP0 | Phase 0 spikes ×6 + gate | done | GO | C1 |
| WP9a | Result Browser 抽取（QS 半边） | done | PASS | 7a68346a（merge，含 3 子 commit） |
| WP1 | 宿主 + source model | done | PASS | d2714a88 |
| WP2 | transaction/History/Undo 底座 | done | PASS | e3a20d64 |
| IF | 接口冻结 capabilityContracts.ts | done | n/a（fable authored） | 88931c20 |
| WP3 | capability runtime | done | PASS | 064d0d04（merge，4 子 commit） |
| WP4 | editing chrome + 文本 slice | done | PASS（2 项登记偏差） | 8679f448（merge，4 子 commit） |
| WP4.5 | 集成：AI 接线 + 富渲染 + app adapters | in-progress | pending | — |
| QA#1 | 真机中期验收（owner 在场） | pending | pending | — |
| WP5 | Frontmatter + 公式 | pending | pending | — |
| WP6 | 表格 + Chart | pending | pending | — |
| WP7 | 图片 + 多图布局 | pending | pending | — |
| WP8 | native objects | pending | pending | — |
| WP9b | Intelligence Sidecar | pending | pending | — |
| WP10 | closure + QA#2 + 最终报告 | pending | pending | — |

## 审计门结论记录

（每个 WP 合并时追加：禁区扫描 / 测试 / traceability 抽查 / 设计稿回归 结果与打回记录）

- C0：n/a（纯 docs）。
- **WP9a（2026-07-25，fable 审计：PASS，待合并）**：
  - 越界文件：0（只碰 quick-search / result-browser / test）✅
  - 禁区 import：shared 组件零 store/service/telemetry 运行时依赖（仅 5 处 `import type` 数据形状，可接受）✅；裸 window/document 监听：0，键盘已归轨 owner-scoped ✅
  - 新测试 `result-browser-contract` / `result-browser-host-parity` 复跑过 ✅
  - "2 个全量失败系既有"声明：在干净基线 2afa7100 临时 worktree 复现验证属实（chat-studio-message-state-ui / code-block-theme-settings，与本 WP 无关）✅
  - graph 抽取真实性抽查：cytoscape 渲染器本已共享（AtlasGraphCanvas），shared 层为 controlled 薄壳（frozen subgraph 入参、不自建图），符合 plan §C ✅
  - 产物：worktree 分支 `worktree-agent-aa0c3a204207c38c0`（基线 2afa7100，3 commits：8a9d7004 / d07b12f2 / 8e7df077）。**合并待 WP1 审计提交后进行**（主树当前有 WP1 未提交改动）。
  - traceability：CMP-RB-01/02/04 PASS；CMP-RB-03 完成 Quick Search 半边（Composer adapter 待 WP9b 后）。
  - 遗留：真机视觉 parity 冒烟列入 QA #1 清单（quick-search 打开 List/Tree/Graph 走一遍）。已于 7a68346a 合并入主分支，worktree 已清理。
- **WP1（2026-07-25，fable 审计：PASS，commit d2714a88）**：
  - 足迹：仅 composer 四层 + 注册点 + config/styles/test/harness ✅；禁区 grep 全 OK（无 gstack import、无 getInstance、无 service singleton、无 label dispatch、service/core 零 obsidian import）✅；CodeMirror / chat Composer.tsx 零改动 ✅
  - 全量测试 267/269（2 个既有失败，已验证与波次无关）+ build 绿 ✅；4 个新测试（roundtrip 64 断言/8 fixtures、lifecycle 15、identity 16、config 2）✅
  - harness 截图产出成功（light/dark，22 块，0 console error）✅
  - **WP4 前必须处理的两个偏差**：① harness token fallback 在 light 主题下渲染暗面板、正文对比度过低——WP4 做 mock 比对前先修 harness token 默认值；② 骨架期每块上方的 kind 调试标签（FRONTMATTER/HEADING…）mock 中不存在，WP4 引入正式 block chrome 时移除。
  - 给 WP2 的接口：`ComposerDocumentSession`（fromSource/load/snapshot/isStale/reparse/refresh）、`ComposerSourceRevisionService`（revalidateAnchor→valid|drifted|missing）、`matchBlocks`（跨 revision 状态迁移必须走它，不用裸 id 相等）、patch 合同（只替换 `[from,to)` 内字节，块间分隔符在 gap 中绝不吸收，commit 后必须 reparse 断言目标块仍在）。
  - 已知取舍：math 未加 remark-math 扩展（$$ 内空行会分块但 round-trip 仍无损），WP5 需要一等 math 节点时再加。
- **WP2（2026-07-25，fable 审计：PASS，commit e3a20d64）**：
  - 足迹/禁区/timing（burstWindowMs 走 config）全过 ✅；全量 274/276（同 2 既有失败）+ build 绿 ✅；101 新断言（atomicity 28 / stale 14 / candidate 25 / history 21 / undo 13）✅
  - **接受的合同偏差**：reparse 断言在写盘**前**执行（handoff 字面是写后）——post-write 无法撤销落盘，pre-write 才守得住"step-4 失败零持久化"；代码头注释已论证。分隔符吞噬 patch 被 block-count-delta 守卫拒绝。
  - 已知限制：superseded 历史项 rollback 拒绝（anchor-drift）而非 rebase；moveBlock 的 superseded rollback 仅支持 on-top。
  - 给 WP3/WP4 接口：`hub.commit/undo/redo/rollback/subscribe/on`、candidate 全生命周期 API、`runtime.createTransactionHub(session)`；typing burst 用稳定 groupId（blockId 每次编辑会变，分组键不用 blockId）。
- **WP3（2026-07-25，fable 审计：PASS，merge 064d0d04）**：
  - 越界 0（含 WP4 领地零触碰）、冻结合同零改形、禁区 grep 全 OK、worktree 内与合并后主树均 279/281 + build 绿 ✅
  - 交付：composer surface 双镜像、definition 模型 + typed run events、app-owned runtime 全链（registry→applicability→frozen snapshot→materializer→text-patch writeback→History bridge）、生产 projection port、candidates 流式 UI + renderer registry、polish fake-port vertical slice（invoke→流式→accept→写盘→History→undo 字节精确）、polish 与 Copilot 共享 definition。
  - **集成接线说明（集成任务用）**：`DocumentComposerRuntime.createCapabilityRuntime(session, hub)` 同时实现 projection port 与 candidate runtime port，替换 stub；chrome 先 `runtime.assembleSnapshot(target, selectionText?)` 再 actionsFor/invoke；块下方挂 `ComposerCandidateHost`（candidateId 按 anchorBlockId 从 runtime.subscribe 取）。
  - 遗留（登记）：① stale candidate 的 regenerate 为 fail-closed（rebase 原语留 WP5+/集成）；② selection 级 range target 未在冻结 ComposerTarget 中，选区级 patch 需 WP4 selection target 落地后补 adapter 分支；③ CompiledSkill 为合成 shim，agent-mode packs 接 SkillRegistry.compile；④ 真实付费 provider 冒烟 credential-blocked（§2.4 允许）。
  - 流程备注：isolation worktree 初始基线陈旧（4fa5bd2b），代理自行 reset 到 ae4b2567 后工作——后续 worktree 派发时任务书应显式包含"先确认基线 = 最新主分支 HEAD"步骤。
- **WP4（2026-07-25，fable 审计：PASS，merge 8679f448）**：
  - 越界 0、WP3 领地（candidates/冻结合同/capability 文件）与 WP2 引擎内部零触碰、composer.json 顶层 key additive、禁区 grep 全 OK ✅
  - worktree 内 278/280；合并后主树 283/285 + build 绿；几何 QA **28/28**（主树复跑通过）✅；截图 10 张（light/dark ×5 场景）比对 mock 家族对齐良好 ✅
  - 冲突解决：`src/service/composer/index.ts` 纯 additive 冲突，两边保留（fable 手工）。
  - **流程教训**：`.dev/` gitignored ⇒ worktree 中的 harness 改动不随 git 合并；已手工同步 composer.html/composer.tsx/composerFixture.ts + 截图到主树。后续 worktree WP 若改 `.dev/`，合并时必须手工同步（写进 packs 派发任务书）。
  - **登记偏差（转 WP4.5 集成任务）**：① 正文 verbatim 渲染（`**bold**` 字面可见）——CMP-SEL-01"可见样式"半边未完成，集成任务补 rich inline 渲染（渲染态 styled runs + CE focus 显源码，S2 映射本就按渲染态设计）；② 在下方插入=短暂 draft 首内容才 commit（空段落 Markdown 不可表示，合理）。
  - 其他登记：comment 持久化 adapter 与 link metadata adapter 的 app 层实现留给 WP4.5（service port + UI 已就位）；Enter 块分割、nested list 内部 reorder 不在 WP4；真机 IME/拖拽/剪贴板二进制写入 QA#1 清单。
- **接口冻结（88931c20，fable authored）**：`src/core/composer/capabilityContracts.ts`——ComposerResultKind 14 种 / ComposerContextSnapshot / ComposerActionDescriptor / ComposerCapabilityProjectionPort + stub（chrome 在 runtime 未接入前零假 AI 按钮）。WP3/WP4 只实现不改形；改形需回本 log 记录编排者决定。

## WP0 spike 结论

### WP0 gate 结论（2026-07-25，fable）：**GO**

六 spike 全绿，模型层无需先修，可进入实现。锁定的依赖/架构决策：

| 决策项 | 结论 |
| --- | --- |
| Markdown parser | mdast 取块边界 offset + 原文字节切片，从不 re-serialize（零新依赖） |
| 编辑模型 | per-block contenteditable + 自定义跨块选择层；data-attribute DOM↔source 映射；mark-aware serializer（禁 `****`） |
| 表格 | typed TableModel（anchor-only 存储 + resolveGrid 派生）；parse5（service/测试）/DOMParser（renderer）双 port；单向升级 |
| 图片 | Canvas API，**不引 sharp/jimp** |
| Chart | recharts（已装未用，首次启用），**懒加载** + 静态关动画 |
| Excalidraw | 切片替换内嵌 JSON 段，兼容 compressed-json 变体 |
| ownerWindow | 复用 useOwnerWindow.ts + PortalContainerContext，零新增 |
| Button | 只用 `@/ui/components/primitives`；56 个 legacy 调用方迁移列波次外 backlog |
| 并行隔离 | git worktree + symlink node_modules（worktree 内禁改 package.json） |

### S2 selection/contenteditable（done，FEASIBLE 四点全 PASS）

- 复跑：`node .dev/spikes/composer/s2-selection/run.mjs`。
- **编辑模型定案：per-block CE**。依据：native undo 按块隔离（V3 实证）、IME composition 局部化（不被全文 re-render 撕毁）、React 只挂载不重渲编辑叶、跨块选择由 source 坐标确定性重建反而比单 CE 的浏览器边界规范化更可控。单文档 CE 明确否决。
- **映射实现**：run span 带 `data-src-text-from`（首个可见字符的 source offset）+ `data-unit-id`（paragraph/list-item/cell-rNcM）+ block 带 `data-block-id`/anchor；用 data-attribute 不用 WeakMap。
- **serializer 硬规则**：mark-aware 吸收/剥离相邻既有标记，绝不产出 `****` 或不配对标记（V2 实证跨 5 unit/3 block 分割）。
- **IME/undo 实施清单**（WP4 合同）：composition 期间绝不 preventDefault、绝不重渲编辑节点，`compositionend` 才 reconcile；Cmd/Ctrl+Z 在 CE focus 且直接输入分组存活时交 native，commit 边界才进 Composer undo stack；生产走 beforeinput 拦截，不用 execCommand。
- 遗留：真机 IME（macOS 拼音候选窗）需在真机 QA #1 人工过一遍。

### S4 媒体与 native 对象（done，四点全 PASS）

- 复跑：`.dev/spikes/composer/s4-media/` 下 `run-native-roundtrip.mjs` / `run-image-canvas.mjs` / `run-chart.mjs` / `run-ownerwindow-scan.mjs`。
- **图片决策：Canvas API 足够，不引 sharp/jimp**。crop/rotate/flip/straighten/三格式导出/质量旋钮/尺寸精确预估（`blob.size`）/EXIF 重绘剥离全部实测通过；OffscreenCanvas 可用；free-crop 用 `clip()` 实现。
- **native 决策**：Base 用已装 `yaml` 包 `parseDocument`（CST 保留）typed patch；Canvas JSON by-id patch；**Excalidraw 只切片替换内嵌 JSON 段**（不重写整个 md），adapter 需兼容 `compressed-json` 变体（本 vault 是 parsed）。三格式未知字段存活已验证。禁止 string-replace 猜结构。
- **chart 决策**：用已声明未用的 `recharts ^3.8.1`（`src/` 首次启用）；**必须懒加载**（react-external 下 +394KB min / ~100KB gzip）；静态图表统一 `isAnimationActive={false}`（Pie 首帧 radius=0 坑已踩明）。fenced `chart` JSON schema 草案已产出（type/title/x/series/data）。
- **ownerWindow：零新增基建**，复用 `src/ui/hooks/useOwnerWindow.ts` + `PortalContainerContext` + ReactItemViewHost popout 先例；7 条 pattern 清单已录（portal 容器、owner 事件、rAF/observer、ownerConfirm、canvas 创建等）。反面教材：quick-search 的裸 `window.addEventListener`——WP9a 抽 Result Browser 时顺手改成 owner-scoped（本来就在其 plan 范围）。

### S1 Markdown round-trip（done，PASS 8/8）

- 复跑：`node .dev/spikes/composer/s1-roundtrip/run.mjs`；golden fixtures 8 篇在 `.dev/spikes/composer/s1-roundtrip/fixtures/`（7 真实 vault/博客 + 1 手写 torture，覆盖 frontmatter/嵌套 callout/%%comment%%/dataview/mermaid/excalidraw 引用/转义管道表格/无尾换行）。
- **锁定 parser 路线**：`mdast-util-from-markdown`（+frontmatter/gfm/math 扩展）**只用于取 top-level 块边界 byte offset**；块内容永远是 `source.slice(from,to)` 原文切片，**从不 re-serialize**——round-trip 即 splice，unknown 语法无损 by construction。该栈已被 6 个 src 文件使用、已在 bundle（增量 ≈0）；`mdast-util-to-markdown` 不需要。拒绝自研行级切分器。先例：`src/core/document/atlas/documentBlockParser.ts`。
- **风险登记（WP1/WP2 必须处理）**：
  1. （最高）patch 吃掉块间空行分隔符会导致 reparse 融块——commit 第 4 步"重新解析并确认目标语义存在"必须断言目标块仍在；patch 合同要求保留 trailing separation。
  2. 本 spike 只验证 top-level 块粒度；list item / table cell / callout body 的 sub-block 寻址（嵌套节点同样带 offset）由 WP1 落地时补合同测试。
  3. blockId 跨 revision 稳定需 fingerprint rematch（合同本就限定"同一 revision 内稳定"）。
  4. `%%comment%%` 归类是启发式（mdast 视为 paragraph），render-model 层要标 hidden；Obsidian 特有语法需 thin post-classification pass（documentBlockParser 已有同款）。

### S5 fixture QA 手势修复（done，5/5 绿）

- 根因：mock 的手势合同本来就对（`pointHitsTableCellText()` 已正确分流）；漂移在 QA helper `dragTableCells()` 从 cell 正中心起拖（内容相关地踩到字形）。
- 修复：仅改 `composer-editing-patterns.qa.mjs`——起拖点移到 padding gutter（`start.x + 4`）；并新增正向断言：从字形起拖 → `.is-range-cell` 为 0 且 native selection 非空（"文字仍可圈选"证据）。mock.js / README 零改动。
- **锁定手势合同（WP6 生产实现依据）**：padding/edge 起拖 = 对象 cell-range；glyph 起拖 = native 文本选择；click / Shift+click / Cmd·Ctrl+click 驱动对象选择。对象选择永远不以禁用 cell 文本选择为代价。

### S3 表格模型（done，GREEN）

- 复跑：`node .dev/spikes/composer/s3-table/run.mjs`（29 断言全过）。
- **pipe round-trip**：canonical GFM 逐字节还原（对齐冒号/`\|` 转义/行内格式）；非 canonical 空白首载归一化后幂等——写进 WP6 spec 说明，非 blocker。
- **merge/HTML**：merge 只存 anchor cell（colspan/rowspan），覆盖位置由 `resolveGrid()` 派生（关键不变量：绝不冗余存储覆盖格）；`modelToHtml→parse5→htmlToModel→modelToHtml` 逐字节一致。
- **单向升级**：`canDowngradeToPipe()` 三条件（无 merge、单 header 行、无 per-cell align 冲突）；merged 表 `modelToPipe` 直接 throw。
- **确定性操作**：add/remove row/column、sort、transpose、CSV 均带 merge-aware 守卫 + reason 文案（§10.4 "disabled+reason" 达标）；transpose 后首列变 header 的语义待产品确认。
- **HTML parser 选型**：service/core + 测试用 `parse5`（node_modules 已有 7.3.0，零新依赖）；renderer 生产可在同一 `htmlToModel` port 后换 native DOMParser。不自研 tokenizer。

### S6 worktree 基建（done，GO）

- **worktree 方案可用**：`git worktree add /tmp/composer-wt-<slug> <ref> --detach` + `ln -s <主仓库>/node_modules`（秒级，无需 npm install；better-sqlite3/esbuild 预编译二进制经 symlink 正常）。单测冒烟 0.1s、`npm run build` 全管线 ~4.2s 通过。仓库 `.claude/worktrees/agent-*` 已有同款先例。
- **约束**：node_modules 共享，worktree 内不得改 package.json / 装新依赖（引依赖只能在主树由 fable 做）。
- **teardown**：`git worktree remove --force /tmp/composer-wt-<slug>`。
- **Button canonical**：`src/ui/components/primitives/Button.tsx`（`--pk-*` token 驱动，ui-design.md §2 与 component-consistency spec 均指认）。`src/ui/component/shared-ui/button.tsx` 为 legacy shadcn 债务（56 个调用方）。**Composer 全部新 UI 只 import `@/ui/components/primitives`**；56 个 legacy 调用方迁移登记为波次外 backlog，不在本波次做。
- **gitignore**：`.dev/` 已覆盖（.gitignore:62），spike 产物不会入库。

## Requirement traceability matrix（96 IDs）

状态：`pending / in-progress / done / blocked`。实现 WP 合并时由 fable 依据 opus 提交的 `ID → files → tests` 行抽查后更新；终表进 final implementation note。

| ID 组 | IDs | 归属 WP | 状态 |
| --- | --- | --- | --- |
| CMP-HOST | 01–06 | WP1（05 drag 事务=WP2；06 边界=WP1） | pending |
| CMP-UI | 01–05 | WP4（03/04 全局复核=WP10） | pending |
| CMP-SEL | 01–05 | WP4 | pending |
| CMP-COPY | 01–03 | WP4 | pending |
| CMP-LINK | 01 | WP4 | pending |
| CMP-COMMENT | 01 | WP4 | pending |
| CMP-FM | 01–05 | WP5 | pending |
| CMP-TXN | 01–04 | WP2 | pending |
| CMP-REV | 01–05 | 01=WP4；02–04=WP3；05=WP5–8 | pending |
| CMP-AI | 01–09 | WP3（08/09 parity 复核=WP10） | pending |
| CMP-HIST | 01–03 | WP2 | pending |
| CMP-UNDO | 01–02 | WP2 | pending |
| CMP-MATH | 01–05 | WP5 | pending |
| CMP-TABLE | 01–07 | WP6 | pending |
| CMP-CHART | 01–02 | WP6 | pending |
| CMP-IMG | 01–08 | WP7 | pending |
| CMP-NATIVE | 01–06 | WP8 | pending |
| CMP-FIND | 01–02 | WP9b | pending |
| CMP-SIDE | 01–05 | WP9b | pending |
| CMP-REL | 01–02 | WP9b | pending |
| CMP-RB | 01–04 | WP9a | pending |
| CMP-METRIC | 01–03 | WP9b | pending |
| CMP-A11Y | 01–02 | 各 WP 交付即达标，WP10 复核 | pending |
| CMP-RESP | 01 | WP10 | pending |
| CMP-GOV | 01–02 | WP10 | pending |

## 设计稿回归比对记录

（每个 UI 类 WP 合并时追加：harness 截图 vs mock 截图逐项 匹配/接近/偏离 表；偏离项处理结果）
