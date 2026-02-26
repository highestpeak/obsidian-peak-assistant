# OBSERVATION
- **The Core Intent**: {{originalQuery}}
- **Current analysis context**:
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
Output valid Mermaid only: fix node ids (no dots), quote labels with parentheses/special chars, use <br> for line breaks (NOT \\n), avoid unsupported syntax.
{{/if}}

# DIRECTIVE
1. **Perceive the Pattern**: Is the logic expanding (Mindmap), progressing (Timeline), structured (Flowchart), or systemic (ER)?
2. **Richness**: Produce at least 6–12 nodes. Include key topics, main concepts, and conclusions. Use subgraph to group related nodes. Keep each label short (one phrase); no long blocks of text per node.
3. **Balanced layout**: Mix vertical and horizontal flow; avoid a single long vertical or horizontal chain. Branch and group so the diagram is balanced and easy to scan.
4. **Syntax**: Use \`<br>\` for line breaks in labels, NOT \`\\n\`. FORBIDDEN: \\n, & merge.

# OUTPUT LANGUAGE
Use the same language as the user's original query for all labels.

Project the geometry of this analysis now.