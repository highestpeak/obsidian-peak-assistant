# Recurring Pitfalls

A registry of bug **classes** that have bitten us more than once. Each entry captures the pattern, not just the specific incident — so future debugging starts here before re-deriving the same root cause.

**When to add an entry:**
- A new bug instance fits an existing pattern → append it to that pattern's Instances table.
- A bug pattern reappears in a different module → create a new pattern entry.
- A bug took >30 min to diagnose AND the root cause class is generalizable → document it even on first sighting; second sighting will validate.

**Format per entry:** Symptom → Mechanism → Instances → Detection signals → Prevention checklist.

---

## 1. State persistence gap — save fires before data exists

### Symptom
- User: "X 每次重启/恢复都得重新生成，没持久化"
- Or: feature looks fine in the live session, but reloading from history shows it empty.

### Mechanism
1. Feature has two state slices: A (the "primary" result) and B (a "secondary" artifact generated later).
2. Save trigger fires when A completes.
3. B is produced on-demand later (user clicks a tab, or async pipeline finishes after the save).
4. **No code path re-triggers save when B becomes available.**
5. Marshaling/parsing on restore is correct — but the saved file never had B, so nothing to restore.

Often compounded by: restore path doesn't seed `lastSavedPath`, so any later re-save creates a *new* file instead of updating the original.

### Instances

| Date | Area | Slice A (saved on time) | Slice B (lost) | Fix commit / files |
|---|---|---|---|---|
| 2026-05-14 | AI Search V2 — Sources Graph | Report sections | `v2GraphJson` (graph generated on-demand in Sources → Graph tab) | `useGraphAgent.ts` `persistAfterGraphReady()` + `aiAnalysisStore.ts` seed `lastSavedPath` on restore |
| _(add next instance here)_ | | | | |

### Detection signals
- User report uses words like "恢复后没了 / 每次重生成 / 重启就丢".
- The save call site is at "report/analysis complete" but the missing field is one that's *not* part of the core report.
- `git grep` for the missing field name shows: parser reads it ✓, store has it ✓, writer writes it ✓, **but the save call passes it as `null` or `undefined`** because the data isn't in scope yet.

### Prevention checklist
When adding a new state slice that needs to survive restore:
1. List every place this slice is **produced** (success callback, store mutation, agent event handler).
2. List every place a **save** is triggered.
3. For each (producer, save) pair: is the save AFTER the producer? If not — add a save call at the producer, OR move the save trigger downstream.
4. Restore path: when populating `searchSessionStore`/equivalent, also seed `autoSaveState.lastSavedPath` (or equivalent "existingPath" sentinel) so subsequent re-saves overwrite instead of creating a new file.
5. Round-trip test: write → close session → load from history → assert slice B is restored.

---

## 2. Streaming string append → store snapshot copy storm

### Symptom
- Memory grows unbounded (hundreds of MB → OOM) during a streaming LLM response.
- DevTools heap profiler shows growing string allocations referenced from the Zustand store snapshot chain.
- Symptoms scale with chunk count, not response size — fast streams blow up worse.

### Mechanism
1. UI subscribes to a Zustand store field that holds the in-progress streaming text.
2. Each delta event calls `set({ text: state.text + delta })`.
3. Zustand snapshots state on every `set` — selectors using `useStore(s => s.text)` re-render.
4. If other components hold prior snapshots (e.g. memoized selectors, devtools, time-travel middleware, refs that close over `getState()` results), each delta creates a **new full-length string** and prior snapshots retain old copies.
5. With N chunks of average size M, peak memory is O(N·M) instead of O(M); GC pauses make it feel worse.

### Instances

| Date | Area | Fix approach | Files |
|---|---|---|---|
| _(user reported — fill in specifics: commit, files, date)_ | | | |
| 2026-05-14 | (placeholder — current pattern) | | |

### Detection signals
- "Plugin uses 1.5GB after a long chat" / "Obsidian freezes during streaming".
- Profile heap during a streaming run: snapshot count grows with chunks.
- Search code for `set({ X: state.X + delta })` or `useStore((s) => s.streamingText)` patterns.

