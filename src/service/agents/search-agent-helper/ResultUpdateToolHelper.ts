import { AppContext } from "@/app/context/AppContext";
import { SearchAgentResult } from "../AISearchAgent";
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import {
    createUpdateResultTool,
    UpdateResultToolConfig,
    NO_MEANINGFUL_CONTENT_MESSAGE,
    DEFAULT_PLACEHOLDER,
    BuildIdentityKeyFn,
} from "@/service/tools/update-result-tool";
import { z } from "zod/v3";
import { StreamTriggerName } from "@/core/providers/types";
import { ManualToolCallHandler } from "@/service/tools/types";
import { DimensionUpdateAgent } from "./DimensionUpdateAgent";

export const DEFAULT_NODE_TYPE = 'document';

export type ResultUpdateDimension = 'sources' | 'topics' | 'graph' | 'dashboardBlocks';

const DIMENSION_FIELDS: Record<ResultUpdateDimension, string[]> = {
    sources: ['sources'],
    topics: ['topics'],
    graph: ['graph.nodes', 'graph.edges'],
    dashboardBlocks: ['dashboardBlocks'],
};

export function buildDimensionTool(
    dimension: ResultUpdateDimension,
    getResult: () => SearchAgentResult,
    verifiedPaths: Set<string>,
) {
    return createUpdateResultTool(buildDimensionConfig(dimension, getResult, verifiedPaths));
}

/**
 * Handler: try direct apply first; on failure call dimension agent to fix. Reduces LLM calls.
 */
export function makeDimensionManualToolHandler(
    dimension: ResultUpdateDimension, triggerName: StreamTriggerName, agent: DimensionUpdateAgent,
    getResult: () => SearchAgentResult,
    verifiedPaths: Set<string>,
): ManualToolCallHandler {
    const toolName = dimensionToToolName(dimension);
    const tool = buildDimensionTool(dimension, getResult, verifiedPaths);
    return {
        toolName,
        triggerName,
        outputGetter: (rc) => rc.result,
        handle: async function* (chunkInput: any, resultCollector: Record<string, any>) {
            const out = await tool.execute(chunkInput);
            if (!isApplyFailure(out)) {
                resultCollector.result = (out as any)?.result ?? (out as any)?.error ?? out;
                return;
            }
            const errMsg = (out as any)?.error ?? (out as any)?.result ?? '';
            const fixPrompt = `The direct apply failed: ${errMsg}. Original operations (JSON): ${JSON.stringify(chunkInput?.operations ?? chunkInput)}. Output a corrected JSON array of operations to fix the error.`;
            yield* agent.stream(fixPrompt, resultCollector);
            resultCollector.result = resultCollector.message ?? resultCollector.result ?? errMsg;
        },
    };
}

/**
 * Apply operations for a single dimension. Uses createUpdateResultTool under the hood.
 * For graph dimension: clones graph before apply, normalizes and validates after; rolls back on failure.
 * @returns { success, message } - message is the tool result string or error description.
 */
export async function applyOperationsForDimension(
    dimension: ResultUpdateDimension,
    getResult: () => SearchAgentResult,
    operations: any[],
    verifiedPaths: Set<string>
): Promise<{ success: boolean; message: string }> {
    const config = buildDimensionConfig(dimension, getResult, verifiedPaths);
    const tool = createUpdateResultTool(config);

    let snapshot: { nodes: any[]; edges: any[] } | undefined;
    if (dimension === 'graph') snapshot = cloneGraphForRollback(getResult());

    const rawOut = await tool.execute({ operations });
    const resultStr = (rawOut && typeof rawOut === 'object' && 'error' in rawOut)
        ? (rawOut as { error?: string }).error
        : (rawOut && typeof rawOut === 'object' && 'result' in rawOut)
            ? (rawOut as { result?: unknown }).result
            : rawOut;
    const message = typeof resultStr === 'string' ? resultStr : String(resultStr ?? '');

    if (dimension === 'graph') {
        normalizeAgentGraphInPlace(getResult());
        removeInvalidGraphEdges(getResult());
        const validation = validateGraphConsistency(getResult());
        if (!validation.isValid) {
            console.warn('[ResultUpdateToolHelper] Graph consistency issues:', validation.issues);
            getResult().graph = snapshot!;
            const msg = `Graph data consistency check failed. Issues: ${validation.issues.join('; ')}. You must fix these issues before proceeding.`;
            return { success: false, message: msg };
        }
        const isError = message.includes('failed to') || message.includes('GRAPH CONSISTENCY') || message.includes('consistency check failed');
        return { success: !isError, message };
    }

    const isError = message.includes('failed to') || message.includes('consistency check failed');
    return { success: !isError, message };
}

