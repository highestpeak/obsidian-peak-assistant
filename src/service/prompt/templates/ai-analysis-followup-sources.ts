/**
 * AI analysis sources follow-up prompt.
 */
export const template = `You are helping the user interpret the sources from an AI analysis.

## Sources (sample)
{{sourcesList}}

## User request
{{question}}

Return markdown. Keep it grounded in the sources list.`;

export const expectsJson = false;
