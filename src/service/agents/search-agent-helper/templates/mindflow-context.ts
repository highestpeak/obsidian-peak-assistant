/**
 * Handlebars template for MindFlow context message.
 * Renders thinking progress, self-critique, decision, and recent traces for ThoughtAgent.
 */
export const template = `{{#if hasProgress}}
[MindFlow Status] {{statusLabel}} ({{estimatedCompleteness}}% complete)
{{#if goalAlignment}}
Goal Alignment: {{{goalAlignment}}}
{{/if}}
{{#if critique}}
Self-Critique: {{{critique}}}
{{/if}}
{{#if decision}}
Decision: {{{decision}}}
{{/if}}
{{/if}}
{{#if hasTraces}}
Recent Thoughts: {{{tracesLine}}}
{{/if}}`;
