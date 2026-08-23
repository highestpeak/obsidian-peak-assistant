import { sha256Text } from '@/core/storage/generated-output/GeneratedOutputIntegrity';
import type { LintFinding } from '@/core/types/lint';
import type { ReviewAtom } from '@/core/types/review-preparation';
import type { VaultReviewSessionSnapshot } from '@/service/copilot/vault/VaultReviewSession';

interface ReviewTaskCatalog {
	readonly tasks: ReadonlyArray<{ kind: string; signalIds: readonly string[] }>;
}

export function normalizeReviewAtoms(input: {
	config: ReviewTaskCatalog;
	findings: readonly LintFinding[];
	indexErrors: readonly { path: string; message: string }[];
	reviewSnapshots: readonly VaultReviewSessionSnapshot[];
	sourceRevision: (path: string) => string;
}): ReviewAtom[] {
	const atoms: ReviewAtom[] = [];
	for (const finding of input.findings.filter((item) => item.status === 'open')) {
		const definition = input.config.tasks.find((task) => task.signalIds.includes(finding.signalId));
		if (!definition) continue;
		const path = finding.filePath ?? `finding:${finding.id}`;
		atoms.push(atom({ id: `lint:${finding.id}`, kindId: definition.kind, objectRefs: [path], evidenceRefs: [`lint:${finding.id}`], sourceRevisionRefs: [input.sourceRevision(path)], ownerSurfaceId: ownerSurface(definition.kind), ownerQuestionId: definition.kind, writeBoundary: writeBoundary(definition.kind), verificationKind: verificationKind(definition.kind), exitCondition: `A fresh ${finding.signalId} detector run no longer reports this finding.`, deterministicOnly: definition.kind === 'unreadable-files' }));
	}
	for (const error of input.indexErrors) {
		atoms.push(atom({ id: `index-error:${stable(error.path)}`, kindId: 'unreadable-files', objectRefs: [error.path], evidenceRefs: [`index-error:${stable(`${error.path}:${error.message}`)}`], sourceRevisionRefs: [input.sourceRevision(error.path)], ownerSurfaceId: 'recovery', ownerQuestionId: 'recover-index-input', writeBoundary: 'recovery', verificationKind: 'index-retry', exitCondition: 'The file receives a terminal search-ready or explicit excluded receipt.', deterministicOnly: true }));
	}
	for (const snapshot of input.reviewSnapshots) {
		for (const action of snapshot.collectorSnapshot.actions) {
			const refs = action.involvedNotes.length ? action.involvedNotes : [`vault-action:${stable(action.title)}`];
			atoms.push(atom({ id: `discovery-action:${stable(`${action.title}:${refs.join('|')}`)}`, kindId: 'knowledge-connections', objectRefs: refs, evidenceRefs: refs.map((ref) => `discovery:${stable(`${action.title}:${ref}`)}`), sourceRevisionRefs: refs.map(input.sourceRevision), ownerSurfaceId: 'composer', ownerQuestionId: 'review-discovered-connection', writeBoundary: 'proposal', verificationKind: 'fresh-detector', exitCondition: 'The owner-selected connection is applied and a fresh verification confirms the cited evidence.', deterministicOnly: false }));
		}
		for (const gap of snapshot.collectorSnapshot.gaps) {
			const refs = gap.references.length ? gap.references : [`vault-gap:${stable(gap.title)}`];
			atoms.push(atom({ id: `discovery-gap:${stable(`${gap.title}:${refs.join('|')}`)}`, kindId: 'community-structure', objectRefs: refs, evidenceRefs: refs.map((ref) => `discovery:${stable(`${gap.title}:${ref}`)}`), sourceRevisionRefs: refs.map(input.sourceRevision), ownerSurfaceId: 'community-workspace', ownerQuestionId: 'review-structural-gap', writeBoundary: 'no-change', verificationKind: 'fresh-detector', exitCondition: 'The owner reviews the cited structural gap and records a disposition.', deterministicOnly: false }));
		}
	}
	return dedupe(atoms);
}

function atom(value: ReviewAtom): ReviewAtom { return value; }
function stable(value: string): string { return sha256Text(value).slice(0, 20); }
function dedupe(atoms: readonly ReviewAtom[]): ReviewAtom[] { return [...new Map(atoms.map((item) => [item.id, item])).values()]; }
function ownerSurface(kind: string): string { if (kind === 'community-membership' || kind === 'community-structure' || kind === 'community-hubs') return 'community-workspace'; if (kind === 'unreadable-files') return 'recovery'; if (kind === 'file-properties') return 'property-review'; return 'composer'; }
function writeBoundary(kind: string): ReviewAtom['writeBoundary'] { if (kind === 'unreadable-files') return 'recovery'; if (kind === 'community-membership' || kind === 'community-hubs' || kind === 'unusual-notes') return 'no-change'; return 'proposal'; }
function verificationKind(kind: string): string { return kind === 'unreadable-files' ? 'index-retry' : kind === 'community-membership' || kind === 'community-hubs' ? 'owner-choice-receipt' : 'fresh-detector'; }
