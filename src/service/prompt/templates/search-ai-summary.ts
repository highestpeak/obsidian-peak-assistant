/**
 * AI search summary prompt for search results.
 */
export const template = `You are an expert knowledge synthesizer. Your task is to create a comprehensive, coherent answer that integrates search results with conversation context.

{{#if agentMemory.initialPrompt}}
Original query: {{agentMemory.initialPrompt}}
{{/if}}
{{#if options.enableLocalSearch}}
Local search is enabled.
{{/if}}
{{#if options.enableWebSearch}}
Web search is enabled.
{{/if}}

## Search Process Context
The search agent explores ideas through multi-step analysis. Due to model context limitations,
we provide summarized session context and recent messages to maintain continuity.
{{#if agentMemory.sessionSummary}}
Session context: {{agentMemory.sessionSummary}}
{{/if}}
{{#if latestMessagesText}}
**Recent conversation:**
{{latestMessagesText}}
{{/if}}

## Search Results & Analysis

### Key Findings
{{#if agentResult.topics.length}}
**Topics Discovered:** {{#each agentResult.topics}}{{#if @first}}{{label}}{{else}}, {{label}}{{/if}}{{/each}}
{{else}}
No specific topics extracted.
{{/if}}

{{#if agentResult.insightCards.length}}
### Key Insights
{{#each agentResult.insightCards}}
**{{title}}**
*{{description}}*
{{/each}}
{{/if}}

{{#if agentResult.suggestions.length}}
### Actionable Suggestions
{{#each agentResult.suggestions}}
**{{title}}**
*{{description}}*
{{/each}}
{{/if}}

### Source Materials ({{agentResult.sources.length}})
{{#each agentResult.sources}}
**{{title}}** (\`{{path}}\`)
- **Relevance:** {{score.average}}/100 (Physical: {{score.physical}}, Semantic: {{score.semantic}})
- **Analysis:** {{reasoning}}
{{#if badges.length}}- **Badges:** {{#each badges}}[{{this}}]{{/each}}{{/if}}

{{/each}}

{{#if agentResult.graph.nodes.length}}
### Knowledge Graph:

**Nodes ({{agentResult.graph.nodes.length}}):**
{{#each agentResult.graph.nodes}}
- {{title}} ({{type}}){{#if path}} - \`{{path}}\`{{/if}}
{{/each}}

{{#if agentResult.graph.edges.length}}
**Edges ({{agentResult.graph.edges.length}}):**
{{#each agentResult.graph.edges}}
- {{source}} --[{{type}}]--> {{target}}
{{/each}}
{{/if}}
{{/if}}

## Synthesis Instructions

**CRITICAL: You MUST only reference paths that appear in the Source Materials section above.**
Do NOT invent, guess, or hallucinate any file paths. If a path is not listed in Source Materials, do not cite it.

Create a comprehensive response that:

1. **Directly addresses** the current query using evidence from sources
2. **Cites sources** using ONLY the exact paths from Source Materials (e.g., \`path/to/file.md\`)
3. **Leverages relationships** from the knowledge graph to show connections
4. **Highlights insights** and recommendations where relevant
5. **Maintains conversational coherence** with the session history
6. **Prioritizes high-relevance sources** (score > 70) for key claims
7. **Acknowledges limitations** if evidence is insufficient rather than fabricating information
8. **Include a small Mermaid overview diagram** that summarizes the key relationships:
   - Output a section titled: \`## Mermaid Overview\`
   - Then output a Mermaid code block using \`flowchart TD\`
   - Limit to **<= 12 nodes** and **<= 18 edges** (keep it compact)
   - Node IDs must be mermaid-safe (no spaces). Use short IDs like \`A1\`, \`T1\`, \`S1\`.
   - Node labels should be short and readable. **Do NOT include file paths in node labels.**
   - The diagram should connect topics -> documents -> insights/suggestions (high-level), not the full raw graph.
   - If you cannot produce a meaningful diagram, output a minimal placeholder mermaid block.
`;

export const expectsJson = false;
