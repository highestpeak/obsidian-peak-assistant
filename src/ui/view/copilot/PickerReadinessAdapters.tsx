/**
 * Adapters: per-tab data → PickerReadinessCardProps.
 *
 * Each picker tab (Document / Vault / Setting) feeds the readiness card with
 * different copy, signals, and run-strategy buttons. The adapters live here so
 * CopilotPickerModal stays focused on layout/wiring rather than per-state copy.
 *
 * Vault tab is the most dynamic — its 5-state freshness drives a different
 * primary/secondary button pair. Document tab is mostly static today. Setting
 * tab signals are stubbed (Phase D follow-up: real SystemDiagnosticsService).
 */

import React from 'react';
import {
	Sparkles,
	Zap,
	Clock,
	FileText,
	Link as LinkIcon,
	ListChecks,
	Check,
	ShieldCheck,
	AlertTriangle,
	Activity,
	BarChart3,
	Database,
	User,
	RefreshCw,
	History,
} from 'lucide-react';
import type {
	PickerReadinessCardProps,
	SignalChip,
	RunStrategyButton,
} from './PickerReadinessCard';
import type { DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import type { VaultReviewHistoryRecord } from '@/service/copilot/vault/VaultReviewReportService';
import type { VaultFingerprint, VaultReviewFreshness } from '@/service/copilot/vault/VaultFingerprintService';

const STALENESS_DAYS = 30;

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

/* ==========================================================================
 * Document tab
 * ========================================================================== */

export interface DocumentReadinessInput {
	ctx: DocumentContext | null;
	isMobile: boolean;
	onAuto: () => void;
	onFast: () => void;
	onCustomize?: () => void;
}

export function documentReadiness(input: DocumentReadinessInput): PickerReadinessCardProps {
	const { ctx, isMobile, onAuto, onFast, onCustomize } = input;

	const wordCount = ctx?.content?.split(/\s+/).filter(Boolean).length ?? 0;
	const hasPath = !!ctx?.file.path;
	const linkSignal: SignalChip = (() => {
		// Quick heuristic: count [[wikilink]] occurrences.
		const links = ctx?.content?.match(/\[\[[^\]]+\]\]/g)?.length ?? 0;
		if (links === 0) return { icon: LinkIcon, label: 'no links' };
		if (links < 3) return { icon: LinkIcon, label: 'few links' };
		return { icon: LinkIcon, label: `${links} links` };
	})();

	const signals: SignalChip[] = [
		{ icon: FileText, label: `${wordCount.toLocaleString()} words` },
		linkSignal,
		{ icon: Clock, label: 'no past review' },
		{ icon: ListChecks, label: hasPath ? 'current note' : 'no active note' },
		{ icon: Check, label: 'safe to run', tone: 'success' },
	];

	const disabled = !ctx || isMobile;
	const disabledReason = isMobile
		? 'Auto Review is not available on mobile yet.'
		: !ctx
			? 'Open a document first to run Auto.'
			: undefined;

	const runStrategy: RunStrategyButton[] = [
		{
			label: 'Auto',
			icon: Sparkles,
			onClick: onAuto,
			disabled,
			title: disabled ? disabledReason : 'Up to 3 rounds with cross-round compaction.',
			variant: 'primary',
		},
		{
			label: 'Fast',
			icon: Zap,
			onClick: onFast,
			disabled,
			title: disabled ? disabledReason : 'Single-pass review (~8 turns).',
			variant: 'secondary',
		},
	];

	return {
		icon: Sparkles,
		title: ctx ? 'Ready to review this note' : 'Open a note to review',
		description: ctx ? (
			<>
				Agent will inspect the current note, choose useful tools, and prepare Changes + Insights.{' '}
				<span className="pktw-text-pk-foreground-faint">No auto-apply.</span>
			</>
		) : (
			'Open a note in the active editor before launching a document review.'
		),
		signals,
		runStrategy,
		onCustomize,
	};
}

/* ==========================================================================
 * Vault tab — driven by 5-state freshness
 * ========================================================================== */

export interface VaultReadinessInput {
	fingerprint: VaultFingerprint | null;
	lastRecord: VaultReviewHistoryRecord | null;
	freshness: VaultReviewFreshness | 'E-stale';
	filesChanged: number;
	wordDeltaPct: number;
	onAuto: () => void;
	onFast: () => void;
	onOpenLast: () => void;
	onCustomize?: () => void;
}

