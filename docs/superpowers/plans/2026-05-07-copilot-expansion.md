# Copilot Panel Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the Copilot panel from 5 hardcoded document actions to 15 registry-driven actions across Document/Vault/Writing categories, with context-aware recommendation starring.

**Architecture:** Replace hardcoded action arrays with a `CopilotActionRegistry` singleton. Each action is a self-describing object with `relevance()`, `guard()`, `execute()`, and `ResultPanel`. The picker modal reads from the registry, groups by category, and stars high-relevance actions.

**Tech Stack:** React 18, Zustand (not needed here), Zod schemas, Lucide React icons, Obsidian API, Vercel AI SDK / Agent SDK via `AIServiceManager`

**Spec:** `docs/superpowers/specs/2026-05-07-copilot-expansion-design.md`

---

## File Structure

### New Files

```
src/service/copilot/
  CopilotActionRegistry.ts         — Registry singleton + interfaces (DocumentContext, CopilotAction, ActionResult)
  DocumentContextBuilder.ts        — Builds DocumentContext from active file + metadataCache
  actions/
    index.ts                       — Imports and registers all 15 actions
    suggest-tags.ts                — Migrated from copilot-commands.ts
    suggest-links.ts               — Migrated
    suggest-split.ts               — Migrated
    review-article.ts              — Migrated
    polish-document.ts             — Migrated
    summarize.ts                   — NEW
    extract-concepts.ts            — NEW
    translate.ts                   — NEW
    find-related.ts                — NEW
    knowledge-gaps.ts              — NEW
    synthesize-topic.ts            — NEW
    vault-health.ts                — NEW
    continue-writing.ts            — NEW
    rewrite-selection.ts           — NEW
    add-evidence.ts                — NEW

src/ui/view/copilot/panels/
    SummarizePanel.tsx             — NEW
    ExtractConceptsPanel.tsx       — NEW
    TranslatePanel.tsx             — NEW (reuses PolishPanel layout)
    FindRelatedPanel.tsx           — NEW
    KnowledgeGapsPanel.tsx         — NEW
    SynthesizePanel.tsx            — NEW
    VaultHealthPanel.tsx           — NEW
    ContinueWritingPanel.tsx       — NEW
    RewriteSelectionPanel.tsx      — NEW (reuses PolishPanel layout)
    AddEvidencePanel.tsx           — NEW

templates/prompts/
    doc-summarize.md + doc-summarize-system.md
    doc-extract-concepts.md + doc-extract-concepts-system.md
    doc-translate.md + doc-translate-system.md
    vault-knowledge-gaps.md + vault-knowledge-gaps-system.md
    vault-synthesize.md + vault-synthesize-system.md
    vault-health.md + vault-health-system.md
    writing-continue.md + writing-continue-system.md
    writing-rewrite.md + writing-rewrite-system.md
    writing-add-evidence.md + writing-add-evidence-system.md

templates/config/
    translate-languages.json       — NEW
```

### Modified Files

```
src/service/prompt/PromptId.ts:110-476          — Add 18 new PromptId entries + PromptVariables
src/core/template/TemplateRegistry.ts:204-214   — Register 18 new templates
src/service/copilot/copilot-schemas.ts:49       — Add 4 new Zod schemas
src/ui/view/copilot/CopilotPickerModal.tsx      — Rewrite to use registry, sectioned grid, recommendations
src/ui/view/copilot/CopilotResultModal.tsx       — Simplify to generic panel rendering via action.ResultPanel
src/app/commands/copilot-commands.ts             — Simplify to registry-based dispatcher
src/app/commands/Register.ts:740-747            — Minor: adjust copilot registration
```

---

## Task 1: CopilotActionRegistry + DocumentContextBuilder

**Files:**
- Create: `src/service/copilot/CopilotActionRegistry.ts`
- Create: `src/service/copilot/DocumentContextBuilder.ts`

- [ ] **Step 1: Create CopilotActionRegistry.ts**

```ts
import type { TFile } from 'obsidian';
import type { LucideIcon } from 'lucide-react';

export interface DocumentContext {
	file: TFile;
	title: string;
	content: string;
	selection?: string;
	scope: 'full' | 'selection';
	wordCount: number;
	tags: string[];
	links: string[];
	backlinks: number;
	headingCount: number;
	isOrphan: boolean;
	frontmatter: Record<string, any>;
}

export type ProgressCallback = (text: string) => void;

export type ActionResult =
	| { type: 'structured'; data: any }
	| { type: 'stream'; text: string }
	| { type: 'error'; message: string };

export interface CopilotAction {
	id: string;
	label: string;
	description: string;
	icon: LucideIcon;
	category: 'document' | 'vault' | 'writing';
	relevance(ctx: DocumentContext): number;
	guard?(ctx: DocumentContext): string | null;
	execute(ctx: DocumentContext, progress: ProgressCallback): Promise<ActionResult>;
	ResultPanel: React.ComponentType<{ result: any; ctx: DocumentContext; onClose: () => void }>;
}

export class CopilotActionRegistry {
	private static instance: CopilotActionRegistry;
	private actions = new Map<string, CopilotAction>();

	static getInstance(): CopilotActionRegistry {
		if (!this.instance) this.instance = new CopilotActionRegistry();
		return this.instance;
	}

	register(action: CopilotAction): void {
		this.actions.set(action.id, action);
	}

	get(id: string): CopilotAction | undefined {
		return this.actions.get(id);
	}

	getAll(): CopilotAction[] {
		return Array.from(this.actions.values());
	}

	getByCategory(cat: 'document' | 'vault' | 'writing'): CopilotAction[] {
		return this.getAll().filter(a => a.category === cat);
	}

	rank(ctx: DocumentContext): Array<{ action: CopilotAction; score: number }> {
		return this.getAll()
			.map(action => ({ action, score: action.relevance(ctx) }))
			.sort((a, b) => b.score - a.score);
	}
}
```

- [ ] **Step 2: Create DocumentContextBuilder.ts**

```ts
import type { App, TFile } from 'obsidian';

import type { DocumentContext } from './CopilotActionRegistry';

export class DocumentContextBuilder {
	static build(app: App, file: TFile, content: string, selection?: string): DocumentContext {
		const cache = app.metadataCache.getFileCache(file);
		const tags = (cache?.frontmatter?.tags as string[] ?? [])
			.concat((cache?.tags ?? []).map(t => t.tag.replace(/^#/, '')));
		const links = (cache?.links ?? []).map(l => l.link);
		const backlinks = Object.keys(
			(app.metadataCache as any).getBacklinksForFile?.(file)?.data ?? {}
		).length;
		const headingCount = cache?.headings?.length ?? 0;
		const wordCount = content.split(/\s+/).filter(Boolean).length;

		return {
			file,
			title: file.basename,
			content,
			selection: selection || undefined,
			scope: selection ? 'selection' : 'full',
			wordCount,
			tags: [...new Set(tags)],
			links,
			backlinks,
			headingCount,
			isOrphan: backlinks === 0,
			frontmatter: cache?.frontmatter ?? {},
		};
	}
}
```

- [ ] **Step 3: Commit**

```bash
git add src/service/copilot/CopilotActionRegistry.ts src/service/copilot/DocumentContextBuilder.ts
git commit -m "feat(copilot): add CopilotActionRegistry and DocumentContextBuilder"
```

---

## Task 2: Add All New PromptIds + TemplateRegistry Entries

**Files:**
- Modify: `src/service/prompt/PromptId.ts:110-476`
- Modify: `src/core/template/TemplateRegistry.ts:204-214`

- [ ] **Step 1: Add PromptId enum entries after line 120**

Add after `DocSuggestTagsSystem = 'doc-suggest-tags-system'` (line 120):

```ts
	// Copilot Document Intelligence — New
	DocSummarize = 'doc-summarize',
	DocSummarizeSystem = 'doc-summarize-system',
	DocExtractConcepts = 'doc-extract-concepts',
	DocExtractConceptsSystem = 'doc-extract-concepts-system',
	DocTranslate = 'doc-translate',
	DocTranslateSystem = 'doc-translate-system',

	// Copilot Vault Intelligence
	VaultKnowledgeGaps = 'vault-knowledge-gaps',
	VaultKnowledgeGapsSystem = 'vault-knowledge-gaps-system',
	VaultSynthesize = 'vault-synthesize',
	VaultSynthesizeSystem = 'vault-synthesize-system',
	VaultHealth = 'vault-health',
	VaultHealthSystem = 'vault-health-system',

	// Copilot Writing Assistance
	WritingContinue = 'writing-continue',
	WritingContinueSystem = 'writing-continue-system',
	WritingRewrite = 'writing-rewrite',
	WritingRewriteSystem = 'writing-rewrite-system',
	WritingAddEvidence = 'writing-add-evidence',
	WritingAddEvidenceSystem = 'writing-add-evidence-system',
```

- [ ] **Step 2: Add PromptVariables entries after the existing copilot block (~line 476)**

```ts
	[PromptId.DocSummarize]: {
		content: string;
		title?: string;
		scope: string;
		length: string;
	};
	[PromptId.DocExtractConcepts]: {
		content: string;
		title?: string;
	};
	[PromptId.DocTranslate]: {
		content: string;
		title?: string;
		scope: string;
		targetLanguage: string;
	};
	[PromptId.VaultKnowledgeGaps]: {
		content: string;
		title?: string;
		relatedNotes: string;
	};
	[PromptId.VaultSynthesize]: {
		topic: string;
		sources: string;
	};
	[PromptId.VaultHealth]: {
		stats: string;
	};
	[PromptId.WritingContinue]: {
		content: string;
		title?: string;
	};
	[PromptId.WritingRewrite]: {
		selection: string;
		content: string;
		title?: string;
		style: string;
	};
	[PromptId.WritingAddEvidence]: {
		context: string;
		sources: string;
	};
```

- [ ] **Step 3: Register templates in TemplateRegistry.ts after line 214**

Add after `'doc-suggest-tags-system': meta('prompts', 'doc-suggest-tags-system')`:

```ts
	// Copilot Document Intelligence — New
	'doc-summarize': meta('prompts', 'doc-summarize', { systemPromptId: 'doc-summarize-system' as PromptId }),
	'doc-summarize-system': meta('prompts', 'doc-summarize-system'),
	'doc-extract-concepts': meta('prompts', 'doc-extract-concepts', { expectsJson: true, systemPromptId: 'doc-extract-concepts-system' as PromptId }),
	'doc-extract-concepts-system': meta('prompts', 'doc-extract-concepts-system'),
	'doc-translate': meta('prompts', 'doc-translate', { systemPromptId: 'doc-translate-system' as PromptId }),
	'doc-translate-system': meta('prompts', 'doc-translate-system'),

	// Copilot Vault Intelligence
	'vault-knowledge-gaps': meta('prompts', 'vault-knowledge-gaps', { expectsJson: true, systemPromptId: 'vault-knowledge-gaps-system' as PromptId }),
	'vault-knowledge-gaps-system': meta('prompts', 'vault-knowledge-gaps-system'),
	'vault-synthesize': meta('prompts', 'vault-synthesize', { systemPromptId: 'vault-synthesize-system' as PromptId }),
	'vault-synthesize-system': meta('prompts', 'vault-synthesize-system'),
	'vault-health': meta('prompts', 'vault-health', { expectsJson: true, systemPromptId: 'vault-health-system' as PromptId }),
	'vault-health-system': meta('prompts', 'vault-health-system'),

	// Copilot Writing Assistance
	'writing-continue': meta('prompts', 'writing-continue', { systemPromptId: 'writing-continue-system' as PromptId }),
	'writing-continue-system': meta('prompts', 'writing-continue-system'),
	'writing-rewrite': meta('prompts', 'writing-rewrite', { systemPromptId: 'writing-rewrite-system' as PromptId }),
	'writing-rewrite-system': meta('prompts', 'writing-rewrite-system'),
	'writing-add-evidence': meta('prompts', 'writing-add-evidence', { expectsJson: true, systemPromptId: 'writing-add-evidence-system' as PromptId }),
	'writing-add-evidence-system': meta('prompts', 'writing-add-evidence-system'),
```

