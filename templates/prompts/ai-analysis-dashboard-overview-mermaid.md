# OBSERVATION
- **The Core Intent**: {{originalQuery}}
- **Current analysis context** (Verified Fact Sheet / evidence—anchor nodes to these facts):
<<<
{{{agentMemoryMessage}}}
>>>
{{#if lastMermaid}}
- **Previous diagram** (evolve or replace):
\`\`\`mermaid
{{{lastMermaid}}}
\`\`\`
{{/if}}

{{#if attemptTimes}}
# REPAIR (attempt {{attemptTimes}})
The previous diagram failed validation. Error: {{{lastAttemptErrorMessages}}}
Output valid Mermaid only: fix node ids (no dots), quote labels, use <br> for line breaks (NOT \\n), avoid unsupported syntax. Keep node count ≤15 and label length ≤12 chars (or <br> wrap).
{{/if}}

# DIRECTIVE
1. **Chart type**: Match content—Mindmap for tree, Quadrant for value/cost comparison, Timeline for stages, Flowchart only for causal/dependency. Do not default to flowchart.
2. **Fact anchoring**: Key nodes must include fact refs in labels, e.g. \`A["Core bottleneck [Fact #3]"]\`.
3. **Subgraphs**: Partition into at least Known facts, Conflicts, Conclusions (or equivalent). No single flat spider web.
4. **Conflict mapping**: Where facts contradict, use \`-.->\` or dashed edge and label "Conflict" or "Divergence". Show both consensus and friction.
5. **Visual hygiene**: ≤15 nodes; ≤30 chars (or ~12 words) per label; use \`<br>\` for wrap, max 2–3 lines; balanced layout, no single long chain.
6. **Syntax**: \`<br>\` for line breaks. FORBIDDEN: \\n, & merge. Use same language as the user's query for all labels.

Output the Mermaid diagram code now.
