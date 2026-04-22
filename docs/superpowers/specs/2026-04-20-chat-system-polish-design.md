# Chat System Polish Design Spec

> **Date**: 2026-04-20
> **Status**: Approved
> **Scope**: Store restructure, ChatInputArea refactor, delete conversation, conversation modes backend, input history navigation
> **Issues**: #93 (delete button), #72 (ChatInputArea refactor), #68 (views UI/data separation), #73 (conversation modes), #81 (ctrl+arrow shortcut)

---

## Problem

The chat system has four tangled Zustand stores with overlapping concerns: `projectStore` owns entities, `chatViewStore` directly mutates `projectStore` via `getState()`, `chatSessionStore` holds per-session config in a global singleton (not per-conversation), and `messageStore` is a redundant copy of `activeConversation.messages`. `ChatInputArea.tsx` is a 453-line monolith mixing data fetching, keyboard handling, token calculation, and rendering. There is no way to delete a conversation from within the active view, conversation modes have no backend effect, and there is no input history navigation.

## Design

### 1. Store Restructure

Merge 4 stores into 2 with clean boundaries.

#### `chatDataStore` (replaces `projectStore` + `messageStore`)

Single source of truth for all entity data and streaming state.

```
chatDataStore {
  // Entities
  projects: Map<string, Project>
  conversations: Map<string, Conversation>
  activeProject: Project | null
  activeConversation: Conversation | null
  expandedProjects: Set<string>

  // Messages — source of truth (no redundant copy)
  messages: Message[]

  // Streaming overlay (moved from messageStore)
  streamingMessageId: string | null
  streamingContent: string
  reasoningContent: string
  toolCalls: ToolCallState[]
  isStreaming: boolean

  // Actions
  setActiveProject(project): void
  setActiveConversation(conv): void
  loadConversation(id): Promise<void>
  deleteConversation(id): Promise<void>
  addMessage(msg): void
  updateStreamingContent(content): void
  clearStreaming(): void
  setMessages(msgs): void
}
```

Key change: `messages[]` lives here instead of in a separate `messageStore`. The manual sync in `view-Messages.tsx:37-43` is eliminated. Streaming state is an overlay on top of the message list, not a separate store.

#### `chatViewStore` (absorbs `chatSessionStore`)

Pure UI state. Never directly mutates `chatDataStore` — calls its public actions.

```
chatViewStore {
  // Navigation
  viewMode: ViewMode
  navigationHistory: ViewMode[]
  pendingConversation: PendingConversation | null

  // Input state (moved from chatSessionStore)
  chatMode: 'chat' | 'plan' | 'agent'
  selectedModel: { provider: string; modelId: string } | null
  outputControl: OutputControlSettings
  searchEnabled: boolean
  webEnabled: boolean
  attachmentMode: 'direct' | 'degrade_to_text'
  codeInterpreterEnabled: boolean
  suggestionTags: string[]

  // Input history (#81)
  inputHistory: string[]
  historyIndex: number
  draftInput: string  // stashed current input when navigating history

  // Actions
  navigateTo(viewMode, opts?): void
  goBack(): void
  resetSession(): void
  pushInputHistory(text): void
  navigateHistory(direction: 'up' | 'down'): string | null
}
```

Key changes:
- `navigateTo` replaces the current pattern of `setViewMode` + imperatively calling `projectStore.getState().setActiveProject(null)`. Instead, `navigateTo` calls `chatDataStore.setActiveProject/Conversation` through its public API.
- All session-scoped fields from `chatSessionStore` move here.
- Mock data (`initialFileChanges`, `initialExternalPrompts`) is deleted entirely.

#### Files deleted

- `src/ui/view/chat-view/store/chatSessionStore.ts` — dissolved into `chatViewStore`
- `src/ui/view/chat-view/store/messageStore.ts` — dissolved into `chatDataStore`

#### Migration strategy

Incremental, not big-bang:
1. Create new `chatDataStore` with entity + streaming fields
2. Create updated `chatViewStore` with absorbed session fields
3. Migrate consumers file-by-file (update imports, replace store calls)
4. Delete old stores once zero imports remain

### 2. ChatInputArea Refactor

Split 453 lines into ~150 line main component + 4 extracted units:

#### `useContextSearch` hook

Extracted from `ChatInputArea.tsx:105-218`. Contains:
- `handleSearchContext(query)` — vault search + recent files + dedup
- `handleSearchPrompts(query)` — local + external prompt search + dedup
- `handleMenuSelect(item)` — folder navigation for @ autocomplete

Returns `{ handleSearchContext, handleSearchPrompts, handleMenuSelect }`.

No store dependency — receives `searchClient` and `promptService` as parameters or reads from `AppContext.getInstance()`.

#### `useInputKeyboard` hook

