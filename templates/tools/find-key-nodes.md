# 🔑 Key Nodes Analysis

{{#if (hasNodeType key_nodes "hub")}}
## 🎯 **Hubs** - Knowledge Organizers
*Strong outward connections - organize and structure your knowledge*
{{#each key_nodes}}
{{#if (eq nodeType "hub")}}
{{@index}}. {{formatNodeLabel label type}} ({{degree}}↗) {{#if (gt uniqueCategories 1)}}🌉{{/if}}
{{/if}}
{{/each}}

{{/if}}
{{#if (hasNodeType key_nodes "authority")}}
## 📚 **Authorities** - Core Concepts
*Highly referenced - represent your fundamental concepts*
{{#each key_nodes}}
{{#if (eq nodeType "authority")}}
{{@index}}. {{formatNodeLabel label type}} ({{degree}}↙) {{#if (gt uniqueCategories 1)}}🌉{{/if}}
{{/if}}
{{/each}}

{{/if}}
{{#if (hasNodeType key_nodes "bridge")}}
## 🌉 **Bridges** - Cross-Disciplinary
*Connect different knowledge domains - enable interdisciplinary insights*
{{#each key_nodes}}
{{#if (eq nodeType "bridge")}}
{{@index}}. {{formatNodeLabel label type}} ({{degree}}{{#if (eq direction "out")}}↗{{else}}↙{{/if}}, {{uniqueCategories}} cats)
{{/if}}
{{/each}}

{{/if}}
{{#if (hasNodeType key_nodes "balanced")}}
## ⚖️ **Balanced** - Well-Connected
*Balanced connectivity across your knowledge graph*
{{#each key_nodes}}
{{#if (eq nodeType "balanced")}}
{{@index}}. {{formatNodeLabel label type}} ({{degree}}{{#if (eq direction "out")}}↗{{else}}↙{{/if}})
{{/if}}
{{/each}}

{{/if}}

---
**🔍 Legend:**
- **[[ ]]** : Document nodes | **#** : Tag nodes | **📁** : Category nodes
- **↗**: Outgoing links | **↙**: Incoming links | **🌉**: Bridge node
{{#if (hasNodeType key_nodes "hub")}}- **🎯 Hubs**: Navigation starting points, MOCs, indexes{{/if}}
{{#if (hasNodeType key_nodes "authority")}}- **📚 Authorities**: Core concepts, foundations, key references{{/if}}
{{#if (hasNodeType key_nodes "bridge")}}- **🌉 Bridges**: Cross-disciplinary connections, innovation hotspots{{/if}}
{{#if (hasNodeType key_nodes "balanced")}}- **⚖️ Balanced**: Well-integrated concepts with diverse connections{{/if}}