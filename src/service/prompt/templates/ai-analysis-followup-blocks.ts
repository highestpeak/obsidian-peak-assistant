/**
 * AI analysis dashboard blocks follow-up prompt.
 */
export const template = `You are helping with follow-up about the dashboard blocks from an AI analysis.

## Analysis context
Original query: {{originalQuery}}

Main summary: {{mainSummary}}

## Blocks
{{blocksText}}

## User question
{{question}}

Return markdown. Be concise. Use bullets or short headings when helpful.`;

export const expectsJson = false;
