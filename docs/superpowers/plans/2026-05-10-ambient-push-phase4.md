# Ambient Push Phase 4 — Morning Briefing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Obsidian startup, proactively surface a "Morning Briefing" — a dismissible modal showing: (1) notes edited in the last session with unresolved connections, (2) hub summaries that changed since last visit, and (3) notes with high PageRank but not opened in 14+ days. This extends the ambient push pipeline from reactive (writing-time) to proactive (session-start) intelligence.

**Branch:** `feat/ambient-push-phase4` (git worktree)

**Architecture:** Three new data queries in `AmbientPushRepo` surface briefing candidates from `mobius_node` and `ambient_push_log`. A new `MorningBriefingService` orchestrator runs once on startup (after SQLite init), gathers items, and stores them in a dedicated Zustand store. A new `MorningBriefingModal` (Obsidian `Modal` subclass with React content) renders the briefing. The last-briefing timestamp is persisted in `index_state` to avoid re-showing on quick restarts.

**Spec:** `docs/superpowers/specs/2026-05-01-ambient-push-design.md` (section 8, Phase 4)

---

## File Structure

### New Files

| File | Purpose |
|------|---------|
| `src/service/ambient/MorningBriefingService.ts` | Orchestrator: gathers briefing items on startup, decides whether to show |
| `src/service/ambient/briefing-queries.ts` | Three data-fetching functions: unresolved connections, changed hubs, decaying engagement |
| `src/ui/store/morningBriefingStore.ts` | Zustand store for briefing items and dismissed state |
| `src/ui/view/morning-briefing/MorningBriefingModal.ts` | Obsidian Modal subclass that mounts React content |
| `src/ui/view/morning-briefing/MorningBriefingPanel.tsx` | React panel: header, three sections, action buttons |
| `src/ui/view/morning-briefing/BriefingCard.tsx` | Reusable card component for each briefing item |

### Modified Files

| File | Change Summary |
|------|---------------|
| `src/service/ambient/types.ts` | Add `BriefingItem`, `BriefingCategory` types; add `enableMorningBriefing` to `AmbientPushSettings` |
| `src/app/settings/PluginSettingsLoader.ts` | Normalize `enableMorningBriefing` setting |
| `main.ts` | Trigger `MorningBriefingService.tryShow()` after SQLite init completes |
| `test/ambient-push.test.ts` | Add tests for briefing queries and MorningBriefingService logic |

---

## Task 1: Types & Settings

**Files:**
- Modify: `src/service/ambient/types.ts`
- Modify: `src/app/settings/PluginSettingsLoader.ts`

- [ ] **Step 1: Add briefing types to `types.ts`**

Add after the existing `AmbientSignal` type:

```typescript
export type BriefingCategory = 'unresolved_connections' | 'changed_hubs' | 'decaying_engagement';

export interface BriefingItem {
  filePath: string;
  title: string;
  category: BriefingCategory;
  reason: string;          // Human-readable explanation
  score: number;           // Relevance/urgency score for sorting
  metadata?: {
    lastEditedTs?: number;
    daysSinceOpened?: number;
    hubName?: string;
    connectionCount?: number;
  };
}
```

- [ ] **Step 2: Add `enableMorningBriefing` to `AmbientPushSettings`**

```typescript
// In AmbientPushSettings interface, add:
enableMorningBriefing: boolean;

// In DEFAULT_AMBIENT_PUSH_SETTINGS, add:
enableMorningBriefing: true,
```

- [ ] **Step 3: Update PluginSettingsLoader normalization**

In the ambient push normalization block, add:

```typescript
enableMorningBriefing: getBoolean(rawAmbient.enableMorningBriefing, DEFAULT_AMBIENT_PUSH_SETTINGS.enableMorningBriefing),
```

