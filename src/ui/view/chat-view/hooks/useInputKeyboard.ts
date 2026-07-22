import { useEffect } from 'react';
import { useChatViewStore } from '../store/chatViewStore';
import type { PromptInputEditorHandle } from '@/ui/component/prompt-input/PromptInputBody';

type KeyboardTarget = HTMLTextAreaElement | PromptInputEditorHandle;

function isPromptEditor(target: KeyboardTarget): target is PromptInputEditorHandle {
	return 'getValue' in target && 'setValue' in target && 'insertText' in target;
}

function isFocused(target: KeyboardTarget): boolean {
	if (isPromptEditor(target)) return target.isFocused();
	// Detached-window safe: consult THIS textarea's own document, not the
	// global one. In a popout the global `document` belongs to the workspace
	// tab and never matches the popout's activeElement.
	return target.ownerDocument.activeElement === target;
}

function getValue(target: KeyboardTarget): string {
	if (isPromptEditor(target)) return target.getValue();
	return target.value;
}

function setValue(target: KeyboardTarget, value: string) {
	if (isPromptEditor(target)) {
		target.setValue(value);
		return;
	}
	target.value = value;
	target.dispatchEvent(new Event('input', { bubbles: true }));
}

function insertText(target: KeyboardTarget, text: string) {
	if (isPromptEditor(target)) {
		target.insertText(text);
		return;
	}
	const { selectionStart, selectionEnd, value } = target;
	target.value = value.substring(0, selectionStart) + text + value.substring(selectionEnd);
	target.selectionStart = target.selectionEnd = selectionStart + text.length;
	target.dispatchEvent(new Event('input', { bubbles: true }));
}

function selectAll(target: KeyboardTarget) {
	if (isPromptEditor(target)) {
		target.select();
		return;
	}
	target.select();
}

export function useInputKeyboard(
	textareaRef: React.RefObject<KeyboardTarget>,
	conversationId: string | null,
) {
	// Refocus textarea on conversation change
	useEffect(() => {
		if (conversationId) {
			setTimeout(() => textareaRef.current?.focus(), 100);
		}
	}, [conversationId]);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const target = textareaRef.current;
			const isModKey = e.metaKey || e.ctrlKey;

			// Cmd/Ctrl+K: focus input
			if (isModKey && (e.key === 'k' || e.key === 'K')) {
				if (target && !isFocused(target)) {
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
					setTimeout(() => target.focus(), 100);
					return false;
				}
			}

			// Cmd/Ctrl+Enter: line break
			if (isModKey && e.key === 'Enter' && target && isFocused(target)) {
				e.preventDefault();
				e.stopPropagation();
				insertText(target, '\n');
			}

			// Cmd/Ctrl+A: select all
			if (isModKey && (e.key === 'a' || e.key === 'A') && target && isFocused(target)) {
				e.preventDefault();
				e.stopPropagation();
				selectAll(target);
			}

			// Ctrl+ArrowUp: input history up (#81)
			if (isModKey && e.key === 'ArrowUp' && target && isFocused(target)) {
				e.preventDefault();
				const store = useChatViewStore.getState();
				if (store.historyIndex === -1) {
					useChatViewStore.setState({ draftInput: getValue(target) });
				}
				const text = store.navigateHistory('up');
				if (text !== null) {
					setValue(target, text);
				}
			}

			// Ctrl+ArrowDown: input history down (#81)
			if (isModKey && e.key === 'ArrowDown' && target && isFocused(target)) {
				e.preventDefault();
				const text = useChatViewStore.getState().navigateHistory('down');
				if (text !== null) {
					setValue(target, text);
				}
			}
		};

		// Detached-window safe: derive the target window from the editor's own
		// DOM. Retry once after mount because refs populate after commit; if
		// the ref is somehow still null at that point we fall through to the
		// global window (workspace-tab default).
		const target = textareaRef.current;
		const rootEl = target && isPromptEditor(target)
			? target.getRootElement()
			: (target as HTMLTextAreaElement | null);
		const win = (rootEl?.ownerDocument?.defaultView as (Window & typeof globalThis) | null) ?? window;
		win.addEventListener('keydown', handleKeyDown, true);
		return () => win.removeEventListener('keydown', handleKeyDown, true);
	}, [textareaRef]);
}
