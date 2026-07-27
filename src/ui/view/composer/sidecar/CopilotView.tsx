import * as React from 'react';
import { ArrowLeft, ChevronRight, ExternalLink, Send, Sparkles, X } from 'lucide-react';
import type { ComposerContextSnapshot } from '@/core/composer';
import { composerTargetBlockId } from '@/core/composer';
import type {
	ComposerRelatedMaterialSnapshot,
	RelatedPreviewNode,
	SuggestionFinding,
	IntelligenceRuntime,
} from '@/service/composer';
import { selectLocalPreview } from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import { PromptInput, PromptInputBody, PromptInputAttachments } from '@/ui/component/prompt-input';
import { cn } from '@/ui/react/lib/utils';
import type { SidecarConfig } from './sidecarConfig';
import { useSidecar, useFindings, useSessionProjection } from './SidecarContext';
import { RunReceiptCard } from './RunReceiptCard';
import { RelatedMaterialsModal } from './RelatedMaterialsModal';

/**
 * Peak Composer — Copilot view (WP9). Renders the brief / session / review
 * lifecycle without a permanent stage rail (§12.1). The document is the review
 * truth; this surface only navigates, explains and shows receipts (§12.1
 * "sidecar 提供状态、导航、解释与 run receipt").
 */
export function CopilotView(): React.ReactElement {
	const { runtime } = useSidecar();
	const projection = useSessionProjection(runtime);
	if (projection.stage === 'session') return <SessionView />;
	if (projection.stage === 'review') return <ReviewView />;
	return <BriefView />;
}

// ── brief ─────────────────────────────────────────────────────────────────────

export function BriefView(): React.ReactElement {
	const { runtime, config, onLocate, onOpenSource } = useSidecar();
	const findings = useFindings(runtime);
	const [related, setRelated] = React.useState<ComposerRelatedMaterialSnapshot | null>(null);
	const [relatedReloadToken, setRelatedReloadToken] = React.useState(0);
	const [modalOpen, setModalOpen] = React.useState(false);
	const onRefreshRelated = React.useCallback(() => {
		setRelatedReloadToken((n) => n + 1);
	}, []);

	return (
		<>
			<BriefViewContent
				config={config}
				findings={findings}
				modalOpen={modalOpen}
				onLocate={onLocate}
				onOpenSource={onOpenSource}
				onRefreshRelated={onRefreshRelated}
				related={related}
				relatedPortAvailable={Boolean(runtime.related)}
				setModalOpen={setModalOpen}
				runtime={runtime}
			/>
			<RelatedLoader onLoaded={setRelated} reloadToken={relatedReloadToken} />
		</>
	);
}

export interface BriefViewContentProps {
	config: Pick<SidecarConfig, 'strings' | 'relatedPreviewCap'>;
	findings: readonly SuggestionFinding[];
	modalOpen: boolean;
	onLocate?: (blockId: string) => void;
	onOpenSource?: (path: string) => void;
	onRefreshRelated: () => void;
	related: ComposerRelatedMaterialSnapshot | null;
	relatedPortAvailable: boolean;
	setModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
	runtime: Pick<IntelligenceRuntime, 'session' | 'dismissFinding'>;
}

