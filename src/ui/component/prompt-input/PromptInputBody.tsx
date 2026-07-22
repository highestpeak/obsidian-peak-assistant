import { SLICE_CAPS } from '@/core/constant';
import React, { useRef, useCallback, useState, forwardRef, useMemo, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/ui/react/lib/utils';
import { usePromptInputContext } from './PromptInput';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { tagPlugin } from '@/ui/component/mine/tagPlugin';
import { keymapExtension } from './keymap';
import { parseTagsFromText } from '../mine/tagParser';
import { ContextMenu } from '@/ui/view/chat-view/components/ContextMenu';
import type { NavigableMenuItem } from '@/ui/component/mine/NavigableMenu';
import { usePortalContainer } from '@/ui/react/PortalContainerContext';
import { calculatePromptMenuPosition } from './promptMenuPosition';
import { buildVaultReferenceSelection } from './promptMenuSelection';

// ---------------------------------------------------------------------------
// Trigger detection helpers
// ---------------------------------------------------------------------------

interface TriggerMatch {
	trigger: '[[' | '/';
	query: string;
	/** Absolute offset of the trigger start (including `[[` or `/`) */
	from: number;
	/** Absolute offset of the cursor (end of the typed query) */
	to: number;
}

/**
 * Scans the text to the left of `cursorPos` and returns a trigger match.
 *
 * Owners (chat-studio §8.3):
 * - `[[query` → compact Vault document/folder picker.
 * - `/query` at the very start of the input → workflow palette.
 * - `@` is deliberately NOT a trigger this round — it stays plain text until
 *   a real Assistant/App mention source exists.
 */
function detectTrigger(docText: string, cursorPos: number): TriggerMatch | null {
	// Look backwards from cursor (up to 200 chars) for the trigger character
	const lookback = 200;
	const start = Math.max(0, cursorPos - lookback);
	const textBefore = docText.slice(start, cursorPos);

	const bracketIdx = textBefore.lastIndexOf('[[');
	if (bracketIdx >= 0) {
		const afterBracket = textBefore.slice(bracketIdx + 2);
		// Bail if already closed ]] or newline between trigger and cursor
		if (!afterBracket.includes(']]') && !afterBracket.includes('\n')) {
			return {
				trigger: '[[',
				query: afterBracket,
				from: start + bracketIdx,
				to: cursorPos,
			};
		}
	}

	// Workflow palette: `/` only as the very first character of the input.
	if (docText.startsWith('/') && cursorPos <= docText.length) {
		const firstLineEnd = docText.indexOf('\n');
		const lineEnd = firstLineEnd === -1 ? docText.length : firstLineEnd;
		if (cursorPos >= 1 && cursorPos <= lineEnd) {
			const query = docText.slice(1, cursorPos);
			// Bail once the user typed a space — they are writing prose like "/plan foo"
			if (!query.includes(' ')) {
				return { trigger: '/', query, from: 0, to: cursorPos };
			}
		}
	}

	return null;
}

// ---------------------------------------------------------------------------
// Menu state (shared between context menu and prompt menu)
// ---------------------------------------------------------------------------

interface MenuState {
	visible: boolean;
	items: NavigableMenuItem[];
	selectedIndex: number;
	position: { top: number; left: number };
	triggerMatch: TriggerMatch | null;
	isLoading: boolean;
}

const INITIAL_MENU: MenuState = { visible: false, items: [], selectedIndex: 0, position: { top: 0, left: 0 }, triggerMatch: null, isLoading: false };
const MENU_SEARCH_DEBOUNCE_MS = 320;

// ---------------------------------------------------------------------------
// Props / Component
// ---------------------------------------------------------------------------

export interface PromptInputBodyProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
	placeholder?: string;
	inputRef?: React.Ref<{ focus: () => void }>;
	onTextChange?: (text: string, tags: Array<{ type: 'context' | 'prompt'; text: string; start: number; end: number }>) => void;
	/**
	 * Workflow palette entries for the `/` trigger (chat-studio §8.3). Only
	 * REAL workflows may appear here; empty/absent = no `/` menu. Selection is
	 * reported via onMenuItemSelect('/', item) and the trigger text is removed
	 * from the editor (the workflow becomes a context chip, not inline text).
	 */
	slashItems?: NavigableMenuItem[];
}

