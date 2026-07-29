import * as React from 'react';
import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw } from 'lucide-react';
import type { ComposerImageFormat, ComposerImageTransform } from '@/core/schemas/composer';
import { renderImageTransform } from '@/service/composer';
import { Button } from '@/ui/components/primitives';

interface CropPercent {
	x: number;
	y: number;
	width: number;
	height: number;
}

type CropHandle = 'move' | 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface ImageConverterLabels {
	title: string;
	crop: string;
	freeCrop: string;
	clearFreeCrop: string;
	freeCropHint: string;
	rotateLeft: string;
	rotateRight: string;
	flipHorizontal: string;
	flipVertical: string;
	straighten: string;
	format: string;
	quality: string;
	stripMetadata: string;
	reset: string;
	cancel: string;
	apply: string;
	converting: string;
	failed: string;
}

export interface ImageConverterPanelProps {
	image: HTMLImageElement;
	labels: ImageConverterLabels;
	defaultQuality: number;
	onCancel: () => void;
	onConvert: (output: {
		bytes: Uint8Array;
		mimeType: string;
		width: number;
		height: number;
	}) => Promise<void>;
}

const FULL_CROP: CropPercent = { x: 0, y: 0, width: 100, height: 100 };
const MIN_CROP = 5;

function constrainCrop(crop: CropPercent): CropPercent {
	const width = Math.max(MIN_CROP, Math.min(100, crop.width));
	const height = Math.max(MIN_CROP, Math.min(100, crop.height));
	return {
		x: Math.max(0, Math.min(100 - width, crop.x)),
		y: Math.max(0, Math.min(100 - height, crop.y)),
		width,
		height,
	};
}

function nextCrop(start: CropPercent, handle: CropHandle, dx: number, dy: number): CropPercent {
	if (handle === 'move') return constrainCrop({ ...start, x: start.x + dx, y: start.y + dy });
	let left = start.x;
	let top = start.y;
	let right = start.x + start.width;
	let bottom = start.y + start.height;
	if (handle.includes('w')) left += dx;
	if (handle.includes('e')) right += dx;
	if (handle.includes('n')) top += dy;
	if (handle.includes('s')) bottom += dy;
	if (right - left < MIN_CROP) {
		if (handle.includes('w')) left = right - MIN_CROP;
		else right = left + MIN_CROP;
	}
	if (bottom - top < MIN_CROP) {
		if (handle.includes('n')) top = bottom - MIN_CROP;
		else bottom = top + MIN_CROP;
	}
	left = Math.max(0, left);
	top = Math.max(0, top);
	right = Math.min(100, right);
	bottom = Math.min(100, bottom);
	return constrainCrop({ x: left, y: top, width: right - left, height: bottom - top });
}

