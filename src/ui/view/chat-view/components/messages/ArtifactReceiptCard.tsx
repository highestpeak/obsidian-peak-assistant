/**
 * ArtifactReceiptCard — renders one ChatArtifactReceipt (spec §7.5 / MSG-05).
 *
 * Rules:
 *   • Buttons render ONLY for actions listed in receipt.availableActions,
 *     and only when the caller supplies a real handler. No handler → no button.
 *   • State badge is truthful: generating (spinner), ready, saved (with
 *     vaultPath tooltip), failed (with error message). We never render a
 *     "ready" badge for a failed/cancelled receipt.
 *   • Icons come from Lucide; brand-agnostic per ui-design conventions.
 */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
	Image as ImageIcon,
	FileText,
	Table as TableIcon,
	Code as CodeIcon,
	GitCommitHorizontal,
	Network,
	PenTool,
	Layers,
	Package,
	Music,
	Video,
	FileQuestion,
	Search as SearchIcon,
	Scissors,
	BellRing,
	Loader2,
	Check,
	AlertTriangle,
	Eye,
	ExternalLink,
	Save,
	Download,
	Copy,
	Pencil,
	Play,
	RefreshCw,
	Search,
	Maximize2,
	ChevronLeft,
	ChevronRight,
	X,
	CheckCircle2,
	Ban,
	Settings as SettingsIcon,
	Wand2,
} from 'lucide-react';
import type {
	ChatArtifactReceipt,
	ChatArtifactAction,
	ChatArtifactKind,
} from '@/core/types/chat-studio';
import { Button } from '@/ui/components/primitives';
import { cn } from '@/ui/react/lib/utils';
import { useChatStudioStrings } from '../../chatStudioStringsContext';
import type { ChatStudioStrings } from '../../chatStudioStrings';
import { portalHostForDocument } from '@/ui/react/ReactRenderer';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { resolveArtifactMediaUri, type VaultPathResolver } from './artifactMediaUri';
import {
	evaluateMusicTermsAcceptance,
	musicConfirmGate,
	buildAcceptanceRecord,
} from '@/service/media/musicTermsAcceptance';
import { useSettingsStrings } from '@/ui/view/settings/settingsStrings';

export type ArtifactReceiptStrings = ChatStudioStrings['artifactReceipt'];

// Handler map: caller supplies the ones that are actually wired. An action
// whose id isn't in `availableActions` OR whose handler is missing is not
// rendered.
export interface ArtifactActionHandlers {
	preview?: (r: ChatArtifactReceipt) => void;
	open?: (r: ChatArtifactReceipt) => void;
	save?: (r: ChatArtifactReceipt) => void;
	download?: (r: ChatArtifactReceipt) => void;
	copy?: (r: ChatArtifactReceipt) => void;
	edit?: (r: ChatArtifactReceipt) => void;
	apply?: (r: ChatArtifactReceipt) => void;
	retry?: (r: ChatArtifactReceipt) => void;
	review?: (r: ChatArtifactReceipt) => void;
	/** D2 §R2: confirm an awaiting-confirmation media job. */
	confirm?: (r: ChatArtifactReceipt) => void;
	/** D2 §R3: cancel a queued / awaiting-confirmation / running media job. */
	cancel?: (r: ChatArtifactReceipt) => void;
	/** Task E1 §R2 — jump into the settings tab named by the receipt's
	 * `configureAction` (via mediaSettingsOverlay.resolveConfigureTab). */
	configure?: (r: ChatArtifactReceipt) => void;
	/** Zero-gap §4 A1 — prefill Composer Edit-image form with this receipt. */
	'insert-as-reference'?: (r: ChatArtifactReceipt) => void;
}

export interface ArtifactReceiptCardProps {
	receipt: ChatArtifactReceipt;
	handlers: ArtifactActionHandlers;
	/** All visual receipts in this message. Image previews use it for lightbox navigation. */
	galleryReceipts?: ChatArtifactReceipt[];
}

export type ArtifactReceiptLayout = 'visual' | 'rich' | 'compact';

