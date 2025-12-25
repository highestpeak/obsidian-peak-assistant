/**
 * Title generation prompt for conversations.
 */
export const template = `You are a helpful assistant. Generate a concise, descriptive title (maximum 50 characters) for this conversation based on the initial messages. Return only the title, no quotes or additional text.

Conversation:
{{#each messages}}
{{#if (eq role "assistant")}}Assistant{{else if (eq role "user")}}User{{else}}System{{/if}}: {{content}}
{{/each}}

Generate a title for this conversation.`;

export const expectsJson = false;
