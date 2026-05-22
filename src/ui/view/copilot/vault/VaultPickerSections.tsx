/**
 * Vault-tab specific sections for CopilotPickerModal.
 *
 * Replaces the generic AutoIntentCard / DocumentReviewHistory when the user
 * is on the Vault tab. Shows:
 *   - 5-state fingerprint card (A no-prior / B unchanged / C minor / D major / E stale)
 *   - Past vault reviews list (independent of document scope)
 *
 * See docs/superpowers/specs/2026-05-20-vault-auto-review-design.md §8.
 */

import React, { useEffect, useState } from 'react';
import { ChevronRight, History, RefreshCw, Sparkles, Zap, Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { Button } from '@/ui/component/shared-ui/button';
import {
	getVaultFingerprint,
	diffVaultFingerprint,
	freshnessFromDelta,
	type VaultFingerprint,
	type VaultReviewFreshness,
} from '@/service/copilot/vault/VaultFingerprintService';
import {
	getVaultReviewReportService,
	type VaultReviewHistoryRecord,
} from '@/service/copilot/vault/VaultReviewReportService';

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

/**
 * 5-state hero card. Replaces AutoIntentCard on the Vault tab.
 */
export const VaultIntentCard: React.FC<{
	state: VaultTabState;
	onAuto: () => void;
	onFast: () => void;
	onOpenLast: () => void;
}> = ({ state, onAuto, onFast, onOpenLast }) => {
	const { freshness, lastRecord, filesChanged, wordDeltaPct, loading } = state;

	if (loading) {
		return (
			<div className="pktw-rounded-2xl pktw-border pktw-border-border pktw-bg-muted/20 pktw-px-5 pktw-py-4">
				<span className="pktw-text-sm pktw-text-muted-foreground">Reading vault fingerprint…</span>
			</div>
		);
	}

	const headline = (() => {
		switch (freshness) {
			case 'A-no-prior':
				return 'Run your first vault review';
			case 'B-unchanged':
				return 'Vault unchanged since last review';
			case 'C-minor':
				return `Last reviewed ${lastRecord ? relativeTime(lastRecord.completedAt) : 'recently'} · ${filesChanged} note${filesChanged === 1 ? '' : 's'} changed`;
			case 'D-major':
				return `${filesChanged} notes changed since last review`;
			case 'E-stale':
				return `Last reviewed ${lastRecord ? relativeTime(lastRecord.completedAt) : 'over a month ago'} — worth a fresh look`;
		}
	})();

	const subline = (() => {
		switch (freshness) {
			case 'A-no-prior':
				return 'Analyses your whole knowledge base for clusters, gaps and recommended actions. Takes ~30s–2m depending on vault size.';
			case 'B-unchanged':
				return 'No need to re-run. Open the last report or force a fresh analysis.';
			case 'C-minor':
				return `Word count drift ${wordDeltaPct.toFixed(1)}%. Last report is still mostly accurate.`;
			case 'D-major':
				return 'Significant changes detected. A new review is recommended.';
			case 'E-stale':
				return `It's been more than ${STALENESS_DAYS} days. Vault evolution may be worth re-mapping.`;
		}
	})();

	const Icon = (() => {
		switch (freshness) {
			case 'A-no-prior': return Sparkles;
			case 'B-unchanged': return CheckCircle2;
			case 'C-minor': return Clock;
			case 'D-major': return AlertTriangle;
			case 'E-stale': return Clock;
		}
	})();

	const tone = (() => {
		switch (freshness) {
			case 'A-no-prior': return 'pktw-bg-pk-accent/10 pktw-text-pk-accent';
			case 'B-unchanged': return 'pktw-bg-emerald-500/10 pktw-text-emerald-600 dark:pktw-text-emerald-400';
			case 'C-minor': return 'pktw-bg-blue-500/10 pktw-text-blue-600 dark:pktw-text-blue-400';
			case 'D-major': return 'pktw-bg-amber-500/10 pktw-text-amber-600 dark:pktw-text-amber-400';
			case 'E-stale': return 'pktw-bg-indigo-500/10 pktw-text-indigo-600 dark:pktw-text-indigo-400';
		}
	})();

	// Button layout per state:
	//   A: [Run Auto] [Fast]
	//   B: [View last] (primary)  [Force refresh] (muted)
	//   C: [View last] (primary)  [Refresh]
	//   D: [Run Auto] (primary)   [View last]
	//   E: [Run Auto] (primary)   [View last]
	const showAutoPrimary = freshness === 'A-no-prior' || freshness === 'D-major' || freshness === 'E-stale';
	const showLastPrimary = freshness === 'B-unchanged' || freshness === 'C-minor';
	const showForceRefresh = freshness === 'B-unchanged';
	const showFast = freshness === 'A-no-prior';

	return (
		<div className="pktw-rounded-2xl pktw-border pktw-border-border pktw-bg-background pktw-px-5 pktw-py-4 pktw-shadow-sm">
			<div className="pktw-flex pktw-items-start pktw-gap-3">
				<div className={cn('pktw-flex pktw-h-10 pktw-w-10 pktw-shrink-0 pktw-items-center pktw-justify-center pktw-rounded-xl', tone)}>
					<Icon className="pktw-h-5 pktw-w-5" />
				</div>
				<div className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-flex-col pktw-gap-1">
					<span className="pktw-text-sm pktw-font-semibold pktw-text-foreground">{headline}</span>
					<span className="pktw-text-xs pktw-leading-relaxed pktw-text-muted-foreground">{subline}</span>
				</div>
				<div className="pktw-flex pktw-shrink-0 pktw-items-center pktw-gap-2">
					{showLastPrimary && lastRecord && (
						<Button onClick={onOpenLast} className="pktw-h-9 pktw-gap-1.5 pktw-px-3">
							<History className="pktw-h-3.5 pktw-w-3.5" />
							View last report
						</Button>
					)}
					{showForceRefresh && (
						<Button variant="ghost" onClick={onAuto} className="pktw-h-9 pktw-gap-1.5 pktw-px-3 pktw-text-muted-foreground">
							<RefreshCw className="pktw-h-3.5 pktw-w-3.5" />
							Force refresh
						</Button>
					)}
					{freshness === 'C-minor' && (
						<Button variant="outline" onClick={onAuto} className="pktw-h-9 pktw-gap-1.5 pktw-px-3">
							<RefreshCw className="pktw-h-3.5 pktw-w-3.5" />
							Refresh
						</Button>
					)}
					{showFast && (
						<Button variant="outline" onClick={onFast} className="pktw-h-9 pktw-gap-1.5 pktw-px-3">
							<Zap className="pktw-h-3.5 pktw-w-3.5" />
							Fast
						</Button>
					)}
					{showAutoPrimary && (
						<Button onClick={onAuto} className="pktw-h-9 pktw-gap-1.5 pktw-px-3">
							<Sparkles className="pktw-h-3.5 pktw-w-3.5" />
							Run vault review
						</Button>
					)}
					{(freshness === 'D-major' || freshness === 'E-stale') && lastRecord && (
						<Button variant="ghost" onClick={onOpenLast} className="pktw-h-9 pktw-gap-1.5 pktw-px-3 pktw-text-muted-foreground">
							<History className="pktw-h-3.5 pktw-w-3.5" />
							View last
						</Button>
					)}
				</div>
			</div>
		</div>
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
							<span className="pktw-truncate">{r.headline?.trim() || (r.mode === 'fast' ? 'Fast vault review' : 'Vault review')}</span>
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
	const [state, setState] = useState<VaultTabState>({
		fingerprint: null,
		lastRecord: null,
		freshness: 'A-no-prior',
		filesChanged: 0,
		wordDeltaPct: 0,
		loading: true,
	});

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const [fingerprint, records] = await Promise.all([
					getVaultFingerprint(true),
					getVaultReviewReportService().listAll(1),
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
	}, [refreshToken]);

	return state;
}
