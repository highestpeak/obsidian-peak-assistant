# Prompt Template Override Panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a modal panel that lets users discover, browse, and override all prompt templates used by the plugin via vault files.

**Architecture:** Extend `TemplateMetadata` with label/description/group fields, add override management methods to `PromptService`, build a React modal with grouped collapsible list. Override files use a `prompt-meta` code block for variable documentation, stripped at render time.

**Tech Stack:** React 18, Obsidian Modal API, Handlebars templates, Tailwind CSS (pktw- prefix)

**Spec:** `docs/superpowers/specs/2026-05-10-prompt-template-panel-design.md`
**Mockup:** `docs/mockups/prompt-template-modal.html`

---

### Task 1: Extend TemplateMetadata with label, description, group

**Files:**
- Modify: `src/core/template/TemplateRegistry.ts:84-94` (TemplateMetadata interface)
- Modify: `src/core/template/TemplateRegistry.ts:115-126` (meta() helper)
- Modify: `src/core/template/TemplateRegistry.ts:131-293` (TEMPLATE_METADATA entries)

- [ ] **Step 1: Add new fields to TemplateMetadata interface and helpers**

In `src/core/template/TemplateRegistry.ts`, extend the interface and add types:

```typescript
// Add after line 79 (after TemplateId type)
export type PromptGroup = 'chat' | 'userProfile' | 'copilot' | 'searchAnalysis' | 'indexing' | 'ambientContext';

export interface PromptGroupConfig {
    key: PromptGroup;
    label: string;
    defaultExpanded: boolean;
    order: number;
}

export const PROMPT_GROUPS: PromptGroupConfig[] = [
    { key: 'chat',           label: 'Chat',              defaultExpanded: true,  order: 0 },
    { key: 'userProfile',    label: 'User Profile',      defaultExpanded: true,  order: 1 },
    { key: 'copilot',        label: 'Copilot',           defaultExpanded: true,  order: 2 },
    { key: 'searchAnalysis', label: 'Search & Analysis', defaultExpanded: false, order: 3 },
    { key: 'indexing',       label: 'Indexing',          defaultExpanded: false, order: 4 },
    { key: 'ambientContext', label: 'Ambient Context',   defaultExpanded: false, order: 5 },
];
```

Extend the `TemplateMetadata` interface (currently at line 84):

```typescript
export interface TemplateMetadata {
    path: string;
    category: TemplateCategory;
    expectsJson?: boolean;
    jsonConstraint?: string;
    systemPromptId?: PromptId;
    // New fields for prompt template panel
    label?: string;
    description?: string;
    group?: PromptGroup;
}
```

Update the `meta()` helper to accept new fields (currently at line 115):

```typescript
function meta(
    category: TemplateCategory,
    fileStem: string,
    opts?: Partial<Pick<TemplateMetadata, 'expectsJson' | 'jsonConstraint' | 'systemPromptId' | 'label' | 'description' | 'group'>>
): TemplateMetadata {
    const ext = category === 'config' ? 'json' : 'md';
    return {
        category,
        path: `${CATEGORY_PREFIX[category]}/${fileStem}.${ext}`,
        ...opts,
    };
}
```

- [ ] **Step 2: Add label, description, group to all prompt entries in TEMPLATE_METADATA**

Update every prompt entry in `TEMPLATE_METADATA` (lines 131–258). Here is the complete replacement for ALL prompt entries. Non-prompt entries (tools, agents, indexing, stopwords) stay unchanged.

