# HANDOFF.md — Peak Composer 生产波次交接（给 Codex）

> **2026-07-27 closure update:** 本文件保留的是 `9c4bda5d` 时点的接管快照，
> 不再代表当前工作树。T1 / T2 / T3 / T4 / T6 / T7 已完成，T5 已完成无需 owner
> 介入的真机子集；T6 的证据裁决为 `NO-GO`，因此未删除仍有生产调用的旧路径。
> 当前总体状态仍为 `PARTIAL`。以
> [`docs/superpowers/plans/2026-07-27-peak-composer-implementation-note.md`](./docs/superpowers/plans/2026-07-27-peak-composer-implementation-note.md)
> 的终表与 §19 报告为准。

Date: 2026-07-27
Branch: `codex/peak-modernization-refactor`
HEAD: `9c4bda5d`（fix: React #185 finding list snapshot）
工作树：**86 个未提交改动**（50 M + 36 新增，全部属于已完成并通过编排者审计的 "WP-INT 集成收口"，**不要回滚**，见 §2/§4）

---

## 1. Original Task

在本插件中实现 **Peak Composer 的完整生产版本**——一个独立的 Obsidian 文档工作台 ItemView：把 Markdown/native 文件渲染成可折叠、可拖动、可选择、可结构化编辑、可由 AI 局部协作并可安全回滚的块式文档视图。

**唯一合同真值**（必须先读，本文件不复述其全部细节）：
- `docs/superpowers/plans/2026-07-24-peak-composer-complete-implementation-handoff.md` — 13 个 required tracks（R0–R12）、96 个 Requirement IDs（§20）、Impact Contract（§2）、禁区（§2.3）、验收矩阵（§15）、测试清单（§16）、`COMPLETE/PARTIAL/BLOCKED` 判定模板（§19）。
- `docs/superpowers/specs/2026-07-24-peak-composer-ai-capability-modularity-architecture.md` — AI 能力运行时架构真值。
- `docs/superpowers/plans/2026-07-25-composer-wave-execution-log.md` — **本波次执行日志**：每个工作包的审计结论、锁定决策、遗留清单。这是除本文件外最重要的状态文档。

**核心验收闭环（Impact Contract §2.1）**：打开真实 vault 笔记 → 解析渲染真实块 → 直接编辑或运行确定性/AI 操作 → 原对象位置审阅候选 → 接受后原子写回原文件 → History 可定位/分组/回滚 → Undo/Redo 可逆 → 重开一致。

**硬约束（违反即打回）**：
- 零 CodeMirror 改动；不碰 Chat 输入器 `src/ui/view/chat-view/components/Composer.tsx`；`src/**` 不 import `docs/gstack/**`（那是设计 fixture，不是生产代码）。
- 无 service 层 mutable singleton；UI 不直接调 provider；无 label/id-substring dispatch；文案/颜色/阈值/timing 全走 `templates/config/composer.json` + typed fallback。
- 所有 AI 输出真实流式、可定向追问/重新生成/切版本/接受/丢弃；接受必须进 History。
- **无假按钮**：动作要么真实生效，要么 disabled + reason，要么不渲染。
- `src/core/composer/capabilityContracts.ts` 是**冻结接口**，不许改形。
- Owner 特别指令：**UI 必须尽可能还原设计稿**（`docs/gstack/peak-composer-editing-view-2026-07-09/` 的 mock 是 spec 不是灵感），CSS 值级复刻（实测 computed style 写死），每次 UI 改动用 harness 截图与 mock 并排比对。

## 2. Current Status

**整体：13 个 required tracks 的代码实现全部落地；剩余 = 提交当前工作树 + WP10 收尾（guards 终审/traceability 终表/docs）+ 真机 QA#2 最终验收（需 owner 在场）。**

