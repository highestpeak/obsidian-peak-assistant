import type { AnalysisMode } from '@/core/types/agents-shared';
export type { AnalysisMode };
import { useSearchSessionStore } from './searchSessionStore';
import { useAIGraphStore } from './aiGraphStore';
import { useGraphAgentStore } from './graphAgentStore';

// T11I (2026-06-26): types moved to core. UI re-exports for compatibility.
export type {
	SectionAnalyzeResult,
	UIStepRecord,
	CompletedAnalysisSnapshot,
} from '@/core/storage/vault/search-docs/analysisSnapshotTypes';
export { getSnapshotSummary } from '@/core/storage/vault/search-docs/analysisSnapshotTypes';
import { getSnapshotSummary } from '@/core/storage/vault/search-docs/analysisSnapshotTypes';
import type { CompletedAnalysisSnapshot } from '@/core/storage/vault/search-docs/analysisSnapshotTypes';

/** Load snapshot into searchSessionStore (and graph stores for replay). */
export function loadCompletedAnalysisSnapshot(snapshot: CompletedAnalysisSnapshot, sourceVaultPath?: string): void {
	bridgeSnapshotToSearchSessionStore(snapshot, sourceVaultPath);
}

// ---------------------------------------------------------------------------
// Snapshot bridge
// ---------------------------------------------------------------------------

/** Reconstruct V2ToolStep[] + V2TimelineItem[] from saved process log strings. */
function reconstructProcessTimeline(
	processLog: string[],
	startedAt: number,
): { steps: import('../types/search-steps').V2ToolStep[]; timeline: import('../types/search-steps').V2TimelineItem[] } {
	const steps: import('../types/search-steps').V2ToolStep[] = [];
	const timeline: import('../types/search-steps').V2TimelineItem[] = [];

	let stepIdx = 0;
	for (let i = 0; i < processLog.length; i++) {
		const line = processLog[i];

		// Thinking text: lines prefixed with 💭
		if (line.startsWith('\u{1F4AD} ') || line.startsWith('💭 ')) {
			const text = line.slice(line.indexOf(' ') + 1);
			timeline.push({ kind: 'text', id: `restored-text-${i}`, text, complete: true });
			continue;
		}

		const parts = line.split(' — ').map(p => p.trim());
		const firstSpace = parts[0].indexOf(' ');
		const icon = firstSpace > 0 ? parts[0].slice(0, firstSpace) : '🔧';
		const displayName = firstSpace > 0 ? parts[0].slice(firstSpace + 1) : parts[0];

		let summary = '';
		let durationSec = 0;
		if (parts.length >= 3) {
			const durMatch = parts[parts.length - 1].match(/^(\d+\.?\d*)s$/);
			if (durMatch) {
				durationSec = parseFloat(durMatch[1]);
				summary = parts.slice(1, -1).join(' — ');
			} else {
				summary = parts.slice(1).join(' — ');
			}
		} else if (parts.length === 2) {
			const durMatch = parts[1].match(/^(\d+\.?\d*)s$/);
			if (durMatch) {
				durationSec = parseFloat(durMatch[1]);
			} else {
				summary = parts[1];
			}
		}

		const stepStartedAt = startedAt + stepIdx * 100;
		const step: import('../types/search-steps').V2ToolStep = {
			id: `restored-step-${stepIdx}`,
			toolName: 'restored',
			displayName,
			icon,
			input: {},
			status: 'done',
			startedAt: stepStartedAt,
			endedAt: stepStartedAt + durationSec * 1000,
			summary: summary || undefined,
		};
		steps.push(step);
		timeline.push({ kind: 'tool', step });
		stepIdx++;
	}

	return { steps, timeline };
}