- [ ] **Step 4: Commit**

```bash
git add src/service/prompt/PromptId.ts src/core/template/TemplateRegistry.ts
git commit -m "feat(copilot): register 18 new PromptIds and template entries"
```

---

## Task 3: Add New Zod Schemas

**Files:**
- Modify: `src/service/copilot/copilot-schemas.ts:49`

- [ ] **Step 1: Add 4 new schemas after line 49**

```ts
// --- New Copilot Schemas ---

export const extractConceptsSchema = z.object({
	concepts: z.array(z.object({
		term: z.string().describe('The concept or term'),
		definition: z.string().describe('Concise definition'),
		category: z.string().optional().describe('Optional category like "methodology", "theory", "tool"'),
	})),
});
export type ExtractConcepts = z.infer<typeof extractConceptsSchema>;

export const knowledgeGapsSchema = z.object({
	gaps: z.array(z.object({
		topic: z.string().describe('The missing topic'),
		description: z.string().describe('Why this gap matters'),
		suggestedTitle: z.string().describe('Suggested note title'),
		priority: z.enum(['high', 'medium', 'low']),
	})),
});
export type KnowledgeGaps = z.infer<typeof knowledgeGapsSchema>;

export const vaultHealthSchema = z.object({
	orphans: z.array(z.object({
		path: z.string(),
		title: z.string(),
		lastModified: z.string(),
	})),
	duplicates: z.array(z.object({
		paths: z.array(z.string()),
		reason: z.string(),
	})),
	stale: z.array(z.object({
		path: z.string(),
		title: z.string(),
		daysSinceModified: z.number(),
	})),
	inconsistentTags: z.array(z.object({
		tag: z.string(),
		variants: z.array(z.string()),
	})),
});
export type VaultHealth = z.infer<typeof vaultHealthSchema>;

export const addEvidenceSchema = z.object({
	evidence: z.array(z.object({
		sourceTitle: z.string(),
		sourcePath: z.string(),
		quote: z.string().describe('Relevant quote from the source'),
		insertText: z.string().describe('Formatted text to insert'),
		relevance: z.number().min(0).max(1),
	})),
});
export type AddEvidence = z.infer<typeof addEvidenceSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add src/service/copilot/copilot-schemas.ts
git commit -m "feat(copilot): add Zod schemas for extract-concepts, knowledge-gaps, vault-health, add-evidence"
```

---

## Task 4: Write All Prompt Templates

**Files:**
- Create: 18 new files in `templates/prompts/`
- Create: `templates/config/translate-languages.json`

- [ ] **Step 1: Create doc-summarize prompt pair**

`templates/prompts/doc-summarize-system.md`:
```markdown
You are a document summarizer for a personal knowledge base. Generate clear, informative summaries that capture the key ideas.

Rules:
- Preserve any [[wikilinks]] in the summary
- Match the language of the original document
- Return ONLY the summary text, no preamble
- Length guide: "one-line" = 1 sentence, "short" = 2-3 sentences, "detailed" = 1-2 paragraphs
```

`templates/prompts/doc-summarize.md`:
```markdown
Summarize the following {{scope}} of the document "{{title}}".

Desired length: {{length}}

{{{content}}}
```

- [ ] **Step 2: Create doc-extract-concepts prompt pair**

`templates/prompts/doc-extract-concepts-system.md`:
```markdown
You are a concept extractor for a personal knowledge base. Identify key concepts, terms, and ideas that deserve their own notes.

Rules:
- Extract 3-10 concepts depending on document length
- Each concept needs a concise, self-contained definition (1-3 sentences)
- Focus on domain-specific terms, not common words
- Optionally categorize as: methodology, theory, tool, person, concept, framework, etc.
- Return JSON: { "concepts": [{ "term": "...", "definition": "...", "category": "..." }] }
```

`templates/prompts/doc-extract-concepts.md`:
```markdown
Extract the key concepts and terms from the following document "{{title}}".

{{{content}}}
```

- [ ] **Step 3: Create doc-translate prompt pair**

`templates/prompts/doc-translate-system.md`:
```markdown
You are a document translator for a personal knowledge base.

Rules:
- Translate accurately while preserving meaning and tone
- Preserve all [[wikilinks]], #tags, and markdown formatting exactly as-is
- Do not translate proper nouns unless they have standard translations
- Return ONLY the translated text, no preamble or explanation
```

`templates/prompts/doc-translate.md`:
```markdown
Translate the following {{scope}} of "{{title}}" into {{targetLanguage}}.

{{{content}}}
```

- [ ] **Step 4: Create vault-knowledge-gaps prompt pair**

`templates/prompts/vault-knowledge-gaps-system.md`:
```markdown
You are a knowledge gap analyst for a personal knowledge base. Identify topics that are mentioned or implied in a document but not covered by existing notes in the vault.

Rules:
- Focus on substantive gaps, not trivial missing definitions
- Suggest concrete note titles that follow the vault's naming style
- Assign priority: "high" = core dependency, "medium" = useful context, "low" = nice to have
- Return JSON: { "gaps": [{ "topic": "...", "description": "...", "suggestedTitle": "...", "priority": "..." }] }
- Limit to 3-8 gaps
```

`templates/prompts/vault-knowledge-gaps.md`:
```markdown
Analyze the document "{{title}}" and identify knowledge gaps — topics mentioned or implied that are not covered by existing notes.

Existing related notes in the vault:
{{relatedNotes}}

Document content:
{{{content}}}
```

- [ ] **Step 5: Create vault-synthesize prompt pair**

`templates/prompts/vault-synthesize-system.md`:
```markdown
You are a knowledge synthesizer for a personal knowledge base. Combine insights from multiple notes into a coherent, well-structured overview.

Rules:
- Weave insights together, don't just list summaries
- Use [[wikilinks]] to reference source notes (use exact titles)
- Organize with clear headings
- Highlight connections, contradictions, and patterns across sources
- Return ONLY the synthesized article, no preamble
```

`templates/prompts/vault-synthesize.md`:
```markdown
Synthesize the following notes about "{{topic}}" into a coherent overview article.

Source notes:
{{{sources}}}
```

- [ ] **Step 6: Create vault-health prompt pair**

`templates/prompts/vault-health-system.md`:
```markdown
You are a vault health analyzer for a personal knowledge base. Analyze vault metadata to identify structural issues.

Rules:
- Orphans: notes with zero backlinks and no outgoing links (truly isolated)
- Duplicates: notes with very similar titles or overlapping content descriptions
- Stale: notes not modified in 90+ days that appear incomplete (short, no links)
- Inconsistent tags: same concept tagged differently (e.g., #ml vs #machine-learning)
- Return JSON: { "orphans": [...], "duplicates": [...], "stale": [...], "inconsistentTags": [...] }
- Be conservative — only flag clear issues, not false positives
```

`templates/prompts/vault-health.md`:
```markdown
Analyze the following vault metadata and identify structural health issues.

Vault statistics:
{{{stats}}}
```

- [ ] **Step 7: Create writing-continue prompt pair**

`templates/prompts/writing-continue-system.md`:
```markdown
You are a writing assistant for a personal knowledge base. Continue the user's document naturally, matching their tone, style, and level of detail.

Rules:
- Continue seamlessly from where the text ends
- Match the existing writing style (formal/casual, technical/accessible)
- Maintain the document's structure (if using headings, continue with appropriate headings)
- Write 1-3 paragraphs unless the context suggests otherwise
- Preserve any [[wikilinks]] or markdown formatting conventions
- Return ONLY the continuation text, no preamble
```

`templates/prompts/writing-continue.md`:
```markdown
Continue writing the document "{{title}}" from where it ends.

Document so far:
{{{content}}}
```

- [ ] **Step 8: Create writing-rewrite prompt pair**

`templates/prompts/writing-rewrite-system.md`:
```markdown
You are a writing assistant for a personal knowledge base. Rewrite the selected text according to the requested style while preserving the core meaning.

Styles:
- formal: academic/professional tone, precise language
- concise: shorter, tighter, remove redundancy
- detailed: expand with more explanation and examples
- casual: conversational, accessible tone

Rules:
- Preserve all [[wikilinks]], #tags, and markdown formatting
- Keep the same general structure unless the style change requires restructuring
- Return ONLY the rewritten text, no preamble
```

`templates/prompts/writing-rewrite.md`:
```markdown
Rewrite the following selected text from "{{title}}" in a more {{style}} style.

Selected text:
{{{selection}}}

Full document context:
{{{content}}}
```

- [ ] **Step 9: Create writing-add-evidence prompt pair**

`templates/prompts/writing-add-evidence-system.md`:
```markdown
You are a research assistant for a personal knowledge base. Select the most relevant evidence from vault search results to support the user's current writing.

Rules:
- Pick 2-5 most relevant pieces of evidence
- For each, provide: the source note title and path, a direct quote, and formatted insert text
- The insert text should be ready to paste — include the quote and a [[wikilink]] to the source
- Rank by relevance (0-1)
- Return JSON: { "evidence": [{ "sourceTitle": "...", "sourcePath": "...", "quote": "...", "insertText": "...", "relevance": 0.0 }] }
```

`templates/prompts/writing-add-evidence.md`:
```markdown
Find the best evidence from these vault notes to support or enrich the following passage:

Passage:
{{{context}}}

Available sources:
{{{sources}}}
```

- [ ] **Step 10: Create translate-languages.json**

`templates/config/translate-languages.json`:
```json
[
	{ "code": "en", "label": "English" },
	{ "code": "zh", "label": "中文" },
	{ "code": "ja", "label": "日本語" },
	{ "code": "ko", "label": "한국어" },
	{ "code": "es", "label": "Español" },
	{ "code": "fr", "label": "Français" },
	{ "code": "de", "label": "Deutsch" },
	{ "code": "pt", "label": "Português" },
	{ "code": "ru", "label": "Русский" },
	{ "code": "ar", "label": "العربية" }
]
```

- [ ] **Step 11: Commit**

```bash
git add templates/prompts/doc-summarize*.md templates/prompts/doc-extract-concepts*.md templates/prompts/doc-translate*.md templates/prompts/vault-*.md templates/prompts/writing-*.md templates/config/translate-languages.json
git commit -m "feat(copilot): add prompt templates for 9 new actions + translate language config"
```

---

## Task 5: Migrate Existing 5 Actions to Registry

**Files:**
- Create: `src/service/copilot/actions/polish-document.ts`
- Create: `src/service/copilot/actions/review-article.ts`
- Create: `src/service/copilot/actions/suggest-links.ts`
- Create: `src/service/copilot/actions/suggest-split.ts`
- Create: `src/service/copilot/actions/suggest-tags.ts`
- Create: `src/service/copilot/actions/index.ts`
- Modify: `src/app/commands/copilot-commands.ts`

- [ ] **Step 1: Create polish-document.ts**

```ts
import { Sparkles } from 'lucide-react';

import { PolishPanel } from '@/ui/view/copilot/panels/PolishPanel';
import { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import { AppContext } from '@/app/AppContext';
import type { CopilotAction, DocumentContext, ActionResult, ProgressCallback } from '../CopilotActionRegistry';

export const polishDocumentAction: CopilotAction = {
	id: 'polish',
	label: 'Polish Document',
	description: 'Improve clarity and style',
	icon: Sparkles,
	category: 'document',

	relevance(ctx: DocumentContext): number {
		if (ctx.selection) return 0.8;
		if (ctx.wordCount > 200) return 0.5;
		return 0.2;
	},

	async execute(ctx: DocumentContext, progress: ProgressCallback): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().aiServiceManager;
		const vars = { content: ctx.scope === 'selection' ? ctx.selection! : ctx.content, title: ctx.title, scope: ctx.scope };
		let fullText = '';
		for await (const chunk of aiManager.queryTextStream(PromptId.DocPolish, vars)) {
			if (chunk.type === 'delta') {
				fullText += chunk.text;
				progress(fullText);
			}
		}
		return { type: 'stream', text: fullText };
	},

	ResultPanel: PolishPanel as any,
};
```

