import { useState, useCallback, useEffect } from 'react';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useChatViewStore, ChatTag } from '../store/chatViewStore';
import { useChatSubmit } from './useChatSubmit';
import type { PromptInputMessage } from '@/ui/component/prompt-input';

/**
 * Hook that encapsulates submission orchestration for ChatInputArea.
 * Manages isSending state, submit/cancel handlers, and the external submit action bridge.
 */
export function useInputSubmit() {
	const [isSending, setIsSending] = useState(false);
	const activeConversation = useChatDataStore((s) => s.activeConversation);
	const activeProject = useChatDataStore((s) => s.activeProject);
	const isStreaming = useChatDataStore((s) => s.streamingMessageId !== null);

	const { submitMessage, cancelStream } = useChatSubmit();

	// Bridge: expose submitAction so external triggers (StyleButtons, QuickActions) can submit
	useEffect(() => {
		const action = (text: string) => {
			const conv = useChatDataStore.getState().activeConversation;
			const project = useChatDataStore.getState().activeProject;
			if (conv) {
				void submitMessage({ text, files: [], conversation: conv, project });
			}
		};
		useChatViewStore.getState().setSubmitAction(action);
		return () => useChatViewStore.getState().setSubmitAction(null);
	}, [submitMessage]);

	const handleSubmit = useCallback(async (message: PromptInputMessage) => {
		if (!message.text.trim() && message.files.length === 0) return;
		if (isSending) return;
		setIsSending(true);
		try {
			await submitMessage({
				text: message.text,
				files: message.files,
				conversation: activeConversation,
				project: activeProject,
			});
		} catch (error) {
			console.error('[ChatInputArea] handleSubmit error:', error);
		} finally {
			setIsSending(false);
		}
	}, [submitMessage, activeConversation, activeProject, isSending]);

	const handleCancelStream = useCallback(async () => {
		if (isStreaming) {
			await cancelStream();
			setIsSending(false);
		}
	}, [isStreaming, cancelStream]);

	const handleTextChange = useCallback((_text: string, tags: ChatTag[]) => {
		useChatViewStore.getState().setCurrentInputTags(tags);
	}, []);

	const status: 'ready' | 'submitted' | 'streaming' = isStreaming
		? 'streaming'
		: (isSending ? 'submitted' : 'ready');

	const hasMessages = activeConversation && activeConversation.messages.length > 0;
	const placeholder = hasMessages
		? 'Ask anything...'
		: 'Ask anything... (@ for context)';

	return {
		isSending,
		isStreaming,
		status,
		placeholder,
		handleSubmit,
		handleCancelStream,
		handleTextChange,
	};
}
