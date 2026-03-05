{{#if hasFolderLines}}
## Folders
{{#each folderLines}}
- **{{folderPath}}**: {{inGroupCount}} files in this group; {{totalInFolder}} total in folder{{#if extraCount}} ({{extraCount}} more not in group){{/if}}
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
## Tags (top in group)
{{{tagDesc}}}
{{/if}}

{{#if hasMermaidCode}}
## Folder-scope links (with external)
**Graph composition:** Group node shows folder tree (path prefixes as trie, not flat list). Subgraph "Group" contains: internal doc nodes (aliases A, B, …, with degree when non-zero: only "in:X" or "out:Y" shown if the other is 0); real reference edges between them; keyword nodes (kw: token → doc list with degree per doc, Group→kw; docs shared by multiple tokens are moved to shared nodes and listed there only, with kw→shared edges); shared nodes (doc list with degree, no "shared" prefix); Orphans = internal docs with no reference edge and not hit by any kw (doc list with degree). External: ext out (Group→), ext in (→Group), ext mutual (Group↔); each lists external doc names with degree. Doc lists use "; " and line breaks; zero degrees are omitted to save token.
```mermaid
{{{mermaidCode}}}
```
{{/if}}
