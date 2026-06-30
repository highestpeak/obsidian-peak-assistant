# Core Layer Issue 8 Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove one-file `src/core` subfolders by relocating their contents into `src/core/types/` (or `src/core/errors.ts`), and move the non-pure `embedClient.ts` runtime out of `core/` into `service/search/embeddings/`.

**Architecture:** Pure mechanical file moves + import-path rewrites + one merge. No behavior changes. Each move is its own commit with tests run between moves so any breakage is localized.

**Tech Stack:** TypeScript, esbuild, `npm run test` (Node + esbuild compile of `*.test.ts`), `@/*` path alias → `src/*`.

**Source spec:** `docs/superpowers/specs/2026-06-30-core-layer-issue-8-cleanup-design.md`

---

## Task 0: Baseline

**Files:** none (verification only)

- [ ] **Step 1: Confirm working tree is clean of unrelated work for this branch**

Run: `git status --short`
Expected: no `M` lines for `src/core/**`, `src/service/**`, or `test/**`. (Untracked docs are fine.)

- [ ] **Step 2: Confirm tests pass on baseline**

Run: `npm run test`
Expected: all tests pass. Record the count for comparison after each task.

- [ ] **Step 3: Confirm build passes on baseline**

Run: `npm run build`
Expected: build succeeds; `main.js` regenerated.

If baseline is red, stop and report before proceeding. No commit at this step.

---

## Task 1: PromptId.ts → core/types/prompt.ts

**Files:**
- Create: `src/core/types/prompt.ts`
- Delete: `src/core/prompt/PromptId.ts`, `src/core/prompt/` (directory)
- Modify (import rewrites, ~51 files): everything matching `grep -rlE "@/core/prompt/PromptId" src/ test/`

- [ ] **Step 1: Move the file via `git mv` to preserve history**

Run:
```bash
git mv src/core/prompt/PromptId.ts src/core/types/prompt.ts
rmdir src/core/prompt
```
Expected: file moved, empty folder removed.

- [ ] **Step 2: Rewrite all import paths**

Run (BSD/macOS sed — `-i ''`):
```bash
grep -rlE "@/core/prompt/PromptId" src/ test/ | xargs sed -i '' "s|@/core/prompt/PromptId|@/core/types/prompt|g"
```
Expected: command exits 0. No file lists if there are no remaining hits.

- [ ] **Step 3: Verify no stale references remain**

Run: `grep -rE "@/core/prompt/PromptId|core/prompt['\"]" src/ test/`
Expected: empty output.

- [ ] **Step 4: Confirm folder is gone**

Run: `test ! -d src/core/prompt && echo OK`
Expected: `OK`.

- [ ] **Step 5: Run tests**

Run: `npm run test`
Expected: same pass count as baseline (Task 0).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(core): move PromptId.ts to core/types/prompt.ts

Drops the one-file core/prompt/ folder. PromptId is pure type/data
(interfaces, enum, readonly grouping arrays), so it belongs alongside
the other type-bundles in core/types.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: graph.po.ts → core/types/graph.ts (drop po/ folder)

**Files:**
- Create: `src/core/types/graph.ts`
- Delete: `src/core/po/graph.po.ts`, `src/core/po/index.ts`, `src/core/po/` (directory)
- Modify (import rewrites): everything matching `grep -rlE "@/core/po(/graph\.po)?['\"]" src/ test/`

- [ ] **Step 1: Move the type file**

Run:
```bash
git mv src/core/po/graph.po.ts src/core/types/graph.ts
git rm src/core/po/index.ts
rmdir src/core/po
```
Expected: file moved, barrel deleted, empty folder removed.

- [ ] **Step 2: Rewrite the direct path `@/core/po/graph.po`**

Run:
```bash
grep -rlE "@/core/po/graph\.po" src/ test/ | xargs sed -i '' "s|@/core/po/graph\.po|@/core/types/graph|g"
```
Expected: command exits 0.

- [ ] **Step 3: Rewrite the barrel path `@/core/po`**

Run:
```bash
grep -rlE "from ['\"]@/core/po['\"]" src/ test/ | xargs sed -i '' -E "s|from (['\"])@/core/po\\1|from \\1@/core/types/graph\\1|g"
```
Expected: command exits 0. (Should rewrite ~1 file based on baseline grep.)

- [ ] **Step 4: Verify no stale references**

Run: `grep -rE "@/core/po(/|['\"])" src/ test/`
Expected: empty output.

- [ ] **Step 5: Confirm folder is gone**

Run: `test ! -d src/core/po && echo OK`
Expected: `OK`.

- [ ] **Step 6: Run tests**

Run: `npm run test`
Expected: same pass count as baseline.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(core): move graph.po.ts to core/types/graph.ts

