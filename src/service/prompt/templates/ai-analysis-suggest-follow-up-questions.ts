/**
 * User prompt for follow-up question suggestion. Variables: FollowUpQuestionVariables.
 */
export const template = `# SESSION CONTEXT

- **User query**: {{initialPrompt}}
- **Latest analysis context**:
<<<
{{{agentMemoryMessage}}}
>>>
{{#if topics}}
- **Current topics**: {{{topics}}}
{{/if}}
{{#if dashboardBlocks}}
- **Current dashboard blocks**: {{{dashboardBlocks}}}
{{/if}}

# TASK

Propose follow-up questions the user might want to ask next.

# RULES
- Output an object with a \`questions\` array of strings. Each question: one short sentence, same language as the user's query.
- Maximize diversity: deeper dive, contradictions, blindspots, next steps, related topics, edge cases, opposing views. Avoid redundant or overlapping questions.
- Propose as many questions as are genuinely useful; do not artificially limit the count.`;
