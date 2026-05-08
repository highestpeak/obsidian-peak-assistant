# Mockup Gap Completion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 7 remaining features from the design mockups that were designed but never built.

**Architecture:** Pure UI/UX changes across 3 systems: prompt menus (@ and /), input toolbar responsiveness, suggestion intelligence, and diff visualization. Each task is independent — no cross-task dependencies except Task 1 (type extension) which is a prerequisite for Tasks 2–3.

**Tech Stack:** React 18, Tailwind CSS (pktw- prefix), Zustand, Obsidian API, ResizeObserver

---

## File Map

| File | Responsibility | Tasks |
|------|---------------|-------|
| `src/ui/component/mine/NavigableMenu.tsx` | Shared menu item type | 1 |
| `src/ui/view/chat-view/components/ContextMenu.tsx` | @ context menu rendering | 2 |
| `src/ui/view/chat-view/hooks/useContextSearch.ts` | @ menu data + folder state | 2 |
| `src/ui/view/chat-view/components/PromptMenu.tsx` | / prompt menu rendering | 3 |
| `src/ui/view/chat-view/hooks/useContextSearch.ts` | / menu prompt loading | 3 |
| `src/ui/view/chat-view/store/chatViewStore.ts` | Prompt store init | 3 |
| `src/ui/view/chat-view/components/ChatInputArea.tsx` | Toolbar layout | 4 |
| `src/ui/view/chat-view/components/SuggestionActions.tsx` | Suggestion chips | 5 |
| `src/ui/view/chat-view/view-Messages.tsx` | Suggestion placement | 5 |
| `src/ui/view/copilot/panels/PolishPanel.tsx` | Before/after diff view | 6 |
| `src/ui/view/copilot/panels/ReviewPanel.tsx` | Review fix flow | 6 |
| `src/ui/view/quick-search/components/SuggestionGrid.tsx` | Analysis suggestion cards | 7 |

---

### Task 1: Extend NavigableMenuItem Type

**Files:**
- Modify: `src/ui/component/mine/NavigableMenu.tsx:8-16`

This is a prerequisite for Tasks 2 and 3. Add `group` and `meta` optional fields to the shared type.

- [ ] **Step 1: Add fields to NavigableMenuItem interface**

In `src/ui/component/mine/NavigableMenu.tsx`, add two fields after `disabled?`:

```typescript
export interface NavigableMenuItem {
    id: string;
    label: string;
    description?: string;
    icon?: React.ReactNode | ((isSelected: boolean) => React.ReactNode);
    showArrow?: boolean;
    value: string;
    disabled?: boolean;
    /** Group label for sectioned menus (e.g. "Recent", "My Templates") */
    group?: string;
    /** Display metadata shown as a right-aligned badge (e.g. "1.2k words", "12 pages") */
    meta?: string;
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: PASS — new optional fields break nothing.

- [ ] **Step 3: Commit**

```bash
git add src/ui/component/mine/NavigableMenu.tsx
git commit -m "feat(ui): add group and meta fields to NavigableMenuItem"
```

---

### Task 2: @ Context Menu — Breadcrumbs, Section Labels, File Metadata

**Files:**
- Modify: `src/ui/view/chat-view/hooks/useContextSearch.ts:11-92`
- Modify: `src/ui/view/chat-view/components/ContextMenu.tsx:36-184`

**Design reference:** `docs/mockups/chat-redesign-part1-messages.html` → "@ Context Menu" section

#### 2a. Folder breadcrumb stack + "Recent" group labels in useContextSearch

- [ ] **Step 1: Add folder stack state and group labels**

In `useContextSearch.ts`, add a `folderStack` state and populate the `group` field on each item. The breadcrumb trail is derived from `folderStack`.

```typescript
// After line 14 (existing state declarations)
const [folderStack, setFolderStack] = useState<string[]>([]);

// Inside handleSearchContext (lines 17-48), modify the mapping at lines 37-44:
const RECENT_FILES_COUNT = 3;
// ... existing search logic ...

