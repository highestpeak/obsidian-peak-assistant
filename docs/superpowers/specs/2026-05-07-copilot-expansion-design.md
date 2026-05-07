# Copilot Panel Expansion — Design Spec

## Overview

Expand the Copilot panel from 5 document-level actions to 15 actions across three categories (Document / Vault / Writing), backed by a registry architecture that replaces the current hardcoded approach. Add context-aware recommendation (rule-based starring) so the panel surfaces the most relevant actions for the user's current document state.

## Current State

- **Entry**: `CopilotPickerModal.tsx` — hardcoded `ACTIONS` array (5 items), 3-column grid
- **Commands**: `copilot-commands.ts` — `buildCopilotCommands()` with per-action logic
- **Results**: `CopilotResultModal.tsx` — switch/case dispatching to 5 Panel components
- **Panels**: `src/ui/view/copilot/panels/` — PolishPanel, ReviewPanel, LinkSuggestPanel, SplitPanel, TagSuggestionPanel
- **Schemas**: `src/service/copilot/copilot-schemas.ts` — 4 Zod schemas (Polish is unstructured)
- **Prompts**: `templates/prompts/doc-*.md` — 5 prompt pairs (user + system)
- **Unused**: `TagSuggestionEngine.ts` — multi-signal tag engine (LLM + graph + history), not wired into current command

## Architecture

### Registry Pattern

Replace hardcoded action arrays with a `CopilotActionRegistry` singleton.

**Core interfaces** (`src/service/copilot/CopilotActionRegistry.ts`):

```ts
interface DocumentContext {
  file: TFile;
  title: string;
  content: string;
  selection?: string;
  scope: 'full' | 'selection';
  wordCount: number;
  tags: string[];
  links: string[];          // outgoing wikilinks
  backlinks: number;        // count of incoming links
  headingCount: number;
  isOrphan: boolean;        // backlinks === 0
  frontmatter: Record<string, any>;
}

interface CopilotAction {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  category: 'document' | 'vault' | 'writing';

  // Context recommendation: returns 0-1 relevance score. >0.7 = star badge
  relevance(ctx: DocumentContext): number;

  // Pre-check: return null if executable, string with reason if blocked
  guard?(ctx: DocumentContext): string | null;

  // Execute: receives context + progress callback, returns result
  execute(ctx: DocumentContext, progress: ProgressCallback): Promise<ActionResult>;

  // Result panel component
  ResultPanel: React.ComponentType<{ result: any; ctx: DocumentContext }>;
}

type ProgressCallback = (text: string) => void;

type ActionResult =
  | { type: 'structured'; data: any }
  | { type: 'stream'; text: string }
  | { type: 'error'; message: string };
```

**Registry** (`CopilotActionRegistry`):

```ts
class CopilotActionRegistry {
  private static instance: CopilotActionRegistry;
  private actions = new Map<string, CopilotAction>();

  static getInstance(): CopilotActionRegistry;
  register(action: CopilotAction): void;
  get(id: string): CopilotAction | undefined;
  getAll(): CopilotAction[];
  getByCategory(cat: 'document' | 'vault' | 'writing'): CopilotAction[];

  // Compute recommendations: returns actions sorted by relevance desc
  rank(ctx: DocumentContext): Array<{ action: CopilotAction; score: number }>;
}
```

### File Structure

```
src/service/copilot/
  CopilotActionRegistry.ts       ← registry singleton + interfaces
  DocumentContextBuilder.ts      ← builds DocumentContext from active file
  copilot-schemas.ts             ← existing schemas + new ones
  actions/
    index.ts                     ← registers all actions
    suggest-tags.ts              ← refactored from copilot-commands.ts
    suggest-links.ts
    suggest-split.ts
    review-article.ts
    polish-document.ts
    summarize.ts                 ← NEW
    extract-concepts.ts          ← NEW
    translate.ts                 ← NEW
    find-related.ts              ← NEW
    knowledge-gaps.ts            ← NEW
    synthesize-topic.ts          ← NEW
    vault-health.ts              ← NEW
    continue-writing.ts          ← NEW
    rewrite-selection.ts         ← NEW
    add-evidence.ts              ← NEW
```

### Integration Changes