/**
 * Register paths from tool outputs as verified.
 * Called when processing vault_inspector or content_reader results.
 */
export function registerVerifiedPathsFromToolOutput(toolName: string, output: any, verifiedPaths: Set<string>): void {
    if (!output) return;

    try {
        // Handle structured output with results array (local_search, etc.)
        if (output.results && Array.isArray(output.results)) {
            for (const item of output.results) {
                if (item.path) {
                    verifiedPaths.add(item.path);
                }
            }
        }
        // Handle data.results pattern (hybrid mode)
        if (output.data?.results && Array.isArray(output.data.results)) {
            for (const item of output.data.results) {
                if (item.path) {
                    verifiedPaths.add(item.path);
                }
            }
        }
        // Handle graph nodes
        if (output.levels && Array.isArray(output.levels)) {
            for (const level of output.levels) {
                if (level.documentNodes && Array.isArray(level.documentNodes)) {
                    for (const node of level.documentNodes) {
                        // Graph nodes may have path in attributes
                        const attrs = typeof node.attributes === 'string'
                            ? JSON.parse(node.attributes)
                            : node.attributes;
                        if (attrs?.path) {
                            verifiedPaths.add(attrs.path);
                        }
                    }
                }
            }
        }
        // Handle content_reader responses
        if (toolName === 'content_reader' && typeof output === 'object' && output.path) {
            verifiedPaths.add(output.path);
        }
    } catch (error) {
        console.warn(`[AISearchAgent] Error extracting paths from tool output: ${error}`);
    }
}

/** Tool name for a dimension (Thought agent tool set key). */
function dimensionToToolName(dim: ResultUpdateDimension): string {
    return dim === 'dashboardBlocks' ? 'add_dashboard_blocks' : `update_${dim}`;
}

/**
 * Build full update-result config for search agent (all dimensions). Includes schemas and identity key strategy.
 * validatePath is built from verifiedPaths internally (read + mutate on success).
 */