return results.map((item, index) => ({
    id: item.path || item.id,
    label: item.title || item.path || item.id,
    description: item.path || item.id,
    value: item.path || item.id,
    icon: (isSelected: boolean) => getFileIcon(item.type, isSelected),
    showArrow: item.type === 'folder',
    group: !query.trim() && !currentFolder && index < RECENT_FILES_COUNT ? 'Recent' : undefined,
    meta: item.type === 'markdown' && item.content
        ? `${Math.round(item.content.split(/\s+/).length / 100) / 10}k words`
        : item.type === 'pdf' ? 'PDF' : undefined,
}));
```

- [ ] **Step 2: Add folder navigation with breadcrumb support**

In `handleMenuSelect` (lines 79-89), push to the folder stack when drilling in, and add a `handleFolderUp` function:

```typescript
// Replace the existing handleMenuSelect folder-drill logic:
if ((triggerChar === '@' || triggerChar === '[[') && selectedItem?.showArrow) {
    const folderPath = selectedItem.value;
    setFolderStack(prev => [...prev, folderPath]);
    const items = await handleSearchContext('', folderPath);
    setMenuContextItems(items);
    return;
}

// Add new function:
const handleFolderUp = async () => {
    const newStack = folderStack.slice(0, -1);
    setFolderStack(newStack);
    const parentFolder = newStack.length > 0 ? newStack[newStack.length - 1] : undefined;
    const items = await handleSearchContext('', parentFolder);
    setMenuContextItems(items);
};
```

Return `folderStack` and `handleFolderUp` from the hook alongside existing returns.

- [ ] **Step 3: Verify the hook compiles**

Run: `npm run build`
Expected: PASS

#### 2b. Render breadcrumbs and section headers in ContextMenu

- [ ] **Step 4: Accept new props in ContextMenu**

Add `folderStack` and `onFolderUp` to `ContextMenuProps` (line 15-30):

```typescript
interface ContextMenuProps {
    // ... existing props ...
    folderStack?: string[];
    onFolderUp?: () => void;
}
```

- [ ] **Step 5: Render breadcrumb bar and grouped items**

Replace the flat `items.map` block (lines 126-184) with grouped rendering:

```tsx
{/* Breadcrumb bar — only shown when inside a folder */}
{folderStack && folderStack.length > 0 && (
    <div
        className="pktw-flex pktw-items-center pktw-gap-1 pktw-px-3 pktw-py-1.5 pktw-border-b pktw-border-[var(--background-modifier-border)] pktw-text-[10px] pktw-text-[var(--text-muted)] pktw-flex-shrink-0 pktw-cursor-pointer hover:pktw-text-[var(--text-normal)]"
        onClick={onFolderUp}
    >
        <ChevronLeft className="pktw-w-3 pktw-h-3" />
        <span className="pktw-truncate">
            {folderStack.length === 1
                ? 'Vault'
                : folderStack[folderStack.length - 2]?.split('/').pop()}
        </span>
        <span className="pktw-text-[var(--text-faint)]">/</span>
        <span className="pktw-font-medium pktw-text-[var(--text-normal)] pktw-truncate">
            {folderStack[folderStack.length - 1]?.split('/').pop()}
        </span>
    </div>
)}

