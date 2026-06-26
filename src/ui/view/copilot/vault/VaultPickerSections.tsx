/**
 * Vault-tab specific sections + state hook for CopilotPickerModal.
 *
 * Owns:
 *   - useVaultTabState: 5-state fingerprint freshness derivation
 *     (A no-prior / B unchanged / C minor / D major / E stale)
 *   - VaultContextLine: vault stats line shown in the picker metadata row
 *   - VaultReviewHistoryList: vault-scoped review history list
 *
 * The actual readiness card markup lives in PickerReadinessAdapters.ts +
 * PickerReadinessCard.tsx so all three picker tabs share one layout.
 *
 * See docs/superpowers/specs/2026-05-20-vault-auto-review-design.md §8.
 */

import React, { useEffect, useState } from 'react';
import { ChevronRight, History } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import {
	diffVaultFingerprint,
	freshnessFromDelta,
	type VaultFingerprint,
	type VaultReviewFreshness,
} from '@/service/copilot/vault/VaultFingerprintService';
import type { VaultReviewHistoryRecord } from '@/service/copilot/vault/VaultReviewReportService';
import { MODE_LABELS } from '@/service/copilot/CopilotMetaAgentStream';

const STALENESS_DAYS = 30;
const STALENESS_MS = STALENESS_DAYS * 86_400_000;

function relativeTime(ts: number): string {
	const diff = Date.now() - ts;
	const s = Math.floor(diff / 1000);
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 30) return `${d}d ago`;
	return new Date(ts).toLocaleDateString();
}

function formatNumber(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return n.toLocaleString();
}

interface VaultTabState {
	fingerprint: VaultFingerprint | null;
	lastRecord: VaultReviewHistoryRecord | null;
	freshness: VaultReviewFreshness | 'E-stale';
	filesChanged: number;
	wordDeltaPct: number;
	loading: boolean;
}

function deriveFreshness(
	current: VaultFingerprint | null,
	last: VaultReviewHistoryRecord | null,
): { freshness: VaultReviewFreshness | 'E-stale'; filesChanged: number; wordDeltaPct: number } {
	if (!current) return { freshness: 'A-no-prior', filesChanged: 0, wordDeltaPct: 0 };
	const prev = last ? {
		fingerprint: last.fingerprint,
		fileCount: last.noteCount,
		totalWordCount: last.wordCount,
	} : null;
	const delta = diffVaultFingerprint(current, prev);
	const base = freshnessFromDelta(delta, Boolean(last));
	// E-stale overrides B/C when last review is > 30 days old.
	if (last && Date.now() - last.completedAt > STALENESS_MS && (base === 'B-unchanged' || base === 'C-minor')) {
		return { freshness: 'E-stale', filesChanged: delta.filesChanged, wordDeltaPct: delta.wordDeltaPct };
	}
	return { freshness: base, filesChanged: delta.filesChanged, wordDeltaPct: delta.wordDeltaPct };
}

/** Vault metadata line shown in place of the active-document path. */
export const VaultContextLine: React.FC<{
	fingerprint: VaultFingerprint | null;
	lastRecord: VaultReviewHistoryRecord | null;
}> = ({ fingerprint, lastRecord }) => {
	const parts: string[] = [];
	if (fingerprint) {
		parts.push(`${formatNumber(fingerprint.fileCount)} notes`);
		parts.push(`${formatNumber(fingerprint.totalWordCount)} words`);
	} else {
		parts.push('Vault index initialising…');
	}
	if (lastRecord) parts.push(`last reviewed ${relativeTime(lastRecord.completedAt)}`);
	return (
		<span className="pktw-block pktw-text-xs pktw-text-muted-foreground">{parts.join(' · ')}</span>
	);
};

/** Vault review history list (independent of doc scope). */
export const VaultReviewHistoryList: React.FC<{
	records: VaultReviewHistoryRecord[];
	loading: boolean;
	onOpen: (rec: VaultReviewHistoryRecord) => void;
}> = ({ records, loading, onOpen }) => {
	if (loading) {
		return <span className="pktw-block pktw-text-xs pktw-italic pktw-text-muted-foreground">Loading vault reviews…</span>;
	}
	if (records.length === 0) {
		return (
			<span className="pktw-block pktw-rounded-lg pktw-border pktw-border-dashed pktw-border-border pktw-px-3 pktw-py-2 pktw-text-[11px] pktw-text-muted-foreground">
				No vault reviews yet. Run one to start building history.
			</span>
		);
	}
	return (
		<div className="pktw-flex pktw-flex-col">
			{records.map(r => (
				<div
					key={r.id}
					role="button"
					tabIndex={0}
					onClick={() => onOpen(r)}
					onKeyDown={e => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.preventDefault();
							onOpen(r);
						}
					}}
					className="pktw-group pktw-flex pktw-cursor-pointer pktw-items-center pktw-gap-3 pktw-rounded-md pktw-px-3 pktw-py-2 pktw-text-left pktw-transition-colors hover:pktw-bg-pk-accent/8 hover:pktw-text-pk-accent"
				>
					<History className="pktw-h-3.5 pktw-w-3.5 pktw-shrink-0 pktw-text-muted-foreground group-hover:pktw-text-pk-accent" />
					<div className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-flex-col">
						<span className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-foreground group-hover:pktw-text-pk-accent">
							<span className="pktw-truncate">{r.headline?.trim() || (r.mode === 'fast' ? `${MODE_LABELS.fast} vault review` : 'Vault review')}</span>
							<span className="pktw-shrink-0 pktw-text-muted-foreground">· {relativeTime(r.completedAt)}</span>
						</span>
						<span className="pktw-text-[10px] pktw-text-muted-foreground">
							{r.clusterCount} cluster{r.clusterCount === 1 ? '' : 's'} · {r.gapCount} gap{r.gapCount === 1 ? '' : 's'} · {r.actionCount} action{r.actionCount === 1 ? '' : 's'} · {r.insightCount} insight{r.insightCount === 1 ? '' : 's'}
						</span>
					</div>
					<ChevronRight className="pktw-h-3.5 pktw-w-3.5 pktw-text-muted-foreground/60 pktw-opacity-0 group-hover:pktw-opacity-100 group-hover:pktw-text-pk-accent" />
				</div>
			))}
		</div>
	);
};

/** Hook that computes the vault tab state on mount + on refresh trigger. */
export function useVaultTabState(refreshToken: number): VaultTabState {
	const { vaultReviewRuntime } = useServiceContext();
	const [state, setState] = useState<VaultTabState>({
		fingerprint: null,
		lastRecord: null,
		freshness: 'A-no-prior',
		filesChanged: 0,
		wordDeltaPct: 0,
		loading: true,
	});

	useEffect(() => {
		const runtime = vaultReviewRuntime;
		if (!runtime) {
			setState(s => ({ ...s, loading: false }));
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const [fingerprint, records] = await Promise.all([
					runtime.getVaultFingerprint(true),
					runtime.listReports(1),
				]);
				if (cancelled) return;
				const lastRecord = records[0] ?? null;
				const { freshness, filesChanged, wordDeltaPct } = deriveFreshness(fingerprint, lastRecord);
				setState({ fingerprint, lastRecord, freshness, filesChanged, wordDeltaPct, loading: false });
			} catch (err) {
				if (cancelled) return;
				console.warn('[useVaultTabState] failed', err);
				setState(s => ({ ...s, loading: false }));
			}
		})();
		return () => { cancelled = true; };
	}, [refreshToken, vaultReviewRuntime]);

	return state;
}
