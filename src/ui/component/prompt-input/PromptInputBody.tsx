import { SLICE_CAPS } from '@/core/constant';
import React, { useRef, useCallback, useState, forwardRef, useMemo, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/ui/react/lib/utils';
import { usePromptInputContext } from './PromptInput';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
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
// Context menu state hook
// ---------------------------------------------------------------------------

interface ContextMenuState {
	visible: boolean;
	items: NavigableMenuItem[];
	selectedIndex: number;
	position: ContextMenuPosition;
	/** The detected trigger match while the menu is open */
	triggerMatch: TriggerMatch | null;
	isLoading: boolean;
}

const INITIAL_MENU_STATE: ContextMenuState = {
	visible: false,
	items: [],
	selectedIndex: 0,
	position: { top: 0, left: 0 },
	triggerMatch: null,
	isLoading: false,
};

// ---------------------------------------------------------------------------
// Prompt menu state
// ---------------------------------------------------------------------------

interface PromptMenuState {
	visible: boolean;
	items: NavigableMenuItem[];
	selectedIndex: number;
	position: PromptMenuPosition;
	/** The detected trigger match while the menu is open */
	triggerMatch: TriggerMatch | null;
	isLoading: boolean;
}

const INITIAL_PROMPT_MENU_STATE: PromptMenuState = {
	visible: false,
	items: [],
	selectedIndex: 0,
	position: { top: 0, left: 0 },
	triggerMatch: null,
	isLoading: false,
};

// ---------------------------------------------------------------------------
// Props / Component
// ---------------------------------------------------------------------------

export interface PromptInputBodyProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
	placeholder?: string;
	inputRef?: React.Ref<{ focus: () => void }>;
	onTextChange?: (text: string, tags: Array<{ type: 'context' | 'prompt'; text: string; start: number; end: number }>) => void;
}

/**
 * CodeMirror-based prompt input with custom React menus for @ / [[ context triggers
 * and / prompt triggers.
 */
