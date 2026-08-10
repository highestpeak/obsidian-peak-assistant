import { PromptId } from '@/core/types/prompt';
import type { LLMUsage } from '@/core/providers/types';
import {
	canonicalJson,
	sha256Text,
	type GeneratedOutputPersistenceRuntime,
} from '@/core/storage/generated-output';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { DEFAULT_RESULT_GRAPH_COMMUNITY_CONFIG } from '@/service/search/index/helper/structural/ResultGraphCommunityDefaults';

const SNAPSHOT_OUTPUT_ID = 'graph.node-explanation';
const EVENTS_OUTPUT_ID = 'graph.node-explanation-events';
export const GRAPH_NODE_EVIDENCE_UNAVAILABLE_ERROR = 'graph-node-evidence-unavailable';

export interface GraphNodeRepresentativeLink {
	path: string;
	label: string;
	direction: 'incoming' | 'outgoing';
}

export interface GraphNodeExplanationEvidence {
	path: string;
	title: string;
	summary: string;
	signals: string[];
	incomingLinks: number;
	outgoingLinks: number;
	representativeLinks: GraphNodeRepresentativeLink[];
	fingerprint: string;
}

export interface GraphNodeExplanationRecord {
	nodeKey: string;
	path: string;
	fingerprint: string;
	explanation: string;
	evidence: GraphNodeExplanationEvidence;
	generatedAt: string;
	runId: string;
	usage?: LLMUsage;
}

export interface LoadedGraphNodeExplanation {
	evidence: GraphNodeExplanationEvidence | null;
	record: GraphNodeExplanationRecord | null;
	stale: boolean;
}

export interface GenerateGraphNodeExplanationOptions {
	regenerate?: boolean;
	signal?: AbortSignal;
	onDelta?: (fullText: string) => void;
}

export interface GraphNodeExplanationPort {
	load(path: string): Promise<LoadedGraphNodeExplanation>;
	generate(
		path: string,
		options?: GenerateGraphNodeExplanationOptions,
	): Promise<GraphNodeExplanationRecord>;
}

export interface GraphNodeExplanationEvidenceReader {
	read(path: string): Promise<GraphNodeExplanationEvidence | null>;
}

type GraphNodeExplanationEvent = {
	runId: string;
	nodeKey: string;
	path: string;
	fingerprint: string;
	status: 'started' | 'completed' | 'failed' | 'cancelled';
	regenerate: boolean;
	error?: string;
	generatedAt?: string;
};

export class GraphNodeExplanationService implements GraphNodeExplanationPort {
	constructor(
		private readonly manager: AIServiceManager,
		private readonly outputs: GeneratedOutputPersistenceRuntime,
		private readonly evidenceReader: GraphNodeExplanationEvidenceReader,
		private readonly limits = DEFAULT_RESULT_GRAPH_COMMUNITY_CONFIG.nodeExplanation,
		private readonly now: () => Date = () => new Date(),
		private readonly createRunId: () => string = () => crypto.randomUUID(),
	) {}

	async load(path: string): Promise<LoadedGraphNodeExplanation> {
		const nodeKey = graphNodeExplanationKey(path);
		const [evidence, saved] = await Promise.all([
			this.evidenceReader.read(path),
			this.outputs.snapshots.readSnapshot<GraphNodeExplanationRecord>({
				outputId: SNAPSHOT_OUTPUT_ID,
				recordKey: nodeKey,
				pathVariables: { nodeKey },
			}),
		]);
		const record = saved?.envelope.payload ?? null;
		return {
			evidence,
			record,
			stale: Boolean(record && (!evidence || record.fingerprint !== evidence.fingerprint)),
		};
	}

