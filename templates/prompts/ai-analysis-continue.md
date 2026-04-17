## Previous Analysis

**Original Query:** {{{originalQuery}}}

{{#each rounds}}
### Round {{@index}} {{#if @first}}(Initial){{else}}(Follow-up){{/if}}: {{{this.query}}}

**Summary:** {{{this.summary}}}

{{#each this.sections}}
#### {{{this.title}}}
{{{this.content}}}
{{/each}}

{{#if this.annotations.length}}
**User Annotations:**
{{#each this.annotations}}
- Section "{{{this.sectionTitle}}}"{{#if this.selectedText}} | "{{{this.selectedText}}}"{{/if}} | [{{this.type}}]: "{{{this.comment}}}"
{{/each}}
{{/if}}
{{/each}}

## Sources Used So Far

{{#each sources}}
- [[{{{this.path}}}]]{{#if this.relevance}} — {{{this.relevance}}}{{/if}}
{{/each}}

{{#if graphSummary}}
## Key Relationships

{{#each graphSummary.keyRelationships}}
- {{{this}}}
{{/each}}
{{/if}}

---

## Follow-up Request

{{{followUpQuery}}}