export function BriefViewContent({
	config,
	findings,
	modalOpen,
	onLocate,
	onOpenSource,
	onRefreshRelated,
	related,
	relatedPortAvailable,
	setModalOpen,
	runtime,
}: BriefViewContentProps): React.ReactElement {
	const s = config.strings;
	const active = findings.filter((f) => f.state === 'active' || f.state === 'stale');
	const preview: readonly RelatedPreviewNode[] = React.useMemo(
		() => (related ? selectLocalPreview(related, config.relatedPreviewCap) : []),
		[related, config.relatedPreviewCap],
	);
	const relatedCount = related ? related.items.length : 0;
	const hasBriefItems = active.length > 0 || relatedCount > 0;

	return (
		<div className="pk-brief" data-testid="pk-brief">
			<header className="pk-brief-intro">
				<span className="pk-brief-heading">{s.briefHeading}</span>
				<span className="pk-brief-subtitle">{s.briefIntro}</span>
				<div className="pk-brief-meta" aria-label={s.briefHeading}>
					{active.length > 0 && <span className="pk-status-chip">{`${s.sectionNextMoves} ${active.length}`}</span>}
					{relatedCount > 0 && <span className="pk-status-chip">{`${s.sectionRelated} ${relatedCount}`}</span>}
					{relatedPortAvailable && (
						<Button type="button" variant="ghost" size="sm" className="pk-chip-btn" onClick={onRefreshRelated}>
							{s.refreshRelated}
						</Button>
					)}
				</div>
			</header>

			{hasBriefItems ? (
				<>
					<BriefSection title={s.sectionNextMoves} count={active.length}>
						{active.map((f) => (
							<FindingRow
								key={f.findingId}
								finding={f}
								onDiscuss={() => runtime.session.openSession(f.reason)}
								onIgnore={() => runtime.dismissFinding(f.findingId, 'brief')}
								onLocate={() => {
									const blockId = composerTargetBlockId(f.target);
									if (blockId) onLocate?.(blockId);
								}}
								staleNotice={f.state === 'stale' ? s.staleFindingNotice : undefined}
								discussLabel={s.discuss}
								ignoreLabel={s.ignore}
							/>
						))}
					</BriefSection>

					<BriefSection title={s.sectionRelated} count={relatedCount}>
						{preview.map((node) => (
							<div key={node.sourceId} className="pk-related-row">
								<div className="pk-related-main">
									<span className="pk-related-title">{node.title}</span>
									{node.reason ? <span className="pk-related-reason">{node.reason}</span> : null}
									{node.path ? <span className="pk-related-path">{node.path}</span> : null}
								</div>
								<div className="pk-related-actions">
									<button type="button" className="pk-chip-btn" onClick={() => onOpenSource?.(node.path)}>
										{s.viewSource}
									</button>
								</div>
							</div>
						))}
						{related && related.items.length > preview.length && (
							<button type="button" className="pk-brief-fullview" onClick={() => setModalOpen(true)}>
								<ExternalLink size={12} />
								{s.openFullView}
							</button>
						)}
					</BriefSection>
				</>
			) : (
				<div className="pk-brief-empty-state" role="status">
					<span className="pk-brief-empty-title">{s.emptyBrief}</span>
					<span className="pk-brief-empty">{s.emptyBriefBody}</span>
				</div>
			)}

			{modalOpen && related && (
				<RelatedMaterialsModal snapshot={related} onClose={() => setModalOpen(false)} />
			)}
		</div>
	);
}


/** Loads the related snapshot once from the app-owned port (no-op without one). */
function RelatedLoader({
	onLoaded,
	reloadToken,
}: {
	onLoaded: (s: ComposerRelatedMaterialSnapshot) => void;
	reloadToken: number;
}): null {
	const { runtime, getFocusedBlockId, resolveRelatedFocus } = useSidecar();
	const requestIdRef = React.useRef(0);
	const latestRequestRef = React.useRef(0);
	React.useEffect(() => {
		const port = runtime.related;
		if (!port) return;
		let alive = true;
		const requestId = ++requestIdRef.current;
		latestRequestRef.current = requestId;
		// Resolve the REAL focused block (chrome focus) → anchor + query text. Falls
		// back to the whole-document focus when nothing is focused; failures are
		// swallowed (brief stays empty) since the port degrades to an empty snapshot.
		const focus = resolveRelatedFocus?.(getFocusedBlockId?.() ?? null) ?? {
			anchorId: 'document',
			documentId: 'document',
			focusText: '',
		};
		void port
			.buildSnapshot(focus)
			.then((snap) => {
				if (alive && requestId === latestRequestRef.current) {
					onLoaded(snap);
				}
			})
			.catch(() => undefined);
		return () => {
			alive = false;
		};
	}, [runtime, onLoaded, getFocusedBlockId, resolveRelatedFocus, reloadToken]);
	return null;
}

function BriefSection({
	title,
	count,
	children,
}: {
	title: string;
	count: number;
	children: React.ReactNode;
}): React.ReactElement | null {
	if (count <= 0) {
		return null;
	}
	return (
		<section className="pk-brief-section">
			<div className="pk-brief-section-head">
				<span className="pk-brief-section-title">{title}</span>
				<span className="pk-status-chip">{count}</span>
			</div>
			{children && <div className="pk-brief-section-body">{children}</div>}
		</section>
	);
}