- [ ] **Step 2: Create review-article.ts**

```ts
import { MessageSquareText } from 'lucide-react';

import { ReviewPanel } from '@/ui/view/copilot/panels/ReviewPanel';
import { PromptId } from '@/service/prompt/PromptId';
import { reviewResultSchema } from '../copilot-schemas';
import { AppContext } from '@/app/AppContext';
import type { CopilotAction, DocumentContext, ActionResult } from '../CopilotActionRegistry';

export const reviewArticleAction: CopilotAction = {
	id: 'review',
	label: 'Review Article',
	description: 'Get structural and content feedback',
	icon: MessageSquareText,
	category: 'document',

	relevance(ctx: DocumentContext): number {
		if (ctx.wordCount > 500) return 0.7;
		if (ctx.wordCount > 300) return 0.5;
		return 0.2;
	},

	async execute(ctx: DocumentContext): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().aiServiceManager;
		const input = ctx.scope === 'selection' ? ctx.selection! : ctx.content;
		const result = await aiManager.queryStructured(
			PromptId.DocReview, { content: input, title: ctx.title, scope: ctx.scope }, reviewResultSchema,
		);
		return { type: 'structured', data: result };
	},

	ResultPanel: ReviewPanel as any,
};
```

- [ ] **Step 3: Create suggest-links.ts**

```ts
import { Link2 } from 'lucide-react';

import { LinkSuggestPanel } from '@/ui/view/copilot/panels/LinkSuggestPanel';
import { PromptId } from '@/service/prompt/PromptId';
import { linkSuggestionsSchema } from '../copilot-schemas';
import { AppContext } from '@/app/AppContext';
import type { CopilotAction, DocumentContext, ActionResult } from '../CopilotActionRegistry';

export const suggestLinksAction: CopilotAction = {
	id: 'suggest-links',
	label: 'Suggest Links',
	description: 'Find potential wiki-link connections',
	icon: Link2,
	category: 'document',

	relevance(ctx: DocumentContext): number {
		if (ctx.isOrphan) return 0.8;
		if (ctx.links.length < 3) return 0.5;
		return 0.2;
	},

	async execute(ctx: DocumentContext): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().aiServiceManager;
		const app = AppContext.getInstance().app;
		const cache = app.metadataCache.getFileCache(ctx.file);
		const existingLinks = (cache?.links ?? []).map(l => l.link).join(', ');
		const result = await aiManager.queryStructured(
			PromptId.DocSuggestLinks,
			{ content: ctx.content, title: ctx.title, existingLinks },
			linkSuggestionsSchema,
		);
		return { type: 'structured', data: result };
	},

	ResultPanel: LinkSuggestPanel as any,
};
```

- [ ] **Step 4: Create suggest-split.ts**

```ts
import { GitFork } from 'lucide-react';

import { SplitPanel } from '@/ui/view/copilot/panels/SplitPanel';
import { PromptId } from '@/service/prompt/PromptId';
import { splitPlanSchema } from '../copilot-schemas';
import { AppContext } from '@/app/AppContext';
import type { CopilotAction, DocumentContext, ActionResult } from '../CopilotActionRegistry';

export const suggestSplitAction: CopilotAction = {
	id: 'suggest-split',
	label: 'Suggest Split',
	description: 'Propose how to split a long document',
	icon: GitFork,
	category: 'document',

	relevance(ctx: DocumentContext): number {
		if (ctx.wordCount > 2000) return 0.8;
		if (ctx.wordCount > 1000) return 0.5;
		return 0.2;
	},

	guard(ctx: DocumentContext): string | null {
		if (ctx.wordCount < 500) return 'Document is too short to split (< 500 words)';
		return null;
	},

	async execute(ctx: DocumentContext): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().aiServiceManager;
		const result = await aiManager.queryStructured(
			PromptId.DocSplitSuggestion,
			{ content: ctx.content, title: ctx.title, wordCount: String(ctx.wordCount) },
			splitPlanSchema,
		);
		return { type: 'structured', data: result };
	},

	ResultPanel: SplitPanel as any,
};
```

- [ ] **Step 5: Create suggest-tags.ts (with TagSuggestionEngine)**

```ts
import { Tag } from 'lucide-react';

import { TagSuggestionPanel } from '@/ui/view/copilot/panels/TagSuggestionPanel';
import { TagSuggestionEngine } from '../TagSuggestionEngine';
import { AppContext } from '@/app/AppContext';
import type { CopilotAction, DocumentContext, ActionResult } from '../CopilotActionRegistry';

export const suggestTagsAction: CopilotAction = {
	id: 'suggest-tags',
	label: 'Suggest Tags',
	description: 'Analyze content and suggest relevant tags',
	icon: Tag,
	category: 'document',

	relevance(ctx: DocumentContext): number {
		if (ctx.tags.length === 0) return 0.9;
		if (ctx.tags.length < 2) return 0.6;
		return 0.2;
	},

	async execute(ctx: DocumentContext): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().aiServiceManager;
		const engine = new TagSuggestionEngine(aiManager);
		const ranked = await engine.suggestTags(ctx.file.path, ctx.content, ctx.title);
		// Convert RankedTagSuggestion[] to TagSuggestions format for the existing panel
		const result = {
			suggestions: ranked.map(r => ({
				tag: r.tag,
				confidence: r.confidence,
				reason: r.reason,
				source: r.sources[0]?.source ?? 'content',
			})),
			summary: `Found ${ranked.length} tag suggestions using content analysis, graph neighbors, and folder history.`,
		};
		return { type: 'structured', data: result };
	},

	ResultPanel: TagSuggestionPanel as any,
};
```

- [ ] **Step 6: Create actions/index.ts**

```ts
import { CopilotActionRegistry } from '../CopilotActionRegistry';
import { polishDocumentAction } from './polish-document';
import { reviewArticleAction } from './review-article';
import { suggestLinksAction } from './suggest-links';
import { suggestSplitAction } from './suggest-split';
import { suggestTagsAction } from './suggest-tags';

export function registerAllCopilotActions(): void {
	const registry = CopilotActionRegistry.getInstance();
	// Document
	registry.register(suggestTagsAction);
	registry.register(suggestLinksAction);
	registry.register(suggestSplitAction);
	registry.register(reviewArticleAction);
	registry.register(polishDocumentAction);
}
```

- [ ] **Step 7: Simplify copilot-commands.ts**

Rewrite `src/app/commands/copilot-commands.ts` to a thin dispatcher:

```ts
import { Command, Notice } from 'obsidian';

import { isDesktop } from '@/core/platform';
import { AppContext } from '@/app/AppContext';
import { CopilotActionRegistry } from '@/service/copilot/CopilotActionRegistry';
import { DocumentContextBuilder } from '@/service/copilot/DocumentContextBuilder';
import { CopilotResultModal } from '@/ui/view/copilot/CopilotResultModal';
import { CopilotActionEvent } from '@/core/eventBus';
import { getSelectedTextFromActiveEditor } from './command-utils';

export function buildCopilotCommands(): Command[] {
	if (!isDesktop()) return [];

	const registry = CopilotActionRegistry.getInstance();

	return registry.getAll().map(action => ({
		id: `peak-copilot-${action.id}`,
		name: `Copilot: ${action.label}`,
		callback: async () => {
			const appContext = AppContext.getInstance();
			const app = appContext.app;
			const file = app.workspace.getActiveFile();
			if (!file) { new Notice('Open a document first'); return; }

			const content = await app.vault.cachedRead(file);
			const selected = getSelectedTextFromActiveEditor(app);
			const ctx = DocumentContextBuilder.build(app, file, content, selected);

			// Guard check
			const guardMsg = action.guard?.(ctx);
			if (guardMsg) { new Notice(guardMsg); return; }

			// Open result modal in loading state
			const modal = new CopilotResultModal(app, {
				action,
				ctx,
			});
			modal.open();

			try {
				const result = await action.execute(ctx, (text) => modal.updateProgress(text));
				if (result.type === 'error') {
					modal.setError(new Error(result.message));
				} else {
					modal.setResult(result.type === 'structured' ? result.data : result.text);
				}
			} catch (e: any) {
				modal.setError(e);
			}

			AppContext.getEventBus().dispatch(new CopilotActionEvent({
				action: action.id, path: file.path, summary: action.label,
			}));
		},
	}));
}
```

**Note:** This changes the `CopilotResultModal` constructor signature — we handle that in Task 6.

- [ ] **Step 8: Commit**

```bash
git add src/service/copilot/actions/ src/app/commands/copilot-commands.ts
git commit -m "feat(copilot): migrate 5 existing actions to registry pattern + wire TagSuggestionEngine"
```

---

## Task 6: Rewrite CopilotResultModal for Generic Panel Rendering

**Files:**
- Modify: `src/ui/view/copilot/CopilotResultModal.tsx`

- [ ] **Step 1: Rewrite CopilotResultModal**

The modal no longer needs `CopilotResultType`, `ACTION_LABELS`, or the switch/case. It receives a `CopilotAction` and renders `action.ResultPanel` directly.

Replace the full content of `CopilotResultModal.tsx`:

```tsx
import { Modal, App } from 'obsidian';
import React, { useState, useEffect } from 'react';
import { Settings, Loader2 } from 'lucide-react';

import { ReactRenderer } from '@/ui/ReactRenderer';
import { createReactElementWithServices } from '@/ui/ServiceProvider';
import { AppContext } from '@/app/AppContext';
import { AuthenticationError } from '@/core/providers/errors';
import { Button } from '@/ui/component/shadcn/button';
import type { CopilotAction, DocumentContext } from '@/service/copilot/CopilotActionRegistry';

interface CopilotResultModalProps {
	action: CopilotAction;
	ctx: DocumentContext;
}

type ModalPhase =
	| { phase: 'loading'; progressText?: string }
	| { phase: 'result'; data: any }
	| { phase: 'error'; error: Error };

const LoadingView: React.FC<{ label: string; progressText?: string }> = ({ label, progressText }) => {
	const [elapsed, setElapsed] = useState(0);
	useEffect(() => {
		const t = setInterval(() => setElapsed(s => s + 1), 1000);
		return () => clearInterval(t);
	}, []);
	return (
		<div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-py-12 pktw-gap-4">
			<Loader2 className="pktw-w-6 pktw-h-6 pktw-animate-spin pktw-text-muted-foreground" />
			<span className="pktw-text-sm pktw-text-muted-foreground">{label}... {elapsed}s</span>
			{progressText && (
				<div className="pktw-mt-4 pktw-w-full pktw-max-h-[200px] pktw-overflow-y-auto pktw-text-sm pktw-text-foreground pktw-whitespace-pre-wrap pktw-px-4">
					{progressText}
				</div>
			)}
		</div>
	);
};

const ErrorView: React.FC<{ error: Error; onClose: () => void }> = ({ error, onClose }) => {
	const isAuth = error instanceof AuthenticationError;
	return (
		<div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-py-12 pktw-gap-4">
			<span className="pktw-text-sm pktw-text-destructive">{error.message}</span>
			{isAuth && (
				<Button variant="outline" size="sm" onClick={() => {
					onClose();
					AppContext.getInstance().app.setting.open();
				}}>
					<Settings className="pktw-w-4 pktw-h-4 pktw-mr-1" /> Open Settings
				</Button>
			)}
		</div>
	);
};

let _currentSetPhase: ((phase: ModalPhase) => void) | null = null;

const CopilotResultContent: React.FC<{
	action: CopilotAction;
	ctx: DocumentContext;
	initialPhase: ModalPhase;
	onClose: () => void;
}> = ({ action, ctx, initialPhase, onClose }) => {
	const [phase, setPhase] = useState<ModalPhase>(initialPhase);
	useEffect(() => { _currentSetPhase = setPhase; return () => { _currentSetPhase = null; }; }, []);

	const Panel = action.ResultPanel;

	return (
		<div className="pktw-flex pktw-flex-col pktw-min-h-[200px]">
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-px-4 pktw-py-2 pktw-border-b">
				<span className="pktw-text-sm pktw-font-medium">{action.label}</span>
			</div>
			<div className="pktw-flex-1 pktw-p-4">
				{phase.phase === 'loading' && <LoadingView label={action.label} progressText={phase.progressText} />}
				{phase.phase === 'error' && <ErrorView error={phase.error} onClose={onClose} />}
				{phase.phase === 'result' && (
					<Panel
						result={phase.data}
						ctx={ctx}
						file={ctx.file}
						scope={ctx.scope}
						originalContent={ctx.content}
						selectedText={ctx.selection}
						onClose={onClose}
					/>
				)}
			</div>
		</div>
	);
};

export class CopilotResultModal extends Modal {
	private renderer: ReactRenderer | null = null;

	constructor(app: App, private props: CopilotResultModalProps) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.style.width = '720px';

		const appContext = AppContext.getInstance();
		this.renderer = new ReactRenderer(
			contentEl,
			createReactElementWithServices(
				appContext,
				React.createElement(CopilotResultContent, {
					action: this.props.action,
					ctx: this.props.ctx,
					initialPhase: { phase: 'loading' },
					onClose: () => this.close(),
				}),
			),
		);
	}

	setResult(data: any): void {
		_currentSetPhase?.({ phase: 'result', data });
	}

	setError(error: Error): void {
		_currentSetPhase?.({ phase: 'error', error });
	}

	updateProgress(text: string): void {
		_currentSetPhase?.({ phase: 'loading', progressText: text });
	}

	onClose(): void {
		_currentSetPhase = null;
		this.renderer?.unmount();
		this.renderer = null;
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/view/copilot/CopilotResultModal.tsx
git commit -m "refactor(copilot): CopilotResultModal uses generic action.ResultPanel rendering"
```

