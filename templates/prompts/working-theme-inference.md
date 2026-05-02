Based on the user's recent activities in their knowledge base, infer what they are currently working on. Be specific and concise (1-2 sentences).

## Recent Activities
{{#each activities}}
- [{{type}}] {{summary}}
{{/each}}

Respond with JSON: {"summary": "...", "relatedFiles": ["path1", "path2"]}
