
import { getToolErrorMessage } from '../adapter/ai-sdk-adapter';
import { ChatRole, LLMRequestMessage, LLMStreamEvent, StreamTriggerName, ToolResultOutput } from '../types';

export function buildLLMRequestMessage(role: ChatRole, content: string): LLMRequestMessage {
    return {
        role,
        content: [{ type: 'text', text: content }],
    };
}

/**
 * Concatenate LLMRequestMessage content
 * Optimized to use array accumulation instead of string concatenation for better memory performance
 */
export function concatLLMRequestMessages(messages: LLMRequestMessage[]): string {
    const contentParts: string[] = [];
    for (const message of messages) {
        contentParts.push(`# ${message.role}:\n`);
        if (!message.content || message.content.length === 0) {
            contentParts.push(`No content.\n\n`);
            continue;
        }

        type toolCallSequence = { toolName: string; input: any }
            | { toolCallId: string; toolName: string; output: ToolResultOutput }
        const toolCallSequence: toolCallSequence[] = [];
        for (const part of message.content) {
            switch (part.type) {
                case 'text':
                    contentParts.push(`## Content:\n ${message.content}\n`);
                    break;
                case 'reasoning':
                    contentParts.push(`## Reasoning:\n ${part.text}\n`);
                    break;
                case 'tool-call':
                    toolCallSequence.push({ toolName: part.toolName, input: part.input });
                    break;
                case 'tool-result':
                    toolCallSequence.push({ toolCallId: part.toolCallId, toolName: part.toolName, output: part.output });
                    break;
            }
        }

        contentParts.push(`## Tool Calls:\n`);
        for (const toolCall of toolCallSequence) {
            contentParts.push(`- ${toolCall.toolName}:\n`);
            if ('input' in toolCall) {
                contentParts.push(`  - Input:\`${JSON.stringify(toolCall.input)}\` \n`);
            }
            if ('output' in toolCall) {
                contentParts.push(`  - Output:\`${JSON.stringify(toolCall.output)}\` \n`);
            }
        }
        contentParts.push('\n');
    }
    return contentParts.join('');
}

export function buildToolCorrectionMessage(toolName: string, errorMessage: string): LLMRequestMessage {
    return buildLLMRequestMessage('assistant',
        `Error: Attempted to call '${toolName}'. But failed. If you think the error is recoverable, please try again. ` +
        `Error message: ${errorMessage}`
    )
}

export function buildToolCorrectionMessageFromChunk(chunk: any): LLMRequestMessage {
    return buildToolCorrectionMessage(
        (chunk as any).toolName ?? 'unknown',
        getToolErrorMessage(chunk)
    )
}

export function buildToolErrorStreamEvent(toolName: string, errorMessage: string, chunk: any, triggerName: StreamTriggerName): LLMStreamEvent {
    return {
        type: 'error',
        error: new Error(`Tool ${toolName} failed: ${errorMessage}`),
        triggerName,
        extra: { toolName, toolCallId: (chunk as any).toolCallId },
    }
}

export function buildToolResultStreamEventFromChunk(chunk: any, triggerName: StreamTriggerName): LLMStreamEvent {
    const errMsg = getToolErrorMessage(chunk);
    const toolName = (chunk as any).toolName ?? 'unknown';
    return {
        type: 'error',
        error: new Error(`Tool ${toolName} failed: ${errMsg}`),
        extra: { toolName, toolCallId: (chunk as any).toolCallId },
        triggerName,
    }
}