import {
    inspectNoteContextTool,
    graphTraversalTool,
    hubLocalGraphTool,
    findPathTool,
    findKeyNodesTool,
    findOrphansTool,
    searchByDimensionsTool,
    exploreFolderTool,
    recentChangesWholeVaultTool,
    localSearchWholeVaultTool
} from "../../service/tools/search-graph-inspector";
import { AppContext } from "@/app/context/AppContext";
import { AgentContextManager } from "@/service/agents/search-agent-helper/AgentContextManager";
import { SlotRecallAgent } from "@/service/agents/search-agent-helper/SlotRecallAgent";
import { groupConsolidatedTasksGravity, taskLoadScore, type GroupingOptions } from "@/service/agents/search-agent-helper/helpers/gravityGrouping";
import type { ConsolidatedTaskWithId, DimensionChoice, EvidenceTaskGroup, PhysicalSearchTask, PhysicalTaskReconResult } from "@/core/schemas/agents/search-agent-schemas";
import type { LLMStreamEvent } from "@/core/providers/types";
import { emptyUsage, mergeTokenUsage } from "@/core/providers/types";
import { DELTA_EVENT_TYPES, getDeltaEventDeltaText } from "@/core/providers/helpers/stream-helper";
import { GroupContextAgent } from "@/service/agents/search-agent-helper/GroupContextAgent";
import { generateUuidWithoutHyphens } from "@/core/utils/id-utils";
import { weavePathsToContext } from "@/service/agents/search-agent-helper/helpers/weavePathsToContext";
import { ReconAgent } from "@/service/agents/search-agent-helper/RawSearchAgent";
import {
	HubDiscoveryAgent,
	type HubDiscoveryAgentLoopResult,
	type HubDiscoveryAgentOptions,
} from '@/service/agents/HubDiscoveryAgent';
import {
	buildBackboneMap,
	type BackboneMapResult,
	type BuildBackboneMapOptions,
} from '@/service/search/index/helper/backbone';

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
            hub_local_graph: hubLocalGraphTool(),
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
    const allLog: any[] = [];

    let totalTokenUsage = emptyUsage();
    try {
        for await (const ev of stream) {
            if (!DELTA_EVENT_TYPES.has(ev.type)) {
                allLog.push(ev);
            }
            console.debug('[stream-event]', ev.type, JSON.stringify(ev));
            if (ev.type === 'on-step-finish') {
                totalTokenUsage = mergeTokenUsage(totalTokenUsage, ev.usage);
            }
            yield ev;
        }
    } finally {
        allLog.push({ type: 'total-token-usage', totalTokenUsage });
        console.debug('[stream-all-log]', JSON.stringify(allLog));
    }
}

/**
 * Dev-only test tools for AISearchAgent slot pipeline.
 * Available as window.testAISearchTools when enableDevTools.
 */
export class AISearchAgentTestTools {
    /**
     * Run streamReconForPhysicalTask once for a single physical task.
     * Usage: pass a PhysicalSearchTask (e.g. from pk-debug physicalTaskResults, or build one). Optionally pass userQuery to set context; defaults to a short placeholder.
     * Returns { result, duration, eventCount }.
     */
    async testStreamReconForPhysicalTask(
        physicalTask: PhysicalSearchTask,
        userQuery: string = 'List relevant notes for the given dimensions.',
    ): Promise<{ result: PhysicalTaskReconResult | null; duration: number; eventCount: number }> {
        const start = Date.now();
        const ctx = AppContext.getInstance();
        const context = new AgentContextManager(ctx.manager);
        context.resetAgentMemory(userQuery);
        const agent = new ReconAgent(ctx.manager, context);
        let result: PhysicalTaskReconResult | null = null;
        let eventCount = 0;
        for await (const _ev of streamWithStreamLog(
            agent.streamReconForPhysicalTask(physicalTask, generateUuidWithoutHyphens(), (r) => { result = r; }),
        )) {
            eventCount++;
        }
        const duration = Date.now() - start;
        console.debug('[testStreamReconForPhysicalTask] result:', result, 'duration:', duration, 'eventCount:', eventCount);
        return { result, duration, eventCount };
    }

