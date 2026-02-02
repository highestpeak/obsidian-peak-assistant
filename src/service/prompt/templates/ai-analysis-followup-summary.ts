/**
 * AI analysis summary follow-up prompt.
 */
export const template = `You are helping the user interpret the summary from an AI analysis.

User question: {{question}}

Summary: {{summary}}

Return markdown. Be concise and grounded in the summary.`;

export const expectsJson = false;
