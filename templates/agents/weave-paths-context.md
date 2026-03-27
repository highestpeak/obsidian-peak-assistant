{{#if hasFolderLines}}
## Folders
{{#each folderLines}}
- **{{folderPath}}**: {{inGroupCount}} files in this set; {{totalInFolder}} total in folder{{#if extraCount}} ({{extraCount}} more not in set){{/if}}
{{#if hasTopRecent}}
  - Recent: {{#each topRecent}}[[{{path}}]]{{#unless @last}}, {{/unless}}{{/each}}
{{/if}}
{{#if hasTopWordCount}}
  - Word count: {{#each topWordCount}}[[{{path}}]] ({{word_count}}){{#unless @last}}; {{/unless}}{{/each}}
{{/if}}
{{#if hasTopLinksIn}}
  - Top in-links: {{#each topLinksIn}}[[{{path}}]] ({{inDegree}}){{#unless @last}}; {{/unless}}{{/each}}
{{/if}}
{{#if hasTopLinksOut}}
  - Top out-links: {{#each topLinksOut}}[[{{path}}]] ({{outDegree}}){{#unless @last}}; {{/unless}}{{/each}}
{{/if}}
{{#if hasNameKeywords}}
  - Name keywords: {{#each nameKeywords}}{{keyword}}({{count}}){{#unless @last}}, {{/unless}}{{/each}}
{{/if}}
{{#if hasFolderTagDesc}}
  - Top tags: {{{folderTagDesc}}}
{{/if}}
{{/each}}
{{/if}}

{{#if hasTagDesc}}
## Topic tags (LLM, top in set)
{{{tagDesc}}}
{{/if}}

{{#if hasUserKeywordTagDesc}}
## User keywords (top in set)
{{{userKeywordTagDesc}}}
{{/if}}

{{#if hasMermaidCode}}
## Reference graph (with external)
**Graph:** Group = path tree. Internal doc nodes (A, B, … with in/out degree); real reference edges; keyword nodes (kw → doc list); shared nodes; Orphans = isolated docs not in any kw. External: ext out (Group→), ext in (→Group), ext mutual (Group↔).
```mermaid
{{{mermaidCode}}}
```
{{/if}}
