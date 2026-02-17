import { z } from "zod/v3";

import { SearchAgentResult } from "../AISearchAgent";
import { normalizeFilePath } from "@/core/utils/file-utils";
import { createUpdateResultTool, getUpdateResultFormatGuidance, NO_MEANINGFUL_CONTENT_MESSAGE, DEFAULT_PLACEHOLDER, safeText, norm, normPath, commonValidatePath } from "@/service/tools/field-update-tool-array";
import { normalizeMermaidForDisplay } from "@/core/utils/mermaid-utils";
import { safeAgentTool } from "@/service/tools/types";

/** Normalizes tool arg: LLM may send { input: string } instead of a plain string. */
const overviewMermaidInputSchema = z.preprocess(
    (val) =>
        typeof val === 'object' && val !== null && 'input' in val && typeof (val as { input: unknown }).input === 'string'
            ? (val as { input: string }).input
            : val,
    z.string().describe('Raw Mermaid diagram code (e.g. flowchart TD\\n  A[label] --> B[label])'),
);

export function overviewMermaidUpdateTool(
    getResult: () => SearchAgentResult,
) {
    return safeAgentTool({
        description: 'Set the overview Mermaid diagram. Call with valid Mermaid code.',
        inputSchema: overviewMermaidInputSchema,
        execute: async (input) => {
            const agentResult = getResult();
            // todo maybe we should remove normalized to make code more simple
            agentResult.overviewMermaid = normalizeMermaidForDisplay(input ?? '');
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

/** Format guidance for update_sources prompt. */
export function getSourcesToolFormatGuidance(): string {
    return getUpdateResultFormatGuidance({
        fieldName: 'sources',
        itemExample: '{ "path": "path/to/file.md", "title": "Title", "reasoning": "Why relevant.", "badges": ["relevant"], "score": { "physical": 85, "semantic": 90, "average": 87 } }',
    });
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
    return `update_graph_nodes: ${nodes} update_graph_edges: ${edges}`;
}

/** Format guidance for add_dashboard_blocks prompt. */
export function getDashboardBlocksToolFormatGuidance(): string {
    return getUpdateResultFormatGuidance({
        fieldName: 'dashboardBlocks',
        itemExample: '{ "renderEngine": "MERMAID", "mermaidCode": "flowchart LR\\n  A[Start] --> B[Step] --> C[End]", "title": "Process", "weight": 6 }',
    });
}

export function topicUpdateTool(
    getResult: () => SearchAgentResult,
) {
    return createUpdateResultTool({
        fieldName: 'topics',
        itemSchema: z.preprocess((raw: any) => {
            if (!raw || typeof raw !== 'object') return raw;

            const label = raw.label ?? raw.name ?? raw.title;

            return {
                ...raw,
                label: label ? String(label).trim() : undefined,
            };
        }, z.object({
            label: z.string().default(DEFAULT_PLACEHOLDER),
            weight: z.number().min(0).max(1).optional().describe('How important this topic is. eg: 0.5, 0.75, 1.0'),
            suggestQuestions: z.array(z.string()).optional().describe(
                'Suggested questions to ask about this topic. '
                + 'Please provide at least 3 questions. at most 5 questions. Each question should be a single sentence no more than 10 words.'
                + 'eg: "What is the main idea of the topic?"'
            ),
        })
            .superRefine((data, ctx) => {
                if ((!data.label || data.label === DEFAULT_PLACEHOLDER) && (data.weight === undefined)) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: NO_MEANINGFUL_CONTENT_MESSAGE });
                }
            })
        ),
        getCurrentResult: getResult,
        identityKeyBuilder: (item) => {
            const label = safeText(item.label);
            return label ? `label:${norm(label)}` : null;
        },
        toolDescription: 'Update dashboard topics. Call with a single argument: { "operations": [ ... ] }. '
            + 'operations MUST be an array of objects (never strings). '
            + 'Each object: either { "operation": "add", "targetField": "topics", "item": { "label": "Topic Name", "weight": 0.8, "suggestQuestions": ["Q1?", "Q2?"] } } '
            + 'or { "operation": "remove", "targetField": "topics", "removeId": "label:normalized-topic-label" }. '
            + 'Do NOT pass string elements (no JSON strings, no "upsert:...", no "UpsertTopic(...)", no "add(...)").',
    });
}

export const DEFAULT_NODE_TYPE = 'cosmo';
const FILE_NODE_TYPE = new Set(['file', 'document', 'doc']);
const OTHER_NODE_TYPE = new Set([DEFAULT_NODE_TYPE, 'concept', 'tag', 'topic']);
const RECOMMENDED_TYPES = new Set([...Array.from(OTHER_NODE_TYPE), ...Array.from(FILE_NODE_TYPE)]);

/** Humanize label: strip node_ prefix, replace underscores/hyphens with spaces, trim. */
function humanizeNodeLabel(raw: string): string {
    if (!raw || typeof raw !== 'string') return raw;
    let s = raw.trim();
    if (!s) return s;
    if (s.toLowerCase().startsWith('node_')) s = s.slice(5).trim();
    s = s.replace(/[_\u2013\u2014-]+/g, ' ').replace(/\s+/g, ' ').trim();
    return s || raw;
}

/** True if path looks like a vault file path (has slash or .md). */
function looksLikeFilePath(path: string): boolean {
    if (!path || typeof path !== 'string') return false;
    const p = path.trim();
    return p.includes('/') || /\.(md|markdown)$/i.test(p);
}

export function graphNodesUpdateTool(
    getResult: () => SearchAgentResult,
    getVerifiedPaths: () => Set<string>,
) {
    const normalizeSpecialKey = (raw: unknown): string => {
        const text = String(raw ?? '').trim().toLowerCase();
        return text.replace(/[_\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    };
    const toNormalizedCosmoNodeId = (type: string, idOrPath: string): string => `${type}:${normalizeSpecialKey(idOrPath)}`;
    const isPlaceholder = (s: string) => !s || s.trim() === '' || s === DEFAULT_PLACEHOLDER || s === 'Untitled';
    return createUpdateResultTool({
        fieldName: 'graph.nodes',
        itemSchema: z.preprocess(
            (raw: any) => {
                if (!raw || typeof raw !== 'object') return raw;

                // sometimes llm will use other names for specific field. to avoid failure, we should convert them to the standard field.
                const type = raw.type ?? raw.nodeType;
                const label = raw.label ?? raw.nodeName ?? raw.title;

                return {
                    ...raw,
                    type: type ? String(type).trim() : undefined,
                    label: label ? String(label).trim() : undefined,
                };
            },
            z.object({
                id: z.string().optional(),
                type: z.string()
                    .default(DEFAULT_NODE_TYPE)
                    // we give some possible types for llm to choose from
                    .describe(`Type of the node. Recommended: ${Array.from(RECOMMENDED_TYPES).join(', ')}. You can also use custom types if appropriate.`),
                label: z.string().default(DEFAULT_PLACEHOLDER).describe('The label of the node. It will be displayed in the graph.'),
                path: z.string().optional().describe(`${FILE_NODE_TYPE.size > 0 ? Array.from(FILE_NODE_TYPE).join(', ') : 'document'} nodes must have a valid path.`),
                attributes: z.record(z.any()).default(() => ({})).describe('Attributes of the node. It will be used to store the node\'s metadata. User can see this via a hover tooltip.'),
            })
        )
            .transform((data) => {
                const d = data as any;
                // If path is present and looks like a file path, treat as file node so it renders as openable (circle).
                if (d.path && !isPlaceholder(String(d.path)) && looksLikeFilePath(d.path)) {
                    d.type = 'file';
                }
                if (FILE_NODE_TYPE.has(d.type)) {
                    if (!d.path || isPlaceholder(String(d.path ?? ''))) {
                        const derivedPath = (() => {
                            // 1. try to get path from attributes
                            const attrsPath = d?.attributes?.path;
                            if (attrsPath && !isPlaceholder(String(attrsPath))) return attrsPath;

                            // 2. try to get path from id
                            const rawId = String(d.id ?? '').trim();
                            if (rawId.startsWith('file:')) {
                                const pathFromId = rawId.slice('file:'.length).replace(/^\/+/, '').trim();
                                if (pathFromId && !isPlaceholder(pathFromId)) return pathFromId;
                            }

                            return null;
                        })();

                        // if any of the above got a value, assign it
                        if (derivedPath) {
                            d.path = derivedPath;
                        }
                    }
                }

                // Derive label from path basename when missing or placeholder
                if (isPlaceholder(String(d.label ?? ''))) {
                    const normalizedPath = normalizeFilePath(d.path);
                    const basename = normalizedPath.split('/').filter(Boolean).pop() ?? normalizedPath;
                    const displayName = basename.replace(/\.(md|markdown)$/i, '') || basename;
                    d.label = displayName;
                }
                // Humanize label: snake_case / node_xxx -> readable (for display).
                if (d.label && d.label !== DEFAULT_PLACEHOLDER && d.label !== 'Untitled') {
                    d.label = humanizeNodeLabel(d.label);
                }

                const findFileNodeType = Array.from(FILE_NODE_TYPE).find(type => d.id && d.id.startsWith(type + ':'));
                if (findFileNodeType) {
                    // if id is a file node, convert it to the standard id. sometimes id format from path by llm is not normalized.
                    d.id = toNormalizedCosmoNodeId('file', d.id.slice(findFileNodeType.length + 1));
                } else {
                    const findOtherNodeType = Array.from(OTHER_NODE_TYPE).find(type => d.id && d.id.startsWith(type + ':'));
                    if (findOtherNodeType) {
                        d.id = toNormalizedCosmoNodeId(findOtherNodeType, d.id.slice(findOtherNodeType.length + 1));
                    }
                }

                // if id is not set, use path／label to generate a fallback id.
                const fallbackId = toNormalizedCosmoNodeId(
                    FILE_NODE_TYPE.has(d.type) ? 'file' : d.type,
                    d.path ? normalizeFilePath(d.path) : d.label
                );
                if (!d.id || d.id === DEFAULT_PLACEHOLDER) d.id = fallbackId;

                return d;
            })
            .superRefine((data, ctx) => {
                const type = data.type;

                if (FILE_NODE_TYPE.has(type)) {
                    if (!data.path || isPlaceholder(String(data.path ?? ''))) {
                        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Document/file nodes must have a valid path.", path: ["path"] });
                        return;
                    }
                } else if (type === 'concept' || type === 'tag') {
                    if (data.path === DEFAULT_PLACEHOLDER || data.path === 'Untitled') data.path = undefined;
                    const rawLabel = String(data.label || '').trim();
                    if (isPlaceholder(rawLabel)) {
                        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Concept/tag nodes must have a non-empty label or title (not Untitled).", path: ["label"] });
                        return;
                    }
                }
                if (
                    data.label === DEFAULT_PLACEHOLDER
                    && (!data.path || data.path === DEFAULT_PLACEHOLDER)
                    && (!data.attributes || Object.keys(data.attributes).length === 0)
                ) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: NO_MEANINGFUL_CONTENT_MESSAGE });
                }
            }),
        getCurrentResult: getResult,
        identityKeyBuilder: (item) => {
            const path = safeText(item.path);
            if (path && path !== DEFAULT_PLACEHOLDER) return `path:${normPath(path)}`;
            const id = safeText(item.id);
            return id ? `id:${id}` : null;
        },
    }, {
        dataTransform: (data: any, schema?: z.ZodType) => {
            if (data.operation === 'add') {
                let item = data.item;
                const result = schema?.safeParse(item);
                if (!result?.success) {
                    const errorMessage = result?.error?.message;
                    // Discard: document/file node with placeholder path (Untitled)
                    if (errorMessage?.includes('Document/file nodes must have a valid path')) {
                        console.warn(`[UpdateResultTool] Discarding document/file node with placeholder path for ${data.targetField}: ${item?.path}`);
                        return { ...data, _skip: true };
                    }
                }
            }
            return data;
        },
        validatePath: async (item) => {
            const nodeType = String(item?.type ?? 'document').trim().toLowerCase();
            // validate ONLY for document/file nodes (concept/tag nodes should not carry file paths)
            const shouldValidatePath = (nodeType === 'document' || nodeType === 'file');
            if (shouldValidatePath) {
                // Skip validation for placeholder values
                if (item.path === DEFAULT_PLACEHOLDER || item.path === 'Untitled') {
                    return {
                        valid: false,
                        reason: "path is a placeholder value. Please provide a valid file path.",
                    };
                }
                return await commonValidatePath(item.path, getVerifiedPaths());
            }
            return { valid: true };
        },
    });
}

