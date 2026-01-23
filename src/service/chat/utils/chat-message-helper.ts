import { ChatMessage } from "../types";

export function concatChatMessages(messages: ChatMessage[]): string {
    let content = '';
    for (const message of messages) {
        content += `# ${message.role}:\n`;
        if (message.isErrorMessage) {
            content += `This is an error message.\n`;
            continue;
        }
        if(message.content) {
            content += `## Content:\n ${message.content}\n`;
            continue;
        }
        if (message.reasoning) {
            content += `## Reasoning:\n ${message.reasoning.content}\n`;
        }
        if (message.toolCalls) {
            content += `## Tool Calls:\n`;
            for (const toolCall of message.toolCalls) {
                content += `- ${toolCall.toolName}:\n`;
                content += `  - Input:\`${JSON.stringify(toolCall.input)}\` \n`;
                content += `  - Output:\`${JSON.stringify(toolCall.output)}\` \n`;
            }
        }
        content += '\n';
    }
    return content;
}