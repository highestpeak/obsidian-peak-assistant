# Event Flow Map

Date: 2026-06-30
Related issue: Issue 6 (owner-code-review-issue-log.md)

Event bus implementation: `src/core/eventBus.ts` — `EventBus` wraps `app.workspace.trigger / on / offref` via `AppHandle`.
Lifecycle: `EventBus.destroyInstance()` calls `offAll()` which drains the `subscribers` array and calls each unsubscribe fn.

---

## Domain 1 — Settings

| event | enum value | emitter file:line | listener file:line | state change | side effect | unsubscribe lifecycle | notes |
|-------|-----------|------------------|--------------------|-------------|-------------|----------------------|-------|
| `SETTINGS_UPDATED` | `peak:settings-updated` | `src/ui/view/settings/hooks/useSettingsUpdate.ts:52` | `src/app/context/AppContext.ts:377` | Refreshes `this.settings`; toggles devtools globals when `enableDevTools` changes | Opens/closes devtools window, registers/unregisters `window.*` helpers | `AppContext.onunload()` → `this.unsubscribeSettingsUpdated()` | AppContext is the single authoritative settings cache |
| `SETTINGS_UPDATED` | `peak:settings-updated` | `src/ui/view/settings/hooks/useSettingsUpdate.ts:52` | `src/ui/view/SettingsView.tsx:54` | Re-syncs local settings copy in the settings panel | Re-renders settings UI | React `useEffect` cleanup returns `unsubscribe` | Standard re-render; no side effects beyond UI |
| `peak:settings-updated` (raw string) | — | `src/ui/view/settings/hooks/useSettingsUpdate.ts:52` | `src/service/search/index/indexUpdater.ts:75` | Triggers index configuration refresh (excluded folders, auto-save folder, etc.) | Re-schedules indexing pipeline | `indexUpdater.dispose()` calls `this.settingsUnsubscribe()` at lines 93–95 and 284–286 | **Drift**: uses raw string `'peak:settings-updated'`, not `ViewEventType.SETTINGS_UPDATED` |
| `settings-updated` (raw string) | — | *(no emitter found)* | `src/ui/hooks/useModels.ts:37` | Re-fetches available model list for UI | Rebuilds model selector options | React `useEffect` cleanup returns `unsubscribe` | **Drift**: listens on `'settings-updated'` (missing `peak:` prefix) — **this is a dead subscription** unless something emits the bare string |

### Settings Drift Summary

- `indexUpdater.ts:75` — subscribes to raw `'peak:settings-updated'` instead of `ViewEventType.SETTINGS_UPDATED`. Functionally equivalent today, but bypasses the enum and will silently break if the enum value changes.
- `useModels.ts:37` — subscribes to raw `'settings-updated'` (no `peak:` prefix). `ViewEventType.SETTINGS_UPDATED = 'peak:settings-updated'`. **This listener never fires** from the current dispatch path. The model list only refreshes on component mount, never on settings save.

---

## Domain 2 — Chat / Project Navigation

