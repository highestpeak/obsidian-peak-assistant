import React, { useMemo } from 'react';
import { ChatRole } from '@/core/providers/types';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { DEFAULT_AI_SERVICE_SETTINGS } from '@/app/settings/types';
import { DateSeparator } from '../DateSeparator';
import { useModels } from '@/ui/hooks/useModels';
import {
	MessageViewItemRetained,
	MessageItemRetainedProps,
} from './MessageViewItemRetained';
import { useChatStrings } from '../../chatStringsContext';

/** Get date-only string for comparison */
function getDateOnly(ts: number | undefined): string {
	if (!ts) return '';
	const d = new Date(ts);
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * MessageListRendererRetained — message list using the 2026-05-29 retained
 * document-style message rendering. Replaces the legacy MessageListRenderer
 * + MessageViewItem path. Streaming and dataflow behavior unchanged.
 */
export const MessageListRendererRetained: React.FC = () => {
	const strings = useChatStrings();
	const {
		messages,
		streamingMessageId,
		streamingContent,
		reasoningContent,
		isReasoningActive,
		currentToolCalls,
		isToolSequenceActive,
	} = useChatDataStore();
	const { models } = useModels();

	const savedMessagesToRender: Array<MessageItemRetainedProps> = useMemo(() => {
		const result: Array<MessageItemRetainedProps> = [];
		messages.forEach((message) => {
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

	const streamingMessageToRender: MessageItemRetainedProps | null = useMemo(() => {
		if (!streamingMessageId) return null;
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
				streamingContent,
				reasoningContent,
				isReasoningActive,
				currentToolCalls,
				isToolSequenceActive,
			},
			isLastMessage: true,
		};
	}, [
		streamingMessageId,
		streamingContent,
		reasoningContent,
		isReasoningActive,
		currentToolCalls,
		isToolSequenceActive,
	]);

	if (savedMessagesToRender.length === 0 && !streamingMessageToRender) {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-min-h-[400px]">
				<div className="pktw-text-2xl pktw-font-light pktw-text-muted-foreground pktw-text-center">
					{strings.message.emptyHero}
				</div>
			</div>
		);
	}

	return (
		<div className="pkchat-msg-list">
			{savedMessagesToRender.map((item, index) => {
				const prevItem = index > 0 ? savedMessagesToRender[index - 1] : null;
				const currentDate = getDateOnly(item.message.createdAtTimestamp);
				const prevDate = prevItem ? getDateOnly(prevItem.message.createdAtTimestamp) : '';
				const showDateSeparator =
					currentDate !== prevDate && !!item.message.createdAtTimestamp;
				return (
					<React.Fragment key={item.message.id ?? index}>
						{showDateSeparator && (
							<DateSeparator date={new Date(item.message.createdAtTimestamp)} />
						)}
						<MessageViewItemRetained {...item} models={models} />
					</React.Fragment>
				);
			})}
			{streamingMessageToRender && (
				<MessageViewItemRetained {...streamingMessageToRender} models={models} />
			)}
		</div>
	);
};
