# 📁 Folder Exploration: {{current_path}}

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

{{#if docStats.topRecentEdited.totalItems}}
### 🕒 Recently Edited Files
{{#each docStats.topRecentEdited.items}}
- [[{{path}}]] ({{humanReadableTime updated_at}}){{#if (gt sameGroupCount 1)}} _({{sameGroupCount}} similar)_{{/if}}
{{/each}}
_... {{docStats.topRecentEdited.totalItems}} items → {{docStats.topRecentEdited.totalGroups}} groups ({{docStats.topRecentEdited.compressedCount}} compressed)_
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

{{#if docStats.hasTopLinks}}
### 🔗 Top by in-degree
{{#each docStats.topLinksIn}}
- [[{{path}}]]: {{inDegree}}
{{/each}}
### 🔗 Top by out-degree
{{#each docStats.topLinksOut}}
- [[{{path}}]]: {{outDegree}}
{{/each}}
{{/if}}

## 📂 File Tree
{{#each fileTree}}{{> fileTreeItem}}{{/each}}
{{#if rootOmitted}}- _... and {{rootOmitted.total}} more_{{#if rootOmitted.folderCount}} ({{rootOmitted.folderCount}} folders){{/if}}{{#each rootOmitted.byExt}} {{@key}}: {{this}}{{/each}}{{/if}}
{{~#*inline "fileTreeItem"~}}
{{indent depth}}- {{#if (eq type "folder")}}📁 **{{name}}/**
{{#if (nonEmpty children)}}
{{#each children}}{{> fileTreeItem}}{{/each}}
{{~/if~}}
{{~#if omitted~}}
{{indent (inc depth)}}- _... and {{omitted.total}} more_{{#if omitted.folderCount}} ({{omitted.folderCount}} folders){{/if}}{{#each omitted.byExt}} {{@key}}: {{this}}{{/each}}
{{/if}}
{{else}}📄 [[{{linkPath}}]]{{similarLabel (lookup @root.sameGroupCountByPath path)}}
{{/if~}}{{/inline}}