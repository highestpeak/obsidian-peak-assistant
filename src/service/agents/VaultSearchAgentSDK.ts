/**
 * VaultSearchAgentSDK — thin outer shell over Claude Agent SDK query() for
 * vault search. This is the sole desktop search path (V1 pipeline removed).
 *
 * Flow:
 *   1. warmupPool() installs renderer compat patches + probes node binary
 *   2. startSession() resolves Profile, builds vault MCP server, calls queryWithProfile()
 *   3. SDK messages → translated via sdkMessageAdapter → yielded as events
 *   4. When LLM calls submit_plan, HITL callback fires (auto-approve in v1)
 *
 * Provider v2 Task 2: now delegates warmup + env materialization to shared sdkAgentPool.
 */

import type { App } from 'obsidian';
import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName } from '@/core/providers/types';
import type { SearchClient } from '@/service/search/SearchClient';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { MyPluginSettings } from '@/app/settings/types';
import type { Profile } from '@/core/profiles/types';
import { PromptId } from '@/service/prompt/PromptId';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { readProfileFromSettings } from './vault-sdk/sdkProfile';
import { warmupPool, queryWithProfile } from './core/sdkAgentPool';
import {
    buildVaultMcpServer,
    type GrepHit,
    type SubmitPlanFeedback,
    type SubmitPlanInput,
} from './vault-sdk/vaultMcpServer';
import { translateSdkMessage } from './vault-sdk/sdkMessageAdapter';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

export interface VaultSearchAgentSdkOptions {
    app: App;
    pluginId: string;
    searchClient: SearchClient;
    aiServiceManager: AIServiceManager;
    settings: MyPluginSettings;
    /** Override the default vault-sdk-playbook system prompt (used by ContinueAnalysisAgent). */
    systemPromptOverride?: string;
    /** Prefix prepended to the user query before sending to the SDK agent (e.g. previous round context). */
    contextPrefix?: string;
}

/**
 * Main shell. Constructed by VaultSearchAgent when the feature flag is on.
 */
export class VaultSearchAgentSDK {

    constructor(private readonly options: VaultSearchAgentSdkOptions) {}

    /**
     * One-time setup: install renderer compat patches and probe for node
     * binary. Non-blocking on failure — startSession retries lazily.
     */
    async warmup(): Promise<void> {
        try {
            await warmupPool();
        } catch (err) {
            console.error('[VaultSearchAgentSDK] warmup failed', err);
        }
    }

