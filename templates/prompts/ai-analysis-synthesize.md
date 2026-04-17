## All Analysis Rounds

{{#each rounds}}
### Round {{@index}}{{#if @first}} (Initial){{else}} (Follow-up){{/if}}: {{{this.query}}}

**Summary:** {{{this.summary}}}

{{#each this.sections}}
#### {{{this.title}}}
{{{this.content}}}
{{/each}}

{{#if this.annotations.length}}
**Annotations:**
{{#each this.annotations}}
- [{{{this.type}}}] on "{{{this.sectionTitle}}}": "{{{this.comment}}}"
{{/each}}
{{/if}}
{{/each}}

---

Synthesize all rounds above into a single coherent report. Return JSON with `summary` and `sections` fields.