### Prevention checklist
For any streaming text accumulation:
1. **Buffer outside the store**: hold the in-progress string in a `useRef<string>` or module-level buffer.
2. **Throttle the commit**: only `set()` the store at e.g. 60fps via `requestAnimationFrame`, not per delta.
3. **Commit completion separately**: on stream end, do the final `set()` once with the full text.
4. Don't memoize selectors over the streaming field unless absolutely necessary; subscribe directly via `useStore(s => s.text)` only in the leaf component that renders it.
5. Avoid `useStore.subscribe` callbacks that retain `previousState` across deltas.

---

## 3. Git-diff anchoring on framework symptoms — wrong first step

### Symptom (of the *debugging process*, not the code)
- UI from a 3rd-party library is visibly broken: layout collapsed into a strip, drag/click dead, components flat or unstyled, mermaid blocks invisible, etc.
- Debugger opens git status, sees a few files in that area were recently modified, and burns 10–30 min reading those diffs and adjacent code.
- Eventually greps the bundled output for the library's known CSS class / symbol → finds it missing → fix is 1–2 lines in a config or import file, **completely unrelated to the recently-modified files**.

### Mechanism
- Recently-changed files in `git status` create cognitive anchoring — they "look fresh" so they feel causal.
- But "core rendering of library X is broken" is almost always a **missing framework asset** (CSS, JS, web font, web component definition), not a business-code regression.
- The actual culprit is often a commit from days/weeks ago that touched a config file far from the failing UI — outside the current diff window.

### Instances

| Date | Symptom | Time wasted before correct grep | Actual root cause | Files we read that turned out irrelevant |
|---|---|---|---|---|
| 2026-05-14 | React Flow Sources Graph: 超长横条 + 不能拖动 | ~10 min reading layout/component diffs | `@xyflow/react/dist/base.css` import removed in c847f0d (22 days earlier, during a theme refactor) — `.react-flow__node` rules missing from `styles.css` bundle | `MultiLensGraph.tsx`, `useLensLayout.ts`, `topology-layout.ts`, `bridge-layout.ts`, `timeline-layout.ts`, `V2SourcesView.tsx`, `useGraphAgent.ts` |
| _(add next instance here)_ | | | | |

### Detection signals
- Symptom matches a textbook "framework not loaded" presentation:
  - React Flow nodes flat / stretched → check `@xyflow/react/dist/base.css`.
  - Mermaid blocks invisible → check mermaid CSS / init call.
  - Shiki code blocks unstyled → check theme JSON load.
  - Radix popovers misaligned → check `@radix-ui` CSS reset.
  - Tailwind classes don't apply → check tailwind build output + class names in bundle.
- The recent diff doesn't obviously touch the affected feature, but you're staring at it anyway because it's the most recent state change.

### Prevention checklist
**Before opening git status / git log:**
1. Name the framework that owns the broken UI. (React Flow? Mermaid? Shiki?)
2. Recall or look up: what assets does that framework REQUIRE to render? (Usually documented as "import this CSS / call this init").
3. `grep -c "<known-class-or-symbol>" <bundle-file>` — should return >0. If 0, you have your bug.
4. Only after framework assets are confirmed loaded, proceed to git diff / business code.

**Heuristic:** the bigger the visual breakage (whole feature blank, layout collapsed, all interactions dead), the more likely it's a missing framework asset, not a logic regression. Subtle bugs are in business code; "the whole thing is broken" is in config/imports.

---

## 3. Obsidian global bare-tag rule leaks through scoped reset

### Symptom
- A component looks fine in the static mock HTML / Playwright render with `styles.css` loaded, but **wrong inside Obsidian**.
- One state (hover / focus / active) looks visibly different in size, colour, or position from the default state — even though all instances have identical class names.
- User reports "this row looks taller / wider / has a halo / a glow", but the markup is identical between rows.
- DevTools Computed Styles shows a property value that doesn't come from any `--pk-*` token (e.g. `height: var(--input-height)`, `transform: translateY(...)`, `box-shadow: ... var(--background-modifier-...)`).

