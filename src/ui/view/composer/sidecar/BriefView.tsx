import * as React from 'react';
import { ChevronDown, ExternalLink, ListEnd, Network, RefreshCw, Sparkles } from 'lucide-react';
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
import { resolveSidecarPreviewFixture } from './previewFixture';
import { useBriefProjection, useFindings, useSidecar } from './SidecarContext';
import type { SidecarConfig } from './sidecarConfig';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { AIGraphContextArtifacts } from '@/ui/component/ai-graph';

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
	const { quickSearchLauncher } = useServiceContext();
	const {
		runtime,
		config,
		documentFilePath,
		getFocusedBlockId,
		onLocate,
		onOpenSource,
		onPresentationOriginChange,
		resolveRelatedFocus,
	} = useSidecar();
	const findings = useFindings(runtime);
	const brief = useBriefProjection(runtime);
	const [related, setRelated] = React.useState<RelatedLoadState>(
		runtime.related ? { status: 'loading' } : { status: 'unavailable' },
	);
	const [relatedReloadToken, setRelatedReloadToken] = React.useState(0);
	const [modalOpen, setModalOpen] = React.useState(false);
	const [organizedPreviewThoughtIds, setOrganizedPreviewThoughtIds] = React.useState<ReadonlySet<string>>(
		() => new Set(),
	);

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
	const onAskCopilot = React.useCallback(() => {
		const blockId = getFocusedBlockId?.() ?? undefined;
		onPresentationOriginChange?.({
			kind: 'ask-copilot',
			...(blockId ? { blockId } : {}),
		});
		runtime.session.openSession(config.strings.askCopilot);
	}, [
		config.strings.askCopilot,
		getFocusedBlockId,
		onPresentationOriginChange,
		runtime,
	]);
	const previewFocus = resolveRelatedFocus?.(getFocusedBlockId?.() ?? null) ?? {
		anchorId: 'document',
		documentId: 'document',
		focusText: '',
		label: config.strings.currentDocument,
	};
	const previewFixture = resolveSidecarPreviewFixture(documentFilePath, config, previewFocus);
	const hasRealRelated = related.status === 'ready' && related.snapshot.items.length > 0;
	const relatedPreviewActive = Boolean(previewFixture && !hasRealRelated);
	const effectiveRelated: RelatedLoadState = previewFixture && !hasRealRelated
		? { status: 'ready', snapshot: previewFixture.related }
		: related;
	const thoughtPreviewActive = Boolean(previewFixture && brief.unplacedThoughts.length === 0);
	const previewThoughts = thoughtPreviewActive
		? previewFixture?.thoughts.filter((thought) => !organizedPreviewThoughtIds.has(thought.thoughtId)) ?? []
		: [];
	const effectiveBrief: IntelligenceBriefProjection = thoughtPreviewActive
		? { ...brief, unplacedThoughts: previewThoughts }
		: brief;

	return (
		<>
			<BriefViewContent
				brief={effectiveBrief}
				config={config}
				findings={findings}
				modalOpen={modalOpen}
				onLocate={onLocate}
				onOpenSource={onOpenSource}
				onRefreshRelated={onRefreshRelated}
				onRefreshSuggestions={onRefreshSuggestions}
				onOpenAIGraphs={quickSearchLauncher
					? () => quickSearchLauncher.open({
						aiMode: 'graph',
						selectedVaultPaths: documentFilePath ? [documentFilePath] : [],
						...(documentFilePath
							? {
								graphCreateOrigin: {
									surface: 'composer',
									contextRef: {
										kind: 'vault-file',
										ref: documentFilePath,
										label: documentFilePath.slice(documentFilePath.lastIndexOf('/') + 1),
										locator: documentFilePath,
									},
								},
							}
							: {}),
					})
					: undefined}
				onAskCopilot={onAskCopilot}
				onFindingDiscuss={(finding) => {
					const blockId = composerTargetBlockId(finding.target);
					if (blockId) {
						onPresentationOriginChange?.({
							kind: 'automatic-suggestion',
							findingId: finding.findingId,
							blockId,
						});
					}
					runtime.session.openSession(
						findingPresentation(finding).title,
						[],
						[],
						finding.capabilityId,
					);
				}}
				related={effectiveRelated}
				relatedPreviewActive={relatedPreviewActive}
				thoughtPreviewActive={thoughtPreviewActive}
				onOrganizeThought={(thought) => {
					if (!previewFixture?.thoughts.some((entry) => entry.id === thought.thoughtId)) {
						runtime.organizeThought(thought.thoughtId);
						return;
					}
					setOrganizedPreviewThoughtIds((current) => new Set([...current, thought.thoughtId]));
				}}
				setModalOpen={setModalOpen}
				runtime={runtime}
			/>
			{documentFilePath && (
				<AIGraphContextArtifacts
					contextRefs={[documentFilePath]}
					label="Graphs for this document"
				/>
			)}
			<RelatedLoader focusAnchorId={brief.focus?.anchorId ?? 'document'} onStatus={setRelated} reloadToken={relatedReloadToken} />
		</>
	);
}

