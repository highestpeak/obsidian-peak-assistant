import {
    inspectNoteContextTool,
    graphTraversalTool,
    findPathTool,
    findKeyNodesTool,
    findOrphansTool,
    searchByDimensionsTool,
    exploreFolderTool,
    recentChangesWholeVaultTool,
    localSearchWholeVaultTool
} from "../../service/tools/search-graph-inspector";
import { AppContext } from "@/app/context/AppContext";
import { AgentContextManager, type ReplayState } from "@/service/agents/search-agent-helper/AgentContextManager";
import { MindFlowAgent } from "@/service/agents/search-agent-helper/MindFlowAgent";
import type { MindFlowPhase, MindFlowResult } from "@/service/agents/search-agent-helper/MindFlowAgent";
import { RawSearchAgent } from "@/service/agents/search-agent-helper/RawSearchAgent";
import { DashboardAgent } from "@/service/agents/search-agent-helper/DashboardAgent";
import type { LLMStreamEvent } from "@/core/providers/types";
import { emptyUsage, mergeTokenUsage, StreamTriggerName } from "@/core/providers/types";
import { DELTA_EVENT_TYPES, getDeltaEventDeltaText } from "@/core/providers/helpers/stream-helper";
import { generateUuidWithoutHyphens } from "@/core/utils/id-utils";

/**
 * Global test interface for search-graph-inspector tools
 * Available in browser DevTools as window.testGraphTools
 */
export class GraphInspectorTestTools {
    private tools: any;

    constructor() {
        this.tools = {
            inspect_note_context: inspectNoteContextTool(),
            graph_traversal: graphTraversalTool(),
            find_path: findPathTool(),
            find_key_nodes: findKeyNodesTool(),
            find_orphans: findOrphansTool(),
            search_by_dimensions: searchByDimensionsTool(),
            explore_folder: exploreFolderTool(),
            recent_changes_whole_vault: recentChangesWholeVaultTool(),
            local_search_whole_vault: localSearchWholeVaultTool(),
        };
    }

    /**
     * Execute a specific tool
     */
    async executeTool(name: string, params: any) {
        try {
            console.log(`🔍 Executing ${name} with params:`, params);
            if (!this.tools[name]) {
                throw new Error(`Tool ${name} not found`);
            }
            const result = await this.tools[name].execute(params);
            console.log('✅ Tool execution result:', JSON.stringify(result));
            return result;
        } catch (error) {
            console.error('❌ Tool execution failed:', error);
            throw error;
        }
    }

    // Convenience methods for each tool
    async inspectNote(notePath: string, includeSemantic = false, limit = 10, responseFormat = 'hybrid') {
        return this.executeTool('inspect_note_context', {
            note_path: notePath,
            limit: limit,
            include_semantic_paths: includeSemantic,
            response_format: responseFormat
        });
    }

    async graphTraversal(startPath: string, hops = 1, limit = 20, responseFormat = 'hybrid', includeSemantic = false, filters = undefined, sorter = undefined) {
        return this.executeTool('graph_traversal', {
            start_note_path: startPath,
            hops: hops,
            limit: limit,
            response_format: responseFormat,
            include_semantic_paths: includeSemantic,
            filters: filters,
            sorter: sorter
        });
    }

    async findPath(startPath: string, endPath: string, responseFormat = 'hybrid', limit = 10, includeSemantic = false) {
        return this.executeTool('find_path', {
            start_note_path: startPath,
            end_note_path: endPath,
            response_format: responseFormat,
            limit: limit,
            include_semantic_paths: includeSemantic
        });
    }

    async findKeyNodes(limit = 20, responseFormat = 'hybrid') {
        return this.executeTool('find_key_nodes', {
            limit: limit,
            response_format: responseFormat
        });
    }

    async findOrphans(limit = 20, responseFormat = 'hybrid') {
        return this.executeTool('find_orphans', {
            limit: limit,
            response_format: responseFormat
        });
    }

