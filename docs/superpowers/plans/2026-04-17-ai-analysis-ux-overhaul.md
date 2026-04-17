# AI Analysis UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix report rendering quality, add V2 persistence, implement continue-append mode with annotations, improve Sources tab, and add search page quick actions.

**Architecture:** Six-phase overhaul. Phase ① fixes prompt constraints + CSS for report quality. Phase ② extends `AiSearchAnalysisDoc` to persist V2 session data (steps, plan, sections, sources, graph JSON) into a single markdown file with callout sections. Phase ③ adds a round-based continue model where each continuation appends a new `Round` instead of resetting, powered by `ContinueAnalysisAgent`. Phase ④ replaces the mermaid mindmap in Sources tab with `MultiLensGraph` topology lens. Phase ⑤ is covered by existing plan `2026-04-15-ai-graph-multi-lens.md`. Phase ⑥ adds configurable preset queries and history-based suggestions to the search page.

**Tech Stack:** React 18, Zustand, @xyflow/react (existing), Vercel AI SDK `streamText`, existing Agent/Tool patterns, Obsidian CSS variables, StreamdownIsolated shadow DOM rendering.

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `templates/prompts/ai-analysis-continue-system.md` | System prompt for ContinueAnalysisAgent — continue-specific instructions |
| `templates/prompts/ai-analysis-continue.md` | User prompt template for continue — injects previous rounds context |
| `templates/prompts/ai-analysis-synthesize-system.md` | System prompt for SynthesizeAgent — merge all rounds into one |
| `templates/prompts/ai-analysis-synthesize.md` | User prompt template for synthesize |
| `templates/config/default-analysis-queries.json` | Preset analysis queries (user-editable) |
| `src/service/agents/ContinueAnalysisAgent.ts` | Agent class — vault tools + previous context → new plan |
| `src/service/agents/SynthesizeAgent.ts` | Agent class — pure text merge, no vault tools |
| `test/search-docs/fixtures/v2-roundtrip.md` | Test fixture for V2 persistence round-trip |

### Modified Files

| File | What Changes |
|------|-------------|
| `templates/prompts/ai-analysis-report-section-system.md` | Add table/bold/heading/TOC/link format constraints (Phase ①) |
| `src/styles/streamdown-shadow-host.css:67-84` | Fix table width, borders, paragraphs, wikilink colors (Phase ①) |
| `src/core/storage/vault/search-docs/AiSearchAnalysisDoc.ts:65-111,685-905,947-998` | Add V2 fields to model, new `buildMarkdownV2()` format, V2 snapshot converter (Phase ②) |
| `src/ui/view/quick-search/store/searchSessionStore.ts:36-41,95-124,301-342` | Add `rounds: Round[]`, `currentRoundIndex`, continue-mode actions (Phase ③) |
| `src/ui/view/quick-search/types/search-steps.ts:164-187` | Add `Round`, `Annotation` interfaces (Phase ③) |
| `src/ui/view/quick-search/hooks/useSearchSession.ts:870-1056` | Add continue-mode branch in `performAnalysis` (Phase ③) |
| `src/ui/view/quick-search/hooks/useAIAnalysisResult.ts:89-188` | V2 auto-save path using V2 snapshot data (Phase ②) |
| `src/ui/view/quick-search/callbacks/save-ai-analyze-to-md.ts:47-107` | V2 save path using new markdown format (Phase ②) |
| `src/ui/view/quick-search/components/V2ReportView.tsx:143-219` | Round separators, Synthesize All button (Phase ③) |
| `src/ui/view/quick-search/components/V2SourcesView.tsx:1-144` | Grouped list + React Flow topology lens (Phase ④) |
| `src/ui/view/quick-search/components/V2ContinueAnalysisInput.tsx:11-30` | Wire continue-append mode instead of full reset (Phase ③) |
| `src/ui/view/quick-search/tab-AISearch.tsx:55-141,471-489` | Continue handler → append mode, V2Footer Synthesize button (Phase ③) |
| `src/ui/view/quick-search/SearchModal.tsx:69-252` | Quick action chips below input (Phase ⑥) |
| `src/service/prompt/PromptId.ts:33+` | Add `AiAnalysisContinueSystem`, `AiAnalysisContinue`, `AiAnalysisSynthesizeSystem`, `AiAnalysisSynthesize` (Phase ③) |
| `src/core/template/TemplateRegistry.ts:124-305` | Register 4 new prompt templates (Phase ③) |

### Dependency Graph

```
Phase ①: Task 1 ─┬─ Task 2 ─── Task 3   (all independent within phase)
                  │
Phase ②: Task 4 → Task 5 → Task 6        (sequential: model → save → graph)
                  │
Phase ③: Task 7 → Task 8 → Task 9 → Task 10 → Task 11 → Task 12
                  (model → agent → wiring → UI → annotations → synthesize)
                  │
Phase ④: Task 13 ── Task 14              (independent within phase; Task 14 needs MultiLensGraph from Phase ⑤ plan)
                  │
Phase ⑥: Task 15 ── Task 16              (independent within phase)
```

Cross-phase: Phase ② depends on Phase ① (prompt quality affects saved content). Phase ③ depends on Phase ② (rounds must persist). Phase ④ Task 14 depends on Phase ⑤ plan's MultiLensGraph component.

---

## Phase ①: Report Rendering Quality

### Task 1: Add Prompt Format Constraints

**Files:**
- Modify: `templates/prompts/ai-analysis-report-section-system.md` (full file, 62 lines)

- [ ] **Step 1: Read the current section system prompt**

Read `templates/prompts/ai-analysis-report-section-system.md` to understand existing constraints.

- [ ] **Step 2: Add format constraint block**

Append after the existing `MARKDOWN` section (after line 62):

```markdown
## FORMAT CONSTRAINTS (MANDATORY)

### Tables
- Use standard markdown tables only
- Maximum 5 columns per table
- Always include header row with `---` separator
- Never generate half-width or CSS-styled tables

### Emphasis
- **Bold** key conclusions, data metrics, product names, and entity names
- Use `**bold**` syntax, never HTML `<b>` or `<strong>`

### Headings
- Use ONLY `###` and `####` within sections
- NEVER use `#` or `##` (reserved for report structure)

### Navigation
- NEVER generate Table of Contents, `[toc]`, or navigation links
- NEVER generate `[Back to top]` or similar anchor links

### Links
- Reference vault files using `[[wikilink]]` or `[[path|display text]]` syntax
- NEVER use `[text](url)` for vault internal files
- External URLs may use standard markdown link syntax

### Lists
- Ordered lists: `1. 2. 3.` (for sequences, rankings, steps)
- Unordered lists: `- ` (for non-ordered items)
- Never mix ordered and unordered in the same list block

### Forbidden
- NO HTML tags or inline styles (`<div>`, `<span>`, `style="..."`)
- NO `<br>` — use blank lines for spacing
- NO emoji as structural markers (bullets, headers)
```

- [ ] **Step 3: Verify prompt loads correctly**

Run: `npm run build`
Expected: Build succeeds. The prompt is a Handlebars template loaded at runtime — build success confirms no syntax errors in surrounding code.

- [ ] **Step 4: Commit**

```bash
git add templates/prompts/ai-analysis-report-section-system.md
git commit -m "feat(report): add format constraints to section system prompt"
```

---

### Task 2: CSS Rendering Fixes for StreamdownIsolated

**Files:**
- Modify: `src/styles/streamdown-shadow-host.css:67-84` (table section)
- Modify: `src/styles/streamdown-shadow-host.css:116-137` (wikilink section)

- [ ] **Step 1: Read current CSS**

Read `src/styles/streamdown-shadow-host.css` lines 1–160 to understand existing styles.

- [ ] **Step 2: Fix table styles**

Replace the table styling block (around lines 67–84) to enforce full-width tables with consistent borders:

```css
/* ── Tables ── */
[data-streamdown="table-wrapper"] {
  overflow-x: auto;
  overflow-y: hidden;
  border-radius: 6px;
  border: 1px solid hsl(var(--border));
  margin: 0.75em 0;
  width: 100%;
}

[data-streamdown="table"] {
  width: 100%;
  border-collapse: collapse;
}

[data-streamdown="table"] th,
[data-streamdown="table"] td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid hsl(var(--border));
}

[data-streamdown="table"] th {
  font-weight: 600;
  background: hsl(var(--muted));
}

[data-streamdown="table"] tr:nth-child(even) td {
  background: hsl(var(--muted) / 0.3);
}

[data-streamdown="table-header"] {
  background: linear-gradient(to bottom, hsl(var(--muted)), hsl(var(--border) / 0.5));
  padding: 4px 8px;
  font-size: 0.75rem;
  border-bottom: 1px solid hsl(var(--border));
}
```

- [ ] **Step 3: Fix paragraph spacing**

Add after the table section:

```css
/* ── Paragraphs ── */
[data-streamdown-root] p {
  margin-bottom: 0.75em;
  line-height: 1.65;
}

