import * as React from 'react';
import { ChevronDown, ExternalLink, MoreHorizontal, RefreshCw, Sparkles } from 'lucide-react';
import { composerTargetBlockId } from '@/core/composer';
import type {
	BriefSensingMode,
	BriefThought,
	ComposerRelatedMaterialSnapshot,
	FindingBriefPresentation,
	IntelligenceBriefProjection,
	IntelligenceRuntime,
	RelatedPreviewNode,
	SuggestionFinding,
} from '@/service/composer';
import { selectLocalPreview } from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import { cn } from '@/ui/react/lib/utils';
import { RelatedMaterialsModal } from './RelatedMaterialsModal';
import { useBriefProjection, useFindings, useSidecar } from './SidecarContext';
import type { SidecarConfig } from './sidecarConfig';

/** Brief state of the optional related-material request. */
export type RelatedLoadState =
	| { status: 'unavailable' }
	| { status: 'loading' }
	| { status: 'ready'; snapshot: ComposerRelatedMaterialSnapshot }
	| { status: 'error' };

/**
 * The document-adjacent Brief. This intentionally follows the design source's
 * `brief-head → brief-section → suggestion-row` hierarchy rather than styling a
 * flat list of buttons. The runtime owns all data and lifecycle state; React only
 * projects it and sends explicit user actions back to that runtime.
 */
export function BriefView(): React.ReactElement {
	const { runtime, config, getFocusedBlockId, onLocate, onOpenSource, resolveRelatedFocus } = useSidecar();
	const findings = useFindings(runtime);
	const brief = useBriefProjection(runtime);
	const [related, setRelated] = React.useState<RelatedLoadState>(
		runtime.related ? { status: 'loading' } : { status: 'unavailable' },
	);
	const [relatedReloadToken, setRelatedReloadToken] = React.useState(0);
	const [modalOpen, setModalOpen] = React.useState(false);

	const resolveCurrentFocus = React.useCallback(() => {
		const focusedBlockId = getFocusedBlockId?.() ?? null;
		const relatedFocus = resolveRelatedFocus?.(focusedBlockId);
		return {
			anchorId: relatedFocus?.anchorId ?? 'document',
			label: relatedFocus?.label ?? config.strings.currentDocument,
		};
	}, [config.strings.currentDocument, getFocusedBlockId, resolveRelatedFocus]);

	React.useEffect(() => {
		runtime.updateBriefFocus(resolveCurrentFocus());
	}, [resolveCurrentFocus, runtime]);

	const onRefreshRelated = React.useCallback(() => {
		setRelatedReloadToken((token) => token + 1);
	}, []);
	const onRefreshSuggestions = React.useCallback(() => {
		runtime.updateBriefFocus(resolveCurrentFocus());
		runtime.refreshBrief();
		onRefreshRelated();
	}, [onRefreshRelated, resolveCurrentFocus, runtime]);

	return (
		<>
			<BriefViewContent
				brief={brief}
				config={config}
				findings={findings}
				modalOpen={modalOpen}
				onLocate={onLocate}
				onOpenSource={onOpenSource}
				onRefreshRelated={onRefreshRelated}
				onRefreshSuggestions={onRefreshSuggestions}
				related={related}
				setModalOpen={setModalOpen}
				runtime={runtime}
			/>
			<RelatedLoader focusAnchorId={brief.focus?.anchorId ?? 'document'} onStatus={setRelated} reloadToken={relatedReloadToken} />
		</>
	);
}

export interface BriefViewContentProps {
	brief?: IntelligenceBriefProjection;
	config: Pick<SidecarConfig, 'strings' | 'briefPreviewCap' | 'thoughtPreviewCap' | 'relatedPreviewCap'>;
	findings: readonly SuggestionFinding[];
	modalOpen: boolean;
	onLocate?: (blockId: string) => void;
	onOpenSource?: (path: string) => void;
	onRefreshRelated: () => void;
	onRefreshSuggestions?: () => void;
	related: RelatedLoadState;
	setModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	runtime: IntelligenceRuntime;
}

