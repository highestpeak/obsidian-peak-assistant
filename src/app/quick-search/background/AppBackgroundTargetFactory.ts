// T10: Background-session redirect-target factory.
//
// Replaces the legacy `BackgroundSessionManager.buildSnapshotTarget`.
// The factory casts the opaque `QuickSearchForegroundSnapshot` back to
// the concrete `V2SessionSnapshot` shape so it can mutate the UI-typed
// fields (v2Steps, v2Timeline, v2PlanSections, etc.) the way the
// Zustand store does for the foreground session. Session-level state
// transitions (title, plan-ready, completed, error) flow through the
// `QuickSearchBackgroundSessionHooks` so the runtime owns persistence
// + notification side effects.

import type {
	QuickSearchBackgroundTargetFactoryPort,
} from '@/service/search/background/ports/QuickSearchBackgroundPorts';
import type {
	QuickSearchBackgroundEventTarget,
	QuickSearchBackgroundSession,
	QuickSearchBackgroundSessionHooks,
} from '@/service/search/background/QuickSearchBackgroundTypes';
import type { EventDispatchTarget } from '@/ui/view/quick-search/hooks/eventDispatcher';
import type { V2SessionSnapshot } from '@/ui/view/quick-search/store/sessionSnapshot';
import type { V2ToolStep, V2Source } from '@/ui/view/quick-search/types/search-steps';
import type { V2Section } from '@/ui/view/quick-search/store/searchSessionStore';

export class AppBackgroundTargetFactory implements QuickSearchBackgroundTargetFactoryPort {
	build(
		session: QuickSearchBackgroundSession,
		hooks: QuickSearchBackgroundSessionHooks,
	): QuickSearchBackgroundEventTarget {
		const snap = session.snapshot as V2SessionSnapshot;

		const target: EventDispatchTarget = {
			enableDevTools: () => true,
			getV2Active: () => snap.v2Active,
			getV2ProposedOutline: () => snap.v2ProposedOutline,
			getStartedAt: () => snap.startedAt,
			getV2StepsLength: () => snap.v2Steps.length,
			getV2Sources: () => snap.v2Sources,
			setV2Active: (active: boolean) => {
				snap.v2Active = active;
			},
			addPhaseUsage: (usage) => {
				snap.phaseUsages.push(usage);
			},
			pushV2TimelineText(id: string, chunk: string) {
				const last = snap.v2Timeline[snap.v2Timeline.length - 1];
				if (last && last.kind === 'text' && !last.complete) {
					last.text += chunk;
				} else {
					snap.v2Timeline.push({ kind: 'text', id, text: chunk, complete: false });
				}
			},
			resolveV2ToolName: (id: string) => snap.v2ToolCallIndex.get(id) ?? 'unknown',
			updateV2Step(id: string, updater: (step: V2ToolStep) => V2ToolStep) {
				const idx = snap.v2Steps.findIndex((s) => s.id === id);
				if (idx !== -1) snap.v2Steps[idx] = updater(snap.v2Steps[idx]);
			},
			updateV2TimelineTool(id: string, updater: (step: V2ToolStep) => V2ToolStep) {
				const idx = snap.v2Timeline.findIndex(
					(item) => item.kind === 'tool' && item.step.id === id,
				);
				if (idx !== -1) {
					const item = snap.v2Timeline[idx] as { kind: 'tool'; step: V2ToolStep };
					snap.v2Timeline[idx] = { kind: 'tool', step: updater(item.step) };
				}
			},
			appendAgentDebugLog(entry: { type: string; taskIndex?: number; data: Record<string, unknown> }) {
				if (snap.agentDebugLog.length >= 2000) {
					snap.agentDebugLog = snap.agentDebugLog.slice(-1999);
				}
				snap.agentDebugLog.push({ ts: Date.now(), ...entry });
			},
			setDashboardUpdatedLine: (line: string) => {
				snap.dashboardUpdatedLine = line ?? '';
			},
			setTitle: (title: string | null) => {
				snap.title = title;
				hooks.setTitle(title);
			},
			setHasAnalyzed: (v: boolean) => {
				snap.hasAnalyzed = v;
			},
			setUsage: (usage) => {
				snap.usage = usage;
			},
			setDuration: (duration: number) => {
				snap.duration = duration;
			},
			markCompleted: () => {
				snap.status = 'completed';
				hooks.markCompleted();
			},
			markV2ReportComplete: () => {
				snap.v2ReportComplete = true;
			},
			recordError: (error: string) => {
				snap.status = 'error';
				snap.error = error;
				hooks.markError(error);
			},
			setHitlPause: (state) => {
				snap.hitlState = { isPaused: true, ...state };
			},
			pushV2Step: (step: V2ToolStep) => {
				snap.v2Steps.push(step);
			},
			registerV2ToolCall: (id: string, toolName: string) => {
				snap.v2ToolCallIndex.set(id, toolName);
			},
			setProposedOutline: (outline: string) => {
				snap.v2ProposedOutline = outline;
			},
			setFollowUpQuestions: (questions: string[]) => {
				snap.v2FollowUpQuestions = questions;
			},
			setV2Sources: (sources: V2Source[]) => {
				snap.v2Sources = sources;
			},
			pushV2TimelineTool: (step: V2ToolStep) => {
				const last = snap.v2Timeline[snap.v2Timeline.length - 1];
				if (last && last.kind === 'text' && !last.complete) {
					(last as { complete: boolean }).complete = true;
				}
				snap.v2Timeline.push({ kind: 'tool', step });
			},
			addV2Source: (source: V2Source) => {
				if (!snap.v2Sources.some((s) => s.path === source.path)) {
					snap.v2Sources.push(source);
				}
			},
			setPlanSections: (sections: V2Section[]) => {
				snap.v2PlanSections = sections;
				if (sections.length > 0 && session.status === 'streaming') {
					hooks.markPlanReady();
				}
			},
			setPlanReady: () => {
				// The Zustand store's `setPlanReady` only flips
				// `status === 'plan_ready'` for the foreground hook gate;
				// for background sessions the equivalent is the
				// `markPlanReady` hook fired from `setPlanSections`. No-op
				// here to avoid double-firing.
			},
		};

		return target;
	}
}