const KIND_ICON: Record<ChatArtifactKind, React.ComponentType<{ className?: string }>> = {
	image: ImageIcon,
	document: FileText,
	table: TableIcon,
	dataset: TableIcon,
	code: CodeIcon,
	diff: GitCommitHorizontal,
	diagram: Network,
	drawing: PenTool,
	canvas: PenTool,
	base: Layers,
	bundle: Package,
	audio: Music,
	video: Video,
	custom: FileQuestion,
	dataview: SearchIcon,
	extract: Scissors,
	reminder: BellRing,
};

const ACTION_ICON: Record<ChatArtifactAction, React.ComponentType<{ className?: string }>> = {
	preview: Eye,
	open: ExternalLink,
	save: Save,
	download: Download,
	copy: Copy,
	edit: Pencil,
	apply: Play,
	retry: RefreshCw,
	review: Search,
	confirm: CheckCircle2,
	cancel: Ban,
	configure: SettingsIcon,
	'insert-as-reference': Wand2,
};

// Action id → config key. Icons stay in code (Lucide can't live in JSON);
// labels are template-driven (chat-studio.json `artifactReceipt`, FIX 6).
function actionLabel(
	id: ChatArtifactAction,
	labels: ArtifactReceiptStrings,
	composerLabels: { insertAsReferenceLabel: string },
): string {
	switch (id) {
		case 'preview': return labels.actionPreview;
		case 'open': return labels.actionOpen;
		case 'save': return labels.actionSave;
		case 'download': return labels.actionDownload;
		case 'copy': return labels.actionCopy;
		case 'edit': return labels.actionEdit;
		case 'apply': return labels.actionApply;
		case 'retry': return labels.actionRetry;
		case 'review': return labels.actionReview;
		case 'confirm': return labels.actionConfirm;
		case 'cancel': return labels.actionCancel;
		case 'configure': return labels.actionConfigure;
		case 'insert-as-reference': return composerLabels.insertAsReferenceLabel;
	}
}