**`CopilotPickerModal.tsx`** — rewrite to:
- Read actions from `CopilotActionRegistry.getInstance()`
- Build `DocumentContext` via `DocumentContextBuilder`
- Group actions by `category`, render 3 sections with category headers (icon + label)
- Call `registry.rank(ctx)` to get scores; actions with score >0.7 get star badge + border highlight
- Category icon colors: Document = blue (`#7c9aff`), Vault = purple (`#a78bfa`), Writing = green (`#4ade80`)
- Keyboard navigation: arrow keys across sections, Enter to execute
- On select: close modal, call `action.execute(ctx, progress)`, open `CopilotResultModal`

**`CopilotResultModal.tsx`** — simplify to:
- Accept `action: CopilotAction` + `result: ActionResult` + `ctx: DocumentContext`
- Render `action.ResultPanel` directly — no more switch/case
- Loading/error phases remain unchanged

**`copilot-commands.ts`** — simplify to:
- One generic command `peak-copilot-open` (already exists)
- Remove individual per-action commands (or keep as thin wrappers that call `registry.get(id).execute()`)

**`src/app/commands/Register.ts`** — register actions on plugin load via `actions/index.ts`

## UI Layout

### Picker Modal

```
┌─────────────────────────────────────────────────┐
│ Copilot                          context-name    │
│                                                  │
│ ◻ DOCUMENT                                       │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│ │ ★  icon  │ │   icon   │ │   icon   │          │
│ │  Tags    │ │  Links   │ │  Split   │          │
│ │ Auto-tag │ │ Find conn│ │ Break up │          │
│ └──────────┘ └──────────┘ └──────────┘          │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│ │   icon   │ │   icon   │ │ ★  icon  │          │
│ │  Review  │ │  Polish  │ │ Summarize│          │
│ │ Feedback │ │ Clarity  │ │ Gen summ │          │
│ └──────────┘ └──────────┘ └──────────┘          │
│ ┌──────────┐ ┌──────────┐                        │
│ │   icon   │ │   icon   │                        │
│ │ Extract  │ │Translate │                        │
│ │ Concepts │ │ Convert  │                        │
│ └──────────┘ └──────────┘                        │
│                                                  │
│ ◻ VAULT                                          │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│ │ ★  icon  │ │   icon   │ │   icon   │          │
│ │ Related  │ │  Gaps    │ │Synthesize│          │
│ │ Similar  │ │ Missing  │ │ Merge    │          │
│ └──────────┘ └──────────┘ └──────────┘          │
│ ┌──────────┐                                     │
│ │   icon   │                                     │
│ │  Health  │                                     │
│ │ Detect   │                                     │
│ └──────────┘                                     │
│                                                  │
│ ◻ WRITING                                        │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│ │   icon   │ │   icon   │ │   icon   │          │
│ │ Continue │ │ Rewrite  │ │ Evidence │          │
│ │ Keep go  │ │ Rephrase │ │From vault│          │
│ └──────────┘ └──────────┘ └──────────┘          │
│                                                  │
│         ↑↓←→ navigate  ↵ select  ★ recommended  │
└─────────────────────────────────────────────────┘
```

- Modal width: 520px (same as current)
- Tile style: reuse existing rounded card style from current `CopilotPickerModal`
- Star badge: gold `★` in top-right corner of recommended tiles + subtle border highlight
- Section headers: small icon + uppercase label in muted color, minimal vertical space

## Recommendation Rules

All rules are synchronous, zero-latency, computed from `DocumentContext`.

### Document Actions

| Action | >0.7 (star) | 0.4-0.7 | <0.4 |
|---|---|---|---|
| Suggest Tags | no tags in frontmatter | < 2 tags | 3+ tags |
| Suggest Links | orphan (0 backlinks) | < 3 outgoing links | rich links |
| Suggest Split | wordCount > 2000 | wordCount > 1000 | < 1000 |
| Review | wordCount > 500 | wordCount > 300 | < 300 |
| Polish | has selection | wordCount > 200 | < 200 |
| Summarize | wordCount > 1500 | wordCount > 800 | < 800 |
| Extract Concepts | wordCount > 1000 && tags < 2 | wordCount > 500 | < 500 |
| Translate | detected non-primary language | mixed language | single language |

### Vault Actions

| Action | >0.7 | 0.4-0.7 | <0.4 |
|---|---|---|---|
| Find Related | orphan document | < 3 links | rich links |
| Knowledge Gaps | headingCount > 5 | headingCount > 3 | short note |
| Synthesize | title matches MOC/overview/summary pattern | has tags with 5+ same-tag docs in vault | default low |
| Vault Health | always 0.5 (global action) | — | — |

### Writing Actions

