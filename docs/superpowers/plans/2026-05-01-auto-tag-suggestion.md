# Auto-tag Suggestion — Implementation Plan

> Date: 2026-05-01
> Spec: `docs/superpowers/specs/2026-05-01-auto-tag-design.md`
> Phase: 1 (MVP — Single-document Copilot command)
> Estimated scope: 8 tasks, ~6 new files, ~4 modified files

---

## Task 1: Add `tagSuggestionsSchema` to copilot-schemas

**What:** Define the Zod schema for LLM tag suggestion output.

**Where:**
- `src/service/copilot/copilot-schemas.ts:37` — append after `SplitPlan` type export

**Schema shape:**
```typescript
export const tagSuggestionsSchema = z.object({
  suggestions: z.array(z.object({
    tag: z.string().describe('Tag string without # prefix'),
    confidence: z.number().min(0).max(1),
    reason: z.string().describe('One-sentence explanation'),
    category: z.enum(['topic', 'keyword', 'functional']),
  })),
});
export type TagSuggestions = z.infer<typeof tagSuggestionsSchema>;
```

**Dependencies:** None
**Tests:** None needed (type-level)

---

## Task 2: Register PromptId + prompt templates

**What:** Add PromptId entries and Handlebars templates for tag suggestion.

**Where:**
- `src/service/prompt/PromptId.ts:781` — add `DocSuggestTags` and `DocSuggestTagsSystem` entries to the PromptId enum and PromptVariables map
- `src/core/template/TemplateRegistry.ts:285-286` — add template metadata entries (follow the `doc-split-suggestion` pattern at these lines)
- `templates/prompts/doc-suggest-tags.hbs` — new file
- `templates/prompts/doc-suggest-tags-system.hbs` — new file

