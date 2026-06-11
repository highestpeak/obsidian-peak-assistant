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
5. Document the new property in `docs/conventions/ui-design.md` §4.9 "Properties the reset must null" table.

**Critical:** plugin CSS doesn't hot-reload. After updating `styles.css`, the user must **disable + re-enable the plugin** (or fully quit Obsidian) — Cmd+R does NOT reload the plugin's bundled CSS. A "v1/v2/v3" marker in the UI is a cheap way to confirm the latest build is actually loaded before further debugging.

---

## 4. Radix portal subtree loses `--pk-*` design tokens

### Symptom
- A modal / popover / dropdown menu renders **transparent or with wrong colors** (you can see the page through the modal background).
- Buttons inside the modal show no background fill; text contrast looks broken; the modal "feels grayed out and unwritable" (user words).
- Same UI is fine inside the normal view tree (sidebar, chat shell, etc.). The breakage only happens for things that **portal** themselves out of the view tree.
- DevTools Computed Styles on the modal background shows `background: var(--pk-surface-overlay)` with **value: `<no value>`** — the variable is undefined.

### Mechanism
1. `peak-tokens.css` scopes every `--pk-*` design token to `.pktw-root` / `.peak-design-root` (and their `.theme-light` / `.theme-dark` variants). Per `docs/conventions/obsidian-css-defense.md`, this scoping is deliberate — we do **not** pollute `:root`, otherwise our tokens would leak into Obsidian's own UI.
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

## How to consult this doc

- Bug feels familiar? `grep` this file for the symptom phrase before re-deriving the root cause.
- New bug fixed today? Decide: existing pattern (append instance) vs new pattern (new section).
- Memory leaks from DOM/listener cleanup go in `MEMORY_LEAK_AUDIT.md`, not here. This doc is for *logical* recurrences.
