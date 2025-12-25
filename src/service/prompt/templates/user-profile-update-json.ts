/**
 * User profile update prompt (JSON output).
 */
export const template = `Analyze recent conversations and update the user's profile. Extract:
- Communication style preferences (formal/casual, length preferences)
- Work patterns (time preferences, meeting preferences)
- Tool preferences (favorite tools, workflows)
- Domain expertise areas
- Response style preferences (detailed/brief, examples preferred, etc.)

Recent conversations:
{{#each recentConversations}}
- Summary: {{summary}}{{#if topics}}
  Topics: {{topics}}{{/if}}
{{/each}}

{{#if existingProfile}}
Current profile:
{{existingProfile}}
{{/if}}

Return a JSON object with updated profile fields. Structure:
{
  "communicationStyle": "...",
  "workPatterns": ["..."],
  "toolPreferences": ["..."],
  "expertiseAreas": ["..."],
  "responseStyle": "..."
}

Return only the JSON object, nothing else.`;

export const expectsJson = true;
export const jsonConstraint = 'Return only the JSON object, nothing else.';
