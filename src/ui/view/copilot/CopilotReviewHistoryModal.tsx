import { Modal, type App, TFile, Notice } from 'obsidian';
import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, History, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { Button } from '@/ui/component/shared-ui/button';
import { Input } from '@/ui/component/shared-ui/input';
import { cn } from '@/ui/react/lib/utils';
import {
	getCopilotReviewHistoryService,
	type CopilotReviewHistoryRecord,
} from '@/service/copilot/CopilotReviewHistoryService';
import {
	getVaultReviewReportService,
	type VaultReviewHistoryRecord,
} from '@/service/copilot/vault/VaultReviewReportService';
import { DocumentContextBuilder } from '@/service/copilot/DocumentContextBuilder';
import { CopilotAutoRunModal } from './CopilotAutoRunModal';
import { VaultAutoRunModal, openVaultReviewHistoryRecord } from './vault/VaultAutoRunModal';
import { ReviewStatusBadge } from './review/ReviewStatusBadge';

type Scope = 'document' | 'vault';
type DocSubFilter = 'this-note' | 'all-notes';

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

function basename(p: string): string {
	return p.split('/').pop()?.replace(/\.md$/, '') ?? p;
}

/* -------------------------------------------------------------------------- */
/* Internal record types                                                      */
/* -------------------------------------------------------------------------- */

interface NormalizedRecord {
	id: string;
	scope: Scope;
	headline: string;
	completedAt: number;
	status: string;
	subjectPath: string;
	subjectBasename: string;
	mini: string;                  // mini stats line
	raw: CopilotReviewHistoryRecord | VaultReviewHistoryRecord;
}

function normalizeDoc(r: CopilotReviewHistoryRecord): NormalizedRecord {
	return {
		id: r.id,
		scope: 'document',
		headline: r.headline?.trim() || (r.mode === 'fast' ? 'Fast review' : 'Auto review'),
		completedAt: r.completedAt,
		status: r.status,
		subjectPath: r.subjectPath || '(unknown)',
		subjectBasename: r.subjectBasename || basename(r.subjectPath || ''),
		mini: `${r.insightCount}i · ${r.changeCount}c · ${r.sourceCount}s · ${r.roundCount}r · ${r.turnCount} turns`,
		raw: r,
	};
}

function normalizeVault(r: VaultReviewHistoryRecord): NormalizedRecord {
	return {
		id: r.id,
		scope: 'vault',
		headline: r.headline?.trim() || (r.mode === 'fast' ? 'Fast vault review' : 'Vault review'),
		completedAt: r.completedAt,
		status: r.status,
		subjectPath: 'vault',
		subjectBasename: 'Vault',
		mini: `${r.clusterCount} clusters · ${r.gapCount} gaps · ${r.actionCount} actions · ${r.insightCount} insights`,
		raw: r,
	};
}

function groupBySubject(records: NormalizedRecord[]): Map<string, NormalizedRecord[]> {
	const out = new Map<string, NormalizedRecord[]>();
	for (const r of records) {
		const arr = out.get(r.subjectPath) ?? [];
		arr.push(r);
		out.set(r.subjectPath, arr);
	}
	return out;
}

/* -------------------------------------------------------------------------- */
/* Header                                                                     */
/* -------------------------------------------------------------------------- */

const TITLE_BY_SCOPE: Record<Scope, { title: string; icon: React.ReactNode }> = {
	document: { title: 'Document Reviews', icon: <History className="pktw-h-[18px] pktw-w-[18px]" /> },
	vault: { title: 'Vault Reviews', icon: <ShieldCheck className="pktw-h-[18px] pktw-w-[18px]" /> },
};

/* -------------------------------------------------------------------------- */
/* Main content                                                               */
/* -------------------------------------------------------------------------- */

interface ContentProps {
	scope: Scope;
	currentNotePath: string | null;
	onOpenRecord: (record: NormalizedRecord) => void;
	onClose: () => void;
	onBackToPicker?: () => void;
}

