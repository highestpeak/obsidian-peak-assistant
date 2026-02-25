/**
 * Doc Simple mode: scope prefix for single-file analysis.
 * Full file content is injected so the agent has the document from the start.
 * Thought Agent can direct Raw Search to fetch backlinks, images, or other context when needed.
 */
export const template = `**Scope: current file only.** Current file path: \`{{scopeValue}}\`. Do not search the rest of the vault. The full content of this file is provided below.

**When you need more context:** If backlinks, embedded images, or other linked resources would help the analysis, the Thought Agent can direct the Raw Search Agent to call \`content_reader\` (e.g. range, grep) or other tools—this follows naturally from the task.

# Current file content

<<<
{{{fileContent}}}
>>>

---

# User request

{{{userPrompt}}}

**Language:** Analyze and respond in the same language as the user request above (e.g. if the user wrote in Chinese, respond in Chinese).`;

export const expectsJson = false;
