List every meaningful atomic symbol in this formula{{#if label}} ({{label}}){{/if}}. Keep the table exhaustive even when the most important concepts are fewer.

Variable rules:
- Return each symbol once.
- A symbol may be an identifier, indexed identifier, set-valued name, or named function quantity such as `d`, `N_{ji}`, `In(V_i)`, or `WS(V_i)`.
- Never return a compound expression such as `1-d`, a fraction, a summation, an equation, an operator, or a numeric literal as a symbol.
- When a compound expression contains an atomic parameter, list the atomic parameter instead.

$$ {{{latex}}} $$
{{#if contextText}}

Nearby note text (language/domain hint only):
{{{contextText}}}
{{/if}}
{{#if instruction}}

Focus on this instruction:
{{instruction}}
{{/if}}

Return JSON with:
- `variables`: an array of objects with `symbolTex`, `role`, and `meaning`

`role` is a short semantic category such as output, parameter, structure, index, or normalization, written in the note's language.