{/* Grouped item list */}
{(() => {
    let lastGroup: string | undefined;
    let globalIdx = 0;
    return items.map((item, i) => {
        const showHeader = item.group && item.group !== lastGroup;
        lastGroup = item.group;
        const idx = globalIdx++;
        return (
            <React.Fragment key={item.id}>
                {showHeader && (
                    <span className="pktw-text-[9px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-[var(--text-muted)] pktw-px-3 pktw-py-1.5 pktw-block">
                        {item.group}
                    </span>
                )}
                <Button /* ... existing Button render with one addition: */ >
                    {/* ... existing icon + label + description ... */}
                    {/* Add meta badge before the arrow */}
                    {item.meta && (
                        <span className="pktw-ml-auto pktw-text-[9px] pktw-text-[var(--text-faint)] pktw-font-mono pktw-flex-shrink-0">
                            {item.meta}
                        </span>
                    )}
                    {item.showArrow && /* existing arrow */}
                </Button>
            </React.Fragment>
        );
    });
})()}
```

Import `ChevronLeft` from `lucide-react` at the top.

- [ ] **Step 6: Wire new props through PromptInputBody**

In `src/ui/component/prompt-input/PromptInputBody.tsx`, pass `folderStack` and `onFolderUp` through to `<ContextMenu>`. These come from the `useContextSearch` hook which is called in the parent.

- [ ] **Step 7: Build and visually test**

Run: `npm run build`
Then test in Obsidian: type `@` in chat input, verify:
- "Recent" section label appears above first 3 items when no query/folder
- Clicking a folder shows breadcrumb bar with `← Parent / Current` path
- Clicking breadcrumb navigates back up
- File metadata badges show on right side of items

- [ ] **Step 8: Commit**

```bash
git add src/ui/view/chat-view/hooks/useContextSearch.ts src/ui/view/chat-view/components/ContextMenu.tsx src/ui/component/prompt-input/PromptInputBody.tsx
git commit -m "feat(chat): add breadcrumbs, section labels, and file metadata to @ context menu"
```

---

### Task 3: / Prompt Menu — Template Grouping + Prompt Wiring

**Files:**
- Modify: `src/ui/view/chat-view/components/PromptMenu.tsx:125-131`
- Modify: `src/ui/view/chat-view/hooks/useContextSearch.ts:55-77`
- Modify: `src/service/copilot/CopilotActionRegistry.ts`

**Design reference:** `docs/mockups/chat-redesign-part1-messages.html` → "/ Prompt & Template Menu" section

- [ ] **Step 1: Use item.group in PromptMenu grouping**

In `PromptMenu.tsx` line 128, replace the hardcoded group:

```typescript
const g = item.group ?? 'Quick Actions';
```

- [ ] **Step 2: Add a badge for template-group items**

In the PromptMenu render (after the item description, around line 164), add a badge when `groupName` indicates templates:

```tsx
{groupName !== 'Quick Actions' && (
    <span className="pktw-ml-auto pktw-text-[8px] pktw-font-medium pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-[var(--pk-accent-muted,rgba(124,58,237,0.15))] pktw-text-[var(--pk-accent,#7c3aed)] pktw-flex-shrink-0">
        Template
    </span>
)}
```

- [ ] **Step 3: Wire copilot actions into promptsSuggest**

In `useContextSearch.ts`, populate prompt suggestions from the CopilotActionRegistry on mount. Add to `handleSearchPrompts`:

```typescript
const handleSearchPrompts = async (query: string): Promise<NavigableMenuItem[]> => {
    // Built-in quick actions from copilot registry
    const registry = CopilotActionRegistry.getInstance();
    const allActions = registry.getAll();
    const builtInItems: NavigableMenuItem[] = allActions.map(action => ({
        id: action.id,
        label: action.label,
        description: action.description,
        value: `/${action.id}`,
        icon: (isSelected: boolean) => {
            const Icon = action.icon;
            return <Icon className={cn("pktw-w-4 pktw-h-4", isSelected ? "pktw-text-inherit" : "pktw-text-[var(--text-muted)]")} />;
        },
        group: 'Quick Actions',
    }));

    // User templates from store
    const templateItems = promptsSuggest.map(p => ({
        ...p,
        group: p.group ?? 'My Templates',
    }));

    let results = [...builtInItems, ...templateItems];

    if (query.trim()) {
        const lq = query.toLowerCase();
        results = results.filter(p =>
            p.label.toLowerCase().includes(lq)
            || p.description?.toLowerCase().includes(lq)
        );
    }

    return results;
};
```

Import `CopilotActionRegistry` and `cn` at the top.

- [ ] **Step 4: Handle copilot action selection in PromptInputBody**

When a user selects a `/action-id` from the menu, detect if it's a copilot action and trigger it instead of inserting text. In `PromptInputBody.tsx`, modify the prompt selection handler:

```typescript
// In the prompt item selection handler:
if (selectedItem.value.startsWith('/')) {
    const actionId = selectedItem.value.slice(1);
    const registry = CopilotActionRegistry.getInstance();
    const action = registry.get(actionId);
    if (action) {
        // Trigger the copilot action instead of inserting text
        // Use the same flow as CopilotPickerModal
        action.execute(/* context */);
        return;
    }
}
// Fall through to existing text insertion
```

Note: The exact execution mechanism depends on how `CopilotPickerModal` invokes actions. Match that pattern — the action needs an active editor context.

- [ ] **Step 5: Build and test**

Run: `npm run build`
Test in Obsidian: type `/` in chat, verify:
- "Quick Actions" group shows copilot actions (Summarize, Polish, Review, etc.)
- "My Templates" group shows if any user templates exist
- Template items have a purple "Template" badge
- Selecting a quick action invokes it

- [ ] **Step 6: Commit**

```bash
git add src/ui/view/chat-view/components/PromptMenu.tsx src/ui/view/chat-view/hooks/useContextSearch.ts src/ui/component/prompt-input/PromptInputBody.tsx
git commit -m "feat(chat): wire copilot actions into / menu with grouped sections and template badges"
```

---

### Task 4: Input Toolbar Responsive Adaptation

**Files:**
- Modify: `src/ui/view/chat-view/components/ChatInputArea.tsx:152-204`

**Design reference:** `docs/mockups/input-toolbar-final.html` → "Narrow sidebar adaptation" section

The toolbar should progressively hide elements as the container narrows: token count first, then model name truncation, then mode label.

- [ ] **Step 1: Add ResizeObserver to measure toolbar width**

In `ChatInputArea.tsx`, add a ref and width state to the toolbar container:

```typescript
const toolbarRef = useRef<HTMLDivElement>(null);
const [toolbarWidth, setToolbarWidth] = useState(600);

useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
        const w = entries[0]?.contentRect.width ?? 600;
        setToolbarWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
}, []);

const isNarrow = toolbarWidth < 400;
const isVeryNarrow = toolbarWidth < 300;
```

Add `ref={toolbarRef}` to the footer row div at line 152.

- [ ] **Step 2: Conditionally render toolbar elements**

Modify the right selector group (lines 190-204):

```tsx
<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-min-w-0">
    {!isVeryNarrow && <ModeSelector />}
    <ModelSelector
        /* existing props */
        truncate={isNarrow}
    />
    {!isNarrow && <TokenUsage /* existing props */ />}
    <PromptInputSubmit /* existing props */ />
</div>
```

- [ ] **Step 3: Add truncate support to ModelSelector**

In the `ModelSelector` component, accept a `truncate?: boolean` prop. When true, show only the model name without provider prefix (e.g. `opus-4-6` instead of `anthropic/claude-opus-4-6`). Find the ModelSelector component and add:

```typescript
// In the display label logic:
const displayLabel = truncate
    ? modelId.split('/').pop()?.replace('claude-', '') ?? modelId
    : modelId;
```

- [ ] **Step 4: Build and test at different widths**

Run: `npm run build`
Test: resize the Obsidian sidebar to various widths:
- Normal (>400px): all elements visible
- Narrow (<400px): token count hidden, model name truncated
- Very narrow (<300px): mode selector also hidden

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/chat-view/components/ChatInputArea.tsx
git commit -m "feat(chat): responsive input toolbar hides token/mode at narrow widths"
```

---

### Task 5: Context-Aware Suggestion Actions

**Files:**
- Modify: `src/ui/view/chat-view/components/SuggestionActions.tsx:1-35`
- Modify: `src/ui/view/chat-view/view-Messages.tsx:124-140`

**Design reference:** `docs/mockups/chat-redesign-part2-pages.html` → "Suggestion Actions" section

Replace the 3 hardcoded presets with LLM-generated, context-aware suggestions. Reuse the same `manager.queryStructured` pattern from `SuggestedFollowups.tsx`.

- [ ] **Step 1: Create prompt template for suggestion actions**

Create `templates/prompts/chat-suggest-actions.md`:

```markdown
Given the current conversation context, suggest 2-3 actionable next steps the user might want to take. These should be concrete actions (not questions), such as:
- "Transfer to Project" — if the conversation has valuable insights worth organizing
- "Search vault for related notes" — if the topic connects to existing knowledge
- "Summarize key points" — if the conversation is long
- "Create action items" — if the conversation discussed tasks

Return a JSON array of objects: [{"label": "short action label", "prompt": "the full prompt to submit"}]

Only suggest actions that make sense given the conversation content. Max 3 suggestions.

## Conversation so far
{{messages}}
```

- [ ] **Step 2: Register the prompt**

Add `ChatSuggestActions = 'chat-suggest-actions'` to `PromptId` enum in `src/service/prompt/PromptId.ts`.

