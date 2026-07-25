/**
 * Peak Composer — History ledger + projection (WP2, handoff §9.6).
 *
 * Records ONLY committed changes worth remembering: direct edits, accepted
 * deterministic transforms, accepted AI candidates, accepted object/native
 * replacements, and system rollbacks. Pending/dismissed candidates and pure
 * view state never reach here (they are simply never `record`ed — the hub only
 * calls `record` on a successful commit).
 *
 * Grouping:
 *   - consecutive `direct` transactions on the SAME target within the burst
 *     window coalesce into one parent whose children are the individual edits;
 *   - transactions sharing a `runId` (one AI run) coalesce into one parent;
 *   - a child is still independently locatable and diff-able (it keeps its own
 *     transactionId / target / stats).
 *
 * A rollback appends a NEW inverse item (`isRollback`) — it never deletes the
 * original entry (§9.6 / §9.7).
 */

import {
	makeGroupId,
	makeHistoryId,
	type ComposerHistoryItem,
	type ComposerTarget,
	type ComposerTransaction,
	type ComposerTransactionConfig,
} from '@/core/composer';

interface InternalEntry extends ComposerHistoryItem {
	/** Grouping key + last-activity time; stripped from the public projection. */
	_groupKey?: string;
	_lastAt: number;
}

function targetBlockOf(target: ComposerTarget | undefined): string {
	if (!target) return 'doc';
	if (target.kind === 'block' || target.kind === 'unit') return target.blockId;
	return target.documentId;
}

/**
 * Group key a transaction belongs to, or null for a standalone entry.
 * An explicit `groupId` (a WP4 typing burst / logical edit group) or `runId`
 * (one AI run) coalesces unconditionally; the `direct` + same-target fallback is
 * only a best-effort heuristic bounded by the burst time window.
 */
function groupKeyFor(txn: ComposerTransaction): string | null {
	if (txn.groupId) return `group:${txn.groupId}`;
	if (txn.runId) return `run:${txn.runId}`;
	if (txn.origin === 'direct') return `burst:${targetBlockOf(txn.target)}`;
	return null;
}

function toChild(txn: ComposerTransaction): ComposerHistoryItem {
	return {
		historyId: makeHistoryId(),
		transactionId: txn.transactionId,
		origin: txn.origin,
		label: txn.label,
		timestamp: txn.committedAt,
		target: txn.target,
		groupId: txn.groupId,
		runId: txn.runId,
		stats: txn.stats,
	};
}

function sumStats(items: readonly ComposerHistoryItem[]): { added: number; removed: number } {
	return items.reduce(
		(acc, it) => ({ added: acc.added + it.stats.added, removed: acc.removed + it.stats.removed }),
		{ added: 0, removed: 0 },
	);
}

/** Deep-clone an entry into the public shape (drops internal `_` fields). */
function project(entry: InternalEntry): ComposerHistoryItem {
	const { _groupKey, _lastAt, children, ...rest } = entry;
	return { ...rest, children: children ? children.map((c) => ({ ...c })) : undefined };
}

export class ComposerHistoryStore {
	private readonly entries: InternalEntry[] = [];

	constructor(private readonly config: ComposerTransactionConfig) {}

	/** Public, immutable projection (newest last, matching commit order). */
	list(): ComposerHistoryItem[] {
		return this.entries.map(project);
	}

	/** Record a committed transaction, coalescing bursts / AI-run children. */
	record(txn: ComposerTransaction): void {
		const key = groupKeyFor(txn);
		const last = this.entries[this.entries.length - 1];
		if (key && last && last._groupKey === key && this.withinWindow(txn, last, key)) {
			this.appendChild(last, txn);
			return;
		}
		this.entries.push({
			...toChild(txn),
			groupId: txn.groupId ?? (key ? makeGroupId() : undefined),
			_groupKey: key ?? undefined,
			_lastAt: txn.committedAt,
		});
	}

	/** Append the inverse of a rolled-back transaction (never deletes history). */
	recordRollback(inverse: ComposerTransaction, rolledBackHistoryId: string): void {
		this.entries.push({
			...toChild(inverse),
			isRollback: true,
			label: inverse.label,
			groupId: rolledBackHistoryId,
			_lastAt: inverse.committedAt,
		});
	}

	/** Find an entry (top-level or child) by history id. */
	find(historyId: string): ComposerHistoryItem | undefined {
		for (const e of this.entries) {
			if (e.historyId === historyId) return project(e);
			const child = e.children?.find((c) => c.historyId === historyId);
			if (child) return { ...child };
		}
		return undefined;
	}

	// ── internals ─────────────────────────────────────────────────────────────

	private withinWindow(txn: ComposerTransaction, last: InternalEntry, key: string): boolean {
		// Explicit group / AI-run coalescing is not time-bounded (a run's children
		// may stream apart); only the heuristic same-target burst honors the window.
		if (!key.startsWith('burst:')) return true;
		return txn.committedAt - last._lastAt <= this.config.burstWindowMs;
	}

	private appendChild(parent: InternalEntry, txn: ComposerTransaction): void {
		if (!parent.children) {
			// First coalesce: turn the standalone entry into a parent whose first
			// child is the original transaction it represented.
			parent.children = [
				{
					historyId: makeHistoryId(),
					transactionId: parent.transactionId,
					origin: parent.origin,
					label: parent.label,
					timestamp: parent.timestamp,
					target: parent.target,
					groupId: parent.groupId,
					runId: parent.runId,
					stats: parent.stats,
				},
			];
		}
		parent.children.push(toChild(txn));
		parent.stats = sumStats(parent.children);
		parent.timestamp = txn.committedAt;
		parent._lastAt = txn.committedAt;
	}
}