Extracted from `ChatInputArea.tsx:267-330`. Contains:
- Conversation-change focus effect
- Ctrl+K (focus input), Ctrl+Enter (line break), Ctrl+A (select all)
- **New: Ctrl+ArrowUp / Ctrl+ArrowDown** — input history navigation (#81)

Takes `textareaRef` and `chatViewStore` actions as parameters.

#### `useTokenUsage` hook

Extracted from `ChatInputArea.tsx:246-265`. Contains:
- `useMemo` that walks `messages` and sums token counts
- Handles all `usage` field naming variants

Takes `messages: Message[]` as parameter. Returns `{ inputTokens, outputTokens, totalTokens }`.

#### `<InputToolbar>` component

Extracted from `ChatInputArea.tsx:380-440` (JSX footer). Contains the 8 toolbar buttons:
- Web search toggle
- Vault search toggle
- Attachment mode toggle
- Code interpreter toggle
- Mode selector
- Model selector
- Output control
- Token usage display

Receives needed state as props from parent. Does not read from stores directly.

#### Resulting `ChatInputArea.tsx`

~150 lines. Wires the 4 units together + renders `PromptInput`:

```tsx
function ChatInputAreaComponent() {
  const { handleSearchContext, handleSearchPrompts, handleMenuSelect } = useContextSearch();
  const { ... } = useInputKeyboard(textareaRef);
  const tokenUsage = useTokenUsage(messages);

  return (
    <PromptInput ...>
      <PromptInputAttachments />
      <PromptInputBody />
      <InputToolbar tokenUsage={tokenUsage} ... />
    </PromptInput>
  );
}
```

### 3. Delete from Active Conversation (#93)

Add "Delete Conversation" to the action menu in `MessageViewHeader.tsx`:

- Menu item with `Trash2` icon in `OpenMenuButton.tsx`
- Click triggers a confirmation (Obsidian `Modal` or `window.confirm`)
- Confirmed: calls `chatDataStore.deleteConversation(id)` → `service-conversation.deleteConversation(id)` → navigates to `HOME`
- The service layer already supports deletion at `service-conversation.ts:85-87`

No tab system is introduced. The current single-conversation view gets a delete action, matching the existing delete in `ConversationItem` (list view).

### 4. Conversation Modes Backend (#73)

**Scope: system prompt branching only.**

`service-conversation.ts` `prepareChatRequest` gains a `mode?: ChatMode` parameter:

| Mode | System Prompt Modification | Tool Availability |
|------|---------------------------|-------------------|
| `chat` | No change (current default behavior) | Unchanged |
| `plan` | Append instruction: "Respond with structured plans, step-by-step breakdowns, checklists, and actionable items. Prefer markdown structure." | Unchanged |
| `agent` | Append instruction: "You have access to the user's vault and tools. Use them proactively to research, verify facts, and provide comprehensive answers." | Unchanged |

`useChatSubmit` reads `chatViewStore.chatMode` and passes it to `streamChat`. The mode is stored per-session (in `chatViewStore`), not per-conversation (no persistence).

**Future upgrade path (post Provider v2):**

> Provider v2 unifies the runtime to Agent SDK `query()`. Once that lands, upgrading conversation modes becomes straightforward:
> - **Level B**: mode controls `allowedTools` in `query()` options. `chat` = no tools, `plan` = outline tools, `agent` = full vault tools.
> - **Level C**: each mode runs a distinct agent pipeline via `query()` with different `maxTurns`, `mcpServers`, and `systemPrompt`.
>
> Building Level C now on the old Vercel AI SDK stack would mean creating new agent pipelines that Provider v2 will completely replace. The current Level A (prompt-only branching) is the right investment until v2 lands.

### 5. Input History Navigation (#81)

`chatViewStore` adds:
- `inputHistory: string[]` — max 50 entries, newest last
- `historyIndex: number` — -1 means "not navigating"
- `draftInput: string` — stashed current input when user starts navigating up

Behavior:
- On message send: `pushInputHistory(text)` appends to history, resets index to -1
- Ctrl+ArrowUp: if `historyIndex === -1`, stash current input to `draftInput`, set index to `history.length - 1`, fill textarea with `history[index]`. If already navigating, decrement index (clamp to 0).
- Ctrl+ArrowDown: increment index. If index reaches `history.length`, restore `draftInput`, reset index to -1.
- Any typing while navigating: reset index to -1 (user broke out of history).

History is session-scoped (cleared on page reload). Not persisted.

## Non-Goals

- Tab system for multiple open conversations (current single-conversation view is sufficient)
- Per-conversation mode persistence (mode is session-scoped UI state)
- Tool routing based on conversation mode (deferred to post-Provider v2, see section 4)
- Store persistence / undo (Zustand stores are ephemeral)
- ConversationService refactor beyond mode parameter (service layer is adequately structured)

## Changes Summary

| File | Action |
|---|---|
| `src/ui/store/chatDataStore.ts` | **New** — merged entity + message + streaming store |
| `src/ui/view/chat-view/store/chatViewStore.ts` | **Major rewrite** — absorb chatSessionStore, add input history, clean navigation |
| `src/ui/view/chat-view/store/chatSessionStore.ts` | **Delete** |
| `src/ui/view/chat-view/store/messageStore.ts` | **Delete** |
| `src/ui/store/projectStore.ts` | **Delete** (replaced by chatDataStore) |
| `src/ui/view/chat-view/hooks/useContextSearch.ts` | **New** — extracted from ChatInputArea |
| `src/ui/view/chat-view/hooks/useInputKeyboard.ts` | **New** — extracted from ChatInputArea |
| `src/ui/view/chat-view/hooks/useTokenUsage.ts` | **New** — extracted from ChatInputArea |
| `src/ui/view/chat-view/components/InputToolbar.tsx` | **New** — extracted from ChatInputArea JSX |
| `src/ui/view/chat-view/components/ChatInputArea.tsx` | **Major rewrite** — 453 → ~150 lines |
| `src/ui/view/chat-view/components/messages/OpenMenuButton.tsx` | **Modify** — add Delete Conversation item |
| `src/service/chat/service-conversation.ts` | **Modify** — add `mode` parameter to `prepareChatRequest` |
| `src/ui/view/chat-view/hooks/useChatSubmit.ts` | **Modify** — pass chatMode to streamChat |
| ~15 consumer files | **Modify** — update store imports from old → new |
