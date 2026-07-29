import * as React from 'react';
import { ExternalLink } from 'lucide-react';
import {
	DirectEditController,
	hasSourceVisualSyntaxChange,
	projectSourceVisualParts,
	type DirectEditRange,
	type HiddenSourceRange,
	type SourceVisualPart,
} from '@/service/composer';
import { useComposerChrome } from './ComposerChromeContext';
import { styleAttrs } from './StyledRuns';
import { InlineMathAtom } from './InlineMathAtom';
import {
	mapDomSelectionToSource,
	restoreDomSelectionFromSource,
	type MappedSelection,
} from './selectionMapping';

/**
 * Per-block contenteditable leaf (WP4, S2 决议全套).
 *
 * - `beforeinput` intercepts structural inputs (paragraph/line splits are out of
 *   the WP4 slice); plain text input flows natively.
 * - Zero preventDefault and ZERO re-render during IME composition; reconcile /
 *   flush only after `compositionend`.
 * - React does not re-render for each native input event. When an edit completes
 *   or removes visual syntax, the leaf re-projects on the next animation frame
 *   and restores the DOM selection from absolute source coordinates;
 *   persistence remains separately debounced.
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
	/** Absolute source ranges that should remain in DOM text but not be visible. */
	hiddenSourceRanges?: readonly HiddenSourceRange[];
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
	hiddenSourceRanges,
	editable,
	resolveRange,
	className,
}: EditableTextProps): React.ReactElement {
	const {
		runtime,
		config,
		burstWindowMs,
		registerFlusher,
	} = useComposerChrome();
	const hub = runtime.hub;
	const elRef = React.useRef<HTMLDivElement | null>(null);
	const focusedRef = React.useRef(false);
	const composingRef = React.useRef(false);
	const liveProjectionFrameRef = React.useRef<number | null>(null);
	// Drives only math rendering. Markdown/HTML source tokens are never shown
	// verbatim; they stay in hidden DOM spans so textContent still round-trips.
	const [focused, setFocused] = React.useState(false);
	// Native input owns ordinary keystrokes. Only a visual syntax transition
	// schedules a next-frame projection; the slower durable commit stays separate.
	const [renderState, setRenderState] = React.useState({ text, sourceFrom });
	const renderStateRef = React.useRef(renderState);
	renderStateRef.current = renderState;
	const latestSourceRef = React.useRef({ text, sourceFrom });
	latestSourceRef.current = { text, sourceFrom };
	const pendingSelectionRestoreRef = React.useRef<{
		selection: MappedSelection;
		text: string;
		sourceFrom: number;
	} | null>(null);
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
			if (liveProjectionFrameRef.current !== null) {
				const win = elRef.current?.ownerDocument.defaultView ?? window;
				win.cancelAnimationFrame(liveProjectionFrameRef.current);
				liveProjectionFrameRef.current = null;
			}
			unregister();
			controller.dispose();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [controller]);

	// Re-project a committed burst while focus stays in place. Never touch the
	// native DOM while a newer input/composition is pending: that newer burst
	// must win before an older async commit can paint.
	React.useLayoutEffect(() => {
		if (renderState.text === text && renderState.sourceFrom === sourceFrom) return;
		if (focusedRef.current && (composingRef.current || controller?.dirty)) return;
		const el = elRef.current;
		if (focusedRef.current && el) {
			const mapped = mapSelectionInside(el);
			if (mapped) pendingSelectionRestoreRef.current = { selection: mapped, text, sourceFrom };
		}
		setRenderState({ text, sourceFrom });
	}, [text, sourceFrom, renderState, controller]);

	// Runs after the projection DOM has landed, before paint. A source-coordinate
	// restore survives styled-run splits and hidden Markdown/HTML delimiters.
	React.useLayoutEffect(() => {
		const pending = pendingSelectionRestoreRef.current;
		const el = elRef.current;
		if (!pending || !el || !focusedRef.current) return;
		if (pending.text !== renderState.text || pending.sourceFrom !== renderState.sourceFrom) return;
		restoreDomSelectionFromSource(el, pending.selection);
		pendingSelectionRestoreRef.current = null;
	}, [renderState]);

	const onBeforeInput = (ev: React.FormEvent<HTMLDivElement>) => {
		const native = ev.nativeEvent as InputEvent;
		// Block-structure inputs (Enter splits) are not part of the WP4 text slice.
		if (native.inputType === 'insertParagraph' || native.inputType === 'insertLineBreak') {
			ev.preventDefault();
		}
		// Everything else is INTENTIONALLY left to the browser: this leaf is an
		// uncontrolled contenteditable while focused. Text insertion (including
		// IME) mutates the DOM natively; we only observe the result via `onInput`
		// → DirectEditController, which debounces bursts into hub commits. Verified
		// on real hardware (FIX-1 QA): beforeinput{insertText} stays
		// defaultPrevented:false and the native node update + react onInput is the
		// production path. Do NOT convert this into a preventDefault + manual
		// insert model — it would break IME composition and native undo ownership.
	};

	const onInput = () => {
		const el = elRef.current;
		if (!controller || !el) return;
		const nextText = el.textContent ?? '';
		controller.onInput(nextText);
		if (composingRef.current || liveProjectionFrameRef.current !== null) return;
		const current = renderStateRef.current;
		if (nextText === current.text) return;
		if (!hasSourceVisualSyntaxChange(
			current.text,
			nextText,
			current.sourceFrom,
			{ hiddenRanges: hiddenSourceRanges, mathMode: 'source' },
		)) return;
		const win = el.ownerDocument.defaultView ?? window;
		liveProjectionFrameRef.current = win.requestAnimationFrame(() => {
			liveProjectionFrameRef.current = null;
			const el = elRef.current;
			if (!el || !focusedRef.current || composingRef.current) return;
			const nextText = el.textContent ?? '';
			const current = renderStateRef.current;
			if (nextText === current.text) return;
			if (!hasSourceVisualSyntaxChange(
				current.text,
				nextText,
				current.sourceFrom,
				{ hiddenRanges: hiddenSourceRanges, mathMode: 'source' },
			)) return;
			const mapped = mapSelectionInside(el);
			if (mapped) {
				pendingSelectionRestoreRef.current = {
					selection: mapped,
					text: nextText,
					sourceFrom: current.sourceFrom,
				};
			}
			setRenderState({ text: nextText, sourceFrom: current.sourceFrom });
		});
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

	// `focused` — and therefore `showSource` — is driven EXCLUSIVELY by the real
	// DOM focus/blur events on THIS element; there is no other writer. The visual
	// "editing" state can never diverge from document.activeElement: if this leaf
	// does not own the keyboard, no styled↔source flip happens. (Block-level
	// hover/:focus-within chrome — rail, action row — is separate CSS and does
	// NOT imply this leaf is focused; see FIX-1 F2.) Clicks that land on the
	// block wrapper instead of this leaf are forwarded in by
	// `forwardBlockClickToEditable` (focusForwarding.ts) — the browser only
	// focuses a contenteditable when the mousedown target is inside it.
	const onFocus = () => {
		focusedRef.current = true;
		setFocused(true);
	};
	const onBlur = async () => {
		if (liveProjectionFrameRef.current !== null) {
			const win = elRef.current?.ownerDocument.defaultView ?? window;
			win.cancelAnimationFrame(liveProjectionFrameRef.current);
			liveProjectionFrameRef.current = null;
		}
		const propsAtBlur = latestSourceRef.current;
		const liveText = elRef.current?.textContent ?? renderStateRef.current.text;
		const liveState = { text: liveText, sourceFrom: renderStateRef.current.sourceFrom };
		pendingSelectionRestoreRef.current = null;
		focusedRef.current = false;
		setFocused(false);
		setRenderState((prev) =>
			prev.text === liveState.text && prev.sourceFrom === liveState.sourceFrom ? prev : liveState,
		);
		if (controller) await controller.endSession();
		// `endSession()` may have committed after this blur handler was created.
		// Only replace the live blur snapshot when React has actually delivered
		// newer props; otherwise the parent-store update will reconcile next.
		const latest = latestSourceRef.current;
		if (latest.text !== propsAtBlur.text || latest.sourceFrom !== propsAtBlur.sourceFrom) {
			setRenderState((prev) =>
				prev.text === latest.text && prev.sourceFrom === latest.sourceFrom ? prev : latest,
			);
		}
	};

	const visualParts = React.useMemo(
		() =>
			projectSourceVisualParts(renderState.text, renderState.sourceFrom, {
				hiddenRanges: hiddenSourceRanges,
				mathMode: focused && editable && Boolean(hub) ? 'source' : 'atom',
			}),
		[renderState, hiddenSourceRanges, focused, editable, hub],
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
			onCompositionStart={() => {
				composingRef.current = true;
				controller?.setComposing(true);
			}}
			onCompositionEnd={() => {
				composingRef.current = false;
				controller?.setComposing(false);
				onInput();
			}}
		>
			{visualParts.map((part) => (
				<VisualPart
					key={`${part.from - renderState.sourceFrom}-${part.to - renderState.sourceFrom}-${part.kind}`}
					part={part}
					unitId={unitId}
				/>
			))}
		</div>
	);
}

