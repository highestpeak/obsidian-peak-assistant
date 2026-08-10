import { PromptId } from '@/core/types/prompt';
import type { LLMUsage } from '@/core/providers/types';
import type { GeneratedOutputPersistenceRuntime } from '@/core/storage/generated-output';
import type { ResultGraphCommunitySummary } from '@/service/search/graph/resultSubgraph';
import type { AIServiceManager } from '@/service/chat/service-manager';

const SNAPSHOT_OUTPUT_ID = 'graph.community-explanation';
const EVENTS_OUTPUT_ID = 'graph.community-explanation-events';

export interface CommunityExplanationRecord {
	communityId: string;
	fingerprint: string;
	analysisVersion: number;
	explanation: string;
	suggestedLabel: string | null;
	evidence: {
		visibleMembers: number;
		totalMembers: number;
		internalReferenceCount: number;
		descriptors: ResultGraphCommunitySummary['descriptors'];
		representativeNotes: ResultGraphCommunitySummary['representativeNotes'];
	};
	generatedAt: string;
	runId: string;
	usage?: LLMUsage;
}

export interface LoadedCommunityExplanation {
	record: CommunityExplanationRecord | null;
	stale: boolean;
}

export interface GenerateCommunityExplanationOptions {
	regenerate?: boolean;
	signal?: AbortSignal;
	onDelta?: (fullText: string) => void;
}

export interface CommunityExplanationPort {
	load(community: ResultGraphCommunitySummary): Promise<LoadedCommunityExplanation>;
	generate(
		community: ResultGraphCommunitySummary,
		options?: GenerateCommunityExplanationOptions,
	): Promise<CommunityExplanationRecord>;
}

type CommunityExplanationEvent = {
	runId: string;
	communityId: string;
	fingerprint: string;
	status: 'started' | 'completed' | 'failed' | 'cancelled';
	regenerate: boolean;
	error?: string;
	generatedAt?: string;
};

export class CommunityExplanationService implements CommunityExplanationPort {
	constructor(
		private readonly manager: AIServiceManager,
		private readonly outputs: GeneratedOutputPersistenceRuntime,
		private readonly now: () => Date = () => new Date(),
		private readonly createRunId: () => string = () => crypto.randomUUID(),
	) {}

	async load(community: ResultGraphCommunitySummary): Promise<LoadedCommunityExplanation> {
		const saved = await this.outputs.snapshots.readSnapshot<CommunityExplanationRecord>({
			outputId: SNAPSHOT_OUTPUT_ID,
			recordKey: community.id,
			pathVariables: { communityId: community.id },
		});
		const record = saved?.envelope.payload ?? null;
		return { record, stale: Boolean(record && record.fingerprint !== community.fingerprint) };
	}

	async generate(
		community: ResultGraphCommunitySummary,
		options: GenerateCommunityExplanationOptions = {},
	): Promise<CommunityExplanationRecord> {
		const runId = this.createRunId();
		await this.appendEvent(community, {
			runId,
			communityId: community.id,
			fingerprint: community.fingerprint,
			status: 'started',
			regenerate: options.regenerate ?? false,
		});
		let streamed = '';
		let usage: LLMUsage | undefined;
		try {
			const descriptors = community.descriptors.length
				? community.descriptors.map((item) => `${item.label} (${item.kind}, ${item.support} notes)`).join('; ')
				: 'No repeated tag or term descriptor met the configured support threshold.';
			const representativeNotes = community.representativeNotes.length
				? community.representativeNotes.map((note) => `- ${note.label} — ${note.path}`).join('\n')
				: '- None available';
			for await (const event of this.manager.queryStream(
				PromptId.ResultGraphCommunityExplanation,
				{
					communityLabel: community.displayLabel,
					memberCoverage: `${community.visibleMemberIds.length} shown of ${community.memberCount} members`,
					descriptors,
					internalReferenceCount: community.internalReferenceCount,
					representativeNotes,
					fingerprint: community.fingerprint,
				},
				{
					triggerName: 'result-graph-community-explanation',
					signal: options.signal,
					usageFeature: 'graph',
					usageAction: options.regenerate ? 'regenerate-community-explanation' : 'explain-community',
					usageSessionId: runId,
				},
			)) {
				if (event.type === 'text-delta') {
					streamed += event.text;
					options.onDelta?.(streamed);
				}
				if (event.type === 'complete') usage = event.usage;
				if (event.type === 'error') throw event.error;
			}
			const parsed = parseCommunityExplanation(streamed);
			const generatedAt = this.now().toISOString();
			const record: CommunityExplanationRecord = {
				communityId: community.id,
				fingerprint: community.fingerprint,
				analysisVersion: community.analysisVersion,
				explanation: parsed.explanation,
				suggestedLabel: parsed.suggestedLabel,
				evidence: {
					visibleMembers: community.visibleMemberIds.length,
					totalMembers: community.memberCount,
					internalReferenceCount: community.internalReferenceCount,
					descriptors: community.descriptors,
					representativeNotes: community.representativeNotes,
				},
				generatedAt,
				runId,
				...(usage ? { usage } : {}),
			};
			await this.outputs.snapshots.writeSnapshot({
				outputId: SNAPSHOT_OUTPUT_ID,
				recordKey: community.id,
				pathVariables: { communityId: community.id },
				payload: record,
			});
			await this.appendEvent(community, {
				runId,
				communityId: community.id,
				fingerprint: community.fingerprint,
				status: 'completed',
				regenerate: options.regenerate ?? false,
				generatedAt,
			});
			return record;
		} catch (error) {
			const cancelled = options.signal?.aborted ?? false;
			await this.appendEvent(community, {
				runId,
				communityId: community.id,
				fingerprint: community.fingerprint,
				status: cancelled ? 'cancelled' : 'failed',
				regenerate: options.regenerate ?? false,
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	private appendEvent(
		community: ResultGraphCommunitySummary,
		payload: CommunityExplanationEvent,
	): Promise<boolean> {
		return this.outputs.events.appendEvent({
			outputId: EVENTS_OUTPUT_ID,
			streamKey: community.id,
			eventId: `${payload.runId}:${payload.status}`,
			pathVariables: { communityId: community.id },
			payload,
		});
	}
}

export function parseCommunityExplanation(raw: string): {
	suggestedLabel: string | null;
	explanation: string;
} {
	const cleaned = raw.trim();
	const labelMatch = cleaned.match(/(?:^|\n)Suggested label:\s*(.+?)(?:\n|$)/i);
	const explanationMatch = cleaned.match(/(?:^|\n)Explanation:\s*([\s\S]+)$/i);
	const label = labelMatch?.[1]?.trim() ?? '';
	return {
		suggestedLabel: !label || /^none$/i.test(label) ? null : label,
		explanation: (explanationMatch?.[1] ?? cleaned).trim(),
	};
}