| event | enum value | emitter file:line | listener file:line | state change | side effect | unsubscribe lifecycle | notes |
|-------|-----------|------------------|--------------------|-------------|-------------|----------------------|-------|
| `SELECTION_CHANGED` | `peak:selection-changed` | `src/ui/view/chat-view/chatNavigation.ts:34` | `src/ui/view/chat-view/ChatViewComponent.tsx:63` | Loads conversation into chat view store | Opens ChatView leaf, reads conversation from manager | React `useEffect` cleanup | Fired when user picks a conversation from project list |
| `SELECTION_CHANGED` | `peak:selection-changed` | `src/ui/view/chat-view/chatNavigation.ts:34` | `src/ui/view/project-list-view/ProjectListView.tsx:135` | Sets `activeConversation` in project list | Re-highlights selected conversation row | React `useEffect` cleanup | Mirror state sync between chat and project list |
| `SELECTION_CHANGED` | `peak:selection-changed` | `src/ui/view/project-list-view/utils.ts:50` | (same listeners) | — | — | — | Second emit path: project overview navigation |
| `CONVERSATION_CREATED` | `peak:conversation-created` | `src/service/chat/service-conversation.ts:113` | `src/ui/view/project-list-view/ProjectsSection.tsx:422` | Prepends new conversation to project conversation list | Re-renders project row | React `useEffect` cleanup | |
| `CONVERSATION_CREATED` | `peak:conversation-created` | `src/service/chat/service-conversation.ts:113` | `src/ui/view/project-list-view/ConversationsSection.tsx:266` | Prepends new conversation to standalone list | Re-renders conversations panel | React `useEffect` cleanup | |
| `CONVERSATION_UPDATED` | `peak:conversation-updated` | `src/service/chat/service-conversation.ts:363,377,427,441,458` | `src/ui/view/chat-view/hooks/useProjectLoad.ts:98` | Updates conversation in chat view state | Re-renders messages / metadata | React `useEffect` cleanup | Five dispatch sites: title update, add message, delete message, update message, set project |
| `CONVERSATION_UPDATED` | `peak:conversation-updated` | `src/service/chat/service-conversation.ts:363,377,427,441,458` | `src/ui/view/project-list-view/ProjectListView.tsx:171` | Updates conversation in project list | Re-renders project list row | React `useEffect` cleanup | |
| `CONVERSATION_UPDATED` | `peak:conversation-updated` | `src/service/chat/service-conversation.ts:363,377,427,441,458` | `src/ui/view/project-list-view/ProjectsSection.tsx:402` | Updates conversation inside project | Re-renders project section | React `useEffect` cleanup | |
| `CONVERSATION_UPDATED` | `peak:conversation-updated` | `src/service/chat/service-conversation.ts:363,377,427,441,458` | `src/ui/view/project-list-view/ConversationsSection.tsx:253` | Updates conversation row | Re-renders list item | React `useEffect` cleanup | |
| `CONVERSATION_UPDATED` | `peak:conversation-updated` | `src/ui/view/chat-view/components/messages/MessageViewItem.tsx:137` | (same listeners above) | — | — | — | UI-side dispatch after inline star/delete |
| `CONVERSATION_UPDATED` | `peak:conversation-updated` | `src/ui/view/chat-view/hooks/useStreamChat.ts:142` | (same listeners above) | — | — | — | Dispatch after streaming completes |
| `MESSAGE_SENT` | `peak:message-sent` | `src/service/chat/service-conversation.ts:525` | `src/service/chat/context/ContextUpdateService.ts:34` | Triggers async conversation summary refresh and context update | Writes updated summary to SQLite | `ContextUpdateService.dispose()` calls unsubscribers | |
| `MESSAGE_SENT` | `peak:message-sent` | `src/service/chat/service-conversation.ts:525` | `src/service/context/SessionContextService.ts:326` (via `EVENT_TO_OP`) | Records `chat_message` operation in `MobiusOperationRepo` | Writes row to SQLite | `SessionContextService.dispose()` drains `unsubscribers` | |
| `SCROLL_TO_MESSAGE` | `peak:scroll-to-message` | `src/ui/view/chat-view/chatNavigation.ts:76` | `src/ui/view/shared/scroll-utils.ts:268` | None | Scrolls message list DOM to target messageId | React `useEffect` cleanup | |
| `OPEN_LINK` | `peak:open-link` | *(no emitter found in codebase)* | `src/ui/view/chat-view/view-Messages.tsx:86` | None | Opens vault path in Obsidian | React `useEffect` cleanup | Event class defined, listener registered, but no `dispatch(new OpenLinkEvent(...))` call found in `src/`. Possibly a dead listener or dispatched from non-grepped path. |
| `SHOW_TOAST` | `peak:show-toast` | `src/ui/utils/toast.ts:44` | `src/ui/view/chat-view/ChatViewComponent.tsx:28` | None | Renders toast notification | React `useEffect` cleanup | |
| `PROJECT_UPDATED` | `peak:project-updated` | *(no emitter found in `src/` dispatch calls)* | *(no listener found)* | — | — | — | Event class defined in `eventBus.ts:59` but no dispatch site found. Dead event. |

