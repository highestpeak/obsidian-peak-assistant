# Copilot Document Intelligence — Design Spec

> Date: 2026-04-24
> Status: Approved
> Mockup: `docs/mockups/copilot-document-intelligence.html`
> Issues: #42 (Doc Polish), #33 (Article Reviewer), #38 (Suggest Links), #36 (Split Suggestion)

## 1. Overview

Four Obsidian commands that operate on the active document (or selected text), call the LLM via `AIServiceManager`, and display results in a shared `CopilotResultModal`. The user reviews results before any document modification.

All four commands share a unified pipeline:

```
Command trigger
  → getActiveFile() + getSelectedText()
  → openProgressNotice()
  → aiManager.queryText / queryStructured(PromptId.X, variables)
  → CopilotResultModal.open(result, type)
  → User reviews → Apply / Dismiss
```

## 2. Scope & Constraints

- **Desktop only** — guarded by `isDesktop` check
- **Document size** — truncated at 120k chars (reuses `DocumentLoaderManager.readByPath` limit)
- **Scope** — full document by default; if text is selected (`getSelectedTextFromActiveEditor(app)`), operates on the selection only
- **No streaming** — all four features wait for completion, then render the full result
- **Modal pattern** — reuses `ReactRenderer` + `createReactElementWithServices` (same as `CostEstimationModal`)

## 3. Feature Definitions

### 3.1 Doc Polish (#42)

**Command:** `Copilot: Polish Document`
**PromptId:** `DocPolish`
**LLM call:** `queryText(PromptId.DocPolish, { content, title, scope: 'full' | 'selection' })`
**Output:** Plain text (the polished document/selection)

**Modal panel:** Side-by-side diff view
- Left pane: "Before" — original text with deletions highlighted (red strikethrough)
- Right pane: "After" — polished text with additions highlighted (green background)
- Stats bar: N improved, N replaced, ~X% shorter/longer
- Footer: Dismiss | Apply Changes

**Apply behavior:**
- Full document: `app.vault.modify(file, polishedText)`
- Selection: `editor.replaceSelection(polishedText)`

### 3.2 Article Reviewer (#33)

**Command:** `Copilot: Review Article`
**PromptId:** `DocReview`
**LLM call:** `queryStructured<ReviewResult>(PromptId.DocReview, { content, title, scope })`

**Output schema:**
```typescript
interface ReviewResult {
  overall: string;
  sections: Array<{
    title: string;
    severity: 'info' | 'warning' | 'error';
    feedback: string;
    suggestion: string;
  }>;
}
```

**Modal panel:** Feedback list
- Overall assessment (accent left border)
- Per-section items with severity icon (error=red, warning=amber, info=blue)
- Each item shows: title + severity badge + feedback + suggestion (💡 prefix)
- Each item has a 🔧 **Fix** button
- Already-fixed items show ✓ Fixed (reduced opacity)
- Footer: "N of M fixed" counter | Copy Feedback | Dismiss

**Fix flow:** Clicking 🔧 Fix on a review item:
1. Triggers a second LLM call: `queryText(PromptId.DocPolish, { content, title, instruction: item.suggestion })`
2. Shows loading state
3. Transitions the modal to the **Polish diff view** (same layout as §3.1)
4. Breadcrumb header: `Article Review › Fix: {item.title}` with severity badge
5. Suggestion text displayed above the diff as context
6. Footer: ← Back to review | Skip | Accept Fix
7. Accept Fix → writes the change, returns to review list, marks item ✓ Fixed
8. Skip / Back → returns without applying

### 3.3 Suggest Links (#38)

**Command:** `Copilot: Suggest Links`
**PromptId:** `DocSuggestLinks`
**LLM call:** `queryStructured<LinkSuggestions>(PromptId.DocSuggestLinks, { content, title, existingLinks })`

`existingLinks` extracted from `app.metadataCache.getFileCache(file)?.links` to avoid duplicates.

**Output schema:**
```typescript
interface LinkSuggestions {
  links: Array<{
    target: string;      // note title to link to
    context: string;     // the sentence/phrase where the link fits
    reason: string;      // why this link is suggested
    type: 'outgoing' | 'incoming';
  }>;
}
```

**Modal panel:** Checkbox link list
- Summary bar: "N potential links found · X outgoing · Y incoming"
- Each item: checkbox + target (accent color, `[[target]]` format) + type badge (→ Out purple / ← In green) + reason + context excerpt with highlight
- Footer: "N of M selected" | Dismiss | Insert N Links

**Apply behavior:** For each checked outgoing link, find the `context` string in the document and insert `[[target]]` at the appropriate position. Incoming links are informational only (displayed for awareness, not actionable from this document).

### 3.4 Split Suggestion (#36)

**Command:** `Copilot: Suggest Split`
**PromptId:** `DocSplitSuggestion`
**LLM call:** `queryStructured<SplitPlan>(PromptId.DocSplitSuggestion, { content, title, wordCount })`

**Output schema:**
```typescript
interface SplitPlan {
  reason: string;
  splits: Array<{
    newTitle: string;
    headings: string[];       // heading names included in this split
    lineRange: [number, number];  // start and end line numbers
    summary: string;
    excerpt: string;          // first ~100 chars of the content being split out
  }>;
}
```

