/**
 * Accumulates search-stage ui-signal and parallel-stream-progress for pipeline visualizer.
 * Dimensions from classify complete; recon/evidence progress from progress signals.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useSubscribeUIEvent } from '@/ui/store/uiEventStore';
import { UISignalChannel } from '@/core/providers/types';

export type DimensionChoice = { id: string; intent_description?: string };

export type PipelineStage =
	| 'idle'
	| 'classify'
	| 'decompose'
	| 'recon'
	| 'presentPlan'
	| 'consolidate'
	| 'grouping'
	| 'evidence'
	| 'reportPlan'
	| 'visualBlueprint'
	| 'reportBlock';

export interface SearchPipelineState {
	stage: PipelineStage;
	dimensions: DimensionChoice[];
	reconCompletedIndices: number[];
	reconTotal: number;
	groupCount: number;
	groups: Array<{ groupId: string; topic_anchor: string; group_focus: string }>;
	evidenceCompletedIndices: number[];
	evidenceTotal: number;
	evidencePerGroup: Record<string, { completedTasks: number; totalTasks: number; currentPath?: string }>;
	reportPlanProgress: { phaseId?: string; index: number; total: number };
	visualBlueprintProgress: { blockId?: string; index: number; total: number };
	reportBlockCompleted: Set<string>;
	/** Block IDs in order (from visualBlueprint progress) for skeleton display. */
	reportBlockOrder: string[];
	taskCount: number;
}

const initial: SearchPipelineState = {
	stage: 'idle',
	dimensions: [],
	reconCompletedIndices: [],
	reconTotal: 0,
	groupCount: 0,
	groups: [],
	evidenceCompletedIndices: [],
	evidenceTotal: 0,
	evidencePerGroup: {},
	reportPlanProgress: { index: 0, total: 0 },
	visualBlueprintProgress: { index: 0, total: 0 },
	reportBlockCompleted: new Set(),
	reportBlockOrder: [],
	taskCount: 0,
};

export function useSearchPipelineStage(opts?: { isStreaming?: boolean }) {
	const [state, setState] = useState<SearchPipelineState>(initial);
	const stateRef = useRef(state);
	stateRef.current = state;

	const reset = useCallback(() => {
		setState(initial);
	}, []);

	const phaseTransitionMap: Record<string, PipelineStage> = {
		'classify': 'classify',
		'decompose': 'decompose',
		'recon': 'recon',
		'present-plan': 'presentPlan',
		'report': 'reportBlock',
	};

	const handleEvent = useCallback((type: string, payload: any) => {
		if (type === 'phase-transition') {
			const to = payload?.to as string;
			if (to === 'complete') {
				setState((s) => ({ ...s, stage: 'idle' }));
			} else {
				const mapped = phaseTransitionMap[to];
				if (mapped) setState((s) => ({ ...s, stage: mapped }));
			}
			return;
		}
		if (type === 'ui-signal') {
			const channel = payload?.channel;
			const inner = payload?.payload ?? payload;
			if (channel !== UISignalChannel.SEARCH_STAGE) return;
			const stage = inner?.stage as PipelineStage | undefined;
			const status = inner?.status;
			if (stage === 'classify' && status === 'start') {
				setState(initial);
			}
			if (stage) {
				setState((s) => ({ ...s, stage }));
			}
			if (inner?.dimensions) {
				const dimensions = Array.isArray(inner.dimensions) ? inner.dimensions : [];
				setState((s) => ({
					...s,
					dimensions: dimensions.map((d: any) =>
						typeof d === 'object' && d !== null
							? { id: d.id ?? '', intent_description: d.intent_description }
							: { id: String(d), intent_description: '' },
					),
					stage: stage ?? s.stage,
				}));
			}
			if (status === 'progress' && inner) {
				if (Array.isArray(inner.completedIndices)) {
					setState((s) => ({
						...s,
						reconCompletedIndices: s.stage === 'recon' ? inner.completedIndices : s.reconCompletedIndices,
						reconTotal: typeof inner.total === 'number' ? inner.total : s.reconTotal,
					}));
				}
				if (typeof inner.groupCount === 'number') {
					setState((s) => ({ ...s, groupCount: inner.groupCount }));
				}
				if (Array.isArray(inner.groups)) {
					setState((s) => ({
						...s,
						groups: inner.groups,
						stage: s.stage === 'grouping' ? 'grouping' : s.stage,
					}));
				}
				if (inner.groupId != null) {
					setState((s) => ({
						...s,
						evidencePerGroup: {
							...s.evidencePerGroup,
							[inner.groupId]: {
								completedTasks: inner.completedTasks ?? s.evidencePerGroup[inner.groupId]?.completedTasks ?? 0,
								totalTasks: inner.totalTasks ?? s.evidencePerGroup[inner.groupId]?.totalTasks ?? 0,
								currentPath: inner.currentPath,
							},
						},
					}));
				}
				if (typeof inner.phaseId === 'string' || typeof inner.index === 'number') {
					setState((s) => ({
						...s,
						reportPlanProgress: {
							phaseId: inner.phaseId,
							index: typeof inner.index === 'number' ? inner.index : s.reportPlanProgress.index,
							total: typeof inner.total === 'number' ? inner.total : s.reportPlanProgress.total,
						},
					}));
				}
				if (typeof inner.blockId === 'string' || (stage === 'visualBlueprint' && typeof inner.index === 'number')) {
					setState((s) => {
						const blockId = inner.blockId as string | undefined;
						const nextOrder = blockId && !s.reportBlockOrder.includes(blockId)
							? [...s.reportBlockOrder, blockId]
							: s.reportBlockOrder;
						return {
							...s,
							visualBlueprintProgress: {
								blockId: inner.blockId,
								index: typeof inner.index === 'number' ? inner.index : s.visualBlueprintProgress.index,
								total: typeof inner.total === 'number' ? inner.total : s.visualBlueprintProgress.total,
							},
							reportBlockOrder: nextOrder,
						};
					});
				}
				if (inner.blockId && status === 'complete') {
					setState((s) => {
						const next = new Set(s.reportBlockCompleted);
						next.add(inner.blockId);
						return { ...s, reportBlockCompleted: next };
					});
				}
			}
			if (stage === 'decompose' && typeof inner?.taskCount === 'number') {
				setState((s) => ({ ...s, taskCount: inner.taskCount }));
			}
			if (status === 'complete' && stage === 'grouping' && Array.isArray(inner?.groups)) {
				setState((s) => ({ ...s, groups: inner.groups }));
			}
			return;
		}
		if (type === 'parallel-stream-progress') {
			const completed = payload?.completed;
			const total = payload?.total;
			const completedIndices = payload?.completedIndices;
			setState((s) => {
				const stage = s.stage;
				if (stage === 'recon' && typeof total === 'number') {
					return {
						...s,
						reconTotal: total,
						reconCompletedIndices: Array.isArray(completedIndices) ? completedIndices : s.reconCompletedIndices,
					};
				}
				if (stage === 'evidence' && typeof total === 'number') {
					return {
						...s,
						evidenceTotal: total,
						evidenceCompletedIndices: Array.isArray(completedIndices) ? completedIndices : s.evidenceCompletedIndices,
					};
				}
				return s;
			});
		}
	}, []);

	useSubscribeUIEvent(new Set(['ui-signal', 'parallel-stream-progress', 'phase-transition']), handleEvent);

	return { state, reset };
}
