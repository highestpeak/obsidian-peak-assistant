# Context Memory

{{#if hasProject}}
## Project Context

### Project: {{projectName}}
{{projectSummary}}
{{#if projectResources.length}}

### Project Resources
{{#each projectResources}}
- {{displayName}}: {{displaySummary}}
{{/each}}
{{/if}}
{{/if}}

{{#if hasConversation}}
## Conversation Context

### Summary: {{conversationSummary}}
{{#if conversationTopics.length}}

### Topics: {{join conversationTopics ", "}}
{{/if}}
{{#if conversationResources.length}}

### Conversation Resources
{{#each conversationResources}}
- {{displayName}}: {{displaySummary}}
{{/each}}
{{/if}}
{{/if}}