/**
 * VaultSearchAgent — harness-native shell for Vault Search.
 *
 * Runs the LLM through `runAgentLoop` (self-hosted harness) with the six
 * vault MCP tool implementations wrapped via `buildVaultHarnessTools`.
 * `vault_submit_plan` is the loop's stop condition (harness `stopWhen`).
 *
 * The Claude Agent SDK is still available as a library (for one-shot LLM
 * callers under `AIServiceManager`, and for the vault-sdk MCP servers used
 * by `webSearchTool` / other plumbing), but the Vault Search main route no
 * longer touches `queryWithProfile` — it drives the harness directly.
 *
 * Yields `LLMStreamEvent`s so the existing Quick Search event router
 * (`useEventRouter` → `dispatchEvent`) continues to work without change:
 *   - `pk-debug` `vault-sdk-starting` marks the start of the session
 *     (kept for parity with the SDK path — dispatcher keys off it to
 *     enter V2 mode).
 *   - `tool-call` / `tool-result` events keep the `mcp__vault__*` toolName
 *     naming so `dispatchEvent` continues to parse `vault_submit_plan`'s
 *     `plan_sections` / `follow_up_questions` / `proposed_outline`.
 *   - `text-delta` for any assistant text between tool rounds.
 *   - `complete` with usage + duration at the end.
 */

import type { AppHandle } from '@/core/ports/AppHandle';
import type { LLMStreamEvent, LLMUsage } from '@/core/providers/types';
import { StreamTriggerName } from '@/core/providers/types';
import type { SearchClient } from '@/service/search/SearchClient';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/core/types/prompt';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { TierController } from '@/service/agents/harness/tier/TierController';
import { defaultTierBindings } from '@/service/agents/harness/tier/bindings';
import { runAgentLoop } from '@/service/agents/harness/loop/AgentLoop';
import type { DebugTracePort } from '@/core/debug-trace';
import { attachHarnessDebugTrace } from '@/service/agents/harness/trace/debugTraceAdapter';
import { TraceBus } from '@/service/agents/harness/trace/events';
import type { StepResult, ToolCallTrace, ToolResultTrace } from '@/service/agents/harness/trace/events';
import type { ToolDef } from '@/service/agents/harness/tool/types';
import { ok, fail } from '@/service/agents/harness/tool/types';
import { z } from 'zod';
import {
    buildVaultHarnessTools,
    createSubmitPlanState,
    VAULT_SUBMIT_PLAN_TOOL_NAME,
} from '@/service/agents/vault/vaultHarnessTools';
import type { SubmitPlanFeedback, SubmitPlanInput, GrepHit } from '@/service/agents/vault-sdk/vaultMcpServer';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { queryWithProfile } from '@/service/agents/core/sdkAgentPool';
import { collectText } from '@/service/agents/core/sdkMessageAdapter';
import { TemplateManager } from '@/core/template/TemplateManager';

export interface VaultSearchAgentOptions {
    /** Override the default vault-sdk-playbook system prompt (used by ContinueAnalysisAgent). */
    systemPromptOverride?: string;
    /** Prefix prepended to the user query before sending to the agent (e.g. previous round context). */
    contextPrefix?: string;
}

export interface VaultSearchStartOptions {
    webEnabled?: boolean;
    signal?: AbortSignal;
}

/**
 * Harness tier: local-deep by default; TierController escalates to `online`
 * if step scores drop.
 */
export class VaultSearchAgent {
    private lastDebugRunId: string | null = null;

    constructor(
        private readonly app: AppHandle,
        private readonly pluginId: string,
        private readonly searchClient: SearchClient,
        private readonly aiServiceManager: AIServiceManager,
        private readonly options: VaultSearchAgentOptions = {},
        private readonly debugTracePort: DebugTracePort | null = null,
    ) {}

    getLastDebugRunId(): string | null {
        return this.lastDebugRunId;
    }

