# 📂 Context for [[{{note_path}}]]

## 🏷️ Identity
**Tags**: {{#each tags}} #{{this}}, {{/each}}
{{#if categories}}
**Categories**: {{#each categories}} {{this}}, {{/each}}
{{/if}}

## 🔗 Relationships

{{#if incoming.documentNodes}}
### 📥 Incoming Links ({{incoming.documentNodes.length}})
{{#each incoming.documentNodes}} - **{{label}}**
    - id: {{id}}
    - attributes: 
{{{toYaml attributes 8}}}
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
    - attributes:
{{{toYaml attributes 8}}}
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
    - attributes:
{{{toYaml attributes 8}}}
    - created_at: {{humanReadableTime created_at}}
    - updated_at: {{humanReadableTime updated_at}}
{{/each}}
{{#if semanticNeighbors.omittedDocNodeCnt}}
*... and {{semanticNeighbors.omittedDocNodeCnt}} more semantic neighbors were omitted to save tokens.*
{{/if}}
{{/if}}