---

## Task 7: Rewrite CopilotPickerModal with Sectioned Grid + Recommendations

**Files:**
- Modify: `src/ui/view/copilot/CopilotPickerModal.tsx`

- [ ] **Step 1: Rewrite CopilotPickerModal**

```tsx
import { Modal } from 'obsidian';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { FileText, FolderOpen, Pen, Star } from 'lucide-react';

import { ReactRenderer } from '@/ui/ReactRenderer';
import { createReactElementWithServices } from '@/ui/ServiceProvider';
import { AppContext } from '@/app/AppContext';
import { CopilotActionRegistry, type CopilotAction, type DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { DocumentContextBuilder } from '@/service/copilot/DocumentContextBuilder';
import { cn } from '@/ui/utils';

const CATEGORY_META = {
	document: { label: 'Document', icon: FileText, color: 'pktw-text-blue-400' },
	vault: { label: 'Vault', icon: FolderOpen, color: 'pktw-text-purple-400' },
	writing: { label: 'Writing', icon: Pen, color: 'pktw-text-green-400' },
} as const;

const CATEGORIES: Array<'document' | 'vault' | 'writing'> = ['document', 'vault', 'writing'];

const CopilotPickerContent: React.FC<{
	onSelect: (action: CopilotAction) => void;
	ctx: DocumentContext | null;
}> = ({ onSelect, ctx }) => {
	const registry = CopilotActionRegistry.getInstance();

	const scored = useMemo(() => {
		if (!ctx) return new Map<string, number>();
		const map = new Map<string, number>();
		registry.rank(ctx).forEach(({ action, score }) => map.set(action.id, score));
		return map;
	}, [ctx]);

	// Flatten all actions for keyboard nav
	const allActions = useMemo(() => {
		return CATEGORIES.flatMap(cat => registry.getByCategory(cat));
	}, []);

	const [selectedIdx, setSelectedIdx] = useState(0);

	const handleKeyDown = useCallback((e: KeyboardEvent) => {
		const cols = 3;
		if (e.key === 'ArrowRight') setSelectedIdx(i => Math.min(i + 1, allActions.length - 1));
		else if (e.key === 'ArrowLeft') setSelectedIdx(i => Math.max(i - 1, 0));
		else if (e.key === 'ArrowDown') setSelectedIdx(i => Math.min(i + cols, allActions.length - 1));
		else if (e.key === 'ArrowUp') setSelectedIdx(i => Math.max(i - cols, 0));
		else if (e.key === 'Enter') {
			e.preventDefault();
			onSelect(allActions[selectedIdx]);
		}
	}, [allActions, selectedIdx, onSelect]);

	useEffect(() => {
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [handleKeyDown]);

	if (!ctx) {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-py-12 pktw-text-sm pktw-text-muted-foreground">
				Open a document first
			</div>
		);
	}

	let flatIdx = 0;

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-4 pktw-py-2">
			{CATEGORIES.map(cat => {
				const actions = registry.getByCategory(cat);
				if (actions.length === 0) return null;
				const meta = CATEGORY_META[cat];
				const CatIcon = meta.icon;

				return (
					<div key={cat}>
						<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-mb-2 pktw-px-1">
							<CatIcon className={cn('pktw-w-3.5 pktw-h-3.5', meta.color)} />
							<span className="pktw-text-[11px] pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">
								{meta.label}
							</span>
						</div>
						<div className="pktw-grid pktw-grid-cols-3 pktw-gap-1.5">
							{actions.map(action => {
								const idx = flatIdx++;
								const score = scored.get(action.id) ?? 0;
								const isRecommended = score > 0.7;
								const isSelected = idx === selectedIdx;
								const Icon = action.icon;

								return (
									<div
										key={action.id}
										className={cn(
											'pktw-flex pktw-flex-col pktw-items-center pktw-gap-1 pktw-py-2.5 pktw-px-2 pktw-rounded-lg pktw-cursor-pointer pktw-transition-colors pktw-relative pktw-text-center',
											'hover:pktw-bg-accent',
											isSelected && 'pktw-bg-accent pktw-ring-1 pktw-ring-ring',
											isRecommended && 'pktw-ring-1 pktw-ring-yellow-500/30',
										)}
										onClick={() => onSelect(action)}
										onMouseEnter={() => setSelectedIdx(idx)}
									>
										{isRecommended && (
											<Star className="pktw-w-3 pktw-h-3 pktw-text-yellow-500 pktw-fill-yellow-500 pktw-absolute pktw-top-1 pktw-right-1.5" />
										)}
										<Icon className={cn('pktw-w-5 pktw-h-5', meta.color)} />
										<span className="pktw-text-xs pktw-font-medium pktw-text-foreground">{action.label}</span>
										<span className="pktw-text-[10px] pktw-text-muted-foreground pktw-leading-tight">{action.description}</span>
									</div>
								);
							})}
						</div>
					</div>
				);
			})}
			<div className="pktw-text-center pktw-text-[10px] pktw-text-muted-foreground pktw-pt-1">
				↑↓←→ navigate &nbsp; ↵ select &nbsp; <span className="pktw-text-yellow-500">★</span> recommended
			</div>
		</div>
	);
};

export class CopilotPickerModal extends Modal {
	private renderer: ReactRenderer | null = null;

	constructor(private appContext: AppContext) {
		super(appContext.app);
	}

	async onOpen(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.style.width = '520px';
		contentEl.addClass('peak-copilot-picker');

		// Build context
		const app = this.appContext.app;
		const file = app.workspace.getActiveFile();
		let ctx: DocumentContext | null = null;
		if (file) {
			const content = await app.vault.cachedRead(file);
			const { getSelectedTextFromActiveEditor } = await import('@/app/commands/command-utils');
			const selected = getSelectedTextFromActiveEditor(app);
			ctx = DocumentContextBuilder.build(app, file, content, selected);
		}

		this.renderer = new ReactRenderer(
			contentEl,
			createReactElementWithServices(
				this.appContext,
				React.createElement(CopilotPickerContent, {
					ctx,
					onSelect: (action: CopilotAction) => {
						this.close();
						// Execute via command system
						app.commands.executeCommandById(`obsidian-peak-assistant:peak-copilot-${action.id}`);
					},
				}),
			),
		);
	}

	onClose(): void {
		this.renderer?.unmount();
		this.renderer = null;
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/view/copilot/CopilotPickerModal.tsx
git commit -m "feat(copilot): sectioned grid picker with category colors and star recommendations"
```

---

## Task 8: Wire Registration into Plugin Startup

**Files:**
- Modify: `src/app/commands/Register.ts:24-25,740-747`

- [ ] **Step 1: Add import and call registerAllCopilotActions**

In `Register.ts`, add import:
```ts
import { registerAllCopilotActions } from '@/service/copilot/actions';
```

Before line 740 (before `...buildCopilotCommands`), add:
```ts
registerAllCopilotActions();
```

Update `buildCopilotCommands` call — it no longer needs `viewManager` and `aiManager` params:
```ts
...buildCopilotCommands(),
```

- [ ] **Step 2: Commit**

```bash
git add src/app/commands/Register.ts
git commit -m "feat(copilot): wire registry initialization into plugin startup"
```

---

## Task 9: Summarize Action

**Files:**
- Create: `src/service/copilot/actions/summarize.ts`
- Create: `src/ui/view/copilot/panels/SummarizePanel.tsx`

- [ ] **Step 1: Create SummarizePanel.tsx**

```tsx
import React, { useState } from 'react';
import { Copy, ArrowUpToLine } from 'lucide-react';

import { Button } from '@/ui/component/shadcn/button';
import { AppContext } from '@/app/AppContext';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';

interface SummarizePanelProps {
	result: string;
	ctx: DocumentContext;
	onClose: () => void;
}

export const SummarizePanel: React.FC<SummarizePanelProps> = ({ result, ctx, onClose }) => {
	const [inserted, setInserted] = useState(false);

	const handleCopy = () => {
		navigator.clipboard.writeText(result);
	};

	const handleInsertAtTop = async () => {
		const app = AppContext.getInstance().app;
		const content = await app.vault.cachedRead(ctx.file);
		// Insert after frontmatter (--- ... ---)
		const fmMatch = content.match(/^---\n[\s\S]*?\n---\n/);
		const insertPos = fmMatch ? fmMatch[0].length : 0;
		const newContent = content.slice(0, insertPos) + '\n> [!summary]\n> ' + result.replace(/\n/g, '\n> ') + '\n\n' + content.slice(insertPos);
		await app.vault.modify(ctx.file, newContent);
		setInserted(true);
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-4">
			<div className="pktw-text-sm pktw-text-foreground pktw-whitespace-pre-wrap pktw-leading-relaxed">
				{result}
			</div>
			<div className="pktw-flex pktw-gap-2 pktw-justify-end">
				<Button variant="outline" size="sm" onClick={handleCopy}>
					<Copy className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" /> Copy
				</Button>
				<Button size="sm" onClick={handleInsertAtTop} disabled={inserted}>
					<ArrowUpToLine className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
					{inserted ? 'Inserted' : 'Insert at Top'}
				</Button>
			</div>
		</div>
	);
};
```

- [ ] **Step 2: Create summarize.ts action**

```ts
import { AlignLeft } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { AppContext } from '@/app/AppContext';
import { SummarizePanel } from '@/ui/view/copilot/panels/SummarizePanel';
import type { CopilotAction, DocumentContext, ActionResult, ProgressCallback } from '../CopilotActionRegistry';

export const summarizeAction: CopilotAction = {
	id: 'summarize',
	label: 'Summarize',
	description: 'Generate a summary',
	icon: AlignLeft,
	category: 'document',

	relevance(ctx: DocumentContext): number {
		if (ctx.wordCount > 1500) return 0.8;
		if (ctx.wordCount > 800) return 0.5;
		return 0.2;
	},

	guard(ctx: DocumentContext): string | null {
		if (ctx.wordCount < 100) return 'Document is too short to summarize';
		return null;
	},

	async execute(ctx: DocumentContext, progress: ProgressCallback): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().aiServiceManager;
		const input = ctx.scope === 'selection' ? ctx.selection! : ctx.content;
		let fullText = '';
		for await (const chunk of aiManager.queryTextStream(PromptId.DocSummarize, {
			content: input, title: ctx.title, scope: ctx.scope, length: 'short',
		})) {
			if (chunk.type === 'delta') {
				fullText += chunk.text;
				progress(fullText);
			}
		}
		return { type: 'stream', text: fullText };
	},

	ResultPanel: SummarizePanel as any,
};
```

