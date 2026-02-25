You are a helpful assistant. Generate a concise, file-system-safe filename (without extension) for saving an AI analysis note.

Search query: {{query}}
{{#if summary}}
Summary excerpt: {{{summary}}}
{{/if}}

Rules:
- Maximum 60 characters
- Use only letters, numbers, spaces, and hyphens (no slashes or special chars)
- Be descriptive but concise
- Do NOT include .md or date in the output

Return only the filename, no quotes or additional text.