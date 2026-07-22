import { Platform, Notice } from 'obsidian';
import React, { useEffect, useMemo, useState } from 'react';
import { RelatedNotesPanel } from '@/ui/view/ambient-panel/RelatedNotesPanel';
import { FileAtlasPanel, type AtlasMode } from '@/ui/view/file-atlas/FileAtlasPanel';
import type { FileAtlasHostPort } from '@/ui/view/file-atlas/FileAtlasHostPort';
import {
	ChevronRight,
	History,
	Search,
	ListChecks,
	Sliders,
	HelpCircle,
} from 'lucide-react';
import {
	type CopilotReviewHistoryRecord,
} from '@/service/copilot/CopilotReviewHistoryService';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { type CopilotAction, type DocumentContext } from '@/service/copilot/CopilotActionRegistry';
import { getCopilotActionIcon } from '@/ui/view/copilot/copilot-action-surfaces';
import { cn } from '@/ui/react/lib/utils';
import { Button } from '@/ui/component/shared-ui/button';
import { Input } from '@/ui/component/shared-ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/ui/component/shared-ui/tabs';
import { Pill } from '@/ui/component/shared-ui/pill';
import type { IntentTabId } from '@/service/copilot/intent-hub';
import { MODE_LABELS, type ReviewMode } from '@/service/copilot/CopilotMetaAgentStream';
import { buildCopilotCommandModel, type CopilotActionListItem } from './copilot-command-model';
import { ReviewStatusBadge } from '@/ui/view/copilot/review/ReviewStatusBadge';
import {
	VaultContextLine,
	VaultReviewHistoryList,
	useVaultTabState,
} from '@/ui/view/copilot/vault/VaultPickerSections';
import type { VaultReviewHistoryRecord } from '@/service/copilot/vault/VaultReviewReportService';
import { PickerReadinessCard, SuggestedIntentRow } from './PickerReadinessCard';
import {
	documentReadiness,
	vaultReadiness,
	settingReadiness,
} from './PickerReadinessAdapters';

// Copilot Modal tab bar — three tabs, all focused on the current document.
// Vault Intelligence moved to Search Modal (rendered via `hideTabBar=true`,
// initialTab='vault'). Settings moved to command palette only.
const SCOPE_TABS: Array<{ id: IntentTabId; title: string; subtitle: string; placeholder: string }> = [
	{ id: 'atlas',    title: 'Atlas',            subtitle: '= Structure',  placeholder: 'Search this document’s blocks, links, and saved insights...' },
	{ id: 'document', title: 'Document Copilot', subtitle: '= Copilot',    placeholder: 'Search or ask in current document... (@ note, ? help)' },
	{ id: 'ambient',  title: 'Ambient',          subtitle: '= Related',    placeholder: 'Related notes around your cursor...' },
];

