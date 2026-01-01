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
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const pendingConversation = useChatViewStore((state) => state.pendingConversation);
	const initialSelectedModel = useChatViewStore((state) => state.initialSelectedModel);
	const setInitialSelectedModel = useChatViewStore((state) => state.setInitialSelectedModel);

	// AbortController for canceling streaming
	const abortControllerRef = useRef<AbortController | null>(null);

	/**
	 * Ensure conversation exists, create if needed.
	 */
	const ensureConversation = useCallback(async (): Promise<ChatConversation | null> => {
		let conversation = activeConversation || null;
		if (!conversation && pendingConversation) {
			console.log('[useChatSubmit] creating conversation', pendingConversation, initialSelectedModel);
			conversation = await manager.createConversation({
				title: pendingConversation.title,
				project: pendingConversation.project?.meta ?? null,
				modelId: initialSelectedModel?.modelId,
				provider: initialSelectedModel?.provider,
			});
			setInitialSelectedModel(null);
			updateConv(conversation);
		}
		if (!conversation) {
			console.error('[useChatSubmit] Failed to create conversation');
		}
		return conversation;
	}, [activeConversation, pendingConversation, initialSelectedModel, manager, setInitialSelectedModel, updateConv]);


	/**
	 * Create temporary user message for immediate UI display.
	 */
	const createUserMessage = useCallback((
		conversation: ChatConversation,
		content: string
	): ChatMessage => {
		const modelId = conversation.meta.activeModel || manager.getSettings().defaultModel.modelId;
		const provider = conversation.meta.activeProvider || 'other';
		const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
		return createChatMessage('user', content, modelId, provider, timezone);
	}, [manager]);

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
		// Upload files and create resource references if any
		const resources = files.length > 0
		// todo if it is a multi dimension model. we should not summary the resources. and we just need to send to the model.
		//   however we still need to test which kind of resources. like pdf, we must summary first, but image we can just send to the model.
		// todo summary image cost time. so we should use some steps component from ai-sdk to show the progress to get better user experience.
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
		console.log('[useChatSubmit] Updating conversation with user message:', conversationWithUserMessage.messages.length, 'messages');
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
			onScrollToBottom,
			abortSignal: abortControllerRef.current.signal,
		});
		console.debug('[useChatSubmit] streaming chat completed');

		// Clear abort controller
		abortControllerRef.current = null;

		// Always save assistant message, even if streaming was interrupted
		// If streaming was interrupted, finalMessage might be null, but we should still
		// save any partial content from the streaming state
		if (streamResult.finalMessage) {
			console.log('[useChatSubmit] Saving assistant message:', streamResult.finalMessage);
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
			console.log('[useChatSubmit] Updating conversation with assistant message:', conversationWithAssistantMessage.messages.length, 'messages');
			updateConv(conversationWithAssistantMessage);
		}
	}, [ensureConversation, createUserMessage, streamChat, manager, updateConv]);

	return {
		submitMessage,
		cancelStream,
		ensureConversation,
		createTempUserMessage: createUserMessage,
	};
}

