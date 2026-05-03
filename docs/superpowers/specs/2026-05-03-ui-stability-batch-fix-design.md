# UI Stability & Completeness Batch Fix

**Date:** 2026-05-03
**Status:** Approved
**Scope:** 15 root causes, 7 parallel waves

## Overview

Comprehensive fix for all UI/UX issues identified through full-screen annotation review. Covers error handling robustness, chat message UI completeness, AI analysis list performance, copilot system overhaul (streaming + unified modal + tag suggestion), settings visual polish, profile-role-model redesign, and quick action wiring.

## Wave Structure

```
Phase 1 (all parallel — no shared files):
  Wave A — Error Handling Foundation (RC2 + RC13)
  Wave B — Chat Message UI (RC8 + RC9 + RC14)
  Wave C — AI Analysis List (RC5 + RC15)
  Wave E — Settings & Visual Polish (RC4 + RC11 + RC12)
  Wave F — Model & Profile System (RC1 + RC10)
  Wave G — Quick Actions & Outline (RC4 cont.)

Phase 2 (depends on Wave A error types):
  Wave D — Copilot System (RC3 + RC6 + RC7)
```

## Root Cause Index

| RC | Summary | Wave | Priority |
|----|---------|------|----------|
| RC1 | Profile-Role-Model binding too simple — toggle-only, no per-role model selection | F | P2 |
| RC2 | LLM error handling pipeline fragile — auth errors surface as JSON parse failures | A | P0 |
| RC3 | Copilot commands have no streaming — blocking calls with no progress indication | D | P2 |
| RC4 | UI visual inconsistency — tab backgrounds, hover effects, redundant banners, placeholder text | E+G | P1 |
| RC5 | AI Analysis list performance — 865 entries cause white-screen crash, no virtual scroll | C | P0 |
| RC6 | Tag Suggestion is a ghost command — stale main.js, broken schema import, no command registration | D | P1 |
| RC7 | Copilot lacks a dedicated entry modal — commands scattered in command palette | D | P1 |
| RC8 | MessageStyleButtons are non-functional placeholders — onStyleSelect is console.log | B | P1 |
| RC9 | AI Analysis results in chat don't render markdown — injected as user-role, plain text only | B | P1 |
| RC10 | Model selection has no "Auto" default — shows "No model selected" on new conversations | F | P1 |
| RC11 | CodeMirrorInput .select() type mismatch — forwardRef omits select, causes TypeError | E | P2 |
| RC12 | Local Chromium feature 0% implemented — UI toggle exists but no backend code | E | P2 |
| RC13 | LLM returns natural language instead of JSON — separate from auth errors, no retry/detection | A | P1 |
| RC14 | Error messages show inappropriate UI — Regenerate + Style buttons on error messages | B | P1 |
| RC15 | Recent AI Analysis list has no search filtering — list vanishes on input instead of filtering | C | P1 |

---

## Wave A: Error Handling Foundation (RC2 + RC13)

### New file: `src/core/errors/llm-errors.ts`

Three typed error classes:

- `AuthenticationError` — API key invalid/expired. Fields: `message`, `provider?`
- `LLMResponseError` — Model returned unexpected content. Fields: `message`, `rawResponse?`
- `MaxTurnsError` — Agent reached turn limit. Fields: `message`, `partialText?`

### Changes: `src/service/agents/core/sdkMessageAdapter.ts`

**`collectText()`** — iterate messages, detect `msg.type === 'result' && msg.is_error`:
- Match `authentication` / `Invalid bearer` → throw `AuthenticationError('API key is invalid or expired. Please update credentials in Settings → Profiles.')`
- Match `maximum number of turns` → throw `MaxTurnsError(msg, accumulatedText)` with partial text
- Other `is_error` → throw `LLMResponseError(msg.result)`

**`collectJson()`** — wrap `JSON.parse` in try/catch:
- If response starts with letter (not `{` or `[`) and length > 20 → throw `LLMResponseError('Model returned text instead of JSON: "..."')`
- Other parse failures → throw `LLMResponseError('Failed to parse response as JSON: ...')`

### Changes: `src/service/agents/VaultSearchAgentSDK.ts`

In `startSession()` catch block: catch `MaxTurnsError`, emit `complete` event with partial results instead of error event. User sees "Analysis reached maximum depth, showing partial results."

---

## Wave B: Chat Message UI (RC8 + RC9 + RC14)

### Changes: `src/service/chat/types.ts`

Add field to `ChatMessage`:
```ts
isMarkdownContent?: boolean;  // true for AI Analysis imports
```

### Changes: `src/ui/view/chat-view/components/messages/MessageViewItem.tsx`

**RC14** — Add `!message.isErrorMessage` guard to MessageStyleButtons render condition (line ~358). For error messages containing "profile" or "configured", show an "Open Settings" button instead.

