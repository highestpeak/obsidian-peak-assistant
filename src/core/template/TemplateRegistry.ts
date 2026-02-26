import type { PromptId } from '@/service/prompt/PromptId';

/**
 * Category of template. Determines base path under plugin directory.
 */
export type TemplateCategory = 'prompts' | 'tools' | 'agents' | 'ui';

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
 * Agent helper template IDs (result snapshot, evidence hint, mindflow context).
 */
export const AgentTemplateId = {
	ResultSnapshot: 'result-snapshot',
	EvidenceHint: 'evidence-hint',
	MindflowContext: 'mindflow-context',
} as const;

export type AgentTemplateId = (typeof AgentTemplateId)[keyof typeof AgentTemplateId];

/**
 * Union of all template identifiers.
 */
export type TemplateId = PromptId | ToolTemplateId | AgentTemplateId;

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
}

/** Path prefix per category (under plugin dir). All under templates/. */
const CATEGORY_PREFIX: Record<TemplateCategory, string> = {
	prompts: 'templates/prompts',
	tools: 'templates/tools',
	agents: 'templates/agents',
	ui: 'templates/ui',
};

function meta(
	category: TemplateCategory,
	fileStem: string,
	opts?: Partial<Pick<TemplateMetadata, 'expectsJson' | 'jsonConstraint' | 'systemPromptId'>>
): TemplateMetadata {
	const ext = 'md';
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
	'conversation-system': meta('prompts', 'conversation-system'),
	'conversation-summary-short': meta('prompts', 'conversation-summary-short'),
	'conversation-summary-full': meta('prompts', 'conversation-summary-full'),
	'project-summary-short': meta('prompts', 'project-summary-short'),
	'project-summary-full': meta('prompts', 'project-summary-full'),
	'search-rerank-rank-gpt': meta('prompts', 'search-rerank-rank-gpt'),
	'application-generate-title': meta('prompts', 'application-generate-title'),
	'memory-extract-candidates-json': meta('prompts', 'memory-extract-candidates-json', { expectsJson: true, jsonConstraint: 'Return only the JSON array, nothing else.' }),
	'prompt-quality-eval-json': meta('prompts', 'prompt-quality-eval-json', { expectsJson: true, jsonConstraint: 'Return only the JSON object, nothing else.' }),
	'prompt-rewrite-with-library': meta('prompts', 'prompt-rewrite-with-library'),
	'doc-summary': meta('prompts', 'doc-summary'),
	'ai-analysis-session-summary': meta('prompts', 'ai-analysis-session-summary'),
	'image-description': meta('prompts', 'image-description'),
	'image-summary': meta('prompts', 'image-summary'),
	'folder-project-summary': meta('prompts', 'folder-project-summary'),
	'ai-analysis-followup': meta('prompts', 'ai-analysis-followup'),
	'ai-analysis-followup-system': meta('prompts', 'ai-analysis-followup-system'),
	'ai-analysis-title': meta('prompts', 'ai-analysis-dashboard-title'),
	'ai-analysis-doc-simple-scope': meta('prompts', 'ai-analysis-doc-simple-scope'),
	'ai-analysis-doc-simple-system': meta('prompts', 'ai-analysis-doc-simple-system'),
	'ai-analysis-suggest-follow-up-questions-system': meta('prompts', 'ai-analysis-suggest-follow-up-questions-system'),
	'ai-analysis-suggest-follow-up-questions': meta('prompts', 'ai-analysis-suggest-follow-up-questions', { systemPromptId: 'ai-analysis-suggest-follow-up-questions-system' as PromptId }),
	'ai-search-system': meta('prompts', 'ai-analysis-agent-raw-search-system'),
	'thought-agent-system': meta('prompts', 'ai-analysis-agent-thought-system'),
	'ai-analysis-summary-system': meta('prompts', 'ai-analysis-dashboard-result-summary-system'),
	'search-ai-summary': meta('prompts', 'ai-analysis-dashboard-result-summary', { systemPromptId: 'ai-analysis-summary-system' as PromptId }),
	'ai-analysis-overview-mermaid-system': meta('prompts', 'ai-analysis-dashboard-overview-mermaid-system'),
	'ai-analysis-overview-mermaid': meta('prompts', 'ai-analysis-dashboard-overview-mermaid', { systemPromptId: 'ai-analysis-overview-mermaid-system' as PromptId }),
	'ai-analysis-dashboard-update-topics-system': meta('prompts', 'ai-analysis-dashboard-update-topics-system'),
	'ai-analysis-dashboard-update-topics': meta('prompts', 'ai-analysis-dashboard-update-topics', { systemPromptId: 'ai-analysis-dashboard-update-topics-system' as PromptId }),
	'ai-analysis-dashboard-update-blocks-system': meta('prompts', 'ai-analysis-dashboard-update-blocks-system'),
	'ai-analysis-dashboard-update-blocks': meta('prompts', 'ai-analysis-dashboard-update-blocks', { systemPromptId: 'ai-analysis-dashboard-update-blocks-system' as PromptId }),
	'ai-analysis-review-blocks-system': meta('prompts', 'ai-analysis-review-blocks-system'),
	'ai-analysis-review-blocks': meta('prompts', 'ai-analysis-review-blocks', { systemPromptId: 'ai-analysis-review-blocks-system' as PromptId }),
	'ai-analysis-dashboard-update-plan-system': meta('prompts', 'ai-analysis-dashboard-update-plan-system'),
	'ai-analysis-dashboard-update-plan': meta('prompts', 'ai-analysis-dashboard-update-plan', { systemPromptId: 'ai-analysis-dashboard-update-plan-system' as PromptId }),
	'ai-analysis-mindflow-agent-system': meta('prompts', 'ai-analysis-mindflow-agent-system'),
	'ai-analysis-mindflow-agent': meta('prompts', 'ai-analysis-mindflow-agent', { systemPromptId: 'ai-analysis-mindflow-agent-system' as PromptId }),
	'ai-analysis-mermaid-fix-system': meta('prompts', 'ai-analysis-mermaid-fix-system'),
	'ai-analysis-mermaid-fix': meta('prompts', 'ai-analysis-mermaid-fix', { systemPromptId: 'ai-analysis-mermaid-fix-system' as PromptId }),
	'ai-analysis-final-refine-system': meta('prompts', 'ai-analysis-final-refine-system'),
	'ai-analysis-final-refine': meta('prompts', 'ai-analysis-final-refine', { systemPromptId: 'ai-analysis-final-refine-system' as PromptId }),
	'ai-analysis-final-refine-sources-system': meta('prompts', 'ai-analysis-final-refine-sources-system'),
	'ai-analysis-final-refine-sources': meta('prompts', 'ai-analysis-final-refine-sources', { systemPromptId: 'ai-analysis-final-refine-sources-system' as PromptId }),
	'ai-analysis-final-refine-source-scores-system': meta('prompts', 'ai-analysis-final-refine-source-scores-system'),
	'ai-analysis-final-refine-source-scores': meta('prompts', 'ai-analysis-final-refine-source-scores', { systemPromptId: 'ai-analysis-final-refine-source-scores-system' as PromptId }),
	'ai-analysis-save-filename': meta('prompts', 'ai-analysis-save-filename'),
	'ai-analysis-save-folder': meta('prompts', 'ai-analysis-save-folder'),
	'doc-type-classify-json': meta('prompts', 'doc-type-classify-json', { expectsJson: true, jsonConstraint: 'Return only the JSON object, nothing else.' }),
	'doc-tag-generate-json': meta('prompts', 'doc-tag-generate-json', { expectsJson: true, jsonConstraint: 'Return only the JSON array, nothing else.' }),
	'context-memory': meta('prompts', 'context-memory'),
	'user-profile-context': meta('prompts', 'user-profile-context'),
	'profile-from-vault-json': meta('prompts', 'profile-from-vault-json', { expectsJson: true, jsonConstraint: 'Return only the JSON array, nothing else.' }),
	'user-profile-organize-markdown': meta('prompts', 'user-profile-organize-markdown'),
	'message-resources': meta('prompts', 'message-resources'),

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
	[AgentTemplateId.MindflowContext]: meta('agents', 'mindflow-context'),
};

export function getTemplateMetadata(id: TemplateId): TemplateMetadata {
	const m = TEMPLATE_METADATA[id];
	if (!m) throw new Error(`Unknown template id: ${id}`);
	return m;
}

export function isPromptTemplateId(id: TemplateId): id is PromptId {
	return id in TEMPLATE_METADATA && TEMPLATE_METADATA[id as TemplateId].category === 'prompts';
}