- ✅ 已完成并验证（已提交，各自过编排者审计门）：WP0 spikes、WP1 宿主+source model、WP2 事务底座、WP3 capability runtime、WP4 editing chrome、WP4.5 集成、WP9a Result Browser 抽取、FIX-1（真机复验过）、FIX-2 设计稿保真（截图目检过）、WP5/6/7/8/9b 五个 packs（全部合并）、React #185 热修复。
- ✅ 已完成并验证但**未提交**：WP-INT 集成收口（当前工作树全部 86 个改动）。编排者已审计：全量测试 304/306（2 个失败为波次前既有、与本波次无关，见 §10）、build 绿、几何 QA 49/49、禁区/冻结合同零触碰。
- ⏳ 未开始：WP10 closure（见 §8）。
- ⏳ 未开始：真机 Obsidian QA#2（§16.4 全矩阵，**需 owner 在场**，清单见 §8）。
- 已暂缓（合同允许，§2.4 skip budget）：协作编辑/多人 presence/移动端 touch-first；真实付费 provider smoke（credential-blocked，fake-port 测试全绿）。

## 3. Work Completed

按 checkpoint 顺序（每项均有 execution log 审计记录）：

1. **WP0 六个 feasibility spikes**（`.dev/spikes/composer/`，gitignored）→ 锁定：mdast 只取块边界 offset + 原文字节切片从不 re-serialize；per-block contenteditable + 焦点转发；TableModel anchor-only + parse5/DOMParser 双 port；图片=Canvas API 不引 sharp；Excalidraw 切片替换内嵌 JSON；chart=recharts 懒加载；worktree+symlink node_modules 并行开发模式。
2. **WP1**（`d2714a88`）：四层目录（core/service/app/ui 的 composer/）、DocumentComposerView + 完整文件生命周期（switch/rename/delete/external-modify→stale）、8 篇 golden fixture 逐字节 round-trip、fold=view state、`.dev/harness` composer 截图入口。
3. **WP2**（`e3a20d64`）：可逆 operation + 八步原子 commit 引擎（reparse 断言**前置到写盘前**——有意偏差，代码头注释有论证）、candidate/variant store（pending 不进盘/History/Undo）、History 分组 + inverse rollback、Undo/Redo 栈、revision-guarded 写回。
4. **接口冻结**（`88931c20`）：`capabilityContracts.ts`——14 种 result kind、frozen snapshot、action descriptor、projection port + stub。
5. **WP3**（merge `064d0d04`）：composer surface（`capability.ts` 与 `SurfaceCapability.ts` 双镜像）、capability definition 模型、app-owned runtime（registry→applicability→frozen snapshot→materializer→writeback→History bridge）、polish fake-port 全链路、与 Copilot `polish` 共享 definition。
6. **WP4**（merge `8679f448`）：块 rail（折叠+拖动 moveBlock 写回）、单行 action row、per-block CE 直接编辑（beforeinput 观察 + burst 提交，IME 期零干预）、跨结构语义分割格式化（mark-aware serializer 防 `****`）、Easy Copy 四格式、paste-URL 守卫、评论锚点、link hover、底部 Undo/Redo 栏、三种文档显示状态、几何合同 QA。
7. **WP4.5**（`64d958ba`）：runtime 组合进真实 view、comment 持久化（plugin-dir JSON）+ link metadata（metadataCache）adapter、candidates 按 anchorBlockId 挂载、`ComposerTarget` 增 additive `selection` variant（选区级字节精确写回）、富 inline 渲染（styled runs，`source.slice(from,from+len)===run.text` 不变量；focus 显源码）、stale candidate rerun、gateway 命令 `peak-open-document-composer`。
8. **QA#1 真机中期验收**（记录于 execution log）→ 发现 F1/F2。
9. **FIX-1**（`1516f50f`）：F1=`AIServiceManager.queryStream` agent-SDK 分支漏传 `hasPartialMessages` 致流式文本翻倍（系统级修复，惠及所有 queryStream 消费方）；F2=块 wrapper 空白区点击不聚焦 CE（`focusForwarding.ts`：preventDefault→leaf.focus()→rAF 后 caretRangeFromPoint 就近落点）。两项真机复验通过。
10. **FIX-2**（`ca369ecb`）：设计稿保真——868px 白卡片+灰底 `rgb(243,246,249)`、action row 锚定块底边（top≈bottom−3px）、hover tint `rgba(37,99,235,.02)`、排版校准；全部值为 playwright 实测 mock computed style 写死。
11. **WP5/6/7/8/9b 五个 packs**（merges `6a9bded8`/`11aa5cf2`(fb753086)/`75a357ad`/`21681ffc`/`ebbbd793`）：Frontmatter 属性网格+YAML 保真写回+属性库；TableModel+双模选择+merge-aware 工具栏+recharts Chart；图片粘贴事务+Canvas converter+AI 改图+多图布局；Base/Canvas/Excalidraw typed patch+native port；Intelligence Sidecar+finding 同体+Composer Result Browser adapter+十维 telemetry。
12. **React #185 热修复**（`9c4bda5d`）：`FindingStore.list()` 每调用新数组被当 useSyncExternalStore getSnapshot → 无限重渲染；改为缓存引用、notify 时失效。真机崩溃循环由 owner 截图报告，已修。
13. **WP-INT 集成收口**（**当前未提交工作树**）：见 §4。8/8 项——INT-1（commit 后 focus/caret/scroll 保持：稳定 block key + 相对 offset span key + 滚动守卫）、Table AI 5+1 能力接入 runtime（typed-object 生成路径：流式骨架→JSON 剥 fence→Zod 校验→variant，坏 JSON fail-closed）、图片 coordinator/粘贴/renderer 接线、WP5 端口（inventory adapter/AI invoke/添加属性入口/KaTeX 改 `output:'mathml'` 修字体 404）、native 候选轨 + 专用 PromptId、Sidecar 实源（vectorSearch/JSONL telemetry/真实 focus provider）、CMP-REV-02 原位 word diff（LCS 词级/CJK 逐字，mock 色值 11 项复刻）。

