import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useProjectStore } from '@/ui/store/projectStore';
import { useChatViewStore } from '../store/chatViewStore';
import { useMessageStore } from '@/ui/store/messageStore';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { uploadFilesToVault } from '@/core/utils/vault-utils';
import {
	PromptInput,
	PromptInputBody,
	PromptInputAttachments,
	PromptInputFileButton,
	PromptInputSearchButton,
	PromptInputSubmit,
	TokenUsage,
	type PromptInputMessage,
	type TokenUsageInfo,
} from '@/ui/component/prompt-input';
import { LLMModelSelector } from './LLMModelSelector';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { ConversationUpdatedEvent } from '@/core/eventBus';
import { PromptId } from '@/service/prompt/PromptId';
import { cn } from '@/ui/react/lib/utils';
import type { ChatConversation, ChatMessage } from '@/service/chat/types';

interface ChatInputAreaComponentProps {
	onScrollToBottom?: () => void;
}

/**
 * React component for chat input area using new PromptInput components
 */
export const ChatInputAreaComponent: React.FC<ChatInputAreaComponentProps> = ({
	onScrollToBottom,
}) => {
	const { app, manager, eventBus } = useServiceContext();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const activeProject = useProjectStore((state) => state.activeProject);
	const pendingConversation = useChatViewStore((state) => state.pendingConversation);
	const initialSelectedModel = useChatViewStore((state) => state.initialSelectedModel);
	const setInitialSelectedModel = useChatViewStore((state) => state.setInitialSelectedModel);
	const [isSending, setIsSending] = useState(false);
	const [isSearchActive, setIsSearchActive] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	// Handle submit
	const handleSubmit = useCallback(async (message: PromptInputMessage) => {
		const currentInputValue = message.text;
		const currentPendingFiles = message.files;

		// Validate input
		if (!currentInputValue.trim() && currentPendingFiles.length === 0) return;
		if (isSending) return;

		setIsSending(true);
		const messageStore = useMessageStore.getState();

		try {
			// Create conversation if needed
			let conversation = activeConversation;
			if (!conversation && pendingConversation) {
				conversation = await manager.createConversation({
					title: pendingConversation.title,
					project: pendingConversation.project?.meta ?? null,
					modelId: initialSelectedModel?.modelId,
					provider: initialSelectedModel?.provider,
				});
				setInitialSelectedModel(null);

				useProjectStore.getState().updateConversation(conversation);
				eventBus.dispatch(new ConversationUpdatedEvent({ conversation }));
			}
			if (!conversation) {
				console.error('Failed to create conversation');
				setIsSending(false);
				return;
			}

			// Upload files if any
			let uploadedPaths: string[] = [];
			if (currentPendingFiles.length > 0) {
				uploadedPaths = await uploadFilesToVault(app, currentPendingFiles, manager.getSettings().uploadFolder);
			}

			// Create temporary user message
			const modelId = conversation.meta.activeModel || manager.getSettings().defaultModel.modelId;
			const provider = conversation.meta.activeProvider || 'other';
			const tempUserMessage: ChatMessage = {
				id: generateUuidWithoutHyphens(),
				role: 'user',
				content: currentInputValue,
				model: modelId,
				provider: provider,
				createdAtTimestamp: Date.now(),
				createdAtZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
				starred: false,
			};

			// Show user message immediately
			const tempConversation: ChatConversation = {
				...conversation,
				messages: [...conversation.messages, tempUserMessage],
			};
			useChatViewStore.getState().setConversation(tempConversation);
			useProjectStore.getState().updateConversation(tempConversation);

			// Create assistant message ID for streaming
			const assistantMessageId = generateUuidWithoutHyphens();
			messageStore.startStreaming(assistantMessageId, 'assistant');

			// Stream chat
			const stream = manager.streamChat({
				conversation: conversation,
				project: activeProject,
				userContent: currentInputValue,
			});

			let finalConversation: ChatConversation | null = null;
			let finalMessage: ChatMessage | null = null;

			try {
				for await (const event of stream) {
					if (event.type === 'delta') {
						messageStore.appendStreamingDelta(event.text);
						onScrollToBottom?.();
					} else if (event.type === 'complete') {
						if (event.message) {
							finalMessage = event.message;
							messageStore.completeStreaming(event.message);
						}
						if (event.conversation) {
							finalConversation = event.conversation;
						}
						onScrollToBottom?.();
					} else if (event.type === 'error') {
						console.error('Streaming error:', event.error);
						messageStore.errorStreaming();
						throw event.error;
					}
				}
			} catch (error) {
				messageStore.errorStreaming();
				throw error;
			}

			// Get final conversation
			if (!finalConversation) {
				const allConversations = await manager.listConversations(activeProject?.meta);
				finalConversation = allConversations.find(c => c.meta.id === conversation.meta.id) || conversation;
			}

			// Generate title if needed
			if (finalConversation &&
				(finalConversation.meta.title === 'New Conversation' || finalConversation.meta.title === 'new-conversation') &&
				finalConversation.messages.length >= 2) {
				try {
					const messagesForName = finalConversation.messages.slice(0, 4).map(msg => ({
						role: msg.role,
						content: msg.content,
					}));
					const modelId = finalConversation.meta.activeModel || manager.getSettings().defaultModel.modelId;
					const provider = finalConversation.meta.activeProvider || 'openai';
					const result = await manager.chatWithPrompt(
						PromptId.ApplicationGenerateTitle,
						{ messages: messagesForName },
						provider,
						modelId
					);
					const generatedName = result.replace(/^["']|["']$/g, '').slice(0, 50) || 'New Conversation';

					finalConversation = await manager.updateConversationTitle({
						conversation: finalConversation,
						project: activeProject,
						title: generatedName,
					});
				} catch (error) {
					console.warn('Failed to generate conversation name', error);
				}
			}

			if (finalConversation) {
				useChatViewStore.getState().setConversation(finalConversation);
				useProjectStore.getState().updateConversation(finalConversation);
				eventBus.dispatch(new ConversationUpdatedEvent({ conversation: finalConversation }));
			}
		} catch (error) {
			console.error('Error in handleSubmit:', error);
		} finally {
			setIsSending(false);
		}
	}, [activeConversation, activeProject, pendingConversation, manager, eventBus, app, onScrollToBottom, isSending]);

	// Calculate token usage
	const tokenUsage = useMemo<TokenUsageInfo>(() => {
		// Default values (can be configured)
		const totalAvailable = 400000; // Default token limit

		if (!activeConversation) {
			return {
				totalUsed: 0,
				remaining: totalAvailable,
				totalAvailable,
			};
		}

		// Get total token usage from conversation
		const totalUsed = activeConversation.meta.tokenUsageTotal || 0;
		const remaining = Math.max(0, totalAvailable - totalUsed);

		return {
			totalUsed,
			remaining,
			totalAvailable,
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
	const status = isSending ? 'streaming' : 'ready';

	return (
		<div className="pktw-px-6 pktw-pt-5 pktw-pb-6 pktw-border-t pktw-border-border pktw-flex-shrink-0">
			<PromptInput
				className={cn(
					'pktw-flex pktw-flex-col pktw-w-full pktw-border pktw-rounded-lg',
					'pktw-bg-background',
					'pktw-border-[var(--background-modifier-border)]',
					'pktw-shadow-[0_0_0_2px_rgba(59,130,246,0.1)]',
					'focus-within:pktw-border-accent focus-within:pktw-shadow-[0_0_0_4px_rgba(59,130,246,0.4)]'
				)}
				globalDrop
				multiple
				onSubmit={handleSubmit}
			>
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
						<div className="[&_button]:pktw-h-9 [&_button]:pktw-px-2.5 [&_button]:pktw-text-xs [&_button]:pktw-bg-transparent [&_button]:pktw-border-0 [&_button]:pktw-shadow-none [&_button]:pktw-rounded-md [&_button]:hover:pktw-bg-accent [&_button]:hover:pktw-text-accent-foreground">
							<LLMModelSelector />
						</div>
					</div>

					{/* Right side: token usage and submit */}
					<div className="pktw-flex pktw-items-center pktw-gap-1.5">
						<TokenUsage usage={tokenUsage} />
						<PromptInputSubmit status={status} />
					</div>
				</div>
			</PromptInput>
		</div>
	);
};

