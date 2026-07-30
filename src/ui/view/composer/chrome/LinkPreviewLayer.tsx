import * as React from 'react';
import { ExternalLink, FileText, TriangleAlert } from 'lucide-react';
import { Button, Chip } from '@/ui/components/primitives';
import { buildLinkPreview, type ComposerLinkPreview } from '@/service/composer';
import { useOwnerDocumentListener } from '@/ui/hooks/useOwnerWindow';
import { useComposerChrome } from './ComposerChromeContext';
import { useComposerSurfaces } from './ComposerSurfaceCoordinator';

interface LinkPopoverState {
	preview: ComposerLinkPreview;
	top: number;
	left: number;
	target: string;
}

interface PendingLink {
	element: HTMLElement;
	x: number;
	y: number;
}

/**
 * Delayed, informational link preview.
 *
 * Crossing a link no longer opens a command card. The pointer must settle
 * first; the resulting compact surface owns Composer hover until its safe
 * corridor closes. Transform/AI actions remain on explicit block surfaces.
 */
export function LinkPreviewLayer({
	containerRef,
}: {
	containerRef: React.RefObject<HTMLElement | null>;
}): React.ReactElement | null {
	const { runtime, config, snapshot, onOpenLink } = useComposerChrome();
	const c = config.chrome.link;
	const surfaces = useComposerSurfaces();
	const {
		active: activeSurface,
		canClaim: canClaimSurface,
		claim: claimSurface,
		release: releaseSurface,
	} = surfaces;
	const surfaceId = React.useId();
	const [state, setState] = React.useState<LinkPopoverState | null>(null);
	const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const pending = React.useRef<PendingLink | null>(null);

	const clearOpen = React.useCallback(() => {
		if (!openTimer.current) return;
		clearTimeout(openTimer.current);
		openTimer.current = null;
	}, []);
	const clearHide = React.useCallback(() => {
		if (!hideTimer.current) return;
		clearTimeout(hideTimer.current);
		hideTimer.current = null;
	}, []);
	const hide = React.useCallback(() => {
		clearOpen();
		clearHide();
		pending.current = null;
		setState(null);
		releaseSurface(surfaceId);
	}, [clearHide, clearOpen, releaseSurface, surfaceId]);
	const showFor = React.useCallback(
		(element: HTMLElement) => {
			const root = containerRef.current;
			const target = element.dataset.linkTarget;
			if (!root || !target || !runtime.linkPort) return;
			if (!canClaimSurface('link', surfaceId)) return;
			const preview = buildLinkPreview(target, snapshot?.filePath ?? '', runtime.linkPort);
			const rect = element.getBoundingClientRect();
			const rootRect = root.getBoundingClientRect();
			claimSurface({ id: surfaceId, kind: 'link', ownerId: target });
			setState({
				preview,
				target,
				top: rect.top - rootRect.top + root.scrollTop - 7,
				left: Math.max(4, rect.left - rootRect.left),
			});
			pending.current = null;
		},
		[
			canClaimSurface,
			claimSurface,
			containerRef,
			runtime.linkPort,
			snapshot,
			surfaceId,
		],
	);
	const scheduleShow = React.useCallback((element: HTMLElement, x: number, y: number) => {
		clearOpen();
		clearHide();
		pending.current = { element, x, y };
		openTimer.current = setTimeout(() => {
			openTimer.current = null;
			if (pending.current?.element !== element) return;
			showFor(element);
		}, config.chrome.surfacePreviewOpenDelayMs);
	}, [
		clearHide,
		clearOpen,
		config.chrome.surfacePreviewOpenDelayMs,
		showFor,
	]);
	const scheduleHide = React.useCallback(() => {
		clearOpen();
		clearHide();
		pending.current = null;
		hideTimer.current = setTimeout(hide, config.chrome.surfacePreviewCloseDelayMs);
	}, [
		clearHide,
		clearOpen,
		config.chrome.surfacePreviewCloseDelayMs,
		hide,
	]);

	const onOver = React.useCallback((event: MouseEvent) => {
		const target = event.target as HTMLElement | null;
		const link = target?.closest?.<HTMLElement>('.pk-composer-link');
		if (link) {
			clearHide();
			if (state?.target === link.dataset.linkTarget) return;
			scheduleShow(link, event.clientX, event.clientY);
			return;
		}
		if (target?.closest?.('.pk-link-popover')) {
			clearHide();
			return;
		}
		scheduleHide();
	}, [clearHide, scheduleHide, scheduleShow, state?.target]);
	const onPointerMove = React.useCallback((event: PointerEvent) => {
		const waiting = pending.current;
		if (!waiting) return;
		const target = event.target as HTMLElement | null;
		const link = target?.closest?.<HTMLElement>('.pk-composer-link');
		if (link !== waiting.element) return;
		const distance = Math.hypot(event.clientX - waiting.x, event.clientY - waiting.y);
		if (distance <= config.chrome.surfacePointerTravelTolerancePx) return;
		scheduleShow(waiting.element, event.clientX, event.clientY);
	}, [config.chrome.surfacePointerTravelTolerancePx, scheduleShow]);
	const onFocusIn = React.useCallback((event: FocusEvent) => {
		const target = event.target as HTMLElement | null;
		const link = target?.closest?.<HTMLElement>('.pk-composer-link');
		if (link) {
			clearOpen();
			clearHide();
			showFor(link);
			return;
		}
		if (!target?.closest?.('.pk-link-popover')) hide();
	}, [clearHide, clearOpen, hide, showFor]);

	useOwnerDocumentListener(containerRef, 'mouseover', onOver);
	useOwnerDocumentListener(containerRef, 'pointermove', onPointerMove);
	useOwnerDocumentListener(containerRef, 'focusin', onFocusIn);
	React.useEffect(() => {
		if (!activeSurface || activeSurface.id === surfaceId || !state) return;
		if (canClaimSurface('link', surfaceId)) return;
		hide();
	}, [activeSurface, canClaimSurface, hide, state, surfaceId]);
	React.useEffect(() => () => {
		clearOpen();
		clearHide();
		pending.current = null;
		releaseSurface(surfaceId);
	}, [clearHide, clearOpen, releaseSurface, surfaceId]);

	if (!state) return null;
	const preview = state.preview;
	return (
		<div
			className="pk-link-popover pk-composer-panel"
			data-chrome="true"
			data-composer-surface-owner={state.target}
			role="dialog"
			style={{ top: state.top, left: state.left, transform: 'translateY(-100%)' }}
			onPointerLeave={scheduleHide}
			onPointerEnter={clearHide}
		>
			{preview.kind === 'vault' && (
				<>
					<div className="pk-link-popover__head">
						<FileText size={13} />
						<span className="pk-link-popover__title">{preview.title}</span>
						<Button
							variant="ghost"
							size="sm"
							className="pk-link-popover__open"
							aria-label={c.openVault.replace('{title}', preview.title ?? preview.target)}
							title={c.openVault.replace('{title}', preview.title ?? preview.target)}
							onClick={() => onOpenLink?.('vault', preview.path ?? preview.target)}
						>
							<ExternalLink size={13} />
						</Button>
					</div>
					<span className="pk-link-popover__path">
						{`${c.pathLabel} · ${preview.path ?? ''}`}
					</span>
				</>
			)}
			{preview.kind === 'external' && (
				<>
					<div className="pk-link-popover__head">
						<ExternalLink size={13} />
						<span className="pk-link-popover__title">{preview.domain}</span>
						<Button
							variant="ghost"
							size="sm"
							className="pk-link-popover__open"
							aria-label={c.openExternal.replace('{url}', preview.url ?? preview.target)}
							title={c.openExternal.replace('{url}', preview.url ?? preview.target)}
							onClick={() => onOpenLink?.('external', preview.url ?? preview.target)}
						>
							<ExternalLink size={13} />
						</Button>
					</div>
					<span className="pk-link-popover__path">{preview.url}</span>
				</>
			)}
			{preview.kind === 'broken' && (
				<>
					<div className="pk-link-popover__head">
						<TriangleAlert size={13} />
						<span className="pk-link-popover__title">{c.brokenTitle}</span>
					</div>
					<span className="pk-link-popover__path">{preview.target}</span>
					{(preview.suggestions ?? []).length > 0 && (
						<div className="pk-link-popover__fixes">
							{(preview.suggestions ?? []).slice(0, 2).map((suggestion) => (
								<Chip
									key={suggestion}
									variant="info"
									className="pk-link-popover__fix"
									onClick={() => onOpenLink?.('vault', suggestion)}
								>
									{suggestion}
								</Chip>
							))}
						</div>
					)}
				</>
			)}
		</div>
	);
}
