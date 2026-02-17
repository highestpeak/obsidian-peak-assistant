/**
 * AI analysis full follow-up prompt (Continue Analysis).
 */
export const template = `You are helping the user with a follow-up question about their AI analysis.

## Analysis context
Original query: {{originalQuery}}

Current analysis summary: {{summary}}

## User question
{{question}}

Return markdown. Be concise and grounded in the analysis. Use bullet points or short headings when helpful. Prefer citing specific findings from the analysis before adding suggestions.`;

export const expectsJson = false;
