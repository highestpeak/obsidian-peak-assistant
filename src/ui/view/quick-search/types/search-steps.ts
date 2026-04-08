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

export interface ClassifyStep extends BaseStep {
	type: 'classify';
	dimensions: { id: string; intent_description?: string }[];
}

export interface DecomposeStep extends BaseStep {
	type: 'decompose';
	taskCount: number;
	dimensionCount: number;
}

export interface ReconStep extends BaseStep {
	type: 'recon';
	tasks: ReconTask[];
	completedIndices: number[];
	total: number;
	groupProgress: Record<string, { completedTasks: number; totalTasks: number; currentPath?: string }>;
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
	'classify',
	'decompose',
	'recon',
	'plan',
	'generic',
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
			return { ...base, type: 'classify', dimensions: [] } as Extract<SearchStep, { type: T }>;
		case 'decompose':
			return { ...base, type: 'decompose', taskCount: 0, dimensionCount: 0 } as Extract<SearchStep, { type: T }>;
		case 'recon':
			return { ...base, type: 'recon', tasks: [], completedIndices: [], total: 0, groupProgress: {} } as Extract<SearchStep, { type: T }>;
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
