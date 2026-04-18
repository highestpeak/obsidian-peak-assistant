# UI Improvements: All 4 Strategies Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the full UI improvement roadmap from `docs/ui-review-research-report.md` — covering Chat progressive disclosure, Search info scent, Graph improvements, and unified design language.

**Architecture:** Pure frontend changes across React components, a utility function fix, and a new shared EmptyState component. No backend/service changes. Each task is independently testable via Obsidian dev reload.

**Tech Stack:** React 18, Tailwind CSS (prefix `pktw-`), Radix UI (Collapsible), Lucide icons, Zustand stores, canvas 2D API

---

### Task 1: Fix `humanReadableTime` "0 days ago" bug + improve granularity

The `isBeforeToday` branch can produce "0 days ago" when a file was modified late yesterday (before midnight but < 24h ago). Also add "yesterday" and finer "today" granularity.

**Files:**
- Modify: `src/core/utils/date-utils.ts:13-58`
- Create: `test/date-utils.test.ts`

- [ ] **Step 1: Write test for the bug and improved behavior**

```ts
// test/date-utils.test.ts
import { humanReadableTime } from '../src/core/utils/date-utils';

// Helper: get today's midnight
const todayMidnight = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

describe('humanReadableTime', () => {
  test('returns "just now" for timestamps within last 60 seconds', () => {
    expect(humanReadableTime(Date.now() - 30_000)).toBe('just now');
  });

  test('returns minutes ago for today', () => {
    expect(humanReadableTime(Date.now() - 5 * 60_000)).toBe('5 minutes ago');
  });

  test('returns hours ago for today', () => {
    expect(humanReadableTime(Date.now() - 3 * 3600_000)).toBe('3 hours ago');
  });

  test('returns "yesterday" for timestamps from yesterday (not "0 days ago")', () => {
    // 1 minute before midnight = yesterday, but < 24h ago
    const justBeforeMidnight = todayMidnight() - 60_000;
    expect(humanReadableTime(justBeforeMidnight)).toBe('yesterday');
  });

  test('returns "yesterday" for timestamps from early yesterday', () => {
    // 30 hours ago — definitely yesterday
    const earlyYesterday = Date.now() - 30 * 3600_000;
    // Only "yesterday" if it's actually the previous calendar day
    const result = humanReadableTime(earlyYesterday);
    expect(result).toMatch(/^(yesterday|2 days ago)$/);
  });

  test('returns "N days ago" for 2-6 days', () => {
    const threeDaysAgo = Date.now() - 3 * 24 * 3600_000;
    expect(humanReadableTime(threeDaysAgo)).toBe('3 days ago');
  });

  test('returns weeks ago for 7-27 days', () => {
    const twoWeeksAgo = Date.now() - 14 * 24 * 3600_000;
    expect(humanReadableTime(twoWeeksAgo)).toBe('2 weeks ago');
  });

  test('never returns "0 days ago"', () => {
    // Test the exact edge case: 1ms before today's midnight
    const edgeCase = todayMidnight() - 1;
    const result = humanReadableTime(edgeCase);
    expect(result).not.toContain('0 days');
    expect(result).toBe('yesterday');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/date-utils.test.ts`
Expected: FAIL — "yesterday" assertions fail because current code returns "0 days ago"

- [ ] **Step 3: Fix `humanReadableTime` with calendar-day diffing and "yesterday" support**

Replace the entire function body in `src/core/utils/date-utils.ts:13-58`:

```ts
export function humanReadableTime(timestamp: number): string {
  const now = Date.now();
  const nowDate = new Date(now);

  // Get today's date at 0:00 in local timezone
  const today = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());

  // Check if timestamp is before today's 0:00
  const isBeforeToday = timestamp < today.getTime();

  if (isBeforeToday) {
    // Use calendar-day difference (not hour-based) to avoid "0 days ago"
    const timestampDate = new Date(timestamp);
    const timestampDay = new Date(timestampDate.getFullYear(), timestampDate.getMonth(), timestampDate.getDate());
    const diffDays = Math.round((today.getTime() - timestampDay.getTime()) / (24 * 3600_000));

    if (diffDays <= 1) {
      return 'yesterday';
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    }

    const diffWeeks = Math.floor(diffDays / 7);
    if (diffWeeks < 4) {
      return `${diffWeeks} ${diffWeeks === 1 ? 'week' : 'weeks'} ago`;
    }

    const diffMonths = Math.floor(diffDays / 30);
    if (diffMonths < 12) {
      return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
    }

    return 'more than one year ago';
  } else {
    // Use minutes/hours for today's timestamps
    const diffMs = now - timestamp;
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);

    if (diffSeconds < 60) {
      return 'just now';
    } else if (diffMinutes < 60) {
      return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
    } else {
      return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
    }
  }
}
```

