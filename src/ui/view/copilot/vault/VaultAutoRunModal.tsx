/**
 * VaultAutoRunModal — modal for the Vault-scope Auto Review flow.
 *
 * 6 tabs: Overview / Clusters / Gaps / Actions / Sources / Trace.
 * Visual reference: docs/superpowers/mockups/2026-05-22-vault-review-mockup.html
 * (report scenes). All styling uses shared Tailwind utility classes + shared
 * primitives (Tabs, Pill, Button) + Lucide icons; no per-modal CSS file is
 * required anymore.
 */

import { Modal, Notice, TFile, type App } from 'obsidian';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
	ShieldCheck,
	MoreHorizontal,
	X,
	BarChart3,
	FileText,
	Pen,
	Activity,
	Share2,
	User,
	Brain,
	Search,
	Palette,
	Briefcase,
	GitFork,
	Link as LinkIcon,
	Clock,
	Info,
	GripVertical,
	ArrowUp,
	ArrowDown,
	Minus,
	Plus,
	TrendingUp,
	Filter,
	FilePlus,
	Eye,
	Archive,
	ExternalLink,
	Download,
	Copy,
	Pin,
	Maximize2,
	Check,
	Database,
	Save,
	Puzzle,
	Hourglass,
	Circle,
	ChevronLeft,
	ChevronRight,
	Target,
	type LucideIcon,
} from 'lucide-react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { StreamdownIsolated } from '@/ui/component/mine';
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
import type { TraceArtifact } from '@/service/copilot/CopilotRunArtifacts';
import {
	listClusterMembers,
	type ClusterMember,
	type VaultClusterDigest,
} from '@/service/copilot/vault/VaultDigestService';
import { Tabs, TabsList, TabsTrigger } from '@/ui/component/shared-ui/tabs';
import { Pill } from '@/ui/component/shared-ui/pill';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';

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

function clusterDisplayName(c: VaultClusterDigest, observationLabel?: string): string {
	if (observationLabel) return observationLabel;
	const raw = c.label;
	const isRaw = /^Community\s+\d+$/i.test(raw) || /^c[_-]?\d+$/i.test(raw);
	if (!isRaw && raw) return raw;
	if (c.dominantTopics.length > 0) return c.dominantTopics.slice(0, 2).join(' · ');
	if (c.topNodes.length > 0) return basename(c.topNodes[0].path);
	return raw || 'Cluster';
}

async function openNote(path: string): Promise<void> {
	const app = AppContext.getInstance().app;
	const file = app.vault.getAbstractFileByPath(path);
	if (file instanceof TFile) {
		await app.workspace.getLeaf('tab').openFile(file);
		return;
	}
	app.workspace.openLinkText(path, '', true);
}

function splitHeadline(summary: string): { title: string; body: string } {
	const trimmed = summary.trim();
	const match = /^([^.。!?！？\n]+[.。!?！？])([\s\S]*)$/.exec(trimmed);
	if (match) return { title: match[1].trim(), body: match[2].trim() };
	return { title: trimmed, body: '' };
}

/* Pick a per-cluster icon + colour from the cluster label, so the table reads
 * visually instead of all-gray rows. Heuristic only — purely cosmetic. */
function clusterIconFor(name: string): { Icon: LucideIcon; toneClass: string } {
	const n = name.toLowerCase();
	if (/(ai|llm|agent|model|engineer|context)/.test(n))
		return { Icon: Brain, toneClass: 'pktw-bg-pk-accent-tint pktw-text-pk-accent' };
	if (/(search|retriev|index|embedding|rank)/.test(n))
		return { Icon: Search, toneClass: 'pktw-bg-cyan-100 dark:pktw-bg-cyan-900/30 pktw-text-cyan-700 dark:pktw-text-cyan-300' };
	if (/(design|ux|ui|product|component)/.test(n))
		return { Icon: Palette, toneClass: 'pktw-bg-orange-100 dark:pktw-bg-orange-900/30 pktw-text-orange-700 dark:pktw-text-orange-300' };
	if (/(personal|daily|note|reading|habit|life)/.test(n))
		return { Icon: User, toneClass: 'pktw-bg-pk-warning-bg pktw-text-pk-warning' };
	if (/(travel|trip|place|food)/.test(n))
		return { Icon: Briefcase, toneClass: 'pktw-bg-orange-100 dark:pktw-bg-orange-900/30 pktw-text-orange-700 dark:pktw-text-orange-300' };
	return { Icon: Share2, toneClass: 'pktw-bg-pk-indigo-bg pktw-text-pk-indigo-text' };
}

function confidenceOf(weight: number): 'high' | 'medium' | 'low' {
	if (weight >= 0.7) return 'high';
	if (weight >= 0.4) return 'medium';
	return 'low';
}

