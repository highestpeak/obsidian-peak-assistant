# Composer Typed Formula Details

## Status

Implemented in the isolated `codex/composer-formula-typed-review` worktree.
The original checkout remains unchanged.

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
- Split acceptance writes one standard display-math block using an `aligned`
  environment containing the equivalent expression and every component
  definition. It does not replace the source with shorthand containing
  undefined names.
- Split commits through the existing `ComposerTransactionHub` using the exact
  formula source range, a revision guard, History and Undo. No second runtime or
  write path is introduced.

## Non-goals

- No hard-coded PageRank, TextRank or Louvain knowledge in production.
- No generic Markdown renderer as a substitute for typed math UI.
- No cross-formula variable aggregation.
- No private Markdown storage format.

## Verification

- Typed response parsing and invalid-output failure: covered.
- KaTeX-addressable explain/split/variable DOM contracts: covered by SSR.
- Exact split replacement and reversible transaction behavior: covered against
  the real transaction hub with History and Undo.
- Nine focused Composer/config/style/runtime tests: passing.
- Production build and bundle syntax check: passing.
- Full suite: 331/333 passing. The remaining two Chat Studio/theme assertion
  failures reproduce on the untouched baseline and are outside this scope.
- Real Obsidian interaction: `INTERACTION NOT VERIFIED`. No Obsidian CDP
  listener was available, and the isolated worktree is not the plugin source
  currently loaded by the app.
