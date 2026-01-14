/**
 * Find key nodes template.
 * Generates markdown visualization for key nodes analysis showing source and sink nodes.
 * Provides clear guidance for Agent interpretation and user recommendations.
 */
export const template = `# 🔑 Key Nodes Analysis

## 🔗 Physical Source Nodes - **Your Knowledge Hubs**
*These nodes have strong outward connections based on your existing link structure*
*→ **Your established centers**: These are the hubs you've already built in your knowledge graph*
{{#each physical_source_nodes}}
{{index}}. [[{{label}}]] ({{degree}} outgoing links)
{{/each}}

## 🔗 Physical Sink Nodes - **Core Concepts**
*These nodes receive many references based on your existing link structure*
*→ **Your fundamental concepts**: These are the core ideas you've already identified and connected*
{{#each physical_sink_nodes}}
{{index}}. [[{{label}}]] ({{degree}} incoming links)
{{/each}}

---
**🔍 Agent Interpretation Guide:**
- **🔗 Physical nodes**: Your "explicit consensus" - relationships you've consciously established
- **Source nodes**: Good starting points for exploration (high outgoing links)
- **Sink nodes**: Core concepts or foundations (high incoming links)`;