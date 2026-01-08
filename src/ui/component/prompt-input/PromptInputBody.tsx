import React, { useRef, useCallback, useState, forwardRef, useEffect, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/ui/react/lib/utils';
import { usePromptInputContext } from './PromptInput';

// TODO: Marker styling temporarily disabled
// const hasMarkers = (text: string): boolean => {
// 	return /@[^@]+@|\/[^\/]+\//.test(text) || /\[\[[^\]]+\]\]/.test(text);
// };

// const MarkerOverlay: React.FC<{ text: string; isEditing: boolean }> = ({ text, isEditing }) => {
// 	return null; // Temporarily disabled
// };

export interface PromptInputBodyProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
	placeholder?: string;
	inputRef?: React.Ref<{ focus: () => void }>;
}

/**
 * Simple textarea component for prompt input (marker styling temporarily disabled)
 */
export const PromptInputBody = forwardRef<HTMLTextAreaElement, PromptInputBodyProps>(({
	className,
	placeholder = 'What would you like to know?',
	inputRef,
	...props
}, ref) => {
	const { textInput, attachments } = usePromptInputContext();
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const [isComposing, setIsComposing] = useState(false);

	// Expose focus method via inputRef
	React.useImperativeHandle(inputRef, () => ({
		focus: () => {
			if (textareaRef.current) {
				textareaRef.current.focus();
			}
		}
	}), []);

	// Merge refs
	React.useImperativeHandle(ref, () => textareaRef.current as HTMLTextAreaElement);

	// Auto-resize textarea
	const adjustHeight = useCallback(() => {
		if (!textareaRef.current) return;
		const textarea = textareaRef.current;
		textarea.style.height = 'auto';
		const newHeight = Math.min(textarea.scrollHeight, 200);
		textarea.style.height = `${newHeight}px`;
	}, []);

	// Handle input change
	const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
		textInput.setInput(e.target.value);
		adjustHeight();
	}, [textInput, adjustHeight]);

	// Handle key down
	const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// Enter to submit (Shift+Enter for new line)
		if (e.key === 'Enter' && !e.shiftKey) {
			// Check if there's an active NavigableMenu (dropdown menu)
			const activeMenu = document.querySelector('[data-item-id]');
			if (activeMenu) {
				// Let the menu handle the Enter key
				return;
			}

			if (isComposing || e.nativeEvent.isComposing) {
				return;
			}

			// Check if submit button is disabled
			const form = e.currentTarget.form;
			const submitButton = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
			if (submitButton?.disabled) {
				return;
			}

			e.preventDefault();
			form?.requestSubmit();
		}

		// Backspace to remove last attachment when textarea is empty
		if (e.key === 'Backspace' && e.currentTarget.value === '' && attachments.files.length > 0) {
			e.preventDefault();
			const lastFile = attachments.files[attachments.files.length - 1];
			if (lastFile) {
				attachments.remove(lastFile.id);
			}
		}
	}, [isComposing, attachments]);

	// Handle paste
	const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
		const items = e.clipboardData?.items;
		if (!items) return;

		const files: File[] = [];
		for (const item of items) {
			if (item.kind === 'file') {
				const file = item.getAsFile();
				if (file) {
					files.push(file);
				}
			}
		}

		if (files.length > 0) {
			e.preventDefault();
			attachments.add(files);
		}
	}, [attachments]);

	// Adjust height when value changes
	React.useEffect(() => {
		adjustHeight();
	}, [textInput.value, adjustHeight]);

	return (
		<div className="pktw-flex-1 pktw-min-w-0 pktw-px-3 pktw-border-0">
			<textarea
				ref={textareaRef}
				value={textInput.value}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				onPaste={handlePaste}
				onCompositionStart={() => setIsComposing(true)}
				onCompositionEnd={() => setIsComposing(false)}
				placeholder={placeholder}
				className={cn(
					'pktw-w-full pktw-resize-none pktw-border-0 pktw-bg-transparent pktw-text-[15px] pktw-leading-[1.5]',
					'pktw-text-gray-900 dark:pktw-text-gray-100 pktw-font-medium pktw-outline-none pktw-font-inherit',
					'placeholder:pktw-text-muted-foreground',
					'pktw-py-3 pktw-min-h-[60px] pktw-max-h-[200px]',
					'focus:pktw-border-0 focus:pktw-outline-none focus:pktw-ring-0 focus-visible:pktw-border-0 focus-visible:pktw-outline-none focus-visible:pktw-ring-0',
					className
				)}
				style={{
					height: 'auto',
					minHeight: '60px',
					border: 'none',
					outline: 'none',
					boxShadow: 'none',
				}}
				{...props}
			/>
		</div>
	);
});
PromptInputBody.displayName = 'PromptInputBody';

