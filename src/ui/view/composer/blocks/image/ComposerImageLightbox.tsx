import * as React from 'react';
import { ChevronLeft, ChevronRight, Grid3X3, Maximize2, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { IconButton } from '@/ui/components/primitives';
import { handleLightboxKeyboardEvent } from './composerImageLightboxKeyboard';

interface LightboxItem {
	src: string;
	alt: string;
}

export interface ComposerImageLightboxProps {
	anchor: HTMLElement | null;
	initialSrc: string;
	initialAlt: string;
	labels: {
		label: string;
		zoomOut: string;
		zoomIn: string;
		actualSize: string;
		fit: string;
		toggleStrip: string;
		close: string;
		previous: string;
		next: string;
		thumbnail: string;
	};
	onClose: () => void;
}

function collectImages(anchor: HTMLElement | null, initialSrc: string, initialAlt: string): LightboxItem[] {
	const root = anchor?.closest('.peak-composer-root');
	const found = root
		? Array.from(root.querySelectorAll<HTMLImageElement>('.pk-composer-image-elem, .peak-image-layout__image'))
		: [];
	const items: LightboxItem[] = [];
	const seen = new Set<string>();
	const push = (src: string, alt: string): void => {
		if (!src || seen.has(src)) return;
		seen.add(src);
		items.push({ src, alt });
	};
	for (const image of found) push(image.currentSrc || image.src, image.alt);
	if (!seen.has(initialSrc)) items.unshift({ src: initialSrc, alt: initialAlt });
	return items;
}

export function ComposerImageLightbox({
	anchor,
	initialSrc,
	initialAlt,
	labels,
	onClose,
}: ComposerImageLightboxProps): React.ReactElement | null {
	const ownerDocument = anchor?.ownerDocument ?? null;
	const items = React.useMemo(
		() => collectImages(anchor, initialSrc, initialAlt),
		[anchor, initialAlt, initialSrc],
	);
	const initialIndex = Math.max(0, items.findIndex((item) => item.src === initialSrc));
	const [index, setIndex] = React.useState(initialIndex);
	const [scale, setScale] = React.useState(1);
	const [offset, setOffset] = React.useState({ x: 0, y: 0 });
	const [showStrip, setShowStrip] = React.useState(true);
	const drag = React.useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null);

	const resetView = React.useCallback((): void => {
		setScale(1);
		setOffset({ x: 0, y: 0 });
	}, []);
	const move = React.useCallback((delta: number): void => {
		setIndex((current) => {
			const next = (current + delta + items.length) % items.length;
			return Number.isFinite(next) ? next : 0;
		});
		resetView();
	}, [items.length, resetView]);
	const changeScale = React.useCallback((next: number): void => {
		setScale(Math.min(6, Math.max(0.25, next)));
	}, []);

	React.useEffect(() => {
		if (!ownerDocument) return;
		const onKeyDown = (event: KeyboardEvent): void => {
			handleLightboxKeyboardEvent(event, {
				hasMultiple: items.length > 1,
				close: onClose,
				previous: () => move(-1),
				next: () => move(1),
				zoomIn: () => changeScale(scale + 0.25),
				zoomOut: () => changeScale(scale - 0.25),
				reset: resetView,
			});
		};
		const ownerWindow = ownerDocument.defaultView;
		if (ownerWindow) ownerWindow.addEventListener('keydown', onKeyDown, true);
		else ownerDocument.addEventListener('keydown', onKeyDown, true);
		const previousOverflow = ownerDocument.body.style.overflow;
		ownerDocument.body.style.overflow = 'hidden';
		return () => {
			if (ownerWindow) ownerWindow.removeEventListener('keydown', onKeyDown, true);
			else ownerDocument.removeEventListener('keydown', onKeyDown, true);
			ownerDocument.body.style.overflow = previousOverflow;
		};
	}, [changeScale, items.length, move, onClose, ownerDocument, resetView, scale]);

	if (!ownerDocument || items.length === 0) return null;
	const active = items[Math.min(index, items.length - 1)];
	if (!active) return null;

	const overlay = (
		<div
			className="peak-design-root pk-image-lightbox"
			role="dialog"
			aria-modal="true"
			aria-label={active.alt || labels.label}
			onPointerMove={(event) => {
				const current = drag.current;
				if (!current) return;
				setOffset({
					x: current.offsetX + event.clientX - current.x,
					y: current.offsetY + event.clientY - current.y,
				});
			}}
			onPointerUp={() => {
				drag.current = null;
			}}
			onPointerCancel={() => {
				drag.current = null;
			}}
		>
			<div className="pk-image-lightbox__topbar" data-chrome="true">
				<span className="pk-image-lightbox__counter">{index + 1} / {items.length}</span>
				<span className="pk-image-lightbox__tools">
					<IconButton label={labels.zoomOut} onClick={() => changeScale(scale - 0.25)}><Minus size={17} /></IconButton>
					<IconButton label={labels.zoomIn} onClick={() => changeScale(scale + 0.25)}><Plus size={17} /></IconButton>
					<IconButton label={labels.actualSize} onClick={resetView}><RotateCcw size={17} /></IconButton>
					<IconButton label={labels.fit} onClick={() => { resetView(); changeScale(1); }}><Maximize2 size={17} /></IconButton>
					<IconButton label={labels.toggleStrip} onClick={() => setShowStrip((visible) => !visible)}><Grid3X3 size={17} /></IconButton>
					<IconButton label={labels.close} onClick={onClose}><X size={19} /></IconButton>
				</span>
			</div>
			<div
				className="pk-image-lightbox__stage"
				onWheel={(event) => {
					event.preventDefault();
					changeScale(scale + (event.deltaY < 0 ? 0.15 : -0.15));
				}}
				onDoubleClick={() => {
					if (scale === 1) changeScale(2);
					else resetView();
				}}
			>
				{items.length > 1 ? (
					<IconButton label={labels.previous} className="pk-image-lightbox__nav pk-image-lightbox__nav--prev" onClick={() => move(-1)}>
						<ChevronLeft size={25} />
					</IconButton>
				) : null}
				<img
					className="pk-image-lightbox__image"
					src={active.src}
					alt={active.alt}
					draggable={false}
					style={{ transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})` }}
					onPointerDown={(event) => {
						event.currentTarget.setPointerCapture(event.pointerId);
						drag.current = { x: event.clientX, y: event.clientY, offsetX: offset.x, offsetY: offset.y };
					}}
				/>
				{items.length > 1 ? (
					<IconButton label={labels.next} className="pk-image-lightbox__nav pk-image-lightbox__nav--next" onClick={() => move(1)}>
						<ChevronRight size={25} />
					</IconButton>
				) : null}
			</div>
			<div className="pk-image-lightbox__caption">
				<span>{active.alt}</span>
				<span>{Math.round(scale * 100)}%</span>
			</div>
			{showStrip && items.length > 1 ? (
				<div className="pk-image-lightbox__strip" aria-label={labels.toggleStrip}>
					{items.map((item, itemIndex) => (
						<IconButton
							key={item.src}
							label={labels.thumbnail.replace('{index}', String(itemIndex + 1))}
							className="pk-image-lightbox__thumb"
							aria-current={itemIndex === index ? 'true' : undefined}
							onClick={() => {
								setIndex(itemIndex);
								resetView();
							}}
						>
							<img src={item.src} alt="" />
						</IconButton>
					))}
				</div>
			) : null}
		</div>
	);
	return createPortal(overlay, ownerDocument.body);
}