export function BriefViewContent({
	brief: passedBrief,
	config,
	findings,
	modalOpen,
	onLocate,
	onOpenSource,
	onRefreshRelated,
	onRefreshSuggestions,
	related,
	setModalOpen,
	runtime,
}: BriefViewContentProps): React.ReactElement {
	const s = config.strings;
	const brief = passedBrief ?? runtime.brief.projection();
	const [suggestionsExpanded, setSuggestionsExpanded] = React.useState(false);
	const [thoughtsExpanded, setThoughtsExpanded] = React.useState(false);
	const activeFindings = React.useMemo(
		() => sortBriefFindings(findings.filter((finding) => finding.state === 'active' || finding.state === 'stale')),
		[findings],
	);
	const visibleFindings = suggestionsExpanded ? activeFindings : activeFindings.slice(0, config.briefPreviewCap);
	const visibleThoughts = thoughtsExpanded
		? brief.unplacedThoughts
		: brief.unplacedThoughts.slice(0, config.thoughtPreviewCap);
	const preview: readonly RelatedPreviewNode[] = React.useMemo(
		() => (related.status === 'ready' ? selectLocalPreview(related.snapshot, config.relatedPreviewCap) : []),
		[config.relatedPreviewCap, related],
	);
	const relatedSnapshot = related.status === 'ready' ? related.snapshot : null;
	const relatedCount = relatedSnapshot?.items.length ?? 0;
	const sensingHint = sensingHintFor(brief.sensingMode, s);
	const focusStatus = brief.sensingMode === 'manual'
		? s.manualChecking
		: `${s.currentFocus}「${brief.focus?.label ?? s.currentDocument}」`;

	return (
		<div className="pk-brief" data-testid="pk-brief">
			<header className="pk-brief-head">
				<div className="pk-brief-status">
					<span>
						<i
							aria-hidden
							className="pk-brief-status-indicator"
							data-paused={brief.sensingMode === 'manual' || undefined}
						/>
						{focusStatus}
					</span>
					<time title={brief.refreshRevision ?? undefined}>{formatBriefRevision(brief, s.updatedAtPrefix)}</time>
				</div>
				<span className="pk-brief-heading">{s.briefHeading}</span>
				<span className="pk-brief-subtitle">{[sensingHint, s.briefIntro].filter(Boolean).join(' ')}</span>
				<div className="pk-brief-head-actions">
					<Button
						className="pk-brief-action pk-brief-action--primary"
						variant="outline"
						size="sm"
						onClick={() => runtime.session.openSession(s.askCopilot)}
					>
						<Sparkles aria-hidden />
						{s.askCopilot}
					</Button>
					<Button
						className="pk-brief-action"
						variant="outline"
						size="sm"
						onClick={() => onRefreshSuggestions?.()}
					>
						<RefreshCw aria-hidden />
						{s.refreshSuggestions}
					</Button>
					<SensingControl
						runtime={runtime}
						sensingMode={brief.sensingMode}
						autoPrepare={brief.autoPrepare}
						autoPrepareAvailable={brief.autoPrepareAvailable}
						strings={s}
					/>
				</div>
			</header>

			<BriefSection
				title={s.sectionNextMoves}
				count={activeFindings.length}
				hint={s.sortByImpactAndDocumentOrder}
			>
				{activeFindings.length > 0 ? (
					<>
						<div className="pk-suggestion-list">
							{visibleFindings.map((finding, index) => (
								<FindingRow
									key={finding.findingId}
									finding={finding}
									index={index + 1}
									onDefer={() => runtime.deferFinding(finding.findingId)}
									onDiscuss={() => runtime.session.openSession(findingPresentation(finding).title)}
									onIgnore={() => runtime.ignoreFindingForCurrentRefresh(finding.findingId)}
									onLocate={() => locateFinding(finding, onLocate)}
									strings={s}
								/>
							))}
						</div>
						{activeFindings.length > config.briefPreviewCap && (
							<Button
								className="pk-list-more"
								variant="ghost"
								size="sm"
								onClick={() => setSuggestionsExpanded((expanded) => !expanded)}
							>
								{suggestionsExpanded
									? s.collapseSuggestions
									: expandCountLabel(s.viewAllSuggestions, activeFindings.length)}
							</Button>
						)}
					</>
				) : (
					<SectionNotice>{s.sectionNextMovesEmpty}</SectionNotice>
				)}
			</BriefSection>

			<BriefSection
				title={s.sectionRelated}
				count={relatedCount}
				hint={s.relatedAsEvidence}
				action={
					related.status !== 'unavailable' ? (
						<Button className="pk-brief-section-action" variant="outline" size="sm" onClick={onRefreshRelated}>
							<RefreshCw aria-hidden />
							{s.refreshRelated}
						</Button>
					) : undefined
				}
			>
				<RelatedSectionBody
					related={related}
					preview={preview}
					focusLabel={brief.focus?.label ?? s.currentDocument}
					onOpenSource={onOpenSource}
					onRefreshRelated={onRefreshRelated}
					onStartSession={(node) => runtime.session.openSession(`${s.bringIntoSession} ${node.title}`, [node.sourceId])}
					setModalOpen={setModalOpen}
					strings={s}
				/>
			</BriefSection>

			<BriefSection title={s.sectionUnplaced} count={brief.unplacedThoughts.length} hint={s.thoughtsNotTasks}>
				{brief.unplacedThoughts.length > 0 ? (
					<>
						<div className="pk-thought-list">
							{visibleThoughts.map((thought) => (
								<ThoughtRow
									key={thought.thoughtId}
									thought={thought}
									organizeLabel={s.organizeThought}
								onOrganize={() => runtime.session.openSession(thought.label)}
								/>
							))}
						</div>
						{brief.unplacedThoughts.length > config.thoughtPreviewCap && (
							<Button
								className="pk-list-more"
								variant="ghost"
								size="sm"
								onClick={() => setThoughtsExpanded((expanded) => !expanded)}
							>
								{thoughtsExpanded
									? s.collapseThoughts
									: expandCountLabel(s.viewAllThoughts, brief.unplacedThoughts.length)}
							</Button>
						)}
					</>
				) : (
					<SectionNotice>{s.noUnplacedIdeas}</SectionNotice>
				)}
			</BriefSection>

			{modalOpen && relatedSnapshot && (
				<RelatedMaterialsModal snapshot={relatedSnapshot} onClose={() => setModalOpen(false)} />
			)}
		</div>
	);
}