function getFullUpdateResultConfig(
    getResult: () => any,
    verifiedPaths: Set<string>
): UpdateResultToolConfig {
    const validatePathFn = (path: string) => validatePath(path, verifiedPaths);
    const normalizeSpecialKey = (raw: unknown): string => {
        const text = String(raw ?? '').trim().toLowerCase();
        return text.replace(/[_\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    };
    const normalizeFilePath = (raw: unknown): string => String(raw ?? '').trim().replace(/^\/+/, '');
    const toFileNodeId = (path: string): string => `file:${normalizeFilePath(path)}`;
    const toConceptNodeId = (label: string): string => `concept:${normalizeSpecialKey(label)}`;
    const toTagNodeId = (label: string): string => `tag:${normalizeSpecialKey(label)}`;

    return {
        availableFields: [
            { name: 'topics', description: 'Array of key topics found during the search', type: 'array' },
            { name: 'sources', description: 'Array of source documents with metadata, scoring, and reasoning', type: 'array' },
            { name: 'graph.nodes', description: 'Knowledge graph nodes (files, concepts, tags, etc.)', type: 'array' },
            { name: 'graph.edges', description: 'Relationships between nodes (links, references, etc.)', type: 'array' },
            { name: 'dashboardBlocks', description: 'Dynamic blocks: inspiration tiles, markdown, action groups, Mermaid.', type: 'array' },
        ],
        itemSchemas: {
            topics: z.object({
                label: z.string().default(DEFAULT_PLACEHOLDER),
                weight: z.number().min(0).optional(),
            }).superRefine((data, ctx) => {
                if ((!data.label || data.label === DEFAULT_PLACEHOLDER) && (data.weight === undefined)) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: NO_MEANINGFUL_CONTENT_MESSAGE });
                }
            }),
            sources: z.object({
                id: z.string().default(() => `src:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
                title: z.string().default(DEFAULT_PLACEHOLDER),
                path: z.string().default(DEFAULT_PLACEHOLDER),
                reasoning: z.string().default(DEFAULT_PLACEHOLDER),
                badges: z.array(z.string()).default(() => []),
                score: z.preprocess(
                    (val) => (typeof val === 'number' ? { average: val } : val),
                    z.object({
                        physical: z.number().min(0).max(100).optional(),
                        semantic: z.number().min(0).max(100).optional(),
                        average: z.number().min(0).max(100).optional(),
                    }).optional()
                ),
            }).superRefine((data, ctx) => {
                if ((data.title === DEFAULT_PLACEHOLDER) && (!data.path || data.path === DEFAULT_PLACEHOLDER) &&
                    (!data.reasoning || data.reasoning === DEFAULT_PLACEHOLDER) && (!data.badges || data.badges.length === 0)) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: NO_MEANINGFUL_CONTENT_MESSAGE });
                }
            }),
            'graph.nodes': z.object({
                id: z.string().optional(),
                type: z.string().default(DEFAULT_NODE_TYPE),
                title: z.string().default(DEFAULT_PLACEHOLDER),
                label: z.string().default(DEFAULT_PLACEHOLDER),
                path: z.string().optional(),
                attributes: z.record(z.any()).default(() => ({})),
            }).transform((data) => {
                const d = data as any;
                const isPlaceholder = (s: string) => !s || s.trim() === '' || s === DEFAULT_PLACEHOLDER || s === 'Untitled';
                const type = String(d.type ?? 'document').trim().toLowerCase();
                d.type = type;
                if (type === 'document' || type === 'file') {
                    if (!d.path || isPlaceholder(String(d.path ?? ''))) {
                        const attrsPath = d?.attributes?.path;
                        if (attrsPath && !isPlaceholder(String(attrsPath))) d.path = attrsPath;
                    }
                    if (!d.path || isPlaceholder(String(d.path ?? ''))) {
                        const rawId = String(d.id ?? '').trim();
                        if (rawId.startsWith('file:')) {
                            const derivedPath = rawId.slice('file:'.length).replace(/^\/+/, '').trim();
                            if (derivedPath && !isPlaceholder(derivedPath)) d.path = derivedPath;
                        }
                    }
                }
                return d;
            }).superRefine((data, ctx) => {
                if (data.title && !data.label) (data as any).label = data.title;
                if (data.label && !data.title) (data as any).title = data.label;
                const type = String((data as any).type ?? 'document').trim().toLowerCase();
                (data as any).type = type;
                const isPlaceholder = (s: string) => !s || s.trim() === '' || s === DEFAULT_PLACEHOLDER || s === 'Untitled';
                if (type === 'document' || type === 'file') {
                    if (!data.path || isPlaceholder(String(data.path ?? ''))) {
                        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Document/file nodes must have a valid path.", path: ["path"] });
                        return;
                    }
                    const normalizedPath = normalizeFilePath(data.path);
                    (data as any).path = normalizedPath;
                    const expectedId = toFileNodeId(normalizedPath);
                    const id = String((data as any).id ?? '').trim();
                    if (!id || id === DEFAULT_PLACEHOLDER || id.startsWith('node:') || id.startsWith('src:')) (data as any).id = expectedId;
                    else if (id.startsWith('file:')) (data as any).id = toFileNodeId(id.slice('file:'.length));
                    else (data as any).id = expectedId;
                    // Derive title/label from path basename when missing or placeholder
                    if (isPlaceholder(String(data.title ?? '')) && isPlaceholder(String(data.label ?? ''))) {
                        const basename = normalizedPath.split('/').filter(Boolean).pop() ?? normalizedPath;
                        const displayName = basename.replace(/\.(md|markdown)$/i, '') || basename;
                        (data as any).title = displayName;
                        (data as any).label = displayName;
                    }
                } else if (type === 'concept' || type === 'tag') {
                    if (data.path === DEFAULT_PLACEHOLDER || data.path === 'Untitled') (data as any).path = undefined;
                    const rawLabel = String(data.label || data.title || '').trim();
                    if (isPlaceholder(rawLabel)) {
                        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Concept/tag nodes must have a non-empty label or title (not Untitled).", path: ["label"] });
                        return;
                    }
                    const expectedId = type === 'tag' ? toTagNodeId(rawLabel) : toConceptNodeId(rawLabel);
                    const id = String((data as any).id ?? '').trim();
                    if (!id || id === DEFAULT_PLACEHOLDER || id.startsWith('node:')) (data as any).id = expectedId;
                    else if (id.toLowerCase().startsWith('concept:')) (data as any).id = `concept:${normalizeSpecialKey(id.slice('concept:'.length))}`;
                    else if (id.toLowerCase().startsWith('tag:')) (data as any).id = `tag:${normalizeSpecialKey(id.slice('tag:'.length))}`;
                    else (data as any).id = expectedId;
                }
                if ((data.title === DEFAULT_PLACEHOLDER) && (data.label === DEFAULT_PLACEHOLDER) &&
                    (!data.path || data.path === DEFAULT_PLACEHOLDER) && (!data.attributes || Object.keys(data.attributes).length === 0)) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: NO_MEANINGFUL_CONTENT_MESSAGE });
                }
            }),
            'graph.edges': z.object({
                id: z.string().default(() => `edge:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
                source: z.string().optional(),
                sourceId: z.string().optional(),
                target: z.string().optional(),
                targetId: z.string().optional(),
                startNode: z.string().optional(),
                endNode: z.string().optional(),
                from_node_id: z.string().optional(),
                to_node_id: z.string().optional(),
                type: z.string().default('link'),
                label: z.string().default(''),
                attributes: z.record(z.any()).default(() => ({})),
            }).transform((data) => {
                const d = data as any;
                const source = String(d.source ?? d.sourceId ?? d.startNode ?? d.from_node_id ?? '').trim();
                const target = String(d.target ?? d.targetId ?? d.endNode ?? d.to_node_id ?? '').trim();
                const { sourceId, targetId, startNode, endNode, from_node_id, to_node_id, ...rest } = d;
                return { ...rest, source, target };
            }).refine((data) => data.source && data.target, { message: "source and target are required", path: ["source"] })
                .refine((data) => data.source !== data.target, { message: "source and target cannot be the same", path: ["source"] }),
            dashboardBlocks: z.object({
                id: z.string().default(() => `block:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
                title: z.string().optional(),
                category: z.string().optional(),
                slot: z.enum(['MAIN', 'SIDEBAR', 'FLOW']).default('MAIN'),
                weight: z.number().min(0).max(10).optional(),
                renderEngine: z.enum(['MARKDOWN', 'TILE', 'ACTION_GROUP', 'MERMAID']).default('MARKDOWN'),
                items: z.array(z.object({
                    id: z.string().default(() => `item:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
                    title: z.string().default(DEFAULT_PLACEHOLDER),
                    description: z.string().optional(),
                    icon: z.string().optional(),
                    color: z.string().optional(),
                })).optional(),
                markdown: z.string().optional(),
                mermaidCode: z.string().optional(),
            }).superRefine((data, ctx) => {
                const hasContent = (data.items?.length ?? 0) > 0 || (data.markdown?.trim()?.length ?? 0) > 0 || (data.mermaidCode?.trim()?.length ?? 0) > 0;
                if (!hasContent) ctx.addIssue({ code: z.ZodIssueCode.custom, message: NO_MEANINGFUL_CONTENT_MESSAGE });
            }),
        },
        result: getResult,
        validatePath: validatePathFn,
        verifiedPaths,
        buildIdentityKey: buildSearchIdentityKey,
    };
}

