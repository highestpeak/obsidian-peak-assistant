import * as React from 'react';
import { flushSync } from 'react-dom';
import {
	composerDraftBlockRanges,
	composerDraftHiddenRanges,
	deleteMarkdownDraftSelection,
	formatMarkdownDraftSelection,
	hasSourceVisualSyntaxChange,
	indentMarkdownDraftListItems,
	insertMarkdownDraftBreak,
	projectSourceVisualParts,
	type HiddenSourceRange,
	type MarkdownDraftEdit,
	type MarkdownDraftInlineMark,
} from '@/service/composer';
import {
	mapDomSelectionToSource,
	restoreDomSelectionFromSource,
	type MappedSelection,
} from './selectionMapping';
import { renderContentEditableProjection } from './contentEditableProjection';

export type MarkdownSourceChangeKind = 'native' | 'atomic' | 'history';

export interface MarkdownSourceEditorProps {
	value: string;
	sourceFrom?: number;
	hiddenSourceRanges?: readonly HiddenSourceRange[];
	className?: string;
	blockId?: string;
	unitId?: string;
	placeholder?: string;
	autoFocus?: boolean;
	mathModeWhenBlurred?: 'source' | 'atom';
	/** Project headings/lists/tasks as one multi-block Markdown writing surface. */
	projectStructure?: boolean;
	/** Drafts own source history; persisted leaves delegate to the transaction hub. */
	historyMode?: 'local' | 'external';
	onSourceChange(
		value: string,
		meta: { kind: MarkdownSourceChangeKind; selection: MappedSelection | null },
	): void;
	onBlur?(value: string): void | Promise<void>;
	onCompositionChange?(composing: boolean): void;
	onHistory?(redo: boolean): boolean;
	onInsertParagraph?: () => boolean;
	onIndentListItem?: (outdent: boolean) => boolean;
	suspendExternalSync?: () => boolean;
}

interface RenderState {
	text: string;
	sourceFrom: number;
}

interface HistoryEntry {
	text: string;
	selection: MappedSelection;
}

interface LocalHistory {
	entries: HistoryEntry[];
	index: number;
	burstOpen: boolean;
	timer: number | null;
}

/**
 * The single production contenteditable core for Composer Markdown source.
 *
 * The browser owns native text mutation inside one unmanaged subtree. This
 * component owns source projection, absolute selection mapping, IME gates and
 * command arbitration; hosts only adapt source changes to local state or the
 * Composer transaction hub.
 */