## 4. Files Changed（当前未提交工作树 = WP-INT）

> 已提交部分的文件清单见各 merge commit 与 execution log，此处只列**未提交**的 86 个。全部完整、已测试、Codex 首要职责是**原样提交**（见 §8 第 1 项），除非 §8 后续任务要求再改。

**核心接线（修改）**：
- `src/service/composer/capabilities/documentRuntime.ts` — 新增 typed-object 生成路径（`streamsTypedObject` materializer 标志）；Table AI/chart 生成的执行内核。完整。
- `src/service/composer/capabilities/packs/{table,chart,math,native,link}.ts` — 接上专用 PromptId 与 typed 结果；`resultMaterializers.ts` 同步。完整。
- `src/app/composer/capabilities/composeComposerCapabilityRuntime.ts` — 注册 table/chart packs、formula detail generator、image text adapter。完整。
- `src/app/composer/{DocumentComposerController,DocumentComposerRuntime,composeDocumentComposerRuntime,ObsidianComposerAdapters}.ts` — image coordinator 组合、vault inventory adapter、focus provider、telemetry sink 接线。完整。
- `src/ui/view/composer/ComposerRoot.tsx` — `useStableBlockKeys`（matchBlocks 迁移持久 key，INT-1 核心）、粘贴 handler、sidecar 实源。完整。
- `src/ui/view/composer/chrome/{EditableText,ComposerChromeContext}.tsx` — INT-1 焦点/caret 保持；`useEditingScrollGuard`（滚动守卫：wheel/touch 手势预算，未授权滚动逐帧吸回）。完整。
- `src/core/composer/transactionConfig.ts` + `templates/config/composer.json` — 新 config key（`transaction.scrollGuardGestureWindowMs`、`image.edit.presetId`、各 pack 文案）。完整。
- `src/core/template/TemplateRegistry.ts` + `src/core/types/prompt.ts` — 新 PromptId 登记（table×5、chart、mermaid/code/link/native edit、image caption/layout）。完整。

