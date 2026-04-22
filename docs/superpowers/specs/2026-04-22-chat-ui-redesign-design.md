# Chat UI Redesign Design Spec

> **Date**: 2026-04-22
> **Status**: Approved
> **Scope**: Complete visual/UX overhaul of all chat views — message list, actions, tool calls, input menus, home, conversation list, project overview, file changes, outline, suggestions, conversation types, thinking states
> **Mockups**: `docs/mockups/chat-redesign-part1-messages.html`, `docs/mockups/chat-redesign-part2-pages.html`, `docs/mockups/input-toolbar-final.html`, `docs/mockups/tool-call-redesign.html`
> **Depends on**: Chat System Polish (store restructure) should land first for clean architecture; UI/Theme Foundation (CSS vars) should land first for theme-aware colors
> **Feature Roadmap**: `docs/feature-roadmap.md` — this spec covers all "Near" items in Theme 1.2, 1.3, and part of Theme 9

---

## Problem

The chat UI has accumulated visual debt: always-visible message actions creating noise, no role indicators, hardcoded colors breaking dark mode, CodeMirror native autocomplete menus with hidden icons, mock data in production stores, empty states without CTAs, an information-sparse home page, and no conversation type system for future extensibility (canvas, templates, workflows).

## Design Decisions (all reviewed via web mockups)

### 1. ConversationType — First-Class Field

Store `type` on `ConversationMeta` instead of session-scoped UI mode:

```typescript
type ConversationType =
  | { kind: 'chat' }
  | { kind: 'agent' }
  | { kind: 'plan' }
  | { kind: 'canvas' }
  | { kind: 'template'; templateId: string; templateName: string }
  | { kind: 'custom'; label: string };
```

- Type set at conversation creation via type picker
- Persisted — each conversation remembers its type when reopened
- Determines UI layout, AI behavior, and list badges
- Chat (default) shows no badge; non-default types show badge

### 2. Message List

**Role indicators**: 20px avatar (user: person icon on gray, AI: sparkle on accent-muted) + role label ("You" / "Peak") above each message.

**Both messages get backgrounds**: user = `var(--pk-accent-muted)` bubble, AI = `var(--pk-bg-secondary)` bubble. Visual rhythm.

**Date separators**: "Today", "Yesterday", "Apr 20" between message groups.

### 3. Message Actions — Inline Below Bubble

**NOT floating above the message.** Actions render inline below the message content, same row as metadata. Opacity 0 by default, fade to 1 on message hover.

**User actions**: Copy + Edit (inline below bubble, fade in on hover)

**AI actions**: Copy + Regenerate + Star + More (same row as model badge + token count + timestamp). Divider separates primary actions from "More" overflow.

**Style switch buttons**: Always visible below AI response. "Shorter", "More sources", "Simpler language", "More formal". Clicking sends a style-adjusted regeneration prompt.

**Model/token metadata**: Always visible (low visual weight): model badge (monospace) + token count + timestamp.

### 4. Tool Calls — Option A Collapsed Summary

Default collapsed single line: `"Searched vault, read notes, explored graph · 3 steps"`

Human-readable descriptions instead of raw tool names:
- `vault_search` → "Searched vault"
- `read_note` → "Read note"
- `graph_traversal` → "Explored graph"
- Input shown as natural language: `for "AI ethics alignment"` not raw JSON

Click to expand shows individual steps with icon + name + description + result.

**Streaming state**: accent-tinted background + pulsing icon. Shows current step name + completed count.

### 5. Thinking/Loading State

**Waiting for first token**: gentle-pulse dots (scale 0.9→1, opacity 0.25→0.7) + "Thinking..." text. Replaces the current 50%-scaled AnimatedSparkles hack.

**During reasoning**: collapsible "Thought for Ns" block (existing pattern, kept).

### 6. InputToolbar — Dock Layout

3 icon buttons left + mode pill + model badge + token badge right:

```
[+attach] [🔍sources] [⚙settings]  ···  [🤖 Agent ▼] [claude-opus-4-6] [2.1k]
```