export function MarkdownSourceEditor({
	value,
	sourceFrom = 0,
	hiddenSourceRanges,
	className,
	blockId,
	unitId,
	placeholder,
	autoFocus = false,
	mathModeWhenBlurred = 'source',
	projectStructure = false,
	historyMode = 'external',
	onSourceChange,
	onBlur,
	onCompositionChange,
	onHistory,
	onInsertParagraph,
	onIndentListItem,
	suspendExternalSync,
}: MarkdownSourceEditorProps): React.ReactElement {
	const ref = React.useRef<HTMLDivElement | null>(null);
	const focused = React.useRef(false);
	const composing = React.useRef(false);
	const pendingSelection = React.useRef<MappedSelection | null>(null);
	const [focusState, setFocusState] = React.useState(false);
	const [renderState, setRenderState] = React.useState<RenderState>({ text: value, sourceFrom });
	const renderStateRef = React.useRef(renderState);
	renderStateRef.current = renderState;
	const sourceChangeRef = React.useRef(onSourceChange);
	sourceChangeRef.current = onSourceChange;
	const history = React.useRef<LocalHistory>(
		createLocalHistory(value, sourceFrom),
	);
	const keyboardCommandGuard = React.useRef<{
		kind: 'format' | 'break';
		timer: number;
	} | null>(null);
	const nativeFormatShortcut = React.useRef<(key: string) => boolean>(() => false);

	const structuralRanges = React.useMemo(
		() => projectStructure
			? offsetHiddenRanges(composerDraftHiddenRanges(renderState.text), renderState.sourceFrom)
			: hiddenSourceRanges ?? [],
		[hiddenSourceRanges, projectStructure, renderState],
	);
	const blockRanges = React.useMemo(
		() => projectStructure
			? composerDraftBlockRanges(renderState.text).map((range) => ({
					...range,
					from: range.from + renderState.sourceFrom,
					to: range.to + renderState.sourceFrom,
				}))
			: [],
		[projectStructure, renderState],
	);
	const parts = React.useMemo(
		() => projectSourceVisualParts(renderState.text, renderState.sourceFrom, {
			hiddenRanges: structuralRanges,
			mathMode: focusState ? 'source' : mathModeWhenBlurred,
		}),
		[focusState, mathModeWhenBlurred, renderState, structuralRanges],
	);
	const projectionHtml = React.useMemo(
		() => renderContentEditableProjection(
			parts,
			unitId,
			structuralRanges,
			blockRanges,
		),
		[blockRanges, parts, structuralRanges, unitId],
	);

	const closeHistoryBurst = () => {
		const state = history.current;
		state.burstOpen = false;
		if (state.timer === null) return;
		const win = ref.current?.ownerDocument.defaultView ?? window;
		win.clearTimeout(state.timer);
		state.timer = null;
	};

	const recordLocalHistory = (
		text: string,
		selection: MappedSelection,
		mode: 'burst' | 'atomic',
	) => {
		if (historyMode !== 'local') return;
		const state = history.current;
		const entry = { text, selection: { ...selection } };
		if (mode === 'burst' && state.burstOpen) {
			state.entries[state.index] = entry;
		} else {
			if (mode === 'atomic') closeHistoryBurst();
			state.entries = state.entries.slice(0, state.index + 1);
			const current = state.entries[state.index];
			if (current?.text === text) state.entries[state.index] = entry;
			else {
				state.entries.push(entry);
				if (state.entries.length > 100) state.entries.shift();
				state.index = state.entries.length - 1;
			}
		}
		if (mode !== 'burst') return;
		state.burstOpen = true;
		const win = ref.current?.ownerDocument.defaultView ?? window;
		if (state.timer !== null) win.clearTimeout(state.timer);
		state.timer = win.setTimeout(() => {
			state.burstOpen = false;
			state.timer = null;
		}, 700);
	};

	const project = (text: string, selection: MappedSelection | null) => {
		pendingSelection.current = selection;
		flushSync(() => {
			setRenderState((current) =>
				current.text === text && current.sourceFrom === sourceFrom
					? current
					: { text, sourceFrom },
			);
		});
	};

	const applyEdit = (edit: MarkdownDraftEdit, prior: MappedSelection) => {
		const selection = absoluteSelectionForEdit(edit, prior, sourceFrom);
		sourceChangeRef.current(edit.value, { kind: 'atomic', selection });
		recordLocalHistory(edit.value, selection, 'atomic');
		project(edit.value, selection);
	};

	const liveContext = (): {
		text: string;
		selection: MappedSelection;
		localFrom: number;
		localTo: number;
	} | null => {
		const el = ref.current;
		const selection = el ? mapSelectionInside(el) : null;
		if (!el || !selection) return null;
		return {
			text: el.textContent ?? '',
			selection,
			localFrom: selection.from - sourceFrom,
			localTo: selection.to - sourceFrom,
		};
	};

	const formatInline = (mark: MarkdownDraftInlineMark): boolean => {
		const context = liveContext();
		if (!context) return false;
		const edit = formatMarkdownDraftSelection(
			context.text,
			context.localFrom,
			context.localTo,
			mark,
		);
		if (!edit) return false;
		applyEdit(edit, context.selection);
		return true;
	};

	const deleteSelection = (): boolean => {
		const context = liveContext();
		if (!context || context.localFrom === context.localTo) return false;
		const edit = deleteMarkdownDraftSelection(
			context.text,
			context.localFrom,
			context.localTo,
		);
		if (!edit) return false;
		applyEdit(edit, context.selection);
		return true;
	};

	const insertBreak = (soft: boolean): boolean => {
		if (!projectStructure) return onInsertParagraph?.() ?? false;
		const context = liveContext();
		if (!context) return false;
		applyEdit(
			insertMarkdownDraftBreak(
				context.text,
				context.localFrom,
				context.localTo,
				soft,
			),
			context.selection,
		);
		return true;
	};

	const indentList = (outdent: boolean): boolean => {
		if (!projectStructure) return onIndentListItem?.(outdent) ?? false;
		const context = liveContext();
		if (!context) return false;
		const edit = indentMarkdownDraftListItems(
			context.text,
			context.localFrom,
			context.localTo,
			outdent,
		);
		if (!edit) return false;
		applyEdit(edit, context.selection);
		return true;
	};

	const stepHistory = (redo: boolean): boolean => {
		if (historyMode !== 'local') return onHistory?.(redo) ?? false;
		closeHistoryBurst();
		const state = history.current;
		const nextIndex = Math.max(
			0,
			Math.min(state.entries.length - 1, state.index + (redo ? 1 : -1)),
		);
		if (nextIndex === state.index) return true;
		state.index = nextIndex;
		const entry = state.entries[state.index];
		sourceChangeRef.current(entry.text, { kind: 'history', selection: entry.selection });
		project(entry.text, entry.selection);
		return true;
	};

	const armKeyboardCommandGuard = (kind: 'format' | 'break') => {
		const win = ref.current?.ownerDocument.defaultView ?? window;
		if (keyboardCommandGuard.current) {
			win.clearTimeout(keyboardCommandGuard.current.timer);
		}
		const timer = win.setTimeout(() => {
			keyboardCommandGuard.current = null;
		}, 250);
		keyboardCommandGuard.current = { kind, timer };
	};

	const consumeKeyboardCommandGuard = (kind: 'format' | 'break'): boolean => {
		const guard = keyboardCommandGuard.current;
		if (!guard || guard.kind !== kind) return false;
		const win = ref.current?.ownerDocument.defaultView ?? window;
		win.clearTimeout(guard.timer);
		keyboardCommandGuard.current = null;
		return true;
	};

	const applyFormatShortcut = (key: string): boolean => {
		const mark: MarkdownDraftInlineMark | undefined =
			key === 'b' ? 'bold' : key === 'i' ? 'italic' : key === 'u' ? 'underline' : undefined;
		if (!mark || !formatInline(mark)) return false;
		armKeyboardCommandGuard('format');
		return true;
	};
	nativeFormatShortcut.current = applyFormatShortcut;

	const handleInput = () => {
		const el = ref.current;
		if (!el) return;
		const next = el.textContent ?? '';
		const selection = mapSelectionInside(el);
		sourceChangeRef.current(next, { kind: 'native', selection });
		if (selection) recordLocalHistory(next, selection, 'burst');
		if (composing.current) return;
		const current = renderStateRef.current;
		if (next === current.text) return;
		if (!needsProjection(
			current.text,
			next,
			current.sourceFrom,
			projectStructure,
			hiddenSourceRanges,
		)) {
			renderStateRef.current = { text: next, sourceFrom: current.sourceFrom };
			return;
		}
		project(next, selection);
	};

	React.useLayoutEffect(() => {
		const el = ref.current;
		const selection = pendingSelection.current;
		if (!el || !selection || !focused.current) return;
		el.focus({ preventScroll: true });
		restoreDomSelectionFromSource(el, selection);
		pendingSelection.current = null;
	}, [renderState]);

	React.useLayoutEffect(() => {
		const current = renderStateRef.current;
		if (current.text === value && current.sourceFrom === sourceFrom) return;
		const el = ref.current;
		if (focused.current && el?.textContent === value && current.sourceFrom === sourceFrom) {
			renderStateRef.current = { text: value, sourceFrom };
			return;
		}
		if (focused.current && (composing.current || suspendExternalSync?.())) return;
		if (focused.current && el) pendingSelection.current = mapSelectionInside(el);
		setRenderState({ text: value, sourceFrom });
		if (historyMode === 'local' && !focused.current) {
			history.current = createLocalHistory(value, sourceFrom);
		}
	}, [historyMode, sourceFrom, suspendExternalSync, value]);

	React.useEffect(() => () => {
		const win = ref.current?.ownerDocument.defaultView ?? window;
		if (keyboardCommandGuard.current) win.clearTimeout(keyboardCommandGuard.current.timer);
		if (history.current.timer !== null) win.clearTimeout(history.current.timer);
	}, []);

	React.useEffect(() => {
		const el = ref.current;
		const win = el?.ownerDocument.defaultView;
		if (!el || !win) return;
		const capture = (event: KeyboardEvent) => {
			if (!focused.current || el.ownerDocument.activeElement !== el) return;
			if (
				event.target !== el
				&& !(event.target instanceof win.Node && el.contains(event.target))
			) {
				return;
			}
			const key = event.key.toLowerCase();
			if (
				!(event.metaKey || event.ctrlKey)
				|| event.altKey
				|| event.isComposing
				|| (key !== 'b' && key !== 'i' && key !== 'u')
			) return;
			if (!event.repeat && !nativeFormatShortcut.current(key)) return;
			event.preventDefault();
			event.stopImmediatePropagation();
		};
		win.addEventListener('keydown', capture, true);
		return () => win.removeEventListener('keydown', capture, true);
	}, []);

	return (
		<div
			ref={ref}
			className={className ? `pk-composer-editable ${className}` : 'pk-composer-editable'}
			contentEditable
			suppressContentEditableWarning
			spellCheck={false}
			aria-multiline="true"
			data-block-id={blockId}
			data-unit-id={unitId}
			data-src-text-from={renderState.sourceFrom}
			data-draft-autofocus={autoFocus ? 'true' : undefined}
			data-placeholder={placeholder}
			onInput={handleInput}
			onBeforeInput={(event) => {
				const native = event.nativeEvent as InputEvent;
				const inputType = native.inputType ?? '';
				if (native.isComposing) return;
				if (inputType === 'historyUndo' || inputType === 'historyRedo') {
					const handled = stepHistory(inputType === 'historyRedo');
					if (handled) event.preventDefault();
					return;
				}
				const formatMark: MarkdownDraftInlineMark | undefined =
					inputType === 'formatBold'
						? 'bold'
						: inputType === 'formatItalic'
							? 'italic'
							: inputType === 'formatUnderline'
								? 'underline'
								: undefined;
				if (formatMark) {
					event.preventDefault();
					if (!consumeKeyboardCommandGuard('format')) formatInline(formatMark);
					return;
				}
				if (inputType.startsWith('delete') && deleteSelection()) {
					event.preventDefault();
					return;
				}
				if (
					inputType !== 'insertParagraph'
					&& inputType !== 'insertLineBreak'
				) return;
				const soft = inputType === 'insertLineBreak';
				if (consumeKeyboardCommandGuard('break')) {
					event.preventDefault();
					return;
				}
				if (insertBreak(soft)) event.preventDefault();
			}}
			onKeyDown={(event) => {
				const key = event.key.toLowerCase();
				const mod = event.metaKey || event.ctrlKey;
				if (
					(key === 'backspace' || key === 'delete')
					&& !event.nativeEvent.isComposing
					&& deleteSelection()
				) {
					event.preventDefault();
					return;
				}
				if (
					mod
					&& !event.altKey
					&& !event.nativeEvent.isComposing
					&& (key === 'z' || key === 'y')
				) {
					const redo = key === 'y' || (key === 'z' && event.shiftKey);
					if (stepHistory(redo)) event.preventDefault();
					return;
				}
				if (
					mod
					&& !event.altKey
					&& !event.nativeEvent.isComposing
					&& (key === 'b' || key === 'i' || key === 'u')
				) {
					event.preventDefault();
					applyFormatShortcut(key);
					return;
				}
				if (
					event.key === 'Tab'
					&& !event.nativeEvent.isComposing
					&& !event.metaKey
					&& !event.ctrlKey
					&& !event.altKey
				) {
					if (indentList(event.shiftKey)) event.preventDefault();
					return;
				}
				if (
					event.key !== 'Enter'
					|| event.nativeEvent.isComposing
					|| event.metaKey
					|| event.ctrlKey
				) return;
				if (!insertBreak(event.shiftKey)) return;
				event.preventDefault();
				armKeyboardCommandGuard('break');
			}}
			onFocus={() => {
				focused.current = true;
				setFocusState(true);
			}}
			onBlur={() => {
				const el = ref.current;
				const live = el?.textContent ?? renderStateRef.current.text;
				focused.current = false;
				setFocusState(false);
				pendingSelection.current = null;
				setRenderState({ text: live, sourceFrom });
				void onBlur?.(live);
			}}
			onCompositionStart={() => {
				composing.current = true;
				onCompositionChange?.(true);
			}}
			onCompositionEnd={() => {
				composing.current = false;
				onCompositionChange?.(false);
				handleInput();
			}}
			dangerouslySetInnerHTML={{ __html: projectionHtml }}
		/>
	);
}

