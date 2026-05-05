# Full Bugfix Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 18 reported bugs across chat, copilot, settings, and UI — from P0 blockers to P2 visual issues.

**Architecture:** Fixes are grouped into 5 independent waves. Each wave's tasks can run in parallel. Waves A→B have dependencies; C/D/E are independent.

**Tech Stack:** TypeScript, React 18, Obsidian API, Tailwind CSS, Claude Agent SDK, Zod

---

## Wave A — P0: Core Functionality Blockers (4 tasks)

### Task 1: Fix chat pluginId crash

**Files:**
- Modify: `src/service/chat/service-conversation.ts:219`

- [ ] **Step 1: Fix undefined pluginId**

At `service-conversation.ts:219`, `ctx.pluginId` does not exist on `AppContext`. Change to `ctx.plugin.manifest.id` (the pattern used everywhere else, e.g. `service-manager.ts:728`).

```typescript
// BEFORE (line 219):
const sdkStream = queryWithProfile(ctx.app, ctx.pluginId, profile, {

// AFTER:
const sdkStream = queryWithProfile(ctx.app, ctx.plugin.manifest.id, profile, {
```

- [ ] **Step 2: Also add allowedTools:[] to this single-turn chat call**

Same location, the call options at lines 220-223:

```typescript
// BEFORE:
const sdkStream = queryWithProfile(ctx.app, ctx.plugin.manifest.id, profile, {
    prompt: userPrompt,
    systemPrompt,
    maxTurns: 1,
});

// AFTER:
const sdkStream = queryWithProfile(ctx.app, ctx.plugin.manifest.id, profile, {
    prompt: userPrompt,
    systemPrompt,
    maxTurns: 1,
    allowedTools: [],
});
```

- [ ] **Step 3: Build and verify**

Run: `npm run build`
Expected: Build succeeds, no errors.

- [ ] **Step 4: Commit**

```bash
git add src/service/chat/service-conversation.ts
git commit -m "fix(chat): use ctx.plugin.manifest.id instead of undefined ctx.pluginId"
```

---

### Task 2: Create 10 missing copilot prompt templates

**Files:**
- Create: `templates/prompts/doc-polish-system.md`
- Create: `templates/prompts/doc-polish.md`
- Create: `templates/prompts/doc-review-system.md`
- Create: `templates/prompts/doc-review.md`
- Create: `templates/prompts/doc-suggest-links-system.md`
- Create: `templates/prompts/doc-suggest-links.md`
- Create: `templates/prompts/doc-split-suggestion-system.md`
- Create: `templates/prompts/doc-split-suggestion.md`
- Create: `templates/prompts/doc-suggest-tags-system.md`
- Create: `templates/prompts/doc-suggest-tags.md`

All templates use Handlebars syntax. Variables available from `copilot-commands.ts`: `content`, `title`, `scope` (full/selection), and command-specific extras.

Schema references from `copilot-schemas.ts`:
- `ReviewResult`: `{ overall, sections: [{ title, severity, feedback, suggestion }] }`
- `LinkSuggestions`: `{ links: [{ target, context, reason, type }] }`
- `SplitPlan`: `{ reason, splits: [{ newTitle, headings, lineRange, summary, excerpt }] }`
- `TagSuggestions`: `{ suggestions: [{ tag, confidence, reason, source }], summary }`

- [ ] **Step 1: Create doc-polish-system.md**

```markdown
You are an expert editor. Polish the given document text to improve clarity, flow, grammar, and readability while preserving the author's voice and meaning.

Rules:
- Fix grammatical errors and awkward phrasing
- Improve sentence structure and flow
- Preserve technical terms, proper nouns, and [[wikilinks]]
- Do not add new information or change meaning
- Maintain the original language (Chinese → Chinese, English → English)
- Return ONLY the polished text, no explanations
```

- [ ] **Step 2: Create doc-polish.md**

```markdown
{{#if (eq scope "selection")}}Polish this selected text from "{{title}}":{{else}}Polish this document "{{title}}":{{/if}}

{{{content}}}
```

- [ ] **Step 3: Create doc-review-system.md**

