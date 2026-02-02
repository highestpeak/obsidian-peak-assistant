/**
 * AI-generated folder path for saving AI analysis results.
 */
export const template = `You are a helpful assistant. Suggest a vault-relative folder path for saving an AI analysis note.

Search query: {{query}}
{{#if summary}}
Summary excerpt: {{summary}}
{{/if}}

Context: This is an Obsidian vault. Paths use forward slashes. Root is empty string or single folder name.

Rules:
- Return a folder path like "Analysis/AI Searches" or "Projects/MyTopic"
- No leading/trailing slashes
- Maximum 100 characters
- Be organized and descriptive

Return only the folder path, no quotes or additional text.`;

export const expectsJson = false;
