# V2 AI Analysis Persistence Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the entire V2 AI analysis save/restore pipeline so clicking "recent AI analysis" correctly restores Process, Report, Sources, and Graph views.

**Architecture:** Five independent bugs in the V2 persistence chain: (1) auto-save fires before sections finish generating, (2) graph data saved from wrong store, (3) graph restored to wrong store, (4) Process view gets no data on restore, (5) graph expand opens split pane instead of new window. Each task is independent and can be done in any order.

**Tech Stack:** Zustand stores, React hooks, Obsidian API

---

### Task 1: Fix auto-save timing — wait for V2 sections to complete

The auto-save `useEffect` fires when `analysisCompleted` becomes true, but in V2 mode the agent `complete` event fires BEFORE `ReportOrchestrator` finishes generating sections. Result: `v2ReportSections` is empty at save time → no `## N. Title` in the saved markdown → Report tab blank on restore.

**Files:**
- Modify: `src/ui/view/quick-search/tab-AISearch.tsx:565-574`

- [ ] **Step 1: Add V2 completion selector**

Before the auto-save `useEffect` (around line 560), add a selector that tracks whether V2 generation is fully done:

```ts
const v2FullyDone = useSearchSessionStore(s =>
	!s.v2Active || (
		s.v2ReportComplete &&
		s.v2PlanSections.length > 0 &&
		s.v2PlanSections.every(sec => sec.status === 'done') &&
		!s.v2SummaryStreaming
	)
);
```

- [ ] **Step 2: Gate auto-save on V2 completion**

Modify the auto-save `useEffect` at `tab-AISearch.tsx:565-574`. Add `v2FullyDone` to the guard and dependency array:

```ts
useEffect(() => {
	if (!analysisCompleted) return;
	if (!v2FullyDone) return;          // ← NEW: wait for V2 sections + summary
	if (restoredFromHistory) return;
	const autoSaveEnabled = AppContext.getInstance().settings.search.aiAnalysisAutoSaveEnabled ?? true;
	if (!autoSaveEnabled) return;
	if (error) return;
	if (!sessionId) return;

	handleAutoSave();
}, [analysisCompleted, v2FullyDone, restoredFromHistory, error, sessionId, handleAutoSave]);
//                     ^^^^^^^^^^^ ← added
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/tab-AISearch.tsx
git commit -m "fix: delay V2 auto-save until all sections + summary are ready"
```

---

### Task 2: Fix graph save — read from correct store

During vaultFull analysis, `SourcesGraph` stores graph data in `useGraphAgentStore`. But `buildV2AnalysisSnapshot` calls `exportGraphJson()` which reads from `useAIGraphStore` — a different store used only by the standalone `aiGraph` analysis mode. Result: `v2GraphJson` is always `null` for vaultFull analyses.

**Files:**
- Modify: `src/ui/view/quick-search/store/searchSessionStore.ts:886-897`

- [ ] **Step 1: Import graphAgentStore**

At the top of `searchSessionStore.ts`, add the import:

```ts
import { useGraphAgentStore } from './graphAgentStore';
```

- [ ] **Step 2: Add graphAgentStore fallback in buildV2AnalysisSnapshot**

In `buildV2AnalysisSnapshot` at `searchSessionStore.ts:893`, change the `v2GraphJson` line from:

```ts
v2GraphJson: exportGraphJson(),
```

to:

```ts
v2GraphJson: exportGraphJson() ?? (() => {
	const gStore = useGraphAgentStore.getState();
	if (!gStore.graphData) return null;
	return JSON.stringify({
		lenses: { [gStore.graphData.activeLens ?? 'topology']: gStore.graphData },
		source: 'graphAgent',
		generatedAt: new Date().toISOString(),
	});
})(),
```

Wait — `graphData` is `LensGraphData` which doesn't have `activeLens`. The lens type isn't stored in graphAgentStore. Default to `'topology'`:

