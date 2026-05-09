# Chat Tool Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify Chat mode to Vercel AI SDK path and add tool support so Web Search (and future tools) actually work for all providers.

**Architecture:** Remove the Agent SDK dual-dispatch from `service-conversation.ts`. All Chat requests go through `vercelStreamChat` with tools built by a new `chatToolBuilder`. The builder reads UI toggles from `chatViewStore` and model capabilities to decide which tools to inject.

**Tech Stack:** Vercel AI SDK v6 (`ai` package — `tool`, `streamText`, `maxSteps`), Zod schemas, existing `queryWithProfile` for web search delegation.

**Spec:** `docs/superpowers/specs/2026-05-10-chat-tool-infrastructure-design.md`

---

### Task 1: Add tools + maxSteps support to Vercel adapter

**Files:**
- Modify: `src/core/providers/vercel/vercel-adapter.ts:99-106` (options type)
- Modify: `src/core/providers/vercel/vercel-adapter.ts:110-121` (streamText call)
- Modify: `src/core/providers/vercel/index.ts:6-9` (VercelChatRequest interface)
- Modify: `src/core/providers/vercel/index.ts:22` (pass-through)

- [ ] **Step 1: Update `VercelChatRequest` in `vercel/index.ts`**

Add `tools` and `maxSteps` fields to the interface and pass them through:

```ts
// src/core/providers/vercel/index.ts
import type { Profile } from '@/core/profiles/types';
import type { LLMRequestMessage, LLMStreamEvent, LLMOutputControlSettings, LLMUsage } from '@/core/providers/types';
import type { ToolSet } from 'ai';
import { createLanguageModel } from './provider-factory';
import { streamChat as adapterStreamChat } from './vercel-adapter';

export interface VercelChatRequest {
    messages: LLMRequestMessage[];
    outputControl?: LLMOutputControlSettings;
    tools?: ToolSet;
    maxSteps?: number;
    abortSignal?: AbortSignal;
}

export async function* vercelStreamChat(
    profile: Profile,
    modelId: string,
    request: VercelChatRequest,
): AsyncGenerator<LLMStreamEvent> {
    const model = createLanguageModel(profile, modelId);
    yield* adapterStreamChat(model, request.messages, {
        outputControl: request.outputControl,
        tools: request.tools,
        maxSteps: request.maxSteps,
        abortSignal: request.abortSignal,
    });
}
```

- [ ] **Step 2: Update `streamChat` options in `vercel-adapter.ts`**

Add `tools` and `maxSteps` to the options type and pass to `streamText`:

In `vercel-adapter.ts`, change the `streamChat` function signature and the `streamText` call:

```ts
// Options type (line 99-106)
export async function* streamChat(
    model: LanguageModel,
    messages: LLMRequestMessage[],
    options?: {
        outputControl?: LLMOutputControlSettings;
        tools?: ToolSet;
        maxSteps?: number;
        abortSignal?: AbortSignal;
    },
): AsyncGenerator<LLMStreamEvent> {
```

```ts
// streamText call (line 110-121) — add tools and maxSteps
const result = streamText({
    model,
    system: extractSystemMessage(messages),
    prompt: toAiSdkMessages(messages),
    tools: options?.tools,
    maxSteps: options?.maxSteps ?? 1,
    maxOutputTokens: options?.outputControl?.maxOutputTokens,
    temperature: options?.outputControl?.temperature,
    topP: options?.outputControl?.topP,
    topK: options?.outputControl?.topK,
    frequencyPenalty: options?.outputControl?.frequencyPenalty,
    presencePenalty: options?.outputControl?.presencePenalty,
    abortSignal: options?.abortSignal,
});
```

Add import at the top of `vercel-adapter.ts`:

```ts
import { streamText, type LanguageModel, type ModelMessage, type ToolSet } from 'ai';
```

- [ ] **Step 3: Build and verify compilation**

Run: `npm run build`
Expected: No errors. This is a backwards-compatible change (new optional fields).

- [ ] **Step 4: Commit**

```bash
git add src/core/providers/vercel/index.ts src/core/providers/vercel/vercel-adapter.ts
git commit -m "feat: add tools + maxSteps support to Vercel adapter"
```

---

### Task 2: Create `chatToolBuilder` with web search tool

**Files:**
- Create: `src/service/chat/tools/chatToolBuilder.ts`

- [ ] **Step 1: Create the chat tool builder**

This module reads `chatViewStore` toggles and `ModelCapabilities`, builds a Vercel AI SDK tool set.

