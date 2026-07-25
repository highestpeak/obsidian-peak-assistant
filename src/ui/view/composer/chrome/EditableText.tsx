import * as React from 'react';
import { DirectEditController, parseInlineRuns, type DirectEditRange } from '@/service/composer';
import { useComposerChrome } from './ComposerChromeContext';
import { segmentLinks } from './linkSegments';
import { styleAttrs } from './StyledRuns';

/**
 * Per-block contenteditable leaf (WP4, S2 决议全套).
 *
 * - `beforeinput` intercepts structural inputs (paragraph/line splits are out of
 *   the WP4 slice); plain text input flows natively.
 * - Zero preventDefault and ZERO re-render during IME composition; reconcile /
 *   flush only after `compositionend`.
 * - React never re-renders the leaf while it is focused: the rendered text is
 *   frozen at focus time and re-synced from props on blur, so the browser owns
 *   the DOM during a burst.
 * - Typing coalesces through {@link DirectEditController} (stable per-session
 *   groupId → grouped History + one Undo step).
 * - While a burst is un-flushed, Cmd/Ctrl+Z stays NATIVE; at a commit boundary
 *   it routes to hub.undo / hub.redo.
 * - `data-src-text-from` / `data-block-id` / `data-unit-id` drive DOM↔source
 *   selection mapping; link tokens are wrapped in focusable spans (§7.7).
 */
export interface EditableTextProps {
	blockId: string;
	unitId?: string;
	/** Verbatim source slice this leaf edits. */
	text: string;
	/** Absolute source offset of the slice's first character. */
	sourceFrom: number;
	editable: boolean;
	/** Resolve the CURRENT range for a flush (offsets shift after each commit). */
	resolveRange: () => DirectEditRange | null;
	className?: string;
}

export function EditableText({
	blockId,
	unitId,
	text,
	sourceFrom,
	editable,
	resolveRange,
	className,
}: EditableTextProps): React.ReactElement {
	const { runtime, config, burstWindowMs, registerFlusher } = useComposerChrome();
	const hub = runtime.hub;
	const elRef = React.useRef<HTMLDivElement | null>(null);
	const focusedRef = React.useRef(false);
	// Drives the styled↔source swap: the focused block shows verbatim source
	// (live-preview style) so editing/mapping is uniform; blurred blocks show the
	// rich styled-run projection.
	const [focused, setFocused] = React.useState(false);
	// Frozen render state: only synced from props while NOT focused.
	const [renderState, setRenderState] = React.useState({ text, sourceFrom });
	const resolveRef = React.useRef(resolveRange);
	resolveRef.current = resolveRange;

	const controllerRef = React.useRef<DirectEditController | null>(null);
	if (!controllerRef.current && hub) {
		controllerRef.current = new DirectEditController({
			hub,
			resolveRange: () => resolveRef.current(),
			label: config.chrome.actions.directEdit,
			burstWindowMs,
		});
	}
	const controller = controllerRef.current;

	React.useEffect(() => {
		if (!controller) return;
		const unregister = registerFlusher(() => controller.flush());
		return () => {
			unregister();
			controller.dispose();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [controller]);

	// Sync from props when not focused and the source changed under us.
	React.useEffect(() => {
		if (focusedRef.current) return;
		if (renderState.text !== text || renderState.sourceFrom !== sourceFrom) {
			setRenderState({ text, sourceFrom });
		}
	}, [text, sourceFrom, renderState]);

	const onBeforeInput = (ev: React.FormEvent<HTMLDivElement>) => {
		const native = ev.nativeEvent as InputEvent;
		// Block-structure inputs (Enter splits) are not part of the WP4 text slice.
		if (native.inputType === 'insertParagraph' || native.inputType === 'insertLineBreak') {
			ev.preventDefault();
		}
	};

	const onInput = () => {
		if (!controller || !elRef.current) return;
		controller.onInput(elRef.current.textContent ?? '');
	};

	const onKeyDown = (ev: React.KeyboardEvent<HTMLDivElement>) => {
		if (!hub || !controller) return;
		const mod = ev.metaKey || ev.ctrlKey;
		const key = ev.key.toLowerCase();
		if (!mod || (key !== 'z' && key !== 'y')) return;
		// Un-flushed burst → native contenteditable undo keeps ownership (S2).
		if (controller.dirty) return;
		ev.preventDefault();
		const isRedo = (key === 'z' && ev.shiftKey) || key === 'y';
		if (isRedo) void hub.redo();
		else void hub.undo();
	};

	const onFocus = () => {
		focusedRef.current = true;
		setFocused(true);
	};
	const onBlur = async () => {
		focusedRef.current = false;
		setFocused(false);
		if (controller) await controller.endSession();
		// Re-sync the frozen render from the latest committed props.
		setRenderState((prev) => (prev.text === text && prev.sourceFrom === sourceFrom ? prev : { text, sourceFrom }));
	};

	// Focused → verbatim source segments (contentEditable owns exact bytes);
	// blurred / read-only → styled runs. Both carry data-src-text-from so the
	// selection→source mapping is identical in either state.
	const showSource = focused && editable && Boolean(hub);
	const segments = React.useMemo(
		() => segmentLinks(renderState.text, renderState.sourceFrom),
		[renderState],
	);
	const runs = React.useMemo(
		() => parseInlineRuns(renderState.text, renderState.sourceFrom),
		[renderState],
	);

	return (
		<div
			ref={elRef}
			className={className ? `pk-composer-editable ${className}` : 'pk-composer-editable'}
			contentEditable={editable && Boolean(hub)}
			suppressContentEditableWarning
			spellCheck={false}
			data-block-id={blockId}
			data-unit-id={unitId}
			data-src-text-from={renderState.sourceFrom}
			onBeforeInput={onBeforeInput}
			onInput={onInput}
			onKeyDown={onKeyDown}
			onFocus={onFocus}
			onBlur={() => void onBlur()}
			onCompositionStart={() => controller?.setComposing(true)}
			onCompositionEnd={() => {
				controller?.setComposing(false);
				onInput();
			}}
		>
			{showSource ? (
				segments.map((seg, i) =>
					seg.linkTarget ? (
						<span
							key={`${seg.from}-${i}`}
							className="pk-composer-link"
							data-src-text-from={seg.from}
							data-unit-id={unitId}
							data-link-target={seg.linkTarget}
							data-link-kind={seg.linkKind}
							tabIndex={0}
						>
							{seg.text}
						</span>
					) : (
						<span key={`${seg.from}-${i}`} data-src-text-from={seg.from} data-unit-id={unitId}>
							{seg.text}
						</span>
					),
				)
			) : (
				// Styled runs are rendered as DIRECT span children (not a nested
				// component) so React preserves the exact text nodes across the
				// selection-driven re-render — a component boundary here re-creates
				// the nodes and collapses an in-progress selection.
				runs.map((run, i) => {
					const { className, style } = styleAttrs(run.style);
					if (run.linkTarget) {
						return (
							<span
								key={`${run.from}-${i}`}
								className={className ? `pk-composer-link ${className}` : 'pk-composer-link'}
								style={style}
								data-src-text-from={run.from}
								data-unit-id={unitId}
								data-link-target={run.linkTarget}
								data-link-kind={run.linkKind}
								tabIndex={0}
							>
								{run.text}
							</span>
						);
					}
					return (
						<span key={`${run.from}-${i}`} className={className} style={style} data-src-text-from={run.from} data-unit-id={unitId}>
							{run.text}
						</span>
					);
				})
			)}
		</div>
	);
}
