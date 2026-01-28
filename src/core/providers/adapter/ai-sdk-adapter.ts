/**
 * AI SDK Adapter
 *
 * This file contains unified implementations for AI SDK chat operations.
 * It provides standardized blockChat and streamChat functions that are used
 * across all LLM providers for consistent behavior and type safety.
 *
 * The functions handle:
 * - Text generation (block and streaming)
 * - Tool calling and result processing
 * - Reasoning output handling
 * - Error handling and event streaming
 *
 * All provider-specific implementations delegate to these functions for core AI SDK operations.
 */

import {
    LanguageModel,
    streamText,
    generateText,
    ModelMessage,
} from 'ai';
import { LLMRequest, LLMResponse, LLMStreamEvent, LLMResponseSource, MessagePart, LLMRequestMessage, ToolResultOutput } from '../types';

/**
 * Build common AI SDK parameters from LLMRequest
 */
function buildAiSdkParams(model: LanguageModel, request: LLMRequest<any>) {
    return {
        model,
        system: extractSystemMessage(request),
        prompt: toAiSdkMessages(request.messages),
        // settings
        maxOutputTokens: request.outputControl?.maxOutputTokens,
        temperature: request.outputControl?.temperature,
        topP: request.outputControl?.topP,
        topK: request.outputControl?.topK,
        frequencyPenalty: request.outputControl?.frequencyPenalty,
        presencePenalty: request.outputControl?.presencePenalty,
        // timeout settings
        timeout: request.outputControl?.timeoutTotalMs || request.outputControl?.timeoutStepMs ? {
            totalMs: request.outputControl?.timeoutTotalMs,
            stepMs: request.outputControl?.timeoutStepMs,
        } : undefined,
        // An optional abort signal that can be used to cancel the call.
        // The abort signal can e.g. be forwarded from a user interface to cancel the call, or to define a timeout.
        abortSignal: request.abortSignal,
        toolChoice: request.toolChoice ?? 'auto',
        tools: request.tools,
    };
}

export async function blockChat(
    model: LanguageModel,
    request: LLMRequest<any>
): Promise<LLMResponse> {
    try {
        const result = await generateText(buildAiSdkParams(model, request));
        return {
            content: result.content,
            text: result.text,
            reasoning: result.reasoning,
            reasoningText: result.reasoningText,
            files: result.files,
            sources: result.sources,
            toolCalls: result.toolCalls,
            toolResults: result.toolResults,
            finishReason: result.finishReason,
            usage: result.usage,
            totalUsage: result.totalUsage,
            warnings: result.warnings,
            request: result.request,
            response: result.response,
            steps: result.steps,
            providerMetadata: result.providerMetadata,
        };
    } catch (error) {
        console.error('[ai-sdk-adapter] Block chat error:', error);
        throw error;
    }
}

export async function* streamChat(
    model: LanguageModel,
    request: LLMRequest<any>
): AsyncGenerator<LLMStreamEvent> {
    const startTime = Date.now();
    try {
        const result = streamText(buildAiSdkParams(model, request));

        for await (const chunk of result.fullStream) {
            // console.debug('[ai-sdk-adapter] Chunk:', chunk);
            switch (chunk.type) {
                case 'text-delta':
                    yield { type: 'text-delta', text: chunk.text };
                    break;
                case 'reasoning-delta':
                    yield { type: 'reasoning-delta', text: chunk.text };
                    break;
                case 'source':
                    yield chunk as LLMResponseSource;
                    break;
                case 'tool-call':
                    yield {
                        type: 'tool-call',
                        toolName: chunk.toolName,
                        input: chunk.input
                    };
                    break;
                case 'tool-input-start':
                    yield {
                        type: 'tool-input-start',
                        toolName: chunk.toolName,
                    };
                    break;
                case 'tool-input-delta':
                    yield { type: 'tool-input-delta', delta: chunk.delta };
                    break;
                case 'tool-result':
                    yield {
                        type: 'tool-result',
                        toolName: chunk.toolName,
                        input: chunk.input,
                        output: chunk.output
                    };
                    break;
                case 'finish-step': {
                    yield {
                        type: 'on-step-finish',
                        text: '',
                        finishReason: chunk.finishReason,
                        usage: chunk.usage
                    };
                    break;
                }
                case 'finish': {
                    yield {
                        type: 'complete',
                        usage: chunk.totalUsage,
                        finishReason: chunk.finishReason,
                        durationMs: Date.now() - startTime
                    };
                    break;
                }
                case 'error': {
                    console.error('[ai-sdk-adapter] Stream chat chunk error:', chunk.error);
                    yield {
                        type: 'error',
                        error: chunk.error instanceof Error ? chunk.error : new Error(String(chunk.error))
                    };
                    break;
                }
                default:
                    // handle unknown chunk types if necessary
                    yield { type: 'unSupported', chunk: chunk };
                    break;
            }
        }

        // Yield completion event with usage
        const finalUsage = await result.usage;
        yield { type: 'complete', usage: finalUsage, finishReason: 'stop', durationMs: Date.now() - startTime };
    } catch (error) {
        console.error('[ai-sdk-adapter] Stream chat exception error:', error);
        yield { type: 'error', error: error as Error, durationMs: Date.now() - startTime };
    }
}

