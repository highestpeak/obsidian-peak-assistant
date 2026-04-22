# Chat UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete visual/UX overhaul of all chat views — message list, actions, tool calls, input menus, home, conversation list, project overview, file changes, outline, suggestions, conversation types, and thinking states.

**Architecture:** ConversationType becomes a first-class field on ConversationMeta, driving UI layout and list badges. Message actions move inline below bubbles with hover-reveal. Tool calls collapse to a summary line. @ and / menus become custom React components. All hardcoded colors migrate to CSS vars (coordinated with UI/Theme plan).

**Tech Stack:** React, Zustand, CodeMirror 6 (for input), Radix UI (popovers/collapsible), CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-04-22-chat-ui-redesign-design.md`
**Mockups:** `docs/mockups/chat-redesign-part1-messages.html`, `docs/mockups/chat-redesign-part2-pages.html`

**Prerequisites:** Chat System Polish (store restructure) and UI/Theme Foundation (CSS vars) should ideally land first. Tasks below are written to work on the current codebase but reference `var(--pk-*)` where applicable — if CSS vars aren't ready yet, use hardcoded fallbacks and migrate later.

---

## File Structure

### New files

| File | Purpose |
|---|---|
| `src/service/chat/conversation-types.ts` | `ConversationType` union + helpers (icon, label, badge color) |
| `src/ui/view/chat-view/components/ThinkingIndicator.tsx` | Gentle-pulse dots replacing AnimatedSparkles |
| `src/ui/view/chat-view/components/MessageRoleAvatar.tsx` | 20px role avatar (user/AI) |
| `src/ui/view/chat-view/components/MessageStyleButtons.tsx` | Style switch buttons below AI responses |
| `src/ui/view/chat-view/components/ToolCallSummary.tsx` | Option A collapsed summary for tool calls |
| `src/ui/view/chat-view/components/DateSeparator.tsx` | "Today" / "Yesterday" / date separator |
| `src/ui/view/chat-view/components/ContextMenu.tsx` | Custom @ context menu (replaces CodeMirror tooltip) |
| `src/ui/view/chat-view/components/PromptMenu.tsx` | Custom / prompt menu (replaces CodeMirror tooltip) |
| `src/ui/view/chat-view/components/ConversationOutline.tsx` | Topic tree right panel |
| `src/ui/view/chat-view/components/NewConversationTypePicker.tsx` | Type selection grid + template list |
| `src/ui/view/chat-view/components/SuggestionActions.tsx` | Context-aware action chips |

### Modified files

| File | Change summary |
|---|---|
| `src/service/chat/types.ts` | Add `ConversationType`, add `type` to `ChatConversationMeta` |
| `src/ui/view/chat-view/components/messages/MessageViewItem.tsx` | Role avatar, both-bubble bg, date separator integration |
| `src/ui/view/chat-view/components/messages/MessageActionsList.tsx` | Inline below bubble, hover fade, metadata row |
| `src/ui/view/chat-view/components/messages/ToolCallsDisplay.tsx` | Replace with ToolCallSummary |
| `src/ui/view/chat-view/components/messages/MessageViewHeader.tsx` | Fix hardcoded colors, add outline toggle |
| `src/ui/view/chat-view/components/messages/FileChangesList.tsx` | Theme-aware, NEW badge, hover actions |
| `src/ui/view/chat-view/view-Home.tsx` | Rewrite: suggestions + compact list |
| `src/ui/view/chat-view/view-Messages.tsx` | Suggestions row, scroll nav fix, outline toggle |
| `src/ui/view/chat-view/view-ProjectOverview.tsx` | Editable description, inline stats, CTA empty |
| `src/ui/view/chat-view/components/conversation-item.tsx` | Two-row layout, type icon + badge |
| `src/ui/view/chat-view/components/conversation-list.tsx` | Search bar, date grouping |
| `src/ui/view/chat-view/store/chatSessionStore.ts` | Delete mock data |
| `src/ui/component/prompt-input/PromptInputBody.tsx` | IME fix, wire custom menus |
| `src/ui/component/prompt-input/keymap.ts` | IME `isComposing` check |
| `src/styles/codemirror.css` | Restore type icon, fix hardcoded colors |

---

## Task Order

```
Foundation:
  Task 1: ConversationType + meta field
  Task 2: Small fixes (ThinkingIndicator + IME + mock cleanup)

Message Layer:
  Task 3: Role avatars + bubble backgrounds + date separators
  Task 4: Message actions (inline, hover, metadata)
  Task 5: Style switch buttons
  Task 6: Tool calls (Option A collapsed summary)

Input Layer:
  Task 7: @ Context Menu
  Task 8: / Prompt Menu