Drops the unexplained `po` directory and `.po` filename suffix.
Canonical GraphNodeType / GraphEdgeType constants and helpers now
live alongside the other core/types files. The one-line barrel
core/po/index.ts is deleted; its sole consumer is migrated to
@/core/types/graph.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: lensGraphTypes.ts → core/types/lens-graph.ts (drop graph/ folder)

**Files:**
- Create: `src/core/types/lens-graph.ts`
- Delete: `src/core/graph/lensGraphTypes.ts`, `src/core/graph/` (directory)
- Modify (import rewrites, 6 files):
  - `src/ui/component/mine/multi-lens-graph/types.ts`
  - `src/core/storage/vault/search-docs/AiGraphDoc.ts`
  - `src/service/agents/ai-graph/build-graph-data.ts`
  - `src/service/agents/ai-graph/graph-output-to-lens.ts`
  - `src/service/agents/ai-graph/infer-cross-domain.ts`
  - `src/service/agents/AIGraphAgent.ts`

- [ ] **Step 1: Move the file**

Run:
```bash
git mv src/core/graph/lensGraphTypes.ts src/core/types/lens-graph.ts
rmdir src/core/graph
```
Expected: file moved, empty folder removed.

- [ ] **Step 2: Rewrite import paths**

Run:
```bash
grep -rlE "@/core/graph/lensGraphTypes" src/ test/ | xargs sed -i '' "s|@/core/graph/lensGraphTypes|@/core/types/lens-graph|g"
```
Expected: command exits 0.

- [ ] **Step 3: Verify no stale references**

Run: `grep -rE "@/core/graph/lensGraphTypes|core/graph['\"]" src/ test/`
Expected: empty output.

- [ ] **Step 4: Confirm folder is gone**

Run: `test ! -d src/core/graph && echo OK`
Expected: `OK`.

- [ ] **Step 5: Run tests**

Run: `npm run test`
Expected: same pass count as baseline.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(core): move lensGraphTypes.ts to core/types/lens-graph.ts

Drops the one-file core/graph/ folder and aligns the filename with
the kebab-case convention used elsewhere in core/types/. Lens graph
types remain a separate file from core/types/graph.ts because their
semantics differ from the canonical graph node/edge types.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Merge llm-errors.ts into errors.ts (drop errors/ folder)

**Files:**
- Modify: `src/core/errors.ts` (append symbols from `llm-errors.ts`)
- Delete: `src/core/errors/llm-errors.ts`, `src/core/errors/` (directory)
- Modify (import rewrites, 2 files):
  - `src/ui/view/copilot/CopilotResultContent.tsx`
  - `src/service/agents/core/sdkMessageAdapter.ts`

- [ ] **Step 1: Append the LLM error symbols to the end of `src/core/errors.ts`**

Append the following block verbatim to the bottom of `src/core/errors.ts` (after the existing `getErrorMessage` function). `llm-errors.ts` has no imports of its own, so nothing needs to be merged at the top.

```typescript
export class AuthenticationError extends Error {
    constructor(message: string, public readonly provider?: string) {
        super(message);
        this.name = 'AuthenticationError';
    }
}

export class LLMResponseError extends Error {
    constructor(message: string, public readonly rawResponse?: string) {
        super(message);
        this.name = 'LLMResponseError';
    }
}

export class MaxTurnsError extends Error {
    constructor(message: string, public readonly partialText?: string) {
        super(message);
        this.name = 'MaxTurnsError';
    }
}

/**
 * Detect common error patterns in SDK result messages and throw typed errors.
 */
export function throwTypedError(errorText: string, partialText?: string): never {
    const lower = errorText.toLowerCase();
    if (lower.includes('authentication') || lower.includes('invalid bearer') || lower.includes('401')) {
        throw new AuthenticationError(
            'API key is invalid or expired. Please update your credentials in Settings → Profiles.',
        );
    }
    if (lower.includes('maximum number of turns')) {
        throw new MaxTurnsError(
            'Analysis reached maximum depth. Partial results may be available.',
            partialText,
        );
    }
    throw new LLMResponseError(errorText);
}
```

- [ ] **Step 2: Sanity-check the appended symbols compile**

Run: `grep -nE "^export (class|function) (AuthenticationError|LLMResponseError|MaxTurnsError|throwTypedError)" src/core/errors.ts`
Expected: four lines, all in `src/core/errors.ts`.

- [ ] **Step 3: Delete the old file and folder**

Run:
```bash
git rm src/core/errors/llm-errors.ts
rmdir src/core/errors
```
Expected: file deleted, empty folder removed.

- [ ] **Step 4: Rewrite import paths**

Run:
```bash
grep -rlE "@/core/errors/llm-errors" src/ test/ | xargs sed -i '' "s|@/core/errors/llm-errors|@/core/errors|g"
```
Expected: command exits 0. Should touch the 2 files listed above.

- [ ] **Step 5: Verify no stale references**

Run: `grep -rE "@/core/errors/llm-errors|core/errors/" src/ test/`
Expected: empty output.

