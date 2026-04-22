import type { ZodType } from "@/core/schemas";
import { ZodError } from "@/core/schemas";
import { getCompiledBounded } from '@/core/template-engine-helper';
import { LLMStreamEvent, StreamTriggerName } from "@/core/providers/types";
import { ToolTemplateId, type ToolTemplateId as ToolTemplateIdType } from "@/core/template/TemplateRegistry";
import type { TemplateManager } from "@/core/template/TemplateManager";
import { AppContext } from "@/app/context/AppContext";

const TOOL_TEMPLATE_IDS = new Set<string>(Object.values(ToolTemplateId));

function isToolTemplateId(s: string): s is ToolTemplateIdType {
    return TOOL_TEMPLATE_IDS.has(s);
}

export { clearBuildResponseCompileCache } from '@/core/template-engine-helper';

/**
 * Don't use ToolSet from ai sdk directly; it slows TS and may crash IDE.
 */
export interface AgentTool {
    description: string;
    inputSchema: ZodType;
    execute: (input?: any) => Promise<any>;
}

/**
 * Wrap the tool with a safe wrapper to handle input validation errors and internal errors and return the result with duration.
 * todo cache tool call.
 */
export function safeAgentTool(tool: AgentTool): AgentTool {
    return {
        description: tool.description,
        inputSchema: tool.inputSchema,
        execute: async (parameters?: any) => {
            const start = Date.now();
            try {
                const parsedParameters = parameters ? tool.inputSchema.parse(parameters) : undefined;
                return {
                    result: await tool.execute(parsedParameters),
                    durationMs: Date.now() - start,
                };
            } catch (error) {
                if (error instanceof ZodError) {
                    const details = error.errors.map((e: { message: string }) => e.message).join("; ");
                    return {
                        error: "FAILED: Invalid or missing parameters. " + details + " Fix and re-run the tool with the required fields.",
                        durationMs: Date.now() - start,
                    };
                }
                console.error("[Tool Safe Wrapper] Unknown internal error: ", error);
                return {
                    error: "[Tool Safe Wrapper] Unknown internal error: " + error.message,
                    durationMs: Date.now() - start,
                };
            }
        },
    };
}

/**
 * Result type for operations that may timeout
 */
export type TimeoutResult<T> = {
    success: true;
    data: T;
} | {
    success: false;
    message: string;
};

/**
 * Wrap an async operation with a timeout - returns result instead of throwing
 */
export async function withTimeoutMessage<T>(
    operation: Promise<T>,
    timeoutMs: number,
    operationName: string = 'Operation'
): Promise<TimeoutResult<T>> {
    return Promise.race([
        operation.then(data => ({ success: true as const, data })),
        new Promise<TimeoutResult<T>>(resolve => {
            setTimeout(() => {
                resolve({
                    success: false,
                    message: `${operationName} timed out after ${timeoutMs}ms. The operation took too long to complete.`
                });
            }, timeoutMs);
        })
    ]);
}

export interface BuildResponseOptions {
    templateManager?: TemplateManager;
}

/**
 * Build the response based on the response format.
 * When templateId is provided, renders only when format is 'markdown' or 'hybrid' (lazy render).
 * When template is a string, uses bounded compile cache (prevents Handlebars memory leak).
 */
export async function buildResponse(
    responseFormat: 'structured' | 'markdown' | 'hybrid',
    templateOrId: string | ToolTemplateId | undefined,
    result: any,
    options?: BuildResponseOptions,
): Promise<any> {
    if (responseFormat === 'structured') {
        return result;
    }
    let rendered: string | undefined;
    if (templateOrId !== undefined) {
        const useTemplateManager = typeof templateOrId === 'string' ? isToolTemplateId(templateOrId) : true;
        if (useTemplateManager) {
            const tm = options?.templateManager ?? AppContext.getInstance().manager.getTemplateManager?.();
            if (tm) {
                rendered = await tm.render(templateOrId as ToolTemplateIdType, result);
            }
        } else {
            rendered = getCompiledBounded(templateOrId as string)(result);
        }
    }
    switch (responseFormat) {
        case 'markdown':
            return rendered ?? result;
        case 'hybrid':
            return { data: result, template: rendered ?? result };
        default:
            throw new Error(`Invalid response format: ${responseFormat}`);
    }
}

export interface ManualToolCallHandler {
    toolName: string;
    triggerName: StreamTriggerName;
    handle: (chunkInput: any, resultCollector: Record<string, any>) => AsyncGenerator<LLMStreamEvent>;
    outputGetter?: (resultCollector: Record<string, any>) => any;
}