export const ArtifactReceiptCard: React.FC<ArtifactReceiptCardProps> = ({
	receipt,
	handlers,
	galleryReceipts,
}) => {
	const studioStrings = useChatStudioStrings();
	const labels = studioStrings.artifactReceipt;
	const composerActionLabels = { insertAsReferenceLabel: studioStrings.composer.insertAsReferenceLabel };
	const { vaultPreview, settings, settingsActions } = useServiceContext();
	const settingsStrings = useSettingsStrings();
	// C1 fix: the receipt persists a durable vault path in preview.uri, but
	// `<img src>` cannot load that. Convert to Obsidian's session-scoped
	// resource URL at RENDER time (never write it back to the receipt — the
	// URL is session-scoped and would go stale across reloads).
	const resolveVaultPath = React.useCallback<VaultPathResolver>(
		(path) => vaultPreview.getResourcePath(path),
		[vaultPreview],
	);
	const [imageOpen, setImageOpen] = useState(false);
	const [activeImageIndex, setActiveImageIndex] = useState(0);
	const cardRef = useRef<HTMLDivElement | null>(null);
	const KindIcon = KIND_ICON[receipt.kind] ?? FileQuestion;
	const badge = renderBadge(receipt, labels);
	const imageGallery = (galleryReceipts ?? [receipt]).filter((rc) => isPreviewableImage(rc, resolveVaultPath));
	const ownImageIndex = Math.max(0, imageGallery.findIndex((candidate) => candidate.artifactId === receipt.artifactId));
	const activeImageReceipt = imageGallery[activeImageIndex] ?? receipt;
	const activeImageUri = resolveArtifactMediaUri(activeImageReceipt, resolveVaultPath);
	const openImage = () => {
		setActiveImageIndex(ownImageIndex);
		setImageOpen(true);
	};
	const moveImage = (delta: number) => {
		if (imageGallery.length < 2) return;
		setActiveImageIndex((current) => (current + delta + imageGallery.length) % imageGallery.length);
	};
	const preview = renderPreview(receipt, labels, openImage, resolveVaultPath);
	const layout = getArtifactReceiptLayout(receipt);
	const confirmCost = receipt.state === 'awaiting-confirmation'
		? renderConfirmCostDetails(receipt, labels)
		: null;

	// Zero-gap E — music licensing gate. Only fires when the receipt is
	// awaiting confirmation AND its media kind is music. Uses per-policy
	// version acceptance persisted in settings.ai.mediaDefaults so a
	// re-run within the same policy version does not re-prompt.
	const musicStrings = settingsStrings?.mediaGeneration?.presets;
	const mediaExtras = (receipt as unknown as { media?: { mediaKind?: string } }).media;
	const activePolicyVersion = musicStrings?.musicLicensingPolicyVersion ?? '2026-07-21';
	const acceptanceView = evaluateMusicTermsAcceptance({
		activePolicyVersion,
		acceptance: settings?.ai?.mediaDefaults?.musicLicensingAccepted,
	});
	const [musicTermsChecked, setMusicTermsChecked] = useState(false);
	const musicGate = musicConfirmGate({
		mediaKind: mediaExtras?.mediaKind,
		acceptance: acceptanceView,
		checkedThisSession: musicTermsChecked,
	});

	useEffect(() => {
		if (!imageOpen) return;
		const doc = cardRef.current?.ownerDocument ?? document;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') setImageOpen(false);
			if (event.key === 'ArrowLeft') moveImage(-1);
			if (event.key === 'ArrowRight') moveImage(1);
		};
		doc.addEventListener('keydown', handleKeyDown);
		return () => doc.removeEventListener('keydown', handleKeyDown);
	}, [imageOpen, imageGallery.length]);

	// De-dupe availableActions (defensive) and only keep ones we have a
	// handler for. This is the ONE place that policy is enforced.
	const seen = new Set<ChatArtifactAction>();
	const actions: Array<{ id: ChatArtifactAction; handler: (r: ChatArtifactReceipt) => void; disabled?: boolean; disabledReason?: string }> = [];
	for (const id of receipt.availableActions) {
		if (seen.has(id)) continue;
		seen.add(id);
		const h = handlers[id];
		if (!h) continue;
		if (id === 'confirm' && musicGate.disabled) {
			actions.push({ id, handler: h, disabled: true, disabledReason: musicGate.reason });
			continue;
		}
		if (id === 'confirm' && musicGate.requiresAcceptance && !musicGate.disabled) {
			// Terms just accepted this session — wrap the handler so we
			// persist the acceptance right before invoking confirm.
			const wrapped = (r: ChatArtifactReceipt) => {
				try {
					const persisted = buildAcceptanceRecord(activePolicyVersion);
					void settingsActions?.updateAI?.('mediaDefaults', {
						...(settings?.ai?.mediaDefaults ?? {}),
						musicLicensingAccepted: persisted,
					});
				} catch (e) {
					console.warn('[ArtifactReceiptCard] persist music terms failed:', e);
				}
				h(r);
			};
			actions.push({ id, handler: wrapped });
			continue;
		}
		actions.push({ id, handler: h });
	}

	return (
		<>
		<div
			ref={cardRef}
			className="pkchat-artifact-receipt"
			data-artifact-id={receipt.artifactId}
			data-kind={receipt.kind}
			data-state={receipt.state}
			data-layout={layout}
		>
			{layout === 'visual' ? preview : null}
			<div className="pkchat-artifact-receipt__head">
				<span className="pkchat-artifact-receipt__icon" aria-hidden="true">
					<KindIcon className="pktw-w-4 pktw-h-4" />
				</span>
				<div className="pkchat-artifact-receipt__title-block">
					<span className="pkchat-artifact-receipt__title">{receipt.title || labels.untitledFallback}</span>
					{receipt.vaultPath && (
						<span className="pkchat-artifact-receipt__path" title={receipt.vaultPath}>
							{receipt.vaultPath}
						</span>
					)}
					{receipt.error?.message && (
						<span className="pkchat-artifact-receipt__error" title={receipt.error.message}>
							{receipt.error.message}
						</span>
					)}
				</div>
				{badge}
			</div>
			{layout !== 'visual' ? preview : null}
			{confirmCost}
			{musicGate.requiresAcceptance && musicStrings && (
				<div
					className="pkchat-artifact-receipt__music-terms"
					data-testid="artifact-music-terms"
				>
					<span className="pktw-block pktw-text-pk-sm pktw-font-medium pktw-text-foreground">
						{musicStrings.musicLicensingTitle}
					</span>
					<span className="pktw-block pktw-text-pk-xs pktw-text-muted-foreground pktw-mt-1">
						{musicStrings.musicLicensingBody}
					</span>
					<a
						className="pktw-inline-flex pktw-items-center pktw-gap-1 pktw-text-pk-xs pktw-text-accent pktw-mt-1"
						href={musicStrings.musicLicensingUrl}
						target="_blank"
						rel="noreferrer"
					>
						{musicStrings.musicLicensingLinkLabel}
					</a>
					<label className="pktw-flex pktw-items-center pktw-gap-2 pktw-mt-2 pktw-text-pk-xs">
						<input
							type="checkbox"
							checked={musicTermsChecked}
							onChange={(e) => setMusicTermsChecked(e.target.checked)}
							data-testid="artifact-music-terms-checkbox"
						/>
						<span>{musicStrings.musicLicensingConfirmCheckboxLabel}</span>
					</label>
					<span className="pktw-block pktw-text-pk-xs pktw-text-pk-text-tertiary pktw-mt-1">
						{musicStrings.musicLicensingConfirmHint}
					</span>
				</div>
			)}

			{actions.length > 0 && (
				<div className="pkchat-artifact-receipt__actions">
					{actions.map(({ id, handler, disabled, disabledReason }) => {
						const Icon = ACTION_ICON[id];
						const label = actionLabel(id, labels, composerActionLabels);
						return (
							<Button
								key={id}
								variant="ghost"
								size="sm"
								onClick={() => { if (!disabled) handler(receipt); }}
								aria-label={label}
								title={disabledReason ?? label}
								disabled={!!disabled}
								className="pkchat-artifact-receipt__action-btn"
							>
								<Icon className="pktw-w-3.5 pktw-h-3.5" />
								<span>{label}</span>
							</Button>
						);
					})}
				</div>
			)}
		</div>
		{imageOpen && activeImageUri && createPortal(
			<div
				className="pkchat-image-lightbox"
				role="dialog"
				aria-modal="true"
				aria-label={activeImageReceipt.title || labels.untitledFallback}
				onClick={() => setImageOpen(false)}
			>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="pkchat-image-lightbox__close"
					aria-label={labels.closePreviewLabel}
					title={labels.closePreviewLabel}
					onClick={() => setImageOpen(false)}
				>
					<X />
				</Button>
				{imageGallery.length > 1 && (
					<>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="pkchat-image-lightbox__nav pkchat-image-lightbox__nav--previous"
							aria-label={labels.previousPreviewLabel}
							title={labels.previousPreviewLabel}
							onClick={(event) => {
								event.stopPropagation();
								moveImage(-1);
							}}
						>
							<ChevronLeft />
						</Button>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="pkchat-image-lightbox__nav pkchat-image-lightbox__nav--next"
							aria-label={labels.nextPreviewLabel}
							title={labels.nextPreviewLabel}
							onClick={(event) => {
								event.stopPropagation();
								moveImage(1);
							}}
						>
							<ChevronRight />
						</Button>
					</>
				)}
				<div className="pkchat-image-lightbox__stage" onClick={(event) => event.stopPropagation()}>
					<img src={activeImageUri} alt={activeImageReceipt.title || labels.untitledFallback} />
					<span className="pkchat-image-lightbox__caption">
						<span>{activeImageReceipt.title || labels.untitledFallback}</span>
						{imageGallery.length > 1 && <span>{activeImageIndex + 1} / {imageGallery.length}</span>}
					</span>
				</div>
			</div>,
			portalHostForDocument(cardRef.current?.ownerDocument ?? document),
		)}
		</>
	);
};

