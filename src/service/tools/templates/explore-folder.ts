/**
 * Explore folder template.
 * Generates markdown visualization for folder exploration results with file tree, tags, categories and statistics.
 */
export const template = `# 📁 Folder Exploration: {{current_path}}

{{#if recursive}}*Recursive exploration (max depth: {{max_depth}})*{{else}}*Non-recursive exploration*{{/if}}

{{#if tagDesc}}
## 🏷️ Tags
{{tagDesc}}
{{/if}}

{{#if categoryDesc}}
## 📂 Categories
{{categoryDesc}}
{{/if}}

## 📊 Statistics
- **Total Files**: {{docStats.totalFiles}}
{{#if docStats.languageStats}}
{{#if docStats.languageStats}}
- **Languages**: {{#each docStats.languageStats}}{{@key}}: {{this}}{{#if @last}}{{else}}, {{/if}}{{/each}}
{{/if}}
{{/if}}

{{#if docStats.topRecentEdited}}
### 🕒 Recently Edited Files
{{#each docStats.topRecentEdited}}
- [[{{path}}]] ({{humanReadableTime updated_at}})
{{/each}}
{{/if}}

{{#if docStats.topWordCount}}
### 📝 Word Count Leaders
{{#each docStats.topWordCount}}
- [[{{path}}]]: {{word_count}} words
{{/each}}
{{/if}}

{{#if docStats.topCharCount}}
### 📏 Character Count Leaders
{{#each docStats.topCharCount}}
- [[{{path}}]]: {{char_count}} characters
{{/each}}
{{/if}}

{{#if docStats.topRichness}}
### ✨ Richness Score Leaders
{{#each docStats.topRichness}}
- [[{{path}}]]: {{richness_score}} richness
{{/each}}
{{/if}}

## 📂 File Tree
{{#each fileTree}}
{{> fileTreeItem}}{{/each}}

{{#*inline "fileTreeItem"}}
{{#if (eq type "folder")}}
- 📁 **{{path}}/**{{#if children}}
{{#each children}}  {{> fileTreeItem}}{{/each}}{{/if}}
{{else}}
- 📄 [[{{path}}]]
{{/if}}
{{/inline}}`;