/** Loads one frozen related snapshot from the app-owned port; no-op without it. */
function RelatedLoader({
	focusAnchorId,
	onStatus,
	reloadToken,
}: {
	focusAnchorId: string;
	onStatus: (state: RelatedLoadState) => void;
	reloadToken: number;
}): null {
	const { runtime, getFocusedBlockId, resolveRelatedFocus } = useSidecar();
	const requestIdRef = React.useRef(0);
	React.useEffect(() => {
		const port = runtime.related;
		if (!port) {
			onStatus({ status: 'unavailable' });
			return;
		}
		let alive = true;
		const requestId = ++requestIdRef.current;
		onStatus({ status: 'loading' });
		const focus = resolveRelatedFocus?.(getFocusedBlockId?.() ?? null) ?? {
			anchorId: 'document',
			documentId: 'document',
			focusText: '',
			label: 'document',
		};
		void port
			.buildSnapshot(focus)
			.then((snapshot) => {
				if (alive && requestId === requestIdRef.current) onStatus({ status: 'ready', snapshot });
			})
			.catch(() => {
				if (alive && requestId === requestIdRef.current) onStatus({ status: 'error' });
			});
		return () => {
			alive = false;
		};
	}, [focusAnchorId, getFocusedBlockId, onStatus, reloadToken, resolveRelatedFocus, runtime]);
	return null;
}

function BriefSection({
	title,
	count,
	hint,
	action,
	children,
}: {
	title: string;
	count: number;
	hint?: string;
	action?: React.ReactNode;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<section className="pk-brief-section">
			<div className="pk-brief-section-head">
				<span className="pk-brief-section-title-group">
					<span className="pk-brief-section-title">{title}</span>
					<span className="pk-status-chip">{count}</span>
					{hint && <small className="pk-brief-section-hint">{hint}</small>}
				</span>
				{action}
			</div>
			<div className="pk-brief-section-body">{children}</div>
		</section>
	);
}