    async searchByDimensions(expression: string, limit = 20, responseFormat = 'hybrid') {
        return this.executeTool('search_by_dimensions', {
            boolean_expression: expression,
            limit: limit,
            response_format: responseFormat
        });
    }

    async exploreFolder(folderPath = "/", recursive = true, maxDepth = 2, responseFormat = 'hybrid') {
        return this.executeTool('explore_folder', {
            folderPath: folderPath,
            recursive: recursive,
            max_depth: maxDepth,
            response_format: responseFormat
        });
    }

    async getRecentChanges(limit = 20, responseFormat = 'hybrid') {
        return this.executeTool('recent_changes_whole_vault', {
            limit: limit,
            response_format: responseFormat
        });
    }

    async localSearch(
        query: string,
        searchMode: 'fulltext' | 'vector' | 'hybrid' = 'hybrid',
        limit = 20, responseFormat = 'hybrid'
    ) {
        return this.executeTool('local_search_whole_vault', {
            query: query,
            searchMode: searchMode,
            limit: limit,
            response_format: responseFormat,
            // Pass flattened params if needed, or let them be undefined
        });
    }

    // Utility methods
    async getAppInfo() {
        const app = AppContext.getInstance().app;
        return {
            vaultName: app.vault.getName(),
            vaultPath: app.vault.getRoot(),
            fileCount: app.vault.getFiles().length,
            plugin: AppContext.getInstance().plugin
        };
    }

    async listAllFiles(limit = 100) {
        const app = AppContext.getInstance().app;
        const files = app.vault.getFiles();
        return files.slice(0, limit).map(f => ({
            path: f.path,
            name: f.name,
            size: f.stat.size,
            mtime: new Date(f.stat.mtime).toISOString()
        }));
    }
}

/**
 * Consumes an LLM stream and re-yields the same events. While consuming:
 * - Consecutive delta events (text-delta, reasoning-delta, etc.) are concatenated and logged as one line when a non-delta arrives or stream ends.
 * - Other events are logged one-by-one in stream order.
 * Uses DELTA_EVENT_TYPES and getDeltaEventDeltaText from stream-helper.
 */
export async function* streamWithStreamLog(
    stream: AsyncGenerator<LLMStreamEvent>,
): AsyncGenerator<LLMStreamEvent> {
    let deltaBuffer: string[] = [];
    const allLog: any[] = [];
    
    const flushDelta = () => {
        if (deltaBuffer.length > 0) {
            const log = deltaBuffer.join('');
            allLog.push(log);
            console.log('[stream-delta]', log);
            deltaBuffer = [];
        }
    };
    let totalTokenUsage = emptyUsage();
    try {
        for await (const ev of stream) {
            if (DELTA_EVENT_TYPES.has(ev.type)) {
                deltaBuffer.push(getDeltaEventDeltaText(ev));
            } else {
                flushDelta();
                allLog.push(ev);
                console.log('[stream-event]', ev.type, JSON.stringify(ev));
            }
            if (ev.type === 'on-step-finish') {
                totalTokenUsage = mergeTokenUsage(totalTokenUsage, ev.usage);
            }
            yield ev;
        }
    } finally {
        flushDelta();
        allLog.push({type: 'total-token-usage', totalTokenUsage});
        console.log('[stream-all-log]', JSON.stringify(allLog));
    }
}

/**
 * Dev-only test tools for AISearchAgent and sub-agents (MindFlow, RawSearch, etc.).
 * Built from AppContext (manager, settings). Available as window.testAISearchTools when enableDevTools.
 */
