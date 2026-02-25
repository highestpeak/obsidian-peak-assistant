# 🏠 Orphan Notes Analysis ({{total_count}} found, {{filtered_count}} shown)

## 💀 Hard Orphans ({{hard_orphans.length}})
*Complete isolation - no incoming or outgoing links*
{{#each hard_orphans}}
{{index}}. 📝 **{{humanReadableTime modified}}**: [[{{label}}]]
{{#if revival_suggestion}}   💡 **Revival Suggestion**: Connect to [[{{revival_suggestion.title}}]]
   📊 **Reason**: {{revival_suggestion.reason}}{{/if}}
{{/each}}

---
**🔍 Orphan Classification:**
- **💀 Hard Orphans**: Completely isolated nodes with zero connections
- **Revival Suggestions**: AI-recommended connections based on semantic similarity

**💡 Integration Strategy:** These orphans are often the easiest to reconnect and provide immediate value to your knowledge graph.