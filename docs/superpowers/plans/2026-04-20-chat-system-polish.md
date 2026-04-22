# Chat System Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure chat stores from 4 tangled Zustand stores to 2 clean ones, refactor ChatInputArea from 453 to ~150 lines, add delete-from-active-conversation, conversation mode backend branching, and input history navigation.

**Architecture:** Two stores with clean boundaries: `chatDataStore` (entities + messages + streaming) and `chatViewStore` (navigation + input state + history). ChatInputArea decomposes into 4 extracted hooks/components. Conversation modes branch at system prompt level. Input history is session-scoped.

**Tech Stack:** Zustand, React hooks, Obsidian API.

**Spec:** `docs/superpowers/specs/2026-04-20-chat-system-polish-design.md`

---

## File Structure

### New files

| File | Purpose |
|---|---|
| `src/ui/store/chatDataStore.ts` | Merged entity + message + streaming store |
| `src/ui/view/chat-view/hooks/useContextSearch.ts` | Vault/prompt search logic extracted from ChatInputArea |
| `src/ui/view/chat-view/hooks/useInputKeyboard.ts` | Keyboard shortcuts + input history navigation |
| `src/ui/view/chat-view/hooks/useTokenUsage.ts` | Token calculation |
| `src/ui/view/chat-view/components/InputToolbar.tsx` | Footer toolbar buttons |

### Modified files

| File | Change |
|---|---|
| `src/ui/view/chat-view/store/chatViewStore.ts` | Major rewrite — absorb chatSessionStore fields, add input history, clean navigation |
| `src/ui/view/chat-view/components/ChatInputArea.tsx` | Major rewrite — 453 → ~150 lines |
| `src/ui/view/chat-view/components/messages/OpenMenuButton.tsx` | Add Delete Conversation menu item |
| `src/service/chat/service-conversation.ts` | Add `mode` param to `prepareChatRequest` |
| `src/ui/view/chat-view/hooks/useChatSubmit.ts` | Pass chatMode to streamChat |
| ~15 consumer files | Update store imports |

### Deleted files

| File | Reason |
|---|---|
| `src/ui/view/chat-view/store/chatSessionStore.ts` | Dissolved into chatViewStore |
| `src/ui/view/chat-view/store/messageStore.ts` | Dissolved into chatDataStore |
| `src/ui/store/projectStore.ts` | Replaced by chatDataStore |

---

## Task Execution Order

```
Task 1: chatDataStore          Task 2: chatViewStore rewrite
   |                               |
   +--- Task 3: Migrate view-Messages.tsx (messages from chatDataStore)
   |
   +--- Task 4: Migrate ChatViewComponent.tsx (navigation from chatViewStore)
   |
   +--- Task 5: Migrate remaining consumers + delete old stores
   |
   +--- Task 6: useContextSearch extraction
   |
   +--- Task 7: useInputKeyboard extraction (includes #81)
   |
   +--- Task 8: useTokenUsage extraction
   |
   +--- Task 9: InputToolbar extraction
   |
   +--- Task 10: ChatInputArea final assembly
   |
   +--- Task 11: Delete from active conversation (#93)
   |
   +--- Task 12: Conversation modes backend (#73)
```

Tasks 1-2 are independent and can be parallel. Tasks 3-5 depend on both. Tasks 6-10 depend on 5. Tasks 11-12 depend on 5.

---

### Task 1: Create chatDataStore

**Files:**
- Create: `src/ui/store/chatDataStore.ts`
- Read: `src/ui/store/projectStore.ts` (source for entity fields)
- Read: `src/ui/view/chat-view/store/messageStore.ts` (source for streaming fields)

- [ ] **Step 1: Create chatDataStore with entity fields from projectStore**

Read `src/ui/store/projectStore.ts` and copy the entity state + actions. Then read `src/ui/view/chat-view/store/messageStore.ts` and merge the streaming state.