/** Identity key strategy for search-agent result dimensions (dedup/upsert). */
const buildSearchIdentityKey: BuildIdentityKeyFn = (targetField, item) => {
    if (!item || typeof item !== 'object') return null;
    const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
    const normPath = (v: unknown) => String(v ?? '').trim().replace(/^\/+/, '');
    const safeText = (v: unknown) => String(v ?? '').trim();

    switch (targetField) {
        case 'topics': {
            const label = safeText(item.label);
            return label ? `label:${norm(label)}` : null;
        }
        case 'sources': {
            const path = safeText(item.path);
            if (path && path !== DEFAULT_PLACEHOLDER) return `path:${normPath(path)}`;
            const id = safeText(item.id);
            return id ? `id:${id}` : null;
        }
        case 'dashboardBlocks': {
            const id = safeText(item.id);
            if (id && !id.startsWith('block:')) return `id:${id}`;
            const title = safeText(item.title ?? item.category);
            const slot = safeText(item.slot);
            const engine = safeText(item.renderEngine);
            const composite = `${title}\n${slot}\n${engine}`.trim();
            return composite ? `text:${norm(composite)}` : null;
        }
        case 'graph.nodes': {
            const path = safeText(item.path);
            if (path && path !== DEFAULT_PLACEHOLDER) return `path:${normPath(path)}`;
            const id = safeText(item.id);
            return id ? `id:${id}` : null;
        }
        case 'graph.edges': {
            const id = safeText(item.id);
            if (id && id.startsWith('edge:')) return `id:${id}`;
            const source = safeText(item.source);
            const target = safeText(item.target);
            if (!source || !target) return null;
            return `edge:${norm(source)}::${norm(target)}::${norm(item.type ?? '')}::${norm(item.label ?? '')}`;
        }
        default: {
            const id = safeText(item.id);
            return id ? `id:${id}` : null;
        }
    }
};

