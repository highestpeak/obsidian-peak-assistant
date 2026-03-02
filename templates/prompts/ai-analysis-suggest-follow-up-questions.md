# SESSION CONTEXT

- **User query**: {{initialPrompt}}

{{#if dashboardBlocks}}
# PRIMARY CONTEXT: FINAL DASHBOARD BLOCKS
Use the **final dashboard blocks** below (and Confirmed Facts if provided) to propose follow-up questions. Questions should extend, challenge, or deepen what the blocks present (e.g. "Dashboard mentions risk but not mitigation—suggest searching for countermeasures?").
<<<
{{{dashboardBlocks}}}
>>>
{{/if}}
{{#if confirmedFacts}}
# CONFIRMED FACTS (use with blocks to spot gaps)
<<<
{{{confirmedFacts}}}
>>>
{{/if}}
{{#if topics}}
- **Current topics**: {{{topics}}}
{{/if}}

# TASK

Propose follow-up questions from **dashboard blocks** and **confirmed facts** only (no raw session memory). Base questions on what the dashboard already shows and what facts suggest is still missing or worth probing.

# RULES
- Output an object with a \`questions\` array of strings. Each question: one short sentence, same language as the user's query.
- Maximize diversity: deeper dive, contradictions, blindspots, next steps, related topics, edge cases, opposing views. Avoid redundant or overlapping questions.
- Prefer questions that "penetrate" the dashboard content (e.g. challenge a conclusion, ask for the next step after an action, or probe a trade-off). Do not artificially limit the count.