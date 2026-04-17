/**
 * VaultSearchAgentSDK — thin outer shell over Claude Agent SDK query() for
 * vault search. Replaces the old hand-rolled classify/decompose/recon
 * pipeline when settings.vaultSearch.useV2 is enabled.
 *
 * Flow:
 *   1. warmup() installs renderer compat patches + probes node binary
 *   2. startSession() reads Profile, builds vault MCP server, calls query()
 *   3. SDK messages → translated via sdkMessageAdapter → yielded as events
 *   4. When LLM calls submit_plan, HITL callback fires (auto-approve in v1)
 *
 * Task 11 of 2026-04-12-vault-search-agent-sdk-migration plan.
 */

import type { App } from 'obsidian';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { LLMStreamEvent } from '@/core/providers/types';
import { StreamTriggerName } from '@/core/providers/types';
import type { SearchClient } from '@/service/search/SearchClient';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { MyPluginSettings } from '@/app/settings/types';
import { PromptId } from '@/service/prompt/PromptId';
import { readProfileFromSettings, toAgentSdkEnv } from './vault-sdk/sdkProfile';
import {
    warmupSdkAgentPool,
    getCliPath,
    type NodeBinaryInfo,
} from './vault-sdk/sdkAgentPool';
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
    private nodeInfo: NodeBinaryInfo | null = null;

    constructor(private readonly options: VaultSearchAgentSdkOptions) {}

    /**
     * One-time setup: install renderer compat patches and probe for node
     * binary. Non-blocking on failure — the error is logged and startSession
     * will retry the warmup lazily.
     */
    async warmup(): Promise<void> {
        try {
            this.nodeInfo = await warmupSdkAgentPool(this.options.app, this.options.pluginId);
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

        // 1. Ensure warmup ran (idempotent); get real node binary
        if (!this.nodeInfo) {
            try {
                this.nodeInfo = await warmupSdkAgentPool(app, pluginId);
            } catch (err) {
                yield {
                    type: 'error',
                    error: err as Error,
                    triggerName,
                } as LLMStreamEvent;
                return;
            }
        }
        const nodeInfo = this.nodeInfo;

        // 2. Build env from Profile + merge runtime-required vars
        const profile = readProfileFromSettings(settings);
        let profileEnv: Record<string, string>;
        try {
            profileEnv = toAgentSdkEnv(profile);
        } catch (err) {
            yield {
                type: 'error',
                error: err as Error,
                triggerName,
            } as LLMStreamEvent;
            return;
        }

        const subprocessEnv: Record<string, string> = {
            ...profileEnv,
            PATH: process.env.PATH ?? '',
        };
        if (nodeInfo.isElectron) {
            subprocessEnv.ELECTRON_RUN_AS_NODE = '1';
        }

        // 3. Resolve cli.js path
        const cliPath = getCliPath(app, pluginId);

        // 4a. Load vault intuition + probe results (before renderPrompt so we can pass as context)
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

        // 4b. Load system prompt playbook (pass vault context as Handlebars vars)
        //     If systemPromptOverride is provided (e.g. ContinueAnalysisAgent), use it directly.
        //     Even so, still append probe results so the continue agent has vault context.
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

        // 5. Build the in-process MCP server with vault tools
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

        // 6. Announce start to UI
        yield {
            type: 'pk-debug',
            debugName: 'vault-sdk-starting',
            triggerName,
            extra: {
                query: userQuery,
                profile: profile.kind,
                model: profile.primaryModel,
                nodeBinary: nodeInfo.path,
                isElectron: nodeInfo.isElectron,
            },
        } as LLMStreamEvent;

        // 7. Call query() and pipe results through adapter
        const basePath = (app.vault.adapter as unknown as { getBasePath(): string }).getBasePath();
        // Prepend contextPrefix (previous round context) to user query if provided
        const effectivePrompt = this.options.contextPrefix
            ? `${this.options.contextPrefix}\n\n${userQuery}`
            : userQuery;

        let roundIndex = 0;
        try {
            const messages = query({
                prompt: effectivePrompt,
                options: {
                    pathToClaudeCodeExecutable: cliPath,
                    executable: nodeInfo.path as 'node',
                    executableArgs: [],
                    cwd: basePath,
                    maxTurns: 20,
                    systemPrompt,
                    allowedTools: [
                        'mcp__vault__vault_list_folders',
                        'mcp__vault__vault_read_folder',
                        'mcp__vault__vault_read_note',
                        'mcp__vault__vault_grep',
                        'mcp__vault__vault_wikilink_expand',
                        'mcp__vault__vault_submit_plan',
                    ],
                    disallowedTools: [
                        'Read',
                        'Write',
                        'Edit',
                        'Bash',
                        'Glob',
                        'Grep',
                        'WebSearch',
                        'WebFetch',
                        'AskUserQuestion',
                    ],
                    mcpServers: { vault: vaultMcpServer },
                    settingSources: [],
                    env: subprocessEnv,
                    includePartialMessages: true,
                } as Parameters<typeof query>[0]['options'],
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

                // Stop processing after vault_submit_plan — plan is ready, no need for more agent output
                if (planSubmitted) break;
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

        // 8. Emit complete event (triggers plan_ready in routeEvent if plan_sections exist)
        const totalDuration = Date.now() - startTs;
        yield {
            type: 'complete',
            triggerName,
            durationMs: totalDuration,
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
