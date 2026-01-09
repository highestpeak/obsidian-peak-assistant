import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useProjectStore } from '@/ui/store/projectStore';
import { useMessageStore } from '@/ui/view/chat-view/store/messageStore';
import {
	PromptInput,
	PromptInputBody,
	PromptInputAttachments,
	PromptInputFileButton,
	PromptInputSearchButton,
	PromptInputSubmit,
	PromptInputMenu,
	TokenUsage,
	usePromptInputContext,
	type PromptInputMessage,
	type TokenUsageInfo,
} from '@/ui/component/prompt-input';
import { LLMModelSelector } from '../../../component/prompt-input/LLMModelSelector';
import { LLMOutputControlSettingsPopover } from '../../../component/prompt-input/LLMOutputControlSettings';
import { ToolButton } from '@/ui/component/prompt-input';
import { ModeSelector } from '../../../component/prompt-input/ModeSelector';
import { cn } from '@/ui/react/lib/utils';
import { useChatSubmit } from '../hooks/useChatSubmit';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { ExternalPromptInfo } from '@/ui/component/prompt-input/menu/PromptMenu';

interface ChatInputAreaComponentProps {
	prompts?: ExternalPromptInfo[];
	onScrollToBottom?: () => void;
}

/**
 * Internal component to clear input immediately when sending starts
 */
const InputClearHandler: React.FC<{ isSending: boolean }> = ({ isSending }) => {
	const inputContext = usePromptInputContext();
	const prevIsSendingRef = React.useRef(isSending);

	React.useEffect(() => {
		// Clear input immediately when sending starts (changes from false to true)
		if (!prevIsSendingRef.current && isSending) {
			inputContext.textInput.clear();
			inputContext.attachments.clear();
		}
		prevIsSendingRef.current = isSending;
	}, [isSending, inputContext]);

	return null;
};