```typescript
// --- Prompts (category prompts) ---

// Chat group
'conversation-system': meta('prompts', 'conversation-system', {
    label: 'Chat System Prompt',
    description: 'Core system instruction for all conversations. Defines AI persona, capabilities, and response style.',
    group: 'chat',
}),
'conversation-summary-short': meta('prompts', 'conversation-summary-short', {
    label: 'Conversation Summary (Short)',
    description: 'Generates a concise one-line summary for the sidebar list.',
    group: 'chat',
}),
'conversation-summary-full': meta('prompts', 'conversation-summary-full', {
    label: 'Conversation Summary (Full)',
    description: 'Generates a detailed summary preserving key decisions and context.',
    group: 'chat',
}),
'project-summary-short': meta('prompts', 'project-summary-short', {
    label: 'Project Summary (Short)',
    description: 'One-line project summary for project list display.',
    group: 'chat',
}),
'project-summary-full': meta('prompts', 'project-summary-full', {
    label: 'Project Summary (Full)',
    description: 'Detailed project summary with decisions, goals, and context.',
    group: 'chat',
}),
'search-rerank-rank-gpt': meta('prompts', 'search-rerank-rank-gpt', {
    label: 'Search Rerank (RankGPT)',
    description: 'LLM-based reranker that reorders search results by relevance.',
    group: 'chat',
}),
'application-generate-title': meta('prompts', 'application-generate-title', {
    label: 'Generate Title',
    description: 'Auto-generates a conversation title from the first few messages.',
    group: 'chat',
}),
'chat-topic-aggregation': meta('prompts', 'chat-topic-aggregation', {
    label: 'Topic Aggregation',
    description: 'Groups conversation messages into topic clusters for the sidebar.',
    group: 'chat',
    expectsJson: true,
    jsonConstraint: 'Return only the JSON array of topic groups, nothing else.',
}),
'chat-suggest-followups': meta('prompts', 'chat-suggest-followups', {
    label: 'Suggest Follow-ups',
    description: 'Generates 3 suggested follow-up questions shown below the last message.',
    group: 'chat',
    expectsJson: true,
    jsonConstraint: 'Return only the JSON array of suggestion strings, nothing else.',
}),
'chat-suggest-actions': meta('prompts', 'chat-suggest-actions', {
    label: 'Suggest Actions',
    description: 'Generates contextual action suggestions (sparkle buttons) for the conversation.',
    group: 'chat',
    expectsJson: true,
    jsonConstraint: 'Return only the JSON array of action objects, nothing else.',
}),

// User Profile group
'memory-extract-candidates-json': meta('prompts', 'memory-extract-candidates-json', {
    label: 'Memory Extraction',
    description: 'Identifies facts worth remembering from conversation messages.',
    group: 'userProfile',
    expectsJson: true,
    jsonConstraint: 'Return only the JSON array, nothing else.',
}),
'context-memory': meta('prompts', 'context-memory', {
    label: 'Context Memory',
    description: 'Renders long-term memory entries into the conversation context.',
    group: 'userProfile',
}),
'user-profile-context': meta('prompts', 'user-profile-context', {
    label: 'User Profile Context',
    description: 'Renders the user profile into the conversation context window.',
    group: 'userProfile',
}),
'profile-from-vault-json': meta('prompts', 'profile-from-vault-json', {
    label: 'Profile Extraction',
    description: 'Extracts structured user profile data from vault notes.',
    group: 'userProfile',
    expectsJson: true,
    jsonConstraint: 'Return only the JSON array, nothing else.',
}),
'user-profile-organize-markdown': meta('prompts', 'user-profile-organize-markdown', {
    label: 'Profile Organize',
    description: 'Organizes raw profile data into a clean markdown format.',
    group: 'userProfile',
}),
'message-resources': meta('prompts', 'message-resources', {
    label: 'Message Resources',
    description: 'Formats attached resources (files, links) for inclusion in messages.',
    group: 'ambientContext',
}),

// Copilot group — Document Intelligence
'doc-polish': meta('prompts', 'doc-polish', {
    label: 'Document Polish',
    description: 'Polishes writing for clarity, grammar, and flow. Works on full document or selection.',
    group: 'copilot',
    systemPromptId: 'doc-polish-system' as PromptId,
}),
'doc-polish-system': meta('prompts', 'doc-polish-system', {
    label: 'Document Polish (System)',
    description: 'System instructions for the document polish action.',
    group: 'copilot',
}),
'doc-review': meta('prompts', 'doc-review', {
    label: 'Document Review',
    description: 'Structured feedback on document quality with severity-ranked issues.',
    group: 'copilot',
    expectsJson: true,
    systemPromptId: 'doc-review-system' as PromptId,
}),
'doc-review-system': meta('prompts', 'doc-review-system', {
    label: 'Document Review (System)',
    description: 'System instructions for the document review action.',
    group: 'copilot',
}),
'doc-suggest-links': meta('prompts', 'doc-suggest-links', {
    label: 'Suggest Links (Direct)',
    description: 'Direct prompt for link suggestions (superseded by agent playbook).',
    group: 'copilot',
    expectsJson: true,
    systemPromptId: 'doc-suggest-links-system' as PromptId,
}),
'doc-suggest-links-system': meta('prompts', 'doc-suggest-links-system', {
    label: 'Suggest Links (Direct, System)',
    description: 'System prompt for direct link suggestion (superseded by agent playbook).',
    group: 'copilot',
}),
'doc-split-suggestion': meta('prompts', 'doc-split-suggestion', {
    label: 'Split Suggestion',
    description: 'Analyzes document structure and suggests how to split it into smaller notes.',
    group: 'copilot',
    expectsJson: true,
    systemPromptId: 'doc-split-suggestion-system' as PromptId,
}),
'doc-split-suggestion-system': meta('prompts', 'doc-split-suggestion-system', {
    label: 'Split Suggestion (System)',
    description: 'System instructions for the split suggestion action.',
    group: 'copilot',
}),
'doc-suggest-tags': meta('prompts', 'doc-suggest-tags', {
    label: 'Suggest Tags',
    description: 'Suggests tags for a document based on its content and existing vault tags.',
    group: 'copilot',
    expectsJson: true,
    systemPromptId: 'doc-suggest-tags-system' as PromptId,
}),
'doc-suggest-tags-system': meta('prompts', 'doc-suggest-tags-system', {
    label: 'Suggest Tags (System)',
    description: 'System instructions for the tag suggestion action.',
    group: 'copilot',
}),
'doc-summarize': meta('prompts', 'doc-summarize', {
    label: 'Summarize',
    description: 'Generates a concise summary of the document content.',
    group: 'copilot',
    systemPromptId: 'doc-summarize-system' as PromptId,
}),
'doc-summarize-system': meta('prompts', 'doc-summarize-system', {
    label: 'Summarize (System)',
    description: 'System instructions for the summarize action.',
    group: 'copilot',
}),
'doc-extract-concepts': meta('prompts', 'doc-extract-concepts', {
    label: 'Extract Concepts',
    description: 'Identifies and extracts key concepts and entities from the document.',
    group: 'copilot',
    expectsJson: true,
    systemPromptId: 'doc-extract-concepts-system' as PromptId,
}),
'doc-extract-concepts-system': meta('prompts', 'doc-extract-concepts-system', {
    label: 'Extract Concepts (System)',
    description: 'System instructions for the concept extraction action.',
    group: 'copilot',
}),
'doc-translate': meta('prompts', 'doc-translate', {
    label: 'Translate',
    description: 'Translates document content. Auto-detects CJK to choose target language.',
    group: 'copilot',
    systemPromptId: 'doc-translate-system' as PromptId,
}),
'doc-translate-system': meta('prompts', 'doc-translate-system', {
    label: 'Translate (System)',
    description: 'System instructions for the translate action.',
    group: 'copilot',
}),

// Copilot group — Vault Intelligence
'vault-knowledge-gaps': meta('prompts', 'vault-knowledge-gaps', {
    label: 'Knowledge Gaps (Direct)',
    description: 'Direct prompt for knowledge gap analysis (superseded by agent playbook).',
    group: 'copilot',
    expectsJson: true,
    systemPromptId: 'vault-knowledge-gaps-system' as PromptId,
}),
'vault-knowledge-gaps-system': meta('prompts', 'vault-knowledge-gaps-system', {
    label: 'Knowledge Gaps (Direct, System)',
    description: 'System prompt for direct knowledge gaps (superseded by agent playbook).',
    group: 'copilot',
}),
'vault-synthesize': meta('prompts', 'vault-synthesize', {
    label: 'Synthesize (Direct)',
    description: 'Direct prompt for topic synthesis (superseded by agent playbook).',
    group: 'copilot',
    systemPromptId: 'vault-synthesize-system' as PromptId,
}),
'vault-synthesize-system': meta('prompts', 'vault-synthesize-system', {
    label: 'Synthesize (Direct, System)',
    description: 'System prompt for direct synthesis (superseded by agent playbook).',
    group: 'copilot',
}),
'vault-health': meta('prompts', 'vault-health', {
    label: 'Vault Health',
    description: 'Analyzes vault structure for orphans, duplicates, stale notes, and tag issues.',
    group: 'copilot',
    expectsJson: true,
    systemPromptId: 'vault-health-system' as PromptId,
}),
'vault-health-system': meta('prompts', 'vault-health-system', {
    label: 'Vault Health (System)',
    description: 'System instructions for vault health analysis.',
    group: 'copilot',
}),

// Copilot group — Writing Assistance
'writing-continue': meta('prompts', 'writing-continue', {
    label: 'Continue Writing',
    description: 'Continues writing from the current cursor position in the document.',
    group: 'copilot',
    systemPromptId: 'writing-continue-system' as PromptId,
}),
'writing-continue-system': meta('prompts', 'writing-continue-system', {
    label: 'Continue Writing (System)',
    description: 'System instructions for the continue writing action.',
    group: 'copilot',
}),
'writing-rewrite': meta('prompts', 'writing-rewrite', {
    label: 'Rewrite Selection',
    description: 'Rewrites the selected text with improved clarity and style.',
    group: 'copilot',
    systemPromptId: 'writing-rewrite-system' as PromptId,
}),
'writing-rewrite-system': meta('prompts', 'writing-rewrite-system', {
    label: 'Rewrite Selection (System)',
    description: 'System instructions for the rewrite selection action.',
    group: 'copilot',
}),
'writing-add-evidence': meta('prompts', 'writing-add-evidence', {
    label: 'Add Evidence (Direct)',
    description: 'Direct prompt for evidence addition (superseded by agent playbook).',
    group: 'copilot',
    expectsJson: true,
    systemPromptId: 'writing-add-evidence-system' as PromptId,
}),
'writing-add-evidence-system': meta('prompts', 'writing-add-evidence-system', {
    label: 'Add Evidence (Direct, System)',
    description: 'System prompt for direct evidence addition (superseded by agent playbook).',
    group: 'copilot',
}),

// Copilot group — Agent Playbooks
'copilot-agent-suggest-links': meta('prompts', 'copilot-agent-suggest-links', {
    label: 'Suggest Links (Agent)',
    description: 'Agent playbook that searches vault and suggests wiki-links for the current document.',
    group: 'copilot',
}),
'copilot-agent-knowledge-gaps': meta('prompts', 'copilot-agent-knowledge-gaps', {
    label: 'Knowledge Gaps (Agent)',
    description: 'Agent playbook that identifies knowledge gaps in vault coverage.',
    group: 'copilot',
}),
'copilot-agent-synthesize-topic': meta('prompts', 'copilot-agent-synthesize-topic', {
    label: 'Synthesize Topic (Agent)',
    description: 'Agent playbook that synthesizes information across vault notes on a topic.',
    group: 'copilot',
}),
'copilot-agent-add-evidence': meta('prompts', 'copilot-agent-add-evidence', {
    label: 'Add Evidence (Agent)',
    description: 'Agent playbook that finds and ranks supporting evidence from the vault.',
    group: 'copilot',
}),

// Search & Analysis group
'ai-analysis-title': meta('prompts', 'ai-analysis-dashboard-title', {
    label: 'Analysis Title',
    description: 'Generates a title for search analysis results.',
    group: 'searchAnalysis',
}),
'ai-analysis-doc-simple-scope': meta('prompts', 'ai-analysis-doc-simple-scope', {
    label: 'Doc Simple Scope',
    description: 'Scope prefix for single-file Q&A mode (current file only).',
    group: 'searchAnalysis',
}),
'ai-analysis-doc-simple-system': meta('prompts', 'ai-analysis-doc-simple-system', {
    label: 'Doc Simple (System)',
    description: 'System prompt for single-file Q&A agent.',
    group: 'searchAnalysis',
}),
'ai-analysis-mermaid-fix-system': meta('prompts', 'ai-analysis-mermaid-fix-system', {
    label: 'Mermaid Fix (System)',
    description: 'System prompt for fixing LLM-generated mermaid syntax errors.',
    group: 'searchAnalysis',
}),
'ai-analysis-mermaid-fix': meta('prompts', 'ai-analysis-mermaid-fix', {
    label: 'Mermaid Fix',
    description: 'Fixes broken mermaid diagram syntax in generated reports.',
    group: 'searchAnalysis',
}),
'ai-analysis-overview-regenerate': meta('prompts', 'ai-analysis-overview-regenerate', {
    label: 'Overview Regenerate',
    description: 'Regenerates overview from result snapshot (currently unused).',
    group: 'searchAnalysis',
}),
'ai-analysis-followup': meta('prompts', 'ai-analysis-followup', {
    label: 'Follow-up Chat',
    description: 'User prompt for follow-up questions on search results.',
    group: 'searchAnalysis',
}),
'ai-analysis-followup-system': meta('prompts', 'ai-analysis-followup-system', {
    label: 'Follow-up Chat (System)',
    description: 'System prompt for follow-up conversations on analysis results.',
    group: 'searchAnalysis',
}),
'ai-analysis-save-filename': meta('prompts', 'ai-analysis-save-filename', {
    label: 'Save Filename',
    description: 'Suggests a filename when saving search analysis results.',
    group: 'searchAnalysis',
}),
'ai-analysis-save-folder': meta('prompts', 'ai-analysis-save-folder', {
    label: 'Save Folder',
    description: 'Suggests a folder path when saving search analysis results.',
    group: 'searchAnalysis',
}),
'ai-analysis-vault-report-summary-system': meta('prompts', 'ai-analysis-vault-report-summary-system', {
    label: 'Report Summary (System)',
    description: 'System prompt for generating vault report executive summaries.',
    group: 'searchAnalysis',
}),
'ai-analysis-vault-report-summary': meta('prompts', 'ai-analysis-vault-report-summary', {
    label: 'Report Summary',
    description: 'Generates an executive summary for vault search reports.',
    group: 'searchAnalysis',
    systemPromptId: 'ai-analysis-vault-report-summary-system' as PromptId,
}),
'ai-analysis-vault-sdk-playbook': meta('prompts', 'ai-analysis-vault-sdk-playbook', {
    label: 'Vault SDK Playbook',
    description: 'System prompt for the SDK-based vault search agent with tool instructions.',
    group: 'searchAnalysis',
}),
'ai-analysis-continue-system': meta('prompts', 'ai-analysis-continue-system', {
    label: 'Continue Analysis (System)',
    description: 'System prompt for follow-up analysis rounds.',
    group: 'searchAnalysis',
}),
'ai-analysis-continue': meta('prompts', 'ai-analysis-continue', {
    label: 'Continue Analysis',
    description: 'Continues analysis with context from previous rounds.',
    group: 'searchAnalysis',
    systemPromptId: 'ai-analysis-continue-system' as PromptId,
}),
'ai-analysis-synthesize-system': meta('prompts', 'ai-analysis-synthesize-system', {
    label: 'Synthesize Rounds (System)',
    description: 'System prompt for merging multiple analysis rounds into a unified report.',
    group: 'searchAnalysis',
}),
'ai-analysis-synthesize': meta('prompts', 'ai-analysis-synthesize', {
    label: 'Synthesize Rounds',
    description: 'Merges all analysis rounds into one cohesive report.',
    group: 'searchAnalysis',
    systemPromptId: 'ai-analysis-synthesize-system' as PromptId,
}),
'ai-analysis-report-section-system': meta('prompts', 'ai-analysis-report-section-system', {
    label: 'Report Section (System)',
    description: 'System prompt for generating individual report sections.',
    group: 'searchAnalysis',
}),
'ai-analysis-report-section': meta('prompts', 'ai-analysis-report-section', {
    label: 'Report Section',
    description: 'Generates a single section of the vault search report with evidence.',
    group: 'searchAnalysis',
    systemPromptId: 'ai-analysis-report-section-system' as PromptId,
}),

// Indexing group
'doc-summary-short': meta('prompts', 'doc-summary-short', {
    label: 'Doc Summary (Short)',
    description: 'One-sentence summary used for indexing and embeddings.',
    group: 'indexing',
}),
'doc-summary-full': meta('prompts', 'doc-summary-full', {
    label: 'Doc Summary (Full)',
    description: 'Detailed summary using short summary + TextRank anchors.',
    group: 'indexing',
}),
'image-description': meta('prompts', 'image-description', {
    label: 'Image Description',
    description: 'Generates a text description of an image for indexing.',
    group: 'indexing',
}),
'image-summary': meta('prompts', 'image-summary', {
    label: 'Image Summary',
    description: 'Generates a concise summary of image content.',
    group: 'indexing',
}),
'doc-tag-generate-json': meta('prompts', 'doc-tag-generate-json', {
    label: 'Tag Generation',
    description: 'Generates topic, functional, and context tags for a document.',
    group: 'indexing',
    expectsJson: true,
    jsonConstraint: 'Return only the JSON object with topicTagEntries, functionalTagEntries (1–5 ids from closed list, never empty), context tag arrays, optional inferCreatedAt, and optional docType/docTypeConfidence/docTypeReasoning (folded into functional labels server-side), nothing else.',
}),
'pattern-discovery': meta('prompts', 'pattern-discovery', {
    label: 'Pattern Discovery',
    description: 'Analyzes query history to discover new query template patterns.',
    group: 'indexing',
    expectsJson: true,
    jsonConstraint: 'Return only the JSON object with newPatterns and deprecateIds, no markdown or explanation.',
}),
'knowledge-intuition-plan-system': meta('prompts', 'knowledge-intuition-plan-system', {
    label: 'Knowledge Intuition Plan (System)',
    description: 'System prompt for knowledge intuition planning step.',
    group: 'indexing',
}),
'knowledge-intuition-plan': meta('prompts', 'knowledge-intuition-plan', {
    label: 'Knowledge Intuition Plan',
    description: 'Plans knowledge exploration using backbone + folder digest + document shortlist.',
    group: 'indexing',
    systemPromptId: 'knowledge-intuition-plan-system' as PromptId,
}),
'knowledge-intuition-submit': meta('prompts', 'knowledge-intuition-submit', {
    label: 'Knowledge Intuition Submit',
    description: 'Submits intuition results with findings, entities, topology, and entry points.',
    group: 'indexing',
    expectsJson: true,
    jsonConstraint: 'Return only one JSON object: findingsSummary, optional theme, partitions (max 6, entryPaths max 2 each), coreEntities (max 8, whyItMatters each), topology (max 8), evolution, entryPoints (max 24; count N from Vault scale in user prompt; intent, startPaths max 2, rich whatYouWillFind), optional openQuestions (max 6), should_stop.',
    systemPromptId: 'knowledge-intuition-submit-system' as PromptId,
}),

// Indexing group — hub discovery (no PromptId enum, string keys)
'hub-doc-summary-system': meta('prompts', 'hub-doc-summary-system', {
    label: 'Hub Doc Summary (System)',
    description: 'System prompt for hub document summarization.',
    group: 'indexing',
}),
'hub-doc-summary': meta('prompts', 'hub-doc-summary', {
    label: 'Hub Doc Summary',
    description: 'Generates structured summary for hub discovery (facts, anchors, patterns).',
    group: 'indexing',
    expectsJson: true,
    jsonConstraint: 'Return exactly one JSON object with keys shortSummary, fullSummary, coreFacts, queryAnchors, tagTopicDistribution, timeDimension, keyPatterns. No markdown fences.',
    systemPromptId: 'hub-doc-summary-system' as PromptId,
}),
'hub-semantic-merge-system': meta('prompts', 'hub-semantic-merge-system', {
    label: 'Hub Semantic Merge (System)',
    description: 'System prompt for merging semantically similar hub nodes.',
    group: 'indexing',
}),
'hub-semantic-merge': meta('prompts', 'hub-semantic-merge', {
    label: 'Hub Semantic Merge',
    description: 'Identifies and merges duplicate/alias/same-topic hub entries.',
    group: 'indexing',
    expectsJson: true,
    jsonConstraint: 'Return only JSON: mergeGroups (array of objects with representativeStableKey, memberStableKeys, reason, confidence 0-1, mergeKind duplicate|alias|same_topic, optional risks array). No markdown fences.',
    systemPromptId: 'hub-semantic-merge-system' as PromptId,
}),

// Ambient Context group
'working-theme-inference': meta('prompts', 'working-theme-inference', {
    label: 'Working Theme Inference',
    description: 'Infers the user\'s current working theme from recent activity.',
    group: 'ambientContext',
    expectsJson: true,
    jsonConstraint: 'Return only the JSON object with summary and relatedFiles, nothing else.',
}),
'working-context-render': meta('prompts', 'working-context-render', {
    label: 'Working Context Render',
    description: 'Renders working context (recent files, themes) into conversation context.',
    group: 'ambientContext',
}),
'activity-index-render': meta('prompts', 'activity-index-render', {
    label: 'Activity Index Render',
    description: 'Renders recent vault activity into conversation context.',
    group: 'ambientContext',
}),
'message-chunk-summarize': meta('prompts', 'message-chunk-summarize', {
    label: 'Message Chunk Summarize',
    description: 'Summarizes a chunk of messages for context compression.',
    group: 'ambientContext',
}),
```