**新增源文件（8）**：
- `src/service/composer/render/wordDiff.ts` — LCS 词级 diff（CJK 逐字、>2000 token 降级、revision 漂移回退纯文本）。CMP-REV-02 核心。
- `src/ui/view/composer/candidates/NativeFilePatchCandidateCard.tsx` — native 结构 patch 候选卡。
- `src/ui/view/composer/blocks/image/ImageBlockView.tsx` — 图片块 object-toolbar（图注/AI 改图）。
- `src/ui/view/composer/blocks/frontmatter/AddFrontmatterEntry.tsx` — 无 frontmatter 时"添加属性"入口（字节精确 head 插入）。
- `src/ui/view/composer/chrome/pasteImage.ts` — bitmap 粘贴检测→beginPaste。
- `src/ui/view/composer/sidecar/focusContext.ts` — 真实 focused-block provider（service 零 DOM，app/ui 注入）。
- `src/app/composer/capabilities/{ComposerFormulaDetailGenerator,ComposerImageTextAdapter}.ts` — 公式 detail 与图片 caption/layout 的 app 层 executor adapter。

**新增模板（20）**：`templates/prompts/doc-table-*.md` ×10、`doc-{mermaid,code,link,native}-edit(-system).md` ×8、`composer-image-{caption,layout}(-system).md` ×4（注：共 22 个文件里 2 个是既有改动）。

**新增测试（7）**：`test/composer-{word-diff,typed-object-runtime,native-runtime,paste-image,image-integration,related-materials}.test.ts` + 既有 4 个测试扩展；`test/composer-chrome-geometry.qa.mjs` 扩到 49 项（新增 3 条 INT-1 断言）。

**样式**：`src/styles/composer.css`、`composer-fm-math.css` — word diff 色值（`#a85b5b/#fbecec/#176d52/#e9f7f0`，取自 mock diff-patterns-lab）、图片 toolbar、KaTeX mathml 微调。

**gitignored（不入库但真实存在）**：`.dev/harness/` 的 composer fixture/截图、`.dev/spikes/composer/` 六个 spike、`.dev/harness/shoot-full.mjs`。

## 5. Architecture and Decisions

**分层**（严格执行，`test/boundary/service-layer-boundaries.test.ts` 强制）：
```
src/core/composer/     类型/IDs/schemas/冻结合同（零依赖）
src/service/composer/  parser、事务引擎、packs、capabilities、intelligence（零 obsidian import）
src/app/composer/      Obsidian adapters、runtime 组合（AppRuntimeRegistry 四方法 slot）
src/ui/view/composer/  React：ComposerRoot / chrome / blocks / candidates / sidecar
```