/**
 * Map MessagePart to AI SDK message content parts.
 * AI SDK supports text, image, file, reasoning, tool-call, and tool-result content parts.
 */
function mapContentPartToAiSdk(part: MessagePart): Array<
    | { type: 'text'; text: string }
    | { type: 'image'; image: string }
    | { type: 'file'; url: string; mediaType: string; filename?: string }
    | { type: 'reasoning'; text: string }
    | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
    | {
        type: 'tool-result'; toolCallId: string; toolName: string;
        output: ToolResultOutput;
    }
> {
    switch (part.type) {
        case 'text':
            return [{ type: 'text', text: part.text }];
        case 'image': {
            // Convert data to appropriate format for AI SDK
            let imageUrl: string;
            if (typeof part.data === 'string') {
                // If it's already a string, assume it's a URL or data URL
                imageUrl = part.data;
            } else {
                // Convert binary data to data URL
                const base64 = Buffer.from(part.data as any).toString('base64');
                imageUrl = `data:${part.mediaType};base64,${base64}`;
            }
            return [{ type: 'image', image: imageUrl }];
        }
        case 'file': {
            // Convert data to appropriate format for AI SDK
            let fileUrl: string;
            if (typeof part.data === 'string') {
                // If it's already a string, assume it's a URL
                fileUrl = part.data;
            } else {
                // Convert binary data to data URL
                const base64 = Buffer.from(part.data as any).toString('base64');
                fileUrl = `data:${part.mediaType};base64,${base64}`;
            }
            return [{
                type: 'file',
                url: fileUrl,
                mediaType: part.mediaType,
                filename: part.filename
            }];
        }
        case 'reasoning':
            return [{ type: 'reasoning', text: part.text }];
        case 'tool-call':
            // Use provided toolCallId or generate one if not provided
            const toolCallId = part.toolCallId ?? generateToolCallId();
            return [{
                type: 'tool-call',
                toolCallId,
                toolName: part.toolName,
                input: part.input
            }];
        case 'tool-result':
            return [{
                type: 'text',
                /**
                 * ollama-ai-provider-v2 don't support tool-result content part, so we fallback to text
                 * as for other providers, we don't handle this differently to keep consistent
                 * see. https://github.com/nordwestt/ollama-ai-provider-v2/blob/4f28ca78f2fd101ba485e691a73fdde60368d0c8/src/adaptors/convert-to-ollama-chat-messages.ts
                 *   "Unsupported part" for assistant message.
                 */
                text: JSON.stringify({
                    type: 'tool-result',
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    output: part.output
                })
            }];
        default:
            return [{ type: 'text', text: '' }];
    }
}

/**
 * Convert LLMRequestMessage to AI SDK CoreMessage format.
 * Handles system, user, and assistant roles.
 * System messages are extracted separately and should be passed via the 'system' parameter.
 */
export function toAiSdkMessages(messages: LLMRequestMessage[]): ModelMessage[] {
    const aiSdkMessages: ModelMessage[] = [];

    for (const message of messages) {
        // Skip system messages - they should be handled via extractSystemMessage
        if (message.role === 'system') {
            continue;
        }

        // Map content parts for user/assistant messages
        const contentParts = message.content.flatMap(mapContentPartToAiSdk);

        // Ensure at least one text part exists
        if (contentParts.length === 0) {
            contentParts.push({ type: 'text', text: '' });
        }

        // Convert to AI SDK message format
        aiSdkMessages.push({
            role: message.role,
            content: contentParts,
        } as ModelMessage);
    }

    return aiSdkMessages;
}