Key change: use calendar-day diff (`today - timestampDay` in whole days) instead of `Math.floor(diffHours / 24)`, and add explicit "yesterday" for `diffDays <= 1`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- test/date-utils.test.ts`
Expected: PASS — all assertions pass

- [ ] **Step 5: Commit**

```bash
git add src/core/utils/date-utils.ts test/date-utils.test.ts
git commit -m "fix: humanReadableTime '0 days ago' bug, add 'yesterday' support"
```

---

### Task 2: Improve file path display in search results

Show last 2 path segments + filename instead of full path with CSS truncation. Add hover tooltip for full path.

**Files:**
- Modify: `src/ui/view/quick-search/components/VaultSearchResult.tsx:154-161`

- [ ] **Step 1: Add path truncation helper**

Add at the top of `VaultSearchResult.tsx` (after imports, before components):

```ts
/** Show last 2 directory segments + filename. E.g. "projects/web/README.md" from "notes/projects/web/README.md" */
function truncatePath(fullPath: string): string {
  const parts = fullPath.split('/');
  if (parts.length <= 3) return fullPath;
  return '…/' + parts.slice(-3).join('/');
}
```

- [ ] **Step 2: Update path rendering with truncation + title tooltip**

Replace lines 158-161 in `VaultSearchResult.tsx` (the ChevronRight + path span):

Old:
```tsx
<ChevronRight className="pktw-w-3 pktw-h-3 pktw-text-[#d1d5db] pktw-flex-shrink-0" />
<span className="pktw-text-xs pktw-text-[#999999] pktw-truncate">
    {highlightText(result.path, currentQuery.split(/\s+/))}
</span>
```

New:
```tsx
<ChevronRight className="pktw-w-3 pktw-h-3 pktw-text-[#d1d5db] pktw-flex-shrink-0" />
<span className="pktw-text-xs pktw-text-[#999999] pktw-truncate" title={result.path}>
    {highlightText(truncatePath(result.path), currentQuery.split(/\s+/))}
</span>
```

- [ ] **Step 3: Verify in Obsidian**

1. `npm run dev` → reload plugin
2. Open Quick Search (Cmd+O), type a query
3. Verify: paths show last 2 dirs + filename (e.g. "…/projects/web/README.md")
4. Verify: hovering shows full path tooltip

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/components/VaultSearchResult.tsx
git commit -m "feat: truncate search result paths to last 2 segments, hover for full path"
```

---

### Task 3: Fix AI Analysis tab blank page (P0)

The `V2ReportView` returns `null` when sections are empty, causing a completely blank tab. Fix by showing a meaningful empty/loading state instead.

**Files:**
- Modify: `src/ui/view/quick-search/components/V2SearchResultView.tsx:19-61`
- Modify: `src/ui/view/quick-search/components/V2ReportView.tsx` (the early returns around lines 300-309)

- [ ] **Step 1: Fix V2ReportView — replace `return null` with empty state**

In `V2ReportView.tsx`, find the two early returns (around lines 300-309):

Old:
```tsx
if (sections.length > 0 && !planApproved) {
    return (
        <div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-32 pktw-text-sm pktw-text-[#9ca3af]">
            Report will appear here after plan approval in Process view.
        </div>
    );
}
if (sections.length === 0 && !summary && rounds.length === 0) return null;
```

