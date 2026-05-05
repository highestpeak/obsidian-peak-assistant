# Restore Vercel AI SDK for Multi-Provider Chat

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Vercel AI SDK as the chat/simple-call path so all providers (OpenAI, Gemini, Ollama, etc.) work again. Agent SDK remains for tool-using agent flows only.

**Architecture:** Dual-track LLM dispatch. Context pipeline output (`LLMRequestMessage[]`) routes to Vercel AI SDK for chat or Agent SDK for agents, based on the active role profile.

**Tech Stack:** Vercel AI SDK v5 (`ai`, `@ai-sdk/*`), existing ContextPipeline, ProfileRegistry with new Chat role

---

## Context

Provider v2 (commit `9f293a4`) deleted the Vercel AI SDK stack (~3500 lines, 12 files) and routed ALL LLM calls through Claude Agent SDK. This broke non-Claude providers entirely.

**What we're restoring:** The adapter layer between plugin types and Vercel AI SDK. The plugin's own types (`LLMRequestMessage`, `LLMStreamEvent`, etc.) are already standalone in `src/core/providers/types.ts` — no type changes needed.

**What we're NOT restoring:** The full `MultiProviderChatService` singleton pattern. Instead, we build a simpler `VercelChatClient` that takes a profile and streams.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/core/providers/vercel/vercel-adapter.ts` | **Create** | Convert `LLMRequestMessage[]` → Vercel AI SDK format, stream back `LLMStreamEvent` |
| `src/core/providers/vercel/provider-factory.ts` | **Create** | `Profile` → Vercel `LanguageModel` instance |
| `src/core/providers/vercel/index.ts` | **Create** | Public API: `vercelStreamChat(profile, request)` |
| `src/core/profiles/ProfileRegistry.ts` | **Modify** | Add `activeChatConfig` role |
| `src/core/profiles/types.ts` | **Modify** | Add `'chat'` to role types if needed |
| `src/service/chat/service-conversation.ts` | **Modify** | Branch `streamChat`: Chat profile → Vercel, Agent profile → Agent SDK |
| `src/service/chat/service-manager.ts` | **Modify** | `queryText`/`queryStructured` branch: Chat profile → Vercel, else → Agent SDK |
| `src/ui/view/settings/components/StatusBar.tsx` | **Modify** | Add 4th role selector "Chat" |
| `package.json` | **Modify** | Restore npm deps |

---

## Task 1: Restore npm dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install Vercel AI SDK packages**

```bash
npm install ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google @ai-sdk/perplexity @openrouter/ai-sdk-provider ollama-ai-provider-v2
```

- [ ] **Step 2: Verify build still passes**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: restore Vercel AI SDK dependencies for multi-provider chat"
```

---

## Task 2: Create provider factory

**Files:**
- Create: `src/core/providers/vercel/provider-factory.ts`

Maps a `Profile` to a Vercel AI SDK `LanguageModel` instance. Recovers the logic from the deleted `src/core/providers/base/*.ts` files but in a single file.

- [ ] **Step 1: Create provider-factory.ts**

```typescript
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createPerplexity } from '@ai-sdk/perplexity';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { ollama } from 'ollama-ai-provider-v2';
import type { LanguageModel } from 'ai';
import type { Profile } from '@/core/profiles/types';

/**
 * Create a Vercel AI SDK LanguageModel from a Profile + modelId.
 * Throws if provider is unsupported.
 */