export const CopilotPickerContent: React.FC<{
	onSelect: (action: CopilotAction) => void;
	onAuto: (tab: IntentTabId, mode: 'fast' | 'complete') => void;
	onOpenHistoryRecord: (record: CopilotReviewHistoryRecord) => void;
	/**
	 * Routes the user from the "All reviews" link in the Recent column.
	 * The `scope` matches the tab the user is currently on, NOT the tab the
	 * modal was opened with — without this, switching to Vault and clicking
	 * "All reviews" would land in Document Reviews. See image #65 regression.
	 */
	onOpenAllHistory: (scope: IntentTabId) => void;
	onOpenVaultRecord: (record: VaultReviewHistoryRecord) => void;
	ctx: DocumentContext | null;
	initialTab: IntentTabId;
	/**
	 * When true, the internal `<Tabs>` bar is hidden. Used by Search Modal to
	 * mount the picker in a locked-scope mode (e.g. Vault Intelligence panel).
	 */
	hideTabBar?: boolean;
	/** Closes the surrounding modal (used by Atlas heading-jump). */
	onClose?: () => void;
}> = ({ onSelect, onAuto, onOpenHistoryRecord, onOpenAllHistory, onOpenVaultRecord, ctx, initialTab, hideTabBar, onClose }) => {
	// T11B: action catalog comes from the app-owned runtime, injected via
	// ServiceContext so this file stays inside the T11P/T11Q ui→app floor
	// (no `@/app/**` imports in `src/ui/**`). Mounting before the runtime is
	// bound renders an empty list rather than throwing inside React.
	const { copilotActionRuntime, vaultReviewRuntime } = useServiceContext();
	const allActions: CopilotAction[] = useMemo(
		() => copilotActionRuntime?.getAll() ?? [],
		[copilotActionRuntime],
	);
	const [activeTab, setActiveTab] = useState<IntentTabId>(initialTab);
	const [query, setQuery] = useState('');
	const [showAllByTab, setShowAllByTab] = useState<Partial<Record<IntentTabId, boolean>>>({});
	const vaultState = useVaultTabState(0);
	const [vaultRecords, setVaultRecords] = useState<VaultReviewHistoryRecord[]>([]);
	const [vaultRecordsLoading, setVaultRecordsLoading] = useState(true);

	// File Atlas (Atlas tab) reveal/clipboard go through the app-composed
	// navigation port, keeping runtime ownership out of the UI layer.
	const { vaultNavigation } = useServiceContext();
	const atlasHost = useMemo<FileAtlasHostPort>(() => ({
		revealLine: (line: number) => {
			const path = ctx?.file.path;
			if (path && vaultNavigation) {
				void vaultNavigation.openVaultPathAtLine(path, { line, newLeaf: false });
			}
			onClose?.();
		},
		copyToClipboard: (text: string) => {
			void navigator.clipboard?.writeText(text);
		},
		notify: (message: string) => {
			new Notice(message);
		},
	}), [vaultNavigation, ctx?.file.path, onClose]);

	useEffect(() => {
		if (activeTab !== 'vault') return;
		// vaultReviewRuntime injected via ServiceContext (see destructure at
		// the top of this component). Null before the app layer registers it.
		if (!vaultReviewRuntime) {
			setVaultRecords([]);
			setVaultRecordsLoading(false);
			return;
		}
		let cancelled = false;
		setVaultRecordsLoading(true);
		vaultReviewRuntime.listReports(8).then(list => {
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
	}, [activeTab, vaultReviewRuntime]);

	const model = useMemo(() => buildCopilotCommandModel({
		ctx,
		activeTab,
		query,
		actions: allActions,
	}), [ctx, activeTab, query, allActions]);

	const isMobile = Platform.isMobile;
	const tabMeta = SCOPE_TABS.find(t => t.id === activeTab) ?? SCOPE_TABS[0];
	const showAll = showAllByTab[activeTab] ?? false;
	const showCatalog = showAll || query.trim().length > 0;
	const setShowAll = (value: boolean) => {
		setShowAllByTab(prev => ({ ...prev, [activeTab]: value }));
	};

	const readinessProps = useMemo(() => {
		switch (activeTab) {
			case 'document':
				return documentReadiness({
					ctx,
					isMobile,
					onAuto: () => onAuto('document', 'complete'),
					onFast: () => onAuto('document', 'fast'),
				});
			case 'vault':
				return vaultReadiness({
					fingerprint: vaultState.fingerprint,
					lastRecord: vaultState.lastRecord,
					freshness: vaultState.freshness,
					filesChanged: vaultState.filesChanged,
					wordDeltaPct: vaultState.wordDeltaPct,
					onAuto: () => onAuto('vault', 'complete'),
					onFast: () => onAuto('vault', 'fast'),
					onOpenLast: () => vaultState.lastRecord && onOpenVaultRecord(vaultState.lastRecord),
				});
			case 'setting':
				return settingReadiness({
					// TODO(Phase D): wire to actual SystemDiagnosticsService
					onRunCheck: () => setShowAll(true),
					onViewDiagnostics: () => setShowAll(true),
				});
		}
	}, [activeTab, ctx, isMobile, vaultState, onAuto, onOpenVaultRecord]);

	// The three document-scoped tabs (Atlas / Copilot / Ambient) all render
	// through the File Atlas shell so the top (path + mode-nav) is identical and
	// only the body swaps. Copilot (document) is wired in the main return below.
	// Not used for hideTabBar (locked-scope) or the vault / setting tabs.
	const switchMode = (mode: AtlasMode): void =>
		setActiveTab(mode === 'atlas' ? 'atlas' : mode === 'ambient' ? 'ambient' : 'document');

	if (!hideTabBar && ctx && (activeTab === 'atlas' || activeTab === 'ambient')) {
		return (
			<div className="pktw-h-full pktw-bg-pk-background">
				<FileAtlasPanel
					filePath={ctx.file.path}
					displayPath={ctx.file.path}
					content={ctx.content}
					host={atlasHost}
					fill
					activeMode={activeTab === 'ambient' ? 'ambient' : 'atlas'}
					onSwitchMode={switchMode}
					bodySlot={activeTab === 'ambient' ? <RelatedNotesPanel /> : undefined}
				/>
			</div>
		);
	}

	// No active note on a doc-scoped tab: minimal empty state.
	if (!hideTabBar && !ctx && (activeTab === 'atlas' || activeTab === 'ambient')) {
		return (
			<div className="pktw-flex pktw-flex-col pktw-h-full pktw-bg-pk-background pktw-items-center pktw-justify-center pktw-text-sm pktw-text-pk-foreground-muted">
				Open a note to use File Atlas.
			</div>
		);
	}

	const scopeBody = (
		<div className="pktw-flex-1 pktw-overflow-y-auto pktw-px-7 pktw-py-5 pktw-flex pktw-flex-col pktw-gap-4">
				{/* Search */}
				<div className="pktw-flex pktw-items-center pktw-gap-2.5 pktw-px-4 pktw-py-2.5 pktw-bg-pk-surface pktw-border pktw-border-pk-border pktw-rounded-full pktw-shadow-sm">
					<Search className="pktw-w-4 pktw-h-4 pktw-text-pk-foreground-faint" />
					<Input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder={tabMeta.placeholder}
						className="pktw-h-8 pktw-flex-1 pktw-border-0 pktw-bg-transparent pktw-px-0 pktw-text-sm focus-visible:pktw-ring-0"
						autoFocus
					/>
					<Pill variant="accent">{activeTab}</Pill>
				</div>

				{/* Metadata line */}
				<MetadataLine
					activeTab={activeTab}
					ctx={ctx}
					vaultFingerprint={vaultState.fingerprint}
					vaultLastRecord={vaultState.lastRecord}
					fallbackLine={model.contextLine}
				/>

				{/* Readiness card */}
				<PickerReadinessCard {...readinessProps} />

				{/* 2-col split: recent reviews / suggested intents */}
				<div className="pktw-grid pktw-grid-cols-[minmax(0,0.95fr)_minmax(0,1.1fr)] pktw-gap-7 pktw-items-stretch">
					<div className="pktw-flex pktw-flex-col pktw-min-h-0">
						<PickerSectionTitle
							title={recentTitle(activeTab)}
							link={activeTab === 'setting'
								? undefined  // no real diagnostics history yet — Phase D
								: { label: recentLinkLabel(activeTab), onClick: () => onOpenAllHistory(activeTab) }}
							badge={activeTab === 'setting' ? 'preview' : undefined}
						/>
						<div className="pktw-flex-1 pktw-flex pktw-flex-col">
							{activeTab === 'vault' ? (
								<VaultReviewHistoryList
									records={vaultRecords}
									loading={vaultRecordsLoading}
									onOpen={onOpenVaultRecord}
								/>
							) : activeTab === 'document' ? (
								<DocumentReviewHistory
									subjectPath={ctx?.file.path ?? null}
									onOpenRecord={onOpenHistoryRecord}
								/>
							) : (
								<SettingDiagnosticsList />
							)}
						</div>
					</div>
					<div className="pktw-flex pktw-flex-col pktw-min-h-0">
						<PickerSectionTitle title="Suggested intents" />
						<div className="pktw-flex-1">
							<SuggestedIntents
								recommended={model.recommendedActions}
								fallback={model.visibleActions}
								onSelect={onSelect}
							/>
						</div>
					</div>
				</div>

				{/* Expanded capability catalog (only when "show all" / search active) */}
				{showCatalog ? (
					<CapabilityList actions={model.visibleActions} onSelect={onSelect} />
				) : null}

				{/* Footer row: Show all capabilities */}
				{!showCatalog ? (
					<button
						type="button"
						onClick={() => setShowAll(true)}
						className="pktw-grid pktw-grid-cols-[auto_1fr_auto] pktw-gap-3 pktw-items-center pktw-w-full pktw-px-[18px] pktw-py-3.5 pktw-bg-pk-background-secondary pktw-border pktw-border-pk-border-soft pktw-rounded-lg pktw-text-left hover:pktw-bg-pk-accent-tint"
					>
						<span className="pktw-w-8 pktw-h-8 pktw-rounded-lg pktw-bg-pk-surface pktw-border pktw-border-pk-border pktw-text-pk-foreground-muted pktw-flex pktw-items-center pktw-justify-center">
							<ListChecks className="pktw-w-4 pktw-h-4" />
						</span>
						<span>
							<span className="pktw-flex pktw-items-center pktw-gap-1 pktw-text-pk-md pktw-font-semibold pktw-text-pk-foreground">
								Show all capabilities <ChevronRight className="pktw-w-3 pktw-h-3" />
							</span>
							<span className="pktw-block pktw-text-[11.5px] pktw-text-pk-foreground-muted">
								{footerSubtitle(activeTab)}
							</span>
						</span>
						<span />
					</button>
				) : null}
		</div>
	);

	// Copilot (document) tab: same shell as Atlas / Ambient — shared top, the
	// scope picker as the body.
	if (!hideTabBar && ctx && activeTab === 'document') {
		return (
			<div className="pktw-h-full pktw-bg-pk-background">
				<FileAtlasPanel
					filePath={ctx.file.path}
					displayPath={ctx.file.path}
					content={ctx.content}
					host={atlasHost}
					fill
					activeMode="copilot"
					onSwitchMode={switchMode}
					bodySlot={scopeBody}
				/>
			</div>
		);
	}

	// Fallback: hideTabBar (locked scope) or the vault / setting tabs.
	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-bg-pk-background">
			{!hideTabBar && (
				<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as IntentTabId)} variant="segment">
					<TabsList>
						{SCOPE_TABS.map(t => (
							<TabsTrigger key={t.id} value={t.id} title={t.title} subtitle={t.subtitle} />
						))}
					</TabsList>
				</Tabs>
			)}
			{scopeBody}
		</div>
	);
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function recentTitle(tab: IntentTabId): string {
	if (tab === 'document') return 'Recent reviews';
	if (tab === 'vault') return 'Past vault reviews';
	return 'Recent diagnostics';
}
function recentLinkLabel(tab: IntentTabId): string {
	if (tab === 'setting') return 'All diagnostics';
	return 'All reviews';
}
function footerSubtitle(tab: IntentTabId): string {
	if (tab === 'vault') return 'Vault tools are available to the agent during a refresh.';
	if (tab === 'setting') return 'System tools help the agent verify runtime health before a review.';
	return 'Tools are available to the agent during the run.';
}