- [ ] **Step 3: Register in actions/index.ts**

Add import and `registry.register(summarizeAction)` in the Document section.

- [ ] **Step 4: Commit**

```bash
git add src/service/copilot/actions/summarize.ts src/ui/view/copilot/panels/SummarizePanel.tsx src/service/copilot/actions/index.ts
git commit -m "feat(copilot): add Summarize action"
```

---

## Task 10: Extract Concepts Action

**Files:**
- Create: `src/service/copilot/actions/extract-concepts.ts`
- Create: `src/ui/view/copilot/panels/ExtractConceptsPanel.tsx`

- [ ] **Step 1: Create ExtractConceptsPanel.tsx**

```tsx
import React, { useState } from 'react';
import { Check, FileText } from 'lucide-react';

import { Button } from '@/ui/component/shadcn/button';
import { AppContext } from '@/app/AppContext';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import type { ExtractConcepts } from '@/service/copilot/copilot-schemas';

interface ExtractConceptsPanelProps {
	result: ExtractConcepts;
	ctx: DocumentContext;
	onClose: () => void;
}

export const ExtractConceptsPanel: React.FC<ExtractConceptsPanelProps> = ({ result, ctx, onClose }) => {
	const [selected, setSelected] = useState<Set<number>>(new Set(result.concepts.map((_, i) => i)));
	const [created, setCreated] = useState(false);

	const toggle = (i: number) => {
		const next = new Set(selected);
		next.has(i) ? next.delete(i) : next.add(i);
		setSelected(next);
	};

	const handleCreate = async () => {
		const app = AppContext.getInstance().app;
		const folder = ctx.file.parent?.path ?? '';
		for (const i of selected) {
			const c = result.concepts[i];
			const path = folder ? `${folder}/${c.term}.md` : `${c.term}.md`;
			const content = `${c.definition}\n\n---\nExtracted from: [[${ctx.title}]]`;
			if (!app.vault.getAbstractFileByPath(path)) {
				await app.vault.create(path, content);
			}
		}
		setCreated(true);
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-3">
			{result.concepts.map((c, i) => (
				<div
					key={i}
					className="pktw-flex pktw-items-start pktw-gap-3 pktw-p-3 pktw-rounded-lg pktw-bg-accent/50 pktw-cursor-pointer"
					onClick={() => toggle(i)}
				>
					<div className={`pktw-w-4 pktw-h-4 pktw-mt-0.5 pktw-rounded pktw-border pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0 ${selected.has(i) ? 'pktw-bg-primary pktw-border-primary' : 'pktw-border-muted-foreground'}`}>
						{selected.has(i) && <Check className="pktw-w-3 pktw-h-3 pktw-text-primary-foreground" />}
					</div>
					<div className="pktw-flex-1">
						<div className="pktw-flex pktw-items-center pktw-gap-2">
							<span className="pktw-text-sm pktw-font-semibold pktw-text-foreground">{c.term}</span>
							{c.category && (
								<span className="pktw-text-[10px] pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-muted pktw-text-muted-foreground">{c.category}</span>
							)}
						</div>
						<span className="pktw-text-xs pktw-text-muted-foreground pktw-mt-1">{c.definition}</span>
					</div>
				</div>
			))}
			<div className="pktw-flex pktw-justify-end pktw-pt-2">
				<Button size="sm" onClick={handleCreate} disabled={selected.size === 0 || created}>
					<FileText className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
					{created ? 'Created' : `Create ${selected.size} Notes`}
				</Button>
			</div>
		</div>
	);
};
```

- [ ] **Step 2: Create extract-concepts.ts action**

```ts
import { Lightbulb } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { extractConceptsSchema } from '../copilot-schemas';
import { AppContext } from '@/app/AppContext';
import { ExtractConceptsPanel } from '@/ui/view/copilot/panels/ExtractConceptsPanel';
import type { CopilotAction, DocumentContext, ActionResult } from '../CopilotActionRegistry';

export const extractConceptsAction: CopilotAction = {
	id: 'extract-concepts',
	label: 'Extract Concepts',
	description: 'Identify key terms and ideas',
	icon: Lightbulb,
	category: 'document',

	relevance(ctx: DocumentContext): number {
		if (ctx.wordCount > 1000 && ctx.tags.length < 2) return 0.7;
		if (ctx.wordCount > 500) return 0.5;
		return 0.2;
	},

	guard(ctx: DocumentContext): string | null {
		if (ctx.wordCount < 100) return 'Document is too short for concept extraction';
		return null;
	},

	async execute(ctx: DocumentContext): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().aiServiceManager;
		const result = await aiManager.queryStructured(
			PromptId.DocExtractConcepts,
			{ content: ctx.content, title: ctx.title },
			extractConceptsSchema,
		);
		return { type: 'structured', data: result };
	},

	ResultPanel: ExtractConceptsPanel as any,
};
```

- [ ] **Step 3: Register in actions/index.ts, commit**

```bash
git add src/service/copilot/actions/extract-concepts.ts src/ui/view/copilot/panels/ExtractConceptsPanel.tsx src/service/copilot/actions/index.ts
git commit -m "feat(copilot): add Extract Concepts action"
```

---

## Task 11: Translate Action

**Files:**
- Create: `src/service/copilot/actions/translate.ts`
- Create: `src/ui/view/copilot/panels/TranslatePanel.tsx`

- [ ] **Step 1: Create TranslatePanel.tsx**

Reuses PolishPanel's before/after layout but adds a language selector header.

```tsx
import React, { useState } from 'react';
import { Check } from 'lucide-react';

import { Button } from '@/ui/component/shadcn/button';
import { AppContext } from '@/app/AppContext';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';

interface TranslatePanelProps {
	result: string;
	ctx: DocumentContext;
	onClose: () => void;
}

export const TranslatePanel: React.FC<TranslatePanelProps> = ({ result, ctx, onClose }) => {
	const [applied, setApplied] = useState(false);

	const handleApply = async () => {
		const app = AppContext.getInstance().app;
		if (ctx.scope === 'selection') {
			const editor = app.workspace.activeEditor?.editor;
			editor?.replaceSelection(result);
		} else {
			await app.vault.modify(ctx.file, result);
		}
		setApplied(true);
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-4">
			<div className="pktw-grid pktw-grid-cols-2 pktw-gap-4 pktw-max-h-[400px]">
				<div className="pktw-overflow-y-auto pktw-text-xs pktw-text-muted-foreground pktw-whitespace-pre-wrap pktw-p-3 pktw-rounded-lg pktw-bg-muted/30">
					<div className="pktw-text-[10px] pktw-uppercase pktw-tracking-wider pktw-mb-2 pktw-text-muted-foreground">Original</div>
					{ctx.scope === 'selection' ? ctx.selection : ctx.content}
				</div>
				<div className="pktw-overflow-y-auto pktw-text-xs pktw-text-foreground pktw-whitespace-pre-wrap pktw-p-3 pktw-rounded-lg pktw-bg-muted/30">
					<div className="pktw-text-[10px] pktw-uppercase pktw-tracking-wider pktw-mb-2 pktw-text-muted-foreground">Translated</div>
					{result}
				</div>
			</div>
			<div className="pktw-flex pktw-justify-end">
				<Button size="sm" onClick={handleApply} disabled={applied}>
					<Check className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
					{applied ? 'Applied' : 'Apply Translation'}
				</Button>
			</div>
		</div>
	);
};
```

- [ ] **Step 2: Create translate.ts action**

```ts
import { Languages } from 'lucide-react';
import { Notice } from 'obsidian';

import { PromptId } from '@/service/prompt/PromptId';
import { AppContext } from '@/app/AppContext';
import { TranslatePanel } from '@/ui/view/copilot/panels/TranslatePanel';
import type { CopilotAction, DocumentContext, ActionResult, ProgressCallback } from '../CopilotActionRegistry';

// Simple heuristic: check if content has significant non-ASCII (CJK, etc.)
function detectNonLatin(text: string): boolean {
	const nonLatin = text.match(/[\u3000-\u9FFF\uAC00-\uD7AF]/g);
	return (nonLatin?.length ?? 0) / text.length > 0.1;
}

export const translateAction: CopilotAction = {
	id: 'translate',
	label: 'Translate',
	description: 'Translate to another language',
	icon: Languages,
	category: 'document',

	relevance(ctx: DocumentContext): number {
		if (detectNonLatin(ctx.content)) return 0.6;
		return 0.3;
	},

	async execute(ctx: DocumentContext, progress: ProgressCallback): Promise<ActionResult> {
		// For now, default to English if content is CJK, Chinese if content is Latin
		// TODO: in future, show language picker before execution
		const targetLanguage = detectNonLatin(ctx.content) ? 'English' : '中文';

		const aiManager = AppContext.getInstance().aiServiceManager;
		const input = ctx.scope === 'selection' ? ctx.selection! : ctx.content;
		let fullText = '';
		for await (const chunk of aiManager.queryTextStream(PromptId.DocTranslate, {
			content: input, title: ctx.title, scope: ctx.scope, targetLanguage,
		})) {
			if (chunk.type === 'delta') {
				fullText += chunk.text;
				progress(fullText);
			}
		}
		return { type: 'stream', text: fullText };
	},

	ResultPanel: TranslatePanel as any,
};
```

- [ ] **Step 3: Register in actions/index.ts, commit**

```bash
git add src/service/copilot/actions/translate.ts src/ui/view/copilot/panels/TranslatePanel.tsx src/service/copilot/actions/index.ts
git commit -m "feat(copilot): add Translate action"
```

---

## Task 12: Find Related Action

**Files:**
- Create: `src/service/copilot/actions/find-related.ts`
- Create: `src/ui/view/copilot/panels/FindRelatedPanel.tsx`

- [ ] **Step 1: Create FindRelatedPanel.tsx**

```tsx
import React from 'react';
import { ExternalLink } from 'lucide-react';

import { AppContext } from '@/app/AppContext';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';

interface RelatedNote {
	path: string;
	title: string;
	score: number;
	excerpt: string;
}

interface FindRelatedPanelProps {
	result: RelatedNote[];
	ctx: DocumentContext;
	onClose: () => void;
}

export const FindRelatedPanel: React.FC<FindRelatedPanelProps> = ({ result, ctx, onClose }) => {
	const handleOpen = (path: string) => {
		const app = AppContext.getInstance().app;
		const file = app.vault.getAbstractFileByPath(path);
		if (file) {
			app.workspace.getLeaf(false).openFile(file as any);
			onClose();
		}
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			<span className="pktw-text-xs pktw-text-muted-foreground pktw-mb-1">
				{result.length} semantically similar notes found
			</span>
			{result.map((note, i) => (
				<div
					key={i}
					className="pktw-flex pktw-items-start pktw-gap-3 pktw-p-3 pktw-rounded-lg pktw-bg-accent/50 pktw-cursor-pointer hover:pktw-bg-accent pktw-transition-colors"
					onClick={() => handleOpen(note.path)}
				>
					<div className="pktw-flex-1 pktw-min-w-0">
						<div className="pktw-flex pktw-items-center pktw-gap-2">
							<span className="pktw-text-sm pktw-font-medium pktw-text-foreground pktw-truncate">{note.title}</span>
							<span className="pktw-text-[10px] pktw-px-1.5 pktw-py-0.5 pktw-rounded pktw-bg-muted pktw-text-muted-foreground pktw-shrink-0">
								{Math.round(note.score * 100)}%
							</span>
						</div>
						<span className="pktw-text-xs pktw-text-muted-foreground pktw-mt-1 pktw-line-clamp-2">{note.excerpt}</span>
					</div>
					<ExternalLink className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground pktw-shrink-0 pktw-mt-0.5" />
				</div>
			))}
		</div>
	);
};
```

- [ ] **Step 2: Create find-related.ts action**

This action uses vector search directly, no LLM call.

