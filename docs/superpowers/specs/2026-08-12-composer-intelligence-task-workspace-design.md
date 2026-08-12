# Composer Intelligence Task Workspace

## Product boundary

Composer owns document display, editing, review, transaction history, Undo/Redo,
and cross-file review navigation. Intelligence owns task sessions, proactive
Suggestions, the real Copilot conversation, and task History. Native Markdown
opens the same Intelligence task surface as a modal companion; it does not copy
Composer review chrome into Markdown.

The editor body, Markdown schema, candidate renderers, and atomic transaction
engine remain unchanged.

## Task-session model

- Multiple task sessions may remain open as horizontally scrollable tabs.
- Exactly one task session is active and receives new Copilot conversation state.
- Each task stores its title, member document identities, timestamps, and
  serialized Copilot session state in the app-owned workspace JSONL ledger.
- Opening an unrelated document does not silently add it to the active task.
  Starting a task run or choosing “加入当前文档” does.
- Legacy document/work-segment/pinned scope records remain replay-compatible but
  are not presented as user-facing scope choices.

## Composer header

Left-to-right responsibilities:

1. Workspace back/forward.
2. Edit / clean reading / Native Markdown switch.
3. Icon-only readable/wide measure toggle.
4. A centered review controller, visible in Edit view only when this document
   has pending candidates:
   - previous/current/next candidate inside the document;
   - Reject and Accept for the current candidate;
   - previous/current/next changed document inside the active task.
5. Task Documents, always available in Composer.
6. Comments, Intelligence, document Undo, and document Redo.

When no candidate is pending, the candidate navigation and decisions disappear;
Task Documents stays.

## Task Documents popover

The popover opens only from the Task Documents target through hover, focus, or
click. Moving the pointer from the trigger into the popover preserves it; leaving
both surfaces closes it after a short corridor delay. Interacting inside the
popover does not close it.

Rows are partitioned without duplication:

- **Current Change Set**: latest unaccepted candidate per document, with aligned
  green added and red removed character counts. A whole-document insertion uses
  the created treatment; a whole-document removal uses red strikethrough.
- **Task context**: task member documents with no pending change.

The current document is highlighted. If it is outside the task, “加入当前文档”
is a full-row action.

## Intelligence sidecar and modal

The first row is the task tab strip plus New Task and Close. It deliberately has
no redundant “Intelligence” title. The second row has three task views:

- **建议**: proactive next moves, related materials, unplaced thoughts, material
  browser/graph entry points, and the update-policy control.
- **对话**: the real Copilot thread, task context, capability selection, model
  choice, receipts, and prompt composer.
- **History**: the existing unified generation/Copilot/document activity ledger
  and filters.

Desktop sidecar geometry is flush with the Composer workspace and separated by
one divider. Narrow hosts use the existing contained drawer. Motion honors
reduced-motion preferences.

## Ownership and recovery

- `ComposerWorkspaceIntelligenceRuntime` owns task sessions and their persistence.
- A stable task-scoped Copilot port follows the active task so document runtimes
  and React subscriptions do not need to be recreated on tab switch.
- Candidate writes still route through the document candidate runtime and
  transaction hub; task membership never grants write authorization.
- Cross-file review opens the target in the current Composer leaf and relies on
  existing revision guards before Accept.