### Mechanism
1. Obsidian's `app.css` and themes set properties on bare tags inside `.modal` / `.modal-content`: `button { height: 32px; justify-content: center; }`, `button:hover { transform: translateY(-1px); box-shadow: ...; }`, etc. — often with `!important`.
2. Our `.peak-design-root` reset nulls **some** of these (`background`, `border`, `padding`, `margin`, `outline`) but not all.
3. Any property the reset doesn't explicitly null leaks through: it has either higher specificity (`.modal button` > `.peak-design-root button`) or the same specificity + later declaration order doesn't help once `!important` is in play on the Obsidian side.
4. Tailwind utilities with `important: true` cover the properties they generate (`bg`, `border`, `padding`, `text-*`), but if the component doesn't use a Tailwind utility for that property, nothing fights the Obsidian rule.
5. Result: visual mismatch only inside Obsidian. The static-page reproduction will look correct because there's no Obsidian CSS to leak.

### Instances

| Date | Symptom | Obsidian property leaking through | Fix |
|---|---|---|---|
| 2026-05-23 | Copilot picker — hovered Suggested Intent row visually taller than siblings; bg fills only a strip; row geometry varies between cards | `height: var(--input-height)` (32px) + `justify-content: center` on `.modal button`; combined with `transform: translateY(-1px)` on `button:hover` | Add `height: auto !important; min-height: 0 !important; max-height: none !important; justify-content: flex-start` to `.peak-design-root button` base rule, and `transform/box-shadow/filter/outline: none !important` to `:hover/:focus/:active/:focus-visible` (commits `7d37916`, `c57bf56`, `eaa82f9`) |
| _(add next instance here)_ | | | |

### Detection signals
- Component works perfectly in `/tmp/picker-test.html` (or any standalone page loading the built `styles.css`), broken in Obsidian.
- User shows DevTools computed styles that include `var(--input-...)`, `var(--background-modifier-...)`, `var(--focus-ring-color)` — those are Obsidian-theme variables, not ours.
- The visual symptom is **state-specific** (hover / focus / active looks different from default), not present in default state alone.
- Identical markup, identical Tailwind classes, but different visual result between rows / elements.

### Prevention checklist
**Before debugging "why does my hover look wrong":**
1. Reproduce in `/tmp/*.html` with `<link rel="stylesheet" href=".../styles.css">` and the same markup. If it renders correctly → it's an Obsidian leak. Skip steps 2–3 and jump to "find the leak".
2. (If not reproducible standalone) Look at the component for actual layout bugs first.
3. **Find the leak:** in Obsidian DevTools, select the broken element → Computed → search for non-`--pk-*` token references. Each one is a candidate.
4. **Fix:** add an explicit null with `!important` to `src/styles/obsidian-reset.css` for that property on the relevant pseudo-class (`:hover`, `:focus`, `:active`, `:focus-visible`).
5. Document the new property in `docs/70-engineering-notes/conventions/ui-design.md` §4.9 "Properties the reset must null" table.

**Critical:** plugin CSS doesn't hot-reload. After updating `styles.css`, the user must **disable + re-enable the plugin** (or fully quit Obsidian) — Cmd+R does NOT reload the plugin's bundled CSS. A "v1/v2/v3" marker in the UI is a cheap way to confirm the latest build is actually loaded before further debugging.

---

## 4. Radix portal subtree loses `--pk-*` design tokens

### Symptom
- A modal / popover / dropdown menu renders **transparent or with wrong colors** (you can see the page through the modal background).
- Buttons inside the modal show no background fill; text contrast looks broken; the modal "feels grayed out and unwritable" (user words).
- Same UI is fine inside the normal view tree (sidebar, chat shell, etc.). The breakage only happens for things that **portal** themselves out of the view tree.
- DevTools Computed Styles on the modal background shows `background: var(--pk-surface-overlay)` with **value: `<no value>`** — the variable is undefined.

