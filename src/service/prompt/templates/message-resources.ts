/**
 * Message resources template for listing attachments in non-latest messages.
 */
export const template = `For this message. You can reference these resources. Each has a id you can reference to find from other part of this message. To get full content, use the appropriate tool if available.

{{#each resources}}
- {{id}}
{{/each}}`;

export const expectsJson = false;