    async *startSession(
        userQuery: string,
        opts: VaultSearchStartOptions = {},
    ): AsyncGenerator<LLMStreamEvent> {
        const triggerName = StreamTriggerName.SEARCH_AI_AGENT;
        const startTs = Date.now();

        // 1. Pre-search context: folder intuition, global intuition, probe hits.
        const [folderIntuitions, globalIntuitionJson, probeHits] = await gatherPreSearchContext(
            userQuery,
            this.searchClient,
        );

        const vaultIntuitionSection = renderVaultIntuitionSection(folderIntuitions, globalIntuitionJson);
        const probeResultsSection = renderProbeSection(probeHits);

        // 2. System prompt: playbook or override + append context sections.
        let systemPrompt: string;
        if (this.options.systemPromptOverride) {
            const probeContext = [vaultIntuitionSection, probeResultsSection]
                .filter(Boolean)
                .join('\n\n');
            systemPrompt = probeContext
                ? `${this.options.systemPromptOverride}\n\n${probeContext}`
                : this.options.systemPromptOverride;
        } else {
            try {
                systemPrompt = await this.aiServiceManager.renderPrompt(
                    PromptId.VaultSdkPlaybook,
                    {
                        vaultIntuition: vaultIntuitionSection,
                        probeResults: probeResultsSection,
                        webEnabled: opts.webEnabled ? 'true' : '',
                    },
                );
            } catch (err) {
                console.error('[VaultSearchAgent] failed to render playbook prompt', err);
                yield errorEvent(err, triggerName);
                return;
            }
        }

        // 3. Tool wiring: reuse the harness-compatible vault tools + optional
        //    web search wrapper (SDK-library usage — allowed).
        const submitState = createSubmitPlanState();
        const searchFn = async (query: string, limit: number): Promise<GrepHit[]> => {
            const res = await this.searchClient.search({
                text: query,
                topK: limit,
                searchMode: 'hybrid',
                scopeMode: 'all',
                indexTenant: 'vault',
            } as Parameters<typeof this.searchClient.search>[0]);
            const items = (res.items ?? []) as Array<{ path: string; title?: string; score?: number }>;
            return items.map((i) => ({
                path: i.path,
                snippet: i.title ?? i.path,
                score: i.score ?? 0,
            }));
        };

        const onSubmitPlan = async (plan: SubmitPlanInput): Promise<SubmitPlanFeedback> => ({
            approved: true,
            adjustedPaths: plan.selected_paths,
            adjustedOutline: plan.proposed_outline,
        });

        const tools: ToolDef[] = buildVaultHarnessTools({
            app: this.app,
            searchFn,
            onSubmitPlan,
            analysisHistory: this.aiServiceManager.getAnalysisHistory(),
            submitState,
        });

        if (opts.webEnabled) {
            const webTool = buildHarnessWebSearchTool(this.app, this.pluginId);
            if (webTool) tools.push(webTool);
        }

        // 4. TierController — read bindings straight from harness settings.
        const harnessSettings = this.aiServiceManager.getHarnessSettings();
        const bindings = defaultTierBindings(harnessSettings);
        const loopId = `vault-${generateUuidWithoutHyphens()}`;
        let tierController: TierController;
        try {
            tierController = new TierController({
                bindings,
                policy: { preferred: 'local-deep' },
                loopId,
            });
        } catch (err) {
            yield errorEvent(err, triggerName);
            return;
        }

        // 5. Emit the SDK-parity `vault-sdk-starting` debug event so the
        //    Quick Search event router enters V2 mode.
        const currentTier = tierController.current();
        yield {
            type: 'pk-debug',
            debugName: 'vault-sdk-starting',
            triggerName,
            extra: {
                query: userQuery,
                loopId,
                tier: currentTier.tier,
                modelId: currentTier.modelId,
                providerId: currentTier.providerId,
            },
        } as LLMStreamEvent;

        // 6. Wire trace bus → LLMStreamEvent queue.
        const trace = new TraceBus();
        const events = new EventQueue<LLMStreamEvent>();

        // Debug: attach a DebugRun mirror on the same TraceBus so a Copy
        // debug trace affordance can render tool.call / model.call /
        // context.compact spans without touching the live pipeline.
        const debugRun = this.debugTracePort?.isEnabled()
            ? this.debugTracePort.startRun({
                surface: 'agent',
                capabilityId: 'harness.agent.loop',
            })
            : null;
        const debugAttached = debugRun
            ? attachHarnessDebugTrace({ bus: trace, debugRun })
            : null;

        trace.on('tool_call', (call: ToolCallTrace & { loopId: string; stepIndex: number }) => {
            events.push({
                type: 'tool-call',
                id: call.toolCallId,
                toolName: call.toolName,
                input: call.args ?? {},
                triggerName,
            } as LLMStreamEvent);
        });
        trace.on('tool_result', (res: ToolResultTrace & { loopId: string; stepIndex: number }) => {
            events.push({
                type: 'tool-result',
                id: res.toolCallId,
                toolName: res.toolName,
                output: res.ok
                    ? { content: [{ type: 'text', text: safeJson(res.payload) }] }
                    : { isError: true, content: [{ type: 'text', text: String(res.payload) }] },
                triggerName,
            } as LLMStreamEvent);
        });
        trace.on('step_finish', (step: StepResult) => {
            const text = step.text?.trim();
            if (text) {
                events.push({
                    type: 'text-delta',
                    text: step.text,
                    triggerName,
                } as LLMStreamEvent);
            }
        });

        const effectiveContent = this.options.contextPrefix
            ? `${this.options.contextPrefix}\n\n${userQuery}`
            : userQuery;

        // 7. Kick off the loop; drain events until it finishes.
        const runPromise = runAgentLoop({
            loopId,
            systemPrompt,
            initialMessages: [{ role: 'user', content: effectiveContent }],
            tools,
            tierController,
            trace,
            budget: { maxSteps: 20, maxTokens: 200_000, maxToolCalls: 40 },
            abortSignal: opts.signal,
            stopWhen: (step) =>
                step.toolResults.some(
                    (r) => r.toolName === VAULT_SUBMIT_PLAN_TOOL_NAME && r.ok === true,
                ),
        }).then(
            (result) => ({ ok: true as const, result }),
            (err) => ({ ok: false as const, err }),
        ).finally(() => {
            events.close();
            if (debugRun) {
                debugRun.mergeSummary({
                    loopId,
                    userQueryLength: userQuery.length,
                    triggerName,
                });
                debugRun.finish('completed');
                this.lastDebugRunId = debugRun.runId;
            }
            debugAttached?.detach();
        });

        while (true) {
            const next = await events.next();
            if (next.done) break;
            yield next.value;
        }

        const outcome = await runPromise;
        if (!outcome.ok) {
            yield errorEvent(outcome.err, triggerName);
            return;
        }

        const result = outcome.result;
        const usage = summariseUsage(result.steps);
        const durationMs = Date.now() - startTs;

        yield {
            type: 'complete',
            finishReason: result.finishReason === 'stop' ? 'stop' : 'error',
            usage,
            durationMs,
            triggerName,
            result: undefined,
        } as LLMStreamEvent;

        yield {
            type: 'pk-debug',
            debugName: 'vault-sdk-complete',
            triggerName,
            extra: {
                loopId,
                finishReason: result.finishReason,
                submittedPlans: submitState.plans.length,
                steps: result.steps.length,
                error: result.error,
            },
        } as LLMStreamEvent;
    }