**关键决策与理由**（不许翻案，除非 owner 明示）：
1. **Source truth = 原文字节**：mdast 只取 top-level 块边界 offset，块内容永远是 `source.slice(from,to)`，从不 re-serialize → unknown 语法无损。patch 只替换 `[from,to)` 内字节，块间分隔符在 gap 中绝不吸收；commit 后 reparse 断言目标块仍在（`transactionEngine.ts`）。
2. **Reparse 断言在写盘前**（handoff 字面顺序是写后）——post-write 无法撤销落盘；代码头注释有完整论证。这是被编排者批准的合同偏差。
3. **Per-block contenteditable（非受控）**：CE 聚焦期 native 插入（含 IME）→ onInput 观察 → DirectEditController burst 落盘。**禁止**改成 preventDefault+手动插入（破坏 IME 与 native undo，注释有警告）。跨 revision 状态迁移一律走 `matchBlocks`（blockId 每次 commit 会变，绝不能用裸 id 相等）。
4. **单一 AI runtime**：所有能力经 `CapabilityRunner`/RunEnvelope；renderer/writeback 按 `resultKind`/`rendererId` dispatch，绝无 label 判断。图片是例外形态：独立 `ImageCapabilityCoordinator`（media 生成不适配 text runtime），与主 runtime 并列组合、共享 hub——这是被批准的设计。
5. **candidate 语义**：pending 不写盘不进 History/Undo；variants append-only；仅 active-ready 可 accept；stale fail-closed（rerun 继承 instruction）。
6. **Undo/Redo**：document 级栈在 hub；CE focus 且 burst 存活期 Cmd+Z 交 native；undo 后新 commit 清 redo。
7. **表格**：anchor-only 存储 + `resolveGrid()` 派生覆盖格；pipe→HTML 单向升级；merge 只接受同 section 完整矩形；所有操作 merge-aware（禁用必带 reason）。
8. **手势合同（S5 锁定）**：cell padding/edge 起拖=对象选择；glyph 起拖=native 文本选择；click/Shift/Cmd-Ctrl=对象选择。绝不以禁用文本选择换对象选择。
9. **Finding 同体**：正文标记与 sidecar brief 是同一 store 两个投影；fingerprint+evidenceRevision 去重；useSyncExternalStore 的 getSnapshot **必须引用稳定**（React #185 教训，`findingIdentity.ts` 有注释）。
10. **detached window**：一切事件/portal 走 `useOwnerWindow.ts` + `PortalContainerContext`，禁裸 window/document。
11. **设计稿复刻**：所有视觉值从 mock 实测写死（execution log "保真比对"段有完整值表）；六组件家族几何由 `test/composer-chrome-geometry.qa.mjs` 锁死。

## 6. Attempts That Failed（勿重蹈）

1. **靠 harness 浏览器测试推断真机行为** → QA#1 三个真机特有 bug（F1 流式翻倍、F2 打字失效、React #185 循环）全是 harness 不复现的。教训：任何输入/流式/生命周期改动必须真机复验。
2. **F2 的前两个假说都错了**（caret 脱离 remount / Obsidian keymap 吞键）——真因是 wrapper mousedown 不转发焦点。已有探针方法论：环境差异 bug 先加 `console.debug` 探针真机判读，再修。
3. **在流式管线下游去重修 F1** 不可行：增量 delta 与末尾全文块无标记不可区分，唯一正确修法是源头传 `hasPartialMessages`（`service-manager.ts` 已修，有回归测试锁死）。
4. **合并只看输出尾部** → WP6 合并时两个未解决冲突标记被 `git add -A` 提交，全量测试立即爆 compile-error。规矩：合并后必须 `git status` 查完整 unmerged 列表 + grep 标记 + 全量测试，才许 commit。
5. **INT-1 曾误判为布局挤压/notice 占位** → 实测是块列表以 blockId 为 React key 导致 commit 全量 remount + 浏览器原生异步 caret-reveal 滚动。修复是三层的（稳定 key/相对 offset key/滚动守卫），单改任何一层都不够。
6. **KaTeX 字体 base64 内联**被放弃：`output:'mathml'` 实测零 404 且渲染清晰，更简单。
7. **isolation worktree 的初始基线可能陈旧**（曾拿到 307 commits 落后的 4fa5bd2b）：任何 worktree 开工前必须 `git log` 验基线并 reset 到最新主分支 HEAD。

## 7. Known Issues and Risks

