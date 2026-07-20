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

type ArtifactReceiptStrings = ChatStudioStrings['artifactReceipt'];

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
};

// Action id → config key. Icons stay in code (Lucide can't live in JSON);
// labels are template-driven (chat-studio.json `artifactReceipt`, FIX 6).
function actionLabel(id: ChatArtifactAction, labels: ArtifactReceiptStrings): string {
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
	}
}

export const ArtifactReceiptCard: React.FC<ArtifactReceiptCardProps> = ({
	receipt,
	handlers,
	galleryReceipts,
}) => {
	const labels = useChatStudioStrings().artifactReceipt;
	const [imageOpen, setImageOpen] = useState(false);
	const [activeImageIndex, setActiveImageIndex] = useState(0);
	const cardRef = useRef<HTMLDivElement | null>(null);
	const KindIcon = KIND_ICON[receipt.kind] ?? FileQuestion;
	const badge = renderBadge(receipt, labels);
	const imageGallery = (galleryReceipts ?? [receipt]).filter(isPreviewableImage);
	const ownImageIndex = Math.max(0, imageGallery.findIndex((candidate) => candidate.artifactId === receipt.artifactId));
	const activeImageReceipt = imageGallery[activeImageIndex] ?? receipt;
	const activeImageUri = resolveMediaUri(activeImageReceipt);
	const openImage = () => {
		setActiveImageIndex(ownImageIndex);
		setImageOpen(true);
	};
	const moveImage = (delta: number) => {
		if (imageGallery.length < 2) return;
		setActiveImageIndex((current) => (current + delta + imageGallery.length) % imageGallery.length);
	};
	const preview = renderPreview(receipt, labels, openImage);
	const layout = getArtifactReceiptLayout(receipt);

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
	const actions: Array<{ id: ChatArtifactAction; handler: (r: ChatArtifactReceipt) => void }> = [];
	for (const id of receipt.availableActions) {
		if (seen.has(id)) continue;
		seen.add(id);
		const h = handlers[id];
		if (h) actions.push({ id, handler: h });
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

			{actions.length > 0 && (
				<div className="pkchat-artifact-receipt__actions">
					{actions.map(({ id, handler }) => {
						const Icon = ACTION_ICON[id];
						const label = actionLabel(id, labels);
						return (
							<Button
								key={id}
								variant="ghost"
								size="sm"
								onClick={() => handler(receipt)}
								aria-label={label}
								title={label}
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

function resolveMediaUri(receipt: ChatArtifactReceipt): string | undefined {
	return receipt.preview?.uri ?? receipt.externalUri ?? receipt.uri;
}

function isPreviewableImage(receipt: ChatArtifactReceipt): boolean {
	const isAvailable = receipt.state === 'ready' || receipt.state === 'saved';
	return isAvailable && receipt.preview?.kind === 'image' && Boolean(resolveMediaUri(receipt));
}

export function getArtifactReceiptLayout(receipt: ChatArtifactReceipt): ArtifactReceiptLayout {
	const mediaUri = resolveMediaUri(receipt);
	const isAvailable = receipt.state === 'ready' || receipt.state === 'saved';
	const hasVisualPreview = isAvailable && Boolean(mediaUri) && (
		receipt.preview?.kind === 'image' || receipt.kind === 'video'
	);
	if (hasVisualPreview) return 'visual';
	const hasRichPreview = Boolean(receipt.preview?.text)
		|| (isAvailable && receipt.kind === 'audio' && Boolean(mediaUri));
	return hasRichPreview ? 'rich' : 'compact';
}

function renderPreview(
	receipt: ChatArtifactReceipt,
	labels: ArtifactReceiptStrings,
	onOpenImage: () => void,
): React.ReactNode {
	const preview = receipt.preview;
	const mediaUri = resolveMediaUri(receipt);
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
