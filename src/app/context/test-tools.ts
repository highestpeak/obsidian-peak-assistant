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
import type { LLMStreamEvent } from "@/core/providers/types";
import { emptyUsage, mergeTokenUsage } from "@/core/providers/types";
import { DELTA_EVENT_TYPES, getDeltaEventDeltaText } from "@/core/providers/helpers/stream-helper";
import {
	KnowledgeIntuitionAgent,
	type KnowledgeIntuitionAgentResult,
	type KnowledgeIntuitionAgentOptions,
} from '@/service/agents/KnowledgeIntuitionAgent';
import {
	buildBackboneMap,
	type BackboneMapResult,
	type BuildBackboneMapOptions,
} from '@/service/search/index/helper/backbone';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { runClassifyPhase } from '@/service/agents/vault/phases/classify';
import { runDecomposePhase } from '@/service/agents/vault/phases/decompose';
import { runIntuitionFeedbackPhase } from '@/service/agents/vault/phases/intuitionFeedback';
import type { ClassifyResult, DecomposeResult } from '@/service/agents/vault/types';

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
 * Dev-only test tools for AI search agents (intuition, backbone).
 * Available as window.testAISearchTools when enableDevTools.
 */
export class AISearchAgentTestTools {
    /**
     * Run {@link KnowledgeIntuitionAgent}: backbone + folder digest prep → intuition recon (plan/tools/submit) → fixed markdown + JSON.
     * Also persists the result to SQLite (`knowledge_intuition_json`) so classify/intuitionFeedback phases can use it.
     * Requires indexed SQLite, TemplateManager, and models for knowledge-intuition prompts.
     *
     * @example
     * ```ts
     * await window.testAISearchTools.testKnowledgeIntuition({ userGoal: 'Map this vault for navigation' });
     * await window.testKnowledgeIntuition({ stopAt: 'prep' });
     * ```
     */
    async testKnowledgeIntuition(
        options?: KnowledgeIntuitionAgentOptions,
    ): Promise<{ result: KnowledgeIntuitionAgentResult | null; duration: number; eventCount: number }> {
        const start = Date.now();
        const ctx = AppContext.getInstance();
        const agent = new KnowledgeIntuitionAgent(ctx.manager);
        let result: KnowledgeIntuitionAgentResult | null = null;
        let eventCount = 0;
        for await (const _ev of streamWithStreamLog(
            agent.streamRun(options ?? {}, (r) => {
                result = r;
            }),
        )) {
            eventCount++;
        }
        const duration = Date.now() - start;
        // `onFinish` assigns `result`, but TS may not narrow `let` across the async loop; cast for safety.
        const snapshot = result as KnowledgeIntuitionAgentResult | null;
        // Persist after the stream completes.
        if (snapshot != null && sqliteStoreManager.isInitialized()) {
            try {
                const stateRepo = sqliteStoreManager.getIndexStateRepo();
                await stateRepo.set('knowledge_intuition_json', JSON.stringify(snapshot.json));
                console.debug('[testKnowledgeIntuition] Persisted knowledge_intuition_json to SQLite.');
            } catch (e) {
                console.error('[testKnowledgeIntuition] Failed to persist intuition map:', e);
            }
        }
        if (snapshot == null) {
            console.debug('[testKnowledgeIntuition]', { result: null, duration, eventCount });
        } else {
            console.debug('[testKnowledgeIntuition]', {
                duration,
                eventCount,
                markdownPreview: snapshot.markdown.slice(0, 2500),
                json: snapshot.json,
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
    /**
     * Run classify phase standalone. Measures latency and logs all events.
     *
     * @example
     * ```ts
     * await window.testAISearchTools.testClassify("搜索管道设计")
     * await window.testClassify("peakassistant search pipeline")
     * ```
     */
    async testClassify(query: string): Promise<{ result: ClassifyResult; duration: number; eventCount: number }> {
        const start = Date.now();
        const ctx = AppContext.getInstance();
        const gen = runClassifyPhase({
            userQuery: query,
            aiServiceManager: ctx.manager,
            stepId: 'test-classify',
        });

        let eventCount = 0;
        let iterResult: IteratorResult<LLMStreamEvent, ClassifyResult>;
        while (!(iterResult = await gen.next()).done) {
            console.debug('[testClassify] event:', iterResult.value.type, iterResult.value);
            eventCount++;
        }

        const classifyResult = iterResult.value;
        const duration = Date.now() - start;
        console.debug('[testClassify]', { duration, eventCount, result: classifyResult });
        return { result: classifyResult, duration, eventCount };
    }

    /**
     * Run classify → decompose → intuitionFeedback and report per-phase timings.
     *
     * @example
     * ```ts
     * await window.testPipelinePhases("搜索管道设计")
     * ```
     */
    async testPipelinePhases(query: string) {
        const ctx = AppContext.getInstance();
        const mgr = ctx.manager;
        const stepId = 'test-pipeline';
        const timings: Record<string, number> = {};

        // Phase 1: Classify
        let t = Date.now();
        const classifyGen = runClassifyPhase({ userQuery: query, aiServiceManager: mgr, stepId });
        let r1: IteratorResult<any, ClassifyResult>;
        while (!(r1 = await classifyGen.next()).done) {}
        const classify = r1.value;
        timings.classify = Date.now() - t;
        console.debug('[testPipeline] classify:', timings.classify, 'ms', {
            semantic: classify.semantic_dimensions.length,
            topology: classify.topology_dimensions.length,
            temporal: classify.temporal_dimensions.length,
        });

        // Phase 2: Decompose
        t = Date.now();
        const decomposeGen = runDecomposePhase({ userQuery: query, classify, aiServiceManager: mgr, stepId });
        let r2: IteratorResult<any, DecomposeResult>;
        while (!(r2 = await decomposeGen.next()).done) {}
        const decompose = r2.value;
        timings.decompose = Date.now() - t;
        console.debug('[testPipeline] decompose:', timings.decompose, 'ms', {
            taskCount: decompose.tasks.length,
            tasks: decompose.tasks.map((t: any) => t.description?.slice(0, 60)),
        });

        // Phase 2.5: IntuitionFeedback (no LLM)
        t = Date.now();
        const ifGen = runIntuitionFeedbackPhase({ classify, stepId });
        let r3: IteratorResult<any, any>;
        while (!(r3 = await ifGen.next()).done) {}
        timings.intuitionFeedback = Date.now() - t;

        const total = Object.values(timings).reduce((a, b) => a + b, 0);
        console.debug('[testPipeline] TIMINGS:', timings, 'TOTAL:', total, 'ms');
        return { classify, decompose, timings, total };
    }

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
