/**
 * SearchStep discriminated union types for the step-based AI search UI.
 * Each agent phase maps to a typed step with phase-specific payload fields.
 */

import type { AISearchGraph, AISearchSource, DashboardBlock, EvidenceIndex } from '@/service/agents/shared-types';
import type { PlanSnapshot } from '@/service/agents/vault/types';
import type { UserFeedback } from '@/service/agents/core/types';

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type StepStatus = 'running' | 'completed' | 'error' | 'skipped';

// ---------------------------------------------------------------------------
// Shared base
// ---------------------------------------------------------------------------

interface BaseStep {
	id: string;
	status: StepStatus;
	startedAt: number;
	endedAt?: number;
}

// ---------------------------------------------------------------------------
// Recon sub-types
// ---------------------------------------------------------------------------

export interface ReconTask {
	index: number;
	label?: string;
	completedFiles: number;
	totalFiles: number;
	currentPath?: string;
	done: boolean;
}

// ---------------------------------------------------------------------------
// Step types
// ---------------------------------------------------------------------------

export interface ClassifyDimension {
	id: string;
	intent_description?: string;
	axis: 'semantic' | 'topology' | 'temporal';
	scope_constraint?: {
		path: string;
		tags: string[];
		anchor_entity: string;
	} | null;
}

export interface ClassifyStep extends BaseStep {
	type: 'classify';
	dimensions: ClassifyDimension[];
}

export interface DecomposeTaskInfo {
	id: string;
	description: string;
	targetAreas: string[];
	toolHints: string[];
	coveredDimensionIds: string[];
	searchPriority: number;
}

export interface DecomposeStep extends BaseStep {
	type: 'decompose';
	taskCount: number;
	dimensionCount: number;
	taskDescriptions: DecomposeTaskInfo[];
}

export interface ReconProgressEntry {
	label: string;
	detail: string;
	timestamp: number;
	taskIndex?: number;
}

export interface ReconStep extends BaseStep {
	type: 'recon';
	tasks: ReconTask[];
	completedIndices: number[];
	total: number;
	groupProgress: Record<string, { completedTasks: number; totalTasks: number; currentPath?: string }>;
	/** Agent loop progress log — plan/tool call details per iteration */
	progressLog: ReconProgressEntry[];
}

export interface PlanStep extends BaseStep {
	type: 'plan';
	snapshot?: PlanSnapshot;
	hitlPauseId?: string;
	hitlPhase?: string;
	userFeedback?: UserFeedback;
}

export interface ReportStep extends BaseStep {
	type: 'report';
	blocks: DashboardBlock[];
	blockOrder: string[];
	completedBlocks: string[];
	dashboardUpdatedLine?: string;
	streamingText?: string;  // Partial summary text while report is generating
	summary?: string;        // Full summary text after report completes
}

export interface SummaryStep extends BaseStep {
	type: 'summary';
	chunks: string[];
	streaming: boolean;
}

export interface SourcesStep extends BaseStep {
	type: 'sources';
	sources: AISearchSource[];
	evidenceIndex: EvidenceIndex;
}

export interface GraphStep extends BaseStep {
	type: 'graph';
	graphData: AISearchGraph | null;
	mindflowMermaid: string;
	overviewMermaidVersions: string[];
	overviewMermaidActiveIndex: number;
}

export interface FollowupStep extends BaseStep {
	type: 'followup';
	questions: string[];
}

export interface GenericStep extends BaseStep {
	type: 'generic';
	title: string;
	description: string;
}

// ---------------------------------------------------------------------------
// Discriminated union
// ---------------------------------------------------------------------------

export type SearchStep =
	| ClassifyStep
	| DecomposeStep
	| ReconStep
	| PlanStep
	| ReportStep
	| SummaryStep
	| SourcesStep
	| GraphStep
	| FollowupStep
	| GenericStep;

export type SearchStepType = SearchStep['type'];

// ---------------------------------------------------------------------------
// V2 (Agent SDK) tool step
// ---------------------------------------------------------------------------

export interface V2ToolStep {
	id: string;                    // tool call id from SDK
	toolName: string;              // e.g. 'mcp__vault__vault_list_folders'
	displayName: string;           // e.g. 'Browsing vault structure'
	icon: string;                  // emoji
	input: Record<string, unknown>;
	status: 'running' | 'done' | 'error';
	startedAt: number;
	endedAt?: number;
	summary?: string;              // one-line summary extracted from tool result
	resultPreview?: string;        // raw result JSON for expanded view
}

/** Tool display name + icon, derived from toolName + input */
export function v2ToolDisplay(toolName: string, input: Record<string, unknown>): { displayName: string; icon: string } {
	const shortName = toolName.replace(/^mcp__vault__/, '');
	switch (shortName) {
		case 'vault_list_folders':
			return { displayName: 'Browsing vault structure', icon: '📂' };
		case 'vault_read_folder': {
			const folder = String(input.folder ?? '').split('/').pop() || 'folder';
			return { displayName: `Reading ${folder}`, icon: '📂' };
		}
		case 'vault_read_note': {
			const path = String(input.path ?? input.paths?.[0] ?? '');
			const basename = path.split('/').pop()?.replace(/\.md$/, '') || 'note';
			return { displayName: `Reading ${basename}`, icon: '📄' };
		}
		case 'vault_grep': {
			const query = String(input.pattern ?? input.query ?? '');
			return { displayName: `Searching "${query.slice(0, 30)}"`, icon: '🔍' };
		}
		case 'vault_wikilink_expand': {
			const path = String(input.path ?? '');
			const basename = path.split('/').pop()?.replace(/\.md$/, '') || 'note';
			return { displayName: `Following links from ${basename}`, icon: '🔗' };
		}
		case 'submit_plan':
			return { displayName: 'Evidence plan', icon: '📋' };
		default:
			return { displayName: shortName, icon: '🔧' };
	}
}