function isPreviewableImage(
	receipt: ChatArtifactReceipt,
	resolveVaultPath: VaultPathResolver,
): boolean {
	const isAvailable = receipt.state === 'ready' || receipt.state === 'saved';
	return isAvailable
		&& receipt.preview?.kind === 'image'
		&& Boolean(resolveArtifactMediaUri(receipt, resolveVaultPath));
}

export function getArtifactReceiptLayout(receipt: ChatArtifactReceipt): ArtifactReceiptLayout {
	// Layout classification only needs to know whether a raw media reference
	// exists — resolvability is a render-time concern. This keeps the layout
	// decision pure (no VaultPreviewPort dep) so MessageViewItem can bucket
	// receipts before the card mounts.
	const hasRawMedia = Boolean(receipt.preview?.uri ?? receipt.externalUri ?? receipt.uri);
	const isAvailable = receipt.state === 'ready' || receipt.state === 'saved';
	const hasVisualPreview = isAvailable && hasRawMedia && (
		receipt.preview?.kind === 'image' || receipt.kind === 'video'
	);
	if (hasVisualPreview) return 'visual';
	const hasRichPreview = Boolean(receipt.preview?.text)
		|| (isAvailable && receipt.kind === 'audio' && hasRawMedia);
	return hasRichPreview ? 'rich' : 'compact';
}

