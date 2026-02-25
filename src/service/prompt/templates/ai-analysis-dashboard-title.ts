/**
 * Short display title for an AI analysis (used for save filename, recent list, folder suggestion).
 */
export const template = `You are a helpful assistant. Generate a short, human-readable title for this AI analysis (one line).

Search query: {{query}}
{{#if summary}}
Summary excerpt: {{{summary}}}
{{/if}}

Rules:
- One line, maximum 20 characters
- Descriptive of the analysis topic, suitable for file names and list display
- No quotes or leading/trailing punctuation

Return only the title, no other text.`;

export const expectsJson = false;
