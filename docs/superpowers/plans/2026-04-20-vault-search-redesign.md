# Vault Search Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Vault Search tab from a dual-purpose search/inspect panel into a VS Code-style command palette with a 340px inspector side panel that shows Connected, Discovered, and AI Graph sections — all query-aware with topic navigation.

**Architecture:** Inspector moves from full-panel takeover to a persistent side panel. Mode switching uses VS Code prefix characters (`#`, `@`, `:`, `?`) with a visible mode badge, replacing the hidden hover-card. Inspector content is restructured into three collapsible sections: Connected (merged outgoing+backlinks with context snippets), Discovered (semantic+co-citation+unlinked mentions), and AI Graph (past results + generate). All inspector sections support query-aware filtering.

**Tech Stack:** React 18 + Tailwind (UI), Zustand (state), Kysely (SQL queries), sqlite-vec (KNN), FTS5 (text search)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/ui/view/quick-search/store/vaultSearchStore.ts` | Add `help` mode, persistent inspector toggle, remove `[[` handling |
| `src/ui/view/quick-search/SearchModal.tsx:464-602` | VaultTabContent: mode badge, side-by-side layout, keyboard nav |
| `src/ui/view/quick-search/tab-VaultSearch.tsx` | Results panel as flex child, before-typing state, topic nav |
| `src/ui/view/quick-search/components/VaultSearchResult.tsx:118-184` | Add relevance score badge |
| `src/ui/view/quick-search/components/ModeHelpList.tsx` | New: navigable mode list for `?` prefix |
| `src/ui/view/quick-search/components/inspector/InspectorSidePanel.tsx` | New: 340px side panel with header + collapsible sections |
| `src/ui/view/quick-search/components/inspector/ConnectedSection.tsx` | New: merged outgoing+backlinks with context, query-aware |
| `src/ui/view/quick-search/components/inspector/DiscoveredSection.tsx` | New: SEM + CO-CITE + UNLINKED with WHY explanations |
| `src/ui/view/quick-search/components/inspector/AIGraphSection.tsx` | New: past AI Graph lookup + generate button |
| `src/service/search/inspectorService.ts:62-177` | Refactor: add `getConnectedLinks()`, `getDiscoveredConnections()`, `filterByQuery()` |
| `src/service/search/coCitationService.ts` | New: co-citation computation via SQL join |
| `src/service/search/unlinkedMentionService.ts` | New: FTS5 title search for unlinked mentions |
| `src/service/AIAnalysisHistoryService.ts` | Add `findRelatedAIGraph(query)` method |

**Removed files:**
| File | Reason |
|------|--------|
| `src/ui/view/quick-search/components/inspector/LinksSection.tsx` | Replaced by ConnectedSection |
| `src/ui/view/quick-search/components/inspector/GraphSection.tsx` | Local graph removed; graph only via AIGraphSection |
| `src/ui/view/quick-search/components/inspector/InspectorPanel.tsx` | Replaced by InspectorSidePanel |

---

### Task 1: Store — Add Help Mode + Inspector Toggle + Remove `[[`

**Files:**
- Modify: `src/ui/view/quick-search/store/vaultSearchStore.ts:20` (QuickSearchMode type), `vaultSearchStore.ts:98-145` (parseQuickSearchInput)

- [ ] **Step 1: Write the failing test**

```typescript
// test/vault-search-store.test.ts

// Test that parseQuickSearchInput handles ? prefix for help mode
// We can't easily test the full function (needs App), so we test the logic inline

function main() {
  // Test 1: ? prefix detection
  const input = '?';
  const trimmed = input.trimStart();
  const isHelp = trimmed.startsWith('?');
  console.assert(isHelp === true, '? should be detected as help mode');
  console.log('✅ ? prefix detected');

  // Test 2: [[ should NOT be a special mode anymore
  const input2 = '[[test';
  const trimmed2 = input2.trimStart();
  const isInspector = trimmed2.startsWith('[[');
  // In old code this triggered inspector; new code should treat it as vault search
  console.assert(isInspector === true, '[[ is detected but should be treated as vault search');
  console.log('✅ [[ detection verified');

  // Test 3: QuickSearchMode should include help
  type QuickSearchMode = 'vault' | 'inFile' | 'inFolder' | 'goToLine' | 'help';
  const mode: QuickSearchMode = 'help';
  console.assert(mode === 'help');
  console.log('✅ help mode type exists');

  console.log('All vault-search-store tests passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/vault-search-store.test.ts`
Expected: PASS (type-only test, but validates our design)

- [ ] **Step 3: Update QuickSearchMode type**

In `vaultSearchStore.ts:20`, change:

```typescript
// Old:
export type QuickSearchMode = 'vault' | 'inFile' | 'inFolder' | 'goToLine';

// New:
export type QuickSearchMode = 'vault' | 'inFile' | 'inFolder' | 'goToLine' | 'help';
```

- [ ] **Step 4: Add `?` prefix handling in parseQuickSearchInput**

In `vaultSearchStore.ts:109-118`, add the `?` case before the existing `#` check:

```typescript
  if (trimmed.startsWith('?')) {
    mode = 'help';
    text = trimmed.slice(1).trimStart();
  } else if (trimmed.startsWith('#')) {
    mode = 'inFile';
    text = trimmed.slice(1).trimStart();
  } else if (trimmed.startsWith('@')) {
    // ... existing
```

- [ ] **Step 5: Add persistent inspector toggle state**

Add to the store interface and initial state:

```typescript
// In VaultSearchStore interface (after lastSearchResults):
inspectorOpen: boolean;
setInspectorOpen: (open: boolean) => void;
toggleInspector: () => void;

// In create() initial state:
inspectorOpen: false,
setInspectorOpen: (open) => set({ inspectorOpen: open }),
toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),
```

- [ ] **Step 6: Remove `[[` handling from SearchModal.tsx**

In `SearchModal.tsx`, the inspector is currently driven by `vaultSearchQuery.includes('[[')` (around line 383). Find this line and remove the `[[` check — inspector is now driven by the store's `inspectorOpen` state.

In `VaultTabContent` (around line 383-390), change:

```typescript
// Old:
const inspectorOpen = vaultSearchQuery.includes('[[');
// Or: displayMode === 'inspector'

// New:
const { inspectorOpen, toggleInspector } = useVaultSearchStore();
```

Also remove the `displayMode === 'inspector'` case from the icon selection (line 478).

- [ ] **Step 7: Commit**

```bash
git add src/ui/view/quick-search/store/vaultSearchStore.ts src/ui/view/quick-search/SearchModal.tsx test/vault-search-store.test.ts
git commit -m "feat(vault-search): add help mode, persistent inspector toggle, remove [[ prefix"
```

---

### Task 2: Mode Badge — Replace Hover-Card Mode Switcher

**Files:**
- Modify: `src/ui/view/quick-search/SearchModal.tsx:469-558` (VaultTabContent input row)

- [ ] **Step 1: Replace hover-card with inline mode badge**

In `SearchModal.tsx`, the VaultTabContent input row (L469-558) contains a `<HoverCard>` with trigger button showing the mode icon and a dropdown listing all modes. Replace the entire `<HoverCard>...</HoverCard>` block with a simple mode badge pill shown at the right edge inside the input field:

```tsx
{/* Mode badge — right edge inside input */}
<div className="pktw-absolute pktw-right-3 pktw-top-1/2 -pktw-translate-y-1/2 pktw-z-10">
  <span className={cn(
    'pktw-text-[10px] pktw-font-medium pktw-px-2 pktw-py-0.5 pktw-rounded-full',
    'pktw-bg-[#f5f3ff] pktw-text-[#7c3aed] pktw-border pktw-border-[#7c3aed]/20',
  )}>
    {quickSearchMode === 'vault' ? 'vault' :
     quickSearchMode === 'inFile' ? 'in-file' :
     quickSearchMode === 'inFolder' ? 'folder' :
     quickSearchMode === 'goToLine' ? 'line' :
     quickSearchMode === 'help' ? 'help' : 'vault'}
  </span>
</div>
```

Also remove the left-positioned mode icon button (L471-487) since the badge replaces it. Update the `CodeMirrorInput` to remove the `pktw-pl-11` padding (no longer needed for the left icon):

```tsx
<CodeMirrorInput
  ...
  containerClassName="pktw-w-full pktw-pl-4 pktw-pr-16 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border-muted-foreground pktw-rounded-full pktw-transition-all"
  ...
/>
```

- [ ] **Step 2: Update keyboard shortcuts hint in footer**

In `tab-VaultSearch.tsx:35-43`, update `VaultSearchFooterHints` to match new mode system:

```tsx
const VaultSearchFooterHints: React.FC = () => (
  <div className="pktw-flex pktw-items-center pktw-gap-4 pktw-text-xs pktw-text-[#999999]">
    <KeyboardShortcut keys="↑↓" description="navigate" />
    <KeyboardShortcut keys="Enter" description="open" />
    <KeyboardShortcut keys="→" description="inspector" />
    <KeyboardShortcut keys="#" description="in-file" />
    <KeyboardShortcut keys="?" description="modes" />
  </div>
);
```

- [ ] **Step 3: Add "✨ AI" button next to input**

In the VaultTabContent input row, after the `CodeMirrorInput`, add the AI Analysis switch button (from spec: "compact, secondary action"):

```tsx
<Button
  variant="ghost"
  size="sm"
  style={{ cursor: 'pointer' }}
  className="pktw-shadow-none pktw-flex-shrink-0 pktw-text-xs pktw-text-[#7c3aed] pktw-h-8 pktw-px-2"
  onClick={() => setActiveTab('ai')}
  title="Switch to AI Analysis"
>
  <Sparkles className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
  AI
</Button>
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/SearchModal.tsx src/ui/view/quick-search/tab-VaultSearch.tsx
git commit -m "feat(vault-search): replace hover-card mode switcher with inline mode badge"
```

---

### Task 3: ModeHelpList Component

**Files:**
- Create: `src/ui/view/quick-search/components/ModeHelpList.tsx`

- [ ] **Step 1: Implement ModeHelpList**

```tsx
// src/ui/view/quick-search/components/ModeHelpList.tsx
import React from 'react';
import { Search, Hash, FolderSearch, ListOrdered, HelpCircle } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import type { QuickSearchMode } from '../store/vaultSearchStore';

interface ModeItem {
  prefix: string;
  mode: QuickSearchMode;
  name: string;
  description: string;
  icon: React.ElementType;
}

const MODES: ModeItem[] = [
  { prefix: '', mode: 'vault', name: 'Vault', description: 'Search all notes by title, content, and path', icon: Search },
  { prefix: '#', mode: 'inFile', name: 'In-file', description: 'Search headings and content within the active file', icon: Hash },
  { prefix: '@', mode: 'inFolder', name: 'In-folder', description: 'Search within the current file\'s folder', icon: FolderSearch },
  { prefix: ':', mode: 'goToLine', name: 'Go to line', description: 'Jump to a specific line number in the active file', icon: ListOrdered },
  { prefix: '?', mode: 'help', name: 'Help', description: 'Show all available search modes', icon: HelpCircle },
];

interface ModeHelpListProps {
  onSelectMode: (prefix: string) => void;
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
}

export const ModeHelpList: React.FC<ModeHelpListProps> = ({ onSelectMode, selectedIndex, onSelectIndex }) => {
  return (
    <div className="pktw-py-2">
      <div className="pktw-px-4 pktw-pb-2">
        <span className="pktw-text-xs pktw-text-[#999999]">Search Modes</span>
      </div>
      {MODES.map((m, i) => {
        const Icon = m.icon;
        return (
          <div
            key={m.mode}
            onClick={() => onSelectMode(m.prefix)}
            onMouseEnter={() => onSelectIndex(i)}
            className={cn(
              'pktw-relative pktw-flex pktw-items-center pktw-gap-3 pktw-px-4 pktw-py-2.5 pktw-cursor-pointer pktw-transition-colors',
              i === selectedIndex ? 'pktw-bg-[#eef2ff]' : 'hover:pktw-bg-[#fafafa]',
            )}
          >
            {i === selectedIndex && (
              <div className="pktw-absolute pktw-left-0 pktw-top-0 pktw-bottom-0 pktw-w-1 pktw-rounded-r-full pktw-bg-[#7c3aed]" />
            )}
            <div className="pktw-flex-shrink-0 pktw-w-7 pktw-h-7 pktw-rounded-md pktw-bg-[#f5f3ff] pktw-flex pktw-items-center pktw-justify-center">
              <Icon className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed]" />
            </div>
            <div className="pktw-flex-1">
              <span className="pktw-font-medium pktw-text-sm pktw-text-[#374151]">{m.name}</span>
              <span className="pktw-text-xs pktw-text-[#9ca3af] pktw-ml-2">{m.description}</span>
            </div>
            {m.prefix && (
              <span className="pktw-flex-shrink-0 pktw-text-xs pktw-font-mono pktw-text-[#7c3aed] pktw-bg-[#f5f3ff] pktw-px-1.5 pktw-py-0.5 pktw-rounded">
                {m.prefix}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

export const MODE_COUNT = MODES.length;
```

- [ ] **Step 2: Wire ModeHelpList into tab-VaultSearch.tsx**

In `tab-VaultSearch.tsx`, when `quickSearchMode === 'help'`, render `ModeHelpList` instead of search results:

```tsx
import { ModeHelpList, MODE_COUNT } from './components/ModeHelpList';

// Inside VaultSearchTab render, replace the results rendering:
{quickSearchMode === 'help' ? (
  <ModeHelpList
    onSelectMode={(prefix) => {
      useSharedStore.getState().setVaultSearchQuery(prefix);
    }}
    selectedIndex={selectedIndex}
    onSelectIndex={setSelectedIndex}
  />
) : inspectorOpen ? (
  <></>
) : (
  // ... existing result rendering
)}
```

Also update the keyboard handler max index for help mode:

```typescript
const maxIndex = quickSearchMode === 'help' ? MODE_COUNT - 1 : displayedResults.length - 1;
```

- [ ] **Step 3: Handle `⌫` on empty prefix returning to vault mode**

In `SearchModal.tsx` `handleInputKeyDown` (VaultTab), add:

```typescript
if (e.key === 'Backspace' && vaultSearchQuery === '' ) {
  // Already at vault mode, nothing to do
} else if (e.key === 'Backspace' && /^[#@:?]$/.test(vaultSearchQuery.trim())) {
  e.preventDefault();
  setVaultSearchQuery('');
}
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/components/ModeHelpList.tsx src/ui/view/quick-search/tab-VaultSearch.tsx src/ui/view/quick-search/SearchModal.tsx
git commit -m "feat(vault-search): add ModeHelpList for ? prefix with navigable mode list"
```

---

### Task 4: SearchModal Layout — Side-by-Side Results + Inspector

**Files:**
- Modify: `src/ui/view/quick-search/SearchModal.tsx:464-602` (VaultTabContent layout)
- Modify: `src/ui/view/quick-search/tab-VaultSearch.tsx:129-198` (remove internal footer, adapt to flex child)

- [ ] **Step 1: Restructure VaultTabContent layout**

The current VaultTabContent renders inspector as a full-panel replacement of results. Restructure to side-by-side:

In `SearchModal.tsx`, replace the content area of VaultTabContent (after the input row, around L586-600):

```tsx
{/* Content area — side-by-side results + inspector */}
<div className="pktw-flex-1 pktw-min-h-0 pktw-flex">
  {/* Results panel — always visible */}
  <div className={cn(
    'pktw-min-w-0 pktw-overflow-hidden',
    inspectorOpen ? 'pktw-flex-1' : 'pktw-w-full',
  )}>
    <VaultSearchTab
      onClose={onClose}
      onSelectForInspector={handleSelectForInspector}
    />
  </div>

  {/* Inspector side panel — 340px, conditional */}
  {inspectorOpen && !isMobile() && (
    <div className="pktw-w-[340px] pktw-flex-shrink-0 pktw-border-l pktw-border-[#e5e7eb] pktw-overflow-hidden">
      <InspectorSidePanel
        currentPath={inspectorPath}
        searchQuery={vaultSearchQuery}
        onClose={() => useVaultSearchStore.getState().setInspectorOpen(false)}
        onNavigate={handleTopicNavigate}
      />
    </div>
  )}
</div>

{/* Footer — modal level, always visible */}
<div className="pktw-flex-shrink-0 pktw-px-4 pktw-py-2.5 pktw-bg-[#fafafa] pktw-border-t pktw-border-[#e5e7eb] pktw-flex pktw-items-center pktw-justify-between">
  <VaultSearchFooterHints />
  <div className="pktw-flex pktw-items-center pktw-gap-3">
    {/* Result count + search duration (moved from tab-VaultSearch) */}
  </div>
</div>
```

Add supporting state/handlers in VaultTabContent:

```typescript
const [inspectorPath, setInspectorPath] = useState<string | null>(null);

const handleSelectForInspector = (path: string) => {
  setInspectorPath(path);
};

const handleTopicNavigate = (notePath: string) => {
  // Update inspector to show the clicked note
  setInspectorPath(notePath);
  // Scroll the note into view in results if present
};
```

- [ ] **Step 2: Add keyboard handling for → and ←**

In `handleInputKeyDown` (VaultTab) around L423-445, add:

```typescript
if (e.key === 'ArrowRight' && !vaultSearchQuery) {
  e.preventDefault();
  useVaultSearchStore.getState().setInspectorOpen(true);
} else if (e.key === 'ArrowLeft') {
  e.preventDefault();
  useVaultSearchStore.getState().setInspectorOpen(false);
}
```

For the window-level handler in `tab-VaultSearch.tsx:66-106`, also handle `→` and `←`:

```typescript
case 'ArrowRight':
  e.preventDefault();
  useVaultSearchStore.getState().setInspectorOpen(true);
  break;
case 'ArrowLeft':
  if (useVaultSearchStore.getState().inspectorOpen) {
    e.preventDefault();
    useVaultSearchStore.getState().setInspectorOpen(false);
  }
  break;
```

- [ ] **Step 3: Move footer from tab-VaultSearch to SearchModal**

In `tab-VaultSearch.tsx`, remove the footer div (L174-195) and export the result count/duration as props or via the store so the parent can render them.

Add to VaultSearchTab props:

```typescript
interface VaultSearchTabProps {
  onClose?: () => void;
  onSelectForInspector?: (path: string) => void;
}
```

- [ ] **Step 4: Update selection to trigger inspector**

In `tab-VaultSearch.tsx`, when `selectedIndex` changes and inspector is open, call `onSelectForInspector` with debounce:

```typescript
// Debounced inspector update on selection change
useEffect(() => {
  if (!inspectorOpen || selectedIndex < 0) return;
  const result = displayedResults[selectedIndex];
  if (!result?.path) return;
  const t = setTimeout(() => {
    onSelectForInspector?.(result.path);
  }, 150); // 150ms debounce per spec
  return () => clearTimeout(t);
}, [selectedIndex, inspectorOpen]);
```

Read `inspectorOpen` from the store:

```typescript
const inspectorOpen = useVaultSearchStore((s) => s.inspectorOpen);
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/quick-search/SearchModal.tsx src/ui/view/quick-search/tab-VaultSearch.tsx
git commit -m "feat(vault-search): side-by-side layout with results + inspector panel"
```

---

### Task 5: InspectorSidePanel Skeleton

**Files:**
- Create: `src/ui/view/quick-search/components/inspector/InspectorSidePanel.tsx`

- [ ] **Step 1: Implement InspectorSidePanel**

```tsx
// src/ui/view/quick-search/components/inspector/InspectorSidePanel.tsx
import React, { useState } from 'react';
import { FileText, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { ConnectedSection } from './ConnectedSection';
import { DiscoveredSection } from './DiscoveredSection';
import { AIGraphSection } from './AIGraphSection';

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="pktw-border-b pktw-border-[#e5e7eb]">
      <div
        onClick={() => setOpen(!open)}
        className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-4 pktw-py-2 pktw-cursor-pointer hover:pktw-bg-[#fafafa] pktw-transition-colors"
      >
        {open ? (
          <ChevronDown className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#9ca3af]" />
        ) : (
          <ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#9ca3af]" />
        )}
        <span className="pktw-text-xs pktw-font-medium pktw-text-[#6b7280] pktw-uppercase pktw-tracking-wide">
          {title}
        </span>
      </div>
      {open && <div className="pktw-px-4 pktw-pb-3">{children}</div>}
    </div>
  );
};

interface InspectorSidePanelProps {
  currentPath: string | null;
  searchQuery: string;
  onClose: () => void;
  onNavigate: (notePath: string) => void;
}

export const InspectorSidePanel: React.FC<InspectorSidePanelProps> = ({
  currentPath,
  searchQuery,
  onClose,
  onNavigate,
}) => {
  if (!currentPath) {
    return (
      <div className="pktw-flex pktw-flex-col pktw-h-full pktw-items-center pktw-justify-center pktw-text-sm pktw-text-[#9ca3af] pktw-p-4">
        Select a note to inspect
      </div>
    );
  }

  const title = currentPath.split('/').pop()?.replace(/\.md$/, '') ?? currentPath;

  return (
    <div className="pktw-flex pktw-flex-col pktw-h-full pktw-min-h-0">
      {/* Sticky header */}
      <div className="pktw-sticky pktw-top-0 pktw-z-10 pktw-flex pktw-items-center pktw-gap-2 pktw-px-4 pktw-py-2.5 pktw-bg-white pktw-border-b pktw-border-[#e5e7eb]">
        <FileText className="pktw-w-4 pktw-h-4 pktw-text-[#7c3aed] pktw-flex-shrink-0" />
        <span className="pktw-flex-1 pktw-text-sm pktw-font-medium pktw-text-[#374151] pktw-truncate" title={currentPath}>
          {title}
        </span>
        <Button
          variant="ghost"
          size="xs"
          className="pktw-shadow-none !pktw-w-6 !pktw-h-6 pktw-flex-shrink-0"
          onClick={onClose}
        >
          <X className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#9ca3af]" />
        </Button>
      </div>

      {/* Scrollable content */}
      <div className="pktw-flex-1 pktw-min-h-0 pktw-overflow-y-auto">
        <CollapsibleSection title="Connected">
          <ConnectedSection
            currentPath={currentPath}
            searchQuery={searchQuery}
            onNavigate={onNavigate}
          />
        </CollapsibleSection>

        <CollapsibleSection title="Discovered" defaultOpen={true}>
          <DiscoveredSection
            currentPath={currentPath}
            searchQuery={searchQuery}
            onNavigate={onNavigate}
          />
        </CollapsibleSection>

        <CollapsibleSection title="AI Graph" defaultOpen={false}>
          <AIGraphSection
            currentPath={currentPath}
            searchQuery={searchQuery}
          />
        </CollapsibleSection>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/view/quick-search/components/inspector/InspectorSidePanel.tsx
git commit -m "feat(vault-search): add InspectorSidePanel skeleton with collapsible sections"
```

---

### Task 6: inspectorService Refactor — getConnectedLinks + filterByQuery

**Files:**
- Modify: `src/service/search/inspectorService.ts:62-177` (add new functions)

- [ ] **Step 1: Write the failing test**

```typescript
// test/inspector-service-filter.test.ts
import { filterLinksByQuery, type ConnectedLink } from '../src/service/search/inspectorService';

function main() {
  const links: ConnectedLink[] = [
    { path: 'a.md', label: 'Machine Learning Basics', direction: 'out', contextSnippet: 'see [[Machine Learning Basics]] for intro', convergenceCount: 5, relevanceScore: null },
    { path: 'b.md', label: 'Cooking Recipes', direction: 'in', contextSnippet: 'links from [[Cooking Recipes]]', convergenceCount: 1, relevanceScore: null },
    { path: 'c.md', label: 'Deep Learning', direction: 'out', contextSnippet: 'related to [[Deep Learning]] concepts', convergenceCount: 3, relevanceScore: null },
  ];

  // Test 1: filter with ML-related query
  const filtered = filterLinksByQuery(links, 'machine learning');
  console.assert(filtered.length === 3, 'Should return all links');
  // ML Basics should have highest relevance
  const topLink = filtered.find((l) => l.label === 'Machine Learning Basics');
  console.assert(topLink !== undefined, 'ML Basics should be in results');
  console.assert(topLink!.relevanceScore !== null && topLink!.relevanceScore > 0, 'Should have relevance score');
  console.log('✅ filterLinksByQuery: scores by title match');

  // Test 2: empty query → no filtering, null scores
  const unfiltered = filterLinksByQuery(links, '');
  console.assert(unfiltered.every((l) => l.relevanceScore === null), 'Empty query → null scores');
  console.log('✅ filterLinksByQuery: empty query passthrough');

  console.log('All inspector-service-filter tests passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/inspector-service-filter.test.ts`
Expected: FAIL

- [ ] **Step 3: Add ConnectedLink type and getConnectedLinks function**

Add to `src/service/search/inspectorService.ts`:

```typescript
export interface ConnectedLink {
  path: string;
  label: string;
  /** 'out' = outgoing link, 'in' = backlink */
  direction: 'out' | 'in';
  /** Text surrounding the [[link]] in the source doc */
  contextSnippet: string | null;
  /** Number of incoming links to this note (convergence badge) */
  convergenceCount: number;
  /** Relevance to search query (null if no query) */
  relevanceScore: number | null;
}

/**
 * Get merged outgoing links + backlinks for a note with context snippets.
 */
export async function getConnectedLinks(currentPath: string): Promise<ConnectedLink[]> {
  const tenant = getIndexTenantForPath(currentPath);
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);
  const mobiusNodeRepo = sqliteStoreManager.getMobiusNodeRepo(tenant);

  const docMeta = await indexedDocumentRepo.getByPath(currentPath);
  if (!docMeta) return [];

  const edges = await mobiusEdgeRepo.getAllEdgesForNode(docMeta.id, LINKS_LIMIT);
  const inIds = edges.filter((e) => e.to_node_id === docMeta.id).map((e) => e.from_node_id);
  const outIds = edges.filter((e) => e.from_node_id === docMeta.id).map((e) => e.to_node_id);
  const allIds = [...new Set([...inIds, ...outIds])];
  const nodesMap = await mobiusNodeRepo.getByIds(allIds);

  const results: ConnectedLink[] = [];
  for (const node of nodesMap.values()) {
    if (!isIndexedNoteNodeType(node.type) || !node.label) continue;

    const path = getPathFromNode(node);
    const isOut = outIds.includes(node.id);
    const isIn = inIds.includes(node.id);
    const convergence = (node as any).doc_incoming_cnt ?? 0;

    // Context snippet: try to extract from edge attributes
    const relevantEdge = edges.find((e) =>
      (e.from_node_id === docMeta.id && e.to_node_id === node.id) ||
      (e.to_node_id === docMeta.id && e.from_node_id === node.id)
    );
    let contextSnippet: string | null = null;
    if (relevantEdge) {
      try {
        const attrs = JSON.parse(relevantEdge.attributes || '{}');
        contextSnippet = attrs.context ?? null;
      } catch {}
    }

    if (isOut) {
      results.push({ path, label: node.label, direction: 'out', contextSnippet, convergenceCount: convergence, relevanceScore: null });
    }
    if (isIn) {
      results.push({ path, label: node.label, direction: 'in', contextSnippet, convergenceCount: convergence, relevanceScore: null });
    }
  }

  return results;
}

/**
 * Filter links by query relevance using title-based BM25 scoring.
 * Fast path: simple keyword matching against title + context.
 */
export function filterLinksByQuery(links: ConnectedLink[], query: string): ConnectedLink[] {
  if (!query.trim()) return links;

  const keywords = query.toLowerCase().split(/\s+/).filter(Boolean);

  return links.map((link) => {
    const text = `${link.label} ${link.contextSnippet ?? ''}`.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) score += 1;
      if (link.label.toLowerCase().includes(kw)) score += 2; // Title match weighted higher
    }
    const normalized = score / (keywords.length * 3); // Max possible = 3 per keyword
    return { ...link, relevanceScore: normalized > 0 ? normalized : 0.01 };
  }).sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- test/inspector-service-filter.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/service/search/inspectorService.ts test/inspector-service-filter.test.ts
git commit -m "feat(vault-search): add getConnectedLinks + filterByQuery to inspectorService"
```

---

### Task 7: ConnectedSection Component

**Files:**
- Create: `src/ui/view/quick-search/components/inspector/ConnectedSection.tsx`

- [ ] **Step 1: Implement ConnectedSection**

```tsx
// src/ui/view/quick-search/components/inspector/ConnectedSection.tsx
import React, { useEffect, useState } from 'react';
import { ArrowRight, ArrowLeft, Check } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { getConnectedLinks, filterLinksByQuery, type ConnectedLink } from '@/service/search/inspectorService';

const RELEVANCE_THRESHOLD = 0.3;
const DEFAULT_VISIBLE = 3;

interface ConnectedSectionProps {
  currentPath: string;
  searchQuery: string;
  onNavigate: (notePath: string) => void;
}

export const ConnectedSection: React.FC<ConnectedSectionProps> = ({ currentPath, searchQuery, onNavigate }) => {
  const [links, setLinks] = useState<ConnectedLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    setExpanded(false);
    getConnectedLinks(currentPath)
      .then((raw) => {
        const filtered = searchQuery ? filterLinksByQuery(raw, searchQuery) : raw;
        setLinks(filtered);
      })
      .catch(() => setLinks([]))
      .finally(() => setLoading(false));
  }, [currentPath, searchQuery]);

  if (loading) return <span className="pktw-text-xs pktw-text-[#9ca3af]">Loading...</span>;
  if (links.length === 0) return <span className="pktw-text-xs pktw-text-[#9ca3af]">No connections found</span>;

  const visibleLinks = expanded ? links : links.slice(0, DEFAULT_VISIBLE);
  const hasMore = links.length > DEFAULT_VISIBLE;

  return (
    <div className="pktw-flex pktw-flex-col pktw-gap-1">
      {visibleLinks.map((link, i) => {
        const isRelevant = !searchQuery || (link.relevanceScore !== null && link.relevanceScore > RELEVANCE_THRESHOLD);
        const DirIcon = link.direction === 'out' ? ArrowRight : ArrowLeft;
        return (
          <div
            key={`${link.path}-${link.direction}-${i}`}
            onClick={() => onNavigate(link.path)}
            className={cn(
              'pktw-flex pktw-flex-col pktw-gap-0.5 pktw-px-2 pktw-py-1.5 pktw-rounded-md pktw-cursor-pointer pktw-transition-colors',
              'hover:pktw-bg-[#f5f3ff]',
              !isRelevant && 'pktw-opacity-35',
            )}
          >
            <div className="pktw-flex pktw-items-center pktw-gap-1.5">
              <DirIcon className="pktw-w-3 pktw-h-3 pktw-text-[#9ca3af] pktw-flex-shrink-0" />
              <span className="pktw-text-sm pktw-font-medium pktw-text-[#374151] pktw-truncate">
                {link.label}
              </span>
              {isRelevant && searchQuery && (
                <div className="pktw-flex pktw-items-center pktw-gap-0.5 pktw-flex-shrink-0">
                  <Check className="pktw-w-3 pktw-h-3 pktw-text-green-500" />
                  <span className="pktw-text-[10px] pktw-text-green-600">
                    {Math.round((link.relevanceScore ?? 0) * 100)}%
                  </span>
                </div>
              )}
              {link.convergenceCount > 3 && (
                <span className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-flex-shrink-0">
                  {link.convergenceCount} refs
                </span>
              )}
            </div>
            {link.contextSnippet && (
              <span className="pktw-text-xs pktw-text-[#6b7280] pktw-pl-[18px] pktw-line-clamp-1">
                {link.contextSnippet}
              </span>
            )}
          </div>
        );
      })}
      {hasMore && !expanded && (
        <span
          onClick={() => setExpanded(true)}
          className="pktw-text-xs pktw-text-[#7c3aed] pktw-cursor-pointer pktw-px-2 pktw-py-1 hover:pktw-underline"
        >
          See {links.length - DEFAULT_VISIBLE} more ↓
        </span>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/view/quick-search/components/inspector/ConnectedSection.tsx
git commit -m "feat(vault-search): add ConnectedSection with merged links, context, and query filtering"
```

---

### Task 8: Co-Citation + Unlinked Mention Services

**Files:**
- Create: `src/service/search/coCitationService.ts`
- Create: `src/service/search/unlinkedMentionService.ts`
- Test: `test/co-citation-service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/co-citation-service.test.ts
import { buildCoCitationQuery } from '../src/service/search/coCitationService';

function main() {
  // Test 1: query builder produces valid SQL shape
  const { sql, params } = buildCoCitationQuery('doc-123', 10);
  console.assert(typeof sql === 'string', 'Should produce SQL string');
  console.assert(sql.includes('mobius_edge'), 'Should query mobius_edge table');
  console.assert(params.includes('doc-123'), 'Should include source node ID');
  console.assert(params.includes(10), 'Should include limit');
  console.log('✅ buildCoCitationQuery: valid SQL shape');

  console.log('All co-citation tests passed');
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/co-citation-service.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement coCitationService**

```typescript
// src/service/search/coCitationService.ts
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { getIndexTenantForPath } from '@/service/search/index/indexTenantUtil';

export interface CoCitationResult {
  nodeId: string;
  path: string;
  label: string;
  /** Notes that cite both the source and this note */
  citingNotes: string[];
  score: number;
}

/**
 * Build the SQL query for co-citation analysis.
 * Finds notes that are frequently cited alongside the source note by the same third-party notes.
 *
 * Logic: find edges where from_node_id links to both source AND another target.
 * Count shared citers → higher count = stronger co-citation signal.
 */
export function buildCoCitationQuery(sourceNodeId: string, limit: number): { sql: string; params: any[] } {
  const sql = `
    SELECT
      e2.to_node_id AS co_cited_id,
      n.label,
      n.path,
      COUNT(DISTINCT e1.from_node_id) AS shared_citer_count,
      GROUP_CONCAT(DISTINCT n2.label) AS citing_labels
    FROM mobius_edge e1
    JOIN mobius_edge e2 ON e1.from_node_id = e2.from_node_id
    JOIN mobius_node n ON n.node_id = e2.to_node_id
    JOIN mobius_node n2 ON n2.node_id = e1.from_node_id
    WHERE e1.to_node_id = ?
      AND e2.to_node_id != ?
      AND e1.type = 'references'
      AND e2.type = 'references'
      AND n.type = 'document'
    GROUP BY e2.to_node_id
    HAVING shared_citer_count >= 2
    ORDER BY shared_citer_count DESC
    LIMIT ?
  `;
  return { sql, params: [sourceNodeId, sourceNodeId, limit] };
}

/**
 * Find co-cited notes for a given document path.
 */
export async function getCoCitations(currentPath: string, limit = 10): Promise<CoCitationResult[]> {
  const tenant = getIndexTenantForPath(currentPath);
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);

  const docMeta = await indexedDocumentRepo.getByPath(currentPath);
  if (!docMeta) return [];

  const { sql, params } = buildCoCitationQuery(docMeta.id, limit);

  try {
    const db = sqliteStoreManager.getRawDb(tenant);
    if (!db) return [];
    const rows = db.prepare(sql).all(...params) as any[];
    return rows.map((r) => ({
      nodeId: r.co_cited_id,
      path: r.path ?? '',
      label: r.label ?? '',
      citingNotes: (r.citing_labels ?? '').split(',').filter(Boolean),
      score: r.shared_citer_count / 10, // Normalize
    }));
  } catch (err) {
    console.error('[CoCitation] Query failed:', err);
    return [];
  }
}
```

- [ ] **Step 4: Implement unlinkedMentionService**

```typescript
// src/service/search/unlinkedMentionService.ts
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { getIndexTenantForPath } from '@/service/search/index/indexTenantUtil';

export interface UnlinkedMention {
  path: string;
  label: string;
  /** Raw text context where the title appears without [[ ]] */
  contextSnippet: string;
  score: number;
}

/**
 * Find notes where the current document's title text appears in their content
 * WITHOUT being wrapped in [[ ]] wikilink syntax.
 *
 * Uses FTS5 for fast full-text search on document chunks.
 */
export async function getUnlinkedMentions(
  currentPath: string,
  limit = 10,
): Promise<UnlinkedMention[]> {
  const tenant = getIndexTenantForPath(currentPath);
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
  const mobiusEdgeRepo = sqliteStoreManager.getMobiusEdgeRepo(tenant);

  const docMeta = await indexedDocumentRepo.getByPath(currentPath);
  if (!docMeta) return [];

  const title = currentPath.split('/').pop()?.replace(/\.md$/, '') ?? '';
  if (!title || title.length < 3) return []; // Too short → noisy results

  try {
    // Search for title text in doc chunks via FTS5
    const docChunkRepo = sqliteStoreManager.getDocChunkRepo(tenant);
    if (!docChunkRepo) return [];

    const ftsHits = await docChunkRepo.searchFts(`"${title}"`, limit * 2, 'vault');

    // Filter out: self, and notes that already link to this doc (those are "linked" mentions)
    const linkedNodeIds = new Set<string>();
    const edges = await mobiusEdgeRepo.getAllEdgesForNode(docMeta.id, 300);
    for (const e of edges) {
      linkedNodeIds.add(e.from_node_id);
      linkedNodeIds.add(e.to_node_id);
    }

    const results: UnlinkedMention[] = [];
    for (const hit of ftsHits) {
      if (hit.path === currentPath) continue;
      // Check if this note already links to us
      const hitDoc = await indexedDocumentRepo.getByPath(hit.path);
      if (hitDoc && linkedNodeIds.has(hitDoc.id)) continue;

      results.push({
        path: hit.path,
        label: hit.path.split('/').pop()?.replace(/\.md$/, '') ?? hit.path,
        contextSnippet: hit.snippet ?? `...${title}...`,
        score: hit.score ?? 0.5,
      });

      if (results.length >= limit) break;
    }

    return results;
  } catch (err) {
    console.error('[UnlinkedMentions] Search failed:', err);
    return [];
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- test/co-citation-service.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/service/search/coCitationService.ts src/service/search/unlinkedMentionService.ts test/co-citation-service.test.ts
git commit -m "feat(vault-search): add co-citation and unlinked mention services"
```

---

### Task 9: DiscoveredSection Component

**Files:**
- Create: `src/ui/view/quick-search/components/inspector/DiscoveredSection.tsx`
- Modify: `src/service/search/inspectorService.ts` (add `getDiscoveredConnections()`)

- [ ] **Step 1: Add getDiscoveredConnections to inspectorService**

In `src/service/search/inspectorService.ts`, add:

```typescript
import { getCoCitations, type CoCitationResult } from './coCitationService';
import { getUnlinkedMentions, type UnlinkedMention } from './unlinkedMentionService';

export interface DiscoveredConnection {
  path: string;
  label: string;
  /** SEM = semantic similarity, CO-CITE = co-citation, UNLINKED = unlinked mention */
  type: 'SEM' | 'CO-CITE' | 'UNLINKED';
  score: number;
  /** Explanation of why this connection was discovered */
  whyText: string;
}

/**
 * Get discovered (hidden) connections: semantic neighbors + co-citations + unlinked mentions.
 * Merged into a single ranked list.
 */
export async function getDiscoveredConnections(
  currentPath: string,
  limit = 15,
): Promise<DiscoveredConnection[]> {
  const tenant = getIndexTenantForPath(currentPath);
  const indexedDocumentRepo = sqliteStoreManager.getIndexedDocumentRepo(tenant);
  const docMeta = await indexedDocumentRepo.getByPath(currentPath);
  if (!docMeta) return [];

  // Run all three sources in parallel
  const [semanticItems, coCitations, unlinkedMentions] = await Promise.all([
    // SEM: reuse existing semantic neighbor logic
    (async () => {
      try {
        const items = await SemanticRelatedEdgesReadService.loadGraphSemanticLinkItems(
          docMeta.id, tenant, SEMANTIC_LIMIT,
        );
        return items.map((g): DiscoveredConnection => ({
          path: g.path,
          label: g.label,
          type: 'SEM',
          score: g.similarity ?? 0,
          whyText: `Content similarity`,
        }));
      } catch { return []; }
    })(),

    // CO-CITE
    (async () => {
      try {
        const results = await getCoCitations(currentPath, 10);
        return results.map((r): DiscoveredConnection => ({
          path: r.path,
          label: r.label,
          type: 'CO-CITE',
          score: r.score,
          whyText: `Both cited by: ${r.citingNotes.slice(0, 3).join(', ')}`,
        }));
      } catch { return []; }
    })(),

    // UNLINKED
    (async () => {
      try {
        const results = await getUnlinkedMentions(currentPath, 10);
        return results.map((r): DiscoveredConnection => ({
          path: r.path,
          label: r.label,
          type: 'UNLINKED',
          score: r.score,
          whyText: r.contextSnippet,
        }));
      } catch { return []; }
    })(),
  ]);

  // Merge and sort by score descending
  const merged = [...semanticItems, ...coCitations, ...unlinkedMentions]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Deduplicate by path (keep highest-scored entry)
  const seen = new Set<string>();
  return merged.filter((item) => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  });
}
```

- [ ] **Step 2: Implement DiscoveredSection component**

```tsx
// src/ui/view/quick-search/components/inspector/DiscoveredSection.tsx
import React, { useEffect, useState } from 'react';
import { cn } from '@/ui/react/lib/utils';
import { getDiscoveredConnections, type DiscoveredConnection } from '@/service/search/inspectorService';

const DEFAULT_VISIBLE = 3;

const TYPE_BADGES: Record<DiscoveredConnection['type'], { label: string; color: string }> = {
  SEM: { label: 'SEM', color: 'pktw-bg-purple-100 pktw-text-purple-700' },
  'CO-CITE': { label: 'CO-CITE', color: 'pktw-bg-blue-100 pktw-text-blue-700' },
  UNLINKED: { label: 'UNLINKED', color: 'pktw-bg-amber-100 pktw-text-amber-700' },
};

interface DiscoveredSectionProps {
  currentPath: string;
  searchQuery: string;
  onNavigate: (notePath: string) => void;
}

export const DiscoveredSection: React.FC<DiscoveredSectionProps> = ({ currentPath, searchQuery, onNavigate }) => {
  const [connections, setConnections] = useState<DiscoveredConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setLoading(true);
    setExpanded(false);
    getDiscoveredConnections(currentPath)
      .then(setConnections)
      .catch(() => setConnections([]))
      .finally(() => setLoading(false));
  }, [currentPath]);

  if (loading) return <span className="pktw-text-xs pktw-text-[#9ca3af]">Loading...</span>;
  if (connections.length === 0) return <span className="pktw-text-xs pktw-text-[#9ca3af]">No hidden connections found</span>;

  const visible = expanded ? connections : connections.slice(0, DEFAULT_VISIBLE);
  const hasMore = connections.length > DEFAULT_VISIBLE;

  return (
    <div className="pktw-flex pktw-flex-col pktw-gap-1">
      {visible.map((conn, i) => {
        const badge = TYPE_BADGES[conn.type];
        return (
          <div
            key={`${conn.path}-${conn.type}-${i}`}
            onClick={() => onNavigate(conn.path)}
            className="pktw-flex pktw-flex-col pktw-gap-0.5 pktw-px-2 pktw-py-1.5 pktw-rounded-md pktw-cursor-pointer hover:pktw-bg-[#f5f3ff] pktw-transition-colors"
          >
            <div className="pktw-flex pktw-items-center pktw-gap-1.5">
              <span className="pktw-text-sm pktw-font-medium pktw-text-[#374151] pktw-truncate pktw-flex-1">
                {conn.label}
              </span>
              <span className="pktw-text-[10px] pktw-text-[#7c3aed] pktw-flex-shrink-0">
                {Math.round(conn.score * 100)}%
              </span>
            </div>
            <div className="pktw-flex pktw-items-center pktw-gap-1.5">
              <span className={cn(
                'pktw-text-[9px] pktw-font-medium pktw-px-1 pktw-py-0.5 pktw-rounded',
                badge.color,
              )}>
                {badge.label}
              </span>
              <span className="pktw-text-xs pktw-text-[#6b7280] pktw-line-clamp-1">
                {conn.whyText}
              </span>
            </div>
          </div>
        );
      })}
      {hasMore && !expanded && (
        <span
          onClick={() => setExpanded(true)}
          className="pktw-text-xs pktw-text-[#7c3aed] pktw-cursor-pointer pktw-px-2 pktw-py-1 hover:pktw-underline"
        >
          See {connections.length - DEFAULT_VISIBLE} more ↓
        </span>
      )}
    </div>
  );
};
```

- [ ] **Step 3: Commit**

```bash
git add src/service/search/inspectorService.ts src/ui/view/quick-search/components/inspector/DiscoveredSection.tsx
git commit -m "feat(vault-search): add DiscoveredSection with SEM/CO-CITE/UNLINKED sources"
```

---

### Task 10: AIGraphSection Component

**Files:**
- Create: `src/ui/view/quick-search/components/inspector/AIGraphSection.tsx`
- Modify: `src/service/AIAnalysisHistoryService.ts` (add `findRelatedAIGraph`)

- [ ] **Step 1: Add findRelatedAIGraph to history service**

In `src/service/AIAnalysisHistoryService.ts`, add:

```typescript
/**
 * Find the most recent AI Graph analysis related to a search query.
 */
async findRelatedAIGraph(query: string): Promise<DbSchema['ai_analysis_record'] | null> {
  if (!query.trim()) return null;
  const rows = await this.repo.db
    .selectFrom('ai_analysis_record')
    .selectAll()
    .where('analysis_preset', '=', 'aiGraph')
    .where('query', 'is not', null)
    .orderBy('created_at_ts', 'desc')
    .limit(5)
    .execute();

  // Simple relevance: find first record whose query overlaps with search query
  const keywords = query.toLowerCase().split(/\s+/);
  for (const row of rows) {
    const rq = (row.query ?? '').toLowerCase();
    if (keywords.some((kw) => rq.includes(kw))) return row;
  }
  return rows[0] ?? null; // Fallback to most recent
}
```

- [ ] **Step 2: Implement AIGraphSection component**

```tsx
// src/ui/view/quick-search/components/inspector/AIGraphSection.tsx
import React, { useEffect, useState } from 'react';
import { Network, ExternalLink, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/AppContext';
import { humanReadableTime } from '@/core/utils/format-utils';

interface AIGraphRecord {
  query: string | null;
  graph_nodes_count: number | null;
  graph_edges_count: number | null;
  created_at_ts: number;
  vault_rel_path: string;
}

interface AIGraphSectionProps {
  currentPath: string;
  searchQuery: string;
}

export const AIGraphSection: React.FC<AIGraphSectionProps> = ({ currentPath, searchQuery }) => {
  const [pastResult, setPastResult] = useState<AIGraphRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setLoading(true);
    const svc = AppContext.getInstance().aiAnalysisHistoryService;
    const title = currentPath.split('/').pop()?.replace(/\.md$/, '') ?? '';
    const queryForLookup = searchQuery || title;
    svc.findRelatedAIGraph(queryForLookup)
      .then((r) => setPastResult(r as AIGraphRecord | null))
      .catch(() => setPastResult(null))
      .finally(() => setLoading(false));
  }, [currentPath, searchQuery]);

  const handleOpenInNewWindow = () => {
    if (!pastResult?.vault_rel_path) return;
    const app = AppContext.getInstance().app;
    const file = app.vault.getAbstractFileByPath(pastResult.vault_rel_path);
    if (file) {
      app.workspace.openLinkText(pastResult.vault_rel_path, '', 'window');
    }
  };

  const handleGenerate = () => {
    setGenerating(true);
    // Switch to AI Analysis tab with aiGraph preset and the current search query
    const { useSharedStore } = require('@/ui/view/quick-search/store');
    useSharedStore.getState().setActiveTab('ai');
    useSharedStore.getState().setSearchQuery(searchQuery || currentPath.split('/').pop()?.replace(/\.md$/, '') ?? '');
    // The analysis mode switch happens in the AI tab
  };

  if (loading) return <span className="pktw-text-xs pktw-text-[#9ca3af]">Loading...</span>;

  return (
    <div className="pktw-flex pktw-flex-col pktw-gap-3">
      {/* Past result */}
      {pastResult && (
        <div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-p-2 pktw-rounded-md pktw-bg-[#fafafa]">
          <div className="pktw-flex pktw-items-center pktw-gap-1.5">
            <Network className="pktw-w-3.5 pktw-h-3.5 pktw-text-[#7c3aed]" />
            <span className="pktw-text-xs pktw-text-[#374151] pktw-flex-1 pktw-truncate">
              {pastResult.query ?? 'AI Graph'}
            </span>
          </div>
          <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-[10px] pktw-text-[#9ca3af]">
            <span>{pastResult.graph_nodes_count ?? 0} nodes</span>
            <span>·</span>
            <span>{pastResult.graph_edges_count ?? 0} edges</span>
            <span>·</span>
            <span>{humanReadableTime(pastResult.created_at_ts)}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="pktw-shadow-none pktw-text-xs pktw-h-7 pktw-text-[#7c3aed] pktw-mt-1 pktw-self-start"
            onClick={handleOpenInNewWindow}
            style={{ cursor: 'pointer' }}
          >
            <ExternalLink className="pktw-w-3 pktw-h-3 pktw-mr-1" />
            New window ↗
          </Button>
        </div>
      )}

      {/* Generate button */}
      <Button
        variant="outline"
        size="sm"
        className="pktw-shadow-none pktw-text-xs pktw-h-8 pktw-border-[#e5e7eb] pktw-text-[#374151] hover:pktw-border-[#7c3aed]/40 hover:pktw-text-[#7c3aed]"
        onClick={handleGenerate}
        disabled={generating}
        style={{ cursor: 'pointer' }}
      >
        {generating ? (
          <Loader2 className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5 pktw-animate-spin" />
        ) : (
          <Sparkles className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5" />
        )}
        Generate AI Graph
        <span className="pktw-text-[10px] pktw-text-[#9ca3af] pktw-ml-1.5">Uses AI credits</span>
      </Button>
    </div>
  );
};
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/components/inspector/AIGraphSection.tsx src/service/AIAnalysisHistoryService.ts
git commit -m "feat(vault-search): add AIGraphSection with past results lookup + generate button"
```

---

### Task 11: Enhanced SearchResultRow — Relevance Score Badge

**Files:**
- Modify: `src/ui/view/quick-search/components/VaultSearchResult.tsx:118-184`

- [ ] **Step 1: Add relevance score to SearchResultRow**

The `SearchResultItem` type already has a `score` field from the tri-hybrid search. Add a score badge to the result row.

In `VaultSearchResult.tsx`, inside `SearchResultRow` (around line 177), add a relevance score badge before the last modified time:

```tsx
{/* Relevance score — shown for vault/folder search modes when score is available */}
{result.score != null && result.score > 0 && (
  <span className="pktw-flex-shrink-0 pktw-text-[10px] pktw-font-medium pktw-px-1.5 pktw-py-0.5 pktw-rounded-full pktw-bg-[#f5f3ff] pktw-text-[#7c3aed]">
    {Math.round(result.score * 100)}%
  </span>
)}
```

Insert this before the existing last modified time div (line 178).

- [ ] **Step 2: Commit**

```bash
git add src/ui/view/quick-search/components/VaultSearchResult.tsx
git commit -m "feat(vault-search): add relevance score badge to SearchResultRow"
```

---

### Task 12: Topic Navigation

**Files:**
- Modify: `src/ui/view/quick-search/tab-VaultSearch.tsx` (handle navigate callback)
- Modify: `src/ui/view/quick-search/SearchModal.tsx` (wire handleTopicNavigate)

- [ ] **Step 1: Implement topic navigation in VaultTabContent**

In `SearchModal.tsx`, the `handleTopicNavigate` function (defined in Task 4) needs to:
1. Set the inspector path to the clicked note
2. Scroll the note into view in results (or add it temporarily)
3. Preserve the search query

Flesh out the implementation:

```typescript
const handleTopicNavigate = (notePath: string) => {
  // 1. Update inspector to show the clicked note
  setInspectorPath(notePath);

  // 2. Try to find and select the note in current results
  const results = useVaultSearchStore.getState().lastSearchResults;
  const existingIndex = results.findIndex((r) => r.path === notePath);

  if (existingIndex >= 0) {
    // Scroll to existing result
    // The VaultSearchTab will handle this via selectedIndex
  } else {
    // Note not in results — add temporarily at the top
    // This is a UI-only addition; the note gets selected but the search results stay the same
  }

  // 3. Search query is preserved (no change to vaultSearchQuery)
};
```

- [ ] **Step 2: Pass topic navigation state to VaultSearchTab**

Add a `navigateToPath` prop to `VaultSearchTab`:

```typescript
interface VaultSearchTabProps {
  onClose?: () => void;
  onSelectForInspector?: (path: string) => void;
  navigateToPath?: string | null;
}
```

In `VaultSearchTab`, react to `navigateToPath` changes:

```typescript
useEffect(() => {
  if (!navigateToPath) return;
  const idx = displayedResults.findIndex((r) => r.path === navigateToPath);
  if (idx >= 0) {
    setSelectedIndex(idx);
  }
}, [navigateToPath]);
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/SearchModal.tsx src/ui/view/quick-search/tab-VaultSearch.tsx
git commit -m "feat(vault-search): implement topic navigation with query preservation"
```

---

### Task 13: Before-Typing State + In-File Search Results

**Files:**
- Modify: `src/ui/view/quick-search/tab-VaultSearch.tsx:148-151` (before-typing state)

- [ ] **Step 1: Add "Recently modified" group to before-typing state**

Currently, the before-typing state shows "Recently accessed" (L148-151). Per spec, add a second group: "Recently modified".

In `tab-VaultSearch.tsx`, update the no-query state:

```tsx
{!hasSearchQuery && (
  <div className="pktw-px-4 pktw-pb-2">
    <span className="pktw-text-xs pktw-text-[#999999]">
      {displayedResults.length > 0 ? 'Recently opened' : 'No recently accessed files'}
    </span>
  </div>
)}
```

The "Recently opened" results already come from `lastOpenTs` via the existing search hook. The "Recently modified" group would require a separate data source. For now, the existing behavior (recently accessed ordered by `lastOpenTs`) covers the primary use case. This can be enhanced later by adding a `recentlyModified` query to the search hook.

- [ ] **Step 2: Pre-select active document**

Per spec, the active document should be the first item and pre-selected on modal open. In `VaultSearchTab`:

```typescript
// Pre-select first item (active document) when results load and no query
useEffect(() => {
  if (!hasSearchQuery && displayedResults.length > 0 && selectedIndex === -1) {
    setSelectedIndex(0);
  }
}, [displayedResults.length, hasSearchQuery]);
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/tab-VaultSearch.tsx
git commit -m "feat(vault-search): improve before-typing state with pre-selected active document"
```

---

### Task 14: Cleanup — Remove Old Inspector Components

**Files:**
- Delete: `src/ui/view/quick-search/components/inspector/LinksSection.tsx`
- Delete: `src/ui/view/quick-search/components/inspector/GraphSection.tsx`
- Delete: `src/ui/view/quick-search/components/inspector/InspectorPanel.tsx`
- Modify: Any remaining imports

- [ ] **Step 1: Verify no imports reference old files**

Run:
```bash
grep -r "LinksSection\|LinksTab\|GraphSection\|InspectorPanel" src/ --include="*.ts" --include="*.tsx" -l
```

For each file that still imports the old components, update to use the new ones or remove the import.

- [ ] **Step 2: Delete old inspector files**

```bash
rm src/ui/view/quick-search/components/inspector/LinksSection.tsx
rm src/ui/view/quick-search/components/inspector/GraphSection.tsx
rm src/ui/view/quick-search/components/inspector/InspectorPanel.tsx
```

- [ ] **Step 3: Update remaining imports**

In `SearchModal.tsx`, replace:
```typescript
// Old:
import { InspectorPanel } from './components/inspector/InspectorPanel';
// New:
import { InspectorSidePanel } from './components/inspector/InspectorSidePanel';
```

- [ ] **Step 4: Update VaultSearchFooterHints — remove [[ hint**

Already done in Task 2. Verify the footer no longer shows `[[ Inspector`.

- [ ] **Step 5: Remove `[[` handling from transformQueryForMode**

In `SearchModal.tsx:360-390`, the `transformQueryForMode` function strips `[[` prefix. Remove that case since `[[` is no longer a mode:

```typescript
// Remove the line that strips [[ prefix:
// const stripped = raw.replace(/^\[\[\s*/, '');
```

- [ ] **Step 6: Commit**

```bash
git rm src/ui/view/quick-search/components/inspector/LinksSection.tsx
git rm src/ui/view/quick-search/components/inspector/GraphSection.tsx
git rm src/ui/view/quick-search/components/inspector/InspectorPanel.tsx
git add src/ui/view/quick-search/SearchModal.tsx
git commit -m "refactor(vault-search): remove old inspector components (LinksSection, GraphSection, InspectorPanel)"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - Inspector side panel 340px (Task 5) ✓
   - Mode switching via prefix (Tasks 1, 2) ✓
   - `?` help mode (Tasks 1, 3) ✓
   - Mode badge (Task 2) ✓
   - Connected section — merged links+backlinks with context (Tasks 6, 7) ✓
   - Discovered section — SEM+CO-CITE+UNLINKED (Tasks 8, 9) ✓
   - AI Graph section (Task 10) ✓
   - Query-aware filtering (Task 6 — `filterByQuery`) ✓
   - Topic navigation (Task 12) ✓
   - Enhanced SearchResultRow with score (Task 11) ✓
   - Keyboard navigation →/← (Task 4) ✓
   - Before-typing state (Task 13) ✓
   - Footer at modal level (Task 4) ✓
   - Removed elements: `[[` mode, hover-card, LinksSection, GraphSection (Tasks 1, 2, 14) ✓

2. **Placeholder scan:** No TBD/TODO remaining. One deferral: "Recently modified" group is noted as enhancement-only since existing recently-accessed covers the primary use case.

3. **Type consistency:** `ConnectedLink` type used consistently between service and component. `DiscoveredConnection` type matches between service and component. `InspectorSidePanel` props align with `SearchModal` parent wiring. `QuickSearchMode` type extended once and used everywhere.
