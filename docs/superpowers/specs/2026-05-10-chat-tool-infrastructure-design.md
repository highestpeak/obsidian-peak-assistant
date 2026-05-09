# Chat Mode Tool Infrastructure

## Problem

Chat mode has two code paths (Agent SDK for Anthropic, Vercel AI SDK for others) but neither passes tools to the model. UI toggles (Web Search, Vault Search, Code Interpreter) only modify system prompt text — the model is told it "can search the web" but has no actual tool to call.

This causes the model to respond with "I don't have web access" even when the user has enabled Web Search.

## Design Decisions

1. **Unify Chat mode to Vercel AI SDK path only** — `@ai-sdk/anthropic` is already installed and `provider-factory.ts` already handles Anthropic. The Agent SDK path adds complexity without benefit for simple Chat (no multi-turn agent loop needed). Agent SDK stays for VaultSearchAgent, Copilot actions, and other true agent-loop scenarios.

2. **Define tools as `AgentTool` (Zod + execute), convert at boundary** — The existing `AgentTool` interface maps directly to Vercel's `tool()`. One definition, one conversion point.

3. **Model capabilities gate tool injection** — `ModelCapabilities` already declares native abilities (`webSearch`, `codeInterpreter`, `xSearch`). If a model natively supports a capability, skip injecting the custom tool. If not, inject ours.

## Architecture

```
chatViewStore (user toggles)
    +
ModelCapabilities (native model abilities)
    ↓
chatToolBuilder.ts
    ↓
Vercel AI SDK tools + maxSteps
    ↓
vercelStreamChat()
    ↓
streamText({ tools, maxSteps })
```

## Changes

### 1. Remove Agent SDK path from Chat (`service-conversation.ts`)

Remove the dual-dispatch logic. All Chat requests go through `vercelStreamChat`.

Before:
```ts
if (vercelProfile) {
    yield* vercelStreamChat(...);
} else {
    // Agent SDK fallback
    yield* translateSdkMessages(queryWithProfile(...));
}
```

After:
```ts
const profile = findProfileForProvider(convProvider);
const tools = buildChatTools(modelCapabilities);
yield* vercelStreamChat(profile, modelId, { messages, outputControl, tools, maxSteps });
```

The profile lookup changes from excluding Anthropic to including all providers:
```ts
const profile = allProfiles.find(p => p.kind === convProvider && p.enabled !== false && p.apiKey);
```

### 2. New: `src/service/chat/tools/chatToolBuilder.ts`

Reads store toggles + model capabilities, returns Vercel-compatible tool map.

```ts
interface ChatToolSet {
    tools: Record<string, CoreTool>;  // Vercel AI SDK tool format
    maxSteps: number;                 // > 1 when tools present
}

function buildChatTools(capabilities: ModelCapabilities): ChatToolSet;
```

Logic per toggle:

| Toggle | Model has native? | Action |
|---|---|---|
| `enableWebSearch` | `capabilities.webSearch` | Skip (model handles natively) |
| `enableWebSearch` | No native | Inject `web_search` tool |
| `enableVaultSearch` | N/A (always custom) | Inject `vault_search` tool |
| `isCodeInterpreterEnabled` | `capabilities.codeInterpreter` | Skip (model handles natively) |
| `isCodeInterpreterEnabled` | No native | Skip for now (future: sandboxed JS) |

### 3. Web search tool implementation

Reuse the logic from `webSearchTool.ts` — call `queryWithProfile` with the user's web search profile:

```ts
tool({
    description: 'Search the web for up-to-date information...',
    parameters: z.object({ query: z.string() }),
    execute: async ({ query }) => {
        const profile = ProfileRegistry.getInstance().getActiveWebSearchProfile();
        const messages = queryWithProfile(app, pluginId, profile, {
            prompt: query,
            systemPrompt: WEB_SEARCH_SYSTEM_PROMPT,
            maxTurns: 1,
        });
        return await collectText(messages);
    },
});
```

### 4. Vercel adapter changes (`vercel-adapter.ts`)

Add `tools` and `maxSteps` to the `streamText` call:

```ts
export async function* streamChat(
    model: LanguageModel,
    messages: LLMRequestMessage[],
    options?: {
        outputControl?: LLMOutputControlSettings;
        tools?: Record<string, CoreTool>;
        maxSteps?: number;
        abortSignal?: AbortSignal;
    },
): AsyncGenerator<LLMStreamEvent> {
    const result = streamText({
        model,
        system: extractSystemMessage(messages),
        prompt: toAiSdkMessages(messages),
        tools: options?.tools,
        maxSteps: options?.maxSteps ?? 1,
        // ...existing options
    });
    // ...existing stream translation (already handles tool-call/tool-result events)
}
```

The stream translator already handles `tool-call`, `tool-input-start`, `tool-input-delta`, `tool-result` events — no changes needed there.

### 5. Update `VercelChatRequest` (`vercel/index.ts`)

```ts
export interface VercelChatRequest {
    messages: LLMRequestMessage[];
    outputControl?: LLMOutputControlSettings;
    tools?: Record<string, CoreTool>;
    maxSteps?: number;
    abortSignal?: AbortSignal;
}
```

## Scope

### This PR
- Unify Chat to Vercel path (remove Agent SDK from `streamChat`)
- Add tool passing to Vercel adapter
- Implement `chatToolBuilder` with web search tool
- Web Search toggle actually works for all providers

### Future (not this PR)
- Vault Search as a chat tool
- Provider-native code interpreter activation
- Twitter / Reddit search tools
- Provider-native web search passthrough (Grok, Perplexity)

## Risk

- **Anthropic via Vercel vs Agent SDK**: Vercel AI SDK's Anthropic adapter may have minor behavioral differences (e.g., caching, token counting). Monitor after switch.
- **maxSteps cost**: When tools are enabled, `maxSteps > 1` means the model may do multiple rounds. Set a reasonable cap (e.g., 3) to prevent runaway token usage.
