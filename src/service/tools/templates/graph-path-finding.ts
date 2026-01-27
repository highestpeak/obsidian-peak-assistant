/**
 * Graph path finding template.
 * Generates markdown visualization for paths between two notes with connection details.
 * Supports multiple strategy types with insight labels and reasoning.
 */
export const template = `# Paths from [[{{start_note_path}}]] to [[{{end_note_path}}]]

{{#each paths}}
## Path {{index}}: {{strategy}} ({{steps}} steps, score: {{score}})

{{pathString}}

*Connections:* {{connectionDetails}}

💡 *{{insightLabel}}*

*Why chosen:* {{reasoning}}

{{/each}}
{{#if analysis}}
---
{{analysis}}
{{/if}}`;
