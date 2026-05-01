# Copilot Document Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four Obsidian commands (#42 Doc Polish, #33 Article Reviewer, #38 Suggest Links, #36 Split Suggestion) that operate on the active document, call LLM, and display results in a shared modal with Apply/Dismiss actions.

**Architecture:** Shared `CopilotResultModal` shell routes to 4 panel components by result type. Commands registered via `buildCopilotCommands()` in Register.ts. LLM calls use `AIServiceManager.queryText/queryStructured` with PromptId templates. Review-Fix flow reuses PolishPanel.

**Tech Stack:** React 18, Zustand (none needed — local state), Zod (schemas), Obsidian Modal API, `ReactRenderer` + `createReactElementWithServices`.

**Spec:** `docs/superpowers/specs/2026-04-24-copilot-document-intelligence-design.md`
**Mockup:** `docs/mockups/copilot-document-intelligence.html`

---

## File Structure

### New files

| File | Purpose |
|------|---------|
| `src/service/copilot/copilot-schemas.ts` | Zod schemas: `ReviewResult`, `LinkSuggestions`, `SplitPlan` |
| `src/ui/view/copilot/CopilotResultModal.tsx` | Modal class + React content shell with panel router |
| `src/ui/view/copilot/panels/PolishPanel.tsx` | Side-by-side diff + Apply |
| `src/ui/view/copilot/panels/ReviewPanel.tsx` | Feedback list + Fix buttons + Fix flow |
| `src/ui/view/copilot/panels/LinkSuggestPanel.tsx` | Checkbox link list + Insert |
| `src/ui/view/copilot/panels/SplitPanel.tsx` | Split preview + Execute |
| `src/app/commands/copilot-commands.ts` | 4 command definitions |
| `templates/prompts/doc-polish.hbs` | Polish prompt template |
| `templates/prompts/doc-polish-system.hbs` | Polish system prompt |
| `templates/prompts/doc-review.hbs` | Review prompt template |
| `templates/prompts/doc-review-system.hbs` | Review system prompt |
| `templates/prompts/doc-suggest-links.hbs` | Link suggestion prompt |
| `templates/prompts/doc-suggest-links-system.hbs` | Link suggestion system prompt |
| `templates/prompts/doc-split-suggestion.hbs` | Split suggestion prompt |
| `templates/prompts/doc-split-suggestion-system.hbs` | Split system prompt |

### Modified files

| File | Change |
|------|--------|
| `src/service/prompt/PromptId.ts:255,746` | +4 PromptId entries + PromptVariables |
| `src/core/template/TemplateRegistry.ts:124` | +8 template metadata entries (4 prompts + 4 system) |
| `src/app/commands/Register.ts:622` | Import + spread `buildCopilotCommands()` into return |

---

## Task Order

```
Foundation:
  Task 1: Zod schemas
  Task 2: PromptId + PromptVariables
  Task 3: Template registration + prompt files

UI:
  Task 4: CopilotResultModal shell
  Task 5: PolishPanel (diff view)
  Task 6: ReviewPanel (feedback list + Fix flow)
  Task 7: LinkSuggestPanel
  Task 8: SplitPanel

Wiring:
  Task 9: copilot-commands.ts + Register.ts integration
```

Tasks 1-3 are foundation. Tasks 4-8 are UI (5 must precede 6 since ReviewPanel reuses PolishPanel). Task 9 wires everything. Each task is independently committable.

---

### Task 1: Zod Schemas

**Files:**
- Create: `src/service/copilot/copilot-schemas.ts`

- [ ] **Step 1: Create the schemas file**

```typescript
// src/service/copilot/copilot-schemas.ts
import { z } from 'zod';

export const reviewResultSchema = z.object({
  overall: z.string(),
  sections: z.array(z.object({
    title: z.string(),
    severity: z.enum(['info', 'warning', 'error']),
    feedback: z.string(),
    suggestion: z.string(),
  })),
});

export type ReviewResult = z.infer<typeof reviewResultSchema>;

export const linkSuggestionsSchema = z.object({
  links: z.array(z.object({
    target: z.string(),
    context: z.string(),
    reason: z.string(),
    type: z.enum(['outgoing', 'incoming']),
  })),
});

export type LinkSuggestions = z.infer<typeof linkSuggestionsSchema>;

export const splitPlanSchema = z.object({
  reason: z.string(),
  splits: z.array(z.object({
    newTitle: z.string(),
    headings: z.array(z.string()),
    lineRange: z.tuple([z.number(), z.number()]),
    summary: z.string(),
    excerpt: z.string(),
  })),
});

export type SplitPlan = z.infer<typeof splitPlanSchema>;
```

- [ ] **Step 2: Build and verify**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/service/copilot/copilot-schemas.ts
git commit -m "feat(copilot): Zod schemas for review, link suggestions, and split plan"
```

---

### Task 2: PromptId + PromptVariables

**Files:**
- Modify: `src/service/prompt/PromptId.ts:255,746`

- [ ] **Step 1: Add PromptId entries**

In `src/service/prompt/PromptId.ts`, before the closing `}` of the enum (line 256), add:

```typescript
  // Copilot Document Intelligence
  DocPolish = 'doc-polish',
  DocPolishSystem = 'doc-polish-system',
  DocReview = 'doc-review',
  DocReviewSystem = 'doc-review-system',
  DocSuggestLinks = 'doc-suggest-links',
  DocSuggestLinksSystem = 'doc-suggest-links-system',
  DocSplitSuggestion = 'doc-split-suggestion',
  DocSplitSuggestionSystem = 'doc-split-suggestion-system',