**Prompt design (doc-suggest-tags.hbs):**
- Input variables: `{{content}}`, `{{title}}`, `{{existingTags}}` (JSON array of this doc's current tags), `{{vaultTopTags}}` (top 50 vault tags by usage), `{{neighborTags}}` (tags from linked notes with counts)
- Instructions: prefer existing vault tags; max 7 suggestions; each must have reason; categorize as topic/keyword/functional; return fewer if doc is well-tagged
- Output: JSON matching `tagSuggestionsSchema`

**Dependencies:** None
**Tests:** None needed (template files)

---

## Task 3: Implement TagSuggestionEngine service

**What:** Core engine that combines three signals (content LLM, graph propagation, historical affinity) and outputs ranked, normalized tag suggestions.

**Where:**
- `src/service/copilot/TagSuggestionEngine.ts` — new file

**Key methods:**
```typescript
class TagSuggestionEngine {
  // Main entry: returns merged, ranked suggestions
  async suggestTags(docPath: string, content: string, title: string): Promise<RankedTagSuggestion[]>

  // Signal A: LLM content analysis
  private async contentSignal(content: string, title: string, existingTags: string[]): Promise<TagCandidate[]>

  // Signal B: neighbor tag propagation (1-hop)
  private async graphSignal(docPath: string): Promise<TagCandidate[]>

  // Signal C: folder affinity from tagDisplayRank stats
  private historySignal(docPath: string): TagCandidate[]

  // Normalize candidates against vault taxonomy
  private normalize(candidates: TagCandidate[], vaultTags: string[]): TagCandidate[]

  // Merge 3 signals, deduplicate, score, rank, return top-K
  private mergeAndRank(a: TagCandidate[], b: TagCandidate[], c: TagCandidate[]): RankedTagSuggestion[]
}
```

**Integration points:**
- Signal A: `AppContext.getInstance().aiServiceManager.queryStructured(PromptId.DocSuggestTags, ...)` — follow pattern at `copilot-commands.ts:114`
- Signal A cache: check `mobius_node.attributes_json` for `functional_tags_status === 'success'` — if present, read `mobius_node.tags_json` via `decodeIndexedTagsBlob` instead of calling LLM (see `indexService.ts:604-610`)
- Signal B: query `mobius_edge` for 1-hop neighbors, then read their `tags_json` — use Kysely query builder
- Signal C: call `buildTagGlobalStats()` from `tagDisplayRank.ts:112`, then compute folder-tag affinity for the doc's folder
- Normalization: use `shouldHideTagFromFolderRows()` from `tagDisplayRank.ts:56` to filter noise; fuzzy-match via Levenshtein against top-200 vault tags
- Scoring weights: `w_content=0.5, w_graph=0.3, w_history=0.2` (hardcode in `constant.ts` for now)

**Dependencies:** Task 1, Task 2
**Tests:** Unit test for `mergeAndRank` and `normalize` with mock candidates

---

## Task 4: Build TagSuggestionPanel UI component

**What:** React panel showing tag suggestions with accept/reject/edit actions. Renders inside `CopilotResultModal`.

**Where:**
- `src/ui/view/copilot/TagSuggestionPanel.tsx` — new file

**UI structure:**
- Group suggestions by confidence tier (High ≥ 0.7 / Medium 0.4-0.7 / Low < 0.4)
- Each tag row: tag chip + reason text + three action buttons (Accept ✓ / Reject ✗ / Edit ✎)
- Edit mode: inline text input replacing tag chip, confirm/cancel
- Near-synonym warning: if tag fuzzy-matches an existing vault tag, show "(similar: #existing)" with merge option
- Footer: "Apply Selected (N)" button + "Skip All" button
- State: local `useState` map of `tagName → 'accepted' | 'rejected' | 'modified' | 'pending'`

**Component pattern:** Follow `SplitPanel.tsx` / `LinkSuggestPanel.tsx` structure — props receive data, actions callback to parent

**Dependencies:** Task 1 (schema type)
**Tests:** None (UI component)

---

## Task 5: Wire TagSuggestionPanel into CopilotResultModal

**What:** Add `'suggest-tags'` case to the modal's type switch.

**Where:**
- `src/ui/view/copilot/CopilotResultModal.tsx:9` — extend `CopilotResultType` union with `| 'suggest-tags'`
- `src/ui/view/copilot/CopilotResultModal.tsx:38` — add `case 'suggest-tags': return <TagSuggestionPanel ... />`

**Dependencies:** Task 4
**Tests:** None

---

## Task 6: Implement frontmatter tag writer

**What:** Utility function to write accepted tags into a document's YAML frontmatter.

**Where:**
- `src/service/copilot/frontmatterTagWriter.ts` — new file

**Key function:**
```typescript
async function writeTagsToFrontmatter(
  file: TFile,
  tagsToAdd: string[],
): Promise<void>
```

**Implementation:**
- Use `app.fileManager.processFrontMatter(file, (fm) => { ... })` — Obsidian's atomic frontmatter API
- Read existing `fm.tags` (array or string), merge with `tagsToAdd`, deduplicate, write back
- Handle edge cases: no existing frontmatter (create it), `tags` as string (convert to array), nested tags with `/`

**Dependencies:** None
**Tests:** Unit test with mock TFile + processFrontMatter

---

## Task 7: Register Copilot command

**What:** Add `peak-copilot-suggest-tags` command to the Copilot command array.

**Where:**
- `src/app/commands/copilot-commands.ts:141` — append new command object before array close

**Flow:**
1. `getContext()` — get active file, content, selection
2. Show `Notice('Analyzing tags...')`
3. Instantiate `TagSuggestionEngine`, call `suggestTags(path, content, title)`
4. Open `CopilotResultModal` with `type: 'suggest-tags'`, pass suggestions + `writeTagsToFrontmatter` callback

**Pattern:** Identical to split command at line 114 — `queryStructured` + modal open

**Dependencies:** Task 3, Task 5, Task 6
**Tests:** None (command registration)

---

## Task 8: End-to-end integration test

**What:** Manual test checklist (no automated e2e infra exists for Copilot).

**Checklist:**
- [ ] Open a document with no tags → run command → see 3-7 suggestions with reasons
- [ ] Accept 2 tags → click "Apply Selected" → frontmatter updated correctly
- [ ] Open a well-tagged document → run command → see fewer/zero suggestions
- [ ] Near-synonym detection: vault has `#ml`, suggestion shows `#machine-learning (similar: #ml)`
- [ ] Reject all → nothing written to frontmatter

**Dependencies:** All above

---

## File Change Summary

| File | Action | Lines |
|------|--------|-------|
| `src/service/copilot/copilot-schemas.ts` | Modify | +12 |
| `src/service/prompt/PromptId.ts` | Modify | +8 |
| `src/core/template/TemplateRegistry.ts` | Modify | +4 |
| `templates/prompts/doc-suggest-tags.hbs` | New | ~40 |
| `templates/prompts/doc-suggest-tags-system.hbs` | New | ~15 |
| `src/service/copilot/TagSuggestionEngine.ts` | New | ~200 |
| `src/ui/view/copilot/TagSuggestionPanel.tsx` | New | ~150 |
| `src/ui/view/copilot/CopilotResultModal.tsx` | Modify | +3 |
| `src/service/copilot/frontmatterTagWriter.ts` | New | ~30 |
| `src/app/commands/copilot-commands.ts` | Modify | +25 |
| `src/core/constant.ts` | Modify | +5 (weights) |

**Estimated delta:** +490 lines, 0 deletions

---

## Dependency Graph

```
T1 (schema) ──┐
T2 (prompts) ──┼──→ T3 (engine) ──┐
               │                   ├──→ T7 (command) ──→ T8 (test)
T4 (panel) ────┼──→ T5 (modal) ───┘
T6 (writer) ───┘
```

T1, T2, T4, T6 are independent — can be implemented in parallel.
T3 depends on T1 + T2.
T5 depends on T4.
T7 depends on T3 + T5 + T6 (integration point).

---

## Phase 2+ (Not in this plan — future work)

- `tag_suggestions` + `tag_feedback_stats` SQLite tables (DDL at `ddl.ts:609`)
- Batch folder scan mode with progress UI
- Feedback learning loop (accept/reject → adjust confidence)
- Ambient mode integration with S1 Ambient Push