function renderPreview(
	receipt: ChatArtifactReceipt,
	labels: ArtifactReceiptStrings,
	onOpenImage: () => void,
	resolveVaultPath: VaultPathResolver,
): React.ReactNode {
	const preview = receipt.preview;
	const mediaUri = resolveArtifactMediaUri(receipt, resolveVaultPath);
	const isAvailable = receipt.state === 'ready' || receipt.state === 'saved';

	if (isAvailable && preview?.kind === 'image' && mediaUri) {
		return (
			<Button
				type="button"
				variant="ghost"
				className="pkchat-artifact-receipt__preview pkchat-artifact-receipt__preview--image"
				onClick={onOpenImage}
				aria-label={`${labels.imagePreviewLabel}: ${receipt.title || labels.untitledFallback}`}
				title={labels.imagePreviewLabel}
			>
				<img src={mediaUri} alt={receipt.title} loading="lazy" />
				<span className="pkchat-artifact-receipt__preview-zoom" aria-hidden="true"><Maximize2 /></span>
			</Button>
		);
	}
	if (isAvailable && receipt.kind === 'video' && mediaUri) {
		return (
			<div className="pkchat-artifact-receipt__preview pkchat-artifact-receipt__preview--video">
				<video src={mediaUri} controls preload="metadata" aria-label={receipt.title} />
			</div>
		);
	}
	if (isAvailable && receipt.kind === 'audio' && mediaUri) {
		return (
			<div className="pkchat-artifact-receipt__preview pkchat-artifact-receipt__preview--audio">
				<audio src={mediaUri} controls preload="metadata" aria-label={receipt.title} />
			</div>
		);
	}
	if (preview?.text && (preview.kind === 'text' || preview.kind === 'document' || preview.kind === 'code')) {
		return (
			<div className="pkchat-artifact-receipt__preview pkchat-artifact-receipt__preview--text">
				{preview.text}
			</div>
		);
	}
	return null;
}

/**
 * D2 I2 — awaiting-confirmation cost card. Reads the media extras (which
 * MediaGenerationService.buildAsyncPendingReceipt fills from preflight +
 * the original request) so the confirm click is NEVER "blind": the user
 * sees the exact route/provider/model + quantitative bounds
 * (duration/quantity) + estimated cost + confidence label. When the
 * preflight had no estimate (`amountUsd` undefined) we surface an honest
 * "not available" string instead of fabricating a number.
 *
 * E2 R2#7: the data-shaping (which rows appear + what the values look like)
 * is extracted into `buildConfirmCostRows()` so a unit test can exercise
 * every branch (with/without estimate, image quantity gate, duration
 * present/absent) without a React renderer.
 */
function renderConfirmCostDetails(
	receipt: ChatArtifactReceipt,
	labels: ArtifactReceiptStrings,
): React.ReactNode {
	const rows = buildConfirmCostRows(receipt, labels);
	if (!rows) return null;
	return (
		<div className="pkchat-artifact-receipt__confirm-cost" data-testid="artifact-confirm-cost">
			<span className="pkchat-artifact-receipt__confirm-cost-heading">
				{labels.confirmCostHeading}
			</span>
			<dl className="pkchat-artifact-receipt__confirm-cost-list">
				{rows.map((row) => (
					<React.Fragment key={row.label}>
						<dt className="pkchat-artifact-receipt__confirm-cost-label">{row.label}</dt>
						<dd className="pkchat-artifact-receipt__confirm-cost-value">{row.value}</dd>
					</React.Fragment>
				))}
			</dl>
		</div>
	);
}

/**
 * E2 R2#7 (D2 deferred): pure data-prep for the confirm-cost card. Exported
 * for the unit test in test/artifact-confirm-cost-details.test.ts. Returns
 * `null` when no media extras exist (the card is hidden). Each element is
 * one `<dt><dd>` row.
 */
