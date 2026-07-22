import React, { useMemo } from 'react';
import { ChatRole } from '@/core/providers/types';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { DEFAULT_AI_SERVICE_SETTINGS } from '@/core/config/settingsTypes';
import { DateSeparator } from '../DateSeparator';
import { useModels } from '@/ui/hooks/useModels';
import { MessageViewItem, MessageItemProps } from './MessageViewItem';
import { PermissionAskCard } from './PermissionAskCard';
import { useChatStrings } from '../../chatStringsContext';
import type { ChatMessage } from '@/service/chat/types';

/** Get date-only string for comparison */
function getDateOnly(ts: number | undefined): string {
	if (!ts) return '';
	const d = new Date(ts);
	return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * MessageListRenderer — message list with:
 *   • date separators between days
 *   • per-message identity attribution (passes the previous assistant
 *     message so MessageViewItem can decide whether to show the
 *     model-attribution identity chip — MSG-01)
 */
export const MessageListRenderer: React.FC = () => {
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

	const savedMessagesToRender: Array<MessageItemProps> = useMemo(() => {
		const result: Array<MessageItemProps> = [];
		let lastAssistant: ChatMessage | undefined;
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
				previousAssistantMessage: lastAssistant,
			});
			if (message.role === 'assistant') {
				lastAssistant = message;
			}
		});
		if (result.length > 0) {
			result[result.length - 1].isLastMessage = true;
		}
		return result;
	}, [messages]);

	const streamingMessageToRender: MessageItemProps | null = useMemo(() => {
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
		<div
			className="pkchat-msg-list"
			// A11Y-03 — treat the assistant thread as a log region so screen
			// readers announce new turns but do NOT re-read updated tokens
			// on every stream tick. `aria-relevant="additions"` limits the
			// polite announcement to newly appended nodes only.
			role="log"
			aria-live="polite"
			aria-relevant="additions"
			aria-atomic="false"
		>
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
						<MessageViewItem {...item} models={models} />
					</React.Fragment>
				);
			})}
			{streamingMessageToRender && (
				<MessageViewItem {...streamingMessageToRender} models={models} />
			)}
			{/* B1 §5.2 R4 — inline permission ask card. Renders only when a
			   pending permission request exists in chatDataStore. */}
			<PermissionAskCard />
		</div>
	);
};
