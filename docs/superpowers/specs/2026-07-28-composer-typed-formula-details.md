# Composer Typed Formula Details

## Status

Implemented, then corrected on the production branch after owner real-UI review.

## Problem

The production formula detail path currently materializes `解释公式` and
`拆分公式` as one opaque text string. The UI therefore exposes model Markdown
markers and cannot render the design reference's symbol map or vertically
composed math. `变量表` is row-shaped, but its symbols remain plain monospace
text and have no semantic role.

The existing per-formula state model is sound and must remain: detail state is
keyed by `(formulaId, explain | split | variables)`, variants do not overwrite
one another, and details can coexist within and across formulas.

## Typed result contract

- `explain`: concise summary plus conceptual terms
  `{ symbolTex, meaning }`.
- `split`: one equivalent expression plus named self-contained component
  equations `{ label, tex, contribution }`.
- `variables`: exhaustive symbol rows
  `{ symbolTex, role, meaning }`.

Model responses are JSON validated through Zod. Invalid structured output fails
closed as a failed variant; the UI never renders raw JSON or model Markdown.
The nearby document source is supplied only as a language/domain hint. The
target remains the single frozen formula.

## Rendering contract

- Explanation renders numbered KaTeX symbol rows with arrows and short prose.
- Split renders the original formula above the proposed equivalent expression,
  followed by individually rendered component equations.
- Variables render a compact formula preview plus KaTeX symbol rows and role
  chips.
- All three use the same review header/footer, targeted instruction,
  regeneration, variant navigation, History access and independent close.
- Structured generation shows a local skeleton/caret state; partial JSON is
  never exposed.

## Acceptance semantics

- Explanation and variables remain formula-local annotations and never mutate
  Markdown.
- A split may always render as an explanation. It becomes writeback-eligible
  only when the equivalent expression is an equation, every component is a
  complete named definition, definition names are unique, and every definition
  is referenced by the equivalent expression.
- Eligible split acceptance writes one standard display-math block using an
  `aligned` environment with aligned equality operators. Explanatory fragments
  such as `1-d` or `d` cannot enter the document as standalone equation rows.
- Split commits through the existing `ComposerTransactionHub` using the exact
  formula source range, a revision guard, History and Undo. No second runtime or
  write path is introduced.
- `kept` means a local explanation/variable annotation was retained; `applied`
  means a split transaction succeeded. The two states must never share copy.
- Labels, explanations and variable extraction use the leading equation of an
  `aligned` result rather than the LaTeX environment wrapper or helper rows.
- Variable rows contain deduplicated atomic symbols only. Compound expressions,
  operators, equations and numeric literals are not variable identities.
- Language hints skip adjacent math blocks and continue to the nearest prose so
  a formula stack inside a Chinese section does not silently fall back to
  English.

## Non-goals

- No hard-coded PageRank, TextRank or Louvain knowledge in production.
- No generic Markdown renderer as a substitute for typed math UI.
- No cross-formula variable aggregation.
- No private Markdown storage format.

## Verification

- Typed response parsing and invalid-output failure: covered.
- Unsafe explanatory splits remain visible but cannot reach the serializer.
- `aligned` labels resolve to the leading equation identity.
- Atomic variable filtering/deduplication and prose-seeking locale context:
  covered.
- KaTeX-addressable explain/split/variable DOM contracts: covered by SSR.
- Exact split replacement and reversible transaction behavior: covered against
  the real transaction hub with History and Undo.
- Nine focused Composer/config/style/runtime tests: passing.
- Production build and bundle syntax check: passing.
- Full suite: 338/340 passing. The remaining two Chat Studio/theme assertion
  failures reproduce on the untouched baseline and are outside this scope.
- Owner real-Obsidian screenshots established the original regression. The
  corrected build still has `INTERACTION NOT VERIFIED`: no Obsidian CDP
  listener was available for reload, DOM assertions and a corrected screenshot.
