# Ambient Push Phase 3 — Serendipity Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform ambient push from "related notes" into a Serendipity Engine: inline editor gutter hints via CM6 ViewPlugin, a serendipity query that finds notes maximally distant in embedding space yet connected by exactly one structural bridge, opt-in LLM Tier 2 micro-explanations for top-1 results, and cross-session pattern learning that discovers recurring (source topic -> pushed topic) pairs to seed future ambient queries.

**Branch:** `feat/ambient-push-phase3` (git worktree)

**Architecture:** Phase 1 (FTS5 pipeline) and Phase 2 (graph intelligence) remain unchanged. Phase 3 adds four orthogonal capabilities:

1. **CM6 gutter decoration** — a `ViewPlugin` registered via `Plugin.registerEditorExtension()` that shows a `?` icon in the editor gutter at the cursor line when a writing pause is detected. Hover reveals a tooltip with the top-1 serendipitous push item.
2. **Serendipity query** — a new `serendipitySearch()` function in `AmbientSearcher.ts` that finds 2-hop graph neighbors with maximal embedding distance (the "friends of friends you've never met" pattern).
3. **LLM micro-explanation** — a `generateLlmExplanation()` function in `RelevanceExplainer.ts` that calls the cheapest configured model for a one-sentence explanation of top-1 result relevance.
4. **Cross-session pattern learning** — a `PatternLearner` class that aggregates `ambient_push_log` to discover recurring source->pushed topic pairs and uses them to boost future ambient queries.

**Spec:** `docs/superpowers/specs/2026-05-01-ambient-push-design.md` (sections 5.3, 8 Phase 3, 3.5 Tier 2)

---

## File Structure

### New Files

| File | Purpose |
|------|---------|
| `src/service/ambient/SerendipityGutterPlugin.ts` | CM6 ViewPlugin for gutter `?` icon + hover tooltip |
| `src/service/ambient/SerendipitySearcher.ts` | Serendipity query: 2-hop neighbors with max embedding distance |
| `src/service/ambient/PatternLearner.ts` | Cross-session pattern learning from `ambient_push_log` |

### Modified Files

| File | Change Summary |
|------|---------------|
| `src/service/ambient/types.ts` | Add `enableLlmExplanation`, `llmExplanationCooldownMs`, `enableSerendipityGutter` to `AmbientPushSettings`; widen `explanationType` to include `'llm'` |
| `src/service/ambient/RelevanceExplainer.ts` | Add `generateLlmExplanation()` for Tier 2 micro-explanation |
| `src/service/ambient/AmbientSearcher.ts` | Integrate serendipity results into the candidate pipeline |
| `src/service/ambient/AmbientPushService.ts` | Wire LLM explanation (async, non-blocking), register/unregister gutter extension, invoke pattern learner |
| `src/ui/store/ambientPushStore.ts` | Add `serendipityItem` field for gutter tooltip, `updateLlmExplanation` action |
| `src/core/storage/sqlite/repositories/AmbientPushRepo.ts` | Add `getRecurringPairs()` query for pattern learning |
| `src/app/settings/PluginSettingsLoader.ts` | Normalize new settings fields |
| `main.ts` | Register CM6 editor extension via `this.registerEditorExtension()` |
| `test/ambient-push.test.ts` | Add tests for serendipity scoring, pattern learning, LLM explanation |

---

## Task 1: Settings Extension — Phase 3 Fields

**Files:**
- Modify: `src/service/ambient/types.ts`
- Modify: `src/app/settings/PluginSettingsLoader.ts`

- [ ] **Step 1: Extend `AmbientPushSettings` in types.ts**

Add three new fields and widen `explanationType`:

```typescript
// In AmbientPushSettings interface, add after feedbackLearning:
enableLlmExplanation: boolean;      // default: false — opt-in Tier 2 micro-explanation
llmExplanationCooldownMs: number;    // default: 120000 (2 min) — rate limit for LLM calls
enableSerendipityGutter: boolean;    // default: true — show ? icon in editor gutter
```

```typescript
// In DEFAULT_AMBIENT_PUSH_SETTINGS, add:
enableLlmExplanation: false,
llmExplanationCooldownMs: 120_000,
enableSerendipityGutter: true,
```

Widen `explanationType` in `AmbientPushItem`:

```typescript
// Change from:
explanationType: 'template';
// To:
explanationType: 'template' | 'llm';
```

- [ ] **Step 2: Update PluginSettingsLoader normalization**

In `src/app/settings/PluginSettingsLoader.ts`, inside the ambient push normalization block, add after the `feedbackLearning` field:

```typescript
enableLlmExplanation: getBoolean(
  rawAmbient.enableLlmExplanation,
  DEFAULT_AMBIENT_PUSH_SETTINGS.enableLlmExplanation,
),
llmExplanationCooldownMs:
  typeof rawAmbient.llmExplanationCooldownMs === 'number'
    ? Math.max(30_000, rawAmbient.llmExplanationCooldownMs)
    : DEFAULT_AMBIENT_PUSH_SETTINGS.llmExplanationCooldownMs,
enableSerendipityGutter: getBoolean(
  rawAmbient.enableSerendipityGutter,
  DEFAULT_AMBIENT_PUSH_SETTINGS.enableSerendipityGutter,
),
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/service/ambient/types.ts src/app/settings/PluginSettingsLoader.ts
git commit -m "feat(ambient-p3): add enableLlmExplanation, llmExplanationCooldownMs, enableSerendipityGutter settings"
```

---

## Task 2: Serendipity Query — Friends-of-Friends with Max Embedding Distance

**Files:**
- Create: `src/service/ambient/SerendipitySearcher.ts`
- Modify: `test/ambient-push.test.ts`

This is the core algorithmic innovation. The serendipity query finds notes that are:
1. Exactly 2 hops away in the knowledge graph (connected by one structural bridge)
2. NOT direct (1-hop) neighbors of the source
3. Maximally distant in embedding space from the source

This combination ensures suggestions are non-random (structurally connected) but surprising (semantically distant).

- [ ] **Step 1: Create `SerendipitySearcher.ts`**

