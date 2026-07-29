import type { ComposerDocumentSnapshot } from '@/core/composer';
import type { FindingIngestInput } from './findingIdentity';
import { listItemContentStart } from '../selection/partitionSelection';

export interface OpenWritingMovesConfig {
	readonly uncheckedTaskReason: string;
	readonly uncheckedTaskSummary: string;
	readonly uncheckedTaskTargetLabel: string;
	readonly uncheckedTaskEvidenceLabel: string;
	/** Config-owned matcher for source syntax that represents an unchecked task. */
	readonly uncheckedTaskPattern: RegExp;
}

/** Stable origin name for the deterministic source-backed Brief producer. */
export const OPEN_WRITING_MOVES_PRODUCER_ID = 'open-writing-moves';

/**
 * Deterministic Brief producer over the current Markdown source.
 *
 * It only emits findings backed by explicit unchecked task items. This is not a
 * heuristic AI summary: each finding points at a real list unit and can be
 * located in the document.
 */
export function detectOpenWritingMoves(
	snapshot: ComposerDocumentSnapshot,
	config: OpenWritingMovesConfig,
): FindingIngestInput[] {
	const findings: FindingIngestInput[] = [];
	for (const block of snapshot.blocks) {
		if (block.kind !== 'task' && block.kind !== 'list') continue;
		for (const unit of block.units) {
			if (unit.unitKind !== 'list-item') continue;
			const raw = snapshot.sourceText.slice(unit.from, unit.to);
			if (!config.uncheckedTaskPattern.test(raw)) continue;
			const contentFrom = listItemContentStart(snapshot.sourceText, unit);
			const content = snapshot.sourceText.slice(contentFrom, unit.to).trim();
			const reason = content ? `${config.uncheckedTaskReason}${content}` : config.uncheckedTaskReason;
			findings.push({
				// Include the concrete source anchor so two identical task labels in one
				// document remain two addressable suggestions rather than being deduped.
				fingerprint: `open-task:${block.blockId}:${unit.unitId}:${stableFingerprint(content || raw)}`,
				evidenceRevision: snapshot.revision,
				target: { kind: 'unit', blockId: block.blockId, unitId: unit.unitId },
				reason,
				producerId: OPEN_WRITING_MOVES_PRODUCER_ID,
				// This producer only knows a source-backed unchecked task. The brief copy
				// stays deliberately factual: its title is the actual task text while
				// labels come from the host's template configuration.
				brief: {
					title: content || raw.trim(),
					summary: config.uncheckedTaskSummary,
					targetLabel: config.uncheckedTaskTargetLabel,
					evidenceLabel: config.uncheckedTaskEvidenceLabel,
					// Source order is a display order only; it is not a claim of AI urgency.
					priority: findings.length + 1,
				},
				body: {
					label: config.uncheckedTaskTargetLabel,
					statusLabel: config.uncheckedTaskEvidenceLabel,
					title: content || raw.trim(),
					detail: config.uncheckedTaskSummary,
					provenance: config.uncheckedTaskReason,
					tone: 'violet',
				},
			});
		}
	}
	return findings;
}

function stableFingerprint(value: string): string {
	let hash = 2166136261;
	for (let i = 0; i < value.length; i += 1) {
		hash ^= value.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}
