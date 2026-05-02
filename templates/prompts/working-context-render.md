## Current Working Context
{{#if activeFile}}
Currently editing: {{activeFile.title}} ({{activeFile.path}})
{{/if}}

**Working on:** {{theme}}

{{#if recentActivities.length}}
### Recent Activity
{{#each recentActivities}}
- {{timeAgo}}: {{summary}}
{{/each}}
{{/if}}