function bridgeSnapshotToSearchSessionStore(snapshot: CompletedAnalysisSnapshot, sourceVaultPath?: string): void {
	const now = Date.now();
	const startedAt = snapshot.analysisStartedAtMs ?? now;
	const isV2 = !!(
		(snapshot.v2ReportSections && snapshot.v2ReportSections.length > 0) ||
		(snapshot.v2ProcessLog && snapshot.v2ProcessLog.length > 0) ||
		snapshot.v2PlanOutline ||
		snapshot.v2GraphJson
	);

	if (isV2) {
		// Restore V2 state — reconstruct V2Section[] from persisted report sections
		const v2PlanSections: import('./searchSessionStore').V2Section[] = (snapshot.v2ReportSections ?? []).map((sec, i) => ({
			id: sec.id || `restored-sec-${i}`,
			title: sec.title,
			contentType: sec.contentType ?? '',
			visualType: sec.visualType ?? '',
			evidencePaths: sec.evidencePaths ?? [],
			brief: sec.brief ?? '',
			weight: sec.weight ?? 1,
			missionRole: sec.missionRole ?? '',
			status: 'done' as const,
			content: sec.content,
			streamingText: '',
			generations: [{ content: sec.content, timestamp: startedAt }],
		}));

		// Convert AISearchSource[] back to V2Source[] if sources were saved
		const v2Sources: import('../types/search-steps').V2Source[] = (snapshot.sources ?? []).map(s => ({
			path: s.path,
			title: s.title,
			readAt: startedAt,
			reasoning: s.reasoning ?? undefined,
		}));

		// Reconstruct process timeline from saved log
		const { steps: restoredSteps, timeline: restoredTimeline } =
			(snapshot.v2ProcessLog?.length)
				? reconstructProcessTimeline(snapshot.v2ProcessLog, startedAt)
				: { steps: [], timeline: [] };

		// Restore graph data if present
		if (snapshot.v2GraphJson) {
			try {
				const graphPayload = JSON.parse(snapshot.v2GraphJson);
				if (
					graphPayload.artifactRef?.kind === 'ai-graph'
					&& typeof graphPayload.artifactRef.graphId === 'string'
					&& typeof graphPayload.artifactRef.versionId === 'string'
				) {
					useAIGraphStore.getState().setArtifactRef({
						graphId: graphPayload.artifactRef.graphId,
						versionId: graphPayload.artifactRef.versionId,
					});
				}
				if (graphPayload.lenses) {
					const lensKeys = Object.keys(graphPayload.lenses);
					if (lensKeys.length > 0) {
						const graphData = graphPayload.lenses[lensKeys[0]];

						// Restore to graphAgentStore (used by SourcesGraph → useGraphAgent)
						const sourcePaths = (snapshot.sources ?? []).map(s => s.path).sort().join('|');
						const graphQuery = String((snapshot as CompletedAnalysisSnapshot & { query?: string }).query ?? '').trim();
						useGraphAgentStore.getState().setCacheKey(`${graphQuery}\n${sourcePaths}`);
						useGraphAgentStore.getState().setGraphData(graphData);

						// Also restore to aiGraphStore (used by standalone graph view)
						useAIGraphStore.setState({
							graphData,
							activeLens: lensKeys[0] as any,
						});
					}
				}
			} catch { /* ignore malformed graph JSON */ }
		}

		useSearchSessionStore.setState((prev) => ({
			id: snapshot.analysisStartedAtMs ? `restored:${snapshot.analysisStartedAtMs}` : `restored:${now}`,
			query: snapshot.query ?? '',
			status: 'completed',
			startedAt,
			duration: snapshot.duration ?? null,
			usage: snapshot.usage ?? null,
			title: snapshot.title ?? null,
			hasAnalyzed: true,
			restoredFromHistory: true,
			restoredFromVaultPath: sourceVaultPath ?? null,
			analysisMode: snapshot.runAnalysisMode ?? 'vaultFull',
			// Seed lastSavedPath so any later re-save (e.g. on-demand graph
			// generation after restore) overwrites the original markdown
			// instead of creating a new file.
			autoSaveState: { ...prev.autoSaveState, lastSavedPath: sourceVaultPath ?? null },
			// V2 state
			v2Active: true,
			v2View: 'report',
			v2PlanSections,
			v2PlanApproved: true,
			v2ReportComplete: true,
			v2ProposedOutline: snapshot.v2PlanOutline ?? null,
			v2Sources,
			v2FollowUpQuestions: snapshot.v2FollowUpQuestions ?? [],
			v2Summary: getSnapshotSummary(snapshot),
			v2SummaryStreaming: false,
			v2SectionFollowups: snapshot.blocksFollowupsByBlockId ?? {},
			v2Steps: restoredSteps,
			v2Timeline: restoredTimeline,
		}));
		return;
	}

	// Non-V2 snapshots: restore minimal session state for display
	useSearchSessionStore.setState((prev) => ({
		id: snapshot.analysisStartedAtMs ? `restored:${snapshot.analysisStartedAtMs}` : `restored:${now}`,
		query: snapshot.query ?? '',
		status: 'completed',
		startedAt,
		duration: snapshot.duration ?? null,
		usage: snapshot.usage ?? null,
		title: snapshot.title ?? null,
		hasAnalyzed: true,
		restoredFromHistory: true,
		restoredFromVaultPath: sourceVaultPath ?? null,
		analysisMode: snapshot.runAnalysisMode ?? 'vaultFull',
		autoSaveState: { ...prev.autoSaveState, lastSavedPath: sourceVaultPath ?? null },
	}));
}

/** Get clean query without @web@ for actual search. */
export const getCleanQuery = (query: string): string => {
	return query.replace(/@web@\s*/g, '').trim();
};
