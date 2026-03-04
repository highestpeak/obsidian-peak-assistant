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
import { AgentContextManager } from "@/service/agents/search-agent-helper/AgentContextManager";
import { SlotRecallAgent } from "@/service/agents/search-agent-helper/SlotRecallAgent";
import { groupConsolidatedTasksGravity, taskLoadScore, type GroupingOptions } from "@/service/agents/search-agent-helper/helpers/gravityGrouping";
import type { ConsolidatedTaskWithId } from "@/core/schemas/agents/search-agent-schemas";
import type { LLMStreamEvent } from "@/core/providers/types";
import { emptyUsage, mergeTokenUsage } from "@/core/providers/types";
import { DELTA_EVENT_TYPES, getDeltaEventDeltaText } from "@/core/providers/helpers/stream-helper";

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
            console.debug('[stream-delta]', log);
            deltaBuffer = [];
        }
    };
    let totalTokenUsage = emptyUsage();
    try {
        for await (const ev of stream) {
            if (DELTA_EVENT_TYPES.has(ev.type)) {
                console.debug('[stream-delta]', ev.type);
                deltaBuffer.push(getDeltaEventDeltaText(ev));
            } else {
                flushDelta();
                allLog.push(ev);
                console.debug('[stream-event]', ev.type, JSON.stringify(ev));
            }
            if (ev.type === 'on-step-finish') {
                totalTokenUsage = mergeTokenUsage(totalTokenUsage, ev.usage);
            }
            yield ev;
        }
    } finally {
        flushDelta();
        allLog.push({ type: 'total-token-usage', totalTokenUsage });
        console.debug('[stream-all-log]', JSON.stringify(allLog));
    }
}

/**
 * Dev-only test tools for AISearchAgent slot pipeline.
 * Available as window.testAISearchTools when enableDevTools.
 */
export class AISearchAgentTestTools {
    /** Run SlotRecallAgent once with a user query; returns event count and slot coverage from context. */
    async testSlotRecall(userQuery: string, skipSearch = true): Promise<any> {
        const start = Date.now();
        const ctx = AppContext.getInstance();
        const context = new AgentContextManager(ctx.manager);
        context.resetAgentMemory(userQuery);
        const agent = new SlotRecallAgent(ctx.manager, context);
        let eventCount = 0;
        for await (const _ev of streamWithStreamLog(agent.stream({ skipSearch }))) {
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
    async testGrouping(
        tasks: ConsolidatedTaskWithId[],
        opts: GroupingOptions = {},
    ): Promise<{ groups: ConsolidatedTaskWithId[][]; groupCount: number; totalTasks: number; opts: GroupingOptions }> {
        const withIds = tasks.map((t, i) =>
            'taskId' in t && t.taskId ? t : { ...t, taskId: `task-${i}` }
        ) as ConsolidatedTaskWithId[];
        const groups = await groupConsolidatedTasksGravity(withIds, opts);
        const totalScore = withIds.reduce((s, t) => s + taskLoadScore(t), 0);
        console.debug('[testGrouping] input tasks:', withIds.length, 'totalScore:', totalScore, 'opts:', opts);
        console.debug('[testGrouping] output groups:', groups.length, groups.map((g, i) => ({
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
}
