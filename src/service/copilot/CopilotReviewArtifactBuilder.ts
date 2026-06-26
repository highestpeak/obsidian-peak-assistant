/**
 * Build CopilotRunArtifacts from a ReviewSessionSnapshot.
 *
 * Maps:
 *   collector proposals → changes / insights / sources artifacts
 *   round events + collector → trace artifacts (with round + group metadata)
 *
 * Trace grouping (Phase 3):
 *   - Each propose_* / submit_review tool-call event creates a `groupRoot` trace item.
 *   - All earlier ungrouped tool-call / note_finding events in the same round are
 *     assigned `groupOf = thatRoot.id`.
 *   - Round headers are their own non-group items at the top of each round.
 */

import type { ReviewSessionSnapshot } from './CopilotReviewSession';
import type {
	CapabilityArtifact,
	CopilotRunArtifacts,
	TraceArtifact,
} from './CopilotRunArtifacts';
import { createEmptyCopilotRunArtifacts, mergeCapabilityArtifact } from './CopilotRunArtifacts';
import { proposalsToArtifacts } from './CopilotArtifactAdapter';
import type { LLMStreamEvent } from '@/core/providers/types';
import { v2ToolDisplay, extractV2Summary, unwrapToolOutput } from '@/service/search/v2ToolDisplay';
import { describeReport } from './CopilotSignalReport';

type AnyEvent = LLMStreamEvent & {
	id?: string;
	toolName?: string;
	toolCallId?: string;
	input?: unknown;
	output?: unknown;
	text?: string;
	debugName?: string;
	extra?: { message?: string; turnCount?: number; maxTurns?: number };
};

const PROPOSE_TOOL_TO_KIND: Record<string, TraceArtifact['kind']> = {
	propose_insight: 'propose-insight',
	propose_change: 'propose-change',
	propose_source: 'propose-source',
	attach_chat_followup: 'propose-chat-followup',
	submit_review: 'submit-review',
	note_finding: 'finding',
	propose_cluster_observation: 'propose-insight',
	propose_gap: 'propose-insight',
	propose_action: 'propose-change',
};

function stripMcpPrefix(toolName: string): string {
	const idx = toolName.lastIndexOf('__');
	return idx >= 0 ? toolName.slice(idx + 2) : toolName;
}

function isProposalTool(toolName: string): boolean {
	const bare = stripMcpPrefix(toolName);
	return bare === 'propose_insight' || bare === 'propose_change' || bare === 'propose_source'
		|| bare === 'attach_chat_followup' || bare === 'submit_review'
		|| bare === 'propose_cluster_observation' || bare === 'propose_gap' || bare === 'propose_action';
}

function isFindingTool(toolName: string): boolean {
	return stripMcpPrefix(toolName) === 'note_finding';
}

function proposeLabel(toolName: string): string {
	switch (stripMcpPrefix(toolName)) {
		case 'propose_insight': return 'Published insight';
		case 'propose_change': return 'Proposed change';
		case 'propose_source': return 'Cited source';
		case 'attach_chat_followup': return 'Queued follow-up';
		case 'submit_review': return 'Submitted round';
		case 'propose_cluster_observation': return 'Cluster observation';
		case 'propose_gap': return 'Gap finding';
		case 'propose_action': return 'Recommended action';
		default: return toolName;
	}
}

function proposeBadge(toolName: string, input: unknown): string | undefined {
	if (!input || typeof input !== 'object') return undefined;
	const obj = input as { title?: string; question?: string; path?: string; summary?: string; clusterLabel?: string; headline?: string };
	switch (stripMcpPrefix(toolName)) {
		case 'propose_insight':
		case 'propose_change':
		case 'propose_gap':
		case 'propose_action':
			return obj.title;
		case 'propose_cluster_observation':
			return obj.clusterLabel ?? obj.headline?.slice(0, 60);
		case 'attach_chat_followup':
			return obj.question?.slice(0, 60);
		case 'propose_source':
			return obj.path?.split('/').pop();
		case 'submit_review':
			return obj.summary?.slice(0, 80);
		default:
			return undefined;
	}
}

function vaultLabel(toolName: string, input: unknown): { label: string; detail?: string } {
	const inputRecord = (input && typeof input === 'object') ? input as Record<string, unknown> : {};
	const display = v2ToolDisplay(stripMcpPrefix(toolName), inputRecord);
	return { label: display.displayName };
}

