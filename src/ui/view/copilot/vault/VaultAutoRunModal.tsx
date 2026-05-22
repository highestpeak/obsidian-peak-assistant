/**
 * VaultAutoRunModal — modal for the Vault-scope Auto Review flow.
 *
 * Visual styling lives in `src/styles/vault-review.css` and is scoped under
 * `.peak-vault-auto-run-modal`. JSX class names mirror the mock at
 * `docs/superpowers/mockups/2026-05-20-vault-review-mockup.html` 1:1, so any
 * future visual change should happen in BOTH places.
 *
 * Six tabs: Overview / Clusters / Gaps / Actions / Sources / Trace.
 * Right rail (Agent trace) only renders while the run is in-flight.
 */

import { Modal, Notice, TFile, type App } from 'obsidian';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { StreamdownIsolated } from '@/ui/component/mine';
import { TraceArtifactPanel } from '@/ui/view/copilot/review/TraceArtifactPanel';
import {
	runVaultReview,
	type VaultReviewSessionSnapshot,
} from '@/service/copilot/vault/VaultReviewSession';
import type { VaultReviewMode } from '@/service/copilot/vault/VaultMetaAgentStream';
import {
	getVaultReviewReportService,
	type VaultReviewHistoryRecord,
} from '@/service/copilot/vault/VaultReviewReportService';
import { buildVaultTrace } from '@/service/copilot/vault/VaultReviewArtifactBuilder';
import {
	listClusterMembers,
	type ClusterMember,
	type VaultClusterDigest,
} from '@/service/copilot/vault/VaultDigestService';

interface VaultAutoRunModalProps {
	mode?: VaultReviewMode;
	initialSnapshot?: VaultReviewSessionSnapshot;
}

type VaultTabId = 'overview' | 'clusters' | 'gaps' | 'actions' | 'sources' | 'trace';

// ─── helpers ────────────────────────────────────────────────────────────

function formatNumber(n: number): string {
	if (!Number.isFinite(n)) return '—';
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
	return n.toLocaleString();
}

function formatDuration(ms: number): string {
	if (!Number.isFinite(ms) || ms <= 0) return '0s';
	const s = Math.round(ms / 1000);
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	if (h > 0) return `${h}h ${m}m ${sec}s`;
	if (m > 0) return `${m}m ${sec}s`;
	return `${sec}s`;
}

function basename(path: string): string {
	return path.split('/').pop()?.replace(/\.md$/, '') ?? path;
}

/** Display name for a cluster: prefer AI-named label, fall back to dominant topic / top node / raw label. */
function clusterDisplayName(c: VaultClusterDigest, observationLabel?: string): string {
	if (observationLabel) return observationLabel;
	// Heuristic: raw "Community N" labels are not informative, use dominant topics or top node instead
	const raw = c.label;
	const isRaw = /^Community\s+\d+$/i.test(raw) || /^c[_-]?\d+$/i.test(raw);
	if (!isRaw && raw) return raw;
	if (c.dominantTopics.length > 0) {
		return c.dominantTopics.slice(0, 2).join(' · ');
	}
	if (c.topNodes.length > 0) {
		return basename(c.topNodes[0].path);
	}
	return raw || 'Cluster';
}

const openNote = async (path: string): Promise<void> => {
	const app = AppContext.getInstance().app;
	const file = app.vault.getAbstractFileByPath(path);
	if (file instanceof TFile) {
		await app.workspace.getLeaf('tab').openFile(file);
		return;
	}
	app.workspace.openLinkText(path, '', true);
};

/** Split a 2-3 sentence summary into headline (1st sentence) + body (rest). */
function splitHeadline(summary: string): { title: string; body: string } {
	const trimmed = summary.trim();
	const match = trimmed.match(/^([^.。!?！？\n]+[.。!?！？])\s*(.*)$/s);
	if (match) return { title: match[1].trim(), body: match[2].trim() };
	return { title: trimmed, body: '' };
}

// ─── Modal content ──────────────────────────────────────────────────────

