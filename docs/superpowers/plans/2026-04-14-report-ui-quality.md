# Report UI Quality & Sources Completeness Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix report generation quality: complete Sources tab, remove redundant citations from report body, enforce markdown formatting, match query language, make plan review footer sticky, and enable inline plan editing.

**Architecture:** 5 tasks touching 4 layers — store (sources tracking), hooks (evidence path sync), prompts (LLM instructions), and UI (layout + editing). Each task is independently testable.

**Tech Stack:** React, Zustand, Tailwind (pktw- prefix), Handlebars templates

---

### Task 1: Sources Completeness — Sync evidence_paths to v2Sources

When `vault_submit_plan` is processed, each section's `evidence_paths` may include vault paths that were never individually read via `vault_read_note`. These must be added to `v2Sources` so the Sources tab is complete before we remove citations from report body.

**Files:**
- Modify: `src/ui/view/quick-search/hooks/useSearchSession.ts:828-845`

- [ ] **Step 1: Add evidence path sync after plan_sections processing**

In `useSearchSession.ts`, after the `setPlanSections(sections)` call (line 844), iterate all `evidence_paths` and add them to `v2Sources`:

```ts
// After line 844: store.getState().setPlanSections(sections);
// Sync all evidence paths to v2Sources so Sources tab is complete
for (const sec of sections) {
    for (const ep of sec.evidencePaths) {
        store.getState().addV2Source({
            path: ep,
            title: ep.split('/').pop()?.replace(/\.md$/, '') || ep,
            readAt: Date.now(),
        });
    }
}
```

`addV2Source` already deduplicates by path (`searchSessionStore.ts:573`), so duplicates are safe.

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: successful build, no errors

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/hooks/useSearchSession.ts
git commit -m "fix(sources): sync plan evidence_paths to v2Sources for complete Sources tab"
```

---

### Task 2: Prompt — Remove Citations from Report Body, Fix Language & Markdown

The current `ai-analysis-report-section-system.md` mandates `[[wikilink]]` in every paragraph (lines 10-13), causing massive citation/reference blocks in the report. Since Sources tab handles this, we remove inline citations and add explicit formatting rules.

**Files:**
- Modify: `templates/prompts/ai-analysis-report-section-system.md`

- [ ] **Step 1: Replace EVIDENCE BINDING section (lines 9-13)**

Replace the current mandatory citation block:

```
# EVIDENCE BINDING (MANDATORY)
- Cite **[[path]]** (vault wikilinks) for **every** factual claim so the reader can trace claims.
- If you cannot bind a claim to evidence, mark it as **(speculation)**.
- Never fabricate paths or URLs.
- **Every paragraph** must contain at least one [[wikilink]] citation. No unsupported "castle in the air" insights.
```

With a lighter version:

```
# EVIDENCE USE
- Base every claim on the provided evidence. If a claim has no supporting evidence, mark it **(speculation)**.
- Do NOT include inline [[wikilink]] citations in the text. Sources are displayed separately in the UI.
- Do NOT include a "References", "Citations", "Further Reading", "Sources", or similar section at the end. The Sources tab handles this.
- Never fabricate paths or URLs.
```

- [ ] **Step 2: Strengthen language instruction (line 71)**

Replace:

```
- Write in the SAME LANGUAGE as the user's query. Chinese query = Chinese section.
```

With:

```
- **LANGUAGE (CRITICAL)**: You MUST write in the SAME LANGUAGE as the user's query. If the query is in Chinese, the ENTIRE section (title, body, labels, "So What") MUST be in Chinese. If the query is in English, write in English. NEVER mix languages. This is non-negotiable.
```

- [ ] **Step 3: Add explicit markdown formatting instruction**

After the "OUTPUT RULES" section, add:

```
# MARKDOWN FORMATTING
- Use standard markdown numbered lists (`1.`, `2.`, `3.`) — NOT parenthetical numbering like `(1)`, `（1）`, or inline `1)`.
- Use bullet lists (`-`) for unordered items.
- Use `**bold**` for key terms and emphasis.
- Use markdown tables when comparing 3+ items on 2+ dimensions.
- Structure long sections with `####` sub-headings (h4 only — h1-h3 are reserved for the report structure).
```

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: successful build

- [ ] **Step 5: Commit**

```bash
git add templates/prompts/ai-analysis-report-section-system.md
git commit -m "fix(prompts): remove inline citations, enforce language match and markdown formatting"
```

---

### Task 3: V2PlanReview — Sticky Bottom Bar

Current issue: `V2PlanReview.tsx:115` has `pktw-h-full` on the outer flex-col, and the bar at line 202 uses `pktw-sticky pktw-bottom-0`. When content overflows, the sticky behavior is unreliable because the parent's fixed height constrains the stickable range.

Fix: Make V2PlanReview an internal flex container where the content area scrolls and the footer is always visible.

**Files:**
- Modify: `src/ui/view/quick-search/components/V2PlanReview.tsx:115`
- Modify: `src/ui/view/quick-search/components/V2PlanReview.tsx:202`

- [ ] **Step 1: Restructure V2PlanReview layout**

Change the outer container (line 115) from:
```tsx
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pktw-flex pktw-flex-col pktw-h-full">
```
To:
```tsx
<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="pktw-flex pktw-flex-col pktw-h-full pktw-overflow-hidden">
```

Wrap the content area (lines 117-199) in a scrollable div. Add before line 117:
```tsx
<div className="pktw-flex-1 pktw-overflow-y-auto pktw-min-h-0 pktw-px-1">
```

Close this div after line 199 (before the sticky footer comment).

Change the footer div (line 202) from:
```tsx
<div className="pktw-sticky pktw-bottom-0 pktw-bg-white pktw-border-t pktw-border-[#e5e7eb] pktw-px-1 pktw-pt-3 pktw-pb-2 pktw-mt-auto">
```
To:
```tsx
<div className="pktw-flex-shrink-0 pktw-bg-white pktw-border-t pktw-border-[#e5e7eb] pktw-px-1 pktw-pt-3 pktw-pb-2">
```

This makes the content area scrollable independently while the footer stays fixed at the bottom — no more reliance on sticky positioning.

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: successful build

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/components/V2PlanReview.tsx
git commit -m "fix(ui): make plan review footer always visible with flex layout"
```

