/**
 * Review dashboard blocks: check for errors, layout, and suggest fixes.
 * Outputs JSON: { needsFix: boolean, issues: string[], suggestedOperations?: operations[] }
 */
export const template = `You are reviewing the dashboard blocks of an AI analysis result.

## Analysis context
Original query: {{originalQuery}}
Summary (brief): {{summaryBrief}}

## Current dashboard blocks
{{blocksJson}}

## Task
Decide if the blocks need fixes: wrong or empty content, layout issues (e.g. too many in one slot), duplicates, or missing useful blocks. If fixes are needed, output suggestedOperations as a JSON array of update_result-style operations (add/remove for targetField "dashboardBlocks" only).

Output ONLY valid JSON in this exact shape (no markdown, no explanation):
{
  "needsFix": boolean,
  "issues": string[],
  "suggestedOperations": [
    { "operation": "add", "targetField": "dashboardBlocks", "item": { "id": "...", "title": "...", "slot": "MAIN"|"SIDEBAR"|"FLOW", "renderEngine": "MARKDOWN"|"TILE"|"ACTION_GROUP"|"MERMAID", "markdown"?: "...", "mermaidCode"?: "...", "items"?: [...] } }
  ]
}
or for remove: { "operation": "remove", "targetField": "dashboardBlocks", "removeId": "blockId" }

- suggestedOperations must be omitted or empty if needsFix is false.
- Each add item must have meaningful content (markdown, mermaidCode, or items).
- Keep suggestedOperations small (e.g. at most 5 operations).`;

export const expectsJson = true;