const VaultAutoRunContent: React.FC<{
	mode: VaultReviewMode;
	initialSnapshot?: VaultReviewSessionSnapshot;
	onClose: () => void;
}> = ({ mode, initialSnapshot, onClose }) => {
	const readOnly = Boolean(initialSnapshot);
	const controllerRef = useRef<AbortController | null>(null);
	const [snapshot, setSnapshot] = useState<VaultReviewSessionSnapshot | null>(initialSnapshot ?? null);
	const persistedRecordRef = useRef<{ id: string; storagePath: string } | null>(null);
	const lastSavedSigRef = useRef<string>('');
	const [activeTab, setActiveTab] = useState<VaultTabId>('overview');
	const [reportPath, setReportPath] = useState<string | null>(null);
	const [prevRecord, setPrevRecord] = useState<VaultReviewHistoryRecord | null>(null);

	// Live-run lifecycle
	useEffect(() => {
		if (readOnly) return;
		const controller = new AbortController();
		controllerRef.current = controller;
		let mounted = true;
		(async () => {
			try {
				for await (const next of runVaultReview({ mode, signal: controller.signal })) {
					if (!mounted) return;
					setSnapshot(next);
				}
			} catch (err) {
				console.error('[VaultAutoRunModal] runVaultReview failed', err);
			}
		})();
		return () => { mounted = false; controller.abort(); };
	}, [readOnly, mode]);

	// Load previous review (for "since last review" deltas)
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const records = await getVaultReviewReportService().listAll(5);
				if (cancelled) return;
				const ownFingerprint = snapshot?.digest?.fingerprint.fingerprint;
				const ownId = persistedRecordRef.current?.id;
				const prev = records.find(r => r.id !== ownId && r.fingerprint !== ownFingerprint) ?? null;
				setPrevRecord(prev);
			} catch (err) {
				console.debug('[VaultAutoRunModal] prev record fetch failed', err);
			}
		})();
		return () => { cancelled = true; };
	}, [snapshot?.digest?.fingerprint.fingerprint]);

	// Progressive checkpoint
	useEffect(() => {
		if (readOnly || !snapshot) return;
		const cs = snapshot.collectorSnapshot;
		const hasOutput =
			cs.insights.length > 0 ||
			cs.clusterObservations.length > 0 ||
			cs.gaps.length > 0 ||
			cs.actions.length > 0 ||
			cs.sources.length > 0;
		const finished = ['completed', 'cancelled', 'error'].includes(snapshot.status);
		if (!hasOutput && !finished) return;
		const sig = [
			snapshot.status, snapshot.rounds.length,
			cs.insights.length, cs.clusterObservations.length,
			cs.gaps.length, cs.actions.length, cs.sources.length, cs.submissions.length,
		].join(':');
		if (sig === lastSavedSigRef.current) return;
		lastSavedSigRef.current = sig;
		getVaultReviewReportService()
			.save(snapshot, persistedRecordRef.current ?? undefined)
			.then(rec => {
				persistedRecordRef.current = { id: rec.id, storagePath: rec.storagePath };
				setReportPath(rec.storagePath);
			})
			.catch(err => console.warn('[VaultAutoRunModal] save failed', err));
	}, [snapshot, readOnly]);

	const trace = useMemo(() => snapshot ? buildVaultTrace(snapshot) : [], [snapshot]);
	const traceSummary = useMemo(() => {
		if (!snapshot || snapshot.rounds.length === 0) return undefined;
		const firstStart = snapshot.rounds[0].startedAt;
		const lastRound = snapshot.rounds[snapshot.rounds.length - 1];
		const finished = ['completed', 'cancelled', 'error'].includes(snapshot.status);
		const end = finished ? (lastRound.endedAt ?? Date.now()) : Date.now();
		return {
			totalMs: Math.max(0, end - firstStart),
			roundCount: snapshot.rounds.length,
			turnCount: snapshot.rounds.reduce((s, r) => s + r.turnCount, 0),
			finished,
		};
	}, [snapshot]);

	const isRunning = !readOnly && (
		!snapshot || snapshot.status === 'preparing' || snapshot.status === 'running' || snapshot.status === 'awaiting-next-round'
	);

	const cancelRun = () => controllerRef.current?.abort();

	const openReport = async () => {
		if (!reportPath) return;
		const app = AppContext.getInstance().app;
		const file = app.vault.getAbstractFileByPath(reportPath);
		if (file instanceof TFile) {
			await app.workspace.getLeaf('tab').openFile(file);
			onClose();
		}
	};

	const exportSummary = async () => {
		if (!snapshot) return;
		const cs = snapshot.collectorSnapshot;
		const headline = cs.submissions[cs.submissions.length - 1]?.summary ?? 'Vault Review';
		const text = [
			'Vault Review summary', '', headline, '',
			`Clusters covered: ${cs.clusterObservations.length}`,
			`Gaps: ${cs.gaps.length}`,
			`Actions: ${cs.actions.length}`,
		].join('\n');
		try {
			await navigator.clipboard.writeText(text);
			new Notice('Summary copied to clipboard');
		} catch {
			new Notice('Could not copy summary');
		}
	};

	const status = snapshot?.status ?? 'preparing';
	const counts = snapshot?.digest?.counts;
	const subtitleParts: string[] = [];
	if (counts) {
		subtitleParts.push(`${formatNumber(counts.notes)} notes`);
		subtitleParts.push(`${formatNumber(counts.words)} words`);
	} else {
		subtitleParts.push('Preparing vault digest…');
	}
	if (snapshot && prevRecord && counts) {
		const filesChanged = Math.abs(counts.notes - prevRecord.noteCount);
		if (filesChanged > 0) subtitleParts.push(`${filesChanged} changed notes`);
	}
	if (reportPath) subtitleParts.push('saved');

	const tabs: Array<{ id: VaultTabId; label: string; count?: number }> = [
		{ id: 'overview', label: 'Overview' },
		{ id: 'clusters', label: 'Clusters', count: snapshot?.digest?.clusters.length },
		{ id: 'gaps', label: 'Gaps', count: snapshot?.collectorSnapshot.gaps.length },
		{ id: 'actions', label: 'Actions', count: snapshot?.collectorSnapshot.actions.length },
		{ id: 'sources', label: 'Sources', count: snapshot?.collectorSnapshot.sources.length },
		{ id: 'trace', label: 'Trace', count: trace.length },
	];

	return (
		<div className="vr-modal">
			{/* Header */}
			<div className="vr-header">
				<div className="vh-left">
					<div className="vh-icon"><IconSparkles /></div>
					<div>
						<div className="vh-title">{readOnly ? 'Vault Review · History' : 'Vault Review'}</div>
						<div className="vh-sub">
							{subtitleParts.map((p, i) => (
								<React.Fragment key={i}>
									{i > 0 && <span className="dot">·</span>}
									<span>{p}</span>
								</React.Fragment>
							))}
						</div>
					</div>
				</div>
				<div className="vh-actions">
					{isRunning && (
						<span className="vr-badge running"><IconDot /> Running</span>
					)}
					{!isRunning && status === 'completed' && <span className="vr-badge success">● Completed</span>}
					{status === 'cancelled' && <span className="vr-badge warning">● Cancelled</span>}
					{status === 'error' && <span className="vr-badge error">● Error</span>}
					<button className="vr-icon-btn" onClick={onClose} title="Close">✕</button>
				</div>
			</div>

			{/* Tab bar with hover TOC popovers */}
			<div className="vr-tabs">
				{tabs.map(t => (
					<VaultTab
						key={t.id}
						tab={t}
						isActive={activeTab === t.id}
						onSelect={() => setActiveTab(t.id)}
						onJumpAnchor={anchor => {
							setActiveTab(t.id);
							requestAnimationFrame(() => {
								const el = document.getElementById(anchor);
								if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
							});
						}}
						tocItems={getTocItems(t.id, snapshot)}
					/>
				))}
				<span className="spacer" />
				{traceSummary && (
					<span className="vr-time-summary">
						{traceSummary.finished ? `Total ${formatDuration(traceSummary.totalMs)}` : `${formatDuration(traceSummary.totalMs)} elapsed`}
						{traceSummary.roundCount > 0 && ` · ${traceSummary.roundCount} round${traceSummary.roundCount === 1 ? '' : 's'}`}
						{traceSummary.turnCount > 0 && ` · ${traceSummary.turnCount} turn${traceSummary.turnCount === 1 ? '' : 's'}`}
					</span>
				)}
			</div>

			{/* Body */}
			<div className={`vr-body${isRunning && activeTab !== 'trace' ? ' with-rail' : ''}`}>
				<div className="vr-panel">
					{activeTab === 'overview' && <OverviewPanel snapshot={snapshot} prevRecord={prevRecord} onJumpTab={setActiveTab} />}
					{activeTab === 'clusters' && <ClustersPanel snapshot={snapshot} />}
					{activeTab === 'gaps' && <GapsPanel snapshot={snapshot} />}
					{activeTab === 'actions' && <ActionsPanel snapshot={snapshot} />}
					{activeTab === 'sources' && <SourcesPanel snapshot={snapshot} />}
					{activeTab === 'trace' && (
						<div className="vr-trace-wrap">
							<TraceArtifactPanel trace={trace} expanded summary={traceSummary} />
						</div>
					)}
				</div>
				{isRunning && activeTab !== 'trace' && (
					<div className="vr-rail">
						<div className="vr-rail-head">
							<span className="vr-rail-title">Agent trace</span>
							<span className="vr-rail-sub">Running · {trace.length} step{trace.length === 1 ? '' : 's'}</span>
						</div>
						<TraceArtifactPanel trace={trace} summary={traceSummary} />
					</div>
				)}
			</div>

			{/* Footer */}
			<div className="vr-footer">
				<div className="vr-ft-status">
					<span className="lock">🔒</span>
					{readOnly
						? 'Historical snapshot · open the report note to re-share.'
						: reportPath
							? `Saved to ${reportPath}`
							: 'No report saved yet'}
				</div>
				{isRunning && <button className="vr-btn" onClick={cancelRun}>Cancel run</button>}
				<button className="vr-btn" disabled={!reportPath} onClick={openReport}>↗ Open report note</button>
				<button className="vr-btn" disabled={!snapshot} onClick={exportSummary}>Export summary</button>
				<button className="vr-btn primary" onClick={onClose}>✓ Close</button>
			</div>
		</div>
	);
};