/**
 * Unwrap SDK tool result content blocks to get the actual text.
 * SDK tool_result.content can be:
 *   - a string (direct text)
 *   - an array of content blocks: [{type:'text', text:'...'}]
 *   - null/undefined
 */
export function unwrapToolOutput(output: unknown): string {
	if (typeof output === 'string') return output;
	if (Array.isArray(output)) {
		return output
			.filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
			.map((b: any) => b.text)
			.join('');
	}
	if (output && typeof output === 'object') return JSON.stringify(output);
	return '';
}

/** Extract human-readable summary from tool result */
export function extractV2Summary(toolName: string, result: unknown): string {
	try {
		const raw = unwrapToolOutput(result);
		if (!raw) return '';
		const data = JSON.parse(raw);
		const shortName = toolName.replace(/^mcp__vault__/, '');
		switch (shortName) {
			case 'vault_list_folders':
				return `${data.folders?.length ?? 0} folders · ${data.totalMdFiles ?? 0} files`;
			case 'vault_read_folder':
				return `${data.totalCount ?? data.files?.length ?? 0} files in ${data.folder ?? ''}`;
			case 'vault_read_note':
				return data.error ? `⚠️ ${data.error}` : `${(data.bodyPreview ?? data.body ?? '').length} chars`;
			case 'vault_grep':
				return `${data.hits?.length ?? 0} hits`;
			case 'vault_wikilink_expand':
				return `${data.visited?.length ?? 0} notes discovered`;
			case 'submit_plan':
				return `${data.adjustedPaths?.length ?? data.selected_paths?.length ?? 0} sources selected`;
			default:
				return '';
		}
	} catch {
		return '';
	}
}

// ---------------------------------------------------------------------------
// Phase → step type mapping
// ---------------------------------------------------------------------------

export const PHASE_TO_STEP_TYPE: Record<string, SearchStepType> = {
	'classify': 'classify',
	'decompose': 'decompose',
	'intuition-feedback': 'generic',
	'recon': 'recon',
	'present-plan': 'plan',
	'report': 'report',
};

// ---------------------------------------------------------------------------
// Collapse behaviour sets
// ---------------------------------------------------------------------------

export const AUTO_COLLAPSE_TYPES = new Set<SearchStepType>([
	// Decompose collapses when Recon starts — tasks are shown again in Recon panels
	'decompose',
]);

export const STAY_EXPANDED_TYPES = new Set<SearchStepType>([
	'report',
	'summary',
	'sources',
	'graph',
	'followup',
]);

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createStep<T extends SearchStepType>(
	type: T,
	id?: string,
): Extract<SearchStep, { type: T }> {
	const stepId = id ?? `${type}-${Date.now()}`;
	const base: BaseStep = {
		id: stepId,
		status: 'running',
		startedAt: Date.now(),
	};

	switch (type) {
		case 'classify':
			return { ...base, type: 'classify', dimensions: [] as ClassifyDimension[] } as Extract<SearchStep, { type: T }>;
		case 'decompose':
			return { ...base, type: 'decompose', taskCount: 0, dimensionCount: 0, taskDescriptions: [] as DecomposeTaskInfo[] } as Extract<SearchStep, { type: T }>;
		case 'recon':
			return { ...base, type: 'recon', tasks: [], completedIndices: [], total: 0, groupProgress: {}, progressLog: [] } as Extract<SearchStep, { type: T }>;
		case 'plan':
			return { ...base, type: 'plan' } as Extract<SearchStep, { type: T }>;
		case 'report':
			return { ...base, type: 'report', blocks: [], blockOrder: [], completedBlocks: [] } as Extract<SearchStep, { type: T }>;
		case 'summary':
			return { ...base, type: 'summary', chunks: [], streaming: false } as Extract<SearchStep, { type: T }>;
		case 'sources':
			return { ...base, type: 'sources', sources: [], evidenceIndex: {} } as Extract<SearchStep, { type: T }>;
		case 'graph':
			return { ...base, type: 'graph', graphData: null, mindflowMermaid: '', overviewMermaidVersions: [], overviewMermaidActiveIndex: 0 } as Extract<SearchStep, { type: T }>;
		case 'followup':
			return { ...base, type: 'followup', questions: [] } as Extract<SearchStep, { type: T }>;
		case 'generic':
			return { ...base, type: 'generic', title: '', description: '' } as Extract<SearchStep, { type: T }>;
		default: {
			const _exhaustive: never = type;
			throw new Error(`Unknown step type: ${_exhaustive}`);
		}
	}
}