/** Build config for a single dimension (sources, topics, graph, dashboardBlocks). */
function buildDimensionConfig(
    dimension: ResultUpdateDimension,
    getResult: () => any,
    verifiedPaths: Set<string>
): UpdateResultToolConfig {
    const full = getFullUpdateResultConfig(getResult, verifiedPaths);
    const names = DIMENSION_FIELDS[dimension];
    return {
        ...full,
        availableFields: full.availableFields.filter(f => names.includes(f.name)),
        itemSchemas: Object.fromEntries(names.map(n => [n, full.itemSchemas[n]])),
    };
}

/**
 * Create a deep clone for graph rollback.
 * Graph is typically small (UI-limited), so JSON clone is acceptable here.
 */
function cloneGraphForRollback(agentResult: SearchAgentResult): { nodes: any[]; edges: any[] } {
    try {
        return JSON.parse(JSON.stringify(agentResult.graph));
    } catch {
        return { nodes: [...agentResult.graph.nodes], edges: [...agentResult.graph.edges] };
    }
}

/**
 * Normalize graph IDs/endpoints in-place to reduce invalid references.
 * - Document/file nodes use `file:${path}`.
 * - Concept/tag nodes use `concept:${slug}` / `tag:${slug}`.
 * - Edges normalize common endpoint variants (`src:` -> `file:`, `node:${path}` -> `file:`).
 */