const CopilotReviewHistoryContent: React.FC<ContentProps> = ({ scope, currentNotePath, onOpenRecord, onBackToPicker }) => {
	const [records, setRecords] = useState<NormalizedRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState('');
	const [refreshTick, setRefreshTick] = useState(0);
	// Document scope: "this-note" (current file) vs "all-notes" (every note).
	// Default: "this-note" when a note is open, otherwise "all-notes".
	const [docSubFilter, setDocSubFilter] = useState<DocSubFilter>(currentNotePath ? 'this-note' : 'all-notes');

	const showDocToggle = scope === 'document' && currentNotePath;
	const effectiveDocFilter: DocSubFilter = showDocToggle ? docSubFilter : 'all-notes';

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		const fetcher = scope === 'vault'
			? getVaultReviewReportService().listAll(500).then(list => list.map(normalizeVault))
			: (effectiveDocFilter === 'this-note' && currentNotePath
				? getCopilotReviewHistoryService().listForSubject(currentNotePath, 500, 'document').then(list => list.map(normalizeDoc))
				: getCopilotReviewHistoryService().listAll(500, 'document').then(list => list.map(normalizeDoc))
			);
		fetcher
			.then(list => {
				if (!cancelled) {
					setRecords(list);
					setLoading(false);
				}
			})
			.catch(err => {
				if (!cancelled) {
					console.warn('[CopilotReviewHistoryModal] failed to load', err);
					setRecords([]);
					setLoading(false);
				}
			});
		return () => { cancelled = true; };
	}, [scope, effectiveDocFilter, currentNotePath, refreshTick]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return records;
		return records.filter(r =>
			r.subjectBasename.toLowerCase().includes(q) ||
			r.subjectPath.toLowerCase().includes(q) ||
			r.headline.toLowerCase().includes(q),
		);
	}, [records, query]);

	const grouped = useMemo(() => groupBySubject(filtered), [filtered]);

	const handleDelete = async (record: NormalizedRecord) => {
		if (record.scope === 'vault') {
			await getVaultReviewReportService().delete(record.raw as VaultReviewHistoryRecord);
		} else {
			await getCopilotReviewHistoryService().delete(record.raw as CopilotReviewHistoryRecord);
		}
		new Notice('Review deleted');
		setRefreshTick(t => t + 1);
	};

	const subtitleText = (() => {
		if (loading) return 'Loading…';
		const count = records.length;
		const noun = `review${count === 1 ? '' : 's'}`;
		if (scope === 'vault') return `${count} vault ${noun}`;
		if (effectiveDocFilter === 'this-note') return `${count} ${noun} of this note`;
		return `${count} ${noun} across ${grouped.size} document${grouped.size === 1 ? '' : 's'}`;
	})();

	const headerMeta = TITLE_BY_SCOPE[scope];

	return (
		<div className="pktw-flex pktw-h-full pktw-flex-col pktw-bg-pk-background">

			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-4 pktw-px-7 pktw-pt-6 pktw-pb-4">
				<div className="pktw-flex pktw-min-w-0 pktw-items-center pktw-gap-3">
					{onBackToPicker ? (
						<Button
							variant="ghost"
							size="sm"
							onClick={onBackToPicker}
							className="pktw-gap-1.5 pktw-text-[12px] pktw-text-pk-foreground-muted hover:pktw-text-pk-accent"
							title="Back to Copilot picker"
						>
							<ArrowLeft className="pktw-h-[14px] pktw-w-[14px]" />
							Back
						</Button>
					) : null}
					<div className="pktw-flex pktw-h-10 pktw-w-10 pktw-items-center pktw-justify-center pktw-rounded-xl pktw-bg-pk-accent-tint pktw-text-pk-accent pktw-shrink-0">
						{headerMeta.icon}
					</div>
					<div className="pktw-flex pktw-min-w-0 pktw-flex-col">
						<span className="pktw-text-[18px] pktw-font-bold pktw-text-pk-foreground pktw-leading-tight">{headerMeta.title}</span>
						<span className="pktw-text-[12px] pktw-text-pk-foreground-muted pktw-mt-0.5">{subtitleText}</span>
					</div>
				</div>
				<Button
					variant="ghost"
					size="sm"
					onClick={() => setRefreshTick(t => t + 1)}
					className="pktw-gap-1.5 pktw-text-[12px] pktw-text-pk-foreground-muted"
				>
					<RefreshCw className="pktw-h-[14px] pktw-w-[14px]" />
					Refresh
				</Button>
			</div>

			{/* Document scope: This note / All notes toggle */}
			{showDocToggle ? (
				<div className="pktw-px-7 pktw-pb-3">
					<div className="pktw-inline-flex pktw-gap-1 pktw-p-1 pktw-bg-pk-background-secondary pktw-rounded-lg">
						<ScopeTab
							active={docSubFilter === 'this-note'}
							onClick={() => setDocSubFilter('this-note')}
							label="This note"
							hint={currentNotePath ? basename(currentNotePath) : undefined}
						/>
						<ScopeTab
							active={docSubFilter === 'all-notes'}
							onClick={() => setDocSubFilter('all-notes')}
							label="All notes"
						/>
					</div>
				</div>
			) : null}

			{/* Search */}
			<div className="pktw-px-7 pktw-pb-4">
				<div className="pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-4 pktw-py-2.5 pktw-bg-pk-background-secondary pktw-border pktw-border-pk-border pktw-rounded-full">
					<Search className="pktw-w-4 pktw-h-4 pktw-text-pk-foreground-faint pktw-shrink-0" />
					<Input
						placeholder={scope === 'vault'
							? 'Filter by review headline…'
							: effectiveDocFilter === 'this-note'
								? 'Filter by review headline…'
								: 'Filter by document path or name…'
						}
						value={query}
						onChange={e => setQuery(e.target.value)}
						autoFocus
						className="pktw-h-7 pktw-flex-1 pktw-border-0 pktw-bg-transparent pktw-px-0 pktw-text-[13px] focus-visible:pktw-ring-0 focus-visible:pktw-ring-offset-0"
					/>
				</div>
			</div>

			{/* Body */}
			<div
				className="pktw-flex-1 pktw-overflow-y-auto pktw-px-7 pktw-pb-6"
				style={{ userSelect: 'text' }}
			>
				{loading ? (
					<div className="pktw-text-[13px] pktw-text-pk-foreground-muted pktw-italic pktw-py-8 pktw-text-center">Loading…</div>
				) : filtered.length === 0 ? (
					<div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-py-16 pktw-text-center pktw-text-pk-foreground-muted">
						<div className="pktw-w-12 pktw-h-12 pktw-rounded-full pktw-bg-pk-background-secondary pktw-flex pktw-items-center pktw-justify-center pktw-mb-3">
							<History className="pktw-w-5 pktw-h-5 pktw-text-pk-foreground-faint" />
						</div>
						<div className="pktw-text-[13px]">
							{query
								? 'No reviews match your filter.'
								: scope === 'vault'
									? 'No vault reviews yet. Run a vault review from the Vault tab.'
									: effectiveDocFilter === 'this-note'
										? 'No reviews of this note yet. Run an Auto Review on it to start.'
										: 'No document reviews yet. Run an Auto Review from any note to start.'}
						</div>
					</div>
				) : scope === 'vault' || effectiveDocFilter === 'this-note' ? (
					// Flat list (no group headers) — vault has no per-note grouping;
					// "this note" filter is already scoped to one document.
					<div className="pktw-flex pktw-flex-col pktw-gap-1.5">
						{filtered.map(r => (
							<ReviewRow key={r.id} record={r} onOpen={onOpenRecord} onDelete={handleDelete} />
						))}
					</div>
				) : (
					// Grouped by subject document — "all notes" view.
					<div className="pktw-flex pktw-flex-col pktw-gap-7">
						{Array.from(grouped.entries()).map(([subjectPath, recs]) => (
							<ReviewGroup
								key={subjectPath}
								subjectPath={subjectPath}
								records={recs}
								onOpen={onOpenRecord}
								onDelete={handleDelete}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
};

/* -------------------------------------------------------------------------- */
/* Sub-components                                                             */
/* -------------------------------------------------------------------------- */

function ScopeTab({ active, onClick, label, hint }: { active: boolean; onClick: () => void; label: string; hint?: string }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				'pktw-inline-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-1.5 pktw-rounded-md pktw-text-[12.5px] pktw-font-medium pktw-transition-colors',
				active
					? 'pktw-bg-pk-surface pktw-text-pk-foreground pktw-shadow-sm'
					: 'pktw-text-pk-foreground-muted hover:pktw-text-pk-foreground',
			)}
		>
			<span>{label}</span>
			{hint ? <span className="pktw-text-[11px] pktw-text-pk-foreground-faint pktw-font-mono pktw-truncate pktw-max-w-[200px]">{hint}</span> : null}
		</button>
	);
}

function ReviewGroup({
	subjectPath,
	records,
	onOpen,
	onDelete,
}: {
	subjectPath: string;
	records: NormalizedRecord[];
	onOpen: (r: NormalizedRecord) => void;
	onDelete: (r: NormalizedRecord) => void;
}) {
	const head = records[0];
	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			<div className="pktw-flex pktw-items-baseline pktw-gap-2.5 pktw-mb-1">
				<span className="pktw-text-[14px] pktw-font-semibold pktw-text-pk-foreground">
					{head.subjectBasename || subjectPath}
				</span>
				<span className="pktw-text-[11px] pktw-text-pk-foreground-faint pktw-font-mono pktw-truncate pktw-min-w-0">
					{subjectPath}
				</span>
				<span className="pktw-ml-auto pktw-text-[11px] pktw-text-pk-foreground-muted pktw-shrink-0">
					{records.length} review{records.length === 1 ? '' : 's'}
				</span>
			</div>
			<div className="pktw-flex pktw-flex-col pktw-gap-1.5">
				{records.map(r => (
					<ReviewRow key={r.id} record={r} onOpen={onOpen} onDelete={onDelete} />
				))}
			</div>
		</div>
	);
}

function ReviewRow({
	record,
	onOpen,
	onDelete,
}: {
	record: NormalizedRecord;
	onOpen: (r: NormalizedRecord) => void;
	onDelete: (r: NormalizedRecord) => void;
}) {
	const Icon = record.scope === 'vault' ? ShieldCheck : History;
	return (
		<div
			className={cn(
				'pktw-group pktw-flex pktw-items-center pktw-gap-3 pktw-px-3.5 pktw-py-2.5 pktw-rounded-lg pktw-transition-colors',
				'hover:pktw-bg-pk-background-secondary',
			)}
		>
			<button
				type="button"
				onClick={() => onOpen(record)}
				className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-items-center pktw-gap-3 pktw-text-left"
			>
				<Icon className="pktw-h-[14px] pktw-w-[14px] pktw-text-pk-foreground-faint pktw-shrink-0" />
				<div className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-flex-col">
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-min-w-0">
						<span className="pktw-text-[13px] pktw-font-medium pktw-text-pk-foreground pktw-truncate group-hover:pktw-text-pk-accent">
							{record.headline}
						</span>
						<span className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-shrink-0">
							· {relativeTime(record.completedAt)}
						</span>
						<ReviewStatusBadge status={record.status} />
					</div>
					<div className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-mt-0.5">
						{record.mini}
					</div>
				</div>
			</button>
			<button
				type="button"
				onClick={() => void onDelete(record)}
				title="Delete this review record"
				aria-label="Delete this review record"
				className={cn(
					'pktw-flex pktw-h-7 pktw-w-7 pktw-items-center pktw-justify-center pktw-rounded-md pktw-text-pk-foreground-faint pktw-transition-opacity',
					'pktw-opacity-0 group-hover:pktw-opacity-100',
					'hover:pktw-bg-pk-error-bg hover:pktw-text-pk-error',
				)}
			>
				<Trash2 className="pktw-h-[14px] pktw-w-[14px]" />
			</button>
		</div>
	);
}

/* -------------------------------------------------------------------------- */
/* Modal class                                                                */
/* -------------------------------------------------------------------------- */

export interface CopilotReviewHistoryModalOptions {
	/** 'document' (default) shows Copilot per-note reviews. 'vault' shows vault auto-reviews. */
	scope?: Scope;
	/** When set, the Document scope shows a "This note / All notes" toggle defaulting to "This note". */
	currentNotePath?: string | null;
	/** When provided, header shows a "Back" button that fires this callback (after closing the modal). */
	onBackToPicker?: () => void;
}

export class CopilotReviewHistoryModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(app: App, private readonly options: CopilotReviewHistoryModalOptions = {}) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.empty();
		this.modalEl.addClass('peak-copilot-review-history-modal');
		this.modalEl.addClass('peak-design-root');
		this.contentEl.addClass('pktw-root');
		this.contentEl.style.padding = '0';
		this.modalEl.style.width = '880px';
		this.modalEl.style.maxWidth = '92vw';
		this.modalEl.style.height = 'min(760px, calc(100vh - 96px))';
		this.modalEl.style.padding = '0';
		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				CopilotReviewHistoryContent,
				{
					scope: this.options.scope ?? 'document',
					currentNotePath: this.options.currentNotePath ?? null,
					onOpenRecord: async (record: NormalizedRecord) => {
						if (record.scope === 'vault') {
							this.close();
							openVaultReviewHistoryRecord(this.app, record.raw as VaultReviewHistoryRecord);
							return;
						}
						const doc = record.raw as CopilotReviewHistoryRecord;
						const { snapshot, chats } = await getCopilotReviewHistoryService().loadWithChats(doc);
						if (!snapshot) {
							new Notice('Could not load this review record.');
							return;
						}
						const file = this.app.vault.getAbstractFileByPath(doc.subjectPath);
						let ctx;
						if (file instanceof TFile) {
							const content = await this.app.vault.cachedRead(file);
							ctx = DocumentContextBuilder.build(this.app, file, content, undefined);
						} else {
							// Subject file no longer exists. Build a minimal stub ctx.
							ctx = {
								file: { path: doc.subjectPath, basename: doc.subjectBasename } as TFile,
								title: doc.subjectBasename,
								content: '',
								scope: 'full' as const,
								wordCount: 0,
								tags: [],
								links: [],
								backlinks: 0,
								headingCount: 0,
								isOrphan: true,
								frontmatter: {},
							};
						}
						this.close();
						new CopilotAutoRunModal(this.app, {
							tab: 'document',
							ctx,
							mode: doc.mode,
							initialSnapshot: snapshot,
							initialInsightChats: chats,
						}).open();
					},
					onClose: () => this.close(),
					onBackToPicker: this.options.onBackToPicker
						? () => {
							const cb = this.options.onBackToPicker!;
							this.close();
							cb();
						}
						: undefined,
				},
				AppContext.getInstance(),
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
