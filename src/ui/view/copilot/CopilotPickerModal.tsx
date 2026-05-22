import { Modal, Platform } from 'obsidian';
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, History, Search, Sparkles, Zap } from 'lucide-react';
import {
	getCopilotReviewHistoryService,
	type CopilotReviewHistoryRecord,
} from '@/service/copilot/CopilotReviewHistoryService';
import { ReactRenderer } from '@/ui/react/ReactRenderer';
import { createReactElementWithServices } from '@/ui/react/ReactElementFactory';
import { AppContext } from '@/app/context/AppContext';
import { CopilotActionRegistry, type CopilotAction, type DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { DocumentContextBuilder } from '@/service/copilot/DocumentContextBuilder';
import { CopilotResultModal } from '@/ui/view/copilot/CopilotResultModal';
import { CopilotAutoRunModal } from '@/ui/view/copilot/CopilotAutoRunModal';
import { CopilotReviewHistoryModal } from '@/ui/view/copilot/CopilotReviewHistoryModal';
import { getSelectedTextFromActiveEditor } from '@/core/utils/obsidian-utils';
import { cn } from '@/ui/react/lib/utils';
import { Button } from '@/ui/component/shared-ui/button';
import { Input } from '@/ui/component/shared-ui/input';
import type { IntentTabId } from '@/service/copilot/intent-hub';
import { buildCopilotCommandModel, type CopilotActionListItem } from './copilot-command-model';
import { ReviewStatusBadge } from '@/ui/view/copilot/review/ReviewStatusBadge';
import {
	VaultContextLine,
	VaultIntentCard,
	VaultReviewHistoryList,
	useVaultTabState,
} from '@/ui/view/copilot/vault/VaultPickerSections';
import {
	getVaultReviewReportService,
	type VaultReviewHistoryRecord,
} from '@/service/copilot/vault/VaultReviewReportService';
import { VaultAutoRunModal, openVaultReviewHistoryRecord } from '@/ui/view/copilot/vault/VaultAutoRunModal';

interface CopilotPickerOptions {
	initialTab?: IntentTabId;
}

const CopilotPickerContent: React.FC<{
	onSelect: (action: CopilotAction) => void;
	onAuto: (tab: IntentTabId, mode: 'fast' | 'complete') => void;
	onOpenHistoryRecord: (record: CopilotReviewHistoryRecord) => void;
	onOpenAllHistory: () => void;
	onOpenVaultRecord: (record: VaultReviewHistoryRecord) => void;
	ctx: DocumentContext | null;
	initialTab: IntentTabId;
}> = ({ onSelect, onAuto, onOpenHistoryRecord, onOpenAllHistory, onOpenVaultRecord, ctx, initialTab }) => {
	const registry = CopilotActionRegistry.getInstance();
	const [activeTab, setActiveTab] = useState<IntentTabId>(initialTab);
	const [query, setQuery] = useState('');
	// Per-tab expanded state. The React tree is recreated each time the modal opens,
	// so this naturally resets on close. Setting tab is computed (always expanded),
	// only Document/Vault store user-toggled state here.
	const [showAllByTab, setShowAllByTab] = useState<Partial<Record<IntentTabId, boolean>>>({});
	// Vault tab state (fingerprint + 5-state derivation)
	const vaultState = useVaultTabState(0);
	// Vault review history list — fetched independently of doc-scope reviews
	const [vaultRecords, setVaultRecords] = useState<VaultReviewHistoryRecord[]>([]);
	const [vaultRecordsLoading, setVaultRecordsLoading] = useState(true);
	useEffect(() => {
		if (activeTab !== 'vault') return;
		let cancelled = false;
		setVaultRecordsLoading(true);
		getVaultReviewReportService().listAll(8).then(list => {
			if (!cancelled) {
				setVaultRecords(list);
				setVaultRecordsLoading(false);
			}
		}).catch(err => {
			console.warn('[CopilotPickerContent] vault records fetch failed', err);
			if (!cancelled) {
				setVaultRecords([]);
				setVaultRecordsLoading(false);
			}
		});
		return () => { cancelled = true; };
	}, [activeTab]);
	const model = useMemo(() => buildCopilotCommandModel({
		ctx,
		activeTab,
		query,
		actions: registry.getAll(),
	}), [ctx, activeTab, query, registry]);
	const isMobile = Platform.isMobile;
	const autoDisabled = !ctx || isMobile;
	const autoDisabledReason = isMobile
		? 'Auto Review is not available on mobile yet.'
		: !ctx
			? 'Open a document first to run Auto.'
			: undefined;
	// Setting tab has no AutoIntentCard/history above, so default to full catalog
	// expanded — otherwise the tab looks half-empty.
	const showAll = activeTab === 'setting' ? true : (showAllByTab[activeTab] ?? false);
	const showCatalog = showAll || query.trim().length > 0;
	const setShowAll = (value: boolean) => {
		if (activeTab === 'setting') return; // setting is always-on, ignore writes
		setShowAllByTab(prev => ({ ...prev, [activeTab]: value }));
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-bg-background">
			<div className="pktw-grid pktw-grid-cols-3 pktw-bg-muted/50 pktw-border-b pktw-border-border">
				{model.tabs.map(tab => (
					<Button
						key={tab.id}
						variant="ghost"
						onClick={() => setActiveTab(tab.id)}
						className={cn(
							'pktw-relative pktw-flex pktw-h-[72px] pktw-flex-col pktw-items-center pktw-justify-center pktw-gap-1 pktw-rounded-none pktw-bg-transparent pktw-text-sm pktw-font-semibold',
							activeTab === tab.id
								? 'pktw-text-pk-accent pktw-bg-background after:pktw-content-[""] after:pktw-absolute after:pktw-left-0 after:pktw-right-0 after:pktw-bottom-0 after:pktw-h-[3px] after:pktw-bg-pk-accent'
								: 'pktw-text-muted-foreground',
						)}
					>
						<span>{tab.label}</span>
						<span className="pktw-text-[11px] pktw-font-medium pktw-text-muted-foreground">{tab.subtitle}</span>
					</Button>
				))}
			</div>

			<div className="pktw-border-b pktw-border-border pktw-p-5 pktw-space-y-3">
				<div className="pktw-flex pktw-items-center pktw-gap-3 pktw-rounded-full pktw-border pktw-border-border pktw-bg-background pktw-px-4 pktw-py-2 pktw-shadow-sm">
					<Search className="pktw-h-4 pktw-w-4 pktw-text-muted-foreground" />
					<Input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={model.activeTab.searchPlaceholder}
						className="pktw-h-10 pktw-flex-1 pktw-border-0 pktw-bg-transparent pktw-px-0 pktw-text-sm focus-visible:pktw-ring-0"
						autoFocus
					/>
					<span className="pktw-rounded-full pktw-bg-pk-accent/10 pktw-px-2 pktw-py-1 pktw-text-[11px] pktw-font-medium pktw-text-pk-accent">
						{activeTab}
					</span>
				</div>
				{activeTab === 'vault'
					? <VaultContextLine fingerprint={vaultState.fingerprint} lastRecord={vaultState.lastRecord} />
					: <span className="pktw-block pktw-text-xs pktw-text-muted-foreground">{model.contextLine}</span>
				}
			</div>

			<div className="pktw-flex-1 pktw-overflow-y-auto pktw-p-5 pktw-space-y-4">
				{activeTab === 'vault' ? (
					<>
						<VaultIntentCard
							state={vaultState}
							onAuto={() => onAuto('vault', 'complete')}
							onFast={() => onAuto('vault', 'fast')}
							onOpenLast={() => vaultState.lastRecord && onOpenVaultRecord(vaultState.lastRecord)}
						/>
						<div className="pktw-space-y-2">
							<div className="pktw-flex pktw-items-center pktw-justify-between">
								<span className="pktw-text-[11px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">
									Past vault reviews
								</span>
								<Button
									variant="ghost"
									size="sm"
									className="pktw-h-7 pktw-gap-1.5 pktw-text-[11px]"
									onClick={onOpenAllHistory}
								>
									<History className="pktw-h-3.5 pktw-w-3.5" />
									All reviews
								</Button>
							</div>
							<VaultReviewHistoryList
								records={vaultRecords}
								loading={vaultRecordsLoading}
								onOpen={onOpenVaultRecord}
							/>
						</div>
					</>
				) : (
					<>
						{activeTab !== 'setting' && (
							<AutoIntentCard
								tabLabel={model.activeTab.label}
								autoLabel={model.activeTab.autoLabel}
								disabled={autoDisabled}
								disabledReason={autoDisabledReason}
								onAuto={() => onAuto(activeTab, 'complete')}
								onFast={() => onAuto(activeTab, 'fast')}
							/>
						)}
						{activeTab !== 'setting' && (
							<DocumentReviewHistory
								scope="document"
								subjectPath={ctx?.file.path ?? null}
								onOpenRecord={onOpenHistoryRecord}
								onOpenAll={onOpenAllHistory}
							/>
						)}
					</>
				)}
				<RecommendedActions actions={model.recommendedActions} onSelect={onSelect} />
				{showCatalog ? (
					<CapabilityList actions={model.visibleActions} onSelect={onSelect} />
				) : (
					<Button
						variant="ghost"
						className="pktw-h-12 pktw-w-full pktw-justify-between pktw-rounded-lg pktw-border pktw-border-border pktw-px-4"
						onClick={() => setShowAll(true)}
					>
						<span className="pktw-text-sm pktw-font-medium">Show all capabilities</span>
						<ChevronRight className="pktw-h-4 pktw-w-4 pktw-text-muted-foreground" />
					</Button>
				)}
			</div>
		</div>
	);
};

function AutoIntentCard({
	tabLabel,
	autoLabel,
	disabled,
	disabledReason,
	onAuto,
	onFast,
}: {
	tabLabel: string;
	autoLabel: string;
	disabled: boolean;
	disabledReason?: string;
	onAuto: () => void;
	onFast: () => void;
}) {
	return (
		<div className="pktw-rounded-xl pktw-border pktw-border-pk-accent/30 pktw-bg-pk-highlight/30 pktw-p-4">
			<div className="pktw-flex pktw-items-center pktw-gap-3">
				<div className="pktw-flex pktw-h-10 pktw-w-10 pktw-items-center pktw-justify-center pktw-rounded-full pktw-bg-pk-accent/10">
					<Sparkles className="pktw-h-5 pktw-w-5 pktw-text-pk-accent" />
				</div>
				<div className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-flex-col pktw-gap-0.5">
					<span className="pktw-text-sm pktw-font-semibold">Auto: let the agent decide</span>
					<span className="pktw-text-xs pktw-text-muted-foreground">
						{tabLabel} sets the initial scope. Fast = one focused pass. {autoLabel} = up to 3 rounds with compact.
					</span>
				</div>
				<Button
					variant="outline"
					className="pktw-h-10 pktw-gap-2 pktw-rounded-lg pktw-font-semibold"
					onClick={onFast}
					disabled={disabled}
					title={disabled ? disabledReason : 'Single-pass review (~8 turns).'}
				>
					<Zap className="pktw-h-4 pktw-w-4" />
					Fast
				</Button>
				<Button
					className="pktw-h-10 pktw-min-w-[116px] pktw-gap-2 pktw-rounded-lg pktw-font-semibold"
					onClick={onAuto}
					disabled={disabled}
					title={disabled ? disabledReason : 'Up to 3 rounds with cross-round compaction.'}
				>
					<Sparkles className="pktw-h-4 pktw-w-4" />
					{disabled ? (disabledReason?.includes('mobile') ? 'Desktop only' : 'Open note') : autoLabel}
				</Button>
			</div>
		</div>
	);
}

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

function DocumentReviewHistory({
	scope,
	subjectPath,
	onOpenRecord,
	onOpenAll,
}: {
	scope: 'document' | 'vault';
	subjectPath: string | null;
	onOpenRecord: (record: CopilotReviewHistoryRecord) => void;
	onOpenAll: () => void;
}) {
	const [records, setRecords] = useState<CopilotReviewHistoryRecord[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		const svc = getCopilotReviewHistoryService();
		// Document tab → reviews of THIS note that originated from a document-scoped trigger.
		// Vault tab → all vault-scoped reviews (regardless of subject note).
		const promise = scope === 'vault'
			? svc.listAll(8, 'vault')
			: (subjectPath ? svc.listForSubject(subjectPath, 8, 'document') : Promise.resolve([] as CopilotReviewHistoryRecord[]));
		promise.then(list => {
			if (!cancelled) {
				setRecords(list);
				setLoading(false);
			}
		}).catch(err => {
			if (!cancelled) {
				console.warn('[CopilotPickerModal] history fetch failed', err);
				setRecords([]);
				setLoading(false);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [scope, subjectPath]);

	const title = scope === 'vault' ? 'Recent reviews across vault' : 'Past reviews of this note';
	const emptyLabel = scope === 'vault'
		? 'No reviews recorded yet. Run Auto or Fast on a note to start.'
		: 'No reviews of this note yet. Run Auto or Fast to start one.';

	const isEmpty = !loading && records.length === 0;

	return (
		<div className="pktw-space-y-2">
			<div className="pktw-flex pktw-items-center pktw-justify-between">
				<span className="pktw-text-[11px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">
					{title}
				</span>
				<Button
					variant="ghost"
					size="sm"
					className="pktw-h-7 pktw-gap-1.5 pktw-text-[11px]"
					onClick={onOpenAll}
				>
					<History className="pktw-h-3.5 pktw-w-3.5" />
					All reviews
				</Button>
			</div>
			{loading ? (
				<span className="pktw-block pktw-text-xs pktw-text-muted-foreground pktw-italic">Loading history…</span>
			) : isEmpty ? (
				<span className="pktw-block pktw-rounded-lg pktw-border pktw-border-dashed pktw-border-border pktw-px-3 pktw-py-2 pktw-text-[11px] pktw-text-muted-foreground">
					{emptyLabel}
				</span>
			) : (
				<div className="pktw-flex pktw-flex-col">
					{records.map(r => (
						<div
							key={r.id}
							role="button"
							tabIndex={0}
							onClick={() => onOpenRecord(r)}
							onKeyDown={e => {
								if (e.key === 'Enter' || e.key === ' ') {
									e.preventDefault();
									onOpenRecord(r);
								}
							}}
							className="pktw-group pktw-flex pktw-cursor-pointer pktw-items-center pktw-gap-3 pktw-rounded-md pktw-px-3 pktw-py-2 pktw-text-left pktw-transition-colors hover:pktw-bg-pk-accent/8 hover:pktw-text-pk-accent"
						>
							<History className="pktw-h-3.5 pktw-w-3.5 pktw-shrink-0 pktw-text-muted-foreground group-hover:pktw-text-pk-accent" />
							<div className="pktw-flex pktw-min-w-0 pktw-flex-1 pktw-flex-col">
								<span className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-xs pktw-text-foreground group-hover:pktw-text-pk-accent">
									<span className="pktw-truncate">{r.headline?.trim() || (r.mode === 'fast' ? 'Fast review' : 'Auto review')}</span>
									<span className="pktw-shrink-0 pktw-text-muted-foreground">· {relativeTime(r.completedAt)}</span>
									<ReviewStatusBadge status={r.status} />
								</span>
								<span className="pktw-text-[10px] pktw-text-muted-foreground">
									{r.insightCount} insight{r.insightCount === 1 ? '' : 's'} · {r.changeCount} change{r.changeCount === 1 ? '' : 's'} · {r.sourceCount} source{r.sourceCount === 1 ? '' : 's'} · {r.roundCount} round{r.roundCount === 1 ? '' : 's'}
								</span>
							</div>
							<ChevronRight className="pktw-h-3.5 pktw-w-3.5 pktw-text-muted-foreground/60 pktw-opacity-0 group-hover:pktw-opacity-100 group-hover:pktw-text-pk-accent" />
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function RecommendedActions({
	actions,
	onSelect,
}: {
	actions: CopilotActionListItem[];
	onSelect: (action: CopilotAction) => void;
}) {
	if (actions.length === 0) return null;

	return (
		<div className="pktw-space-y-2">
			<span className="pktw-text-[11px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">Recommended now</span>
			<div className="pktw-grid pktw-grid-cols-3 pktw-gap-2">
				{actions.map(item => <CapabilityButton key={item.action.id} item={item} onSelect={onSelect} />)}
			</div>
		</div>
	);
}

function CapabilityList({
	actions,
	onSelect,
}: {
	actions: CopilotActionListItem[];
	onSelect: (action: CopilotAction) => void;
}) {
	return (
		<div className="pktw-space-y-2">
			<span className="pktw-text-[11px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground">All capabilities</span>
			{actions.length === 0 ? (
				<span className="pktw-block pktw-rounded-lg pktw-border pktw-border-dashed pktw-border-border pktw-p-8 pktw-text-center pktw-text-xs pktw-text-muted-foreground">
					No matching capability in this tab.
				</span>
			) : (
				<div className="pktw-grid pktw-grid-cols-3 pktw-gap-2">
					{actions.map(item => <CapabilityButton key={item.action.id} item={item} onSelect={onSelect} />)}
				</div>
			)}
		</div>
	);
}

function CapabilityButton({
	item,
	onSelect,
}: {
	item: CopilotActionListItem;
	onSelect: (action: CopilotAction) => void;
}) {
	const Icon = item.action.icon;
	return (
		<Button
			variant="ghost"
			disabled={!!item.disabledReason}
			className={cn(
				'pktw-h-auto pktw-min-h-[72px] pktw-whitespace-normal pktw-justify-start pktw-items-start pktw-gap-3 pktw-p-3 pktw-border pktw-border-border pktw-rounded-lg pktw-text-left hover:pktw-bg-accent/60',
				item.recommended && 'pktw-border-pk-accent/40 pktw-bg-pk-highlight/40',
			)}
			onClick={() => onSelect(item.action)}
		>
			<Icon className="pktw-w-4 pktw-h-4 pktw-mt-0.5 pktw-flex-shrink-0 pktw-text-pk-accent" />
			<span className="pktw-flex pktw-flex-col pktw-gap-1 pktw-min-w-0">
				<span className="pktw-text-sm pktw-font-medium pktw-text-foreground">{item.action.label}</span>
				<span className="pktw-text-xs pktw-leading-snug pktw-text-muted-foreground">
					{item.disabledReason ?? item.action.description}
				</span>
			</span>
		</Button>
	);
}

export class CopilotPickerModal extends Modal {
	private reactRenderer: ReactRenderer | null = null;
	private openToken = 0;
	private closed = true;

	constructor(private appContext: AppContext, private options: CopilotPickerOptions = {}) {
		super(appContext.app);
	}

	async onOpen(): Promise<void> {
		const token = ++this.openToken;
		this.closed = false;
		this.contentEl.empty();
		this.modalEl.addClass('peak-copilot-picker-modal');
		this.contentEl.addClass('pktw-root');
		this.modalEl.style.width = '980px';
		this.modalEl.style.maxWidth = '94vw';
		this.modalEl.style.height = 'min(720px, calc(100vh - 96px))';
		this.modalEl.style.padding = '0';
		this.contentEl.style.padding = '0';

		const app = this.appContext.app;
		const file = app.workspace.getActiveFile();
		let ctx: DocumentContext | null = null;
		if (file) {
			const content = await app.vault.cachedRead(file);
			if (this.closed || token !== this.openToken) return;
			const selected = getSelectedTextFromActiveEditor(app) ?? undefined;
			ctx = DocumentContextBuilder.build(app, file, content, selected);
		}
		if (this.closed || token !== this.openToken) return;

		this.reactRenderer = new ReactRenderer(this.containerEl);
		this.reactRenderer.render(
			createReactElementWithServices(
				CopilotPickerContent,
				{
					ctx,
					initialTab: this.options.initialTab ?? 'document',
					onSelect: (action: CopilotAction) => {
						if (!ctx) return;
						this.close();
						new CopilotResultModal(app, { action, ctx }).open();
					},
					onAuto: (tab: IntentTabId, mode: 'fast' | 'complete') => {
						this.close();
						if (tab === 'vault') {
							new VaultAutoRunModal(app, { mode }).open();
							return;
						}
						if (!ctx) return;
						new CopilotAutoRunModal(app, { tab, ctx, mode }).open();
					},
					onOpenHistoryRecord: async (record: CopilotReviewHistoryRecord) => {
						if (!ctx) return;
						this.close();
						const svc = getCopilotReviewHistoryService();
						const { snapshot, chats } = await svc.loadWithChats(record);
						if (!snapshot) return;
						new CopilotAutoRunModal(app, {
							tab: this.options.initialTab ?? 'document',
							ctx,
							mode: record.mode,
							initialSnapshot: snapshot,
							initialInsightChats: chats,
						}).open();
					},
					onOpenAllHistory: () => {
						this.close();
						new CopilotReviewHistoryModal(app).open();
					},
					onOpenVaultRecord: (record: VaultReviewHistoryRecord) => {
						this.close();
						openVaultReviewHistoryRecord(app, record);
					},
				},
				this.appContext,
			),
		);
	}

	onClose(): void {
		this.closed = true;
		this.openToken++;
		const r = this.reactRenderer;
		this.reactRenderer = null;
		if (r) setTimeout(() => { r.unmount(); this.contentEl.empty(); }, 0);
		else this.contentEl.empty();
	}
}
