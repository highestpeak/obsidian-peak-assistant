import { useEffect } from 'react';
import { useChatViewStore } from '../store/chatViewStore';

export function useInputKeyboard(
	textareaRef: React.RefObject<HTMLTextAreaElement>,
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
			const isModKey = e.metaKey || e.ctrlKey;

			// Cmd/Ctrl+K: focus input
			if (isModKey && (e.key === 'k' || e.key === 'K')) {
				if (textareaRef.current && document.activeElement !== textareaRef.current) {
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
					setTimeout(() => textareaRef.current?.focus(), 100);
					return false;
				}
			}

			// Cmd/Ctrl+Enter: line break
			if (isModKey && e.key === 'Enter' && textareaRef.current) {
				e.preventDefault();
				e.stopPropagation();
				const ta = textareaRef.current;
				const { selectionStart, selectionEnd, value } = ta;
				ta.value = value.substring(0, selectionStart) + '\n' + value.substring(selectionEnd);
				ta.selectionStart = ta.selectionEnd = selectionStart + 1;
				ta.dispatchEvent(new Event('input', { bubbles: true }));
			}

			// Cmd/Ctrl+A: select all
			if (isModKey && (e.key === 'a' || e.key === 'A') && textareaRef.current) {
				e.preventDefault();
				e.stopPropagation();
				textareaRef.current.select();
			}

			// Ctrl+ArrowUp: input history up (#81)
			if (isModKey && e.key === 'ArrowUp' && textareaRef.current) {
				e.preventDefault();
				const store = useChatViewStore.getState();
				if (store.historyIndex === -1) {
					useChatViewStore.setState({ draftInput: textareaRef.current.value });
				}
				const text = store.navigateHistory('up');
				if (text !== null) {
					textareaRef.current.value = text;
					textareaRef.current.dispatchEvent(new Event('input', { bubbles: true }));
				}
			}

			// Ctrl+ArrowDown: input history down (#81)
			if (isModKey && e.key === 'ArrowDown' && textareaRef.current) {
				e.preventDefault();
				const text = useChatViewStore.getState().navigateHistory('down');
				if (text !== null) {
					textareaRef.current.value = text;
					textareaRef.current.dispatchEvent(new Event('input', { bubbles: true }));
				}
			}
		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => window.removeEventListener('keydown', handleKeyDown, true);
	}, [textareaRef]);
}
