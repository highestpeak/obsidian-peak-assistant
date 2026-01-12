import React, { useMemo } from 'react';
import { ChatRole } from '@/core/providers/types';
import { MessageItem, MessageItemProps } from './MessageViewItem';
import { useMessageStore } from '../../store/messageStore';
import { DEFAULT_AI_SERVICE_SETTINGS } from '@/app/settings/types';

/**
 * Props for MessageListRenderer component
 */
interface MessageListRendererProps {
}

/**
 * Component for efficiently rendering messages list with optimized last message handling
 */
export const MessageListRenderer: React.FC<MessageListRendererProps> = ({
}) => {
	// Get messages and streaming state from messageStore
	const {
		messages,
		streamingMessageId,
		streamingContent,
		reasoningContent,
		isReasoningActive,
		currentToolCalls,
		isToolSequenceActive,
	} = useMessageStore();

	// Prepare saved messages for rendering (exclude streaming message if it's being streamed)
	const savedMessagesToRender: Array<MessageItemProps> = useMemo(() => {
		const result: Array<MessageItemProps> = [];

		messages.forEach(message => {
			result.push({
				message,

				streamingState: {
					isStreaming: false,
					streamingContent: '',
					reasoningContent: message.reasoning ? message.reasoning.content : '',
					isReasoningActive: false,
					currentToolCalls: message.toolCalls || [],
					isToolSequenceActive: false,
				},

				isLastMessage: false,
			});
		});

		if (result.length > 0) {
			result[result.length - 1].isLastMessage = true;
		}

		return result;
	}, [messages]);

	// Prepare streaming message separately (only when actively streaming)
	const streamingMessageToRender: MessageItemProps | null = useMemo(() => {
		if (!streamingMessageId) {
			return null;
		}

		return {
			message: {
				id: streamingMessageId,
				role: 'assistant' as ChatRole,
				content: streamingContent,
				createdAtTimestamp: Date.now(),
				createdAtZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
				starred: false,
				model: DEFAULT_AI_SERVICE_SETTINGS.defaultModel.modelId,
				provider: DEFAULT_AI_SERVICE_SETTINGS.defaultModel.provider,
			},

			streamingState: {
				isStreaming: true,
				streamingContent: streamingContent,
				reasoningContent: reasoningContent,
				isReasoningActive: isReasoningActive,
				currentToolCalls: currentToolCalls,
				isToolSequenceActive: isToolSequenceActive,
			},
			isLastMessage: true,
		};
	}, [streamingMessageId, streamingContent, reasoningContent, isReasoningActive, currentToolCalls, isToolSequenceActive]);

	// Render loading state for empty conversation
	if (savedMessagesToRender.length === 0 && !streamingMessageToRender) {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-min-h-[400px]">
				<div className="pktw-text-2xl pktw-font-light pktw-text-muted-foreground pktw-text-center">Ready when you are.</div>
			</div>
		);
	}

	return (
		<div className="pktw-flex pktw-flex-col pktw-w-full pktw-max-w-none pktw-m-0 pktw-px-4 pktw-py-6 pktw-gap-0 pktw-box-border">
			{/* Render saved messages */}
			{savedMessagesToRender.map((item, index) => {
				return (
					<MessageItem
						key={index}
						{...item}
					/>
				);
			})}
			{/* Render streaming message */}
			{streamingMessageToRender && (
				<MessageItem
					{...streamingMessageToRender}
				/>
			)}
		</div>
	);
};