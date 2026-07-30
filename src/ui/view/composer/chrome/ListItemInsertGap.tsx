import * as React from 'react';
import { Plus, Sparkles, SquareCheckBig, X } from 'lucide-react';
import { Button } from '@/ui/components/primitives';
import type { DirectListItemKind } from '@/service/composer';
import { useComposerChrome } from './ComposerChromeContext';
import { useComposerSurfaces } from './ComposerSurfaceCoordinator';

export interface ListItemInsertGapProps {
	blockId: string;
	index: number;
	aiDisabledReason?: string;
	onInsert(kind: DirectListItemKind): void;
	onAi(instruction?: string): void;
}

type GapMode = 'closed' | 'menu' | 'ai';

/**
 * A list gap follows the same grammar as the document gap: acquire one stable
 * pointer-relative plus, then reveal direct insertion choices on intentional
 * hover. AI fill is explicit and visually marked with Sparkles.
 */
export function ListItemInsertGap({
	blockId,
	index,
	aiDisabledReason,
	onInsert,
	onAi,
}: ListItemInsertGapProps): React.ReactElement {
	const chrome = useComposerChrome();
	const config = chrome.config.chrome;
	const a = config.actions;
	const surfaces = useComposerSurfaces();
	const {
		active: activeSurface,
		canClaim: canClaimSurface,
		claim: claimSurface,
		release: releaseSurface,
	} = surfaces;
	const surfaceId = React.useId();
	const anchorRef = React.useRef<HTMLDivElement | null>(null);
	const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const closeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
	const anchorCaptured = React.useRef(false);
	const [armed, setArmed] = React.useState(false);
	const [suppressed, setSuppressed] = React.useState(false);
	const [mode, setMode] = React.useState<GapMode>('closed');
	const [instruction, setInstruction] = React.useState('');

	const clearOpen = () => {
		if (!openTimer.current) return;
		clearTimeout(openTimer.current);
		openTimer.current = null;
	};
	const clearClose = () => {
		if (!closeTimer.current) return;
		clearTimeout(closeTimer.current);
		closeTimer.current = null;
	};
	const close = (suppress = false) => {
		clearOpen();
		clearClose();
		setMode('closed');
		setInstruction('');
		if (suppress) setSuppressed(true);
		releaseSurface(surfaceId);
	};
	const openMenu = () => {
		if (suppressed || !canClaimSurface('menu', surfaceId)) return;
		clearOpen();
		clearClose();
		claimSurface({ id: surfaceId, kind: 'menu', ownerId: blockId });
		setMode('menu');
	};
	const scheduleOpen = () => {
		if (mode !== 'closed' || suppressed || openTimer.current) return;
		openTimer.current = setTimeout(() => {
			openTimer.current = null;
			openMenu();
		}, config.surfaceIntentOpenDelayMs);
	};
	const scheduleClose = () => {
		clearOpen();
		clearClose();
		closeTimer.current = setTimeout(() => {
			closeTimer.current = null;
			close();
			anchorCaptured.current = false;
			setArmed(false);
			setSuppressed(false);
		}, config.surfacePreviewCloseDelayMs);
	};
	const acquire = (event: React.PointerEvent<HTMLDivElement>) => {
		clearClose();
		if (suppressed || anchorCaptured.current) return;
		anchorCaptured.current = true;
		const rect = event.currentTarget.getBoundingClientRect();
		event.currentTarget.style.setProperty(
			'--pk-list-gap-anchor-x',
			`${event.clientX - rect.left}px`,
		);
		setArmed(true);
	};
	const insert = (kind: DirectListItemKind) => {
		onInsert(kind);
		close(true);
	};
	const submitAi = () => {
		if (aiDisabledReason) return;
		onAi(instruction.trim() || undefined);
		close(true);
	};

	React.useEffect(() => {
		if (!activeSurface || activeSurface.id === surfaceId) return;
		if (mode === 'closed') return;
		if (canClaimSurface('menu', surfaceId)) return;
		close();
		anchorCaptured.current = false;
		setArmed(false);
	}, [activeSurface, canClaimSurface, mode, surfaceId]);
	React.useEffect(() => () => {
		clearOpen();
		clearClose();
		releaseSurface(surfaceId);
	}, [releaseSurface, surfaceId]);

	return (
		<div
			ref={anchorRef}
			className="pk-composer-list__gap-anchor"
			data-list-gap-index={index}
			data-armed={armed || undefined}
			data-active={mode !== 'closed' || undefined}
			data-mode={mode}
			data-chrome="true"
			data-composer-surface-owner={blockId}
			onPointerEnter={acquire}
			onPointerLeave={scheduleClose}
			onMouseDown={(event) => event.stopPropagation()}
		>
			<span className="pk-composer-list__gap-line" aria-hidden />
			<Button
				variant="ghost"
				size="sm"
				className="pk-composer-list__gap-trigger"
				aria-label={a.listGapLabel}
				aria-haspopup="menu"
				aria-expanded={mode !== 'closed'}
				onPointerEnter={scheduleOpen}
				onFocus={openMenu}
			>
				<Plus size={12} />
			</Button>
			{mode === 'menu' && (
				<div className="pk-composer-list__gap-menu" role="menu" onPointerEnter={clearClose}>
					<Button variant="ghost" size="sm" role="menuitem" onClick={() => insert('list')}>
						<Plus size={12} />
						{a.listGapInsertItem}
					</Button>
					<Button variant="ghost" size="sm" role="menuitem" onClick={() => insert('task')}>
						<SquareCheckBig size={12} />
						{a.listGapInsertTask}
					</Button>
					<span className="pk-composer-list__gap-divider" role="separator" />
					<Button
						variant="ghost"
						size="sm"
						role="menuitem"
						disabled={Boolean(aiDisabledReason)}
						title={aiDisabledReason}
						onClick={() => setMode('ai')}
					>
						<Sparkles size={12} />
						{a.listGapAi}
					</Button>
				</div>
			)}
			{mode === 'ai' && (
				<div className="pk-composer-list__gap-form" onPointerEnter={clearClose}>
					<Sparkles size={13} aria-hidden />
					<input
						autoFocus
						value={instruction}
						placeholder={a.listGapPlaceholder}
						aria-label={a.listGapPlaceholder}
						onChange={(event) => setInstruction(event.currentTarget.value)}
						onKeyDown={(event) => {
							if (event.key === 'Escape') {
								event.preventDefault();
								setMode('menu');
								return;
							}
							if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
							event.preventDefault();
							submitAi();
						}}
					/>
					<Button
						variant="ghost"
						size="sm"
						className="pk-composer-list__gap-cancel"
						aria-label={a.listGapCancel}
						title={a.listGapCancel}
						onClick={() => setMode('menu')}
					>
						<X size={12} />
					</Button>
					<Button
						variant="secondary"
						size="sm"
						className="pk-composer-list__gap-submit"
						disabled={Boolean(aiDisabledReason)}
						title={aiDisabledReason}
						onClick={submitAi}
					>
						{a.listGapGenerate}
					</Button>
				</div>
			)}
		</div>
	);
}
