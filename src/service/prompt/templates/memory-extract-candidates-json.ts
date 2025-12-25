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
- "category": one of "fact", "preference", "decision", "habit", "communication-style", "work-pattern", "tool-preference", "expertise-area", "response-style", "other"
- "confidence": 0-1 score indicating how certain this should be remembered

Category guide:
- "fact": Personal facts (e.g., "I'm studying Japanese")
- "preference": Preferences (e.g., "I prefer dark mode")
- "decision": Important decisions (e.g., "I've decided to use TypeScript")
- "habit": Work habits (e.g., "I work best in the morning")
- "communication-style": Communication preferences (e.g., "I prefer concise responses")
- "work-pattern": Work patterns (e.g., "I work best in the morning")
- "tool-preference": Tool preferences (e.g., "I use VS Code for coding")
- "expertise-area": Areas of expertise (e.g., "I'm experienced in React")
- "response-style": Response style preferences (e.g., "I prefer detailed explanations")
- "other": Other stable information

Example: [{"text": "I prefer dark mode for all applications", "category": "preference", "confidence": 0.9}]

Return only the JSON array, nothing else.`;

export const expectsJson = true;
export const jsonConstraint = 'Return only the JSON array, nothing else.';
