/**
 * Document tag generation prompt (JSON output).
 */
export const template = `Generate relevant tags for this document (3-10 tags).

{{#if title}}
Title: {{title}}
{{/if}}

Content:
{{content}}

{{#if existingTags}}
Existing tags: {{existingTags}}
{{/if}}

Return a JSON array of tag strings.
Example: ["tag1", "tag2", "tag3"]

Return only the JSON array, nothing else.`;

export const expectsJson = true;
export const jsonConstraint = 'Return only the JSON array, nothing else.';
