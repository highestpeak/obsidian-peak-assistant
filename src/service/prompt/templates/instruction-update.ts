/**
 * User instruction update prompt.
 */
export const template = `Generate or update user instructions based on profile and recent activity. Keep instructions concise and actionable.

User profile:
{{profile}}

Recent activity summary:
{{recentSummary}}

{{#if existingInstructions}}
Current instructions:
{{existingInstructions}}
{{/if}}

Generate updated instructions (2-5 bullet points) that reflect the user's preferences and working style.`;

export const expectsJson = false;