export interface PromptInputEditorHandle {
	focus: () => void;
	select: () => void;
	insertText: (text: string) => void;
	setValue: (text: string) => void;
	getValue: () => string;
	isFocused: () => boolean;
	/**
	 * Return the underlying DOM element (CodeMirror view root) so callers can
	 * resolve `ownerDocument` / `ownerDocument.defaultView` and stay
	 * detached-window-safe (§5.3). Returns `null` before the view mounts.
	 */
	getRootElement: () => HTMLElement | null;
}

/**
 * CodeMirror-based prompt input with custom React menus for @ / [[ context triggers
 * and / prompt triggers.
 */
export const PromptInputBody = forwardRef<PromptInputEditorHandle, PromptInputBodyProps>(({
	className,
	placeholder = 'What would you like to know?',
	inputRef,
	onTextChange,
	slashItems,
	...props
}, ref) => {
	const { textInput, autocompletion: autocompletionData } = usePromptInputContext();
	const {
		contextItems = [],
		onLoadContextItems,
		onMenuItemSelect,
		folderStack,
		onFolderUp,
	} = autocompletionData;
	const codeMirrorRef = useRef<any>(null);

	// ----- Context menu state (@ / [[) -----
	const [menu, setMenu] = useState<MenuState>(INITIAL_MENU);
	const menuRef = useRef(menu);
	menuRef.current = menu;

	// Refs for the latest loader callbacks so the async load never reads stale closures
	const onLoadContextItemsRef = useRef(onLoadContextItems);
	onLoadContextItemsRef.current = onLoadContextItems;
	const contextItemsRef = useRef(contextItems);
	contextItemsRef.current = contextItems;
	const onMenuItemSelectRef = useRef(onMenuItemSelect);
	onMenuItemSelectRef.current = onMenuItemSelect;

	// Track the latest pending load to avoid race conditions
	const loadIdRef = useRef(0);
	const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const loadedKeyRef = useRef('');
	const pendingKeyRef = useRef('');
	const activeTriggerKeyRef = useRef('');
	const cacheRef = useRef<Map<string, NavigableMenuItem[]>>(new Map());
	React.useEffect(() => {
		return () => {
			if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
		};
	}, []);

	// ----- Expose focus -----
	const getView = useCallback(() => codeMirrorRef.current?.view as EditorView | undefined, []);
	const focusEditor = useCallback(() => {
		getView()?.focus();
	}, [getView]);

	React.useImperativeHandle(inputRef, () => ({
		focus: focusEditor,
	}), [focusEditor]);
	React.useImperativeHandle(ref, () => ({
		focus: focusEditor,
		select: () => {
			const view = getView();
			if (!view) return;
			view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
			view.focus();
		},
		insertText: (text: string) => {
			const view = getView();
			if (!view) return;
			const selection = view.state.selection.main;
			view.dispatch({
				changes: { from: selection.from, to: selection.to, insert: text },
				selection: { anchor: selection.from + text.length },
			});
			view.focus();
		},
		setValue: (text: string) => {
			const view = getView();
			if (!view) return;
			view.dispatch({
				changes: { from: 0, to: view.state.doc.length, insert: text },
				selection: { anchor: text.length },
			});
			view.focus();
		},
		getValue: () => getView()?.state.doc.toString() ?? '',
		isFocused: () => getView()?.hasFocus ?? false,
		getRootElement: () => (getView()?.dom as HTMLElement | undefined) ?? null,
	}), [focusEditor, getView]);

	// ----- Shared: compute menu position from trigger coords -----
	const computeMenuPosition = useCallback((view: EditorView, from: number): { top: number; left: number; placement?: 'top' | 'bottom'; maxHeight?: number } | null => {
		const cursorPos = view.state.selection.main.head;
		const rawCoords = view.coordsAtPos(cursorPos) ?? view.coordsAtPos(from);
		const editorRect = view.dom.getBoundingClientRect();
		const coordsAreInsideEditor = rawCoords
			&& rawCoords.top >= editorRect.top - 8
			&& rawCoords.bottom <= editorRect.bottom + 8;
		const coords = coordsAreInsideEditor
			? rawCoords
			: {
				top: editorRect.top + 12,
				bottom: Math.min(editorRect.bottom, editorRect.top + 36),
				left: editorRect.left + 4,
				right: editorRect.left + 4,
			};
		if (!coords) return null;
		const ownerWindow = view.dom.ownerDocument.defaultView;
		if (!ownerWindow) return null;
		const visualViewport = ownerWindow.visualViewport;
		const viewportTop = visualViewport?.offsetTop ?? 0;
		const viewportLeft = visualViewport?.offsetLeft ?? 0;
		return calculatePromptMenuPosition(
			{ top: coords.top, bottom: coords.bottom, left: coords.left },
			{
				top: viewportTop,
				left: viewportLeft,
				width: visualViewport?.width ?? ownerWindow.innerWidth,
				height: visualViewport?.height ?? ownerWindow.innerHeight,
			},
		);
	}, []);

	/** Shared menu open + async-load logic for both context and prompt menus. */
	const openMenuWithLoad = useCallback((
		setFn: React.Dispatch<React.SetStateAction<MenuState>>,
		loadIdRef: React.MutableRefObject<number>,
		timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
		loadedKeyRef: React.MutableRefObject<string>,
		pendingKeyRef: React.MutableRefObject<string>,
		cacheRef: React.MutableRefObject<Map<string, NavigableMenuItem[]>>,
		loaderRef: React.MutableRefObject<((q: string, currentFolder?: string) => Promise<NavigableMenuItem[]>) | undefined>,
		fallbackRef: React.MutableRefObject<NavigableMenuItem[]>,
		match: TriggerMatch,
		pos: { top: number; left: number },
		currentFolder?: string,
	) => {
		const queryKey = `${match.trigger}:${currentFolder ?? ''}:${match.query.trim().toLowerCase()}`;
		if (loadedKeyRef.current === queryKey) {
			setFn(prev => ({ ...prev, visible: true, position: pos, triggerMatch: match }));
			return;
		}

		const cachedItems = cacheRef.current.get(queryKey);
		if (cachedItems) {
			loadedKeyRef.current = queryKey;
			setFn(prev => ({
				...prev, visible: true, position: pos, triggerMatch: match,
				selectedIndex: prev.triggerMatch?.query !== match.query ? 0 : prev.selectedIndex,
				items: cachedItems, isLoading: false,
			}));
			return;
		}

		if (pendingKeyRef.current === queryKey) return;
		const currentLoadId = ++loadIdRef.current;
		pendingKeyRef.current = queryKey;
		const q = match.query.toLowerCase();
		const fallbackItems = fallbackRef.current
			.filter((it: any) => !q || it.label.toLowerCase().includes(q) || it.description?.toLowerCase().includes(q))
			.slice(0, SLICE_CAPS.ui.promptOptions);
		setFn(prev => ({
			...prev,
			visible: true,
			position: pos,
			triggerMatch: match,
			items: fallbackItems,
			isLoading: false,
			selectedIndex: prev.triggerMatch?.query !== match.query ? 0 : prev.selectedIndex,
		}));

		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(async () => {
			let items: NavigableMenuItem[];
			try {
				if (loaderRef.current) {
					items = await loaderRef.current(match.query, currentFolder);
				} else {
					const q = match.query.toLowerCase();
					items = fallbackRef.current.filter((it: any) =>
						it.label.toLowerCase().includes(q) || it.description?.toLowerCase().includes(q));
				}
			} catch {
				items = fallbackRef.current;
			}
			if (loadIdRef.current !== currentLoadId) return;
			const slicedItems = items.slice(0, SLICE_CAPS.ui.promptOptions);
			cacheRef.current.set(queryKey, slicedItems);
			loadedKeyRef.current = queryKey;
			pendingKeyRef.current = '';
			setFn(prev => ({ ...prev, items: slicedItems, isLoading: false }));
		}, match.query.trim() ? MENU_SEARCH_DEBOUNCE_MS : 0);
	}, []);

	const slashItemsRef = useRef(slashItems);
	slashItemsRef.current = slashItems;

	// Keep PromptInput's controlled value and the Composer draft in sync before
	// selection side-effects (such as adding an explicit Vault ref) can re-render
	// the editor. Without this synchronous hand-off, the shelf update can replay
	// the old `[[query]]` draft over the newly inserted `[[path]]` text.
	const handleChange = useCallback((value: string) => {
		textInput.setInput(value);

		if (onTextChange) {
			const parsedTags = parseTagsFromText(value);
			const filteredTags = parsedTags.filter(tag => tag.type !== 'search') as Array<{
				type: 'context' | 'prompt';
				text: string;
				start: number;
				end: number;
			}>;
			onTextChange(value, filteredTags);
		}
	}, [textInput, onTextChange]);

	// ----- Trigger detection callback (called by CM update listener) -----
	const handleTriggerUpdate = useCallback((view: EditorView) => {
		const cursorPos = view.state.selection.main.head;
		const match = detectTrigger(view.state.doc.toString(), cursorPos);

		if (!match) {
			if (menuRef.current.visible) setMenu(INITIAL_MENU);
			activeTriggerKeyRef.current = '';
			pendingKeyRef.current = '';
			if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
			return;
		}

		// Workflow palette: local synchronous filter over real workflows only.
		if (match.trigger === '/') {
			const available = slashItemsRef.current ?? [];
			if (available.length === 0) {
				if (menuRef.current.visible) setMenu(INITIAL_MENU);
				return;
			}
			const pos = computeMenuPosition(view, match.from);
			if (!pos) return;
			const q = match.query.toLowerCase();
			const items = available.filter((it) =>
				!q || it.label.toLowerCase().includes(q) || (it.description ?? '').toLowerCase().includes(q));
			if (items.length === 0) {
				if (menuRef.current.visible) setMenu(INITIAL_MENU);
				return;
			}
			setMenu((prev) => ({
				visible: true,
				items,
				selectedIndex: prev.triggerMatch?.query !== match.query ? 0 : prev.selectedIndex,
				position: pos,
				triggerMatch: match,
				isLoading: false,
			}));
			return;
		}

		const currentFolder = folderStack?.[folderStack.length - 1];
		const triggerStateKey = `${match.trigger}:${currentFolder ?? ''}:${match.from}:${match.query.trim().toLowerCase()}`;
		if (activeTriggerKeyRef.current === triggerStateKey && menuRef.current.visible) return;
		activeTriggerKeyRef.current = triggerStateKey;

		const pos = computeMenuPosition(view, match.from);
		if (!pos) {
			if (menuRef.current.visible) setMenu(INITIAL_MENU);
			return;
		}

		openMenuWithLoad(setMenu, loadIdRef, loadTimerRef, loadedKeyRef, pendingKeyRef, cacheRef, onLoadContextItemsRef, contextItemsRef, match, pos, currentFolder);
	}, [computeMenuPosition, folderStack, openMenuWithLoad]);

	// ----- Context menu callbacks -----
	const handleMenuSelect = useCallback((item: NavigableMenuItem) => {
		const view = codeMirrorRef.current?.view as EditorView | undefined;
		const match = menuRef.current.triggerMatch;
		if (!view || !match) return;

		// Folder navigation: drill down without inserting
		if (item.showArrow) {
			if (onMenuItemSelectRef.current) {
				onMenuItemSelectRef.current(match.trigger, item);
			}
			const folderPath = item.value;
			const currentLoadId = ++loadIdRef.current;
			setMenu(prev => ({ ...prev, isLoading: true, selectedIndex: 0 }));
			void (async () => {
				let items: NavigableMenuItem[] = [];
				try {
					items = await (onLoadContextItemsRef.current?.('', folderPath) ?? Promise.resolve([]));
				} catch {
					items = [];
				}
				if (loadIdRef.current !== currentLoadId) return;
				const slicedItems = items.slice(0, SLICE_CAPS.ui.promptOptions);
				const queryKey = `${match.trigger}:${folderPath}:`;
				cacheRef.current.set(queryKey, slicedItems);
				loadedKeyRef.current = queryKey;
				setMenu(prev => ({ ...prev, items: slicedItems, isLoading: false, selectedIndex: 0 }));
			})();
			return;
		}

		// Workflow selection: remove the `/query` trigger text — the workflow
		// becomes a context chip owned by the Composer, not inline prose.
		if (match.trigger === '/') {
			view.dispatch({
				changes: { from: match.from, to: match.to, insert: '' },
				selection: { anchor: match.from },
			});
			handleChange(view.state.doc.toString());
			onMenuItemSelectRef.current?.(match.trigger, item);
			setMenu(INITIAL_MENU);
			view.focus();
			return;
		}

		// Build insertion text
		const value = item.value || item.label;
		const selection = buildVaultReferenceSelection(
			view.state.doc.toString(),
			match.from,
			match.to,
			value,
		);

		view.dispatch({
			changes: { from: match.from, to: match.to, insert: selection.replacement },
			selection: { anchor: selection.cursor },
		});
		handleChange(selection.text);

		if (onMenuItemSelectRef.current) {
			// Pass the resolved editor text with the selection. Composer uses it
			// to commit the inline wikilink and explicit ref in one Zustand
			// update, so a shelf re-render cannot expose a stale draft value.
			onMenuItemSelectRef.current(match.trigger, item, selection.text);
		}

		setMenu(INITIAL_MENU);
		// Refocus the editor
		view.focus();
	}, [handleChange]);

	const handleMenuClose = useCallback(() => {
		setMenu(INITIAL_MENU);
		codeMirrorRef.current?.view?.focus();
	}, []);

	const handleSelectedIndexChange = useCallback((index: number) => {
		setMenu(prev => ({ ...prev, selectedIndex: index }));
	}, []);

	// ----- CodeMirror extensions -----

	// Stable ref for the trigger callback so the ViewPlugin never goes stale
	const handleTriggerUpdateRef = useRef(handleTriggerUpdate);
	handleTriggerUpdateRef.current = handleTriggerUpdate;

	const extensions = useMemo(() => {
		const exts = [
			tagPlugin,
			keymapExtension,
			EditorView.lineWrapping,
			EditorView.theme({
				'&': { outline: 'none !important' },
				'&.cm-focused': { outline: 'none !important', boxShadow: 'none !important' },
				'.cm-scroller': { outline: 'none !important' },
				'.cm-content': { outline: 'none !important' },
				'.cm-content:focus': { outline: 'none !important' },
				'.cm-content:focus-visible': { outline: 'none !important' },
				'[contenteditable="true"]:focus': { outline: 'none !important' },
			}),
			EditorView.updateListener.of((update) => {
				if (update.docChanged || update.selectionSet) {
					handleTriggerUpdateRef.current(update.view);
				}
			}),
		];
		return exts;
	}, [tagPlugin, keymapExtension]);

	// ----- Render -----
	const containerRef = useRef<HTMLDivElement>(null);
	// Prefer the leaf-scoped portal host (carries `.pktw-root .peak-design-root`
	// scope classes + lives in the correct window for popout leaves); fall back
	// to this leaf's ownerDocument body when no provider is present.
	const portalContainer = usePortalContainer();
	const portalTarget = portalContainer ?? containerRef.current?.ownerDocument.body ?? document.body;
	return (
		<div ref={containerRef} className="pktw-flex-1 pktw-min-w-0 pktw-border-0">
			<CodeMirror
				ref={codeMirrorRef}
				value={textInput.value}
				height="auto"
				maxHeight="200px"
				minHeight="60px"
				theme="none"
				extensions={extensions}
				onChange={handleChange}
				placeholder={placeholder}
				className={cn(
					// Sans + 13px/1.45 per composer mock. Effective font-family / size /
					// weight are pinned in codemirror.css with `!important` (that beats
					// CM's base `.cm-scroller { font-family: monospace }`); these utilities
					// keep intent visible at the call site. Vertical padding is owned by
					// `.pkchat-composer__editor` — no `pktw-py-*` here, or the editor pads
					// twice (mock wants a single ~12px top inset).
					'pktw-w-full pktw-text-pk-md pktw-leading-[1.45] pktw-font-normal pktw-codemirror-custom peak-no-native-outline',
					className,
				)}
				basicSetup={{
					lineNumbers: false,
					foldGutter: false,
					highlightActiveLine: false,
					highlightActiveLineGutter: false,
					indentOnInput: false,
					bracketMatching: false,
					closeBrackets: false,
					autocompletion: false,
					rectangularSelection: false,
					crosshairCursor: false,
					highlightSelectionMatches: false,
					searchKeymap: false,
					historyKeymap: false,
					foldKeymap: false,
					completionKeymap: false,
					lintKeymap: false,
					defaultKeymap: true,
				}}
			/>

			{/* Custom context menu for [[ / slash triggers. Portal host already
			    carries the dual scope class, so no self-wrapped `pktw-root` div. */}
			{menu.visible && createPortal(
				<ContextMenu
					items={menu.items}
					selectedIndex={menu.selectedIndex}
					position={menu.position}
					isLoading={menu.isLoading}
					onSelect={handleMenuSelect}
					onClose={handleMenuClose}
					onSelectedIndexChange={handleSelectedIndexChange}
					folderStack={folderStack}
					onFolderUp={onFolderUp}
				/>,
				portalTarget,
			)}
		</div>
	);
});
PromptInputBody.displayName = 'PromptInputBody';
