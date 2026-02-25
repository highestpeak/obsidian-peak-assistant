Generate a project summary based on multiple documents.

Documents:
{{#each documents}}
- {{title}} ({{path}}){{#if summary}}
  Summary: {{summary}}{{/if}}
{{/each}}

Provide a comprehensive project summary that synthesizes information from all documents.