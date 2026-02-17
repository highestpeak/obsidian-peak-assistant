/**
 * AI analysis sources follow-up prompt.
 */
export const template = `You are helping the user interpret the sources from an AI analysis.

## Analysis context
Original query: {{originalQuery}}

Main summary: {{mainSummary}}

## Sources (sample)
{{sourcesList}}

## User question
{{question}}

Return markdown. Keep it grounded in the sources list. Use structure (bullets or headings) when helpful.`;

export const expectsJson = false;