function normalizeAgentGraphInPlace(agentResult: SearchAgentResult): void {
    const g = agentResult.graph;
    const normalizeSpecialKey = (raw: unknown): string => {
        const text = String(raw ?? '').trim().toLowerCase();
        return text
            .replace(/[_\s]+/g, '-') // whitespace/underscore -> dash
            .replace(/-+/g, '-') // collapse
            .replace(/^-|-$/g, ''); // trim dashes
    };
    const normalizeFilePath = (raw: unknown): string => String(raw ?? '').trim().replace(/^\/+/, '');
    const toFileId = (p: string): string => `file:${normalizeFilePath(p)}`;

    // Index concept/tag nodes by label for edge endpoint recovery.
    const conceptLabelToId = new Map<string, string>();
    const tagLabelToId = new Map<string, string>();

    const isPlaceholder = (s: string) => !s || s.trim() === '' || s === DEFAULT_PLACEHOLDER || s === 'Untitled';
    for (const n of g.nodes) {
        const type = String(n?.type ?? DEFAULT_NODE_TYPE).trim().toLowerCase();
        n.type = type;
        if ((type === DEFAULT_NODE_TYPE || type === 'file') && n?.path) {
            const p = normalizeFilePath(n.path);
            n.path = p;
            n.id = toFileId(p);
            if (isPlaceholder(String((n as any)?.title ?? '')) && isPlaceholder(String((n as any)?.label ?? ''))) {
                const basename = p.split('/').filter(Boolean).pop() ?? p;
                const displayName = basename.replace(/\.(md|markdown)$/i, '') || basename;
                (n as any).title = displayName;
                (n as any).label = displayName;
            }
            continue;
        }

        // todo we need to process more node types in the future, should not limit to concept and tag.
        if (type === 'concept' || type === 'tag') {
            let label = String((n as any)?.label || (n as any)?.attributes?.label || n?.title || '').trim();
            if (!label || isPlaceholder(label)) {
                const rawId = String((n as any)?.id ?? '').trim();
                const prefix = type === 'tag' ? 'tag:' : 'concept:';
                if (rawId.toLowerCase().startsWith(prefix)) {
                    label = rawId.slice(prefix.length).replace(/-/g, ' ').trim();
                }
            }
            if (!label || isPlaceholder(label)) continue;
            const key = normalizeSpecialKey(label);
            const id = type === 'tag' ? `tag:${key}` : `concept:${key}`;
            n.id = id;
            // Persist the human-readable label in `title` (GraphPreview uses title).
            n.title = label || n.title;
            if (type === 'tag') tagLabelToId.set(label.toLowerCase(), id);
            else conceptLabelToId.set(label.toLowerCase(), id);
        }
    }

    const nodeIds = new Set(g.nodes.map(n => String(n.id)));

    const normalizeEndpoint = (raw: unknown): string => {
        const id = String(raw ?? '').trim();
        if (!id) return id;

        // src:path is often used for sources; normalize to file:path for graph nodes.
        if (id.startsWith('src:')) return toFileId(id.slice('src:'.length));

        // Normalize special ids.
        const lower = id.toLowerCase();
        if (lower.startsWith('concept:')) return `concept:${normalizeSpecialKey(id.slice('concept:'.length))}`;
        if (lower.startsWith('tag:')) return `tag:${normalizeSpecialKey(id.slice('tag:'.length))}`;

        // node:path -> file:path (common mistake).
        if (lower.startsWith('node:')) {
            const rest = id.slice('node:'.length).trim();
            if (rest.includes('/') || rest.endsWith('.md')) return toFileId(rest);
            // node:Label -> concept:slug (best-effort)
            const asConcept = `concept:${normalizeSpecialKey(rest)}`;
            return asConcept;
        }

        // Bare label recovery for concept/tag nodes.
        if (!id.includes(':')) {
            const k = id.toLowerCase();
            if (conceptLabelToId.has(k)) return conceptLabelToId.get(k)!;
            if (tagLabelToId.has(k)) return tagLabelToId.get(k)!;
            return `concept:${normalizeSpecialKey(id)}`;
        }

        // Keep file:path stable (trim leading slashes).
        if (lower.startsWith('file:')) return toFileId(id.slice('file:'.length));

        return id;
    };

    for (const e of g.edges) {
        const source = normalizeEndpoint(e?.source);
        const target = normalizeEndpoint(e?.target);
        e.source = source;
        e.target = target;

        // Drop obviously invalid endpoints by aligning to existing nodes when possible.
        // If normalization still doesn't resolve, keep as-is; validation+rollback will handle it.
    }

    // Recompute nodeIds after edge normalization can potentially introduce new ids
    // that are not present. We intentionally don't auto-create nodes here; schema
    // should add them explicitly, or the rollback will keep graph clean.
    void nodeIds;
}

/**
 * Validate that a path exists in the vault/DB or was seen in tool outputs.
 * This is the core of EvidenceGate - preventing hallucinated paths.
 */
async function validatePath(path: string, verifiedPaths: Set<string>): Promise<{ valid: boolean; reason?: string; resolvedPath?: string }> {
    const normPath = (p: string) => p.trim().replace(/^\/+/, '');

    // Check if path was already verified (appeared in tool outputs)
    if (verifiedPaths.has(path)) {
        return { valid: true };
    }

    // Check if path exists in DB
    try {
        const docMetaRepo = sqliteStoreManager.getDocMetaRepo();
        const docMeta = await docMetaRepo.getByPath(path);
        if (docMeta) {
            verifiedPaths.add(path);
            return { valid: true };
        }
    } catch (error) {
        console.warn(`[AISearchAgent] Error checking path in DB: ${error}`);
    }

    // Check if file exists in vault
    try {
        const app = AppContext.getInstance().app;
        const file = app.vault.getAbstractFileByPath(path);
        if (file) {
            verifiedPaths.add(path);
            return { valid: true };
        }
    } catch (error) {
        console.warn(`[AISearchAgent] Error checking path in vault: ${error}`);
    }

    // Basename resolution: LLM may output only filename (e.g. "如何写简历.md") while verifiedPaths has full path
    const pathNorm = normPath(path);
    if (pathNorm && !pathNorm.includes('/')) {
        const matches = Array.from(verifiedPaths).filter(p => {
            const pNorm = normPath(p);
            return pNorm === pathNorm || pNorm.endsWith('/' + pathNorm);
        });
        if (matches.length === 1) {
            const fullPath = matches[0];
            verifiedPaths.add(fullPath);
            return { valid: true, resolvedPath: fullPath };
        }
    }

    return {
        valid: false,
        reason: 'Path not found in vault or database. Only use paths from tool outputs (local_search_whole_vault, graph_traversal, etc.)'
    };
}