```ts
import { Search } from 'lucide-react';

import { AppContext } from '@/app/AppContext';
import { FindRelatedPanel } from '@/ui/view/copilot/panels/FindRelatedPanel';
import type { CopilotAction, DocumentContext, ActionResult } from '../CopilotActionRegistry';

export const findRelatedAction: CopilotAction = {
	id: 'find-related',
	label: 'Find Related',
	description: 'Discover similar notes',
	icon: Search,
	category: 'vault',

	relevance(ctx: DocumentContext): number {
		if (ctx.isOrphan) return 0.8;
		if (ctx.links.length < 3) return 0.5;
		return 0.3;
	},

	async execute(ctx: DocumentContext): Promise<ActionResult> {
		const appContext = AppContext.getInstance();
		const searchClient = appContext.searchClient;
		const response = await searchClient.vectorSearch({
			query: ctx.content.slice(0, 1000), // Use first 1000 chars as query
			topK: 10,
		});
		const results = (response.items ?? [])
			.filter(item => item.path !== ctx.file.path) // Exclude self
			.map(item => ({
				path: item.path,
				title: item.title ?? item.path.replace(/\.md$/, '').split('/').pop() ?? '',
				score: item.score ?? 0,
				excerpt: item.excerpt ?? item.content?.slice(0, 200) ?? '',
			}));
		return { type: 'structured', data: results };
	},

	ResultPanel: FindRelatedPanel as any,
};
```

- [ ] **Step 3: Register in actions/index.ts, commit**

```bash
git add src/service/copilot/actions/find-related.ts src/ui/view/copilot/panels/FindRelatedPanel.tsx src/service/copilot/actions/index.ts
git commit -m "feat(copilot): add Find Related action (vector search, no LLM)"
```

---

## Task 13: Knowledge Gaps Action

**Files:**
- Create: `src/service/copilot/actions/knowledge-gaps.ts`
- Create: `src/ui/view/copilot/panels/KnowledgeGapsPanel.tsx`

- [ ] **Step 1: Create KnowledgeGapsPanel.tsx**

```tsx
import React, { useState } from 'react';
import { FilePlus, AlertTriangle, AlertCircle, Info } from 'lucide-react';

import { Button } from '@/ui/component/shadcn/button';
import { AppContext } from '@/app/AppContext';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import type { KnowledgeGaps } from '@/service/copilot/copilot-schemas';

const PRIORITY_STYLE = {
	high: { icon: AlertTriangle, color: 'pktw-text-red-400', bg: 'pktw-bg-red-400/10' },
	medium: { icon: AlertCircle, color: 'pktw-text-yellow-400', bg: 'pktw-bg-yellow-400/10' },
	low: { icon: Info, color: 'pktw-text-blue-400', bg: 'pktw-bg-blue-400/10' },
};

interface KnowledgeGapsPanelProps {
	result: KnowledgeGaps;
	ctx: DocumentContext;
	onClose: () => void;
}

export const KnowledgeGapsPanel: React.FC<KnowledgeGapsPanelProps> = ({ result, ctx, onClose }) => {
	const [createdSet, setCreatedSet] = useState<Set<number>>(new Set());

	const handleCreate = async (i: number) => {
		const gap = result.gaps[i];
		const app = AppContext.getInstance().app;
		const folder = ctx.file.parent?.path ?? '';
		const path = folder ? `${folder}/${gap.suggestedTitle}.md` : `${gap.suggestedTitle}.md`;
		if (!app.vault.getAbstractFileByPath(path)) {
			await app.vault.create(path, `# ${gap.suggestedTitle}\n\n${gap.description}\n\n---\nIdentified from: [[${ctx.title}]]`);
		}
		setCreatedSet(prev => new Set(prev).add(i));
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			{result.gaps.map((gap, i) => {
				const style = PRIORITY_STYLE[gap.priority];
				const PriorityIcon = style.icon;
				return (
					<div key={i} className="pktw-flex pktw-items-start pktw-gap-3 pktw-p-3 pktw-rounded-lg pktw-bg-accent/50">
						<PriorityIcon className={`pktw-w-4 pktw-h-4 pktw-mt-0.5 pktw-shrink-0 ${style.color}`} />
						<div className="pktw-flex-1">
							<span className="pktw-text-sm pktw-font-medium pktw-text-foreground">{gap.topic}</span>
							<span className="pktw-text-xs pktw-text-muted-foreground pktw-mt-1 pktw-block">{gap.description}</span>
							<span className="pktw-text-[10px] pktw-text-muted-foreground pktw-mt-1 pktw-block">
								Suggested: <span className="pktw-text-foreground">{gap.suggestedTitle}</span>
							</span>
						</div>
						<Button
							variant="outline" size="sm"
							onClick={() => handleCreate(i)}
							disabled={createdSet.has(i)}
							className="pktw-shrink-0"
						>
							<FilePlus className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
							{createdSet.has(i) ? 'Created' : 'Create'}
						</Button>
					</div>
				);
			})}
		</div>
	);
};
```

- [ ] **Step 2: Create knowledge-gaps.ts action**

```ts
import { HelpCircle } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { knowledgeGapsSchema } from '../copilot-schemas';
import { AppContext } from '@/app/AppContext';
import { KnowledgeGapsPanel } from '@/ui/view/copilot/panels/KnowledgeGapsPanel';
import type { CopilotAction, DocumentContext, ActionResult } from '../CopilotActionRegistry';