function FindingRow({
	finding,
	onDiscuss,
	onIgnore,
	onLocate,
	staleNotice,
	discussLabel,
	ignoreLabel,
}: {
	finding: SuggestionFinding;
	onDiscuss: () => void;
	onIgnore: () => void;
	onLocate: () => void;
	staleNotice?: string;
	discussLabel: string;
	ignoreLabel: string;
}): React.ReactElement {
	return (
		<div className={cn('pk-finding-row', finding.state === 'stale' && 'pk-finding-row--stale')}>
			<button type="button" className="pk-finding-reason" onClick={onLocate} title={finding.reason}>
				{finding.reason}
			</button>
			{staleNotice && <span className="pk-finding-stale">{staleNotice}</span>}
			<div className="pk-finding-actions">
				<button type="button" className="pk-chip-btn pk-chip-btn--accent" onClick={onDiscuss}>
					<Sparkles size={11} />
					{discussLabel}
				</button>
				<button type="button" className="pk-chip-btn" onClick={onIgnore} aria-label={ignoreLabel}>
					<X size={11} />
				</button>
			</div>
		</div>
	);
}

// ── session ─────────────────────────────────────────────────────────────────────

function SessionView(): React.ReactElement {
	const { runtime, hub, config, getFocusedBlockId, resolveFocusContext } = useSidecar();
	const projection = useSessionProjection(runtime);
	const s = config.strings;

	const documentFallback = (): { snapshot: ComposerContextSnapshot; targetQuote: string } => ({
		snapshot: {
			documentId: 'document',
			revision: hub?.currentRevision ?? 'r0',
			target: { kind: 'document', documentId: 'document' },
			targetSource: '',
			nearby: { before: '', after: '' },
		},
		targetQuote: '',
	});

	const onSend = (text: string) => {
		if (!text.trim()) return;
		// Freeze the REAL focused block at send time (§12.2); the typed text is the
		// run instruction, the frozen target is what the user is focused on.
		const focused = getFocusedBlockId?.() ?? null;
		const ctx = resolveFocusContext?.(focused) ?? documentFallback();
		runtime.session.send({
			snapshot: ctx.snapshot,
			targetQuote: ctx.targetQuote || text.trim(),
			relatedRefs: [],
		});
	};

	return (
		<div className="pk-session" data-testid="pk-session">
			<div className="pk-session-head">
				<button type="button" className="pk-back-btn" aria-label={s.back} onClick={() => runtime.session.backToBrief()}>
					<ArrowLeft size={14} />
				</button>
				<span className="pk-session-title">{projection.sessionTitle ?? s.tabCopilot}</span>
			</div>
			<div className="pk-session-thread">
				{projection.receipts.map((r) => (
					<RunReceiptCard key={r.runId} receipt={r} />
				))}
			</div>
			<div className="pk-session-composer">
				<PromptInput
					className="pk-prompt-input-shell"
					onSubmit={(msg) => {
						onSend(msg.text);
					}}
				>
					<PromptInputAttachments />
					<div className="pk-prompt-editor">
						<PromptInputBody placeholder={s.askComposerPlaceholder} />
					</div>
					<div className="pk-prompt-foot">
						<button type="button" className="pk-chip-btn">
							{s.allCapabilities}
						</button>
						<button type="submit" className="pk-send-btn" aria-label={s.send}>
							<Send size={14} />
						</button>
					</div>
				</PromptInput>
			</div>
		</div>
	);
}

// ── review (transient) ──────────────────────────────────────────────────────────

function ReviewView(): React.ReactElement {
	const { runtime, config, onLocate } = useSidecar();
	const projection = useSessionProjection(runtime);
	const s = config.strings;
	const receipt = projection.receipts.find((r) => r.runId === projection.activeRunId);
	return (
		<div className="pk-review" data-testid="pk-review">
			<div className="pk-session-head">
				<button type="button" className="pk-back-btn" aria-label={s.back} onClick={() => runtime.session.closeReview()}>
					<ArrowLeft size={14} />
				</button>
				<span className="pk-session-title">{receipt?.action ?? s.reviewClose}</span>
			</div>
			<div className="pk-review-list">
				{(receipt?.changes ?? []).map((c) => (
					<button
						key={c.changeId}
						type="button"
						className="pk-review-item"
						onClick={() => {
							const blockId = composerTargetBlockId(c.target);
							if (blockId) onLocate?.(blockId);
						}}
					>
						<span className="pk-review-item-label">{c.label}</span>
						<ChevronRight size={13} />
					</button>
				))}
			</div>
			<button type="button" className="pk-review-close" onClick={() => runtime.session.closeReview()}>
				{s.reviewClose}
			</button>
		</div>
	);
}