Page Layer:
  Task 9: Conversation List (two-row, search, date groups)
  Task 10: Home page
  Task 11: New Conversation type picker
  Task 12: Project Overview

Panels:
  Task 13: File Changes Panel
  Task 14: Conversation Outline (topic tree)
  Task 15: Suggestion Actions + scroll nav
```

Tasks 1-2 are foundation. Tasks 3-6 are the message list (most impactful). Tasks 7-8 are input menus. Tasks 9-12 are pages. Tasks 13-15 are panels. Each task is independently committable.

---

### Task 1: ConversationType + Meta Field

**Files:**
- Create: `src/service/chat/conversation-types.ts`
- Modify: `src/service/chat/types.ts:72-84`

- [ ] **Step 1: Create conversation-types.ts**

```typescript
// src/service/chat/conversation-types.ts

export type ConversationType =
  | { kind: 'chat' }
  | { kind: 'agent' }
  | { kind: 'plan' }
  | { kind: 'canvas' }
  | { kind: 'template'; templateId: string; templateName: string }
  | { kind: 'custom'; label: string };

export const DEFAULT_CONVERSATION_TYPE: ConversationType = { kind: 'chat' };

export function getConversationTypeIcon(type: ConversationType): string {
  switch (type.kind) {
    case 'chat': return '💬';
    case 'agent': return '🤖';
    case 'plan': return '📋';
    case 'canvas': return '🎨';
    case 'template': return '📐';
    case 'custom': return '🔧';
  }
}

export function getConversationTypeLabel(type: ConversationType): string | null {
  switch (type.kind) {
    case 'chat': return null; // default, no badge
    case 'agent': return 'Agent';
    case 'plan': return 'Plan';
    case 'canvas': return 'Canvas';
    case 'template': return type.templateName;
    case 'custom': return type.label;
  }
}

export function getConversationTypeBadgeColor(type: ConversationType): { bg: string; fg: string } | null {
  switch (type.kind) {
    case 'chat': return null;
    case 'agent': return { bg: 'var(--pk-accent-muted, rgba(109,40,217,0.10))', fg: 'var(--pk-accent-fg, #6d28d9)' };
    case 'plan': return { bg: 'rgba(59,130,246,0.10)', fg: 'var(--pk-info, #3b82f6)' };
    case 'canvas': return { bg: 'rgba(34,197,94,0.10)', fg: 'var(--pk-success, #22c55e)' };
    case 'template': return { bg: 'rgba(245,158,11,0.10)', fg: 'var(--pk-warning, #f59e0b)' };
    case 'custom': return { bg: 'var(--pk-accent-muted, rgba(109,40,217,0.10))', fg: 'var(--pk-accent-fg, #6d28d9)' };
  }
}
```

- [ ] **Step 2: Add type field to ChatConversationMeta**

In `src/service/chat/types.ts`, add import and field:

```typescript
import type { ConversationType } from './conversation-types';

// In ChatConversationMeta interface, add after line ~84:
  conversationType?: ConversationType;
```

Optional field — `undefined` means `{ kind: 'chat' }` for backward compat with existing conversations.

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/service/chat/conversation-types.ts src/service/chat/types.ts
git commit -m "feat: add ConversationType union and meta field"
```

---

### Task 2: Small Fixes (ThinkingIndicator + IME + Mock Cleanup)

**Files:**
- Create: `src/ui/view/chat-view/components/ThinkingIndicator.tsx`
- Modify: `src/ui/component/prompt-input/keymap.ts`
- Modify: `src/ui/view/chat-view/store/chatSessionStore.ts`

- [ ] **Step 1: Create ThinkingIndicator**

```tsx
// src/ui/view/chat-view/components/ThinkingIndicator.tsx
import React from 'react';

interface ThinkingIndicatorProps {
  text?: string;
}

export const ThinkingIndicator: React.FC<ThinkingIndicatorProps> = ({ text = 'Thinking...' }) => (
  <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-2 pktw-px-3">
    <div className="pktw-flex pktw-gap-[3px]">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="pktw-w-[5px] pktw-h-[5px] pktw-rounded-full pktw-bg-accent"
          style={{
            opacity: 0.25,
            animation: `pktw-gentle-pulse 1.2s ease-in-out infinite`,
            animationDelay: `${i * 0.2}s`,
          }}
        />
      ))}
    </div>
    <span className="pktw-text-xs pktw-italic pktw-text-muted-foreground">{text}</span>
  </div>
);
```

Add the keyframe to `src/styles/tailwind.css` (after the existing keyframes):

```css
@keyframes pktw-gentle-pulse {
  0%, 100% { opacity: 0.25; transform: scale(0.9); }
  50% { opacity: 0.7; transform: scale(1); }
}
```

- [ ] **Step 2: Fix IME Enter key**