function PickerSectionTitle({
	title,
	link,
	badge,
}: {
	title: string;
	link?: { label: string; onClick: () => void };
	badge?: string;
}) {
	return (
		<div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-3">
			<div className="pktw-inline-flex pktw-items-center pktw-gap-2">
				<span className="pktw-text-pk-lg pktw-font-semibold pktw-text-pk-foreground">{title}</span>
				{badge ? <Pill variant="warning" size="sm" className="pktw-uppercase pktw-tracking-wider">{badge}</Pill> : null}
			</div>
			{link ? (
				<button
					type="button"
					onClick={link.onClick}
					className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-pk-base pktw-font-semibold pktw-text-pk-info hover:pktw-underline pktw-bg-transparent pktw-border-0 pktw-p-0 pktw-cursor-pointer"
				>
					{link.label}
					<ChevronRight className="pktw-w-3 pktw-h-3" />
				</button>
			) : null}
		</div>
	);
}

function MetadataLine({
	activeTab,
	ctx,
	vaultFingerprint,
	vaultLastRecord,
	fallbackLine,
}: {
	activeTab: IntentTabId;
	ctx: DocumentContext | null;
	vaultFingerprint: ReturnType<typeof useVaultTabState>['fingerprint'];
	vaultLastRecord: ReturnType<typeof useVaultTabState>['lastRecord'];
	fallbackLine: string | null;
}) {
	if (activeTab === 'vault') {
		return (
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-pk-base pktw-text-pk-foreground-muted">
				<VaultContextLine fingerprint={vaultFingerprint} lastRecord={vaultLastRecord} />
			</div>
		);
	}
	if (activeTab === 'setting') {
		return (
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-pk-base pktw-text-pk-foreground-muted">
				<span>System environment</span>
				<span className="pktw-text-pk-foreground-faint">·</span>
				<span>providers</span>
				<span className="pktw-text-pk-foreground-faint">·</span>
				<span>index</span>
				<span className="pktw-text-pk-foreground-faint">·</span>
				<span>skills</span>
				<span className="pktw-text-pk-foreground-faint">·</span>
				<span>prompts</span>
			</div>
		);
	}
	// Document tab
	return (
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-text-pk-base pktw-text-pk-foreground-muted pktw-min-w-0">
			{ctx?.file.path ? (
				<>
					<span className="pktw-font-mono pktw-truncate">{ctx.file.path}</span>
					<span className="pktw-text-pk-foreground-faint pktw-shrink-0">·</span>
					<span className="pktw-shrink-0">current note</span>
					<span className="pktw-text-pk-foreground-faint pktw-shrink-0">·</span>
					<span className="pktw-shrink-0 pktw-tabular-nums">{ctx.wordCount.toLocaleString()} words</span>
				</>
			) : (
				<span>{fallbackLine ?? 'No active note'}</span>
			)}
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
	subjectPath,
	onOpenRecord,
}: {
	subjectPath: string | null;
	onOpenRecord: (record: CopilotReviewHistoryRecord) => void;
}) {
	const [records, setRecords] = useState<CopilotReviewHistoryRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const { copilotReviewHistory } = useServiceContext();

	useEffect(() => {
		let cancelled = false;
		setLoading(true);
		const promise = subjectPath
			? copilotReviewHistory.listForSubject(subjectPath, 8, 'document')
			: Promise.resolve([] as CopilotReviewHistoryRecord[]);
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
		return () => { cancelled = true; };
	}, [subjectPath, copilotReviewHistory]);

	if (loading) {
		return <span className="pktw-block pktw-text-xs pktw-italic pktw-text-pk-foreground-muted">Loading history…</span>;
	}
	if (records.length === 0) {
		return (
			<div className="pktw-h-full pktw-min-h-[160px] pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-text-center pktw-px-5 pktw-py-9 pktw-bg-pk-background-secondary pktw-border pktw-border-dashed pktw-border-pk-border pktw-rounded-2xl">
				<span className="pktw-w-10 pktw-h-10 pktw-rounded-full pktw-bg-pk-surface pktw-border pktw-border-pk-border pktw-text-pk-foreground-faint pktw-flex pktw-items-center pktw-justify-center pktw-mb-2.5">
					<History className="pktw-w-4 pktw-h-4" />
				</span>
				<span className="pktw-text-pk-md pktw-font-semibold pktw-text-pk-foreground">No reviews of this note yet</span>
				<span className="pktw-text-pk-base pktw-text-pk-foreground-muted">Run Auto or Fast to start one.</span>
			</div>
		);
	}

	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			{records.map(r => (
				<button
					key={r.id}
					type="button"
					onClick={() => onOpenRecord(r)}
					className="pktw-w-full pktw-grid pktw-grid-cols-[auto_1fr_auto] pktw-gap-3 pktw-items-center pktw-px-3.5 pktw-py-3 pktw-bg-pk-surface pktw-border pktw-border-pk-border pktw-rounded-[10px] pktw-text-left hover:pktw-border-pk-accent-soft hover:pktw-bg-pk-accent-tint"
				>
					<span className="pktw-w-8 pktw-h-8 pktw-rounded-lg pktw-bg-pk-background-secondary pktw-text-pk-foreground-muted pktw-flex pktw-items-center pktw-justify-center">
						<History className="pktw-w-4 pktw-h-4" />
					</span>
					<div className="pktw-min-w-0">
						<div className="pktw-flex pktw-items-baseline pktw-gap-2 pktw-min-w-0">
							<span className="pktw-text-pk-md pktw-font-semibold pktw-text-pk-foreground pktw-truncate">
								{r.headline?.trim() || `${MODE_LABELS[r.mode as ReviewMode] ?? MODE_LABELS.complete} review`}
							</span>
							<span className="pktw-text-[11.5px] pktw-text-pk-foreground-faint pktw-shrink-0">{relativeTime(r.completedAt)}</span>
							<ReviewStatusBadge status={r.status} />
						</div>
						<div className="pktw-text-[11.5px] pktw-text-pk-foreground-muted pktw-mt-0.5">
							{r.insightCount} insight{r.insightCount === 1 ? '' : 's'} · {r.changeCount} change{r.changeCount === 1 ? '' : 's'} · {r.sourceCount} source{r.sourceCount === 1 ? '' : 's'} · {r.roundCount} round{r.roundCount === 1 ? '' : 's'}
						</div>
					</div>
					<ChevronRight className="pktw-w-3.5 pktw-h-3.5 pktw-text-pk-foreground-faint" />
				</button>
			))}
		</div>
	);
}