export interface BriefViewContentProps {
	brief?: IntelligenceBriefProjection;
	config: Pick<
		SidecarConfig,
		'strings' | 'briefPreviewCap' | 'thoughtPreviewCap' | 'relatedPreviewCap' | 'relatedExcerptMaxChars'
	>;
	findings: readonly SuggestionFinding[];
	modalOpen: boolean;
	onLocate?: (blockId: string) => void;
	onOpenSource?: (path: string) => void;
	onRefreshRelated: () => void;
	onRefreshSuggestions?: () => void;
	onOpenAIGraphs?: () => void;
	onAskCopilot?: () => void;
	onFindingDiscuss?: (finding: SuggestionFinding) => void;
	onOrganizeThought?: (thought: BriefThought) => void;
	related: RelatedLoadState;
	relatedPreviewActive?: boolean;
	thoughtPreviewActive?: boolean;
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
	onOpenAIGraphs,
	onAskCopilot,
	onFindingDiscuss,
	onOrganizeThought,
	related,
	relatedPreviewActive = false,
	thoughtPreviewActive = false,
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
		() => (
			related.status === 'ready'
				? selectLocalPreview(related.snapshot, config.relatedPreviewCap, config.relatedExcerptMaxChars)
				: []
		),
		[config.relatedExcerptMaxChars, config.relatedPreviewCap, related],
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
					{onOpenAIGraphs && (
						<Button
							className="pk-brief-action"
							variant="outline"
							size="sm"
							aria-label={s.openAIGraphs}
							title={s.openAIGraphs}
							onClick={onOpenAIGraphs}
						>
							<Network aria-hidden />
						</Button>
					)}
					<Button
						className="pk-brief-action pk-brief-action--primary"
						variant="outline"
						size="sm"
						onClick={() => onAskCopilot?.()}
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
									onDiscuss={() => {
										if (onFindingDiscuss) {
											onFindingDiscuss(finding);
											return;
										}
										runtime.session.openSession(
											findingPresentation(finding).title,
											[],
											[],
											finding.capabilityId,
										);
									}}
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
				badge={relatedPreviewActive ? s.previewFixtureLabel : undefined}
				badgeTitle={relatedPreviewActive ? s.previewFixtureNote : undefined}
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
					onOpenSource={onOpenSource}
					onRefreshRelated={onRefreshRelated}
					onStartSession={(node) => runtime.session.openSession(`${s.bringIntoSession} ${node.title}`, [node.sourceId])}
					setModalOpen={setModalOpen}
					strings={s}
				/>
			</BriefSection>

