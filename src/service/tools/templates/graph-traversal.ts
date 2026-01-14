/**
 * Graph traversal template.
 * Generates markdown visualization for graph traversal results with physical and semantic neighbors.
 */
export const template = `# 🔍 Graph Traversal ({{hops}} hops from [[{{start_note_path}}]])

{{#if isTimeOut}}
> ⚠️ **Notice**: Traversal reached time limit. Some distant nodes might be missing.
{{/if}}

{{#each levels}}
## 🌳 Depth {{depth}}
{{#if documentNodes}}
*Found {{documentNodes.length}} key nodes at this distance.*
{{/if}}
{{#if tagDesc}}
**Tags**: {{tagDesc}}
{{/if}}
{{#if categoryDesc}}
**Categories**: {{categoryDesc}}
{{/if}}

{{#if documentNodes}}
{{#each documentNodes}}
- {{type}} - **{{label}}**
  - foundBy: *{{foundBy}}*
{{#if similarity}}
  - similarity: {{similarity}}
{{/if}}
  - id: {{id}}
  - attributes: \`{{attributes}}\`
  - created_at: {{humanReadableTime created_at}}
  - updated_at: {{humanReadableTime updated_at}}
{{/each}}
{{/if}}

{{#if omittedDocNodeCnt}}
- *... and {{omittedDocNodeCnt}} more nodes at this depth were omitted to save tokens.*
{{/if}}
{{/each}}
`;