| Action | >0.7 | 0.4-0.7 | <0.4 |
|---|---|---|---|
| Continue Writing | cursor near end of document | has content but appears unfinished | default low |
| Rewrite Selection | has selection | — | no selection |
| Add Evidence | argumentative structure detected | wordCount > 500 | < 500 |

## Feature Specifications

### Existing Features (5) — Refactor Only

These retain their current logic and panels. Changes:
- Move execution logic from `copilot-commands.ts` into individual action files
- Each action file exports a `CopilotAction` object
- Existing panels (PolishPanel, ReviewPanel, etc.) become the `ResultPanel` property
- **Suggest Tags**: wire up `TagSuggestionEngine` (multi-signal: LLM + graph neighbors + folder history) instead of direct `queryStructured`

### New Features (10)

#### Summarize

- **Input**: content, title, scope
- **Call**: `queryTextStream(PromptId.DocSummarize, { content, title, scope, length })`
- **Length options**: one-line / short paragraph / detailed (segmented control at top of result panel, default: short paragraph)
- **Result panel**: streaming text display + "Copy" button + "Insert at Top" button (inserts below frontmatter)
- **Prompt template**: `templates/prompts/doc-summarize.md` + `doc-summarize-system.md`
- **Schema**: none (streaming text)

#### Extract Concepts

- **Input**: content, title
- **Call**: `queryStructured(PromptId.DocExtractConcepts, { content, title })` → `extractConceptsSchema`
- **Schema**: `{ concepts: [{ term: string, definition: string, category?: string }] }`
- **Result panel**: card list — each card shows term (bold) + definition + optional category badge. Checkbox per card. "Create N Notes" button creates one `.md` file per selected concept (title = term, content = definition + `Related: [[source]]`)
- **Prompt template**: `templates/prompts/doc-extract-concepts.md` + `doc-extract-concepts-system.md`

#### Translate

- **Input**: content, title, scope, targetLanguage
- **Guard**: none
- **Pre-step**: language selector modal (load language list from `templates/config/translate-languages.json`)
- **Call**: `queryTextStream(PromptId.DocTranslate, { content, title, scope, targetLanguage })`
- **Result panel**: before/after side-by-side (reuse PolishPanel layout) + "Apply"
- **Prompt template**: `templates/prompts/doc-translate.md` + `doc-translate-system.md`

#### Find Related

- **Input**: content (for embedding)
- **Call**: NO LLM — uses `SearchClient.semanticSearch(content, { limit: 10 })` directly
- **Result panel**: ranked list of notes — each row: title + similarity score badge + excerpt snippet. Click row to open note in Obsidian. "Link Top N" button inserts `[[related]]` links into current document's "Related" section
- **No prompt template** — pure vector search

#### Knowledge Gaps

- **Input**: content, title, related note titles (gathered via tag/link traversal from metadataCache)
- **Call**: `queryStructured(PromptId.VaultKnowledgeGaps, { content, title, relatedNotes })` → `knowledgeGapsSchema`
- **Schema**: `{ gaps: [{ topic: string, description: string, suggestedTitle: string, priority: 'high' | 'medium' | 'low' }] }`
- **Result panel**: gap cards sorted by priority. Each card: topic (bold) + description + priority badge. "Create Note" per card (creates empty note with suggested title) or "Create All" for batch
- **Prompt template**: `templates/prompts/vault-knowledge-gaps.md` + `vault-knowledge-gaps-system.md`

#### Synthesize Topic

- **Input**: two-phase
  1. Extract main topic from current doc via LLM (or use title)
  2. `SearchClient.semanticSearch(topic, { limit: 15 })` to gather related notes
  3. Feed note summaries/excerpts to LLM for synthesis
- **Call**: `queryTextStream(PromptId.VaultSynthesize, { topic, sources: [...] })`
- **Result panel**: streaming article + "Sources" collapsible section at bottom listing all referenced notes (clickable). "Create as New Note" button saves synthesis as a new MOC-style document
- **Prompt template**: `templates/prompts/vault-synthesize.md` + `vault-synthesize-system.md`

#### Vault Health