- **2 个既有测试失败**（波次前就存在，与 Composer 无关，已在干净基线 `2afa7100` 复现验证）：`chat-studio-message-state-ui`、`code-block-theme-settings`。**不要试图在本波次修**，但也不要让它们之外再多任何红。
- **真机未验证面**（QA#2 清单，见 §8）：INT-1 真机滚动手感、Table AI 真实 provider typed JSON、真机位图粘贴、fal.ai 改图、KaTeX mathml 视觉、native accept 并发 fail-closed、word diff 长段落可读性、中文 IME 全流程、拖拽手势、剪贴板二进制写、mermaid popout。
- **诚实降级（非 bug，UI surface 未做）**：图片块无内联 `<img>` 预览（previewUri 端口未透传）；image convert 与多图 layout 无 UI 入口（coordinator API 就绪）；Gallery 布局块 verbatim 呈现；§8.4 shape-change 确认弹层未做（config 串已就位）；宽 modal graph real-fit 未做；native accept 不进 Markdown History/Undo（独立文件独立 port，代码有注释说明语义）。
- **多 unit 选区 AI 只作用 unit[0]**（clamp，字节安全）。
- **外部编辑 revalidate 会重建 session/hub**（undo 历史丢失）——符合 WP2 语义，已接受。
- **frontmatter AI 建议双入口**（action row + 块内按钮，同能力冗余无害）。
- **旧路径尚未删除**（§11.6 删除门是 WP10 的事）：28 个 Copilot action 原路径原样保留（`polish` 已共享 definition 作先例）；删除前必须过 parity 测试。

## 8. Remaining Tasks

- [ ] **T1 提交 WP-INT 工作树**：`git add -A && git commit`（建议 message：`feat(composer): integration closure — INT-1 focus continuity, table AI runtime, image wiring, native candidates, sidecar live ports, in-place word diff (WP-INT)`，英文，结尾 `Co-Authored-By` 按仓库惯例）。提交前复核：`git status` 无 unmerged、`grep -rn "<<<<<<<" src templates test` 为空、`npm run test`（304/306）、`npm run build` 绿。
- [ ] **T2 WP10-guards**：按 handoff §16.5 补全 architecture guard 测试（现有先例：`test/boundary/service-layer-boundaries.test.ts`、`test/*-source-guard.test.ts`）。至少断言：`src/**` 零 `docs/gstack` import；composer UI 零 provider adapter import；composer service 零 mutable runtime singleton；无 label dispatch（可 grep `label ===` / `id.includes(`）；CodeMirror 相关文件在本波次 diff 中零出现。新文件建议名 `test/composer-architecture-source-guards.test.ts`（§16.1 要求此名）。完成标准：新 guard 测试绿且全量仍 304+/306。
- [ ] **T3 traceability 终表**：在 `docs/superpowers/plans/` 新建 final implementation note（命名如 `2026-07-27-peak-composer-implementation-note.md`），把 handoff §20 的 96 个 Requirement ID 逐行补成 `ID → production files → tests → QA evidence → status`。素材：execution log 各 WP 审计段已含分组 traceability。诚实标注 §7 列出的未验证/降级项为 PARTIAL 行。同时按 handoff §18 回答八个问题（如何加新能力/如何 debug source mapping 等）。
- [ ] **T4 fixture QA 回归**：跑 5 个设计 fixture QA（命令见 handoff §16.2，`CAPTURE_SCREENSHOTS=0 node docs/gstack/peak-composer-editing-view-2026-07-09/*.qa.mjs`），必须 5/5 绿（基线本就全绿，若红说明 mock 被误改）。
- [ ] **T5 真机 QA#2（需 owner 在场，不要单方面标 done）**：按 handoff §16.4 全矩阵 + §7 "真机未验证面"清单逐项过。证据（截图/磁盘验证）记入 execution log 新段 "QA#2"。
- [ ] **T6 删除门（谨慎，QA#2 后）**：handoff §11.6——仅在 parity 测试通过后收敛旧 Copilot dispatch 路径；**绝不删除** Chat Composer、CodeMirror、仍有生产 caller 的 compatibility path。若 parity 不充分，明确记 PARTIAL 并保留双轨+理由。
- [ ] **T7 最终报告与 docs**：按 handoff §19 模板出 `COMPLETE/PARTIAL/BLOCKED` 报告（预期为 PARTIAL-或-COMPLETE 取决于 QA#2 与 T6）；更新 `docs/progress.md`（session 追加）与 `docs/roadmap.html`（Composer 关键节点迁移）；execution log 收尾。