function mapSelectionInside(el: HTMLElement): MappedSelection | null {
	const selection = el.ownerDocument.getSelection();
	if (!selection?.anchorNode || !selection.focusNode) return null;
	const anchorInside = selection.anchorNode === el || el.contains(selection.anchorNode);
	const focusInside = selection.focusNode === el || el.contains(selection.focusNode);
	return anchorInside && focusInside ? mapDomSelectionToSource(el, selection) : null;
}

function VisualPart({ part, unitId }: { part: SourceVisualPart; unitId?: string }): React.ReactElement {
	if (part.kind === 'hidden') {
		return (
			<span
				className="pk-composer-source-token"
				contentEditable={false}
				data-src-token-from={part.from}
				data-src-token-to={part.to}
				aria-hidden="true"
			>
				{part.text}
				{part.linkKind !== 'wikilink' && <ExternalLink className="pk-composer-external-link-icon" size={12} aria-label="外部链接" />}
			</span>
		);
	}
	if (part.kind === 'math') {
		return <InlineMathAtom latex={part.latex} sourceFrom={part.from} sourceTo={part.to} />;
	}
	const { className, style } = styleAttrs(part.style);
	if (part.linkTarget) {
		const linkClass = [
			'pk-composer-link',
			part.linkKind === 'wikilink' ? 'pk-composer-wikilink' : '',
			className ?? '',
		].filter(Boolean).join(' ');
		return (
			<span
				className={linkClass}
				style={style}
				data-src-text-from={part.from}
				data-unit-id={unitId}
				data-link-target={part.linkTarget}
				data-link-kind={part.linkKind}
				tabIndex={0}
			>
				{part.text}
			</span>
		);
	}
	return (
		<span className={className} style={style} data-src-text-from={part.from} data-unit-id={unitId}>
			{part.text}
		</span>
	);
}