**RC8** — Wire `onStyleSelect` to actual chat submission:
- Add `onSubmitMessage?: (text: string) => void` prop
- `handleStyleSelect` calls `onSubmitMessage(prompt)` which triggers `useChatSubmit.handleSubmit`
- Passed from `MessagesViewComponent` via `view-Messages.tsx`

**RC9** — Markdown rendering for user messages with `isMarkdownContent`:
```tsx
isUser && !message.isMarkdownContent ? (
    <div className="pktw-select-text">{displayText}</div>
) : (
    <StreamdownIsolated ...>{displayText}</StreamdownIsolated>
)
```

### Changes: `src/ui/view/chat-view/components/messages/MessageActionsList.tsx`

**RC14** — Add `!message.isErrorMessage` to Regenerate button condition (line ~126).

### Changes: `src/service/chat/service-manager.ts`

In `createConvFromSearchAIAnalysis()`: set `isMarkdownContent: true` on the injected user message.

---

## Wave C: AI Analysis List (RC5 + RC15)

### Changes: `src/core/storage/sqlite/repositories/AIAnalysisRepo.ts`

New methods:
- `search(query: string, limit: number, offset: number)` — `WHERE query LIKE ? OR title LIKE ?`
- `searchCount(query: string)` — count for pagination

### Changes: `src/service/search/AIAnalysisHistoryService.ts` (or equivalent)

Expose `search(query, params)` delegating to repo.

### Changes: `src/ui/view/quick-search/components/RecentAnalysisList.tsx`

- New prop `filterQuery?: string`
- When `filterQuery` non-empty → call `svc.search(filterQuery, ...)` instead of `svc.list(...)`
- Default page size: 20 (was unlimited)
- Filter out records where both `query` and `title` are null
- Add `content-visibility: auto` on list items for lightweight virtualization

### Changes: `src/ui/view/quick-search/SearchModal.tsx`

Change behavior: typing filters the recent list; Enter/button starts analysis:
- Remove the `!searchQuery` condition from idle block (line ~340)
- Pass `searchQuery` as `filterQuery` to `RecentAnalysisList`
- Enter key triggers `startAnalysis()`, not list filter

---

## Wave D: Copilot System (RC3 + RC6 + RC7)

### RC6: Tag Suggestion wiring

**`copilot-schemas.ts`** — Add `tagSuggestionsSchema` and `TagSuggestions` type export.

**`copilot-commands.ts`** — Add 5th command `peak-copilot-suggest-tags`.

**`CopilotResultModal.tsx`** — Add `'suggest-tags'` → `TagSuggestionPanel` route in the switch.

### RC3: Copilot streaming

**`service-manager.ts`** — New method `queryTextStream()`:
```ts
async *queryTextStream(promptId, variables): AsyncGenerator<
  {type: 'delta', text: string} | {type: 'done', fullText: string}
>
```
Iterates `queryWithProfile` messages, yields text deltas. Uses Wave A error detection on `result` messages.

**`copilot-commands.ts`** — All commands refactored:
- Open `CopilotResultModal` immediately (loading state)
- Polish: stream via `queryTextStream`, call `modal.updateProgress(text)` per chunk
- Review/Links/Split/Tags: async `queryStructured` call, then `modal.setResult(data)`
- Catch block: `modal.setError(e)` with typed error handling

**`CopilotResultModal.tsx`** — Support three-phase lifecycle:
```ts
type ModalPhase = 'loading' | 'result' | 'error'
```
- `loading`: file name + action + timer + spinner + streaming text preview (Polish)
- `result`: delegate to panel (PolishPanel / ReviewPanel / etc.)
- `error`: friendly message + Retry button + "Open Settings" for AuthenticationError
- New methods: `setResult(data)`, `setError(error)`, `updateProgress(text)`

Constructor accepts optional `result` — if absent, starts in `loading` phase.

### RC7: Copilot Picker Modal

**New file:** `src/ui/view/copilot/CopilotPickerModal.tsx`

Obsidian Modal shell (same pattern as QuickSearchModal). React content:

- Header: "Copilot" + current file name (or "No file open")
- 5 command cards in responsive grid (3+2 or 5×1):
  - Suggest Tags (Tag icon)
  - Suggest Links (Link2 icon)
  - Suggest Split (Scissors icon)
  - Review Article (MessageSquareText icon)
  - Polish Document (Sparkles icon)
- Each card: icon + name + one-line description
- Keyboard nav: ↑↓←→ + Enter
- Click card → `getContext()` check → transition to CopilotResultModal loading state (reuse same modalEl)
- No active file → disabled cards with "Open a document first" message

**`Register.ts`** — New command `peak-copilot-open`, name "Open Copilot Panel".

---

## Wave E: Settings & Visual Polish (RC4 + RC11 + RC12)

### Changes: `src/styles/tailwind.css`

Remove `background-color: var(--background-secondary)` from `.peak-settings-tab-item.is-active` — only keep the accent underline.

### Changes: `src/ui/view/settings/components/AddProfileGrid.tsx`