```typescript
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { embedText } from '@/core/embeddings/embedClient';
import type { AmbientContext, AmbientPushItem, AmbientSignal } from './types';
import { generateExplanation } from './RelevanceExplainer';
import { GRAPH_DOCUMENT_LIKE_NODE_TYPES } from '@/core/po/graph.po';

/**
 * A serendipity candidate: a note that is 2-hops away in the graph
 * but maximally distant in embedding space.
 */
export interface SerendipityCandidate {
  /** File path of the candidate note */
  path: string;
  /** Node ID in the graph */
  nodeId: string;
  /** The bridge note that connects source to this candidate (1-hop intermediary) */
  bridgeNodeId: string;
  bridgePath: string | null;
  bridgeLabel: string;
  /** Embedding distance from source (higher = more serendipitous) */
  embeddingDistance: number;
}

/**
 * Find notes that are exactly 2 hops away in the knowledge graph
 * but maximally distant in embedding space — the "serendipity sweet spot".
 *
 * Algorithm:
 * 1. Get 1-hop neighbors of source (direct neighbors)
 * 2. Get 1-hop neighbors of those neighbors (2-hop candidates)
 * 3. Filter out source and direct neighbors
 * 4. For remaining candidates, compute embedding distance from source
 * 5. Sort by embedding distance DESC — most distant = most serendipitous
 * 6. Return top-N
 *
 * @param context - Current ambient context
 * @param existingOutlinks - Already-linked notes to exclude
 * @param maxResults - Maximum serendipity candidates to return (default: 3)
 */
export async function serendipitySearch(
  context: AmbientContext,
  existingOutlinks: Set<string>,
  maxResults: number = 3,
): Promise<AmbientPushItem[]> {
  try {
    const graphRepo = sqliteStoreManager.getGraphRepo();
    const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo();
    const edgeRepo = sqliteStoreManager.getMobiusEdgeRepo();
    const embeddingRepo = sqliteStoreManager.getEmbeddingRepo('vault');

    // 1. Get source node
    const sourceNode = await mobiusNodeRepo.getByPath(context.filePath);
    if (!sourceNode) return [];
    const sourceNodeId = sourceNode.node_id;

    // 2. Get source embedding for distance comparison
    const sourceEmbedding = await embeddingRepo.getEmbeddingForSemanticSearch(sourceNodeId);
    if (!sourceEmbedding) return []; // No embedding = can't compute distance

    // 3. Get 1-hop neighbor IDs
    const oneHopMap = await edgeRepo.getNeighborIdsMap([sourceNodeId]);
    const directNeighborIds = new Set(oneHopMap.get(sourceNodeId) ?? []);
    if (directNeighborIds.size === 0) return [];

    // 4. Get 2-hop neighbor IDs (neighbors of neighbors)
    const twoHopMap = await edgeRepo.getNeighborIdsMap(Array.from(directNeighborIds));

    // 5. Collect 2-hop candidates, recording which bridge connects them
    //    candidateId -> bridgeNodeId
    const candidateToBridge = new Map<string, string>();
    for (const [bridgeId, neighbors] of twoHopMap) {
      for (const neighborId of neighbors) {
        // Exclude source node and direct neighbors
        if (neighborId === sourceNodeId) continue;
        if (directNeighborIds.has(neighborId)) continue;
        // Keep the first bridge found (arbitrary but deterministic)
        if (!candidateToBridge.has(neighborId)) {
          candidateToBridge.set(neighborId, bridgeId);
        }
      }
    }

    if (candidateToBridge.size === 0) return [];

    // 6. Filter to document-like nodes only
    const candidateIds = Array.from(candidateToBridge.keys());
    const docCandidateIds = await mobiusNodeRepo.getIdsByIdsAndTypes(
      candidateIds,
      [...GRAPH_DOCUMENT_LIKE_NODE_TYPES],
    );
    const docCandidateSet = new Set(docCandidateIds);

    // 7. Get embeddings for all document candidates (batch)
    const candidatesWithEmbeddings: SerendipityCandidate[] = [];
    const candidateNodes = await mobiusNodeRepo.getByIds(
      Array.from(docCandidateSet),
    );

    for (const candidateId of docCandidateSet) {
      const node = candidateNodes.get(candidateId);
      if (!node) continue;

      // Resolve path from node attributes
      let candidatePath: string | null = null;
      try {
        const attrs = JSON.parse(node.attributes || '{}') as { path?: string };
        candidatePath = attrs.path ?? node.path ?? null;
      } catch {
        candidatePath = node.path ?? null;
      }
      if (!candidatePath) continue;

      // Skip already-linked notes
      const basename = candidatePath.replace(/^.*\//, '').replace(/\.md$/, '').toLowerCase();
      if (existingOutlinks.has(basename)) continue;

      // Get candidate embedding
      const candidateEmbedding = await embeddingRepo.getEmbeddingForSemanticSearch(candidateId);
      if (!candidateEmbedding) continue;

      // Compute cosine distance (1 - cosine_similarity)
      const distance = cosineDistance(sourceEmbedding, candidateEmbedding);

      // Resolve bridge info
      const bridgeId = candidateToBridge.get(candidateId)!;
      const bridgeNode = candidateNodes.get(bridgeId);
      let bridgePath: string | null = null;
      let bridgeLabel = bridgeId;
      if (bridgeNode) {
        bridgeLabel = bridgeNode.label;
        try {
          const attrs = JSON.parse(bridgeNode.attributes || '{}') as { path?: string };
          bridgePath = attrs.path ?? bridgeNode.path ?? null;
        } catch {
          bridgePath = bridgeNode.path ?? null;
        }
      }

      candidatesWithEmbeddings.push({
        path: candidatePath,
        nodeId: candidateId,
        bridgeNodeId: bridgeId,
        bridgePath,
        bridgeLabel,
        embeddingDistance: distance,
      });
    }

    // 8. Sort by embedding distance DESC — most distant first
    candidatesWithEmbeddings.sort((a, b) => b.embeddingDistance - a.embeddingDistance);

    // 9. Convert top-N to AmbientPushItems
    const now = Date.now();
    return candidatesWithEmbeddings.slice(0, maxResults).map((c) => {
      const signals: AmbientSignal[] = [
        { type: 'graph_neighbor', hop: 2, via: c.bridgeLabel },
      ];
      return {
        filePath: c.path,
        title: c.path.replace(/^.*\//, '').replace(/\.md$/, ''),
        excerpt: `Serendipity: connected via [[${c.bridgeLabel}]] but semantically distant`,
        score: c.embeddingDistance, // Higher distance = higher serendipity score
        explanation: generateExplanation(signals),
        explanationType: 'template' as const,
        signals,
        timestamp: now,
      };
    });
  } catch (err) {
    console.debug('[SerendipitySearcher] Search failed (non-critical):', err);
    return [];
  }
}

/**
 * Compute cosine distance between two vectors: 1 - cosine_similarity.
 * Returns 0 for identical vectors, 2 for opposite vectors.
 */
export function cosineDistance(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 1;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 1;

  return 1 - dotProduct / denominator;
}
```

