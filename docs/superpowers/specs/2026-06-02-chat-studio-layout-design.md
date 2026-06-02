# Chat Studio Layout — Design

**Date:** 2026-06-02
**Status:** Approved (pending implementation plan)
**Scope:** New Obsidian command that arranges the chat workflow into three native panes — left sidebar list, main chat, right sidebar index — so users can write articles in the main area while chatting alongside.

---

## Motivation

Today the chat workflow lives in a single main-area `ChatView` leaf. When a user wants to write an article (markdown editor in the main area) while continuing a conversation, they must either:

- Lose the chat (close it to make room for the editor), or
- Cram both into the main area with manual split, with no quick access to conversation history or index.

Right-sidebar `ConversationOutlineView` already exists as a separate leaf. The missing pieces are a left-sidebar conversation list and a single command that lays out all three at once.

## Goals

- One command that opens the chat workflow as three Obsidian panes: left sidebar (conversation list), main (chat), right sidebar (conversation index).
- Reuse the existing `ConversationList` and `ConversationIndex` React components verbatim — no duplicated UI.
- Left sidebar follows the main area's project context automatically.
- User writes articles via Obsidian's native `Split right` on the main area.

## Non-Goals (YAGNI)

- No global `studioMode` flag. There is no embedded left/right slot inside `ChatView` to hide — the chat view is a router with no built-in side panels today.
- No `Exit Studio Layout` command. Users close sidebar leaves via Obsidian's native controls.
- No changes to `ConversationList` component API.
- No new "all conversations across all projects" mode (Q4 option C, deferred).
- No automated `Split right` of a markdown tab — respect Obsidian's native splitting.
- No special mobile handling. Sidebar leaves work on Obsidian mobile; command stays enabled.

## Architecture

### Component map

| Pane | View | Status |
|---|---|---|
| Left sidebar | `PeakConversationListView` (new ItemView wrapping `ConversationList`) | New |
| Main area | `ChatView` | Reuse |
| Right sidebar | `ConversationOutlineView` (wraps `ConversationIndex`) | Reuse, already registered |

### Data flow

```
chatViewStore (Zustand singleton, shared across React roots)
   │
   ├──► ChatView (main)            — dispatches viewMode + projectId on user navigation
   │
   └──► PeakConversationListView (left sidebar)
          subscribes to viewMode + projectId
          → renders <ConversationList projectId={…} />
```

No new store, no custom cross-leaf event bus. Zustand naturally shares state across the three React roots.

### Project-aware filtering rule

The left sidebar reflects the main area's current context:

| `viewMode` in main | `projectId` passed to `ConversationList` |
|---|---|
| `PROJECT_OVERVIEW` | current project id |
| `PROJECT_CONVERSATIONS_LIST` | current project id |
| `CONVERSATION_IN_PROJECT` | current project id |
| `HOME` / `ALL_PROJECTS` / `ALL_CONVERSATIONS` / `STANDALONE_CONVERSATION` | `undefined` → standalone list |

When the user navigates in the main area, Zustand re-renders the sidebar automatically.

## File changes

### New: `src/ui/view/PeakConversationListView.tsx`

- Exports `class PeakConversationListView extends ItemView`.
- The view-type constant `PEAK_CONVERSATION_LIST_VIEW_TYPE = 'peak-conversation-list-view'` is added to `src/app/view/types.ts` (codebase convention — all view-type constants are centralized there alongside `CONVERSATION_OUTLINE_VIEW_TYPE`).
- Modeled on `src/ui/view/ConversationOutlineView.ts` (smallest, closest precedent).
- View metadata: icon `messages-square` (Lucide), display name `Conversation List`.
- React body reads `useChatViewStore()`, maps `viewMode` + `projectId` per the table above, renders:

  ```tsx
  <ConversationList
    projectId={derivedProjectId}
    containerClass="<sidebar-compact>"   // tight padding, no centering
    maxPreviewLength={60}
    emptyText="No conversations."
  />
  ```

- Click-to-navigate is already wired inside `ConversationList` via `useConversationLoad()` — no extra plumbing.

### Modified: `src/app/view/ViewManager.ts`

- Import `PeakConversationListView` + view type constant.
- Add `viewCreators.set(PEAK_CONVERSATION_LIST_VIEW_TYPE, (leaf) => new PeakConversationListView(leaf, this.plugin))`.
- Add `openChatStudioLayout()` method:
  1. Open or reveal `ChatView` in main area (reuse existing pattern from chat commands).
  2. Left: `workspace.getLeftLeaf(false)` → `setViewState({ type: PEAK_CONVERSATION_LIST_VIEW_TYPE })` → `workspace.revealLeaf(leaf)`.
  3. Right: open `ConversationOutlineView` using its existing pattern (already implemented elsewhere — reuse, do not reinvent).
- All three steps idempotent: if a leaf of the target type exists, reveal instead of opening a duplicate.

### Modified: `src/app/commands/PeakCommandActions.ts` + `Register.ts`

- Add action method `openChatStudioLayout()` that delegates to `viewManager.openChatStudioLayout()`.
- Register Obsidian command:
  - `id: 'open-chat-studio-layout'`
  - `name: 'Open Chat Studio Layout'`

## Sidebar compactness

The default `ConversationList` styling (`pktw-w-4/6 pktw-mx-auto`) is intended for a centered page body, not a narrow ~280px sidebar. The wrapper passes a sidebar-specific `containerClass` (full width, tight padding) and shortens `maxPreviewLength` to 60. No change to `ConversationList` itself — sidebar styling is owned entirely by the new wrapper view.

## Edge cases

- **Existing chat leaf in a sidebar.** If the user previously dragged `ChatView` into a sidebar, the command reveals it where it is rather than forcibly moving it back. Layout decisions stay with the user.
- **Sidebar leaf manually closed.** Re-running the command reopens it. No persisted "studio is active" flag — running the command is the source of truth.
- **Workspace persistence.** Obsidian persists leaf layout natively; reopening the vault restores the three panes without intervention.

## Testing

- No new unit tests. The change is view composition + command wiring on top of `ConversationList`, which is already covered.
- Manual verification checklist (to be included in the PR description):
  1. Command palette → "Studio" → command appears.
  2. Run command → three panes appear (left list, main chat, right index).
  3. Navigate the main area into a project → left sidebar list updates to that project's conversations.
  4. Close the left or right sidebar leaf → rerun command → leaf reopens.
  5. Reload the plugin (or restart Obsidian) → workspace layout persists.

## Estimated change size

~1 new file (≈60 lines) + ~30 lines of edits across `ViewManager.ts`, `PeakCommandActions.ts`, `Register.ts`. Single small PR.