export function createLanguageModel(profile: Profile, modelId: string): LanguageModel {
    const { kind, baseUrl, apiKey } = profile;

    switch (kind) {
        case 'anthropic': {
            const provider = createAnthropic({
                baseURL: baseUrl || undefined,
                apiKey: apiKey ?? undefined,
            });
            return provider(modelId);
        }
        case 'openai': {
            const provider = createOpenAI({
                baseURL: baseUrl || undefined,
                apiKey: apiKey ?? undefined,
            });
            return provider(modelId);
        }
        case 'google': {
            const provider = createGoogleGenerativeAI({
                baseURL: baseUrl || undefined,
                apiKey: apiKey ?? undefined,
            });
            return provider(modelId);
        }
        case 'perplexity': {
            const provider = createPerplexity({
                apiKey: apiKey ?? undefined,
            });
            return provider(modelId);
        }
        case 'openrouter': {
            const provider = createOpenRouter({
                baseURL: baseUrl || undefined,
                apiKey: apiKey ?? undefined,
            });
            return provider(modelId);
        }
        case 'ollama': {
            return ollama(modelId);
        }
        case 'litellm':
        case 'custom': {
            // LiteLLM and custom use OpenAI-compatible API
            const provider = createOpenAI({
                baseURL: baseUrl || undefined,
                apiKey: apiKey ?? undefined,
            });
            return provider(modelId);
        }
        default:
            throw new Error(`Unsupported provider kind: ${kind}`);
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/providers/vercel/provider-factory.ts
git commit -m "feat(vercel): add provider factory — Profile to LanguageModel"
```

---

## Task 3: Create Vercel adapter

**Files:**
- Create: `src/core/providers/vercel/vercel-adapter.ts`

Converts `LLMRequestMessage[]` to Vercel AI SDK format and translates stream events back. Recovered from deleted `ai-sdk-adapter.ts` but simplified.

- [ ] **Step 1: Create vercel-adapter.ts**

This file handles:
1. `toAiSdkMessages(messages: LLMRequestMessage[])` → Vercel `CoreMessage[]`
2. `streamChat(model, messages, options)` → `AsyncGenerator<LLMStreamEvent>`

Key conversions from `LLMRequestMessage.MessagePart`:
- `{ type: 'text' }` → `{ type: 'text', text }`
- `{ type: 'image' }` → `{ type: 'image', image: data }`
- `{ type: 'reasoning' }` → skip (not all providers support it)
- `{ type: 'tool-call' }` → `{ type: 'tool-call', toolCallId, toolName, args }`
- `{ type: 'tool-result' }` → `{ type: 'tool-result', toolCallId, result }`

Stream event translation (from Vercel `fullStream`):
- `text-delta` → `{ type: 'text-delta', text }`
- `reasoning-delta` → `{ type: 'reasoning-delta', text }`
- `finish` → `{ type: 'complete', usage, finishReason }`
- `error` → `{ type: 'error', error }`

Reference: the deleted file at `git show 9f293a4 -- src/core/providers/adapter/ai-sdk-adapter.ts`

- [ ] **Step 2: Commit**

```bash
git add src/core/providers/vercel/vercel-adapter.ts
git commit -m "feat(vercel): add adapter — LLMRequestMessage to AI SDK format with stream translation"
```

---

## Task 4: Create public API

**Files:**
- Create: `src/core/providers/vercel/index.ts`

- [ ] **Step 1: Create index.ts — single entry point**

```typescript
import type { LanguageModel } from 'ai';
import type { Profile } from '@/core/profiles/types';
import type { LLMRequestMessage, LLMStreamEvent, LLMOutputControlSettings } from '@/core/providers/types';
import { createLanguageModel } from './provider-factory';
import { streamChat as adapterStreamChat } from './vercel-adapter';

export interface VercelChatRequest {
    messages: LLMRequestMessage[];
    outputControl?: LLMOutputControlSettings;
    abortSignal?: AbortSignal;
}

/**
 * Stream a chat completion via Vercel AI SDK.
 * Works with any provider supported by the profile's kind.
 */
export async function* vercelStreamChat(
    profile: Profile,
    modelId: string,
    request: VercelChatRequest,
): AsyncGenerator<LLMStreamEvent> {
    const model = createLanguageModel(profile, modelId);
    yield* adapterStreamChat(model, request.messages, {
        outputControl: request.outputControl,
        abortSignal: request.abortSignal,
    });
}

/**
 * Blocking text completion via Vercel AI SDK.
 */
export async function vercelGenerateText(
    profile: Profile,
    modelId: string,
    messages: LLMRequestMessage[],
    outputControl?: LLMOutputControlSettings,
): Promise<string> {
    let text = '';
    for await (const event of vercelStreamChat(profile, modelId, { messages, outputControl })) {
        if (event.type === 'text-delta') text += event.text;
    }
    return text;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/providers/vercel/index.ts
git commit -m "feat(vercel): add public API — vercelStreamChat and vercelGenerateText"
```

---

## Task 5: Add Chat role to ProfileRegistry

**Files:**
- Modify: `src/core/profiles/ProfileRegistry.ts`
- Modify: `src/core/profiles/types.ts` (if needed)

- [ ] **Step 1: Add activeChatConfig field and accessors**

In `ProfileRegistry.ts`, add alongside the existing `activeAgentConfig`:

```typescript
private activeChatConfig: RoleConfig | null = null;

// In load():
this.activeChatConfig = settings.activeChatConfig ?? null;

// Accessors:
getActiveChatProfile(): Profile | null { ... }
getActiveChatConfig(): { profile: Profile; modelId: string } | null { ... }
setActiveChatConfig(config: RoleConfig | null): void { ... }

// In persist():
activeChatConfig: this.activeChatConfig,
```

Follow the exact same pattern as `activeAgentConfig`.

- [ ] **Step 2: Add Chat fallback — if no Chat config, use Agent config**

```typescript
getActiveChatProfile(): Profile | null {
    if (this.activeChatConfig) {
        return this.profiles.find(p => p.id === this.activeChatConfig!.profileId) ?? null;
    }
    // Fallback: use agent profile
    return this.getActiveAgentProfile();
}

getActiveChatConfig(): { profile: Profile; modelId: string } | null {
    if (this.activeChatConfig) {
        const profile = this.profiles.find(p => p.id === this.activeChatConfig!.profileId);
        if (profile) return { profile, modelId: this.activeChatConfig.modelId };
    }
    // Fallback: use agent config
    return this.getActiveAgentConfig();
}
```

- [ ] **Step 3: Commit**

```bash
git add src/core/profiles/ProfileRegistry.ts src/core/profiles/types.ts
git commit -m "feat(profiles): add Chat role to ProfileRegistry with agent fallback"
```

---

## Task 6: Add Chat selector to StatusBar

**Files:**
- Modify: `src/ui/view/settings/components/StatusBar.tsx`

- [ ] **Step 1: Add 4th RoleSelectorChip for Chat**

Between the existing Agent and Embedding selectors, add:

```tsx
<RoleSelectorChip
    role="chat"
    label="Chat"
    activeConfig={chatConfig}
    profiles={profiles}
    onSelect={(config) => { registry.setActiveChatConfig(config); bump(); }}
    onClear={() => { registry.setActiveChatConfig(null); bump(); }}
/>
```

And add `chatConfig` from registry:
```typescript
const chatConfig = registry.getActiveChatConfig();
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/view/settings/components/StatusBar.tsx
git commit -m "feat(settings): add Chat role selector to StatusBar"
```

---

## Task 7: Wire streamChat to dual dispatch

**Files:**
- Modify: `src/service/chat/service-conversation.ts:201-226`

This is the critical integration point. After `prepareChatRequest()` returns `prepared`, branch on profile kind.

- [ ] **Step 1: Replace the current Agent-SDK-only path with dual dispatch**

```typescript
// Current (lines 201-224): Agent SDK only
// Replace with:

const registry = ProfileRegistry.getInstance();
const chatConfig = registry.getActiveChatConfig();
if (!chatConfig) throw new Error('No active AI profile configured. Please set up a profile in Settings → Profiles.');

const { profile, modelId } = chatConfig;
const isAgentSdkProfile = profile.kind === 'anthropic' || profile.kind === 'openrouter';

if (isAgentSdkProfile) {
    // Agent SDK path (existing) — for Anthropic-compatible providers
    const systemMessages = prepared.prompt.filter(m => m.role === 'system');
    const systemPrompt = systemMessages.map(m =>
        Array.isArray(m.content) ? m.content.map((p: any) => p.text ?? '').join('') : String(m.content)
    ).join('\n');
    const nonSystemMessages = prepared.prompt.filter(m => m.role !== 'system');
    const userPrompt = nonSystemMessages.map(m => {
        const text = Array.isArray(m.content)
            ? m.content.map((p: any) => p.text ?? '').join('')
            : String(m.content);
        return `${m.role === 'user' ? 'Human' : 'Assistant'}: ${text}`;
    }).join('\n\n');

    const ctx = AppContext.getInstance();
    const sdkStream = queryWithProfile(ctx.app, ctx.plugin.manifest.id, profile, {
        prompt: userPrompt,
        systemPrompt,
        maxTurns: 1,
        allowedTools: [],
    });
    yield* translateSdkMessages(sdkStream);
} else {
    // Vercel AI SDK path — for all other providers
    const { vercelStreamChat } = await import('@/core/providers/vercel');
    yield* vercelStreamChat(profile, modelId, {
        messages: prepared.prompt,
        outputControl: prepared.outputControl,
    });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/service/chat/service-conversation.ts
git commit -m "feat(chat): dual dispatch — Vercel AI SDK for non-Claude, Agent SDK for Anthropic"
```

---

## Task 8: Wire service-manager simple calls to dual dispatch

**Files:**
- Modify: `src/service/chat/service-manager.ts`

The `queryText`, `queryTextStream`, `queryStream`, `queryStructured` methods currently always use Agent SDK. For non-Claude profiles, they should use Vercel AI SDK.

- [ ] **Step 1: Add a private helper method for dispatch decision**

```typescript
private isAgentSdkProfile(profile: Profile): boolean {
    return profile.kind === 'anthropic' || profile.kind === 'openrouter';
}
```

- [ ] **Step 2: Add Vercel path to queryText**

```typescript
async queryText(...): Promise<string> {
    const profile = this.requireActiveProfile();
    const { userPrompt, systemPrompt } = await this.resolvePromptPair(...);

    if (this.isAgentSdkProfile(profile)) {
        // existing Agent SDK path
        const messages = queryWithProfile(...);
        return collectText(messages);
    } else {
        // Vercel AI SDK path
        const { vercelGenerateText } = await import('@/core/providers/vercel');
        const messages: LLMRequestMessage[] = [
            { role: 'system', content: [{ type: 'text', text: systemPrompt }] },
            { role: 'user', content: [{ type: 'text', text: userPrompt }] },
        ];
        return vercelGenerateText(profile, profile.primaryModel, messages);
    }
}
```

Apply the same pattern to `queryTextStream`, `queryStream`, and `queryStructured`.

- [ ] **Step 3: Commit**

```bash
git add src/service/chat/service-manager.ts
git commit -m "feat(service-manager): dual dispatch for queryText/queryStructured"
```

---

## Task 9: Build, test, verify

- [ ] **Step 1: Build**

```bash
npm run build
```

- [ ] **Step 2: Manual test matrix**

| Test | Provider | Expected |
|------|----------|----------|
| Chat with Claude | Anthropic | Works (Agent SDK path) |
| Chat with GPT-4 | OpenAI | Works (Vercel path) |
| Chat with Ollama | Ollama | Works (Vercel path) |
| Copilot: Suggest Tags | Agent profile | Works (Agent SDK) |
| AI Analysis | Agent profile | Works (Agent SDK) |
| StatusBar: switch Chat model | Any | Dropdown shows models, selection persists |

- [ ] **Step 3: Commit any fixes**

---

## Out of Scope (future)

- Copilot/AI Analysis with non-Claude models (Agent SDK is Claude-only by design)
- Tool use in chat via Vercel AI SDK (possible but not needed now)
- Embedding provider selection per Vercel SDK (already works via direct HTTP)