```markdown
You are a critical writing reviewer. Analyze the document and provide structured feedback.

Return a JSON object with this exact structure:
{
  "overall": "1-2 sentence overall assessment",
  "sections": [
    {
      "title": "Issue title",
      "severity": "info" | "warning" | "error",
      "feedback": "What the issue is",
      "suggestion": "How to fix it"
    }
  ]
}

Review for: clarity, structure, argument quality, evidence, completeness, readability.
Respond in the same language as the document. Return ONLY valid JSON, no markdown fences.
```

- [ ] **Step 4: Create doc-review.md**

```markdown
{{#if (eq scope "selection")}}Review this selected text from "{{title}}":{{else}}Review this document "{{title}}":{{/if}}

{{{content}}}
```

- [ ] **Step 5: Create doc-suggest-links-system.md**

```markdown
You are a knowledge graph expert for an Obsidian vault. Analyze the document and suggest relevant wikilinks to other notes.

Return a JSON object with this exact structure:
{
  "links": [
    {
      "target": "Note Title",
      "context": "The sentence or phrase where this link would be relevant",
      "reason": "Why this link adds value",
      "type": "outgoing" | "incoming"
    }
  ]
}

Rules:
- Suggest 3-10 meaningful links
- "outgoing": this document should link TO the target
- "incoming": the target note should link BACK to this document
- Focus on conceptual connections, not trivial mentions
- Do not suggest links that already exist
- Respond in the same language as the document. Return ONLY valid JSON, no markdown fences.
```

- [ ] **Step 6: Create doc-suggest-links.md**

```markdown
Suggest wikilinks for "{{title}}".

{{#if existingLinks}}Existing links (do not re-suggest): {{existingLinks}}{{/if}}

Document content:
{{{content}}}
```

- [ ] **Step 7: Create doc-split-suggestion-system.md**

```markdown
You are a document organization expert. Analyze the document and suggest how to split it into smaller, focused notes.

Return a JSON object with this exact structure:
{
  "reason": "Why this document should be split",
  "splits": [
    {
      "newTitle": "Suggested title for the new note",
      "headings": ["Heading 1", "Heading 2"],
      "lineRange": [startLine, endLine],
      "summary": "What this split covers",
      "excerpt": "First 100 chars of the content that would move"
    }
  ]
}

Rules:
- Only suggest splits that create coherent, standalone notes
- Each split should cover a distinct topic or theme
- Suggest 2-5 splits
- lineRange is 0-indexed [start, end) of the lines to extract
- Respond in the same language as the document. Return ONLY valid JSON, no markdown fences.
```

- [ ] **Step 8: Create doc-split-suggestion.md**

```markdown
Analyze "{{title}}" ({{wordCount}} words) for splitting into smaller notes:

{{{content}}}
```

- [ ] **Step 9: Create doc-suggest-tags-system.md**

```markdown
You are a taxonomy expert for an Obsidian vault. Analyze the document and suggest relevant tags.

Return a JSON object with this exact structure:
{
  "suggestions": [
    {
      "tag": "tag-name",
      "confidence": 0.0 to 1.0,
      "reason": "Why this tag fits",
      "source": "content" | "graph" | "history"
    }
  ],
  "summary": "Brief summary of the document's main themes"
}

Rules:
- Suggest 3-8 tags
- Tags should use kebab-case, no # prefix
- "content": tag derived from document content
- "graph": tag derived from linked note patterns
- "history": tag derived from similar past documents
- Confidence: 0.9+ = very confident, 0.7-0.9 = likely, below 0.7 = speculative
- Respond in the same language as the document. Return ONLY valid JSON, no markdown fences.
```

- [ ] **Step 10: Create doc-suggest-tags.md**

```markdown
Suggest tags for "{{title}}":

{{{content}}}
```

- [ ] **Step 11: Build and verify**

Run: `npm run build`
Expected: Build succeeds. Template files are loaded by PluginDirContentProvider at runtime.

- [ ] **Step 12: Commit**

```bash
git add templates/prompts/doc-*.md
git commit -m "feat(copilot): add 10 missing prompt templates for document intelligence"
```

---

### Task 3: Add logging to resolvePromptPair silent catch

**Files:**
- Modify: `src/service/chat/service-manager.ts:767`

