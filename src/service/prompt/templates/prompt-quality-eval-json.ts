/**
 * Prompt quality evaluation prompt (JSON output).
 */
export const template = `Evaluate the quality of this user-provided prompt. Identify issues such as:
- Vague or unclear instructions
- Missing context or constraints
- Poor formatting
- Ambiguous output requirements
- Lack of examples

{{#if taskHint}}
Intended task: {{taskHint}}
{{/if}}

User prompt:
{{prompt}}

Return a JSON object:
{
  "qualityScore": 0-1,
  "issues": ["issue 1", "issue 2"],
  "suggestions": ["suggestion 1", "suggestion 2"]
}

Return only the JSON object, nothing else.`;

export const expectsJson = true;
export const jsonConstraint = 'Return only the JSON object, nothing else.';