Each icon opens a popover upward:
- **+**: Upload Mode (Direct Upload / Summarize First)
- **🔍**: Sources (Vault Search toggle + Web Search toggle) + Tools (Code Interpreter toggle)
- **⚙**: Output Control (Creativity / Reasoning / Detail Level sliders)
- **Mode pill**: Chat / Plan / Agent popover with icon + title + description
- **Token badge**: hover shows breakdown (input/output/cached/total + provider)

### 7. @ Context Menu — Custom React Component

Replaces CodeMirror native autocomplete tooltip.

**Default state (no query)**: grouped into "Recent" (last 3 accessed files with time) + "Folders" (for navigation with arrow `›`).

**Folder navigation**: breadcrumb path (Vault / Ethics / Papers). Clickable segments to go up. Search scoped to current folder. File metadata: word count for md, page count for pdf.

**Search results**: query term bolded in title and content snippet. Path shown as breadcrumb.

Type icons restored: 📄 markdown, 🖼 image, 📁 folder, 📰 pdf.

### 8. / Prompt Menu — Custom React Component

Replaces CodeMirror native autocomplete tooltip.

**Grouped**: "Quick Actions" (built-in: Summarize, Create Plan, Polish Writing) + "My Templates" (user-created with "Template" badge).

Each item: colored icon + name + description. Search across name + description with bold highlighting.

**Future**: directory-scoped prompts appear as third group when current file is in a folder with `.peak-rules`.

### 9. Home Page

**Greeting**: "Good evening 👋" + "Pick up where you left off, or start something new."

**4 suggestion cards**: contextual — "Continue last chat", "Summarize recent notes" (with count), "Research a topic", "Plan a project". Each links to a conversation type.

**Recent Conversations**: compact rows (type icon + title + message preview + relative date). 3x information density vs current cards.

**Projects**: compact rows with conversation count instead of "No summary available."

### 10. New Conversation — Type Picker

4-card grid: Chat (default selected) / Agent / Plan / Canvas (coming soon tag).

Below: "My Templates" section — user-created templates as compact rows + "Create template" entry.

### 11. Conversation List (Sidebar)

**Search bar** at top.

**Date grouping**: Today / This Week / Older.

**Two-row layout**: Row 1 = type icon + title + time. Row 2 = type badge (only for non-chat types). Chat conversations only show row 1 (no badge = cleanest for the most common type).

**Badge logic**:
- Chat: no badge
- Agent: accent-colored "Agent"
- Plan: info-colored "Plan"
- Canvas: success-colored "Canvas"
- User template: shows **template name** (e.g., "Weekly Review", "Code Review") with template-specific color

### 12. Project Overview

**Editable description**: "Click to add a description..." placeholder, inline edit.

**Inline stats**: "3 conversations · 24 messages · 2 starred" as text, not giant cards.

**Accent-colored tabs**: Conversations / Starred / Resources with `var(--pk-accent)` active underline.

**Empty state with CTA**: icon + "No conversations yet." + "New Conversation" button.

### 13. File Changes Panel

**Theme-aware**: no hardcoded `bg-blue-500/15` or `text-black`. Uses `var(--pk-bg-secondary)` for header, `var(--pk-hover)` for item hover.

**NEW badge**: green for newly created files.

**Per-file Accept/Discard**: buttons appear on hover (opacity fade, consistent with message actions).

### 14. Conversation Outline — Topic Tree

Right panel, toggled via header button.

**Topic tree structure**: messages grouped by `ChatMessage.topic` (from `ChatContextWindow.topics`). Each topic is a collapsible section: icon + topic name + message count.

Messages within topic: role badge (You/Peak) + 2-line content preview. Click to scroll to message. Active message highlighted with accent left border.

**Collapsed topics**: only show topic header. Expand to see QA pairs within.

### 15. Suggestion Actions

Context-aware quick action chips above input area: "Transfer to Project", "Update Articles", "Code Review" etc. Styled as bordered pills (consistent with style-switch buttons). Generated based on conversation content.

**Scroll navigation**: compact up/down buttons at the right end of the suggestion row. Theme-aware (no hardcoded gray-200/text-black).