- [ ] **Step 1: Add error logging to catch block**

```typescript
// BEFORE (line 767):
} catch {
    // Not a valid PromptId or render failed — use raw text
}

// AFTER:
} catch (err) {
    console.warn('[AIServiceManager] resolvePromptPair: failed to render prompt', promptOrText, err);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/service/chat/service-manager.ts
git commit -m "fix(prompt): log resolvePromptPair failures instead of silent catch"
```

---

### Task 4: Auto-select first profile as default when none is set

**Files:**
- Modify: `src/core/profiles/ProfileRegistry.ts:74-77`

- [ ] **Step 1: Add fallback to first profile in getActiveAgentProfile**

```typescript
// BEFORE (line 74-77):
getActiveAgentProfile(): Profile | null {
    if (!this.activeAgentConfig) return null;
    return this.profiles.find((p) => p.id === this.activeAgentConfig!.profileId) ?? null;
}

// AFTER:
getActiveAgentProfile(): Profile | null {
    if (!this.activeAgentConfig) {
        return this.profiles.length > 0 ? this.profiles[0] : null;
    }
    return this.profiles.find((p) => p.id === this.activeAgentConfig!.profileId) ?? null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/core/profiles/ProfileRegistry.ts
git commit -m "fix(profiles): fallback to first profile when no active agent profile is set"
```

---

## Wave B — P1: Functional Fixes (4 tasks)

### Task 5: Enable markdown rendering for user messages

**Files:**
- Modify: `src/ui/view/chat-view/components/messages/MessageViewItem.tsx:304`

- [ ] **Step 1: Always use StreamdownIsolated for user messages**

The current code at line 304 checks `isUser && !message.isMarkdownContent` to decide whether to render plain text or markdown. User messages from search-created conversations already have `isMarkdownContent: true`, but normal chat messages don't. Simply remove the plain-text branch — always use markdown rendering.

```typescript
// BEFORE (lines 303-316):
{
    isUser && !message.isMarkdownContent ? (
        <div className="pktw-select-text">
            {displayText}
        </div>
    ) : (
        <StreamdownIsolated
            className="pktw-select-text"
            isAnimating={streamingState.isStreaming}
        >
            {displayText}
        </StreamdownIsolated>
    )
}

// AFTER:
<StreamdownIsolated
    className="pktw-select-text"
    isAnimating={streamingState.isStreaming}
>
    {displayText}
</StreamdownIsolated>
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/view/chat-view/components/messages/MessageViewItem.tsx
git commit -m "fix(chat): render user messages with markdown instead of plain text"
```

---

### Task 6: Show regenerate button on error messages

**Files:**
- Modify: `src/ui/view/chat-view/components/messages/MessageActionsList.tsx:126`

- [ ] **Step 1: Remove isErrorMessage guard from regenerate button**

```typescript
// BEFORE (line 126):
{isLastMessage && !message.isErrorMessage && (

// AFTER:
{isLastMessage && (
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/view/chat-view/components/messages/MessageActionsList.tsx
git commit -m "fix(chat): allow regenerate on error messages"
```

---

### Task 7: Fix Vault Analysis dropdown icon visibility

**Files:**
- Modify: `src/ui/view/quick-search/SearchModal.tsx:249-254`

The `Library` icon renders inside a `pktw-w-7 pktw-h-7` box. Looking at the screenshot, the active item (vaultFull) shows NO icon box at all. The inactive item (aiGraph) shows the icon box. This suggests the active styling `pktw-bg-pk-accent pktw-text-white` makes the icon invisible because `--pk-accent` might be transparent or not set in some themes.

- [ ] **Step 1: Use explicit color for active icon instead of theme variable**

```typescript
// BEFORE (line 251):
analysisMode === p ? 'pktw-bg-pk-accent pktw-text-white' : 'pktw-bg-[#f3f4f6] pktw-text-pk-foreground-muted pktw-border pktw-border-pk-border'

// AFTER:
analysisMode === p ? 'pktw-bg-[#7c3aed] pktw-text-white' : 'pktw-bg-[#f3f4f6] pktw-text-pk-foreground-muted pktw-border pktw-border-pk-border'
```

- [ ] **Step 2: Visually verify in Obsidian**