export const ChatInputAreaComponent: React.FC<ChatInputAreaComponentProps> = ({
	prompts,
	onScrollToBottom,
}) => {
	const { manager } = useServiceContext();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const activeProject = useProjectStore((state) => state.activeProject);
	const [isSending, setIsSending] = useState(false);
	const [isSearchActive, setIsSearchActive] = useState(false);
	const [searchProvider, setSearchProvider] = useState<'local' | 'perplexity' | 'model-builtin'>('local');
	const [enableWebSearch, setEnableWebSearch] = useState(false);
	const [enableTwitterSearch, setEnableTwitterSearch] = useState(true);
	const [enableRedditSearch, setEnableRedditSearch] = useState(true);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const inputFocusRef = useRef<{ focus: () => void } | null>(null);

	const { submitMessage, cancelStream } = useChatSubmit();

	// Handle submit
	const handleSubmit = useCallback(async (message: PromptInputMessage) => {
		const currentInputValue = message.text;
		const currentPendingFiles = message.files;

		// Validate input
		if (!currentInputValue.trim() && currentPendingFiles.length === 0) return;
		if (isSending) return;

		setIsSending(true);
		try {
			await submitMessage({
				text: currentInputValue,
				files: currentPendingFiles,
				conversation: activeConversation,
				project: activeProject,
				onScrollToBottom,
			});
		} catch (error) {
			console.error('[ChatInputAreaComponent] Error in handleSubmit:', error);
			// Error handling is done inside submitMessage
		} finally {
			setIsSending(false);
		}
	}, [submitMessage, activeConversation, activeProject, onScrollToBottom, isSending]);

	// Calculate total token usage from all messages
	const tokenUsage = useMemo<TokenUsageInfo>(() => {
		if (!activeConversation || !activeConversation.messages || activeConversation.messages.length === 0) {
			return {
				totalUsed: 0,
			};
		}

		// Sum up token usage from all messages
		const totalUsed = activeConversation.messages.reduce((sum, msg) => {
			if (!msg.tokenUsage) return sum;
			const usage = msg.tokenUsage as any;
			const tokens = usage.totalTokens ?? usage.total_tokens ??
				((usage.promptTokens ?? usage.prompt_tokens ?? 0) + (usage.completionTokens ?? usage.completion_tokens ?? 0));
			return sum + (tokens || 0);
		}, 0);

		return {
			totalUsed,
		};
	}, [activeConversation]);

	// Clear input when conversation changes
	useEffect(() => {
		if (textareaRef.current) {
			setTimeout(() => {
				textareaRef.current?.focus();
			}, 100);
		}
	}, [activeConversation?.meta.id]);

	// Handle keyboard shortcuts (Cmd/Ctrl+K to focus input, Cmd/Ctrl+Enter for line break, Cmd/Ctrl+A for select all)
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const isModKey = e.metaKey || e.ctrlKey;
			const isKKey = e.key === 'k' || e.key === 'K' || e.keyCode === 75;
			const isEnterKey = e.key === 'Enter';
			const isAKey = e.key === 'a' || e.key === 'A' || e.keyCode === 65;

			// Cmd/Ctrl+K to focus input
			if (isModKey && isKKey) {
				const activeElement = document.activeElement;
				if (textareaRef.current && activeElement !== textareaRef.current) {
					e.preventDefault();
					e.stopPropagation();
					e.stopImmediatePropagation();
					setTimeout(() => {
						textareaRef.current?.focus();
					}, 100);
					return false;
				}
			}

			// Cmd/Ctrl+Enter for line break in textarea
			if (isModKey && isEnterKey && textareaRef.current) {
				e.preventDefault();
				e.stopPropagation();

				const textarea = textareaRef.current;
				const start = textarea.selectionStart;
				const end = textarea.selectionEnd;
				const value = textarea.value;

				// Insert line break at cursor position
				textarea.value = value.substring(0, start) + '\n' + value.substring(end);
				textarea.selectionStart = textarea.selectionEnd = start + 1;

				// Trigger input event to update any reactive state
				textarea.dispatchEvent(new Event('input', { bubbles: true }));
			}

			// Cmd/Ctrl+A for select all in textarea
			if (isModKey && isAKey && textareaRef.current) {
				e.preventDefault();
				e.stopPropagation();

				const textarea = textareaRef.current;
				textarea.select();
			}
		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => {
			window.removeEventListener('keydown', handleKeyDown, true);
		};
	}, []);

	const hasMessages = activeConversation && activeConversation.messages.length > 0;
	const placeholder = (hasMessages ? '' : 'Type your message here...\n')
		+ '@ or [[]] for context. / for prompts. ⌘ ↩︎ for a line break.';

	// Check if streaming is active
	const isStreaming = useMessageStore((state) => state.streamingMessageId !== null);

	// Handle cancel stream
	const handleCancelStream = useCallback(async () => {
		if (isStreaming) {
			console.log('[ChatInputArea] Canceling stream');
			await cancelStream();
			// Note: setIsSending(false) will be called in handleSubmit's finally block
			// But we set it here immediately for better UX
			setIsSending(false);
		}
	}, [isStreaming, cancelStream]);


	// Button status: 'ready' (blue + Enter) when not sending, 'streaming' when streaming, 'submitted' when sending but not streaming
	const status: 'ready' | 'submitted' | 'streaming' | 'error' = isStreaming ? 'streaming' : (isSending ? 'submitted' : 'ready');

	return (
		<div className="pktw-px-6 pktw-pt-5 pktw-pb-6 pktw-border-t pktw-border-border pktw-flex-shrink-0">
			<PromptInput
				className={cn(
					'pktw-flex pktw-flex-col pktw-w-full pktw-border pktw-rounded-lg',
					'pktw-border-[var(--background-modifier-border)]',
					'pktw-shadow-[0_0_0_2px_rgba(59,130,246,0.1)]',
					'focus-within:pktw-border-accent focus-within:pktw-shadow-[0_0_0_4px_rgba(59,130,246,0.4)]'
				)}
				globalDrop
				multiple
				inputFocusRef={inputFocusRef}
				onSubmit={handleSubmit}
			>
				{/* Clear input handler */}
				<InputClearHandler isSending={isSending} />

				{/* Menu handler */}
				<PromptInputMenu textareaRef={textareaRef} prompts={prompts} />

				{/* Attachments display */}
				<PromptInputAttachments />

				{/* Textarea */}
				<PromptInputBody
					ref={textareaRef}
					inputRef={inputFocusRef}
					placeholder={placeholder}
				/>

				{/* Footer with tools and submit */}
				<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-1.5 pktw-px-3 pktw-py-2">
					{/* Left side: tools */}
					<div className="pktw-flex pktw-items-center pktw-gap-0.5">
						<PromptInputFileButton />
						<PromptInputSearchButton
							active={isSearchActive}
							searchProvider={searchProvider}
							enableWebSearch={enableWebSearch}
							enableTwitterSearch={enableTwitterSearch}
							enableRedditSearch={enableRedditSearch}
							onToggleActive={() => setIsSearchActive(!isSearchActive)}
							onChangeProvider={setSearchProvider}
							onToggleWebSearch={setEnableWebSearch}
							onToggleTwitterSearch={setEnableTwitterSearch}
							onToggleRedditSearch={setEnableRedditSearch}
						/>
						<LLMOutputControlSettingsPopover />
						<ToolButton />
					</div>

					{/* Right side: mode selector, model selector, token usage and submit */}
					<div className="pktw-flex pktw-items-center pktw-gap-1.5">
						<ModeSelector />
						<LLMModelSelector />
						<TokenUsage usage={tokenUsage} conversation={activeConversation} />
						<PromptInputSubmit
							status={status}
							onCancel={isStreaming ? handleCancelStream : undefined}
						/>
					</div>
				</div>
			</PromptInput>
		</div>
	);
};