export function vaultReadiness(input: VaultReadinessInput): PickerReadinessCardProps {
	const {
		fingerprint, lastRecord, freshness, filesChanged, wordDeltaPct,
		onAuto, onFast, onOpenLast, onCustomize,
	} = input;

	// Per-state title + description
	const { title, description, icon } = (() => {
		switch (freshness) {
			case 'A-no-prior':
				return {
					title: 'Run your first vault review',
					description: 'Analyses your whole knowledge base for clusters, gaps and recommended actions. ~30s–2m depending on vault size.',
					icon: Sparkles,
				};
			case 'B-unchanged':
				return {
					title: `Vault unchanged since ${lastRecord ? relativeTime(lastRecord.completedAt) : 'last review'}`,
					description: 'No need to re-run. Open the last report or force a fresh analysis.',
					icon: Check,
				};
			case 'C-minor':
				return {
					title: `Last reviewed ${lastRecord ? relativeTime(lastRecord.completedAt) : 'recently'} · ${filesChanged} note${filesChanged === 1 ? '' : 's'} changed`,
					description: (
						<>
							Fingerprint changed lightly. Last report is still mostly accurate;{' '}
							<span className="pktw-text-pk-foreground-faint">refresh only if you want a fresh read.</span>
						</>
					),
					icon: Clock,
				};
			case 'D-major':
				return {
					title: `${filesChanged} notes changed since last review`,
					description: 'Significant changes detected. A new review is recommended.',
					icon: AlertTriangle,
				};
			case 'E-stale':
				return {
					title: `Last reviewed ${lastRecord ? relativeTime(lastRecord.completedAt) : 'over a month ago'} — worth a fresh look`,
					description: `It's been more than ${STALENESS_DAYS} days. Vault evolution may be worth re-mapping.`,
					icon: Clock,
				};
		}
	})();

	const signals: SignalChip[] = (() => {
		const chips: SignalChip[] = [];
		if (filesChanged > 0) {
			chips.push({ dotColor: 'amber', label: `${filesChanged} note${filesChanged === 1 ? '' : 's'} changed` });
		}
		if (Math.abs(wordDeltaPct) >= 0.1) {
			chips.push({ icon: Activity, label: `${wordDeltaPct.toFixed(1)}% word drift` });
		}
		if (lastRecord) chips.push({ icon: Database, label: 'cached report' });
		if (freshness === 'B-unchanged' || freshness === 'C-minor') {
			chips.push({ icon: Check, label: 'safe to skip', tone: 'success' });
		}
		if (lastRecord) chips.push({ icon: RefreshCw, label: 'can refresh' });
		if (freshness === 'A-no-prior') {
			chips.unshift({ icon: Sparkles, label: 'first run' });
			chips.push({ icon: Check, label: 'safe to run', tone: 'success' });
		}
		if (freshness === 'D-major') {
			chips.push({ icon: AlertTriangle, label: 'large delta', tone: 'warning' });
		}
		if (fingerprint) {
			chips.unshift({ icon: FileText, label: `${fingerprint.fileCount.toLocaleString()} notes` });
		}
		return chips;
	})();

	// Per-state button arrangement (kept identical to the old VaultIntentCard logic).
	const runStrategy: RunStrategyButton[] = (() => {
		switch (freshness) {
			case 'A-no-prior':
				return [
					{ label: 'Auto', icon: Sparkles, onClick: onAuto, variant: 'primary' as const },
					{ label: 'Fast', icon: Zap, onClick: onFast, variant: 'secondary' as const },
				];
			case 'B-unchanged':
				return [
					{ label: 'View last report', icon: FileText, onClick: onOpenLast, variant: 'primary' as const, disabled: !lastRecord },
					{ label: 'Force refresh', icon: RefreshCw, onClick: onAuto, variant: 'ghost' as const },
				];
			case 'C-minor':
				return [
					{ label: 'View last report', icon: FileText, onClick: onOpenLast, variant: 'primary' as const, disabled: !lastRecord },
					{ label: 'Refresh', icon: RefreshCw, onClick: onAuto, variant: 'secondary' as const },
				];
			case 'D-major':
			case 'E-stale':
				return [
					{ label: 'Auto', icon: Sparkles, onClick: onAuto, variant: 'primary' as const },
					{ label: 'View last report', icon: History, onClick: onOpenLast, variant: 'secondary' as const, disabled: !lastRecord },
				];
		}
	})();

	return { icon, title, description, signals, runStrategy, onCustomize };
}

/* ==========================================================================
 * Setting tab — system diagnostics launcher (stubbed signals)
 * ========================================================================== */

export interface SettingReadinessInput {
	onRunCheck: () => void;
	onViewDiagnostics: () => void;
	onCustomize?: () => void;
}

export function settingReadiness(input: SettingReadinessInput): PickerReadinessCardProps {
	const { onRunCheck, onViewDiagnostics, onCustomize } = input;
	// TODO(Phase D): wire up real SystemDiagnosticsService for live signal counts.
	const signals: SignalChip[] = [
		{ icon: Check, label: 'index ready', tone: 'success' },
		{ icon: AlertTriangle, label: '1 model warning', tone: 'warning' },
		{ icon: RefreshCw, label: 'prompts changed' },
		{ icon: User, label: 'skills available' },
		{ icon: Check, label: 'safe to check', tone: 'success' },
	];

	return {
		icon: ShieldCheck,
		badge: { icon: AlertTriangle, tone: 'warning' },
		title: 'System ready · 2 warnings',
		description: (
			<>
				Index is current. One model profile needs attention.{' '}
				<span className="pktw-text-pk-foreground-faint">Prompt templates changed yesterday.</span>
			</>
		),
		signals,
		runStrategy: [
			{ label: 'Run system check', icon: Activity, onClick: onRunCheck, variant: 'primary' },
			{ label: 'View diagnostics', icon: BarChart3, onClick: onViewDiagnostics, variant: 'secondary' },
		],
		onCustomize,
	};
}