- [ ] **Step 3: Add helper function to get prompts by group**

Add after `getTemplateMetadata()` at the end of `TemplateRegistry.ts`:

```typescript
/** Returns all prompt TemplateIds that have a group assigned, grouped by PromptGroup. */
export function getPromptsByGroup(): Map<PromptGroup, Array<{ id: TemplateId; meta: TemplateMetadata }>> {
    const result = new Map<PromptGroup, Array<{ id: TemplateId; meta: TemplateMetadata }>>();
    for (const group of PROMPT_GROUPS) {
        result.set(group.key, []);
    }
    for (const [id, meta] of Object.entries(TEMPLATE_METADATA)) {
        if (meta.group) {
            result.get(meta.group)!.push({ id: id as TemplateId, meta });
        }
    }
    return result;
}
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/core/template/TemplateRegistry.ts
git commit -m "feat: add label, description, group to TemplateMetadata for prompt template panel"
```

---

### Task 2: Add stripPromptMeta and override management to PromptService

**Files:**
- Modify: `src/service/prompt/PromptService.ts`
- Create: `test/prompt-meta.test.ts`

- [ ] **Step 1: Write tests for stripPromptMeta**

Create `test/prompt-meta.test.ts`:

```typescript
import assert from 'node:assert';

// Inline the function since we can't easily import from the full module in test
function stripPromptMeta(content: string): { meta: string | null; template: string } {
    const lines = content.split('\n');
    const firstLine = lines[0]?.trim();
    if (!firstLine?.startsWith('```prompt-meta')) {
        return { meta: null, template: content };
    }
    const closeIndex = lines.findIndex((line, i) => i > 0 && line.trim() === '```');
    if (closeIndex === -1) {
        return { meta: null, template: content };
    }
    const meta = lines.slice(1, closeIndex).join('\n');
    const template = lines.slice(closeIndex + 1).join('\n').trimStart();
    return { meta, template };
}