/* ── Block-level width ── */
[data-streamdown-root] table,
[data-streamdown-root] pre,
[data-streamdown-root] blockquote,
[data-streamdown-root] .math-display {
  max-width: 100%;
}
```

- [ ] **Step 4: Filter TOC markers**

Add a CSS rule to hide any `[toc]` artifacts that slip through:

```css
/* ── TOC filter ── */
[data-streamdown-root] a[href="#toc"],
[data-streamdown-root] a[href="#table-of-contents"] {
  display: none;
}
```

- [ ] **Step 5: Rebuild CSS bundle**

Run: `npm run build`
Expected: Build succeeds. The `scripts/concat-css.mjs` script picks up changes from `streamdown-shadow-host.css` and regenerates `src/styles/streamdown-isolated-css.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/styles/streamdown-shadow-host.css
git commit -m "fix(streamdown): table full-width, paragraph spacing, TOC filter"
```

---

### Task 3: Theme Color Unification

**Files:**
- Modify: `src/styles/streamdown-shadow-host.css:116-137` (wikilink colors)

- [ ] **Step 1: Replace hardcoded wikilink colors**

The current wikilink styles at lines 116–137 use hardcoded hex `#2563eb` and `#982598`. Replace with Obsidian CSS variable references:

```css
/* ── Wikilinks ── */
a[href^="#peak-wikilink="] {
  color: var(--text-accent, hsl(var(--primary)));
  text-decoration: none;
  cursor: pointer;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s, color 0.15s;
}

a[href^="#peak-wikilink="]:hover {
  color: var(--text-accent-hover, hsl(var(--primary)));
  border-bottom-color: currentColor;
}
```

Note: `var(--text-accent)` and `var(--text-accent-hover)` are standard Obsidian CSS variables available on `document.body`. Inside the shadow DOM, they need to be inherited from the host. The `:host` block (lines 7–40) already sets `color` from `hsl(var(--foreground))`, so we also need to inject the Obsidian accent color.

- [ ] **Step 2: Inject Obsidian accent colors into :host**

In the `:host` block (around line 7), add:

```css
--obsidian-text-accent: var(--text-accent, #2563eb);
--obsidian-text-accent-hover: var(--text-accent-hover, #1d4ed8);
```

Then use these in the wikilink rules:

```css
a[href^="#peak-wikilink="] {
  color: var(--obsidian-text-accent);
  /* ... rest unchanged */
}
a[href^="#peak-wikilink="]:hover {
  color: var(--obsidian-text-accent-hover);
  /* ... rest unchanged */
}
```

- [ ] **Step 3: Rebuild and verify**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/styles/streamdown-shadow-host.css
git commit -m "fix(streamdown): use Obsidian CSS variables for wikilink colors"
```

---

## Phase ②: V2 Persistence

### Task 4: Extend AiSearchAnalysisDocModel for V2 Data

**Files:**
- Modify: `src/core/storage/vault/search-docs/AiSearchAnalysisDoc.ts:65-111` (model interface)
- Modify: `src/core/storage/vault/search-docs/AiSearchAnalysisDoc.ts:685-905` (`buildMarkdown`)
- Modify: `src/core/storage/vault/search-docs/AiSearchAnalysisDoc.ts:261-601` (`parse`)
- Test: `test/search-docs/AiSearchAnalysisDoc.test.ts`
- Create: `test/search-docs/fixtures/v2-roundtrip.md`

- [ ] **Step 1: Write the failing round-trip test**

Create `test/search-docs/fixtures/v2-roundtrip.md`:

```markdown
---
type: ai-search-result
version: 1
created: '2026-04-17T14:30:00.000Z'
title: Test V2 Analysis
query: 分析知识库结构
webEnabled: false
runAnalysisMode: vaultFull
duration: 45000
estimatedTokens: 20500
---

## Summary

这是一段测试摘要。

## Query

分析知识库结构

> [!abstract]- Process Log
> - 🔍 Browsing vault structure — 4.3s
> - 📖 Reading B-2-创意和想法管理 — 8.1s
> - 🔎 Searching "知识库 结构" — 3.2s

> [!note]- Analysis Plan
> ### 1. 结构分析
> **Brief**: 梳理知识库目录结构
> **Sources**: [[B-2-创意和想法管理]]
>
> ### 2. 主题聚类
> **Brief**: 按主题对笔记分组
> **Sources**: [[A-All-Ideas]]

## 1. 结构分析

知识库包含 **82 个笔记**，分布在 5 个主要目录中。

| 目录 | 笔记数 | 说明 |
|------|--------|------|
| kb1-life-notes | 34 | 生活笔记 |
| kb2-tech | 28 | 技术笔记 |

## 2. 主题聚类

笔记按主题可分为 **3 个大类**。

## Sources

- [[kb1-life-notes/CA-WHOAMI/B-想做的事情|B-想做的事情]] (score: 0.95)
- [[kb2-tech/A-架构设计|A-架构设计]] (score: 0.82)

> [!tip]- Graph Data
> ```json
> {"lenses":{"topology":{"nodes":[{"id":"n1","label":"B-想做的事情","path":"kb1-life-notes/CA-WHOAMI/B-想做的事情"}],"edges":[]}},"generatedAt":"2026-04-17T14:30:00"}
> ```

> [!question] Follow-up Questions
> - 哪些笔记之间有隐含关联？
> - 最近一个月新增了哪些主题？
```

Add a test in `test/search-docs/AiSearchAnalysisDoc.test.ts`:

```typescript
function testV2Roundtrip(): boolean {
  console.log('\n=== Test: V2 format round-trip ===');
  try {
    const md = readTestFile('v2-roundtrip.md');
    const parsed = parse(md);

    // V2-specific fields
    if (!parsed.v2ProcessLog) throw new Error('v2ProcessLog not parsed');
    if (parsed.v2ProcessLog.length !== 3) throw new Error(`v2ProcessLog.length: ${parsed.v2ProcessLog.length}, expected 3`);
    if (!parsed.v2PlanOutline) throw new Error('v2PlanOutline not parsed');
    if (!parsed.v2ReportSections || parsed.v2ReportSections.length !== 2) throw new Error('v2ReportSections not parsed');
    if (parsed.v2ReportSections[0].title !== '结构分析') throw new Error(`section title: ${parsed.v2ReportSections[0].title}`);
    if (!parsed.v2GraphJson) throw new Error('v2GraphJson not parsed');
    if (!parsed.v2FollowUpQuestions || parsed.v2FollowUpQuestions.length !== 2) throw new Error('v2FollowUpQuestions not parsed');

    // Rebuild and verify structure preserved
    const rebuilt = buildMarkdown(parsed, { runAnalysisMode: 'vaultFull' });
    if (!rebuilt.includes('Process Log')) throw new Error('rebuilt missing Process Log');
    if (!rebuilt.includes('Analysis Plan')) throw new Error('rebuilt missing Analysis Plan');
    if (!rebuilt.includes('## 1. 结构分析')) throw new Error('rebuilt missing section heading');
    if (!rebuilt.includes('Graph Data')) throw new Error('rebuilt missing Graph Data');
    if (!rebuilt.includes('Follow-up Questions')) throw new Error('rebuilt missing Follow-up Questions');

    console.log('  ✅ V2 round-trip passed');
    return true;
  } catch (e) {
    console.error(`  ❌ V2 round-trip FAILED: ${e}`);
    return false;
  }
}
```

Add `testV2Roundtrip()` to the test runner at the bottom of the file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- test/search-docs/AiSearchAnalysisDoc.test.ts`
Expected: FAIL — `v2ProcessLog not parsed` (fields don't exist yet on the model).

- [ ] **Step 3: Add V2 fields to AiSearchAnalysisDocModel**

In `src/core/storage/vault/search-docs/AiSearchAnalysisDoc.ts`, extend the `AiSearchAnalysisDocModel` interface (around line 65):

```typescript
// V2 fields (SDK pipeline)
v2ProcessLog?: string[];            // Process Log callout lines
v2PlanOutline?: string;             // Analysis Plan callout raw text
v2ReportSections?: Array<{          // Numbered report sections
  title: string;
  content: string;
}>;
v2GraphJson?: string;               // Graph Data callout JSON string
v2FollowUpQuestions?: string[];     // Follow-up Questions
```

- [ ] **Step 4: Implement V2 parsing in `parse()`**

In the `parse()` function (starts at line 261), add parsers for V2 callout blocks. After parsing the body into sections, detect callout blocks by their `> [!type]-` prefix pattern:

```typescript
// ── V2 Callout Parsing ──
function parseCallout(body: string, type: string): string | null {
  const regex = new RegExp(`> \\[!${type}\\][- ].*\\n((?:>.*\\n?)*)`, 'i');
  const match = body.match(regex);
  if (!match) return null;
  return match[1].replace(/^> ?/gm, '').trim();
}

// Process Log
const processLogRaw = parseCallout(body, 'abstract');
if (processLogRaw) {
  result.v2ProcessLog = processLogRaw
    .split('\n')
    .map(l => l.replace(/^- /, '').trim())
    .filter(Boolean);
}

// Analysis Plan
const planRaw = parseCallout(body, 'note');
if (planRaw) {
  result.v2PlanOutline = planRaw;
}

// Graph Data
const graphRaw = parseCallout(body, 'tip');
if (graphRaw) {
  const jsonMatch = graphRaw.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) result.v2GraphJson = jsonMatch[1].trim();
}

// Follow-up Questions (non-collapsed callout)
const followUpRaw = parseCallout(body, 'question');
if (followUpRaw) {
  result.v2FollowUpQuestions = followUpRaw
    .split('\n')
    .map(l => l.replace(/^- /, '').trim())
    .filter(Boolean);
}

// V2 Report Sections: numbered headings (## N. Title) between callouts
const sectionRegex = /^## (\d+)\. (.+)\n([\s\S]*?)(?=\n## \d+\.|^> \[!|$)/gm;
const sections: Array<{ title: string; content: string }> = [];
let sMatch;
while ((sMatch = sectionRegex.exec(body)) !== null) {
  sections.push({ title: sMatch[2].trim(), content: sMatch[3].trim() });
}
if (sections.length > 0) result.v2ReportSections = sections;
```

- [ ] **Step 5: Implement V2 markdown building in `buildMarkdown()`**

In the `buildMarkdown()` function (starts at line 685), add a V2 rendering path. After the frontmatter and Summary/Query sections, detect if V2 fields are present and render accordingly:

```typescript
// ── V2 Format ──
const hasV2 = !!(docModel.v2ProcessLog || docModel.v2PlanOutline || docModel.v2ReportSections);

if (hasV2) {
  // Process Log callout
  if (docModel.v2ProcessLog?.length) {
    lines.push('');
    lines.push('> [!abstract]- Process Log');
    for (const entry of docModel.v2ProcessLog) {
      lines.push(`> - ${entry}`);
    }
  }

  // Analysis Plan callout
  if (docModel.v2PlanOutline) {
    lines.push('');
    lines.push('> [!note]- Analysis Plan');
    for (const line of docModel.v2PlanOutline.split('\n')) {
      lines.push(`> ${line}`);
    }
  }

  // Report sections
  if (docModel.v2ReportSections?.length) {
    for (let i = 0; i < docModel.v2ReportSections.length; i++) {
      const sec = docModel.v2ReportSections[i];
      lines.push('');
      lines.push(`## ${i + 1}. ${sec.title}`);
      lines.push('');
      lines.push(sec.content);
    }
  }
}

