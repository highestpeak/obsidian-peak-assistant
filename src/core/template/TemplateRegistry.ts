import type { PromptId } from '@/core/types/prompt';

/**
 * Category of template. Determines base path under plugin directory.
 */
export type TemplateCategory = 'prompts' | 'tools' | 'agents' | 'ui' | 'indexing' | 'stopwords' | 'config';

/**
 * Tool result / handler template IDs (search graph inspector, etc.).
 */
export const ToolTemplateId = {
	LocalSearch: 'local-search',
	SearchByDimensions: 'search-by-dimensions',
	RecentChanges: 'recent-changes',
	GraphPathFinding: 'graph-path-finding',
	InspectNoteContext: 'inspect-note-context',
	ExploreFolder: 'explore-folder',
	OrphanNotes: 'orphan-notes',
	FindKeyNodes: 'find-key-nodes',
	GraphTraversal: 'graph-traversal',
} as const;

export type ToolTemplateId = (typeof ToolTemplateId)[keyof typeof ToolTemplateId];

/**
 * Agent helper template IDs (result snapshot, evidence hint).
 */
export const AgentTemplateId = {
	ResultSnapshot: 'result-snapshot',
	EvidenceHint: 'evidence-hint',
	EvidenceGroupSharedContext: 'evidence-group-shared-context',
	/** Weaved context from recon merged paths (structure + mesh). */
	WeavePathsContext: 'weave-paths-context',
	ReportBlockBlueprintLine: 'report-block-blueprint-line',
} as const;

export type AgentTemplateId = (typeof AgentTemplateId)[keyof typeof AgentTemplateId];

/**
 * Internal indexing templates (not prompts/tools).
 */
export const IndexingTemplateId = {
	CodeStopwords: 'indexing-code-stopwords',
	/** Weak title/filename tokens filtered in cluster hub title token extraction. */
	ClusterHubWeakTitleTokens: 'indexing-cluster-hub-weak-title-tokens',
	/** Hub discovery agent: one page of folder tree for LLM (`folderRows` + Handlebars; no path mapping block). */
	HubDiscoveryFolderTreePage: 'indexing-hub-discovery-folder-tree-page',
	/** Hub discovery: empty-folder-tree placeholder Markdown. */
	HubDiscoveryFolderTreeEmpty: 'indexing-hub-discovery-folder-tree-empty',
	/** Hub discovery agent: default `userGoal` when caller omits `options.userGoal` (plain text; Handlebars optional). */
	HubDiscoveryDefaultUserGoal: 'indexing-hub-discovery-default-user-goal',
	/** Hub discovery agent: `agentPipelineBudget.note` in world metrics JSON (plain text for the LLM). */
	HubDiscoveryPipelineBudgetNote: 'indexing-hub-discovery-pipeline-budget-note',
	/** Knowledge intuition agent: default `userGoal` when caller omits `options.userGoal` (plain text). */
	KnowledgeIntuitionDefaultUserGoal: 'indexing-knowledge-intuition-default-user-goal',
	/** Knowledge intuition agent: rendered vault skeleton Markdown (Handlebars; English). */
	KnowledgeIntuitionSkeletonMarkdown: 'indexing-knowledge-intuition-skeleton-markdown',
	/** Knowledge intuition agent: prep-only output when `stopAt: prep` (Handlebars; English). */
	KnowledgeIntuitionPrepOnlyMarkdown: 'indexing-knowledge-intuition-prep-only-markdown',
	/** Hub materialization: markdown skeleton written to vault (Handlebars). */
	HubDocSkeleton: 'indexing-hub-doc-skeleton',
	/** Hub curation: world snapshot markdown embedded in curator plan prompt (Handlebars). */
	HubCurationWorldSnapshot: 'indexing-hub-curation-world-snapshot',
} as const;

export type IndexingTemplateId = (typeof IndexingTemplateId)[keyof typeof IndexingTemplateId];

/**
 * Stopword templates used by TextRank/token pipelines.
 * Add `templates/stopwords/{stem}.md`, a new key here, and a {@link TEMPLATE_METADATA} row; hydration loads every id.
 */
export const StopwordTemplateId = {
	Common: 'stopwords-common',
	English: 'stopwords-en',
	Chinese: 'stopwords-zh',
} as const;

export type StopwordTemplateId = (typeof StopwordTemplateId)[keyof typeof StopwordTemplateId];

/**
 * Union of all template identifiers.
 */
export type TemplateId = PromptId | ToolTemplateId | AgentTemplateId | IndexingTemplateId | StopwordTemplateId | ConfigTemplateId;

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

/**
 * Metadata for a single template (path, options). No content.
 */
export interface TemplateMetadata {
	/** Path relative to plugin root, e.g. templates/prompts/foo.md */
	path: string;
	category: TemplateCategory;
	/** For prompts: whether LLM output is expected to be JSON */
	expectsJson?: boolean;
	/** For prompts: extra JSON instruction (e.g. "Return only JSON array") */
	jsonConstraint?: string;
	/** For prompts: paired system prompt id when this is a user prompt */
	systemPromptId?: PromptId;
	/** Human-readable name */
	label?: string;
	/** One-line usage description */
	description?: string;
	/** UI grouping */
	group?: PromptGroup;
}

/**
 * Config template IDs (runtime-editable JSON configs under templates/config/).
 */