### Mechanism
1. `peak-tokens.css` scopes every `--pk-*` design token to `.pktw-root` / `.peak-design-root` (and their `.theme-light` / `.theme-dark` variants). Per `docs/70-engineering-notes/conventions/obsidian-css-defense.md`, this scoping is deliberate — we do **not** pollute `:root`, otherwise our tokens would leak into Obsidian's own UI.
2. Our React tree mounts inside a container that carries `.peak-design-root` (set by `ChatView.onOpen()`, `ProjectListView.onOpen()`, etc.). All descendant components inherit the tokens via cascade.
3. Radix UI primitives (`@radix-ui/react-dialog`, `react-popover`, `react-dropdown-menu`, `react-tooltip`) **portal their `Content` element to `document.body`** by default. This is correct for stacking-context / overflow reasons, but it moves the content **out of the `.peak-design-root` subtree**.
4. The portal subtree now has only Obsidian's `body.theme-dark` / `body.theme-light` ancestors. None of the `--pk-*` rules match — every token-backed Tailwind utility (`bg-popover`, `text-foreground`, `border-border`, etc.) resolves to `var(<undefined>)` → no background → see-through modal.
5. `usePortalContainer()` can redirect the portal target (used for popout window support, see `e5189af`), but that only changes which **document** the portal lives in — the subtree is still a direct child of body, never a descendant of `.peak-design-root`.

### Instances

| Date | Component | Symptom | Fix |
|---|---|---|---|
| 2026-06-04 | `InputModal` (Create Project, Rename Project, Rename Conversation) | Modal background transparent, X button bleeds into title, button bg invisible, every text element low-contrast | Added `peak-design-root pktw-root` to className of `DialogContent`, `PopoverContent`, `DropdownMenuContent` in `src/ui/component/shared-ui/{dialog,popover,dropdown-menu}.tsx` |
| _(add next instance here)_ | | | |

### Detection signals
- "Modal / popup looks gray / faded / transparent / unstyled" — almost always this.
- Background appears to be just the page-dim overlay (semi-transparent black) with no opaque modal panel on top.
- DevTools: select the broken `[role="dialog"]` / `[role="menu"]` element → look up the DOM tree → it's a child of `body`, **not** a descendant of any `.peak-design-root`.
- Token-backed CSS variables show `<no value>` / `<invalid>` in Computed view.

### Prevention checklist
**Any new component that uses a Radix Portal** (`Dialog`, `Popover`, `DropdownMenu`, `Tooltip`, `HoverCard`, `ContextMenu`, …):
1. Find the `Content` element (the one inside `*.Portal`).
2. Add `'peak-design-root pktw-root'` to its `className`. Same selector strings as the view-mount wrappers — anywhere these classes go, the tokens follow.
3. If you build a new shared-ui primitive that wraps a Radix portal, **bake the classes into the primitive** so consumers can't forget. Don't rely on per-call sites to remember.
4. Verify with `bg-popover` rendering opaque, and DevTools showing `--pk-surface-overlay: #2a2a3c` (dark) / `#ffffff` (light) resolved on the portal root.

**Do NOT** "fix" this by promoting tokens to `:root` in `peak-tokens.css`. That re-introduces the Obsidian-pollution problem and undoes the scoping rule documented in `obsidian-css-defense.md`.

---

## 5. UI shell registered after long awaits in `onload` — one hang = plugin invisible

### Symptom
- User: "chat icon 消失了 / 打不开 search modal / 命令搜不到 / settings tab 没了"
- 插件在 Obsidian 里显示"已启用"，但 ribbon、command palette、settings tab 全部不出现
- console 里没有明显 error，最后一条 log 停在某个 sqlite / init / 长 await 之前
- 每次给 `onload` 加东西之后偶发；`git log --grep="fix(boot"` 显示这个模式重复过很多次

