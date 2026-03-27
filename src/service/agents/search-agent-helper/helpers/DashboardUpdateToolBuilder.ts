import type { ZodType } from "@/core/schemas";
import { getCurrentAnalysisContext, type UpdateResultHandlers } from "@/core/analysis-context-holder";
import {
	DEFAULT_PLACEHOLDER,
	dashboardBlockItemSchema,
	graphEdgeItemSchema,
	graphNodeItemSchema,
	overviewMermaidInputSchema,
	sourceItemSchema,
	topicItemSchema,
	updateSourceScoresInputSchema,
} from "@/core/schemas/agents/search-agent-schemas";
import type { AISearchSource } from "../../AISearchAgent";
import { createUpdateResultTool, getUpdateResultFormatGuidance, safeText, norm, normPath, commonValidatePath } from "@/service/tools/field-update-tool-array";
import { validateMermaid } from "@/core/utils/mermaid-utils";
import { safeAgentTool } from "@/service/tools/types";
import { GraphNodeType } from '@/core/po/graph.po';

let _handlersMap: Record<string, UpdateResultHandlers> | null = null;

/**
 * Returns per-field handlers for update-result tools. Handlers do not close over session;
 * they use getCurrentAnalysisContext() at runtime for getResult/getVerifiedPaths.
 */
export function getUpdateResultHandlersMap(): Record<string, UpdateResultHandlers> {
    if (_handlersMap) return _handlersMap;
    _handlersMap = {
        topics: {
            identityKeyBuilder: (item) => {
                const label = safeText(item.label);
                return label ? `label:${norm(label)}` : null;
            },
        },
        'graph.nodes': {
            identityKeyBuilder: (item) => {
                const path = safeText(item.path);
                if (path && path !== DEFAULT_PLACEHOLDER) return `path:${normPath(path)}`;
                const id = safeText(item.id);
                return id ? `id:${id}` : null;
            },
            dataTransform: (data: any, schema?: ZodType) => {
                if (data.operation === 'add') {
                    const item = data.item;
                    const result = schema?.safeParse(item);
                    if (!result?.success) {
                        const errorMessage = result?.error?.message;
                        if (errorMessage?.includes('Document/file nodes must have a valid path')) {
                            console.warn(`[UpdateResultTool] Discarding document/file node with placeholder path for ${data.targetField}: ${item?.path}`);
                            return { ...data, _skip: true };
                        }
                    }
                }
                return data;
            },
            validatePath: async (item) => {
                const nodeType = String(item?.type ?? GraphNodeType.Document).trim().toLowerCase();
                const shouldValidatePath =
                    nodeType === GraphNodeType.Document || nodeType === GraphNodeType.HubDoc;
                if (shouldValidatePath) {
                    if (item.path === DEFAULT_PLACEHOLDER || item.path === 'Untitled') {
                        return { valid: false, reason: "path is a placeholder value. Please provide a valid file path." };
                    }
                    const ctx = getCurrentAnalysisContext();
                    if (!ctx) return { valid: false, reason: 'Session ended or unloaded.' };
                    return await commonValidatePath(item.path, ctx.getVerifiedPaths());
                }
                return { valid: true };
            },
        },
        'graph.edges': {
            identityKeyBuilder: (item) => {
                const id = safeText(item.id);
                if (id && id.startsWith('edge:')) return `id:${id}`;
                const source = safeText(item.source);
                const target = safeText(item.target);
                if (!source || !target) return null;
                return `edge:${norm(source)}::${norm(target)}::${norm(item.type ?? '')}::${norm(item.label ?? '')}`;
            },
            dataTransform: (data: any, schema?: ZodType) => {
                if (data.operation === 'add') {
                    const item = data.item;
                    const result = schema?.safeParse(item);
                    if (!result?.success) {
                        const errorMessage = result?.error?.message;
                        if (errorMessage?.includes('source and target are required') || errorMessage?.includes('source and target cannot be the same')) {
                            console.warn(`[UpdateResultTool] Discarding graph edge with invalid source/target for ${data.targetField}`);
                            return { ...data, _skip: true };
                        }
                    }
                }
                return data;
            },
        },
        sources: {
            identityKeyBuilder: (item) => {
                const path = safeText(item.path);
                if (path && path !== DEFAULT_PLACEHOLDER) return `path:${normPath(path)}`;
                const id = safeText(item.id);
                return id ? `id:${id}` : null;
            },
            validatePath: async (item) => {
                const ctx = getCurrentAnalysisContext();
                if (!ctx) return { valid: false, reason: 'Session ended or unloaded.' };
                return await commonValidatePath(item.path, ctx.getVerifiedPaths());
            },
        },
        dashboardBlocks: {
            identityKeyBuilder: (item) => {
                const id = safeText(item.id);
                if (id && !id.startsWith('block:')) return `id:${id}`;
                const title = normalizeBlockTitle(safeText(item.title));
                const engine = norm(safeText(item.renderEngine));
                const composite = [title, engine].filter(Boolean).join('\n');
                return composite ? `text:${composite}` : (id ? `id:${id}` : null);
            },
            validateItem: async (item: any) => {
                if (String(item?.renderEngine ?? '').toUpperCase() !== 'MERMAID') return { valid: true };
                const code = item?.mermaidCode != null ? String(item.mermaidCode).trim() : '';
                if (!code) return { valid: false, reason: 'MERMAID block requires non-empty mermaidCode.' };
                const validation = await validateMermaid(code);
                return validation.valid ? { valid: true } : { valid: false, reason: `Mermaid parse failed: ${validation.message}` };
            },
        },
    };
    return _handlersMap;
}