---

### Task 4: V2PlanReview — Inline Editing of Section Title & Brief

Enable users to click on a section's title or brief in the plan review to edit them in-place. The store already has `updatePlanSection` (`searchSessionStore.ts:588-590`).

**Files:**
- Modify: `src/ui/view/quick-search/components/V2PlanReview.tsx` (SectionCard component, lines 30-78)

- [ ] **Step 1: Add updatePlanSection to SectionCard props and wiring**

Add to the SectionCard props interface (around line 30):
```tsx
const SectionCard: React.FC<{
    sec: V2Section;
    index: number;
    total: number;
    onMove: (id: string, dir: -1 | 1) => void;
    onRemove: (id: string) => void;
    onUpdate: (id: string, updater: (s: V2Section) => V2Section) => void;
}> = ({ sec, index, total, onMove, onRemove, onUpdate }) => (
```

In the V2PlanReview component (line 80+), get the action from the store:
```tsx
const updatePlanSection = useSearchSessionStore((s) => s.updatePlanSection);
```

Pass it to SectionCard at line 164:
```tsx
<SectionCard
    key={sec.id}
    sec={sec}
    index={sections.indexOf(sec)}
    total={sections.length}
    onMove={moveSection}
    onRemove={removePlanSection}
    onUpdate={updatePlanSection}
/>
```

- [ ] **Step 2: Make title editable**

Replace the static title span (line 59):
```tsx
<span className="pktw-text-sm pktw-font-medium pktw-text-[#2e3338] pktw-block pktw-mb-0.5">{sec.title}</span>
```

With an editable span using `contentEditable`:
```tsx
<span
    className="pktw-text-sm pktw-font-medium pktw-text-[#2e3338] pktw-block pktw-mb-0.5 pktw-outline-none pktw-rounded pktw-px-0.5 pktw--mx-0.5 focus:pktw-ring-1 focus:pktw-ring-[#7c3aed]/40 focus:pktw-bg-white"
    contentEditable
    suppressContentEditableWarning
    onBlur={(e) => {
        const text = (e.target as HTMLSpanElement).textContent?.trim() || sec.title;
        if (text !== sec.title) onUpdate(sec.id, (s) => ({ ...s, title: text }));
    }}
    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); } }}
>
    {sec.title}
</span>
```

- [ ] **Step 3: Make brief editable**

Replace the static brief span (line 68):
```tsx
<span className="pktw-text-xs pktw-text-[#6b7280] pktw-leading-relaxed">{sec.brief}</span>
```

With:
```tsx
<span
    className="pktw-text-xs pktw-text-[#6b7280] pktw-leading-relaxed pktw-outline-none pktw-rounded pktw-px-0.5 pktw--mx-0.5 focus:pktw-ring-1 focus:pktw-ring-[#7c3aed]/40 focus:pktw-bg-white"
    contentEditable
    suppressContentEditableWarning
    onBlur={(e) => {
        const text = (e.target as HTMLSpanElement).textContent?.trim() || sec.brief;
        if (text !== sec.brief) onUpdate(sec.id, (s) => ({ ...s, brief: text }));
    }}
    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.target as HTMLElement).blur(); } }}
>
    {sec.brief}
</span>
```

The edit UX: click to focus → shows subtle purple ring → edit text → blur or Enter to save → store updates immediately.

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: successful build

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/quick-search/components/V2PlanReview.tsx
git commit -m "feat(ui): inline editing for plan section title and brief"
```

---

### Task 5: Also check for other missing template registrations

While fixing `ai-analysis-report-section-system` and `ai-analysis-report-visual-system`, we should verify no other PromptIds are missing from TemplateRegistry.

**Files:**
- Read: `src/service/prompt/PromptId.ts` (all PromptId values)
- Read: `src/core/template/TemplateRegistry.ts` (all registered keys)

- [ ] **Step 1: Cross-reference PromptId enum values against TemplateRegistry entries**

Extract all string values from the PromptId enum. For each one, verify it exists as a key in `TEMPLATE_REGISTRY`. Report any gaps.

- [ ] **Step 2: Fix any additional missing registrations**

If gaps found, add the missing entries following the same pattern as Tasks 1's fix.

- [ ] **Step 3: Build and commit**

```bash
npm run build
git add src/core/template/TemplateRegistry.ts
git commit -m "fix(templates): register all missing PromptId entries in TemplateRegistry"
```
