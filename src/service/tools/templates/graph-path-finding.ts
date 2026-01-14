/**
 * Graph path finding template.
 * Generates markdown visualization for paths between two notes with connection details.
 */
export const template = `# Paths from [[{{start_note_path}}]] to [[{{end_note_path}}]]

{{#each paths}}
## Path {{index}} ({{steps}} steps)
{{pathString}}
*Connections: {{connectionDetails}}*
{{/each}}`;