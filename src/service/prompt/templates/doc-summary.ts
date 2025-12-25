/**
 * Document summary prompt.
 */
export const template = `Summarize this document concisely (200-500 characters).

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