    /** Run SlotRecallAgent once with a user query; returns event count and slot coverage from context. */
    async testSlotRecall(userQuery: string, skipStreamSearchArchitect = false, skipSearch = true): Promise<any> {
        const start = Date.now();
        const ctx = AppContext.getInstance();
        const context = new AgentContextManager(ctx.manager);
        context.resetAgentMemory(userQuery);
        const agent = new SlotRecallAgent(ctx.manager, context);
        let eventCount = 0;
        for await (const _ev of streamWithStreamLog(agent.stream({ skipStreamSearchArchitect, skipSearch }))) {
            eventCount++;
        }
        const end = Date.now();
        const duration = end - start;
        return {
            debugSnapshot: context.getDebugSnapshot(),
            duration,
        };
    }

    /**
     * Test gravity-merge grouping with saved consolidator data (no full search run).
     * Available as window.testGroupingTools when enableDevTools.
     * Usage: paste consolidated_tasks from pk-debug "parallelSearchResultAfterTaskConsolidator", add taskId, then:
     *   await window.testGroupingTools.testGrouping(tasksWithIds, { maxEvidenceConcurrency: 12 })
     * Run gravity grouping on tasks (with optional graph affinity when DB is ready).
     * Returns { groups, groupCount, totalTasks, opts } and logs to console.
     */
    async testGroupConsolidatedTasksGravity(
        tasks: ConsolidatedTaskWithId[],
        opts: GroupingOptions = {},
    ): Promise<{ groups: ConsolidatedTaskWithId[][]; groupCount: number; totalTasks: number; opts: GroupingOptions }> {
        const withIds = tasks.map((t, i) =>
            'taskId' in t && t.taskId ? t : { ...t, taskId: `task-${i}` }
        ) as ConsolidatedTaskWithId[];
        const groups = await groupConsolidatedTasksGravity(withIds, opts);
        const totalScore = withIds.reduce((s, t) => s + taskLoadScore(t), 0);
        console.debug('[testGrouping] input tasks:', withIds.length, 'totalScore:', totalScore, 'opts:', opts);
        console.debug('[testGrouping] output groups:', groups);
        console.debug('[testGrouping] output groups stats:', groups.length, groups.map((g, i) => ({
            groupIndex: i,
            taskCount: g.length,
            score: g.reduce((s, t) => s + taskLoadScore(t), 0),
            paths: g.map((t) => t.path),
        })));
        return {
            groups,
            groupCount: groups.length,
            totalTasks: withIds.length,
            opts,
        };
    }

    async testGroupContextAgent(
        testData: {
            groups: ConsolidatedTaskWithId[][],
            dimensions: DimensionChoice[],
        }
    ): Promise<{ eventCount: number; evidenceGroups: EvidenceTaskGroup[] }> {
        const ctx = AppContext.getInstance();
        const context = new AgentContextManager(ctx.manager);
        const groupContextAgent = new GroupContextAgent(ctx.manager, context);
        let evidenceGroups: EvidenceTaskGroup[] = [];
        let eventCount = 0;
        for await (const _ev of streamWithStreamLog(
            groupContextAgent.streamAllGroupsContext({
                groups: testData.groups,
                dimensions: testData.dimensions,
                stepId: generateUuidWithoutHyphens(),
                onRefinementFinish: (eg) => { evidenceGroups = eg; },
            })
        )) {
            eventCount++;
        }
        console.debug('[testGroupContextAgent] evidenceGroups:', evidenceGroups);
        return {
            eventCount,
            evidenceGroups,
        };
    }

    async testGroupContextAgentWithSharedContext(
        testData: {
            groups: ConsolidatedTaskWithId[][],
        }
    ): Promise<any> {
        const { groups } = testData;
        const ctx = AppContext.getInstance();
        const tm = ctx.manager.getTemplateManager?.();
        const sharedContexts = await Promise.all(
            groups.map((tasks) => weavePathsToContext(tasks.map((t) => t.path), tm))
        );
        return {
            sharedContexts,
        };
    }