Register in `src/core/template/TemplateRegistry.ts` under the prompts category:

```typescript
[PromptId.ChatSuggestActions]: {
    path: 'prompts/chat-suggest-actions.md',
    category: 'prompts',
},
```

- [ ] **Step 3: Rewrite SuggestionActions to be LLM-driven**

Replace the entire `SuggestionActions.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { cn } from '@/ui/component/utils';
import { Sparkles } from 'lucide-react';
import { useAppContext } from '@/ui/context/AppContext';
import { PromptId } from '@/service/prompt/PromptId';

interface SuggestionActionsProps {
    messages: Array<{ role: string; content: string }>;
    conversationId: string;
    onSelect: (prompt: string) => void;
}

interface ActionSuggestion {
    label: string;
    prompt: string;
}

export const SuggestionActions: React.FC<SuggestionActionsProps> = ({
    messages,
    conversationId,
    onSelect,
}) => {
    const { manager } = useAppContext();
    const [suggestions, setSuggestions] = useState<ActionSuggestion[]>([]);
    const generatedForRef = useRef<string | null>(null);

    useEffect(() => {
        if (!conversationId || messages.length < 2) return;
        // Generate once per conversation state (keyed by last message)
        const key = `${conversationId}-${messages.length}`;
        if (generatedForRef.current === key) return;
        generatedForRef.current = key;

        const lastMessages = messages.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n\n');

        manager.queryStructured(
            PromptId.ChatSuggestActions,
            { messages: lastMessages },
            { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, prompt: { type: 'string' } } } },
        ).then(result => {
            if (Array.isArray(result)) setSuggestions(result.slice(0, 3));
        }).catch(() => {});
    }, [conversationId, messages.length]);

    if (suggestions.length === 0) return null;

    return (
        <div className="pktw-flex pktw-gap-1.5 pktw-flex-wrap">
            {suggestions.map((s, i) => (
                <button
                    key={i}
                    onClick={() => onSelect(s.prompt)}
                    className={cn(
                        "pktw-inline-flex pktw-items-center pktw-gap-1 pktw-px-2.5 pktw-py-1 pktw-rounded-md",
                        "pktw-border pktw-border-[var(--background-modifier-border)]",
                        "pktw-text-[10px] pktw-text-[var(--text-muted)] pktw-cursor-pointer",
                        "hover:pktw-border-[var(--pk-accent,#6d28d9)] hover:pktw-text-[var(--pk-accent,#6d28d9)] hover:pktw-bg-accent/5",
                        "pktw-transition-colors"
                    )}
                >
                    <Sparkles className="pktw-w-3 pktw-h-3" />
                    {s.label}
                </button>
            ))}
        </div>
    );
};
```

- [ ] **Step 4: Update view-Messages.tsx to pass new props**

In `view-Messages.tsx`, replace the hardcoded actions array (lines 129-135) with the new component interface:

```tsx
<SuggestionActions
    messages={activeConversation.messages.map(m => ({ role: m.role, content: m.content }))}
    conversationId={activeConversation.id}
    onSelect={(prompt) => submitAction?.(prompt)}
/>
```

Remove the inline `SuggestionAction` type import and the hardcoded array.

- [ ] **Step 5: Build and test**

Run: `npm run build`
Test: have a multi-message conversation, verify suggestion chips appear above the input with context-aware labels instead of the generic "Summarize / Search vault / Explain further".

- [ ] **Step 6: Commit**

```bash
git add templates/prompts/chat-suggest-actions.md src/service/prompt/PromptId.ts src/core/template/TemplateRegistry.ts src/ui/view/chat-view/components/SuggestionActions.tsx src/ui/view/chat-view/view-Messages.tsx
git commit -m "feat(chat): replace hardcoded suggestion actions with LLM-generated context-aware suggestions"
```

---

### Task 6: Word-Level Diff Highlighting in PolishPanel

**Files:**
- Create: `src/ui/component/diff/wordDiff.ts`
- Create: `src/ui/component/diff/DiffView.tsx`
- Modify: `src/ui/view/copilot/panels/PolishPanel.tsx:84-99`

**Design reference:** `docs/mockups/copilot-document-intelligence.html` → "Document Polish" section (red strikethrough / green highlight)