```

- [ ] **Step 2: Add PromptVariables entries**

Before the closing `}` of the `PromptVariables` interface (line 747), add:

```typescript
  [PromptId.DocPolish]: {
    content: string;
    title?: string;
    scope: 'full' | 'selection';
    instruction?: string; // override for Review-Fix flow
  };
  [PromptId.DocPolishSystem]: Record<string, never>;
  [PromptId.DocReview]: {
    content: string;
    title?: string;
    scope: 'full' | 'selection';
  };
  [PromptId.DocReviewSystem]: Record<string, never>;
  [PromptId.DocSuggestLinks]: {
    content: string;
    title?: string;
    existingLinks: string;
  };
  [PromptId.DocSuggestLinksSystem]: Record<string, never>;
  [PromptId.DocSplitSuggestion]: {
    content: string;
    title?: string;
    wordCount: number;
  };
  [PromptId.DocSplitSuggestionSystem]: Record<string, never>;
```

- [ ] **Step 3: Build and verify**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/service/prompt/PromptId.ts
git commit -m "feat(copilot): add 8 PromptId entries + variable types for document intelligence"
```

---

### Task 3: Template Registration + Prompt Files

**Files:**
- Modify: `src/core/template/TemplateRegistry.ts:124`
- Create: 8 files in `templates/prompts/`

- [ ] **Step 1: Add template metadata**

In `src/core/template/TemplateRegistry.ts`, inside the `TEMPLATE_METADATA` object (after the last entry, before the closing `}`), add:

```typescript
  // Copilot Document Intelligence
  'doc-polish': meta('prompts', 'doc-polish', { systemPromptId: 'doc-polish-system' as PromptId }),
  'doc-polish-system': meta('prompts', 'doc-polish-system'),
  'doc-review': meta('prompts', 'doc-review', { expectsJson: true, systemPromptId: 'doc-review-system' as PromptId }),
  'doc-review-system': meta('prompts', 'doc-review-system'),
  'doc-suggest-links': meta('prompts', 'doc-suggest-links', { expectsJson: true, systemPromptId: 'doc-suggest-links-system' as PromptId }),
  'doc-suggest-links-system': meta('prompts', 'doc-suggest-links-system'),
  'doc-split-suggestion': meta('prompts', 'doc-split-suggestion', { expectsJson: true, systemPromptId: 'doc-split-suggestion-system' as PromptId }),
  'doc-split-suggestion-system': meta('prompts', 'doc-split-suggestion-system'),
```

- [ ] **Step 2: Create prompt templates**

Create `templates/prompts/doc-polish-system.hbs`:

```handlebars
You are a writing assistant that polishes documents. Your job is to improve clarity, grammar, conciseness, and flow while preserving the original meaning, structure, and formatting (headings, lists, code blocks, links).

Rules:
- Do NOT change the document structure (headings, section order)
- Do NOT remove or add content — only improve expression
- Preserve all wiki-links ([[...]]), tags, frontmatter, and code blocks exactly
- If the scope is "selection", only polish the provided text fragment
- Return the complete polished text with no commentary
```

Create `templates/prompts/doc-polish.hbs`:

```handlebars
{{#if instruction}}
Apply this specific fix to the document:
{{instruction}}
{{else}}
Polish the following {{scope}} for clarity, grammar, and conciseness.
{{/if}}

{{#if title}}Document: {{title}}{{/if}}

---
{{{content}}}
---

Return ONLY the polished text. No explanations, no commentary.
```

Create `templates/prompts/doc-review-system.hbs`:

```handlebars
You are a writing reviewer. Analyze the document for structure, clarity, consistency, completeness, and conciseness. Return a JSON object with your assessment.

Review dimensions:
1. Structure — logical flow, heading hierarchy, section organization
2. Clarity — ambiguous phrasing, jargon without definition, unclear references
3. Consistency — terminology, formatting, style, tense
4. Completeness — missing context, unexplained assumptions, dead-end references
5. Conciseness — redundancy, filler words, unnecessarily verbose passages

Severity levels:
- "error" — issues that confuse or mislead readers
- "warning" — issues that degrade quality but don't mislead
- "info" — minor improvements, style suggestions
```

Create `templates/prompts/doc-review.hbs`:

```handlebars
Review the following {{scope}} and return a JSON object.

{{#if title}}Document: {{title}}{{/if}}

---
{{{content}}}
---

Return JSON matching this schema:
{
  "overall": "1-2 sentence overall assessment",
  "sections": [
    {
      "title": "issue title",
      "severity": "error" | "warning" | "info",
      "feedback": "what the problem is",
      "suggestion": "specific actionable fix"
    }
  ]
}
```

Create `templates/prompts/doc-suggest-links-system.hbs`:

```handlebars
You are a knowledge graph assistant for an Obsidian vault. Analyze document content and suggest wiki-links to other notes that should be connected.

Rules:
- Only suggest links to notes that likely exist based on the content topics
- "outgoing" = this document should link TO the target (insert [[target]] in the text)
- "incoming" = the target document should link TO this one (informational only)
- Provide the exact sentence/phrase where each outgoing link fits (the "context" field)
- Do NOT suggest links that already exist (provided in existingLinks)
- Return JSON
```

Create `templates/prompts/doc-suggest-links.hbs`:

```handlebars
Suggest wiki-links for this document.

{{#if title}}Document: {{title}}{{/if}}

Existing links (do NOT re-suggest these):
{{existingLinks}}

---
{{{content}}}
---

Return JSON matching this schema:
{
  "links": [
    {
      "target": "note title to link to",
      "context": "the sentence where [[target]] should be inserted",
      "reason": "why this link is valuable",
      "type": "outgoing" | "incoming"
    }
  ]
}
```

Create `templates/prompts/doc-split-suggestion-system.hbs`:

```handlebars
You are a note organization assistant. Analyze long documents and suggest how to split them into focused, self-contained notes along semantic boundaries.

Rules:
- Split at heading boundaries — never mid-paragraph
- Each split should be a coherent standalone note
- Provide the line range (1-indexed) for each split
- Include an excerpt (first ~100 chars) so the user can verify the content
- The splits should cover the entire document with no gaps or overlaps
```