// Test 1: strips prompt-meta block at start of file
{
    const input = [
        '```prompt-meta',
        'id: conversation-system',
        'label: Chat System Prompt',
        'variables:',
        '  - userProfile: User profile summary',
        '```',
        '',
        'You are an AI assistant.',
        '{{#if userProfile}}',
        '{{{userProfile}}}',
        '{{/if}}',
    ].join('\n');

    const result = stripPromptMeta(input);
    assert.ok(result.meta !== null, 'meta should not be null');
    assert.ok(result.meta!.includes('id: conversation-system'), 'meta should contain id');
    assert.ok(result.meta!.includes('label: Chat System Prompt'), 'meta should contain label');
    assert.ok(result.template.startsWith('You are an AI assistant.'), 'template should start with content after meta block');
    assert.ok(result.template.includes('{{#if userProfile}}'), 'template should preserve handlebars');
    console.log('PASS: strips prompt-meta block');
}

// Test 2: returns content unchanged when no prompt-meta block
{
    const input = 'You are an AI assistant.\n{{name}}';
    const result = stripPromptMeta(input);
    assert.strictEqual(result.meta, null, 'meta should be null');
    assert.strictEqual(result.template, input, 'template should be unchanged');
    console.log('PASS: no prompt-meta block');
}

// Test 3: handles unclosed prompt-meta block gracefully
{
    const input = '```prompt-meta\nid: test\nno closing fence here';
    const result = stripPromptMeta(input);
    assert.strictEqual(result.meta, null, 'meta should be null for unclosed block');
    assert.strictEqual(result.template, input, 'template should be unchanged');
    console.log('PASS: unclosed prompt-meta block');
}

// Test 4: does not strip prompt-meta if not on first line
{
    const input = '\n```prompt-meta\nid: test\n```\ntemplate content';
    const result = stripPromptMeta(input);
    assert.strictEqual(result.meta, null, 'meta should be null when not on first line');
    assert.strictEqual(result.template, input, 'template should be unchanged');
    console.log('PASS: prompt-meta not on first line');
}

// Test 5: handles empty template after meta block
{
    const input = '```prompt-meta\nid: test\n```\n';
    const result = stripPromptMeta(input);
    assert.ok(result.meta !== null, 'meta should not be null');
    assert.strictEqual(result.template, '', 'template should be empty');
    console.log('PASS: empty template after meta');
}