    /**
     * The old SDK path exposed a HITL resume hook here. The harness path
     * auto-approves `vault_submit_plan` inside the loop itself, so there is
     * no pause to resume from. Kept as a no-op generator to preserve the
     * shape callers still reach for (see `useSearchSession.hitlCallback`).
     */
    async *continueWithFeedback(): AsyncGenerator<LLMStreamEvent> {
        return;
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function summariseUsage(steps: StepResult[]): LLMUsage {
    let inputTokens = 0;
    let outputTokens = 0;
    let totalTokens = 0;
    for (const step of steps) {
        inputTokens += step.promptTokens ?? 0;
        outputTokens += step.completionTokens ?? 0;
        totalTokens += step.totalTokens ?? 0;
    }
    return { inputTokens, outputTokens, totalTokens };
}

function errorEvent(err: unknown, triggerName: StreamTriggerName): LLMStreamEvent {
    return {
        type: 'error',
        error: err instanceof Error ? err : new Error(String(err)),
        triggerName,
    } as LLMStreamEvent;
}

function safeJson(payload: unknown): string {
    if (payload === null || payload === undefined) return '';
    if (typeof payload === 'string') return payload;
    try {
        return JSON.stringify(payload);
    } catch {
        return String(payload);
    }
}

function renderVaultIntuitionSection(
    folderIntuitions: Array<{ folderPath: string; docCount: number; oneLiner: string; topTags?: string[] }>,
    globalIntuitionJson: string | undefined,
): string {
    let out = '';
    if (folderIntuitions.length > 0) {
        const folderLines = folderIntuitions.slice(0, 20).map(
            (f) => `- **${f.folderPath}** (${f.docCount} docs): ${f.oneLiner}${f.topTags?.length ? `\n  Tags: ${f.topTags.join(', ')}` : ''}`,
        ).join('\n');
        out += `### Vault Structure\n${folderLines}\n\n`;
    }
    if (globalIntuitionJson) {
        const truncated = globalIntuitionJson.length > 3000
            ? globalIntuitionJson.slice(0, 3000) + '\n_(truncated)_'
            : globalIntuitionJson;
        out += `### Vault Understanding\n${truncated}\n`;
    }
    return out;
}

function renderProbeSection(probeHits: Array<{ path: string; title: string; score: number }>): string {
    if (probeHits.length === 0) return '';
    const hitLines = probeHits.map(
        (h) => `- [[${h.title}]] (${h.path}) — score: ${h.score.toFixed(3)}`,
    ).join('\n');
    return `### Relevant Files Found (pre-search)\n${hitLines}\n`;
}

async function gatherPreSearchContext(
    userQuery: string,
    searchClient: SearchClient,
): Promise<[
    Array<{ folderPath: string; docCount: number; oneLiner: string; topTags?: string[] }>,
    string | undefined,
    Array<{ path: string; title: string; score: number }>,
]> {
    return Promise.all([
        (async () => {
            try {
                if (!sqliteStoreManager.isInitialized()) return [];
                return await sqliteStoreManager.getMobiusNodeRepo('vault').listTopFoldersForSearchOrient(30);
            } catch { return []; }
        })(),
        (async () => {
            try {
                if (!sqliteStoreManager.isInitialized()) return undefined;
                return (await sqliteStoreManager.getIndexStateRepo().get('knowledge_intuition_json')) ?? undefined;
            } catch { return undefined; }
        })(),
        (async () => {
            try {
                const res = await searchClient.search({
                    text: userQuery,
                    topK: 15,
                    searchMode: 'hybrid',
                    scopeMode: 'all',
                    indexTenant: 'vault',
                } as Parameters<typeof searchClient.search>[0]);
                return (res.items ?? []).map((i: any) => ({
                    path: i.path as string,
                    title: (i.title ?? i.path.split('/').pop() ?? '') as string,
                    score: (i.score ?? 0) as number,
                }));
            } catch { return []; }
        })(),
    ]);
}

/**
 * Harness-shaped web search tool. Uses the SDK as a library
 * (`queryWithProfile` + `collectText`) — the routing itself is harness.
 */
function buildHarnessWebSearchTool(app: AppHandle, pluginId: string): ToolDef | null {
    const profile = ProfileRegistry.getInstance().getActiveWebSearchProfile();
    if (!profile) return null;
    return {
        name: 'mcp__web__web_search',
        description:
            'Search the web for up-to-date information, external knowledge, or facts not found in the vault. ' +
            'Use when the user asks about recent events, external products, public data, or anything beyond their personal notes.',
        source: 'mcp',
        kind: 'read',
        inputSchema: z.object({
            query: z.string().describe('The search query to look up on the web'),
        }),
        execute: async ({ query }: { query: string }) => {
            try {
                const tm = TemplateManager.getInstance();
                if (!tm) return fail('Web search is not available (template manager not bound).', false);
                const systemPrompt = await tm.render(PromptId.WebSearchToolSystem, {});
                const messages = queryWithProfile(app as any, pluginId, profile, {
                    prompt: query,
                    systemPrompt,
                    maxTurns: 1,
                });
                const text = await collectText(messages);
                return ok({ text: text || 'No results found.' });
            } catch (err) {
                return fail(err instanceof Error ? err.message : 'Web search failed', true);
            }
        },
    };
}

// ---------------------------------------------------------------------------
// EventQueue — bridges TraceBus (push) to async iteration (pull).
// ---------------------------------------------------------------------------

class EventQueue<T> {
    private queue: T[] = [];
    private waiters: Array<(v: IteratorResult<T>) => void> = [];
    private closed = false;

    push(value: T): void {
        if (this.closed) return;
        const waiter = this.waiters.shift();
        if (waiter) {
            waiter({ value, done: false });
            return;
        }
        this.queue.push(value);
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        for (const waiter of this.waiters) {
            waiter({ value: undefined as unknown as T, done: true });
        }
        this.waiters = [];
    }

    async next(): Promise<IteratorResult<T>> {
        if (this.queue.length > 0) {
            return { value: this.queue.shift() as T, done: false };
        }
        if (this.closed) {
            return { value: undefined as unknown as T, done: true };
        }
        return new Promise((resolve) => this.waiters.push(resolve));
    }
}