// ─── Tab button with hover TOC popover ──────────────────────────────────

interface TocItem { id: string; label: string; anchor: string }

function getTocItems(tab: VaultTabId, snapshot: VaultReviewSessionSnapshot | null): TocItem[] {
	if (!snapshot) return [];
	const cs = snapshot.collectorSnapshot;
	const obsById = new Map(cs.clusterObservations.map(o => [o.clusterId, o]));
	switch (tab) {
		case 'clusters':
			return (snapshot.digest?.clusters ?? []).map(c => ({
				id: c.id,
				label: clusterDisplayName(c, obsById.get(c.id)?.clusterLabel),
				anchor: `vault-cluster-${c.id}`,
			}));
		case 'gaps':
			return cs.gaps.map(g => ({ id: g.id, label: g.title, anchor: `vault-gap-${g.id}` }));
		case 'actions':
			return cs.actions.map(a => ({ id: a.id, label: a.title, anchor: `vault-action-${a.id}` }));
		default:
			return [];
	}
}

const VaultTab: React.FC<{
	tab: { id: VaultTabId; label: string; count?: number };
	isActive: boolean;
	tocItems: TocItem[];
	onSelect: () => void;
	onJumpAnchor: (anchor: string) => void;
}> = ({ tab, isActive, tocItems, onSelect, onJumpAnchor }) => {
	const [hovered, setHovered] = useState(false);
	const closeTimerRef = useRef<number | null>(null);

	const open = () => {
		if (closeTimerRef.current !== null) {
			window.clearTimeout(closeTimerRef.current);
			closeTimerRef.current = null;
		}
		setHovered(true);
	};
	const scheduleClose = () => {
		if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
		closeTimerRef.current = window.setTimeout(() => setHovered(false), 200);
	};

	const showPopover = hovered && tocItems.length > 0;

	return (
		<div className="vr-tab-wrap" onMouseEnter={open} onMouseLeave={scheduleClose}>
			<button className={`vr-tab${isActive ? ' active' : ''}`} onClick={onSelect}>
				<TabIcon tab={tab.id} />
				{tab.label}
				{typeof tab.count === 'number' && tab.count > 0 && (
					<span className="vr-count">{tab.count}</span>
				)}
			</button>
			{showPopover && (
				<div className="vr-toc-popover" onMouseEnter={open} onMouseLeave={scheduleClose}>
					<div className="vr-toc-head">{tab.label} · {tocItems.length} item{tocItems.length === 1 ? '' : 's'}</div>
					{tocItems.map(item => (
						<div
							key={item.id}
							className="vr-toc-item"
							role="button"
							tabIndex={0}
							onClick={() => onJumpAnchor(item.anchor)}
							onKeyDown={e => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									onJumpAnchor(item.anchor);
								}
							}}
						>
							<span className="vr-toc-arrow">›</span>
							<span className="vr-toc-label">{item.label}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
};

// ─── Panels ─────────────────────────────────────────────────────────────

const OverviewPanel: React.FC<{
	snapshot: VaultReviewSessionSnapshot | null;
	prevRecord: VaultReviewHistoryRecord | null;
	onJumpTab: (tab: VaultTabId) => void;
}> = ({ snapshot, prevRecord, onJumpTab }) => {
	if (!snapshot) return <div className="vr-empty">Building pre-flight vault digest…</div>;

	const cs = snapshot.collectorSnapshot;
	const lastSub = cs.submissions[cs.submissions.length - 1];
	const counts = snapshot.digest?.counts;
	const health = snapshot.digest?.health;
	const sorted = cs.actions.slice().sort((a, b) => {
		const order = { high: 0, medium: 1, low: 2 };
		return order[a.priority] - order[b.priority];
	});
	const topAction = sorted[0];
	const { title: headlineTitle, body: headlineBody } = lastSub?.summary
		? splitHeadline(lastSub.summary)
		: { title: '', body: '' };

	const notesDelta = prevRecord && counts ? counts.notes - prevRecord.noteCount : 0;
	const wordsDeltaPct = prevRecord && counts && prevRecord.wordCount > 0
		? ((counts.words - prevRecord.wordCount) / prevRecord.wordCount) * 100
		: null;
	const showDelta = Boolean(prevRecord);

	return (
		<>
			{headlineTitle && (
				<div className="vr-headline-card">
					<div className="vr-hc-icon"><IconSparkles /></div>
					<div style={{ minWidth: 0, flex: 1 }}>
						<div className="vr-kicker">Headline</div>
						<div className="vr-hc-title" style={{ marginTop: 6 }}>{headlineTitle}</div>
						{headlineBody && <div className="vr-hc-body">{headlineBody}</div>}
					</div>
				</div>
			)}

			{counts && (
				<div className="vr-metric-grid">
					<MetricCard label="Notes" value={formatNumber(counts.notes)}
						foot={showDelta ? <DeltaText n={notesDelta} suffix=" since last" /> : undefined} />
					<MetricCard label="Words" value={formatNumber(counts.words)}
						foot={showDelta && wordsDeltaPct !== null ? <DeltaText n={wordsDeltaPct} unit="%" suffix=" this period" /> : undefined} />
					<MetricCard label="Clusters" value={String(counts.clusters)}
						foot={snapshot.digest && snapshot.digest.recentActivity.dormantClusters.length > 0
							? <span>{counts.clusters - snapshot.digest.recentActivity.dormantClusters.length} active · {snapshot.digest.recentActivity.dormantClusters.length} dormant</span>
							: undefined} />
					<MetricCard label="Health" value={health ? `${health.score.toFixed(1)}` : '—'}
						foot={prevRecord ? <span>vs last</span> : undefined} />
				</div>
			)}

			{counts && (
				<div className="vr-metric-grid cols-3">
					<MetricCard small label="Hubs" value={String(counts.hubs)} />
					<MetricCard small label="Orphans" value={String(counts.orphans)} />
					<MetricCard small label="Dangling refs" value={String(counts.danglingRefs)} />
				</div>
			)}

			{showDelta && prevRecord && counts && (
				<div className="vr-since-card">
					<div>
						<div className="vr-sc-label">What changed since last review</div>
						<div className="vr-sc-row">
							<SinceStat label="touched" num={Math.abs(notesDelta)} />
							<SinceStat label="net change" num={notesDelta} signed />
							{wordsDeltaPct !== null && <SinceStat label="words" num={wordsDeltaPct} signed unit="%" decimals={1} />}
						</div>
					</div>
					<span className="vr-sc-spacer" />
				</div>
			)}

			{topAction && (
				<div className="vr-top-action">
					<div className="vr-tac-icon"><IconSparkles /></div>
					<div className="vr-tac-body">
						<div className="vr-kicker">Top recommended next action</div>
						<div className="vr-tac-title" style={{ marginTop: 4 }}>
							<b>[{topAction.priority.toUpperCase()}]</b> {topAction.title}
						</div>
						{topAction.estimatedImpact && (
							<div className="vr-tac-meta">Impact · {topAction.estimatedImpact}</div>
						)}
					</div>
					<button className="vr-btn primary vr-tac-cta" onClick={() => onJumpTab('actions')}>View in Actions</button>
				</div>
			)}

			{!headlineTitle && !topAction && snapshot.status === 'running' && (
				<div className="vr-empty">Agent is exploring the vault. Findings appear here as they arrive.</div>
			)}
		</>
	);
};

const MetricCard: React.FC<{
	label: string; value: string; small?: boolean; foot?: React.ReactNode;
}> = ({ label, value, small, foot }) => (
	<div className={`vr-metric-card${small ? ' small' : ''}`}>
		<div className="vr-m-label">{label}</div>
		<div className="vr-m-value">{value}</div>
		{foot && <div className="vr-m-foot">{foot}</div>}
	</div>
);

const DeltaText: React.FC<{ n: number; unit?: string; suffix?: string }> = ({ n, unit = '', suffix = '' }) => {
	if (!Number.isFinite(n) || Math.abs(n) < 0.01) {
		return <span className="vr-delta-flat">— no change{suffix}</span>;
	}
	const up = n > 0;
	const cls = up ? 'vr-delta-up' : 'vr-delta-down';
	const arrow = up ? '▲' : '▼';
	return <span className={cls}>{arrow} {up ? '+' : ''}{n.toFixed(unit ? 1 : 0)}{unit}{suffix}</span>;
};

const SinceStat: React.FC<{
	label: string; num: number; signed?: boolean; unit?: string; decimals?: number;
}> = ({ label, num, signed, unit = '', decimals = 0 }) => {
	const cls = signed && num > 0 ? ' delta-up' : signed && num < 0 ? ' delta-down' : '';
	const sign = signed && num > 0 ? '+' : '';
	return (
		<div className={`vr-sc-stat${cls}`}>
			<span className="vr-sc-stat-num">{sign}{num.toFixed(decimals)}{unit}</span>
			<span className="vr-sc-stat-label">{label}</span>
		</div>
	);
};

// ─── Clusters panel ─────────────────────────────────────────────────────

const ClustersPanel: React.FC<{ snapshot: VaultReviewSessionSnapshot | null }> = ({ snapshot }) => {
	const observations = snapshot?.collectorSnapshot.clusterObservations ?? [];
	const digestClusters = snapshot?.digest?.clusters ?? [];
	const obsById = useMemo(() => new Map(observations.map(o => [o.clusterId, o])), [observations]);
	const [selectedId, setSelectedId] = useState<string | null>(digestClusters[0]?.id ?? null);
	const [members, setMembers] = useState<ClusterMember[]>([]);
	const [membersLoading, setMembersLoading] = useState(false);
	const [showAllMembers, setShowAllMembers] = useState(false);

	useEffect(() => {
		if (digestClusters.length === 0) { setSelectedId(null); return; }
		if (!selectedId || !digestClusters.find(c => c.id === selectedId)) {
			setSelectedId(digestClusters[0].id);
		}
	}, [digestClusters, selectedId]);

	useEffect(() => {
		if (!selectedId) { setMembers([]); return; }
		let cancelled = false;
		setMembersLoading(true);
		setShowAllMembers(false);
		listClusterMembers(selectedId, 30).then(rows => {
			if (!cancelled) { setMembers(rows); setMembersLoading(false); }
		}).catch(() => {
			if (!cancelled) { setMembers([]); setMembersLoading(false); }
		});
		return () => { cancelled = true; };
	}, [selectedId]);

	if (digestClusters.length === 0) {
		return <div className="vr-empty">No cluster data available. Vault community detection may still be initialising.</div>;
	}

	const selectedCluster = digestClusters.find(c => c.id === selectedId);
	const selectedObs = selectedId ? obsById.get(selectedId) : undefined;
	const visibleMembers = showAllMembers ? members : members.slice(0, 8);

	const recentSet = new Set(
		Object.entries(snapshot?.digest?.recentActivity ?? {})
			.filter(() => false) // placeholder — we don't have per-cluster recent map; use dormantClusters labels
			.map(() => ''),
	);
	const dormantSet = new Set(snapshot?.digest?.recentActivity.dormantClusters ?? []);

	function statusFor(c: VaultClusterDigest): { label: string; cls: string } {
		const obs = obsById.get(c.id);
		if (obs) {
			return { label: obs.status, cls: obs.status };
		}
		// Fallback: dormant cluster → dying; otherwise stable
		if (dormantSet.has(c.label)) return { label: 'dormant', cls: 'dying' };
		return { label: 'stable', cls: 'stable' };
	}

	return (
		<>
			<div className="vr-hint">
				<span className="vr-hint-icon"><IconLightbulb /></span>
				Top knowledge clusters detected by Louvain community detection. Select a cluster on the left to inspect topics, hubs and members on the right.
			</div>

			<div className="vr-clusters-split">
				{/* List */}
				<div className="vr-cluster-list">
					<div className="vr-cluster-list-head">
						<span className="vr-clh-label">{digestClusters.length} clusters · sorted by size</span>
					</div>
					<div className="vr-cluster-list-body">
						{digestClusters.map(c => {
							const isSel = selectedId === c.id;
							const display = clusterDisplayName(c, obsById.get(c.id)?.clusterLabel);
							const status = statusFor(c);
							return (
								<div
									key={c.id}
									id={`vault-cluster-${c.id}`}
									className={`vr-cluster-list-row${isSel ? ' selected' : ''}`}
									role="button"
									tabIndex={0}
									onClick={() => setSelectedId(c.id)}
									onKeyDown={e => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											setSelectedId(c.id);
										}
									}}
								>
									<div>
										<div className="vr-cll-name">{display}</div>
										<div className="vr-cll-meta">
											<span className="vr-meta-pill">density {c.internalDensity.toFixed(2)}</span>
										</div>
									</div>
									<div className="vr-cll-side">
										<span className="vr-cll-size">{c.memberCount}</span>
										<span className={`vr-status-pill ${status.cls}`}>{status.label}</span>
									</div>
								</div>
							);
						})}
					</div>
				</div>

				{/* Detail */}
				{selectedCluster && (
					<div className="vr-cluster-detail">
						<div className="vr-cluster-detail-head">
							<div className="vr-cdh-icon"><IconLayers /></div>
							<div style={{ flex: 1, minWidth: 0 }}>
								<div className="vr-cdh-title">{clusterDisplayName(selectedCluster, selectedObs?.clusterLabel)}</div>
								<div className="vr-cdh-sub">
									{selectedCluster.memberCount} notes · cluster {selectedCluster.id} · density {selectedCluster.internalDensity.toFixed(2)}
								</div>
							</div>
							<span className={`vr-status-pill ${statusFor(selectedCluster).cls}`}>{statusFor(selectedCluster).label}</span>
						</div>

						<div className="vr-cluster-detail-grid">
							<div className="vr-cdg-block">
								<div className="vr-cdg-label">Dominant topics</div>
								<div className="vr-cdg-list">
									{selectedCluster.dominantTopics.length > 0
										? selectedCluster.dominantTopics.join(', ')
										: '—'}
								</div>
							</div>
							<div className="vr-cdg-block">
								<div className="vr-cdg-label">Top hubs</div>
								<div className="vr-cdg-list">
									{selectedCluster.topNodes.length > 0 ? (
										selectedCluster.topNodes.slice(0, 4).map((n, i) => (
											<React.Fragment key={n.path}>
												{i > 0 && ' · '}
												<a
													role="button"
													tabIndex={0}
													onClick={() => void openNote(n.path)}
													onKeyDown={e => {
														if (e.key === 'Enter') { e.preventDefault(); void openNote(n.path); }
													}}
													style={{ color: 'var(--pk-accent)', cursor: 'pointer' }}
												>
													[[{n.label || basename(n.path)}]]
												</a>
											</React.Fragment>
										))
									) : '—'}
								</div>
							</div>
							<div className="vr-cdg-block">
								<div className="vr-cdg-label">Members</div>
								<div className="vr-cdg-value">{selectedCluster.memberCount}</div>
								<div className="vr-cdg-list">density {selectedCluster.internalDensity.toFixed(2)}</div>
							</div>
						</div>

						{selectedObs && (
							<div className="vr-cluster-detail-foot">
								<span className="vr-cdf-text">"{selectedObs.headline}"</span>
							</div>
						)}

						{selectedObs?.body && (
							<div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--pk-border-soft)' }}>
								<StreamdownIsolated className="vr-cluster-obs-body">{selectedObs.body}</StreamdownIsolated>
							</div>
						)}

						{/* Members */}
						<div className="vr-cluster-members">
							<div className="vr-cm-head">
								<span className="vr-kicker muted">
									Members{members.length > 0 && ` · ${visibleMembers.length} of ${members.length}`}
								</span>
								{members.length > 8 && (
									<button className="vr-btn ghost" style={{ height: 24, fontSize: 10, padding: '0 8px' }} onClick={() => setShowAllMembers(s => !s)}>
										{showAllMembers ? 'Show fewer' : `Show all ${members.length}`}
									</button>
								)}
							</div>
							{membersLoading ? (
								<span style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--pk-text-secondary)' }}>Loading members…</span>
							) : members.length === 0 ? (
								<span style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--pk-text-secondary)' }}>
									No member data — community_id may not be persisted yet on these notes.
								</span>
							) : (
								<div>
									{visibleMembers.map(m => (
										<button
											key={m.path}
											type="button"
											className="vr-member-row"
											onClick={() => void openNote(m.path)}
										>
											<span className="vr-mr-icon"><IconFile /></span>
											<span className="vr-mr-title">{m.title?.trim() || basename(m.path)}</span>
											<span className="vr-mr-meta">
												{m.incomingCount !== null ? `${m.incomingCount} in` : ''}
												{m.wordCount ? ` · ${formatNumber(m.wordCount)} w` : ''}
											</span>
										</button>
									))}
								</div>
							)}
						</div>
					</div>
				)}
			</div>
		</>
	);
};