Create `templates/prompts/doc-split-suggestion.hbs`:

```handlebars
This document has {{wordCount}} words. Suggest how to split it into focused notes.

{{#if title}}Document: {{title}}{{/if}}

---
{{{content}}}
---

Return JSON matching this schema:
{
  "reason": "why splitting is beneficial",
  "splits": [
    {
      "newTitle": "suggested title for the new note",
      "headings": ["## Heading 1", "## Heading 2"],
      "lineRange": [startLine, endLine],
      "summary": "what this section covers",
      "excerpt": "first ~100 chars of content"
    }
  ]
}
```

- [ ] **Step 3: Build and verify**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/core/template/TemplateRegistry.ts templates/prompts/doc-*.hbs
git commit -m "feat(copilot): template registration + 8 prompt files for document intelligence"
```

---

### Task 4: CopilotResultModal Shell

**Files:**
- Create: `src/ui/view/copilot/CopilotResultModal.tsx`

- [ ] **Step 1: Create the modal**

```tsx
// src/ui/view/copilot/CopilotResultModal.tsx
import { Modal, type App, type TFile } from 'obsidian';
import React from 'react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/AppContext';
import type { ReviewResult, LinkSuggestions, SplitPlan } from '@/service/copilot/copilot-schemas';

export type CopilotResultType = 'polish' | 'review' | 'suggest-links' | 'split';

export interface CopilotResultProps {
  type: CopilotResultType;
  result: string | ReviewResult | LinkSuggestions | SplitPlan;
  file: TFile;
  scope: 'full' | 'selection';
  originalContent: string;
  selectedText?: string;
  onClose: () => void;
}

const CopilotResultContent: React.FC<CopilotResultProps> = (props) => {
  const { type } = props;

  // Lazy-load panels to keep the shell thin
  switch (type) {
    case 'polish': {
      const { PolishPanel } = require('./panels/PolishPanel');
      return <PolishPanel {...props} result={props.result as string} />;
    }
    case 'review': {
      const { ReviewPanel } = require('./panels/ReviewPanel');
      return <ReviewPanel {...props} result={props.result as ReviewResult} />;
    }
    case 'suggest-links': {
      const { LinkSuggestPanel } = require('./panels/LinkSuggestPanel');
      return <LinkSuggestPanel {...props} result={props.result as LinkSuggestions} />;
    }
    case 'split': {
      const { SplitPanel } = require('./panels/SplitPanel');
      return <SplitPanel {...props} result={props.result as SplitPlan} />;
    }
  }
};

export class CopilotResultModal extends Modal {
  private reactRenderer: ReactRenderer | null = null;

  constructor(
    app: App,
    private props: Omit<CopilotResultProps, 'onClose'>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.modalEl.addClass('peak-copilot-modal');
    this.modalEl.style.width = '720px';
    this.modalEl.style.maxWidth = '90vw';

    const appContext = AppContext.getInstance();
    this.reactRenderer = new ReactRenderer(this.containerEl);
    this.reactRenderer.render(
      createReactElementWithServices(
        CopilotResultContent,
        { ...this.props, onClose: () => this.close() },
        appContext,
      ),
    );
  }

  onClose(): void {
    const r = this.reactRenderer;
    this.reactRenderer = null;
    if (r) setTimeout(() => { r.unmount(); this.contentEl.empty(); }, 0);
    else this.contentEl.empty();
  }
}
```

- [ ] **Step 2: Build and verify**

```bash
npm run build 2>&1 | tail -5
```

Build may warn about missing panel files — that's expected at this stage. The `require()` calls are lazy, so no build error.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/copilot/CopilotResultModal.tsx
git commit -m "feat(copilot): CopilotResultModal shell with panel router"
```

---

### Task 5: PolishPanel (Diff View)

**Files:**
- Create: `src/ui/view/copilot/panels/PolishPanel.tsx`

- [ ] **Step 1: Create PolishPanel**

