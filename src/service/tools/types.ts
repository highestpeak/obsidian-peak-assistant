import { z } from "zod/v3"
import Handlebars from 'handlebars';

/**
 * Don't use ToolSet from ai sdk directly; it slows TS and may crash IDE.
 * from import { Tool } from 'ai';
 */
export interface AgentTool {
    description: string;
    inputSchema: z.ZodType;
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
                if (error instanceof z.ZodError) {
                    return {
                        error: "not valid parameters: " + error.errors.map(e => e.message).join(", "),
                        durationMs: Date.now() - start,
                    };
                }
                console.error(error);
                return {
                    error: "internal error: " + error.message,
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

/**
 * Build the response based on the response format.
 * @param template - Fallback to structured format if not provided.
 */
export function buildResponse(responseFormat: 'structured' | 'markdown' | 'hybrid', template: string | undefined, result: any) {
    switch (responseFormat) {
        case 'structured':
            return result;
        case 'markdown':
            return template ? Handlebars.compile(template)(result) : result;
        case 'hybrid':
            return {
                data: result.data,
                template: template ? Handlebars.compile(template)(result) : result,
            };
        default:
            throw new Error(`Invalid response format: ${responseFormat}`);
    }
}