function planTraceItem(roundIndex: number, planText: string): TraceArtifact | null {
	const trimmed = planText.trim();
	if (trimmed.length < 8) return null;
	return {
		id: `round-${roundIndex}-plan`,
		type: 'trace',
		label: 'Plan',
		status: 'done',
		kind: 'plan',
		timestamp: Date.now(),
		detail: trimmed.slice(0, 800),
		roundIndex,
	};
}

function roundHeader(snapshot: ReviewSessionSnapshot, roundIndex: number): TraceArtifact {
	const round = snapshot.rounds.find(r => r.roundIndex === roundIndex)!;
	const insightsThisRound = snapshot.collectorSnapshot.insights.filter(i => i.roundIndex === roundIndex).length;
	const changesThisRound = snapshot.collectorSnapshot.changes.filter(c => c.roundIndex === roundIndex).length;
	const sourcesThisRound = snapshot.collectorSnapshot.sources.filter(s => s.roundIndex === roundIndex).length;
	const parts: string[] = [];
	if (insightsThisRound > 0) parts.push(`${insightsThisRound} insight${insightsThisRound === 1 ? '' : 's'}`);
	if (changesThisRound > 0) parts.push(`${changesThisRound} change${changesThisRound === 1 ? '' : 's'}`);
	if (sourcesThisRound > 0) parts.push(`${sourcesThisRound} source${sourcesThisRound === 1 ? '' : 's'}`);
	const continuedNext = round.submission?.continue ? ' · continued' : '';
	const detail = `${round.turnCount} turn${round.turnCount === 1 ? '' : 's'}${parts.length ? ' · ' + parts.join(' · ') : ''}${continuedNext}`;
	const status: TraceArtifact['status'] = round.endedAt
		? (round.submission ? 'done' : 'cancelled')
		: 'running';
	return {
		id: `round-${roundIndex}-header`,
		type: 'trace',
		label: `Round ${roundIndex + 1}`,
		status,
		kind: 'round-header',
		timestamp: round.startedAt,
		detail,
		roundIndex,
	};
}

function observedNoteItem(snapshot: ReviewSessionSnapshot): TraceArtifact {
	return {
		id: 'pre-flight-observation',
		type: 'trace',
		label: 'Observed current note',
		status: 'done',
		kind: 'observe',
		timestamp: snapshot.rounds[0]?.startedAt ?? Date.now(),
		detail: describeReport(snapshot.signalReport),
	};
}

/**
 * Build trace items for one round. Returns items in chronological order,
 * with groupRoot / groupOf metadata filled in.
 */