```tsx
// src/ui/view/copilot/panels/PolishPanel.tsx
import React from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/AppContext';

interface PolishPanelProps {
  result: string;
  file: TFile;
  scope: 'full' | 'selection';
  originalContent: string;
  selectedText?: string;
  onClose: () => void;
  // Optional: for Review-Fix flow
  breadcrumb?: string;
  onBack?: () => void;
}

export const PolishPanel: React.FC<PolishPanelProps> = ({
  result, file, scope, originalContent, selectedText, onClose, breadcrumb, onBack,
}) => {
  const original = scope === 'selection' && selectedText ? selectedText : originalContent;
  const polished = result;

  const handleApply = async () => {
    const app = AppContext.getInstance().app;
    try {
      if (scope === 'selection') {
        const editor = app.workspace.activeEditor?.editor;
        if (editor) {
          editor.replaceSelection(polished);
        }
      } else {
        await app.vault.modify(file, polished);
      }
      new Notice('Changes applied.');
      onClose();
    } catch (e) {
      new Notice(`Failed to apply: ${(e as Error).message}`);
    }
  };

  // Simple word-level diff for display
  const originalWords = original.split(/(\s+)/);
  const polishedWords = polished.split(/(\s+)/);

  return (
    <div className="pktw-flex pktw-flex-col pktw-h-full">
      {/* Header */}
      <div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
        <div className="pktw-flex pktw-items-center pktw-gap-2">
          {onBack && (
            <span
              className="pktw-text-muted-foreground pktw-cursor-pointer hover:pktw-text-foreground pktw-transition-colors pktw-text-sm"
              onClick={onBack}
            >
              ← Back
            </span>
          )}
          {breadcrumb ? (
            <span className="pktw-text-sm pktw-font-semibold">{breadcrumb}</span>
          ) : (
            <>
              <span className="pktw-text-base">✨</span>
              <span className="pktw-text-sm pktw-font-semibold">Document Polish</span>
            </>
          )}
          <span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
            {scope === 'selection' ? 'Selection' : 'Full Document'}
          </span>
        </div>
      </div>

      {/* Diff content */}
      <div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
        {breadcrumb && (
          <div className="pktw-mb-3 pktw-p-3 pktw-bg-secondary pktw-rounded-lg pktw-border-l-3 pktw-border-l-accent pktw-text-xs pktw-text-muted-foreground">
            💡 {breadcrumb}
          </div>
        )}
        <div className="pktw-grid pktw-grid-cols-2 pktw-border pktw-border-border pktw-rounded-lg pktw-overflow-hidden">
          <div className="pktw-p-4 pktw-bg-secondary pktw-border-r pktw-border-border">
            <div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-2.5">
              <div className="pktw-w-1.5 pktw-h-1.5 pktw-rounded-full pktw-bg-[var(--pk-error,#ef4444)] pktw-opacity-60" />
              <span className="pktw-text-[9px] pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">Before</span>
            </div>
            <div className="pktw-text-[13px] pktw-leading-relaxed pktw-whitespace-pre-wrap">{original}</div>
          </div>
          <div className="pktw-p-4">
            <div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-2.5">
              <div className="pktw-w-1.5 pktw-h-1.5 pktw-rounded-full pktw-bg-[var(--pk-success,#22c55e)] pktw-opacity-60" />
              <span className="pktw-text-[9px] pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">After</span>
            </div>
            <div className="pktw-text-[13px] pktw-leading-relaxed pktw-whitespace-pre-wrap">{polished}</div>
          </div>
        </div>
        <div className="pktw-flex pktw-gap-3 pktw-mt-3 pktw-text-[10px] pktw-text-muted-foreground">
          <span>{originalWords.length} → {polishedWords.length} words</span>
        </div>
      </div>

      {/* Footer */}
      <div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
        {onBack && (
          <span
            className="pktw-text-xs pktw-text-muted-foreground pktw-cursor-pointer hover:pktw-text-foreground pktw-mr-auto"
            onClick={onBack}
          >
            ← Back to review
          </span>
        )}
        <Button variant="ghost" onClick={onClose}>
          {onBack ? 'Skip' : 'Dismiss'}
        </Button>
        <Button onClick={handleApply}>
          {onBack ? 'Accept Fix' : 'Apply Changes'}
        </Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Build and verify**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/copilot/panels/PolishPanel.tsx
git commit -m "feat(copilot): PolishPanel with side-by-side diff and Apply"
```

---

### Task 6: ReviewPanel (Feedback List + Fix Flow)

**Files:**
- Create: `src/ui/view/copilot/panels/ReviewPanel.tsx`

- [ ] **Step 1: Create ReviewPanel**

