Rewrite this formula{{#if label}} ({{label}}){{/if}} as one equivalent expression plus self-contained named component equations. Every shorthand name introduced by `equivalentTex` must be defined by one of the component equations.

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
- `equivalentTex`: one equation equivalent to the original
- `parts`: an array of objects with `label`, `tex`, and `contribution`

Do not return derivation prose outside these fields. Do not use LaTeX display delimiters.