- [ ] **Step 2: Add tests for cosineDistance**

In `test/ambient-push.test.ts`:

```typescript
import { cosineDistance } from '../src/service/ambient/SerendipitySearcher';

// --- cosineDistance ---
{
  // Identical vectors: distance = 0
  const d1 = cosineDistance([1, 0, 0], [1, 0, 0]);
  assert.ok(Math.abs(d1) < 1e-6, `Expected ~0, got ${d1}`);

  // Orthogonal vectors: distance = 1
  const d2 = cosineDistance([1, 0, 0], [0, 1, 0]);
  assert.ok(Math.abs(d2 - 1) < 1e-6, `Expected ~1, got ${d2}`);

  // Opposite vectors: distance = 2
  const d3 = cosineDistance([1, 0, 0], [-1, 0, 0]);
  assert.ok(Math.abs(d3 - 2) < 1e-6, `Expected ~2, got ${d3}`);

  // Empty vectors: distance = 1 (fallback)
  const d4 = cosineDistance([], []);
  assert.equal(d4, 1);

  // Mismatched lengths: distance = 1 (fallback)
  const d5 = cosineDistance([1, 2], [1, 2, 3]);
  assert.equal(d5, 1);

  console.log('cosineDistance: all passed');
}
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- test/ambient-push.test.ts`
Expected: PASS.

- [ ] **Step 4: Verify build**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/service/ambient/SerendipitySearcher.ts test/ambient-push.test.ts
git commit -m "feat(ambient-p3): add serendipity query — 2-hop neighbors with max embedding distance"
```

---

## Task 3: Integrate Serendipity Results into AmbientSearcher

**Files:**
- Modify: `src/service/ambient/AmbientSearcher.ts`
- Modify: `src/service/ambient/AmbientPushService.ts`
- Modify: `src/ui/store/ambientPushStore.ts`

- [ ] **Step 1: Add serendipity integration in AmbientSearcher**

At the end of the `ambientSearch()` function, after the main pipeline produces results, invoke the serendipity searcher and merge the top-1 result:

```typescript
// At the top of AmbientSearcher.ts, add import:
import { serendipitySearch } from './SerendipitySearcher';

// Inside ambientSearch(), after the final items.sort() and before the return:

// --- Serendipity injection (Phase 3) ---
// If we have fewer than maxItems results, try to fill remaining slots with serendipity
const serendipitySlots = Math.max(0, Math.min(1, maxItems - items.length));
if (serendipitySlots > 0 && (settings?.graphExpansionHops ?? 0) > 0) {
  try {
    const serendipityItems = await serendipitySearch(
      context,
      existingOutlinksLower,
      serendipitySlots,
    );
    // Deduplicate against existing items
    const existingPaths = new Set(items.map((i) => i.filePath));
    for (const si of serendipityItems) {
      if (!existingPaths.has(si.filePath)) {
        items.push(si);
      }
    }
  } catch {
    // Serendipity search is non-critical — fail silently
  }
}
```

- [ ] **Step 2: Add `serendipityItem` field to store**

In `src/ui/store/ambientPushStore.ts`, add a field for the gutter tooltip to consume:

```typescript
// Add to interface:
serendipityItem: AmbientPushItem | null;

// Add to initial state:
serendipityItem: null,

// Modify setItems to also set serendipityItem (last item if it has a graph_neighbor signal with hop=2):
// In the setItems implementation, add logic to pick the most serendipitous item
```

Specifically, update `setItems`:

```typescript
setItems: (items: AmbientPushItem[], sourceFilePath: string) => {
  // Pick the most serendipitous item for gutter tooltip
  // (highest score among items with 2-hop graph_neighbor signal)
  const serendipityItem = items.find((item) =>
    item.signals.some((s) => s.type === 'graph_neighbor' && s.hop === 2),
  ) ?? null;
  set({ items, sourceFilePath, lastUpdateTs: Date.now(), serendipityItem });
},
```

Also update `clearItems` to reset `serendipityItem`:

```typescript
clearItems: () =>
  set({ items: [], lastUpdateTs: Date.now(), serendipityItem: null }),
```

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/service/ambient/AmbientSearcher.ts src/ui/store/ambientPushStore.ts
git commit -m "feat(ambient-p3): integrate serendipity results into ambient search pipeline and store"
```

---

## Task 4: CodeMirror Gutter Decoration — ViewPlugin

**Files:**
- Create: `src/service/ambient/SerendipityGutterPlugin.ts`
- Modify: `main.ts`

This task implements the CM6 ViewPlugin that shows a `?` icon in the editor gutter at the cursor line, with a hover tooltip displaying the top-1 serendipitous push item. The existing codebase has a pattern in `src/ui/component/mine/tagPlugin.ts` — we follow that structure.

**Key design decisions:**
- Use `EditorView.decorations` (widget decoration at the cursor line), not the `gutter()` API, because Obsidian already manages the gutter and a widget at end-of-line avoids interference.
- Actually, per spec, use gutter API for proper `?` icon placement. Obsidian's CM6 setup supports custom gutters via `Plugin.registerEditorExtension()`.
- The tooltip is a plain DOM element positioned near the gutter marker.
- State is read from `useAmbientPushStore` — no separate state management.