```tsx
// src/ui/view/copilot/panels/ReviewPanel.tsx
import React, { useState } from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/AppContext';
import { PromptId } from '@/service/prompt/PromptId';
import type { ReviewResult } from '@/service/copilot/copilot-schemas';
import { PolishPanel } from './PolishPanel';

const SEVERITY_CONFIG = {
  error: { icon: '!', label: 'Error', bg: 'pktw-bg-[var(--pk-error,#ef4444)]/10', text: 'pktw-text-[var(--pk-error,#ef4444)]' },
  warning: { icon: '⚠', label: 'Warning', bg: 'pktw-bg-[var(--pk-warning,#f59e0b)]/10', text: 'pktw-text-[var(--pk-warning,#f59e0b)]' },
  info: { icon: 'ℹ', label: 'Info', bg: 'pktw-bg-[var(--pk-info,#3b82f6)]/10', text: 'pktw-text-[var(--pk-info,#3b82f6)]' },
} as const;

interface ReviewPanelProps {
  result: ReviewResult;
  file: TFile;
  scope: 'full' | 'selection';
  originalContent: string;
  selectedText?: string;
  onClose: () => void;
}

export const ReviewPanel: React.FC<ReviewPanelProps> = ({
  result, file, scope, originalContent, selectedText, onClose,
}) => {
  const [fixedIndices, setFixedIndices] = useState<Set<number>>(new Set());
  const [fixingIndex, setFixingIndex] = useState<number | null>(null);
  const [fixResult, setFixResult] = useState<string | null>(null);
  const [isFixLoading, setIsFixLoading] = useState(false);

  const handleFix = async (index: number) => {
    const section = result.sections[index];
    setFixingIndex(index);
    setIsFixLoading(true);
    try {
      const manager = AppContext.getInstance().manager;
      const content = scope === 'selection' && selectedText ? selectedText : originalContent;
      const fixed = await manager.queryText(PromptId.DocPolish, {
        content,
        title: file.basename,
        scope,
        instruction: section.suggestion,
      });
      setFixResult(fixed);
      setIsFixLoading(false);
    } catch (e) {
      setIsFixLoading(false);
      setFixingIndex(null);
      new Notice(`Fix failed: ${(e as Error).message}`);
    }
  };

  const handleFixAccepted = () => {
    if (fixingIndex !== null) {
      setFixedIndices(prev => new Set([...prev, fixingIndex]));
    }
    setFixingIndex(null);
    setFixResult(null);
  };

  const handleFixBack = () => {
    setFixingIndex(null);
    setFixResult(null);
  };

  const handleCopyFeedback = () => {
    const md = [
      `## Review: ${file.basename}`,
      '',
      result.overall,
      '',
      ...result.sections.map(s => `### ${s.severity.toUpperCase()}: ${s.title}\n${s.feedback}\n> 💡 ${s.suggestion}`),
    ].join('\n');
    navigator.clipboard.writeText(md);
    new Notice('Feedback copied to clipboard.');
  };

  // If in Fix flow, show PolishPanel
  if (fixingIndex !== null && fixResult) {
    const section = result.sections[fixingIndex];
    return (
      <PolishPanel
        result={fixResult}
        file={file}
        scope={scope}
        originalContent={originalContent}
        selectedText={selectedText}
        onClose={() => { handleFixAccepted(); }}
        breadcrumb={`Fix: ${section.title}`}
        onBack={handleFixBack}
      />
    );
  }

  return (
    <div className="pktw-flex pktw-flex-col pktw-h-full">
      {/* Header */}
      <div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
        <div className="pktw-flex pktw-items-center pktw-gap-2">
          <span className="pktw-text-base">📝</span>
          <span className="pktw-text-sm pktw-font-semibold">Article Review</span>
          <span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
            {scope === 'selection' ? 'Selection' : 'Full Document'}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
        {/* Loading state for fix */}
        {isFixLoading && (
          <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-p-3 pktw-bg-accent/10 pktw-rounded-lg pktw-mb-3 pktw-text-sm pktw-text-muted-foreground">
            <span className="pktw-animate-pulse">🔧</span> Generating fix...
          </div>
        )}

        {/* Overall */}
        <div className="pktw-p-3 pktw-bg-secondary pktw-rounded-lg pktw-mb-4 pktw-text-[13px] pktw-leading-relaxed pktw-border-l-3 pktw-border-l-accent">
          {result.overall}
        </div>

        {/* Sections */}
        {result.sections.map((section, i) => {
          const config = SEVERITY_CONFIG[section.severity];
          const isFixed = fixedIndices.has(i);
          return (
            <div key={i} className={`pktw-flex pktw-gap-2.5 pktw-py-2.5 pktw-border-b pktw-border-border ${isFixed ? 'pktw-opacity-50' : ''}`}>
              <div className={`pktw-w-[22px] pktw-h-[22px] pktw-rounded-md pktw-flex pktw-items-center pktw-justify-center pktw-text-[11px] pktw-flex-shrink-0 pktw-mt-0.5 ${config.bg} ${config.text}`}>
                {config.icon}
              </div>
              <div className="pktw-flex-1 pktw-min-w-0">
                <div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-1">
                  <span className="pktw-text-xs pktw-font-semibold">{section.title}</span>
                  <span className={`pktw-text-[9px] pktw-font-semibold pktw-uppercase pktw-px-1.5 pktw-py-0.5 pktw-rounded ${config.bg} ${config.text}`}>
                    {config.label}
                  </span>
                </div>
                <span className="pktw-text-xs pktw-text-muted-foreground pktw-block pktw-mb-1.5 pktw-leading-relaxed">{section.feedback}</span>
                <div className="pktw-text-[11px] pktw-bg-secondary pktw-p-2 pktw-rounded-md pktw-border-l-2 pktw-border-l-accent pktw-leading-relaxed">
                  💡 {section.suggestion}
                </div>
                <div className="pktw-mt-2">
                  {isFixed ? (
                    <span className="pktw-text-[10px] pktw-font-semibold pktw-px-2.5 pktw-py-1 pktw-rounded pktw-bg-[var(--pk-success,#22c55e)]/10 pktw-text-[var(--pk-success,#22c55e)]">
                      ✓ Fixed
                    </span>
                  ) : (
                    <span
                      className="pktw-text-[10px] pktw-font-semibold pktw-px-2.5 pktw-py-1 pktw-rounded pktw-border pktw-border-accent pktw-bg-accent/10 pktw-text-accent pktw-cursor-pointer hover:pktw-bg-accent hover:pktw-text-white pktw-transition-all pktw-inline-flex pktw-items-center pktw-gap-1"
                      onClick={() => handleFix(i)}
                    >
                      🔧 Fix
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
        <span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
          {fixedIndices.size} of {result.sections.length} fixed
        </span>
        <Button variant="ghost" onClick={handleCopyFeedback}>Copy Feedback</Button>
        <Button variant="ghost" onClick={onClose}>Dismiss</Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Build and verify**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/copilot/panels/ReviewPanel.tsx
git commit -m "feat(copilot): ReviewPanel with feedback list and Fix→Polish flow"
```

---

### Task 7: LinkSuggestPanel

**Files:**
- Create: `src/ui/view/copilot/panels/LinkSuggestPanel.tsx`

- [ ] **Step 1: Create LinkSuggestPanel**

```tsx
// src/ui/view/copilot/panels/LinkSuggestPanel.tsx
import React, { useState } from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/AppContext';
import type { LinkSuggestions } from '@/service/copilot/copilot-schemas';

interface LinkSuggestPanelProps {
  result: LinkSuggestions;
  file: TFile;
  originalContent: string;
  onClose: () => void;
}

export const LinkSuggestPanel: React.FC<LinkSuggestPanelProps> = ({
  result, file, originalContent, onClose,
}) => {
  const [selected, setSelected] = useState<Set<number>>(() => {
    // Pre-select outgoing links
    const s = new Set<number>();
    result.links.forEach((link, i) => { if (link.type === 'outgoing') s.add(i); });
    return s;
  });

  const toggle = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const outgoingCount = result.links.filter(l => l.type === 'outgoing').length;
  const incomingCount = result.links.filter(l => l.type === 'incoming').length;
  const selectedOutgoing = result.links.filter((l, i) => l.type === 'outgoing' && selected.has(i));

  const handleInsert = async () => {
    const app = AppContext.getInstance().app;
    try {
      let content = await app.vault.read(file);
      for (const link of selectedOutgoing) {
        // Insert [[target]] near the context phrase
        const contextIdx = content.indexOf(link.context);
        if (contextIdx !== -1) {
          // Insert [[target]] after the context phrase
          const insertPos = contextIdx + link.context.length;
          content = content.slice(0, insertPos) + ` [[${link.target}]]` + content.slice(insertPos);
        }
      }
      await app.vault.modify(file, content);
      new Notice(`Inserted ${selectedOutgoing.length} links.`);
      onClose();
    } catch (e) {
      new Notice(`Failed: ${(e as Error).message}`);
    }
  };

  return (
    <div className="pktw-flex pktw-flex-col pktw-h-full">
      {/* Header */}
      <div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
        <div className="pktw-flex pktw-items-center pktw-gap-2">
          <span className="pktw-text-base">🔗</span>
          <span className="pktw-text-sm pktw-font-semibold">Link Suggestions</span>
        </div>
      </div>

      {/* Body */}
      <div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
        {/* Summary */}
        <div className="pktw-flex pktw-items-center pktw-gap-3 pktw-p-3 pktw-bg-secondary pktw-rounded-lg pktw-mb-3 pktw-text-[11px] pktw-text-muted-foreground">
          <span className="pktw-text-lg pktw-font-bold pktw-text-accent">{result.links.length}</span>
          <span>potential links · <span className="pktw-font-semibold pktw-text-accent">{outgoingCount}</span> outgoing · <span className="pktw-font-semibold pktw-text-[var(--pk-success,#22c55e)]">{incomingCount}</span> incoming</span>
        </div>

        {/* Links */}
        {result.links.map((link, i) => {
          const isChecked = selected.has(i);
          const isOutgoing = link.type === 'outgoing';
          return (
            <div
              key={i}
              className="pktw-flex pktw-items-start pktw-gap-2.5 pktw-px-3 pktw-py-2.5 pktw-rounded-lg pktw-cursor-pointer hover:pktw-bg-muted pktw-transition-colors"
              onClick={() => toggle(i)}
            >
              <div className={`pktw-w-4 pktw-h-4 pktw-rounded pktw-border-2 pktw-flex pktw-items-center pktw-justify-center pktw-flex-shrink-0 pktw-mt-0.5 pktw-transition-all ${
                isChecked
                  ? 'pktw-bg-accent pktw-border-accent pktw-text-white pktw-text-[10px]'
                  : 'pktw-border-border'
              }`}>
                {isChecked && '✓'}
              </div>
              <div className="pktw-flex-1 pktw-min-w-0">
                <div className="pktw-flex pktw-items-center pktw-gap-1.5">
                  <span className="pktw-text-[13px] pktw-font-semibold pktw-text-accent">[[{link.target}]]</span>
                  <span className={`pktw-text-[8px] pktw-font-bold pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-uppercase ${
                    isOutgoing
                      ? 'pktw-bg-accent/10 pktw-text-accent'
                      : 'pktw-bg-[var(--pk-success,#22c55e)]/10 pktw-text-[var(--pk-success,#22c55e)]'
                  }`}>
                    {isOutgoing ? '→ Out' : '← In'}
                  </span>
                </div>
                <span className="pktw-text-[11px] pktw-text-muted-foreground pktw-block pktw-mt-0.5">{link.reason}</span>
                {link.context && (
                  <span className="pktw-text-[11px] pktw-text-muted-foreground/60 pktw-italic pktw-block pktw-mt-1 pktw-pl-2.5 pktw-border-l-2 pktw-border-border">
                    ...{link.context}...
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
        <span className="pktw-text-[11px] pktw-text-muted-foreground pktw-mr-auto">
          {selected.size} of {result.links.length} selected
        </span>
        <Button variant="ghost" onClick={onClose}>Dismiss</Button>
        <Button onClick={handleInsert} disabled={selectedOutgoing.length === 0}>
          Insert {selectedOutgoing.length} Links
        </Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Build and verify**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/copilot/panels/LinkSuggestPanel.tsx
git commit -m "feat(copilot): LinkSuggestPanel with checkbox list and batch insert"
```

---

### Task 8: SplitPanel

**Files:**
- Create: `src/ui/view/copilot/panels/SplitPanel.tsx`

- [ ] **Step 1: Create SplitPanel**

```tsx
// src/ui/view/copilot/panels/SplitPanel.tsx
import React from 'react';
import type { TFile } from 'obsidian';
import { Notice } from 'obsidian';
import { Button } from '@/ui/component/shared-ui/button';
import { AppContext } from '@/app/AppContext';
import type { SplitPlan } from '@/service/copilot/copilot-schemas';

interface SplitPanelProps {
  result: SplitPlan;
  file: TFile;
  originalContent: string;
  onClose: () => void;
}

const SPLIT_COLORS = ['pktw-bg-accent', 'pktw-bg-[var(--pk-info,#3b82f6)]', 'pktw-bg-[var(--pk-success,#22c55e)]', 'pktw-bg-[var(--pk-warning,#f59e0b)]', 'pktw-bg-[var(--pk-error,#ef4444)]'];

export const SplitPanel: React.FC<SplitPanelProps> = ({
  result, file, originalContent, onClose,
}) => {
  const lines = originalContent.split('\n');

  const handleSplit = async () => {
    const app = AppContext.getInstance().app;
    const parentFolder = file.parent?.path ?? '';

    try {
      // Create new files in reverse order to preserve line numbers
      const sortedSplits = [...result.splits].sort((a, b) => b.lineRange[0] - a.lineRange[0]);

      for (const split of sortedSplits) {
        const [start, end] = split.lineRange;
        const extractedLines = lines.slice(start - 1, end); // 1-indexed to 0-indexed
        const content = extractedLines.join('\n');
        const newPath = parentFolder ? `${parentFolder}/${split.newTitle}.md` : `${split.newTitle}.md`;

        await app.vault.create(newPath, content);

        // Replace extracted content with a link in the original
        const linkLine = `→ [[${split.newTitle}]]`;
        lines.splice(start - 1, end - start + 1, linkLine);
      }

      // Save modified original
      await app.vault.modify(file, lines.join('\n'));

      const titles = result.splits.map(s => s.newTitle).join(', ');
      new Notice(`Split into ${result.splits.length} notes: ${titles}`);
      onClose();
    } catch (e) {
      new Notice(`Split failed: ${(e as Error).message}`);
    }
  };

  // Calculate word counts per split
  const splitWordCounts = result.splits.map(split => {
    const [start, end] = split.lineRange;
    const content = lines.slice(start - 1, end).join(' ');
    return content.split(/\s+/).filter(Boolean).length;
  });
  const totalWords = splitWordCounts.reduce((a, b) => a + b, 0);

  return (
    <div className="pktw-flex pktw-flex-col pktw-h-full">
      {/* Header */}
      <div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-b pktw-border-border">
        <div className="pktw-flex pktw-items-center pktw-gap-2">
          <span className="pktw-text-base">✂️</span>
          <span className="pktw-text-sm pktw-font-semibold">Split Suggestion</span>
          <span className="pktw-text-[9px] pktw-font-semibold pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-accent/10 pktw-text-accent pktw-uppercase pktw-tracking-wider">
            {totalWords.toLocaleString()} words
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5">
        {/* Reason */}
        <div className="pktw-p-3 pktw-bg-secondary pktw-rounded-lg pktw-mb-4 pktw-text-xs pktw-text-muted-foreground pktw-leading-relaxed pktw-border-l-3 pktw-border-l-[var(--pk-warning,#f59e0b)]">
          📐 {result.reason}
        </div>

        {/* Proportional bar */}
        <div className="pktw-flex pktw-gap-0.5 pktw-mb-4 pktw-h-2 pktw-rounded pktw-overflow-hidden">
          {result.splits.map((_, i) => (
            <div
              key={i}
              className={`${SPLIT_COLORS[i % SPLIT_COLORS.length]} pktw-rounded-sm`}
              style={{ flex: splitWordCounts[i] }}
            />
          ))}
        </div>

        {/* Split cards */}
        {result.splits.map((split, i) => (
          <div key={i} className="pktw-border pktw-border-border pktw-rounded-lg pktw-mb-2.5 pktw-overflow-hidden">
            <div className="pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-3.5 pktw-py-2.5 pktw-bg-secondary pktw-border-b pktw-border-border">
              <div className="pktw-w-[22px] pktw-h-[22px] pktw-rounded-full pktw-bg-accent/10 pktw-text-accent pktw-flex pktw-items-center pktw-justify-center pktw-text-[11px] pktw-font-bold pktw-flex-shrink-0">
                {i + 1}
              </div>
              <span className="pktw-text-[13px] pktw-font-semibold pktw-flex-1">{split.newTitle}</span>
              <span className="pktw-text-[10px] pktw-text-muted-foreground pktw-tabular-nums">~{splitWordCounts[i].toLocaleString()} words</span>
            </div>
            <div className="pktw-px-3.5 pktw-py-2.5">
              {/* Headings */}
              <div className="pktw-flex pktw-flex-wrap pktw-gap-1 pktw-mb-2">
                {split.headings.map(h => (
                  <span key={h} className="pktw-text-[10px] pktw-px-2 pktw-py-0.5 pktw-rounded pktw-bg-muted pktw-text-muted-foreground pktw-border pktw-border-border">{h}</span>
                ))}
              </div>
              {/* Summary */}
              <span className="pktw-text-[11px] pktw-text-muted-foreground pktw-leading-relaxed pktw-block">{split.summary}</span>
              {/* Excerpt */}
              <div className="pktw-mt-2 pktw-p-2 pktw-bg-background pktw-border pktw-border-border pktw-rounded-md pktw-text-[11px] pktw-text-muted-foreground/60 pktw-leading-relaxed pktw-max-h-[60px] pktw-overflow-hidden pktw-relative">
                <span className="pktw-text-[9px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground pktw-block pktw-mb-1">
                  Original content <span className="pktw-text-accent pktw-font-semibold pktw-ml-1.5">Lines {split.lineRange[0]}–{split.lineRange[1]}</span>
                </span>
                {split.excerpt}
                <div className="pktw-absolute pktw-bottom-0 pktw-left-0 pktw-right-0 pktw-h-5 pktw-bg-gradient-to-t pktw-from-background pktw-to-transparent" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-5 pktw-py-3 pktw-border-t pktw-border-border pktw-bg-secondary">
        <Button variant="ghost" onClick={onClose}>Dismiss</Button>
        <Button onClick={handleSplit}>
          Split into {result.splits.length} Notes
        </Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Build and verify**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/copilot/panels/SplitPanel.tsx
git commit -m "feat(copilot): SplitPanel with preview cards, excerpt, and split execution"
```

---

### Task 9: Command Registration + Wiring

**Files:**
- Create: `src/app/commands/copilot-commands.ts`
- Modify: `src/app/commands/Register.ts:622`

- [ ] **Step 1: Create copilot-commands.ts**

```typescript
// src/app/commands/copilot-commands.ts
import type { Command } from 'obsidian';
import { Notice } from 'obsidian';
import type { ViewManager } from '@/app/view/ViewManager';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import { CopilotResultModal } from '@/ui/view/copilot/CopilotResultModal';
import { getSelectedTextFromActiveEditor } from '@/core/utils/obsidian-utils';
import { isDesktop } from '@/core/platform';
import { reviewResultSchema, linkSuggestionsSchema, splitPlanSchema } from '@/service/copilot/copilot-schemas';

function openProgressNotice(initial: string): { setMessage: (text: string) => void; hide: () => void } {
  const notice = new Notice(initial, 0);
  return {
    setMessage: (text: string) => { notice.noticeEl.textContent = text; },
    hide: () => notice.hide(),
  };
}

export function buildCopilotCommands(viewManager: ViewManager, aiManager: AIServiceManager): Command[] {
  if (!isDesktop) return [];

  const getContext = async () => {
    const app = viewManager.getApp();
    const file = app.workspace.getActiveFile();
    if (!file) { new Notice('Open a document first.'); return null; }
    const content = await app.vault.cachedRead(file);
    const selected = getSelectedTextFromActiveEditor(app) ?? undefined;
    const scope = selected ? 'selection' as const : 'full' as const;
    const input = selected ?? content;
    return { app, file, content, selected, scope, input };
  };

  return [
    {
      id: 'peak-copilot-polish',
      name: 'Copilot: Polish Document',
      callback: async () => {
        const ctx = await getContext();
        if (!ctx) return;
        const ui = openProgressNotice('Polishing document...');
        try {
          const result = await aiManager.queryText(PromptId.DocPolish, {
            content: ctx.input, title: ctx.file.basename, scope: ctx.scope,
          });
          ui.hide();
          new CopilotResultModal(ctx.app, {
            type: 'polish', result, file: ctx.file, scope: ctx.scope,
            originalContent: ctx.input, selectedText: ctx.selected,
          }).open();
        } catch (e) {
          ui.hide();
          new Notice(`Polish failed: ${(e as Error).message}`);
        }
      },
    },
    {
      id: 'peak-copilot-review',
      name: 'Copilot: Review Article',
      callback: async () => {
        const ctx = await getContext();
        if (!ctx) return;
        const ui = openProgressNotice('Reviewing article...');
        try {
          const result = await aiManager.queryStructured(
            PromptId.DocReview,
            { content: ctx.input, title: ctx.file.basename, scope: ctx.scope },
            reviewResultSchema,
          );
          ui.hide();
          new CopilotResultModal(ctx.app, {
            type: 'review', result, file: ctx.file, scope: ctx.scope,
            originalContent: ctx.input, selectedText: ctx.selected,
          }).open();
        } catch (e) {
          ui.hide();
          new Notice(`Review failed: ${(e as Error).message}`);
        }
      },
    },
    {
      id: 'peak-copilot-suggest-links',
      name: 'Copilot: Suggest Links',
      callback: async () => {
        const ctx = await getContext();
        if (!ctx) return;
        // Extract existing links from metadata cache
        const cache = ctx.app.metadataCache.getFileCache(ctx.file);
        const existingLinks = (cache?.links ?? []).map(l => l.link).join(', ');
        const ui = openProgressNotice('Analyzing links...');
        try {
          const result = await aiManager.queryStructured(
            PromptId.DocSuggestLinks,
            { content: ctx.input, title: ctx.file.basename, existingLinks },
            linkSuggestionsSchema,
          );
          ui.hide();
          new CopilotResultModal(ctx.app, {
            type: 'suggest-links', result, file: ctx.file, scope: ctx.scope,
            originalContent: ctx.content,
          }).open();
        } catch (e) {
          ui.hide();
          new Notice(`Link suggestion failed: ${(e as Error).message}`);
        }
      },
    },
    {
      id: 'peak-copilot-split',
      name: 'Copilot: Suggest Split',
      callback: async () => {
        const ctx = await getContext();
        if (!ctx) return;
        const wordCount = ctx.content.split(/\s+/).filter(Boolean).length;
        if (wordCount < 500) {
          new Notice('Document is too short to split (< 500 words).');
          return;
        }
        const ui = openProgressNotice('Analyzing structure...');
        try {
          const result = await aiManager.queryStructured(
            PromptId.DocSplitSuggestion,
            { content: ctx.content, title: ctx.file.basename, wordCount },
            splitPlanSchema,
          );
          ui.hide();
          new CopilotResultModal(ctx.app, {
            type: 'split', result, file: ctx.file, scope: 'full',
            originalContent: ctx.content,
          }).open();
        } catch (e) {
          ui.hide();
          new Notice(`Split analysis failed: ${(e as Error).message}`);
        }
      },
    },
  ];
}
```

- [ ] **Step 2: Wire into Register.ts**

Read `src/app/commands/Register.ts`. At the top, add the import:

```typescript
import { buildCopilotCommands } from './copilot-commands';
```

Inside `buildCoreCommands` (line ~622), find the return statement where command arrays are spread. Add `...buildCopilotCommands(viewManager, aiManager),` to the returned array.

- [ ] **Step 3: Build and verify**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add src/app/commands/copilot-commands.ts src/app/commands/Register.ts
git commit -m "feat(copilot): register 4 document intelligence commands"
```

---

## Self-Review

**Spec coverage:**
| Spec section | Task |
|---|---|
| §3.1 Doc Polish | Task 5 (PolishPanel) + Task 9 (command) |
| §3.2 Article Reviewer | Task 6 (ReviewPanel + Fix flow) + Task 9 |
| §3.3 Suggest Links | Task 7 (LinkSuggestPanel) + Task 9 |
| §3.4 Split Suggestion | Task 8 (SplitPanel) + Task 9 |
| §4.1 New files | All tasks create the listed files |
| §4.2 Modified files | Task 2 (PromptId), Task 3 (TemplateRegistry), Task 9 (Register) |
| §4.3 CopilotResultModal | Task 4 |
| §4.4 Command pattern | Task 9 |
| §5 UI conventions | All panels use pktw-, CSS vars, Button, span |
| §6 Non-goals | Confirmed: no streaming, no undo, no auto-trigger |

**All 6 spec sections covered.**

**Placeholder scan:** Clean. No TBD/TODO.

**Type consistency:** `ReviewResult`, `LinkSuggestions`, `SplitPlan` defined in Task 1, consumed consistently in Tasks 6-9. `PolishPanelProps.breadcrumb`/`onBack` used in Task 6's Fix flow. `CopilotResultType` union matches the 4 panel switch cases.