function SensingControl({
	runtime,
	sensingMode,
	autoPrepare,
	autoPrepareAvailable,
	strings,
}: {
	runtime: IntelligenceRuntime;
	sensingMode: BriefSensingMode;
	autoPrepare: boolean;
	autoPrepareAvailable: boolean;
	strings: SidecarConfig['strings'];
}): React.ReactElement {
	const options: readonly { mode: BriefSensingMode; label: string; hint: string; recommended?: boolean }[] = [
		{ mode: 'manual', label: strings.manualSensing, hint: strings.sensingManualHint },
		{ mode: 'idle', label: strings.idleSensing, hint: strings.sensingIdleHint, recommended: true },
		{ mode: 'continuous', label: strings.continuousSensing, hint: strings.sensingContinuousHint },
	];
	const active = options.find((option) => option.mode === sensingMode) ?? options[1];
	return (
		<details className="pk-sensing-control">
			<summary>
				<i className="pk-brief-status-indicator" data-paused={sensingMode === 'manual' || undefined} aria-hidden />
				{`${strings.suggestionUpdate} · ${active.label}`}
				<ChevronDown aria-hidden />
			</summary>
			<div className="pk-sensing-menu" role="group" aria-label={strings.sensingMenuTitle}>
				<span className="pk-sensing-menu-label">{strings.sensingMenuTitle}</span>
				{options.map((option) => (
					<Button
						key={option.mode}
						className="pk-sensing-option"
						variant="ghost"
						role="radio"
						aria-checked={sensingMode === option.mode}
							onClick={(event) => {
								runtime.setSensingMode(option.mode);
								closeContainingDetails(event.currentTarget);
							}}
					>
						<span className="pk-sensing-option-copy">
							<strong>
								{option.label}
								{option.recommended && <em>{strings.sensingRecommended}</em>}
							</strong>
							<small>{option.hint}</small>
						</span>
						<span className="pk-sensing-option-check" aria-hidden />
					</Button>
				))}
				<span className="pk-sensing-menu-label pk-sensing-menu-label--secondary">{strings.autoPrepareHint}</span>
				<Button
					className="pk-sensing-option"
					variant="ghost"
					role="checkbox"
					aria-checked={autoPrepare}
					disabled={!autoPrepareAvailable}
					onClick={(event) => {
						runtime.setAutoPrepare(!autoPrepare);
						closeContainingDetails(event.currentTarget);
					}}
				>
					<span className="pk-sensing-option-copy">
						<strong>{strings.autoPrepare}</strong>
						<small>{autoPrepareAvailable ? strings.autoPrepareDescription : strings.autoPrepareUnavailable}</small>
					</span>
					<span className="pk-sensing-option-check" aria-hidden />
				</Button>
				<small className="pk-sensing-menu-note">{strings.sensingSafetyNote}</small>
			</div>
		</details>
	);
}

function FindingRow({
	finding,
	index,
	onDefer,
	onDiscuss,
	onIgnore,
	onLocate,
	strings,
}: {
	finding: SuggestionFinding;
	index: number;
	onDefer: () => void;
	onDiscuss: () => void;
	onIgnore: () => void;
	onLocate: () => void;
	strings: SidecarConfig['strings'];
}): React.ReactElement {
	const presentation = findingPresentation(finding);
	return (
		<article
			className={cn(
				'pk-suggestion-row',
				index === 1 && 'pk-suggestion-row--primary',
				finding.state === 'stale' && 'pk-suggestion-row--stale',
			)}
			data-finding-id={finding.findingId}
		>
			<span className="pk-suggestion-index">{String(index).padStart(2, '0')}</span>
			<div className="pk-suggestion-copy">
				<strong className="pk-suggestion-title">{presentation.title}</strong>
				{presentation.summary && <span className="pk-suggestion-summary">{presentation.summary}</span>}
				<div className="pk-suggestion-meta">
					<Button className="pk-suggestion-target" variant="ghost" size="sm" onClick={onLocate}>
						{presentation.targetLabel}
					</Button>
					<span>{presentation.evidenceLabel}</span>
				</div>
				{finding.state === 'stale' && <span className="pk-suggestion-stale">{strings.staleFindingNotice}</span>}
			</div>
			<div className="pk-suggestion-actions">
				<Button className="pk-suggestion-discuss" variant="outline" size="sm" onClick={onDiscuss}>
					{strings.discuss}
				</Button>
				<details className="pk-suggestion-more">
					<summary aria-label={strings.moveLater} title={strings.moveLater}>
						<MoreHorizontal aria-hidden />
					</summary>
					<div className="pk-suggestion-menu" role="menu">
						<Button
							className="pk-suggestion-menu-item"
							variant="ghost"
							role="menuitem"
							onClick={(event) => {
								onDefer();
								closeContainingDetails(event.currentTarget);
							}}
						>
							<span>{strings.moveLater}</span>
							<small>{strings.moveLaterHint}</small>
						</Button>
						<Button
							className="pk-suggestion-menu-item pk-suggestion-menu-item--ignore"
							variant="ghost"
							role="menuitem"
							onClick={(event) => {
								onIgnore();
								closeContainingDetails(event.currentTarget);
							}}
						>
							<span>{strings.ignoreThisRound}</span>
							<small>{strings.ignoreThisRoundHint}</small>
						</Button>
					</div>
				</details>
			</div>
		</article>
	);
}

