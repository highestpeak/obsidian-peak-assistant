import { z } from "zod/v3";

import { safeAgentTool } from "@/service/tools/types";
import { sqliteStoreManager } from "@/core/storage/sqlite/SqliteStoreManager";
import { AppContext } from "@/app/context/AppContext";

export const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
export const normPath = (v: unknown) => String(v ?? '').trim().replace(/^\/+/, '');
export const safeText = (v: unknown) => String(v ?? '').trim();
// Constants for validation
export const NO_MEANINGFUL_CONTENT_MESSAGE = "has no meaningful content, discarding";
// Constants for item validation and defaults
export const DEFAULT_PLACEHOLDER = "Untitled";
/** Substring to detect add/merge success in result */
const RESULT_SUCCESS_UPDATED = "successfully updated";
const RESULT_ADDED = RESULT_SUCCESS_UPDATED + " result (added)";
const RESULT_MERGED = RESULT_SUCCESS_UPDATED + " result (merged)";
/** Substring to detect remove success in result */
const RESULT_SUCCESS_REMOVED = "successfully removed";
export type BuildIdentityKeyFn = (item: any) => string | null;
export interface UpdateResultRequiredParameters {
    fieldName: string,
    itemSchema: z.ZodType,
    getCurrentResult: () => any,
    identityKeyBuilder: BuildIdentityKeyFn,
}
/**
 * Some LLM may act not well, we need to provide some robust fixes.
 */
export interface UpdateResultRobustParameters {
    /**
     * Situation: Sometimes LLM generates an operation like "update". but the meaning is to add.
     * Input:  { "operation": "update", "targetField": "topics", "item": { "id": "t1" } }
     * Output: { "operation": "add",    "targetField": "topics", "item": { "id": "t1" } }
     * 
     * Situation: no add operation specific but the meaning is to add.
     * Input:  { "source": "A", "target": "B", "label": "connects" }
     * Output: { 
     * "operation": "add", 
     * "targetField": "graph.edges", 
     * "item": { "source": "A", "target": "B", "label": "connects" } 
     * }
     */
    normalizeOperation?: (raw: any) => any,
    /**
     * Situation: some times LLM nests operations inside a single-key "item". Example shown below.
     * Input:  { "item": { "id": "node-1", "label": "AI" } }
     * Output: { "id": "node-1", "label": "AI" }
     * 
     * Usually we can send a _skip: true field back to indicate the operation is skipped.
     */
    dataTransform?: (data: any, schema?: z.ZodType) => any,
    validatePath?: (item: any) => Promise<{ valid: boolean, reason?: string, resolvedPath?: string }>,
}
const defaultRobustParameters: UpdateResultRobustParameters = {
    normalizeOperation: (raw: unknown) => { return raw; },
    dataTransform: (data: unknown, schema?: z.ZodType) => { return data; },
    validatePath: async (item: any) => { return { valid: true }; },
}
/**
 * All tools will use this data transform to ensure the data is valid.
 */
const commonNormalizeOperation = (raw: unknown) => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const obj = raw as Record<string, unknown>;
        const keys = Object.keys(obj);

        /**
         * Situation: some times LLM nests operations inside a single-key "item". Example shown below.
         * Input:  { "source": "A", "target": "B", "label": "connects" }
         * Output: { 
         * "operation": "add", 
         * "targetField": "graph.edges", 
         * "item": { "source": "A", "target": "B", "label": "connects" } 
         * }
         */
        if (keys.length === 1 && keys[0] === 'item') {
            const inner = obj.item;
            if (inner && typeof inner === 'object' && !Array.isArray(inner) && 'operation' in inner && 'targetField' in inner) {
                return commonNormalizeOperation(inner);
            }
        }

        /**
         * Situation: Sometimes LLM generates an operation like "update". but the meaning is to add. Example shown below.
         * Input:  { "operation": "update", "targetField": "topics", "item": { "id": "t1" } }
         * Output: { "operation": "add",    "targetField": "topics", "item": { "id": "t1" } }
         */
        if (obj.operation === 'update' && obj.item != null && obj.targetField != null) {
            return { ...obj, operation: 'add' };
        }
    }
    return raw;
}
const commonDataTransform = (data: any, schema: z.ZodType) => {
    if (data.operation === 'add') {
        const item = data.item;
        // Skip add operations with missing or non-object item (LLM may output null/undefined)
        if (item == null || typeof item !== 'object' || Array.isArray(item)) {
            console.warn(`[UpdateResultTool] Skipping add operation for ${data.targetField}: item is missing or invalid`);
            return { ...data, _skip: true };
        }
        const result = schema.safeParse(item);
        if (!result.success) {
            const errorMessage = result.error.message;
            // Discard: no meaningful content
            if (errorMessage.includes(NO_MEANINGFUL_CONTENT_MESSAGE)) {
                console.warn(`[UpdateResultTool] Discarding item with no meaningful content for ${data.targetField}`);
                return { ...data, _skip: true };
            }
            throw new Error(`Invalid item for targetField "${data.targetField}": ${errorMessage}`);
        }
        // Return the validated data
        return {
            ...data,
            item: result.data
        };
    }
    return data;
};
/**
 * Validate that a path exists in the vault/DB or was seen in tool outputs.
 * This is the core of EvidenceGate - preventing hallucinated paths.
 */