---

## Domain 3 — Context / Session Activity

| event | enum value | emitter file:line | listener file:line | state change | side effect | unsubscribe lifecycle | notes |
|-------|-----------|------------------|--------------------|-------------|-------------|----------------------|-------|
| `COPILOT_ACTION` | `copilot-action` | *(no `dispatch(new CopilotActionEvent(...))` found in `src/`)* | `src/service/context/SessionContextService.ts:326` (via `EVENT_TO_OP`) | Records `copilot_action` in `MobiusOperationRepo` | Writes row to SQLite | `SessionContextService.dispose()` | Event class defined, listener registered, but no dispatch site found. Possibly dispatched from a deleted runtime (CuratorPushRuntime was deleted in recent refactor). |
| `SEARCH_QUERY` | `search-query` | `src/ui/view/quick-search/SearchModal.tsx:112` | `src/service/context/SessionContextService.ts:326` (via `EVENT_TO_OP`) | Records `search_query` in `MobiusOperationRepo` | Writes row to SQLite | `SessionContextService.dispose()` | |
| `AI_ANALYSIS_COMPLETE` | `ai-analysis-complete` | `src/service/search/analysisDocPersistence.ts:171` | `src/service/context/SessionContextService.ts:326` (via `EVENT_TO_OP`) | Records `ai_analysis_complete` in `MobiusOperationRepo` | Writes row to SQLite | `SessionContextService.dispose()` | |
| `RESOURCE_ATTACHED` | `resource-attached` | *(no emitter found in `src/`)* | `src/service/context/SessionContextService.ts:326` (via `EVENT_TO_OP`) | Records `resource_attach` in `MobiusOperationRepo` | Writes row to SQLite | `SessionContextService.dispose()` | Listener registered but no dispatch site found. Dead event. |

### SessionContextService event subscription pattern

`SessionContextService.subscribeEvents()` (line 324) iterates `EVENT_TO_OP` and calls `this.eventBus.on(eventType, ...)` for each key. This means `COPILOT_ACTION`, `SEARCH_QUERY`, `AI_ANALYSIS_COMPLETE`, and `RESOURCE_ATTACHED` all funnel into one handler that writes to `MobiusOperationRepo`.

Additionally, `SessionContextService` subscribes to `app.workspace.on('file-open', ...)` at line 332 as a raw Obsidian event (not through EventBus).

---

## Domain 4 — Usage / Cost

| event | enum value | emitter file:line | listener file:line | state change | side effect | unsubscribe lifecycle | notes |
|-------|-----------|------------------|--------------------|-------------|-------------|----------------------|-------|
| `USAGE_RECORDED` | `peak:usage-recorded` | `src/service/chat/service-manager.ts:718` | `src/service/usage/UsageTrackingService.ts:116` | None | Writes usage record to `UsageLogRepo` if tracking enabled | `UsageTrackingService.destroy()` calls `this.unsubscribe()` | Chat streaming path |
| `USAGE_RECORDED` | `peak:usage-recorded` | `src/service/chat/service-manager.ts:758` | (same listener) | — | — | — | Chat non-streaming path |
| `USAGE_RECORDED` | `peak:usage-recorded` | `src/service/agents/core/sdkAgentPool.ts:329` | (same listener) | — | — | — | Agent pool path (all harness agents) |

---

## Domain 5 — Search / Indexing

| event | enum value | emitter file:line | listener file:line | state change | side effect | unsubscribe lifecycle | notes |
|-------|-----------|------------------|--------------------|-------------|-------------|----------------------|-------|
| `CASCADE_COMPLETED` | `peak:cascade-completed` | `src/service/search/index/cascade/CascadeWorker.ts:86` | *(no `eventBus.on(ViewEventType.CASCADE_COMPLETED, ...)` found in `src/`)* | — | — | — | Dispatched as a raw object (`{ type: ViewEventType.CASCADE_COMPLETED, affectedDocIds }`) via `as any`. No typed listener found. Possibly consumed by UI that subscribes generically, or a dead emit. |