/** Normalize block title for dedupe: strip markdown, collapse whitespace, lowercase. */
function normalizeBlockTitle(raw: string): string {
    if (!raw) return '';
    let t = raw
        .replace(/#{1,6}\s*/g, '')
        .replace(/\*{1,3}|_{1,3}|`+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return norm(t);
}

export function overviewMermaidUpdateTool() {
    return safeAgentTool({
        description: 'Set the overview Mermaid diagram. Use short node labels and a balanced layout (mix vertical/horizontal, avoid one long chain) for easy viewing. Call with valid Mermaid code.',
        inputSchema: overviewMermaidInputSchema,
        execute: async (input) => {
            const ctx = getCurrentAnalysisContext();
            if (!ctx) throw new Error('Session ended or unloaded.');
            const raw = input ?? '';
            ctx.getResult().overviewMermaid = raw;
            return raw;
        },
    });
}

/** Format guidance for topics prompt; derived from same schema as tool (single source of truth). */
export function getTopicToolFormatGuidance(): string {
    return getUpdateResultFormatGuidance({
        fieldName: 'topics',
        itemExample: '{ "label": "Topic Label", "weight": 0.8, "suggestQuestions": ["Q1?", "Q2?", "Q3?"] }',
    });
}

/** Format guidance for update_sources prompt. Path must include .md and must be from evidence paths. */
export function getSourcesToolFormatGuidance(): string {
    const base = getUpdateResultFormatGuidance({
        fieldName: 'sources',
        itemExample: '{ "path": "path/to/file.md", "title": "Title", "reasoning": "Why relevant.", "badges": ["relevant"], "score": { "physical": 85, "semantic": 90, "average": 87 } }',
    });
    return `${base} path must include .md and must be copied from evidence (Key paths from evidence or search_analysis_context); do not guess extensions.`;
}

/** Format guidance for update_graph_nodes / update_graph_edges prompt (both tools in one block). */
export function getGraphToolFormatGuidance(): string {
    const nodes = getUpdateResultFormatGuidance({
        fieldName: 'graph.nodes',
        itemExample: '{ "type": "file", "label": "Node Label", "path": "path/to.md" }',
    });
    const edges = getUpdateResultFormatGuidance({
        fieldName: 'graph.edges',
        itemExample: '{ "source": "nodeId1", "target": "nodeId2", "type": "link", "label": "" }',
    });
    return `update_graph_nodes: ${nodes} Do NOT include any type: prefix in label (e.g. no file:, concept:, tag:). File nodes: use readable filename for label, path must be vault-relative. update_graph_edges: ${edges}`;
}

/** Format guidance for add_dashboard_blocks prompt. Emphasizes MARKDOWN/MERMAID/TILE and required fields. */
export function getDashboardBlocksToolFormatGuidance(): string {
    const base = getUpdateResultFormatGuidance({
        fieldName: 'dashboardBlocks',
        itemExample: '{ "renderEngine": "MARKDOWN", "markdown": "## Section\\n\\nShort paragraph or bullet list.", "title": "Block Title", "weight": 6 }',
    });
    return `${base}\n\nEngine rules: renderEngine "MARKDOWN" requires "markdown" (non-empty string; must be substantive: 2-4 paragraphs or 5+ detailed list items with reasoning—no thin blocks). renderEngine "MERMAID" requires "mermaidCode". renderEngine "TILE" and "ACTION_GROUP" require "items" array; each item: { "id" (optional), "title", "description" (optional), "icon" (optional), "color" (optional) }.\nExamples:\n- MARKDOWN (substantive): { "renderEngine": "MARKDOWN", "markdown": "## Section\\n\\nFirst paragraph with detailed reasoning...\\n\\nSecond paragraph with evidence from [[source.md]]...\\n\\n- Point 1 with explanation\\n- Point 2 with explanation", "title": "Block Title", "weight": 6 }\n- MERMAID: { "renderEngine": "MERMAID", "mermaidCode": "flowchart LR\\n  A --> B", "title": "Diagram", "weight": 6 }\n- TILE: { "renderEngine": "TILE", "items": [{ "title": "Item 1", "description": "optional" }], "title": "Tiles", "weight": 4 }\n- ACTION_GROUP: { "renderEngine": "ACTION_GROUP", "items": [{ "title": "Next step 1", "description": "What to do" }], "title": "Next Actions", "weight": 5 }`;
}

export function topicUpdateTool() {
    return createUpdateResultTool({
        fieldName: 'topics',
        itemSchema: topicItemSchema,
        toolDescription: 'Update dashboard topics. Call with a single argument: { "operations": [ ... ] }. '
            + 'operations MUST be an array of objects (never strings). '
            + 'Each object: either { "operation": "add", "targetField": "topics", "item": { "label": "Topic Name", "weight": 0.8, "suggestQuestions": ["Q1?", "Q2?"] } } '
            + 'or { "operation": "remove", "targetField": "topics", "removeId": "label:normalized-topic-label" }. '
            + 'Do NOT pass string elements (no JSON strings, no "upsert:...", no "UpsertTopic(...)", no "add(...)").',
    });
}

export function graphNodesUpdateTool() {
    return createUpdateResultTool({
        fieldName: 'graph.nodes',
        itemSchema: graphNodeItemSchema,
    });
}

export function graphEdgesUpdateTool() {
    return createUpdateResultTool({
        fieldName: 'graph.edges',
        itemSchema: graphEdgeItemSchema,
    });
}

/** Batch update source scores without reasoning. Use first pass before reasoning on top N. */
export function updateSourceScoresTool() {
    return safeAgentTool({
        description: 'Batch update source scores. Call first to score all sources; low-relevance ones get 0. No reasoning needed.',
        inputSchema: updateSourceScoresInputSchema,
        execute: async (input) => {
            const ctx = getCurrentAnalysisContext();
            if (!ctx) throw new Error('Session ended or unloaded.');
            const result = ctx.getResult();
            const scores = input?.scores ?? [];
            const pathToLower = (p: string) => String(p ?? '').trim().toLowerCase();
            for (const { sourceId, score } of scores) {
                const idOrPath = String(sourceId ?? '').trim();
                if (!idOrPath) continue;
                const lower = pathToLower(idOrPath);
                const src = result.sources.find((s: AISearchSource) => (s.id && s.id.toLowerCase() === lower) || pathToLower(s.path ?? '') === lower);
                if (src) {
                    src.score = { average: score, physical: score, semantic: score };
                }
            }
        },
    });
}

export function sourcesUpdateTool() {
    return createUpdateResultTool({
        fieldName: 'sources',
        itemSchema: sourceItemSchema,
    });
}

export function dashboardBlocksUpdateTool() {
    return createUpdateResultTool({
        fieldName: 'dashboardBlocks',
        itemSchema: dashboardBlockItemSchema,
    });
}
