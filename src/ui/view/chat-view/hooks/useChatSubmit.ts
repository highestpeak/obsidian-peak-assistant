import { useCallback, useRef } from 'react';
import { ChatConversation, ChatMessage } from '@/service/chat/types';
import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { uploadFilesToVault } from '@/core/utils/vault-utils';
import { useMessageStore } from '@/ui/store/messageStore';
import { useChatViewStore } from '../store/chatViewStore';
import { useProjectStore } from '@/ui/store/projectStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { ConversationUpdatedEvent } from '@/core/eventBus';
import { PromptId } from '@/service/prompt/PromptId';
import type { PromptInputMessage } from '@/ui/component/ai-elements';

interface UseChatSubmitOptions {
	onScrollToBottom?: () => void;
	onSendingChange?: (isSending: boolean) => void;
}

/**
 * Hook for handling chat message submission
 */
export function useChatSubmit({ onScrollToBottom, onSendingChange }: UseChatSubmitOptions = {}) {
	const { app, manager, eventBus } = useServiceContext();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const activeProject = useProjectStore((state) => state.activeProject);
	const pendingConversation = useChatViewStore((state) => state.pendingConversation);
	const isSendingRef = useRef(false);

	const handleSubmit = useCallback(
		async (message: PromptInputMessage) => {
			const hasText = Boolean(message.text?.trim());
			const hasAttachments = Boolean(message.files?.length);

			if (!(hasText || hasAttachments)) return;
			if (isSendingRef.current) return;

			isSendingRef.current = true;
			onSendingChange?.(true);

			const messageStore = useMessageStore.getState();
			const currentActiveConversation = activeConversation;
			const currentActiveProject = activeProject;
			const currentPendingConversation = pendingConversation;

			try {
				// Create conversation if needed
				let conversation = currentActiveConversation;
				if (!conversation && currentPendingConversation) {
					conversation = await manager.createConversation({
						title: currentPendingConversation.title,
						project: currentPendingConversation.project?.meta ?? null,
					});
					useProjectStore.getState().updateConversation(conversation);
					eventBus.dispatch(new ConversationUpdatedEvent({ conversation }));
				}
				if (!conversation) {
					console.error('Failed to create conversation');
					isSendingRef.current = false;
					onSendingChange?.(false);
					return;
				}

				// Upload files if any
				let uploadedPaths: string[] = [];
				if (message.files && message.files.length > 0) {
					// Convert FileUIPart to File objects
					const files: File[] = [];
					for (const filePart of message.files) {
						if (filePart.url) {
							try {
								// Convert data URL or blob URL to File
								const response = await fetch(filePart.url);
								const blob = await response.blob();
								const file = new File([blob], filePart.filename || 'file', {
									type: filePart.mediaType || blob.type,
								});
								files.push(file);
							} catch (error) {
								console.error('Failed to convert file:', error);
							}
						}
					}
					if (files.length > 0) {
						uploadedPaths = await uploadFilesToVault(
							app,
							files,
							manager.getSettings().uploadFolder
						);
					}
				}

				const inputText = message.text?.trim() || '';

				// Create temporary user message
				const defaultModel = manager.getSettings().defaultModel;
				const modelId = conversation.meta.activeModel || defaultModel.modelId;
				const provider = conversation.meta.activeProvider || defaultModel.provider;
				const tempUserMessage: ChatMessage = {
					id: generateUuidWithoutHyphens(),
					role: 'user',
					content: inputText,
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
				// Note: File attachments are handled via resources in the conversation
				const stream = manager.streamChat({
					conversation: conversation,
					project: currentActiveProject,
					userContent: inputText,
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
					const allConversations = await manager.listConversations(currentActiveProject?.meta);
					finalConversation =
						allConversations.find((c) => c.meta.id === conversation.meta.id) || conversation;
				}

				// Generate title if needed
				if (
					finalConversation &&
					(finalConversation.meta.title === 'New Conversation' ||
						finalConversation.meta.title === 'new-conversation') &&
					finalConversation.messages.length >= 2
				) {
					try {
						const messagesForName = finalConversation.messages.slice(0, 4).map((msg) => ({
							role: msg.role,
							content: msg.content,
						}));
						const defaultModel = manager.getSettings().defaultModel;
						const modelId =
							finalConversation.meta.activeModel || defaultModel.modelId;
						const provider = finalConversation.meta.activeProvider || defaultModel.provider;
						const result = await manager.chatWithPrompt(
							PromptId.ApplicationGenerateTitle,
							{ messages: messagesForName },
							provider,
							modelId
						);
						const generatedName = result.replace(/^["']|["']$/g, '').slice(0, 50) || 'New Conversation';

						finalConversation = await manager.updateConversationTitle({
							conversation: finalConversation,
							project: currentActiveProject,
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
				isSendingRef.current = false;
				onSendingChange?.(false);
			}
		},
		[activeConversation, activeProject, pendingConversation, manager, eventBus, onScrollToBottom, app, onSendingChange]
	);

	return { handleSubmit };
}

