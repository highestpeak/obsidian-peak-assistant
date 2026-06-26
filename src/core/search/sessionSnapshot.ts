/**
 * T11I (2026-06-26): framework-agnostic V2SessionSnapshot type.
 *
 * Mirrors the UI Zustand snapshot shape from
 * src/ui/view/quick-search/store/sessionSnapshot.ts but intentionally
 * **omits** `hitlState`. `HitlState.snapshot` references
 * `PlanSnapshot` (service-layer type), and only the live UI session
 * consumes the pause data — service-side persistence and background
 * runtimes never read it. Keeping HitlState out of the neutral type
 * avoids dragging service-side types into core.
 *
 * The UI re-exports a richer `V2SessionSnapshot` that extends this
 * neutral type with `hitlState` for in-process use.
 */

import type { LLMUsage } from '@/core/providers/types';
import type { AnalysisMode } from '@/service/agents/shared-types';
import type { V2ToolStep, V2TimelineItem, V2Source } from '@/core/search/v2ToolTypes';
import type { V2Section, Round } from '@/core/search/v2SessionTypes';
import type { SessionStatus, AutoSaveState } from '@/core/search/sessionTypes';

export interface V2SessionSnapshot {
	// Session identity
	id: string | null;
	query: string;
	title: string | null;
	status: SessionStatus;
	startedAt: number | null;

	// V2 state
	v2Active: boolean;
	v2View: 'process' | 'report' | 'sources';
	v2Steps: V2ToolStep[];
	v2ReportChunks: string[];
	v2ReportComplete: boolean;
	v2ToolCallIndex: Map<string, string>;
	v2Timeline: V2TimelineItem[];
	v2FinalReportStartIndex: number;
	v2Sources: V2Source[];
	v2FollowUpQuestions: string[];
	v2ProposedOutline: string | null;
	v2PlanSections: V2Section[];
	v2PlanApproved: boolean;
	v2UserInsights: string[];
	v2Summary: string;
	v2SummaryStreaming: boolean;
	rounds: Round[];
	currentRoundIndex: number;
	continueMode: boolean;

	// Metadata
	duration: number | null;
	usage: LLMUsage | null;
	phaseUsages: Array<{ phase: string; modelId: string; inputTokens: number; outputTokens: number }>;
	agentDebugLog: Array<{ ts: number; type: string; taskIndex?: number; data: Record<string, unknown> }>;
	error: string | null;
	analysisMode: AnalysisMode;
	runAnalysisMode: AnalysisMode | null;
	webEnabled: boolean;
	hasStartedStreaming: boolean;
	hasAnalyzed: boolean;
	autoSaveState: AutoSaveState;
	dashboardUpdatedLine: string;
}