export function buildConfirmCostRows(
	receipt: ChatArtifactReceipt,
	labels: ArtifactReceiptStrings,
): Array<{ label: string; value: string }> | null {
	const media = (receipt as unknown as { media?: {
		executionRoute?: string;
		provider?: string;
		modelId?: string;
		mediaKind?: string;
		durationSeconds?: number;
		quantity?: number;
		cost?: { amountUsd?: number; billingUnit: string; confidence: 'estimated' | 'provider-reported' };
	} }).media;
	if (!media) return null;
	const rows: Array<{ label: string; value: string }> = [];
	if (media.executionRoute) rows.push({ label: labels.confirmCostRouteLabel, value: media.executionRoute });
	if (media.provider) rows.push({ label: labels.confirmCostProviderLabel, value: media.provider });
	if (media.modelId) rows.push({ label: labels.confirmCostModelLabel, value: media.modelId });
	if (typeof media.durationSeconds === 'number') {
		rows.push({
			label: labels.confirmCostDurationLabel,
			value: `${media.durationSeconds}${labels.confirmCostDurationUnit}`,
		});
	}
	if (typeof media.quantity === 'number' && media.mediaKind === 'image') {
		rows.push({ label: labels.confirmCostQuantityLabel, value: String(media.quantity) });
	}
	const est = media.cost;
	let estimateText: string;
	if (est && typeof est.amountUsd === 'number') {
		const amount = est.amountUsd < 0.01 ? `$${est.amountUsd.toFixed(4)}` : `$${est.amountUsd.toFixed(2)}`;
		const confidence = est.confidence === 'estimated'
			? labels.confirmCostConfidenceEstimated
			: labels.confirmCostConfidenceReported;
		estimateText = `${amount} / ${est.billingUnit} (${confidence})`;
	} else {
		estimateText = labels.confirmCostEstimateUnavailable;
	}
	rows.push({ label: labels.confirmCostEstimateLabel, value: estimateText });
	return rows;
}

function renderBadge(receipt: ChatArtifactReceipt, labels: ArtifactReceiptStrings): React.ReactNode {
	const s = receipt.state;
	if (s === 'generating' || s === 'pending' || s === 'saving') {
		return (
			<span className={cn('pkchat-artifact-receipt__badge', 'pkchat-artifact-receipt__badge--busy')}>
				<Loader2 className="pktw-w-3 pktw-h-3 pktw-animate-spin" />
				<span>{s === 'saving' ? labels.badgeSaving : labels.badgeGenerating}</span>
			</span>
		);
	}
	if (s === 'ready') {
		return (
			<span className={cn('pkchat-artifact-receipt__badge', 'pkchat-artifact-receipt__badge--ready')}>
				<Check className="pktw-w-3 pktw-h-3" />
				<span>{labels.badgeReady}</span>
			</span>
		);
	}
	if (s === 'saved') {
		return (
			<span className={cn('pkchat-artifact-receipt__badge', 'pkchat-artifact-receipt__badge--saved')}>
				<Check className="pktw-w-3 pktw-h-3" />
				<span>{labels.badgeSaved}</span>
			</span>
		);
	}
	if (s === 'awaiting-confirmation') {
		return (
			<span className={cn('pkchat-artifact-receipt__badge', 'pkchat-artifact-receipt__badge--warn')}>
				<AlertTriangle className="pktw-w-3 pktw-h-3" />
				<span>{labels.badgeAwaitingConfirmation}</span>
			</span>
		);
	}
	if (s === 'needs-configuration') {
		return (
			<span className={cn('pkchat-artifact-receipt__badge', 'pkchat-artifact-receipt__badge--warn')}>
				<AlertTriangle className="pktw-w-3 pktw-h-3" />
				<span>{labels.badgeNeedsConfiguration}</span>
			</span>
		);
	}
	if (s === 'failed' || s === 'cancelled' || s === 'stale' || s === 'needs-permission') {
		return (
			<span className={cn('pkchat-artifact-receipt__badge', 'pkchat-artifact-receipt__badge--warn')}>
				<AlertTriangle className="pktw-w-3 pktw-h-3" />
				<span>{s === 'failed' ? labels.badgeFailed : s === 'cancelled' ? labels.badgeCancelled : s === 'stale' ? labels.badgeStale : labels.badgeNeedsPermission}</span>
			</span>
		);
	}
	return null;
}
