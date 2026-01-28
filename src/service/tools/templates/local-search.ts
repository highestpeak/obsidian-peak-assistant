/**
 * Local search template.
 * Generates markdown visualization for local search results with query, timing and result items.
 */
export const template = `# 🔍 Local Search Results for "{{query}}"

*Search completed in {{searchTime}}ms*

{{#if results}}
Found **{{results.length}}** results:

{{#each results}}
## 📄 {{title}}

- **Path**: \`{{path}}\`
- **Type**: {{type}}
- **Last Modified**: {{humanReadableTime lastModified}}
{{#if score}}
- **Score**: {{score}}{{/if}}
{{#if finalScore}}
- **Final Score**: {{finalScore}}{{/if}}
{{#if highlightedText}}
- **Highlight**: {{{highlightedText}}}
{{/if}}
{{#if content}}
- **Content Preview**: {{{content}}}
{{/if}}
{{#if loc}}
- **Location**: {{#if loc.line}}Line {{loc.line}}{{/if}}{{#if loc.charOffset}}, Char {{loc.charOffset}}{{/if}}
{{/if}}

---
{{/each}}
{{else}}
No results found for "{{query}}".
{{/if}}`;