			<BriefSection
				title={s.sectionUnplaced}
				count={brief.unplacedThoughts.length}
				hint={s.thoughtsNotTasks}
				badge={thoughtPreviewActive ? s.previewFixtureLabel : undefined}
				badgeTitle={thoughtPreviewActive ? s.previewFixtureNote : undefined}
			>
				{brief.unplacedThoughts.length > 0 ? (
					<>
						<div className="pk-thought-list">
							{visibleThoughts.map((thought) => (
								<ThoughtRow
									key={thought.thoughtId}
									thought={thought}
									organizeLabel={s.organizeThought}
									bringIntoSessionLabel={s.bringIntoSession}
									fromRunTemplate={s.thoughtFromRun}
									onBringIntoSession={() => runtime.session.openSession(thought.label)}
									onOrganize={() => {
										if (onOrganizeThought) {
											onOrganizeThought(thought);
											return;
										}
										runtime.organizeThought(thought.thoughtId);
									}}
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
	badge,
	badgeTitle,
	action,
	children,
}: {
	title: string;
	count: number;
	hint?: string;
	badge?: string;
	badgeTitle?: string;
	action?: React.ReactNode;
	children: React.ReactNode;
}): React.ReactElement {
	return (
		<section className="pk-brief-section">
			<div className="pk-brief-section-head">
				<span className="pk-brief-section-title-group">
					<span className="pk-brief-section-title">{title}</span>
					<span className="pk-status-chip">{count}</span>
					{badge && <span className="pk-preview-badge" title={badgeTitle}>{badge}</span>}
					{hint && <small className="pk-brief-section-hint">{hint}</small>}
				</span>
				{action}
			</div>
			<div className="pk-brief-section-body">{children}</div>
		</section>
	);
}

export function SensingControl({
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
	onLocate,
	strings,
}: {
	finding: SuggestionFinding;
	index: number;
	onDefer: () => void;
	onDiscuss: () => void;
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
				<strong className="pk-suggestion-title" title={presentation.title}>{presentation.title}</strong>
				{presentation.summary && <span className="pk-suggestion-summary">{presentation.summary}</span>}
				<div className="pk-suggestion-footer">
					<div className="pk-suggestion-meta">
						<Button className="pk-suggestion-target" variant="ghost" size="sm" onClick={onLocate}>
							{presentation.targetLabel}
						</Button>
						<span>{presentation.evidenceLabel}</span>
					</div>
					<div className="pk-suggestion-inline-actions">
						<Button className="pk-suggestion-discuss" variant="ghost" size="sm" onClick={onDiscuss}>
							{strings.discuss}
						</Button>
						<Button
							className="pk-suggestion-defer"
							variant="ghost"
							size="sm"
							title={strings.moveLaterHint}
							aria-label={strings.moveLater}
							onClick={onDefer}
						>
							<ListEnd aria-hidden />
						</Button>
					</div>
				</div>
				{finding.state === 'stale' && <span className="pk-suggestion-stale">{strings.staleFindingNotice}</span>}
			</div>
		</article>
	);
}

function RelatedSectionBody({
	related,
	preview,
	onOpenSource,
	onRefreshRelated,
	onStartSession,
	setModalOpen,
	strings,
}: {
	related: RelatedLoadState;
	preview: readonly RelatedPreviewNode[];
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
		return <SectionNotice>{strings.sectionRelatedEmpty}</SectionNotice>;
	}
	return (
		<RelatedMaterialList
			nodes={preview}
			onOpenFullView={() => setModalOpen(true)}
			onOpenSource={onOpenSource}
			onStartSession={onStartSession}
			strings={strings}
		/>
	);
}

function RelatedMaterialList({
	nodes,
	onOpenFullView,
	onOpenSource,
	onStartSession,
	strings,
}: {
	nodes: readonly RelatedPreviewNode[];
	onOpenFullView: () => void;
	onOpenSource?: (path: string) => void;
	onStartSession: (node: RelatedPreviewNode) => void;
	strings: SidecarConfig['strings'];
}): React.ReactElement {
	const [pinnedId, setPinnedId] = React.useState(nodes[0]?.sourceId ?? '');
	const [previewedId, setPreviewedId] = React.useState<string | null>(null);
	React.useEffect(() => {
		if (!nodes.some((node) => node.sourceId === pinnedId)) setPinnedId(nodes[0]?.sourceId ?? '');
		if (previewedId && !nodes.some((node) => node.sourceId === previewedId)) setPreviewedId(null);
	}, [nodes, pinnedId, previewedId]);
	const selectedId = previewedId ?? pinnedId;
	const selected = nodes.find((node) => node.sourceId === selectedId) ?? nodes[0];
	if (!selected) return <SectionNotice>{strings.sectionRelatedEmpty}</SectionNotice>;
	return (
		<div className="pk-material-list-shell" data-testid="pk-related-material-list">
			<div className="pk-material-list-head">
				<strong>{strings.materialListTitle}</strong>
				<span>{strings.materialHoverHint}</span>
			</div>
			<div className="pk-material-list">
				{nodes.map((node, index) => (
					<Button
						key={node.sourceId}
						className="pk-material-row"
						variant="ghost"
						aria-pressed={node.sourceId === pinnedId}
						data-previewed={node.sourceId === selected.sourceId || undefined}
						onBlur={() => setPreviewedId(null)}
						onClick={() => setPinnedId(node.sourceId)}
						onFocus={() => setPreviewedId(node.sourceId)}
						onMouseEnter={() => setPreviewedId(node.sourceId)}
						onMouseLeave={() => setPreviewedId(null)}
					>
						<span className="pk-material-row-index">{String(index + 1).padStart(2, '0')}</span>
						<span className="pk-material-row-copy">
							<strong>{node.title}</strong>
							<small>{node.reason || node.path}</small>
						</span>
						<span className="pk-material-row-score">{formatScore(node.score)}</span>
					</Button>
				))}
			</div>
			<div className="pk-material-detail">
				<div className="pk-material-detail-head">
					<strong>{strings.materialPreview}</strong>
					<span>{strings.materialHoverHint}</span>
				</div>
				<div className="pk-material-detail-copy">
					<strong className="pk-material-detail-title">{selected.title}</strong>
					{selected.reason && <span className="pk-material-detail-reason">{selected.reason}</span>}
					<span className="pk-material-detail-excerpt">
						{selected.excerpt || strings.materialPreviewEmpty}
					</span>
					<span className="pk-material-detail-path">{selected.path}</span>
				</div>
				<div className="pk-material-detail-footer">
					<Button className="pk-material-open-full" variant="ghost" size="sm" onClick={onOpenFullView}>
						<ExternalLink aria-hidden />
						{strings.openFullView}
					</Button>
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
		</div>
	);
}

function ThoughtRow({
	thought,
	organizeLabel,
	bringIntoSessionLabel,
	fromRunTemplate,
	onBringIntoSession,
	onOrganize,
}: {
	thought: BriefThought;
	organizeLabel: string;
	bringIntoSessionLabel: string;
	fromRunTemplate: string;
	onBringIntoSession: () => void;
	onOrganize: () => void;
}): React.ReactElement {
	return (
		<details className="pk-thought-row" data-thought-id={thought.thoughtId}>
			<summary>
				<span className="pk-thought-copy">
					<strong className="pk-thought-title">{thought.label}</strong>
					{thought.detail && <span className="pk-thought-summary">{thought.detail}</span>}
				</span>
				<ChevronDown aria-hidden />
			</summary>
			<div className="pk-thought-preview">
				<small>{fromRunTemplate.replace('{runId}', thought.runId)}</small>
				{thought.detail && <span>{thought.detail}</span>}
				<div className="pk-thought-actions">
					<Button variant="outline" size="sm" onClick={onBringIntoSession}>
						{bringIntoSessionLabel}
					</Button>
					<Button variant="ghost" size="sm" onClick={onOrganize}>
						{organizeLabel}
					</Button>
				</div>
			</div>
		</details>
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
