# Core Layer Issue 8 Cleanup — Design

Date: 2026-06-30
Source issue: `docs/superpowers/refactor-ops/2026-06-30-core-layer-review-issue-map.md` Issue 8 ("One-File Core Folders And Unclear Names").

## Goal

Remove the one-file `src/core` subfolders that exist only to host a single type/contract file, and move runtime code out of `src/core` when it is not a pure contract. The cleanup is mechanical: it touches paths and one barrel re-export, not behavior.

## Scope

In scope: file moves, folder removals, import-path rewrites, one merge of `llm-errors.ts` into `errors.ts`, and verification via test + build.

Out of scope: behavior changes, content edits to the moved files, broader port migration described in core map Issues 1-7 or 9+.

## Moves

| From | To | Import sites |
|---|---|---|
| `src/core/prompt/PromptId.ts` | `src/core/types/prompt.ts` | ~50 |
| `src/core/po/graph.po.ts` | `src/core/types/graph.ts` | ~30 |
| `src/core/po/index.ts` | deleted (re-export-only barrel) | direct readers via `@/core/po` are rewritten to `@/core/types/graph` |
| `src/core/graph/lensGraphTypes.ts` | `src/core/types/lens-graph.ts` | ~7 |
| `src/core/errors/llm-errors.ts` | appended into `src/core/errors.ts` | 2 |
| `src/core/embeddings/embedClient.ts` | `src/service/search/embeddings/embedClient.ts` | 3 (incl. test) |

After moves, the following directories are deleted because they are empty:

- `src/core/prompt/`
- `src/core/po/`
- `src/core/graph/`
- `src/core/errors/`
- `src/core/embeddings/`

## Rationale per file

- `PromptId.ts` (689 lines): exports `PromptTemplate`, `PromptId` enum, three readonly grouping arrays (`SEARCH_AI_ANALYSIS_PROMPT_IDS`, `INDEXING_AND_HUB_PROMPT_IDS`, `CONFIGURABLE_PROMPT_IDS`), `PromptVariables`, and `PromptInfo`. Pure type + data. Filename `prompt.ts` matches existing `core/types/{chat,ambient,usage,mcp,lint,chat-vault,agents-shared}.ts` naming.
- `graph.po.ts`: drops the unexplained `.po` suffix. The new path `core/types/graph.ts` removes both the unclear folder name and the unclear file suffix.
- `lensGraphTypes.ts`: renames to kebab-case `lens-graph.ts` for consistency. Kept as a separate file from `graph.ts` because Lens graph types have different semantics from the canonical `GraphNodeType` / `GraphEdgeType` set, and combining them risks accidental coupling.
- `llm-errors.ts` (39 lines): a single error file does not justify a folder. Append into `errors.ts`. Future error growth can re-split if there is a real reason.
- `embedClient.ts` (100 lines): not a pure type; reads `ProfileRegistry`, calls `fetch`, reports usage. Its only callers are `service/search/retriever/vector-retriever.ts` and `service/search/index/indexService.ts`. Moves to `src/service/search/embeddings/embedClient.ts` next to its consumers.

## Boundary considerations

- `embedClient` is the only file that crosses a layer (core → service). A `grep` of `src/core/**` confirmed no file under `src/core/` imports `embedClient`, so the move does not break the `app → service → core → ui` layering rule.
- All other moves stay within `src/core/types/`, which already mixes types and small const data (`ambient.ts`, `chat.ts`, `usage.ts`).
- Boundary regression tests (`t11k`, `t11l`, `t11m`, `t11n`, `t11r`) reference only `core/ports/...` — none lock the candidate paths.

## Execution order

1. **`PromptId.ts` → `types/prompt.ts`.** Largest blast radius. Rewrite ~50 import sites. Delete `core/prompt/`. Run tests.
2. **`graph.po.ts` → `types/graph.ts`.** Rewrite import sites for both `@/core/po/graph.po` and `@/core/po` (barrel). Delete `core/po/index.ts` and `core/po/`. Run tests.
3. **`lensGraphTypes.ts` → `types/lens-graph.ts`.** Rewrite 7 sites. Delete `core/graph/`. Run tests.
4. **Merge `llm-errors.ts` into `errors.ts`.** Append symbols; rewrite 2 import sites to `@/core/errors`. Delete `core/errors/`. Run tests.
5. **`embedClient.ts` → `service/search/embeddings/embedClient.ts`.** Rewrite 3 sites (incl. test). Delete `core/embeddings/`. Run tests + `npm run build`.

Tests run after each step so any breakage is localized to that step's edits.

## Verification

- `npm run test` passes after each step.
- `npm run build` passes at the end (esbuild + bundle check).
- `find src/core/{prompt,po,graph,errors,embeddings} -type f` returns empty.
- `grep -rE "@/core/(prompt|po|graph/lensGraphTypes|errors/llm-errors|embeddings/embedClient)" src/ test/` returns empty.

## Risk

- ~92 import sites to update. Mechanical: each step does a single path rewrite, runs tests, commits.
- No logic changes; no public API changes outside the file paths themselves.
- The `core/po` barrel removal is the one place a consumer might import from `@/core/po` (barrel) rather than `@/core/po/graph.po` (direct). Both forms get rewritten to `@/core/types/graph`.

## Non-goals

- Splitting `PromptId.ts` further (e.g., separating grouping arrays from types). Out of scope; can be revisited after the move if the file feels too large at its new location.
- Touching `templates/prompts/*.md` content. The cleanup only relocates the TypeScript ID/metadata file.
- Other core map issues (1-7, 9+). Tracked separately.
