Produce a **long-form summary** suitable for retrieval and evidence (clear sections, main claims, entities, and conclusions). This is not a one-liner — expand enough that a reader can understand the note without opening the full text.

Target length: about **{{#if targetWords}}{{targetWords}}{{else}}400{{/if}} words** (flexible; prioritize completeness over brevity).

{{#if shortSummary}}
One-line gist (already distilled): {{shortSummary}}
{{/if}}

{{#if textrankKeywords}}
Key terms (TextRank): {{textrankKeywords}}
{{/if}}

{{#if textrankSentences}}
Anchor sentences to cover or refine (TextRank):
{{textrankSentences}}
{{/if}}

{{#if title}}
Title: {{title}}
{{/if}}

{{#if path}}
Path: {{path}}
{{/if}}

Content:
{{content}}

Use short markdown: optional `##` section headings if the note is long. No meta-commentary about the task.
