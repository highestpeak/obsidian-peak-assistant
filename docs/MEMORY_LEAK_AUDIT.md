# Memory Leak Audit: Detached DOM & Script Accumulation

This document lists potential leak points and fixes for the Obsidian plugin lifecycle (especially `onunload`).

---

## 1. Global / document / window listeners

### 1.1 Already correct (cleanup in useEffect or unload)

| Location | Listener | Cleanup |
|----------|----------|---------|
| `GraphMainCanvas.tsx` | canvas/window pointer + click | useEffect return: removeEventListener |
| `ProgressBarSlider.tsx` | document pointermove/pointerup | useEffect return |
| `ProgressBarSelector.tsx` | document pointermove/pointerup | useEffect return |
| `SourcesSection.tsx` | document keydown | useEffect return |
| `KnowledgeGraphSection.tsx` | document keydown | useEffect return |
| `StepsDisplay.tsx` | scrollTarget scroll | useEffect return |
| `SectionExtraChatModal.tsx` | window keydown | useEffect return |
| `ChatInputArea.tsx` | window keydown (capture) | useEffect return |
| `NavigableMenu.tsx` | window resize, document keydown | useEffect return |
| `tab-VaultSearch.tsx` | window keydown | useEffect return |
| `usePopupPosition.ts` | window resize/scroll | useEffect return |
| `useGraphSettings.ts` | window resize | useEffect return |
| `useGraphContextMenu.ts` | document pointerdown | useEffect return |
| `PromptInput.tsx` | form/document dragover, drop | useEffect return |
| `InputModal.ts` | input/keydown on inputEl | onClose: removeEventListener |
| `BuildUserProfileProgressModal.ts` | cancelBtn click | onClose: removeEventListener |
| `StreamdownIsolated.tsx` | shadow click | useEffect return |
| `useAutoScroll.ts` | element scroll | useEffect return |
| `GraphSection.tsx` (inspector) | document keydown | useEffect return |

### 1.2 Obsidian API (prefer registerEvent)

| Location | Usage | Status |
|----------|--------|--------|
| `Register.ts` | `plugin.registerEvent(app.workspace.on(...))` | OK – auto-removed on unload |
| `indexUpdater.ts` | `plugin.registerEvent(rModify)` etc. | OK; **fix**: `dispose()` now also calls `vault.offref` / `workspace.offref` so refs are released before plugin teardown |
| `MessageHistoryView.ts` | `this.registerEvent(this.app.workspace.on('layout-change', ...))` | OK – View's registerEvent is cleaned by Obsidian when view is destroyed |
| `EventBus` | `app.workspace.on`; stored in `subscribers` | OK – `destroyInstance()` → `offAll()` in onunload |

### 1.4 Window globals (DevTools)

- **AppContext.handleDevToolsSettingChange(true)** assigns `window.testGraphTools`, `window.indexDocument`, `window.cleanupGraphTable`. When disabled (or on unload via `clearForUnload()` → `handleDevToolsSettingChange(false)`), all three must be deleted; **fix**: previously `indexDocument` was not deleted, so it held a closure over AppContext and settings. Now all three are deleted in the `else` branch.

### 1.5 Mermaid / window.load

- **Issue**: Mermaid (bundled) registers `window.addEventListener('load', contentLoaded)`. Current onunload only removes listeners whose `toString()` includes `"Mermaid failed to initialize"`, so `contentLoaded` may never be removed.
- **Recommendation**: In onunload, try to remove any `load` listener that looks like Mermaid (e.g. by matching a distinctive string in the listener body), or document that Mermaid is loaded dynamically and avoid keeping a long-lived reference to it.

---

## 2. Escaped async / timers

### 2.1 Fixed in this audit

| Location | Issue | Fix |
|----------|--------|-----|
| **Register.ts** | `setTimeout(..., 100)` in `handleConversationFileOpen` held `plugin`, `viewManager`, `eventBus`; if plugin unloaded before 100ms, callback could still run | Track timeout IDs in `pendingConversationTimeouts`; in onunload call `clearPendingConversationTimeouts()` to `clearTimeout` all and clear the set. |

### 2.2 Already cleaned (useEffect or service unload)

| Location | Timer | Cleanup |
|----------|--------|---------|
| `indexUpdater.ts` | `window.setTimeout` (debounce) | `dispose()` clears timer |
| `format-utils.ts` | LRUCache cleanupInterval | `clearFormatUtilsCaches()` in onunload → cache.clear() → clearInterval |
| `useAIAnalysis.ts` | summaryFlushTimerRef | clearTimeout in useEffect / before new timer |
| `useGraphRenderJoin.ts` | settleRef, streamingOffTimerRef, streamingThrottleTimerRef | clearTimeout in cleanup |
| `useGraphEngine.ts` | streamingOffTimerRef, streamingThrottleTimerRef | clearTimeout in cleanup |
| `IntelligenceFrame.tsx` | setInterval | useEffect return: clearInterval |
| `hover-menu-manager.tsx` | closeTimerRef | clearTimeout in effect cleanup |
| `SourcesSection.tsx` | setInterval (animation) | useEffect return: clearInterval |
| Other React components | Various setTimeouts for copy feedback, etc. | useEffect return or ref cleanup |

### 2.3 View initial-render RAF

- **ChatView, MessageHistoryView, ProjectListView** each call `requestAnimationFrame(() => this.render())` in `onOpen()`. The callback holds `this` (the view). If the user closes the view before the next frame, the RAF is still queued and will run later, retaining the view for at least one frame. **Fix**: store the RAF id in `openRafId` and call `cancelAnimationFrame(this.openRafId)` in `onClose()`.

