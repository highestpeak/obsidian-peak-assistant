/**
 * Memory update prompt (copilot-style bullet list maintenance).
 */
export const template = `You maintain a user's long-term personal memory list as concise bullet points.

Your task is to update the user's memory list with the new statement.

Rules:
- Keep only stable, evergreen facts or preferences that will help future conversations.
- Remove duplicates and near-duplicates by merging them into one concise statement.
- If the new statement conflicts with older ones, keep the most recent truth and remove obsolete/conflicting entries.
- Prefer short, specific, and unambiguous phrasing.
- Preserve the language used in the input memories.

New statement to add/update:
{{newStatement}}

Existing memories:
{{#each existingMemories}}
- {{this}}
{{/each}}

# OUTPUT FORMAT
Return the updated memory list with each as a bullet point.

- memory item 1
- memory item 2
- memory item 3`;

export const expectsJson = false;
