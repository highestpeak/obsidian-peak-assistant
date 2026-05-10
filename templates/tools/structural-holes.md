# Structural Holes Analysis

## Communities ({{communities.length}} detected)
{{#each communities}}
- **{{label}}** ({{memberCount}} notes, density: {{toFixed internalDensity 3}})
  {{#if dominantTopics.length}}Topics: {{#each dominantTopics}}{{this}}{{#unless @last}}, {{/unless}}{{/each}}{{/if}}
  Top nodes: {{#each topNodes}}[[{{path}}]]{{#unless @last}}, {{/unless}}{{/each}}
{{/each}}

{{#if holes.length}}
## Structural Holes ({{holes.length}} gaps)
{{#each holes}}
### Gap {{@index}}: {{communityA.label}} -- {{communityB.label}}
- **Score:** {{toFixed gapScore 2}} | **Type:** {{gapType}}
- **Semantic bridge potential:** {{toFixed semanticBridgePotential 2}}
{{#if existingBridges.length}}
- **Existing bridges ({{existingBridges.length}}):**
  {{#each existingBridges}}
  - [[{{path}}]] (BC: {{toFixed betweenness 3}}, fragility: {{fragility}})
  {{/each}}
{{else}}
- **No existing bridges** -- this is a true knowledge gap
{{/if}}
{{#if potentialBridges.length}}
- **Suggested bridges:**
  {{#each potentialBridges}}
  - [[{{sourceNode.path}}]] -> [[{{targetNode.path}}]] (similarity: {{toFixed semanticSimilarity 2}}, action: {{suggestedAction}})
    {{rationale}}
  {{/each}}
{{/if}}
{{#if explanation}}
- **Why it matters:** {{explanation}}
{{/if}}

{{/each}}
{{else}}
No significant structural holes detected. Your knowledge graph is well-connected.
{{/if}}

{{#if bridges.length}}
## Top Bridge Nodes
{{#each bridges}}
{{@index}}. [[{{path}}]] (BC: {{toFixed betweenness 3}}, constraint: {{toFixed constraint 3}}, community: {{communityId}})
{{/each}}
{{/if}}

---
**Legend:**
- **BC (Betweenness Centrality):** Higher = more paths flow through this node
- **Constraint:** Lower = more structural hole occupant (diverse connections)
- **Gap Score:** Higher = more important knowledge gap to address