New:
```tsx
if (sections.length > 0 && !planApproved) {
    return (
        <div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-py-16 pktw-text-sm pktw-text-[#9ca3af] pktw-gap-2">
            <FileText className="pktw-w-8 pktw-h-8 pktw-opacity-40" />
            <span>Report will appear after plan approval.</span>
            <Button
                variant="ghost"
                size="sm"
                className="pktw-text-xs pktw-text-[#7c3aed] hover:pktw-text-[#6d28d9]"
                onClick={() => useSearchSessionStore.getState().setV2View('process')}
            >
                Go to Process view →
            </Button>
        </div>
    );
}
if (sections.length === 0 && !summary && rounds.length === 0) {
    return (
        <div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-py-16 pktw-text-sm pktw-text-[#9ca3af] pktw-gap-2">
            <FileText className="pktw-w-8 pktw-h-8 pktw-opacity-40" />
            <span>No report data yet. Start an analysis to see results here.</span>
        </div>
    );
}
```

Add `FileText` to the lucide-react imports if not already imported. Add `Button` import from `@/ui/component/shared-ui/button` if needed. Add `useSearchSessionStore` import if needed.

- [ ] **Step 2: Verify in Obsidian**

1. Reload plugin
2. Open Quick Search → AI Analysis tab
3. Click "Report" tab before running any analysis → should show "No report data yet" with icon (not blank)
4. Run an analysis → before approving plan, switch to Report → should show "Report will appear after plan approval" with "Go to Process view" link
5. Complete analysis → Report should render normally

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/components/V2ReportView.tsx
git commit -m "fix: AI Analysis Report tab blank page — show empty state instead of null"
```

---

### Task 4: Chat trace — collapse tool calls by default, show one-line summary

Tool calls currently show expanded JSON by default. Change to collapsed by default with a human-readable summary line.

**Files:**
- Modify: `src/ui/view/chat-view/components/messages/MessageViewItem.tsx:187-222`

- [ ] **Step 1: Create a tool call summary helper**

Add before `ToolCallsDisplay` in `MessageViewItem.tsx` (around line 185):

```ts
/** One-line summary for a tool call, e.g. "✓ search_vault · 3 results" */
function toolCallSummary(tc: ToolCallInfo): string {
  if (tc.isActive) return `Running ${tc.toolName}…`;
  const outputStr = tc.output ? JSON.stringify(tc.output) : '';
  const inputStr = tc.input ? JSON.stringify(tc.input) : '';
  const inputLen = inputStr.length > 60 ? inputStr.slice(0, 57) + '…' : inputStr;
  if (tc.output) {
    return `✓ ${tc.toolName}`;
  }
  return tc.toolName;
}
```

- [ ] **Step 2: Change ToolCallsDisplay to collapse by default + show summary**

Replace the `ToolCallsDisplay` component (lines 187-222):

Old:
```tsx
const ToolCallsDisplay: React.FC<{
    expanded: boolean;
    toolCalls: ToolCallInfo[];
}> = ({ expanded, toolCalls }) => {
    return (
        <div className="pktw-w-full pktw-space-y-2">
            {toolCalls.map((toolCall, index) => (
                <Task key={index} defaultOpen={expanded}>
                    <TaskTrigger title={toolCall.toolName} />
                    <TaskContent>
                        <TaskItem>
                            {toolCall.input && (
                                <div className="pktw-text-xs pktw-text-muted-foreground pktw-mb-2">
                                    <strong>Input:</strong>
                                    <pre className="pktw-whitespace-pre-wrap pktw-mt-1">{JSON.stringify(toolCall.input, null, 2)}</pre>
                                </div>
                            )}
                            {toolCall.output && (
                                <div className="pktw-text-xs pktw-text-muted-foreground pktw-mb-2">
                                    <strong>Output:</strong>
                                    <pre className="pktw-whitespace-pre-wrap pktw-mt-1">{JSON.stringify(toolCall.output, null, 2)}</pre>
                                </div>
                            )}
                            {toolCall.isActive && (
                                <div className="pktw-flex pktw-items-center pktw-mt-2">
                                    <Loader2 className="pktw-size-3 pktw-animate-spin pktw-text-muted-foreground pktw-mr-2" />
                                    <span className="pktw-text-xs pktw-text-muted-foreground">Running...</span>
                                </div>
                            )}
                        </TaskItem>
                    </TaskContent>
                </Task>
            ))}
        </div>
    );
};
```

New:
```tsx
const ToolCallsDisplay: React.FC<{
    toolCalls: ToolCallInfo[];
}> = ({ toolCalls }) => {
    return (
        <div className="pktw-w-full pktw-space-y-1">
            {toolCalls.map((toolCall, index) => (
                <Task key={index} defaultOpen={toolCall.isActive}>
                    <TaskTrigger title={toolCallSummary(toolCall)} />
                    <TaskContent>
                        <TaskItem>
                            {toolCall.input && (
                                <div className="pktw-text-xs pktw-text-muted-foreground pktw-mb-2">
                                    <strong>Input:</strong>
                                    <pre className="pktw-whitespace-pre-wrap pktw-mt-1 pktw-max-h-[200px] pktw-overflow-y-auto">{JSON.stringify(toolCall.input, null, 2)}</pre>
                                </div>
                            )}
                            {toolCall.output && (
                                <div className="pktw-text-xs pktw-text-muted-foreground pktw-mb-2">
                                    <strong>Output:</strong>
                                    <pre className="pktw-whitespace-pre-wrap pktw-mt-1 pktw-max-h-[200px] pktw-overflow-y-auto">{JSON.stringify(toolCall.output, null, 2)}</pre>
                                </div>
                            )}
                            {toolCall.isActive && (
                                <div className="pktw-flex pktw-items-center pktw-mt-2">
                                    <Loader2 className="pktw-size-3 pktw-animate-spin pktw-text-muted-foreground pktw-mr-2" />
                                    <span className="pktw-text-xs pktw-text-muted-foreground">Running...</span>
                                </div>
                            )}
                        </TaskItem>
                    </TaskContent>
                </Task>
            ))}
        </div>
    );
};
```

Key changes:
1. `defaultOpen={toolCall.isActive}` — only active (in-progress) tool calls are expanded
2. `TaskTrigger title={toolCallSummary(toolCall)}` — shows "✓ toolName" instead of just "toolName"
3. Removed `expanded` prop — no longer needed
4. Added `pktw-max-h-[200px] pktw-overflow-y-auto` on `<pre>` to cap JSON height
5. Reduced `pktw-space-y-2` → `pktw-space-y-1` for tighter layout

- [ ] **Step 3: Update all `ToolCallsDisplay` call sites to remove `expanded` prop**

Search for `<ToolCallsDisplay` in `MessageViewItem.tsx` and remove the `expanded` prop. There should be one or two call sites — change from:

```tsx
<ToolCallsDisplay expanded={...} toolCalls={currentToolCalls} />
```

To:

```tsx
<ToolCallsDisplay toolCalls={currentToolCalls} />
```

- [ ] **Step 4: Verify in Obsidian**

1. Reload plugin
2. Open a conversation with tool calls (or start a new one that triggers tools)
3. Verify: completed tool calls show as collapsed one-liners ("✓ search_vault")
4. Verify: clicking expands to show Input/Output JSON
5. Verify: active (in-progress) tool calls auto-expand with spinner
6. Verify: expanded JSON is capped at 200px height with scroll

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/chat-view/components/messages/MessageViewItem.tsx
git commit -m "feat: collapse chat tool calls by default, show one-line summary"
```