    /**
     * Run {@link HubDiscoveryAgent}: world snapshot → folder-hub recon (plan/tools/submit loop) → document-hub recon → SQL shortlist.
     * Requires indexed SQLite, TemplateManager, and models for hub-discovery prompts.
     *
     * @example Full run (DevTools console)
     * ```ts
     * await window.testAISearchTools.testFolderHubDiscovery({ userGoal: 'Find navigation anchors' });
     * // or shortcut:
     * await window.testFolderHubDiscovery({ userGoal: '…' });
     * ```
     *
     * @example Debug: stop after prep (no LLM recon)
     * ```ts
     * await window.testFolderHubDiscovery({ stopAt: 'prep' });
     * ```
     *
     * @example Debug: stop after folder recon only (skip document phase)
     * ```ts
     * await window.testFolderHubDiscovery({ stopAt: 'folder_hub' });
     * // same: stopAt: 'after_folder_recon'
     * ```
     *
     * @example Debug: stop after round N plan or after round N submit
     * `iteration` is 1-based. `folder_plan` stops after the folder plan step and host tool execution (before structured submit); `document_plan` stops after the document plan+tool step. Ensure caps are high enough.
     * ```ts
     * await window.testFolderHubDiscovery({ stopAt: { hook: 'folder_plan', iteration: 1 } });
     * await window.testFolderHubDiscovery({ stopAt: { hook: 'folder_submit', iteration: 1 } });
     * await window.testFolderHubDiscovery({ stopAt: { hook: 'document_plan', iteration: 1 } });
     * await window.testFolderHubDiscovery({ stopAt: { hook: 'document_submit', iteration: 2 } });
     * ```
     *
     * @example Debug: cap iteration counts (1–6 each)
     * ```ts
     * await window.testFolderHubDiscovery({
     *   folderReconMaxIterations: 1,
     *   documentReconMaxIterations: 1,
     * });
     * ```
     */
    async testFolderHubDiscovery(
        options?: HubDiscoveryAgentOptions,
    ): Promise<{ result: HubDiscoveryAgentLoopResult | null; duration: number; eventCount: number }> {
        const start = Date.now();
        const ctx = AppContext.getInstance();
        const agent = new HubDiscoveryAgent(ctx.manager);
        let result: HubDiscoveryAgentLoopResult | null = null;
        let eventCount = 0;
        for await (const _ev of streamWithStreamLog(
            agent.streamRun(
                {
                    ...options,
                },
                (r) => {
                    result = r;
                },
            ),
        )) {
            eventCount++;
        }
        const duration = Date.now() - start;
        // Omit huge `documentShortlist` from console only; full result is still returned.
        // `onFinish` assigns `result`, but TS may not narrow `let` across the async loop; cast for the log payload only.
        const snapshot = result as HubDiscoveryAgentLoopResult | null;
        if (snapshot == null) {
            console.debug('[testFolderHubDiscovery]', { result: null, duration, eventCount });
        } else {
            console.debug('[testFolderHubDiscovery]', {
                duration,
                eventCount,
                result: {
                    ...snapshot,
                    documentShortlist: undefined,
                    documentShortlistCount: snapshot.documentShortlist?.length ?? 0,
                },
            });
        }
        return { result, duration, eventCount };
    }

    /**
     * Builds deterministic backbone map: folder tree, optional virtual-* clusters, cross-folder highways.
     * No LLM. Requires indexed SQLite.
     *
     * @example
     * ```ts
     * await window.testBackboneMap();
     * await window.testAISearchTools.testBackboneMap({ maxDepth: 8, topBackboneEdges: 24 });
     * ```
     */
    async testBackboneMap(options?: BuildBackboneMapOptions): Promise<BackboneMapResult | null> {
        const ctx = AppContext.getInstance();
        if (ctx.isMockEnv) {
            console.debug('[testBackboneMap] skipped (mock env)');
            return null;
        }
        const start = Date.now();
        const result = await buildBackboneMap(options);
        const duration = Date.now() - start;
        console.debug('[testBackboneMap]', { duration, metrics: result.metrics, debug: result.debug });
        console.debug('[testBackboneMap] markdown (first 2500 chars):\n', result.markdown.slice(0, 2500));
        return result;
    }

}