// ─── Main content component ────────────────────────────────────────────

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

	const copyTrace = async () => {
		if (!snapshot) return;
		const lines = trace.map(t => {
			const ts = t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : '';
			return `[${ts}] ${t.kind ?? 'step'} — ${t.label}\n  ${t.summary ?? t.detail ?? ''}`;
		}).join('\n');
		try {
			await navigator.clipboard.writeText(lines);
			new Notice('Trace copied to clipboard');
		} catch {
			new Notice('Could not copy trace');
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
	if (reportPath) subtitleParts.push('saved report ready');
	else if (isRunning) subtitleParts.push('running…');

	const tabCounts = {
		clusters: snapshot?.digest?.clusters.length,
		gaps: snapshot?.collectorSnapshot.gaps.length,
		actions: snapshot?.collectorSnapshot.actions.length,
		sources: snapshot?.collectorSnapshot.sources.length,
		trace: trace.length,
	};

	const showRail = activeTab !== 'trace' && activeTab !== 'sources';

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-bg-pk-surface pktw-overflow-hidden">

			{/* ─── Modal header ─── */}
			<div className="pktw-grid pktw-grid-cols-[auto_1fr_auto] pktw-gap-4 pktw-items-center pktw-px-7 pktw-py-5 pktw-pb-4">
				<div className="pktw-w-12 pktw-h-12 pktw-rounded-2xl pktw-bg-pk-accent-tint pktw-text-pk-accent pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
					<ShieldCheck className="pktw-w-7 pktw-h-7" strokeWidth={1.6} />
				</div>
				<div className="pktw-min-w-0">
					<h2 className="pktw-m-0 pktw-mb-1 pktw-text-[20px] pktw-font-bold pktw-text-pk-foreground pktw-leading-tight">
						{readOnly ? 'Vault Review · History' : 'Vault Review'}
						{snapshot && snapshot.rounds[0]?.startedAt && (
							<span className="pktw-text-pk-foreground-muted pktw-font-bold pktw-ml-1.5">
								· {new Date(snapshot.rounds[0].startedAt).toISOString().slice(0, 10)}
							</span>
						)}
					</h2>
					<div className="pktw-text-[12.5px] pktw-text-pk-foreground-muted pktw-flex pktw-flex-wrap pktw-items-center pktw-gap-2">
						{subtitleParts.map((p, i) => (
							<React.Fragment key={i}>
								{i > 0 && <span className="pktw-text-pk-foreground-faint">·</span>}
								<span>{p}</span>
							</React.Fragment>
						))}
					</div>
				</div>
				<div className="pktw-inline-flex pktw-items-center pktw-gap-1.5 pktw-text-pk-foreground-muted">
					{isRunning && <RunningStatus />}
					{!isRunning && status === 'completed' && reportPath && (
						<Pill variant="success" className="pktw-px-2.5"><span className="pktw-w-1.5 pktw-h-1.5 pktw-rounded-full pktw-bg-current pktw-mr-1" />Completed</Pill>
					)}
					{status === 'cancelled' && <Pill variant="warning">Cancelled</Pill>}
					{status === 'error' && <Pill variant="danger">Error</Pill>}
					<IconButton aria-label="More"><MoreHorizontal className="pktw-w-4 pktw-h-4" /></IconButton>
					<IconButton onClick={onClose} aria-label="Close"><X className="pktw-w-4 pktw-h-4" /></IconButton>
				</div>
			</div>

			{/* ─── Tab strip ─── */}
			<div className="pktw-px-7">
				<Tabs value={activeTab} onValueChange={v => setActiveTab(v as VaultTabId)} variant="underline">
					<TabsList>
						<TabsTrigger value="overview">Overview</TabsTrigger>
						<TabsTrigger value="clusters" count={tabCounts.clusters}>Clusters</TabsTrigger>
						<TabsTrigger value="gaps" count={tabCounts.gaps}>Gaps</TabsTrigger>
						<TabsTrigger value="actions" count={tabCounts.actions}>Actions</TabsTrigger>
						<TabsTrigger value="sources" count={tabCounts.sources}>Sources</TabsTrigger>
						<TabsTrigger value="trace" count={tabCounts.trace}>Trace</TabsTrigger>
					</TabsList>
				</Tabs>
			</div>

			{/* ─── Body ─── */}
			<div
				className={cn(
					'pktw-flex-1 pktw-overflow-y-auto pktw-px-7 pktw-py-5 pktw-grid pktw-gap-7',
					showRail && isRunning ? 'pktw-grid-cols-[minmax(0,1fr)_280px]' : 'pktw-grid-cols-1',
				)}
			>
				<div className="pktw-min-w-0">
					{activeTab === 'overview' && <OverviewPanel snapshot={snapshot} prevRecord={prevRecord} onJumpTab={setActiveTab} />}
					{activeTab === 'clusters' && <ClustersPanel snapshot={snapshot} />}
					{activeTab === 'gaps' && <GapsPanel snapshot={snapshot} />}
					{activeTab === 'actions' && <ActionsPanel snapshot={snapshot} />}
					{activeTab === 'sources' && <SourcesPanel snapshot={snapshot} />}
					{activeTab === 'trace' && <TracePanel snapshot={snapshot} trace={trace} traceSummary={traceSummary} />}
				</div>
				{showRail && isRunning && (
					<aside className="pktw-min-w-0">
						<AgentTraceRail trace={trace} summary={traceSummary} />
					</aside>
				)}
			</div>

			{/* ─── Footer ─── */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-3 pktw-px-7 pktw-py-3.5 pktw-border-t pktw-border-pk-border pktw-bg-pk-background-secondary">
				<div className="pktw-inline-flex pktw-items-center pktw-gap-2 pktw-text-pk-foreground-muted pktw-text-[12px] pktw-min-w-0">
					{activeTab === 'trace' ? (
						<>
							<span className="pktw-w-7 pktw-h-7 pktw-rounded-full pktw-bg-pk-background-secondary pktw-text-pk-accent pktw-flex pktw-items-center pktw-justify-center">
								<ShieldCheck className="pktw-w-4 pktw-h-4" />
							</span>
							<div className="pktw-min-w-0">
								<div className="pktw-text-pk-foreground pktw-font-semibold">No vault changes applied.</div>
								<div>Trace is read-only and for review purposes only.</div>
							</div>
						</>
					) : (
						<>
							<FileText className="pktw-w-4 pktw-h-4 pktw-text-pk-foreground-faint pktw-shrink-0" />
							<span className="pktw-truncate">
								{reportPath ? <>Saved to <span className="pktw-font-mono">{reportPath}</span></> : 'No report saved yet'}
							</span>
						</>
					)}
				</div>
				<div className="pktw-inline-flex pktw-items-center pktw-gap-2">
					{isRunning && <Button variant="outline" onClick={cancelRun}>Cancel run</Button>}
					<Button variant="outline" disabled={!reportPath} onClick={openReport}>
						<ExternalLink className="pktw-w-4 pktw-h-4" />Open report note
					</Button>
					{activeTab === 'trace' ? (
						<Button variant="outline" disabled={!snapshot} onClick={copyTrace}>
							<Copy className="pktw-w-4 pktw-h-4" />Copy trace
						</Button>
					) : (
						<Button variant="outline" disabled={!snapshot} onClick={exportSummary}>
							<Download className="pktw-w-4 pktw-h-4" />Export summary
						</Button>
					)}
					<Button onClick={onClose}>Close</Button>
				</div>
			</div>
		</div>
	);
};

// ─── Reusable small components ──────────────────────────────────────────

function IconButton({ children, onClick, 'aria-label': label }: { children: React.ReactNode; onClick?: () => void; 'aria-label'?: string }) {
	return (
		<button
			type="button"
			aria-label={label}
			onClick={onClick}
			className="pktw-w-8 pktw-h-8 pktw-rounded-lg pktw-border-0 pktw-bg-transparent pktw-text-pk-foreground-muted pktw-flex pktw-items-center pktw-justify-center pktw-cursor-pointer hover:pktw-bg-pk-background-secondary hover:pktw-text-pk-foreground"
		>
			{children}
		</button>
	);
}

function RunningStatus() {
	return (
		<span className="pktw-inline-flex pktw-items-center pktw-gap-1.5 pktw-text-[11.5px] pktw-font-semibold pktw-text-pk-success-text">
			<span className="pktw-w-1.5 pktw-h-1.5 pktw-rounded-full pktw-bg-pk-success" />
			Running
		</span>
	);
}

function SectionLabel({ children, sub }: { children: React.ReactNode; sub?: string }) {
	return (
		<div className="pktw-text-[14px] pktw-font-semibold pktw-text-pk-foreground pktw-mt-6 pktw-mb-2.5">
			{children}
			{sub ? <span className="pktw-ml-2 pktw-text-[12px] pktw-font-medium pktw-text-pk-foreground-muted">{sub}</span> : null}
		</div>
	);
}

function ModalBreadcrumb({ items }: { items: Array<{ label: string; onClick?: () => void }> }) {
	return (
		<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-text-[12px] pktw-text-pk-foreground-muted">
			{items.map((it, i) => (
				<React.Fragment key={i}>
					{i > 0 && <ChevronRight className="pktw-w-3 pktw-h-3 pktw-text-pk-foreground-faint" />}
					{it.onClick ? (
						<button onClick={it.onClick} className="pktw-bg-transparent pktw-border-0 pktw-p-0 pktw-text-pk-info pktw-font-medium pktw-cursor-pointer hover:pktw-underline">
							{it.label}
						</button>
					) : (
						<span>{it.label}</span>
					)}
				</React.Fragment>
			))}
		</div>
	);
}

// ─── Agent trace right-rail ─────────────────────────────────────────────

/**
 * Convenience aliases: TraceArtifact uses `label` + `summary`/`detail`. The new
 * UI reads `title`/`description` so adapt at the boundary.
 */
function traceTitle(t: TraceArtifact): string {
	return t.label;
}
function traceDescription(t: TraceArtifact): string {
	return t.summary ?? t.detail ?? '';
}

function AgentTraceRail({ trace, summary }: { trace: TraceArtifact[]; summary?: { totalMs: number; roundCount: number; turnCount: number; finished: boolean } }) {
	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-3.5">
			<div className="pktw-flex pktw-items-center pktw-justify-between">
				<div className="pktw-text-[14px] pktw-font-semibold pktw-text-pk-foreground">
					Agent trace <span className="pktw-ml-1 pktw-text-[12px] pktw-font-medium pktw-text-pk-foreground-muted">(live)</span>
				</div>
				<RunningStatus />
			</div>

			<div className="pktw-relative pktw-flex pktw-flex-col pktw-gap-4">
				{/* connector line */}
				<span
					className="pktw-absolute pktw-left-[63px] pktw-top-3 pktw-bottom-3 pktw-w-px pktw-bg-pk-border"
					aria-hidden
				/>
				{trace.map((t, i) => {
					const isLast = i === trace.length - 1;
					const isInProgress = isLast && !summary?.finished;
					const desc = traceDescription(t);
					return (
						<div key={t.id ?? i} className="pktw-grid pktw-grid-cols-[52px_22px_minmax(0,1fr)] pktw-gap-2 pktw-items-start">
							<span className="pktw-text-[11px] pktw-text-pk-foreground-faint pktw-tabular-nums pktw-pt-0.5 pktw-text-right pktw-pr-2">
								{t.timestamp ? new Date(t.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
							</span>
							<span
								className={cn(
									'pktw-w-[22px] pktw-h-[22px] pktw-rounded-full pktw-border-[3px] pktw-border-pk-surface pktw-flex pktw-items-center pktw-justify-center pktw-z-10',
									isInProgress
										? 'pktw-bg-pk-accent-tint pktw-text-pk-accent'
										: 'pktw-bg-pk-success-bg pktw-text-pk-success',
								)}
							>
								{isInProgress ? <Save className="pktw-w-3 pktw-h-3" strokeWidth={2.5} /> : <Check className="pktw-w-3 pktw-h-3" strokeWidth={3} />}
							</span>
							<div className="pktw-min-w-0">
								<div className="pktw-text-[13px] pktw-font-semibold pktw-text-pk-foreground">{traceTitle(t)}</div>
								{desc && (
									<div className="pktw-text-[11.5px] pktw-text-pk-foreground-muted pktw-leading-snug pktw-mt-0.5 pktw-whitespace-pre-line">
										{desc}
									</div>
								)}
							</div>
						</div>
					);
				})}
				{trace.length === 0 && (
					<div className="pktw-text-[12px] pktw-text-pk-foreground-muted pktw-italic">Trace will appear as the agent runs.</div>
				)}
			</div>
		</div>
	);
}

// ─── Overview panel ─────────────────────────────────────────────────────

const OverviewPanel: React.FC<{
	snapshot: VaultReviewSessionSnapshot | null;
	prevRecord: VaultReviewHistoryRecord | null;
	onJumpTab: (tab: VaultTabId) => void;
}> = ({ snapshot, prevRecord, onJumpTab }) => {
	if (!snapshot) return <Empty label="Building pre-flight vault digest…" />;

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
	const touched = Math.abs(notesDelta);
	const newCount = Math.max(0, notesDelta);
	const deletedCount = Math.max(0, -notesDelta);

	return (
		<>
			{/* Insight card */}
			{headlineTitle && (
				<div className="pktw-grid pktw-grid-cols-[auto_1fr] pktw-gap-[18px] pktw-px-[22px] pktw-py-5 pktw-bg-pk-accent-tint pktw-rounded-2xl pktw-mb-[22px]">
					<div className="pktw-w-12 pktw-h-12 pktw-rounded-xl pktw-bg-pk-surface pktw-text-pk-accent pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
						<BarChart3 className="pktw-w-[22px] pktw-h-[22px]" />
					</div>
					<div>
						<div className="pktw-text-[18px] pktw-font-bold pktw-text-pk-foreground pktw-mt-1 pktw-mb-2.5 pktw-leading-tight">{headlineTitle}</div>
						{headlineBody && (
							<div className="pktw-text-[13px] pktw-leading-relaxed pktw-text-pk-foreground">
								<StreamdownIsolated>{headlineBody}</StreamdownIsolated>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Snapshot */}
			{counts && (
				<>
					<SectionLabel>Snapshot</SectionLabel>
					<div className="pktw-grid pktw-grid-cols-3 pktw-gap-2.5">
						<SnapshotCard Icon={FileText} tone="indigo" label="Notes" value={formatNumber(counts.notes)} sub="Total in vault" />
						<SnapshotCard Icon={Pen} tone="accent" label="Words" value={formatNumber(counts.words)} sub="Total in vault" />
						<SnapshotCard Icon={Activity} tone="success" label="Health" value={health ? health.score.toFixed(1) : '—'} valueSuffix={health ? '/10' : undefined} sub="Vault health score" />
						<SnapshotCard Icon={Share2} tone="accent" label="Active clusters" value={String(counts.clusters)} sub="With recent activity" />
						<SnapshotCard Icon={Share2} tone="accent" label="Hubs" value={String(counts.hubs)} sub="High centrality notes" />
						<SnapshotCard Icon={User} tone="orange" label="Orphans" value={String(counts.orphans)} sub="Low or no links" />
					</div>
				</>
			)}

			{/* What changed */}
			{showDelta && counts && (
				<>
					<SectionLabel sub={`since last review (${prevRecord ? relativeAge(prevRecord.completedAt) : 'unknown'})`}>
						What changed
					</SectionLabel>
					<div className="pktw-grid pktw-grid-cols-4 pktw-gap-2.5">
						<ChangedChip badge="touched" value={touched} label="Touched notes" />
						<ChangedChip badge="new" value={newCount} label="New notes" />
						<ChangedChip badge="deleted" value={deletedCount} label="Deleted note" />
						<ChangedChip badge="trend" value={wordsDeltaPct ?? 0} label="Activity change" formatPercent />
					</div>
				</>
			)}

			{/* Top recommended action */}
			{topAction && (
				<>
					<SectionLabel>Top recommended next action</SectionLabel>
					<div className="pktw-grid pktw-grid-cols-[auto_1fr_auto] pktw-gap-3.5 pktw-items-center pktw-px-[18px] pktw-py-3.5 pktw-bg-pk-accent-tint pktw-border pktw-border-pk-accent-soft pktw-rounded-2xl">
						<div className="pktw-w-9 pktw-h-9 pktw-rounded-[10px] pktw-bg-pk-surface pktw-text-pk-accent pktw-flex pktw-items-center pktw-justify-center">
							<Target className="pktw-w-[18px] pktw-h-[18px]" />
						</div>
						<div>
							<div className="pktw-text-[13.5px] pktw-text-pk-foreground pktw-leading-snug">
								<span className="pktw-font-semibold pktw-uppercase pktw-text-[11px] pktw-tracking-wide pktw-text-pk-accent-text pktw-mr-2">{topAction.priority}</span>
								{topAction.title}
							</div>
							{topAction.estimatedImpact && (
								<div className="pktw-text-[11.5px] pktw-text-pk-foreground-muted pktw-mt-0.5">Impact · {topAction.estimatedImpact}</div>
							)}
						</div>
						<Button variant="outline" onClick={() => onJumpTab('actions')}>View in Actions</Button>
					</div>
				</>
			)}

			{!headlineTitle && !topAction && snapshot.status === 'running' && (
				<Empty label="Agent is exploring the vault. Findings appear here as they arrive." />
			)}
		</>
	);
};

function relativeAge(ts: number): string {
	const diff = Date.now() - ts;
	const d = Math.floor(diff / 86_400_000);
	if (d <= 0) return 'today';
	if (d === 1) return 'yesterday';
	if (d < 30) return `${d} days ago`;
	const m = Math.floor(d / 30);
	if (m === 1) return '1 month ago';
	return `${m} months ago`;
}

function SnapshotCard({ Icon, tone, label, value, valueSuffix, sub }: {
	Icon: LucideIcon;
	tone: 'accent' | 'indigo' | 'success' | 'orange';
	label: string;
	value: string;
	valueSuffix?: string;
	sub: string;
}) {
	const toneClass = (() => {
		switch (tone) {
			case 'indigo': return 'pktw-bg-pk-indigo-bg pktw-text-pk-indigo-text';
			case 'success': return 'pktw-bg-pk-success-bg pktw-text-pk-success';
			case 'orange': return 'pktw-bg-orange-100 dark:pktw-bg-orange-900/30 pktw-text-orange-700 dark:pktw-text-orange-300';
			default: return 'pktw-bg-pk-accent-tint pktw-text-pk-accent';
		}
	})();
	return (
		<div className="pktw-grid pktw-grid-cols-[auto_1fr] pktw-gap-2.5 pktw-items-start pktw-px-4 pktw-py-3.5 pktw-bg-pk-surface pktw-border pktw-border-pk-border-soft pktw-rounded-[10px]">
			<span className={cn('pktw-w-8 pktw-h-8 pktw-rounded-[9px] pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0', toneClass)}>
				<Icon className="pktw-w-4 pktw-h-4" />
			</span>
			<div>
				<div className="pktw-text-[12px] pktw-text-pk-foreground-muted pktw-font-medium">{label}</div>
				<div className="pktw-text-[22px] pktw-font-bold pktw-text-pk-foreground pktw-tabular-nums pktw-leading-tight">
					{value}
					{valueSuffix ? <span className="pktw-text-[14px] pktw-font-medium pktw-text-pk-foreground-faint">{valueSuffix}</span> : null}
				</div>
				<div className="pktw-text-[11.5px] pktw-text-pk-foreground-muted">{sub}</div>
			</div>
		</div>
	);
}

function ChangedChip({ badge, value, label, formatPercent }: {
	badge: 'touched' | 'new' | 'deleted' | 'trend';
	value: number;
	label: string;
	formatPercent?: boolean;
}) {
	const isUp = value >= 0;
	const valueClass = badge === 'deleted' || (!isUp && formatPercent)
		? 'pktw-text-pk-error-text'
		: badge === 'new' || badge === 'trend'
			? 'pktw-text-pk-success-text'
			: 'pktw-text-pk-foreground';
	const display = formatPercent
		? `${isUp ? '+' : ''}${value.toFixed(0)}%`
		: value.toString();
	return (
		<div className="pktw-grid pktw-grid-cols-[auto_1fr] pktw-gap-2.5 pktw-items-center pktw-px-3.5 pktw-py-3 pktw-bg-pk-surface pktw-border pktw-border-pk-border-soft pktw-rounded-[10px]">
			<ChangedBadge badge={badge} />
			<div>
				<div className={cn('pktw-text-[16px] pktw-font-bold pktw-tabular-nums', valueClass)}>{display}</div>
				<div className="pktw-text-[11.5px] pktw-text-pk-foreground-muted">{label}</div>
			</div>
		</div>
	);
}

function ChangedBadge({ badge }: { badge: 'touched' | 'new' | 'deleted' | 'trend' }) {
	if (badge === 'touched') {
		return <span className="pktw-w-[26px] pktw-h-[26px] pktw-rounded-full pktw-bg-pk-success-bg pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0"><span className="pktw-w-2.5 pktw-h-2.5 pktw-rounded-full pktw-bg-pk-success" /></span>;
	}
	if (badge === 'new') {
		return <span className="pktw-w-[26px] pktw-h-[26px] pktw-rounded-full pktw-bg-pk-success-bg pktw-text-pk-success pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0"><Plus className="pktw-w-3 pktw-h-3" strokeWidth={2.5} /></span>;
	}
	if (badge === 'deleted') {
		return <span className="pktw-w-[26px] pktw-h-[26px] pktw-rounded-full pktw-bg-pk-error-bg pktw-text-pk-error pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0"><Minus className="pktw-w-3 pktw-h-3" strokeWidth={2.5} /></span>;
	}
	return <span className="pktw-w-[26px] pktw-h-[26px] pktw-rounded-full pktw-bg-pk-success-bg pktw-text-pk-success pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0"><TrendingUp className="pktw-w-3 pktw-h-3" strokeWidth={2.5} /></span>;
}

function Empty({ label }: { label: string }) {
	return (
		<div className="pktw-px-6 pktw-py-12 pktw-text-center pktw-text-pk-foreground-muted pktw-bg-pk-background-secondary pktw-border pktw-border-dashed pktw-border-pk-border pktw-rounded-2xl">
			{label}
		</div>
	);
}

// ─── Clusters panel ─────────────────────────────────────────────────────

const ClustersPanel: React.FC<{ snapshot: VaultReviewSessionSnapshot | null }> = ({ snapshot }) => {
	const observations = snapshot?.collectorSnapshot.clusterObservations ?? [];
	const digestClusters = snapshot?.digest?.clusters ?? [];
	const obsById = useMemo(() => new Map(observations.map(o => [o.clusterId, o])), [observations]);
	const [selectedId, setSelectedId] = useState<string | null>(digestClusters[0]?.id ?? null);
	const [members, setMembers] = useState<ClusterMember[]>([]);
	const [membersLoading, setMembersLoading] = useState(false);

	useEffect(() => {
		if (digestClusters.length === 0) { setSelectedId(null); return; }
		if (!selectedId || !digestClusters.find(c => c.id === selectedId)) setSelectedId(digestClusters[0].id);
	}, [digestClusters, selectedId]);

	useEffect(() => {
		if (!selectedId) { setMembers([]); return; }
		let cancelled = false;
		setMembersLoading(true);
		listClusterMembers(selectedId, 30).then(rows => {
			if (!cancelled) { setMembers(rows); setMembersLoading(false); }
		}).catch(() => {
			if (!cancelled) { setMembers([]); setMembersLoading(false); }
		});
		return () => { cancelled = true; };
	}, [selectedId]);

	if (digestClusters.length === 0) {
		return <Empty label="No cluster data available. Vault community detection may still be initialising." />;
	}

	const dormantSet = new Set(snapshot?.digest?.recentActivity.dormantClusters ?? []);
	const selectedCluster = digestClusters.find(c => c.id === selectedId);
	const selectedObs = selectedId ? obsById.get(selectedId) : undefined;
	const selectedDisplay = selectedCluster ? clusterDisplayName(selectedCluster, selectedObs?.clusterLabel) : '';
	const selectedIcon = selectedCluster ? clusterIconFor(selectedDisplay) : null;

	const totalNotes = snapshot?.digest?.counts?.notes ?? 0;
	const sortedClusters = digestClusters.slice().sort((a, b) => b.memberCount - a.memberCount);

	return (
		<>
			<ModalBreadcrumb items={[{ label: 'Vault' }, { label: 'Clusters' }]} />
			<h3 className="pktw-text-[17px] pktw-font-bold pktw-text-pk-foreground pktw-mt-1 pktw-mb-4">Cluster activity</h3>

			<div className="pktw-bg-pk-surface pktw-border pktw-border-pk-border-soft pktw-rounded-2xl pktw-overflow-hidden">
				<div className="pktw-grid pktw-grid-cols-[2.3fr_0.7fr_0.8fr_0.9fr_2fr_24px] pktw-gap-3.5 pktw-px-[18px] pktw-py-2.5 pktw-bg-pk-background-secondary pktw-border-b pktw-border-pk-border-soft pktw-text-[11.5px] pktw-text-pk-foreground-muted pktw-font-semibold">
					<div>Cluster</div>
					<div>Size (notes)</div>
					<div>Change (14d)</div>
					<div>Status</div>
					<div>Representative notes</div>
					<div></div>
				</div>
				{sortedClusters.map(c => {
					const display = clusterDisplayName(c, obsById.get(c.id)?.clusterLabel);
					const obs = obsById.get(c.id);
					const isSelected = c.id === selectedId;
					const { Icon, toneClass } = clusterIconFor(display);
					const pct = totalNotes > 0 ? Math.round((c.memberCount / totalNotes) * 100) : 0;
					const statusInfo = (() => {
						if (obs?.status === 'growing') return { label: 'Central', sub: 'High centrality', variant: 'success' as const };
						if (obs?.status === 'dying' || obs?.status === 'fragmenting' || dormantSet.has(c.label)) return { label: 'Stale', sub: 'Low activity', variant: 'warning' as const };
						return { label: 'Stable', sub: 'Healthy', variant: 'success' as const };
					})();
					return (
						<button
							key={c.id}
							id={`vault-cluster-${c.id}`}
							onClick={() => setSelectedId(c.id)}
							className={cn(
								'pktw-w-full pktw-grid pktw-grid-cols-[2.3fr_0.7fr_0.8fr_0.9fr_2fr_24px] pktw-gap-3.5 pktw-px-[18px] pktw-py-3.5 pktw-items-center pktw-border-b pktw-border-pk-border-soft pktw-text-left pktw-bg-transparent pktw-border-x-0 pktw-border-t-0 pktw-cursor-pointer last:pktw-border-b-0',
								isSelected ? 'pktw-bg-pk-accent-tint pktw-shadow-[inset_0_0_0_2px_var(--pk-accent-soft)] pktw-relative pktw-z-[1]' : 'hover:pktw-bg-pk-background-secondary',
							)}
						>
							<div className="pktw-grid pktw-grid-cols-[auto_1fr] pktw-gap-3 pktw-items-center pktw-min-w-0">
								<span className={cn('pktw-w-[38px] pktw-h-[38px] pktw-rounded-[10px] pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0', toneClass)}>
									<Icon className="pktw-w-5 pktw-h-5" />
								</span>
								<div className="pktw-min-w-0">
									<div className="pktw-text-[13.5px] pktw-font-semibold pktw-text-pk-foreground pktw-truncate">{display}</div>
									<div className="pktw-text-[11.5px] pktw-text-pk-foreground-muted pktw-leading-snug pktw-line-clamp-2">
										{c.dominantTopics.slice(0, 4).join(', ') || 'No dominant topics detected'}
									</div>
								</div>
							</div>
							<div>
								<div className="pktw-text-[14px] pktw-font-semibold pktw-tabular-nums pktw-text-pk-foreground">{c.memberCount}</div>
								<div className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-tabular-nums">({pct}%)</div>
							</div>
							<div>
								<div className="pktw-text-[14px] pktw-font-semibold pktw-tabular-nums pktw-text-pk-foreground-muted pktw-inline-flex pktw-items-center pktw-gap-1">
									<Minus className="pktw-w-3 pktw-h-3" />
									—
								</div>
								<div className="pktw-text-[11px] pktw-text-pk-foreground-muted">No 14d data</div>
							</div>
							<div>
								<Pill variant={statusInfo.variant} className="pktw-mb-1">{statusInfo.label}</Pill>
								<div className="pktw-text-[11px] pktw-text-pk-foreground-muted">{statusInfo.sub}</div>
							</div>
							<div className="pktw-text-[12px] pktw-leading-relaxed pktw-text-pk-foreground pktw-overflow-hidden">
								{c.topNodes.slice(0, 3).map((n, i) => (
									<React.Fragment key={n.path}>
										{i > 0 && ' '}
										<span className="pktw-text-pk-info">[[{n.label || basename(n.path)}]]</span>
									</React.Fragment>
								))}
								{c.memberCount > 3 && <div className="pktw-text-[11.5px] pktw-text-pk-foreground-muted">+{c.memberCount - 3} more</div>}
							</div>
							<ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-foreground-faint" />
						</button>
					);
				})}
			</div>

			{/* Expanded detail card */}
			{selectedCluster && selectedIcon && (
				<div className="pktw-bg-pk-surface pktw-border pktw-border-pk-border-soft pktw-rounded-2xl pktw-px-5 pktw-py-[18px] pktw-mt-3.5">
					<div className="pktw-grid pktw-grid-cols-[1.4fr_1.2fr_1.1fr_0.9fr] pktw-gap-5 pktw-items-start">
						<div className="pktw-grid pktw-grid-cols-[auto_1fr] pktw-gap-3 pktw-items-start">
							<span className={cn('pktw-w-10 pktw-h-10 pktw-rounded-[10px] pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0', selectedIcon.toneClass)}>
								<selectedIcon.Icon className="pktw-w-5 pktw-h-5" />
							</span>
							<div>
								<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-[14px] pktw-font-bold pktw-text-pk-foreground pktw-mb-1">
									{selectedDisplay}
									<Pill variant="success">Central</Pill>
								</div>
								<div className="pktw-text-[11.5px] pktw-text-pk-foreground-muted pktw-leading-snug">
									{selectedCluster.dominantTopics.slice(0, 3).join(', ') || 'No dominant topics'}
								</div>
								<div className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-mt-1.5">
									{selectedCluster.memberCount} notes · density {selectedCluster.internalDensity.toFixed(2)}
								</div>
							</div>
						</div>
						<div>
							<DetailLabel>Dominant topics</DetailLabel>
							<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5">
								{selectedCluster.dominantTopics.length > 0
									? selectedCluster.dominantTopics.slice(0, 6).map(t => (
										<span key={t} className="pktw-px-2.5 pktw-py-0.5 pktw-rounded-full pktw-bg-pk-accent-tint pktw-text-pk-accent-text pktw-text-[11.5px] pktw-font-medium">{t}</span>
									))
									: <span className="pktw-text-[12px] pktw-text-pk-foreground-muted">—</span>}
							</div>
						</div>
						<div>
							<DetailLabel>Top hubs</DetailLabel>
							<div className="pktw-flex pktw-flex-col pktw-gap-1.5 pktw-text-[12px]">
								{selectedCluster.topNodes.slice(0, 4).map(n => (
									<button
										key={n.path}
										type="button"
										onClick={() => void openNote(n.path)}
										className="pktw-flex pktw-items-center pktw-justify-between pktw-bg-transparent pktw-border-0 pktw-p-0 pktw-text-left pktw-cursor-pointer hover:pktw-underline"
									>
										<span className="pktw-text-pk-info pktw-truncate">[[{n.label || basename(n.path)}]]</span>
									</button>
								))}
								{selectedCluster.topNodes.length > 4 && (
									<span className="pktw-text-[11.5px] pktw-text-pk-foreground-muted">+{selectedCluster.topNodes.length - 4} more</span>
								)}
							</div>
						</div>
						<div>
							<DetailLabel>Cluster health</DetailLabel>
							<div className="pktw-flex pktw-flex-col pktw-gap-1.5 pktw-text-[12px]">
								<div className="pktw-flex pktw-justify-between"><span className="pktw-text-pk-foreground-muted">Density</span><span className="pktw-font-medium">{selectedCluster.internalDensity.toFixed(2)}</span></div>
								<div className="pktw-flex pktw-justify-between"><span className="pktw-text-pk-foreground-muted">Members</span><span className="pktw-font-medium">{selectedCluster.memberCount}</span></div>
								<div className="pktw-flex pktw-justify-between"><span className="pktw-text-pk-foreground-muted">Hubs</span><span className="pktw-font-medium">{selectedCluster.topNodes.length}</span></div>
								<div className="pktw-flex pktw-justify-between"><span className="pktw-text-pk-foreground-muted">Status</span><span className="pktw-font-medium pktw-text-pk-success-text">Active</span></div>
							</div>
						</div>
					</div>

					{selectedObs?.body && (
						<div className="pktw-mt-3.5 pktw-pt-3.5 pktw-border-t pktw-border-pk-border-soft">
							<StreamdownIsolated className="pktw-text-[12.5px]">{selectedObs.body}</StreamdownIsolated>
						</div>
					)}

					<div className="pktw-flex pktw-items-center pktw-justify-between pktw-pt-3.5 pktw-mt-3.5 pktw-border-t pktw-border-pk-border-soft pktw-gap-3.5">
						<span className="pktw-text-[12px] pktw-text-pk-foreground-muted pktw-font-medium">Representative notes</span>
						<div className="pktw-flex-1 pktw-flex pktw-flex-wrap pktw-gap-2.5 pktw-text-[12px] pktw-min-w-0">
							{(membersLoading ? [] : members).slice(0, 6).map((m, i, arr) => (
								<React.Fragment key={m.path}>
									<button
										onClick={() => void openNote(m.path)}
										className="pktw-text-pk-info pktw-bg-transparent pktw-border-0 pktw-p-0 pktw-cursor-pointer pktw-truncate hover:pktw-underline"
									>
										[[{m.title?.trim() || basename(m.path)}]]
									</button>
									{i < arr.length - 1 && <span className="pktw-text-pk-foreground-faint">·</span>}
								</React.Fragment>
							))}
							{!membersLoading && members.length === 0 && <span className="pktw-text-pk-foreground-muted">No member data available</span>}
						</div>
						{members.length > 6 && (
							<Button variant="outline" size="sm">
								<ExternalLink className="pktw-w-3.5 pktw-h-3.5" />View all {members.length} notes
							</Button>
						)}
					</div>
				</div>
			)}
		</>
	);
};

function DetailLabel({ children }: { children: React.ReactNode }) {
	return <div className="pktw-text-[10.5px] pktw-text-pk-foreground-muted pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-mb-2">{children}</div>;
}

// ─── Gaps panel ─────────────────────────────────────────────────────────

const GapsPanel: React.FC<{ snapshot: VaultReviewSessionSnapshot | null }> = ({ snapshot }) => {
	const gaps = snapshot?.collectorSnapshot.gaps ?? [];
	if (gaps.length === 0) return <Empty label="No gaps reported yet." />;

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

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-3.5">
			{structuralHoles.map(g => <StructuralHoleCard key={g.id} gap={g} />)}
			{dangling.length > 0 && <DanglingRefsCard gaps={dangling} />}
			{stale.length > 0 && <StaleHubsCard gaps={stale} />}
			{abstraction.map(g => <GenericGapCard key={g.id} gap={g} title="Abstraction mismatch" Icon={GitFork} />)}
		</div>
	);
};

function confidencePct(c: 'low' | 'medium' | 'high'): { pct: number; class: string } {
	const map = {
		high:   { pct: 75, class: 'pktw-text-pk-success-text' },
		medium: { pct: 60, class: 'pktw-text-pk-warning-text' },
		low:    { pct: 40, class: 'pktw-text-pk-error-text' },
	};
	return map[c];
}

function GapCardHeader({ Icon, headline, title, confidence, source }: {
	Icon: LucideIcon;
	headline?: string;
	title: string;
	confidence: 'low' | 'medium' | 'high';
	source: string;
}) {
	const conf = confidencePct(confidence);
	return (
		<div className="pktw-grid pktw-grid-cols-[auto_1fr_auto_auto] pktw-gap-4 pktw-items-start pktw-mb-3.5">
			<div className="pktw-w-10 pktw-h-10 pktw-rounded-[10px] pktw-bg-pk-accent-tint pktw-text-pk-accent pktw-flex pktw-items-center pktw-justify-center pktw-shrink-0">
				<Icon className="pktw-w-5 pktw-h-5" />
			</div>
			<div>
				{headline && <div className="pktw-text-[12.5px] pktw-text-pk-foreground-muted pktw-font-medium pktw-mt-1 pktw-mb-0.5">{headline}</div>}
				<div className="pktw-text-[16px] pktw-font-bold pktw-text-pk-foreground pktw-leading-tight">{title}</div>
			</div>
			<div className="pktw-text-right pktw-min-w-[70px] pktw-self-center">
				<div className="pktw-text-[10.5px] pktw-text-pk-foreground-muted pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-mb-1">Confidence</div>
				<div className={cn('pktw-text-[14px] pktw-font-bold pktw-tabular-nums', conf.class)}>{conf.pct}%</div>
			</div>
			<div className="pktw-text-right pktw-min-w-[80px] pktw-self-center">
				<div className="pktw-text-[10.5px] pktw-text-pk-foreground-muted pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-mb-1">Source</div>
				<button className="pktw-text-[12.5px] pktw-text-pk-info pktw-font-semibold pktw-bg-transparent pktw-border-0 pktw-p-0 pktw-cursor-pointer hover:pktw-underline">{source}</button>
			</div>
		</div>
	);
}

function StructuralHoleCard({ gap }: { gap: { id: string; title: string; body: string; confidence: 'low' | 'medium' | 'high'; references: string[] } }) {
	return (
		<div id={`vault-gap-${gap.id}`} className="pktw-bg-pk-surface pktw-border pktw-border-pk-border-soft pktw-rounded-2xl pktw-px-5 pktw-py-[18px]">
			<GapCardHeader Icon={GitFork} headline="Structural holes" title={gap.title} confidence={gap.confidence} source="Graph analysis" />
			<div className="pktw-text-[13px] pktw-text-pk-foreground-muted pktw-leading-relaxed pktw-mb-3.5">
				<StreamdownIsolated>{gap.body}</StreamdownIsolated>
			</div>
			<div className="pktw-grid pktw-grid-cols-[auto_1fr_auto_auto] pktw-gap-3 pktw-items-center pktw-mb-[18px]">
				<span className="pktw-text-[12px] pktw-text-pk-foreground-muted pktw-font-medium">Bridge score</span>
				<div className="pktw-h-1.5 pktw-bg-pk-surface-sunken pktw-rounded-full pktw-overflow-hidden">
					<div className="pktw-h-full pktw-bg-pk-accent pktw-rounded-full" style={{ width: '28%' }} />
				</div>
				<span className="pktw-text-[12.5px] pktw-text-pk-foreground pktw-font-semibold pktw-tabular-nums">28 / 100</span>
				<Pill variant="accent">Weak</Pill>
			</div>
			{gap.references.length > 0 && (
				<div className="pktw-grid pktw-grid-cols-2 pktw-gap-5">
					<div>
						<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-text-[12.5px] pktw-font-semibold pktw-text-pk-foreground pktw-mb-2">
							<Circle className="pktw-w-3 pktw-h-3 pktw-text-pk-foreground-faint" fill="currentColor" />
							Candidate bridge notes
						</div>
						<ul className="pktw-m-0 pktw-mb-2.5 pktw-pl-4 pktw-text-[12.5px] pktw-text-pk-foreground pktw-leading-loose">
							{gap.references.slice(0, 4).map(r => {
								const cleaned = r.replace(/^\[\[|\]\]$/g, '');
								return (
									<li key={r}>
										<button onClick={() => void openNote(cleaned)} className="pktw-text-pk-info pktw-bg-transparent pktw-border-0 pktw-p-0 pktw-cursor-pointer hover:pktw-underline">
											[[{cleaned}]]
										</button>
									</li>
								);
							})}
						</ul>
						<Button variant="outline" size="sm">View candidates</Button>
					</div>
					<div>
						<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-text-[12.5px] pktw-font-semibold pktw-text-pk-foreground pktw-mb-2">
							<Circle className="pktw-w-3 pktw-h-3 pktw-text-pk-foreground-faint" fill="currentColor" />
							Candidate questions
						</div>
						<ul className="pktw-m-0 pktw-mb-2.5 pktw-pl-4 pktw-text-[12.5px] pktw-text-pk-foreground-muted pktw-leading-loose">
							<li>Bridging question (auto-generated by agent)</li>
							<li>Topic alignment</li>
						</ul>
						<Button variant="outline" size="sm"><Plus className="pktw-w-3.5 pktw-h-3.5" />Add question</Button>
					</div>
				</div>
			)}
		</div>
	);
}

function DanglingRefsCard({ gaps }: { gaps: Array<{ id: string; title: string; body: string; confidence: 'low' | 'medium' | 'high'; references: string[] }> }) {
	return (
		<div className="pktw-bg-pk-surface pktw-border pktw-border-pk-border-soft pktw-rounded-2xl pktw-px-5 pktw-py-[18px]">
			<GapCardHeader
				Icon={LinkIcon}
				title="Dangling references"
				confidence={gaps[0]?.confidence ?? 'medium'}
				source="Reference scan"
			/>
			<div className="pktw-text-[13px] pktw-text-pk-foreground-muted pktw-mb-3.5">Notes that are referenced but under-documented.</div>
			<table className="pktw-w-full pktw-border-collapse">
				<thead>
					<tr>
						<th className="pktw-text-left pktw-text-[11px] pktw-text-pk-foreground-muted pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-py-2 pktw-px-3 pktw-border-b pktw-border-pk-border-soft">Note</th>
						<th className="pktw-text-left pktw-text-[11px] pktw-text-pk-foreground-muted pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-py-2 pktw-px-3 pktw-border-b pktw-border-pk-border-soft">Cited by</th>
						<th className="pktw-text-left pktw-text-[11px] pktw-text-pk-foreground-muted pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-py-2 pktw-px-3 pktw-border-b pktw-border-pk-border-soft">Why it matters</th>
						<th className="pktw-text-right pktw-text-[11px] pktw-text-pk-foreground-muted pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-py-2 pktw-px-3 pktw-border-b pktw-border-pk-border-soft">Action</th>
					</tr>
				</thead>
				<tbody>
					{gaps.slice(0, 6).map(g => {
						const refCount = g.references.length;
						return (
							<tr key={g.id} id={`vault-gap-${g.id}`} className="last:[&_td]:pktw-border-b-0">
								<td className="pktw-py-2.5 pktw-px-3 pktw-border-b pktw-border-pk-border-soft pktw-text-[12.5px] pktw-text-pk-info">{g.title}</td>
								<td className="pktw-py-2.5 pktw-px-3 pktw-border-b pktw-border-pk-border-soft pktw-text-[12.5px] pktw-tabular-nums pktw-font-semibold pktw-text-pk-foreground">{refCount} times</td>
								<td className="pktw-py-2.5 pktw-px-3 pktw-border-b pktw-border-pk-border-soft pktw-text-[12.5px] pktw-text-pk-foreground-muted pktw-line-clamp-1">{g.body.slice(0, 100)}</td>
								<td className="pktw-py-2.5 pktw-px-3 pktw-border-b pktw-border-pk-border-soft pktw-text-right">
									<Button variant="outline" size="sm"><FilePlus className="pktw-w-3.5 pktw-h-3.5" />Create note</Button>
								</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}

function StaleHubsCard({ gaps }: { gaps: Array<{ id: string; title: string; body: string; confidence: 'low' | 'medium' | 'high' }> }) {
	return (
		<div className="pktw-bg-pk-surface pktw-border pktw-border-pk-border-soft pktw-rounded-2xl pktw-px-5 pktw-py-[18px]">
			<GapCardHeader
				Icon={Clock}
				title="Stale hubs"
				confidence={gaps[0]?.confidence ?? 'medium'}
				source="Activity scan"
			/>
			<div className="pktw-text-[13px] pktw-text-pk-foreground-muted pktw-mb-3.5">Important hubs that haven't been updated recently.</div>
			<table className="pktw-w-full pktw-border-collapse">
				<thead>
					<tr>
						<th className="pktw-text-left pktw-text-[11px] pktw-text-pk-foreground-muted pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-py-2 pktw-px-3 pktw-border-b pktw-border-pk-border-soft">Note</th>
						<th className="pktw-text-left pktw-text-[11px] pktw-text-pk-foreground-muted pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-py-2 pktw-px-3 pktw-border-b pktw-border-pk-border-soft">Why it matters</th>
						<th className="pktw-text-right pktw-text-[11px] pktw-text-pk-foreground-muted pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-py-2 pktw-px-3 pktw-border-b pktw-border-pk-border-soft">Action</th>
					</tr>
				</thead>
				<tbody>
					{gaps.slice(0, 6).map(g => (
						<tr key={g.id} id={`vault-gap-${g.id}`} className="last:[&_td]:pktw-border-b-0">
							<td className="pktw-py-2.5 pktw-px-3 pktw-border-b pktw-border-pk-border-soft pktw-text-[12.5px] pktw-text-pk-info">{g.title}</td>
							<td className="pktw-py-2.5 pktw-px-3 pktw-border-b pktw-border-pk-border-soft pktw-text-[12.5px] pktw-text-pk-foreground pktw-line-clamp-2">{g.body.slice(0, 140)}</td>
							<td className="pktw-py-2.5 pktw-px-3 pktw-border-b pktw-border-pk-border-soft pktw-text-right">
								<Button variant="outline" size="sm"><ExternalLink className="pktw-w-3.5 pktw-h-3.5" />Review note</Button>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function GenericGapCard({ gap, title, Icon }: {
	gap: { id: string; title: string; body: string; confidence: 'low' | 'medium' | 'high' };
	title: string;
	Icon: LucideIcon;
}) {
	return (
		<div id={`vault-gap-${gap.id}`} className="pktw-bg-pk-surface pktw-border pktw-border-pk-border-soft pktw-rounded-2xl pktw-px-5 pktw-py-[18px]">
			<GapCardHeader Icon={Icon} headline={title} title={gap.title} confidence={gap.confidence} source="Agent analysis" />
			<div className="pktw-text-[13px] pktw-text-pk-foreground-muted pktw-leading-relaxed">
				<StreamdownIsolated>{gap.body}</StreamdownIsolated>
			</div>
		</div>
	);
}

// ─── Actions panel ──────────────────────────────────────────────────────

const ActionsPanel: React.FC<{ snapshot: VaultReviewSessionSnapshot | null }> = ({ snapshot }) => {
	const actions = snapshot?.collectorSnapshot.actions ?? [];
	const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');

	if (actions.length === 0) return <Empty label="No actions proposed yet." />;

	const order = { high: 0, medium: 1, low: 2 };
	const filtered = filter === 'all'
		? actions.slice().sort((a, b) => order[a.priority] - order[b.priority])
		: actions.filter(a => a.priority === filter);

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-2.5">
			<div className="pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-4 pktw-py-2.5 pktw-bg-pk-info-bg pktw-border pktw-border-blue-200 dark:pktw-border-blue-800 pktw-text-pk-info-text pktw-rounded-[10px] pktw-text-[12.5px] pktw-font-medium pktw-mb-1">
				<Info className="pktw-w-4 pktw-h-4 pktw-text-pk-info" />
				<span>No vault changes will be applied automatically. Every restructure stays dry-run until approved.</span>
			</div>

			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-3 pktw-gap-3 pktw-flex-wrap">
				<div className="pktw-text-[14px] pktw-font-semibold pktw-text-pk-foreground">
					Prioritized action queue <span className="pktw-text-[12px] pktw-text-pk-foreground-muted pktw-font-medium pktw-ml-1.5">(Phase 1: text-only recommendations)</span>
				</div>
				<div className="pktw-inline-flex pktw-items-center pktw-gap-1.5">
					{(['all', 'high', 'medium', 'low'] as const).map(f => (
						<button
							key={f}
							onClick={() => setFilter(f)}
							className={cn(
								'pktw-px-3 pktw-py-1 pktw-rounded-full pktw-border pktw-text-[12px] pktw-font-semibold pktw-cursor-pointer',
								filter === f
									? 'pktw-text-pk-accent-text pktw-bg-pk-accent-tint pktw-border-pk-accent-soft'
									: 'pktw-text-pk-foreground-muted pktw-bg-pk-surface pktw-border-pk-border-soft hover:pktw-text-pk-foreground',
							)}
						>
							{f === 'all' ? 'All' : f === 'high' ? 'High impact' : f === 'low' ? 'Low risk' : 'Medium risk'}
						</button>
					))}
					<button className="pktw-p-1.5 pktw-bg-pk-surface pktw-border pktw-border-pk-border-soft pktw-text-pk-foreground-muted pktw-rounded-lg pktw-cursor-pointer">
						<Filter className="pktw-w-3.5 pktw-h-3.5" />
					</button>
				</div>
			</div>

			{filtered.length === 0 ? (
				<Empty label={`No ${filter} priority actions.`} />
			) : (
				filtered.map((a, idx) => <ActionCard key={a.id} action={a} rank={idx + 1} />)
			)}

			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-pt-2.5 pktw-px-1.5 pktw-text-[11.5px] pktw-text-pk-foreground-muted">
				<GripVertical className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-foreground-faint" />
				<span>Drag to reorder priorities. Rankings are based on impact, risk, and evidence strength.</span>
			</div>
		</div>
	);
};

function ActionCard({ action, rank }: {
	action: { id: string; title: string; rationale: string; priority: 'low' | 'medium' | 'high'; involvedNotes: string[]; estimatedImpact?: string; kind: string };
	rank: number;
}) {
	const validNotes = action.involvedNotes.filter(n => n && n.trim().length > 1);
	const tagVariant: 'danger' | 'warning' | 'info' | 'success' = (() => {
		switch (action.kind) {
			case 'archive-cluster':
			case 'split-cluster':
			case 'split-note':
				return 'warning';
			case 'merge-notes':
			case 'tag-rename':
			case 'tag-suggest':
				return 'info';
			default:
				return action.priority === 'high' ? 'danger' : action.priority === 'medium' ? 'warning' : 'info';
		}
	})();
	const tagLabel = (() => {
		const map: Record<string, string> = {
			high: 'High impact',
			medium: 'Medium risk',
			low: 'Low impact',
		};
		return map[action.priority];
	})();
	const cta = (() => {
		switch (action.kind) {
			case 'create-note': return { label: 'Create proposal', Icon: FilePlus, primary: true };
			case 'merge-notes': return { label: 'Preview dry-run', Icon: Eye, primary: false };
			case 'archive-cluster': return { label: 'Review scope', Icon: Archive, primary: false };
			default: return { label: 'Open note', Icon: ExternalLink, primary: false };
		}
	})();
	const TrendIcon = rank === 1 ? ArrowUp : rank > 3 ? ArrowDown : Minus;
	const trendClass = rank === 1 ? 'pktw-text-pk-success' : rank > 3 ? 'pktw-text-pk-foreground-faint' : 'pktw-text-pk-foreground-muted';
	return (
		<div id={`vault-action-${action.id}`} className="pktw-grid pktw-grid-cols-[28px_56px_1fr_auto] pktw-gap-3 pktw-items-start pktw-px-[18px] pktw-py-4 pktw-bg-pk-surface pktw-border pktw-border-pk-border-soft pktw-rounded-2xl">
			<div className="pktw-flex pktw-items-center pktw-text-pk-foreground-faint pktw-self-center">
				<GripVertical className="pktw-w-3.5 pktw-h-3.5" />
			</div>
			<div className="pktw-flex pktw-flex-col pktw-items-center pktw-gap-1 pktw-pt-0.5">
				<div className="pktw-text-[22px] pktw-font-bold pktw-text-pk-foreground pktw-leading-none pktw-tabular-nums">{rank}</div>
				<TrendIcon className={cn('pktw-w-3.5 pktw-h-3.5', trendClass)} strokeWidth={2.5} />
			</div>
			<div className="pktw-min-w-0">
				<div className="pktw-mb-1.5"><Pill variant={tagVariant}>{tagLabel}</Pill></div>
				<div className="pktw-text-[14px] pktw-font-semibold pktw-text-pk-foreground pktw-mb-1 pktw-leading-snug">{action.title}</div>
				<div className="pktw-text-[12.5px] pktw-text-pk-foreground-muted pktw-mb-2 pktw-leading-snug">{action.rationale}</div>
				{validNotes.length > 0 && (
					<div className="pktw-flex pktw-flex-wrap pktw-gap-1.5 pktw-mt-1">
						{validNotes.slice(0, 5).map(n => (
							<button key={n} onClick={() => void openNote(n)} className="pktw-text-[11.5px] pktw-text-pk-info pktw-bg-pk-background-secondary pktw-border-0 pktw-rounded-full pktw-px-2.5 pktw-py-0.5 pktw-cursor-pointer hover:pktw-bg-pk-accent-tint">
								{basename(n)}
							</button>
						))}
						{validNotes.length > 5 && (
							<span className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-self-center">+{validNotes.length - 5} more</span>
						)}
					</div>
				)}
			</div>
			<div className="pktw-flex pktw-flex-col pktw-items-end pktw-gap-3.5 pktw-min-w-[210px]">
				<div className="pktw-grid pktw-grid-cols-3 pktw-gap-4 pktw-text-right pktw-text-[11.5px]">
					<div>
						<div className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-font-medium pktw-mb-1">Affected notes</div>
						<div className="pktw-text-[16px] pktw-font-bold pktw-text-pk-foreground pktw-tabular-nums">{validNotes.length}</div>
					</div>
					<div>
						<div className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-font-medium pktw-mb-1">Est. impact</div>
						<div><Pill variant={tagVariant}>{action.priority === 'high' ? 'High' : action.priority === 'medium' ? 'Medium' : 'Low'}</Pill></div>
					</div>
					<div>
						<div className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-font-medium pktw-mb-1">Status</div>
						<div><Pill variant="neutral">Planned</Pill></div>
					</div>
				</div>
				<Button variant={cta.primary ? 'outline' : 'outline'} disabled title="Phase 2 dry-run">
					<cta.Icon className="pktw-w-4 pktw-h-4" />{cta.label}
				</Button>
			</div>
		</div>
	);
}

// ─── Sources panel ──────────────────────────────────────────────────────

const SourcesPanel: React.FC<{ snapshot: VaultReviewSessionSnapshot | null }> = ({ snapshot }) => {
	const sources = snapshot?.collectorSnapshot.sources ?? [];
	const [selectedId, setSelectedId] = useState<string | null>(sources[0]?.id ?? null);
	const [conf, setConf] = useState<Record<'high' | 'medium' | 'low', boolean>>({ high: true, medium: true, low: true });

	useEffect(() => {
		if (sources.length === 0) return;
		if (!selectedId || !sources.find(s => s.id === selectedId)) setSelectedId(sources[0].id);
	}, [sources, selectedId]);

	if (sources.length === 0) return <Empty label="No sources cited yet." />;

	const visible = sources.filter(s => conf[confidenceOf(s.weight)]);
	const selected = visible.find(s => s.id === selectedId) ?? visible[0] ?? sources[0];

	const confCounts = sources.reduce((acc, s) => {
		acc[confidenceOf(s.weight)]++;
		return acc;
	}, { high: 0, medium: 0, low: 0 } as Record<'high' | 'medium' | 'low', number>);

	return (
		<>
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-4 pktw-py-2.5 pktw-bg-pk-background-secondary pktw-border pktw-border-pk-border-soft pktw-rounded-[10px] pktw-text-pk-foreground-muted pktw-text-[12.5px] pktw-font-medium pktw-mb-3.5">
				<Info className="pktw-w-4 pktw-h-4 pktw-text-pk-info" />
				<span>Every vault-level claim links back to source notes.</span>
			</div>

			<div className="pktw-grid pktw-grid-cols-[220px_minmax(0,1fr)_280px] pktw-gap-5">
				{/* Filter column */}
				<aside className="pktw-bg-pk-surface pktw-border pktw-border-pk-border-soft pktw-rounded-2xl pktw-p-3.5">
					<div className="pktw-mb-4">
						<div className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-mb-2">Source groups</div>
						<div className="pktw-flex pktw-flex-col">
							<SourceGroupItem label="All sources" count={sources.length} active />
						</div>
					</div>
					<div>
						<div className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-mb-2">Confidence</div>
						{(['high', 'medium', 'low'] as const).map(c => (
							<label key={c} className="pktw-flex pktw-items-center pktw-justify-between pktw-px-1 pktw-py-1 pktw-text-[12.5px] pktw-text-pk-foreground pktw-cursor-pointer">
								<span className="pktw-flex pktw-items-center pktw-gap-2">
									<input
										type="checkbox"
										checked={conf[c]}
										onChange={() => setConf(prev => ({ ...prev, [c]: !prev[c] }))}
										className="pktw-w-3.5 pktw-h-3.5"
										style={{ accentColor: 'var(--pk-accent)' }}
									/>
									<span className="pktw-capitalize">{c}</span>
								</span>
								<span className="pktw-text-[11.5px] pktw-text-pk-foreground-muted pktw-tabular-nums">{confCounts[c]}</span>
							</label>
						))}
					</div>
				</aside>

				{/* Table */}
				<div className="pktw-min-w-0">
					<div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-3 pktw-gap-3">
						<div className="pktw-text-[14px] pktw-font-semibold pktw-text-pk-foreground">{visible.length} sources</div>
					</div>
					<div className="pktw-bg-pk-surface pktw-border pktw-border-pk-border-soft pktw-rounded-2xl pktw-overflow-hidden">
						<div className="pktw-grid pktw-grid-cols-[2fr_1.4fr_1fr_2.2fr] pktw-gap-3 pktw-px-4 pktw-py-2.5 pktw-bg-pk-background-secondary pktw-border-b pktw-border-pk-border-soft pktw-text-[11px] pktw-text-pk-foreground-muted pktw-font-bold pktw-uppercase pktw-tracking-wider">
							<div>Note</div>
							<div>Used in</div>
							<div>Confidence</div>
							<div>Excerpt</div>
						</div>
						{visible.map(s => {
							const c = confidenceOf(s.weight);
							const isSelected = s.id === selected?.id;
							const confPill: 'success' | 'warning' | 'danger' = c === 'high' ? 'success' : c === 'medium' ? 'warning' : 'danger';
							return (
								<button
									key={s.id}
									onClick={() => setSelectedId(s.id)}
									className={cn(
										'pktw-w-full pktw-grid pktw-grid-cols-[2fr_1.4fr_1fr_2.2fr] pktw-gap-3 pktw-px-4 pktw-py-3 pktw-items-start pktw-text-left pktw-text-[12.5px] pktw-bg-transparent pktw-border-x-0 pktw-border-t-0 pktw-border-b pktw-border-pk-border-soft pktw-cursor-pointer last:pktw-border-b-0',
										isSelected ? 'pktw-bg-pk-accent-tint pktw-shadow-[inset_0_0_0_2px_var(--pk-accent-soft)] pktw-relative pktw-z-[1]' : 'hover:pktw-bg-pk-background-secondary',
									)}
								>
									<div className="pktw-min-w-0">
										<div className="pktw-text-[13px] pktw-text-pk-info pktw-font-medium pktw-truncate">[[{basename(s.path)}]]</div>
										<div className="pktw-text-[11.5px] pktw-text-pk-foreground-muted pktw-font-mono pktw-truncate">{s.path}</div>
									</div>
									<div className="pktw-text-pk-foreground pktw-leading-snug pktw-line-clamp-2">{s.relevance || '—'}</div>
									<div><Pill variant={confPill} size="sm">{c}</Pill></div>
									<div className="pktw-text-pk-foreground-muted pktw-text-[12px] pktw-leading-snug pktw-line-clamp-2">{s.excerpt || '—'}</div>
								</button>
							);
						})}
					</div>
				</div>

				{/* Preview */}
				{selected && (
					<aside className="pktw-bg-pk-surface pktw-border pktw-border-pk-border-soft pktw-rounded-2xl pktw-p-4">
						<div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-3">
							<div className="pktw-text-[13px] pktw-font-semibold pktw-text-pk-foreground">Source preview</div>
							<div className="pktw-inline-flex pktw-gap-1.5 pktw-text-pk-foreground-faint">
								<IconButton aria-label="Expand"><Maximize2 className="pktw-w-3.5 pktw-h-3.5" /></IconButton>
								<IconButton aria-label="Pin"><Pin className="pktw-w-3.5 pktw-h-3.5" /></IconButton>
							</div>
						</div>
						<div className="pktw-text-[14px] pktw-font-bold pktw-text-pk-accent-text pktw-mb-1">[[{basename(selected.path)}]]</div>
						<div className="pktw-text-[11.5px] pktw-text-pk-foreground-muted pktw-font-mono pktw-mb-3">{selected.path}</div>
						<div className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-mt-3.5 pktw-mb-1.5">Why cited</div>
						<div className="pktw-text-[12.5px] pktw-text-pk-foreground pktw-leading-relaxed">{selected.relevance || '—'}</div>
						{selected.excerpt && (
							<>
								<div className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-mt-3.5 pktw-mb-1.5">Excerpt</div>
								<div className="pktw-text-[12px] pktw-text-pk-foreground pktw-bg-pk-background-secondary pktw-rounded-[10px] pktw-px-3 pktw-py-2.5 pktw-leading-snug">{selected.excerpt}</div>
							</>
						)}
						<Button onClick={() => void openNote(selected.path)} variant="outline" className="pktw-w-full pktw-mt-4">
							<ExternalLink className="pktw-w-4 pktw-h-4" />Open source note
						</Button>
					</aside>
				)}
			</div>
		</>
	);
};

function SourceGroupItem({ label, count, active }: { label: string; count: number; active?: boolean }) {
	return (
		<div className={cn('pktw-flex pktw-justify-between pktw-items-center pktw-px-2.5 pktw-py-1.5 pktw-rounded-md pktw-cursor-pointer pktw-text-[12.5px]', active ? 'pktw-bg-pk-accent-tint pktw-text-pk-accent-text pktw-font-semibold' : 'pktw-text-pk-foreground hover:pktw-bg-pk-background-secondary')}>
			<span>{label}</span>
			<span className={cn('pktw-text-[11.5px] pktw-tabular-nums', active ? 'pktw-text-pk-accent-text' : 'pktw-text-pk-foreground-muted')}>{count}</span>
		</div>
	);
}

// ─── Trace panel ────────────────────────────────────────────────────────

const TracePanel: React.FC<{
	snapshot: VaultReviewSessionSnapshot | null;
	trace: TraceArtifact[];
	traceSummary?: { totalMs: number; roundCount: number; turnCount: number; finished: boolean };
}> = ({ snapshot, trace, traceSummary }) => {
	const [selectedIdx, setSelectedIdx] = useState<number>(0);
	if (trace.length === 0) return <Empty label="Trace will appear once the agent starts running." />;

	const selected = trace[selectedIdx] ?? trace[0];
	const totalDur = traceSummary?.totalMs ?? 0;
	const tokenEst = snapshot?.rounds.reduce((sum, r) => sum + (r.turnCount * 256), 0) ?? 0;

	return (
		<div className="pktw-grid pktw-grid-cols-[minmax(0,1fr)_320px] pktw-gap-5">
			<div className="pktw-min-w-0">
				<div className="pktw-flex pktw-items-center pktw-mb-3.5">
					<span className="pktw-text-[14px] pktw-font-semibold pktw-text-pk-foreground">Agent trace</span>
					<span className="pktw-ml-1.5 pktw-text-[12.5px] pktw-font-medium pktw-text-pk-foreground-muted">(ReAct timeline)</span>
					{!traceSummary?.finished && (
						<span className="pktw-ml-2.5 pktw-px-2 pktw-py-0.5 pktw-rounded-full pktw-bg-pk-accent-tint pktw-text-pk-accent-text pktw-text-[11px] pktw-font-semibold">live</span>
					)}
				</div>

				<div className="pktw-bg-pk-surface pktw-border pktw-border-pk-border-soft pktw-rounded-2xl pktw-overflow-hidden">
					<div className="pktw-grid pktw-grid-cols-[90px_32px_1.5fr_1.7fr_70px] pktw-gap-2.5 pktw-px-4 pktw-py-2.5 pktw-bg-pk-background-secondary pktw-border-b pktw-border-pk-border-soft pktw-text-[11px] pktw-text-pk-foreground-muted pktw-font-bold pktw-uppercase pktw-tracking-wider">
						<div>Time</div>
						<div></div>
						<div>Step</div>
						<div>Action &amp; reasoning</div>
						<div></div>
					</div>
					{trace.map((t, i) => {
						const isSelected = i === selectedIdx;
						const isLast = i === trace.length - 1;
						const isInProgress = isLast && !traceSummary?.finished;
						const isToolKind = t.kind === 'call' || t.kind === 'read';
						const iconBg = isToolKind ? 'pktw-bg-pk-accent-tint pktw-text-pk-accent'
							: isInProgress ? 'pktw-bg-pk-info-bg pktw-text-pk-info'
							: 'pktw-bg-pk-success-bg pktw-text-pk-success';
						const StatusIcon = isToolKind ? Puzzle : isInProgress ? Hourglass : Check;
						const desc = traceDescription(t);
						return (
							<button
								key={t.id ?? i}
								onClick={() => setSelectedIdx(i)}
								className={cn(
									'pktw-w-full pktw-grid pktw-grid-cols-[90px_32px_1.5fr_1.7fr_70px] pktw-gap-2.5 pktw-px-4 pktw-py-2.5 pktw-items-center pktw-text-left pktw-text-[12.5px] pktw-bg-transparent pktw-border-x-0 pktw-border-t-0 pktw-border-b pktw-border-pk-border-soft last:pktw-border-b-0 pktw-cursor-pointer',
									isSelected ? 'pktw-bg-pk-accent-tint pktw-shadow-[inset_0_0_0_2px_var(--pk-accent-soft)] pktw-relative pktw-z-[1]' : 'hover:pktw-bg-pk-background-secondary',
								)}
							>
								<div className="pktw-text-[12px] pktw-tabular-nums pktw-text-pk-foreground-muted">{t.timestamp ? new Date(t.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}</div>
								<div><span className={cn('pktw-w-[26px] pktw-h-[26px] pktw-rounded-full pktw-flex pktw-items-center pktw-justify-center pktw-mx-auto', iconBg)}><StatusIcon className="pktw-w-3 pktw-h-3" strokeWidth={2.6} /></span></div>
								<div className="pktw-text-[13px] pktw-font-semibold pktw-text-pk-foreground">{traceTitle(t)}</div>
								<div>
									<div className="pktw-text-pk-foreground pktw-leading-snug">{desc.split('\n')[0] || '—'}</div>
								</div>
								<div className="pktw-text-right pktw-text-[11.5px] pktw-text-pk-foreground-muted pktw-tabular-nums">{i === 0 ? '—' : `${Math.round(((i / trace.length) * totalDur) % 1000)}ms`}</div>
							</button>
						);
					})}
				</div>

				<div className="pktw-inline-flex pktw-items-center pktw-gap-4 pktw-mt-3.5 pktw-text-[11.5px] pktw-text-pk-foreground-muted">
					<TraceLegend Icon={Check} tone="success">Completed</TraceLegend>
					<TraceLegend Icon={Puzzle} tone="accent">Tool call</TraceLegend>
					<TraceLegend Icon={Circle} tone="neutral">Writing</TraceLegend>
					<TraceLegend Icon={Hourglass} tone="info">In progress</TraceLegend>
				</div>
			</div>

			{/* Step detail right rail */}
			<aside className="pktw-bg-pk-surface pktw-border pktw-border-pk-border-soft pktw-rounded-2xl pktw-p-4">
				<div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-3.5">
					<div>
						<span className="pktw-text-[13px] pktw-font-semibold pktw-text-pk-foreground">Step details</span>
						<span className="pktw-ml-1.5 pktw-text-[11.5px] pktw-text-pk-foreground-muted">{selectedIdx + 1} of {trace.length}</span>
					</div>
					<div className="pktw-inline-flex pktw-gap-0.5">
						<button onClick={() => setSelectedIdx(Math.max(0, selectedIdx - 1))} disabled={selectedIdx === 0} className="pktw-w-[26px] pktw-h-[26px] pktw-rounded-md pktw-border pktw-border-pk-border-soft pktw-bg-pk-surface pktw-text-pk-foreground-muted pktw-cursor-pointer pktw-flex pktw-items-center pktw-justify-center disabled:pktw-opacity-50">
							<ChevronLeft className="pktw-w-3.5 pktw-h-3.5" />
						</button>
						<button onClick={() => setSelectedIdx(Math.min(trace.length - 1, selectedIdx + 1))} disabled={selectedIdx === trace.length - 1} className="pktw-w-[26px] pktw-h-[26px] pktw-rounded-md pktw-border pktw-border-pk-border-soft pktw-bg-pk-surface pktw-text-pk-foreground-muted pktw-cursor-pointer pktw-flex pktw-items-center pktw-justify-center disabled:pktw-opacity-50">
							<ChevronRight className="pktw-w-3.5 pktw-h-3.5" />
						</button>
					</div>
				</div>

				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-[13px] pktw-font-semibold pktw-mb-3">
					<span>{traceTitle(selected)}</span>
					{selectedIdx < trace.length - 1 || traceSummary?.finished ? (
						<Pill variant="success">Completed</Pill>
					) : (
						<Pill variant="info">In progress</Pill>
					)}
				</div>

				<div className="pktw-text-[10.5px] pktw-text-pk-foreground-muted pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-mb-1.5">Description</div>
				<div className="pktw-text-[12px] pktw-text-pk-foreground pktw-leading-relaxed pktw-mb-3.5 pktw-whitespace-pre-line">
					{traceDescription(selected) || '—'}
				</div>

				<div className="pktw-text-[10.5px] pktw-text-pk-foreground-muted pktw-font-bold pktw-uppercase pktw-tracking-wider pktw-mt-3.5 pktw-mb-1.5">Tool</div>
				<div className="pktw-flex pktw-justify-between pktw-items-center pktw-bg-pk-background-secondary pktw-border pktw-border-pk-border-soft pktw-rounded-[10px] pktw-px-2.5 pktw-py-1.5 pktw-font-mono pktw-text-[12px] pktw-text-pk-foreground">
					<span>{selected.kind ?? 'step'}</span>
					<button className="pktw-p-0.5 pktw-bg-transparent pktw-border-0 pktw-text-pk-foreground-faint pktw-cursor-pointer">
						<Copy className="pktw-w-3.5 pktw-h-3.5" />
					</button>
				</div>

				<div className="pktw-grid pktw-grid-cols-2 pktw-gap-2 pktw-mt-3.5">
					<div className="pktw-px-3 pktw-py-2.5 pktw-border pktw-border-pk-border-soft pktw-rounded-[10px]">
						<div className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-mb-0.5">Token estimate</div>
						<div className="pktw-text-[13px] pktw-font-semibold pktw-text-pk-foreground pktw-tabular-nums">~{formatNumber(tokenEst)} tokens</div>
					</div>
					<div className="pktw-px-3 pktw-py-2.5 pktw-border pktw-border-pk-border-soft pktw-rounded-[10px]">
						<div className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-mb-0.5">Total duration</div>
						<div className="pktw-text-[13px] pktw-font-semibold pktw-text-pk-foreground pktw-tabular-nums">{formatDuration(totalDur)}</div>
					</div>
				</div>
			</aside>
		</div>
	);
};

function TraceLegend({ Icon, tone, children }: { Icon: LucideIcon; tone: 'success' | 'accent' | 'neutral' | 'info'; children: React.ReactNode }) {
	const cls = tone === 'success' ? 'pktw-bg-pk-success-bg pktw-text-pk-success'
		: tone === 'accent' ? 'pktw-bg-pk-accent-tint pktw-text-pk-accent'
		: tone === 'info' ? 'pktw-bg-pk-info-bg pktw-text-pk-info'
		: 'pktw-bg-pk-surface-sunken pktw-text-pk-foreground-muted';
	return (
		<span className="pktw-inline-flex pktw-items-center pktw-gap-1.5">
			<span className={cn('pktw-w-4 pktw-h-4 pktw-rounded-full pktw-flex pktw-items-center pktw-justify-center', cls)}>
				<Icon className="pktw-w-2.5 pktw-h-2.5" strokeWidth={3} />
			</span>
			{children}
		</span>
	);
}

// ─── Modal class wrapper ────────────────────────────────────────────────

export class VaultAutoRunModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;
	private appContext = AppContext.getInstance();

	constructor(app: App, private readonly options: VaultAutoRunModalProps = {}) {
		super(app);
	}

	async onOpen(): Promise<void> {
		this.modalEl.addClass('peak-vault-auto-run-modal');
		this.modalEl.addClass('peak-design-root');
		this.modalEl.style.width = 'min(1280px, 96vw)';
		this.modalEl.style.height = 'min(820px, 92vh)';
		this.modalEl.style.maxHeight = '92vh';
		this.contentEl.style.padding = '0';
		this.contentEl.style.height = '100%';
		this.contentEl.style.overflow = 'hidden';
		this.contentEl.addClass('pktw-root');

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