### Raw Obsidian vault events (not through EventBus)

These bypass the `EventBus` abstraction and subscribe directly to `app.vault.*`:

| event | subscriber file:line | side effect |
|-------|---------------------|-------------|
| `vault.on('modify', ...)` | `src/service/search/index/indexUpdater.ts:57` | Enqueues upsert |
| `vault.on('create', ...)` | `src/service/search/index/indexUpdater.ts:58` | Enqueues upsert |
| `vault.on('delete', ...)` | `src/service/search/index/indexUpdater.ts:59` | Enqueues delete |
| `vault.on('rename', ...)` | `src/service/search/index/indexUpdater.ts:60` | Enqueues rename |
| `workspace.on('file-open', ...)` | `src/service/search/index/indexUpdater.ts:67` | Triggers single-doc index check |
| `vault.on('modify', ...)` | `src/service/search/index/cascade/CascadeWorker.ts:45` | Notifies cascade scheduler of activity |
| `vault.on('create', ...)` | `src/service/search/index/cascade/CascadeWorker.ts:46` | Notifies cascade scheduler of activity |
| `workspace.on('active-leaf-change', ...)` | `src/app/events/Register.ts:17,32` | Checks if opened file is a chat conversation; schedules button injection |
| `workspace.on('file-open', ...)` | `src/app/events/Register.ts:23` | Same chat-conversation check |
| `workspace.on('file-open', ...)` | `src/service/context/SessionContextService.ts:332` | Records `file_open` operation to SQLite |
| `workspace.on('editor-change', ...)` | `src/app/ambient/ObsidianAmbientEditorContextAdapter.ts:109` | Debounces ambient editor activity |
| `workspace.on('file-open', ...)` | `src/app/ambient/ObsidianAmbientEditorContextAdapter.ts:139` | Tracks opened file for ambient context |
| `workspace.on('layout-change', ...)` | `src/app/view/ConversationOutlineView.ts:33` | Updates outline panel |
| `vault.on('create', ...)` | `src/service/skills/SkillRegistry.ts:52` | Reloads skill definitions on file change |
| `vault.on('modify', ...)` | `src/service/skills/SkillRegistry.ts:53` | Reloads skill definitions on file change |
| `vault.on('delete', ...)` | `src/service/skills/SkillRegistry.ts:54` | Reloads skill definitions on file change |
| `vault.on('rename', ...)` | `src/service/skills/SkillRegistry.ts:55` | Reloads skill definitions on file change |

---

## Drift List

Issues found where code does not use `ViewEventType` enum:

1. **`src/service/search/index/indexUpdater.ts:75`** — subscribes to raw string `'peak:settings-updated'` instead of `ViewEventType.SETTINGS_UPDATED`. Functionally identical today, but silently breaks if enum value changes.

2. **`src/ui/hooks/useModels.ts:37`** — subscribes to raw string `'settings-updated'` (no `peak:` prefix). This event is **never emitted** by any current dispatch call. The model list hook does not receive live settings updates — a latent bug.

3. **`src/service/search/index/cascade/CascadeWorker.ts:86`** — dispatches `CASCADE_COMPLETED` as a raw object (`{ type: ..., affectedDocIds }` cast via `as any`) instead of using a typed event class. No typed subscriber found for this event; it may be a dead dispatch.

4. **`PROJECT_UPDATED`** (`peak:project-updated`) — event class defined in `src/core/eventBus.ts:59`, no emitter found, no listener found. Dead event type.

5. **`OPEN_LINK`** (`peak:open-link`) — listener in `src/ui/view/chat-view/view-Messages.tsx:86` but no `dispatch(new OpenLinkEvent(...))` found in `src/`. Likely dead listener or dispatched from deleted code.

6. **`COPILOT_ACTION`** (`copilot-action`) and **`RESOURCE_ATTACHED`** (`resource-attached`) — `SessionContextService` subscribes to both, but no dispatch site found in current `src/`. Both may be connected to deleted runtimes (`CuratorPushRuntime` et al. were removed in recent refactor wave).
