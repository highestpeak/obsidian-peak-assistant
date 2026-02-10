/**
 * Memory candidate extraction prompt (JSON output).
 */
export const template = `Extract potential long-term memory items from this conversation exchange. Focus on:
- Personal facts (e.g., "I'm studying Japanese")
- Preferences (e.g., "I prefer dark mode")
- Important decisions (e.g., "I've decided to use TypeScript")
- Work habits (e.g., "I work best in the morning")
- Any stable, evergreen information the user wants remembered

{{#if context}}
{{#each context}}
{{@key}}: {{this}}
{{/each}}
{{/if}}

User: {{userMessage}}
Assistant: {{assistantReply}}

Return a JSON array of memory candidate objects, each with:
- "text": the memory statement (concise, specific)
- "category": a short section name you choose (e.g. "Preferences", "Work pattern", "Expertise"). You decide the name.
- "confidence": 0-1 score indicating how certain this should be remembered

Example: [{"text": "I prefer dark mode for all applications", "category": "Preferences", "confidence": 0.9}]

Return only the JSON array, nothing else.`;

export const expectsJson = true;
export const jsonConstraint = 'Return only the JSON array, nothing else.';
