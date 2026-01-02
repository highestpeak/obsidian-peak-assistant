import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useProjectStore } from '@/ui/store/projectStore';
import { useChatViewStore } from '../store/chatViewStore';
import { useMessageStore } from '@/ui/store/messageStore';
import {
	PromptInput,
	PromptInputBody,
	PromptInputAttachments,
	PromptInputFileButton,
	PromptInputSearchButton,
	PromptInputSubmit,
	TokenUsage,
	usePromptInputContext,
	type PromptInputMessage,
	type TokenUsageInfo,
} from '@/ui/component/prompt-input';
import { LLMModelSelector } from './LLMModelSelector';
import { LLMOutputControlSettingsPopover } from './LLMOutputControlSettings';
import { cn } from '@/ui/react/lib/utils';
import {
	OpenIn,
	OpenInTrigger,
	OpenInContent,
	OpenInChatGPT,
	OpenInClaude,
	OpenInT3,
	OpenInScira,
	OpenInv0,
	OpenInCursor,
} from '@/ui/component/ai-elements';
import type { ChatConversation } from '@/service/chat/types';
import { useChatSubmit } from '../hooks/useChatSubmit';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { Switch } from '@/ui/component/shared-ui/switch';
import { Upload, FileText } from 'lucide-react';

interface ChatInputAreaComponentProps {
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

/**
 * Internal component for OpenIn button that needs access to input context
 */
const OpenInButton: React.FC = () => {
	const activeConversation = useProjectStore((state) => state.activeConversation);

	// Build query from all user messages in the conversation
	const conversationQuery = React.useMemo(() => {
		if (!activeConversation || !activeConversation.messages || activeConversation.messages.length === 0) {
			return '';
		}
		// Get all user messages and join them
		const userMessages = activeConversation.messages
			.filter(msg => msg.role === 'user')
			.map(msg => msg.content)
			.join('\n\n');
		return userMessages;
	}, [activeConversation]);

	if (!conversationQuery.trim()) return null;

	return (
		<OpenIn query={conversationQuery}>
			<OpenInTrigger>
				<button
					type="button"
					className="pktw-h-9 pktw-px-2.5 pktw-text-xs pktw-bg-transparent pktw-border-0 pktw-shadow-none pktw-rounded-md hover:pktw-bg-accent hover:pktw-text-accent-foreground pktw-flex pktw-items-center pktw-gap-1"
				>
					Open in chat
					<svg className="pktw-size-3" fill="none" viewBox="0 0 15 15">
						<path d="M4.5 6L7.5 9L10.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
				</button>
			</OpenInTrigger>
			<OpenInContent>
				<OpenInChatGPT />
				<OpenInClaude />
				<OpenInT3 />
				<OpenInScira />
				<OpenInv0 />
				<OpenInCursor />
			</OpenInContent>
		</OpenIn>
	);
};

export const ChatInputAreaComponent: React.FC<ChatInputAreaComponentProps> = ({
	onScrollToBottom,
}) => {
	const { manager } = useServiceContext();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const activeProject = useProjectStore((state) => state.activeProject);
	const [isSending, setIsSending] = useState(false);
	const [isSearchActive, setIsSearchActive] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const { submitMessage, cancelStream } = useChatSubmit();

	// Get effective attachment handling mode (conversation override > global default)
	const attachmentHandlingMode = useMemo(() => {
		return activeConversation?.meta.attachmentHandlingOverride ?? manager.getSettings().attachmentHandlingDefault ?? 'degrade_to_text';
	}, [activeConversation?.meta.attachmentHandlingOverride, manager]);

	// Handle attachment mode toggle
	const handleAttachmentModeToggle = useCallback(async (value: boolean) => {
		if (!activeConversation) return;
		const newMode: 'direct' | 'degrade_to_text' = value ? 'direct' : 'degrade_to_text';
		await manager.updateConversationAttachmentHandling({
			conversationId: activeConversation.meta.id,
			attachmentHandlingOverride: newMode,
		});
	}, [activeConversation, manager]);

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

	// Handle keyboard shortcuts (Cmd/Ctrl+K to focus input)
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const isModKey = e.metaKey || e.ctrlKey;
			const isKKey = e.key === 'k' || e.key === 'K' || e.keyCode === 75;

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
		};

		window.addEventListener('keydown', handleKeyDown, true);
		return () => {
			window.removeEventListener('keydown', handleKeyDown, true);
		};
	}, []);

	const hasMessages = activeConversation && activeConversation.messages.length > 0;
	const placeholder = hasMessages ? 'Ask anything' : 'Ready when you are.';
	
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
	const status = isStreaming ? 'streaming' : (isSending ? 'submitted' : 'ready');

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
				onSubmit={handleSubmit}
			>
				{/* Clear input handler */}
				<InputClearHandler isSending={isSending} />

				{/* Attachments display */}
				<PromptInputAttachments />

				{/* Textarea */}
				<PromptInputBody
					ref={textareaRef}
					placeholder={placeholder}
				/>

				{/* Footer with tools and submit */}
				<div className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-1.5 pktw-px-3 pktw-py-2">
					{/* Left side: tools */}
					<div className="pktw-flex pktw-items-center pktw-gap-0.5">
						<PromptInputFileButton />
						<PromptInputSearchButton
							active={isSearchActive}
							onClick={() => setIsSearchActive(!isSearchActive)}
						/>
						{/* Attachment handling mode toggle */}
						{activeConversation && (
							<div className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-2 pktw-py-1 pktw-rounded-md hover:pktw-bg-accent/50 pktw-transition-colors" title={attachmentHandlingMode === 'direct' ? 'Direct mode: Send attachments directly to model' : 'Degrade mode: Convert attachments to text summaries'}>
								{attachmentHandlingMode === 'direct' ? (
									<Upload className="pktw-w-3.5 pktw-h-3.5 pktw-text-blue-500" />
								) : (
									<FileText className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground" />
								)}
								<Switch
									checked={attachmentHandlingMode === 'direct'}
									onChange={handleAttachmentModeToggle}
									className="pktw-scale-75"
								/>
							</div>
						)}
						<div className="[&_button]:pktw-h-9 [&_button]:pktw-px-2.5 [&_button]:pktw-text-xs [&_button]:pktw-bg-transparent [&_button]:pktw-border-0 [&_button]:pktw-shadow-none [&_button]:pktw-rounded-md [&_button]:hover:pktw-bg-accent [&_button]:hover:pktw-text-accent-foreground">
							<LLMModelSelector />
						</div>
						<LLMOutputControlSettingsPopover />
						<OpenInButton />
					</div>

					{/* Right side: token usage and submit */}
					<div className="pktw-flex pktw-items-center pktw-gap-1.5">
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