## 9. Recommended Next Steps

1. **先读**（顺序）：本文件 → `docs/superpowers/plans/2026-07-25-composer-wave-execution-log.md`（全文）→ handoff 合同 §2/§15/§16/§20 → 冻结合同 `src/core/composer/capabilityContracts.ts`。
2. **先跑**：`git status`（应与 §4 一致）；`npm run test`（期望 304/306，仅那 2 个既有失败）；`npm run build`；`node test/composer-chrome-geometry.qa.mjs`（期望 49/49，需要 playwright + 会自起 vite:3211，跑前 `pkill -f vite`）。
3. **先验证**：任取 §4 中 2-3 个文件抽查与本文件描述一致（例如 `wordDiff.ts` 存在且被 `StreamingTextCandidateCard` 使用）。
4. 然后按 §8 顺序执行 T1→T7。
5. **不要重构**：WP2 事务引擎、`focusForwarding.ts`、`EditableText` 的非受控模型、`matchBlocks` 迁移逻辑、冻结合同、FIX-2 写死的视觉值——这些全部有测试/合同锁定。
6. **不能回滚**：当前工作树的 86 个改动（已审计的 WP-INT 成果）；`main.js` 已构建含全部修复（owner 的 Obsidian 正在用）。

## 10. Validation and Test Results

| 命令 | 结果（2026-07-27 编排者最后一次亲跑） |
| --- | --- |
| `npm run test` | **304 passed / 2 failed (306)** — 失败：`chat-studio-message-state-ui`、`code-block-theme-settings`（既有，已在干净基线 `2afa7100` 复现验证为波次无关） |
| `npm run build` | 绿（esbuild + check:bundle + copy-agent-sdk） |
| `node test/composer-chrome-geometry.qa.mjs` | **49/49**（先 `pkill -f vite`；自起 vite:3211；产出截图到 `.dev/harness/shots/`） |
| `node test/composer-image-canvas.qa.mjs` | 10/10（WP7 期验证） |
| fixture QA ×5（handoff §16.2 命令） | 5/5 绿（FIX-1 前基线；T4 需回归复跑） |
| tsc | 仓库有既有全局错误（build 用 esbuild 不用 tsc）；本波次未新增错误类（各 WP 审计记录） |
| lint | 仓库无独立 lint 脚本；风格由测试+惯例约束 |
| 真机验证已做 | QA#1 全记录 + F1/F2/#185 复验（见 execution log）；**QA#2 未做** |

## 11. Acceptance Criteria

- [ ] handoff §15 验收矩阵逐项（§15.1–§15.6）
- [ ] §16.1 列出的 contract test 全部存在且绿（现缺口：`composer-architecture-source-guards` → T2）
- [ ] `npm run test` 除 2 个既有失败外全绿；`npm run build` 绿；`git diff --check` 干净
- [ ] 几何 QA 49/49；fixture QA 5/5
- [ ] 真机 QA#2 全矩阵证据落 execution log
- [ ] 96 ID traceability 终表 + final implementation note（T3）
- [ ] 删除门：旧路径收敛有 parity 证据，或诚实记录双轨原因（T6）
- [ ] §19 模板最终报告；Impact Contract 自检：CodeMirror touched=0、docs/gstack imported=0、duplicate runtime=0
- [ ] `docs/progress.md` + `docs/roadmap.html` 更新

## 12. Important Context from Conversation