### 16. IME Enter Key Fix

Chinese input method confirmation (Enter to accept IME candidate) currently triggers message send. Fix: check `event.isComposing` before handling Enter-to-submit in the CodeMirror keymap.

### 17. Mock Data Cleanup

Delete from `chatSessionStore.ts`:
- `initialFileChanges` (2 fake file changes: Button.tsx, helpers.ts)
- `initialExternalPrompts` (5 fake prompts with `.repeat(10)` descriptions)
- `initialSuggestionTags` (3 hardcoded tags)

Replace with empty defaults. Suggestion tags should be generated from conversation context, not hardcoded.

## Non-Goals (deferred to future — see feature-roadmap.md)

- AI response cards with UI components (needs renderer infrastructure)
- Message persistence queue (needs service-layer design)
- Conversation multi-topic detection (needs LLM classification pipeline)
- Canvas type implementation (needs artifact rendering sandbox)
- Template editor UI (needs template system design)
- Cursor-style diff view for file changes (needs diff rendering library)
- Startup daily dashboard (separate feature)
- Directory-scoped prompt rules (depends on template system)

## Changes Summary

| File | Action |
|---|---|
| `src/service/chat/types.ts` | Add `ConversationType` union, add `type` field to `ChatConversationMeta` |
| `src/ui/view/chat-view/view-Home.tsx` | Rewrite: suggestion cards + compact recent list |
| `src/ui/view/chat-view/view-Messages.tsx` | Add date separators, fix scroll buttons styling |
| `src/ui/view/chat-view/components/messages/MessageViewItem.tsx` | Add role avatar + label, both-bubble backgrounds |
| `src/ui/view/chat-view/components/messages/MessageActionsList.tsx` | Rewrite: inline below bubble, opacity fade, add style-switch buttons |
| `src/ui/view/chat-view/components/messages/ToolCallsDisplay.tsx` | Rewrite: Option A collapsed summary with human-readable descriptions |
| `src/ui/view/chat-view/components/messages/MessageViewHeader.tsx` | Fix hardcoded colors, add outline toggle button |
| `src/ui/view/chat-view/components/messages/FileChangesList.tsx` | Theme-aware rewrite, add NEW badge, hover actions |
| `src/ui/view/chat-view/components/InputToolbar.tsx` | New: dock layout with popovers (from Chat Polish plan) |
| `src/ui/view/chat-view/components/ConversationOutline.tsx` | New: topic tree right panel |
| `src/ui/view/chat-view/components/NewConversationTypePicker.tsx` | New: type selection grid + template list |
| `src/ui/view/chat-view/components/SuggestionActions.tsx` | New: context-aware action chips (replaces hardcoded tags) |
| `src/ui/view/chat-view/components/ContextMenu.tsx` | New: custom @ menu (replaces CodeMirror tooltip) |
| `src/ui/view/chat-view/components/PromptMenu.tsx` | New: custom / menu (replaces CodeMirror tooltip) |
| `src/ui/view/chat-view/components/ThinkingIndicator.tsx` | New: gentle-pulse dots (replaces AnimatedSparkles) |
| `src/ui/view/chat-view/view-ProjectOverview.tsx` | Rewrite: editable description, inline stats, CTA empty state, accent tabs |
| `src/ui/view/chat-view/components/conversation-item.tsx` | Two-row layout, type icon, type badge on row 2 |
| `src/ui/view/chat-view/components/conversation-list.tsx` | Add search bar, date grouping |
| `src/ui/view/chat-view/store/chatSessionStore.ts` | Delete mock data |
| `src/ui/component/prompt-input/PromptInputBody.tsx` | IME fix: check `event.isComposing` |
| `src/ui/component/prompt-input/keymap.ts` | IME fix in Enter handler |
| `src/ui/component/mine/AnimatedSparkles.tsx` | Deprecate (replaced by ThinkingIndicator) |
| `src/styles/codemirror.css` | Remove type icon `display:none`, fix hardcoded colors |
| ~10 additional files | Hardcoded color → CSS var migration (covered by UI/Theme plan) |
