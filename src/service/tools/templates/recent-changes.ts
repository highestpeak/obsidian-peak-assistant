/**
 * Recent changes template.
 * Generates markdown visualization for recently accessed/changed files in the vault.
 */
export const template = `# 🕒 Recent Changes in Vault

{{#if items}}
Found **{{items.length}}** recently accessed files:

{{#each items}}
## 📄 {{title}}

- **Path**: \`{{path}}\`
- **Type**: {{type}}
- **Last Accessed**: {{humanReadableTime lastModified}}
{{#if score}}
- **Score**: {{score}}{{/if}}
{{#if finalScore}}
- **Final Score**: {{finalScore}}{{/if}}

---
{{/each}}
{{else}}
No recently accessed files found.
{{/if}}`;