function buildRoundTrace(snapshot: ReviewSessionSnapshot, roundIndex: number): TraceArtifact[] {
	const round = snapshot.rounds.find(r => r.roundIndex === roundIndex);
	if (!round) return [];

	const items: TraceArtifact[] = [roundHeader(snapshot, roundIndex)];
	let pendingPlan = '';
	let toolCounter = 0;
	const callRegistry = new Map<string, string>(); // tool-call id → tool name
	const pendingItems: TraceArtifact[] = []; // ungrouped tool calls awaiting a propose_* anchor

	function flushPendingInto(rootId: string): void {
		for (const item of pendingItems) {
			item.groupOf = rootId;
		}
		pendingItems.length = 0;
	}

	function pushItem(item: TraceArtifact, isGroupRoot: boolean): void {
		items.push(item);
		if (isGroupRoot) {
			flushPendingInto(item.id);
			(item as TraceArtifact).groupRoot = true;
		} else {
			pendingItems.push(item);
		}
	}

	for (const event of round.events) {
		const e = event as AnyEvent;

		if (e.type === 'text-delta' && typeof e.text === 'string') {
			// Accumulate into plan text only for very first turn until the first tool call.
			pendingPlan += e.text;
			continue;
		}

		if (e.type === 'tool-call' && typeof e.toolName === 'string') {
			// Emit plan now if we have one.
			if (pendingPlan.length > 0) {
				const plan = planTraceItem(roundIndex, pendingPlan);
				if (plan) items.splice(1, 0, plan); // after the header
				pendingPlan = '';
			}
			const stepId = e.id ?? e.toolCallId ?? `tc-${roundIndex}-${toolCounter++}`;
			callRegistry.set(stepId, e.toolName);

			if (isFindingTool(e.toolName)) {
				const text = (e.input as { text?: string })?.text ?? '';
				const item: TraceArtifact = {
					id: stepId,
					type: 'trace',
					label: 'Finding',
					status: 'running',
					kind: 'finding',
					timestamp: Date.now(),
					detail: text,
					toolName: e.toolName,
					roundIndex,
				};
				pushItem(item, false);
				continue;
			}

			if (isProposalTool(e.toolName)) {
				const item: TraceArtifact = {
					id: stepId,
					type: 'trace',
					label: proposeLabel(e.toolName),
					status: 'running',
					kind: PROPOSE_TOOL_TO_KIND[stripMcpPrefix(e.toolName)] ?? 'call',
					timestamp: Date.now(),
					badge: proposeBadge(e.toolName, e.input),
					toolName: e.toolName,
					roundIndex,
				};
				pushItem(item, true);
				continue;
			}

			// Regular vault tool call
			const display = vaultLabel(e.toolName, e.input);
			const item: TraceArtifact = {
				id: stepId,
				type: 'trace',
				label: display.label,
				status: 'running',
				kind: e.toolName.includes('read') ? 'read' : 'call',
				timestamp: Date.now(),
				toolName: e.toolName,
				roundIndex,
			};
			pushItem(item, false);
			continue;
		}

		if (e.type === 'tool-result') {
			const stepId = e.id ?? e.toolCallId;
			if (!stepId) continue;
			const target = items.find(it => it.id === stepId);
			if (!target) continue;
			const toolName = target.toolName ?? callRegistry.get(stepId) ?? '';
			target.status = 'done';
			if (isProposalTool(toolName) || isFindingTool(toolName)) {
				target.summary = 'acknowledged';
			} else {
				const summary = extractV2Summary(stripMcpPrefix(toolName), e.output);
				target.summary = summary;
				target.detail = unwrapToolOutput(e.output).slice(0, 280);
			}
			continue;
		}

		if (e.type === 'pk-debug') {
			// budget-warning and max-turns-reached are no longer surfaced.
			// Agent decides its own pacing; if maxTurns is hit, the round just ends.
			continue;
		}

		if (e.type === 'error') {
			const error = (e as { error?: Error }).error;
			items.push({
				id: `${roundIndex}-error-${items.length}`,
				type: 'trace',
				label: 'Agent error',
				status: 'error',
				kind: 'error',
				timestamp: Date.now(),
				detail: error?.message ?? 'Unknown error',
				roundIndex,
			});
		}
	}

	// Plan that arrived without any subsequent tool call yet.
	if (pendingPlan.length > 0) {
		const plan = planTraceItem(roundIndex, pendingPlan);
		if (plan) items.splice(1, 0, plan);
	}

	return items;
}

export function buildReviewArtifacts(snapshot: ReviewSessionSnapshot): CopilotRunArtifacts {
	let artifacts = createEmptyCopilotRunArtifacts();

	// Pre-flight observation (always present).
	artifacts = mergeCapabilityArtifact(artifacts, observedNoteItem(snapshot));

	// Round-by-round trace.
	for (const round of snapshot.rounds) {
		for (const item of buildRoundTrace(snapshot, round.roundIndex)) {
			artifacts = mergeCapabilityArtifact(artifacts, item);
		}
	}

	// Proposals → typed artifacts.
	const proposalArtifacts: CapabilityArtifact[] = proposalsToArtifacts(snapshot.collectorSnapshot);
	for (const a of proposalArtifacts) {
		artifacts = mergeCapabilityArtifact(artifacts, a);
	}

	return artifacts;
}

export function reviewSubtitle(snapshot: ReviewSessionSnapshot): string {
	if (snapshot.status === 'running') {
		const roundLabel = snapshot.rounds.length > 1
			? ` (round ${snapshot.currentRoundIndex + 1})`
			: '';
		return `Agent is inspecting "${snapshot.signalReport.basename}"${roundLabel}...`;
	}
	if (snapshot.status === 'awaiting-next-round') {
		return `Round ${snapshot.currentRoundIndex + 1} done. Starting next round...`;
	}
	if (snapshot.status === 'cancelled') {
		return 'Review cancelled. Partial findings are shown below.';
	}
	if (snapshot.status === 'error') {
		return `Review failed: ${snapshot.error ?? 'unknown error'}.`;
	}
	const totalProposals = snapshot.collectorSnapshot.insights.length
		+ snapshot.collectorSnapshot.changes.length
		+ snapshot.collectorSnapshot.sources.length;
	if (totalProposals === 0) {
		return 'Review complete. The agent produced no artifacts this run.';
	}
	return 'Review complete. Inspect the artifacts before applying changes.';
}
