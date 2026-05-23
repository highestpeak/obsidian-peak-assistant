import { Modal, type App, TFile, Notice } from 'obsidian';
import React, { useEffect, useMemo, useState } from 'react';
import { History, RefreshCw, Search, Trash2 } from 'lucide-react';
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
import { DocumentContextBuilder } from '@/service/copilot/DocumentContextBuilder';
import { CopilotAutoRunModal } from './CopilotAutoRunModal';
import { ReviewStatusBadge } from './review/ReviewStatusBadge';

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

function groupBySubject(records: CopilotReviewHistoryRecord[]): Map<string, CopilotReviewHistoryRecord[]> {
	const out = new Map<string, CopilotReviewHistoryRecord[]>();
	for (const r of records) {
		const key = r.subjectPath || '(unknown)';
		const arr = out.get(key) ?? [];
		arr.push(r);
		out.set(key, arr);
	}
	return out;
}

const CopilotReviewHistoryContent: React.FC<{
	onOpenRecord: (record: CopilotReviewHistoryRecord) => void;
	onClose: () => void;
}> = ({ onOpenRecord }) => {
	const [records, setRecords] = useState<CopilotReviewHistoryRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [query, setQuery] = useState('');
	const [refreshTick, setRefreshTick] = useState(0);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		getCopilotReviewHistoryService()
			.listAll(500)
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
		return () => {
			cancelled = true;
		};
	}, [refreshTick]);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return records;
		return records.filter(r =>
			r.subjectBasename.toLowerCase().includes(q) || r.subjectPath.toLowerCase().includes(q),
		);
	}, [records, query]);

	const grouped = useMemo(() => groupBySubject(filtered), [filtered]);

	const handleDelete = async (record: CopilotReviewHistoryRecord) => {
		await getCopilotReviewHistoryService().delete(record);
		new Notice('Review deleted');
		setRefreshTick(t => t + 1);
	};

	return (
		<div className="pktw-flex pktw-h-full pktw-flex-col pktw-bg-pk-background">

			{/* Header */}
			<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-4 pktw-px-7 pktw-pt-6 pktw-pb-4">
				<div className="pktw-flex pktw-min-w-0 pktw-items-center pktw-gap-3">
					<div className="pktw-flex pktw-h-10 pktw-w-10 pktw-items-center pktw-justify-center pktw-rounded-xl pktw-bg-pk-accent-tint pktw-text-pk-accent pktw-shrink-0">
						<History className="pktw-h-[18px] pktw-w-[18px]" />
					</div>
					<div className="pktw-flex pktw-min-w-0 pktw-flex-col">
						<span className="pktw-text-[18px] pktw-font-bold pktw-text-pk-foreground pktw-leading-tight">All Auto Reviews</span>
						<span className="pktw-text-[12px] pktw-text-pk-foreground-muted pktw-mt-0.5">
							{records.length} review{records.length === 1 ? '' : 's'} across {grouped.size} document{grouped.size === 1 ? '' : 's'}
						</span>
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

			{/* Search */}
			<div className="pktw-px-7 pktw-pb-4">
				<div className="pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-4 pktw-py-2.5 pktw-bg-pk-background-secondary pktw-border pktw-border-pk-border pktw-rounded-full">
					<Search className="pktw-w-4 pktw-h-4 pktw-text-pk-foreground-faint pktw-shrink-0" />
					<Input
						placeholder="Filter by document path or name…"
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
				) : grouped.size === 0 ? (
					<div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-py-16 pktw-text-center pktw-text-pk-foreground-muted">
						<div className="pktw-w-12 pktw-h-12 pktw-rounded-full pktw-bg-pk-background-secondary pktw-flex pktw-items-center pktw-justify-center pktw-mb-3">
							<History className="pktw-w-5 pktw-h-5 pktw-text-pk-foreground-faint" />
						</div>
						<div className="pktw-text-[13px]">
							{query ? 'No reviews match your filter.' : 'No reviews yet. Run an Auto Review from any note to start.'}
						</div>
					</div>
				) : (
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

function ReviewGroup({
	subjectPath,
	records,
	onOpen,
	onDelete,
}: {
	subjectPath: string;
	records: CopilotReviewHistoryRecord[];
	onOpen: (r: CopilotReviewHistoryRecord) => void;
	onDelete: (r: CopilotReviewHistoryRecord) => void;
}) {
	const head = records[0];
	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			{/* Group title — no border, just text hierarchy */}
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

			{/* Review rows */}
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
	record: CopilotReviewHistoryRecord;
	onOpen: (r: CopilotReviewHistoryRecord) => void;
	onDelete: (r: CopilotReviewHistoryRecord) => void;
}) {
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
				<History className="pktw-h-[14px] pktw-w-[14px] pktw-text-pk-foreground-faint pktw-shrink-0" />
				<div className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-flex-col">
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-min-w-0">
						<span className="pktw-text-[13px] pktw-font-medium pktw-text-pk-foreground pktw-truncate group-hover:pktw-text-pk-accent">
							{record.headline?.trim() || (record.mode === 'fast' ? 'Fast review' : 'Auto review')}
						</span>
						<span className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-shrink-0">
							· {relativeTime(record.completedAt)}
						</span>
						<ReviewStatusBadge status={record.status} />
					</div>
					<div className="pktw-text-[11px] pktw-text-pk-foreground-muted pktw-mt-0.5">
						{record.insightCount}i · {record.changeCount}c · {record.sourceCount}s · {record.roundCount}r · {record.turnCount} turns
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

export class CopilotReviewHistoryModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(app: App) {
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
					onOpenRecord: async (record: CopilotReviewHistoryRecord) => {
						const { snapshot, chats } = await getCopilotReviewHistoryService().loadWithChats(record);
						if (!snapshot) {
							new Notice('Could not load this review record.');
							return;
						}
						const file = this.app.vault.getAbstractFileByPath(record.subjectPath);
						let ctx;
						if (file instanceof TFile) {
							const content = await this.app.vault.cachedRead(file);
							ctx = DocumentContextBuilder.build(this.app, file, content, undefined);
						} else {
							// Subject file no longer exists. Build a minimal stub ctx.
							ctx = {
								file: { path: record.subjectPath, basename: record.subjectBasename } as TFile,
								title: record.subjectBasename,
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
							mode: record.mode,
							initialSnapshot: snapshot,
							initialInsightChats: chats,
						}).open();
					},
					onClose: () => this.close(),
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
