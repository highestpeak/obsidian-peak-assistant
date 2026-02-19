/**
 * User prompt for follow-up question suggestion. Session context; execution rules.
 * System prompt holds constitutional principles.
 */
export const template = `# SESSION CONTEXT

You are given a compressed view of the **entire analysis session** (user query, reasoning steps, search results, summary).

<<<
{{sessionContext}}
>>>

# TASK

Propose follow-up questions the user might want to ask next.

# RULES
- Output an object with a \`questions\` array of strings. Each question: one short sentence, same language as the user's query.
- Maximize diversity: deeper dive, contradictions, blindspots, next steps, related topics, edge cases, opposing views. Avoid redundant or overlapping questions.
- Propose as many questions as are genuinely useful; do not artificially limit the count.`;