function SettingDiagnosticsList() {
	// SystemDiagnosticsService is a Phase D follow-up. Until then, show an
	// honest empty state instead of fake rows — earlier fake data caused
	// "what is this?" confusion (it pretended to be clickable + linked to
	// a non-existent diagnostics page).
	return (
		<div className="pktw-h-full pktw-min-h-[160px] pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-text-center pktw-px-5 pktw-py-9 pktw-bg-pk-background-secondary pktw-border pktw-border-dashed pktw-border-pk-border pktw-rounded-2xl">
			<span className="pktw-w-10 pktw-h-10 pktw-rounded-full pktw-bg-pk-surface pktw-border pktw-border-pk-border pktw-text-pk-foreground-faint pktw-flex pktw-items-center pktw-justify-center pktw-mb-2.5">
				<Sliders className="pktw-w-4 pktw-h-4" />
			</span>
			<div className="pktw-text-pk-md pktw-font-semibold pktw-text-pk-foreground pktw-mb-1">No diagnostics yet</div>
			<div className="pktw-text-[11.5px] pktw-text-pk-foreground-muted pktw-max-w-[280px]">
				Run System Check to see provider health, index integrity, and prompt status here.
			</div>
		</div>
	);
}

function SuggestedIntents({
	recommended,
	fallback,
	onSelect,
}: {
	recommended: CopilotActionListItem[];
	fallback: CopilotActionListItem[];
	onSelect: (action: CopilotAction) => void;
}) {
	// Prefer recommended; if fewer than 3, top up with other tab-visible actions
	// (deduped). Mockup always shows up to 3 stable intents per tab.
	const seen = new Set(recommended.map(r => r.action.id));
	const padding = fallback.filter(f => !seen.has(f.action.id));
	const top = [...recommended, ...padding].slice(0, 3);

	if (top.length === 0) {
		return (
			<span className="pktw-block pktw-rounded-lg pktw-border pktw-border-dashed pktw-border-pk-border pktw-px-4 pktw-py-8 pktw-text-center pktw-text-pk-base pktw-text-pk-foreground-muted">
				No actions registered for this scope yet.
			</span>
		);
	}

	const tones: Array<'accent' | 'indigo' | 'cyan'> = ['accent', 'indigo', 'cyan'];
	return (
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			{top.map((item, i) => (
				<SuggestedIntentRow
					key={item.action.id}
					icon={getCopilotActionIcon(item.action.iconId)}
					title={item.action.label}
					subtitle={item.action.description}
					pill={item.recommended ? { label: 'recommended', variant: 'accent' } : undefined}
					tone={tones[i % tones.length]}
					disabled={!!item.disabledReason}
					onClick={() => onSelect(item.action)}
				/>
			))}
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
		<div className="pktw-flex pktw-flex-col pktw-gap-2">
			<PickerSectionTitle title="All capabilities" />
			{actions.length === 0 ? (
				<span className="pktw-block pktw-rounded-lg pktw-border pktw-border-dashed pktw-border-pk-border pktw-p-8 pktw-text-center pktw-text-xs pktw-text-pk-foreground-muted">
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
	const Icon = getCopilotActionIcon(item.action.iconId);
	return (
		<Button
			variant="ghost"
			disabled={!!item.disabledReason}
			className={cn(
				'pktw-h-auto pktw-min-h-[72px] pktw-whitespace-normal pktw-justify-start pktw-items-start pktw-gap-3 pktw-p-3 pktw-border pktw-border-pk-border pktw-rounded-lg pktw-text-left hover:pktw-bg-pk-accent-tint',
				item.recommended && 'pktw-border-pk-accent-soft pktw-bg-pk-accent-tint',
			)}
			onClick={() => onSelect(item.action)}
		>
			<Icon className="pktw-w-4 pktw-h-4 pktw-mt-0.5 pktw-shrink-0 pktw-text-pk-accent" />
			<span className="pktw-flex pktw-flex-col pktw-gap-1 pktw-min-w-0">
				<span className="pktw-text-sm pktw-font-medium pktw-text-pk-foreground">{item.action.label}</span>
				<span className="pktw-text-xs pktw-leading-snug pktw-text-pk-foreground-muted">
					{item.disabledReason ?? item.action.description}
				</span>
			</span>
		</Button>
	);
}

