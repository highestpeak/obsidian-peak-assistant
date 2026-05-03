# Structural Hole Analysis

## Summary
- **{{summary.totalCommunities}}** communities detected
- **{{summary.totalGaps}}** structural holes found (showing top {{summary.shownGaps}})
- **{{summary.totalBridges}}** bridge nodes identified

{{#if gaps.length}}
## Structural Holes (Knowledge Gaps)

*Semantically related topic clusters with missing or weak connections — high-value opportunities for cross-domain synthesis.*

{{#each gaps}}
### {{communityALabel}} <-> {{communityBLabel}}
- **Gap score:** {{toFixed gapScore 2}} | **Semantic similarity:** {{toFixed semanticSim 2}} | **Edge density:** {{toFixed interDensity 4}}
- **Sizes:** {{communityASize}} notes <-> {{communityBSize}} notes
{{#if bridgeCandidateLabels.length}}
- **Bridge candidates:** {{#each bridgeCandidateLabels}}[[{{path}}|{{label}}]]{{#unless @last}}, {{/unless}}{{/each}}
{{/if}}

{{/each}}
{{else}}
*No structural holes detected above the threshold.*
{{/if}}

{{#if bridges.length}}
## Key Bridge Nodes

*Notes that bridge multiple communities — occupying structural hole positions with high creative value (Burt 2004).*

| Note | Betweenness | Constraint | Community |
|------|------------|------------|-----------|
{{#each bridges}}
| [[{{path}}|{{label}}]] | {{toFixed betweenness 3}} | {{toFixed burtConstraint 3}} | {{communityLabel}} |
{{/each}}
{{/if}}

{{#if communities.length}}
## Communities

| ID | Label | Members | Avg Betweenness |
|----|-------|---------|-----------------|
{{#each communities}}
| {{id}} | {{label}} | {{memberCount}} | {{toFixed avgBetweenness 4}} |
{{/each}}
{{/if}}