**Modal panel:** Split preview
- Reason bar (warning left border, 📐 icon)
- Proportional color bar visualizing relative sizes
- Per-split cards:
  - Header: numbered circle + new title + word count
  - Body: heading chips + summary + "Original content Lines X–Y" excerpt with fade
- Footer: Dismiss | Split into N Notes

**Apply behavior:**
1. For each split, extract content by line range from the original
2. Create new file: `app.vault.create(splitPath, extractedContent)` with the new title
3. Replace the extracted sections in the original file with `[[newTitle]]` links
4. Show Notice: "Split into N notes: {titles}"

## 4. Architecture

### 4.1 New Files

| File | Purpose |
|------|---------|
| `src/app/commands/copilot-commands.ts` | 4 command registrations (shared builder) |
| `src/ui/view/copilot/CopilotResultModal.tsx` | Modal shell + panel router |
| `src/ui/view/copilot/panels/PolishPanel.tsx` | Side-by-side diff + Apply |
| `src/ui/view/copilot/panels/ReviewPanel.tsx` | Feedback list + Fix buttons |
| `src/ui/view/copilot/panels/LinkSuggestPanel.tsx` | Checkbox link list + Insert |
| `src/ui/view/copilot/panels/SplitPanel.tsx` | Split preview + Execute |
| `src/service/copilot/copilot-schemas.ts` | Zod schemas: ReviewResult, LinkSuggestions, SplitPlan |

### 4.2 Modified Files

| File | Change |
|------|--------|
| `src/service/prompt/PromptId.ts` | +4 PromptId entries + PromptVariables |
| `src/core/template/TemplateRegistry.ts` | +4 template registrations (+ system prompts) |
| `src/app/commands/Register.ts` | Import + spread `buildCopilotCommands()` |

### 4.3 CopilotResultModal

The modal is a thin shell that receives `{ type, result }` and routes to the appropriate panel component:

```typescript
type CopilotResultType = 'polish' | 'review' | 'suggest-links' | 'split';

interface CopilotResultModalProps {
  type: CopilotResultType;
  result: unknown;             // typed per panel
  file: TFile;
  scope: 'full' | 'selection';
  originalContent: string;
  selectedText?: string;
  onClose: () => void;
}
```

The Review panel's Fix flow reuses `PolishPanel` internally — when Fix is clicked, ReviewPanel calls `queryText` for the fix, then renders `<PolishPanel>` with a back button. This avoids duplicating the diff view.

### 4.4 Command Registration Pattern

```typescript
function buildCopilotCommands(viewManager: ViewManager, aiManager: AIServiceManager): Command[] {
  return [
    {
      id: 'peak-copilot-polish',
      name: 'Copilot: Polish Document',
      callback: async () => {
        const { app } = viewManager;
        const file = app.workspace.getActiveFile();
        if (!file) { new Notice('Open a document first.'); return; }
        
        const content = await app.vault.cachedRead(file);
        const selected = getSelectedTextFromActiveEditor(app);
        const scope = selected ? 'selection' : 'full';
        const input = selected || content;
        
        const ui = openProgressNotice('Polishing document...');
        try {
          const result = await aiManager.queryText(PromptId.DocPolish, {
            content: input, title: file.basename, scope,
          });
          ui.hide();
          new CopilotResultModal(app, {
            type: 'polish', result, file, scope,
            originalContent: input,
          }).open();
        } catch (e) {
          ui.hide();
          new Notice(`Polish failed: ${(e as Error).message}`);
        }
      },
    },
    // ... 3 more commands with same pattern
  ];
}
```

### 4.5 Prompt Design Notes

- **DocPolish**: System prompt emphasizes preserving original structure, formatting, and meaning. Only improves expression, grammar, and clarity. For Review-Fix flow, an `instruction` variable overrides the generic polish with the specific suggestion.
- **DocReview**: System prompt defines review dimensions (structure, clarity, consistency, completeness, conciseness). Requires JSON output matching `ReviewResult` schema.
- **DocSuggestLinks**: System prompt requires analyzing content semantics and suggesting notes that should be linked. Receives `existingLinks` to avoid duplicates. Must distinguish outgoing (this doc should link to target) vs incoming (target should link here).
- **DocSplitSuggestion**: System prompt requires identifying semantic boundaries. Must not break content mid-paragraph. Each split should be a self-contained note.

## 5. UI Conventions

- All Tailwind classes use `pktw-` prefix
- Colors via CSS vars: `var(--pk-accent,#6d28d9)`, `var(--pk-success,#22c55e)`, etc.
- Severity colors: error=`var(--pk-error,#ef4444)`, warning=`var(--pk-warning,#f59e0b)`, info=`var(--pk-info,#3b82f6)`
- Use shadcn/ui `Button` component, never raw `<button>`
- Use `<span>` with Tailwind classes, not semantic HTML (`<h1>`, `<p>`)
- Modal uses `ReactRenderer` + `createReactElementWithServices` pattern

## 6. Non-Goals

- No inline editor annotations (results always in modal)
- No streaming display (wait for completion)
- No undo after Apply (user can Cmd+Z in Obsidian editor)
- No auto-trigger (all commands are manual)
- No batch processing across multiple files