Open the search modal, click the mode dropdown. Both Vault Analysis and AI Graph should show icon boxes.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/quick-search/SearchModal.tsx
git commit -m "fix(search): use explicit color for active mode icon to ensure visibility"
```

---

### Task 8: Fix settings tab background inconsistency

**Files:**
- Modify: `src/styles/tailwind.css:88-93`

- [ ] **Step 1: Add background to tab strip**

```css
/* BEFORE (line 88-93): */
.peak-settings-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--background-modifier-border);
    margin-bottom: 0;
    padding: 0;
}

/* AFTER: */
.peak-settings-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--background-modifier-border);
    margin-bottom: 0;
    padding: 0;
    background-color: var(--background-primary);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/styles/tailwind.css
git commit -m "fix(settings): set explicit background on tab strip for theme consistency"
```

---

## Wave C — P2: Settings UI Improvements (2 tasks)

### Task 9: Replace Temperature/TopP text inputs with sliders

**Files:**
- Modify: `src/ui/view/settings/ProfilesTab.tsx:187-202`

- [ ] **Step 1: Replace Temperature input with slider + value display**

```tsx
// BEFORE (lines 187-193):
<FieldRow label="Temperature">
    <input
        type="number" step="0.1" min="0" max="2"
        className={INPUT_CLS}
        value={outputControl.temperature ?? ''}
        onChange={(e) => updateOutputControl('temperature', parseFloat(e.target.value) || 0)}
    />
</FieldRow>

// AFTER:
<FieldRow label="Temperature" description="Controls randomness. Lower = more focused, higher = more creative.">
    <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-w-full">
        <input
            type="range" step="0.1" min="0" max="2"
            className="pktw-flex-1 pktw-h-1.5 pktw-accent-pk-accent"
            value={outputControl.temperature ?? 1}
            onChange={(e) => updateOutputControl('temperature', parseFloat(e.target.value))}
        />
        <span className="pktw-text-xs pktw-text-pk-foreground-muted pktw-w-8 pktw-text-right pktw-font-mono">
            {(outputControl.temperature ?? 1).toFixed(1)}
        </span>
    </div>
</FieldRow>
```

- [ ] **Step 2: Replace TopP input with slider + value display**

```tsx
// BEFORE (lines 195-201):
<FieldRow label="Top P">
    <input
        type="number" step="0.05" min="0" max="1"
        className={INPUT_CLS}
        value={outputControl.topP ?? ''}
        onChange={(e) => updateOutputControl('topP', parseFloat(e.target.value) || 0)}
    />
</FieldRow>

// AFTER:
<FieldRow label="Top P" description="Nucleus sampling threshold. Lower = more focused token selection.">
    <div className="pktw-flex pktw-items-center pktw-gap-2 pktw-w-full">
        <input
            type="range" step="0.05" min="0" max="1"
            className="pktw-flex-1 pktw-h-1.5 pktw-accent-pk-accent"
            value={outputControl.topP ?? 0.9}
            onChange={(e) => updateOutputControl('topP', parseFloat(e.target.value))}
        />
        <span className="pktw-text-xs pktw-text-pk-foreground-muted pktw-w-8 pktw-text-right pktw-font-mono">
            {(outputControl.topP ?? 0.9).toFixed(2)}
        </span>
    </div>