```ts
// src/service/chat/tools/chatToolBuilder.ts
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { App } from 'obsidian';
import type { ModelCapabilities } from '@/core/providers/types';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { collectText } from '@/service/agents/core/sdkMessageAdapter';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';

const WEB_SEARCH_SYSTEM_PROMPT =
    'Search the web and provide a comprehensive answer with sources. Cite URLs where possible. ' +
    'Focus on factual, up-to-date information. If the query is about a specific topic, provide relevant context and details.';

interface ChatToolDeps {
    app: App;
    pluginId: string;
}

export interface ChatToolSet {
    tools: ToolSet;
    maxSteps: number;
}

/**
 * Build Vercel AI SDK tools based on UI toggles and model capabilities.
 * Returns empty tools when nothing is enabled.
 */
export function buildChatTools(
    deps: ChatToolDeps,
    capabilities: ModelCapabilities,
): ChatToolSet {
    const { enableWebSearch } = useChatViewStore.getState();
    const tools: ToolSet = {};

    // Web search: skip if model has native web search capability
    if (enableWebSearch && !capabilities.webSearch) {
        const webProfile = ProfileRegistry.getInstance().getActiveWebSearchProfile();
        if (webProfile) {
            tools.web_search = tool({
                description:
                    'Search the web for up-to-date information, recent events, external knowledge, or facts. ' +
                    'Use when the user asks about current events, external products, public data, or anything beyond their personal notes.',
                parameters: z.object({
                    query: z.string().describe('The search query to look up on the web'),
                }),
                execute: async ({ query }) => {
                    const messages = queryWithProfile(deps.app, deps.pluginId, webProfile, {
                        prompt: query,
                        systemPrompt: WEB_SEARCH_SYSTEM_PROMPT,
                        maxTurns: 1,
                    });
                    const text = await collectText(messages);
                    return text || 'No results found.';
                },
            });
        }
    }

    const hasTools = Object.keys(tools).length > 0;
    return {
        tools: hasTools ? tools : {},
        maxSteps: hasTools ? 3 : 1,
    };
}
```

- [ ] **Step 2: Build and verify compilation**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/service/chat/tools/chatToolBuilder.ts
git commit -m "feat: add chatToolBuilder with web search tool for Vercel path"
```

---

### Task 3: Unify `streamChat` to Vercel path and wire tools

**Files:**
- Modify: `src/service/chat/service-conversation.ts:1-46` (imports, ChatPreparationResult)
- Modify: `src/service/chat/service-conversation.ts:143-209` (streamChat method)
- Modify: `src/service/chat/service-conversation.ts:211-293` (prepareChatRequest — add capabilities to result)

- [ ] **Step 1: Add `modelCapabilities` to `ChatPreparationResult`**

In `service-conversation.ts`, update the interface and return value so `streamChat` has access to capabilities:

```ts
// line 40-46
interface ChatPreparationResult {
    modelId: string;
    provider: string;
    timezone: string;
    prompt: LLMRequestMessage[];
    outputControl?: LLMOutputControlSettings;
    modelCapabilities: ModelCapabilities;
}
```

At the end of `prepareChatRequest` (around line 286-293), add `modelCapabilities` to the return:

```ts
return {
    modelId,
    provider,
    timezone,
    prompt: prompt,
    outputControl,
    modelCapabilities,
};
```

- [ ] **Step 2: Replace dual-dispatch with unified Vercel path**

Replace the entire dispatch block in `streamChat` (lines 164-207) with:

```ts
// Find profile for the conversation's provider
const registry = ProfileRegistry.getInstance();
const convProvider = prepared.provider;
const convModelId = prepared.modelId;
const allProfiles = registry.getAllProfiles();
const profile = allProfiles.find(p => p.kind === convProvider && p.enabled !== false && p.apiKey);

if (!profile) {
    throw new Error(`No active profile found for provider "${convProvider}". Please configure it in Settings → Profiles.`);
}

// Build tools based on UI toggles + model capabilities
const ctx = AppContext.getInstance();
const { tools, maxSteps } = buildChatTools(
    { app: ctx.app, pluginId: ctx.plugin.manifest.id },
    prepared.modelCapabilities,
);

const { vercelStreamChat } = await import('@/core/providers/vercel');
yield* vercelStreamChat(profile, convModelId || profile.primaryModel, {
    messages: prepared.prompt,
    outputControl: prepared.outputControl,
    tools: Object.keys(tools).length > 0 ? tools : undefined,
    maxSteps,
});
```

- [ ] **Step 3: Update imports**

Remove unused imports and add the new one. In the imports section:

Remove these lines:
```ts
import { queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { translateSdkMessages } from '@/service/agents/core/sdkMessageAdapter';
```

Add:
```ts
import { buildChatTools } from '@/service/chat/tools/chatToolBuilder';
import type { ModelCapabilities } from '@/core/providers/types';
```

Note: `AppContext` import already exists. `ProfileRegistry` import already exists.

- [ ] **Step 4: Build and verify compilation**

Run: `npm run build`
Expected: No errors.

- [ ] **Step 5: Run existing tests**

Run: `npm run test`
Expected: All tests pass (no existing tests for these modules, but verify nothing breaks).

- [ ] **Step 6: Commit**

```bash
git add src/service/chat/service-conversation.ts
git commit -m "feat: unify Chat mode to Vercel path with tool support"
```

---

### Task 4: Manual smoke test in Obsidian

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Test web search with non-Anthropic model**

1. Open Obsidian → Peak Assistant chat view
2. Select a non-Anthropic model (e.g., `openai/gpt-5-mini`)
3. Enable Web Search toggle in the search options menu
4. Send: "What are today's top news headlines?"
5. Verify: The model calls the `web_search` tool and returns real results with sources, instead of saying "I don't have web access"

- [ ] **Step 3: Test web search with Anthropic model**

1. Switch to an Anthropic model (e.g., `claude-sonnet-4-20250514`)
2. Keep Web Search enabled
3. Send: "What's the latest news about AI?"
4. Verify: Same behavior — tool is called, results returned

- [ ] **Step 4: Test chat without web search**

1. Disable Web Search toggle
2. Send a normal question: "Explain what a binary tree is"
3. Verify: Normal chat response, no tool calls, no regressions

- [ ] **Step 5: Test model with native web search capability**

1. If available, select a model with native `webSearch` capability (e.g., Perplexity model)
2. Enable Web Search toggle
3. Send a query
4. Verify: Custom `web_search` tool is NOT injected (model uses its native capability)