export function graphEdgesUpdateTool(
    getResult: () => SearchAgentResult,
) {
    return createUpdateResultTool({
        fieldName: 'graph.edges',
        itemSchema: z.preprocess(
            (raw: any) => {
                if (!raw || typeof raw !== 'object') return raw;

                // sometimes llm will use other names for specific field. to avoid failure, we should convert them to the standard field.
                const source = raw.source ?? raw.sourceId ?? raw.startNode ?? raw.from_node_id;
                const target = raw.target ?? raw.targetId ?? raw.endNode ?? raw.to_node_id;

                return {
                    ...raw,
                    source: source ? String(source).trim() : undefined,
                    target: target ? String(target).trim() : undefined,
                };
            },
            z.object({
                id: z.string().default(() => `edge:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
                source: z.string().optional().describe('The source node id or path.'),
                target: z.string().optional().describe('The target node id or path.'),
                type: z.string().default('link').describe('The type of the edge. Recommended: physical_link, semantic_link, inspire, brainstorm, etc.'),
                label: z.string().default('').describe('The label of the edge. It will be displayed in the graph.'),
                attributes: z.record(z.any()).default(() => ({})).describe('Attributes of the edge. It will be used to store the edge\'s metadata. User can see this via a hover tooltip.'),
            })
        )
            .refine((data) => data.source && data.target, {
                message: "source and target are required", path: ["source"]
            })
        // they can be the same. some document may have self-loop edges.
        // .refine((data) => data.source !== data.target, {
        //     message: "source and target cannot be the same", path: ["source"]
        // })
        ,
        getCurrentResult: getResult,
        identityKeyBuilder: (item) => {
            const id = safeText(item.id);
            if (id && id.startsWith('edge:')) return `id:${id}`;
            const source = safeText(item.source);
            const target = safeText(item.target);
            if (!source || !target) return null;
            return `edge:${norm(source)}::${norm(target)}::${norm(item.type ?? '')}::${norm(item.label ?? '')}`;
        },
    }, {
        dataTransform: (data: any, schema?: z.ZodType) => {
            if (data.operation === 'add') {
                let item = data.item;
                const result = schema?.safeParse(item);
                if (!result?.success) {
                    const errorMessage = result?.error?.message;
                    // Discard: graph edge with missing or invalid source/target
                    if (errorMessage?.includes('source and target are required') || errorMessage?.includes('source and target cannot be the same')) {
                        console.warn(`[UpdateResultTool] Discarding graph edge with invalid source/target for ${data.targetField}`);
                        return { ...data, _skip: true };
                    }
                }
            }
            return data;
        },
    });
}

export function sourcesUpdateTool(
    getResult: () => SearchAgentResult,
    getVerifiedPaths: () => Set<string>,
) {
    return createUpdateResultTool({
        fieldName: 'sources',
        itemSchema: z
            .object({
                id: z.string().default(() => `src:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
                title: z.string().default(DEFAULT_PLACEHOLDER),
                path: z.string().default(DEFAULT_PLACEHOLDER).describe('The path of the source. It will be used to open the source in the file explorer.'),
                reasoning: z.string().default(DEFAULT_PLACEHOLDER).describe('Why it was selected or rejected. Please provide a detailed explanation. but no more than 100 words.'),
                badges: z.array(z.string()).default(() => []).describe('Badges of the source. It will be used to display the source in the UI. eg: "important", "relevant", "interesting", etc.'),
                score: z.preprocess(
                    (val) => (typeof val === 'number' ? { average: val } : val),
                    z.object({
                        physical: z.number().min(0).max(100).optional(),
                        semantic: z.number().min(0).max(100).optional(),
                        average: z.number().min(0).max(100).optional(),
                    }).optional()
                ),
            })
            .superRefine((data, ctx) => {
                if ((data.title === DEFAULT_PLACEHOLDER)
                    && (!data.path || data.path === DEFAULT_PLACEHOLDER)
                    && (!data.reasoning || data.reasoning === DEFAULT_PLACEHOLDER)
                    && (!data.badges || data.badges.length === 0)
                ) {
                    ctx.addIssue({ code: z.ZodIssueCode.custom, message: NO_MEANINGFUL_CONTENT_MESSAGE });
                }
            }),
        getCurrentResult: getResult,
        identityKeyBuilder: (item) => {
            const path = safeText(item.path);
            if (path && path !== DEFAULT_PLACEHOLDER) return `path:${normPath(path)}`;
            const id = safeText(item.id);
            return id ? `id:${id}` : null;
        },
    }, {
        validatePath: async (item) => {
            return await commonValidatePath(item.path, getVerifiedPaths());
        },
    });
}

/**
 * Dashboard block schemas. To add a new block type (e.g. TODO_LIST, SUGGEST_QUESTIONS):
 * 1. Add literal to DashboardRenderEngine in AISearchAgent.ts
 * 2. Add schema here and include it in BlockContentSchema below
 * 3. Add render case in DashboardBlocksSection.tsx BlockContent
 */
const DASHBOARD_BLOCK_CONTENT_SCHEMAS = {
    MARKDOWN: z.object({
        renderEngine: z.literal('MARKDOWN'),
        markdown: z.string().min(1, "Markdown content is required for MARKDOWN engine"),
    }),
    MERMAID: z.object({
        renderEngine: z.literal('MERMAID'),
        mermaidCode: z.string().min(1, "Mermaid code is required for MERMAID engine"),
    }),
    TILE: z.object({
        renderEngine: z.literal('TILE'),
        items: z.array(z.object({
            id: z.string().default(() => `item:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
            title: z.string().default(DEFAULT_PLACEHOLDER),
            description: z.string().optional(),
            icon: z.string().optional(),
            color: z.string().optional(),
        }))
            .min(1, "Items are required for TILE engine")
            .describe('Items of the block. It will be displayed in the UI. eg: "item1", "item2", etc.'),
    }),
    ACTION_GROUP: z.object({
        renderEngine: z.literal('ACTION_GROUP'),
        items: z.array(z.any()),
    }),
} as const;

const BlockContentSchema = z.discriminatedUnion("renderEngine", [
    DASHBOARD_BLOCK_CONTENT_SCHEMAS.MARKDOWN,
    DASHBOARD_BLOCK_CONTENT_SCHEMAS.MERMAID,
    DASHBOARD_BLOCK_CONTENT_SCHEMAS.TILE,
    DASHBOARD_BLOCK_CONTENT_SCHEMAS.ACTION_GROUP,
]);

export function dashboardBlocksUpdateTool(
    getResult: () => SearchAgentResult,
) {
    return createUpdateResultTool({
        fieldName: 'dashboardBlocks',
        itemSchema: z.preprocess(
            (raw: any) => {
                if (!raw || typeof raw !== 'object') return raw;
                const title = raw.title != null ? String(raw.title).trim() : undefined;
                const engine = String(raw.renderEngine ?? 'MARKDOWN').toUpperCase();
                return { ...raw, title: title || undefined, renderEngine: engine };
            },
            z.intersection(
                z.object({
                    id: z.string().default(() => `block:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
                    title: z.string().optional().describe('The title of the block. It will be displayed.'),
                    weight: z.number().min(0).max(10).optional().describe('Used for grid layout. 0-10; 1-3 small, 4-6 medium, 7-10 full-width.'),
                }),
                BlockContentSchema
            )
        ),
        getCurrentResult: getResult,
        identityKeyBuilder: (item) => {
            const id = safeText(item.id);
            if (id && !id.startsWith('block:')) return `id:${id}`;
            const title = safeText(item.title);
            const engine = safeText(item.renderEngine);
            const composite = `${title}\n${engine}`.trim();
            return composite ? `text:${norm(composite)}` : null;
        },
    });
}