export const PromptInputBody = forwardRef<any, PromptInputBodyProps>(({
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
	} = autocompletionData;
	const codeMirrorRef = useRef<any>(null);

	// ----- Context menu state (@ / [[) -----
	const [menu, setMenu] = useState<ContextMenuState>(INITIAL_MENU_STATE);
	const menuRef = useRef(menu);
	menuRef.current = menu;

	// ----- Prompt menu state (/) -----
	const [promptMenu, setPromptMenu] = useState<PromptMenuState>(INITIAL_PROMPT_MENU_STATE);
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

	// ----- Expose focus -----
	React.useImperativeHandle(inputRef, () => ({
		focus: () => {
			codeMirrorRef.current?.view?.focus();
		},
	}), []);
	React.useImperativeHandle(ref, () => codeMirrorRef.current?.view);

	// ----- Shared: compute menu position from trigger coords -----
	const computeMenuPosition = useCallback((view: EditorView, from: number): { top: number; left: number } | null => {
		const coords = view.coordsAtPos(from);
		if (!coords) return null;
		const menuHeight = 300;
		const showAbove = coords.top > menuHeight + 20;
		const pos = showAbove
			? { top: coords.top - menuHeight - 4, left: coords.left }
			: { top: coords.bottom + 4, left: coords.left };
		const viewportWidth = window.innerWidth;
		const menuWidth = 400;
		if (pos.left + menuWidth > viewportWidth - 8) {
			pos.left = Math.max(8, viewportWidth - menuWidth - 8);
		}
		return pos;
	}, []);

	// ----- Trigger detection callback (called by CM update listener) -----
	const handleTriggerUpdate = useCallback((view: EditorView) => {
		const state = view.state;
		const cursorPos = state.selection.main.head;
		const docText = state.doc.toString();
		const match = detectTrigger(docText, cursorPos);

		if (!match) {
			if (menuRef.current.visible) setMenu(INITIAL_MENU_STATE);
			if (promptMenuRef.current.visible) setPromptMenu(INITIAL_PROMPT_MENU_STATE);
			return;
		}

		// Route to correct menu based on trigger type
		if (match.trigger === '/' ) {
			// Close context menu if it was open
			if (menuRef.current.visible) setMenu(INITIAL_MENU_STATE);

			const pos = computeMenuPosition(view, match.from);
			if (!pos) {
				if (promptMenuRef.current.visible) setPromptMenu(INITIAL_PROMPT_MENU_STATE);
				return;
			}

			const currentLoadId = ++promptLoadIdRef.current;
			setPromptMenu(prev => ({
				...prev,
				visible: true,
				position: pos,
				triggerMatch: match,
				isLoading: true,
				selectedIndex: prev.triggerMatch?.query !== match.query ? 0 : prev.selectedIndex,
			}));

			const load = async () => {
				let items: NavigableMenuItem[] = [];
				try {
					if (onLoadPromptItemsRef.current) {
						items = await onLoadPromptItemsRef.current(match.query);
					} else {
						const fallback = promptItemsRef.current;
						const q = match.query.toLowerCase();
						items = fallback.filter(
							(it: any) =>
								it.label.toLowerCase().includes(q) ||
								it.description?.toLowerCase().includes(q),
						);
					}
				} catch (err) {
					console.error('Error loading prompt items:', err);
					items = promptItemsRef.current;
				}
				if (promptLoadIdRef.current !== currentLoadId) return;
				setPromptMenu(prev => ({
					...prev,
					items: items.slice(0, SLICE_CAPS.ui.promptOptions),
					isLoading: false,
				}));
			};
			load();
		} else {
			// @ or [[ trigger → context menu
			// Close prompt menu if it was open
			if (promptMenuRef.current.visible) setPromptMenu(INITIAL_PROMPT_MENU_STATE);

			const pos = computeMenuPosition(view, match.from);
			if (!pos) {
				if (menuRef.current.visible) setMenu(INITIAL_MENU_STATE);
				return;
			}

			const currentLoadId = ++loadIdRef.current;
			setMenu(prev => ({
				...prev,
				visible: true,
				position: pos,
				triggerMatch: match,
				isLoading: true,
				selectedIndex: prev.triggerMatch?.query !== match.query ? 0 : prev.selectedIndex,
			}));

			const load = async () => {
				let items: NavigableMenuItem[] = [];
				try {
					if (onLoadContextItemsRef.current) {
						items = await onLoadContextItemsRef.current(match.query);
					} else {
						const fallback = contextItemsRef.current;
						const q = match.query.toLowerCase();
						items = fallback.filter(
							(it: any) =>
								it.label.toLowerCase().includes(q) ||
								it.description?.toLowerCase().includes(q),
						);
					}
				} catch (err) {
					console.error('Error loading context items:', err);
					items = contextItemsRef.current;
				}
				if (loadIdRef.current !== currentLoadId) return;
				setMenu(prev => ({
					...prev,
					items: items.slice(0, SLICE_CAPS.ui.promptOptions),
					isLoading: false,
				}));
			};
			load();
		}
	}, [computeMenuPosition]); // Stable — reads refs internally

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

		setMenu(INITIAL_MENU_STATE);
		// Refocus the editor
		view.focus();
	}, []);

	const handleMenuClose = useCallback(() => {
		setMenu(INITIAL_MENU_STATE);
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

		setPromptMenu(INITIAL_PROMPT_MENU_STATE);
		view.focus();
	}, []);

	const handlePromptMenuClose = useCallback(() => {
		setPromptMenu(INITIAL_PROMPT_MENU_STATE);
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
			// Update listener for @ / [[ / slash trigger detection
			ViewPlugin.fromClass(
				class {
					update(update: ViewUpdate) {
						if (update.docChanged || update.selectionSet) {
							handleTriggerUpdateRef.current(update.view);
						}
					}
				},
			),
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
					'pktw-w-full pktw-text-[15px] pktw-leading-[1.5] pktw-font-medium pktw-codemirror-custom',
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
				<ContextMenu
					items={menu.items}
					selectedIndex={menu.selectedIndex}
					position={menu.position}
					isLoading={menu.isLoading}
					onSelect={handleMenuSelect}
					onClose={handleMenuClose}
					onSelectedIndexChange={handleSelectedIndexChange}
				/>,
				document.body,
			)}

			{/* Custom prompt menu for / triggers */}
			{promptMenu.visible && createPortal(
				<PromptMenu
					items={promptMenu.items}
					selectedIndex={promptMenu.selectedIndex}
					position={promptMenu.position}
					isLoading={promptMenu.isLoading}
					onSelect={handlePromptMenuSelect}
					onClose={handlePromptMenuClose}
					onSelectedIndexChange={handlePromptSelectedIndexChange}
				/>,
				document.body,
			)}
		</div>
	);
});
PromptInputBody.displayName = 'PromptInputBody';