// ─── Gaps panel ─────────────────────────────────────────────────────────

const GapsPanel: React.FC<{ snapshot: VaultReviewSessionSnapshot | null }> = ({ snapshot }) => {
	const gaps = snapshot?.collectorSnapshot.gaps ?? [];
	if (gaps.length === 0) return <div className="vr-empty">No gaps reported yet.</div>;

	const byKind = useMemo(() => {
		const m = new Map<string, typeof gaps>();
		for (const g of gaps) {
			const arr = m.get(g.kind) ?? [];
			arr.push(g);
			m.set(g.kind, arr);
		}
		return m;
	}, [gaps]);
	const structuralHoles = byKind.get('structural-hole') ?? [];
	const dangling = byKind.get('dangling-reference') ?? [];
	const stale = byKind.get('stale-hub') ?? [];
	const abstraction = byKind.get('abstraction-mismatch') ?? [];

	const confidencePill = (c: 'low' | 'medium' | 'high'): React.ReactNode => {
		const cls = c === 'high' ? 'success' : c === 'medium' ? 'warning' : 'muted';
		return <span className={`vr-pill ${cls}`}>{c} confidence</span>;
	};

	return (
		<>
			<div className="vr-hint">
				<span className="vr-hint-icon"><IconLightbulb /></span>
				Structural problems detected: missing bridges, unresolved wikilinks, stale hubs, abstraction mix-ups.
			</div>

			{structuralHoles.map(g => (
				<div key={g.id} id={`vault-gap-${g.id}`} className="vr-gap-card">
					<div className="vr-gap-card-head">
						<span className="vr-pill accent">Structural Hole</span>
						<span className="vr-gch-title">{g.title}</span>
						{confidencePill(g.confidence)}
					</div>
					<div className="vr-gap-card-body">
						<StreamdownIsolated>{g.body}</StreamdownIsolated>
					</div>
					{g.references.length > 0 && (
						<>
							<div className="vr-gap-subhead">⊙ Candidate bridging notes</div>
							<div className="vr-bridge-grid">
								{g.references.slice(0, 6).map(r => {
									const cleaned = r.replace(/^\[\[|\]\]$/g, '');
									return (
										<div
											key={r}
											className="vr-bridge-tile"
											role="button"
											tabIndex={0}
											onClick={() => void openNote(cleaned)}
											onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void openNote(cleaned); } }}
										>
											<div className="vr-bt-label">candidate</div>
											<div className="vr-bt-text">{cleaned}</div>
										</div>
									);
								})}
							</div>
						</>
					)}
				</div>
			))}

			{dangling.length > 0 && (
				<div className="vr-gap-card">
					<div className="vr-gap-card-head">
						<span className="vr-pill accent">Dangling References</span>
						<span className="vr-gch-title">
							{dangling.length} frequently cited concept{dangling.length === 1 ? '' : 's'} with no dedicated note
						</span>
						{confidencePill(dangling[0]?.confidence ?? 'medium')}
					</div>
					<div style={{ marginTop: 12 }}>
						{dangling.map(g => (
							<div key={g.id} id={`vault-gap-${g.id}`} style={{ padding: '10px 0', borderTop: '1px solid var(--pk-border-soft)' }}>
								<div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{g.title}</div>
								<div className="vr-gap-card-body">
									<StreamdownIsolated>{g.body}</StreamdownIsolated>
								</div>
								{g.references.length > 0 && (
									<div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
										{g.references.map(r => {
											const cleaned = r.replace(/^\[\[|\]\]$/g, '');
											return (
												<button key={r} className="vr-chip" onClick={() => void openNote(cleaned)}>
													{basename(cleaned)}
												</button>
											);
										})}
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			)}

			{stale.length > 0 && (
				<div className="vr-gap-card">
					<div className="vr-gap-card-head">
						<span className="vr-pill accent">Stale Hubs</span>
						<span className="vr-gch-title">
							{stale.length} hub{stale.length === 1 ? '' : 's'} unedited but still central
						</span>
						{confidencePill(stale[0]?.confidence ?? 'medium')}
					</div>
					<div style={{ marginTop: 12 }}>
						{stale.map(g => (
							<div key={g.id} id={`vault-gap-${g.id}`} style={{ padding: '10px 0', borderTop: '1px solid var(--pk-border-soft)' }}>
								<div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{g.title}</div>
								<div className="vr-gap-card-body">
									<StreamdownIsolated>{g.body}</StreamdownIsolated>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{abstraction.map(g => (
				<div key={g.id} id={`vault-gap-${g.id}`} className="vr-gap-card">
					<div className="vr-gap-card-head">
						<span className="vr-pill accent">Abstraction Mismatch</span>
						<span className="vr-gch-title">{g.title}</span>
						{confidencePill(g.confidence)}
					</div>
					<div className="vr-gap-card-body">
						<StreamdownIsolated>{g.body}</StreamdownIsolated>
					</div>
				</div>
			))}
		</>
	);
};

// ─── Actions panel ──────────────────────────────────────────────────────

const ActionsPanel: React.FC<{ snapshot: VaultReviewSessionSnapshot | null }> = ({ snapshot }) => {
	const actions = snapshot?.collectorSnapshot.actions ?? [];
	const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
	if (actions.length === 0) return <div className="vr-empty">No actions proposed yet.</div>;

	const order = { high: 0, medium: 1, low: 2 };
	const filtered = filter === 'all'
		? actions.slice().sort((a, b) => order[a.priority] - order[b.priority])
		: actions.filter(a => a.priority === filter);

	const priorityCls = (p: 'low' | 'medium' | 'high'): string =>
		p === 'high' ? 'error' : p === 'medium' ? 'warning' : 'muted';

	return (
		<>
			<div className="vr-actions-toolbar">
				<span className="vr-at-label">Prioritized action queue</span>
				{(['all', 'high', 'medium', 'low'] as const).map(f => (
					<button key={f} className={`vr-select-pill${filter === f ? ' active' : ''}`} onClick={() => setFilter(f)}>
						{f === 'all' ? 'All' : f[0].toUpperCase() + f.slice(1)}
					</button>
				))}
				<span className="vr-actions-tip">No code changes applied. Every restructure stays a dry-run until you approve.</span>
			</div>

			{filtered.length === 0 ? (
				<div className="vr-empty">No {filter} priority actions.</div>
			) : (
				filtered.map(a => {
					const validNotes = a.involvedNotes.filter(n => n && n.trim().length > 1);
					return (
						<div key={a.id} id={`vault-action-${a.id}`} className="vr-action-card">
							<div className="vr-ac-priority">
								<span className={`vr-pill ${priorityCls(a.priority)}`}>{a.priority.toUpperCase()}</span>
								<span className="vr-pill accent">{a.kind}</span>
							</div>
							<div style={{ minWidth: 0 }}>
								<div className="vr-ac-title">{a.title}</div>
								<div className="vr-ac-body">{a.rationale}</div>
								{a.estimatedImpact && <div className="vr-ac-impact">Impact · {a.estimatedImpact}</div>}
								{validNotes.length > 0 && (
									<div className="vr-ac-notes">
										{validNotes.slice(0, 6).map(n => (
											<button key={n} className="vr-chip" onClick={() => void openNote(n)}>
												{basename(n)}
											</button>
										))}
										{validNotes.length > 6 && (
											<span style={{ fontSize: 10, color: 'var(--pk-text-secondary)', alignSelf: 'center' }}>
												+{validNotes.length - 6} more
											</span>
										)}
									</div>
								)}
							</div>
							<div className="vr-ac-side">
								<span className="vr-ac-notes-count">
									{validNotes.length === 0 ? 'No notes attached' : `Involves ${validNotes.length} note${validNotes.length === 1 ? '' : 's'}`}
								</span>
								<button className="vr-btn" disabled title="Coming in Phase 2">Preview action</button>
							</div>
						</div>
					);
				})
			)}

			<div className="vr-actions-foot">
				<span className="vr-af-label">{filtered.length} of {actions.length} actions shown. Approval + execution land in Phase 2.</span>
				<button className="vr-btn" disabled>Select all visible</button>
				<button className="vr-btn" disabled>Apply queued reorganization · Phase 2</button>
			</div>
		</>
	);
};

// ─── Sources panel ──────────────────────────────────────────────────────

const SourcesPanel: React.FC<{ snapshot: VaultReviewSessionSnapshot | null }> = ({ snapshot }) => {
	const sources = snapshot?.collectorSnapshot.sources ?? [];
	const [selectedId, setSelectedId] = useState<string | null>(sources[0]?.id ?? null);
	const [conf, setConf] = useState<Record<'high' | 'medium' | 'low', boolean>>({ high: true, medium: true, low: true });

	useEffect(() => {
		if (sources.length === 0) return;
		if (!selectedId || !sources.find(s => s.id === selectedId)) setSelectedId(sources[0].id);
	}, [sources, selectedId]);

	if (sources.length === 0) return <div className="vr-empty">No sources cited yet.</div>;

	const confidenceOf = (weight: number): 'high' | 'medium' | 'low' =>
		weight >= 0.7 ? 'high' : weight >= 0.4 ? 'medium' : 'low';

	const visible = sources.filter(s => conf[confidenceOf(s.weight)]);
	const selected = visible.find(s => s.id === selectedId) ?? visible[0] ?? sources[0];

	const confCounts = sources.reduce((acc, s) => {
		acc[confidenceOf(s.weight)]++;
		return acc;
	}, { high: 0, medium: 0, low: 0 } as Record<'high' | 'medium' | 'low', number>);

	return (
		<>
			<div className="vr-hint">
				<span className="vr-hint-icon"><IconLightbulb /></span>
				Notes the agent cited as evidence during this review. Not your document's own backlinks — these are vault notes the agent judged relevant.
			</div>

			<div className="vr-sources-layout">
				<div className="vr-sources-filter">
					<div className="vr-sf-group">
						<h4>Confidence</h4>
						{(['high', 'medium', 'low'] as const).map(c => (
							<div key={c} className="vr-sf-item" role="button" tabIndex={0} onClick={() => setConf(prev => ({ ...prev, [c]: !prev[c] }))}>
								<span className={`vr-checkbox${conf[c] ? ' checked' : ''}`} />
								<span style={{ textTransform: 'capitalize' }}>{c}</span>
								<span className="vr-sf-count">{confCounts[c]}</span>
							</div>
						))}
					</div>
				</div>

				<div className="vr-sources-table">
					<div className="vr-src-head">
						<span>Title</span>
						<span>Relevance</span>
						<span>Confidence</span>
						<span>Weight</span>
						<span></span>
					</div>
					{visible.map(s => {
						const isSel = s.id === selected?.id;
						const c = confidenceOf(s.weight);
						return (
							<div
								key={s.id}
								className={`vr-src-row${isSel ? ' selected' : ''}`}
								role="button"
								tabIndex={0}
								onClick={() => setSelectedId(s.id)}
								onKeyDown={e => {
									if (e.key === 'Enter' || e.key === ' ') {
										e.preventDefault();
										setSelectedId(s.id);
									}
								}}
							>
								<div style={{ minWidth: 0 }}>
									<div className="vr-src-title">{basename(s.path)}</div>
									<div className="vr-src-path">{s.path}</div>
								</div>
								<div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11, color: 'var(--pk-text-secondary)' }}>
									{s.relevance}
								</div>
								<div>
									<span className={`vr-pill ${c === 'high' ? 'success' : c === 'medium' ? 'warning' : 'muted'}`}>{c}</span>
								</div>
								<div className="vr-src-meter">
									<div className="vr-src-bar"><div style={{ width: `${Math.round(s.weight * 100)}%` }} /></div>
									<span style={{ fontSize: 10, color: 'var(--pk-text-secondary)' }}>{s.weight.toFixed(2)}</span>
								</div>
								<span style={{ color: 'var(--pk-text-secondary)' }}>›</span>
							</div>
						);
					})}
				</div>

				{selected && (
					<div className="vr-sources-drawer">
						<h4>{basename(selected.path)}</h4>
						<div className="vr-sd-sub">{selected.path}</div>

						<div className="vr-sd-section">
							<h5>Why cited</h5>
							<div style={{ fontSize: 12 }}>{selected.relevance}</div>
						</div>

						{selected.excerpt && (
							<div className="vr-sd-section">
								<h5>Excerpt</h5>
								<div className="vr-sd-excerpt">{selected.excerpt}</div>
							</div>
						)}

						<div className="vr-sd-section">
							<button className="vr-btn primary" style={{ width: '100%' }} onClick={() => void openNote(selected.path)}>
								↗ Open in new tab
							</button>
						</div>
					</div>
				)}
			</div>
		</>
	);
};

// ─── Inline icons (no external deps to avoid Tailwind size variance) ────

const IconSparkles = () => (
	<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
		<path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" />
		<path d="M5 19l.75 2.25L8 22l-2.25.75L5 25l-.75-2.25L2 22l2.25-.75L5 19z" />
	</svg>
);

const IconDot = () => (
	<span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor', display: 'inline-block' }} />
);

const IconLightbulb = () => (
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
		<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.2 1 2v1.3h6V16.7c0-.8.4-1.5 1-2A7 7 0 0 0 12 2z" />
	</svg>
);

const IconLayers = () => (
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
		<polygon points="12 2 2 7 12 12 22 7 12 2" />
		<polyline points="2 17 12 22 22 17" />
		<polyline points="2 12 12 17 22 12" />
	</svg>
);

const IconFile = () => (
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
		<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
		<polyline points="14 2 14 8 20 8" />
	</svg>
);

const TabIcon: React.FC<{ tab: VaultTabId }> = ({ tab }) => {
	const props = { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
	if (tab === 'overview') return <svg {...props}><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z" /></svg>;
	if (tab === 'clusters') return <svg {...props}><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>;
	if (tab === 'gaps') return <svg {...props}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12" y2="17" /></svg>;
	if (tab === 'actions') return <svg {...props}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>;
	if (tab === 'sources') return <svg {...props}><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>;
	return <svg {...props}><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /></svg>;
};

// ─── Modal class wrapper ────────────────────────────────────────────────

export class VaultAutoRunModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;
	private appContext = AppContext.getInstance();

	constructor(app: App, private readonly options: VaultAutoRunModalProps = {}) {
		super(app);
	}

	async onOpen(): Promise<void> {
		this.modalEl.addClass('peak-vault-auto-run-modal');
		this.modalEl.addClass('peak-design-root'); // neutralise Obsidian's bare-tag styles
		this.modalEl.style.width = 'min(1240px, 96vw)';
		this.modalEl.style.height = 'min(820px, 92vh)';
		this.modalEl.style.maxHeight = '92vh';
		this.contentEl.style.padding = '0';
		this.contentEl.style.height = '100%';
		this.contentEl.style.overflow = 'hidden';

		this.reactRenderer = new ReactRenderer(this.contentEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				VaultAutoRunContent,
				{
					mode: this.options.mode ?? 'complete',
					initialSnapshot: this.options.initialSnapshot,
					onClose: () => this.close(),
				},
				this.appContext,
			),
		);
	}

	onClose(): void {
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) setTimeout(() => { r.unmount(); this.contentEl.empty(); }, 0);
		else this.contentEl.empty();
	}
}

export function openVaultReviewHistoryRecord(app: App, record: VaultReviewHistoryRecord): void {
	void getVaultReviewReportService().load(record).then(snapshot => {
		if (!snapshot) {
			new Notice('Could not load this vault review record.');
			return;
		}
		new VaultAutoRunModal(app, { mode: record.mode, initialSnapshot: snapshot }).open();
	});
}
