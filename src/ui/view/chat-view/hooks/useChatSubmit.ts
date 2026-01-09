import { useCallback, useRef } from 'react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useChatViewStore } from '../store/chatViewStore';
import { useProjectStore } from '@/ui/store/projectStore';
import { createChatMessage } from '@/service/chat/utils/chat-message-builder';
import { useStreamChat } from './useStreamChat';
import type { ChatConversation, ChatMessage, ChatProject } from '@/service/chat/types';

export interface ChatSubmitOptions {
	text: string;
	files: File[];
	conversation: ChatConversation | null;
	project: ChatProject | null;
	onScrollToBottom?: () => void;
}

/**
 * Hook for handling chat message submission.
 * Handles conversation creation, file upload, and message streaming.
 */
export function useChatSubmit() {
	const { app, manager } = useServiceContext();
	const { streamChat, updateConv } = useStreamChat();

	// AbortController for canceling streaming
	const abortControllerRef = useRef<AbortController | null>(null);

	/**
	 * Ensure conversation exists, create if needed.
	 * Use primitive values as dependencies to avoid object reference issues.
	 * Get values directly from store (no subscription) since we use getState() inside callbacks.
	 */
	const activeConversationId = useProjectStore.getState().activeConversation?.meta.id;
	const pendingConversationTitle = useChatViewStore.getState().pendingConversation?.title;
	const pendingProjectId = useChatViewStore.getState().pendingConversation?.project?.meta?.id;
	const initialModelId = useChatViewStore.getState().initialSelectedModel?.modelId;
	const initialProvider = useChatViewStore.getState().initialSelectedModel?.provider;
	
	const ensureConversation = useCallback(async (): Promise<ChatConversation | null> => {
		// Get latest values from store to avoid stale closure
		const latestActiveConversation = useProjectStore.getState().activeConversation;
		const latestPendingConversation = useChatViewStore.getState().pendingConversation;
		const latestInitialSelectedModel = useChatViewStore.getState().initialSelectedModel;
		
		let conversation = latestActiveConversation || null;
		if (!conversation && latestPendingConversation) {
			console.log('[useChatSubmit] creating conversation', latestPendingConversation, latestInitialSelectedModel);
			conversation = await manager.createConversation({
				title: latestPendingConversation.title,
				project: latestPendingConversation.project?.meta ?? null,
				modelId: latestInitialSelectedModel?.modelId,
				provider: latestInitialSelectedModel?.provider,
			});
			useChatViewStore.getState().setInitialSelectedModel(null);
			updateConv(conversation);
		}
		if (!conversation) {
			console.error('[useChatSubmit] Failed to create conversation');
		}
		return conversation;
	}, [activeConversationId, pendingConversationTitle, pendingProjectId, initialModelId, initialProvider]);


	/**
	 * Create temporary user message for immediate UI display.
	 * Note: manager is intentionally omitted from dependencies as it's a stable reference from context.
	 */
	const createUserMessage = useCallback((
		conversation: ChatConversation,
		content: string
	): ChatMessage => {
		const modelId = conversation.meta.activeModel || manager.getSettings().defaultModel.modelId;
		const provider = conversation.meta.activeProvider || 'other';
		const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
		return createChatMessage('user', content, modelId, provider, timezone);
	}, []);

	/**
	 * Cancel the current streaming operation.
	 * Saves any partial content that has been generated.
	 */
	const cancelStream = useCallback(async (): Promise<void> => {
		if (abortControllerRef.current) {
			console.log('[useChatSubmit] Canceling stream');
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
	}, []);

	/**
	 * Submit a chat message and handle the complete flow.
	 */
	const submitMessage = useCallback(async (options: ChatSubmitOptions): Promise<void> => {
		const { text, files, conversation: inputConversation, project, onScrollToBottom } = options;

		// Ensure conversation exists
		const conversation = inputConversation || await ensureConversation();
		if (!conversation) {
			console.error('[useChatSubmit] Failed to ensure conversation');
			return;
		}
		console.debug('[useChatSubmit] conversation:', conversation);

		// Create user message
		const userMessage = createUserMessage(conversation, text);
		console.debug('[useChatSubmit] userMessage:', userMessage);
		// Upload files and create resource references if any. no summary will be generated until start streaming.
		const resources = files.length > 0
			? await manager.uploadFilesAndCreateResources(files)
			: [];
		console.debug('[useChatSubmit] resources:', resources);
		// Add resources to user message if any
		if (resources.length > 0) {
			userMessage.resources = resources;
		}

		await manager.addMessage({
			conversationId: conversation.meta.id,
			message: userMessage,
			model: userMessage.model,
			provider: userMessage.provider,
			usage: { inputTokens: -1, outputTokens: -1, totalTokens: -1 },
		});
		console.debug('[useChatSubmit] added user message:', userMessage);

		// Show user message immediately in UI using tempConversation
		// We already have the userMessage object and know it's been saved, so we can construct
		// the conversation directly without reloading from storage (faster for better UX)
		const conversationWithUserMessage: ChatConversation = {
			...conversation,
			messages: [...(conversation.messages || []), userMessage],
			meta: {
				...conversation.meta,
				updatedAtTimestamp: Date.now(), // Update timestamp since we just added a message
			},
		};
		console.debug('[useChatSubmit] Updating conversation with user message:', conversationWithUserMessage.messages.length, 'messages');
		updateConv(conversationWithUserMessage);

		// Create new AbortController for this stream
		abortControllerRef.current = new AbortController();

		// Stream chat (use conversationWithUserMessage which includes the user message)
		// Note: The userMessage already saved above includes resources, so we don't need to pass attachments
		// to streamChat since the resources are already in the conversation messages
		console.debug('[useChatSubmit] streaming chat started');
		const streamResult = await streamChat({
			conversation: conversationWithUserMessage, // Use conversation with user message
			project: project,
			userContent: text,
			attachments: resources.map(resource => resource.source),
			onScrollToBottom,
			abortSignal: abortControllerRef.current.signal,
		});
		console.debug('[useChatSubmit] streaming chat completed', streamResult);

		// Clear abort controller
		abortControllerRef.current = null;

		// Always save assistant message, even if streaming was interrupted
		// If streaming was interrupted, finalMessage might be null, but we should still
		// save any partial content from the streaming state
		if (streamResult.finalMessage) {
			console.debug('[useChatSubmit] Saving assistant message:', streamResult.finalMessage);
			await manager.addMessage({
				conversationId: conversation.meta.id,
				message: streamResult.finalMessage,
				model: streamResult.finalMessage.model,
				provider: streamResult.finalMessage.provider,
				usage: streamResult.finalUsage ?? { inputTokens: -1, outputTokens: -1, totalTokens: -1 },
			});

			// Update UI immediately with assistant message (don't reload from file to avoid timing issues)
			// The file will be written in the background, and will be loaded correctly when conversation is opened next time
			const conversationWithAssistantMessage: ChatConversation = {
				...conversationWithUserMessage,
				messages: [...(conversationWithUserMessage.messages || []), streamResult.finalMessage],
				meta: {
					...conversationWithUserMessage.meta,
					updatedAtTimestamp: Date.now(),
				},
			};
			console.debug('[useChatSubmit] Updating conversation with assistant message:', conversationWithAssistantMessage.messages.length, 'messages');
			updateConv(conversationWithAssistantMessage);
		}
		// Note: manager and updateConv are intentionally omitted from dependencies
		// manager is a stable reference from context, updateConv is from useStreamChat hook
	}, [ensureConversation, createUserMessage, streamChat]);

	return {
		submitMessage,
		cancelStream,
		ensureConversation,
		createTempUserMessage: createUserMessage,
	};
}

