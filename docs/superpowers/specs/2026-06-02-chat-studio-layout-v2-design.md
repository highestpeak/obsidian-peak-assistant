# Chat Studio Layout v2 — Design

**Date:** 2026-06-02
**Status:** Approved (pending implementation plan)
**Supersedes:** [2026-06-02-chat-studio-layout-design.md](./2026-06-02-chat-studio-layout-design.md) (v1)

**Why v2:** v1 misinterpreted the original brief. It opened three separate Obsidian leaves (left sidebar, main, right sidebar), but the user wanted **one single view** that internally renders three columns and pops out as a detached window. v2 corrects this.

---

## Scope

Add an Obsidian palette command `Open Chat Studio` that:

1. **Detaches** the legacy chat layout leaves (any existing `ChatView`, `ProjectListView`, `ConversationOutlineView`) so the user's original positions disappear.
2. **Opens a single new `ChatStudioView` leaf in a detached macOS window** (`workspace.getLeaf('window')`).
3. That view's React tree renders a horizontal three-column flex container, **all within the same leaf**:
   - Left column: `<ConversationList />` (project-aware, follows `chatViewStore`).
   - Middle column: `<ChatViewComponent />` (the same router that powers the regular chat — Home / AllProjects / Messages routes all work in-place).
   - Right column: `<ConversationIndex />` (the 4-tab outline).
4. **Both column dividers are user-resizable** via thin drag handles between columns.

Closing the Studio window does nothing special — no auto-restore of legacy layout. User can click the ribbon to bring back the regular chat layout.

## Goals

