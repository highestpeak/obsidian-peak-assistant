import { vaultGraphInspectorTool } from "../../service/tools/search-graph-inspector";
import { AppContext } from "@/app/context/AppContext";

/**
 * Global test interface for search-graph-inspector tools
 * Available in browser DevTools as window.testGraphTools
 */
export class GraphInspectorTestTools {
    private tool: any;

    constructor() {
        this.tool = vaultGraphInspectorTool();
    }

    /**
     * Execute any graph inspector tool
     */
    async execute(params: any) {
        try {
            console.log('🔍 Executing graph inspector tool with params:', params);
            const result = await this.tool.execute(params);
            console.log('✅ Tool execution result:', JSON.stringify(result));
            return result;
        } catch (error) {
            console.error('❌ Tool execution failed:', error);
            throw error;
        }
    }

    // Convenience methods for each tool
    async inspectNote(notePath: string, includeSemantic = false, limit = 10, responseFormat = 'hybrid') {
        return this.execute({
            mode: 'inspect_note_context',
            note_path: notePath,
            limit: limit,
            include_semantic_paths: includeSemantic,
            response_format: responseFormat
        });
    }

    async graphTraversal(startPath: string, hops = 1, limit = 20, responseFormat = 'hybrid', includeSemantic = false, filters = undefined, sorter = undefined) {
        return this.execute({
            mode: 'graph_traversal',
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
        return this.execute({
            mode: 'find_path',
            start_note_path: startPath,
            end_note_path: endPath,
            response_format: responseFormat,
            limit: limit,
            include_semantic_paths: includeSemantic
        });
    }

    async findKeyNodes(limit = 20, responseFormat = 'hybrid') {
        return this.execute({
            mode: 'find_key_nodes',
            limit: limit,
            response_format: responseFormat
        });
    }

    async findOrphans(limit = 20, responseFormat = 'hybrid') {
        return this.execute({
            mode: 'find_orphans',
            limit: limit,
            response_format: responseFormat
        });
    }

    async searchByDimensions(expression: string, limit = 20, responseFormat = 'hybrid') {
        return this.execute({
            mode: 'search_by_dimensions',
            boolean_expression: expression,
            limit: limit,
            response_format: responseFormat
        });
    }

    async exploreFolder(folderPath = "/", recursive = true, maxDepth = 2, responseFormat = 'hybrid') {
        return this.execute({
            mode: 'explore_folder',
            folderPath: folderPath,
            recursive: recursive,
            max_depth: maxDepth,
            response_format: responseFormat
        });
    }

    async getRecentChanges(limit = 20, responseFormat = 'hybrid') {
        return this.execute({
            mode: 'recent_changes_whole_vault',
            limit: limit,
            response_format: responseFormat
        });
    }

    async localSearch(
        query: string,
        searchMode: 'fulltext' | 'vector' | 'hybrid' = 'hybrid',
        limit = 20, responseFormat = 'hybrid'
    ) {
        return this.execute({
            mode: 'local_search_whole_vault',
            query: query,
            searchMode: searchMode,
            limit: limit,
            response_format: responseFormat
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
