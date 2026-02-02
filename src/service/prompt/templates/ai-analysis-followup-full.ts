/**
 * AI analysis full follow-up prompt (Continue Analysis).
 */
export const template = `You are helping the user with a follow-up question about their AI analysis.

## Current analysis summary
{{summary}}

## User question
{{question}}

Return markdown. Be concise and grounded in the analysis.`;

export const expectsJson = false;
