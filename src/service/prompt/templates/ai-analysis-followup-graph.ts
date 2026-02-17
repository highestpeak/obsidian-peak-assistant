/**
 * AI analysis graph follow-up prompt.
 */
export const template = `You are analyzing a knowledge graph snapshot from an Obsidian vault.

## Analysis context
Original query: {{originalQuery}}

Main summary: {{mainSummary}}

Nodes: {{nodeCount}}, Edges: {{edgeCount}}

## Sample nodes
{{nodeLabels}}

## User question
{{question}}

Return markdown. If you propose actions, keep them numbered. Be grounded in the analysis.`;

export const expectsJson = false;