Add hover effect to provider cards:
```tsx
hover:pktw-shadow-md hover:pktw-border-[var(--interactive-accent)] 
pktw-transition-all pktw-duration-200 pktw-cursor-pointer
```

### Changes: `src/ui/view/settings/ProfilesTab.tsx`

- Add description text to Advanced fields (Temperature, Top P, etc.) — reuse strings from `OutputControlSettingsList/constants.tsx`
- Remove the redundant second "Power-user settings live in peak-config.json" banner (keep only the collapsed-state one)

### Changes: `src/ui/component/mine/codemirror-input.tsx`

Fix forwardRef type to include `select`:
```tsx
React.forwardRef<{ focus: () => void; select: () => void }, ...>
```

### Changes: `src/ui/view/quick-search/SearchModal.tsx` (RC11)

Add defensive calls: `inputRef.current?.select?.()`

### Changes: `src/ui/view/settings/SearchTab.tsx`

Remove "Local Chromium" option from Web search method (if present in current build).

### Changes: `src/ui/component/prompt-input/PromptInputSearchButton.tsx`

Remove `'local'` from the search method union type and dropdown options.

---

## Wave F: Model & Profile System (RC1 + RC10)

### Changes: `src/core/profiles/types.ts`

New type:
```ts
export interface RoleConfig {
  profileId: string;
  modelId: string;
}
```

`ProfileSettings` fields change:
- `activeAgentProfileId: string | null` → `activeAgentConfig: RoleConfig | null`
- `activeEmbeddingProfileId: string | null` → `activeEmbeddingConfig: RoleConfig | null`
- `activeWebSearchProfileId: string | null` → `activeWebSearchConfig: RoleConfig | null`

### Changes: `src/core/profiles/ProfileRegistry.ts`

- Private fields → `RoleConfig | null`
- `setActiveAgentProfile(id)` → `setActiveAgentConfig(config: RoleConfig | null)`
- `getActiveAgentProfile()` → returns `{ profile: Profile, modelId: string } | null`
- Backward-compatible migration in `load()`: detect old string format → convert to `{ profileId: oldValue, modelId: profile.primaryModel }`
- Update all consumers: StatusBar, ProfilesTab, ReportOrchestrator, OnboardingModal, sdkAgentPool, service-manager, etc.

### Changes: `src/ui/view/settings/components/ProfileCard.tsx`

`RoleToggle` → `RoleSelector`:
- Toggle on → expand model dropdown (populated from profile's available models)
- Toggle off → collapse dropdown, clear config
- Selected model shown inline in the toggle button

### Changes: `src/ui/view/chat-view/components/MessageRoleAvatar.tsx`

Assistant avatar: `ProviderBrandIcon` based on `message.provider` (already stored on ChatMessage). Hover tooltip shows `provider/model`.

### Changes: `src/ui/store/chatViewStore.ts` + `src/ui/view/chat-view/hooks/useChatSession.ts`

Auto-select model for new/pending conversations:
- On pending conversation, read `ProfileRegistry.getActiveAgentConfig()`
- Set `selectedModel` to `{ provider: config.profile.kind, modelId: config.modelId }`

### Changes: `src/ui/view/chat-view/components/ChatInputArea.tsx`

Placeholder: `"Auto (claude-opus-4-6)"` when auto-selected, `"No profile configured"` when no profile.

### Changes: `src/ui/component/mine/ModelSelector.tsx`

Show "Auto" label with auto-selected model name when no manual override.

---

## Wave G: Quick Actions & Outline (RC4 cont.)

### Changes: `src/ui/view/chat-view/view-Messages.tsx`

- Import `useChatSubmit`
- Wire suggestion actions to actual chat submission:
  - Summarize → `handleSubmit('Summarize this conversation concisely.')`
  - Search vault → `handleSubmit('Search the vault for information related to this conversation.')`
  - Explain further → `handleSubmit('Explain the last response in more detail.')`
- Only show when conversation has messages

### Changes: `src/ui/view/chat-view/components/ConversationOutline.tsx`

Strip markdown from content preview:
```ts
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\[\[(.*?)\]\]/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}
```

Apply before `.slice(0, 100)`.

---

## Testing Strategy

Each wave should verify:
1. Build passes (`npm run build`)
2. Manual smoke test in Obsidian DevTools
3. Console error-free for the affected flows

Wave-specific verification:
- **A**: Trigger auth error → see friendly message; trigger max turns → see partial results
- **B**: Send message → style buttons work; import AI Analysis → markdown renders; error message → no regenerate
- **C**: Open AI Analysis with 800+ records → no crash; type to filter history; Enter to start new analysis
- **D**: Open Copilot modal → select command → see loading → see result; Suggest Tags works end-to-end
- **E**: All settings tabs same background; hover on provider cards; no .select() TypeError
- **F**: New conversation → auto-selects model; toggle role → select specific model; avatar shows provider icon
- **G**: Click "Summarize" → sends message; outline shows clean text without ##