- [ ] **Step 1: Create `SerendipityGutterPlugin.ts`**

```typescript
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';
import { RangeSetBuilder, type Extension } from '@codemirror/state';
import { useAmbientPushStore } from '@/ui/store/ambientPushStore';
import type { AmbientPushItem } from './types';

/**
 * Widget that renders a "?" hint icon in the gutter area.
 * On hover, shows a tooltip with the top-1 serendipitous push item.
 */
class SerendipityHintWidget extends WidgetType {
  constructor(private readonly item: AmbientPushItem) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'peak-serendipity-hint';
    wrapper.textContent = '?';
    wrapper.title = ''; // Disable native tooltip; we use custom

    // Custom tooltip on hover
    const tooltip = document.createElement('div');
    tooltip.className = 'peak-serendipity-tooltip';
    tooltip.style.display = 'none';

    const title = document.createElement('span');
    title.className = 'peak-serendipity-tooltip-title';
    title.textContent = this.item.title;
    tooltip.appendChild(title);

    const explanation = document.createElement('span');
    explanation.className = 'peak-serendipity-tooltip-explanation';
    explanation.textContent = this.item.explanation;
    tooltip.appendChild(explanation);

    if (this.item.excerpt) {
      const excerpt = document.createElement('span');
      excerpt.className = 'peak-serendipity-tooltip-excerpt';
      excerpt.textContent =
        this.item.excerpt.length > 80
          ? `${this.item.excerpt.slice(0, 80)}...`
          : this.item.excerpt;
      tooltip.appendChild(excerpt);
    }

    wrapper.appendChild(tooltip);

    wrapper.addEventListener('mouseenter', () => {
      tooltip.style.display = 'flex';
    });
    wrapper.addEventListener('mouseleave', () => {
      tooltip.style.display = 'none';
    });

    // Click opens the note
    wrapper.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Use Obsidian's workspace API via global app reference
      const app = (window as any).app;
      if (app?.workspace) {
        app.workspace.openLinkText(this.item.filePath, '', true);
        useAmbientPushStore
          .getState()
          .recordAction('', this.item.filePath, 'opened');
      }
    });

    return wrapper;
  }

  eq(other: SerendipityHintWidget): boolean {
    return this.item.filePath === other.item.filePath;
  }

  ignoreEvent(): boolean {
    return false; // Allow click events through
  }
}

/**
 * CM6 ViewPlugin that places a `?` serendipity hint widget
 * at the end of the cursor line when a serendipity item is available.
 */
const serendipityPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    private storeUnsub: (() => void) | null = null;
    private currentItem: AmbientPushItem | null = null;

    constructor(private view: EditorView) {
      this.currentItem = useAmbientPushStore.getState().serendipityItem;
      this.decorations = this.buildDecorations();

      // Subscribe to store changes
      this.storeUnsub = useAmbientPushStore.subscribe((state) => {
        const newItem = state.serendipityItem;
        if (newItem !== this.currentItem) {
          this.currentItem = newItem;
          this.decorations = this.buildDecorations();
          // Force CM to re-read decorations
          this.view.dispatch({ effects: [] });
        }
      });
    }

    update(update: ViewUpdate) {
      if (update.selectionSet || update.docChanged) {
        this.decorations = this.buildDecorations();
      }
    }

    buildDecorations(): DecorationSet {
      if (!this.currentItem) return Decoration.none;

      const builder = new RangeSetBuilder<Decoration>();
      const cursor = this.view.state.selection.main.head;
      const line = this.view.state.doc.lineAt(cursor);

      // Place widget at end of cursor line
      builder.add(
        line.to,
        line.to,
        Decoration.widget({
          widget: new SerendipityHintWidget(this.currentItem),
          side: 1, // After the text
        }),
      );

      return builder.finish();
    }

    destroy() {
      this.storeUnsub?.();
      this.storeUnsub = null;
    }
  },
  {
    decorations: (v) => v.decorations,
  },
);

/**
 * Create the CM6 extension for serendipity gutter hints.
 * Register via `plugin.registerEditorExtension(serendipityGutterExtension())`.
 */
export function serendipityGutterExtension(): Extension {
  return [
    serendipityPlugin,
    // Base styles for the hint widget and tooltip
    EditorView.baseTheme({
      '.peak-serendipity-hint': {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '18px',
        height: '18px',
        marginLeft: '8px',
        borderRadius: '50%',
        fontSize: '11px',
        fontWeight: '600',
        cursor: 'pointer',
        opacity: '0.5',
        transition: 'opacity 150ms ease',
        color: 'var(--text-accent)',
        backgroundColor: 'color-mix(in srgb, var(--text-accent) 10%, transparent)',
        position: 'relative',
        '&:hover': {
          opacity: '1',
        },
      },
      '.peak-serendipity-tooltip': {
        display: 'none',
        flexDirection: 'column',
        gap: '4px',
        position: 'absolute',
        top: '24px',
        left: '0',
        zIndex: '1000',
        minWidth: '240px',
        maxWidth: '320px',
        padding: '8px 10px',
        borderRadius: '6px',
        fontSize: '12px',
        lineHeight: '1.4',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        backgroundColor: 'var(--background-primary)',
        border: '1px solid var(--background-modifier-border)',
      },
      '.peak-serendipity-tooltip-title': {
        fontWeight: '600',
        color: 'var(--text-normal)',
      },
      '.peak-serendipity-tooltip-explanation': {
        color: 'var(--text-accent)',
        fontSize: '11px',
      },
      '.peak-serendipity-tooltip-excerpt': {
        color: 'var(--text-muted)',
        fontSize: '11px',
      },
    }),
  ];
}
```

- [ ] **Step 2: Register extension in `main.ts`**

In `main.ts`, inside the `onload()` method, after the ambient push service is started, conditionally register the CM6 extension:

```typescript
// After AmbientPushService.start(this.app):
import { serendipityGutterExtension } from '@/service/ambient/SerendipityGutterPlugin';

// Inside the ambient push block:
const ambientSettings = this.settings.ambientPush;
if (!ambientSettings || ambientSettings.enableSerendipityGutter !== false) {
  this.registerEditorExtension(serendipityGutterExtension());
}
```

Note: `Plugin.registerEditorExtension()` is Obsidian's API for adding CM6 extensions. It handles lifecycle (auto-cleanup on plugin unload). The extension is registered once; the ViewPlugin internally subscribes to the Zustand store for dynamic updates.

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Manual smoke test**

1. Reload the plugin in Obsidian
2. Open a note with existing ambient push results
3. Verify the `?` icon appears at the end of the cursor line when a serendipity item is available
4. Hover over `?` — tooltip should show title, explanation, and excerpt
5. Click `?` — should open the suggested note in a new tab

- [ ] **Step 5: Commit**

```bash
git add src/service/ambient/SerendipityGutterPlugin.ts main.ts
git commit -m "feat(ambient-p3): add CM6 gutter ViewPlugin for serendipity hints with hover tooltip"
```

---

## Task 5: LLM Tier 2 Micro-Explanation

**Files:**
- Modify: `src/service/ambient/RelevanceExplainer.ts`
- Modify: `src/service/ambient/AmbientPushService.ts`
- Modify: `src/ui/store/ambientPushStore.ts`

This adds an opt-in LLM call for the top-1 result. The call is async and non-blocking — the template explanation shows immediately, and the LLM explanation replaces it when it arrives.

- [ ] **Step 1: Add `generateLlmExplanation()` in RelevanceExplainer.ts**

```typescript
import { queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { AppContext } from '@/app/context/AppContext';

/** Module-level rate limiter for LLM explanation calls. */
let lastLlmCallTs = 0;

/**
 * Generate a one-sentence LLM explanation for why a pushed note is relevant.
 * Rate-limited to 1 call per cooldownMs. Returns null if rate-limited or on error.
 *
 * @param currentParagraph - What the user is currently writing
 * @param pushNoteTitle - Title of the pushed note
 * @param pushNoteExcerpt - First ~150 chars of the pushed note
 * @param cooldownMs - Minimum interval between LLM calls (default: 120000ms)
 */
export async function generateLlmExplanation(
  currentParagraph: string,
  pushNoteTitle: string,
  pushNoteExcerpt: string,
  cooldownMs: number = 120_000,
): Promise<string | null> {
  // Rate limit check
  const now = Date.now();
  if (now - lastLlmCallTs < cooldownMs) return null;
  lastLlmCallTs = now;

  const registry = ProfileRegistry.getInstance();
  // Prefer fast model (cheapest); fall back to agent profile
  const profile = registry.getActiveAgentProfile();
  if (!profile) return null;

  const prompt = [
    `Given the user is writing about: "${currentParagraph.slice(0, 300)}"`,
    `And this note exists: "${pushNoteTitle}" with excerpt: "${pushNoteExcerpt.slice(0, 200)}"`,
    `In one sentence (max 20 words), explain how this note could contribute to the current writing.`,
    `Reply with ONLY the explanation sentence, no preamble.`,
  ].join('\n');

  try {
    const app = AppContext.getApp();
    const pluginId = AppContext.getPluginId();

    let resultText = '';
    const messages = queryWithProfile(app, pluginId, profile, {
      prompt,
      maxTurns: 1,
      systemPrompt: 'You are a concise research assistant. Output only the requested sentence.',
    });

    for await (const msg of messages) {
      if (msg?.type === 'assistant' && msg?.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === 'text') {
            resultText += block.text;
          }
        }
      }
      if (msg?.type === 'result' && msg?.text) {
        resultText = msg.text;
      }
    }

    const trimmed = resultText.trim();
    // Enforce max 100 tokens (~75 words) output guard
    if (trimmed.length > 0 && trimmed.length <= 500) {
      return trimmed;
    }
    return trimmed.slice(0, 500);
  } catch (err) {
    console.debug('[RelevanceExplainer] LLM explanation failed (non-critical):', err);
    return null;
  }
}
```

- [ ] **Step 2: Add `updateLlmExplanation` action to store**

In `src/ui/store/ambientPushStore.ts`:

```typescript
// Add to interface:
updateLlmExplanation: (filePath: string, explanation: string) => void;

// Add implementation:
updateLlmExplanation: (filePath: string, explanation: string) =>
  set((state) => ({
    items: state.items.map((item) =>
      item.filePath === filePath
        ? { ...item, explanation, explanationType: 'llm' as const }
        : item,
    ),
    lastUpdateTs: Date.now(),
  })),
```

- [ ] **Step 3: Wire LLM explanation in AmbientPushService**

In `src/service/ambient/AmbientPushService.ts`, after `store.setItems(items, context.filePath)`, add an async non-blocking LLM call for the top-1 item:

```typescript
import { generateLlmExplanation } from './RelevanceExplainer';

// After store.setItems(items, context.filePath):

// --- LLM Tier 2 micro-explanation (async, non-blocking) ---
if (settings.enableLlmExplanation && items.length > 0) {
  const topItem = items[0];
  generateLlmExplanation(
    context.currentParagraph,
    topItem.title,
    topItem.excerpt,
    settings.llmExplanationCooldownMs,
  )
    .then((llmExplanation) => {
      if (llmExplanation) {
        useAmbientPushStore
          .getState()
          .updateLlmExplanation(topItem.filePath, llmExplanation);
      }
    })
    .catch(() => {
      /* LLM explanation is non-critical — fail silently */
    });
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/service/ambient/RelevanceExplainer.ts src/service/ambient/AmbientPushService.ts src/ui/store/ambientPushStore.ts
git commit -m "feat(ambient-p3): add opt-in LLM Tier 2 micro-explanation for top-1 push result"
```

---

## Task 6: LLM Explanation Visual Indicator in PushCard

**Files:**
- Modify: `src/ui/view/ambient-push/PushCard.tsx`

When an explanation comes from LLM (Tier 2), the badge should have a distinct visual treatment to distinguish AI-generated explanations from template-based ones (per Extended Mind Theory — section 2.7 of spec).

