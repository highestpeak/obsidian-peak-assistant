import { z } from 'zod/v3';
import { safeAgentTool } from './types';

export interface UpdateResultToolConfig {
    /** Available fields that can be updated */
    availableFields: {
        name: string;
        description: string;
        type: 'array' | 'object';
    }[];

    /** Item schemas for validation */
    itemSchemas: Record<string, z.ZodType>;

    /** Custom examples for the tool description */
    examples?: string[];

    /** Additional description text to prepend to the tool description */
    descriptionExtra?: string;

    /** Result object that will be modified, or function to get it dynamically */
    result: any | (() => any);

    /** Path validation function */
    validatePath?: (path: string) => Promise<{ valid: boolean; reason?: string }>;

    /** Set of verified paths */
    verifiedPaths?: Set<string>;
}

// Constants for validation
export const NO_MEANINGFUL_CONTENT_MESSAGE = "has no meaningful content, discarding";
// Constants for item validation and defaults
export const DEFAULT_PLACEHOLDER = "Untitled";
export const DEFAULT_ICON = "bulb";
export const DEFAULT_COLOR = "blue";

/** Substring to detect add/merge success in result */
export const RESULT_SUCCESS_UPDATED = "successfully updated";
export const RESULT_ADDED = RESULT_SUCCESS_UPDATED + " result (added)";
export const RESULT_MERGED = RESULT_SUCCESS_UPDATED + " result (merged)";
/** Substring to detect remove success in result */
export const RESULT_SUCCESS_REMOVED = "successfully removed";

