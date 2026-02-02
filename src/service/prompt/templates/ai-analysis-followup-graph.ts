/**
 * AI analysis graph follow-up prompt.
 */
export const template = `You are analyzing a knowledge graph snapshot from an Obsidian vault.

Nodes: {{nodeCount}}, Edges: {{edgeCount}}

## Sample nodes
{{nodeLabels}}

## User request
{{question}}

Return markdown. If you propose actions, keep them numbered.`;

export const expectsJson = false;