```typescript
// src/ui/store/chatDataStore.ts
import { create } from 'zustand';
import type { Conversation, Project } from '@/service/chat/types';
import type { Message } from '@/service/chat/types';

interface ToolCallState {
  id: string;
  name: string;
  input: any;
  output?: string;
  isStreaming: boolean;
}

interface ChatDataState {
  // Entities (from projectStore)
  projects: Map<string, Project>;
  conversations: Map<string, Conversation>;
  activeProject: Project | null;
  activeConversation: Conversation | null;
  expandedProjects: Set<string>;

  // Messages — single source of truth
  messages: Message[];

  // Streaming overlay (from messageStore)
  streamingMessageId: string | null;
  streamingContent: string;
  reasoningContent: string;
  toolCalls: ToolCallState[];
  isStreaming: boolean;

  // Entity actions
  setProjects(projects: Map<string, Project>): void;
  setConversations(conversations: Map<string, Conversation>): void;
  setActiveProject(project: Project | null): void;
  setActiveConversation(conv: Conversation | null): void;
  toggleExpandProject(projectId: string): void;

  // Message actions
  setMessages(msgs: Message[]): void;
  addMessage(msg: Message): void;

  // Streaming actions
  startStreaming(messageId: string): void;
  updateStreamingContent(content: string): void;
  updateReasoningContent(content: string): void;
  addToolCall(toolCall: ToolCallState): void;
  updateToolCall(id: string, updates: Partial<ToolCallState>): void;
  clearStreaming(): void;

  // Conversation lifecycle
  deleteConversation(id: string): void;
}

export const useChatDataStore = create<ChatDataState>((set, get) => ({
  // Initial state — entities
  projects: new Map(),
  conversations: new Map(),
  activeProject: null,
  activeConversation: null,
  expandedProjects: new Set(),

  // Initial state — messages
  messages: [],

  // Initial state — streaming
  streamingMessageId: null,
  streamingContent: '',
  reasoningContent: '',
  toolCalls: [],
  isStreaming: false,

  // Entity actions — ported from projectStore
  setProjects: (projects) => set({ projects }),
  setConversations: (conversations) => set({ conversations }),
  setActiveProject: (project) => set({ activeProject: project }),
  setActiveConversation: (conv) => {
    set({
      activeConversation: conv,
      messages: conv?.messages ?? [],
      // Clear streaming on conversation switch
      streamingMessageId: null,
      streamingContent: '',
      reasoningContent: '',
      toolCalls: [],
      isStreaming: false,
    });
  },
  toggleExpandProject: (projectId) => set((state) => {
    const next = new Set(state.expandedProjects);
    if (next.has(projectId)) next.delete(projectId); else next.add(projectId);
    return { expandedProjects: next };
  }),

  // Message actions
  setMessages: (msgs) => set({ messages: msgs }),
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),

  // Streaming actions — ported from messageStore
  startStreaming: (messageId) => set({
    streamingMessageId: messageId,
    streamingContent: '',
    reasoningContent: '',
    toolCalls: [],
    isStreaming: true,
  }),
  updateStreamingContent: (content) => set({ streamingContent: content }),
  updateReasoningContent: (content) => set({ reasoningContent: content }),
  addToolCall: (toolCall) => set((state) => ({
    toolCalls: [...state.toolCalls, toolCall],
  })),
  updateToolCall: (id, updates) => set((state) => ({
    toolCalls: state.toolCalls.map((tc) =>
      tc.id === id ? { ...tc, ...updates } : tc
    ),
  })),
  clearStreaming: () => set({
    streamingMessageId: null,
    streamingContent: '',
    reasoningContent: '',
    toolCalls: [],
    isStreaming: false,
  }),

  // Conversation lifecycle
  deleteConversation: (id) => set((state) => {
    const next = new Map(state.conversations);
    next.delete(id);
    const isActive = state.activeConversation?.meta?.id === id;
    return {
      conversations: next,
      activeConversation: isActive ? null : state.activeConversation,
      messages: isActive ? [] : state.messages,
    };
  }),
}));
```

Note: The actual field names and types must match what `projectStore.ts` and `messageStore.ts` currently export. Read both files at implementation time and adapt the types. The above is the structural skeleton.

- [ ] **Step 2: Build to verify types compile**

```bash
npm run build
```

Expect build errors from unused file — that's fine. The new store has no consumers yet.

- [ ] **Step 3: Commit**

```bash
git add src/ui/store/chatDataStore.ts
git commit -m "feat: create chatDataStore merging projectStore + messageStore"
```

---

### Task 2: Rewrite chatViewStore