- [ ] **Step 1: Create word-level diff utility**

Create `src/ui/component/diff/wordDiff.ts`:

```typescript
export interface DiffSegment {
    text: string;
    type: 'equal' | 'added' | 'removed';
}

/**
 * Simple word-level diff using longest common subsequence.
 * Returns segments marking equal, added, and removed words.
 */
export function diffWords(original: string, modified: string): DiffSegment[] {
    const oldWords = original.split(/(\s+)/);
    const newWords = modified.split(/(\s+)/);
    const segments: DiffSegment[] = [];

    // Build LCS table
    const m = oldWords.length;
    const n = newWords.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = oldWords[i - 1] === newWords[j - 1]
                ? dp[i - 1][j - 1] + 1
                : Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }

    // Backtrack to produce diff
    let i = m, j = n;
    const result: DiffSegment[] = [];
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
            result.push({ text: oldWords[i - 1], type: 'equal' });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            result.push({ text: newWords[j - 1], type: 'added' });
            j--;
        } else {
            result.push({ text: oldWords[i - 1], type: 'removed' });
            i--;
        }
    }

    return result.reverse();
}
```

- [ ] **Step 2: Create test for diffWords**

Create `test/diff-words.test.ts`:

```typescript
import { diffWords } from '../src/ui/component/diff/wordDiff';

// Test basic diff
const result = diffWords('the quick brown fox', 'the slow brown dog');
const removed = result.filter(s => s.type === 'removed').map(s => s.text.trim()).filter(Boolean);
const added = result.filter(s => s.type === 'added').map(s => s.text.trim()).filter(Boolean);
const equal = result.filter(s => s.type === 'equal').map(s => s.text.trim()).filter(Boolean);

console.assert(removed.includes('quick'), `Expected 'quick' in removed, got: ${JSON.stringify(removed)}`);
console.assert(removed.includes('fox'), `Expected 'fox' in removed, got: ${JSON.stringify(removed)}`);
console.assert(added.includes('slow'), `Expected 'slow' in added, got: ${JSON.stringify(added)}`);
console.assert(added.includes('dog'), `Expected 'dog' in added, got: ${JSON.stringify(added)}`);
console.assert(equal.includes('the'), `Expected 'the' in equal, got: ${JSON.stringify(equal)}`);
console.assert(equal.includes('brown'), `Expected 'brown' in equal, got: ${JSON.stringify(equal)}`);

// Test identical strings
const same = diffWords('hello world', 'hello world');
console.assert(same.every(s => s.type === 'equal'), 'Identical strings should all be equal');

// Test empty
const empty = diffWords('', 'new text');
console.assert(empty.filter(s => s.type === 'added').length > 0, 'All-new should be added');

console.log('All diff-words tests passed');
```

Run: `npm run test -- test/diff-words.test.ts`
Expected: "All diff-words tests passed"

- [ ] **Step 3: Create DiffView component**

Create `src/ui/component/diff/DiffView.tsx`:

```tsx
import React from 'react';
import { diffWords, DiffSegment } from './wordDiff';
import { cn } from '@/ui/component/utils';

interface DiffViewProps {
    original: string;
    modified: string;
    className?: string;
}

export const DiffView: React.FC<DiffViewProps> = ({ original, modified, className }) => {
    const segments = diffWords(original, modified);

    return (
        <div className={cn("pktw-whitespace-pre-wrap pktw-text-sm pktw-leading-relaxed", className)}>
            {segments.map((seg, i) => {
                if (seg.type === 'equal') {
                    return <span key={i}>{seg.text}</span>;
                }
                if (seg.type === 'removed') {
                    return (
                        <span
                            key={i}
                            className="pktw-bg-[var(--pk-error-muted,rgba(239,68,68,0.15))] pktw-text-[var(--pk-error,#ef4444)] pktw-line-through"
                        >
                            {seg.text}
                        </span>
                    );
                }
                // added
                return (
                    <span
                        key={i}
                        className="pktw-bg-[var(--pk-success-muted,rgba(34,197,94,0.15))] pktw-text-[var(--pk-success,#22c55e)]"
                    >
                        {seg.text}
                    </span>
                );
            })}
        </div>
    );
};
```