export class AISearchAgentTestTools {
    /**
     * Run MindFlowAgent once with a user query and optional phase.
     * Uses a fresh AgentContextManager and AppContext.manager; returns last MindFlow result.
     */
    async testMindFlow(
        userQuery: string,
        phase: MindFlowPhase = 'pre-thought'
    ): Promise<any> {
        const ctx = AppContext.getInstance();
        const context = new AgentContextManager(ctx.manager);
        context.resetAgentMemory(userQuery);
        const mindFlowAgent = new MindFlowAgent({
            aiServiceManager: ctx.manager,
            context,
        });
        let eventCount = 0;
        for await (const _ev of streamWithStreamLog(mindFlowAgent.stream({ phase }))) {
            eventCount++;
        }
        const result = context.getSessionState()?.mindflowContext;
        return { result, eventCount };
    }

    /**
     * Run one or more ReAct rounds (MindFlow pre-thought → [RawSearch → emit sources → MindFlow post-thought]) without finish phase.
     * Use returned contextState as initialState to continue from a later round (e.g. paste in console).
     *
     * @param userQuery User query (used when not restoring from initialState).
     * @param opts.rounds Number of rounds to run (default 1).
     * @param opts.initialState State from previous run (getReplayState / return value's contextState); when set, skips pre-thought and runs from this state.
     * @param opts.startFromRound Optional 1-based round index hint when using initialState (for logging only).
     */
    async testOneReActRound(
        userQuery: string,
        opts?: { rounds?: number; initialState?: ReplayState; startFromRound?: number }
    ): Promise<{
        result: { mindflowContext?: MindFlowResult[]; debugSnapshot: any };
        eventCount: number;
        contextState: ReplayState;
    }> {
        const ctx = AppContext.getInstance();
        const context = new AgentContextManager(ctx.manager);
        const rounds = Math.max(0, opts?.rounds ?? 1);

        const innerOptions = {
            enableWebSearch: false,
            enableLocalSearch: true,
            analysisMode: 'vaultFull' as const,
        };
        const innerAgentCreateParams = {
            aiServiceManager: ctx.manager,
            context,
            options: innerOptions,
        };
        const searchAgent = new RawSearchAgent(innerAgentCreateParams);
        const mindFlowAgent = new MindFlowAgent({
            aiServiceManager: ctx.manager,
            context,
            options: { enableWebSearch: innerOptions.enableWebSearch },
        });
        const dashboardUpdateAgent = new DashboardAgent({
            ...innerAgentCreateParams,
            rawSearchAgent: searchAgent,
        });

        async function* combinedStream(): AsyncGenerator<LLMStreamEvent> {
            if (opts?.initialState != null) {
                context.restoreReplayState(opts.initialState);
                if (opts.startFromRound != null) {
                    console.log(`[testOneReActRound] Resuming from round ${opts.startFromRound}, running ${rounds} round(s).`);
                }
            } else {
                context.resetAgentMemory(userQuery);
                if (rounds > 0) {
                    yield* mindFlowAgent.stream({
                        stepId: generateUuidWithoutHyphens(),
                        phase: 'pre-thought',
                    });
                }
            }

            for (let r = 0; r < rounds; r++) {
                const progress = context.getLatestMindflowProgress();
                const instruction = (progress?.instruction ?? '').trim() || context.getInitialPrompt();
                const userOriginalQuery = context.getInitialPrompt();
                const existingFacts = context.getExistingFactClaimsForRawSearch().join('\n') || undefined;

                yield* searchAgent.stream({
                    prompt: instruction,
                    userOriginalQuery,
                    currentThoughtInstruction: progress?.instruction,
                    existing_facts: existingFacts,
                });

                yield* dashboardUpdateAgent.emitStreamingSourcesFromVerifiedPaths(StreamTriggerName.SEARCH_INSPECTOR_AGENT);

                yield* mindFlowAgent.stream({
                    stepId: generateUuidWithoutHyphens(),
                    phase: 'post-thought',
                });
            }
        }

        let eventCount = 0;
        for await (const _ev of streamWithStreamLog(combinedStream())) {
            eventCount++;
        }

        const result = {
            mindflowContext: context.getSessionState()?.mindflowContext,
            debugSnapshot: context.getDebugSnapshot(),
        };
        const contextState = context.getReplayState();
        return { result, eventCount, contextState };
    }
}
