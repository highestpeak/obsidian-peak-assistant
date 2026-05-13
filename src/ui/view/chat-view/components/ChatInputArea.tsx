import React, { useRef } from 'react';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import {
	PromptInput,
	PromptInputBody,
	PromptInputAttachments,
	usePromptInputContext,
	type PromptInputEditorHandle,
} from '@/ui/component/prompt-input';
import { cn } from '@/ui/react/lib/utils';
import { useChatViewStore } from '../store/chatViewStore';
import { useContextSearch } from '../hooks/useContextSearch';
import { useInputKeyboard } from '../hooks/useInputKeyboard';
import { useInputSubmit } from '../hooks/useInputSubmit';
import { PromptEnhanceSuggestion } from './PromptEnhanceSuggestion';
import { InputToolbar } from './InputToolbar';

// ---------------------------------------------------------------------------
// Internal helpers (must be children of PromptInput to access context)
// ---------------------------------------------------------------------------

const InputClearHandler: React.FC<{ isSending: boolean }> = ({ isSending }) => {
	const inputContext = usePromptInputContext();
	const prevRef = React.useRef(isSending);
	React.useEffect(() => {
		if (!prevRef.current && isSending) {
			inputContext.textInput.clear();
			inputContext.attachments.clear();
		}
		prevRef.current = isSending;
	}, [isSending, inputContext]);
	return null;
};

const InsertToInputHandler: React.FC = () => {
	const { textInput, focusInput } = usePromptInputContext();
	React.useEffect(() => {
		const fn = (text: string) => {
			const current = textInput.value;
			const prefix = current && !current.endsWith('\n') ? '\n' : '';
			textInput.setInput(current + prefix + text);
			focusInput();
		};
		useChatViewStore.getState().setInsertToInput(fn);
		return () => useChatViewStore.getState().setInsertToInput(null);
	}, [textInput, focusInput]);
	return null;
};

// ---------------------------------------------------------------------------
// ChatInputAreaComponent — thin composition layer
// ---------------------------------------------------------------------------

export const ChatInputAreaComponent: React.FC = () => {
	const store = useChatViewStore();
	const activeConversation = useChatDataStore((s) => s.activeConversation);

	const textareaRef = useRef<PromptInputEditorHandle>(null);
	const inputFocusRef = useRef<{ focus: () => void } | null>(null);

	const {
		isSending,
		isStreaming,
		status,
		placeholder,
		handleSubmit,
		handleCancelStream,
		handleTextChange,
	} = useInputSubmit();

	const { menuContextItems, folderStack, handleSearchContext, handleSearchPrompts, handleMenuSelect, handleFolderUp } = useContextSearch();
	useInputKeyboard(textareaRef, activeConversation?.meta?.id ?? null);

	return (
		<div className="pktw-relative pktw-px-6 pktw-pt-2 pktw-pb-6 pktw-border-t pktw-border-border pktw-flex-shrink-0">
			<PromptInput
				className={cn(
					'pktw-flex pktw-flex-col pktw-w-full pktw-border pktw-rounded-lg',
					'pktw-border-[var(--background-modifier-border)]',
					'pktw-shadow-[0_0_0_2px_rgba(59,130,246,0.1)]',
					'focus-within:pktw-border-accent focus-within:pktw-shadow-[0_0_0_4px_rgba(59,130,246,0.4)]',
				)}
				globalDrop
				multiple
				inputFocusRef={inputFocusRef}
				onSubmit={handleSubmit}
				contextItems={menuContextItems}
				promptItems={store.promptsSuggest}
				onLoadContextItems={handleSearchContext}
				onLoadPromptItems={handleSearchPrompts}
				onMenuItemSelect={handleMenuSelect}
				folderStack={folderStack}
				onFolderUp={handleFolderUp}
				onTextChange={handleTextChange}
			>
				<InputClearHandler isSending={isSending} />
				<InsertToInputHandler />
				<PromptInputAttachments />
				<PromptInputBody ref={textareaRef} inputRef={inputFocusRef} placeholder={placeholder} />
				<PromptEnhanceSuggestion />

				{/* Footer: tools + submit */}
				<InputToolbar
					status={status}
					isStreaming={isStreaming}
					onCancel={handleCancelStream}
				/>
			</PromptInput>
		</div>
	);
};
