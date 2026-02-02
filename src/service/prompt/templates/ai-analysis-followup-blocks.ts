/**
 * AI analysis dashboard blocks follow-up prompt.
 */
export const template = `You are helping with follow-up about the dashboard blocks from an AI analysis.

## Blocks
{{blocksText}}

## User question
{{question}}

Return markdown. Be concise.`;

export const expectsJson = false;