function RelatedSectionBody({
	related,
	preview,
	focusLabel,
	onOpenSource,
	onRefreshRelated,
	onStartSession,
	setModalOpen,
	strings,
}: {
	related: RelatedLoadState;
	preview: readonly RelatedPreviewNode[];
	focusLabel: string;
	onOpenSource?: (path: string) => void;
	onRefreshRelated: () => void;
	onStartSession: (node: RelatedPreviewNode) => void;
	setModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	strings: SidecarConfig['strings'];
}): React.ReactElement {
	if (related.status === 'unavailable') return <SectionNotice>{strings.sectionRelatedUnavailable}</SectionNotice>;
	if (related.status === 'loading') return <SectionNotice tone="loading">{strings.sectionRelatedLoading}</SectionNotice>;
	if (related.status === 'error') {
		return (
			<SectionNotice tone="error">
				{strings.sectionRelatedError}
				<Button className="pk-brief-section-action" variant="outline" size="sm" onClick={onRefreshRelated}>
					{strings.refreshRelated}
				</Button>
			</SectionNotice>
		);
	}
	if (preview.length === 0) {
		return (
			<>
				<SectionNotice>{strings.sectionRelatedEmpty}</SectionNotice>
				<Button className="pk-list-more" variant="ghost" size="sm" onClick={() => setModalOpen(true)}>
					<ExternalLink aria-hidden />
					{strings.openFullView}
				</Button>
			</>
		);
	}
	return (
		<>
			<RelatedInlineGraph
				nodes={preview}
				focusLabel={focusLabel}
				onOpenSource={onOpenSource}
				onStartSession={onStartSession}
				strings={strings}
			/>
			<Button className="pk-list-more" variant="ghost" size="sm" onClick={() => setModalOpen(true)}>
				<ExternalLink aria-hidden />
				{strings.openFullView}
			</Button>
		</>
	);
}

function RelatedInlineGraph({
	nodes,
	focusLabel,
	onOpenSource,
	onStartSession,
	strings,
}: {
	nodes: readonly RelatedPreviewNode[];
	focusLabel: string;
	onOpenSource?: (path: string) => void;
	onStartSession: (node: RelatedPreviewNode) => void;
	strings: SidecarConfig['strings'];
}): React.ReactElement {
	const [selectedId, setSelectedId] = React.useState(nodes[0]?.sourceId ?? '');
	React.useEffect(() => {
		if (!nodes.some((node) => node.sourceId === selectedId)) setSelectedId(nodes[0]?.sourceId ?? '');
	}, [nodes, selectedId]);
	const selected = nodes.find((node) => node.sourceId === selectedId) ?? nodes[0];
	if (!selected) return <SectionNotice>{strings.sectionRelatedEmpty}</SectionNotice>;
	return (
		<div className="pk-material-graph" data-testid="pk-related-inline-graph">
			<div className="pk-material-graph-head">
				<span>{strings.sourceDetails}</span>
			</div>
			<div className="pk-material-graph-network">
				<div className="pk-material-node-list">
					{nodes.map((node) => (
						<Button
							key={node.sourceId}
							className="pk-material-node"
							variant="outline"
							size="sm"
							aria-pressed={node.sourceId === selected.sourceId}
							onClick={() => setSelectedId(node.sourceId)}
						>
							<span className="pk-material-node-title">{node.title}</span>
							<span className="pk-material-node-score">{formatScore(node.score)}</span>
						</Button>
					))}
				</div>
				<span className="pk-material-focus">{focusLabel}</span>
			</div>
			<div className="pk-material-graph-detail">
				<div className="pk-material-detail-copy">
					<strong className="pk-material-detail-title">{selected.title}</strong>
					{selected.reason && <span className="pk-material-detail-reason">{selected.reason}</span>}
					<span className="pk-material-detail-path">{selected.path}</span>
				</div>
				<div className="pk-material-detail-actions">
					<Button
						className="pk-material-detail-action"
						variant="outline"
						size="sm"
						onClick={() => onOpenSource?.(selected.path)}
					>
						{strings.viewSource}
					</Button>
					<Button
						className="pk-material-detail-action"
						variant="outline"
						size="sm"
						onClick={() => onStartSession(selected)}
					>
						{strings.bringIntoSession}
					</Button>
				</div>
			</div>
		</div>
	);
}

