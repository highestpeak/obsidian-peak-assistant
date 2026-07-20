# Context Memory

{{#if hasProject}}
## Project Context

### Project: {{projectName}}
{{#if projectDescription}}

**Description (user-provided):**
{{projectDescription}}
{{/if}}
{{#if projectInstructions}}

**Instructions (user-provided — follow these):**
{{projectInstructions}}
{{/if}}
{{#if projectSummary}}

**Summary (auto-generated):**
{{projectSummary}}
{{/if}}
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