function createLocalHistory(value: string, sourceFrom: number): LocalHistory {
	return {
		entries: [{
			text: value,
			selection: collapsedSelection(sourceFrom + value.length),
		}],
		index: 0,
		burstOpen: false,
		timer: null,
	};
}

function collapsedSelection(offset: number): MappedSelection {
	return {
		from: offset,
		to: offset,
		anchor: offset,
		focus: offset,
		direction: 'collapsed',
	};
}

function absoluteSelectionForEdit(
	edit: MarkdownDraftEdit,
	prior: MappedSelection,
	sourceFrom: number,
): MappedSelection {
	const from = sourceFrom + edit.selectionStart;
	const to = sourceFrom + edit.selectionEnd;
	if (from === to) return collapsedSelection(from);
	const backward = prior.direction === 'backward';
	return {
		from,
		to,
		anchor: backward ? to : from,
		focus: backward ? from : to,
		direction: backward ? 'backward' : 'forward',
	};
}

function mapSelectionInside(el: HTMLElement): MappedSelection | null {
	const selection = el.ownerDocument.getSelection();
	if (!selection?.anchorNode || !selection.focusNode) return null;
	const anchorInside = selection.anchorNode === el || el.contains(selection.anchorNode);
	const focusInside = selection.focusNode === el || el.contains(selection.focusNode);
	return anchorInside && focusInside ? mapDomSelectionToSource(el, selection) : null;
}