### Mechanism
1. `Plugin.onload()` 是一条巨长的串行 await 链（30+ 步）：settings → templates → aiServiceManager → **sqlite → search → indexer → sessionContext** → ambient → …
2. `viewManager.init()`（ribbon 注册）+ `addCommand` 循环 + `addSettingTab` 排在**中后段**，紧跟在 `await initSqlite()` 之后
3. 只要前面任何一个 await hang 或抛出：
   - **Hang**：onload 永远不 resolve，UI 注册那步永远走不到
   - **Throw 未捕获**：同上
   - **Throw 被 catch 但 catch 后跳过 UI 注册**：更隐蔽
4. Obsidian 的插件管理器只根据 `load()` 是否 resolve 判断状态。所以插件"已启用"但界面全空
5. 每次给 init 链加新的东西（Ambient / debug-trace / context pipeline / hub runtime / MCP connect / ...），都可能触发一次同类事故

### Instances

| Date | 触发 change | Hang / throw 点 | Fix |
|---|---|---|---|
| 2026-07-06 | Debug trace 引入（`AppRuntimeRegistry.setDebugTracePort` 严格模式 + 多处新增 await）+ 相关 refactor 后触发 `initSqlite` 链上静默卡住 | `await this.initSqlite()` 挂住；下游 `viewManager.init()` 永远没跑到，ribbon icon 缺失 | `main.ts` reshape：ViewManager + registerCoreEvents + 所有 addCommand + addSettingTab + capabilityRegistry + debug-trace recorder 全部移到 `initSqlite` 之前；仅真依赖 sqlite/SessionContext 的（Ambient runtime）留在 initSqlite 之后 |
| 2026-XX-XX | `8b101962` — DocumentLoaderManager init-order cycle on plugin re-enable | 构造期循环 → onload throw | (历史修复，同类模式) |
| 2026-XX-XX | `ce380273` — morning-briefing modal missing ServiceProvider | 早期开的 modal 拿不到 context throw | (历史修复，同类模式) |
| _(add next instance here)_ | | | |

### Detection signals
- 用户描述里出现"chat icon 不见了 / 命令不见了 / settings tab 消失 / modal 打不开"，且 devtools console 里插件加载没报错
- Console 里能看到 `Dev Tools initialized` / `sqliteStoreManager` 之类的早期 log，但**没有** `[Peak Assistant] SQLite and search services initialized` 或等价的收尾 log
- `git log --grep="fix(boot)\|fix(onload)\|fix(morning-briefing)"` 已经有多条 → 这就是重复模式的直接证据
- 症状总是紧跟在给 `onload` 加东西的 commit 之后

### Prevention checklist
**核心原则：UI shell 无条件先注册，backend 慢或失败都不能拖累它。**

1. `viewManager.init()`（ribbon + view types）+ `registerCoreEvents` + 所有 `addCommand` + `addSettingTab` + `capabilityRegistry` 排在**任何** `await initSqlite / initSearch / initIndex / initSessionContext` **之前**
2. Backend 依赖 sqlite / search 的 runtime（Ambient、部分 Copilot 功能）可以留在后面，但它们的 UI 入口（settings 里的 tab、command）**必须已经注册好**，被调用时优雅降级（`"still initialising"` 提示）
3. **加 onload 步骤前先问自己**："如果这一步 hang 30 秒，用户还能用插件吗？" 如果答案是 No → 这步应该 non-blocking（fire-and-forget）或放在 UI shell 之后
4. 涉及 `AppRuntimeRegistry.set*(...)`（严格模式，重复 set 会抛）的注册：调用点必须在 `onunload` 有对应 `clear*` + `try/catch`；同一 session 里 hot-reload 才不会因为残留而 throw
5. 定期扫一眼 `git log --grep="fix(boot"`：每多一条历史修复都是这个模式还没根治的证据

---

## 6. Heavy loader called for a lightweight check — parse cost eats the fast path

### Symptom
- "为什么 X 这么慢" 里 X 是**快速检查**类操作：is-dirty / has-changed / diff-since-last-index / cache-invalidate
- 单文件耗时远高于纯 I/O + hash 的合理成本（几十 ms vs. 1 ms）
- Diagnostic / profiler 显示时间落在 markdown 解析 / TextRank / keyword 抽取 / summary 构建里，而调用点其实只用了返回对象的 1-2 个字段
- 总耗时 = O(候选文件数 × 完整解析成本)，随 vault 大小线性放大