export const ConfigTemplateId = {
	TimeWithinNormalize: 'time-within-normalize' as const,
	VaultLintConfig: 'config-vault-lint',
	// Model registry
	ModelsOpenAI: 'config-models-openai' as const,
	ModelsClaude: 'config-models-claude' as const,
	ModelsGemini: 'config-models-gemini' as const,
	ModelsPerplexity: 'config-models-perplexity' as const,
	ModelsOllamaFamilies: 'config-models-ollama-families' as const,
	ModelsDefaults: 'config-models-defaults' as const,
	CommunityColors: 'config-community-colors' as const,
	CuratorCatalog: 'config-curator-catalog' as const,
	// Surface configs (design-system-unification-2026-05-30)
	Onboarding: 'config-onboarding' as const,
	Settings: 'config-settings' as const,
	Chat: 'config-chat' as const,
	Dashboard: 'config-dashboard' as const,
	RichOutputTypes: 'config-rich-output-types' as const,
} as const;

export type ConfigTemplateId = (typeof ConfigTemplateId)[keyof typeof ConfigTemplateId];

/** Path prefix per category (under plugin dir). All under templates/. */
const CATEGORY_PREFIX: Record<TemplateCategory, string> = {
	prompts: 'templates/prompts',
	tools: 'templates/tools',
	agents: 'templates/agents',
	ui: 'templates/ui',
	indexing: 'templates/indexing',
	stopwords: 'templates/stopwords',
	config: 'templates/config',
};

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

/**
 * Central registry: template id -> metadata only. Content loaded on demand via TemplateManager.
 */