- [ ] **Step 4: Integrate DiffView into PolishPanel**

In `PolishPanel.tsx`, replace the plain-text side-by-side (lines 84-99) with a unified DiffView:

```tsx
{/* Replace the 2-column grid with a unified diff view */}
<div className="pktw-space-y-3">
    <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-[var(--text-muted)]">
        <span className="pktw-inline-flex pktw-items-center pktw-gap-1">
            <span className="pktw-w-2 pktw-h-2 pktw-rounded-full pktw-bg-[var(--pk-error,#ef4444)]" />
            Removed
        </span>
        <span className="pktw-inline-flex pktw-items-center pktw-gap-1">
            <span className="pktw-w-2 pktw-h-2 pktw-rounded-full pktw-bg-[var(--pk-success,#22c55e)]" />
            Added
        </span>
    </div>
    <DiffView original={original} modified={polished} />
</div>
```

Import `DiffView` from `@/ui/component/diff/DiffView`.

- [ ] **Step 5: Build and test**

Run: `npm run build`
Test in Obsidian: use the Polish copilot action, verify red strikethrough for removed words and green highlight for added words.

- [ ] **Step 6: Commit**

```bash
git add src/ui/component/diff/wordDiff.ts src/ui/component/diff/DiffView.tsx test/diff-words.test.ts src/ui/view/copilot/panels/PolishPanel.tsx
git commit -m "feat(copilot): add word-level diff highlighting to polish panel"
```

---

### Task 7: Variable Highlighting in SuggestionGrid Cards

**Files:**
- Modify: `src/ui/view/quick-search/components/SuggestionGrid.tsx:32-36`

**Design reference:** `docs/mockups/ai-analysis-landing-v2.html` → suggestion cards with yellow-highlighted variable names

- [ ] **Step 1: Add variable highlighting to suggestion card context text**

In `SuggestionGrid.tsx`, the `context` string (line 15-17) contains filled template variables. The original templates use `{{variableName}}` syntax. Instead of showing filled values in plain text, highlight the dynamic parts.

Modify the `SuggestionCard` component. Store the raw template alongside the filled one in `MatchedSuggestion`, or detect variable-like patterns in the context. The simplest approach: highlight any text segment that appears inside the scope tags.

In the context render block (lines 32-36), replace plain text with highlighted rendering:

```tsx
{/* Replace: <span className="...">{context}</span> */}
<span className="pktw-text-xs pktw-text-[var(--text-muted)] pktw-line-clamp-2">
    {highlightVariables(context)}
</span>
```

Add the highlight function inside the file:

```typescript
function highlightVariables(text: string): React.ReactNode[] {
    // Match quoted strings and path-like segments that represent filled variables
    const parts = text.split(/(「[^」]+」|"[^"]+"|'[^']+')/g);
    return parts.map((part, i) => {
        if (/^[「"']/.test(part)) {
            return (
                <span
                    key={i}
                    className="pktw-bg-[#fef3c7] pktw-text-[#92400e] pktw-px-0.5 pktw-rounded-sm dark:pktw-bg-[#422006] dark:pktw-text-[#fbbf24]"
                >
                    {part}
                </span>
            );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
    });
}
```

Note: The exact regex pattern depends on how `filledTemplate` formats dynamic values. Inspect a few actual `MatchedSuggestion.filledTemplate` strings to confirm the delimiter pattern. If they use a different format (e.g. backticks or no quotes), adjust the regex accordingly.

- [ ] **Step 2: Build and test**

Run: `npm run build`
Test in Obsidian: open AI Analysis, verify suggestion cards show yellow-highlighted variable segments in the description text.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/components/SuggestionGrid.tsx
git commit -m "feat(search): highlight dynamic variables in suggestion cards"
```

---

## Execution Order

```
Task 1 (type extension) ──┬──→ Task 2 (@ menu)
                          └──→ Task 3 (/ menu)
Task 4 (responsive toolbar) ──→ independent
Task 5 (smart suggestions)  ──→ independent
Task 6 (diff highlighting)  ──→ independent
Task 7 (variable highlight)  ──→ independent
```

Tasks 4–7 are fully independent of each other and of Tasks 2–3. After Task 1 completes, all remaining tasks can run in parallel.