In `src/ui/component/prompt-input/keymap.ts`, find the Enter key handler and add `isComposing` check:

```typescript
// Before the Enter-to-submit logic, add:
if (view.composing) return false; // IME is active, don't submit
```

This prevents Chinese/Japanese/Korean IME confirmation from triggering message send.

- [ ] **Step 3: Delete mock data from chatSessionStore**

In `src/ui/view/chat-view/store/chatSessionStore.ts`, find and replace:
- `initialFileChanges` array → `[]`
- `initialExternalPrompts` array → `[]`
- `initialSuggestionTags` array → `[]`

Delete the mock data definitions entirely. The initial state should be empty arrays.

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/chat-view/components/ThinkingIndicator.tsx src/ui/component/prompt-input/keymap.ts src/ui/view/chat-view/store/chatSessionStore.ts src/styles/tailwind.css
git commit -m "feat: add ThinkingIndicator, fix IME Enter key, clean mock data"
```

---

### Task 3: Role Avatars + Bubble Backgrounds + Date Separators

**Files:**
- Create: `src/ui/view/chat-view/components/MessageRoleAvatar.tsx`
- Create: `src/ui/view/chat-view/components/DateSeparator.tsx`
- Modify: `src/ui/view/chat-view/components/messages/MessageViewItem.tsx`
- Modify: `src/ui/view/chat-view/components/messages/MessageListRenderer.tsx`

- [ ] **Step 1: Create MessageRoleAvatar**

```tsx
// src/ui/view/chat-view/components/MessageRoleAvatar.tsx
import React from 'react';

interface MessageRoleAvatarProps {
  role: 'user' | 'assistant';
}

export const MessageRoleAvatar: React.FC<MessageRoleAvatarProps> = ({ role }) => {
  const isUser = role === 'user';
  return (
    <div className={cn(
      "pktw-w-5 pktw-h-5 pktw-rounded-[5px] pktw-flex pktw-items-center pktw-justify-center pktw-text-[10px] pktw-flex-shrink-0 pktw-mt-0.5",
      isUser ? "pktw-bg-muted pktw-text-muted-foreground" : "pktw-bg-accent/10 pktw-text-accent"
    )}>
      {isUser ? '👤' : '✨'}
    </div>
  );
};
```

- [ ] **Step 2: Create DateSeparator**

```tsx
// src/ui/view/chat-view/components/DateSeparator.tsx
import React from 'react';

interface DateSeparatorProps {
  date: Date;
}

export const DateSeparator: React.FC<DateSeparatorProps> = ({ date }) => {
  const label = formatDateLabel(date);
  return (
    <div className="pktw-flex pktw-items-center pktw-gap-3 pktw-my-4">
      <div className="pktw-flex-1 pktw-h-px pktw-bg-border" />
      <span className="pktw-text-[9px] pktw-font-semibold pktw-text-muted-foreground pktw-uppercase pktw-tracking-wider">{label}</span>
      <div className="pktw-flex-1 pktw-h-px pktw-bg-border" />
    </div>
  );
};