- **Owner 角色分工指令**：编排/审计由主会话做，实现派 opus 子代理——Codex 接手后等价于承担实现+收尾角色，但**审计纪律保留**（每步足迹/禁区/测试三查）。
- **Owner 视觉铁律**（睡前原话）："ui一定要尽可能还原我们的设计 截图对比 css看起来样式也要还原的"——复刻模式，mock 是 spec；禁止"优化""发挥"；值从 mock 实测。
- **Owner 拒绝过的东西**：superpowers SDD 仪式流程（直接干活）；spec/文档里写工时估算（禁"X 天/X 小时"）；emoji 图标（只用 Lucide）；把生成文件放 ChatFolder 外（见 memory 规则）；项目根目录放脚手架（一律 `.dev/`，gitignored）。
- **commit 纪律**：英文 message；checkpoint 级（不要每个小按钮一个 commit）；结尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`（Codex 接手可换成自己的署名惯例，但保持英文与 checkpoint 粒度）。
- **术语**：`Composer` 在产品语境=文档工作台；代码里 Chat 输入器也叫 Composer.tsx（禁碰）——代码命名一律 `DocumentComposer*`。"三态"=工作视图/全部改动/纯净阅读。"burst"=直接编辑的 800ms 聚合窗（config 可调）。
- **公式最终规则**（曾有旧文档冲突，已裁决）：每个公式的解释/拆分/变量表独立，可同公式共存、跨公式任意组合；点谁只显示谁。
- **既有 2 个失败测试**是主分支带来的，owner 知情；不修、不掩盖、不让它增多。
- **`.dev/` gitignored 陷阱**：worktree 里的 `.dev` 改动不随 git 合并，需手工同步（历史上踩过）。
- Obsidian 交互技巧（真机 QA 用）：插件接管了 Cmd+O（Quick Search modal）；Briefing modal 会拦 Esc/Cmd+P（点 X 关）；重载用 Cmd+P → "Reload app without saving"；QA 专用笔记 `Peak Composer QA 2026-07-26.md` 在 vault 根（可复用，当前为干净状态）。

## 13. Codex Handoff Prompt

```
你接手 Peak Composer 生产波次的收尾工作。请严格按以下步骤执行：

1. 完整阅读仓库根目录 HANDOFF.md，再读 docs/superpowers/plans/2026-07-25-composer-wave-execution-log.md 与
   docs/superpowers/plans/2026-07-24-peak-composer-complete-implementation-handoff.md 的 §2/§15/§16/§20。
2. 运行 git status 与 git log --oneline -30，核对与 HANDOFF.md §2/§4 描述一致；抽查 2-3 个 §4 列出的文件确认内容相符。
   如发现不一致，先报告差异再行动。
3. 当前工作树的 86 个未提交改动是已通过审计的集成成果——绝对不要回滚、不要 stash 丢弃、不要"清理"。
4. 先跑基线：npm run test（预期 304/306，仅 chat-studio-message-state-ui 与 code-block-theme-settings 两个既有失败）、
   npm run build、pkill -f vite 后 node test/composer-chrome-geometry.qa.mjs（预期 49/49）。基线不符先查明再继续。
5. 按 HANDOFF.md §8 的 T1→T7 顺序执行。T1 先提交现有工作树。T5 真机 QA 需要 owner 在场，到达该步时暂停并向 owner 请求配合，
   不要单方面标记完成。
6. 遵守 §1 硬约束与 §5 决策（冻结合同不改形、非受控 CE 模型不翻案、mock 复刻值不"优化"）、§6 的失败教训
   （尤其：合并后查完整 unmerged 列表；真机特有 bug 用探针判读）。
7. 每完成一个 T 项：跑全量测试 + build（涉及 UI 再跑几何 QA），并在 execution log 追加记录。
8. 全部完成后汇报：完成了哪些 T 项、修改文件清单、每条验证命令与结果、按 handoff §19 模板给出
   COMPLETE/PARTIAL/BLOCKED 判定与剩余矩阵。
9. 除非真正被阻塞（缺凭据/需 owner 决策/基线不符），不要只分析不执行。
```
