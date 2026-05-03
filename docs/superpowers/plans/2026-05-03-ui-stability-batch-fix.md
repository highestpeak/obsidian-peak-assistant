# UI Stability & Completeness Batch Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 15 root causes identified in the UI annotation review — error handling, chat message UI, AI analysis list, copilot system, settings polish, profile-role-model redesign, and quick actions.

**Architecture:** 7 parallel waves with one dependency (Wave D depends on Wave A error types). Each wave touches independent files. Phase 1 runs Waves A/B/C/E/F/G in parallel. Phase 2 runs Wave D.

**Tech Stack:** React 18, Zustand, Obsidian API, Kysely (SQLite), Claude Agent SDK, Zod

**Spec:** `docs/superpowers/specs/2026-05-03-ui-stability-batch-fix-design.md`

---

## Wave A: Error Handling Foundation (RC2 + RC13)

### Task 1: Create typed error classes

**Files:**
- Create: `src/core/errors/llm-errors.ts`

- [ ] **Step 1: Create error classes file**

```ts
// src/core/errors/llm-errors.ts

export class AuthenticationError extends Error {
    constructor(message: string, public readonly provider?: string) {
        super(message);
        this.name = 'AuthenticationError';
    }
}

export class LLMResponseError extends Error {
    constructor(message: string, public readonly rawResponse?: string) {
        super(message);
        this.name = 'LLMResponseError';
    }
}

export class MaxTurnsError extends Error {
    constructor(message: string, public readonly partialText?: string) {
        super(message);
        this.name = 'MaxTurnsError';
    }
}

/**
 * Detect common error patterns in SDK result messages and throw typed errors.
 * Call this when `msg.is_error` is true on a `result` message.
 */
export function throwTypedError(errorText: string, partialText?: string): never {
    const lower = errorText.toLowerCase();
    if (lower.includes('authentication') || lower.includes('invalid bearer') || lower.includes('401')) {
        throw new AuthenticationError(
            'API key is invalid or expired. Please update your credentials in Settings → Profiles.',
        );
    }
    if (lower.includes('maximum number of turns')) {
        throw new MaxTurnsError(
            'Analysis reached maximum depth. Partial results may be available.',
            partialText,
        );
    }
    throw new LLMResponseError(errorText);
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds (new file is not imported yet)

- [ ] **Step 3: Commit**

```bash
git add src/core/errors/llm-errors.ts
git commit -m "feat(errors): add typed LLM error classes — AuthenticationError, LLMResponseError, MaxTurnsError"
```

### Task 2: Harden collectText and collectJson

**Files:**
- Modify: `src/service/agents/core/sdkMessageAdapter.ts:71-126`

- [ ] **Step 1: Add import**

At top of `sdkMessageAdapter.ts`, add:
```ts
import { throwTypedError, LLMResponseError } from '@/core/errors/llm-errors';
```

- [ ] **Step 2: Rewrite collectText to detect error results**

Replace lines 71–104 with:
```ts
export async function collectText(
    messages: AsyncIterable<SDKMessage>,
): Promise<string> {
    let text = '';
    let errorResult: string | null = null;

    for await (const raw of messages) {
        const msg = raw as { type?: string; is_error?: boolean; result?: string; message?: { content?: Array<{ type: string; text?: string }> }; event?: any };

        if (msg.type === 'result' && msg.is_error) {
            errorResult = typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result);
            continue;
        }

        if (msg.type === 'stream_event') {
            const event = msg.event;
            if (
                event?.type === 'content_block_delta' &&
                event?.delta?.type === 'text_delta' &&
                typeof event?.delta?.text === 'string'
            ) {
                text += event.delta.text;
            }
        } else if (msg.type === 'assistant') {
            const blocks = msg.message?.content ?? [];
            for (const block of blocks) {
                if (block.type === 'text' && typeof block.text === 'string') {
                    if (text.length === 0) {
                        text += block.text;
                    }
                }
            }
        }
    }

    if (errorResult) {
        throwTypedError(errorResult, text || undefined);
    }

    return text;
}
```

- [ ] **Step 3: Rewrite collectJson with defensive parsing**

Replace lines 114–126 with:
```ts
export async function collectJson<T>(
    messages: AsyncIterable<SDKMessage>,
): Promise<T> {
    const raw = await collectText(messages);

    // Strip optional markdown code fences
    const stripped = raw
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();

    if (!stripped) {
        throw new LLMResponseError('Model returned empty response where JSON was expected.');
    }

    try {
        return JSON.parse(stripped) as T;
    } catch (parseError) {
        // Detect natural language response (starts with letter, not JSON)
        const firstChar = stripped[0];
        if (firstChar !== '{' && firstChar !== '[' && /^[A-Za-z"']/.test(stripped)) {
            throw new LLMResponseError(
                `Model returned text instead of JSON: "${stripped.slice(0, 120)}..."`,
                stripped,
            );
        }
        throw new LLMResponseError(
            `Failed to parse model response as JSON: ${(parseError as Error).message}`,
            stripped,
        );
    }
}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/service/agents/core/sdkMessageAdapter.ts
git commit -m "fix(sdk): harden collectText/collectJson with typed error detection and defensive JSON parsing"
```

### Task 3: VaultSearchAgentSDK graceful max-turns handling

**Files:**
- Modify: `src/service/agents/VaultSearchAgentSDK.ts:315-322`

- [ ] **Step 1: Add import**

At top of `VaultSearchAgentSDK.ts`, add:
```ts
import { MaxTurnsError } from '@/core/errors/llm-errors';
```

- [ ] **Step 2: Update main catch block**

Replace lines 315–322 with:
```ts
    } catch (err) {
        if (err instanceof MaxTurnsError) {
            console.warn('[VaultSearchAgentSDK] max turns reached, emitting partial results');
            yield {
                type: 'complete',
                finishReason: 'stop',
                triggerName,
            } as LLMStreamEvent;
            return;
        }
        console.error('[VaultSearchAgentSDK] query error', err);
        yield {
            type: 'error',
            error: err as Error,
            triggerName,
        } as LLMStreamEvent;
        return;
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/service/agents/VaultSearchAgentSDK.ts
git commit -m "fix(agent): handle MaxTurnsError gracefully — emit partial results instead of error"
```

---

## Wave B: Chat Message UI (RC8 + RC9 + RC14)

### Task 4: Add isMarkdownContent to ChatMessage type

**Files:**
- Modify: `src/service/chat/types.ts:38`

- [ ] **Step 1: Add field after isErrorMessage**

After line 38 (`isErrorMessage?: boolean;`), add:
```ts
    /** When true, render this user message with markdown (e.g. AI Analysis imports) */
    isMarkdownContent?: boolean;
```

- [ ] **Step 2: Set isMarkdownContent in createConvFromSearchAIAnalysis**

In `src/service/chat/service-manager.ts`, find the `createChatMessage` call at line 376–382. After the call, add:
```ts
    initialMessage.isMarkdownContent = true;
```

- [ ] **Step 3: Verify build and commit**

```bash
npm run build
git add src/service/chat/types.ts src/service/chat/service-manager.ts
git commit -m "feat(chat): add isMarkdownContent field to ChatMessage for AI Analysis imports"
```

### Task 5: Fix error message UI — suppress Regenerate + StyleButtons

**Files:**
- Modify: `src/ui/view/chat-view/components/messages/MessageActionsList.tsx:126`
- Modify: `src/ui/view/chat-view/components/messages/MessageViewItem.tsx:357-363`

- [ ] **Step 1: Guard Regenerate button with isErrorMessage check**

In `MessageActionsList.tsx`, replace line 126:
```tsx
{isLastMessage && (
```
with:
```tsx
{isLastMessage && !message.isErrorMessage && (
```

- [ ] **Step 2: Guard MessageStyleButtons and add error action**

In `MessageViewItem.tsx`, replace lines 357–363:
```tsx
{/* Style switch buttons — only for completed assistant messages */}
{message.role === 'assistant' && !streamingState.isStreaming && (
    <MessageStyleButtons onStyleSelect={(prompt) => {
        // Placeholder — style prompt wiring will be added when chat input supports it.
        console.log('Style selected:', prompt);
    }} />
)}
```
with:
```tsx
{/* Style switch buttons — only for completed non-error assistant messages */}
{message.role === 'assistant' && !streamingState.isStreaming && !message.isErrorMessage && (
    <MessageStyleButtons onStyleSelect={(prompt) => {
        const store = useChatDataStore.getState();
        const conv = store.activeConversation;
        if (!conv) return;
        const submitAction = useChatViewStore.getState().submitAction;
        if (submitAction) submitAction(prompt);
    }} />
)}
{/* Error messages: show "Open Settings" when profile-related */}
{message.role === 'assistant' && message.isErrorMessage && 
 (message.content.includes('profile') || message.content.includes('configured') || message.content.includes('credentials')) && (
    <span
        className="pktw-text-xs pktw-text-accent pktw-cursor-pointer hover:pktw-underline pktw-mt-1"
        onClick={() => {
            const { SettingsModal } = require('@/ui/view/SettingsModal');
            new SettingsModal(AppContext.getInstance()).open();
        }}
    >
        Open Settings
    </span>
)}
```

- [ ] **Step 3: Add submitAction to chatViewStore**

In `src/ui/view/chat-view/store/chatViewStore.ts`, add to the state interface (near line 50):
```ts
    submitAction: ((text: string) => void) | null;
```

Add to `INITIAL_SESSION` (near line 140):
```ts
    submitAction: null,
```

Add setter action (near line 273):
```ts
    setSubmitAction: (fn: ((text: string) => void) | null) => set({ submitAction: fn }),
```

- [ ] **Step 4: Wire submitAction from ChatInputArea**

In `src/ui/view/chat-view/components/ChatInputArea.tsx`, after `useChatSubmit()` is called, register the submit action:
```ts
// After the useChatSubmit hook call, add:
useEffect(() => {
    const action = (text: string) => {
        const conv = useChatDataStore.getState().activeConversation;
        const project = useChatDataStore.getState().activeProject;
        if (conv) {
            void submitMessage({ text, files: [], conversation: conv, project });
        }
    };
    useChatViewStore.getState().setSubmitAction(action);
    return () => useChatViewStore.getState().setSubmitAction(null);
}, [submitMessage]);
```

- [ ] **Step 5: Add missing imports in MessageViewItem.tsx**

Add at top of `MessageViewItem.tsx`:
```ts
import { useChatViewStore } from '../../store/chatViewStore';
import { AppContext } from '@/app/context/AppContext';
```

- [ ] **Step 6: Render user markdown messages with Streamdown**

In `MessageViewItem.tsx`, find the user message render branch (around line 299–304). Replace the condition:
```tsx
isUser ? (
    <div className="pktw-select-text">
        {displayText}
    </div>
) : (
```
with:
```tsx
isUser && !message.isMarkdownContent ? (
    <div className="pktw-select-text">
        {displayText}
    </div>
) : (
```

This makes `isMarkdownContent` user messages fall through to the `StreamdownIsolated` branch.

- [ ] **Step 7: Verify build and commit**

```bash
npm run build
git add src/ui/view/chat-view/components/messages/MessageActionsList.tsx \
       src/ui/view/chat-view/components/messages/MessageViewItem.tsx \
       src/ui/view/chat-view/store/chatViewStore.ts \
       src/ui/view/chat-view/components/ChatInputArea.tsx
git commit -m "fix(chat): suppress Regenerate/Style on errors, wire style buttons, render markdown user messages"
```

---

## Wave C: AI Analysis List (RC5 + RC15)

### Task 6: Add search method to AIAnalysisRepo

**Files:**
- Modify: `src/core/storage/sqlite/repositories/AIAnalysisRepo.ts:37`

- [ ] **Step 1: Add search and searchCount methods**

After the `list()` method (after line 37), add:
```ts
    async search(query: string, params: { limit: number; offset: number }): Promise<DbSchema['ai_analysis_record'][]> {
        const limit = Math.max(1, Math.min(200, params.limit || 20));
        const offset = Math.max(0, params.offset || 0);
        const pattern = `%${query}%`;
        return this.db
            .selectFrom('ai_analysis_record')
            .selectAll()
            .where((eb) => eb.or([
                eb('query', 'like', pattern),
                eb('title', 'like', pattern),
            ]))
            .orderBy('created_at_ts', 'desc')
            .limit(limit)
            .offset(offset)
            .execute();
    }

    async searchCount(query: string): Promise<number> {
        const pattern = `%${query}%`;
        const row = await this.db
            .selectFrom('ai_analysis_record')
            .select((eb) => eb.fn.countAll<number>().as('cnt'))
            .where((eb) => eb.or([
                eb('query', 'like', pattern),
                eb('title', 'like', pattern),
            ]))
            .executeTakeFirstOrThrow();
        return Number((row as any).cnt);
    }
```

- [ ] **Step 2: Add search to AIAnalysisHistoryService**

In `src/service/AIAnalysisHistoryService.ts`, after the `list()` method (after line 18), add:
```ts
    async search(query: string, params: { limit: number; offset: number }): Promise<AIAnalysisHistoryRecord[]> {
        if (!this.dbReady) return [];
        const repo = sqliteStoreManager.getAIAnalysisRepo();
        return repo.search(query, params) as Promise<AIAnalysisHistoryRecord[]>;
    }

    async searchCount(query: string): Promise<number> {
        if (!this.dbReady) return 0;
        const repo = sqliteStoreManager.getAIAnalysisRepo();
        return repo.searchCount(query);
    }
```

- [ ] **Step 3: Verify build and commit**

```bash
npm run build
git add src/core/storage/sqlite/repositories/AIAnalysisRepo.ts src/service/AIAnalysisHistoryService.ts
git commit -m "feat(search): add search/searchCount to AIAnalysisRepo and history service"
```

### Task 7: Add filtering to RecentAnalysisList

**Files:**
- Modify: `src/ui/view/quick-search/components/RecentAnalysisList.tsx:52-103`

- [ ] **Step 1: Add filterQuery prop**

Change props interface (lines 52–56):
```tsx
export interface RecentAnalysisListProps {
    onSelectQuery: (query: string) => void;
    onSelectRecord?: (record: AIAnalysisHistoryRecord) => void;
    limit?: number;
    filterQuery?: string;
}
```

- [ ] **Step 2: Update loadMore to use search when filterQuery is set**

Replace the `loadMore` callback (lines 70–88) with:
```tsx
const loadMore = useCallback(async () => {
    if (loading || doneRef.current) return;
    setLoading(true);
    try {
        const svc = AppContext.getInstance().aiAnalysisHistoryService;
        const hasFilter = !!filterQuery?.trim();
        const [rows, count] = await Promise.all([
            hasFilter
                ? svc.search(filterQuery!.trim(), { limit, offset: offsetRef.current })
                : svc.list({ limit, offset: offsetRef.current }),
            offsetRef.current === 0
                ? (hasFilter ? svc.searchCount(filterQuery!.trim()) : svc.count())
                : Promise.resolve(totalCount),
        ]);
        if (offsetRef.current === 0) setTotalCount(count);
        if (rows.length < limit) doneRef.current = true;
        offsetRef.current += rows.length;
        // Filter out blank records (both query and title null)
        const validRows = rows.filter(r => r.query || r.title);
        setRecords((prev) => [...prev, ...validRows]);
    } catch (e) {
        console.warn('[RecentAnalysisList] load failed:', e);
    } finally {
        setLoading(false);
    }
}, [limit, totalCount, loading, filterQuery]);
```

- [ ] **Step 3: Reset records when filterQuery changes**

Add a `useEffect` after the `loadMore` definition:
```tsx
useEffect(() => {
    setRecords([]);
    offsetRef.current = 0;
    doneRef.current = false;
    void loadMore();
}, [filterQuery]);
```

- [ ] **Step 4: Reduce default limit**

Change the default limit to 20:
```tsx
export function RecentAnalysisList({ onSelectQuery, onSelectRecord, limit = 20, filterQuery }: RecentAnalysisListProps) {
```

- [ ] **Step 5: Add content-visibility for performance**

In the list item rendering, add CSS for virtualization:
```tsx
<div key={record.id ?? idx}
     style={{ contentVisibility: 'auto', containIntrinsicSize: '0 48px' }}>
    <AnalysisRow ... />
</div>
```

- [ ] **Step 6: Verify build and commit**

```bash
npm run build
git add src/ui/view/quick-search/components/RecentAnalysisList.tsx
git commit -m "feat(analysis): add search filtering, blank record filter, and content-visibility to RecentAnalysisList"
```

### Task 8: Connect search filtering in SearchModal

**Files:**
- Modify: `src/ui/view/quick-search/SearchModal.tsx:340-413`

- [ ] **Step 1: Change idle block condition**

Replace the idle block condition at line 340:
```tsx
{!searchQuery && sessionStatus === 'idle' && (
```
with:
```tsx
{sessionStatus === 'idle' && (
```

This keeps the idle landing block (with SuggestionGrid, ActiveSessionsList, RecentAnalysisList) visible even when the user types, until they press Enter.

- [ ] **Step 2: Pass filterQuery to RecentAnalysisList**

At line 368 where `<RecentAnalysisList` is rendered, add the `filterQuery` prop:
```tsx
<RecentAnalysisList
    filterQuery={searchQuery}
    onSelectQuery={...}
    onSelectRecord={...}
/>
```

- [ ] **Step 3: Update the analysis trigger condition**

Change the condition at line ~409 that shows `AISearchTab`:
```tsx
{sessionStatus !== 'idle' && (
```
This way, the analysis view only shows when the session is actively running (not just when the user types).

The Enter key handler in the input should call `startAnalysis()` which sets `sessionStatus` to something other than `'idle'`.

- [ ] **Step 4: Verify build and commit**

```bash
npm run build
git add src/ui/view/quick-search/SearchModal.tsx
git commit -m "feat(search): typing filters recent list, Enter starts new analysis"
```

---

## Wave D: Copilot System (RC3 + RC6 + RC7)

> **Dependency:** Wave A must be complete (imports `throwTypedError` from `llm-errors.ts`)

### Task 9: Wire Tag Suggestion schema and command

**Files:**
- Modify: `src/service/copilot/copilot-schemas.ts:37`
- Modify: `src/app/commands/copilot-commands.ts:10,41`
- Modify: `src/ui/view/copilot/CopilotResultModal.tsx:9,23`

- [ ] **Step 1: Add tagSuggestionsSchema to copilot-schemas.ts**

Append after line 37:
```ts
export const tagSuggestionsSchema = z.object({
    suggestions: z.array(z.object({
        tag: z.string(),
        confidence: z.number(),
        reason: z.string(),
        source: z.enum(['content', 'graph', 'history']),
    })),
    summary: z.string(),
});

export type TagSuggestions = z.infer<typeof tagSuggestionsSchema>;
```

- [ ] **Step 2: Add suggest-tags command to copilot-commands.ts**

Add import at line 10:
```ts
import { reviewResultSchema, linkSuggestionsSchema, splitPlanSchema, tagSuggestionsSchema } from '@/service/copilot/copilot-schemas';
```

Add 5th command in the return array (after the split command, before the closing `];`):
```ts
        {
            id: 'peak-copilot-suggest-tags',
            name: 'Copilot: Suggest Tags',
            callback: async () => {
                const ctx = await getContext();
                if (!ctx) return;
                const ui = openProgressNotice('Analyzing tags...');
                try {
                    const result = await aiManager.queryStructured(
                        PromptId.DocSuggestTags,
                        { content: ctx.input, title: ctx.file.basename },
                        await toJsonSchema(tagSuggestionsSchema),
                    );
                    ui.hide();
                    new CopilotResultModal(ctx.app, {
                        type: 'suggest-tags', result, file: ctx.file, scope: ctx.scope,
                        originalContent: ctx.input,
                    }).open();
                    AppContext.getEventBus().dispatch(new CopilotActionEvent({ action: 'suggest-tags', targetFile: ctx.file.path, resultSummary: `Suggested tags for: ${ctx.file.basename}` }));
                } catch (e) {
                    ui.hide();
                    new Notice(`Tag suggestion failed: ${(e as Error).message}`);
                }
            },
        },
```

- [ ] **Step 3: Add suggest-tags route to CopilotResultModal**

Update `CopilotResultType` at line 9:
```ts
export type CopilotResultType = 'polish' | 'review' | 'suggest-links' | 'split' | 'suggest-tags';
```

Add `TagSuggestions` to the result union in `CopilotResultProps` at line 13:
```ts
import type { ReviewResult, LinkSuggestions, SplitPlan, TagSuggestions } from '@/service/copilot/copilot-schemas';
// ...
result: string | ReviewResult | LinkSuggestions | SplitPlan | TagSuggestions;
```

Add case in the switch (after the `'split'` case, around line 39):
```tsx
      case 'suggest-tags': {
        const { TagSuggestionPanel } = require('./panels/TagSuggestionPanel');
        return <TagSuggestionPanel result={props.result as TagSuggestions} file={props.file} onClose={props.onClose} />;
      }
```

- [ ] **Step 4: Verify build and commit**

```bash
npm run build
git add src/service/copilot/copilot-schemas.ts src/app/commands/copilot-commands.ts src/ui/view/copilot/CopilotResultModal.tsx
git commit -m "feat(copilot): wire Tag Suggestion — schema, command, modal route"
```

### Task 10: Add streaming support to CopilotResultModal

**Files:**
- Modify: `src/ui/view/copilot/CopilotResultModal.tsx`

- [ ] **Step 1: Refactor CopilotResultModal to support loading/error/result phases**

Replace the entire file content:
```tsx
import { Modal, type App, type TFile } from 'obsidian';
import React, { useState, useEffect } from 'react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import type { ReviewResult, LinkSuggestions, SplitPlan, TagSuggestions } from '@/service/copilot/copilot-schemas';
import { AuthenticationError } from '@/core/errors/llm-errors';
import { Loader2, AlertTriangle, Settings2 } from 'lucide-react';
import { Button } from '@/ui/component/ui/button';
import { StreamdownIsolated } from '@/ui/component/mine/StreamdownIsolated';

export type CopilotResultType = 'polish' | 'review' | 'suggest-links' | 'split' | 'suggest-tags';

export interface CopilotResultProps {
    type: CopilotResultType;
    result?: string | ReviewResult | LinkSuggestions | SplitPlan | TagSuggestions;
    file: TFile;
    scope: 'full' | 'selection';
    originalContent: string;
    selectedText?: string;
    onClose: () => void;
}

type ModalPhase =
    | { phase: 'loading'; progressText?: string; startTime: number }
    | { phase: 'result'; data: any }
    | { phase: 'error'; error: Error };

const ACTION_LABELS: Record<CopilotResultType, string> = {
    'polish': 'Polishing document',
    'review': 'Reviewing article',
    'suggest-links': 'Analyzing links',
    'split': 'Analyzing structure',
    'suggest-tags': 'Suggesting tags',
};

const LoadingView: React.FC<{ type: CopilotResultType; startTime: number; progressText?: string }> = ({ type, startTime, progressText }) => {
    const [elapsed, setElapsed] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
        return () => clearInterval(timer);
    }, [startTime]);
    return (
        <div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-4 pktw-py-12">
            <Loader2 className="pktw-w-8 pktw-h-8 pktw-animate-spin pktw-text-accent" />
            <span className="pktw-text-sm pktw-font-medium">{ACTION_LABELS[type]}...</span>
            <span className="pktw-text-xs pktw-text-muted-foreground">{elapsed}s</span>
            {progressText && (
                <div className="pktw-w-full pktw-max-h-[200px] pktw-overflow-y-auto pktw-mt-4 pktw-px-4">
                    <StreamdownIsolated isAnimating>{progressText}</StreamdownIsolated>
                </div>
            )}
        </div>
    );
};

const ErrorView: React.FC<{ error: Error; onRetry?: () => void; onClose: () => void }> = ({ error, onRetry, onClose }) => {
    const isAuth = error instanceof AuthenticationError;
    return (
        <div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-4 pktw-py-12">
            <AlertTriangle className="pktw-w-8 pktw-h-8 pktw-text-destructive" />
            <span className="pktw-text-sm pktw-font-medium">Something went wrong</span>
            <span className="pktw-text-xs pktw-text-muted-foreground pktw-text-center pktw-max-w-md">{error.message}</span>
            <div className="pktw-flex pktw-gap-2 pktw-mt-2">
                {isAuth && (
                    <Button variant="outline" size="sm" onClick={() => {
                        const { SettingsModal } = require('@/ui/view/SettingsModal');
                        new SettingsModal(AppContext.getInstance()).open();
                    }}>
                        <Settings2 className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1.5" />
                        Open Settings
                    </Button>
                )}
                {onRetry && <Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>}
                <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
            </div>
        </div>
    );
};

const CopilotResultContent: React.FC<CopilotResultProps & { initialPhase: ModalPhase }> = (props) => {
    const [phase, setPhase] = useState<ModalPhase>(props.initialPhase);

    // Expose setters via a ref on the modal instance
    useEffect(() => {
        const modal = (window as any).__peakCopilotModalBridge;
        if (modal) {
            modal._setPhase = setPhase;
        }
    }, []);

    if (phase.phase === 'loading') {
        return <LoadingView type={props.type} startTime={phase.startTime} progressText={phase.progressText} />;
    }
    if (phase.phase === 'error') {
        return <ErrorView error={phase.error} onClose={props.onClose} />;
    }

    const { type } = props;
    const result = phase.data;
    switch (type) {
        case 'polish': {
            const { PolishPanel } = require('./panels/PolishPanel');
            return <PolishPanel {...props} result={result as string} />;
        }
        case 'review': {
            const { ReviewPanel } = require('./panels/ReviewPanel');
            return <ReviewPanel {...props} result={result as ReviewResult} />;
        }
        case 'suggest-links': {
            const { LinkSuggestPanel } = require('./panels/LinkSuggestPanel');
            return <LinkSuggestPanel {...props} result={result as LinkSuggestions} />;
        }
        case 'split': {
            const { SplitPanel } = require('./panels/SplitPanel');
            return <SplitPanel {...props} result={result as SplitPlan} />;
        }
        case 'suggest-tags': {
            const { TagSuggestionPanel } = require('./panels/TagSuggestionPanel');
            return <TagSuggestionPanel result={result as TagSuggestions} file={props.file} onClose={props.onClose} />;
        }
    }
};

export class CopilotResultModal extends Modal {
    private reactRenderer: ReactRenderer | null = null;
    private _setPhase: ((phase: ModalPhase) => void) | null = null;

    constructor(
        app: App,
        private props: Omit<CopilotResultProps, 'onClose'>,
    ) {
        super(app);
    }

    onOpen(): void {
        this.contentEl.empty();
        this.modalEl.addClass('peak-copilot-modal');
        this.contentEl.addClass('pktw-root');
        this.modalEl.style.width = '720px';
        this.modalEl.style.maxWidth = '90vw';

        const initialPhase: ModalPhase = this.props.result != null
            ? { phase: 'result', data: this.props.result }
            : { phase: 'loading', startTime: Date.now() };

        // Bridge for imperative updates
        (window as any).__peakCopilotModalBridge = this;

        const appContext = AppContext.getInstance();
        this.reactRenderer = new ReactRenderer(this.containerEl);
        this.reactRenderer.render(
            createReactElementWithServices(
                CopilotResultContent,
                { ...this.props, onClose: () => this.close(), initialPhase },
                appContext,
            ),
        );
    }

    setResult(data: any): void {
        this._setPhase?.({ phase: 'result', data });
    }

    setError(error: Error): void {
        this._setPhase?.({ phase: 'error', error });
    }

    updateProgress(text: string): void {
        this._setPhase?.({ phase: 'loading', progressText: text, startTime: Date.now() });
    }

    onClose(): void {
        delete (window as any).__peakCopilotModalBridge;
        const r = this.reactRenderer;
        this.reactRenderer = null;
        if (r) setTimeout(() => { r.unmount(); this.contentEl.empty(); }, 0);
        else this.contentEl.empty();
    }
}
```

- [ ] **Step 2: Verify build and commit**

```bash
npm run build
git add src/ui/view/copilot/CopilotResultModal.tsx
git commit -m "feat(copilot): refactor CopilotResultModal with loading/error/result phases"
```

### Task 11: Refactor copilot commands to open modal first, then async LLM

**Files:**
- Modify: `src/app/commands/copilot-commands.ts`
- Modify: `src/service/chat/service-manager.ts` (add queryTextStream)

- [ ] **Step 1: Add queryTextStream to service-manager.ts**

After `queryText` method (after line 803), add:
```ts
    async *queryTextStream(
        promptOrText: string,
        variables?: Record<string, unknown>,
        opts?: { systemPrompt?: string; signal?: AbortSignal },
    ): AsyncGenerator<{ type: 'delta'; text: string } | { type: 'done'; fullText: string }> {
        const profile = this.requireActiveProfile();
        const { userPrompt, systemPrompt } = await this.resolvePromptPair(
            promptOrText,
            variables,
            opts?.systemPrompt,
        );

        const messages = queryWithProfile(this.app, this.getPluginId(), profile, {
            prompt: userPrompt,
            systemPrompt,
            maxTurns: 1,
            signal: opts?.signal,
        });

        let fullText = '';
        for await (const raw of messages) {
            const msg = raw as any;
            if (msg.type === 'result' && msg.is_error) {
                const { throwTypedError } = await import('@/core/errors/llm-errors');
                throwTypedError(typeof msg.result === 'string' ? msg.result : JSON.stringify(msg.result), fullText || undefined);
            }
            if (msg.type === 'stream_event') {
                const event = msg.event;
                if (event?.type === 'content_block_delta' && event?.delta?.type === 'text_delta' && typeof event?.delta?.text === 'string') {
                    fullText += event.delta.text;
                    yield { type: 'delta', text: event.delta.text };
                }
            } else if (msg.type === 'assistant') {
                const blocks = msg.message?.content ?? [];
                for (const block of blocks) {
                    if (block.type === 'text' && typeof block.text === 'string' && fullText.length === 0) {
                        fullText += block.text;
                        yield { type: 'delta', text: block.text };
                    }
                }
            }
        }
        yield { type: 'done', fullText };
    }
```

- [ ] **Step 2: Refactor copilot-commands to open modal immediately**

Replace all 5 command callbacks. Example for Polish (streaming):
```ts
            callback: async () => {
                const ctx = await getContext();
                if (!ctx) return;
                const modal = new CopilotResultModal(ctx.app, {
                    type: 'polish', file: ctx.file, scope: ctx.scope,
                    originalContent: ctx.input, selectedText: ctx.selected,
                });
                modal.open();
                try {
                    let fullText = '';
                    for await (const chunk of aiManager.queryTextStream(PromptId.DocPolish, {
                        content: ctx.input, title: ctx.file.basename, scope: ctx.scope,
                    })) {
                        if (chunk.type === 'delta') {
                            fullText += chunk.text;
                            modal.updateProgress(fullText);
                        }
                    }
                    modal.setResult(fullText);
                    AppContext.getEventBus().dispatch(new CopilotActionEvent({ action: 'polish', targetFile: ctx.file.path, resultSummary: `Polished: ${ctx.file.basename}` }));
                } catch (e) {
                    modal.setError(e as Error);
                }
            },
```

For structured commands (Review, Links, Split, Tags), use the non-streaming pattern:
```ts
            callback: async () => {
                const ctx = await getContext();
                if (!ctx) return;
                const modal = new CopilotResultModal(ctx.app, {
                    type: 'review', file: ctx.file, scope: ctx.scope,
                    originalContent: ctx.input, selectedText: ctx.selected,
                });
                modal.open();
                try {
                    const result = await aiManager.queryStructured(
                        PromptId.DocReview,
                        { content: ctx.input, title: ctx.file.basename, scope: ctx.scope },
                        await toJsonSchema(reviewResultSchema),
                    );
                    modal.setResult(result);
                    AppContext.getEventBus().dispatch(new CopilotActionEvent({ action: 'review', targetFile: ctx.file.path, resultSummary: `Reviewed: ${ctx.file.basename}` }));
                } catch (e) {
                    modal.setError(e as Error);
                }
            },
```

Remove `openProgressNotice` usage — the modal itself now shows progress. Remove the `openProgressNotice` function entirely.

- [ ] **Step 3: Verify build and commit**

```bash
npm run build
git add src/service/chat/service-manager.ts src/app/commands/copilot-commands.ts
git commit -m "feat(copilot): streaming Polish, async-first modal for all commands"
```

### Task 12: Create CopilotPickerModal

**Files:**
- Create: `src/ui/view/copilot/CopilotPickerModal.tsx`
- Modify: `src/app/commands/Register.ts:739`

- [ ] **Step 1: Create CopilotPickerModal**

```tsx
// src/ui/view/copilot/CopilotPickerModal.tsx
import { Modal } from 'obsidian';
import React, { useState, useCallback, useEffect } from 'react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { Tag, Link2, Scissors, MessageSquareText, Sparkles } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';

interface CopilotAction {
    id: string;
    icon: React.ReactNode;
    label: string;
    description: string;
}

const ACTIONS: CopilotAction[] = [
    { id: 'peak-copilot-suggest-tags', icon: <Tag size={20} />, label: 'Suggest Tags', description: 'Analyze content and suggest relevant tags' },
    { id: 'peak-copilot-suggest-links', icon: <Link2 size={20} />, label: 'Suggest Links', description: 'Find potential wiki-link connections' },
    { id: 'peak-copilot-split', icon: <Scissors size={20} />, label: 'Suggest Split', description: 'Propose how to split a long document' },
    { id: 'peak-copilot-review', icon: <MessageSquareText size={20} />, label: 'Review Article', description: 'Get structural and content feedback' },
    { id: 'peak-copilot-polish', icon: <Sparkles size={20} />, label: 'Polish Document', description: 'Improve clarity and style' },
];

const CopilotPickerContent: React.FC<{ onSelect: (id: string) => void; fileName: string | null }> = ({ onSelect, fileName }) => {
    const [selected, setSelected] = useState(0);

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); setSelected(i => (i + 1) % ACTIONS.length); }
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); setSelected(i => (i - 1 + ACTIONS.length) % ACTIONS.length); }
        else if (e.key === 'Enter') { e.preventDefault(); onSelect(ACTIONS[selected].id); }
    }, [selected, onSelect]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return (
        <div className="pktw-p-4">
            <div className="pktw-flex pktw-justify-between pktw-items-center pktw-mb-4">
                <span className="pktw-text-sm pktw-font-semibold">Copilot</span>
                {fileName && <span className="pktw-text-xs pktw-text-muted-foreground pktw-font-mono">{fileName}</span>}
            </div>
            {!fileName && (
                <div className="pktw-text-xs pktw-text-muted-foreground pktw-text-center pktw-py-8">
                    Open a document first
                </div>
            )}
            {fileName && (
                <div className="pktw-grid pktw-grid-cols-3 pktw-gap-2">
                    {ACTIONS.map((action, idx) => (
                        <div
                            key={action.id}
                            className={cn(
                                'pktw-flex pktw-flex-col pktw-items-center pktw-gap-2 pktw-p-4 pktw-rounded-lg pktw-border pktw-cursor-pointer pktw-transition-all',
                                idx === selected
                                    ? 'pktw-border-accent pktw-bg-accent/10 pktw-shadow-sm'
                                    : 'pktw-border-border hover:pktw-border-accent/50 hover:pktw-shadow-sm',
                            )}
                            onClick={() => onSelect(action.id)}
                            onMouseEnter={() => setSelected(idx)}
                        >
                            <span className="pktw-text-accent">{action.icon}</span>
                            <span className="pktw-text-xs pktw-font-medium">{action.label}</span>
                            <span className="pktw-text-[10px] pktw-text-muted-foreground pktw-text-center pktw-leading-tight">{action.description}</span>
                        </div>
                    ))}
                </div>
            )}
            <div className="pktw-flex pktw-gap-3 pktw-justify-center pktw-mt-4 pktw-text-[10px] pktw-text-muted-foreground">
                <span>↑↓←→ navigate</span>
                <span>↵ select</span>
            </div>
        </div>
    );
};

export class CopilotPickerModal extends Modal {
    private reactRenderer: ReactRenderer | null = null;

    constructor(private appContext: AppContext) {
        super(appContext.app);
    }

    onOpen(): void {
        this.contentEl.empty();
        this.modalEl.addClass('peak-copilot-picker-modal');
        this.contentEl.addClass('pktw-root');
        this.modalEl.style.width = '520px';
        this.modalEl.style.maxWidth = '90vw';

        const file = this.appContext.app.workspace.getActiveFile();

        this.reactRenderer = new ReactRenderer(this.containerEl);
        this.reactRenderer.render(
            createReactElementWithServices(
                CopilotPickerContent,
                {
                    fileName: file?.basename ?? null,
                    onSelect: (commandId: string) => {
                        this.close();
                        // Execute the command via Obsidian's command system
                        (this.app as any).commands.executeCommandById(`obsidian-peak-assistant:${commandId}`);
                    },
                },
                this.appContext,
            ),
        );
    }

    onClose(): void {
        const r = this.reactRenderer;
        this.reactRenderer = null;
        if (r) setTimeout(() => { r.unmount(); this.contentEl.empty(); }, 0);
        else this.contentEl.empty();
    }
}
```

- [ ] **Step 2: Register command in Register.ts**

Add import at top:
```ts
import { CopilotPickerModal } from '@/ui/view/copilot/CopilotPickerModal';
```

After line 739 (`...buildCopilotCommands(viewManager, aiManager),`), add:
```ts
        {
            id: 'peak-copilot-open',
            name: 'Open Copilot Panel',
            callback: () => {
                new CopilotPickerModal(appContext).open();
            },
        },
```

- [ ] **Step 3: Verify build and commit**

```bash
npm run build
git add src/ui/view/copilot/CopilotPickerModal.tsx src/app/commands/Register.ts
git commit -m "feat(copilot): add CopilotPickerModal — unified entry point for all copilot commands"
```

---

## Wave E: Settings & Visual Polish (RC4 + RC11 + RC12)

### Task 13: Fix tab background and provider hover

**Files:**
- Modify: `src/styles/tailwind.css:114`
- Modify: `src/ui/view/settings/components/AddProfileGrid.tsx:25`

- [ ] **Step 1: Remove active tab background color**

In `tailwind.css`, replace line 114:
```css
    background-color: var(--background-secondary);
```
with (delete the line entirely or comment it out):
```css
    /* active tab uses underline only, no background */
```

- [ ] **Step 2: Add hover effect to provider cards**

In `AddProfileGrid.tsx`, replace the card className at line 25:
```tsx
className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-1.5 pktw-p-3 pktw-rounded-lg pktw-border pktw-border-pk-border pktw-cursor-pointer hover:pktw-border-pk-accent pktw-transition-colors"
```
with:
```tsx
className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-1.5 pktw-p-3 pktw-rounded-lg pktw-border pktw-border-pk-border pktw-cursor-pointer hover:pktw-border-[var(--interactive-accent)] hover:pktw-shadow-md pktw-transition-all pktw-duration-200"
```

- [ ] **Step 3: Verify build and commit**

```bash
npm run build
git add src/styles/tailwind.css src/ui/view/settings/components/AddProfileGrid.tsx
git commit -m "fix(settings): unify tab background, add hover shadow to provider cards"
```

### Task 14: Fix CodeMirrorInput .select() and settings cleanup

**Files:**
- Modify: `src/ui/component/mine/codemirror-input.tsx:26`
- Modify: `src/ui/view/quick-search/SearchModal.tsx:140,520`
- Modify: `src/ui/view/settings/ProfilesTab.tsx:283-289`

- [ ] **Step 1: Fix forwardRef type to include select**

In `codemirror-input.tsx`, replace line 26:
```tsx
const CodeMirrorInputComponent = React.forwardRef<{ focus: () => void }, CodeMirrorInputProps>(
```
with:
```tsx
const CodeMirrorInputComponent = React.forwardRef<{ focus: () => void; select: () => void }, CodeMirrorInputProps>(
```

- [ ] **Step 2: Add defensive optional chaining in SearchModal**

In `SearchModal.tsx`, replace `inputRef.current.select()` at lines 140 and 520 with:
```tsx
inputRef.current?.select?.();
```

- [ ] **Step 3: Remove redundant power-user banner**

In `ProfilesTab.tsx`, delete the bottom banner block (lines 283–289):
```tsx
          {/* Bottom callout */}
          <div className="pktw-rounded-lg pktw-border pktw-border-pk-border pktw-bg-pk-accent/5 pktw-px-4 pktw-py-3">
              <span className="pktw-text-xs pktw-text-pk-muted-foreground pktw-leading-relaxed">
                  Power-user settings live in <span className="pktw-font-mono pktw-text-pk-foreground-faint">peak-config.json</span> (vault root):
                  Per-prompt model mapping · Inspector link params · Graph viz tuning · Hub discover params
              </span>
          </div>
```

- [ ] **Step 4: Remove Local Chromium option from search button**

In `src/ui/component/prompt-input/PromptInputSearchButton.tsx`:

Change the type union at lines 10 and 16 from `'local' | 'perplexity' | 'model-builtin'` to `'perplexity' | 'model-builtin'`.

Remove the `'local'` / "Host Engine" button block (lines 53–65).

- [ ] **Step 5: Verify build and commit**

```bash
npm run build
git add src/ui/component/mine/codemirror-input.tsx src/ui/view/quick-search/SearchModal.tsx \
       src/ui/view/settings/ProfilesTab.tsx src/ui/component/prompt-input/PromptInputSearchButton.tsx
git commit -m "fix(ui): CodeMirror select type, remove redundant banner, remove Local Chromium option"
```

---

## Wave F: Model & Profile System (RC1 + RC10)

### Task 15: Add RoleConfig type and migrate ProfileRegistry

**Files:**
- Modify: `src/core/profiles/types.ts:30-36`
- Modify: `src/core/profiles/ProfileRegistry.ts`

- [ ] **Step 1: Add RoleConfig to types.ts**

After the `Profile` interface (after line 28), add:
```ts
export interface RoleConfig {
    profileId: string;
    modelId: string;
}
```

Update `ProfileSettings` (lines 30–36):
```ts
export interface ProfileSettings {
    profiles: Profile[];
    activeAgentConfig: RoleConfig | null;
    activeEmbeddingConfig: RoleConfig | null;
    activeWebSearchConfig: RoleConfig | null;
    sdkSettings: SdkSettings;
}
```

- [ ] **Step 2: Migrate ProfileRegistry**

Replace private fields (lines 18–20):
```ts
    private activeAgentConfig: RoleConfig | null = null;
    private activeEmbeddingConfig: RoleConfig | null = null;
    private activeWebSearchConfig: RoleConfig | null = null;
```

Update `load()` (lines 42–49) with backward-compatible migration:
```ts
    load(settings: ProfileSettings & { activeAgentProfileId?: string | null; activeEmbeddingProfileId?: string | null; activeWebSearchProfileId?: string | null }, persistFn: PersistFn): void {
        this.profiles = [...settings.profiles];

        // Backward-compatible migration from old string format
        this.activeAgentConfig = settings.activeAgentConfig ?? this.migrateOldId(settings.activeAgentProfileId);
        this.activeEmbeddingConfig = settings.activeEmbeddingConfig ?? this.migrateOldId(settings.activeEmbeddingProfileId);
        this.activeWebSearchConfig = settings.activeWebSearchConfig ?? this.migrateOldId(settings.activeWebSearchProfileId);

        this.sdkSettings = { ...DEFAULT_SDK_SETTINGS, ...settings.sdkSettings };
        this.persistFn = persistFn;
    }

    private migrateOldId(id: string | null | undefined): RoleConfig | null {
        if (!id) return null;
        const profile = this.profiles.find(p => p.id === id);
        if (!profile) return null;
        return { profileId: id, modelId: profile.primaryModel };
    }
```

Update getActive methods:
```ts
    getActiveAgentProfile(): Profile | null {
        if (!this.activeAgentConfig) return null;
        return this.profiles.find((p) => p.id === this.activeAgentConfig!.profileId) ?? null;
    }

    getActiveAgentConfig(): { profile: Profile; modelId: string } | null {
        if (!this.activeAgentConfig) return null;
        const profile = this.profiles.find((p) => p.id === this.activeAgentConfig!.profileId);
        if (!profile) return null;
        return { profile, modelId: this.activeAgentConfig.modelId };
    }

    getActiveEmbeddingProfile(): Profile | null {
        if (!this.activeEmbeddingConfig) return null;
        return this.profiles.find((p) => p.id === this.activeEmbeddingConfig!.profileId) ?? null;
    }

    getActiveWebSearchProfile(): Profile | null {
        if (!this.activeWebSearchConfig) return null;
        return this.profiles.find((p) => p.id === this.activeWebSearchConfig!.profileId) ?? null;
    }
```

Update setActive methods:
```ts
    setActiveAgentProfile(id: string | null): void {
        if (id === null) { this.activeAgentConfig = null; this.persist(); return; }
        const profile = this.profiles.find((p) => p.id === id);
        if (!profile) throw new Error(`Profile with id "${id}" not found`);
        this.activeAgentConfig = { profileId: id, modelId: profile.primaryModel };
        this.persist();
    }

    setActiveAgentConfig(config: RoleConfig | null): void {
        if (config && !this.profiles.some((p) => p.id === config.profileId)) {
            throw new Error(`Profile with id "${config.profileId}" not found`);
        }
        this.activeAgentConfig = config;
        this.persist();
    }

    setActiveEmbeddingProfile(id: string | null): void {
        if (id === null) { this.activeEmbeddingConfig = null; this.persist(); return; }
        const profile = this.profiles.find((p) => p.id === id);
        if (!profile) throw new Error(`Profile with id "${id}" not found`);
        this.activeEmbeddingConfig = { profileId: id, modelId: profile.embeddingModel ?? profile.primaryModel };
        this.persist();
    }

    setActiveWebSearchProfile(id: string | null): void {
        if (id === null) { this.activeWebSearchConfig = null; this.persist(); return; }
        const profile = this.profiles.find((p) => p.id === id);
        if (!profile) throw new Error(`Profile with id "${id}" not found`);
        this.activeWebSearchConfig = { profileId: id, modelId: profile.primaryModel };
        this.persist();
    }
```

Update `persist()`:
```ts
    private persist(): void {
        if (!this.persistFn) return;
        const snapshot: ProfileSettings = {
            profiles: this.profiles.map((p) => ({ ...p })),
            activeAgentConfig: this.activeAgentConfig,
            activeEmbeddingConfig: this.activeEmbeddingConfig,
            activeWebSearchConfig: this.activeWebSearchConfig,
            sdkSettings: { ...this.sdkSettings },
        };
        void this.persistFn(snapshot);
    }
```

- [ ] **Step 3: Fix all consumers that reference old field names**

Search for `activeAgentProfileId`, `activeEmbeddingProfileId`, `activeWebSearchProfileId` across the codebase and update each reference. Key files:
- `src/app/settings/MySetting.ts` — settings loading/saving
- `src/ui/view/settings/ProfilesTab.tsx` — UI toggles
- Any status bar or onboarding code

- [ ] **Step 4: Verify build and commit**

```bash
npm run build
git add src/core/profiles/types.ts src/core/profiles/ProfileRegistry.ts
# plus any consumer files
git commit -m "feat(profiles): migrate to RoleConfig — per-role model selection with backward compat"
```

### Task 16: Update ProfileCard RoleToggle → RoleSelector

**Files:**
- Modify: `src/ui/view/settings/components/ProfileCard.tsx:308-334`

- [ ] **Step 1: Replace RoleToggle with RoleSelector**

Replace the `RoleToggle` component (lines 308–334) with:
```tsx
function RoleSelector({ label, active, selectedModel, availableModels, onToggle, onModelChange }: {
    label: string; active: boolean; selectedModel?: string;
    availableModels: string[]; onToggle: () => void; onModelChange: (modelId: string) => void;
}) {
    return (
        <div className="pktw-flex pktw-items-center pktw-gap-2">
            <button
                type="button"
                onClick={onToggle}
                className={cn(
                    'pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-1.5 pktw-rounded-md pktw-text-xs pktw-font-medium pktw-transition-all pktw-cursor-pointer pktw-border',
                    active
                        ? 'pktw-border-purple-500/60 pktw-bg-purple-500/10 pktw-text-purple-600 dark:pktw-text-purple-400'
                        : 'pktw-border-pk-border pktw-text-pk-muted-foreground hover:pktw-border-pk-accent/40',
                )}
            >
                <span className={cn(
                    'pktw-w-3.5 pktw-h-3.5 pktw-rounded pktw-border pktw-flex pktw-items-center pktw-justify-center pktw-transition-colors',
                    active ? 'pktw-border-purple-500 pktw-bg-purple-500' : 'pktw-border-pk-border',
                )}>
                    {active && (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1.5 4L3.2 5.7L6.5 2.3" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    )}
                </span>
                {label}
            </button>
            {active && availableModels.length > 0 && (
                <select
                    value={selectedModel ?? ''}
                    onChange={(e) => onModelChange(e.target.value)}
                    className="pktw-text-xs pktw-bg-transparent pktw-border pktw-border-pk-border pktw-rounded pktw-px-2 pktw-py-1 pktw-text-pk-foreground"
                >
                    {availableModels.map(m => (
                        <option key={m} value={m}>{m}</option>
                    ))}
                </select>
            )}
        </div>
    );
}
```

Update the usage sites where `RoleToggle` is rendered (lines 281–297) to pass the new props, using `ProfileRegistry.getActiveAgentConfig()?.modelId` and `profile.availableModels` (or fall back to `[profile.primaryModel, profile.fastModel].filter(Boolean)`).

- [ ] **Step 2: Verify build and commit**

```bash
npm run build
git add src/ui/view/settings/components/ProfileCard.tsx
git commit -m "feat(settings): RoleToggle → RoleSelector with per-role model dropdown"
```

### Task 17: Model auto-select and avatar provider icon

**Files:**
- Modify: `src/ui/view/chat-view/hooks/useChatSession.ts:52-75`
- Modify: `src/ui/view/chat-view/components/ChatInputArea.tsx:167`
- Modify: `src/ui/view/chat-view/components/MessageRoleAvatar.tsx`

- [ ] **Step 1: Auto-select model for new conversations**

In `useChatSession.ts`, after line 74 (after the existing model-setting logic), add an else-if branch:
```ts
          } else {
              // No conversation model, no global default — try active agent profile
              const agentConfig = ProfileRegistry.getInstance().getActiveAgentConfig();
              if (agentConfig) {
                  setSelectedModel(agentConfig.profile.kind, agentConfig.modelId);
              }
          }
```

Add import at top:
```ts
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
```

- [ ] **Step 2: Update placeholder to show Auto**

In `ChatInputArea.tsx`, replace the `ModelSelector` usage (line 167):
```tsx
placeholder="No model selected"
```
with:
```tsx
placeholder={(() => {
    const config = ProfileRegistry.getInstance().getActiveAgentConfig();
    return config ? `Auto (${config.modelId})` : 'No profile configured';
})()}
```

Add import:
```ts
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
```

- [ ] **Step 3: Update MessageRoleAvatar to show provider icon**

Replace the entire file:
```tsx
import React from 'react';
import { User } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { ProviderIcon } from '@/ui/view/settings/components/ProviderIcon';
import type { ProfileKind } from '@/core/profiles/types';

interface MessageRoleAvatarProps {
    role: 'user' | 'assistant';
    provider?: string;
    model?: string;
}

export const MessageRoleAvatar: React.FC<MessageRoleAvatarProps> = ({ role, provider, model }) => {
    const isUser = role === 'user';
    return (
        <div
            className={cn(
                "pktw-w-5 pktw-h-5 pktw-rounded-[5px] pktw-flex pktw-items-center pktw-justify-center pktw-flex-shrink-0 pktw-mt-0.5",
                isUser ? "pktw-bg-muted pktw-text-muted-foreground" : "pktw-bg-accent/10 pktw-text-accent"
            )}
            title={!isUser && provider ? `${provider}/${model ?? ''}` : undefined}
        >
            {isUser ? (
                <User className="pktw-w-3 pktw-h-3" />
            ) : (
                <ProviderIcon kind={(provider ?? 'custom') as ProfileKind} size={14} />
            )}
        </div>
    );
};
```

- [ ] **Step 4: Pass provider/model to MessageRoleAvatar**

In `MessageViewItem.tsx`, find where `MessageRoleAvatar` is rendered and pass the message's provider and model:
```tsx
<MessageRoleAvatar role={message.role} provider={message.provider} model={message.model} />
```

- [ ] **Step 5: Verify build and commit**

```bash
npm run build
git add src/ui/view/chat-view/hooks/useChatSession.ts src/ui/view/chat-view/components/ChatInputArea.tsx \
       src/ui/view/chat-view/components/MessageRoleAvatar.tsx src/ui/view/chat-view/components/messages/MessageViewItem.tsx
git commit -m "feat(chat): auto-select model from active profile, show provider icon in avatar"
```

---

## Wave G: Quick Actions & Outline (RC4 cont.)

### Task 18: Wire suggestion action buttons

**Files:**
- Modify: `src/ui/view/chat-view/view-Messages.tsx:138-143`

- [ ] **Step 1: Wire suggestion actions to submitAction**

Replace lines 138–143:
```tsx
const suggestionActions: SuggestionAction[] = [
    { icon: <ClipboardList className="pktw-w-3 pktw-h-3" />, label: 'Summarize',      action: () => { /* placeholder */ } },
    { icon: <Search      className="pktw-w-3 pktw-h-3" />, label: 'Search vault',   action: () => { /* placeholder */ } },
    { icon: <Lightbulb   className="pktw-w-3 pktw-h-3" />, label: 'Explain further', action: () => { /* placeholder */ } },
];
```
with:
```tsx
const submitAction = useChatViewStore.getState().submitAction;
const suggestionActions: SuggestionAction[] = [
    { icon: <ClipboardList className="pktw-w-3 pktw-h-3" />, label: 'Summarize',
      action: () => submitAction?.('Summarize this conversation concisely.') },
    { icon: <Search className="pktw-w-3 pktw-h-3" />, label: 'Search vault',
      action: () => submitAction?.('Search the vault for information related to this conversation.') },
    { icon: <Lightbulb className="pktw-w-3 pktw-h-3" />, label: 'Explain further',
      action: () => submitAction?.('Explain the last response in more detail.') },
];
```

- [ ] **Step 2: Verify build and commit**

```bash
npm run build
git add src/ui/view/chat-view/view-Messages.tsx
git commit -m "feat(chat): wire Summarize/Search vault/Explain further quick actions"
```

### Task 19: Strip markdown in ConversationOutline

**Files:**
- Modify: `src/ui/view/chat-view/components/ConversationOutline.tsx:83`

- [ ] **Step 1: Add stripMarkdown helper and apply**

At top of file (after imports), add:
```tsx
function stripMarkdown(text: string): string {
    return text
        .replace(/^#{1,6}\s+/gm, '')        // headers
        .replace(/\*\*(.*?)\*\*/g, '$1')     // bold
        .replace(/\*(.*?)\*/g, '$1')         // italic
        .replace(/\[\[(.*?)\]\]/g, '$1')     // wikilinks
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // md links
        .replace(/`([^`]+)`/g, '$1')         // inline code
        .replace(/^>\s+/gm, '')              // blockquotes
        .replace(/^[-*+]\s+/gm, '')          // list items
        .trim();
}
```

Replace line 83:
```tsx
{msg.content.slice(0, 100)}
```
with:
```tsx
{stripMarkdown(msg.content).slice(0, 100)}
```

- [ ] **Step 2: Verify build and commit**

```bash
npm run build
git add src/ui/view/chat-view/components/ConversationOutline.tsx
git commit -m "fix(outline): strip markdown syntax from conversation outline preview"
```

---

## Verification

After all waves complete:

- [ ] **Full build check:** `npm run build`
- [ ] **Manual smoke tests in Obsidian DevTools:**
  - Wave A: Trigger auth error → friendly message; max turns → partial results
  - Wave B: Style buttons submit text; AI Analysis in chat renders markdown; error messages show no Regenerate
  - Wave C: Type in AI Analysis search → filters recent list; Enter starts analysis; no white-screen crash
  - Wave D: Open Copilot modal → select command → loading → result; Suggest Tags end-to-end
  - Wave E: All tabs same background; provider cards have hover shadow; no .select() TypeError
  - Wave F: New conversation → auto-selects model; toggle role → select model; avatar shows provider icon
  - Wave G: Click "Summarize" → sends message; outline shows clean text
