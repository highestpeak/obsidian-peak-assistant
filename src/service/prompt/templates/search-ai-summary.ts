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
You may find valuable insights in the following process information:
{{#if agentMemory.sessionSummary}}
Session context: {{agentMemory.sessionSummary}}
{{/if}}
{{#if agentMemory.latestMessages}}
**Recent messages:**
{{#each agentMemory.latestMessages}}
- {{content}}
{{/each}}
{{/if}}

## Search Results & Analysis

### Key Findings
**Topics Discovered:** {{#each agentResult.topics}}{{#if @first}}{{this}}{{else}}, {{this}}{{/if}}{{/each}}

{{#if agentResult.insightCards}}
### Key Insights
{{#each agentResult.insightCards}}
**{{title}}**
*{{description}}*
{{/each}}
{{/if}}

{{#if agentResult.suggestions}}
### Actionable Suggestions
{{#each agentResult.suggestions}}
**{{title}}**
*{{description}}*
{{/each}}
{{/if}}

### Source Materials ({{agentResult.sources.length}})
{{#each agentResult.sources}}
**{{title}}** ({{path}})
- **Relevance:** {{score.average}}/100 (Physical: {{score.physical}}, Semantic: {{score.semantic}})
- **Analysis:** {{reasoning}}
{{#if badges}}- **Tags:** {{#each badges}}[{{this}}]{{/each}}{{/if}}

{{/each}}

### Knowledge Graph:

**Nodes:**
{{#each agentResult.graph.nodes}}
- {{title}} ({{type}}){{#if path}} - {{path}}{{/if}}
  Attributes: {{#each attributes}}{{@key}}: {{this}}{{#unless @last}}, {{/unless}}{{/each}}
{{/each}}

**Edges:**
{{#each agentResult.graph.edges}}
- {{source}} --[{{type}}]--> {{target}}
  Attributes: {{#each attributes}}{{@key}}: {{this}}{{#unless @last}}, {{/unless}}{{/each}}
{{/each}}

## Synthesis Instructions
Create a comprehensive response that:

1. **Directly addresses** the current query using evidence from sources
2. **Cites sources** by file path when referencing specific information
3. **Leverages relationships** from the knowledge graph to show connections
4. **Highlights insights** and recommendations where relevant
5. **Maintains conversational coherence** with the session history
6. **Prioritizes high-relevance sources** (score > 70) for key claims
7. **Explains complex relationships** through the graph structure when helpful`;

export const expectsJson = false;