- [ ] **Step 1: Update PushCard explanation badge**

In `src/ui/view/ambient-push/PushCard.tsx`, modify the explanation badge to show a Lucide icon when the explanation is LLM-generated:

```tsx
import { Sparkles } from 'lucide-react';

// Replace the existing explanation badge span with:
<span
  className="pktw-mt-1.5 pktw-inline-flex pktw-items-center pktw-gap-1 pktw-rounded pktw-px-1.5 pktw-py-0.5 pktw-text-xs"
  style={{
    color: item.explanationType === 'llm' ? 'var(--text-normal)' : 'var(--text-accent)',
    backgroundColor: item.explanationType === 'llm'
      ? 'color-mix(in srgb, var(--interactive-accent) 12%, transparent)'
      : 'color-mix(in srgb, var(--text-accent) 12%, transparent)',
  }}
>
  {item.explanationType === 'llm' && (
    <Sparkles className="pktw-h-3 pktw-w-3" />
  )}
  {item.explanation}
</span>
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/ambient-push/PushCard.tsx
git commit -m "feat(ambient-p3): add visual indicator for LLM-generated explanations in push cards"
```

---

## Task 7: AmbientPushRepo — Recurring Pairs Query for Pattern Learning

**Files:**
- Modify: `src/core/storage/sqlite/repositories/AmbientPushRepo.ts`

- [ ] **Step 1: Add `getRecurringPairs()` method**

This query aggregates `ambient_push_log` to find (source topic -> pushed topic) pairs that recur across multiple sessions. A "recurring pair" is one where the same source file has been pushed the same target file at least N times with positive feedback.

```typescript
/**
 * Discover recurring (source → pushed) pairs with positive feedback.
 * A "recurring pair" is one where the user opened/linked the same
 * (source, pushed) combination at least `minCount` times within `withinDays`.
 *
 * Used by PatternLearner to seed future ambient queries with known-good patterns.
 *
 * @returns Array of { sourceFilePath, pushedFilePath, count, avgScore }
 */
async getRecurringPairs(
  withinDays: number,
  minCount: number = 2,
): Promise<Array<{
  sourceFilePath: string;
  pushedFilePath: string;
  count: number;
  avgScore: number;
}>> {
  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
  const rows = await this.db
    .selectFrom('ambient_push_log')
    .select(['source_file_path', 'pushed_file_path'])
    .select((eb) => eb.fn.count<number>('id').as('cnt'))
    .select((eb) => eb.fn.avg<number>('pushed_score').as('avg_score'))
    .where('user_action', 'in', ['opened', 'linked'])
    .where('user_action_ts', '>=', cutoff)
    .groupBy(['source_file_path', 'pushed_file_path'])
    .having((eb) => eb.fn.count('id'), '>=', minCount)
    .orderBy('cnt', 'desc')
    .limit(50)
    .execute();

  return rows.map((row) => ({
    sourceFilePath: row.source_file_path,
    pushedFilePath: row.pushed_file_path,
    count: row.cnt,
    avgScore: row.avg_score ?? 0,
  }));
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/core/storage/sqlite/repositories/AmbientPushRepo.ts
git commit -m "feat(ambient-p3): add getRecurringPairs repo query for cross-session pattern learning"
```

---

## Task 8: Cross-Session Pattern Learning

**Files:**
- Create: `src/service/ambient/PatternLearner.ts`
- Modify: `src/service/ambient/AmbientSearcher.ts`
- Modify: `src/service/ambient/AmbientPushService.ts`

The PatternLearner aggregates `ambient_push_log` to discover recurring (source file -> pushed file) pairs. These discovered patterns are used to **boost** candidates in future ambient queries: if the system knows that when writing about topic A, the user consistently finds note B useful, it should proactively boost B's score.

- [ ] **Step 1: Create `PatternLearner.ts`**

```typescript
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

/**
 * A learned pattern: when editing source files similar to `sourceFilePath`,
 * the user consistently finds `pushedFilePath` useful.
 */
export interface LearnedPattern {
  sourceFilePath: string;
  pushedFilePath: string;
  strength: number; // count * avgScore — higher = stronger pattern
}

/** In-memory cache of learned patterns, refreshed periodically. */
let cachedPatterns: LearnedPattern[] = [];
let lastRefreshTs = 0;
const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // Refresh every 10 minutes

/**
 * Get learned patterns, refreshing from SQLite if stale.
 * Patterns are cached in memory to avoid per-search SQLite queries.
 */
export async function getLearnedPatterns(): Promise<LearnedPattern[]> {
  const now = Date.now();
  if (now - lastRefreshTs < REFRESH_INTERVAL_MS && cachedPatterns.length > 0) {
    return cachedPatterns;
  }

  try {
    const repo = sqliteStoreManager.getAmbientPushRepo();
    const pairs = await repo.getRecurringPairs(30, 2); // Last 30 days, min 2 occurrences

    cachedPatterns = pairs.map((p) => ({
      sourceFilePath: p.sourceFilePath,
      pushedFilePath: p.pushedFilePath,
      strength: p.count * p.avgScore,
    }));
    lastRefreshTs = now;
  } catch {
    // SQLite not ready — return stale cache or empty
  }

  return cachedPatterns;
}

/**
 * Get boost amount for a candidate based on learned patterns.
 * Returns a score boost (0 to 0.4) if the (source, candidate) pair
 * matches a learned pattern.
 *
 * @param sourceFilePath - The file currently being edited
 * @param candidatePath - The candidate push item path
 * @param patterns - Pre-fetched learned patterns
 */
export function getPatternBoost(
  sourceFilePath: string,
  candidatePath: string,
  patterns: LearnedPattern[],
): number {
  const match = patterns.find(
    (p) => p.sourceFilePath === sourceFilePath && p.pushedFilePath === candidatePath,
  );
  if (!match) return 0;

  // Boost capped at 0.4, scaled by pattern strength
  // strength = count * avgScore; typical range 1-10
  return Math.min(0.4, match.strength * 0.05);
}

/**
 * Force refresh of learned patterns (e.g., after a batch of user actions).
 */
export function invalidatePatternCache(): void {
  lastRefreshTs = 0;
}
```