/** Remove edges whose source or target node does not exist. Allows partial graph display when LLM outputs invalid edges. */
function removeInvalidGraphEdges(agentResult: SearchAgentResult): void {
    const nodes = agentResult.graph.nodes;
    const edges = agentResult.graph.edges;
    const nodeIds = new Set(nodes.map((n: any) => n.id));
    const validEdges = edges.filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target));
    if (validEdges.length < edges.length) {
        agentResult.graph.edges = validEdges;
    }
}

/**
 * Validate graph data consistency and return issues that need to be fixed
 */
function validateGraphConsistency(agentResult: SearchAgentResult): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];
    const nodes = agentResult.graph.nodes;
    const edges = agentResult.graph.edges;

    // Create a set of valid node IDs for quick lookup
    const nodeIds = new Set(nodes.map(node => node.id));

    // Check for edges that reference non-existent nodes
    const invalidEdges = edges.filter(edge => {
        const sourceExists = nodeIds.has(edge.source);
        const targetExists = nodeIds.has(edge.target);

        if (!sourceExists) {
            issues.push(`Edge references non-existent source node: "${edge.source}"`);
        }
        if (!targetExists) {
            issues.push(`Edge references non-existent target node: "${edge.target}"`);
        }

        return !sourceExists || !targetExists;
    });

    // Check for orphaned edges
    if (invalidEdges.length > 0) {
        issues.push(`Found ${invalidEdges.length} edges referencing non-existent nodes`);
    }

    // Check for duplicate edges (same source and target)
    const edgeSignatures = new Set<string>();
    const duplicateEdges: string[] = [];
    edges.forEach(edge => {
        const signature = `${edge.source}::${edge.target}`;
        if (edgeSignatures.has(signature)) {
            duplicateEdges.push(signature);
        } else {
            edgeSignatures.add(signature);
        }
    });

    if (duplicateEdges.length > 0) {
        issues.push(`Found duplicate edges: ${duplicateEdges.join(', ')}`);
    }

    // Check for nodes with no meaningful content
    const emptyNodes = nodes.filter(node =>
        !node.title?.trim() ||
        node.title === 'Untitled' ||
        node.title.length < 2
    );

    if (emptyNodes.length > 0) {
        issues.push(`Found ${emptyNodes.length} nodes with empty or meaningless titles`);
    }

    // Check for isolated nodes (nodes with no edges)
    const connectedNodeIds = new Set<string>();
    edges.forEach(edge => {
        connectedNodeIds.add(edge.source);
        connectedNodeIds.add(edge.target);
    });

    const isolatedNodes = nodes.filter(node => !connectedNodeIds.has(node.id));
    if (isolatedNodes.length > 5) { // Allow some isolated nodes but warn if too many
        issues.push(`Found ${isolatedNodes.length} isolated nodes (nodes with no connections)`);
    }

    return {
        isValid: issues.length === 0,
        issues
    };
}

/**
 * Whether the update-result tool output (from safeAgentTool) indicates apply failure.
 * Used for direct-apply-then-fix flow: try direct apply first, call dimension agent only on failure.
 */
function isApplyFailure(toolOutput: { result?: unknown; error?: string } | null | undefined): boolean {
    if (!toolOutput) return true;
    if (toolOutput.error) return true;
    const r = toolOutput.result;
    if (typeof r !== 'string') return false;
    return r.includes('failed to') || r.includes('consistency check failed') || r.includes('GRAPH CONSISTENCY');
}
