# {{{vaultName}}} Intuition Skeleton v{{{dateLabel}}} (navigation-oriented)

## 1. What this vault feels like

{{{themeLine}}}

## 2. High-level partitions (where to look)

{{#unless hasPartitions}}
- (No strong partition signal detected.)
{{else}}
{{#each partitions}}
- **{{{label}}}** — {{{purpose}}}{{#if hasEntryPaths}}  
  _Start from:_ {{{entryPathsLine}}}{{/if}}
{{/each}}
{{/unless}}

## 3. Core entities / concepts

{{#unless hasCoreEntities}}
_(None listed; safe to skip when index/graph signals are thin.)_
{{else}}
{{#each coreEntities}}
- **{{{name}}}**: {{{description}}} (location: {{{location}}}){{#if hasWhyItMatters}}  
  _Why it matters:_ {{{whyItMatters}}}{{/if}}
{{/each}}
{{/unless}}

## 4. Topology (main connections)

{{#unless hasTopology}}
- (No strong cross-partition link signal detected.)
{{else}}
{{#each topology}}
- {{{from}}} → {{{to}}}: {{{relation}}}
{{/each}}
{{/unless}}

## 5. Time / evolution

{{{evolutionLine}}}

## 6. Where to start (by intent)

{{#unless hasEntryPoints}}
_(No entry map yet; try backbone “city” folders and high-scoring folders first.)_
{{else}}
{{#each entryPoints}}
- **{{{intent}}}** — {{{whatYouWillFind}}}{{#if startPathsLine}}  
  _Paths:_ {{{startPathsLine}}}{{/if}}
{{/each}}
{{/unless}}

{{#if hasOpenQuestions}}

---

**Open questions**

{{#each openQuestions}}
- {{{this}}}
{{/each}}
{{/if}}
