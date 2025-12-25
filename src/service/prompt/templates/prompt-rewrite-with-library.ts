/**
 * Prompt rewrite prompt.
 */
export const template = `Rewrite the user's prompt to improve quality. Preserve the user's intent while fixing issues.

Original prompt:
{{originalPrompt}}

Quality issues identified:
{{#each qualityIssues}}
- {{this}}
{{/each}}

Rewrite the prompt to:
1. Fix all identified issues
2. Maintain the user's original intent
3. Add clear output format requirements if missing
4. Include examples if helpful

Provide the rewritten prompt only, no additional commentary.`;

export const expectsJson = false;
