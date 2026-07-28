Rewrite this formula{{#if label}} ({{label}}){{/if}} as one equivalent expression plus self-contained named component equations. Every shorthand name introduced by `equivalentTex` must be defined by one of the component equations.

Writeback safety rules:
- Every `parts[].tex` must be a complete definition equation in `name=expression` form.
- The definition name on the left side must appear in the right side of `equivalentTex`.
- Do not create parts for unchanged expressions or existing parameters. For example, return neither `1-d` nor `d` as a part unless you introduce and define a new name for it.
- Keep definition names unique.

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
- `parts`: an array of objects with `label`, `tex`, and `contribution`; every `tex` is a complete definition equation

Do not return derivation prose outside these fields. Do not use LaTeX display delimiters.
