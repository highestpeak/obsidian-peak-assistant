
import { ChatRole, LLMRequestMessage, ToolResultOutput } from '../types';

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