export const knowledgeGapsAction: CopilotAction = {
	id: 'knowledge-gaps',
	label: 'Knowledge Gaps',
	description: 'Find missing topics',
	icon: HelpCircle,
	category: 'vault',

	relevance(ctx: DocumentContext): number {
		if (ctx.headingCount > 5) return 0.7;
		if (ctx.headingCount > 3) return 0.5;
		return 0.2;
	},

	async execute(ctx: DocumentContext): Promise<ActionResult> {
		const app = AppContext.getInstance().app;
		// Gather related notes by tag + link overlap
		const cache = app.metadataCache.getFileCache(ctx.file);
		const linkedPaths = new Set<string>();
		(cache?.links ?? []).forEach(l => {
			const resolved = app.metadataCache.getFirstLinkpathDest(l.link, ctx.file.path);
			if (resolved) linkedPaths.add(resolved.path);
		});
		const relatedNotes = Array.from(linkedPaths)
			.map(p => app.vault.getAbstractFileByPath(p))
			.filter(Boolean)
			.map(f => (f as any).basename)
			.join(', ') || 'None found';

		const aiManager = AppContext.getInstance().aiServiceManager;
		const result = await aiManager.queryStructured(
			PromptId.VaultKnowledgeGaps,
			{ content: ctx.content, title: ctx.title, relatedNotes },
			knowledgeGapsSchema,
		);
		return { type: 'structured', data: result };
	},

	ResultPanel: KnowledgeGapsPanel as any,
};
```

- [ ] **Step 3: Register in actions/index.ts, commit**

```bash
git add src/service/copilot/actions/knowledge-gaps.ts src/ui/view/copilot/panels/KnowledgeGapsPanel.tsx src/service/copilot/actions/index.ts
git commit -m "feat(copilot): add Knowledge Gaps action"
```

---

## Task 14: Synthesize Topic Action

**Files:**
- Create: `src/service/copilot/actions/synthesize-topic.ts`
- Create: `src/ui/view/copilot/panels/SynthesizePanel.tsx`

- [ ] **Step 1: Create SynthesizePanel.tsx**

```tsx
import React, { useState } from 'react';
import { FilePlus, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

import { Button } from '@/ui/component/shadcn/button';
import { AppContext } from '@/app/AppContext';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';

interface SynthesizeResult {
	text: string;
	sources: Array<{ path: string; title: string }>;
}

interface SynthesizePanelProps {
	result: SynthesizeResult;
	ctx: DocumentContext;
	onClose: () => void;
}

export const SynthesizePanel: React.FC<SynthesizePanelProps> = ({ result, ctx, onClose }) => {
	const [showSources, setShowSources] = useState(false);
	const [created, setCreated] = useState(false);

	const handleCreateNote = async () => {
		const app = AppContext.getInstance().app;
		const title = `${ctx.title} — Synthesis`;
		const folder = ctx.file.parent?.path ?? '';
		const path = folder ? `${folder}/${title}.md` : `${title}.md`;
		if (!app.vault.getAbstractFileByPath(path)) {
			await app.vault.create(path, result.text);
		}
		setCreated(true);
	};

	const handleOpenSource = (path: string) => {
		const app = AppContext.getInstance().app;
		const file = app.vault.getAbstractFileByPath(path);
		if (file) app.workspace.getLeaf(false).openFile(file as any);
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-4">
			<div className="pktw-text-sm pktw-text-foreground pktw-whitespace-pre-wrap pktw-leading-relaxed pktw-max-h-[400px] pktw-overflow-y-auto">
				{result.text}
			</div>

			{result.sources.length > 0 && (
				<div>
					<div
						className="pktw-flex pktw-items-center pktw-gap-1 pktw-cursor-pointer pktw-text-xs pktw-text-muted-foreground"
						onClick={() => setShowSources(!showSources)}
					>
						{showSources ? <ChevronDown className="pktw-w-3 pktw-h-3" /> : <ChevronRight className="pktw-w-3 pktw-h-3" />}
						{result.sources.length} source notes
					</div>
					{showSources && (
						<div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-mt-2 pktw-pl-4">
							{result.sources.map((s, i) => (
								<div
									key={i}
									className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-cursor-pointer pktw-text-foreground hover:pktw-text-primary"
									onClick={() => handleOpenSource(s.path)}
								>
									<ExternalLink className="pktw-w-3 pktw-h-3" />
									{s.title}
								</div>
							))}
						</div>
					)}
				</div>
			)}

			<div className="pktw-flex pktw-justify-end">
				<Button size="sm" onClick={handleCreateNote} disabled={created}>
					<FilePlus className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
					{created ? 'Created' : 'Create as New Note'}
				</Button>
			</div>
		</div>
	);
};
```

- [ ] **Step 2: Create synthesize-topic.ts action**

Two-phase: vector search → LLM synthesis.

```ts
import { Layers } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { AppContext } from '@/app/AppContext';
import { SynthesizePanel } from '@/ui/view/copilot/panels/SynthesizePanel';
import type { CopilotAction, DocumentContext, ActionResult, ProgressCallback } from '../CopilotActionRegistry';

export const synthesizeTopicAction: CopilotAction = {
	id: 'synthesize',
	label: 'Synthesize Topic',
	description: 'Merge insights from vault',
	icon: Layers,
	category: 'vault',

	relevance(ctx: DocumentContext): number {
		const titleLower = ctx.title.toLowerCase();
		if (/\b(moc|overview|summary|index|hub)\b/i.test(titleLower)) return 0.8;
		if (ctx.tags.length > 0) return 0.4;
		return 0.2;
	},

	guard(ctx: DocumentContext): string | null {
		if (ctx.wordCount < 50) return 'Document needs some content to identify a topic for synthesis';
		return null;
	},

	async execute(ctx: DocumentContext, progress: ProgressCallback): Promise<ActionResult> {
		const appContext = AppContext.getInstance();
		const searchClient = appContext.searchClient;

		progress('Searching vault for related notes...');

		// Phase 1: Find related notes via vector search
		const response = await searchClient.vectorSearch({
			query: ctx.title + ' ' + ctx.content.slice(0, 500),
			topK: 15,
		});
		const sources = (response.items ?? [])
			.filter(item => item.path !== ctx.file.path)
			.slice(0, 10);

		if (sources.length === 0) {
			return { type: 'error', message: 'No related notes found in vault for synthesis' };
		}

		// Build sources text
		const sourcesText = sources.map((item, i) =>
			`### [[${item.title ?? item.path}]]\n${(item.content ?? item.excerpt ?? '').slice(0, 500)}`
		).join('\n\n');

		const sourcesMeta = sources.map(item => ({
			path: item.path,
			title: item.title ?? item.path.replace(/\.md$/, '').split('/').pop() ?? '',
		}));

		progress(`Found ${sources.length} related notes. Synthesizing...`);

		// Phase 2: LLM synthesis
		const aiManager = appContext.aiServiceManager;
		let fullText = '';
		for await (const chunk of aiManager.queryTextStream(PromptId.VaultSynthesize, {
			topic: ctx.title,
			sources: sourcesText,
		})) {
			if (chunk.type === 'delta') {
				fullText += chunk.text;
				progress(fullText);
			}
		}

		return { type: 'structured', data: { text: fullText, sources: sourcesMeta } };
	},

	ResultPanel: SynthesizePanel as any,
};
```

- [ ] **Step 3: Register in actions/index.ts, commit**

```bash
git add src/service/copilot/actions/synthesize-topic.ts src/ui/view/copilot/panels/SynthesizePanel.tsx src/service/copilot/actions/index.ts
git commit -m "feat(copilot): add Synthesize Topic action (vector search + LLM synthesis)"
```

---

## Task 15: Vault Health Action

**Files:**
- Create: `src/service/copilot/actions/vault-health.ts`
- Create: `src/ui/view/copilot/panels/VaultHealthPanel.tsx`

- [ ] **Step 1: Create VaultHealthPanel.tsx**

```tsx
import React, { useState } from 'react';
import { FileQuestion, Copy, Clock, Tags } from 'lucide-react';

import { AppContext } from '@/app/AppContext';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import type { VaultHealth } from '@/service/copilot/copilot-schemas';

const TABS = [
	{ key: 'orphans', label: 'Orphans', icon: FileQuestion },
	{ key: 'duplicates', label: 'Duplicates', icon: Copy },
	{ key: 'stale', label: 'Stale', icon: Clock },
	{ key: 'inconsistentTags', label: 'Tags', icon: Tags },
] as const;

interface VaultHealthPanelProps {
	result: VaultHealth;
	ctx: DocumentContext;
	onClose: () => void;
}

export const VaultHealthPanel: React.FC<VaultHealthPanelProps> = ({ result, onClose }) => {
	const [activeTab, setActiveTab] = useState<string>('orphans');

	const handleOpen = (path: string) => {
		const app = AppContext.getInstance().app;
		const file = app.vault.getAbstractFileByPath(path);
		if (file) app.workspace.getLeaf(false).openFile(file as any);
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-3">
			{/* Tab bar */}
			<div className="pktw-flex pktw-gap-1 pktw-border-b pktw-pb-1">
				{TABS.map(tab => {
					const Icon = tab.icon;
					const count = (result as any)[tab.key]?.length ?? 0;
					return (
						<div
							key={tab.key}
							className={`pktw-flex pktw-items-center pktw-gap-1 pktw-px-3 pktw-py-1.5 pktw-rounded-t pktw-text-xs pktw-cursor-pointer pktw-transition-colors ${activeTab === tab.key ? 'pktw-bg-accent pktw-text-foreground' : 'pktw-text-muted-foreground hover:pktw-text-foreground'}`}
							onClick={() => setActiveTab(tab.key)}
						>
							<Icon className="pktw-w-3.5 pktw-h-3.5" />
							{tab.label}
							<span className="pktw-text-[10px] pktw-px-1 pktw-rounded pktw-bg-muted">{count}</span>
						</div>
					);
				})}
			</div>

			{/* Tab content */}
			<div className="pktw-max-h-[350px] pktw-overflow-y-auto pktw-flex pktw-flex-col pktw-gap-1">
				{activeTab === 'orphans' && result.orphans.map((o, i) => (
					<div key={i} className="pktw-flex pktw-items-center pktw-gap-2 pktw-p-2 pktw-rounded pktw-bg-accent/50 pktw-cursor-pointer hover:pktw-bg-accent" onClick={() => handleOpen(o.path)}>
						<span className="pktw-text-xs pktw-text-foreground pktw-flex-1">{o.title}</span>
						<span className="pktw-text-[10px] pktw-text-muted-foreground">{o.lastModified}</span>
					</div>
				))}
				{activeTab === 'duplicates' && result.duplicates.map((d, i) => (
					<div key={i} className="pktw-flex pktw-flex-col pktw-gap-1 pktw-p-2 pktw-rounded pktw-bg-accent/50">
						<span className="pktw-text-xs pktw-text-muted-foreground">{d.reason}</span>
						{d.paths.map((p, j) => (
							<span key={j} className="pktw-text-xs pktw-text-foreground pktw-cursor-pointer hover:pktw-text-primary pktw-pl-2" onClick={() => handleOpen(p)}>{p}</span>
						))}
					</div>
				))}
				{activeTab === 'stale' && result.stale.map((s, i) => (
					<div key={i} className="pktw-flex pktw-items-center pktw-gap-2 pktw-p-2 pktw-rounded pktw-bg-accent/50 pktw-cursor-pointer hover:pktw-bg-accent" onClick={() => handleOpen(s.path)}>
						<span className="pktw-text-xs pktw-text-foreground pktw-flex-1">{s.title}</span>
						<span className="pktw-text-[10px] pktw-text-muted-foreground">{s.daysSinceModified}d ago</span>
					</div>
				))}
				{activeTab === 'inconsistentTags' && result.inconsistentTags.map((t, i) => (
					<div key={i} className="pktw-flex pktw-items-center pktw-gap-2 pktw-p-2 pktw-rounded pktw-bg-accent/50">
						<span className="pktw-text-xs pktw-font-medium pktw-text-foreground">{t.tag}</span>
						<span className="pktw-text-[10px] pktw-text-muted-foreground">variants: {t.variants.join(', ')}</span>
					</div>
				))}
			</div>
		</div>
	);
};
```

- [ ] **Step 2: Create vault-health.ts action**

```ts
import { Activity } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { vaultHealthSchema } from '../copilot-schemas';
import { AppContext } from '@/app/AppContext';
import { VaultHealthPanel } from '@/ui/view/copilot/panels/VaultHealthPanel';
import type { CopilotAction, DocumentContext, ActionResult, ProgressCallback } from '../CopilotActionRegistry';

export const vaultHealthAction: CopilotAction = {
	id: 'vault-health',
	label: 'Vault Health',
	description: 'Detect structural issues',
	icon: Activity,
	category: 'vault',

	relevance(): number {
		return 0.5; // Always medium — global action
	},

	async execute(ctx: DocumentContext, progress: ProgressCallback): Promise<ActionResult> {
		const app = AppContext.getInstance().app;
		progress('Scanning vault metadata...');

		const files = app.vault.getMarkdownFiles();
		const stats: string[] = [];

		for (const file of files) {
			const cache = app.metadataCache.getFileCache(file);
			const tags = (cache?.frontmatter?.tags as string[] ?? [])
				.concat((cache?.tags ?? []).map(t => t.tag));
			const links = (cache?.links ?? []).map(l => l.link);
			const backlinks = Object.keys(
				(app.metadataCache as any).getBacklinksForFile?.(file)?.data ?? {}
			).length;
			stats.push(`- ${file.path} | tags: ${tags.join(',')} | links: ${links.length} | backlinks: ${backlinks} | modified: ${new Date(file.stat.mtime).toISOString().slice(0, 10)} | size: ${file.stat.size}`);
		}

		progress(`Analyzing ${files.length} notes...`);

		const aiManager = AppContext.getInstance().aiServiceManager;
		const result = await aiManager.queryStructured(
			PromptId.VaultHealth,
			{ stats: stats.join('\n') },
			vaultHealthSchema,
		);
		return { type: 'structured', data: result };
	},

	ResultPanel: VaultHealthPanel as any,
};
```

- [ ] **Step 3: Register in actions/index.ts, commit**

```bash
git add src/service/copilot/actions/vault-health.ts src/ui/view/copilot/panels/VaultHealthPanel.tsx src/service/copilot/actions/index.ts
git commit -m "feat(copilot): add Vault Health action"
```

---

## Task 16: Continue Writing Action

**Files:**
- Create: `src/service/copilot/actions/continue-writing.ts`
- Create: `src/ui/view/copilot/panels/ContinueWritingPanel.tsx`

- [ ] **Step 1: Create ContinueWritingPanel.tsx**

```tsx
import React, { useState } from 'react';
import { Check, X } from 'lucide-react';

import { Button } from '@/ui/component/shadcn/button';
import { AppContext } from '@/app/AppContext';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';

interface ContinueWritingPanelProps {
	result: string;
	ctx: DocumentContext;
	onClose: () => void;
}

export const ContinueWritingPanel: React.FC<ContinueWritingPanelProps> = ({ result, ctx, onClose }) => {
	const [inserted, setInserted] = useState(false);

	const handleInsert = async () => {
		const app = AppContext.getInstance().app;
		const content = await app.vault.cachedRead(ctx.file);
		await app.vault.modify(ctx.file, content + '\n' + result);
		setInserted(true);
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-4">
			<div className="pktw-text-sm pktw-text-foreground pktw-whitespace-pre-wrap pktw-leading-relaxed pktw-p-3 pktw-rounded-lg pktw-bg-accent/30 pktw-border-l-2 pktw-border-primary/50 pktw-max-h-[400px] pktw-overflow-y-auto">
				{result}
			</div>
			<div className="pktw-flex pktw-gap-2 pktw-justify-end">
				<Button variant="outline" size="sm" onClick={onClose}>
					<X className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" /> Discard
				</Button>
				<Button size="sm" onClick={handleInsert} disabled={inserted}>
					<Check className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
					{inserted ? 'Inserted' : 'Insert at End'}
				</Button>
			</div>
		</div>
	);
};
```

- [ ] **Step 2: Create continue-writing.ts action**

```ts
import { ChevronRight } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { AppContext } from '@/app/AppContext';
import { ContinueWritingPanel } from '@/ui/view/copilot/panels/ContinueWritingPanel';
import type { CopilotAction, DocumentContext, ActionResult, ProgressCallback } from '../CopilotActionRegistry';

export const continueWritingAction: CopilotAction = {
	id: 'continue-writing',
	label: 'Continue Writing',
	description: 'Keep writing from here',
	icon: ChevronRight,
	category: 'writing',

	relevance(ctx: DocumentContext): number {
		// High if document has content but appears unfinished
		if (ctx.wordCount > 50 && ctx.wordCount < 2000) return 0.6;
		if (ctx.wordCount > 0) return 0.4;
		return 0.1;
	},

	guard(ctx: DocumentContext): string | null {
		if (ctx.wordCount === 0) return 'Document is empty — write something first';
		return null;
	},

	async execute(ctx: DocumentContext, progress: ProgressCallback): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().aiServiceManager;
		let fullText = '';
		for await (const chunk of aiManager.queryTextStream(PromptId.WritingContinue, {
			content: ctx.content, title: ctx.title,
		})) {
			if (chunk.type === 'delta') {
				fullText += chunk.text;
				progress(fullText);
			}
		}
		return { type: 'stream', text: fullText };
	},

	ResultPanel: ContinueWritingPanel as any,
};
```

- [ ] **Step 3: Register in actions/index.ts, commit**

```bash
git add src/service/copilot/actions/continue-writing.ts src/ui/view/copilot/panels/ContinueWritingPanel.tsx src/service/copilot/actions/index.ts
git commit -m "feat(copilot): add Continue Writing action"
```

---

## Task 17: Rewrite Selection Action

**Files:**
- Create: `src/service/copilot/actions/rewrite-selection.ts`
- Create: `src/ui/view/copilot/panels/RewriteSelectionPanel.tsx`

- [ ] **Step 1: Create RewriteSelectionPanel.tsx**

```tsx
import React, { useState } from 'react';
import { Check } from 'lucide-react';

import { Button } from '@/ui/component/shadcn/button';
import { AppContext } from '@/app/AppContext';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';

interface RewriteSelectionPanelProps {
	result: string;
	ctx: DocumentContext;
	onClose: () => void;
}

