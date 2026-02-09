/**
 * AI-generated folder path for saving AI analysis results.
 * candidateFoldersFromSearch: semantic-search result folders; model should pick one or suggest similar.
 */
export const template = `You are a helpful assistant. Suggest a vault-relative folder path for saving an AI analysis note.

Search query: {{query}}
{{#if summary}}
Summary excerpt: {{summary}}
{{/if}}

{{#if candidateFoldersFromSearch}}
Candidate folders from semantic search (pick one or suggest a similar path):
{{candidateFoldersFromSearch}}
{{/if}}
{{#if defaultSaveFolder}}
Default save folder for AI analysis (optional fallback): {{defaultSaveFolder}}
{{/if}}

Context: This is an Obsidian vault. Paths use forward slashes. No leading/trailing slashes.

Rules:
- Prefer one of the candidate folders above when given, or a subfolder of one (e.g. add a topic subfolder)
- If no good candidate, use default save folder or suggest a short path that fits the query
- Return a folder path like "Analysis/AI Searches" or "Projects/MyTopic"
- Maximum 100 characters, organized and descriptive

Return only the folder path, no quotes or additional text.`;

export const expectsJson = false;