- [ ] **Step 6: Confirm folder is gone**

Run: `test ! -d src/core/errors && echo OK`
Expected: `OK`.

- [ ] **Step 7: Run tests**

Run: `npm run test`
Expected: same pass count as baseline.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(core): merge llm-errors.ts into errors.ts

A single LLM error file does not justify a separate core/errors/
folder alongside the existing core/errors.ts. Symbols are appended
verbatim; only the import path changes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: embedClient.ts → service/search/embeddings/embedClient.ts (drop core/embeddings/ folder)

**Files:**
- Create: `src/service/search/embeddings/embedClient.ts`
- Delete: `src/core/embeddings/embedClient.ts`, `src/core/embeddings/` (directory)
- Modify (import rewrites, 3 files):
  - `src/service/search/retriever/vector-retriever.ts`
  - `src/service/search/index/indexService.ts`
  - `test/embed-client.test.ts`

- [ ] **Step 1: Confirm no `core/` file imports embedClient**

Run: `grep -rE "embedClient" src/core/`
Expected: empty output. (If non-empty, stop — moving the file out of `core/` would create a `core → service` import.)

- [ ] **Step 2: Create the destination folder**

Run: `mkdir -p src/service/search/embeddings`
Expected: folder exists.

- [ ] **Step 3: Move the file**

Run:
```bash
git mv src/core/embeddings/embedClient.ts src/service/search/embeddings/embedClient.ts
rmdir src/core/embeddings
```
Expected: file moved, empty folder removed.

- [ ] **Step 4: Rewrite import paths**

Run:
```bash
grep -rlE "@/core/embeddings/embedClient" src/ test/ | xargs sed -i '' "s|@/core/embeddings/embedClient|@/service/search/embeddings/embedClient|g"
```
Expected: command exits 0. Should touch the 3 files listed above.

- [ ] **Step 5: Verify no stale references**

Run: `grep -rE "@/core/embeddings|core/embeddings/" src/ test/`
Expected: empty output.

- [ ] **Step 6: Confirm folder is gone**

Run: `test ! -d src/core/embeddings && echo OK`
Expected: `OK`.

- [ ] **Step 7: Run tests**

Run: `npm run test`
Expected: same pass count as baseline.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(core): move embedClient out of core into service/search

embedClient.ts is runtime/network code (reads ProfileRegistry,
calls fetch, reports usage), not a pure type/contract, so it does
not belong in core. Its only consumers are vector-retriever and
indexService under service/search, so the file moves next to them.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm all five target folders are gone**

Run:
```bash
for d in src/core/prompt src/core/po src/core/graph src/core/errors src/core/embeddings; do
  test ! -e "$d" && echo "GONE: $d" || echo "STILL EXISTS: $d"
done
```
Expected: five `GONE:` lines.

- [ ] **Step 2: Confirm no stale import paths exist anywhere**

Run:
```bash
grep -rE "@/core/(prompt/PromptId|po(/graph\.po)?['\"]|graph/lensGraphTypes|errors/llm-errors|embeddings/embedClient)" src/ test/
```
Expected: empty output.

- [ ] **Step 3: Full test suite**

Run: `npm run test`
Expected: same pass count as baseline.

- [ ] **Step 4: Full build**

Run: `npm run build`
Expected: build succeeds; no esbuild or bundle-check errors.

- [ ] **Step 5: Confirm five commits landed**

Run: `git log --oneline -n 6`
Expected: top 5 commits are the refactors from Tasks 1-5 (Task 6 has no commit; verification only).

- [ ] **Step 6 (optional): Update the core-layer issue map**

If Issue 8 in `docs/superpowers/refactor-ops/2026-06-30-core-layer-review-issue-map.md` should be marked as done, append a status block beneath the section noting the five commits and date. Commit separately as `docs(refactor-ops): mark core Issue 8 as resolved`. Skip if not in scope for this branch.

---

## Notes for the engineer

- **Path alias.** This codebase uses `@/*` → `src/*` (see `tsconfig.json` and `esbuild.config.mjs`). Every import in the plan uses the `@/` form. Do not introduce relative imports.
- **`sed -i ''`.** macOS BSD sed requires an empty string after `-i`. On Linux/GNU sed, drop the `''` and use `-i` alone.
- **`git mv` vs `mv`.** Always use `git mv` so git records the rename and history follows the file.
- **`rmdir` not `rm -rf`.** The folder must be empty after `git mv`/`git rm`; `rmdir` will refuse if there's anything left, which is the safety check we want.
- **Tests between tasks.** Each task ends with `npm run test`. If a task breaks tests, do not proceed — investigate, fix, and commit the fix as part of that task before moving on.
- **No content edits.** This refactor is path-only. Do not reformat, reorder exports, or rename symbols inside any moved file. If you spot a code smell, file a separate issue.
