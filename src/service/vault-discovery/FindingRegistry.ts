import { sha256Text } from '@/core/storage/generated-output/GeneratedOutputIntegrity';
import type { DiscoveryFinding, DiscoveryFindingKind } from '@/core/types/vault-discovery';

export interface FindingProposal {
	kindId: DiscoveryFindingKind;
	anchors: readonly string[];
	statement: string;
	evidenceRefs: readonly string[];
	counterEvidenceRefs?: readonly string[];
	investigationId: string;
	confidence?: number;
}

export class FindingRegistry {
	constructor(private findings: Record<string, DiscoveryFinding>, private readonly now: () => number) {}

	propose(proposal: FindingProposal): DiscoveryFinding {
		if (proposal.evidenceRefs.length === 0) throw new Error('A discovery finding requires frozen evidence.');
		const identityKey = `${proposal.kindId}:${sha256Text(JSON.stringify([...proposal.anchors].sort())).slice(0, 20)}`;
		const existing = Object.values(this.findings).find((finding) => finding.identityKey === identityKey && finding.state !== 'superseded');
		const next: DiscoveryFinding = existing ? {
			...existing,
			state: 'revised',
			statement: proposal.statement,
			evidenceRefs: unique([...existing.evidenceRefs, ...proposal.evidenceRefs]),
			counterEvidenceRefs: unique([...existing.counterEvidenceRefs, ...(proposal.counterEvidenceRefs ?? [])]),
			investigationRefs: unique([...existing.investigationRefs, proposal.investigationId]),
			confidence: boundedConfidence(proposal.confidence, proposal.evidenceRefs.length, proposal.counterEvidenceRefs?.length ?? 0),
			version: existing.version + 1,
			updatedAt: this.now(),
		} : {
			id: `finding-${sha256Text(identityKey).slice(0, 16)}`,
			identityKey,
			kindId: proposal.kindId,
			state: 'retained',
			statement: proposal.statement,
			evidenceRefs: unique(proposal.evidenceRefs),
			counterEvidenceRefs: unique(proposal.counterEvidenceRefs ?? []),
			confidence: boundedConfidence(proposal.confidence, proposal.evidenceRefs.length, proposal.counterEvidenceRefs?.length ?? 0),
			investigationRefs: [proposal.investigationId],
			supersedes: [],
			version: 1,
			updatedAt: this.now(),
		};
		this.findings = { ...this.findings, [next.id]: next };
		return next;
	}

	merge(sourceIds: readonly string[], targetProposal: FindingProposal): DiscoveryFinding {
		const target = this.propose(targetProposal);
		const next = { ...this.findings };
		for (const id of sourceIds) {
			if (id === target.id || !next[id]) continue;
			next[id] = { ...next[id]!, state: 'superseded', updatedAt: this.now() };
		}
		next[target.id] = { ...target, supersedes: unique([...target.supersedes, ...sourceIds.filter((id) => id !== target.id)]) };
		this.findings = next;
		return next[target.id]!;
	}

	snapshot(): Readonly<Record<string, DiscoveryFinding>> { return this.findings; }
}

function boundedConfidence(suggested: number | undefined, supporting: number, opposing: number): number {
	const evidenceScore = supporting / Math.max(1, supporting + opposing);
	const suggestion = Number.isFinite(suggested) ? Math.max(0, Math.min(1, suggested!)) : evidenceScore;
	return Math.round((evidenceScore * 0.7 + suggestion * 0.3) * 1000) / 1000;
}

function unique<T>(values: readonly T[]): T[] { return [...new Set(values)]; }
