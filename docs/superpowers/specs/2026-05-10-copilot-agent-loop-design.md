# Copilot Agent Loop Upgrade

Upgrade 4 copilot actions from single-turn LLM calls to multi-step agent loops with vault exploration, and add real-time step display to CopilotResultModal.

## Scope

### Actions to upgrade

| Action | Current problem | Agent loop benefit |
|--------|----------------|-------------------|
| `suggest-links` | LLM guesses link targets without knowing what notes exist in vault | Search vault -> read candidates -> confirm semantic relevance -> recommend real links |
| `knowledge-gaps` | Only sees current doc + link names, cannot verify what vault already covers | Search vault to confirm coverage -> identify genuine gaps |
| `synthesize-topic` | Fixed top-8 vector search, LLM cannot follow leads or explore deeper | Iterative search -> follow reference chains -> cross-note synthesis |
| `add-evidence` | Fixed top-10 search, no ability to drill deeper if first batch misses | Multi-round search -> read full content -> trace citation chains |

### Actions unchanged (11)

`polish`, `summarize`, `translate`, `continue-writing`, `rewrite-selection`, `extract-concepts`, `review`, `suggest-split`, `suggest-tags`, `find-related`, `vault-health` — these are pure text transformations, simple vector lookups, or already have sufficient context.

## Design decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tool set | Reuse full `buildVaultMcpServer` | Already mature and validated; agent self-selects tools |
| UI step display | Lightweight V2 reuse — `V2ToolStep` + `ToolRow` + `BatchRow`, no `V2RoundBlock`/`ThinkingRow` | Copilot is single-round, no multi-round collapse needed |
| `execute()` interface | Unified `AsyncGenerator<LLMStreamEvent>` for all actions | Single consumption path in Modal; single-turn actions trivially yield deltas |
| Max turns | 20 (safety net) | High enough to never hit in practice; UI Cancel button for user control |

## Interface changes

### CopilotAction.execute — AsyncGenerator

```ts
// Before
execute(ctx: DocumentContext, progress: ProgressCallback, signal?: AbortSignal): Promise<ActionResult>;

// After
execute(ctx: DocumentContext, signal?: AbortSignal): AsyncGenerator<LLMStreamEvent, ActionResult | void>;
```

`ProgressCallback` is removed entirely. All progress communication happens through yielded `LLMStreamEvent`s.

**Single-turn actions** adapt minimally:

```ts
// Stream actions (polish, summarize, translate, etc.)
async *execute(ctx, signal) {
    for await (const chunk of mgr.queryTextStream(promptId, vars, { signal })) {
        yield chunk;  // text-delta or done
    }
    return { type: 'stream', text: fullText, usage };
}

// Structured actions (review, suggest-split, etc.)
async *execute(ctx, signal) {
    const result = await mgr.queryStructured(promptId, vars, schema, { signal });
    return { type: 'structured', data: result, usage };
}
```

**Agent loop actions** yield the full event stream:

```ts
async *execute(ctx, signal) {
    const mcpServer = buildVaultMcpServer({ ... });
    const stream = queryWithProfile({ prompt, systemPrompt, maxTurns: 20, mcpServers: { vault: mcpServer } });
    for await (const sdkMsg of stream) {
        for (const event of translateSdkMessage(sdkMsg, opts)) {
            yield event;
        }
    }
    return { type: 'structured', data: extractedResult, usage };
}
```

### ActionResult — unchanged

```ts
type ActionResult =
    | { type: 'structured'; data: any; usage?: ActionUsage }
    | { type: 'stream'; text: string; usage?: ActionUsage }
    | { type: 'error'; message: string };
```

The generator's return value is the final `ActionResult`, consumed by `CopilotResultModal` to render the result panel. `void` return is allowed for agent loop actions where the result is captured via a submit tool callback during the loop — in that case, the consumer extracts the result from the last `tool-call` event targeting the submit tool.

## Agent loop action architecture

### Shared infrastructure

All 4 agent loop actions share:

1. **MCP server**: `buildVaultMcpServer` with full vault tool set (`vault_grep`, `vault_read_note`, `vault_wikilink_expand`, `vault_list_folders`, `vault_read_folder`)
2. **Agent runtime**: `queryWithProfile` from `sdkAgentPool.ts` with `maxTurns: 20`
3. **Event translation**: `translateSdkMessage` from `sdkMessageAdapter.ts`
4. **Result extraction**: Each action parses the agent's final text output into its specific schema

### Per-action system prompts

Each action gets a dedicated `PromptId` for its system prompt (playbook), registered via `PromptRegistry`/`PromptService`.

| Action | PromptId | Agent goal |
|--------|----------|-----------|
| `suggest-links` | `CopilotAgentSuggestLinks` | Search vault for real notes semantically related to the current document; read and verify relevance; output structured link suggestions with reasons |
| `knowledge-gaps` | `CopilotAgentKnowledgeGaps` | Analyze document topics; search vault to verify existing coverage; identify genuinely missing topics with evidence |
| `synthesize-topic` | `CopilotAgentSynthesizeTopic` | Iteratively search and read related notes; follow reference chains; produce a comprehensive topic synthesis with source attribution |
| `add-evidence` | `CopilotAgentAddEvidence` | Search for supporting evidence across vault; read full content of candidates; evaluate relevance; recommend specific quotable passages |

### Result extraction

Agent loop actions need to extract structured results from the agent's final output. Two strategies:

1. **Submit tool** (preferred for `suggest-links`, `knowledge-gaps`, `add-evidence`): Register a `submit_result` MCP tool that the agent calls with structured JSON matching the action's schema. The tool callback captures the result.
2. **Text parsing** (for `synthesize-topic`): The agent streams the synthesis text directly. Sources are collected from `vault_read_note` tool calls during the loop. Final result is `{ text, sources }`.

### Context injection

Each agent loop action injects the current document context into the user prompt:

```
Title: {{title}}
Content ({{wordCount}} words):
{{content}}

Existing links: {{existingLinks}}  // for suggest-links
Existing tags: {{tags}}            // for knowledge-gaps
Selection: {{selection}}           // for add-evidence (if selected)
```

## UI changes

### CopilotResultModal phase machine

```
// Before
loading → result | error | cancelled

// After
loading → streaming → result | error | cancelled
           ↑      │
           └──────┘  (tool-call/tool-result events update steps)
```

New `streaming` phase:

```ts
type ModalPhase =
    | { phase: 'loading'; startTime: number }
    | { phase: 'streaming'; steps: V2ToolStep[]; textChunks: string; startTime: number }
    | { phase: 'result'; data: any; usage?: ActionUsage }
    | { phase: 'cancelled' }
    | { phase: 'error'; error: Error };
```

Transition rules:
- `loading → streaming`: first `tool-call` or `text-delta` event received
- `streaming → streaming`: subsequent events update `steps[]` and `textChunks`
- `streaming → result`: generator returns `ActionResult`
- `streaming → error`: generator throws
- `streaming → cancelled`: user clicks Cancel (AbortController.abort)
- `loading → result`: for instant-return structured actions (no events yielded before return)

### Event consumer in CopilotResultModal

A lightweight event dispatcher in the modal, handling only the event types relevant to copilot:

```ts
function consumeCopilotStream(
    generator: AsyncGenerator<LLMStreamEvent, ActionResult | void>,
    updatePhase: (phase: ModalPhase) => void,
    signal: AbortSignal,
): Promise<ActionResult | void>
```

Event routing:

| Event | Action |
|-------|--------|
| `tool-call` | Create `V2ToolStep { status: 'running' }`, push to `steps[]` |
| `tool-result` | Find step by tool call id, set `status: 'done'`, add summary |
| `text-delta` | Append to `textChunks` (for stream actions; agent loop text is usually not shown) |
| `complete` | Extract usage, prepare for phase transition |
| `error` | Transition to error phase |

### Rendering structure

```
+-- CopilotResultModal ----------------------------+
|  [Action Icon] Action Label              [Cancel] |
|                                                   |
|  +-- StepTimeline (streaming phase) -----------+ |
|  | check vault_grep "knowledge..."       1.2s  | |
|  | check vault_read_note "PKM.md"        0.8s  | |
|  | spinner vault_read_note "Zettelk..."        | |  <-- ToolRow
|  +---------------------------------------------+ |
|                                                   |
|  +-- progressText (stream actions only) -------+ |
|  | Streaming text preview...                    | |
|  +---------------------------------------------+ |
|                                                   |
|  +-- ResultPanel (result phase) ---------------+ |
|  | action.ResultPanel { result, ctx, ... }      | |
|  +---------------------------------------------+ |
|  [UsageFooter: input/output tokens]               |
+---------------------------------------------------+
```

**StepTimeline component**: Reuses `V2ToolStep` type and `ToolRow` from `timeline-helpers.tsx`. Also reuses `BatchRow` for consecutive `vault_read_note` calls. The timeline is rendered above the result panel during streaming, and collapses to a summary line (e.g., "Searched vault, read 5 notes - 12.3s") after result is ready.

**Components to reuse** (from `src/ui/view/quick-search/components/timeline-helpers.tsx`):
- `ToolRow` — spinner/check icon + tool display name + elapsed time
- `BatchRow` — collapsed consecutive read operations
- `groupTimeline()` — groups items for batch rendering
- `v2ToolDisplay()` — MCP tool name to display label mapping

**Components NOT reused**:
- `V2RoundBlock` — no multi-round in copilot
- `ThinkingRow` — agent reasoning text not shown in copilot
- `V2ProcessView` — too coupled to search session store

### Step collapse after completion

When the phase transitions from `streaming` to `result`:
- Steps collapse into a single summary row: "[check icon] 6 steps completed - 12.3s [chevron to expand]"
- Clicking the summary expands back to the full step list
- This keeps the result panel prominent while preserving step visibility

## File changes summary

| File | Change |
|------|--------|
| `src/service/copilot/CopilotActionRegistry.ts` | `execute()` signature -> AsyncGenerator; remove `ProgressCallback` |
| `src/service/copilot/actions/index.ts` | Convert all 15 actions to generator syntax; 4 actions get agent loop body |
| `src/service/copilot/actions/agent-actions.ts` | New file: shared agent loop infrastructure (buildCopilotAgentStream, consumeAgentResult) |
| `src/ui/view/copilot/CopilotResultModal.tsx` | Add `streaming` phase; replace progress callback with event consumer; render StepTimeline |
| `src/ui/view/copilot/components/StepTimeline.tsx` | New file: copilot-specific step timeline component (wraps ToolRow/BatchRow) |
| `src/ui/view/copilot/components/StepCollapse.tsx` | New file: collapsed summary row with expand toggle |
| `templates/prompts/copilot/` | 4 new prompt files: agent playbooks for each action |
| `src/service/prompt/PromptId.ts` | 4 new PromptId entries |

## Non-goals

- Web search tool for copilot actions (can be added later per-action)
- Multi-round agent (HITL plan approval in copilot)
- Changing any of the 11 single-turn actions beyond the interface adaptation
- Modifying the existing AI Analysis / search view