export async function commonValidatePath(path: string, verifiedPaths: Set<string>): Promise<{ valid: boolean; reason?: string; resolvedPath?: string }> {
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

    // Basename resolution: LLM may output only filename (e.g. "how-to-write-resume.md") while verifiedPaths has full path
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
};
/**
 * update array field in result.
 */
export function createUpdateResultTool(
    /** required parameters */
    requiredParameters: UpdateResultRequiredParameters,

    /** optional parameters */
    robustParameters: UpdateResultRobustParameters = defaultRobustParameters,
) {
    const { fieldName, itemSchema, getCurrentResult, identityKeyBuilder: buildIdentityKeyParams } = requiredParameters;
    const { normalizeOperation, dataTransform, validatePath } = robustParameters;
    // if have identity key func then use it, otherwise use default id fetch
    const buildIdentityKey: BuildIdentityKeyFn = buildIdentityKeyParams ?? ((item) => {
        if (!item || typeof item !== 'object') return null;
        const id = String((item as any).id ?? '').trim();
        return id ? `id:${id}` : null;
    });

    const addOperationSchema = z.object({
        operation: z.literal('add'),
        targetField: z.literal(fieldName),
        item: itemSchema,
    });

    const removeOperationSchema = z.object({
        operation: z.literal('remove'),
        targetField: z.literal(fieldName),
        removeId: z.string().min(1, { message: "removeId is required" }),
    });

    // Use discriminated union with plain schemas, then apply item validation transform
    const finalNormalizeOperation = (raw: unknown) => {
        return commonNormalizeOperation(
            normalizeOperation!(raw)
        );
    };
    const finalDataTransform = (data: unknown) => {
        const result = commonDataTransform(
            dataTransform!(data, itemSchema),
            itemSchema
        );

        // can't continue to execute if the item is still invalid after dataTransform
        const fallbackSafeParse = itemSchema.safeParse(result.item);
        if (!fallbackSafeParse.success) {
            throw new Error(`Invalid item for targetField "${fieldName}": ${fallbackSafeParse.error.message}`);
        }

        return result;
    };
    const operationSchema = z.any()
        .transform(finalNormalizeOperation)
        .pipe(
            z.discriminatedUnion(
                'operation',
                [addOperationSchema, removeOperationSchema]
            ).transform(finalDataTransform)
        );

    const inputSchema = z.object({
        operations: z.array(operationSchema).min(1, { message: "At least one operation is required" }),
    });

    const description = `A high-precision atomic state management tool to synchronize the analysis dashboard.\n`
        + `Use this tool to perform batch mutations (upsert/delete) on the underlying knowledge model.\n`;

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

                totalItems += op._skip ? 0 : 1;
            }

            const failedPercentage = totalItems === 0 ? '0.00' : ((totalSuccessCount / totalItems) * 100).toFixed(2);
            return `Batch completed successfully: request ${input.operations} operations, processed ${totalSuccessCount} operations, `
                + `request ${totalItems} items, succeeded ${totalSuccessCount} items, `
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
                return await addItem(input.targetField!, input.item);

            case 'remove':
                return removeItem(input.targetField, input.removeId);

            default:
                return `failed to update result, unknown operation: ${operation}`;
        }
    }

    async function addItem(targetField: string, item: any): Promise<string> {
        const pathValidation = await validatePath!(item);
        if (!pathValidation.valid) {
            return pathValidation.reason!;
        }
        if (pathValidation.resolvedPath) {
            item = { ...item, path: pathValidation.resolvedPath };
        }

        const currentResult = getCurrentResult();
        // targetField maybe like "graph.nodes" or "dashboardBlocks"
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
        const incomingKey = buildIdentityKey(item);
        if (incomingKey) {
            const idx = targetArray.findIndex((existing) => buildIdentityKey(existing) === incomingKey);
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
        // - Fallback to possible fields check.
        // - Fallback to identity key match
        const index = targetArray.findIndex((item: any) => {
            if (!item || typeof item !== 'object') return false;
            if (item.id && item.id === removeId) return true;
            if (item.label && item.label === removeId) return true;
            if (item.path && item.path === removeId) return true;
            const key = buildIdentityKey(item);
            return key === removeId;
        });

        if (index === -1) {
            return `failed to remove item ${removeId} from ${targetField}, item not found`;
        }

        targetArray.splice(index, 1);
        return `${RESULT_SUCCESS_REMOVED} ${removeId} from ${targetField}`;
    }

    /**
     * merge two objects, prefer meaningful strings
     */
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

    function isMeaningfulString(v: unknown): boolean {
        if (typeof v !== 'string') return false;
        const s = v.trim();
        if (!s) return false;
        if (s === DEFAULT_PLACEHOLDER || s === 'Untitled') return false;
        return true;
    }
}