export function ImageConverterPanel({
	image,
	labels,
	defaultQuality,
	onCancel,
	onConvert,
}: ImageConverterPanelProps): React.ReactElement {
	const stageRef = React.useRef<HTMLDivElement | null>(null);
	const [cropMode, setCropMode] = React.useState<'rect' | 'free'>('rect');
	const [crop, setCrop] = React.useState<CropPercent>(FULL_CROP);
	const [freePath, setFreePath] = React.useState<Array<{ x: number; y: number }>>([]);
	const [quarters, setQuarters] = React.useState(0);
	const [flipHorizontal, setFlipHorizontal] = React.useState(false);
	const [flipVertical, setFlipVertical] = React.useState(false);
	const [straighten, setStraighten] = React.useState(0);
	const [format, setFormat] = React.useState<ComposerImageFormat>('image/png');
	const [quality, setQuality] = React.useState(defaultQuality);
	const [busy, setBusy] = React.useState(false);
	const [error, setError] = React.useState('');
	const pointer = React.useRef<{
		handle: CropHandle;
		clientX: number;
		clientY: number;
		start: CropPercent;
	} | null>(null);
	const drawingFreePath = React.useRef(false);

	const beginDrag = (event: React.PointerEvent, handle: CropHandle): void => {
		event.preventDefault();
		event.stopPropagation();
		(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		pointer.current = { handle, clientX: event.clientX, clientY: event.clientY, start: crop };
	};
	const updateDrag = (event: React.PointerEvent): void => {
		const active = pointer.current;
		const rect = stageRef.current?.getBoundingClientRect();
		if (!active || !rect || rect.width === 0 || rect.height === 0) return;
		setCrop(nextCrop(
			active.start,
			active.handle,
			((event.clientX - active.clientX) / rect.width) * 100,
			((event.clientY - active.clientY) / rect.height) * 100,
		));
	};
	const pointInStage = (event: React.PointerEvent): { x: number; y: number } | null => {
		const rect = stageRef.current?.getBoundingClientRect();
		if (!rect || rect.width === 0 || rect.height === 0) return null;
		return {
			x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
			y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
		};
	};
	const beginFreePath = (event: React.PointerEvent<HTMLDivElement>): void => {
		if (cropMode !== 'free') return;
		const point = pointInStage(event);
		if (!point) return;
		event.currentTarget.setPointerCapture(event.pointerId);
		drawingFreePath.current = true;
		setFreePath([point]);
	};
	const updateFreePath = (event: React.PointerEvent<HTMLDivElement>): void => {
		if (!drawingFreePath.current) return;
		const point = pointInStage(event);
		if (!point) return;
		setFreePath((current) => {
			const last = current[current.length - 1];
			if (last && Math.hypot(last.x - point.x, last.y - point.y) < 0.6) return current;
			return [...current, point];
		});
	};
	const reset = (): void => {
		setCrop(FULL_CROP);
		setCropMode('rect');
		setFreePath([]);
		setQuarters(0);
		setFlipHorizontal(false);
		setFlipVertical(false);
		setStraighten(0);
	};
	const apply = async (): Promise<void> => {
		if (!image.naturalWidth || !image.naturalHeight) return;
		setBusy(true);
		setError('');
		try {
			const fullCrop =
				crop.x === 0 && crop.y === 0 && crop.width === 100 && crop.height === 100;
			const transform: ComposerImageTransform = {
				...(cropMode === 'free' && freePath.length >= 3
					? {
							freeCropPath: freePath.map((point) => ({
								x: (point.x / 100) * image.naturalWidth,
								y: (point.y / 100) * image.naturalHeight,
							})),
						}
					: fullCrop
					? {}
					: {
							crop: {
								x: (crop.x / 100) * image.naturalWidth,
								y: (crop.y / 100) * image.naturalHeight,
								width: (crop.width / 100) * image.naturalWidth,
								height: (crop.height / 100) * image.naturalHeight,
							},
						}),
				rotateQuarters: quarters,
				straightenDegrees: straighten,
				flipHorizontal,
				flipVertical,
				format,
				...(format === 'image/png' ? {} : { quality }),
				stripMetadata: true,
			};
			const result = await renderImageTransform({
				createCanvas: () => image.ownerDocument.createElement('canvas'),
				source: image,
				sourceWidth: image.naturalWidth,
				sourceHeight: image.naturalHeight,
				transform,
				defaultQuality,
			});
			await onConvert({
				bytes: new Uint8Array(await result.blob.arrayBuffer()),
				mimeType: result.format,
				width: result.width,
				height: result.height,
			});
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : labels.failed);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="pk-image-converter pk-composer-panel" data-chrome="true">
			<div className="pk-image-converter__head">
				<span>{labels.title}</span>
				<span>{image.naturalWidth} × {image.naturalHeight}</span>
			</div>
			<div
				ref={stageRef}
				className="pk-image-converter__stage"
				style={{
					aspectRatio: `${image.naturalWidth} / ${image.naturalHeight}`,
					maxWidth: `${Math.min(640, 440 * (image.naturalWidth / image.naturalHeight))}px`,
				}}
				data-crop-mode={cropMode}
				aria-label={cropMode === 'free' ? labels.freeCropHint : labels.crop}
				onPointerDown={beginFreePath}
				onPointerMove={(event) => {
					updateDrag(event);
					updateFreePath(event);
				}}
				onPointerUp={() => {
					pointer.current = null;
					drawingFreePath.current = false;
				}}
				onPointerCancel={() => {
					pointer.current = null;
					drawingFreePath.current = false;
				}}
			>
				<img
					src={image.currentSrc || image.src}
					alt=""
					draggable={false}
				/>
				{cropMode === 'rect' ? (
					<div
						className="pk-image-converter__crop"
						style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.width}%`, height: `${crop.height}%` }}
						onPointerDown={(event) => beginDrag(event, 'move')}
					>
						{(['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((handle) => (
							<span
								key={handle}
								className={`pk-image-converter__handle pk-image-converter__handle--${handle}`}
								data-handle={handle}
								onPointerDown={(event) => beginDrag(event, handle)}
							/>
						))}
					</div>
				) : (
					<>
						<svg className="pk-image-converter__free-path" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
							{freePath.length > 0 ? (
								<polyline points={freePath.map((point) => `${point.x},${point.y}`).join(' ')} />
							) : null}
						</svg>
						{freePath.length === 0 ? <span className="pk-image-converter__free-hint">{labels.freeCropHint}</span> : null}
					</>
				)}
			</div>
			<div className="pk-image-converter__controls">
				<span className="pk-image-converter__group">
					<Button variant="secondary" aria-pressed={cropMode === 'rect'} onClick={() => setCropMode('rect')}>{labels.crop}</Button>
					<Button variant="secondary" aria-pressed={cropMode === 'free'} onClick={() => setCropMode('free')}>{labels.freeCrop}</Button>
					{cropMode === 'free' && freePath.length > 0 ? (
						<Button variant="ghost" onClick={() => setFreePath([])}>{labels.clearFreeCrop}</Button>
					) : null}
					<Button variant="secondary" onClick={() => setQuarters((value) => (value + 3) % 4)}><RotateCcw size={14} />{labels.rotateLeft}</Button>
					<Button variant="secondary" onClick={() => setQuarters((value) => (value + 1) % 4)}><RotateCw size={14} />{labels.rotateRight}</Button>
					<Button variant="secondary" aria-pressed={flipHorizontal} onClick={() => setFlipHorizontal((value) => !value)}><FlipHorizontal2 size={14} />{labels.flipHorizontal}</Button>
					<Button variant="secondary" aria-pressed={flipVertical} onClick={() => setFlipVertical((value) => !value)}><FlipVertical2 size={14} />{labels.flipVertical}</Button>
				</span>
				<label>
					<span>{labels.straighten}</span>
					<input type="range" min="-15" max="15" step="0.5" value={straighten} onChange={(event) => setStraighten(Number(event.target.value))} />
					<output>{straighten.toFixed(1)}°</output>
				</label>
				<label>
					<span>{labels.format}</span>
					<select value={format} onChange={(event) => setFormat(event.target.value as ComposerImageFormat)}>
						<option value="image/png">PNG</option>
						<option value="image/jpeg">JPEG</option>
						<option value="image/webp">WebP</option>
					</select>
				</label>
				{format !== 'image/png' ? (
					<label>
						<span>{labels.quality}</span>
						<input type="range" min="0.4" max="1" step="0.05" value={quality} onChange={(event) => setQuality(Number(event.target.value))} />
						<output>{Math.round(quality * 100)}%</output>
					</label>
				) : null}
				<span className="pk-image-converter__metadata">{labels.stripMetadata}</span>
			</div>
			{error ? <span className="pk-image-converter__error" role="alert">{error}</span> : null}
			<div className="pk-image-converter__footer">
				<Button variant="ghost" onClick={reset}>{labels.reset}</Button>
				<span className="pk-image-converter__footer-end">
					<Button variant="ghost" onClick={onCancel}>{labels.cancel}</Button>
					<Button variant="primary" disabled={busy} onClick={() => void apply()}>{busy ? labels.converting : labels.apply}</Button>
				</span>
			</div>
		</div>
	);
}