	async generate(
		path: string,
		options: GenerateGraphNodeExplanationOptions = {},
	): Promise<GraphNodeExplanationRecord> {
		const evidence = await this.evidenceReader.read(path);
		if (!evidence) throw new Error(GRAPH_NODE_EVIDENCE_UNAVAILABLE_ERROR);
		const nodeKey = graphNodeExplanationKey(evidence.path);
		const runId = this.createRunId();
		await this.appendEvent({
			runId,
			nodeKey,
			path: evidence.path,
			fingerprint: evidence.fingerprint,
			status: 'started',
			regenerate: options.regenerate ?? false,
		});
		let streamed = '';
		let usage: LLMUsage | undefined;
		try {
			const promptLinks = evidence.representativeLinks.slice(0, this.limits.representativeLinkLimit);
			const representativeLinks = promptLinks
				.map((link) => `- ${link.direction}: ${link.label} — ${link.path}`)
				.join('\n');
			for await (const event of this.manager.queryStream(
				PromptId.GraphNodeExplanation,
				{
					title: evidence.title,
					path: evidence.path,
					summary: evidence.summary.slice(0, this.limits.summaryCharacterLimit),
					signals: evidence.signals.slice(0, this.limits.signalLimit).join(' · '),
					linkCounts: `${evidence.incomingLinks} incoming · ${evidence.outgoingLinks} outgoing · ${evidence.incomingLinks + evidence.outgoingLinks} total`,
					representativeLinks,
					fingerprint: evidence.fingerprint,
				},
				{
					triggerName: 'graph-node-explanation',
					signal: options.signal,
					usageFeature: 'graph',
					usageAction: options.regenerate ? 'regenerate-node-explanation' : 'explain-node',
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
			const generatedAt = this.now().toISOString();
			const record: GraphNodeExplanationRecord = {
				nodeKey,
				path: evidence.path,
				fingerprint: evidence.fingerprint,
				explanation: parseGraphNodeExplanation(streamed),
				evidence,
				generatedAt,
				runId,
				...(usage ? { usage } : {}),
			};
			await this.outputs.snapshots.writeSnapshot({
				outputId: SNAPSHOT_OUTPUT_ID,
				recordKey: nodeKey,
				pathVariables: { nodeKey },
				payload: record,
			});
			await this.appendEvent({
				runId,
				nodeKey,
				path: evidence.path,
				fingerprint: evidence.fingerprint,
				status: 'completed',
				regenerate: options.regenerate ?? false,
				generatedAt,
			});
			return record;
		} catch (error) {
			await this.appendEvent({
				runId,
				nodeKey,
				path: evidence.path,
				fingerprint: evidence.fingerprint,
				status: options.signal?.aborted ? 'cancelled' : 'failed',
				regenerate: options.regenerate ?? false,
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	}

	private appendEvent(payload: GraphNodeExplanationEvent): Promise<boolean> {
		return this.outputs.events.appendEvent({
			outputId: EVENTS_OUTPUT_ID,
			streamKey: payload.nodeKey,
			eventId: `${payload.runId}:${payload.status}`,
			pathVariables: { nodeKey: payload.nodeKey },
			payload,
		});
	}
}

export function buildGraphNodeExplanationEvidence(
	input: Omit<GraphNodeExplanationEvidence, 'fingerprint'>,
): GraphNodeExplanationEvidence {
	const normalized = {
		path: input.path.trim(),
		title: input.title.trim(),
		summary: input.summary.trim(),
		signals: [...new Set(input.signals.map((signal) => signal.trim()).filter(Boolean))]
			.sort((left, right) => left.localeCompare(right)),
		incomingLinks: Math.max(0, Math.floor(input.incomingLinks)),
		outgoingLinks: Math.max(0, Math.floor(input.outgoingLinks)),
		representativeLinks: [...input.representativeLinks]
			.map((link) => ({ ...link, path: link.path.trim(), label: link.label.trim() }))
			.filter((link) => link.path)
			.sort((left, right) => (
				left.direction.localeCompare(right.direction)
				|| left.path.localeCompare(right.path)
			)),
	};
	return {
		...normalized,
		fingerprint: `graph-node-${sha256Text(canonicalJson({ version: 1, ...normalized })).slice(0, 24)}`,
	};
}

export function graphNodeExplanationKey(path: string): string {
	return `node-${sha256Text(path.trim()).slice(0, 24)}`;
}

export function parseGraphNodeExplanation(raw: string): string {
	const cleaned = raw.trim();
	const match = cleaned.match(/(?:^|\n)Explanation:\s*([\s\S]+)$/i);
	return (match?.[1] ?? cleaned).trim();
}