- A single unified view: conv list, chat content, and conv index all visible side-by-side in **one leaf**.
- Open in a detached window so the user can put Studio on a second monitor (or beside Obsidian's main window) and write articles in the main window.
- Reuse `ConversationList`, `ChatViewComponent`, and `ConversationIndex` verbatim — no UI duplication.
- Legacy chat layout (ribbon click → left ProjectList + main ChatView + right ConvOutline) keeps working exactly as today. The two layouts coexist; running the Studio command tears down legacy temporarily, but legacy is recreated on demand by the ribbon.

## Non-Goals (YAGNI)

- No global `studioMode` flag persisted across sessions.
- No auto-restore of legacy chat layout when Studio window closes.
- No special toggle / Exit Studio command. Closing the window via OS controls (or Obsidian's `View → Close` / Cmd+W) is the exit path.
- No column-width persistence across sessions. Each Studio window starts with defaults.
- No mode where Studio replaces the regular `ChatView` ItemView. Both coexist.
- No special multi-window handling — running the command twice while Studio exists just focuses the existing one.

## Architecture

### Component map

| Region | Component | Source |
|---|---|---|
| Outer leaf | `ChatStudioView extends ItemView` | New (`src/ui/view/ChatStudioView.ts`) |
| React shell | `ChatStudioPanel` | New (`src/ui/view/chat-studio-view/ChatStudioView.tsx`) |
| Left column | `<ConversationList />` | Existing, reused |
| Middle column | `<ChatViewComponent />` | Existing, reused |
| Right column | `<ConversationIndex />` | Existing, reused |
| Resizer between cols | `<StudioResizerHandle />` | New (small internal component, same file as `ChatStudioPanel`) |

### Data flow

```
chatViewStore (Zustand singleton, shared across ALL React roots in the plugin)
   │
   ├──► ChatStudioView (this leaf)
   │      ├── left:  ConversationList (subscribes — projectId derived from viewMode + active conv)
   │      ├── mid:   ChatViewComponent (subscribes — renders the right route)
   │      └── right: ConversationIndex (subscribes — already store-aware)
   │
   └──► [optional] standalone ChatView leaf if user later opens legacy via ribbon
```

All three columns share the singleton store. When the user clicks a conversation in the left list, `setConversation` updates the store, and the middle ChatViewComponent re-renders to show that conversation while the right ConversationIndex re-renders for the new context. No prop drilling.

### Project-aware filtering rule (left column)

Same rule as v1:

| `viewMode` (from chatViewStore) | `projectId` passed to ConversationList |
|---|---|
| `PROJECT_OVERVIEW` | `projectForOverview?.meta.id` |
| `PROJECT_CONVERSATIONS_LIST` | `projectForOverview?.meta.id` |
| `CONVERSATION_IN_PROJECT` | `activeConversation?.meta.projectId` |
| `HOME` / `ALL_PROJECTS` / `ALL_CONVERSATIONS` / `STANDALONE_CONVERSATION` / `null` | `undefined` (standalone list) |

### Layout & resizer

The React shell is a `display: flex` row, `width: 100%`, `height: 100%`. Three children plus two resizer handles:

```
[ left ConvList ][ handle ][ middle ChatView ][ handle ][ right ConvIndex ]
   width=leftW    4px         flex:1                       width=rightW
```

Initial widths: `leftW = 280px`, `rightW = 320px`. Min: 200 / 240. Max: 500 / 480.

`StudioResizerHandle` is a 4px-wide div with `cursor: col-resize`. On `mousedown`, it attaches `mousemove` + `mouseup` listeners on `document` and reports `dx` to the parent via an `onResize(dx: number)` callback. The parent clamps and updates state. No external library, ~30 lines.

State (`leftW`, `rightW`) lives in `ChatStudioPanel`'s `useState`. Not persisted.

### Command flow

`openChatStudio()` (in `ViewManager`):
1. If a `CHAT_STUDIO_VIEW_TYPE` leaf already exists → `revealLeaf(it)` and return. (Idempotence.)
2. Otherwise:
   - Detach all leaves of type `CHAT_VIEW_TYPE`, `PROJECT_LIST_VIEW_TYPE`, and `CONVERSATION_OUTLINE_VIEW_TYPE`.
   - `const leaf = workspace.getLeaf('window')` — opens a detached window.
   - `await leaf.setViewState({ type: CHAT_STUDIO_VIEW_TYPE, active: true })`.
   - `workspace.revealLeaf(leaf)`.

The detach step is what makes "原来的位置都消失了" happen. Note that `ViewSwitchConsistentHandler.isChatLayoutActive` may still be `true` after this — that's OK. The handler's `activateChatView` won't fire unless something triggers it, and Studio's leaf is `STANDALONE_PEAK_VIEW_TYPES`-marked so focus events on it early-return.

## File changes

**Created:**
- `src/ui/view/ChatStudioView.ts` — outer `ItemView`.
- `src/ui/view/chat-studio-view/ChatStudioView.tsx` — `ChatStudioPanel` React shell + internal `StudioResizerHandle`.

**Modified:**
- `src/app/view/types.ts` — add `CHAT_STUDIO_VIEW_TYPE = 'peak-chat-studio-view'`; add it to `STANDALONE_PEAK_VIEW_TYPES`.
- `src/app/view/ViewManager.ts` — register the new view; add `openChatStudio()` method.
- `src/app/commands/PeakCommandActions.ts` — add `openChatStudio()` action.
- `src/app/commands/Register.ts` — register `peak-open-chat-studio` command.

**Untouched (unlike v1):**
- `src/app/view/ViewSwitchConsistentHandler.ts` — no longer needed since Studio is a single standalone leaf, not a layout-handler-managed companion.

## Risks / open questions

- **Embedding `ChatViewComponent` in a non-`ChatView` leaf.** `ChatViewComponent` is normally mounted by `ChatView.onOpen()` via `createReactElementWithServices`. The Studio shell also uses `createReactElementWithServices` at the top, so service context propagates to `<ChatViewComponent />` automatically. No code change in `ChatViewComponent` is required, but the assumption needs to be verified during implementation (run-time check that prompt input, message rendering, project navigation all work inside Studio).
- **Detach side effects.** Detaching `ChatView` while user has unsaved/in-progress streaming responses would cancel the stream. Acceptable trade-off: Studio is meant to be the user's primary chat workspace, not a copy of an in-flight session. If this turns out to bite in real use, add a guard later.
- **Window persistence.** Obsidian persists workspace including detached windows. Reopening the vault should restore the Studio window if it was open at shutdown.
- **No re-entrancy guard on `openChatStudio()`.** A user-triggered palette command is unlikely to race itself. Skipping for YAGNI.

## Testing

- No new unit tests. The change is view composition + command wiring.
- Manual verification checklist in the implementation plan.

## Estimated change size

~2 new files (~150 lines total including the resizer) + ~30 lines added across `types.ts`, `ViewManager.ts`, `PeakCommandActions.ts`, `Register.ts`. Single PR.