---

### Task 5: Simplify chat input placeholder

Reduce information density of the placeholder text. Show only "Type your message..." when empty, keep syntax hints minimal.

**Files:**
- Modify: `src/ui/view/chat-view/components/ChatInputArea.tsx:332-334`

- [ ] **Step 1: Simplify placeholder text**

In `ChatInputArea.tsx`, replace lines 332-334:

Old:
```ts
const hasMessages = activeConversation && activeConversation.messages.length > 0;
const placeholder = (hasMessages ? '' : 'Type your message here...\n')
    + '@ or [[]] for context. / for prompts. ⌘ ↩︎ for a line break.';
```

New:
```ts
const hasMessages = activeConversation && activeConversation.messages.length > 0;
const placeholder = hasMessages
    ? 'Reply… (@ for context, / for prompts)'
    : 'Type your message…';
```

- [ ] **Step 2: Verify in Obsidian**

1. Reload plugin
2. Open a new conversation → placeholder should say "Type your message…"
3. Send a message → placeholder should change to "Reply… (@ for context, / for prompts)"

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/chat-view/components/ChatInputArea.tsx
git commit -m "feat: simplify chat input placeholder, reduce cognitive load"
```

---

### Task 6: Show suggestion tags only after first message

Transfer/Update/CodeReview buttons should not appear on empty conversations.

**Files:**
- Modify: `src/ui/view/chat-view/view-Messages.tsx:117-123`

- [ ] **Step 1: Conditionally render SuggestionTags**

In `view-Messages.tsx`, find the SuggestionTags rendering (around lines 117-123):

Old:
```tsx
<div className="pktw-flex-shrink-0 pktw-flex pktw-justify-between pktw-items-center pktw-px-6 pktw-pt-6 pktw-border-b pktw-border-borde">
    {/* Tags on the left */}
    <SuggestionTags
        tags={suggestionTags}
        onTagClick={handleSuggestionTagClick}
    />