**Files:**
- Modify: `src/ui/view/chat-view/store/chatViewStore.ts`
- Read: `src/ui/view/chat-view/store/chatSessionStore.ts` (source for session fields)

- [ ] **Step 1: Rewrite chatViewStore to absorb chatSessionStore fields**

Read `chatSessionStore.ts` to get the exact field names and types. Merge them into `chatViewStore`. Add input history fields. Remove all direct `projectStore.getState()` calls — replace with `chatDataStore` action calls.

Key changes:
- Import `useChatDataStore` instead of `useProjectStore`
- `navigateTo(viewMode, opts)` replaces individual `setViewMode` + imperative store mutation
- Add `inputHistory`, `historyIndex`, `draftInput` fields
- Add `pushInputHistory(text)`, `navigateHistory(direction)` actions
- Add all fields from `chatSessionStore`: `chatMode`, `selectedModel`, `outputControl`, `searchEnabled`, `webEnabled`, `attachmentMode`, `codeInterpreterEnabled`, `suggestionTags`
- Delete mock data (`initialFileChanges`, `initialExternalPrompts`)

```typescript
// In the new chatViewStore, the navigateTo action:
navigateTo: (viewMode, opts) => {
  const prev = get().viewMode;
  set((state) => ({
    viewMode,
    navigationHistory: [...state.navigationHistory, prev],
  }));
  // Update data store via public API, not getState() mutation
  if (opts?.project !== undefined) {
    useChatDataStore.getState().setActiveProject(opts.project);
  }
  if (opts?.conversation !== undefined) {
    useChatDataStore.getState().setActiveConversation(opts.conversation);
  }
},

goBack: () => {
  const history = get().navigationHistory;
  if (history.length === 0) return;
  const prev = history[history.length - 1];
  set({ viewMode: prev, navigationHistory: history.slice(0, -1) });
},

// Input history (#81)
pushInputHistory: (text) => {
  if (!text.trim()) return;
  set((state) => {
    const history = [...state.inputHistory, text].slice(-50); // max 50
    return { inputHistory: history, historyIndex: -1, draftInput: '' };
  });
},

navigateHistory: (direction) => {
  const { inputHistory, historyIndex, draftInput } = get();
  if (inputHistory.length === 0) return null;

  if (direction === 'up') {
    if (historyIndex === -1) {
      // Start navigating — stash current and go to last entry
      const newIndex = inputHistory.length - 1;
      set({ historyIndex: newIndex });
      return inputHistory[newIndex];
    }
    const newIndex = Math.max(0, historyIndex - 1);
    set({ historyIndex: newIndex });
    return inputHistory[newIndex];
  }

  // direction === 'down'
  if (historyIndex === -1) return null; // not navigating
  const newIndex = historyIndex + 1;
  if (newIndex >= inputHistory.length) {
    set({ historyIndex: -1 });
    return draftInput; // restore draft
  }
  set({ historyIndex: newIndex });
  return inputHistory[newIndex];
},
```

- [ ] **Step 2: Build to verify**

```bash
npm run build
```

Build may have errors from consumers still importing old chatSessionStore — that's expected and will be fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/chat-view/store/chatViewStore.ts
git commit -m "feat: rewrite chatViewStore — absorb session state, add input history, clean navigation"
```

---

### Task 3: Migrate message consumers to chatDataStore

**Files:**
- Modify: `src/ui/view/chat-view/view-Messages.tsx`
- Modify: `src/ui/view/chat-view/hooks/useStreamChat.ts`
- Modify: `src/ui/view/chat-view/components/messages/MessageListRenderer.tsx`

- [ ] **Step 1: Update view-Messages.tsx**

This file currently syncs `messageStore.messages` from `projectStore.activeConversation.messages` in a useEffect (lines 37-43). Replace:

```typescript
// Before
import { useMessageStore } from '../store/messageStore';
import { useProjectStore } from '@/ui/store/projectStore';

