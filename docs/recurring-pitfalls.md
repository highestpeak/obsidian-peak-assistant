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

## How to consult this doc

- Bug feels familiar? `grep` this file for the symptom phrase before re-deriving the root cause.
- New bug fixed today? Decide: existing pattern (append instance) vs new pattern (new section).
- Memory leaks from DOM/listener cleanup go in `MEMORY_LEAK_AUDIT.md`, not here. This doc is for *logical* recurrences.