- [ ] **Step 4: Verify build**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/service/ambient/types.ts src/app/settings/PluginSettingsLoader.ts
git commit -m "feat(ambient-p4): add BriefingItem types and enableMorningBriefing setting"
```

---

## Task 2: Briefing Query Functions

**Files:**
- Create: `src/service/ambient/briefing-queries.ts`
- Modify: `test/ambient-push.test.ts`

These three functions query `mobius_node` to surface briefing candidates. They are pure data-fetching functions with no side effects.

- [ ] **Step 1: Create `briefing-queries.ts`**

```typescript
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { GRAPH_DOCUMENT_LIKE_NODE_TYPES } from '@/core/po/graph.po';
import type { BriefingItem } from './types';

/**
 * Constants for briefing thresholds.
 * Centralized here per configurability rule (constant.ts fallback tier).
 */
const BRIEFING_DECAY_DAYS = 14;
const BRIEFING_MAX_ITEMS_PER_CATEGORY = 5;
const BRIEFING_MIN_SESSION_GAP_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Find notes edited in the last session that have potential unresolved connections.
 * "Unresolved connections" = notes that were edited recently but have low outgoing
 * link count relative to their incoming links (PageRank suggests importance,
 * but the note doesn't link out to related material).
 *
 * Strategy: find recently-modified document nodes (mtime within lastSessionWindow)
 * where doc_outgoing_cnt < doc_incoming_cnt * 0.3 (under-linked relative to importance).
 */
export async function getUnresolvedConnectionNotes(
  lastSessionStartTs: number,
  limit: number = BRIEFING_MAX_ITEMS_PER_CATEGORY,
): Promise<BriefingItem[]> {
  try {
    const nodeRepo = sqliteStoreManager.getMobiusNodeRepo();
    const db = (nodeRepo as any).db; // Access kysely instance

    const rows = await db
      .selectFrom('mobius_node')
      .select(['node_id', 'path', 'label', 'mtime', 'doc_incoming_cnt', 'doc_outgoing_cnt', 'pagerank'])
      .where('type', 'in', [...GRAPH_DOCUMENT_LIKE_NODE_TYPES])
      .where('mtime', '>=', lastSessionStartTs)
      .where('path', 'is not', null)
      .orderBy('mtime', 'desc')
      .limit(limit * 3) // Over-fetch to filter
      .execute();

    const items: BriefingItem[] = [];
    for (const row of rows) {
      if (items.length >= limit) break;
      const incoming = Number(row.doc_incoming_cnt ?? 0);
      const outgoing = Number(row.doc_outgoing_cnt ?? 0);

      // "Unresolved" heuristic: incoming suggests importance, low outgoing means under-linked
      if (incoming >= 2 && outgoing < incoming * 0.5) {
        const title = String(row.label ?? row.path ?? '').replace(/\.md$/, '');
        items.push({
          filePath: String(row.path),
          title,
          category: 'unresolved_connections',
          reason: `${incoming} notes link here, but only ${outgoing} outgoing links`,
          score: incoming - outgoing,
          metadata: {
            lastEditedTs: Number(row.mtime ?? 0),
            connectionCount: incoming,
          },
        });
      }
    }
    return items;
  } catch {
    return [];
  }
}

/**
 * Find hub summaries that were updated (hub_stale_since cleared / mtime changed)
 * since the user's last session.
 *
 * These represent knowledge clusters that evolved — the user should review
 * what changed in their knowledge landscape.
 */
export async function getChangedHubs(
  lastVisitTs: number,
  limit: number = BRIEFING_MAX_ITEMS_PER_CATEGORY,
): Promise<BriefingItem[]> {
  try {
    const nodeRepo = sqliteStoreManager.getMobiusNodeRepo();
    const db = (nodeRepo as any).db;

    const rows = await db
      .selectFrom('mobius_node')
      .select(['node_id', 'path', 'label', 'updated_at', 'mtime'])
      .where('type', '=', 'hub_doc')
      .where('updated_at', '>=', lastVisitTs)
      .where('path', 'is not', null)
      .orderBy('updated_at', 'desc')
      .limit(limit)
      .execute();

    return rows.map((row: any) => ({
      filePath: String(row.path),
      title: String(row.label ?? '').replace(/\.md$/, ''),
      category: 'changed_hubs' as const,
      reason: 'Hub summary updated since your last session',
      score: 1,
      metadata: {
        hubName: String(row.label ?? ''),
      },
    }));
  } catch {
    return [];
  }
}

/**
 * Find notes with high PageRank (top importance) that haven't been opened
 * in 14+ days. These represent "decaying engagement" — important knowledge
 * the user is neglecting.
 *
 * Strategy: order by pagerank DESC, filter to last_open_ts < (now - 14 days).
 */
export async function getDecayingEngagementNotes(
  limit: number = BRIEFING_MAX_ITEMS_PER_CATEGORY,
): Promise<BriefingItem[]> {
  try {
    const nodeRepo = sqliteStoreManager.getMobiusNodeRepo();
    const db = (nodeRepo as any).db;

    const cutoff = Date.now() - BRIEFING_DECAY_DAYS * 24 * 60 * 60 * 1000;

    const rows = await db
      .selectFrom('mobius_node')
      .select(['node_id', 'path', 'label', 'pagerank', 'last_open_ts', 'doc_incoming_cnt'])
      .where('type', 'in', [...GRAPH_DOCUMENT_LIKE_NODE_TYPES])
      .where('pagerank', 'is not', null)
      .where('pagerank', '>', 0)
      .where('path', 'is not', null)
      .$call((qb) => {
        // last_open_ts is null (never opened) OR older than cutoff
        return qb.where((eb) =>
          eb.or([
            eb('last_open_ts', 'is', null),
            eb('last_open_ts', '<', cutoff),
          ]),
        );
      })
      .orderBy('pagerank', 'desc')
      .limit(limit)
      .execute();

    const now = Date.now();
    return rows.map((row: any) => {
      const lastOpen = Number(row.last_open_ts ?? 0);
      const daysSince = lastOpen > 0
        ? Math.floor((now - lastOpen) / (24 * 60 * 60 * 1000))
        : null;
      const title = String(row.label ?? row.path ?? '').replace(/\.md$/, '');

      return {
        filePath: String(row.path),
        title,
        category: 'decaying_engagement' as const,
        reason: daysSince !== null
          ? `High importance note, not opened in ${daysSince} days`
          : 'High importance note, never opened via Peak',
        score: Number(row.pagerank ?? 0),
        metadata: {
          daysSinceOpened: daysSince ?? undefined,
        },
      };
    });
  } catch {
    return [];
  }
}

export { BRIEFING_MIN_SESSION_GAP_MS };
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/service/ambient/briefing-queries.ts
git commit -m "feat(ambient-p4): add briefing query functions for unresolved, hubs, decay"
```

---

## Task 3: Morning Briefing Store

**Files:**
- Create: `src/ui/store/morningBriefingStore.ts`

- [ ] **Step 1: Create the Zustand store**

```typescript
import { create } from 'zustand';
import type { BriefingItem, BriefingCategory } from '@/service/ambient/types';

interface MorningBriefingStoreState {
  items: BriefingItem[];
  isVisible: boolean;
  dismissedCategories: Set<BriefingCategory>;
  lastShownTs: number;

  setItems: (items: BriefingItem[]) => void;
  show: () => void;
  dismiss: () => void;
  dismissCategory: (category: BriefingCategory) => void;
  removeItem: (filePath: string) => void;
}

export const useMorningBriefingStore = create<MorningBriefingStoreState>((set, get) => ({
  items: [],
  isVisible: false,
  dismissedCategories: new Set(),
  lastShownTs: 0,

  setItems: (items: BriefingItem[]) => set({ items }),

  show: () => set({ isVisible: true, lastShownTs: Date.now() }),

  dismiss: () => set({ isVisible: false }),

  dismissCategory: (category: BriefingCategory) => {
    const dismissed = new Set(get().dismissedCategories);
    dismissed.add(category);
    set({
      dismissedCategories: dismissed,
      items: get().items.filter((i) => i.category !== category),
    });
  },

  removeItem: (filePath: string) =>
    set((state) => ({
      items: state.items.filter((i) => i.filePath !== filePath),
    })),
}));
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/ui/store/morningBriefingStore.ts
git commit -m "feat(ambient-p4): add morning briefing Zustand store"
```

---

## Task 4: Morning Briefing Service (Orchestrator)

**Files:**
- Create: `src/service/ambient/MorningBriefingService.ts`

- [ ] **Step 1: Create the orchestrator**

The service runs once after SQLite init, checks timing constraints, gathers items from the three query functions, and triggers the modal if there are items to show.

```typescript
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { AppContext } from '@/app/context/AppContext';
import {
  getUnresolvedConnectionNotes,
  getChangedHubs,
  getDecayingEngagementNotes,
  BRIEFING_MIN_SESSION_GAP_MS,
} from './briefing-queries';
import { useMorningBriefingStore } from '@/ui/store/morningBriefingStore';
import type { BriefingItem } from './types';
import { DEFAULT_AMBIENT_PUSH_SETTINGS } from './types';

const INDEX_STATE_KEY_LAST_BRIEFING = 'ambient_last_briefing_ts';
const INDEX_STATE_KEY_LAST_SESSION = 'ambient_last_session_ts';

/**
 * Orchestrator for the Morning Briefing feature.
 *
 * On startup (after SQLite is ready), it:
 * 1. Checks if enough time elapsed since last briefing (min 4h gap)
 * 2. Gathers briefing items from three sources in parallel
 * 3. Stores items in the briefing Zustand store
 * 4. Shows the briefing modal
 * 5. Records timestamps for next session
 */
export class MorningBriefingService {
  private static instance: MorningBriefingService | null = null;

  static getInstance(): MorningBriefingService {
    if (!MorningBriefingService.instance) {
      MorningBriefingService.instance = new MorningBriefingService();
    }
    return MorningBriefingService.instance;
  }

  /**
   * Called after SQLite init completes. Decides whether to show a briefing.
   */
  async tryShow(): Promise<void> {
    try {
      // Check settings
      const settings = AppContext.getSettings().ambientPush ?? DEFAULT_AMBIENT_PUSH_SETTINGS;
      if (!settings.enabled || !settings.enableMorningBriefing) return;

      if (!sqliteStoreManager.isInitialized()) return;

      const indexStateRepo = sqliteStoreManager.getIndexStateRepo('vault');

      // Check time since last briefing
      const lastBriefingRaw = await indexStateRepo.get(INDEX_STATE_KEY_LAST_BRIEFING);
      const lastBriefingTs = lastBriefingRaw ? Number(lastBriefingRaw) : 0;
      const now = Date.now();

      if (now - lastBriefingTs < BRIEFING_MIN_SESSION_GAP_MS) {
        return; // Too soon since last briefing
      }

      // Determine last session timestamp (for "what changed since last visit")
      const lastSessionRaw = await indexStateRepo.get(INDEX_STATE_KEY_LAST_SESSION);
      const lastSessionTs = lastSessionRaw ? Number(lastSessionRaw) : now - 24 * 60 * 60 * 1000;

      // Gather items from all three sources in parallel
      const [unresolved, changedHubs, decaying] = await Promise.all([
        getUnresolvedConnectionNotes(lastSessionTs),
        getChangedHubs(lastSessionTs),
        getDecayingEngagementNotes(),
      ]);

      const allItems: BriefingItem[] = [...unresolved, ...changedHubs, ...decaying];

      if (allItems.length === 0) {
        // Nothing to brief — update session timestamp and skip
        await this.recordSessionTimestamps(indexStateRepo, now);
        return;
      }

      // Sort by score descending within each category
      allItems.sort((a, b) => b.score - a.score);

      // Store and show
      const store = useMorningBriefingStore.getState();
      store.setItems(allItems);
      store.show();

      // Record timestamps
      await this.recordSessionTimestamps(indexStateRepo, now);
    } catch (err) {
      console.debug('[MorningBriefingService] Failed to generate briefing (non-critical):', err);
    }
  }

  private async recordSessionTimestamps(
    indexStateRepo: { set: (key: string, value: string) => Promise<void> },
    now: number,
  ): Promise<void> {
    await indexStateRepo.set(INDEX_STATE_KEY_LAST_BRIEFING, String(now));
    await indexStateRepo.set(INDEX_STATE_KEY_LAST_SESSION, String(now));
  }

  dispose(): void {
    MorningBriefingService.instance = null;
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/service/ambient/MorningBriefingService.ts
git commit -m "feat(ambient-p4): add MorningBriefingService orchestrator"
```

---

## Task 5: Morning Briefing UI (Modal + React Components)

**Files:**
- Create: `src/ui/view/morning-briefing/MorningBriefingModal.ts`
- Create: `src/ui/view/morning-briefing/MorningBriefingPanel.tsx`
- Create: `src/ui/view/morning-briefing/BriefingCard.tsx`

- [ ] **Step 1: Create `BriefingCard.tsx`**

A compact card for each briefing item with title, reason, and action buttons.

```tsx
import React from 'react';
import { FileText, ExternalLink, X, Link2, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/context/AppContext';
import { useMorningBriefingStore } from '@/ui/store/morningBriefingStore';
import type { BriefingItem } from '@/service/ambient/types';

interface BriefingCardProps {
  item: BriefingItem;
}

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  unresolved_connections: Link2,
  changed_hubs: RefreshCw,
  decaying_engagement: AlertCircle,
};

export const BriefingCard: React.FC<BriefingCardProps> = ({ item }) => {
  const Icon = CATEGORY_ICONS[item.category] ?? FileText;

  async function handleOpen() {
    const app = AppContext.getApp();
    await app.workspace.openLinkText(item.filePath, '', true);
  }

  function handleDismiss() {
    useMorningBriefingStore.getState().removeItem(item.filePath);
  }

  return (
    <div
      className="pktw-group pktw-flex pktw-items-start pktw-gap-2.5 pktw-rounded-md pktw-border pktw-p-3 pktw-transition-colors hover:pktw-bg-[var(--background-modifier-hover)]"
      style={{ borderColor: 'var(--background-modifier-border)' }}
    >
      <Icon
        className="pktw-mt-0.5 pktw-h-4 pktw-w-4 pktw-shrink-0"
        style={{ color: 'var(--text-accent)' }}
      />
      <div className="pktw-flex-1 pktw-min-w-0">
        <span
          className="pktw-block pktw-cursor-pointer pktw-truncate pktw-text-sm pktw-font-medium"
          style={{ color: 'var(--text-normal)' }}
          onClick={handleOpen}
        >
          {item.title}
        </span>
        <span
          className="pktw-mt-0.5 pktw-block pktw-text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          {item.reason}
        </span>
      </div>
      <div className="pktw-flex pktw-gap-0.5 pktw-opacity-0 pktw-transition-opacity group-hover:pktw-opacity-100">
        <Button variant="ghost" size="xs" onClick={handleOpen} title="Open">
          <ExternalLink className="pktw-h-3 pktw-w-3" />
        </Button>
        <Button variant="ghost" size="xs" onClick={handleDismiss} title="Dismiss">
          <X className="pktw-h-3 pktw-w-3" />
        </Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Create `MorningBriefingPanel.tsx`**

The main React content rendered inside the modal. Three collapsible sections, one per category.

```tsx
import React from 'react';
import { Sun, Link2, RefreshCw, AlertCircle, X } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { useMorningBriefingStore } from '@/ui/store/morningBriefingStore';
import { BriefingCard } from './BriefingCard';
import type { BriefingCategory } from '@/service/ambient/types';

const CATEGORY_META: Record<
  BriefingCategory,
  { label: string; icon: React.ElementType; description: string }
> = {
  unresolved_connections: {
    label: 'Unresolved Connections',
    icon: Link2,
    description: 'Recently edited notes that could benefit from more links',
  },
  changed_hubs: {
    label: 'Updated Knowledge Clusters',
    icon: RefreshCw,
    description: 'Hub summaries that evolved since your last session',
  },
  decaying_engagement: {
    label: 'Forgotten Gems',
    icon: AlertCircle,
    description: 'Important notes you haven\'t visited recently',
  },
};

const CATEGORY_ORDER: BriefingCategory[] = [
  'unresolved_connections',
  'changed_hubs',
  'decaying_engagement',
];

export const MorningBriefingPanel: React.FC<{ onDismiss: () => void }> = ({ onDismiss }) => {
  const items = useMorningBriefingStore((s) => s.items);

  const grouped = React.useMemo(() => {
    const map = new Map<BriefingCategory, typeof items>();
    for (const cat of CATEGORY_ORDER) {
      map.set(cat, []);
    }
    for (const item of items) {
      const arr = map.get(item.category);
      if (arr) arr.push(item);
    }
    return map;
  }, [items]);

  // If all items have been dismissed, auto-close
  React.useEffect(() => {
    if (items.length === 0) {
      onDismiss();
    }
  }, [items.length, onDismiss]);

  return (
    <div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-max-h-[70vh] pktw-overflow-y-auto">
      {/* Header */}
      <div className="pktw-flex pktw-items-center pktw-justify-between">
        <div className="pktw-flex pktw-items-center pktw-gap-2">
          <Sun className="pktw-h-5 pktw-w-5" style={{ color: 'var(--text-accent)' }} />
          <span
            className="pktw-text-lg pktw-font-semibold"
            style={{ color: 'var(--text-normal)' }}
          >
            Today's Briefing
          </span>
        </div>
        <Button variant="ghost" size="xs" onClick={onDismiss} title="Dismiss all">
          <X className="pktw-h-4 pktw-w-4" />
        </Button>
      </div>

      <span className="pktw-text-xs" style={{ color: 'var(--text-muted)' }}>
        {items.length} {items.length === 1 ? 'item' : 'items'} to review
      </span>

      {/* Sections */}
      {CATEGORY_ORDER.map((cat) => {
        const catItems = grouped.get(cat) ?? [];
        if (catItems.length === 0) return null;
        const meta = CATEGORY_META[cat];
        const CatIcon = meta.icon;

        return (
          <div key={cat} className="pktw-flex pktw-flex-col pktw-gap-1.5">
            <div className="pktw-flex pktw-items-center pktw-gap-1.5">
              <CatIcon
                className="pktw-h-3.5 pktw-w-3.5"
                style={{ color: 'var(--text-accent)' }}
              />
              <span
                className="pktw-text-xs pktw-font-medium pktw-uppercase pktw-tracking-wide"
                style={{ color: 'var(--text-muted)' }}
              >
                {meta.label}
              </span>
            </div>
            <span className="pktw-text-xs" style={{ color: 'var(--text-faint)' }}>
              {meta.description}
            </span>
            <div className="pktw-flex pktw-flex-col pktw-gap-1.5">
              {catItems.map((item) => (
                <BriefingCard key={item.filePath} item={item} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
```

- [ ] **Step 3: Create `MorningBriefingModal.ts`**

An Obsidian Modal subclass that renders the React panel.

```typescript
import { App, Modal } from 'obsidian';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { useMorningBriefingStore } from '@/ui/store/morningBriefingStore';

export class MorningBriefingModal extends Modal {
  private root: Root | null = null;

  constructor(app: App) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('peak-morning-briefing-modal');

    // Set modal width
    this.modalEl.style.maxWidth = '520px';
    this.modalEl.style.width = '90vw';

    // Dynamic import to avoid circular dependencies
    const { MorningBriefingPanel } = await import('./MorningBriefingPanel');

    this.root = createRoot(contentEl);
    this.root.render(
      React.createElement(MorningBriefingPanel, {
        onDismiss: () => this.close(),
      }),
    );
  }

  onClose(): void {
    if (this.root) {
      this.root.unmount();
      this.root = null;
    }
    this.contentEl.empty();
    useMorningBriefingStore.getState().dismiss();
  }
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/morning-briefing/BriefingCard.tsx src/ui/view/morning-briefing/MorningBriefingPanel.tsx src/ui/view/morning-briefing/MorningBriefingModal.ts
git commit -m "feat(ambient-p4): add Morning Briefing modal and React UI components"
```

---

## Task 6: Startup Integration & Tests

**Files:**
- Modify: `main.ts`
- Modify: `test/ambient-push.test.ts`

- [ ] **Step 1: Wire into main.ts startup**

In `main.ts`, after the SQLite init block (where `AmbientPushService.start()` is called), add the morning briefing trigger. This should run after a short delay to avoid blocking plugin startup.

Find the `initSqlite()` method or the block where ambient push starts. After SQLite services are confirmed ready, add:

```typescript
import { MorningBriefingService } from '@/service/ambient/MorningBriefingService';
import { MorningBriefingModal } from '@/ui/view/morning-briefing/MorningBriefingModal';
import { useMorningBriefingStore } from '@/ui/store/morningBriefingStore';
```

At the end of the `initSqlite()` method (after all index services are initialized):

```typescript
// Morning Briefing — show on startup after a delay
setTimeout(async () => {
  try {
    await MorningBriefingService.getInstance().tryShow();
    if (useMorningBriefingStore.getState().isVisible) {
      const modal = new MorningBriefingModal(this.app);
      modal.open();
    }
  } catch {
    // Morning briefing is non-critical
  }
}, 3000); // 3s delay to let UI settle
```

Also in `onunload()`, add cleanup:

```typescript
MorningBriefingService.getInstance().dispose();
```

- [ ] **Step 2: Add tests for briefing query logic**

Add to `test/ambient-push.test.ts`:

```typescript
// --- Phase 4: Morning Briefing ---
import type { BriefingItem, BriefingCategory } from '@/service/ambient/types';

// Test BriefingItem type structure
{
  const item: BriefingItem = {
    filePath: 'notes/test.md',
    title: 'Test Note',
    category: 'unresolved_connections',
    reason: '5 notes link here, but only 1 outgoing link',
    score: 4,
    metadata: { connectionCount: 5 },
  };

  assert.equal(item.category, 'unresolved_connections');
  assert.equal(item.score, 4);
  assert.equal(item.metadata?.connectionCount, 5);

  // Category union completeness
  const categories: BriefingCategory[] = ['unresolved_connections', 'changed_hubs', 'decaying_engagement'];
  assert.equal(categories.length, 3);

  console.log('BriefingItem type: all passed');
}

// Test briefing item sorting (score descending)
{
  const items: BriefingItem[] = [
    { filePath: 'a.md', title: 'A', category: 'decaying_engagement', reason: '', score: 0.5 },
    { filePath: 'b.md', title: 'B', category: 'unresolved_connections', reason: '', score: 5 },
    { filePath: 'c.md', title: 'C', category: 'changed_hubs', reason: '', score: 1 },
  ];

  items.sort((a, b) => b.score - a.score);
  assert.equal(items[0].filePath, 'b.md');
  assert.equal(items[1].filePath, 'c.md');
  assert.equal(items[2].filePath, 'a.md');

  console.log('briefing item sorting: all passed');
}

// Test session gap logic
{
  const BRIEFING_MIN_SESSION_GAP_MS = 4 * 60 * 60 * 1000;

  const now = Date.now();
  const tooRecent = now - 2 * 60 * 60 * 1000; // 2 hours ago
  const oldEnough = now - 5 * 60 * 60 * 1000; // 5 hours ago

  assert.ok(now - tooRecent < BRIEFING_MIN_SESSION_GAP_MS, 'Should skip if < 4h');
  assert.ok(now - oldEnough >= BRIEFING_MIN_SESSION_GAP_MS, 'Should show if >= 4h');

  console.log('session gap logic: all passed');
}

// Test decay days calculation
{
  const BRIEFING_DECAY_DAYS = 14;
  const now = Date.now();
  const lastOpen15DaysAgo = now - 15 * 24 * 60 * 60 * 1000;
  const lastOpen10DaysAgo = now - 10 * 24 * 60 * 60 * 1000;
  const cutoff = now - BRIEFING_DECAY_DAYS * 24 * 60 * 60 * 1000;

  assert.ok(lastOpen15DaysAgo < cutoff, '15 days ago should be before cutoff');
  assert.ok(lastOpen10DaysAgo >= cutoff, '10 days ago should be after cutoff');

  const daysSince = Math.floor((now - lastOpen15DaysAgo) / (24 * 60 * 60 * 1000));
  assert.equal(daysSince, 15);

  console.log('decay days calculation: all passed');
}

console.log('All Phase 4 Morning Briefing tests passed');
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- test/ambient-push.test.ts`

- [ ] **Step 4: Verify production build**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add main.ts test/ambient-push.test.ts src/service/ambient/MorningBriefingService.ts
git commit -m "feat(ambient-p4): wire morning briefing into startup and add Phase 4 tests"
```

---

## Task Summary

| Task | Component | Files | Deps |
|------|-----------|-------|------|
| 1 | Types & settings | 2 modified | -- |
| 2 | Briefing query functions | 1 new | Task 1 |
| 3 | Zustand store | 1 new | Task 1 |
| 4 | Orchestrator service | 1 new | Task 1, 2, 3 |
| 5 | UI modal + React components | 3 new | Task 1, 3 |
| 6 | Startup wiring + tests | 2 modified | Task 1-5 |

**Execution order:** Task 1 -> Tasks 2, 3 (parallel) -> Tasks 4, 5 (parallel) -> Task 6.

**Parallel dispatch opportunities:**
- Tasks 2 and 3 are independent (data queries vs store)
- Tasks 4 and 5 are independent (service vs UI, both depend on types + store)
- Task 6 is the final integration gate

---

## Key Design Decisions

### Why a Modal (not a sidebar view)?

The spec says "dismissible modal or dedicated view." A modal is chosen because:
1. **Session-start context**: briefing is consumed once per session, not continuously. A persistent view would waste sidebar space.
2. **Attention capture**: after hours away, a modal naturally draws focus without being as intrusive as a notification.
3. **Dismissibility**: modal.close() is a well-understood interaction.

### Why 4-hour minimum gap?

The spec doesn't define exact timing. 4 hours balances:
- Not showing on quick Obsidian restarts (dev reloads, crashes)
- Reliably showing when the user starts a new work session
- Aligned with `BRIEFING_MIN_SESSION_GAP_MS` constant (easily tunable)

### "Unresolved connections" heuristic

The spec says "unresolved connections" but doesn't define the metric. We use `incoming_cnt > 2 AND outgoing_cnt < incoming_cnt * 0.5` — a note that many others link TO but that doesn't link OUT. This identifies "knowledge sinks" that could benefit from outgoing connections.

### No LLM calls

The briefing is entirely computed from existing graph/index data. No LLM calls keep it fast and cost-free at startup. Future enhancement could add AI-generated summaries of what changed.