function formatDateLabel(date: Date): string {
  const now = new Date();
  const diff = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
```

- [ ] **Step 3: Integrate into MessageViewItem**

Read `MessageViewItem.tsx` at implementation time. Key changes:
- Wrap message content in a flex row: `<MessageRoleAvatar>` + message body
- Add role label above bubble: `<span className="pktw-text-[9px] pktw-font-semibold pktw-text-muted-foreground pktw-uppercase">{role === 'user' ? 'You' : 'Peak'}</span>`
- AI messages get background: `pktw-bg-secondary pktw-rounded-lg pktw-px-4 pktw-py-3 pktw-border pktw-border-border` (user messages already have `pktw-bg-secondary`, keep as-is or change to `pktw-bg-accent/10`)

- [ ] **Step 4: Insert DateSeparators in MessageListRenderer**

In `MessageListRenderer.tsx`, before rendering each message, check if the date changed from the previous message. If so, insert a `<DateSeparator date={msg.createdAt}>`.

```tsx
// In the render loop:
{messages.map((msg, i) => {
  const prevDate = i > 0 ? getDateOnly(messages[i-1].createdAt) : null;
  const currDate = getDateOnly(msg.createdAt);
  const showSeparator = !prevDate || prevDate !== currDate;
  return (
    <React.Fragment key={msg.id ?? i}>
      {showSeparator && <DateSeparator date={new Date(msg.createdAt)} />}
      <MessageItem message={msg} ... />
    </React.Fragment>
  );
})}
```

Also change `key={index}` to `key={msg.id ?? index}` — fixes the existing React reconciliation bug.

- [ ] **Step 5: Build and verify**

```bash
npm run build
```

- [ ] **Step 6: Commit**

```bash
git commit -am "feat: add role avatars, bubble backgrounds, date separators, fix message keys"
```

---

### Task 4: Message Actions — Inline Below Bubble

**Files:**
- Modify: `src/ui/view/chat-view/components/messages/MessageActionsList.tsx`

- [ ] **Step 1: Rewrite MessageActionsList for inline layout**

Read the current file (~304 lines) at implementation time. The rewrite changes:

1. Remove the current always-visible layout
2. Wrap actions in a container with `pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity` (the parent `MessageViewItem` must have `pktw-group` class)
3. For AI messages: render metadata (model badge + token count + time) and actions (copy + regenerate + star + more) in the same row
4. For user messages: render only copy + edit actions
5. Remove the separate `TimeDisplay` component — timestamp is inline with actions

```tsx
// Simplified structure for AI message actions row:
<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mt-1">
  {/* Metadata — always visible */}
  <span className="pktw-text-[9px] pktw-font-mono pktw-text-muted-foreground pktw-bg-muted pktw-px-1.5 pktw-py-0.5 pktw-rounded">{modelId}</span>
  <span className="pktw-text-[10px] pktw-text-muted-foreground">{tokenCount} tokens</span>
  <span className="pktw-text-[10px] pktw-text-muted-foreground">·</span>
  <span className="pktw-text-[10px] pktw-text-muted-foreground">{time}</span>
  {/* Actions — fade in on hover */}
  <div className="pktw-flex pktw-gap-0.5 pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity">
    <ActionButton icon={Copy} title="Copy" onClick={handleCopy} />
    <ActionButton icon={RefreshCw} title="Regenerate" onClick={handleRegenerate} />
    <ActionButton icon={Star} title="Star" onClick={handleStar} filled={isStarred} />
    <div className="pktw-w-px pktw-h-3 pktw-bg-border pktw-mx-0.5" />
    <ActionButton icon={MoreHorizontal} title="More" onClick={handleMore} />
  </div>
</div>
```

- [ ] **Step 2: Add group class to MessageViewItem**

In `MessageViewItem.tsx`, add `pktw-group` to the outer message wrapper div so child hover detection works.

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: message actions inline below bubble with hover fade"
```

---

### Task 5: Style Switch Buttons

**Files:**
- Create: `src/ui/view/chat-view/components/MessageStyleButtons.tsx`
- Modify: `src/ui/view/chat-view/components/messages/MessageViewItem.tsx`

- [ ] **Step 1: Create MessageStyleButtons**

```tsx
// src/ui/view/chat-view/components/MessageStyleButtons.tsx
import React from 'react';

const STYLES = [
  { label: '📋 Shorter', prompt: 'Rewrite your last response to be more concise.' },
  { label: '📚 More detail', prompt: 'Expand your last response with more detail and examples.' },
  { label: '🌱 Simpler', prompt: 'Rewrite your last response using simpler language.' },
  { label: '🏛 More formal', prompt: 'Rewrite your last response in a more formal tone.' },
];

interface Props {
  onStyleSelect: (prompt: string) => void;
}

export const MessageStyleButtons: React.FC<Props> = ({ onStyleSelect }) => (
  <div className="pktw-flex pktw-gap-1 pktw-mt-1.5 pktw-flex-wrap">
    {STYLES.map(s => (
      <button
        key={s.label}
        className="pktw-px-2 pktw-py-0.5 pktw-rounded pktw-border pktw-border-border pktw-bg-background pktw-text-muted-foreground pktw-text-[10px] pktw-cursor-pointer hover:pktw-border-accent hover:pktw-text-accent hover:pktw-bg-accent/10 pktw-transition-all"
        onClick={() => onStyleSelect(s.prompt)}
      >
        {s.label}
      </button>
    ))}
  </div>
);
```

- [ ] **Step 2: Add to MessageViewItem below AI responses**

In `MessageViewItem.tsx`, render `<MessageStyleButtons>` after the AI message actions row, only for assistant messages:

```tsx
{role === 'assistant' && !isStreaming && (
  <MessageStyleButtons onStyleSelect={(prompt) => { /* trigger regeneration with style prompt */ }} />
)}
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: add style switch buttons below AI responses"
```

---

### Task 6: Tool Calls — Option A Collapsed Summary

**Files:**
- Create: `src/ui/view/chat-view/components/ToolCallSummary.tsx`
- Modify: `src/ui/view/chat-view/components/messages/MessageViewItem.tsx`

- [ ] **Step 1: Create ToolCallSummary**

```tsx
// src/ui/view/chat-view/components/ToolCallSummary.tsx
import React, { useState } from 'react';

const TOOL_LABELS: Record<string, { label: string; icon: string }> = {
  vault_search: { label: 'Searched vault', icon: '🔍' },
  local_search_whole_vault: { label: 'Searched vault', icon: '🔍' },
  vault_read_note: { label: 'Read note', icon: '📄' },
  content_reader: { label: 'Read note', icon: '📄' },
  vault_grep: { label: 'Searched text', icon: '🔎' },
  graph_traversal: { label: 'Explored graph', icon: '🕐' },
  find_path: { label: 'Found path', icon: '🔗' },
  find_key_nodes: { label: 'Found key notes', icon: '⭐' },
  inspect_note_context: { label: 'Inspected context', icon: '🔬' },
  explore_folder: { label: 'Explored folder', icon: '📁' },
  submit_plan: { label: 'Submitted plan', icon: '📋' },
  submit_final_answer: { label: 'Finished', icon: '✅' },
};

function getToolDisplay(toolName: string) {
  return TOOL_LABELS[toolName] ?? { label: toolName, icon: '⚙️' };
}

interface ToolCall {
  toolName: string;
  input?: any;
  output?: any;
  isActive?: boolean;
}

interface Props {
  toolCalls: ToolCall[];
  isStreaming?: boolean;
  currentToolName?: string;
}

export const ToolCallSummary: React.FC<Props> = ({ toolCalls, isStreaming, currentToolName }) => {
  const [expanded, setExpanded] = useState(false);
  const completed = toolCalls.filter(tc => !tc.isActive);
  const active = toolCalls.find(tc => tc.isActive);

  // Build summary text
  const summaryParts = completed.map(tc => getToolDisplay(tc.toolName).label);
  const uniqueParts = [...new Set(summaryParts)];
  const summaryText = uniqueParts.join(', ');

  if (isStreaming && active) {
    const display = getToolDisplay(active.toolName);
    const inputPreview = typeof active.input === 'string' ? active.input
      : active.input?.query ?? active.input?.note_path ?? active.input?.start_note_path ?? '';
    return (
      <div className="pktw-inline-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1 pktw-rounded-md pktw-bg-accent/10 pktw-border pktw-border-accent/25 pktw-text-[11px] pktw-text-muted-foreground pktw-mb-1.5">
        <span className="pktw-animate-pulse">{display.icon}</span>
        <span>{display.label}</span>
        {inputPreview && <strong className="pktw-text-foreground">{String(inputPreview).slice(0, 40)}</strong>}
        {completed.length > 0 && <><span>·</span><span>{completed.length} completed</span></>}
      </div>
    );
  }

  if (completed.length === 0) return null;

  return (
    <div className="pktw-mb-1.5">
      <div
        className="pktw-inline-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-1 pktw-rounded-md pktw-bg-secondary pktw-border pktw-border-border pktw-text-[11px] pktw-text-muted-foreground pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span>⚙️</span>
        <span>{summaryText}</span>
        <span>·</span>
        <span className="pktw-font-semibold pktw-text-foreground">{completed.length} steps</span>
        <span className={`pktw-text-[8px] pktw-text-muted-foreground pktw-transition-transform ${expanded ? 'pktw-rotate-180' : ''}`}>▾</span>
      </div>

      {expanded && (
        <div className="pktw-py-1">
          {completed.map((tc, i) => {
            const display = getToolDisplay(tc.toolName);
            const inputPreview = typeof tc.input === 'string' ? tc.input
              : tc.input?.query ?? tc.input?.note_path ?? tc.input?.start_note_path ?? '';
            const resultPreview = getResultPreview(tc);
            return (
              <div key={i} className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-py-0.5 pktw-text-[11px] pktw-text-muted-foreground">
                <span className="pktw-w-3.5 pktw-text-center pktw-text-[10px]">{display.icon}</span>
                <span className="pktw-font-medium pktw-text-foreground">{display.label}</span>
                {inputPreview && <span className="pktw-text-muted-foreground/60 pktw-italic">{String(inputPreview).slice(0, 50)}</span>}
                {resultPreview && <span className="pktw-ml-auto pktw-text-[10px] pktw-text-success pktw-whitespace-nowrap">{resultPreview}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

function getResultPreview(tc: ToolCall): string | null {
  if (!tc.output) return null;
  const out = typeof tc.output === 'string' ? tc.output : tc.output;
  if (typeof out === 'object' && out.results) return `${out.results.length} found`;
  if (typeof out === 'string' && out.length > 0) return `${(out.length / 1000).toFixed(1)}k chars`;
  return null;
}
```

- [ ] **Step 2: Replace ToolCallsDisplay usage in MessageViewItem**

In `MessageViewItem.tsx`, replace `<ToolCallsDisplay>` with `<ToolCallSummary>`:

```tsx
// Before:
<ToolCallsDisplay toolCalls={message.toolCalls} />
// After:
<ToolCallSummary
  toolCalls={message.toolCalls ?? []}
  isStreaming={isStreaming}
  currentToolName={currentToolName}
/>
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: tool calls as collapsed summary with human-readable descriptions"
```

---

### Task 7: @ Context Menu

**Files:**
- Create: `src/ui/view/chat-view/components/ContextMenu.tsx`
- Modify: `src/ui/component/prompt-input/PromptInputBody.tsx`

- [ ] **Step 1: Create ContextMenu component**

A React component that renders as a floating panel positioned near the cursor in the CodeMirror editor. Read the existing `handleSearchContext` logic from `ChatInputArea.tsx` for the data flow.

Key features:
- Grouped: "Recent" (last 3 files) + "Folders" (navigable with breadcrumb)
- File type icons restored (markdown 📄, image 🖼, folder 📁, pdf 📰)
- Search with query highlight + content snippet
- Keyboard navigation (ArrowUp/Down, Enter, Escape, Backspace to go up folder)
- Breadcrumb navigation for folder drill-down

The component receives:
```tsx
interface ContextMenuProps {
  items: ContextMenuItem[];
  query: string;
  breadcrumb: string[];
  selectedIndex: number;
  onSelect: (item: ContextMenuItem) => void;
  onNavigateFolder: (folderPath: string) => void;
  onNavigateUp: () => void;
  onClose: () => void;
  position: { top: number; left: number };
}
```

Implementation: use a React portal rendered into `document.body` at the calculated position. The component is rendered/hidden by the `PromptInputBody` based on whether the @ trigger is active.

- [ ] **Step 2: Wire into PromptInputBody**

In `PromptInputBody.tsx`, replace the CodeMirror `autocompletion` source for `@` with a React state that triggers `<ContextMenu>` rendering. The `@` regex match still detects the trigger, but instead of feeding CodeMirror's autocomplete, it sets state to show the custom menu.

- [ ] **Step 3: Restore type icon in codemirror.css**

In `src/styles/codemirror.css`, remove the `display: none` on the autocomplete type icon (for any remaining CodeMirror tooltip usage).

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

Test: type `@` in chat input, verify custom menu appears with grouped items.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: custom @ context menu with type icons, groups, folder navigation"
```

---

### Task 8: / Prompt Menu

**Files:**
- Create: `src/ui/view/chat-view/components/PromptMenu.tsx`
- Modify: `src/ui/component/prompt-input/PromptInputBody.tsx`

- [ ] **Step 1: Create PromptMenu component**

Same portal pattern as ContextMenu. Key features:
- Grouped: "Quick Actions" (built-in prompts with colored icons) + "My Templates" (user-created with "Template" badge)
- Each item shows icon + name + description
- Search across name + description with bold highlighting

```tsx
interface PromptMenuProps {
  items: PromptMenuItem[];
  query: string;
  selectedIndex: number;
  onSelect: (item: PromptMenuItem) => void;
  onClose: () => void;
  position: { top: number; left: number };
}
```

Items come from `PromptService` (built-in prompts) and future template system (user templates). For now, connect to the existing `handleSearchPrompts` data source, replacing the hardcoded mock data.

- [ ] **Step 2: Wire into PromptInputBody**

Same pattern as Task 7 — replace CodeMirror autocomplete for `/` with custom React menu.

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

Test: type `/` in chat input, verify custom menu appears with groups.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: custom / prompt menu with Quick Actions and Templates groups"
```

---

### Task 9: Conversation List — Two-Row, Search, Date Groups

**Files:**
- Modify: `src/ui/view/chat-view/components/conversation-item.tsx`
- Modify: `src/ui/view/chat-view/components/conversation-list.tsx`

- [ ] **Step 1: Update ConversationItem to two-row layout**

Read the current file (~85 lines). Change the inner layout:

Row 1: type icon + title + time (horizontal flex)
Row 2: type badge (only if non-chat type) — indented to align with title

```tsx
<div className="pktw-flex pktw-flex-col pktw-gap-0.5 ...">
  <div className="pktw-flex pktw-items-center pktw-gap-2">
    <span className="pktw-text-sm">{getConversationTypeIcon(conv.conversationType ?? DEFAULT_CONVERSATION_TYPE)}</span>
    <span className="pktw-flex-1 pktw-truncate pktw-text-sm pktw-font-medium">{conv.title}</span>
    <span className="pktw-text-[9px] pktw-text-muted-foreground">{relativeDate}</span>
  </div>
  {badge && (
    <div className="pktw-pl-6">
      <span className="pktw-text-[8px] pktw-font-semibold pktw-px-1.5 pktw-py-0.5 pktw-rounded" style={{ background: badge.bg, color: badge.fg }}>
        {badge.label}
      </span>
    </div>
  )}
</div>
```

- [ ] **Step 2: Add search bar and date grouping to ConversationList**

Read `conversation-list.tsx` (~172 lines). Add:
1. Search input at top that filters conversations by title
2. Group conversations by date: "Today", "This Week", "Older"
3. Render group headers as `<div className="pktw-text-[9px] pktw-font-semibold pktw-uppercase ...">TODAY</div>`

```tsx
function groupByDate(conversations: Conversation[]): Map<string, Conversation[]> {
  const groups = new Map<string, Conversation[]>();
  const now = new Date();
  for (const conv of conversations) {
    const days = Math.floor((now.getTime() - conv.meta.updatedAtTimestamp) / 86400000);
    const group = days === 0 ? 'Today' : days <= 7 ? 'This Week' : 'Older';
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(conv);
  }
  return groups;
}
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: conversation list with two-row layout, search, date grouping, type badges"
```

---

### Task 10: Home Page Rewrite

**Files:**
- Modify: `src/ui/view/chat-view/view-Home.tsx`

- [ ] **Step 1: Rewrite view-Home.tsx**

Read the current file (~254 lines). Replace entirely with:

1. Greeting: "Good evening 👋" (time-aware) + subtitle
2. 4 suggestion cards in a 2x2 grid: "Continue last chat", "Summarize recent notes", "Research a topic", "Plan a project"
3. Recent Conversations: compact rows (type icon + title + message preview + date) via a simplified `ConversationRow` component
4. Projects: compact rows with conversation count

Each suggestion card links to a conversation type: clicking "Research a topic" creates a new Agent conversation, etc.

Replace the large card-based layout with the compact row pattern from the mockup.

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat: rewrite Home page with suggestion cards and compact recent list"
```

---

### Task 11: New Conversation Type Picker

**Files:**
- Create: `src/ui/view/chat-view/components/NewConversationTypePicker.tsx`
- Modify: `src/ui/view/chat-view/view-Messages.tsx` (show picker for pending conversations)

- [ ] **Step 1: Create NewConversationTypePicker**

4-card grid (Chat/Agent/Plan/Canvas) + "My Templates" section. Canvas gets "Coming soon" tag.

```tsx
interface Props {
  selectedType: ConversationType;
  onSelectType: (type: ConversationType) => void;
}
```

The component renders in the empty state of `view-Messages.tsx` when a pending conversation exists (replacing "Ready when you are.").

- [ ] **Step 2: Wire into view-Messages.tsx**

When `pendingConversation` is truthy, render `<NewConversationTypePicker>` instead of the "Ready when you are." text. The selected type is stored on the pending conversation and applied when the first message is sent.

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: new conversation type picker with built-in types and templates"
```

---

### Task 12: Project Overview Rewrite

**Files:**
- Modify: `src/ui/view/chat-view/view-ProjectOverview.tsx`

- [ ] **Step 1: Rewrite view-ProjectOverview.tsx**

Read the current file (~281 lines). Key changes:

1. Replace large stat cards (Conversations: 0, Messages: 0) with inline text: "3 conversations · 24 messages · 2 starred"
2. Add editable description field: "Click to add a description..." — clicking enters edit mode (contentEditable or input)
3. Tab accent color: active tab uses `pktw-text-accent pktw-border-accent` instead of hardcoded blue
4. Empty state: icon + text + "New Conversation" CTA button (using `<Button>` component)
5. Replace `dark:text-{color}-400` and `bg-{color}-500/10` hardcoded stat card colors with CSS var equivalents

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat: rewrite Project Overview with inline stats, editable description, CTA empty states"
```

---

### Task 13: File Changes Panel

**Files:**
- Modify: `src/ui/view/chat-view/components/messages/FileChangesList.tsx`

- [ ] **Step 1: Rewrite FileChangesList styling**

Read the current file (~165 lines). Key changes:

1. Header: `pktw-bg-secondary` instead of `bg-blue-500/15`
2. Text: `pktw-text-foreground` instead of `text-black`
3. Item hover: `pktw-bg-muted` instead of `hover:bg-blue-500/10`
4. New files: add green "NEW" badge next to filename
5. Per-file Accept/Discard: `pktw-opacity-0 group-hover:pktw-opacity-100` (hover fade, consistent pattern)
6. Actions text: `pktw-text-muted-foreground hover:pktw-text-foreground` instead of `text-black hover:text-white`

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git commit -am "feat: theme-aware File Changes panel with NEW badge and hover actions"
```

---

### Task 14: Conversation Outline — Topic Tree

**Files:**
- Create: `src/ui/view/chat-view/components/ConversationOutline.tsx`
- Modify: `src/ui/view/chat-view/view-Messages.tsx`
- Modify: `src/ui/view/chat-view/components/messages/MessageViewHeader.tsx`

- [ ] **Step 1: Create ConversationOutline**

Right panel component showing messages grouped by `ChatMessage.topic`:

```tsx
interface Props {
  messages: ChatMessage[];
  topics: string[];
  activeMessageId: string | null;
  onMessageClick: (messageId: string) => void;
  onClose: () => void;
}
```

Each topic is a collapsible section. Messages within show role badge (You/Peak) + 2-line content preview. Active message highlighted with accent left border. Collapsed topics show only header (topic icon + name + message count).

Messages without a `topic` field go into a default "General" group.

- [ ] **Step 2: Add outline toggle to header**

In `MessageViewHeader.tsx`, add an outline toggle button (☰ icon) to the right action buttons. It toggles a `showOutline` state in the view.

- [ ] **Step 3: Wire into view-Messages.tsx**

When `showOutline` is true, render the outline panel on the right side of the message area:

```tsx
<div className="pktw-flex pktw-flex-1 pktw-min-h-0">
  <div className="pktw-flex-1 pktw-overflow-y-auto">
    <MessageListRenderer ... />
  </div>
  {showOutline && <ConversationOutline ... />}
</div>
```

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git commit -am "feat: conversation outline panel with collapsible topic tree"
```

---

### Task 15: Suggestion Actions + Scroll Navigation

**Files:**
- Create: `src/ui/view/chat-view/components/SuggestionActions.tsx`
- Modify: `src/ui/view/chat-view/view-Messages.tsx`

- [ ] **Step 1: Create SuggestionActions**

Context-aware action chips. For now, the actions are derived from conversation content (future: AI-generated). Initial set: "Transfer to Project", "Continue in Chat", etc.

```tsx
interface SuggestionAction {
  icon: string;
  label: string;
  action: () => void;
}

interface Props {
  actions: SuggestionAction[];
}

export const SuggestionActions: React.FC<Props> = ({ actions }) => (
  <div className="pktw-flex pktw-gap-1.5 pktw-flex-wrap">
    {actions.map(a => (
      <button
        key={a.label}
        className="pktw-px-2.5 pktw-py-1 pktw-rounded-md pktw-border pktw-border-border pktw-bg-background pktw-text-muted-foreground pktw-text-[10px] pktw-cursor-pointer hover:pktw-border-accent hover:pktw-text-accent hover:pktw-bg-accent/10 pktw-transition-all"
        onClick={a.action}
      >
        <span className="pktw-mr-1">{a.icon}</span>{a.label}
      </button>
    ))}
  </div>
);
```

- [ ] **Step 2: Replace SuggestionTags + fix scroll nav in view-Messages**

In the footer-upper section of `view-Messages.tsx`:
1. Replace `<SuggestionTags>` (which uses hardcoded mock tags) with `<SuggestionActions>` with real actions
2. Fix scroll buttons: replace `hover:pktw-bg-gray-200` with `hover:pktw-bg-muted` and `group-hover:pktw-text-black` with `pktw-text-foreground`

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: suggestion actions with theme-aware scroll navigation"
```

---

## Self-Review

**Spec coverage:**
| Spec section | Task |
|---|---|
| §1 ConversationType | Task 1 |
| §2 Message List (roles, backgrounds, separators) | Task 3 |
| §3 Message Actions (inline, hover, metadata) | Task 4 |
| §4 Tool Calls (Option A) | Task 6 |
| §5 Thinking/Loading | Task 2 |
| §6 InputToolbar | Covered by Chat Polish plan (InputToolbar.tsx) |
| §7 @ Context Menu | Task 7 |
| §8 / Prompt Menu | Task 8 |
| §9 Home Page | Task 10 |
| §10 New Conversation | Task 11 |
| §11 Conversation List | Task 9 |
| §12 Project Overview | Task 12 |
| §13 File Changes | Task 13 |
| §14 Conversation Outline | Task 14 |
| §15 Suggestion Actions | Task 15 |
| §16 IME Fix | Task 2 |
| §17 Mock Cleanup | Task 2 |
| Style switch buttons | Task 5 |

**All 17 spec sections covered.**

**Placeholder scan:** Clean. Tasks 3, 4, 7, 8, 10, 12 reference "read current file at implementation time" for exact line numbers — this is guidance for the implementer, not a placeholder.

**Type consistency:** `ConversationType` union and helpers (`getConversationTypeIcon`, `getConversationTypeLabel`, `getConversationTypeBadgeColor`) defined in Task 1 are referenced consistently in Tasks 9, 11. `ToolCall` interface in Task 6 matches the existing `message.toolCalls` shape. `ThinkingIndicator` in Task 2 matches the CSS animation name in `tailwind.css`.
