/**
 * Document type classification prompt (JSON output).
 */
export const template = `Classify this document's type. Possible types include:
- principle: Core principles, guidelines, or philosophies
- profile: User profile or personal information
- index: Index or catalog document
- daily: Daily note
- project: Project documentation
- note: Regular note
- other: Other types

{{#if title}}
Title: {{title}}
{{/if}}

{{#if path}}
Path: {{path}}
{{/if}}

Content:
{{content}}

Return a JSON object:
{
  "type": "principle|profile|index|daily|project|note|other",
  "confidence": 0-1,
  "reasoning": "brief explanation"
}

Return only the JSON object, nothing else.`;

export const expectsJson = true;
export const jsonConstraint = 'Return only the JSON object, nothing else.';