/**
 * Convert ReAct thought-agent history to ModelMessage[].
 * Assistant messages with tool-call + tool-result parts are split into:
 * - one assistant message (text, reasoning, tool_calls only)
 * - one tool message per tool-result (role 'tool'), so the API receives
 *   tool responses as separate messages, not embedded in assistant content.
 */
export function toReActThoughtPromptMessages(messages: LLMRequestMessage[]): ModelMessage[] {
    const out: ModelMessage[] = [];

    for (const message of messages) {
        if (message.role === 'system') continue;
        if (message.role === 'user') {
            const parts = message.content.flatMap(mapContentPartToAiSdk);
            out.push({
                role: 'user',
                content: parts.length ? parts : [{ type: 'text', text: '' }],
            } as ModelMessage);
            continue;
        }

        if (message.role === 'assistant') {
            const textParts: Array<{ type: 'text'; text: string } | { type: 'reasoning'; text: string }> = [];
            const toolCallParts: Array<{ type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }> = [];
            const toolResultParts: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; output: ToolResultOutput }> = [];

            for (const part of message.content) {
                switch (part.type) {
                    case 'text':
                        textParts.push({ type: 'text', text: part.text });
                        break;
                    case 'reasoning':
                        textParts.push({ type: 'reasoning', text: part.text });
                        break;
                    case 'tool-call': {
                        const id = part.toolCallId ?? generateToolCallId();
                        toolCallParts.push({
                            type: 'tool-call',
                            toolCallId: id,
                            toolName: part.toolName,
                            input: part.input,
                        });
                        break;
                    }
                    case 'tool-result':
                        toolResultParts.push({
                            type: 'tool-result',
                            toolCallId: part.toolCallId,
                            toolName: part.toolName,
                            output: part.output,
                        });
                        break;
                    default:
                        break;
                }
            }

            const assistantContent: unknown[] = textParts.length
                ? textParts
                : [{ type: 'text', text: '' }];
            if (toolCallParts.length > 0) {
                assistantContent.push(...toolCallParts);
            }
            out.push({
                role: 'assistant',
                content: assistantContent,
            } as ModelMessage);

            for (const tr of toolResultParts) {
                out.push({
                    role: 'tool',
                    content: [{
                        type: 'tool-result',
                        toolCallId: tr.toolCallId,
                        toolName: tr.toolName,
                        output: tr.output,
                    }],
                } as ModelMessage);
            }
        }
    }

    return out;
}

/**
 * Generate a unique tool call ID.
 * Used when the model doesn't provide one or when we need to create synthetic IDs.
 */
export function generateToolCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Extract system message text from LLMRequestMessage array.
 * Returns concatenated system message text or undefined if none.
 */
export function extractSystemMessage(request: LLMRequest<any>): string | undefined {
    if (request.system) {
        return request.system;
    }

    // parse from messages
    const messages = request.messages;
    const systemParts: string[] = [];
    for (const message of messages) {
        if (message.role !== 'system') {
            continue;
        }

        for (const part of message.content) {
            if (part.type === 'text') {
                systemParts.push(part.text);
            }
        }
    }
    return systemParts.length > 0 ? systemParts.join('\n\n') : undefined;
}

/**
 * Convert LLMRequestMessage array to human-readable text for template rendering.
 * Extracts text and reasoning content, skips tool calls/results.
 */
export function convertMessagesToText(messages: LLMRequestMessage[]): string {
    const lines: string[] = [];
    for (const msg of messages) {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        const textParts: string[] = [];

        for (const part of msg.content) {
            if (typeof part === 'string') {
                textParts.push(part);
            } else if (part.type === 'text' && part.text) {
                textParts.push(part.text);
            } else if (part.type === 'reasoning' && part.text) {
                // Include reasoning but mark it
                textParts.push(`[Reasoning: ${part.text.substring(0, 200)}${part.text.length > 200 ? '...' : ''}]`);
            }
            // Skip tool-call and tool-result parts
        }

        if (textParts.length > 0) {
            lines.push(`${role}: ${textParts.join(' ')}`);
        }
    }
    return lines.join('\n');
}