### 2.4 Low risk (one-shot or short delay)

- Many `setTimeout(..., 100)` or 2s copy feedback in UI: component unmount clears refs; if plugin unloads, leaves detach first so components unmount. No central tracking needed but be aware of any that close over plugin/viewManager.

---

## 3. DOM / long-lived references

### 3.1 Chat view buttons

- **Register.ts**: Buttons created in `addChatViewButton` with `button.addEventListener('click', ...)` closing over `plugin`, `viewManager`, `eventBus`, `file`, etc.
- **Fix**: `removeAllChatViewButtons()` in onunload removes all `.peak-chat-view-button-container` from DOM so listeners and closures can be GC'd. **Plus** `clearPendingConversationTimeouts()` so no pending timeout re-adds a button after unload.

### 3.2 Ribbon icon

- **ViewManager**: `addRibbonIcon` callback closes over `this.viewSwicthConsistenter`. Icon element is now stored in `ribbonIconEl` and removed in `unload()` so the click listener is released.

### 3.3 Hover menu globals

- **hover-menu-manager.tsx**: `installHoverMenuGlobals()` attaches `closeAllMenusExcept`, `registerMenu`, `unregisterMenu` to `window`. Uninstall (called in onunload) runs all close fns, clears the Set, and deletes the window properties so no refs to plugin closures remain.

### 3.4 React/DOM

- Graph viz, modals, etc.: React tree is under plugin views; when `viewManager.unload()` detaches leaves, views (and their DOM) are destroyed. Ensure any `document.body` portals (e.g. GraphToolsPanel, PromptInputBody) are unmounted when the parent view is detached.

---

## 4. Third-party instances

### 4.1 CodeMirror (@uiw/react-codemirror)

- Used in `PromptInputBody.tsx`, `codemirror-input.tsx`, `SearchModal.tsx`. React-owned; unmounting the component should destroy the editor. No explicit `.destroy()` in plugin code; if the library holds global refs, consider calling editor destroy on unmount.

### 4.2 D3 zoom / simulation

- **useGraphSimulation.ts**: Zoom behavior attached to canvas with `.on('zoom', callback)`. Callback closed over `setZoomLevel`, `scheduleDrawRef`, etc.
- **Fix**: In useEffect cleanup, call `zoom.on('zoom', null)` and set `zoomRef.current = null` so the behavior and callback can be GC'd.
- Simulation: already `simulation.stop()` and `simulationRef.current = null` in cleanup.

### 4.3 pdfjs-dist

- **PdfDocumentLoader**: Calls `loadingTask.destroy()` and `page.cleanup()` where applicable. No change needed.

### 4.4 Echarts / other

- No Echarts or other heavy chart libs with explicit destroy in the current codebase.

---

## 5. Obsidian API usage

### 5.1 registerEvent

- **Register.ts**: All `app.workspace.on(...)` are passed to `plugin.registerEvent(...)` → auto-removed on plugin unload.
- **indexUpdater.ts**: Vault/workspace refs are also passed to `plugin.registerEvent`. **Fix**: `dispose()` now explicitly calls `vault.offref` / `workspace.offref` for all stored refs and clears the arrays so listeners are released as soon as `dispose()` runs.

### 5.2 registerInterval / registerDomEvent

- Not used in the codebase. Prefer them for any future timers or DOM events that must be tied to plugin lifecycle.

---

## 6. Summary of code changes made

1. **Register.ts**
   - Added `pendingConversationTimeouts: Set<ReturnType<typeof setTimeout>>`.
   - In `handleConversationFileOpen`, store the timeout id in the set and remove it in the callback.
   - Exported `clearPendingConversationTimeouts()` that clears all timeouts and the set.

2. **main.ts**
   - Import and call `clearPendingConversationTimeouts()` at the start of onunload (before viewManager.unload and removeAllChatViewButtons).

3. **useGraphSimulation.ts**
   - In the mount effect cleanup: call `zoom.on('zoom', null)` and set `zoomRef.current = null` so the D3 zoom behavior and its callback can be GC'd.

4. **indexUpdater.ts**
   - In `dispose()`, call `vault.offref` / `workspace.offref` for every ref in `vaultRefs` and `workspaceRefs`, then clear both arrays, so vault/workspace listeners are removed even if plugin teardown order varies.

5. **AppContext.ts**
   - In `handleDevToolsSettingChange(false)`, also `delete (window as any).indexDocument`. Previously only `testGraphTools` and `cleanupGraphTable` were removed; `indexDocument` is a function that closes over `this` (AppContext) and `this.settings`, so it could retain the old context after unload.

6. **ChatView, MessageHistoryView, ProjectListView**
   - Store the `requestAnimationFrame` id from the initial render delay (`openRafId`) and call `cancelAnimationFrame(this.openRafId)` in `onClose()`. Otherwise a queued RAF callback can hold the view instance (and its closures) until the next frame after the view is closed.

---

## 7. Recommendations

- Prefer **plugin.registerEvent(ref)** for any `app.workspace.on` / `app.vault.on` so Obsidian removes them on unload.
- For **setTimeout/setInterval** that close over plugin or long-lived state, either:
  - Store the id and clear it in a dedicated cleanup (e.g. `clearPendingConversationTimeouts`), or
  - Use a short-lived “cancelled” flag that the callback checks before doing work.
- Avoid attaching listeners to **window/document** outside React; if necessary, register in one place and have onunload call a single “uninstall” that removes them all.
- After unload, **null out** plugin-held references (e.g. `this.viewManager = null`) only if you need to break cycles; Obsidian will tear down the plugin instance, so this is optional but can help with script retention in edge cases.
