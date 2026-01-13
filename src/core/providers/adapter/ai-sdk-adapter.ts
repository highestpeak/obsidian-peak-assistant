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
import { LLMRequest, LLMResponse, LLMStreamEvent, LLMResponseSource, MessagePart, LLMRequestMessage } from '../types';

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
            console.debug('[ai-sdk-adapter] Chunk:', chunk);
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
                        usage: chunk.totalUsage
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
        yield { type: 'complete', usage: finalUsage, durationMs: Date.now() - startTime };
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
    | { type: 'tool-result'; toolCallId: string; toolName: string; output: unknown }
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
            // Generate a tool call ID if not provided
            const toolCallId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            return [{
                type: 'tool-call',
                toolCallId,
                toolName: part.toolName,
                input: part.input
            }];
        case 'tool-result':
            return [{
                type: 'tool-result',
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                output: part.output
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