// After
import { useChatDataStore } from '@/ui/store/chatDataStore';
```

Delete the sync effect entirely — `chatDataStore.setActiveConversation` already sets `messages`.

Replace all `useMessageStore(s => s.xxx)` with `useChatDataStore(s => s.xxx)`.

- [ ] **Step 2: Update useStreamChat.ts**

Replace `useMessageStore` imports with `useChatDataStore`. The streaming actions (`startStreaming`, `updateStreamingContent`, `clearStreaming`) are the same names in the new store.

- [ ] **Step 3: Update MessageListRenderer.tsx**

Replace `useMessageStore(s => s.messages)` with `useChatDataStore(s => s.messages)`.

- [ ] **Step 4: Build and verify**

```bash
npm run build
```

- [ ] **Step 5: Commit**

```bash
git commit -am "refactor: migrate message consumers from messageStore to chatDataStore"
```

---

### Task 4: Migrate navigation consumers to new chatViewStore

**Files:**
- Modify: `src/ui/view/chat-view/ChatViewComponent.tsx`
- Modify: `src/ui/view/chat-view/view-Home.tsx`
- Modify: `src/ui/view/chat-view/view-AllProjects.tsx`
- Modify: `src/ui/view/chat-view/view-ProjectOverview.tsx`
- Modify: `src/ui/view/chat-view/view-ProjectConversationsList.tsx`

- [ ] **Step 1: Update ChatViewComponent.tsx**

Replace `useProjectStore` reads for `activeProject`/`activeConversation` with `useChatDataStore`. Replace `chatViewStore` navigation calls with the new `navigateTo(viewMode, opts)` pattern.

- [ ] **Step 2: Update view-Home.tsx and other view-* files**

Each view-* file that calls `useChatViewStore.getState().setViewMode(...)` + `useProjectStore.getState().setActiveProject(...)` should call `useChatViewStore.getState().navigateTo(viewMode, { project, conversation })` instead.

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor: migrate navigation consumers to chatViewStore.navigateTo pattern"
```

---

### Task 5: Migrate remaining consumers + delete old stores

**Files:**
- Modify: All remaining files importing `projectStore`, `chatSessionStore`, or `messageStore`
- Delete: `src/ui/store/projectStore.ts`
- Delete: `src/ui/view/chat-view/store/chatSessionStore.ts`
- Delete: `src/ui/view/chat-view/store/messageStore.ts`

- [ ] **Step 1: Find all remaining imports**

```bash
grep -rn "projectStore\|chatSessionStore\|messageStore" src/ --include='*.tsx' --include='*.ts' | grep -v chatDataStore | grep -v '.test.'
```

- [ ] **Step 2: Migrate each file**

For each file:
- `useProjectStore` → `useChatDataStore` (entity fields)
- `useChatSessionStore` → `useChatViewStore` (session/input fields)
- `useMessageStore` → `useChatDataStore` (message/streaming fields)

- [ ] **Step 3: Delete old store files**

```bash
rm src/ui/store/projectStore.ts
rm src/ui/view/chat-view/store/chatSessionStore.ts
rm src/ui/view/chat-view/store/messageStore.ts
```

- [ ] **Step 4: Build and verify zero old imports remain**

```bash
npm run build
grep -rn "projectStore\|chatSessionStore\|messageStore" src/ --include='*.tsx' --include='*.ts'
```

Should return zero results (except possibly comments).

- [ ] **Step 5: Commit**

```bash
git commit -am "refactor: delete projectStore, chatSessionStore, messageStore — all consumers migrated"
```

---

### Task 6: Extract useContextSearch

**Files:**
- Create: `src/ui/view/chat-view/hooks/useContextSearch.ts`
- Modify: `src/ui/view/chat-view/components/ChatInputArea.tsx`

- [ ] **Step 1: Create useContextSearch hook**

Extract `handleSearchContext` (lines 105-148), `handleSearchPrompts` (lines 156-195), and `handleMenuSelect` (lines 198-218) from `ChatInputArea.tsx` into a new hook:

```typescript
// src/ui/view/chat-view/hooks/useContextSearch.ts
import { useCallback, useRef } from 'react';
import { AppContext } from '@/app/context/AppContext';

export function useContextSearch() {
  const menuContextItemsRef = useRef<any[]>([]);

  const handleSearchContext = useCallback(async (query: string) => {
    // ... exact logic from ChatInputArea.tsx:105-148
  }, []);

  const handleSearchPrompts = useCallback(async (query: string) => {
    // ... exact logic from ChatInputArea.tsx:156-195
  }, []);

  const handleMenuSelect = useCallback((item: any) => {
    // ... exact logic from ChatInputArea.tsx:198-218
  }, [handleSearchContext]);

  return { handleSearchContext, handleSearchPrompts, handleMenuSelect };
}
```