function ThoughtRow({
	thought,
	organizeLabel,
	onOrganize,
}: {
	thought: BriefThought;
	organizeLabel: string;
	onOrganize: () => void;
}): React.ReactElement {
	return (
		<article className="pk-thought-row" data-thought-id={thought.thoughtId}>
			<div className="pk-thought-copy">
				<strong className="pk-thought-title">{thought.label}</strong>
				{thought.detail && <span className="pk-thought-summary">{thought.detail}</span>}
			</div>
			<Button className="pk-thought-organize" variant="outline" size="sm" onClick={onOrganize}>
				{organizeLabel}
			</Button>
		</article>
	);
}

function sensingHintFor(mode: BriefSensingMode, strings: SidecarConfig['strings']): string {
	if (mode === 'manual') return strings.sensingManualHint;
	if (mode === 'continuous') return strings.sensingContinuousHint;
	return strings.sensingIdleHint;
}

/** Native details has no controlled state; close the exact action menu that handled the click. */
function closeContainingDetails(element: HTMLElement): void {
	element.closest('details')?.removeAttribute('open');
}

function SectionNotice({
	children,
	tone,
}: {
	children: React.ReactNode;
	tone?: 'loading' | 'error';
}): React.ReactElement {
	return (
		<div className="pk-brief-section-empty" data-tone={tone} role={tone === 'error' ? 'alert' : 'status'}>
			{children}
		</div>
	);
}

function sortBriefFindings(findings: readonly SuggestionFinding[]): readonly SuggestionFinding[] {
	return [...findings].sort((left, right) => {
		const leftDeferred = left.deferredAt !== undefined;
		const rightDeferred = right.deferredAt !== undefined;
		if (leftDeferred !== rightDeferred) return leftDeferred ? 1 : -1;
		const priorityDelta = findingPresentation(left).priority - findingPresentation(right).priority;
		if (priorityDelta !== 0) return priorityDelta;
		return (left.deferredAt ?? 0) - (right.deferredAt ?? 0);
	});
}

function findingPresentation(finding: SuggestionFinding): FindingBriefPresentation {
	if (finding.brief) return finding.brief;
	const targetLabel = composerTargetBlockId(finding.target) ?? finding.target.kind;
	return {
		title: finding.reason,
		summary: '',
		targetLabel,
		evidenceLabel: finding.evidenceRevision,
		priority: Number.MAX_SAFE_INTEGER,
	};
}

function locateFinding(finding: SuggestionFinding, onLocate?: (blockId: string) => void): void {
	const blockId = composerTargetBlockId(finding.target);
	if (blockId) onLocate?.(blockId);
}

function expandCountLabel(template: string, count: number): string {
	return template.replace('{count}', String(count));
}

function formatBriefRevision(brief: IntelligenceBriefProjection, prefix: string): string {
	const revision = brief.refreshRevision ? `v${brief.refreshVersion}` : '—';
	if (!brief.lastRefreshedAt) return revision;
	const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(
		new Date(brief.lastRefreshedAt),
	);
	return `${prefix} ${time} · ${revision}`;
}

function formatScore(score: number): string {
	return `${Math.round(score * 100)}%`;
}
