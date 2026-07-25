import * as React from 'react';
import { ExternalLink, FileText, TriangleAlert } from 'lucide-react';
import { Button, Chip } from '@/ui/components/primitives';
import { buildLinkPreview, type ComposerLinkPreview } from '@/service/composer';
import { useOwnerDocumentListener } from '@/ui/hooks/useOwnerWindow';
import { useComposerChrome } from './ComposerChromeContext';

/**
 * Link hover/keyboard preview layer (WP4, §7.7). Event-delegated over the
 * composer root: `mouseover` AND `focusin` (dual channel) on any
 * `.pk-composer-link` reveal a popover with — vault: title / path / summary +
 * 打开定位; external: domain / full URL + 打开; broken: repair suggestions that
 * never block viewing the raw target. Listeners and geometry are owner-scoped
 * (popout-safe); the popover renders inside the composer root, not a global
 * body portal, so it lives in the correct document by construction.
 */
export function LinkPreviewLayer({
	containerRef,
}: {
	containerRef: React.RefObject<HTMLElement | null>;
}): React.ReactElement | null {
	const { runtime, config, snapshot, onOpenLink } = useComposerChrome();
	const c = config.chrome.link;
	const [state, setState] = React.useState<{
		preview: ComposerLinkPreview;
		top: number;
		left: number;
	} | null>(null);
	const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

	const showFor = React.useCallback(
		(el: HTMLElement) => {
			const root = containerRef.current;
			const target = el.dataset.linkTarget;
			if (!root || !target || !runtime.linkPort) return;
			const preview = buildLinkPreview(target, snapshot?.filePath ?? '', runtime.linkPort);
			const rect = el.getBoundingClientRect();
			const rootRect = root.getBoundingClientRect();
			setState({
				preview,
				top: rect.bottom - rootRect.top + root.scrollTop + 6,
				left: Math.max(4, rect.left - rootRect.left),
			});
		},
		[containerRef, runtime.linkPort, snapshot],
	);

	const scheduleHide = React.useCallback(() => {
		if (hideTimer.current) clearTimeout(hideTimer.current);
		hideTimer.current = setTimeout(() => setState(null), 220);
	}, []);
	const cancelHide = React.useCallback(() => {
		if (hideTimer.current) clearTimeout(hideTimer.current);
	}, []);

	const onOver = React.useCallback(
		(ev: MouseEvent) => {
			const link = (ev.target as HTMLElement | null)?.closest?.<HTMLElement>('.pk-composer-link');
			if (link) {
				cancelHide();
				showFor(link);
				return;
			}
			if ((ev.target as HTMLElement | null)?.closest?.('.pk-link-popover')) {
				cancelHide();
				return;
			}
			scheduleHide();
		},
		[showFor, scheduleHide, cancelHide],
	);
	const onFocusIn = React.useCallback(
		(ev: FocusEvent) => {
			const link = (ev.target as HTMLElement | null)?.closest?.<HTMLElement>('.pk-composer-link');
			if (link) showFor(link);
			else if (!(ev.target as HTMLElement | null)?.closest?.('.pk-link-popover')) setState(null);
		},
		[showFor],
	);
	useOwnerDocumentListener(containerRef, 'mouseover', onOver);
	useOwnerDocumentListener(containerRef, 'focusin', onFocusIn);
	React.useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

	if (!state) return null;
	const p = state.preview;
	return (
		<div
			className="pk-link-popover pk-composer-panel"
			data-chrome="true"
			role="dialog"
			style={{ top: state.top, left: state.left }}
			onMouseLeave={scheduleHide}
			onMouseEnter={cancelHide}
		>
			{p.kind === 'vault' && (
				<>
					<div className="pk-link-popover__head">
						<FileText size={13} />
						<span className="pk-link-popover__title">{p.title}</span>
					</div>
					<span className="pk-link-popover__path">{`${c.pathLabel} · ${p.path ?? ''}`}</span>
					{p.summary && <span className="pk-link-popover__summary">{p.summary}</span>}
					<Button
						variant="secondary"
						size="sm"
						data-link-open="true"
						onClick={() => onOpenLink?.('vault', p.path ?? p.target)}
					>
						{c.openVault.replace('{title}', p.title ?? p.target)}
					</Button>
				</>
			)}
			{p.kind === 'external' && (
				<>
					<div className="pk-link-popover__head">
						<ExternalLink size={13} />
						<span className="pk-link-popover__title">{p.domain}</span>
					</div>
					<span className="pk-link-popover__path">{p.url}</span>
					<Button
						variant="secondary"
						size="sm"
						data-link-open="true"
						onClick={() => onOpenLink?.('external', p.url ?? p.target)}
					>
						{c.openExternal.replace('{url}', p.url ?? p.target)}
					</Button>
				</>
			)}
			{p.kind === 'broken' && (
				<>
					<div className="pk-link-popover__head">
						<TriangleAlert size={13} />
						<span className="pk-link-popover__title">{c.brokenTitle}</span>
					</div>
					<span className="pk-link-popover__path">{p.target}</span>
					{(p.suggestions ?? []).length > 0 && (
						<div className="pk-link-popover__fixes">
							<span className="pk-link-popover__fix-label">{c.fixLabel}</span>
							{(p.suggestions ?? []).map((s) => (
								<Chip key={s} variant="info" className="pk-link-popover__fix" onClick={() => onOpenLink?.('vault', s)}>
									{s}
								</Chip>
							))}
						</div>
					)}
				</>
			)}
		</div>
	);
}
