import React, { useRef, useCallback, useState, forwardRef, useEffect, useMemo, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/ui/react/lib/utils';
import { usePromptInputContext } from './PromptInput';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView, tooltips } from '@codemirror/view';
import { autocompletion } from '@codemirror/autocomplete';
import { tagPlugin } from './tagPlugin';
import { keymapExtension } from './keymap';
import { CompletionContext, CompletionSource } from '@codemirror/autocomplete';
import { parseTagsFromText } from './tagParser';

// Create completion sources with data
const createCompletionSources = (
	contextItems: any[],
	promptItems: any[],
	onLoadContextItems?: (query: string, currentFolder?: string) => Promise<any[]>,
	onLoadPromptItems?: (query: string) => Promise<any[]>,
	onMenuItemSelect?: (triggerChar: string, selectedItem: any) => void
): CompletionSource[] => {
	// @ completion source
	const contextCompletionSource: CompletionSource = async (context: CompletionContext) => {
		const match = context.matchBefore(/@[\w\/\-\.]*/);
		if (!match) return null;

		const query = match.text.slice(1); // Remove @
		let options: any[] = [];

		try {
			if (onLoadContextItems) {
				options = await onLoadContextItems(query);
			} else {
				// Fallback to static items
				options = contextItems.filter(item =>
					item.label.toLowerCase().includes(query.toLowerCase()) ||
					item.description?.toLowerCase().includes(query.toLowerCase())
				);
			}
		} catch (error) {
			console.error('Error loading context items:', error);
			options = contextItems;
		}

		return {
			from: match.from,
			options: options.slice(0, 20).map(item => ({
				label: `@${item.value || item.label}`,
				displayLabel: item.label,
				detail: item.description,
				type: 'context',
				info: item.description,
				apply: (view: EditorView, completion: any, from: number, to: number) => {
					// Handle folder navigation
					if (item.showArrow) {
						// Don't insert text for folder navigation, just trigger callback
						if (onMenuItemSelect) {
							onMenuItemSelect('@', item);
						}
						return;
					}

					const text = ` @${item.value || item.label}@ `;
					view.dispatch({
						changes: { from, to, insert: text },
						selection: { anchor: from + text.length }
					});
					if (onMenuItemSelect) {
						onMenuItemSelect('@', item);
					}
				}
			}))
		};
	};

	// [[ completion source
	const bracketCompletionSource: CompletionSource = async (context: CompletionContext) => {
		const match = context.matchBefore(/\[\[[\w\/\-\.\s]*/);
		if (!match) return null;

		const query = match.text.slice(2); // Remove [[
		let options: any[] = [];

		try {
			if (onLoadContextItems) {
				options = await onLoadContextItems(query);
			} else {
				options = contextItems.filter(item =>
					item.label.toLowerCase().includes(query.toLowerCase()) ||
					item.description?.toLowerCase().includes(query.toLowerCase())
				);
			}
		} catch (error) {
			console.error('Error loading context items:', error);
			options = contextItems;
		}

		return {
			from: match.from,
			options: options.slice(0, 20).map(item => ({
				label: `[[${item.value || item.label}]]`,
				displayLabel: item.label,
				detail: item.description,
				type: 'context',
				info: item.description,
				apply: (view: EditorView, completion: any, from: number, to: number) => {
					// Handle folder navigation
					if (item.showArrow) {
						// Don't insert text for folder navigation, just trigger callback
						if (onMenuItemSelect) {
							onMenuItemSelect('[[', item);
						}
						return;
					}

					const text = ` [[${item.value || item.label}]] `;
					view.dispatch({
						changes: { from, to, insert: text },
						selection: { anchor: from + text.length }
					});
					if (onMenuItemSelect) {
						onMenuItemSelect('[[', item);
					}
				}
			}))
		};
	};

	// / completion source
	const promptCompletionSource: CompletionSource = async (context: CompletionContext) => {
		const match = context.matchBefore(/\/[\w\-]*/);
		if (!match) return null;

		const query = match.text.slice(1); // Remove /
		let options: any[] = [];

		try {
			if (onLoadPromptItems) {
				options = await onLoadPromptItems(query);
			} else {
				options = promptItems.filter(item =>
					item.label.toLowerCase().includes(query.toLowerCase()) ||
					item.description?.toLowerCase().includes(query.toLowerCase())
				);
			}
		} catch (error) {
			console.error('Error loading prompt items:', error);
			options = promptItems;
		}

		return {
			from: match.from,
			options: options.slice(0, 20).map(item => ({
				label: `/${item.value || item.label}`,
				displayLabel: item.label,
				detail: item.description,
				type: 'prompt',
				info: item.description,
				apply: (view: EditorView, completion: any, from: number, to: number) => {
					const text = ` /${item.value || item.label}/ `;
					view.dispatch({
						changes: { from, to, insert: text },
						selection: { anchor: from + text.length }
					});
					if (onMenuItemSelect) {
						onMenuItemSelect('/', item);
					}
				}
			}))
		};
	};

	return [contextCompletionSource, bracketCompletionSource, promptCompletionSource];
};

export interface PromptInputBodyProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
	placeholder?: string;
	inputRef?: React.Ref<{ focus: () => void }>;
	onTextChange?: (text: string, tags: Array<{ type: 'context' | 'prompt'; text: string; start: number; end: number; }>) => void;
}

/**
 * Simple textarea component for prompt input (marker styling temporarily disabled)
 */
export const PromptInputBody = forwardRef<any, PromptInputBodyProps>(({
	className,
	placeholder = 'What would you like to know?',
	inputRef,
	onTextChange,
	...props
}, ref) => {
	const { textInput, attachments, autocompletion: autocompletionData } = usePromptInputContext();
	const {
		contextItems = [],
		promptItems = [],
		onLoadContextItems,
		onLoadPromptItems,
		onMenuItemSelect
	} = autocompletionData;
	const codeMirrorRef = useRef<any>(null);

	// Expose focus method via inputRef
	React.useImperativeHandle(inputRef, () => ({
		focus: () => {
			if (codeMirrorRef.current?.view) {
				codeMirrorRef.current.view.focus();
			}
		}
	}), []);

	// Merge refs
	React.useImperativeHandle(ref, () => codeMirrorRef.current?.view);

	// CodeMirror extensions
	const extensions = useMemo(() => {
		console.warn('[PromptInputBody] Creating extensions array');
		const exts = [
			tagPlugin,
			keymapExtension,
			EditorView.lineWrapping, // Enable line wrapping
			autocompletion({
				override: createCompletionSources(
					contextItems,
					promptItems,
					onLoadContextItems,
					onLoadPromptItems,
					onMenuItemSelect
				),
				icons: false,
				maxRenderedOptions: 10,
			}),
			tooltips({
				parent: document.body,
				position: "absolute",
			}),
		];
		console.warn('[PromptInputBody] Extensions created:', exts.length, 'extensions');
		return exts;
	}, [tagPlugin, keymapExtension, contextItems, promptItems, onLoadContextItems, onLoadPromptItems, onMenuItemSelect]);

	// Handle height adjustment (CodeMirror auto-handles this)
	const adjustHeight = useCallback(() => {
		// CodeMirror handles height automatically
	}, []);

	// Use shared tag parsing logic from tagParser.ts
	const parseTagsFromTextCallback = useCallback((text: string) => {
		return parseTagsFromText(text);
	}, []);

	// Handle input change
	const handleChange = useCallback((value: string) => {
		textInput.setInput(value);
		adjustHeight();

		// Parse tags and notify parent
		if (onTextChange) {
			const parsedTags = parseTagsFromTextCallback(value);
			onTextChange(value, parsedTags);
		}
	}, [textInput, adjustHeight, onTextChange, parseTagsFromText]);

	// Note: Paste handling is done at the form level in PromptInput component
	return (
		<div className="pktw-flex-1 pktw-min-w-0 pktw-px-3 pktw-border-0">
			<CodeMirror
				ref={codeMirrorRef}
				value={textInput.value}
				height="auto"
				maxHeight="200px"
				minHeight="60px"
				theme="none" // Use custom CSS styling
				extensions={extensions}
				onChange={handleChange}
				placeholder={placeholder}
				onCreateEditor={(view) => {
					console.warn('[CodeMirror] Editor created with', extensions.length, 'extensions');
					extensions.forEach((ext, i) => {
						console.warn(`[CodeMirror] Extension ${i}:`, ext);
					});
				}}
				className={cn(
					'pktw-w-full pktw-text-[15px] pktw-leading-[1.5] pktw-font-medium',
					'pktw-py-3',
					className
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
					// Allow custom keymaps to work
					defaultKeymap: true,
				}}
			/>
		</div>
	);
});
PromptInputBody.displayName = 'PromptInputBody';