```

New:
```tsx
<div className="pktw-flex-shrink-0 pktw-flex pktw-justify-between pktw-items-center pktw-px-6 pktw-pt-6 pktw-border-b pktw-border-borde">
    {/* Tags on the left — only show after conversation has messages */}
    {activeConversation && activeConversation.messages.length > 0 ? (
        <SuggestionTags
            tags={suggestionTags}
            onTagClick={handleSuggestionTagClick}
        />
    ) : <div />}
```

The `<div />` placeholder keeps the flex layout so scroll buttons stay on the right.

- [ ] **Step 2: Verify in Obsidian**

1. Reload plugin
2. Open a new/pending conversation → Transfer/Update/CodeReview buttons should NOT appear
3. Send a message → buttons should appear
4. Open an existing conversation with messages → buttons should be visible

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/chat-view/view-Messages.tsx
git commit -m "feat: hide suggestion tags until conversation has messages"
```

---

### Task 7: Create unified EmptyState component

Replace scattered inline empty states with a consistent pattern: icon + message + optional description + optional CTA.

**Files:**
- Create: `src/ui/component/shared-ui/empty-state.tsx`

- [ ] **Step 1: Create the EmptyState component**

```tsx
// src/ui/component/shared-ui/empty-state.tsx
import React from 'react';
import { cn } from '@/ui/react/lib/utils';
import { type LucideIcon } from 'lucide-react';
import { Button } from './button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  className,
}) => (
  <div className={cn(
    'pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-py-12 pktw-text-center',
    className
  )}>
    {Icon && (
      <Icon className="pktw-w-10 pktw-h-10 pktw-text-muted-foreground pktw-opacity-40 pktw-mb-3" />
    )}
    <span className="pktw-text-sm pktw-font-medium pktw-text-muted-foreground">
      {title}
    </span>
    {description && (
      <span className="pktw-text-xs pktw-text-muted-foreground pktw-opacity-70 pktw-mt-1 pktw-max-w-[280px]">
        {description}
      </span>
    )}
    {action && (
      <Button
        variant="ghost"
        size="sm"
        className="pktw-mt-3 pktw-text-xs pktw-text-[#7c3aed] hover:pktw-text-[#6d28d9]"
        onClick={action.onClick}
      >
        {action.label}
      </Button>
    )}
  </div>
);
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/component/shared-ui/empty-state.tsx
git commit -m "feat: add unified EmptyState component (icon + title + description + CTA)"
```

---

### Task 8: Apply EmptyState to Chat Home, Inspector, and Graph

Replace scattered inline empty states with the new unified `EmptyState` component.

**Files:**
- Modify: `src/ui/view/chat-view/view-Home.tsx:146-153` (conversations empty)
- Modify: `src/ui/view/chat-view/view-Home.tsx:185-192` (projects empty)
- Modify: `src/ui/view/quick-search/components/inspector/LinksSection.tsx:326-331`
- Modify: `src/ui/component/mine/graph-viz/components/GraphEmptyState.tsx:1-14`

- [ ] **Step 1: Update Chat Home — conversations empty state**

In `view-Home.tsx`, replace the conversations empty state (lines 146-153):

Old:
```tsx
<div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-py-12 pktw-text-muted-foreground">
    <MessageSquare className="pktw-w-12 pktw-h-12 pktw-mb-4 pktw-opacity-50" />
    <p className="pktw-text-center">No conversations yet.</p>
    <p className="pktw-text-sm pktw-text-center pktw-mt-1">
        Start your first conversation to see it here.
    </p>
</div>
```

New:
```tsx
<EmptyState
    icon={MessageSquare}
    title="No conversations yet"
    description="Start your first conversation to see it here."
    action={{ label: 'New Conversation', onClick: handleCreateConversation }}
/>
```