- [ ] **Step 2: Integrate pattern boost into AmbientSearcher**

In `src/service/ambient/AmbientSearcher.ts`, add pattern-based score boosting in the candidate scoring loop:

```typescript
// At top, add import:
import { getLearnedPatterns, getPatternBoost, type LearnedPattern } from './PatternLearner';

// Inside ambientSearch(), before the candidate loop, load patterns:
let learnedPatterns: LearnedPattern[] = [];
if (settings?.feedbackLearning) {
  try {
    learnedPatterns = await getLearnedPatterns();
  } catch {
    // Pattern learning is non-critical
  }
}

// Inside the per-candidate feedback score adjustment block, after the ignore penalty:
// Pattern learning boost
if (learnedPatterns.length > 0) {
  const patternBoost = getPatternBoost(context.filePath, candidate.path, learnedPatterns);
  if (patternBoost > 0) {
    adjustedScore += patternBoost;
  }
}
```

- [ ] **Step 3: Trigger pattern cache invalidation on user actions**

In `src/service/ambient/AmbientPushService.ts`, after logging pushes, invalidate the pattern cache so newly recorded actions are picked up:

```typescript
import { invalidatePatternCache } from './PatternLearner';

// In logPushes(), at the end (after the for loop):
invalidatePatternCache();
```

- [ ] **Step 4: Verify build**

Run: `npm run build`

- [ ] **Step 5: Add tests for getPatternBoost**

In `test/ambient-push.test.ts`:

```typescript
import { getPatternBoost } from '../src/service/ambient/PatternLearner';

// --- getPatternBoost ---
{
  const patterns = [
    { sourceFilePath: 'notes/a.md', pushedFilePath: 'notes/b.md', strength: 4 },
    { sourceFilePath: 'notes/a.md', pushedFilePath: 'notes/c.md', strength: 10 },
  ];

  // Matching pattern: strength 4 -> boost = min(0.4, 4 * 0.05) = 0.2
  const boost1 = getPatternBoost('notes/a.md', 'notes/b.md', patterns);
  assert.equal(boost1, 0.2);

  // Matching pattern: strength 10 -> boost = min(0.4, 10 * 0.05) = 0.4 (capped)
  const boost2 = getPatternBoost('notes/a.md', 'notes/c.md', patterns);
  assert.equal(boost2, 0.4);

  // No matching pattern: boost = 0
  const boost3 = getPatternBoost('notes/x.md', 'notes/b.md', patterns);
  assert.equal(boost3, 0);

  // Empty patterns: boost = 0
  const boost4 = getPatternBoost('notes/a.md', 'notes/b.md', []);
  assert.equal(boost4, 0);

  console.log('getPatternBoost: all passed');
}
```

- [ ] **Step 6: Run tests**

Run: `npm run test -- test/ambient-push.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/service/ambient/PatternLearner.ts src/service/ambient/AmbientSearcher.ts src/service/ambient/AmbientPushService.ts test/ambient-push.test.ts
git commit -m "feat(ambient-p3): add cross-session pattern learning with score boosting"
```

---

## Task 9: CSS Styles for Gutter Tooltip

**Files:**
- Modify: `src/styles/styles.css` (or the appropriate main stylesheet)