```ts
v2GraphJson: exportGraphJson() ?? (() => {
	const gStore = useGraphAgentStore.getState();
	if (!gStore.graphData) return null;
	return JSON.stringify({
		lenses: { topology: gStore.graphData },
		source: 'graphAgent',
		generatedAt: new Date().toISOString(),
	});
})(),
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/store/searchSessionStore.ts
git commit -m "fix: save Sources graph from graphAgentStore when aiGraphStore is empty"
```

---

### Task 3: Fix graph restore — restore to graphAgentStore with correct cache key

On restore, `bridgeSnapshotToSearchSessionStore` puts graph data into `useAIGraphStore`, but `SourcesGraph` reads from `useGraphAgentStore` via `useGraphAgent` hook. The hook checks `store.cacheKey === key && store.graphData != null` — since neither `cacheKey` nor `graphData` are set on `graphAgentStore`, the graph shows a "Generate" button instead of restored data.

**Files:**
- Modify: `src/ui/view/quick-search/store/aiAnalysisStore.ts:798-812` (the V2 graph restore block in `bridgeSnapshotToSearchSessionStore`)

- [ ] **Step 1: Import graphAgentStore**

At the top of `aiAnalysisStore.ts`, add:

```ts
import { useGraphAgentStore } from './graphAgentStore';
```

- [ ] **Step 2: Restore graph to graphAgentStore instead of aiGraphStore**

In `bridgeSnapshotToSearchSessionStore`, replace the graph restore block (currently restoring to `useAIGraphStore`) with:

```ts
// Restore graph data if present
if (snapshot.v2GraphJson) {
	try {
		const graphPayload = JSON.parse(snapshot.v2GraphJson);
		if (graphPayload.lenses) {
			const lensKeys = Object.keys(graphPayload.lenses);
			if (lensKeys.length > 0) {
				const graphData = graphPayload.lenses[lensKeys[0]];

				// Restore to graphAgentStore (used by SourcesGraph → useGraphAgent)
				const sourcePaths = (snapshot.sources ?? []).map(s => s.path).sort().join('|');
				useGraphAgentStore.getState().setCacheKey(sourcePaths);
				useGraphAgentStore.getState().setGraphData(graphData);

				// Also restore to aiGraphStore (used by standalone graph view)
				useAIGraphStore.setState({
					graphData,
					activeLens: lensKeys[0] as any,
				});
			}
		}
	} catch { /* ignore malformed graph JSON */ }
}
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/store/aiAnalysisStore.ts
git commit -m "fix: restore graph to graphAgentStore with correct cacheKey for SourcesGraph"
```

---

### Task 4: Restore Process view from v2ProcessLog

On restore, `v2Timeline` and `v2Steps` are empty arrays. The Process view (`V2ProcessView`) renders a blank body. The fix is to reconstruct `V2ToolStep[]` from the saved `v2ProcessLog` strings (format: `"ICON DISPLAY_NAME — SUMMARY — DURs"`).

**Files:**
- Modify: `src/ui/view/quick-search/store/aiAnalysisStore.ts` (in `bridgeSnapshotToSearchSessionStore`, the V2 setState block)

- [ ] **Step 1: Add process log parser function**

Add this function above `bridgeSnapshotToSearchSessionStore`:

```ts
/**
 * Reconstruct V2ToolStep[] + V2TimelineItem[] from saved process log strings.
 * Format: "ICON DISPLAY_NAME — SUMMARY — DURs" or "ICON DISPLAY_NAME — DURs" or "ICON DISPLAY_NAME"
 */
function reconstructProcessTimeline(
	processLog: string[],
	startedAt: number,
): { steps: import('../types/search-steps').V2ToolStep[]; timeline: import('../types/search-steps').V2TimelineItem[] } {
	const steps: import('../types/search-steps').V2ToolStep[] = [];
	const timeline: import('../types/search-steps').V2TimelineItem[] = [];

	for (let i = 0; i < processLog.length; i++) {
		const line = processLog[i];
		// Split on " — " delimiter
		const parts = line.split(' — ').map(p => p.trim());
		// First part: "ICON DISPLAY_NAME"
		const firstSpace = parts[0].indexOf(' ');
		const icon = firstSpace > 0 ? parts[0].slice(0, firstSpace) : '🔧';
		const displayName = firstSpace > 0 ? parts[0].slice(firstSpace + 1) : parts[0];

		// Last part might be duration like "1.2s"
		let summary = '';
		let durationSec = 0;
		if (parts.length >= 3) {
			summary = parts.slice(1, -1).join(' — ');
			const durMatch = parts[parts.length - 1].match(/^(\d+\.?\d*)s$/);
			if (durMatch) {
				durationSec = parseFloat(durMatch[1]);
			} else {
				summary = parts.slice(1).join(' — ');
			}
		} else if (parts.length === 2) {
			const durMatch = parts[1].match(/^(\d+\.?\d*)s$/);
			if (durMatch) {
				durationSec = parseFloat(durMatch[1]);
			} else {
				summary = parts[1];
			}
		}

		const stepStartedAt = startedAt + i * 100; // approximate offset
		const step: import('../types/search-steps').V2ToolStep = {
			id: `restored-step-${i}`,
			toolName: 'restored',
			displayName,
			icon,
			input: {},
			status: 'done',
			startedAt: stepStartedAt,
			endedAt: stepStartedAt + durationSec * 1000,
			summary: summary || undefined,
		};
		steps.push(step);
		timeline.push({ kind: 'tool', step });
	}

	return { steps, timeline };
}
```

- [ ] **Step 2: Use the parser in the V2 restore path**

In the V2 branch of `bridgeSnapshotToSearchSessionStore`, after the `v2PlanSections` construction and before the `useSearchSessionStore.setState()` call, add:

```ts
// Reconstruct process timeline from saved log
const { steps: restoredSteps, timeline: restoredTimeline } =
	(snapshot.v2ProcessLog?.length)
		? reconstructProcessTimeline(snapshot.v2ProcessLog, startedAt)
		: { steps: [], timeline: [] };
```

Then in the `useSearchSessionStore.setState()` call, add these two fields:

```ts
v2Steps: restoredSteps,
v2Timeline: restoredTimeline,
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/store/aiAnalysisStore.ts
git commit -m "fix: restore Process view timeline from saved v2ProcessLog"
```

---

### Task 5: Graph expand opens new window instead of split pane

The graph expand button uses `app.workspace.getLeaf('split')` which creates a split in the current pane. User wants a new Obsidian window.

**Files:**
- Modify: `src/ui/view/quick-search/components/V2SourcesView.tsx:24-31`

- [ ] **Step 1: Change getLeaf('split') to openPopoutLeaf()**

In `V2SourcesView.tsx`, find the `handleExpand` callback inside `SourcesGraph` (around line 24-31):

```ts
const handleExpand = useCallback(async () => {
	const { AppContext } = await import('@/app/context/AppContext');
	const { GRAPH_FULLSCREEN_VIEW_TYPE } = await import('@/ui/view/graph-fullscreen/GraphFullscreenView');
	const app = AppContext.getInstance().app;
	const leaf = app.workspace.getLeaf('split');
	await leaf.setViewState({ type: GRAPH_FULLSCREEN_VIEW_TYPE, active: true });
	app.workspace.revealLeaf(leaf);
}, []);
```

Change `getLeaf('split')` to `openPopoutLeaf()`:

```ts
const handleExpand = useCallback(async () => {
	const { AppContext } = await import('@/app/context/AppContext');
	const { GRAPH_FULLSCREEN_VIEW_TYPE } = await import('@/ui/view/graph-fullscreen/GraphFullscreenView');
	const app = AppContext.getInstance().app;
	const leaf = app.workspace.openPopoutLeaf();
	await leaf.setViewState({ type: GRAPH_FULLSCREEN_VIEW_TYPE, active: true });
}, []);
```

Note: `openPopoutLeaf()` returns the leaf directly; no need for `revealLeaf` since popout windows auto-focus.

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/components/V2SourcesView.tsx
git commit -m "fix: graph expand opens new window instead of split pane"
```
