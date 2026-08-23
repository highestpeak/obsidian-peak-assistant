Classify this vault note. Return only one compact JSON object; do not explain or show reasoning.

Allowed functional tag ids (choose 1–3):
{{functionalTagList}}

Output shape:
{"topicTagEntries":[{"id":"short topic"}],"functionalTagEntries":[{"id":"allowed-id"}],"timeTags":[],"geoTags":[],"personTags":[],"inferCreatedAt":null,"docType":"note","docTypeConfidence":0.7}

Rules:
- `topicTagEntries`: 3–8 short stable topic ids. Omit `label` unless essential.
- `functionalTagEntries`: required, 1–3 ids from the allowed list. Omit `label` unless essential.
- `timeTags`, `geoTags`, `personTags`: 0–4 each. Use one CamelCase token prefixed with `Time`, `Geo`, or `Person`; otherwise return `[]`.
- `inferCreatedAt`: `yyyyMMdd`, `yyyyMMdd HHmmss`, or null. Do not guess from path alone.
- `docType`: one of `principle`, `profile`, `index`, `daily`, `project`, `note`, `other`. `docTypeConfidence`: 0–1. Do not add reasoning.

{{#if title}}Title: {{title}}{{/if}}
{{#if existingTopicTags}}Prior topic hints: {{existingTopicTags}}{{/if}}
{{#if existingUserTags}}User tag hints: {{existingUserTags}}{{/if}}
{{#if textrankKeywords}}Key terms: {{textrankKeywords}}{{/if}}
{{#if textrankSentences}}Anchor sentences:
{{textrankSentences}}{{/if}}

Content:
{{content}}