Add import: `import { EmptyState } from '@/ui/component/shared-ui/empty-state';`

- [ ] **Step 2: Update Chat Home — projects empty state**

In `view-Home.tsx`, replace the projects empty state (lines 185-192):

Old:
```tsx
<div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-py-12 pktw-text-muted-foreground">
    <Folder className="pktw-w-12 pktw-h-12 pktw-mb-4 pktw-opacity-50" />
    <p className="pktw-text-center">No projects yet.</p>
    <p className="pktw-text-sm pktw-text-center pktw-mt-1">
        Create your first project to see it here.
    </p>
</div>
```

New:
```tsx
<EmptyState
    icon={Folder}
    title="No projects yet"
    description="Create your first project to see it here."
    action={{ label: 'New Project', onClick: handleCreateProject }}
/>
```

- [ ] **Step 3: Update Inspector LinksSection empty state**

In `LinksSection.tsx`, replace lines 326-331:

Old:
```tsx
<div className={cn('pktw-text-sm pktw-text-[#6b7280]', className)}>
    No links for this note. Open a note and try again.
</div>
```

New:
```tsx
<EmptyState
    title="No links found"
    description="Open a note with outgoing or incoming links to see them here."
    className={className}
/>
```

Add import: `import { EmptyState } from '@/ui/component/shared-ui/empty-state';`

- [ ] **Step 4: Update GraphEmptyState to use the shared component**

Replace `src/ui/component/mine/graph-viz/components/GraphEmptyState.tsx`:

```tsx
import React from 'react';
import { EmptyState } from '@/ui/component/shared-ui/empty-state';

export interface GraphEmptyStateProps {
  message?: string;
}

/** Empty state overlay. Uses pointer-events-none so it does not block clicks. */
export const GraphEmptyState: React.FC<GraphEmptyStateProps> = ({
  message = 'Waiting for graph data…',
}) => (
  <div className="pktw-absolute pktw-inset-0 pktw-flex pktw-items-center pktw-justify-center pktw-pointer-events-none">
    <EmptyState title={message} className="pktw-py-0" />
  </div>
);
```

- [ ] **Step 5: Verify in Obsidian**

1. Reload plugin
2. Chat Home with no conversations → should show EmptyState with "New Conversation" CTA button
3. Chat Home with no projects → should show EmptyState with "New Project" CTA button
4. Inspector with no links → should show "No links found" with description
5. Graph with no data → should show centered empty text

- [ ] **Step 6: Commit**

```bash
git add src/ui/view/chat-view/view-Home.tsx src/ui/view/quick-search/components/inspector/LinksSection.tsx src/ui/component/mine/graph-viz/components/GraphEmptyState.tsx
git commit -m "feat: apply unified EmptyState to Chat Home, Inspector, and Graph"
```

---

### Task 9: Hops selector — upgrade to segmented control

Replace the plain text buttons with a visually distinct segmented control (pill-shaped toggle group).

**Files:**
- Modify: `src/ui/component/mine/graph-viz/components/GraphCapabilityToolbar.tsx:59-79`

- [ ] **Step 1: Redesign hops buttons as segmented control**

In `GraphCapabilityToolbar.tsx`, replace the hops rendering block (lines 59-79):

Old:
```tsx
{hops ? (
    <div className="pktw-flex-shrink-0 pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5">
        <span className="pktw-text-[11px] pktw-font-medium pktw-text-[#6b7280] pktw-flex pktw-items-center pktw-gap-1">
            <Focus className="pktw-w-3.5 pktw-h-3.5" />
            Hops:
            {([1, 2, 3] as const).map((h) => (
                <Button
                    key={h}
                    size="sm"
                    variant="ghost"
                    className={cn(
                        'pktw-h-6 pktw-px-1.5 pktw-text-xs',
                        hops.value === h ? 'pktw-bg-[#f5f3ff] pktw-text-[#7c3aed]' : ''
                    )}
                    onClick={() => hops.onChange(h as ToolbarHopsValue)}
                >
                    {h}
                </Button>
            ))}
        </span>
    </div>
) : null}
```