- **Input**: vault metadata scan via `app.vault.getMarkdownFiles()` + `app.metadataCache`
- **Does NOT read file contents** — only metadata (links, tags, frontmatter, modification date)
- **Call**: `queryStructured(PromptId.VaultHealth, { stats })` → `vaultHealthSchema`
- **Schema**: `{ orphans: [{ path, title, lastModified }], duplicates: [{ paths: string[], reason }], stale: [{ path, title, daysSinceModified }], inconsistentTags: [{ tag, variants: string[] }] }`
- **Result panel**: tabbed view (Orphans / Duplicates / Stale / Tags). Each tab has a list with per-item actions:
  - Orphan → "Find Related" (opens Find Related for that file)
  - Duplicate → "Compare" (opens both files side by side)
  - Stale → "Archive" (moves to archive folder)
  - Inconsistent tag → "Normalize" (batch rename tag across vault)
- **Prompt template**: `templates/prompts/vault-health.md` + `vault-health-system.md`
- **Note**: this action operates globally, not on current document

#### Continue Writing

- **Input**: content up to cursor position, title
- **Guard**: document must have content (wordCount > 0)
- **Call**: `queryTextStream(PromptId.WritingContinue, { content, title })`
- **Result panel**: streaming continuation text + "Insert at Cursor" + "Discard"
- **Prompt template**: `templates/prompts/writing-continue.md` + `writing-continue-system.md`

#### Rewrite Selection

- **Input**: selection, full content (as context), title, rewriteStyle
- **Guard**: must have selection, returns "Select text to rewrite" if none
- **Pre-step**: style selector (segmented control): Formal / Concise / Detailed / Casual
- **Call**: `queryTextStream(PromptId.WritingRewrite, { selection, content, title, style })`
- **Result panel**: before/after comparison (reuse PolishPanel layout with breadcrumb showing selected style) + "Apply" (replaces selection)
- **Prompt template**: `templates/prompts/writing-rewrite.md` + `writing-rewrite-system.md`

#### Add Evidence

- **Input**: selection or paragraph at cursor, title
- **Call**: two-phase
  1. `SearchClient.semanticSearch(selectionOrParagraph, { limit: 10 })` to find relevant vault content
  2. `queryStructured(PromptId.WritingAddEvidence, { context: selectionOrParagraph, sources: [...] })` → `addEvidenceSchema`
- **Schema**: `{ evidence: [{ sourceTitle: string, sourcePath: string, quote: string, insertText: string, relevance: number }] }`
- **Result panel**: evidence card list, each showing: source note title (clickable) + quoted passage + suggested insert text. Checkbox per card. "Insert N Items" appends selected evidence at cursor position
- **Prompt template**: `templates/prompts/writing-add-evidence.md` + `writing-add-evidence-system.md`

## New Prompt Templates

Total new files in `templates/prompts/`:

```
doc-summarize.md / doc-summarize-system.md
doc-extract-concepts.md / doc-extract-concepts-system.md
doc-translate.md / doc-translate-system.md
vault-knowledge-gaps.md / vault-knowledge-gaps-system.md
vault-synthesize.md / vault-synthesize-system.md
vault-health.md / vault-health-system.md
writing-continue.md / writing-continue-system.md
writing-rewrite.md / writing-rewrite-system.md
writing-add-evidence.md / writing-add-evidence-system.md
```

(Find Related has no prompt — pure vector search)

New config file: `templates/config/translate-languages.json`

## New PromptIds

Add to `src/service/prompt/PromptId.ts`:

```
DocSummarize / DocSummarizeSystem
DocExtractConcepts / DocExtractConceptsSystem
DocTranslate / DocTranslateSystem
VaultKnowledgeGaps / VaultKnowledgeGapsSystem
VaultSynthesize / VaultSynthesizeSystem
VaultHealth / VaultHealthSystem
WritingContinue / WritingContinueSystem
WritingRewrite / WritingRewriteSystem
WritingAddEvidence / WritingAddEvidenceSystem
```

Register all in `TemplateRegistry.ts` following existing pattern.

## New Zod Schemas

Add to `src/service/copilot/copilot-schemas.ts`:

- `extractConceptsSchema`
- `knowledgeGapsSchema`
- `vaultHealthSchema`
- `addEvidenceSchema`

(Summarize, Translate, Continue, Rewrite are streaming text — no schema needed)

## Migration

- Existing 5 features: zero user-facing changes. Same behavior, same panels, same keyboard shortcuts
- `TagSuggestionEngine`: wire into suggest-tags action (replaces direct `queryStructured` call)
- Existing commands: keep as aliases that delegate to registry for backward compatibility
- New commands: registered via generic dispatcher, no individual command IDs needed

## Out of Scope

- Real-time / inline suggestions (e.g., autocomplete while typing)
- Custom user-defined actions
- Action history / analytics
- Multi-file batch operations (except Vault Health which scans metadata)