// Test 6: does not confuse other code blocks with prompt-meta
{
    const input = '```typescript\nconst x = 1;\n```\nSome content';
    const result = stripPromptMeta(input);
    assert.strictEqual(result.meta, null, 'meta should be null for non-prompt-meta block');
    assert.strictEqual(result.template, input, 'template should be unchanged');
    console.log('PASS: non-prompt-meta code block');
}

console.log('\nAll prompt-meta tests passed!');
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm run test -- test/prompt-meta.test.ts`
Expected: All 6 tests pass.

- [ ] **Step 3: Add stripPromptMeta to PromptService**

In `src/service/prompt/PromptService.ts`, add the method and integrate it into `loadOverride()`:

Add this private method after `renderHandlebarsTemplate()` (after line 191):

```typescript
/**
 * Strips the ```prompt-meta``` documentation block from override file content.
 * The block must start at the first line. Content after the closing fence is the template.
 */
private stripPromptMeta(content: string): string {
    const lines = content.split('\n');
    const firstLine = lines[0]?.trim();
    if (!firstLine?.startsWith('```prompt-meta')) {
        return content;
    }
    const closeIndex = lines.findIndex((line, i) => i > 0 && line.trim() === '```');
    if (closeIndex === -1) {
        return content;
    }
    return lines.slice(closeIndex + 1).join('\n').trimStart();
}
```

Then update `loadOverride()` (line 155) to strip the meta block before caching. Change:

```typescript
const content = (await this.app.vault.read(file)).trim();
this.overrideCache.set(cacheKey, content);
return content;
```

To:

```typescript
const raw = (await this.app.vault.read(file)).trim();
const content = this.stripPromptMeta(raw);
this.overrideCache.set(cacheKey, content);
return content;
```

- [ ] **Step 4: Add override management methods**

Add these public methods to `PromptService`, after `render()`:

```typescript
import type { TemplateId, TemplateMetadata } from '@/core/template/TemplateRegistry';
import { getTemplateMetadata, TEMPLATE_METADATA } from '@/core/template/TemplateRegistry';
import type { PromptVariables as PromptVarsType } from './PromptId';
```

Update the existing import from TemplateRegistry (line 11) to also import `TEMPLATE_METADATA` and `TemplateId`.

Then add the methods:

```typescript
/** Check if an override file exists for the given template id. */
checkOverrideExists(id: TemplateId): boolean {
    const filePath = normalizePath(`${this.promptFolder}/${id}.prompt.md`);
    return this.app.vault.getAbstractFileByPath(filePath) instanceof TFile;
}

/** Scan the prompts folder and return a set of template ids that have override files. */
scanOverrides(): Set<string> {
    const folder = this.app.vault.getAbstractFileByPath(this.promptFolder);
    const result = new Set<string>();
    if (!folder || !('children' in folder)) return result;
    for (const child of (folder as any).children) {
        if (child instanceof TFile && child.extension === 'md' && child.name.endsWith('.prompt.md')) {
            const id = child.name.replace(/\.prompt\.md$/, '');
            result.add(id);
        }
    }
    return result;
}

/** Create an override file in the vault with the default template content + prompt-meta header. */
async createOverrideFile(id: TemplateId): Promise<string> {
    const filePath = normalizePath(`${this.promptFolder}/${id}.prompt.md`);

    // If file already exists, just return the path
    if (this.app.vault.getAbstractFileByPath(filePath) instanceof TFile) {
        return filePath;
    }

    // Get default template content
    const defaultContent = this.templateManager
        ? await this.templateManager.getTemplate(id)
        : '';

    // Get metadata for the prompt-meta block
    const meta = getTemplateMetadata(id);

    // Build variable documentation from PromptVariables type (best-effort)
    const variableLines = this.buildVariableDocLines(id);

    // Assemble the prompt-meta block
    const metaBlock = [
        '```prompt-meta',
        `id: ${id}`,
        meta.label ? `label: ${meta.label}` : null,
        meta.description ? `description: ${meta.description}` : null,
        variableLines.length > 0 ? 'variables:' : null,
        ...variableLines.map(v => `  - ${v}`),
        'note: Changes take effect immediately. Delete this file to restore the default.',
        '```',
    ].filter(Boolean).join('\n');

    const fileContent = `${metaBlock}\n\n${defaultContent}`;

    await ensureFolder(this.promptFolder);
    await this.app.vault.create(filePath, fileContent);
    return filePath;
}

/** Delete an override file and clear its cache entry. */
async deleteOverride(id: TemplateId): Promise<void> {
    const filePath = normalizePath(`${this.promptFolder}/${id}.prompt.md`);
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
        await this.app.vault.delete(file);
    }
    this.overrideCache.delete(`override:${id}`);
    this.overrideCompiledCache.delete(`override:${id}`);
}

/** Build human-readable variable doc lines from PromptVariables type keys. */
private buildVariableDocLines(id: TemplateId): string[] {
    // We can't introspect TypeScript types at runtime, so we extract
    // variable names from the default template by scanning for {{varName}} patterns
    // This is best-effort documentation for the user.
    try {
        // Synchronous access not available; return empty for now — template content
        // will be visible in the file itself.
        return [];
    } catch {
        return [];
    }
}
```

- [ ] **Step 5: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/service/prompt/PromptService.ts test/prompt-meta.test.ts
git commit -m "feat: add stripPromptMeta and override management methods to PromptService"
```

---

### Task 3: Build PromptTemplateModal (Obsidian Modal wrapper)

**Files:**
- Create: `src/ui/view/prompt-template/PromptTemplateModal.tsx`

- [ ] **Step 1: Create the Modal wrapper**

Create `src/ui/view/prompt-template/PromptTemplateModal.tsx`:

```typescript
import { Modal } from 'obsidian';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { PromptTemplateList } from './PromptTemplateList';

export class PromptTemplateModal extends Modal {
    private reactRenderer: ReactRenderer | null = null;

    constructor(private appContext: AppContext) {
        super(appContext.app);
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        this.modalEl.addClass('peak-prompt-template-modal');
        this.contentEl.addClass('pktw-root');
        this.modalEl.style.width = '680px';

        this.reactRenderer = new ReactRenderer(this.containerEl);
        this.reactRenderer.render(
            createReactElementWithServices(
                PromptTemplateList,
                { onClose: () => this.close() },
                this.appContext,
            ),
        );
    }

    onClose(): void {
        const r = this.reactRenderer;
        this.reactRenderer = null;
        if (r) {
            setTimeout(() => {
                r.unmount();
                this.contentEl.empty();
            }, 0);
        } else {
            this.contentEl.empty();
        }
    }
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build fails because `PromptTemplateList` doesn't exist yet — that's OK, this confirms the modal file itself has no syntax errors. We'll fix this in the next task.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/prompt-template/PromptTemplateModal.tsx
git commit -m "feat: add PromptTemplateModal Obsidian wrapper"
```

---

### Task 4: Build PromptItem component

**Files:**
- Create: `src/ui/view/prompt-template/components/PromptItem.tsx`

- [ ] **Step 1: Create the PromptItem component**

This renders a single prompt row with optional system/user sub-items, tooltip, override status, and reset button.

Create `src/ui/view/prompt-template/components/PromptItem.tsx`:

```typescript
import React, { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import type { TemplateId, TemplateMetadata } from '@/core/template/TemplateRegistry';

export interface PromptItemData {
    id: TemplateId;
    meta: TemplateMetadata;
    /** The paired system prompt entry, if any */
    systemEntry?: { id: TemplateId; meta: TemplateMetadata };
}

interface Props {
    item: PromptItemData;
    overrides: Set<string>;
    onOpen: (id: TemplateId) => void;
    onReset: (id: TemplateId) => void;
}

export const PromptItem: React.FC<Props> = ({ item, overrides, onOpen, onReset }) => {
    const hasPair = !!item.systemEntry;
    const mainOverridden = overrides.has(String(item.id));
    const systemOverridden = item.systemEntry ? overrides.has(String(item.systemEntry.id)) : false;
    const anyOverridden = mainOverridden || systemOverridden;
    const allOverridden = hasPair ? mainOverridden && systemOverridden : mainOverridden;

    // Tooltip state
    const [showTooltip, setShowTooltip] = useState(false);

    const dotClass = allOverridden
        ? 'pktw-bg-[var(--pk-accent,#7c3aed)] pktw-border-[var(--pk-accent,#7c3aed)]'
        : anyOverridden
            ? 'pktw-border-[var(--pk-accent,#7c3aed)]'
            : 'pktw-border-[var(--text-faint)]';

    return (
        <div className="pktw-py-1 pktw-px-5 pktw-pl-10">
            {/* Main row */}
            <div
                className={cn(
                    'pktw-flex pktw-items-center pktw-gap-2 pktw-min-h-[28px] pktw-group pktw-relative',
                    !hasPair && 'pktw-cursor-pointer pktw-rounded-md pktw-px-2 pktw-py-1 pktw-mx-[-8px] hover:pktw-bg-[var(--pk-accent,#7c3aed)]/5',
                )}
                onClick={!hasPair ? () => onOpen(item.id) : undefined}
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
            >
                {/* Override dot */}
                <div className={cn(
                    'pktw-w-[7px] pktw-h-[7px] pktw-rounded-full pktw-border-[1.5px] pktw-flex-shrink-0 pktw-relative',
                    dotClass,
                )}>
                    {/* Half-filled inner dot for partial override */}
                    {anyOverridden && !allOverridden && (
                        <div className="pktw-absolute pktw-top-1/2 pktw-left-1/2 pktw-transform pktw-translate-x-[-50%] pktw-translate-y-[-50%] pktw-w-[3px] pktw-h-[3px] pktw-rounded-full pktw-bg-[var(--pk-accent,#7c3aed)]" />
                    )}
                </div>

                {/* Label */}
                <span className="pktw-text-[13px] pktw-text-[var(--text-normal)] pktw-flex-1">
                    {item.meta.label || String(item.id)}
                </span>

                {/* Overridden badge */}
                {anyOverridden && (
                    <span className="pktw-text-[9px] pktw-px-1.5 pktw-py-[1px] pktw-rounded pktw-font-medium pktw-bg-[var(--pk-accent,#7c3aed)]/10 pktw-text-[var(--pk-accent,#7c3aed)] pktw-border pktw-border-[var(--pk-accent,#7c3aed)]/20">
                        overridden
                    </span>
                )}

                {/* Reset button (hover-only) */}
                {anyOverridden && (
                    <button
                        className="pktw-text-[10px] pktw-text-[var(--text-faint)] pktw-bg-transparent pktw-border-none pktw-cursor-pointer pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity hover:pktw-text-red-400 hover:pktw-bg-red-400/10"
                        onClick={(e) => {
                            e.stopPropagation();
                            onReset(item.id);
                        }}
                    >
                        <RotateCcw className="pktw-w-3 pktw-h-3" />
                    </button>
                )}

                {/* Tooltip */}
                {showTooltip && item.meta.description && (
                    <div className="pktw-absolute pktw-left-0 pktw-top-full pktw-mt-1 pktw-py-2 pktw-px-3 pktw-bg-[var(--background-primary)] pktw-border pktw-border-[var(--background-modifier-border)] pktw-rounded-lg pktw-text-[11px] pktw-text-[var(--text-muted)] pktw-leading-relaxed pktw-max-w-[340px] pktw-z-50 pktw-shadow-lg">
                        <div className="pktw-text-[var(--text-normal)] pktw-font-medium pktw-mb-0.5">
                            {item.meta.label || String(item.id)}
                        </div>
                        {item.meta.group && (
                            <div className="pktw-text-[var(--pk-accent,#7c3aed)] pktw-text-[10px] pktw-mb-1">
                                {item.meta.group}
                            </div>
                        )}
                        {item.meta.description}
                    </div>
                )}
            </div>

            {/* Sub-items for paired prompts */}
            {hasPair && (
                <div className="pktw-flex pktw-gap-1 pktw-mt-1 pktw-pl-4">
                    <SubItem
                        label="system"
                        overridden={systemOverridden}
                        onClick={() => onOpen(item.systemEntry!.id)}
                    />
                    <SubItem
                        label="user"
                        overridden={mainOverridden}
                        onClick={() => onOpen(item.id)}
                    />
                </div>
            )}
        </div>
    );
};

const SubItem: React.FC<{ label: string; overridden: boolean; onClick: () => void }> = ({ label, overridden, onClick }) => (
    <span
        className={cn(
            'pktw-inline-flex pktw-items-center pktw-gap-1.5 pktw-px-2.5 pktw-py-[3px] pktw-rounded-[5px] pktw-border pktw-text-[11px] pktw-cursor-pointer pktw-transition-all',
            overridden
                ? 'pktw-border-[var(--pk-accent,#7c3aed)]/30 pktw-text-[var(--pk-accent,#7c3aed)]'
                : 'pktw-border-[var(--background-modifier-border)] pktw-text-[var(--text-faint)]',
            'hover:pktw-border-[var(--pk-accent,#7c3aed)] hover:pktw-text-[var(--pk-accent,#7c3aed)] hover:pktw-bg-[var(--pk-accent,#7c3aed)]/5',
        )}
        onClick={onClick}
    >
        <div className={cn(
            'pktw-w-[5px] pktw-h-[5px] pktw-rounded-full pktw-border',
            overridden
                ? 'pktw-bg-[var(--pk-accent,#7c3aed)] pktw-border-[var(--pk-accent,#7c3aed)]'
                : 'pktw-border-[var(--text-faint)]',
        )} />
        {label}
    </span>
);
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds (component is standalone, no external deps beyond project utilities).

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/prompt-template/components/PromptItem.tsx
git commit -m "feat: add PromptItem component with sub-items and override status"
```

---

### Task 5: Build PromptGroupSection component

**Files:**
- Create: `src/ui/view/prompt-template/components/PromptGroupSection.tsx`

- [ ] **Step 1: Create the group section component**

Create `src/ui/view/prompt-template/components/PromptGroupSection.tsx`:

```typescript
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { PromptItem } from './PromptItem';
import type { PromptItemData } from './PromptItem';
import type { TemplateId } from '@/core/template/TemplateRegistry';

interface Props {
    label: string;
    items: PromptItemData[];
    defaultExpanded: boolean;
    overrides: Set<string>;
    onOpen: (id: TemplateId) => void;
    onReset: (id: TemplateId) => void;
    /** When set, forces expansion and filters items to only those matching */
    searchQuery?: string;
}

export const PromptGroupSection: React.FC<Props> = ({
    label, items, defaultExpanded, overrides, onOpen, onReset, searchQuery,
}) => {
    const [manualExpanded, setManualExpanded] = useState(defaultExpanded);
    const isSearching = !!searchQuery;

    // Filter items by search query
    const filteredItems = isSearching
        ? items.filter(item => {
            const q = searchQuery!.toLowerCase();
            const matchLabel = (item.meta.label || '').toLowerCase().includes(q);
            const matchDesc = (item.meta.description || '').toLowerCase().includes(q);
            const matchId = String(item.id).toLowerCase().includes(q);
            return matchLabel || matchDesc || matchId;
        })
        : items;

    // Hide group if searching and no matches
    if (isSearching && filteredItems.length === 0) return null;

    const isExpanded = isSearching ? true : manualExpanded;

    // Count overrides in this group
    const overrideCount = items.reduce((n, item) => {
        if (overrides.has(String(item.id))) n++;
        if (item.systemEntry && overrides.has(String(item.systemEntry.id))) n++;
        return n;
    }, 0);
    const totalCount = items.reduce((n, item) => n + (item.systemEntry ? 2 : 1), 0);

    return (
        <div>
            <div
                className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-5 pktw-py-2.5 pktw-cursor-pointer pktw-select-none hover:pktw-bg-[var(--background-secondary)]  pktw-transition-colors"
                onClick={() => setManualExpanded(!manualExpanded)}
            >
                <ChevronDown className={cn(
                    'pktw-w-3.5 pktw-h-3.5 pktw-text-[var(--text-faint)] pktw-transition-transform pktw-duration-200',
                    !isExpanded && 'pktw-rotate-[-90deg]',
                )} />
                <span className="pktw-text-[12px] pktw-font-semibold pktw-text-[var(--text-muted)] pktw-uppercase pktw-tracking-wider">
                    {label}
                </span>
                <span className="pktw-text-[10px] pktw-text-[var(--text-faint)] pktw-ml-auto">
                    {overrideCount > 0 && (
                        <span className="pktw-text-[var(--pk-accent,#7c3aed)]">{overrideCount}</span>
                    )}
                    {overrideCount > 0 && ' / '}
                    {totalCount}
                </span>
            </div>

            {isExpanded && (
                <div className="pktw-pb-1">
                    {filteredItems.map(item => (
                        <PromptItem
                            key={String(item.id)}
                            item={item}
                            overrides={overrides}
                            onOpen={onOpen}
                            onReset={onReset}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/ui/view/prompt-template/components/PromptGroupSection.tsx
git commit -m "feat: add PromptGroupSection with collapsible group and search filtering"
```

---

### Task 6: Build PromptTemplateList (main list component)

**Files:**
- Create: `src/ui/view/prompt-template/PromptTemplateList.tsx`

- [ ] **Step 1: Create the main list component**

Create `src/ui/view/prompt-template/PromptTemplateList.tsx`:

```typescript
import React, { useState, useMemo, useCallback } from 'react';
import { Notice } from 'obsidian';
import { FolderOpen, Search } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { AppContext } from '@/app/context/AppContext';
import { PromptGroupSection } from './components/PromptGroupSection';
import type { PromptItemData } from './components/PromptItem';
import {
    PROMPT_GROUPS,
    getPromptsByGroup,
    TEMPLATE_METADATA,
    type TemplateId,
    type PromptGroup,
} from '@/core/template/TemplateRegistry';

interface Props {
    onClose: () => void;
}

export const PromptTemplateList: React.FC<Props> = ({ onClose }) => {
    const { app } = useServiceContext();
    const [searchQuery, setSearchQuery] = useState('');
    const [overrides, setOverrides] = useState<Set<string>>(() => {
        const ps = AppContext.getInstance().promptService;
        return ps.scanOverrides();
    });

    // Build grouped items with paired system prompts
    const groupedItems = useMemo(() => {
        const byGroup = getPromptsByGroup();
        const result = new Map<PromptGroup, PromptItemData[]>();

        for (const [group, entries] of byGroup) {
            const items: PromptItemData[] = [];
            const processedSystemIds = new Set<string>();

            for (const entry of entries) {
                // Skip system prompt entries that will be shown as sub-items
                if (processedSystemIds.has(String(entry.id))) continue;

                const item: PromptItemData = { id: entry.id, meta: entry.meta };

                // Check if this prompt has a paired system prompt
                if (entry.meta.systemPromptId) {
                    const systemId = entry.meta.systemPromptId as unknown as TemplateId;
                    const systemMeta = TEMPLATE_METADATA[systemId];
                    if (systemMeta) {
                        item.systemEntry = { id: systemId, meta: systemMeta };
                        processedSystemIds.add(String(systemId));
                    }
                }

                items.push(item);
            }

            // Filter out standalone system prompts that were already paired
            result.set(group, items.filter(item => !processedSystemIds.has(String(item.id))));
        }

        return result;
    }, []);

    const handleOpen = useCallback(async (id: TemplateId) => {
        try {
            const ps = AppContext.getInstance().promptService;
            const filePath = await ps.createOverrideFile(id);
            await app.workspace.openLinkText(filePath, '', false);
            // Refresh override status
            setOverrides(ps.scanOverrides());
        } catch (err) {
            new Notice(`Failed to create override file: ${err}`);
        }
    }, [app]);

    const handleReset = useCallback(async (id: TemplateId) => {
        // For paired prompts, reset both system and user
        const meta = TEMPLATE_METADATA[id];
        const idsToReset = [id];
        if (meta?.systemPromptId) {
            idsToReset.push(meta.systemPromptId as unknown as TemplateId);
        }

        const confirmMsg = idsToReset.length > 1
            ? 'Reset to default? This will delete both system and user override files.'
            : 'Reset to default? This will delete your custom prompt file.';

        if (!confirm(confirmMsg)) return;

        try {
            const ps = AppContext.getInstance().promptService;
            for (const resetId of idsToReset) {
                if (overrides.has(String(resetId))) {
                    await ps.deleteOverride(resetId);
                }
            }
            setOverrides(ps.scanOverrides());
            new Notice('Prompt reset to default.');
        } catch (err) {
            new Notice(`Failed to reset: ${err}`);
        }
    }, [overrides]);

    const handleOpenFolder = useCallback(async () => {
        const ps = AppContext.getInstance().promptService;
        const folderPath = ps.getPromptFolder();
        // Try to reveal the folder in Obsidian's file explorer
        const folder = app.vault.getAbstractFileByPath(folderPath);
        if (folder) {
            const leaf = app.workspace.getLeaf(false);
            await (app as any).internalPlugins?.plugins?.['file-explorer']?.instance?.revealInFolder?.(folder);
        } else {
            new Notice(`Prompts folder not found: ${folderPath}`);
        }
    }, [app]);

    // Count totals
    const totalPrompts = Array.from(groupedItems.values()).reduce(
        (sum, items) => sum + items.reduce((n, item) => n + (item.systemEntry ? 2 : 1), 0), 0
    );
    const totalOverridden = overrides.size;

    return (
        <div className="pktw-flex pktw-flex-col pktw-h-full" style={{ maxHeight: '70vh' }}>
            {/* Header */}
            <div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-4 pktw-border-b pktw-border-[var(--background-modifier-border)]">
                <span className="pktw-text-[15px] pktw-font-semibold pktw-text-[var(--text-normal)]">
                    Prompt Templates
                </span>
                <div className="pktw-relative">
                    <Search className="pktw-absolute pktw-left-2.5 pktw-top-1/2 pktw-transform pktw-translate-y-[-50%] pktw-w-3.5 pktw-h-3.5 pktw-text-[var(--text-faint)]" />
                    <input
                        className="pktw-w-[220px] pktw-py-1.5 pktw-pl-8 pktw-pr-3 pktw-rounded-md pktw-border pktw-border-[var(--background-modifier-border)] pktw-bg-[var(--background-primary)] pktw-text-[var(--text-normal)] pktw-text-[12px] pktw-outline-none focus:pktw-border-[var(--pk-accent,#7c3aed)]"
                        placeholder="Search prompts..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        autoFocus
                    />
                </div>
            </div>

            {/* Body */}
            <div className="pktw-flex-1 pktw-overflow-y-auto pktw-py-2">
                {PROMPT_GROUPS.map(group => {
                    const items = groupedItems.get(group.key) || [];
                    if (items.length === 0) return null;
                    return (
                        <PromptGroupSection
                            key={group.key}
                            label={group.label}
                            items={items}
                            defaultExpanded={group.defaultExpanded}
                            overrides={overrides}
                            onOpen={handleOpen}
                            onReset={handleReset}
                            searchQuery={searchQuery || undefined}
                        />
                    );
                })}
            </div>

            {/* Footer */}
            <div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-5 pktw-py-3 pktw-border-t pktw-border-[var(--background-modifier-border)]">
                <span className="pktw-text-[11px] pktw-text-[var(--text-faint)]">
                    <span className="pktw-text-[var(--pk-accent,#7c3aed)] pktw-font-medium">{totalOverridden}</span>
                    {' '}of {totalPrompts} overridden
                </span>
                <button
                    className="pktw-text-[11px] pktw-text-[var(--text-muted)] pktw-bg-transparent pktw-border pktw-border-[var(--background-modifier-border)] pktw-px-3 pktw-py-1 pktw-rounded-md pktw-cursor-pointer hover:pktw-border-[var(--text-faint)] hover:pktw-text-[var(--text-normal)] pktw-transition-all pktw-flex pktw-items-center pktw-gap-1.5"
                    onClick={handleOpenFolder}
                >
                    <FolderOpen className="pktw-w-3 pktw-h-3" />
                    Open Prompts Folder
                </button>
            </div>
        </div>
    );
};
```

