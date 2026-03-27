Write **exactly one sentence** that captures what this note is about and why it matters. No bullet list, no markdown headings, no preamble.

Target: at most ~{{#if maxWords}}{{maxWords}}{{else}}40{{/if}} words. Be factual and dense.

{{#if textrankKeywords}}
Unsupervised key terms (TextRank; use as anchors, may overlap with content): {{textrankKeywords}}
{{/if}}

{{#if textrankSentences}}
Extractive anchor sentences (TextRank; your summary should be consistent with these points):
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

Output only the single sentence.
