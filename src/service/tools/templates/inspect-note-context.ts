/**
 * Inspect note context template.
 * Generates markdown context for a single note including location, identity, and relationships.
 */
export const template = `# 📂 Context for [[{{note_path}}]]

## 🏷️ Identity
**Tags**: {{#each tags}} #{{this}}, {{/each}}
**Categories**: {{#each categories}} {{this}}, {{/each}}

## 🔗 Relationships

{{#if incoming.documentNodes}}
### 📥 Incoming Links ({{incoming.documentNodes.length}})
{{#each incoming.documentNodes}} - **{{label}}**
    - id: {{id}}
    - attributes: \`{{attributes}}\`
    - created_at: {{humanReadableTime created_at}}
    - updated_at: {{humanReadableTime updated_at}}
{{/each}}
{{#if incoming.omittedDocNodeCnt}}
*... and {{incoming.omittedDocNodeCnt}} more incoming links were omitted to save tokens.*
{{/if}}
{{/if}}

{{#if outgoing.documentNodes}}
### 📤 Outgoing Links ({{outgoing.documentNodes.length}})
{{#each outgoing.documentNodes}} - **{{label}}**
    - id: {{id}}
    - attributes: \`{{attributes}}\`
    - created_at: {{humanReadableTime created_at}}
    - updated_at: {{humanReadableTime updated_at}}
{{/each}}
{{#if outgoing.omittedDocNodeCnt}}
*... and {{outgoing.omittedDocNodeCnt}} more outgoing links were omitted to save tokens.*
{{/if}}
{{/if}}

{{#if semanticNeighbors.documentNodes}}
## 🔍 Semantic Note Neighbors
{{#each semanticNeighbors.documentNodes}} - **{{label}}**
    - similarity: {{similarity}}
    - id: {{id}}
    - attributes: \`{{attributes}}\`
    - created_at: {{humanReadableTime created_at}}
    - updated_at: {{humanReadableTime updated_at}}
{{/each}}
{{#if semanticNeighbors.omittedDocNodeCnt}}
*... and {{semanticNeighbors.omittedDocNodeCnt}} more semantic neighbors were omitted to save tokens.*
{{/if}}
{{/if}}`;