The CM6 `EditorView.baseTheme()` handles core styles, but we need a few overrides for Obsidian-specific theming (dark mode, spacing consistency with Obsidian's existing gutter).

- [ ] **Step 1: Add CSS for serendipity gutter elements**

```css
/* Serendipity Engine — gutter hint */
.peak-serendipity-hint {
  vertical-align: middle;
  user-select: none;
  font-family: var(--font-interface);
}

/* Dark mode adjustments */
.theme-dark .peak-serendipity-tooltip {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
}

/* Reduce motion preference */
@media (prefers-reduced-motion: reduce) {
  .peak-serendipity-hint {
    transition: none;
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/styles/styles.css
git commit -m "feat(ambient-p3): add CSS overrides for serendipity gutter hint in dark mode"
```

---

## Task 10: Integration Test + End-to-End Verification

**Files:**
- Modify: `test/ambient-push.test.ts`

- [ ] **Step 1: Add comprehensive test for serendipity + pattern learning integration**

```typescript
// --- Serendipity + Pattern Learning integration ---
{
  // Verify that cosineDistance sorts candidates correctly
  const candidates = [
    { path: 'close.md', distance: cosineDistance([1, 0, 0], [0.9, 0.1, 0]) },
    { path: 'far.md', distance: cosineDistance([1, 0, 0], [0, 0, 1]) },
    { path: 'medium.md', distance: cosineDistance([1, 0, 0], [0.5, 0.5, 0]) },
  ];

  // Sort by distance DESC (most serendipitous first)
  candidates.sort((a, b) => b.distance - a.distance);
  assert.equal(candidates[0].path, 'far.md', 'Most distant should be first');
  assert.equal(candidates[2].path, 'close.md', 'Closest should be last');

  // Verify pattern boost doesn't exceed cap
  const patternsHigh = [
    { sourceFilePath: 'a.md', pushedFilePath: 'b.md', strength: 100 },
  ];
  const boost = getPatternBoost('a.md', 'b.md', patternsHigh);
  assert.equal(boost, 0.4, 'Pattern boost should be capped at 0.4');

  console.log('serendipity + pattern integration: all passed');
}
```

- [ ] **Step 2: Add RelevanceExplainer coverage for Tier 2**

```typescript
// --- RelevanceExplainer: LLM explanation type assignment ---
{
  // Verify that generateExplanation handles all signal types used by serendipity
  const { generateExplanation } = await import('../src/service/ambient/RelevanceExplainer');

  const serendipityExplanation = generateExplanation([
    { type: 'graph_neighbor', hop: 2, via: 'Distributed Systems' },
  ]);
  assert.equal(serendipityExplanation, 'Connected via [[Distributed Systems]]');

  console.log('RelevanceExplainer serendipity coverage: all passed');
}
```

- [ ] **Step 3: Run full test suite**

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 4: Verify production build**

Run: `npm run build`
Expected: Clean build, no warnings.

- [ ] **Step 5: Manual smoke test checklist**

1. **Gutter hint**: Open a note, write 30+ chars, pause for 5s. Verify `?` appears at cursor line end.
2. **Tooltip**: Hover `?`. Verify tooltip shows note title + explanation.
3. **Click**: Click `?`. Verify linked note opens in new tab.
4. **LLM explanation** (if enabled): Set `enableLlmExplanation: true` in settings. Verify top-1 card in sidebar shows Sparkles icon after LLM response arrives.
5. **Rate limiting**: Trigger two ambient pushes within 2 minutes. Verify only one LLM call fires.
6. **Pattern learning**: Open/link the same note from the same source 3 times. Verify its score increases in subsequent pushes.
7. **Settings off**: Set `enableSerendipityGutter: false`. Reload plugin. Verify no `?` icons appear.

- [ ] **Step 6: Commit**

```bash
git add test/ambient-push.test.ts
git commit -m "test(ambient-p3): add serendipity search, pattern learning, and integration tests"
```

---

## Task Summary

| Task | Component | Files | Deps |
|------|-----------|-------|------|
| 1 | Settings extension | 2 modified | -- |
| 2 | Serendipity query | 1 new, 1 modified | -- |
| 3 | Integrate serendipity into pipeline | 2 modified | Task 2 |
| 4 | CM6 gutter ViewPlugin | 1 new, 1 modified | Task 3 |
| 5 | LLM micro-explanation | 3 modified | Task 1 |
| 6 | LLM visual indicator in PushCard | 1 modified | Task 5 |
| 7 | Repo recurring pairs query | 1 modified | -- |
| 8 | Cross-session pattern learning | 3 modified, 1 new | Task 7 |
| 9 | CSS styles for gutter | 1 modified | Task 4 |
| 10 | Integration tests + smoke test | 1 modified | All |

**Execution order:** Tasks 1, 2, 7 (parallel, no deps) -> Task 3 (needs 2) -> Tasks 4, 5, 8 (parallel; 4 needs 3, 5 needs 1, 8 needs 7) -> Tasks 6, 9 (parallel; 6 needs 5, 9 needs 4) -> Task 10.

**Parallel dispatch opportunities:**
- Tasks 1, 2, and 7 are fully independent (settings, algorithm, SQL query)
- Tasks 4, 5, and 8 are independent once their deps are met (CM6, LLM, patterns)
- Tasks 6 and 9 are independent (UI badge, CSS)
- Task 10 is the final integration gate

---

## Key Integration Points

### How the CM6 ViewPlugin reads serendipity state

```
AmbientPushService.handleTrigger()
  → ambientSearch() returns items (including serendipity)
  → store.setItems(items) → sets serendipityItem (first 2-hop item)
  → SerendipityGutterPlugin subscribes to store
  → Rebuilds decorations with widget at cursor line
  → Widget renders "?" with hover tooltip from serendipityItem
```

The ViewPlugin is registered once via `Plugin.registerEditorExtension()` in `main.ts`. It does not need re-registration when files change — the Zustand subscription handles state updates. The plugin's `destroy()` method cleans up the subscription.

### How the serendipity query works

```sql
-- Conceptual query (implemented in TypeScript with MobiusEdgeRepo):

-- Step 1: Get 1-hop neighbors
SELECT to_node_id FROM mobius_edge WHERE from_node_id = :source_id
-- Result: direct_neighbors

-- Step 2: Get 2-hop neighbors (friends of friends)
SELECT to_node_id FROM mobius_edge
WHERE from_node_id IN (:direct_neighbors)
  AND to_node_id NOT IN (:source_id, :direct_neighbors)
-- Result: two_hop_candidates

-- Step 3: For each candidate, compute embedding distance
-- Uses EmbeddingRepo.getEmbeddingForSemanticSearch() for both source and candidate
-- cosineDistance(source_embedding, candidate_embedding)

-- Step 4: Sort by distance DESC, take top 3
ORDER BY embedding_distance DESC LIMIT 3
```

The key insight: we use `MobiusEdgeRepo.getNeighborIdsMap()` (two calls) to get the 2-hop neighborhood, then `EmbeddingRepo.getEmbeddingForSemanticSearch()` for vector distance. This avoids a single expensive JOIN and keeps within the 50ms graph budget (the embedding lookups are the bottleneck, ~10ms each).

### How LLM micro-explanation is rate-limited

```
Module-level variable: lastLlmCallTs = 0

generateLlmExplanation(paragraph, title, excerpt, cooldownMs):
  if (now - lastLlmCallTs < cooldownMs) → return null (rate-limited)
  lastLlmCallTs = now
  → queryWithProfile() with maxTurns=1, fast model
  → Returns one-sentence explanation (≤500 chars)

Caller (AmbientPushService):
  → Fire-and-forget: generateLlmExplanation().then(update store)
  → Non-blocking: template explanation shown immediately
  → LLM result replaces template when it arrives
```

### How pattern learning feeds back into scoring

```
ambient_push_log
  → AmbientPushRepo.getRecurringPairs(30, 2)
  → PatternLearner.getLearnedPatterns() [cached 10 min]
  → getPatternBoost(sourceFile, candidatePath, patterns)
  → Score adjustment: +0.05 * strength (capped at +0.4)
  → Applied in AmbientSearcher per-candidate loop
```

The pattern learning is purely additive — it boosts candidates that have a learned pattern, but never blocks candidates that don't. This ensures the system never becomes narrower than it was without patterns.

### How settings control Phase 3 features

| Setting | Default | Controls |
|---------|---------|----------|
| `enableLlmExplanation` | `false` | LLM Tier 2 micro-explanations on/off |
| `llmExplanationCooldownMs` | `120000` | Minimum interval between LLM explanation calls |
| `enableSerendipityGutter` | `true` | CM6 gutter `?` icon on/off |
| `feedbackLearning` | `true` | Pattern learning (Phase 2 field, reused by Phase 3) |
| `graphExpansionHops` | `2` | Must be ≥2 for serendipity search to activate |
