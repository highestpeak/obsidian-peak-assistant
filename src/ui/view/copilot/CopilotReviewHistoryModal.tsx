import { Modal, type App, TFile, Notice } from 'obsidian';
import React, { useEffect, useState } from 'react';
import { ChevronRight, History, RefreshCw, Trash2 } from 'lucide-react';
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
}> = ({ onOpenRecord, onClose }) => {
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

	const filtered = query.trim()
		? records.filter(r =>
			r.subjectBasename.toLowerCase().includes(query.toLowerCase())
			|| r.subjectPath.toLowerCase().includes(query.toLowerCase()),
		)
		: records;
	const grouped = groupBySubject(filtered);

	const handleDelete = async (record: CopilotReviewHistoryRecord) => {
		await getCopilotReviewHistoryService().delete(record);
		new Notice('Review deleted');
		setRefreshTick(t => t + 1);
	};

	return (
		<div className="pktw-flex pktw-h-full pktw-flex-col pktw-bg-background">
			<div className="pktw-flex pktw-items-start pktw-justify-between pktw-gap-4 pktw-border-b pktw-border-border pktw-p-4">
				<div className="pktw-flex pktw-min-w-0 pktw-items-start pktw-gap-3">
					<div className="pktw-flex pktw-h-9 pktw-w-9 pktw-items-center pktw-justify-center pktw-rounded-lg pktw-bg-pk-accent/10">
						<History className="pktw-h-5 pktw-w-5 pktw-text-pk-accent" />
					</div>
					<div className="pktw-flex pktw-min-w-0 pktw-flex-col pktw-gap-1">
						<span className="pktw-text-base pktw-font-semibold">All Auto Reviews</span>
						<span className="pktw-text-xs pktw-text-muted-foreground">
							{records.length} review{records.length === 1 ? '' : 's'} across {grouped.size} document{grouped.size === 1 ? '' : 's'}
						</span>
					</div>
				</div>
				<Button variant="ghost" size="sm" onClick={() => setRefreshTick(t => t + 1)} className="pktw-gap-1.5 pktw-text-xs">
					<RefreshCw className="pktw-h-3.5 pktw-w-3.5" />
					Refresh
				</Button>
			</div>

			<div className="pktw-border-b pktw-border-border pktw-p-4">
				<Input
					placeholder="Filter by document path or name..."
					value={query}
					onChange={e => setQuery(e.target.value)}
					autoFocus
				/>
			</div>

			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-4 pktw-space-y-4" style={{ userSelect: 'text' }}>
				{loading ? (
					<span className="pktw-block pktw-text-sm pktw-text-muted-foreground pktw-italic">Loading…</span>
				) : grouped.size === 0 ? (
					<span className="pktw-block pktw-rounded-lg pktw-border pktw-border-dashed pktw-border-border pktw-p-8 pktw-text-center pktw-text-sm pktw-text-muted-foreground">
						{query ? 'No reviews match your filter.' : 'No reviews yet. Run an Auto Review from any note to start.'}
					</span>
				) : (
					Array.from(grouped.entries()).map(([subjectPath, recs]) => (
						<div key={subjectPath} className="pktw-rounded-lg pktw-border pktw-border-border pktw-bg-muted/10">
							<div className="pktw-flex pktw-items-baseline pktw-gap-2 pktw-border-b pktw-border-border pktw-px-3 pktw-py-2">
								<span className="pktw-text-sm pktw-font-semibold pktw-text-foreground">{recs[0].subjectBasename || subjectPath}</span>
								<span className="pktw-text-[11px] pktw-text-muted-foreground">{subjectPath}</span>
								<span className="pktw-flex-1" />
								<span className="pktw-text-[10px] pktw-text-muted-foreground">
									{recs.length} review{recs.length === 1 ? '' : 's'}
								</span>
							</div>
							<div className="pktw-flex pktw-flex-col">
								{recs.map((r, i) => (
									<div
										key={r.id}
										className={cn(
											'pktw-flex pktw-items-center pktw-gap-3 pktw-px-3 pktw-py-2',
											i < recs.length - 1 && 'pktw-border-b pktw-border-border/60',
										)}
									>
										<button
											type="button"
											onClick={() => onOpenRecord(r)}
											className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-items-center pktw-gap-3 pktw-rounded pktw-text-left hover:pktw-text-pk-accent"
										>
											<History className="pktw-h-3.5 pktw-w-3.5 pktw-text-muted-foreground" />
											<div className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-flex-col">
												<span className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-font-medium pktw-text-foreground">
													<span className="pktw-truncate">{r.headline?.trim() || (r.mode === 'fast' ? 'Fast review' : 'Auto review')}</span>
													<span className="pktw-shrink-0 pktw-text-muted-foreground">· {relativeTime(r.completedAt)}</span>
													<ReviewStatusBadge status={r.status} />
												</span>
												<span className="pktw-text-[10px] pktw-text-muted-foreground">
													{r.insightCount}i · {r.changeCount}c · {r.sourceCount}s · {r.roundCount}r · {r.turnCount} turns
												</span>
											</div>
											<ChevronRight className="pktw-h-3.5 pktw-w-3.5 pktw-text-muted-foreground" />
										</button>
										<Button
											variant="ghost"
											size="icon"
											className="pktw-h-7 pktw-w-7"
											onClick={() => void handleDelete(r)}
											title="Delete this review record"
										>
											<Trash2 className="pktw-h-3.5 pktw-w-3.5 pktw-text-muted-foreground" />
										</Button>
									</div>
								))}
							</div>
						</div>
					))
				)}
			</div>

			<div className="pktw-flex pktw-items-center pktw-justify-end pktw-border-t pktw-border-border pktw-p-3">
				<Button variant="outline" onClick={onClose}>Close</Button>
			</div>
		</div>
	);
};

export class CopilotReviewHistoryModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;

	constructor(app: App) {
		super(app);
	}

	onOpen(): void {
		this.contentEl.empty();
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