export const TEMPLATE_METADATA: Record<TemplateId, TemplateMetadata> = {
	// --- Prompts (category prompts) ---
	'conversation-system': meta('prompts', 'conversation-system', { label: 'Chat System Prompt', description: 'Core system instruction for all conversations. Defines AI persona, capabilities, and response style.', group: 'chat' }),
	'conversation-summary-short': meta('prompts', 'conversation-summary-short', { label: 'Conversation Summary (Short)', description: 'Generates a concise one-line summary for the sidebar list.', group: 'chat' }),
	'conversation-summary-full': meta('prompts', 'conversation-summary-full', { label: 'Conversation Summary (Full)', description: 'Generates a detailed summary preserving key decisions and context.', group: 'chat' }),
	'project-summary-short': meta('prompts', 'project-summary-short', { label: 'Project Summary (Short)', description: 'One-line project summary for project list display.', group: 'chat' }),
	'project-summary-full': meta('prompts', 'project-summary-full', { label: 'Project Summary (Full)', description: 'Detailed project summary with decisions, goals, and context.', group: 'chat' }),
	'search-rerank-rank-gpt': meta('prompts', 'search-rerank-rank-gpt', { label: 'Search Rerank (RankGPT)', description: 'LLM-based reranker that reorders search results by relevance.', group: 'chat' }),
	'query-rewrite-system': meta('prompts', 'query-rewrite-system', { label: 'Query Suggest (System)', description: 'System prompt for the AI Suggest button — generates structured query candidates from user browsing behavior.', group: 'searchAnalysis' }),
	'query-rewrite': meta('prompts', 'query-rewrite', { systemPromptId: 'query-rewrite-system' as PromptId, expectsJson: true, jsonConstraint: 'Return only the JSON object with a `candidates` array. No markdown fences.', label: 'Query Suggest (User)', description: 'User prompt carrying behavior context + task for the AI Suggest button.', group: 'searchAnalysis' }),
	'application-generate-title': meta('prompts', 'application-generate-title', { label: 'Generate Title', description: 'Auto-generates a conversation title from the first few messages.', group: 'chat' }),
	'memory-extract-candidates-json': meta('prompts', 'memory-extract-candidates-json', { expectsJson: true, jsonConstraint: 'Return only the JSON array, nothing else.', label: 'Memory Extraction', description: 'Identifies facts worth remembering from conversation messages.', group: 'userProfile' }),
	'doc-summary-short': meta('prompts', 'doc-summary-short', { label: 'Doc Summary (Short)', description: 'One-sentence summary for indexing and embeddings.', group: 'indexing' }),
	'doc-summary-full': meta('prompts', 'doc-summary-full', { label: 'Doc Summary (Full)', description: 'Detailed summary using short summary + TextRank anchors.', group: 'indexing' }),
	'image-description': meta('prompts', 'image-description', { label: 'Image Description', description: 'Generates a text description of an image for indexing.', group: 'indexing' }),
	'image-summary': meta('prompts', 'image-summary', { label: 'Image Summary', description: 'Generates a concise summary of image content.', group: 'indexing' }),
	'ai-analysis-followup': meta('prompts', 'ai-analysis-followup', { label: 'Follow-up Chat', description: 'User prompt for follow-up questions on search results.', group: 'searchAnalysis' }),
	'ai-analysis-followup-system': meta('prompts', 'ai-analysis-followup-system', { label: 'Follow-up Chat (System)', description: 'System prompt for follow-up conversations.', group: 'searchAnalysis' }),
	'ai-analysis-title': meta('prompts', 'ai-analysis-dashboard-title', { label: 'Analysis Title', description: 'Generates a title for search analysis results.', group: 'searchAnalysis' }),
	'ai-analysis-mermaid-fix-system': meta('prompts', 'ai-analysis-mermaid-fix-system', { label: 'Mermaid Fix (System)', description: 'System prompt for fixing mermaid syntax errors.', group: 'searchAnalysis' }),
	'ai-analysis-mermaid-fix': meta('prompts', 'ai-analysis-mermaid-fix', { label: 'Mermaid Fix', description: 'Fixes broken mermaid diagram syntax in reports.', group: 'searchAnalysis' }),
	'ai-analysis-save-filename': meta('prompts', 'ai-analysis-save-filename', { label: 'Save Filename', description: 'Suggests a filename when saving analysis results.', group: 'searchAnalysis' }),
	'ai-analysis-save-folder': meta('prompts', 'ai-analysis-save-folder', { label: 'Save Folder', description: 'Suggests a folder path when saving analysis results.', group: 'searchAnalysis' }),
	'ai-analysis-vault-report-summary-system': meta('prompts', 'ai-analysis-vault-report-summary-system', { label: 'Report Summary (System)', description: 'System prompt for vault report executive summaries.', group: 'searchAnalysis' }),
	'ai-analysis-vault-report-summary': meta('prompts', 'ai-analysis-vault-report-summary', { systemPromptId: 'ai-analysis-vault-report-summary-system' as PromptId, label: 'Report Summary', description: 'Generates an executive summary for vault search reports.', group: 'searchAnalysis' }),
	'ai-analysis-vault-sdk-playbook': meta('prompts', 'ai-analysis-vault-sdk-playbook', { label: 'Vault SDK Playbook', description: 'System prompt for the SDK-based vault search agent.', group: 'searchAnalysis' }),
	'ai-analysis-continue-system': meta('prompts', 'ai-analysis-continue-system', { label: 'Continue Analysis (System)', description: 'System prompt for follow-up analysis rounds.', group: 'searchAnalysis' }),
	'ai-analysis-continue': meta('prompts', 'ai-analysis-continue', { systemPromptId: 'ai-analysis-continue-system' as PromptId, label: 'Continue Analysis', description: 'Continues analysis with context from previous rounds.', group: 'searchAnalysis' }),
	'ai-analysis-synthesize-system': meta('prompts', 'ai-analysis-synthesize-system', { label: 'Synthesize Rounds (System)', description: 'System prompt for merging analysis rounds.', group: 'searchAnalysis' }),
	'ai-analysis-synthesize': meta('prompts', 'ai-analysis-synthesize', { systemPromptId: 'ai-analysis-synthesize-system' as PromptId, label: 'Synthesize Rounds', description: 'Merges all analysis rounds into one cohesive report.', group: 'searchAnalysis' }),
	'ai-analysis-report-section-system': meta('prompts', 'ai-analysis-report-section-system', { label: 'Report Section (System)', description: 'System prompt for generating report sections.', group: 'searchAnalysis' }),
	'ai-analysis-report-section': meta('prompts', 'ai-analysis-report-section', { systemPromptId: 'ai-analysis-report-section-system' as PromptId, label: 'Report Section', description: 'Generates a single section of the vault search report.', group: 'searchAnalysis' }),
	'doc-tag-generate-json': meta('prompts', 'doc-tag-generate-json', {
		expectsJson: true,
		jsonConstraint:
			'Return only the JSON object with topicTagEntries, functionalTagEntries (1–5 ids from closed list, never empty), context tag arrays, optional inferCreatedAt, and optional docType/docTypeConfidence/docTypeReasoning (folded into functional labels server-side), nothing else.',
		label: 'Tag Generation',
		description: 'Generates topic, functional, and context tags for a document.',
		group: 'indexing',
	}),
	'knowledge-intuition-plan-system': meta('prompts', 'knowledge-intuition-plan-system', { label: 'Knowledge Intuition Plan (System)', description: 'System prompt for knowledge intuition planning step.', group: 'indexing' }),
	'knowledge-intuition-plan': meta('prompts', 'knowledge-intuition-plan', {
		systemPromptId: 'knowledge-intuition-plan-system' as PromptId,
		label: 'Knowledge Intuition Plan',
		description: 'Plans knowledge exploration using backbone + folder digest.',
		group: 'indexing',
	}),
	'knowledge-intuition-submit': meta('prompts', 'knowledge-intuition-submit', {
		expectsJson: true,
		jsonConstraint:
			'Return only one JSON object: findingsSummary, optional theme, partitions (max 6, entryPaths max 2 each), coreEntities (max 8, whyItMatters each), topology (max 8), evolution, entryPoints (max 24; count N from Vault scale in user prompt; intent, startPaths max 2, rich whatYouWillFind), optional openQuestions (max 6), should_stop.',
		// systemPromptId removed: previously referenced
		// `knowledge-intuition-submit-system` which has no metadata entry and no
		// template file on disk. Golden test t11x-b/prompt-template-registry
		// caught the orphan binding.
		label: 'Knowledge Intuition Submit',
		description: 'Submits intuition results with findings, entities, and topology.',
		group: 'indexing',
	}),
	'hub-curation-plan': meta('prompts', 'hub-curation-plan', {
		label: 'Hub Curation Plan',
		description: 'System prompt for the Hub Curator plan step (which nodes deserve hubs).',
		group: 'indexing',
	}),
	'hub-curation-submit': meta('prompts', 'hub-curation-submit', {
		expectsJson: true,
		jsonConstraint:
			'Return only one JSON object: hubs (max 30 decisions, each with nodeId/hubPath/action/scope/reason and optional mergeSourceHubs), coverage (totalMembers/coveredMembers/uncoveredHighValue max 20), confidence (0..1), should_stop.',
		label: 'Hub Curation Submit',
		description: 'Structured-output prompt for the Hub Curator submit step.',
		group: 'indexing',
	}),
	'hub-materialization-draft': meta('prompts', 'hub-materialization-draft', {
		expectsJson: true,
		jsonConstraint:
			'Return only one JSON object matching HubDraft: title, summary, coreConceptSection, structureSection, evolutionSection, openQuestionsSection, entryPointsSection, referencedMemberIds (max 60).',
		label: 'Hub Materialization Draft',
		description: 'System prompt for the Hub Materialization draft step.',
		group: 'indexing',
	}),
	'hub-materialization-critique': meta('prompts', 'hub-materialization-critique', {
		expectsJson: true,
		jsonConstraint:
			'Return only one JSON object matching HubCritique: retryDraft (bool), gaps (max 15; each memberId/kind/hint), overallCoverage (0..1).',
		label: 'Hub Materialization Critique',
		description: 'System prompt for the Hub Materialization critique subagent.',
		group: 'indexing',
	}),
	'copilot-command-center-plan': meta('prompts', 'copilot-command-center-plan', {
		expectsJson: true,
		jsonConstraint:
			'Return only one JSON object matching CapabilityPlan: planTitle, summary, goalRestatement, steps (min 1 max 8; each stepNumber/commandId/commandLabel/rationale/optional reviewHint/readOnly), confidence (0..1).',
		label: 'Copilot Command Center Plan',
		description: 'Meta-agent drafts a capability sequence from a plain-language user goal.',
		group: 'copilot',
	}),
	'pattern-discovery': meta('prompts', 'pattern-discovery', { expectsJson: true, jsonConstraint: 'Return only the JSON object with newPatterns and deprecateIds, no markdown or explanation.', label: 'Pattern Discovery', description: 'Analyzes query history to discover new query template patterns.', group: 'indexing' }),
	'context-memory': meta('prompts', 'context-memory', { label: 'Context Memory', description: 'Renders long-term memory entries into the conversation context.', group: 'userProfile' }),
	'user-profile-context': meta('prompts', 'user-profile-context', { label: 'User Profile Context', description: 'Renders the user profile into the conversation context window.', group: 'userProfile' }),
	'profile-from-vault-json': meta('prompts', 'profile-from-vault-json', { expectsJson: true, jsonConstraint: 'Return only the JSON array, nothing else.', label: 'Profile Extraction', description: 'Extracts structured user profile data from vault notes.', group: 'userProfile' }),
	'user-profile-organize-markdown': meta('prompts', 'user-profile-organize-markdown', { label: 'Profile Organize', description: 'Organizes raw profile data into a clean markdown format.', group: 'userProfile' }),
	'message-resources': meta('prompts', 'message-resources', { label: 'Message Resources', description: 'Formats attached resources for inclusion in messages.', group: 'ambientContext' }),

	// Copilot Document Intelligence
	'doc-format-polish': meta('prompts', 'doc-format-polish', { systemPromptId: 'doc-format-polish-system' as PromptId, label: 'Format Polish', description: 'Fixes heading hierarchy, list consistency, trailing whitespace, and broken link syntax.', group: 'copilot' }),
	'doc-format-polish-system': meta('prompts', 'doc-format-polish-system', { label: 'Format Polish (System)', description: 'System instructions for the format polish action.', group: 'copilot' }),
	'doc-polish': meta('prompts', 'doc-polish', { systemPromptId: 'doc-polish-system' as PromptId, label: 'Document Polish', description: 'Polishes writing for clarity, grammar, and flow.', group: 'copilot' }),
	'doc-polish-system': meta('prompts', 'doc-polish-system', { label: 'Document Polish (System)', description: 'System instructions for the document polish action.', group: 'copilot' }),
	'doc-review': meta('prompts', 'doc-review', { expectsJson: true, systemPromptId: 'doc-review-system' as PromptId, label: 'Document Review', description: 'Structured feedback on document quality with severity-ranked issues.', group: 'copilot' }),
	'doc-review-system': meta('prompts', 'doc-review-system', { label: 'Document Review (System)', description: 'System instructions for the document review action.', group: 'copilot' }),
	'doc-split-suggestion': meta('prompts', 'doc-split-suggestion', { expectsJson: true, systemPromptId: 'doc-split-suggestion-system' as PromptId, label: 'Split Suggestion', description: 'Analyzes document structure and suggests how to split into smaller notes.', group: 'copilot' }),
	'doc-split-suggestion-system': meta('prompts', 'doc-split-suggestion-system', { label: 'Split Suggestion (System)', description: 'System instructions for the split suggestion action.', group: 'copilot' }),
	'doc-suggest-tags': meta('prompts', 'doc-suggest-tags', { expectsJson: true, systemPromptId: 'doc-suggest-tags-system' as PromptId, label: 'Suggest Tags', description: 'Suggests tags based on content and existing vault tags.', group: 'copilot' }),
	'doc-suggest-tags-system': meta('prompts', 'doc-suggest-tags-system', { label: 'Suggest Tags (System)', description: 'System instructions for the tag suggestion action.', group: 'copilot' }),
	'doc-summarize': meta('prompts', 'doc-summarize', { systemPromptId: 'doc-summarize-system' as PromptId, label: 'Summarize', description: 'Generates a concise summary of the document content.', group: 'copilot' }),
	'doc-summarize-system': meta('prompts', 'doc-summarize-system', { label: 'Summarize (System)', description: 'System instructions for the summarize action.', group: 'copilot' }),
	'doc-extract-concepts': meta('prompts', 'doc-extract-concepts', { expectsJson: true, systemPromptId: 'doc-extract-concepts-system' as PromptId, label: 'Extract Concepts', description: 'Identifies and extracts key concepts from the document.', group: 'copilot' }),
	'doc-extract-concepts-system': meta('prompts', 'doc-extract-concepts-system', { label: 'Extract Concepts (System)', description: 'System instructions for concept extraction.', group: 'copilot' }),
	'doc-translate': meta('prompts', 'doc-translate', { systemPromptId: 'doc-translate-system' as PromptId, label: 'Translate', description: 'Translates document content. Auto-detects CJK to choose target language.', group: 'copilot' }),
	'doc-translate-system': meta('prompts', 'doc-translate-system', { label: 'Translate (System)', description: 'System instructions for the translate action.', group: 'copilot' }),

	'doc-correct-content': meta('prompts', 'doc-correct-content', { expectsJson: true, systemPromptId: 'doc-correct-content-system' as PromptId, label: 'Correct Content', description: 'Identifies factual errors, logical inconsistencies, broken references, and typos.', group: 'copilot' }),
	'doc-correct-content-system': meta('prompts', 'doc-correct-content-system', { label: 'Correct Content (System)', description: 'System instructions for content error correction.', group: 'copilot' }),

	// Copilot Vault Intelligence
	'vault-health': meta('prompts', 'vault-health', { expectsJson: true, systemPromptId: 'vault-health-system' as PromptId, label: 'Vault Health', description: 'Analyzes vault structure for orphans, duplicates, stale notes, and tag issues.', group: 'copilot' }),
	'vault-health-system': meta('prompts', 'vault-health-system', { label: 'Vault Health (System)', description: 'System instructions for vault health analysis.', group: 'copilot' }),
	'vault-summary': meta('prompts', 'vault-summary', { expectsJson: true, systemPromptId: 'vault-summary-system' as PromptId, label: 'Vault Summary', description: 'Generates a narrative summary of recent vault activity.', group: 'copilot' }),
	'vault-summary-system': meta('prompts', 'vault-summary-system', { label: 'Vault Summary (System)', description: 'System instructions for vault activity summarization.', group: 'copilot' }),

	// Copilot Writing Assistance
	'writing-continue': meta('prompts', 'writing-continue', { systemPromptId: 'writing-continue-system' as PromptId, label: 'Continue Writing', description: 'Continues writing from the current cursor position.', group: 'copilot' }),
	'writing-continue-system': meta('prompts', 'writing-continue-system', { label: 'Continue Writing (System)', description: 'System instructions for continue writing.', group: 'copilot' }),
	'writing-rewrite': meta('prompts', 'writing-rewrite', { systemPromptId: 'writing-rewrite-system' as PromptId, label: 'Rewrite Selection', description: 'Rewrites selected text with improved clarity and style.', group: 'copilot' }),
	'writing-rewrite-system': meta('prompts', 'writing-rewrite-system', { label: 'Rewrite Selection (System)', description: 'System instructions for rewrite selection.', group: 'copilot' }),

	// Copilot Agent Playbooks (system prompts for agent loop actions)
	'copilot-agent-suggest-links': meta('prompts', 'copilot-agent-suggest-links', { label: 'Suggest Links (Agent)', description: 'Agent playbook that searches vault and suggests wiki-links.', group: 'copilot' }),
	'copilot-agent-knowledge-gaps': meta('prompts', 'copilot-agent-knowledge-gaps', { label: 'Knowledge Gaps (Agent)', description: 'Agent playbook that identifies knowledge gaps in vault coverage.', group: 'copilot' }),
	'copilot-agent-synthesize-topic': meta('prompts', 'copilot-agent-synthesize-topic', { label: 'Synthesize Topic (Agent)', description: 'Agent playbook that synthesizes information across vault notes.', group: 'copilot' }),
	'copilot-agent-add-evidence': meta('prompts', 'copilot-agent-add-evidence', { label: 'Add Evidence (Agent)', description: 'Agent playbook that finds and ranks supporting evidence.', group: 'copilot' }),
	'copilot-agent-writing-plan': meta('prompts', 'copilot-agent-writing-plan', { label: 'Writing Plan (Agent)', description: 'Agent playbook that creates a structured writing plan grounded in vault notes.', group: 'copilot' }),
	'copilot-agent-write-article': meta('prompts', 'copilot-agent-write-article', { label: 'Write Article (Agent)', description: 'Agent playbook that drafts article sections grounded in vault notes.', group: 'copilot' }),
	'copilot-agent-detect-and-file': meta('prompts', 'copilot-agent-detect-and-file', { label: 'Detect & File (Agent)', description: 'Agent playbook that detects misfiled notes and proposes target folders.', group: 'copilot' }),
	'copilot-agent-check-task-list': meta('prompts', 'copilot-agent-check-task-list', { label: 'Check Task List (Agent)', description: 'Agent playbook that analyzes tasks for priority, overdue items, and blockers.', group: 'copilot' }),
	'copilot-agent-prompt-audit': meta('prompts', 'copilot-agent-prompt-audit', { label: 'Prompt Audit (Agent)', description: 'Agent playbook that audits prompt quality and surfaces improvements.', group: 'copilot' }),

	// Chat intelligence
	'chat-topic-aggregation': meta('prompts', 'chat-topic-aggregation', {
		expectsJson: true,
		jsonConstraint: 'Return only the JSON array of topic groups, nothing else.',
		label: 'Topic Aggregation',
		description: 'Groups conversation messages into topic clusters for the sidebar.',
		group: 'chat',
	}),
	'chat-suggest-followups': meta('prompts', 'chat-suggest-followups', {
		expectsJson: true,
		jsonConstraint: 'Return only the JSON array of suggestion strings, nothing else.',
		label: 'Suggest Follow-ups',
		description: 'Generates 3 suggested follow-up questions shown below the last message.',
		group: 'chat',
	}),
	'chat-suggest-actions': meta('prompts', 'chat-suggest-actions', {
		expectsJson: true,
		jsonConstraint: 'Return only the JSON array of action objects, nothing else.',
		label: 'Suggest Actions',
		description: 'Generates contextual action suggestions for the conversation.',
		group: 'chat',
	}),

	// Ambient context / session intelligence
	'working-theme-inference': meta('prompts', 'working-theme-inference', { expectsJson: true, jsonConstraint: 'Return only the JSON object with summary and relatedFiles, nothing else.', label: 'Working Theme Inference', description: 'Infers the current working theme from recent activity.', group: 'ambientContext' }),
	'working-context-render': meta('prompts', 'working-context-render', { label: 'Working Context Render', description: 'Renders working context into conversation context.', group: 'ambientContext' }),
	'activity-index-render': meta('prompts', 'activity-index-render', { label: 'Activity Index Render', description: 'Renders recent vault activity into conversation context.', group: 'ambientContext' }),

	// Prompt enhancement
	'prompt-enhance': meta('prompts', 'prompt-enhance', { label: 'Prompt Enhance', description: 'Rewrites vague prompts into clear, specific ones.', group: 'chat' }),

	// --- Tools ---
	[ToolTemplateId.LocalSearch]: meta('tools', 'local-search'),
	[ToolTemplateId.SearchByDimensions]: meta('tools', 'search-by-dimensions'),
	[ToolTemplateId.RecentChanges]: meta('tools', 'recent-changes'),
	[ToolTemplateId.GraphPathFinding]: meta('tools', 'graph-path-finding'),
	[ToolTemplateId.InspectNoteContext]: meta('tools', 'inspect-note-context'),
	[ToolTemplateId.ExploreFolder]: meta('tools', 'explore-folder'),
	[ToolTemplateId.OrphanNotes]: meta('tools', 'orphan-notes'),
	[ToolTemplateId.FindKeyNodes]: meta('tools', 'find-key-nodes'),
	[ToolTemplateId.GraphTraversal]: meta('tools', 'graph-traversal'),

	// --- Agents ---
	[AgentTemplateId.ResultSnapshot]: meta('agents', 'result-snapshot'),
	[AgentTemplateId.EvidenceHint]: meta('agents', 'evidence-hint'),
	[AgentTemplateId.EvidenceGroupSharedContext]: meta('agents', 'evidence-group-shared-context'),
	[AgentTemplateId.WeavePathsContext]: meta('agents', 'weave-paths-context'),
	[AgentTemplateId.ReportBlockBlueprintLine]: meta('agents', 'report-block-blueprint-line'),

	// --- Indexing (Handlebars; loaded at plugin boot for markdown chunking helpers) ---
	[IndexingTemplateId.CodeStopwords]: meta('indexing', 'code-stopwords'),
	[IndexingTemplateId.ClusterHubWeakTitleTokens]: meta('indexing', 'cluster-hub-weak-title-tokens'),
	[IndexingTemplateId.HubDiscoveryFolderTreePage]: meta('indexing', 'hub-discovery-folder-tree-page'),
	[IndexingTemplateId.HubDiscoveryFolderTreeEmpty]: meta('indexing', 'hub-discovery-folder-tree-empty'),
	[IndexingTemplateId.HubDiscoveryDefaultUserGoal]: meta('indexing', 'hub-discovery-default-user-goal'),
	[IndexingTemplateId.HubDiscoveryPipelineBudgetNote]: meta('indexing', 'hub-discovery-pipeline-budget-note'),
	[IndexingTemplateId.KnowledgeIntuitionDefaultUserGoal]: meta('indexing', 'knowledge-intuition-default-user-goal'),
	[IndexingTemplateId.KnowledgeIntuitionSkeletonMarkdown]: meta('indexing', 'knowledge-intuition-skeleton-markdown'),
	[IndexingTemplateId.KnowledgeIntuitionPrepOnlyMarkdown]: meta('indexing', 'knowledge-intuition-prep-only-markdown'),
	[IndexingTemplateId.HubDocSkeleton]: meta('indexing', 'hub-doc-skeleton'),
	[IndexingTemplateId.HubCurationWorldSnapshot]: meta('indexing', 'hub-curation-world-snapshot'),
	[StopwordTemplateId.Common]: meta('stopwords', 'common'),
	[StopwordTemplateId.English]: meta('stopwords', 'en'),
	[StopwordTemplateId.Chinese]: meta('stopwords', 'zh'),

	// --- Config (runtime-editable JSON) ---
	[ConfigTemplateId.TimeWithinNormalize]: meta('config', 'time-within-normalize', { expectsJson: true }),
	[ConfigTemplateId.VaultLintConfig]: meta('config', 'vault-lint-config', { expectsJson: true }),

	// --- Model Registry (per-provider JSON) ---
	[ConfigTemplateId.ModelsOpenAI]: meta('config', 'models/openai', { expectsJson: true }),
	[ConfigTemplateId.ModelsClaude]: meta('config', 'models/claude', { expectsJson: true }),
	[ConfigTemplateId.ModelsGemini]: meta('config', 'models/gemini', { expectsJson: true }),
	[ConfigTemplateId.ModelsPerplexity]: meta('config', 'models/perplexity', { expectsJson: true }),
	[ConfigTemplateId.ModelsOllamaFamilies]: meta('config', 'models/ollama-families', { expectsJson: true }),
	[ConfigTemplateId.ModelsDefaults]: meta('config', 'models/defaults', { expectsJson: true }),
	[ConfigTemplateId.CommunityColors]: meta('config', 'community-colors', { expectsJson: true }),
	[ConfigTemplateId.CuratorCatalog]: meta('config', 'curator-catalog', { expectsJson: true }),

	// --- Surface configs (design-system-unification-2026-05-30) ---
	[ConfigTemplateId.Onboarding]: meta('config', 'onboarding', { expectsJson: true }),
	[ConfigTemplateId.Settings]: meta('config', 'settings', { expectsJson: true }),
	[ConfigTemplateId.Chat]: meta('config', 'chat', { expectsJson: true }),
	[ConfigTemplateId.Dashboard]: meta('config', 'dashboard', { expectsJson: true }),
	[ConfigTemplateId.RichOutputTypes]: meta('config', 'rich-output-types', { expectsJson: true }),

	// --- Structural analysis prompts ---
	'gap-explanation': meta('prompts', 'gap-explanation', { label: 'Gap Explanation', description: 'LLM prompt for lazy gap explanations.', group: 'indexing' }),

	// --- Ambient explanation (T11Y inline-prompt migration) ---
	'ambient-explanation-system': meta('prompts', 'ambient-explanation-system', { label: 'Ambient Explanation (System)', description: 'System instructions for the ambient micro-explanation LLM call.', group: 'ambientContext' }),
	'ambient-explanation-user': meta('prompts', 'ambient-explanation-user', { systemPromptId: 'ambient-explanation-system' as PromptId, label: 'Ambient Explanation', description: 'One-sentence explanation of how a pushed note relates to the current writing.', group: 'ambientContext' }),

	// --- Copilot Auto Review meta-agent (T11Y inline-prompt migration) ---
	'copilot-meta-agent-system-base': meta('prompts', 'copilot-meta-agent-system-base', { label: 'Auto Review Meta-Agent (Base)', description: 'Base system block for the Auto Review meta-agent — assembled with signal report + mode suffix at call time.', group: 'copilot' }),
	'copilot-meta-agent-fast-mode-suffix': meta('prompts', 'copilot-meta-agent-fast-mode-suffix', { label: 'Auto Review Meta-Agent (Fast Suffix)', description: 'Mode suffix appended when Auto Review runs in fast (single focus) mode.', group: 'copilot' }),
	'copilot-meta-agent-complete-mode-suffix': meta('prompts', 'copilot-meta-agent-complete-mode-suffix', { label: 'Auto Review Meta-Agent (Complete Suffix)', description: 'Mode suffix appended when Auto Review runs in complete (multi-round) mode.', group: 'copilot' }),

	// --- Vault Review meta-agent (T11Y inline-prompt migration) ---
	'vault-meta-agent-system-base': meta('prompts', 'vault-meta-agent-system-base', { label: 'Vault Review Meta-Agent (Base)', description: 'Base system block for the Vault Review meta-agent — assembled with digest + mode suffix at call time.', group: 'copilot' }),
	'vault-meta-agent-fast-mode-suffix': meta('prompts', 'vault-meta-agent-fast-mode-suffix', { label: 'Vault Review Meta-Agent (Fast Suffix)', description: 'Mode suffix appended when Vault Review runs in fast mode.', group: 'copilot' }),
	'vault-meta-agent-complete-mode-suffix': meta('prompts', 'vault-meta-agent-complete-mode-suffix', { label: 'Vault Review Meta-Agent (Complete Suffix)', description: 'Mode suffix appended when Vault Review runs in complete mode.', group: 'copilot' }),

	// --- Insight inline chat (T11Y inline-prompt migration) ---
	'insight-inline-chat-draft-proposal-system': meta('prompts', 'insight-inline-chat-draft-proposal-system', { label: 'Insight Chat (Draft Proposal)', description: 'System prompt for turning an Auto Review insight into 1-3 concrete edits.', group: 'copilot' }),
	'insight-inline-chat-followup-system': meta('prompts', 'insight-inline-chat-followup-system', { label: 'Insight Chat (Follow-up)', description: 'System prompt for following up on an Auto Review insight.', group: 'copilot' }),

	// --- Knowledge graph agent (T11Y inline-prompt migration) ---
	'graph-agent-system': meta('prompts', 'graph-agent-system', { label: 'Graph Agent (System)', description: 'System prompt that asks the LLM to read source documents and produce a knowledge graph.', group: 'searchAnalysis' }),
	'graph-agent-user': meta('prompts', 'graph-agent-user', { systemPromptId: 'graph-agent-system' as PromptId, label: 'Graph Agent (User)', description: 'User prompt that names the search query and source count for the graph agent.', group: 'searchAnalysis' }),

	// --- Thinking-tree inference (T11Y inline-prompt migration) ---
	'graph-infer-thinking-tree-system': meta('prompts', 'graph-infer-thinking-tree-system', { expectsJson: true, label: 'Infer Thinking Tree (System)', description: 'System prompt for the thinking-tree inference call.', group: 'searchAnalysis' }),
	'graph-infer-thinking-tree-user': meta('prompts', 'graph-infer-thinking-tree-user', { systemPromptId: 'graph-infer-thinking-tree-system' as PromptId, expectsJson: true, label: 'Infer Thinking Tree (User)', description: 'User prompt with files for thinking-tree inference.', group: 'searchAnalysis' }),

	// --- Report orchestrator: insight assignment (T11Y inline-prompt migration) ---
	'report-assign-insights': meta('prompts', 'report-assign-insights', { expectsJson: true, label: 'Report Assign Insights', description: 'Assigns user insights to plan sections (or creates new sections).', group: 'searchAnalysis' }),

	// --- Curator (T11Y inline-prompt migration) ---
	'curator-system': meta('prompts', 'curator-system', { label: 'Curator (System)', description: 'System prompt for the Peak Assistant configuration curator agent.', group: 'copilot' }),

	// --- Usage optimization (T11Y inline-prompt migration) ---
	'usage-optimization-system': meta('prompts', 'usage-optimization-system', { expectsJson: true, label: 'Usage Optimization (System)', description: 'System prompt for the AI usage optimization curator.', group: 'copilot' }),

	// --- Copilot find-and-solve-tasks action (T11Y inline-prompt migration) ---
	'copilot-find-and-solve-tasks-system': meta('prompts', 'copilot-find-and-solve-tasks-system', { label: 'Find & Solve Tasks (System)', description: 'System prompt for the Find & Solve Tasks Copilot action.', group: 'copilot' }),
	'copilot-find-and-solve-tasks-user': meta('prompts', 'copilot-find-and-solve-tasks-user', { systemPromptId: 'copilot-find-and-solve-tasks-system' as PromptId, label: 'Find & Solve Tasks (User)', description: 'User prompt listing open vault tasks that look like questions to resolve.', group: 'copilot' }),

	// --- Lint insights (T11Y inline-prompt migration) ---
	'lint-broken-link-repair': meta('prompts', 'lint-broken-link-repair', { label: 'Lint: Broken Link Repair', description: 'Repair plan prompt for the broken-link-repair vault health insight.', group: 'copilot' }),
	'lint-missing-targets': meta('prompts', 'lint-missing-targets', { label: 'Lint: Missing Targets', description: 'Mapping/creation prompt for missing-target vault health insights.', group: 'copilot' }),
	'lint-noise-source': meta('prompts', 'lint-noise-source', { label: 'Lint: Noise Source', description: 'Classification prompt for noise-source vault health insights.', group: 'copilot' }),
	'lint-orphan-reconnect': meta('prompts', 'lint-orphan-reconnect', { label: 'Lint: Orphan Reconnect', description: 'Reconnect plan prompt for orphan-note vault health insights.', group: 'copilot' }),
	'lint-tag-coverage': meta('prompts', 'lint-tag-coverage', { label: 'Lint: Tag Coverage', description: 'Tag-suggestion prompt for untagged-note vault health insights.', group: 'copilot' }),
	'lint-content-cleanup': meta('prompts', 'lint-content-cleanup', { label: 'Lint: Content Cleanup', description: 'Triage prompt for empty/stub-note vault health insights.', group: 'copilot' }),

	// --- Web search system prompt (shared by webSearchTool + chatToolBuilder) ---
	'web-search-tool-system': meta('prompts', 'web-search-tool-system', { label: 'Web Search Tool (System)', description: 'System prompt used when delegating to a web-search-capable profile from chat and vault tools.', group: 'chat' }),

	// --- Plan mode (chat) system prompt ---
	'plan-mode-system': meta('prompts', 'plan-mode-system', { label: 'Plan Mode (System)', description: 'System prompt prepended in Plan conversation mode.', group: 'chat' }),

	// --- Built-in skills (full skill markdown, frontmatter + body) ---
	'skill-weekly-report': meta('prompts', 'skill-weekly-report', { label: 'Skill: Weekly Report', description: 'Built-in Weekly Report skill markdown.', group: 'copilot' }),
	'skill-literature-review': meta('prompts', 'skill-literature-review', { label: 'Skill: Literature Review', description: 'Built-in Literature Review skill markdown.', group: 'copilot' }),
	'skill-vault-health-check': meta('prompts', 'skill-vault-health-check', { label: 'Skill: Vault Health Check', description: 'Built-in Vault Health Check skill markdown.', group: 'copilot' }),
};

export function getTemplateMetadata(id: TemplateId): TemplateMetadata {
	const m = TEMPLATE_METADATA[id];
	if (!m) throw new Error(`Unknown template id: ${id}`);
	return m;
}

export function isPromptTemplateId(id: TemplateId): id is PromptId {
	return id in TEMPLATE_METADATA && TEMPLATE_METADATA[id as TemplateId].category === 'prompts';
}

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