</FieldRow>
```

- [ ] **Step 3: Check if FieldRow supports `description` prop**

If `FieldRow` doesn't have a `description` prop, add one. The component is at `src/ui/view/settings/ProfilesTab.tsx` — find its definition and add an optional `description?: string` rendered as a small muted text below the label.

- [ ] **Step 4: Add descriptions to other LLM settings**

Add similar description text to Reasoning Effort, Text Verbosity, and Timeout fields:
- Reasoning Effort: "How deeply the model reasons before responding."
- Text Verbosity: "Controls response length. Low = concise, High = detailed."
- Timeout Total: "Maximum total time (seconds) for a single LLM call."
- Timeout Step: "Maximum time (seconds) for each step within a call."

- [ ] **Step 5: Commit**

```bash
git add src/ui/view/settings/ProfilesTab.tsx
git commit -m "fix(settings): replace Temperature/TopP text inputs with sliders, add descriptions"
```

---

### Task 10: Remove redundant footer text from SearchTab

**Files:**
- Modify: `src/ui/view/settings/SearchTab.tsx:161-165`

- [ ] **Step 1: Check if the "Moved to peak-config.json" banner is still needed**

At `SearchTab.tsx:161-165` there's a banner about settings moved to peak-config.json. This is an implementation detail users don't need to see. Remove it.

```tsx
// DELETE the entire banner block at lines ~158-168 (the div containing the "Moved to..." text)
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/view/settings/SearchTab.tsx
git commit -m "fix(settings): remove internal 'moved to peak-config.json' banner from SearchTab"
```

---

## Wave D — P2: Chat UI Improvements (2 tasks)

### Task 11: Improve Conversation Outline content

**Files:**
- Modify: `src/ui/view/message-history-view/MessageHistoryView.tsx:76-80`

The outline shows raw truncated message content because messages lack `topic`/`title` fields. Improve `getMessageSummary` to strip markdown and produce cleaner summaries.

- [ ] **Step 1: Improve getMessageSummary to strip markdown formatting**

```typescript
// BEFORE (line 76-80):
function getMessageSummary(message: ChatMessage): string {
    if (message.title) return message.title;
    const content = message.content || '';
    return content.slice(0, 80).replace(/\n/g, ' ').trim() || '(empty)';
}

// AFTER:
function getMessageSummary(message: ChatMessage): string {
    if (message.title) return message.title;
    const content = message.content || '';
    const stripped = content
        .replace(/^#+\s*/gm, '')       // strip heading markers
        .replace(/\*\*|__/g, '')        // strip bold
        .replace(/\*|_/g, '')           // strip italic
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) → text
        .replace(/\[\[([^\]]*)\]\]/g, '$1')       // [[wikilink]] → wikilink
        .replace(/```[\s\S]*?```/g, '')            // strip code blocks
        .replace(/`([^`]*)`/g, '$1')               // strip inline code markers
        .replace(/\n+/g, ' ')
        .trim();
    return stripped.slice(0, 80) || '(empty)';
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/view/message-history-view/MessageHistoryView.tsx
git commit -m "fix(outline): strip markdown from message summaries in conversation outline"
```

---

### Task 12: Fix Conversation Outline inline rendering

**Files:**
- Modify: `src/ui/view/chat-view/components/ConversationOutline.tsx:42`

The outline panel renders as inline flex child but visually appears to float/overlap. Add proper container constraints.

- [ ] **Step 1: Read current ConversationOutline component**

Read `src/ui/view/chat-view/components/ConversationOutline.tsx` and `src/ui/view/chat-view/view-Messages.tsx:128-144` to understand the layout.

- [ ] **Step 2: Add overflow and border styling**

Ensure the outline container has proper `overflow-y-auto`, `max-height`, and visual separation from the message list. The exact fix depends on the current layout — add `pktw-overflow-y-auto pktw-max-h-full` to the outline wrapper if missing.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/chat-view/components/ConversationOutline.tsx src/ui/view/chat-view/view-Messages.tsx
git commit -m "fix(outline): prevent conversation outline from overlapping message list"
```

---

## Items Confirmed Already Fixed / Out of Scope

| Item | Status |
|------|--------|
| Local Chromium option | **Already removed** — no "Local Chromium" string in src/ |
| "Power-user settings" footer | **Already removed** — text does not exist in source |
| VaultSearch maxTurns:20 | **Already fixed** in this session (instanceof → string match) |
| Copilot maxTurns:1 | **Already fixed** in this session (allowedTools: []) |
| Per-function model selection | **Feature request** — needs separate design/spec |
| Image/video generation | **Feature request** — future roadmap |
| API Key protection | **UX design** — needs design discussion |
| Copilot streaming progress | **Enhancement** — depends on Task 2 (templates) first, then needs separate plan |
| Dynamic quick action buttons | **Enhancement** — needs LLM-generated suggestions, separate plan |
| Non-Anthropic model support in chat | **Architectural** — `streamChat` forces Agent SDK path; needs separate plan to add direct LLM call fallback for non-Agent-SDK providers |