function offsetHiddenRanges(
	ranges: readonly HiddenSourceRange[],
	sourceFrom: number,
): HiddenSourceRange[] {
	return ranges.map((range) => ({
		...range,
		from: range.from + sourceFrom,
		to: range.to + sourceFrom,
	}));
}

function needsProjection(
	current: string,
	next: string,
	sourceFrom: number,
	projectStructure: boolean,
	hiddenSourceRanges: readonly HiddenSourceRange[] | undefined,
): boolean {
	const hidden = projectStructure
		? offsetHiddenRanges(composerDraftHiddenRanges(next), sourceFrom)
		: hiddenSourceRanges;
	if (hasSourceVisualSyntaxChange(current, next, sourceFrom, {
		hiddenRanges: hidden,
		mathMode: 'source',
	})) return true;
	if (!projectStructure) return false;
	const beforeBlockKinds = composerDraftBlockRanges(current).map((range) => range.kind);
	const afterBlockKinds = composerDraftBlockRanges(next).map((range) => range.kind);
	const beforeHidden = composerDraftHiddenRanges(current);
	const afterHidden = composerDraftHiddenRanges(next);
	return (
		JSON.stringify(beforeBlockKinds) !== JSON.stringify(afterBlockKinds)
		|| JSON.stringify(beforeHidden) !== JSON.stringify(afterHidden)
	);
}
