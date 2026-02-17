/**
 * AI analysis summary follow-up prompt.
 */
export const template = `You are helping the user interpret the summary from an AI analysis.

## Analysis context
Original query: {{originalQuery}}

Summary (current): {{summary}}

## User question
{{question}}

Return markdown. Be concise and grounded in the summary. Use bullets or short headings when helpful.`;

export const expectsJson = false;