New:
```tsx
{hops ? (
    <div className="pktw-flex-shrink-0 pktw-flex pktw-items-center pktw-gap-2 pktw-py-1.5">
        <span className="pktw-text-[11px] pktw-font-medium pktw-text-[#6b7280] pktw-flex pktw-items-center pktw-gap-1.5">
            <Focus className="pktw-w-3.5 pktw-h-3.5" />
            Hops
        </span>
        <div className="pktw-inline-flex pktw-rounded-md pktw-border pktw-border-[#e5e7eb] pktw-bg-[#f9fafb] pktw-p-0.5">
            {([1, 2, 3] as const).map((h) => (
                <Button
                    key={h}
                    size="sm"
                    variant="ghost"
                    className={cn(
                        'pktw-h-5 pktw-w-6 pktw-px-0 pktw-text-xs pktw-rounded-[3px] pktw-transition-all',
                        hops.value === h
                            ? 'pktw-bg-[#7c3aed] pktw-text-white pktw-shadow-sm hover:pktw-bg-[#6d28d9]'
                            : 'pktw-text-[#6b7280] hover:pktw-text-[#374151]'
                    )}
                    onClick={() => hops.onChange(h as ToolbarHopsValue)}
                >
                    {h}
                </Button>
            ))}
        </div>
    </div>
) : null}
```

Key changes:
- Container wraps buttons in a bordered pill shape (`pktw-rounded-md pktw-border`)
- Active state: solid purple background + white text (vs. faint purple bg before)
- Tighter spacing, consistent sizing
- Label "Hops" separated from buttons for clarity

- [ ] **Step 2: Apply same style to GraphToolsPanel hops selector**

In `src/ui/component/mine/graph-viz/components/GraphToolsPanel.tsx`, find the similar hops rendering (around lines 161-185) and apply the same segmented control pattern.

- [ ] **Step 3: Verify in Obsidian**

1. Reload plugin
2. Open Inspector → Graph section → verify segmented Hops control appears with pill shape
3. Click 1/2/3 → verify selected state is solid purple with white text
4. Open fullscreen graph → verify same control in GraphToolsPanel

- [ ] **Step 4: Commit**

```bash
git add src/ui/component/mine/graph-viz/components/GraphCapabilityToolbar.tsx src/ui/component/mine/graph-viz/components/GraphToolsPanel.tsx
git commit -m "feat: upgrade Hops selector to segmented control with solid purple active state"
```

---

### Task 10: Compact Chat Home Quick Actions + brand color accent

Make Quick Actions buttons smaller and add purple brand accent to the Chat area.

**Files:**
- Modify: `src/ui/view/chat-view/view-Home.tsx:109-127` (Quick Actions buttons)
- Modify: `src/ui/view/chat-view/view-Messages.tsx:93-97` ("Ready when you are" empty state)

- [ ] **Step 1: Compact Quick Actions buttons with brand color**

In `view-Home.tsx`, replace the Quick Actions buttons block (lines 109-126):

Old:
```tsx
<div className="pktw-flex pktw-flex-row pktw-gap-6">
    <Button
        className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-6 pktw-py-4 pktw-bg-secondary pktw-text-secondary-foreground hover:pktw-bg-primary hover:pktw-text-primary-foreground pktw-rounded-lg pktw-transition-colors pktw-font-medium"
        onClick={handleCreateConversation}
        title="Start a new conversation"
    >
        <MessageSquare className="pktw-w-6 pktw-h-6" />
        <span>New Conversation</span>
    </Button>
    <Button
        className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-6 pktw-py-4 pktw-bg-secondary pktw-text-secondary-foreground hover:pktw-bg-primary hover:pktw-text-primary-foreground pktw-rounded-lg pktw-transition-colors pktw-font-medium"
        onClick={handleCreateProject}
        title="Create a new project"
    >
        <Folder className="pktw-w-6 pktw-h-6" />
        <span>New Project</span>
    </Button>
</div>
```