    /**
     * Start a vault search session. Yields LLMStreamEvents compatible with
     * the existing UI routing layer. Terminates when the SDK streams its
     * result message (which happens after the LLM calls submit_plan).
     *
     * HITL (v1): the submit_plan tool callback auto-approves. A later task
     * will wire this to the existing HITL modal.
     */
    async *startSession(userQuery: string): AsyncGenerator<LLMStreamEvent> {
        const { app, pluginId, searchClient, aiServiceManager, settings } = this.options;
        const triggerName = StreamTriggerName.SEARCH_AI_AGENT;
        const startTs = Date.now();

        // 1. Ensure pool is warmed up (idempotent)
        try {
            await warmupPool();
        } catch (err) {
            yield {
                type: 'error',
                error: err as Error,
                triggerName,
            } as LLMStreamEvent;
            return;
        }

        // 2. Resolve profile: prefer ProfileRegistry active profile, fall back to settings reader
        let profile: Profile;
        const registryProfile = ProfileRegistry.getInstance().getActiveAgentProfile();
        if (registryProfile) {
            profile = registryProfile;
        } else {
            // Legacy fallback: read from raw settings (until profiles are fully migrated)
            const legacyProfile = readProfileFromSettings(settings);
            profile = {
                id: '__legacy__',
                name: 'Legacy Settings',
                kind: legacyProfile.kind,
                enabled: true,
                createdAt: 0,
                baseUrl: legacyProfile.baseUrl,
                apiKey: legacyProfile.apiKey,
                authToken: legacyProfile.authToken,
                primaryModel: legacyProfile.primaryModel,
                fastModel: legacyProfile.fastModel,
                customHeaders: legacyProfile.customHeaders ?? {},
                embeddingEndpoint: null,
                embeddingApiKey: null,
                embeddingModel: null,
                icon: null,
                description: null,
            };
        }

        // 3a. Load vault intuition + probe results (before renderPrompt so we can pass as context)
        const [folderIntuitions, globalIntuitionJson, probeHits] = await Promise.all([
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
                        scopeMode: 'vault',
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

        // Build vault intuition section
        let vaultIntuitionSection = '';
        if (folderIntuitions.length > 0) {
            const folderLines = folderIntuitions.slice(0, 20).map(
                (f: any) => `- **${f.folderPath}** (${f.docCount} docs): ${f.oneLiner}${f.topTags?.length ? `\n  Tags: ${f.topTags.join(', ')}` : ''}`
            ).join('\n');
            vaultIntuitionSection += `### Vault Structure\n${folderLines}\n\n`;
        }
        if (globalIntuitionJson) {
            const truncated = globalIntuitionJson.length > 3000
                ? globalIntuitionJson.slice(0, 3000) + '\n_(truncated)_'
                : globalIntuitionJson;
            vaultIntuitionSection += `### Vault Understanding\n${truncated}\n`;
        }

        // Build probe results section
        let probeResultsSection = '';
        if (probeHits.length > 0) {
            const hitLines = probeHits.map(
                (h) => `- [[${h.title}]] (${h.path}) — score: ${h.score.toFixed(3)}`
            ).join('\n');
            probeResultsSection = `### Relevant Files Found (pre-search)\n${hitLines}\n`;
        }

        // 3b. Load system prompt playbook
        let systemPrompt: string;
        if (this.options.systemPromptOverride) {
            const probeContext = [vaultIntuitionSection, probeResultsSection].filter(Boolean).join('\n\n');
            systemPrompt = probeContext
                ? this.options.systemPromptOverride + '\n\n' + probeContext
                : this.options.systemPromptOverride;
        } else {
            try {
                systemPrompt = await aiServiceManager.renderPrompt(
                    PromptId.VaultSdkPlaybook,
                    {
                        vaultIntuition: vaultIntuitionSection,
                        probeResults: probeResultsSection,
                    },
                );
            } catch (err) {
                console.error('[VaultSearchAgentSDK] failed to load playbook prompt', err);
                yield {
                    type: 'error',
                    error: err as Error,
                    triggerName,
                } as LLMStreamEvent;
                return;
            }
        }

        // 4. Build the in-process MCP server with vault tools
        const searchFn = async (q: string, limit: number): Promise<GrepHit[]> => {
            const res = await searchClient.search({
                text: q,
                topK: limit,
                searchMode: 'hybrid',
                scopeMode: 'vault',
                indexTenant: 'vault',
            } as Parameters<typeof searchClient.search>[0]);
            const items = (res.items ?? []) as Array<{
                path: string;
                title?: string;
                score?: number;
            }>;
            return items.map((i) => ({
                path: i.path,
                snippet: i.title ?? i.path,
                score: i.score ?? 0,
            }));
        };

        const pendingSubmits: SubmitPlanInput[] = [];
        let planSubmitted = false;
        let sdkUsage: { inputTokens: number; outputTokens: number; totalTokens: number } | null = null;
        const onSubmitPlan = async (plan: SubmitPlanInput): Promise<SubmitPlanFeedback> => {
            pendingSubmits.push(plan);
            planSubmitted = true;
            return {
                approved: true,
                adjustedPaths: plan.selected_paths,
                adjustedOutline: plan.proposed_outline,
            };
        };

        const vaultMcpServer = buildVaultMcpServer({
            app,
            searchFn,
            onSubmitPlan,
        });

        // 5. Announce start to UI
        yield {
            type: 'pk-debug',
            debugName: 'vault-sdk-starting',
            triggerName,
            extra: {
                query: userQuery,
                profile: profile.kind,
                model: profile.primaryModel,
            },
        } as LLMStreamEvent;

        // 6. Call queryWithProfile() and pipe results through adapter
        const effectivePrompt = this.options.contextPrefix
            ? `${this.options.contextPrefix}\n\n${userQuery}`
            : userQuery;

        let roundIndex = 0;
        try {
            const messages = queryWithProfile(app, pluginId, profile, {
                prompt: effectivePrompt,
                systemPrompt,
                maxTurns: 20,
                allowedTools: [
                    'mcp__vault__vault_list_folders',
                    'mcp__vault__vault_read_folder',
                    'mcp__vault__vault_read_note',
                    'mcp__vault__vault_grep',
                    'mcp__vault__vault_wikilink_expand',
                    'mcp__vault__vault_submit_plan',
                ],
                disallowedTools: [
                    'AskUserQuestion',
                ],
                mcpServers: { vault: vaultMcpServer },
            });

            for await (const raw of messages) {
                const msg = raw as { type?: string };
                // Round markers help debugging in DevTools Console
                if (msg.type === 'assistant') {
                    roundIndex += 1;
                    try {
                        console.group(`[VaultSearchAgentSDK] round ${roundIndex}`);
                    } catch {
                        /* console.group may not exist in all environments */
                    }
                }
                console.log('[VaultSearchAgentSDK] message', raw);
                if (msg.type === 'user') {
                    try {
                        console.groupEnd();
                    } catch {
                        /* ignore */
                    }
                }

                const events = translateSdkMessage(raw, { triggerName, hasPartialMessages: true });
                for (const ev of events) {
                    yield ev;
                }

                // After plan is submitted, drain remaining messages to capture usage from result
                if (planSubmitted) {
                    if (msg.type === 'result') {
                        const resultMsg = raw as any;
                        if (resultMsg.usage) {
                            sdkUsage = {
                                inputTokens: resultMsg.usage.input_tokens ?? 0,
                                outputTokens: resultMsg.usage.output_tokens ?? 0,
                                totalTokens: (resultMsg.usage.input_tokens ?? 0) + (resultMsg.usage.output_tokens ?? 0),
                            };
                        }
                        break;
                    }
                    continue;
                }
            }
        } catch (err) {
            console.error('[VaultSearchAgentSDK] query error', err);
            yield {
                type: 'error',
                error: err as Error,
                triggerName,
            } as LLMStreamEvent;
            return;
        } finally {
            if (roundIndex > 0) {
                try {
                    console.groupEnd();
                } catch {
                    /* ignore */
                }
            }
        }

        // 7. Emit complete event (triggers plan_ready in routeEvent if plan_sections exist)
        const totalDuration = Date.now() - startTs;
        yield {
            type: 'complete',
            triggerName,
            durationMs: totalDuration,
            usage: sdkUsage ?? undefined,
            result: undefined,
        } as LLMStreamEvent;

        // Debug marker
        yield {
            type: 'pk-debug',
            debugName: 'vault-sdk-complete',
            triggerName,
            extra: {
                submittedPlans: pendingSubmits.length,
                totalPaths: pendingSubmits.flatMap((p) => p.selected_paths).length,
            },
        } as LLMStreamEvent;
    }
}