export function createUpdateResultTool(config: UpdateResultToolConfig) {
    const {
        availableFields,
        itemSchemas,
        examples = [],
        descriptionExtra,
        result,
        validatePath,
        verifiedPaths = new Set()
    } = config;

    // Helper to get current result (handles both static and dynamic cases)
    const getCurrentResult = () => typeof result === 'function' ? result() : result;

    // Create field enum
    const fieldNames = availableFields.map(f => f.name);
    const fieldEnum = z.enum(fieldNames as [string, ...string[]]);

    // Create plain object schemas for discriminated union
    const addOperationSchema = z.object({
        operation: z.literal('add'),
        targetField: fieldEnum,
        item: z.any(),
    });

    const removeOperationSchema = z.object({
        operation: z.literal('remove'),
        targetField: fieldEnum,
        removeId: z.string().min(1, { message: "removeId is required" }),
    });

    /** Unwrap operation when LLM nests it inside a single-key "item" (e.g. {"item": {"operation":"add", "targetField":"...", "item":...}}) */
    function normalizeOperation(raw: unknown): unknown {
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            const keys = Object.keys(raw as object);
            if (keys.length === 1 && keys[0] === 'item') {
                const inner = (raw as { item: unknown }).item;
                if (inner && typeof inner === 'object' && !Array.isArray(inner) && 'operation' in inner && 'targetField' in inner) {
                    return inner;
                }
            }
        }
        return raw;
    }

    // Use discriminated union with plain schemas, then apply item validation transform
    const operationSchema = z.any()
        .transform(normalizeOperation)
        .pipe(z.discriminatedUnion('operation', [addOperationSchema, removeOperationSchema])
            .transform((data) => {
                if (data.operation === 'add') {
                    // Apply item validation for add operations
                    const schema = itemSchemas[data.targetField];
                    if (!schema) {
                        throw new Error(`No schema found for targetField: ${data.targetField}`);
                    }
                    // Parse and validate the item with the correct schema
                    const result = schema.safeParse(data.item);
                    if (!result.success) {
                        // Check if this is a "discard" error (no meaningful content)
                        const errorMessage = result.error.message;
                        if (errorMessage.includes(NO_MEANINGFUL_CONTENT_MESSAGE)) {
                            console.warn(`[UpdateResultTool] Discarding item with no meaningful content for ${data.targetField}`);
                            // Return a special marker to indicate this operation should be skipped
                            return {
                                ...data,
                                _skip: true
                            };
                        }
                        // For other validation errors, still throw
                        throw new Error(`Invalid item for targetField "${data.targetField}": ${errorMessage}`);
                    }
                    // Return the validated data
                    return {
                        ...data,
                        item: result.data
                    };
                }
                // Remove operations don't need additional validation
                return data;
            }));

    const inputSchema = z.object({
        operations: z.array(operationSchema).min(1, { message: "At least one operation is required" }),
    });

    // Build description
    const fieldsList = availableFields.map(f => `- ${f.name}: ${f.description}`).join('\n');

    const defaultExamples = [
        `Add topic: {"operations": [{"operation": "add", "targetField": "topics", "item": {"label": "topic1", "weight": 1}}]} `,
        `Add insight card: {"operations": [{"operation": "add", "targetField": "insightCards", "item": {"id": "card1", "title": "Title", "description": "Description", "icon": "bulb", "color": "yellow"}}]}`,
        `Remove item: {"operations": [{"operation": "remove", "targetField": "sources", "removeId": "src:file.md"}]}`,
        `Multiple operations: {"operations": [{"operation": "add", "targetField": "topics", "item": {"label": "AI", "weight": 1}}, {"operation": "remove", "targetField": "sources", "removeId": "old-src"}]}`
    ];

    const allExamples = examples.length > 0 ? examples : defaultExamples;

    const description = `${descriptionExtra ? descriptionExtra + '\n\n' : ''}Update result: add items to arrays or remove items by id using operations array.

IMPORTANT: All operations must be provided as an "operations" array. Each operation specifies "operation" as either "add" or "remove".

Available result fields you can update:
${fieldsList}

Examples:
${allExamples.map(ex => `- ${ex}`).join('\n')}`;

    return safeAgentTool({
        description,
        inputSchema: inputSchema,
        execute: async (input) => {
            const batchResults: string[] = [];
            let totalSuccessCount = 0;
            let totalItems = 0;

            const failedResults: string[] = [];
            for (const op of input.operations) {
                const result = await executeSingleOperation(op);
                batchResults.push(result);

                // Skip operations that were discarded due to no meaningful content
                if (result.includes(NO_MEANINGFUL_CONTENT_MESSAGE)) {
                    failedResults.push(result);
                    continue;
                }

                if (result.includes(RESULT_SUCCESS_UPDATED) || result.includes(RESULT_SUCCESS_REMOVED)) {
                    totalSuccessCount++;
                }

                // Count total items (rough estimate)
                if (op.operation === 'add') {
                    const items = getItemsFromOperation(op);
                    totalItems += items.length;
                } else if (op.operation === 'remove') {
                    totalItems++;
                }
            }

            const failedPercentage = totalItems === 0 ? '0.00' : ((totalSuccessCount / totalItems) * 100).toFixed(2);
            return `Batch completed successfully: request ${input.operations} operations, processed ${totalSuccessCount} operations, `
                +`request ${totalItems} items, succeeded ${totalSuccessCount} items, `
                + (failedResults.length > 0
                    ? `Failed (${failedPercentage}%): ${failedResults.join('; ')}`
                    : '');
        },
    });

    async function executeSingleOperation(input: any): Promise<string> {
        // Skip operations marked for discarding
        if (input._skip) {
            return `skipped operation: item ${NO_MEANINGFUL_CONTENT_MESSAGE}`;
        }

        const { operation } = input;

        switch (operation) {
            case 'add':
                const result = await addItem(input.targetField!, input.item);
                return result;

            case 'remove':
                return removeItem(input.targetField, input.removeId);

            default:
                return `failed to update result, unknown operation: ${operation}`;
        }
    }

    function getItemsFromOperation(operation: any): any[] {
        if (operation.operation === 'add' && !operation._skip) {
            return [operation.item];
        }
        return [];
    }

    /**
     * Build a stable identity key for deduping/upserting.
     * This prevents repeated update_result calls from blindly appending duplicates.
     */
    function buildIdentityKey(targetField: string, item: any): string | null {
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
    }

    function isMeaningfulString(v: unknown): boolean {
        if (typeof v !== 'string') return false;
        const s = v.trim();
        if (!s) return false;
        if (s === DEFAULT_PLACEHOLDER || s === 'Untitled') return false;
        return true;
    }

    function mergePreferMeaningful(target: any, incoming: any) {
        if (!target || typeof target !== 'object' || !incoming || typeof incoming !== 'object') return;

        for (const [k, v] of Object.entries(incoming)) {
            if (v === undefined || v === null) continue;

            // Strings: avoid overwriting real content with placeholders.
            if (typeof v === 'string') {
                if (!isMeaningfulString(v)) continue;
                target[k] = v;
                continue;
            }

            // Arrays: merge unique values for primitive arrays (e.g. badges).
            if (Array.isArray(v)) {
                if (v.length === 0) continue;
                if (!Array.isArray(target[k])) {
                    target[k] = v;
                    continue;
                }
                const merged = new Set<any>(target[k]);
                for (const item of v) merged.add(item);
                target[k] = Array.from(merged);
                continue;
            }

            // Objects: shallow-merge, preferring meaningful strings.
            if (typeof v === 'object') {
                if (!target[k] || typeof target[k] !== 'object') {
                    target[k] = v;
                    continue;
                }
                for (const [kk, vv] of Object.entries(v as any)) {
                    if (vv === undefined || vv === null) continue;
                    if (typeof vv === 'string' && !isMeaningfulString(vv)) continue;
                    (target[k] as any)[kk] = vv;
                }
                continue;
            }

            // Numbers/booleans: always take incoming.
            target[k] = v;
        }
    }

    async function addItem(targetField: string, item: any): Promise<string> {
        // Validate paths if validator provided
        // - sources: always validate
        // - graph.nodes: validate ONLY for document/file nodes (concept/tag nodes should not carry file paths)
        const nodeType = String(item?.type ?? 'document').trim().toLowerCase();
        const shouldValidatePath =
            !!validatePath
            && (
                targetField === 'sources'
                || (targetField === 'graph.nodes' && (nodeType === 'document' || nodeType === 'file'))
            )
            && !!item?.path;

        if (shouldValidatePath) {
            // Skip validation for placeholder values
            if (item.path === DEFAULT_PLACEHOLDER || item.path === 'Untitled') {
                console.warn(`[UpdateResultTool] Skipping validation for placeholder path: ${item.path}`);
                return `failed to add item: path "${item.path}" is a placeholder value. Please provide a valid file path.`;
            }

            const pathValidation = await validatePath(item.path);
            if (!pathValidation.valid) {
                console.warn(`[UpdateResultTool] Path validation failed: ${item.path} - ${pathValidation.reason}`);
                return `failed to add item: path "${item.path}" is not verified. ${pathValidation.reason}. Use search tools to find valid paths first.`;
            }
        }

        const currentResult = getCurrentResult();
        const arrayPath = targetField.split('.');
        let current: any = currentResult;

        // Navigate to the field
        for (let i = 0; i < arrayPath.length - 1; i++) {
            const key = arrayPath[i];
            if (!(key in current)) {
                current[key] = {};
            }
            current = current[key];
        }

        const finalKey = arrayPath[arrayPath.length - 1];

        // Handle array fields
        if (!(finalKey in current)) {
            current[finalKey] = [];
        }
        if (!Array.isArray(current[finalKey])) {
            current[finalKey] = [];
        }
        const targetArray: any[] = current[finalKey];

        // Upsert instead of push to prevent duplicates.
        const incomingKey = buildIdentityKey(targetField, item);
        if (incomingKey) {
            const idx = targetArray.findIndex((existing) => buildIdentityKey(targetField, existing) === incomingKey);
            if (idx >= 0) {
                mergePreferMeaningful(targetArray[idx], item);
                return RESULT_MERGED;
            }
        }

        targetArray.push(item);

        return RESULT_ADDED;
    }

    function removeItem(targetField: string, removeId: string) {
        const currentResult = getCurrentResult();
        const arrayPath = targetField.split('.');
        let current: any = currentResult;

        // Navigate to the array
        for (const key of arrayPath) {
            if (!(key in current)) {
                return `failed to remove item ${removeId} from ${targetField}, field ${targetField} does not exist`;
            }
            current = current[key];
        }

        const targetArray = current;
        if (!Array.isArray(targetArray)) {
            return `failed to remove item ${removeId} from ${targetField}, target is not an array`;
        }

        // Remove strategy:
        // - Prefer exact id match
        // - Fallback to label/path match (for topics/sources)
        // - Fallback to identity key match (advanced)
        const index = targetArray.findIndex((item: any) => {
            if (!item || typeof item !== 'object') return false;
            if (item.id && item.id === removeId) return true;
            if (item.label && item.label === removeId) return true;
            if (item.path && item.path === removeId) return true;
            const key = buildIdentityKey(targetField, item);
            return key === removeId;
        });

        if (index === -1) {
            return `failed to remove item ${removeId} from ${targetField}, item not found`;
        }

        targetArray.splice(index, 1);
        return `${RESULT_SUCCESS_REMOVED} ${removeId} from ${targetField}`;
    }
}