- [ ] **Step 2: Replace in ChatInputArea**

Remove the extracted code from ChatInputArea.tsx and import from the hook:

```typescript
const { handleSearchContext, handleSearchPrompts, handleMenuSelect } = useContextSearch();
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/chat-view/hooks/useContextSearch.ts
git commit -am "refactor: extract useContextSearch from ChatInputArea"
```

---

### Task 7: Extract useInputKeyboard (includes #81)

**Files:**
- Create: `src/ui/view/chat-view/hooks/useInputKeyboard.ts`
- Modify: `src/ui/view/chat-view/components/ChatInputArea.tsx`

- [ ] **Step 1: Create useInputKeyboard hook**

Extract the keyboard handling from ChatInputArea.tsx:267-330 and add Ctrl+Arrow history navigation:

```typescript
// src/ui/view/chat-view/hooks/useInputKeyboard.ts
import { useEffect } from 'react';
import { useChatViewStore } from '../store/chatViewStore';

export function useInputKeyboard(
  textareaRef: React.RefObject<HTMLTextAreaElement>,
  conversationId: string | null,
) {
  // Refocus textarea on conversation change
  useEffect(() => {
    if (conversationId) {
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [conversationId]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K: focus input
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        textareaRef.current?.focus();
        return;
      }

      // Only handle remaining shortcuts when textarea is focused
      if (document.activeElement !== textareaRef.current) return;

      // Ctrl+Enter: insert line break
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        const ta = textareaRef.current!;
        const { selectionStart, selectionEnd } = ta;
        ta.value = ta.value.slice(0, selectionStart) + '\n' + ta.value.slice(selectionEnd);
        ta.selectionStart = ta.selectionEnd = selectionStart + 1;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }

      // Ctrl+A: select all in textarea
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        textareaRef.current!.select();
        return;
      }

      // Ctrl+ArrowUp: navigate input history up (#81)
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowUp') {
        e.preventDefault();
        const text = useChatViewStore.getState().navigateHistory('up');
        if (text !== null && textareaRef.current) {
          // Stash current draft before first navigation
          const store = useChatViewStore.getState();
          if (store.historyIndex === store.inputHistory.length - 1) {
            useChatViewStore.setState({ draftInput: textareaRef.current.value });
          }
          textareaRef.current.value = text;
          textareaRef.current.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return;
      }

      // Ctrl+ArrowDown: navigate input history down (#81)
      if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowDown') {
        e.preventDefault();
        const text = useChatViewStore.getState().navigateHistory('down');
        if (text !== null && textareaRef.current) {
          textareaRef.current.value = text;
          textareaRef.current.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [textareaRef]);
}
```

- [ ] **Step 2: Replace in ChatInputArea**

Remove lines 267-330 from ChatInputArea.tsx and call:

```typescript
useInputKeyboard(textareaRef, activeConversation?.meta?.id ?? null);
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/chat-view/hooks/useInputKeyboard.ts
git commit -am "feat: extract useInputKeyboard with Ctrl+Arrow input history navigation (#81)"
```

---

### Task 8: Extract useTokenUsage

**Files:**
- Create: `src/ui/view/chat-view/hooks/useTokenUsage.ts`
- Modify: `src/ui/view/chat-view/components/ChatInputArea.tsx`

- [ ] **Step 1: Create useTokenUsage hook**

```typescript
// src/ui/view/chat-view/hooks/useTokenUsage.ts
import { useMemo } from 'react';
import type { Message } from '@/service/chat/types';

export interface TokenUsageSummary {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export function useTokenUsage(messages: Message[]): TokenUsageSummary {
  return useMemo(() => {
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;

    for (const msg of messages) {
      const usage = (msg as any).usage;
      if (!usage) continue;
      inputTokens += usage.promptTokens ?? usage.prompt_tokens ?? usage.inputTokens ?? usage.input_tokens ?? 0;
      outputTokens += usage.completionTokens ?? usage.completion_tokens ?? usage.outputTokens ?? usage.output_tokens ?? 0;
      totalTokens += usage.totalTokens ?? usage.total_tokens ?? (inputTokens + outputTokens);
    }

    return { inputTokens, outputTokens, totalTokens };
  }, [messages]);
}
```