### Mechanism
1. 存在一个"完整加载"入口（`DocumentLoaderManager.readByPath` / `loader.readFile`），它产出**完整 Document** — 包含 readText + remark parse + TextRank + keyword bundle + LLM stub
2. 另一个"只需要一个 field"的调用者（scan / dirty-check / cache invalidation / mtime-vs-hash 比对）图省事，直接调 readByPath 拿这一个字段
3. 每次调用都白跑一遍完整解析。对 markdown/txt，实际需要的 `contentHash` 就是 `hashString(readText())`，直接算只要 1-2ms；readByPath 42ms/file
4. 对 canvas / PDF / DOCX / Image：hash 是从**解析后**的内容算的（例如 canvas 是 join 所有 node 的 text），必须走 heavy path。这类文件在笔记 vault 里占比 <1%，被"总是走 heavy"的选择拖累的是 markdown 主体
5. 结果：scan 阶段 1319 file × 42ms = 56s；改成 fast-path markdown/txt 后 1319 × 0.4ms = 0.5s（**82× 提速**）

### Instances

| Date | Area | Heavy method misused | What was actually needed | Fix |
|---|---|---|---|---|
| 2026-07-06 | `indexInitializer.scanForIndexChanges → processMaybeIndexBatch` | `DocumentLoaderManager.readByPath` (readText + remark parse + TextRank + keyword bundle + summary stub) | 只需要 `contentHash = hashString(readText(file), 8)` — markdown/txt 的 loader 就是这么算的 | `indexInitializer.ts:processMaybeIndexBatch` 加 fast path：`docItem.type === 'markdown' \|\| 'txt'` 时用 `vault.readText + hashString`；canvas/PDF/DOCX 等仍走 readByPath。同时加 `[scan-diag]` 一行输出让下次一眼定位（fast=/slow= 分开、top-10 slowest 文件） |
| _(add next instance here)_ | | | | |

### Detection signals
- 用户描述里出现"scan 略长 / index 检查慢 / 每次启动要等 X 秒"
- 单文件耗时远超预期：markdown 文件的 read + hash 应该 <5ms/file，如果日志显示 30-100ms/file，几乎肯定是这个坑
- Profile 火焰图里 "parse" / "TextRank" / "keyword" 帧出现在**非索引路径**的调用栈里
- 调用点用 `readByPath` 后只解构一两个字段（尤其是 hash / size / mtime / path），其他字段都不用

### Prevention checklist

**核心原则：field-level 操作应该有 field-level API，别为一个字段跑一整套解析。**

1. **写"只用一个 field"的调用点前**：先看这个 field 是怎么产生的 —— 是解析副产品（例如 title、tags、textrank），还是 loader 直接可算（例如 hash of raw content、size、mtime）？
2. **field 是直接可算的（hash / size / mtime）**：在 manager 上暴露一个 lightweight 方法（例如 `computeContentHash(path)`），不要复用 heavy loader
3. **加诊断 log**：per-file 耗时 + 总时间 + fast/slow 路径分桶。如果 avg > 5ms 而 field 又是"简单可算"的，就是这个坑
4. **必须走 heavy path 的少数格式**（binary、需要解析才能算 hash）：保留 fallback 就好，不要为了一致性把所有格式都拖到 heavy path
5. **命名警觉**：任何叫 `readByPath` / `loadFull` / `parseDocument` / `getDocument` 的方法，出现在快速检查路径上都要打问号

---

## 7. Scoped reset over-nulls a property we also use for our own layout

### Symptom
- Element is positioned correctly at rest, but **jumps / shifts / stretches on hover / focus / active** — sometimes with a size change, sometimes a position change.
- The state that breaks matches a pseudo-class the reset targets (`:hover` / `:focus` / `:active` / `:focus-visible`).
- DevTools Computed Styles on the broken state shows the layout property forced to `none` / `0` / `auto` by a `.peak-design-root button:hover { ... !important }` rule.
- Attempting the same layout technique on non-`<button>` elements (e.g. wrap in `<div>`) works fine, which confirms the reset is the source.

