List every meaningful symbol in this formula{{#if label}} ({{label}}){{/if}}. Keep the table exhaustive even when the most important concepts are fewer.

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