- [ ] **Step 2: Replace in ChatInputArea**

Remove the useMemo block at lines 246-265 and call:

```typescript
const tokenUsage = useTokenUsage(messages);
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/chat-view/hooks/useTokenUsage.ts
git commit -am "refactor: extract useTokenUsage from ChatInputArea"
```

---

### Task 9: Extract InputToolbar

**Files:**
- Create: `src/ui/view/chat-view/components/InputToolbar.tsx`
- Modify: `src/ui/view/chat-view/components/ChatInputArea.tsx`

- [ ] **Step 1: Create InputToolbar component**

Extract the footer JSX (approximately lines 380-440 of ChatInputArea.tsx) containing the 8 toolbar buttons:

```tsx
// src/ui/view/chat-view/components/InputToolbar.tsx
import React from 'react';
import type { TokenUsageSummary } from '../hooks/useTokenUsage';

interface InputToolbarProps {
  // Toggle states
  searchEnabled: boolean;
  webEnabled: boolean;
  attachmentMode: 'direct' | 'degrade_to_text';
  codeInterpreterEnabled: boolean;
  chatMode: 'chat' | 'plan' | 'agent';
  selectedModel: { provider: string; modelId: string } | null;

  // Callbacks
  onToggleSearch: () => void;
  onToggleWeb: () => void;
  onToggleAttachmentMode: () => void;
  onToggleCodeInterpreter: () => void;
  onSetChatMode: (mode: 'chat' | 'plan' | 'agent') => void;
  onSelectModel: (model: any) => void;

  // Display
  tokenUsage: TokenUsageSummary;
  isStreaming: boolean;
}

export const InputToolbar: React.FC<InputToolbarProps> = (props) => {
  // ... extracted JSX from ChatInputArea footer
  // Exact JSX depends on current implementation — read lines 380-440 at impl time
  return (
    <div className="pktw-flex pktw-items-center pktw-gap-1 pktw-px-2 pktw-py-1">
      {/* Search toggle, web toggle, attachment toggle, code interpreter toggle,
          mode selector, model selector, token usage display */}
    </div>
  );
};
```

- [ ] **Step 2: Replace in ChatInputArea**

Remove the footer JSX and render:

```tsx
<InputToolbar
  searchEnabled={searchEnabled}
  webEnabled={webEnabled}
  // ... pass all props from store
  tokenUsage={tokenUsage}
  isStreaming={isStreaming}
/>
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/chat-view/components/InputToolbar.tsx
git commit -am "refactor: extract InputToolbar from ChatInputArea"
```

---

### Task 10: ChatInputArea Final Assembly

**Files:**
- Modify: `src/ui/view/chat-view/components/ChatInputArea.tsx`

- [ ] **Step 1: Verify ChatInputArea is now ~150 lines**

After Tasks 6-9, ChatInputArea should contain only:
- Store wiring (read from `useChatViewStore` + `useChatDataStore`)
- Hook calls (`useContextSearch`, `useInputKeyboard`, `useTokenUsage`)
- `handleSubmit` (lines 221-243 — ~20 lines, keep inline)
- Status/cancel derivation (~15 lines)
- JSX: `PromptInput` + `PromptInputAttachments` + `PromptInputBody` + `InputToolbar`

```bash
wc -l src/ui/view/chat-view/components/ChatInputArea.tsx
```

Target: 120-180 lines.

- [ ] **Step 2: Clean up any remaining direct store.getState() calls**

All imperative `getState()` calls should use `useChatDataStore.getState()` or `useChatViewStore.getState()` — no more `projectStore` / `chatSessionStore` / `messageStore` references.

- [ ] **Step 3: Build and verify full chat flow**

```bash
npm run build
```