export const RewriteSelectionPanel: React.FC<RewriteSelectionPanelProps> = ({ result, ctx, onClose }) => {
	const [applied, setApplied] = useState(false);

	const handleApply = () => {
		const app = AppContext.getInstance().app;
		const editor = app.workspace.activeEditor?.editor;
		if (editor) {
			editor.replaceSelection(result);
			setApplied(true);
		}
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-4">
			<div className="pktw-grid pktw-grid-cols-2 pktw-gap-4 pktw-max-h-[400px]">
				<div className="pktw-overflow-y-auto pktw-text-xs pktw-text-muted-foreground pktw-whitespace-pre-wrap pktw-p-3 pktw-rounded-lg pktw-bg-muted/30">
					<div className="pktw-text-[10px] pktw-uppercase pktw-tracking-wider pktw-mb-2 pktw-text-muted-foreground">Original</div>
					{ctx.selection}
				</div>
				<div className="pktw-overflow-y-auto pktw-text-xs pktw-text-foreground pktw-whitespace-pre-wrap pktw-p-3 pktw-rounded-lg pktw-bg-muted/30">
					<div className="pktw-text-[10px] pktw-uppercase pktw-tracking-wider pktw-mb-2 pktw-text-muted-foreground">Rewritten</div>
					{result}
				</div>
			</div>
			<div className="pktw-flex pktw-justify-end">
				<Button size="sm" onClick={handleApply} disabled={applied}>
					<Check className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
					{applied ? 'Applied' : 'Apply'}
				</Button>
			</div>
		</div>
	);
};
```

- [ ] **Step 2: Create rewrite-selection.ts action**

```ts
import { PenLine } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { AppContext } from '@/app/AppContext';
import { RewriteSelectionPanel } from '@/ui/view/copilot/panels/RewriteSelectionPanel';
import type { CopilotAction, DocumentContext, ActionResult, ProgressCallback } from '../CopilotActionRegistry';

export const rewriteSelectionAction: CopilotAction = {
	id: 'rewrite-selection',
	label: 'Rewrite Selection',
	description: 'Rephrase selected text',
	icon: PenLine,
	category: 'writing',

	relevance(ctx: DocumentContext): number {
		if (ctx.selection) return 0.8;
		return 0.1;
	},

	guard(ctx: DocumentContext): string | null {
		if (!ctx.selection) return 'Select text to rewrite';
		return null;
	},

	async execute(ctx: DocumentContext, progress: ProgressCallback): Promise<ActionResult> {
		const aiManager = AppContext.getInstance().aiServiceManager;
		// Default style: concise
		const style = 'concise';
		let fullText = '';
		for await (const chunk of aiManager.queryTextStream(PromptId.WritingRewrite, {
			selection: ctx.selection!, content: ctx.content, title: ctx.title, style,
		})) {
			if (chunk.type === 'delta') {
				fullText += chunk.text;
				progress(fullText);
			}
		}
		return { type: 'stream', text: fullText };
	},

	ResultPanel: RewriteSelectionPanel as any,
};
```

- [ ] **Step 3: Register in actions/index.ts, commit**

```bash
git add src/service/copilot/actions/rewrite-selection.ts src/ui/view/copilot/panels/RewriteSelectionPanel.tsx src/service/copilot/actions/index.ts
git commit -m "feat(copilot): add Rewrite Selection action"
```

---

## Task 18: Add Evidence Action

**Files:**
- Create: `src/service/copilot/actions/add-evidence.ts`
- Create: `src/ui/view/copilot/panels/AddEvidencePanel.tsx`

- [ ] **Step 1: Create AddEvidencePanel.tsx**

```tsx
import React, { useState } from 'react';
import { Check, ExternalLink } from 'lucide-react';

import { Button } from '@/ui/component/shadcn/button';
import { AppContext } from '@/app/AppContext';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import type { AddEvidence } from '@/service/copilot/copilot-schemas';

interface AddEvidencePanelProps {
	result: AddEvidence;
	ctx: DocumentContext;
	onClose: () => void;
}

export const AddEvidencePanel: React.FC<AddEvidencePanelProps> = ({ result, ctx, onClose }) => {
	const [selected, setSelected] = useState<Set<number>>(new Set(result.evidence.map((_, i) => i)));
	const [inserted, setInserted] = useState(false);

	const toggle = (i: number) => {
		const next = new Set(selected);
		next.has(i) ? next.delete(i) : next.add(i);
		setSelected(next);
	};

	const handleInsert = () => {
		const app = AppContext.getInstance().app;
		const editor = app.workspace.activeEditor?.editor;
		if (!editor) return;
		const items = result.evidence.filter((_, i) => selected.has(i));
		const text = items.map(e => e.insertText).join('\n\n');
		editor.replaceSelection(editor.getSelection() + '\n\n' + text);
		setInserted(true);
	};

	const handleOpenSource = (path: string) => {
		const app = AppContext.getInstance().app;
		const file = app.vault.getAbstractFileByPath(path);
		if (file) app.workspace.getLeaf(false).openFile(file as any);
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			{result.evidence.map((e, i) => (
				<div
					key={i}
					className="pktw-flex pktw-items-start pktw-gap-3 pktw-p-3 pktw-rounded-lg pktw-bg-accent/50 pktw-cursor-pointer"
					onClick={() => toggle(i)}
				>
					<div className={`pktw-w-4 pktw-h-4 pktw-mt-0.5 pktw-rounded pktw-border pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0 ${selected.has(i) ? 'pktw-bg-primary pktw-border-primary' : 'pktw-border-muted-foreground'}`}>
						{selected.has(i) && <Check className="pktw-w-3 pktw-h-3 pktw-text-primary-foreground" />}
					</div>
					<div className="pktw-flex-1 pktw-min-w-0">
						<div
							className="pktw-flex pktw-items-center pktw-gap-1 pktw-text-xs pktw-text-primary pktw-cursor-pointer"
							onClick={(ev) => { ev.stopPropagation(); handleOpenSource(e.sourcePath); }}
						>
							<ExternalLink className="pktw-w-3 pktw-h-3" />
							{e.sourceTitle}
							<span className="pktw-text-[10px] pktw-px-1 pktw-rounded pktw-bg-muted pktw-text-muted-foreground">
								{Math.round(e.relevance * 100)}%
							</span>
						</div>
						<div className="pktw-text-xs pktw-text-muted-foreground pktw-mt-1 pktw-italic pktw-line-clamp-2">"{e.quote}"</div>
					</div>
				</div>
			))}
			<div className="pktw-flex pktw-justify-end pktw-pt-2">
				<Button size="sm" onClick={handleInsert} disabled={selected.size === 0 || inserted}>
					<Check className="pktw-w-3.5 pktw-h-3.5 pktw-mr-1" />
					{inserted ? 'Inserted' : `Insert ${selected.size} Items`}
				</Button>
			</div>
		</div>
	);
};
```

- [ ] **Step 2: Create add-evidence.ts action**

Two-phase: vector search → LLM picks best evidence.

```ts
import { BookOpen } from 'lucide-react';

import { PromptId } from '@/service/prompt/PromptId';
import { addEvidenceSchema } from '../copilot-schemas';
import { AppContext } from '@/app/AppContext';
import { AddEvidencePanel } from '@/ui/view/copilot/panels/AddEvidencePanel';
import type { CopilotAction, DocumentContext, ActionResult, ProgressCallback } from '../CopilotActionRegistry';

export const addEvidenceAction: CopilotAction = {
	id: 'add-evidence',
	label: 'Add Evidence',
	description: 'Support with vault notes',
	icon: BookOpen,
	category: 'writing',

	relevance(ctx: DocumentContext): number {
		if (ctx.wordCount > 500) return 0.5;
		return 0.2;
	},

	guard(ctx: DocumentContext): string | null {
		if (ctx.wordCount < 50) return 'Document needs more content to find relevant evidence';
		return null;
	},

	async execute(ctx: DocumentContext, progress: ProgressCallback): Promise<ActionResult> {
		const appContext = AppContext.getInstance();
		const searchClient = appContext.searchClient;

		const queryText = ctx.selection ?? ctx.content.slice(0, 500);
		progress('Searching vault for supporting evidence...');

		// Phase 1: Vector search
		const response = await searchClient.vectorSearch({
			query: queryText,
			topK: 10,
		});
		const sources = (response.items ?? [])
			.filter(item => item.path !== ctx.file.path);

		if (sources.length === 0) {
			return { type: 'error', message: 'No relevant evidence found in vault' };
		}

		const sourcesText = sources.map((item, i) =>
			`### ${item.title ?? item.path}\nPath: ${item.path}\n${(item.content ?? item.excerpt ?? '').slice(0, 500)}`
		).join('\n\n');

		progress(`Found ${sources.length} potential sources. Selecting best evidence...`);

		// Phase 2: LLM picks best evidence
		const aiManager = appContext.aiServiceManager;
		const result = await aiManager.queryStructured(
			PromptId.WritingAddEvidence,
			{ context: queryText, sources: sourcesText },
			addEvidenceSchema,
		);
		return { type: 'structured', data: result };
	},

	ResultPanel: AddEvidencePanel as any,
};
```

- [ ] **Step 3: Register in actions/index.ts, commit**

```bash
git add src/service/copilot/actions/add-evidence.ts src/ui/view/copilot/panels/AddEvidencePanel.tsx src/service/copilot/actions/index.ts
git commit -m "feat(copilot): add Add Evidence action (vector search + LLM selection)"
```

---

## Task 19: Final actions/index.ts — Register All 15 Actions

**Files:**
- Modify: `src/service/copilot/actions/index.ts`

- [ ] **Step 1: Final version of actions/index.ts with all 15 actions**

```ts
import { CopilotActionRegistry } from '../CopilotActionRegistry';
// Document
import { suggestTagsAction } from './suggest-tags';
import { suggestLinksAction } from './suggest-links';
import { suggestSplitAction } from './suggest-split';
import { reviewArticleAction } from './review-article';
import { polishDocumentAction } from './polish-document';
import { summarizeAction } from './summarize';
import { extractConceptsAction } from './extract-concepts';
import { translateAction } from './translate';
// Vault
import { findRelatedAction } from './find-related';
import { knowledgeGapsAction } from './knowledge-gaps';
import { synthesizeTopicAction } from './synthesize-topic';
import { vaultHealthAction } from './vault-health';
// Writing
import { continueWritingAction } from './continue-writing';
import { rewriteSelectionAction } from './rewrite-selection';
import { addEvidenceAction } from './add-evidence';

export function registerAllCopilotActions(): void {
	const registry = CopilotActionRegistry.getInstance();

	// Document (order = display order in picker)
	registry.register(suggestTagsAction);
	registry.register(suggestLinksAction);
	registry.register(suggestSplitAction);
	registry.register(reviewArticleAction);
	registry.register(polishDocumentAction);
	registry.register(summarizeAction);
	registry.register(extractConceptsAction);
	registry.register(translateAction);

	// Vault
	registry.register(findRelatedAction);
	registry.register(knowledgeGapsAction);
	registry.register(synthesizeTopicAction);
	registry.register(vaultHealthAction);

	// Writing
	registry.register(continueWritingAction);
	registry.register(rewriteSelectionAction);
	registry.register(addEvidenceAction);
}
```

- [ ] **Step 2: Build and verify**

Run: `npm run build`
Expected: No TypeScript errors, clean build

- [ ] **Step 3: Commit**

```bash
git add src/service/copilot/actions/index.ts
git commit -m "feat(copilot): register all 15 actions in final index"
```

---

## Task 20: Smoke Test in Obsidian

- [ ] **Step 1: Start dev server**

Run: `npm run dev`

- [ ] **Step 2: Manual smoke test checklist**

Open Obsidian, trigger Copilot (Cmd+Shift+P → Peak Copilot):

1. Verify 3 sections appear (Document / Vault / Writing) with correct category colors
2. Verify all 15 action tiles show with icons
3. Verify star recommendations appear on relevant actions (open a doc with no tags → Suggest Tags should be starred)
4. Verify keyboard navigation works across sections
5. Click "Suggest Tags" → verify result appears with TagSuggestionEngine (multi-signal) output
6. Click "Summarize" → verify streaming output works
7. Click "Find Related" → verify vector search results appear (no LLM call)
8. Select text → reopen Copilot → verify "Rewrite Selection" gets starred
9. Click a vault action → verify it works on vault-level data

- [ ] **Step 3: Fix any issues found, commit**

```bash
git add -A
git commit -m "fix(copilot): smoke test fixes"
```