New:
```tsx
<div className="pktw-flex pktw-flex-row pktw-gap-3">
    <Button
        className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-4 pktw-py-2.5 pktw-bg-[#f5f3ff] pktw-text-[#7c3aed] hover:pktw-bg-[#ede9fe] pktw-border pktw-border-[#e4d4fc] pktw-rounded-lg pktw-transition-colors pktw-font-medium pktw-text-sm"
        onClick={handleCreateConversation}
        title="Start a new conversation"
    >
        <MessageSquare className="pktw-w-4 pktw-h-4" />
        <span>New Conversation</span>
    </Button>
    <Button
        className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-4 pktw-py-2.5 pktw-bg-[#f5f3ff] pktw-text-[#7c3aed] hover:pktw-bg-[#ede9fe] pktw-border pktw-border-[#e4d4fc] pktw-rounded-lg pktw-transition-colors pktw-font-medium pktw-text-sm"
        onClick={handleCreateProject}
        title="Create a new project"
    >
        <Folder className="pktw-w-4 pktw-h-4" />
        <span>New Project</span>
    </Button>
</div>
```

Key changes:
- Smaller padding: `px-6 py-4` → `px-4 py-2.5`
- Smaller icons: `w-6 h-6` → `w-4 h-4`
- Purple brand color instead of generic secondary: `bg-[#f5f3ff] text-[#7c3aed]`
- Purple border for visual definition: `border-[#e4d4fc]`
- Smaller gap: `gap-6` → `gap-3`

- [ ] **Step 2: Add subtle brand accent to "Ready when you are" empty state**

In `view-Messages.tsx`, replace the empty state (lines 93-97):

Old:
```tsx
{!activeConversation || pendingConversation ? (
    <div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-min-h-[400px]">
        <div className="pktw-text-2xl pktw-font-light pktw-text-muted-foreground pktw-text-center">Ready when you are.</div>
    </div>
) : null}
```

New:
```tsx
{!activeConversation || pendingConversation ? (
    <div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-h-full pktw-min-h-[400px] pktw-gap-2">
        <div className="pktw-text-2xl pktw-font-light pktw-text-[#7c3aed] pktw-opacity-60 pktw-text-center">Ready when you are.</div>
        <div className="pktw-text-xs pktw-text-muted-foreground">Type a message below to get started</div>
    </div>
) : null}
```

- [ ] **Step 3: Update duplicate in MessageListRenderer**

In `src/ui/view/chat-view/components/messages/MessageListRenderer.tsx` (around line 91), apply the same style change to the duplicate "Ready when you are." rendering:

Old:
```tsx
<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-min-h-[400px]">
    <div className="pktw-text-2xl pktw-font-light pktw-text-muted-foreground pktw-text-center">Ready when you are.</div>
</div>
```

New:
```tsx
<div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-h-full pktw-min-h-[400px] pktw-gap-2">
    <div className="pktw-text-2xl pktw-font-light pktw-text-[#7c3aed] pktw-opacity-60 pktw-text-center">Ready when you are.</div>
    <div className="pktw-text-xs pktw-text-muted-foreground">Type a message below to get started</div>
</div>
```

- [ ] **Step 4: Verify in Obsidian**

1. Reload plugin
2. Chat Home → Quick Actions should be compact with purple brand color
3. New conversation → "Ready when you are." should be in subtle purple with helper text below
4. Verify the layout feels tighter and more polished

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/chat-view/view-Home.tsx src/ui/view/chat-view/view-Messages.tsx src/ui/view/chat-view/components/messages/MessageListRenderer.tsx
git commit -m "feat: compact Chat Home Quick Actions with brand color, purple accent on empty state"
```

---

## Verification Checklist (after all tasks)

After completing all 10 tasks, verify the following in Obsidian:

- [ ] **Strategy 1 — Chat Progressive Disclosure:**
  - Tool calls collapse by default, showing "✓ toolName"
  - Active tool calls auto-expand with spinner
  - Placeholder is simplified
  - Suggestion tags hidden on empty conversations

- [ ] **Strategy 2 — Search Info Scent:**
  - Time shows "yesterday" instead of "0 days ago"
  - Search paths truncated to last 2 segments with hover tooltip
  - AI Analysis Report tab never shows blank — always has meaningful empty state

- [ ] **Strategy 3 — Graph:**
  - Hops selector is a segmented control with solid purple active state
  - Graph empty state uses unified component

- [ ] **Strategy 4 — Design Language:**
  - EmptyState component used consistently (Chat Home, Inspector, Graph)
  - Chat Home Quick Actions are compact with purple brand color
  - "Ready when you are." has purple accent
  - Empty states have CTA buttons where applicable
