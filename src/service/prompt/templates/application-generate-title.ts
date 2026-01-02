/**
 * Title generation prompt for conversations.
 */
export const template = `You are a helpful assistant. Generate a concise, descriptive title (maximum 50 characters) for this conversation based on the initial messages. Return only the title, no quotes or additional text.

{{#if contextInfo}}
{{contextInfo}}
{{/if}}

Conversation:
{{#each messages}}
{{role}}: {{content}}
{{/each}}

Generate a title for this conversation.`;

export const expectsJson = false;