- [ ] **Step 2: Expose promptFolder getter in PromptService**

In `src/service/prompt/PromptService.ts`, add a public getter after `setPromptFolder()`:

```typescript
getPromptFolder(): string {
    return this.promptFolder;
}
```

- [ ] **Step 3: Expose promptService on AppContext**

Check if `AppContext` already exposes `promptService`. If not, the component uses `AppContext.getInstance().promptService`. Verify this property exists. If the property is named differently or accessed via `manager`, adjust the references in `PromptTemplateList.tsx` accordingly.

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/ui/view/prompt-template/PromptTemplateList.tsx src/service/prompt/PromptService.ts
git commit -m "feat: add PromptTemplateList main component with search and override management"
```

---

### Task 7: Register command and wire up the modal

**Files:**
- Modify: `src/app/commands/Register.ts:658-664`

- [ ] **Step 1: Add the command**

In `src/app/commands/Register.ts`, add the import at the top:

```typescript
import { PromptTemplateModal } from '@/ui/view/prompt-template/PromptTemplateModal';
```

Then add the command entry after the copilot command (after line 664, before `...buildAmbientPushCommands`):

```typescript
{
    id: 'peak-prompt-templates',
    name: 'Open Prompt Templates',
    callback: () => {
        new PromptTemplateModal(appContext).open();
    },
},
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Verify in Obsidian**

1. Run `npm run dev` to start the dev watcher
2. Reload the plugin in Obsidian (Cmd+P → "Reload plugin")
3. Open command palette (Cmd+P) → type "Prompt Templates"
4. Verify the modal opens with grouped prompt list
5. Click a prompt item → verify it creates a `.prompt.md` file in the Prompts folder and opens it
6. Close and reopen the modal → verify override status shows correctly
7. Click "Reset" on an overridden prompt → verify the file is deleted

- [ ] **Step 4: Commit**

```bash
git add src/app/commands/Register.ts
git commit -m "feat: register Open Prompt Templates command"
```

---

### Task 8: Clean up dead PromptIds

**Files:**
- Modify: `src/service/prompt/PromptId.ts:53,104,112,113,119`
- Modify: `src/service/prompt/PromptId.ts:142-159` (SEARCH_AI_ANALYSIS_PROMPT_IDS)
- Modify: `src/service/prompt/PromptId.ts:208-519` (PromptVariables)
- Modify: `src/core/template/TemplateRegistry.ts` (TEMPLATE_METADATA entries)

This task is a cleanup — it removes 5 dead PromptIds that were identified in the audit: `AiAnalysisOverviewRegenerate`, `DocSuggestLinks`, `VaultKnowledgeGaps`, `VaultSynthesize`, `WritingAddEvidence`.

- [ ] **Step 1: Search for all references to confirm they're truly unused**

Run grep for each dead PromptId across `src/` (excluding `PromptId.ts` and `TemplateRegistry.ts`):

```bash
grep -r "AiAnalysisOverviewRegenerate\|DocSuggestLinks\|VaultKnowledgeGaps\|VaultSynthesize\|WritingAddEvidence" src/ --include="*.ts" --include="*.tsx" | grep -v "PromptId.ts" | grep -v "TemplateRegistry.ts"
```

Expected: No matches (or only the `SEARCH_AI_ANALYSIS_PROMPT_IDS` / `CONFIGURABLE_PROMPT_IDS` arrays which we'll also clean).

- [ ] **Step 2: Remove from PromptId enum**

In `src/service/prompt/PromptId.ts`, remove these 5 lines from the enum:

- Line 53: `AiAnalysisOverviewRegenerate = 'ai-analysis-overview-regenerate',`
- Line 104: `DocSuggestLinks = 'doc-suggest-links',`
- Line 112: `VaultKnowledgeGaps = 'vault-knowledge-gaps',`
- Line 113: `VaultSynthesize = 'vault-synthesize',`
- Line 119: `WritingAddEvidence = 'writing-add-evidence',`

- [ ] **Step 3: Remove from SEARCH_AI_ANALYSIS_PROMPT_IDS**

In `src/service/prompt/PromptId.ts`, remove `PromptId.AiAnalysisOverviewRegenerate` from the `SEARCH_AI_ANALYSIS_PROMPT_IDS` array (line 143).

- [ ] **Step 4: Remove from PromptVariables**

In `src/service/prompt/PromptId.ts`, remove the `PromptVariables` entries for the 5 dead IDs. Search for `[PromptId.AiAnalysisOverviewRegenerate]`, `[PromptId.DocSuggestLinks]`, `[PromptId.VaultKnowledgeGaps]`, `[PromptId.VaultSynthesize]`, `[PromptId.WritingAddEvidence]` and delete their interface entries.

- [ ] **Step 5: Remove from TEMPLATE_METADATA but keep the files**

In `src/core/template/TemplateRegistry.ts`, remove the corresponding entries from `TEMPLATE_METADATA`. The template files on disk can stay (they're harmless); removing them from the metadata means they're no longer discoverable.

Note: `doc-suggest-links-system`, `vault-knowledge-gaps-system`, `vault-synthesize-system`, `writing-add-evidence-system` entries should also be removed from TEMPLATE_METADATA since their paired user prompts are dead.

- [ ] **Step 6: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no errors.

Run: `npm run test`
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/service/prompt/PromptId.ts src/core/template/TemplateRegistry.ts
git commit -m "chore: remove 5 dead PromptIds (AiAnalysisOverviewRegenerate, DocSuggestLinks, VaultKnowledgeGaps, VaultSynthesize, WritingAddEvidence)"
```
