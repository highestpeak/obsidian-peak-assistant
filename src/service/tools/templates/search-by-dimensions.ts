/**
 * Search by dimensions template.
 * Generates markdown visualization for documents matching boolean expressions on tags and categories.
 * Shows filtered results with semantic scores and metadata.
 */
export const template = `# 🔍 Dimension Search

expression: {{boolean_expression}}

{{#if items.length}}

Filtered from {{total_found}} total documents.
Filtered by semantic similarity: {{semantic_filtered_cnt}}, filtered by other dimensions: {{all_filtered_cnt}}.
Finally found {{items.length}} matching documents. 

{{#each items}}
## {{inc @index}}.- **{{label}}**
    - id: {{id}}
    - attributes: \`{{attributes}}\`
    - created_at: {{humanReadableTime created_at}}
    - updated_at: {{humanReadableTime updated_at}}
{{#if similarityScore}}
    - similarity: {{similarityScore}}
{{/if}}
{{/each}}

{{else}}
No documents found matching the criteria.
{{/if}}`;