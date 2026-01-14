/**
 * Document summary prompt.
 */
export const template = `Summarize this document concisely ({{#if wordCount}}{{wordCount}}{{else}}200-500{{/if}} characters).

{{#if title}}
Title: {{title}}
{{/if}}

{{#if path}}
Path: {{path}}
{{/if}}

Content:
{{content}}

Provide a concise summary focusing on key points and main ideas.`;

export const expectsJson = false;