### Mechanism
1. `obsidian-reset.css` defensively nulls geometry-changing properties on **all** bare tags inside `.peak-design-root` (see pattern #3): `transform: none !important; box-shadow: none !important; scale: none !important; translate: none !important;` on `:hover / :focus / :active / :focus-visible`.
2. This is correct as a defense against Obsidian themes attaching `transform: translateY(-1px)` etc.
3. **But we also legitimately use `transform` for centering** (`top: 50%; transform: translateY(-50%)`), micro-nudges, rotations, etc.
4. At rest, our inline / Tailwind `transform` applies normally.
5. On hover/focus, the reset's `transform: none !important` fires and wipes our own transform → the element snaps to the un-transformed position (in the centering case, from visual center to top:50% anchor, which reads as "jumped down").
6. This only shows up on **interactive states** and only for **bare tags the reset targets** (`button`, and any others we extend the reset to).

### Instances

| Date | Element | Layout property clobbered | Original technique | Fix |
|---|---|---|---|---|
| 2026-07-08 | Vault Intelligence pill in Quick Search tab bar (`SearchModal.tsx:737`) | `transform: translateY(-50%)` on hover, reset by `.peak-design-root button:hover { transform: none !important }` | Absolute-positioned `<button>` centered with `top:50% + translateY(-50%)`; hovered button jumped down to top:50% anchor | Wrap in absolute `<div>` `top-0 bottom-0 flex items-center`, let the `<button>` inside flow normally at natural height — centering no longer relies on `transform` |
| _(add next instance here)_ | | | | |

### Detection signals
- User words: "hover 上去会向下浮动 / 抖动 / 位置错位 / 变大变小 only on hover".
- Reproduce: in Obsidian DevTools, hover the element, watch Computed Styles for `transform` (or `scale` / `translate` / `box-shadow`) flipping to `none` from your intended value with a strikethrough on your rule and no strikethrough on the reset rule.
- The reset in `src/styles/obsidian-reset.css` lists the property that "broke" as `X: none !important` on the matching pseudo-class.

### Prevention checklist

**Core principle: don't lean on `transform` (or any other reset-nulled property) to hold layout on a bare tag inside `.peak-design-root`. Use techniques that survive `transform: none !important`.**

1. **Centering:** don't use `top:50% + translateY(-50%)` on a `<button>` (or any bare tag the reset touches). Use one of:
   - Parent `flex items-center` + child in normal flow.
   - Absolute wrapper `top-0 bottom-0 flex items-center` around the button (button itself stays natural height).
   - `top: <half of container - half of element>px` if you know both heights exactly.
2. **Nudges (`translateY(-1px)` for optical alignment):** move them to the outer non-button wrapper, or use `margin-top: -1px` instead.
3. **Rotations / scales tied to state:** if `hover:rotate-90` or `hover:scale-105` is essential, apply on a non-button wrapper, or extend the reset to allow that specific case (unusual — think twice).
4. **Before adding a new property to the reset's null list**, `grep` the codebase for `transform:`, `translate`, `scale(`, `box-shadow:` on `<button>` — anything relying on that property for layout will break silently on hover.
5. **When user reports "hover 时按钮抖 / 移位"**, check this file FIRST before debugging the component — the reset is almost always the cause.

**Cross-ref:** pattern #3 is the outbound leak (Obsidian's rule wins); this pattern is the inbound clobber (our defense wins over our own layout). Fix families are inverse: #3 → add !important null; #7 → stop relying on the nulled property.

---

## How to consult this doc

- Bug feels familiar? `grep` this file for the symptom phrase before re-deriving the root cause.
- New bug fixed today? Decide: existing pattern (append instance) vs new pattern (new section).
- Memory leaks from DOM/listener cleanup go in `MEMORY_LEAK_AUDIT.md`, not here. This doc is for *logical* recurrences.