// Sources section (always)
// ... existing sources rendering ...

if (hasV2) {
  // Graph Data callout
  if (docModel.v2GraphJson) {
    lines.push('');
    lines.push('> [!tip]- Graph Data');
    lines.push('> ```json');
    lines.push(`> ${docModel.v2GraphJson}`);
    lines.push('> ```');
  }

  // Follow-up Questions callout (non-collapsed)
  if (docModel.v2FollowUpQuestions?.length) {
    lines.push('');
    lines.push('> [!question] Follow-up Questions');
    for (const q of docModel.v2FollowUpQuestions) {
      lines.push(`> - ${q}`);
    }
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm run test -- test/search-docs/AiSearchAnalysisDoc.test.ts`
Expected: PASS — V2 round-trip test passes. Existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add src/core/storage/vault/search-docs/AiSearchAnalysisDoc.ts test/search-docs/AiSearchAnalysisDoc.test.ts test/search-docs/fixtures/v2-roundtrip.md
git commit -m "feat(persistence): add V2 callout format to AiSearchAnalysisDoc parse/build"
```

---

### Task 5: V2 Auto-Save Integration

**Files:**
- Modify: `src/core/storage/vault/search-docs/AiSearchAnalysisDoc.ts:947-998` (`fromCompletedAnalysisSnapshot`)
- Modify: `src/ui/view/quick-search/hooks/useAIAnalysisResult.ts:89-188` (auto-save hook)
- Modify: `src/ui/view/quick-search/store/searchSessionStore.ts` (V2 snapshot builder)

- [ ] **Step 1: Add V2 snapshot builder to searchSessionStore**

In `src/ui/view/quick-search/store/searchSessionStore.ts`, add a new exported function after `INITIAL_STATE`:

```typescript
export function buildV2AnalysisSnapshot(): {
  v2ProcessLog: string[];
  v2PlanOutline: string | null;
  v2ReportSections: Array<{ title: string; content: string }>;
  v2Sources: V2Source[];
  v2FollowUpQuestions: string[];
  v2Summary: string;
  v2GraphJson: string | null;
  usage: LLMUsage | null;
  duration: number | null;
} | null {
  const s = useSearchSessionStore.getState();
  if (!s.v2Active) return null;

  const processLog = s.v2Steps
    .filter(st => st.status === 'done')
    .map(st => {
      const icon = st.toolName.includes('read_note') ? '📖'
        : st.toolName.includes('grep') ? '🔎'
        : st.toolName.includes('list_folders') ? '🔍'
        : '🔧';
      const dur = st.endedAt && st.startedAt
        ? `${((st.endedAt - st.startedAt) / 1000).toFixed(1)}s`
        : '';
      return `${icon} ${st.displayName}${st.summary ? ' — ' + st.summary : ''} ${dur ? '— ' + dur : ''}`.trim();
    });

  const sections = s.v2PlanSections
    .filter(sec => sec.status === 'done' && sec.content)
    .map(sec => ({ title: sec.title, content: sec.content }));

  return {
    v2ProcessLog: processLog,
    v2PlanOutline: s.v2ProposedOutline,
    v2ReportSections: sections,
    v2Sources: s.v2Sources,
    v2FollowUpQuestions: s.v2FollowUpQuestions,
    v2Summary: s.v2Summary,
    v2GraphJson: null,  // filled by Phase ⑤ graph persistence
    usage: s.usage,
    duration: s.duration,
  };
}
```

- [ ] **Step 2: Extend `fromCompletedAnalysisSnapshot` for V2**

In `AiSearchAnalysisDoc.ts`, in the `fromCompletedAnalysisSnapshot` function (around line 947), add V2 field mapping:

```typescript
// After existing field mappings, add:
v2ProcessLog: snapshot.v2ProcessLog ?? undefined,
v2PlanOutline: snapshot.v2PlanOutline ?? undefined,
v2ReportSections: snapshot.v2ReportSections ?? undefined,
v2GraphJson: snapshot.v2GraphJson ?? undefined,
v2FollowUpQuestions: snapshot.v2FollowUpQuestions ?? undefined,
```

Also extend `CompletedAnalysisSnapshot` type (in `aiAnalysisStore.ts` around line 97) with these optional V2 fields.

- [ ] **Step 3: Wire V2 data into auto-save**

In `src/ui/view/quick-search/hooks/useAIAnalysisResult.ts`, modify `handleAutoSave` (around line 97):

```typescript
// After: const snapshot = buildCompletedAnalysisSnapshot();
// Add V2 data merge:
const v2Snapshot = buildV2AnalysisSnapshot();
if (v2Snapshot) {
  Object.assign(snapshot, {
    v2ProcessLog: v2Snapshot.v2ProcessLog,
    v2PlanOutline: v2Snapshot.v2PlanOutline,
    v2ReportSections: v2Snapshot.v2ReportSections,
    v2FollowUpQuestions: v2Snapshot.v2FollowUpQuestions,
    v2GraphJson: v2Snapshot.v2GraphJson,
    // Use V2 summary if available, otherwise keep V1
    summary: v2Snapshot.v2Summary || snapshot.summary,
  });
}
```

- [ ] **Step 4: Test auto-save manually**

In Obsidian with DevTools:
1. Run an AI Analysis query
2. Wait for completion
3. Check the auto-saved markdown file in `ChatFolder/AI-Analysis/`
4. Verify it contains `> [!abstract]- Process Log`, `> [!note]- Analysis Plan`, numbered `## N. Title` sections, and `> [!question] Follow-up Questions`

- [ ] **Step 5: Commit**

```bash
git add src/core/storage/vault/search-docs/AiSearchAnalysisDoc.ts src/ui/view/quick-search/store/searchSessionStore.ts src/ui/view/quick-search/hooks/useAIAnalysisResult.ts
git commit -m "feat(persistence): wire V2 session data into auto-save pipeline"
```

---

### Task 6: Graph JSON Callout Persistence

**Files:**
- Modify: `src/ui/view/quick-search/store/searchSessionStore.ts` (export graph JSON)
- Modify: `src/ui/view/quick-search/hooks/useAIAnalysisResult.ts` (include graph in snapshot)
- Modify: `src/ui/view/quick-search/store/aiGraphStore.ts` (export method)

- [ ] **Step 1: Add graph JSON export to aiGraphStore**

In `src/ui/view/quick-search/store/aiGraphStore.ts`, add an export function:

```typescript
export function exportGraphJson(): string | null {
  const { graphData, activeLens } = useAIGraphStore.getState();
  if (!graphData) return null;
  return JSON.stringify({
    lenses: { [activeLens]: graphData },
    generatedAt: new Date().toISOString(),
  });
}
```

- [ ] **Step 2: Wire into V2 snapshot builder**

In `buildV2AnalysisSnapshot()` (from Task 5), replace the `v2GraphJson: null` line:

```typescript
v2GraphJson: exportGraphJson(),
```

Import `exportGraphJson` from `aiGraphStore`.

- [ ] **Step 3: Verify graph persists in markdown**

In Obsidian:
1. Run AI Analysis → wait for graph to generate
2. Check saved markdown → confirm `> [!tip]- Graph Data` callout contains valid JSON with `lenses.topology.nodes[]`

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/store/aiGraphStore.ts src/ui/view/quick-search/store/searchSessionStore.ts
git commit -m "feat(persistence): persist graph JSON in callout for session restore"
```

---

## Phase ③: Continue Append Mode

### Task 7: Round Data Model and Store Changes

**Files:**
- Modify: `src/ui/view/quick-search/types/search-steps.ts:164+` (add Round, Annotation types)
- Modify: `src/ui/view/quick-search/store/searchSessionStore.ts:95-124,301-342` (add rounds state + actions)

- [ ] **Step 1: Define Round and Annotation interfaces**

In `src/ui/view/quick-search/types/search-steps.ts`, add after the V2 types (after line 187):

```typescript
export interface Annotation {
  id: string;
  roundIndex: number;
  sectionIndex: number;
  selectedText?: string;
  comment: string;
  type: 'question' | 'disagree' | 'expand' | 'note';
  createdAt: number;
}

export interface Round {
  index: number;
  query: string;
  sections: V2Section[];
  summary: string;
  summaryStreaming: boolean;
  sources: V2Source[];
  steps: V2ToolStep[];
  timeline: V2TimelineItem[];
  followUpQuestions: string[];
  proposedOutline: string | null;
  annotations: Annotation[];
}
```

- [ ] **Step 2: Add round state to searchSessionStore**

In `src/ui/view/quick-search/store/searchSessionStore.ts`, add to the state interface (around line 95):

```typescript
// Round-based state
rounds: Round[];
currentRoundIndex: number;
```

Add to `INITIAL_STATE` (around line 241):

```typescript
rounds: [],
currentRoundIndex: 0,
```

- [ ] **Step 3: Add round management actions**

Add actions to the store:

```typescript
// Freeze current V2 state into a Round and push to rounds[]
freezeCurrentRound: () => set((s) => {
  if (!s.v2Active) return s;
  const round: Round = {
    index: s.currentRoundIndex,
    query: s.query,
    sections: [...s.v2PlanSections],
    summary: s.v2Summary,
    summaryStreaming: false,
    sources: [...s.v2Sources],
    steps: [...s.v2Steps],
    timeline: [...s.v2Timeline],
    followUpQuestions: [...s.v2FollowUpQuestions],
    proposedOutline: s.v2ProposedOutline,
    annotations: [],
  };
  return {
    rounds: [...s.rounds, round],
    currentRoundIndex: s.currentRoundIndex + 1,
  };
}),

// Start a continue round — resets V2 streaming state but preserves rounds + accumulated sources
startContinueRound: (followUpQuery: string) => set((s) => ({
  query: followUpQuery,
  status: 'starting',
  hasStartedStreaming: false,
  v2Steps: [],
  v2Timeline: [],
  v2ReportChunks: [],
  v2ReportComplete: false,
  v2PlanSections: [],
  v2PlanApproved: false,
  v2ProposedOutline: null,
  v2Summary: '',
  v2SummaryStreaming: false,
  v2FollowUpQuestions: [],
  v2View: 'process',
  // Preserve: rounds, currentRoundIndex, v2Active, v2Sources (accumulate)
})),

// Get all sections flattened across all rounds + current
getAllSections: (): V2Section[] => {
  const s = useSearchSessionStore.getState();
  const fromRounds = s.rounds.flatMap(r => r.sections);
  return [...fromRounds, ...s.v2PlanSections];
},

// Get all sources deduplicated
getAllSources: (): V2Source[] => {
  const s = useSearchSessionStore.getState();
  const seen = new Set<string>();
  const result: V2Source[] = [];
  for (const src of [...s.rounds.flatMap(r => r.sources), ...s.v2Sources]) {
    if (!seen.has(src.path)) {
      seen.add(src.path);
      result.push(src);
    }
  }
  return result;
},

// Add annotation to a round
addAnnotation: (annotation: Annotation) => set((s) => {
  const rounds = [...s.rounds];
  if (annotation.roundIndex < rounds.length) {
    rounds[annotation.roundIndex] = {
      ...rounds[annotation.roundIndex],
      annotations: [...rounds[annotation.roundIndex].annotations, annotation],
    };
  }
  return { rounds };
}),
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/types/search-steps.ts src/ui/view/quick-search/store/searchSessionStore.ts
git commit -m "feat(continue): add Round/Annotation types and round management actions"
```

---

### Task 8: ContinueAnalysisAgent and Prompts

**Files:**
- Create: `templates/prompts/ai-analysis-continue-system.md`
- Create: `templates/prompts/ai-analysis-continue.md`
- Create: `src/service/agents/ContinueAnalysisAgent.ts`
- Modify: `src/service/prompt/PromptId.ts:33+`
- Modify: `src/core/template/TemplateRegistry.ts:124-305`

- [ ] **Step 1: Register new prompt IDs**

In `src/service/prompt/PromptId.ts`, add to the enum:

```typescript
AiAnalysisContinueSystem = 'ai-analysis-continue-system',
AiAnalysisContinue = 'ai-analysis-continue',
AiAnalysisSynthesizeSystem = 'ai-analysis-synthesize-system',
AiAnalysisSynthesize = 'ai-analysis-synthesize',
```

- [ ] **Step 2: Register templates**

In `src/core/template/TemplateRegistry.ts`, add entries to `TEMPLATE_METADATA` (around the existing vault analysis entries near line 210):

```typescript
[PromptId.AiAnalysisContinueSystem]: meta('ai-analysis', 'ai-analysis-continue-system'),
[PromptId.AiAnalysisContinue]: meta('ai-analysis', 'ai-analysis-continue'),
[PromptId.AiAnalysisSynthesizeSystem]: meta('ai-analysis', 'ai-analysis-synthesize-system'),
[PromptId.AiAnalysisSynthesize]: meta('ai-analysis', 'ai-analysis-synthesize'),
```

- [ ] **Step 3: Create continue system prompt**

Create `templates/prompts/ai-analysis-continue-system.md`:

```markdown
You are a research analyst CONTINUING an existing vault analysis.

You have access to the user's Obsidian vault via these tools:
- `vault_read_note(path)` — read a note's full content
- `vault_grep(query)` — search vault for text matches
- `vault_list_folders(path?)` — browse vault structure
- `vault_submit_plan(plan)` — submit your analysis plan for new sections

## Context

You are given:
1. The original analysis query and all previous rounds of analysis
2. The user's follow-up question or request
3. User annotations (inline feedback on specific sections)

## Your Task

1. **Understand the follow-up**: What new information or perspective does the user want?
2. **Identify gaps**: What wasn't covered in previous rounds that the follow-up requires?
3. **Explore the vault**: Use tools to find NEW evidence relevant to the follow-up
4. **Submit a plan**: Call `vault_submit_plan` with NEW sections that address the follow-up

## Rules

- Do NOT repeat content from previous rounds — reference it as "As discussed in Round N"
- Focus on NEW insights, evidence, and analysis
- If the user annotated a section with [disagree], address their objection with evidence
- If annotated with [expand], go deeper on that specific subtopic
- If annotated with [question], answer the question with vault evidence
- Keep section count between 1–4 (focused, not exhaustive)
- Submit plan sections using the same schema as the original analysis

## FORMAT CONSTRAINTS (MANDATORY)

Follow the exact same format rules as the original analysis:
- Tables: standard markdown, ≤ 5 columns
- Bold: key conclusions, metrics, names
- Headings: only `###` and `####`
- Links: `[[wikilink]]` syntax for vault files
- Language: match the user's query language (CRITICAL)
- No TOC, no HTML, no inline styles
```

- [ ] **Step 4: Create continue user prompt template**

Create `templates/prompts/ai-analysis-continue.md`:

```markdown
## Previous Analysis

**Original Query:** {{{originalQuery}}}

{{#each rounds}}
### Round {{add @index 1}}: {{{this.query}}}

**Summary:** {{{this.summary}}}

{{#each this.sections}}
#### {{{this.title}}}
{{{this.content}}}
{{/each}}

{{#if this.annotations.length}}
**User Annotations:**
{{#each this.annotations}}
- Section "{{{this.sectionTitle}}}"{{#if this.selectedText}} | "{{{this.selectedText}}}"{{/if}} | [{{this.type}}]: "{{{this.comment}}}"
{{/each}}
{{/if}}
{{/each}}

## Sources Used So Far

{{#each sources}}
- [[{{{this.path}}}]] — {{{this.relevance}}}
{{/each}}

{{#if graphSummary}}
## Key Relationships

{{#each graphSummary.keyRelationships}}
- {{{this}}}
{{/each}}
{{/if}}

---

## Follow-up Request

{{{followUpQuery}}}
```

- [ ] **Step 5: Create ContinueAnalysisAgent**

Create `src/service/agents/ContinueAnalysisAgent.ts`:

```typescript
import { VaultSearchAgentSdkOptions } from './VaultSearchAgentSDK';
import { PromptId } from '@/service/prompt/PromptId';
import { PromptService } from '@/service/prompt/PromptService';
import { AppContext } from '@/app/AppContext';
import type { LLMStreamEvent } from '@/core/providers/types';
import type { Round, V2Source } from '@/ui/view/quick-search/types/search-steps';

export interface ContinueContext {
  originalQuery: string;
  rounds: {
    query: string;
    summary: string;
    sections: { title: string; content: string }[];
    annotations: { sectionTitle: string; selectedText?: string; comment: string; type: string }[];
  }[];
  sources: { path: string; relevance: string }[];
  graphSummary: {
    nodeCount: number;
    keyRelationships: string[];
  } | null;
  followUpQuery: string;
}

const MAX_CONTEXT_TOKENS = 30_000;

export class ContinueAnalysisAgent {
  constructor(private readonly options: VaultSearchAgentSdkOptions) {}

  async *startSession(ctx: ContinueContext): AsyncGenerator<LLMStreamEvent> {
    const promptService = AppContext.getInstance().promptService;

    // Build context — truncate if too large
    const contextText = await promptService.render(PromptId.AiAnalysisContinue, {
      originalQuery: ctx.originalQuery,
      rounds: ctx.rounds.map(r => ({
        ...r,
        // Truncate section content if total context is too large
        sections: r.sections.map(s => ({
          title: s.title,
          content: this.maybeTruncate(s.content),
        })),
      })),
      sources: ctx.sources,
      graphSummary: ctx.graphSummary,
      followUpQuery: ctx.followUpQuery,
    });

    const systemPrompt = await promptService.render(PromptId.AiAnalysisContinueSystem, {});

    // Delegate to the same SDK agent loop as VaultSearchAgentSDK
    // but with custom system prompt and pre-filled context
    const { VaultSearchAgentSDK } = await import('./VaultSearchAgentSDK');
    const sdkAgent = new VaultSearchAgentSDK({
      ...this.options,
      systemPromptOverride: systemPrompt,
      contextPrefix: contextText,
    });

    yield* sdkAgent.startSession(ctx.followUpQuery);
  }

  private maybeTruncate(content: string): string {
    // Rough estimate: 4 chars per token
    if (content.length > 800) {
      return content.slice(0, 800) + '\n\n[... truncated for context budget ...]';
    }
    return content;
  }
}
```

Note: This requires `VaultSearchAgentSDK` to accept optional `systemPromptOverride` and `contextPrefix` options. If it doesn't, add them as fields in `VaultSearchAgentSdkOptions` and wire them into the SDK agent's system message construction (around `VaultSearchAgentSDK.ts:252`).

- [ ] **Step 6: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no type errors.

- [ ] **Step 7: Commit**

```bash
git add templates/prompts/ai-analysis-continue-system.md templates/prompts/ai-analysis-continue.md src/service/agents/ContinueAnalysisAgent.ts src/service/prompt/PromptId.ts src/core/template/TemplateRegistry.ts
git commit -m "feat(continue): add ContinueAnalysisAgent with context-aware prompts"
```

---

### Task 9: Wire Continue Flow into performAnalysis

**Files:**
- Modify: `src/ui/view/quick-search/hooks/useSearchSession.ts:870-1056` (add continue branch)
- Modify: `src/ui/view/quick-search/tab-AISearch.tsx:471-489` (change continue event handler)
- Modify: `src/ui/view/quick-search/components/V2ContinueAnalysisInput.tsx:24-30` (emit continue-append event)

- [ ] **Step 1: Add `continueMode` flag to store**

In `searchSessionStore.ts`, add to the state interface:

```typescript
continueMode: boolean;
```

Add to `INITIAL_STATE`:

```typescript
continueMode: false,
```

- [ ] **Step 2: Modify continue event handler in tab-AISearch.tsx**

At `tab-AISearch.tsx:471-489`, change the V2 continue handler to use append mode:

```typescript
if (isV2Active && text?.trim()) {
  const store = useSearchSessionStore.getState();
  // Freeze current round before starting continue
  store.freezeCurrentRound();
  store.startContinueRound(text.trim());
  store.set({ continueMode: true });
  // Trigger analysis in continue mode
  incrementTriggerAnalysis();
}
```

- [ ] **Step 3: Add continue branch in performAnalysis**

In `useSearchSession.ts`, inside `performAnalysis` (around line 893), add a branch before the reset:

```typescript
const isContinue = store.getState().continueMode;

if (isContinue) {
  // DON'T call resetAll() — we're appending
  store.getState().set({ status: 'starting', hasStartedStreaming: false });

  // Build continue context from frozen rounds
  const { rounds, v2Sources } = store.getState();
  const ctx: ContinueContext = {
    originalQuery: rounds[0]?.query ?? searchQuery,
    rounds: rounds.map(r => ({
      query: r.query,
      summary: r.summary,
      sections: r.sections.map(s => ({ title: s.title, content: s.content })),
      annotations: r.annotations.map(a => ({
        sectionTitle: r.sections[a.sectionIndex]?.title ?? '',
        selectedText: a.selectedText,
        comment: a.comment,
        type: a.type,
      })),
    })),
    sources: v2Sources.map(s => ({ path: s.path, relevance: s.reasoning ?? '' })),
    graphSummary: null, // TODO: wire from aiGraphStore
    followUpQuery: searchQuery,
  };

  const continueAgent = new ContinueAnalysisAgent(agentOptions);
  for await (const event of continueAgent.startSession(ctx)) {
    routeEvent(event);
  }
  store.getState().markCompleted();
  store.getState().set({ continueMode: false });
  return;
}

// Original reset + full analysis path below
store.getState().resetAll();
// ... existing code ...
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Test continue flow manually**

In Obsidian:
1. Run an AI Analysis query → wait for completion
2. Click Continue → enter a follow-up question
3. Verify: Process view shows new tool calls (not reset), Report view shows previous sections PLUS new sections
4. Check store in DevTools: `rounds.length === 1`, `v2PlanSections` has new sections

- [ ] **Step 6: Commit**

```bash
git add src/ui/view/quick-search/hooks/useSearchSession.ts src/ui/view/quick-search/tab-AISearch.tsx src/ui/view/quick-search/store/searchSessionStore.ts
git commit -m "feat(continue): wire append-mode continue through performAnalysis"
```

---

### Task 10: Round Separator UI and Synthesize Button

**Files:**
- Modify: `src/ui/view/quick-search/components/V2ReportView.tsx:143-219`
- Modify: `src/ui/view/quick-search/tab-AISearch.tsx:55-141` (V2Footer)

- [ ] **Step 1: Add round separators to V2ReportView**

In `V2ReportView.tsx`, modify the `V2ReportView` component to group sections by round:

```tsx
const { rounds, v2PlanSections, v2Summary, v2SummaryStreaming } = useSearchSessionStore(
  (s) => ({
    rounds: s.rounds,
    v2PlanSections: s.v2PlanSections,
    v2Summary: s.v2Summary,
    v2SummaryStreaming: s.v2SummaryStreaming,
  })
);

// Render rounds + current sections
return (
  <div className="pktw-space-y-4">
    {/* Previous rounds */}
    {rounds.map((round, ri) => (
      <React.Fragment key={`round-${ri}`}>
        {ri > 0 && (
          <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-3 pktw-px-4">
            <div className="pktw-flex-1 pktw-h-px pktw-bg-[--background-modifier-border]" />
            <span className="pktw-text-xs pktw-text-[--text-muted] pktw-whitespace-nowrap">
              Round {ri + 1}: {round.query.slice(0, 50)}{round.query.length > 50 ? '...' : ''}
            </span>
            <div className="pktw-flex-1 pktw-h-px pktw-bg-[--background-modifier-border]" />
          </div>
        )}
        {/* Round summary */}
        {round.summary && (
          <div className="pktw-rounded-lg pktw-border pktw-border-[--background-modifier-border] pktw-p-4">
            <span className="pktw-text-xs pktw-font-medium pktw-text-[--text-muted] pktw-mb-2 pktw-block">
              Executive Summary
            </span>
            <StreamdownIsolated isAnimating={false}>
              {round.summary}
            </StreamdownIsolated>
          </div>
        )}
        {/* Round sections grid */}
        <div className="pktw-grid pktw-grid-cols-2 pktw-gap-3">
          {round.sections.map((sec, si) => (
            <SectionBlock key={sec.id} section={sec} sectionIndex={si} />
          ))}
        </div>
      </React.Fragment>
    ))}

    {/* Current round (actively generating) */}
    {rounds.length > 0 && v2PlanSections.length > 0 && (
      <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-py-3 pktw-px-4">
        <div className="pktw-flex-1 pktw-h-px pktw-bg-[--background-modifier-border]" />
        <span className="pktw-text-xs pktw-text-[--text-muted]">
          Round {rounds.length + 1}: {useSearchSessionStore.getState().query.slice(0, 50)}
        </span>
        <div className="pktw-flex-1 pktw-h-px pktw-bg-[--background-modifier-border]" />
      </div>
    )}

    {/* Current round progress + summary + sections (existing rendering logic) */}
    {/* ... keep existing progress bar, summary card, section grid ... */}
  </div>
);
```

- [ ] **Step 2: Add Synthesize All button to V2Footer**

In `tab-AISearch.tsx`, in the `V2Footer` component (around line 121), add a Synthesize button next to Continue:

```tsx
{/* Synthesize All — only visible when rounds >= 2 */}
{rounds.length >= 2 && (
  <Button
    variant="outline"
    size="sm"
    onClick={onSynthesize}
    className="pktw-text-xs"
  >
    <Sparkles className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
    Synthesize All
  </Button>
)}
```

Add `onSynthesize` prop to `V2Footer` and wire it up in the parent component (Task 12 will implement the actual SynthesizeAgent).

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/components/V2ReportView.tsx src/ui/view/quick-search/tab-AISearch.tsx
git commit -m "feat(continue): add round separator UI and Synthesize All button"
```

---

### Task 11: Annotation System

**Files:**
- Modify: `src/ui/view/quick-search/components/V2ReportView.tsx` (SectionBlock — text selection toolbar)
- Modify: `src/ui/view/quick-search/store/searchSessionStore.ts` (addAnnotation action)

- [ ] **Step 1: Add annotation toolbar to SectionBlock**

In `V2ReportView.tsx`, add a text selection handler to `SectionBlock`:

```tsx
const [showAnnotationBar, setShowAnnotationBar] = useState(false);
const [selectedText, setSelectedText] = useState('');
const [annotationPos, setAnnotationPos] = useState({ x: 0, y: 0 });
const [annotationType, setAnnotationType] = useState<Annotation['type']>('question');
const [annotationComment, setAnnotationComment] = useState('');

const handleTextSelect = useCallback(() => {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.toString().trim()) {
    setShowAnnotationBar(false);
    return;
  }
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  setSelectedText(sel.toString().trim());
  setAnnotationPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
  setShowAnnotationBar(true);
}, []);

const handleSubmitAnnotation = useCallback(() => {
  if (!annotationComment.trim()) return;
  const store = useSearchSessionStore.getState();
  store.addAnnotation({
    id: `ann-${Date.now()}`,
    roundIndex: store.currentRoundIndex > 0 ? store.currentRoundIndex - 1 : 0,
    sectionIndex,
    selectedText: selectedText || undefined,
    comment: annotationComment.trim(),
    type: annotationType,
    createdAt: Date.now(),
  });
  setShowAnnotationBar(false);
  setAnnotationComment('');
}, [sectionIndex, selectedText, annotationComment, annotationType]);
```

Render the annotation toolbar as a floating popover when `showAnnotationBar` is true:

```tsx
{showAnnotationBar && (
  <div
    className="pktw-fixed pktw-z-50 pktw-bg-[--background-primary] pktw-border pktw-border-[--background-modifier-border] pktw-rounded-lg pktw-shadow-lg pktw-p-2 pktw-flex pktw-flex-col pktw-gap-1.5"
    style={{ left: annotationPos.x, top: annotationPos.y, transform: 'translate(-50%, -100%)' }}
  >
    <div className="pktw-flex pktw-gap-1">
      {(['question', 'disagree', 'expand', 'note'] as const).map(t => (
        <Button
          key={t}
          variant={annotationType === t ? 'default' : 'outline'}
          size="sm"
          className="pktw-text-xs pktw-px-2 pktw-py-0.5"
          onClick={() => setAnnotationType(t)}
        >
          {t === 'question' ? '❓' : t === 'disagree' ? '⚡' : t === 'expand' ? '🔍' : '📝'}
          {' '}{t}
        </Button>
      ))}
    </div>
    <div className="pktw-flex pktw-gap-1">
      <input
        type="text"
        className="pktw-flex-1 pktw-text-xs pktw-px-2 pktw-py-1 pktw-border pktw-border-[--background-modifier-border] pktw-rounded pktw-bg-transparent"
        placeholder="Your comment..."
        value={annotationComment}
        onChange={e => setAnnotationComment(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmitAnnotation()}
        autoFocus
      />
      <Button size="sm" className="pktw-text-xs" onClick={handleSubmitAnnotation}>
        Add
      </Button>
    </div>
  </div>
)}
```

Add `onMouseUp={handleTextSelect}` to the section content wrapper div.

- [ ] **Step 2: Display annotation markers on sections**

In `SectionBlock`, render existing annotations as side badges:

```tsx
const annotations = useSearchSessionStore(s => {
  const roundIdx = s.rounds.length > 0 ? s.currentRoundIndex - 1 : 0;
  return s.rounds[roundIdx]?.annotations.filter(a => a.sectionIndex === sectionIndex) ?? [];
});

{annotations.length > 0 && (
  <div className="pktw-absolute pktw-right-2 pktw-top-10 pktw-flex pktw-flex-col pktw-gap-1">
    {annotations.map(a => (
      <span
        key={a.id}
        className="pktw-text-xs pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-[--interactive-accent] pktw-text-[--text-on-accent]"
        title={`[${a.type}] ${a.comment}`}
      >
        {a.type === 'question' ? '❓' : a.type === 'disagree' ? '⚡' : a.type === 'expand' ? '🔍' : '📝'}
      </span>
    ))}
  </div>
)}
```

- [ ] **Step 3: Test manually**

In Obsidian:
1. Run analysis → Report tab
2. Select text in a section → annotation toolbar appears
3. Choose type, enter comment, submit
4. Verify: badge appears on section edge, annotation stored in `rounds[0].annotations`

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/components/V2ReportView.tsx src/ui/view/quick-search/store/searchSessionStore.ts
git commit -m "feat(continue): add inline annotation system for report sections"
```

---

### Task 12: SynthesizeAgent

**Files:**
- Create: `templates/prompts/ai-analysis-synthesize-system.md`
- Create: `templates/prompts/ai-analysis-synthesize.md`
- Create: `src/service/agents/SynthesizeAgent.ts`
- Modify: `src/ui/view/quick-search/tab-AISearch.tsx` (wire Synthesize button)
- Modify: `src/ui/view/quick-search/store/searchSessionStore.ts` (replace rounds with synthesized)

- [ ] **Step 1: Create synthesize system prompt**

Create `templates/prompts/ai-analysis-synthesize-system.md`:

```markdown
You are a research editor synthesizing multiple rounds of analysis into one coherent final report.

## Input

You receive all rounds of analysis (each with sections, summaries, and user annotations).

## Output

Produce a single unified report with:
1. **Executive Summary** — synthesizes all rounds into one flowing narrative
2. **Merged Sections** — combine related sections across rounds, eliminate redundancy, resolve contradictions
3. **Annotation Resolutions** — address each user annotation inline (don't add separate annotation section)

## Rules

- If Round 2 contradicts Round 1, use the Round 2 conclusion (more informed)
- If user marked [disagree], honor their position and frame accordingly
- Preserve all `[[wikilink]]` citations from source rounds
- Match the language of the original query
- Output format: return a JSON object with `summary` (string) and `sections` (array of `{title, content}`)
- No Mermaid, no HTML, no inline styles
```

- [ ] **Step 2: Create synthesize user prompt**

Create `templates/prompts/ai-analysis-synthesize.md`:

```markdown
## All Analysis Rounds

{{#each rounds}}
### Round {{add @index 1}}: {{{this.query}}}

**Summary:** {{{this.summary}}}

{{#each this.sections}}
#### {{{this.title}}}
{{{this.content}}}
{{/each}}

{{#if this.annotations.length}}
**Annotations:**
{{#each this.annotations}}
- [{{{this.type}}}] on "{{{this.sectionTitle}}}": "{{{this.comment}}}"
{{/each}}
{{/if}}
{{/each}}

---

Please synthesize all rounds above into a single coherent report. Return JSON:
```json
{
  "summary": "unified executive summary",
  "sections": [
    { "title": "section title", "content": "full section content" }
  ]
}
```
```

- [ ] **Step 3: Create SynthesizeAgent**

Create `src/service/agents/SynthesizeAgent.ts`:

```typescript
import { AppContext } from '@/app/AppContext';
import { PromptId } from '@/service/prompt/PromptId';
import type { Round } from '@/ui/view/quick-search/types/search-steps';
import { streamText } from 'ai';

export interface SynthesizeResult {
  summary: string;
  sections: Array<{ title: string; content: string }>;
}

export class SynthesizeAgent {
  async synthesize(rounds: Round[]): Promise<SynthesizeResult> {
    const ctx = AppContext.getInstance();
    const promptService = ctx.promptService;

    const systemPrompt = await promptService.render(PromptId.AiAnalysisSynthesizeSystem, {});
    const userPrompt = await promptService.render(PromptId.AiAnalysisSynthesize, {
      rounds: rounds.map(r => ({
        query: r.query,
        summary: r.summary,
        sections: r.sections.map(s => ({ title: s.title, content: s.content })),
        annotations: r.annotations.map(a => ({
          type: a.type,
          sectionTitle: r.sections[a.sectionIndex]?.title ?? '',
          comment: a.comment,
        })),
      })),
    });

    const provider = ctx.aiServiceManager.getAnalysisProvider();
    const result = await streamText({
      model: provider,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      maxTokens: 8192,
    });

    let fullText = '';
    for await (const chunk of result.textStream) {
      fullText += chunk;
    }

    // Parse JSON from response
    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('SynthesizeAgent: no JSON in response');
    return JSON.parse(jsonMatch[0]) as SynthesizeResult;
  }
}
```

- [ ] **Step 4: Add replaceSynthesized action to store**

In `searchSessionStore.ts`:

```typescript
replaceSynthesized: (summary: string, sections: Array<{ title: string; content: string }>) => set((s) => {
  const synthesizedRound: Round = {
    index: 0,
    query: s.rounds[0]?.query ?? s.query,
    sections: sections.map((sec, i) => ({
      id: `synth-${i}`,
      title: sec.title,
      contentType: 'narrative',
      visualType: 'none',
      evidencePaths: [],
      brief: '',
      weight: 5,
      missionRole: 'synthesis',
      status: 'done' as const,
      content: sec.content,
      streamingChunks: [],
      generations: [{ content: sec.content, timestamp: Date.now() }],
    })),
    summary,
    summaryStreaming: false,
    sources: s.rounds.flatMap(r => r.sources),
    steps: [],
    timeline: [],
    followUpQuestions: [],
    proposedOutline: null,
    annotations: [],
  };
  return {
    rounds: [synthesizedRound],
    currentRoundIndex: 1,
    v2PlanSections: [],
    v2Summary: summary,
  };
}),
```

- [ ] **Step 5: Wire Synthesize button in tab-AISearch.tsx**

In the `AISearchTab` component, add the handler:

```typescript
const handleSynthesize = useCallback(async () => {
  const store = useSearchSessionStore.getState();
  if (store.rounds.length < 2) return;

  // Freeze current round if sections exist
  if (store.v2PlanSections.length > 0) {
    store.freezeCurrentRound();
  }

  store.set({ status: 'starting', v2View: 'report' });
  try {
    const agent = new SynthesizeAgent();
    const result = await agent.synthesize(store.rounds);
    store.replaceSynthesized(result.summary, result.sections);
    store.markCompleted();
  } catch (e) {
    console.error('Synthesize failed:', e);
    store.set({ status: 'completed' });
  }
}, []);
```

Pass `onSynthesize={handleSynthesize}` to `V2Footer`.

- [ ] **Step 6: Verify build and test**

Run: `npm run build`
Manual test: Run analysis → Continue once → Click "Synthesize All" → verify rounds merge into one.

- [ ] **Step 7: Commit**

```bash
git add templates/prompts/ai-analysis-synthesize-system.md templates/prompts/ai-analysis-synthesize.md src/service/agents/SynthesizeAgent.ts src/ui/view/quick-search/tab-AISearch.tsx src/ui/view/quick-search/store/searchSessionStore.ts
git commit -m "feat(continue): add SynthesizeAgent to merge rounds into unified report"
```

---

## Phase ④: Sources Tab Improvements

### Task 13: Sources List View — Grouping, Sorting, Badges

**Files:**
- Modify: `src/ui/view/quick-search/components/V2SourcesView.tsx:39-144`

- [ ] **Step 1: Enhance source grouping logic**

Replace the existing flat list with grouped, sorted, collapsible view. In `V2SourcesView.tsx`, rewrite the list rendering (around line 49):

```tsx
// Group sources by path prefix (first 2 folder segments)
const grouped = useMemo(() => {
  const groups = new Map<string, V2Source[]>();
  for (const src of v2Sources) {
    const parts = src.path.split('/');
    const prefix = parts.length > 2 ? parts.slice(0, 2).join('/') : parts[0] ?? 'root';
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix)!.push(src);
  }
  // Sort groups by total count desc, items within by readAt desc
  return Array.from(groups.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([prefix, sources]) => ({
      prefix,
      sources: sources.sort((a, b) => b.readAt - a.readAt),
    }));
}, [v2Sources]);
```

- [ ] **Step 2: Add collapsible group UI**

```tsx
const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

const toggleGroup = (prefix: string) => {
  setCollapsedGroups(prev => {
    const next = new Set(prev);
    if (next.has(prefix)) next.delete(prefix);
    else next.add(prefix);
    return next;
  });
};

// In render:
{grouped.map(({ prefix, sources }) => (
  <div key={prefix} className="pktw-mb-2">
    <button
      className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-w-full pktw-text-left pktw-text-xs pktw-font-medium pktw-text-[--text-muted] pktw-py-1 pktw-px-2 hover:pktw-bg-[--background-secondary] pktw-rounded"
      onClick={() => toggleGroup(prefix)}
    >
      <ChevronRight className={`pktw-w-3 pktw-h-3 pktw-transition-transform ${collapsedGroups.has(prefix) ? '' : 'pktw-rotate-90'}`} />
      <Folder className="pktw-w-3 pktw-h-3" />
      {prefix}
      <span className="pktw-ml-auto pktw-text-[--text-faint]">{sources.length}</span>
    </button>
    {!collapsedGroups.has(prefix) && (
      <div className="pktw-ml-5 pktw-space-y-0.5">
        {sources.map(src => (
          <SourceItem key={src.path} source={src} onClick={() => handleOpen(src.path)} />
        ))}
      </div>
    )}
  </div>
))}
```

- [ ] **Step 3: Add SourceItem with badges**

```tsx
function SourceItem({ source, onClick }: { source: V2Source; onClick: () => void }) {
  // Count references across all sections
  const refCount = useSearchSessionStore(s =>
    s.v2PlanSections.filter(sec => sec.evidencePaths.includes(source.path)).length
  );

  return (
    <button
      className="pktw-flex pktw-items-center pktw-gap-2 pktw-w-full pktw-text-left pktw-text-xs pktw-py-1 pktw-px-2 hover:pktw-bg-[--background-secondary] pktw-rounded pktw-group"
      onClick={onClick}
    >
      <FileText className="pktw-w-3 pktw-h-3 pktw-text-[--text-muted] pktw-shrink-0" />
      <span className="pktw-truncate pktw-flex-1">{source.title}</span>
      {refCount > 0 && (
        <span className="pktw-text-[10px] pktw-px-1 pktw-rounded pktw-bg-[--interactive-accent] pktw-text-[--text-on-accent]">
          ×{refCount}
        </span>
      )}
      {source.reasoning && (
        <span className="pktw-hidden group-hover:pktw-block pktw-text-[10px] pktw-text-[--text-muted] pktw-max-w-[200px] pktw-truncate">
          {source.reasoning}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/components/V2SourcesView.tsx
git commit -m "feat(sources): add grouped list with collapse, sort, reference badges"
```

---

### Task 14: Replace Mermaid Mindmap with React Flow Topology

**Files:**
- Modify: `src/ui/view/quick-search/components/V2SourcesView.tsx:14-36` (SourcesGraph component)

**Prerequisite:** The `MultiLensGraph` component from `src/ui/component/mine/multi-lens-graph/MultiLensGraph.tsx` must exist (from Phase ⑤ plan). If it's not implemented yet, this task can use a simplified inline React Flow or be deferred.

- [ ] **Step 1: Replace SourcesGraph with MultiLensGraph topology**

Replace the `SourcesGraph` component (lines 14–36):

```tsx
import { MultiLensGraph } from '@/ui/component/mine/multi-lens-graph/MultiLensGraph';
import type { LensGraphData, LensNodeData } from '@/ui/component/mine/multi-lens-graph/types';

function SourcesGraph({ sources, onOpen }: { sources: V2Source[]; onOpen: (path: string) => void }) {
  const graphData = useMemo((): LensGraphData | null => {
    if (sources.length === 0) return null;

    // Group by folder prefix for coloring
    const prefixMap = new Map<string, number>();
    let groupIdx = 0;

    const nodes: LensNodeData[] = sources.map((src, i) => {
      const parts = src.path.split('/');
      const prefix = parts.length > 2 ? parts.slice(0, 2).join('/') : parts[0] ?? 'root';
      if (!prefixMap.has(prefix)) prefixMap.set(prefix, groupIdx++);

      return {
        id: `src-${i}`,
        label: src.title,
        path: src.path,
        role: 'source',
        group: prefixMap.get(prefix)!,
        score: src.readAt, // use readAt as proxy for relevance order
      };
    });

    // Edges: connect sources that share evidence_paths in the same section
    const sectionEdges: Array<{ source: string; target: string }> = [];
    const sections = useSearchSessionStore.getState().v2PlanSections;
    for (const sec of sections) {
      const pathSet = sec.evidencePaths;
      for (let i = 0; i < pathSet.length; i++) {
        for (let j = i + 1; j < pathSet.length; j++) {
          const srcI = nodes.find(n => n.path === pathSet[i]);
          const srcJ = nodes.find(n => n.path === pathSet[j]);
          if (srcI && srcJ) {
            sectionEdges.push({ source: srcI.id, target: srcJ.id });
          }
        }
      }
    }

    return {
      nodes,
      edges: sectionEdges.map((e, i) => ({
        id: `e-${i}`,
        source: e.source,
        target: e.target,
        kind: 'semantic' as const,
      })),
      availableLenses: ['topology'],
    };
  }, [sources]);

  if (!graphData) return null;

  return (
    <div className="pktw-h-[400px] pktw-w-full pktw-border pktw-border-[--background-modifier-border] pktw-rounded-lg pktw-overflow-hidden">
      <MultiLensGraph
        data={graphData}
        activeLens="topology"
        showControls
        onNodeClick={(path) => onOpen(path)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Update SourcesGraph usage**

In the `V2SourcesView` component, update the graph view render path (around line 137):

```tsx
{viewMode === 'graph' && (
  <SourcesGraph sources={v2Sources} onOpen={(path) => handleOpen(path)} />
)}
```

Remove the old `StreamdownIsolated` mermaid rendering.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds (assuming MultiLensGraph exists).

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/quick-search/components/V2SourcesView.tsx
git commit -m "feat(sources): replace mermaid mindmap with React Flow topology graph"
```

---

## Phase ⑥: Search Page Quick Actions

### Task 15: Default Analysis Queries Config and UI

**Files:**
- Create: `templates/config/default-analysis-queries.json`
- Modify: `src/ui/view/quick-search/SearchModal.tsx:69-252` (AITabContent)
- Modify: `src/core/template/TemplateRegistry.ts` (register config template)

- [ ] **Step 1: Create default queries config**

Create `templates/config/default-analysis-queries.json`:

```json
{
  "queries": [
    {
      "label": "知识库结构分析",
      "query": "分析知识库的整体结构和目录组织",
      "icon": "layout"
    },
    {
      "label": "主题趋势",
      "query": "分析最近笔记的主题趋势和变化",
      "icon": "trending-up"
    },
    {
      "label": "知识盲区",
      "query": "找出知识库中的知识盲区和薄弱环节",
      "icon": "search"
    },
    {
      "label": "高价值笔记",
      "query": "识别知识库中最有价值和最常被引用的笔记",
      "icon": "star"
    },
    {
      "label": "未完成想法",
      "query": "梳理知识库中提到但尚未展开的想法和计划",
      "icon": "lightbulb"
    }
  ]
}
```

- [ ] **Step 2: Register config in TemplateRegistry**

In `src/core/template/TemplateRegistry.ts`, add a config template entry. Follow the existing pattern for `search-query-routing.json`:

```typescript
'default-analysis-queries': meta('config', 'default-analysis-queries', { isJson: true }),
```

Add a corresponding `TemplateId` if the registry uses one for config files.

- [ ] **Step 3: Add quick action chips to AITabContent**

In `SearchModal.tsx`, in the `AITabContent` component (around line 196), add chips below the input when the input is empty and no analysis is running:

```tsx
const defaultQueries = useMemo(() => {
  try {
    const tm = AppContext.getInstance().templateManager;
    const config = tm.loadJsonConfig('default-analysis-queries');
    return config?.queries ?? [];
  } catch { return []; }
}, []);

// Render below input, before action buttons:
{!searchQuery && status === 'idle' && defaultQueries.length > 0 && (
  <div className="pktw-flex pktw-flex-wrap pktw-gap-1.5 pktw-px-3 pktw-py-2">
    {defaultQueries.map((q: { label: string; query: string }, i: number) => (
      <Button
        key={i}
        variant="outline"
        size="sm"
        className="pktw-text-xs pktw-h-7"
        onClick={() => {
          useSharedStore.getState().setSearchQuery(q.query);
          incrementTriggerAnalysis();
        }}
      >
        {q.label}
      </Button>
    ))}
  </div>
)}
```

- [ ] **Step 4: Add Re-analyze quick action**

Below the preset chips, add a "Re-analyze" button that uses the most recent history query:

```tsx
const lastQuery = useMemo(() => {
  try {
    const history = AppContext.getInstance().aiAnalysisHistoryService;
    const recent = history.list({ limit: 1, offset: 0 });
    return recent[0]?.query ?? null;
  } catch { return null; }
}, []);

{!searchQuery && status === 'idle' && lastQuery && (
  <Button
    variant="ghost"
    size="sm"
    className="pktw-text-xs pktw-text-[--text-muted]"
    onClick={() => {
      useSharedStore.getState().setSearchQuery(lastQuery);
      incrementTriggerAnalysis();
    }}
  >
    <RotateCcw className="pktw-w-3 pktw-h-3 pktw-mr-1" />
    Re-analyze: {lastQuery.slice(0, 30)}...
  </Button>
)}
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add templates/config/default-analysis-queries.json src/ui/view/quick-search/SearchModal.tsx src/core/template/TemplateRegistry.ts
git commit -m "feat(search-ui): add preset analysis query chips and re-analyze action"
```

---

### Task 16: History-Based Query Suggestions

**Files:**
- Modify: `src/ui/view/quick-search/SearchModal.tsx:69-252` (add frequent queries)
- Modify: `src/core/storage/sqlite/repositories/AIAnalysisRepo.ts` (add frequency query)

- [ ] **Step 1: Add frequency query to AIAnalysisRepo**

In `src/core/storage/sqlite/repositories/AIAnalysisRepo.ts`, add a method:

```typescript
/**
 * Get the most frequent analysis query patterns.
 * Groups similar queries by extracting key terms and counting occurrences.
 */
frequentQueries(limit = 5): Array<{ query: string; count: number }> {
  // Simple approach: return most recent distinct queries ordered by frequency
  const rows = this.db.prepare(`
    SELECT query, COUNT(*) as cnt
    FROM ai_analysis_record
    WHERE query IS NOT NULL AND query != ''
    GROUP BY query
    ORDER BY cnt DESC, MAX(created_at_ts) DESC
    LIMIT ?
  `).all(limit) as Array<{ query: string; cnt: number }>;

  return rows.map(r => ({ query: r.query, count: r.cnt }));
}
```

- [ ] **Step 2: Wire frequent queries into service**

In `src/service/AIAnalysisHistoryService.ts`, add:

```typescript
frequentQueries(limit = 5): Array<{ query: string; count: number }> {
  return this.repo.frequentQueries(limit);
}
```

- [ ] **Step 3: Display frequent queries in AITabContent**

In `SearchModal.tsx`, merge frequent queries with preset queries:

```tsx
const frequentQueries = useMemo(() => {
  try {
    return AppContext.getInstance().aiAnalysisHistoryService.frequentQueries(5);
  } catch { return []; }
}, []);

// In render, before preset chips:
{!searchQuery && status === 'idle' && frequentQueries.length > 0 && (
  <div className="pktw-px-3 pktw-pt-2">
    <span className="pktw-text-[10px] pktw-text-[--text-faint] pktw-uppercase pktw-tracking-wide">
      Recent
    </span>
    <div className="pktw-flex pktw-flex-wrap pktw-gap-1.5 pktw-mt-1">
      {frequentQueries.map((fq, i) => (
        <Button
          key={`freq-${i}`}
          variant="ghost"
          size="sm"
          className="pktw-text-xs pktw-h-7 pktw-text-[--text-muted]"
          onClick={() => {
            useSharedStore.getState().setSearchQuery(fq.query);
            incrementTriggerAnalysis();
          }}
        >
          {fq.query.slice(0, 40)}{fq.query.length > 40 ? '...' : ''}
          {fq.count > 1 && (
            <span className="pktw-ml-1 pktw-text-[10px] pktw-text-[--text-faint]">×{fq.count}</span>
          )}
        </Button>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/core/storage/sqlite/repositories/AIAnalysisRepo.ts src/service/AIAnalysisHistoryService.ts src/ui/view/quick-search/SearchModal.tsx
git commit -m "feat(search-ui): add history-based frequent query suggestions"
```

---

## Token Usage Display (Cross-Phase)

### Task 17: Token Stats in V2 Footer

**Files:**
- Modify: `src/ui/view/quick-search/tab-AISearch.tsx:96-103` (V2Footer stats)
- Modify: `src/core/storage/vault/search-docs/AiSearchAnalysisDoc.ts` (frontmatter tokens field)

- [ ] **Step 1: Ensure V2 footer shows input/output breakdown**

The V2Footer already displays token count at `tab-AISearch.tsx:96-103`. Verify it shows `input / output` breakdown. If it only shows total, modify:

```tsx
{usage && (
  <span className="pktw-text-[10px] pktw-text-[--text-faint]">
    {formatTokenCount(usage.inputTokens ?? 0)} in / {formatTokenCount(usage.outputTokens ?? 0)} out
    {duration ? ` · ${(duration / 1000).toFixed(1)}s` : ''}
  </span>
)}
```

- [ ] **Step 2: Persist tokens in markdown frontmatter**

In `AiSearchAnalysisDoc.ts` `buildMarkdown()`, the frontmatter already has `estimatedTokens`. Extend to include structured token data:

```typescript
// In frontmatter section:
if (docModel.usage) {
  frontmatter.tokens = {
    input: docModel.usage.inputTokens ?? 0,
    output: docModel.usage.outputTokens ?? 0,
    total: (docModel.usage.inputTokens ?? 0) + (docModel.usage.outputTokens ?? 0),
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/tab-AISearch.tsx src/core/storage/vault/search-docs/AiSearchAnalysisDoc.ts
git commit -m "feat(tokens): persist structured token usage in markdown frontmatter"
```

---

## Notes

- **Phase ⑤** (Multi-Lens React Flow) is covered by the existing plan at `docs/superpowers/plans/2026-04-15-ai-graph-multi-lens.md`. Task 14 in this plan depends on Phase ⑤'s `MultiLensGraph` component being available.
- **`VaultSearchAgentSDK` extension** (Task 8 Step 5): The `ContinueAnalysisAgent` delegates to `VaultSearchAgentSDK` with custom system prompt. This requires adding `systemPromptOverride` and `contextPrefix` options to `VaultSearchAgentSdkOptions` — a small change in `VaultSearchAgentSDK.ts` constructor and `startSession()` method.
- **Handlebars `add` helper** (Task 8 Step 4, Task 12 Step 2): The templates use `{{add @index 1}}`. Verify this helper is registered in `PromptService`. If not, register it: `Handlebars.registerHelper('add', (a, b) => a + b)`.
