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
import { ContextMenu, type ContextMenuPosition } from '@/ui/view/chat-view/components/ContextMenu';
import { PromptMenu, type PromptMenuPosition } from '@/ui/view/chat-view/components/PromptMenu';
import type { NavigableMenuItem } from '@/ui/component/mine/NavigableMenu';

// ---------------------------------------------------------------------------
// Trigger detection helpers
// ---------------------------------------------------------------------------

interface TriggerMatch {
	trigger: '@' | '[[' | '/';
	query: string;
	/** Absolute offset of the trigger start (including `@` or `[[` or `/`) */
	from: number;
	/** Absolute offset of the cursor (end of the typed query) */
	to: number;
}

/**
 * Scans the text to the left of `cursorPos` and returns a trigger match if
 * the cursor sits inside an `@query`, `[[query`, or `/query` span.
 */
function detectTrigger(docText: string, cursorPos: number): TriggerMatch | null {
	// Look backwards from cursor (up to 200 chars) for the trigger character
	const lookback = 200;
	const start = Math.max(0, cursorPos - lookback);
	const textBefore = docText.slice(start, cursorPos);

	// Check [[ first (longer prefix)
	const bracketIdx = textBefore.lastIndexOf('[[');
	const atIdx = textBefore.lastIndexOf('@');
	const slashIdx = textBefore.lastIndexOf('/');

	// Pick the rightmost trigger
	const maxIdx = Math.max(bracketIdx, atIdx, slashIdx);
	if (maxIdx < 0) return null;

	if (bracketIdx === maxIdx) {
		const afterBracket = textBefore.slice(bracketIdx + 2);
		// Bail if already closed ]]
		if (afterBracket.includes(']]')) return null;
		// Bail if newline between trigger and cursor
		if (afterBracket.includes('\n')) return null;
		return {
			trigger: '[[',
			query: afterBracket,
			from: start + bracketIdx,
			to: cursorPos,
		};
	}

	if (atIdx === maxIdx) {
		const afterAt = textBefore.slice(atIdx + 1);
		// Bail if there is already a closing @
		if (afterAt.includes('@')) return null;
		// Bail if newline between trigger and cursor
		if (afterAt.includes('\n')) return null;
		// Bail if the @ is preceded by a word char (e.g. email "foo@")
		if (atIdx > 0 && /\w/.test(textBefore[atIdx - 1])) return null;
		return {
			trigger: '@',
			query: afterAt,
			from: start + atIdx,
			to: cursorPos,
		};
	}

	if (slashIdx === maxIdx) {
		const afterSlash = textBefore.slice(slashIdx + 1);
		// Bail if newline between trigger and cursor
		if (afterSlash.includes('\n')) return null;
		// Bail if there's a space in the query (slash commands are single tokens)
		if (afterSlash.includes(' ')) return null;
		// Only trigger if / is at start of line or preceded by whitespace
		if (slashIdx > 0 && !/\s/.test(textBefore[slashIdx - 1])) return null;
		// Bail if already closed with /
		if (afterSlash.includes('/')) return null;
		return {
			trigger: '/',
			query: afterSlash,
			from: start + slashIdx,
			to: cursorPos,
		};
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
}

export interface PromptInputEditorHandle {
	focus: () => void;
	select: () => void;
	insertText: (text: string) => void;
	setValue: (text: string) => void;
	getValue: () => string;
	isFocused: () => boolean;
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
	...props
}, ref) => {
	const { textInput, autocompletion: autocompletionData } = usePromptInputContext();
	const {
		contextItems = [],
		promptItems = [],
		onLoadContextItems,
		onLoadPromptItems,
		onMenuItemSelect,
		folderStack,
		onFolderUp,
	} = autocompletionData;
	const codeMirrorRef = useRef<any>(null);

	// ----- Context menu state (@ / [[) -----
	const [menu, setMenu] = useState<MenuState>(INITIAL_MENU);
	const menuRef = useRef(menu);
	menuRef.current = menu;

	// ----- Prompt menu state (/) -----
	const [promptMenu, setPromptMenu] = useState<MenuState>(INITIAL_MENU);
	const promptMenuRef = useRef(promptMenu);
	promptMenuRef.current = promptMenu;

	// Refs for the latest loader callbacks so the async load never reads stale closures
	const onLoadContextItemsRef = useRef(onLoadContextItems);
	onLoadContextItemsRef.current = onLoadContextItems;
	const contextItemsRef = useRef(contextItems);
	contextItemsRef.current = contextItems;
	const onMenuItemSelectRef = useRef(onMenuItemSelect);
	onMenuItemSelectRef.current = onMenuItemSelect;
	const onLoadPromptItemsRef = useRef(onLoadPromptItems);
	onLoadPromptItemsRef.current = onLoadPromptItems;
	const promptItemsRef = useRef(promptItems);
	promptItemsRef.current = promptItems;

	// Track the latest pending load to avoid race conditions
	const loadIdRef = useRef(0);
	const promptLoadIdRef = useRef(0);
	const loadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const promptLoadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const loadedKeyRef = useRef('');
	const promptLoadedKeyRef = useRef('');
	const pendingKeyRef = useRef('');
	const promptPendingKeyRef = useRef('');
	const activeTriggerKeyRef = useRef('');
	const promptActiveTriggerKeyRef = useRef('');
	const cacheRef = useRef<Map<string, NavigableMenuItem[]>>(new Map());
	const promptCacheRef = useRef<Map<string, NavigableMenuItem[]>>(new Map());
	React.useEffect(() => {
		return () => {
			if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
			if (promptLoadTimerRef.current) clearTimeout(promptLoadTimerRef.current);
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
	}), [focusEditor, getView]);

	// ----- Shared: compute menu position from trigger coords -----
	const computeMenuPosition = useCallback((view: EditorView, from: number): { top: number; left: number } | null => {
		const coords = view.coordsAtPos(from) ?? view.coordsAtPos(view.state.selection.main.head);
		if (!coords) return null;
		const menuHeight = 300;
		const menuWidth = 400;
		const viewportHeight = window.innerHeight;
		const viewportWidth = window.innerWidth;
		const margin = 8;

		// Vertical: prefer above the cursor; flip to below if not enough space above
		const spaceAbove = coords.top;
		const spaceBelow = viewportHeight - coords.bottom;
		let top: number;
		if (spaceAbove >= menuHeight + margin) {
			// Show above: menu bottom aligns just above the trigger
			top = coords.top - menuHeight - 4;
		} else if (spaceBelow >= menuHeight + margin) {
			// Show below: menu top aligns just below the trigger
			top = coords.bottom + 4;
		} else {
			// Neither side has full room — pick the side with more space and clamp
			if (spaceAbove >= spaceBelow) {
				top = Math.max(margin, coords.top - menuHeight - 4);
			} else {
				top = coords.bottom + 4;
			}
		}

		// Horizontal: start at trigger, shift left if overflowing right edge
		let left = coords.left;
		if (left + menuWidth > viewportWidth - margin) {
			left = Math.max(margin, viewportWidth - menuWidth - margin);
		}

		return { top, left };
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

	// ----- Trigger detection callback (called by CM update listener) -----
	const handleTriggerUpdate = useCallback((view: EditorView) => {
		const cursorPos = view.state.selection.main.head;
		const match = detectTrigger(view.state.doc.toString(), cursorPos);

		if (!match) {
			if (menuRef.current.visible) setMenu(INITIAL_MENU);
			if (promptMenuRef.current.visible) setPromptMenu(INITIAL_MENU);
			activeTriggerKeyRef.current = '';
			promptActiveTriggerKeyRef.current = '';
			pendingKeyRef.current = '';
			promptPendingKeyRef.current = '';
			if (loadTimerRef.current) clearTimeout(loadTimerRef.current);
			if (promptLoadTimerRef.current) clearTimeout(promptLoadTimerRef.current);
			return;
		}

		const isPrompt = match.trigger === '/';
		const currentFolder = isPrompt ? undefined : folderStack?.[folderStack.length - 1];
		const triggerStateKey = `${match.trigger}:${currentFolder ?? ''}:${match.from}:${match.query.trim().toLowerCase()}`;
		if (isPrompt) {
			if (promptActiveTriggerKeyRef.current === triggerStateKey && promptMenuRef.current.visible) return;
			promptActiveTriggerKeyRef.current = triggerStateKey;
			activeTriggerKeyRef.current = '';
		} else {
			if (activeTriggerKeyRef.current === triggerStateKey && menuRef.current.visible) return;
			activeTriggerKeyRef.current = triggerStateKey;
			promptActiveTriggerKeyRef.current = '';
		}

		// Close the other menu
		if (isPrompt && menuRef.current.visible) setMenu(INITIAL_MENU);
		if (!isPrompt && promptMenuRef.current.visible) setPromptMenu(INITIAL_MENU);

		const pos = computeMenuPosition(view, match.from);
		if (!pos) {
			if (isPrompt && promptMenuRef.current.visible) setPromptMenu(INITIAL_MENU);
			if (!isPrompt && menuRef.current.visible) setMenu(INITIAL_MENU);
			return;
		}

		if (isPrompt) {
			openMenuWithLoad(setPromptMenu, promptLoadIdRef, promptLoadTimerRef, promptLoadedKeyRef, promptPendingKeyRef, promptCacheRef, onLoadPromptItemsRef, promptItemsRef, match, pos);
		} else {
			openMenuWithLoad(setMenu, loadIdRef, loadTimerRef, loadedKeyRef, pendingKeyRef, cacheRef, onLoadContextItemsRef, contextItemsRef, match, pos, currentFolder);
		}
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

		// Build insertion text
		const value = item.value || item.label;
		const text = match.trigger === '@'
			? ` @${value}@ `
			: ` [[${value}]] `;

		view.dispatch({
			changes: { from: match.from, to: match.to, insert: text },
			selection: { anchor: match.from + text.length },
		});

		if (onMenuItemSelectRef.current) {
			onMenuItemSelectRef.current(match.trigger, item);
		}

		setMenu(INITIAL_MENU);
		// Refocus the editor
		view.focus();
	}, []);

	const handleMenuClose = useCallback(() => {
		setMenu(INITIAL_MENU);
		codeMirrorRef.current?.view?.focus();
	}, []);

	const handleSelectedIndexChange = useCallback((index: number) => {
		setMenu(prev => ({ ...prev, selectedIndex: index }));
	}, []);

	// ----- Prompt menu callbacks -----
	const handlePromptMenuSelect = useCallback((item: NavigableMenuItem) => {
		const view = codeMirrorRef.current?.view as EditorView | undefined;
		const match = promptMenuRef.current.triggerMatch;
		if (!view || !match) return;

		const value = item.value || item.label;
		const text = ` /${value}/ `;

		view.dispatch({
			changes: { from: match.from, to: match.to, insert: text },
			selection: { anchor: match.from + text.length },
		});

		if (onMenuItemSelectRef.current) {
			onMenuItemSelectRef.current('/', item);
		}

		setPromptMenu(INITIAL_MENU);
		view.focus();
	}, []);

	const handlePromptMenuClose = useCallback(() => {
		setPromptMenu(INITIAL_MENU);
		codeMirrorRef.current?.view?.focus();
	}, []);

	const handlePromptSelectedIndexChange = useCallback((index: number) => {
		setPromptMenu(prev => ({ ...prev, selectedIndex: index }));
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

	// ----- onChange -----
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

	// ----- Render -----
	return (
		<div className="pktw-flex-1 pktw-min-w-0 pktw-px-3 pktw-border-0">
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
					'pktw-w-full pktw-text-[15px] pktw-leading-[1.5] pktw-font-medium pktw-codemirror-custom peak-no-native-outline',
					'pktw-py-3',
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

			{/* Custom context menu for @ / [[ triggers */}
			{menu.visible && createPortal(
				<div className="pktw-root">
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
					/>
				</div>,
				document.body,
			)}

			{/* Custom prompt menu for / triggers */}
			{promptMenu.visible && createPortal(
				<div className="pktw-root">
					<PromptMenu
						items={promptMenu.items}
						selectedIndex={promptMenu.selectedIndex}
						position={promptMenu.position}
						isLoading={promptMenu.isLoading}
						onSelect={handlePromptMenuSelect}
						onClose={handlePromptMenuClose}
						onSelectedIndexChange={handlePromptSelectedIndexChange}
					/>
				</div>,
				document.body,
			)}
		</div>
	);
});
PromptInputBody.displayName = 'PromptInputBody';
