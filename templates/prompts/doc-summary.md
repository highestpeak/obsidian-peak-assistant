{{! Deprecated: use doc-summary-short.md. Kept for existing vault overrides of prompt id `doc-summary`. }}
Write **exactly one sentence** that captures what this note is about and why it matters. No bullet list, no markdown headings, no preamble.

Target: at most ~{{#if maxWords}}{{maxWords}}{{else}}40{{/if}} words. Be factual and dense.

{{#if title}}
Title: {{title}}
{{/if}}

{{#if path}}
Path: {{path}}
{{/if}}

Content:
{{content}}

Output only the single sentence.