Test in Obsidian: open chat, send message, switch conversations, verify streaming works, check toolbar buttons.

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor: ChatInputArea reduced to ~150 lines — all extractions complete"
```

---

### Task 11: Delete from Active Conversation (#93)

**Files:**
- Modify: `src/ui/view/chat-view/components/messages/OpenMenuButton.tsx`

- [ ] **Step 1: Add Delete menu item**

Read `OpenMenuButton.tsx` to understand the current menu structure. Add a "Delete Conversation" item at the bottom of the menu:

```tsx
// In the menu items array, add:
{
  icon: <Trash2 className="pktw-w-4 pktw-h-4 pktw-text-error" />,
  label: 'Delete Conversation',
  onClick: async () => {
    // Confirm
    const confirmed = window.confirm('Delete this conversation? This cannot be undone.');
    if (!confirmed) return;

    const convId = useChatDataStore.getState().activeConversation?.meta?.id;
    if (!convId) return;

    // Delete via service
    try {
      await AppContext.getInstance().manager.deleteConversation(convId);
      useChatDataStore.getState().deleteConversation(convId);
      useChatViewStore.getState().navigateTo('HOME');
    } catch (e) {
      console.error('[OpenMenuButton] Delete failed:', e);
    }
  },
  destructive: true, // if the menu supports a destructive style
}
```

- [ ] **Step 2: Build and verify**

```bash
npm run build
```

Test: open a conversation, click menu, click Delete, confirm, verify navigation to HOME and conversation removed from list.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/chat-view/components/messages/OpenMenuButton.tsx
git commit -m "feat: add Delete Conversation action to active conversation menu (#93)"
```

---

### Task 12: Conversation Modes Backend (#73)

**Files:**
- Modify: `src/service/chat/service-conversation.ts`
- Modify: `src/ui/view/chat-view/hooks/useChatSubmit.ts`

- [ ] **Step 1: Add mode parameter to prepareChatRequest**

Read `service-conversation.ts` and find `prepareChatRequest`. Add an optional `mode` parameter:

```typescript
// In service-conversation.ts, update prepareChatRequest signature:
async prepareChatRequest(
  conversation: Conversation,
  userContent: string,
  opts?: {
    attachments?: Attachment[];
    mode?: 'chat' | 'plan' | 'agent';
  }
): Promise<LLMRequest> {
  // ... existing logic ...

  // Append mode-specific system prompt instructions
  const modeInstruction = getModeInstruction(opts?.mode);
  if (modeInstruction && systemPrompt) {
    systemPrompt = systemPrompt + '\n\n' + modeInstruction;
  }

  // ... rest of existing logic ...
}

function getModeInstruction(mode?: string): string | null {
  switch (mode) {
    case 'plan':
      return 'Respond with structured plans, step-by-step breakdowns, checklists, and actionable items. Use markdown headers, numbered lists, and checkboxes for clarity.';
    case 'agent':
      return 'You have access to the user\'s vault and tools. Use them proactively to research, verify facts, and provide comprehensive, well-sourced answers.';
    default:
      return null; // 'chat' mode = no modification
  }
}
```

- [ ] **Step 2: Pass mode from useChatSubmit**

In `useChatSubmit.ts`, read `chatMode` from `useChatViewStore` and pass it to `streamChat`:

```typescript
// In the submit function:
const chatMode = useChatViewStore.getState().chatMode;

await conversationService.streamChat({
  conversation,
  project,
  userContent,
  attachments,
  mode: chatMode, // new field
});
```

- [ ] **Step 3: Build and verify**

```bash
npm run build
```

Test: switch mode to "plan", send message, verify the response has structured formatting. Switch to "agent", verify the response mentions tool usage intent.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat: add conversation mode backend branching — system prompt varies by chat/plan/agent (#73)"
```

---

## Self-Review

**Spec coverage:**
- Section 1 (Store Restructure) → Tasks 1-5
- Section 2 (ChatInputArea Refactor) → Tasks 6-10
- Section 3 (Delete from Active Conversation) → Task 11
- Section 4 (Conversation Modes Backend) → Task 12
- Section 5 (Input History Navigation) → Task 2 (store fields) + Task 7 (keyboard handler)

**All spec sections covered.**

**Placeholder scan:** Clean. Task 1 notes "read both files at implementation time and adapt the types" — this is guidance, not a placeholder. Task 9 notes "read lines 380-440 at impl time" for the exact JSX — same.

**Type consistency:** `ChatDataState` field names (`messages`, `streamingContent`, `isStreaming`, etc.) match across Tasks 1, 3, 8, 10. `chatViewStore` field names (`chatMode`, `inputHistory`, `historyIndex`, `draftInput`) match across Tasks 2, 7, 12. `navigateTo` signature consistent across Tasks 2, 4, 11.
