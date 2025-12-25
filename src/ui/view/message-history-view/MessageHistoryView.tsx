import React, { useCallback, useRef, useState, useMemo, useEffect } from 'react';
import { useProjectStore } from '@/ui/store/projectStore';
import { ScrollToMessageEvent, ConversationUpdatedEvent, ViewEventType } from '@/core/eventBus';
import { cn } from '@/ui/react/lib/utils';
import { Star, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useScrollManager } from '../shared/scroll-utils';
import { ScrollArea } from '@/ui/component/shared-ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/ui/component/shared-ui/collapsible';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { openSourceFile } from '@/ui/view/shared/view-utils';
import { useTypewriterEffect } from '../shared/useTypewriterEffect';
import { TYPEWRITER_EFFECT_SPEED_MS } from '@/core/constant';
import type { ChatMessage } from '@/service/chat/types';

/**
 * Topic group containing messages
 */
interface TopicGroup {
	id: string;
	name?: string;
	messages: ChatMessage[];
}

/**
 * Group messages into topics based on conversation context or time intervals
 * @param messages - Messages to group
 * @param topics - Optional topic names from conversation context
 * @returns Array of topic groups
 */
function groupMessagesIntoTopics(
	messages: ChatMessage[],
	topics?: string[]
): TopicGroup[] {
	if (messages.length === 0) {
		return [];
	}

	// If we have explicit topics, try to map messages to them
	// For now, use a simple time-based grouping strategy
	// Group messages that are within 5 minutes of each other into the same topic
	const TOPIC_TIME_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

	const groups: TopicGroup[] = [];
	let currentGroup: ChatMessage[] = [];
	let currentGroupStartTime = messages[0]?.createdAtTimestamp || 0;
	let groupIndex = 0;

	for (let i = 0; i < messages.length; i++) {
		const message = messages[i];
		const timeSinceGroupStart = message.createdAtTimestamp - currentGroupStartTime;

		// Start a new group if time gap is too large and we have messages in current group
		if (
			currentGroup.length > 0 &&
			timeSinceGroupStart > TOPIC_TIME_THRESHOLD_MS &&
			// Also start new group on user message after a long gap (natural topic boundary)
			message.role === 'user'
		) {
			const topicName = topics?.[groupIndex] || undefined;
			groups.push({
				id: `topic-${groupIndex}`,
				name: topicName,
				messages: [...currentGroup],
			});
			currentGroup = [];
			currentGroupStartTime = message.createdAtTimestamp;
			groupIndex++;
		}

		currentGroup.push(message);
	}

	// Add the last group
	if (currentGroup.length > 0) {
		const topicName = topics?.[groupIndex] || undefined;
		groups.push({
			id: `topic-${groupIndex}`,
			name: topicName,
			messages: currentGroup,
		});
	}

	// If no groups were created (all messages fit in one), create a single default group
	if (groups.length === 0 && messages.length > 0) {
		return [
			{
				id: 'topic-0',
				name: topics?.[0],
				messages,
			},
		];
	}

	return groups;
}

/**
 * Right sidebar view displaying conversation message history with topic grouping
 */
export const MessageHistoryViewComponent: React.FC = () => {
	const { eventBus, app } = useServiceContext();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
	const [displayTitle, setDisplayTitle] = useState(activeConversation?.meta.title || '');

	// Listen for conversation title updates
	useEffect(() => {
		const unsubscribe = eventBus.on<ConversationUpdatedEvent>(
			ViewEventType.CONVERSATION_UPDATED,
			(event) => {
				// Only trigger typewriter if this is the active conversation
				if (event.conversation.meta.id === activeConversation?.meta.id) {
					setDisplayTitle(event.conversation.meta.title);
				}
			}
		);

		return () => {
			unsubscribe();
		};
	}, [eventBus, activeConversation?.meta.id]);

	// Update display title when active conversation changes
	useEffect(() => {
		if (activeConversation?.meta.title) {
			setDisplayTitle(activeConversation.meta.title);
		}
	}, [activeConversation?.meta.id]); // Only reset on conversation change, not title change

	// Apply typewriter effect
	const typewriterTitle = useTypewriterEffect({
		text: displayTitle,
		speed: TYPEWRITER_EFFECT_SPEED_MS,
		enabled: true,
	});

	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const messageListContainerRef = useRef<HTMLDivElement>(null);

	// Scroll management
	const { scrollToMessage: scrollToMessageInView } = useScrollManager({
		scrollRef: scrollAreaRef,
		containerRef: messageListContainerRef,
		eventBus,
		autoScrollOnMessagesChange: false,
		messagesCount: activeConversation?.messages.length,
	});

	// Group messages into topics
	const topicGroups = useMemo(() => {
		if (!activeConversation?.messages) return [];
		return groupMessagesIntoTopics(
			activeConversation.messages,
			activeConversation.context?.topics
		);
	}, [activeConversation?.messages, activeConversation?.context?.topics]);

	// Initialize all topics as open
	const [openTopics, setOpenTopics] = useState<Set<string>>(() => {
		const allTopicIds = new Set(topicGroups.map((g) => g.id));
		return allTopicIds;
	});

	// Update open topics when topic groups change
	React.useEffect(() => {
		setOpenTopics((prev) => {
			const newSet = new Set(prev);
			topicGroups.forEach((group) => {
				if (!newSet.has(group.id)) {
					newSet.add(group.id);
				}
			});
			return newSet;
		});
	}, [topicGroups.length]);

	const toggleTopic = useCallback((topicId: string) => {
		setOpenTopics((prev) => {
			const next = new Set(prev);
			if (next.has(topicId)) {
				next.delete(topicId);
			} else {
				next.add(topicId);
			}
			return next;
		});
	}, []);

	const scrollToMessage = useCallback(
		(messageId: string) => {
			setActiveMessageId(messageId);
			eventBus.dispatch(new ScrollToMessageEvent({ messageId }));
			// Clear active state after a delay
			setTimeout(() => setActiveMessageId(null), 2000);
		},
		[eventBus]
	);

	const handleOpenSource = useCallback(async () => {
		if (activeConversation?.file) {
			await openSourceFile(app, activeConversation.file);
		}
	}, [app, activeConversation?.file]);

	if (!activeConversation) {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-text-muted-foreground pktw-text-sm">
				No conversation selected
			</div>
		);
	}

	if (activeConversation.messages.length === 0) {
		return (
			<div className="pktw-flex pktw-flex-col pktw-h-full">
				<div className="pktw-p-4 pktw-border-b pktw-border-border">
					<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-justify-between">
						<h3 className="pktw-text-sm pktw-font-semibold pktw-text-foreground pktw-m-0 pktw-truncate pktw-flex-1">
							{typewriterTitle}
						</h3>
						{activeConversation.file && (
							<IconButton
								size="md"
								onClick={handleOpenSource}
								title="Open source document"
								className="pktw-flex-shrink-0"
							>
								<ExternalLink className="pktw-w-4 pktw-h-4" />
							</IconButton>
						)}
					</div>
				</div>
				<div className="pktw-flex pktw-items-center pktw-justify-center pktw-flex-1 pktw-text-muted-foreground pktw-text-sm">
					No messages yet
				</div>
			</div>
		);
	}

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-overflow-hidden pktw-border-r pktw-bg-background">
			{/* Header */}
			<div className="pktw-p-4 pktw-border-b pktw-border-border">
				<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-justify-between">
					<h3 className="pktw-text-sm pktw-font-semibold pktw-text-foreground pktw-m-0 pktw-truncate pktw-flex-1">
						{typewriterTitle}
					</h3>
					{activeConversation.file && (
						<IconButton
							size="md"
							onClick={handleOpenSource}
							title="Open source document"
							className="pktw-flex-shrink-0"
						>
							<ExternalLink className="pktw-w-4 pktw-h-4" />
						</IconButton>
					)}
				</div>
			</div>

			{/* Topic Groups and Messages */}
			<ScrollArea className="pktw-flex-1" ref={scrollAreaRef}>
				<div className="pktw-p-2" ref={messageListContainerRef}>
					{topicGroups.map((topic, topicIndex) => {
						const isOpen = openTopics.has(topic.id);
						const topicName = topic.name || `Topic ${topicIndex + 1}`;

						return (
							<Collapsible
								key={topic.id}
								open={isOpen}
								onOpenChange={() => toggleTopic(topic.id)}
								className="pktw-mb-3"
							>
								{/* Topic Header */}
								<CollapsibleTrigger className="pktw-w-full pktw-group">
									<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-2 pktw-py-2 pktw-rounded-md hover:pktw-bg-accent/50 pktw-transition-colors">
										{isOpen ? (
											<ChevronDown className="pktw-size-4 pktw-text-muted-foreground" />
										) : (
											<ChevronRight className="pktw-size-4 pktw-text-muted-foreground" />
										)}
										<div className="pktw-flex-1 pktw-text-left">
											<div className="pktw-text-sm pktw-text-foreground/90">
												{topicName}
											</div>
											<div className="pktw-text-xs pktw-text-muted-foreground/60">
												{topic.messages.length} messages
											</div>
										</div>
									</div>
								</CollapsibleTrigger>

								{/* Messages in Topic */}
								<CollapsibleContent>
									<div className="pktw-ml-3 pktw-mt-1 pktw-pl-3 pktw-border-l-2 pktw-border-border pktw-space-y-1">
										{topic.messages.map((message) => (
											<button
												key={message.id}
												data-message-id={message.id}
												data-message-role={message.role}
												onClick={() => scrollToMessage(message.id)}
												className={cn(
													'pktw-w-full pktw-text-left pktw-px-3 pktw-py-2 pktw-rounded-md pktw-transition-colors hover:pktw-bg-accent',
													activeMessageId === message.id
														? 'pktw-bg-accent pktw-border-l-2 pktw-border-primary'
														: ''
												)}
											>
												{/* Role Label */}
												<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-mb-1">
													<div
														className={cn(
															'pktw-inline-block pktw-text-xs pktw-px-1.5 pktw-py-0.5 pktw-rounded',
															message.role === 'user'
																? 'pktw-bg-blue-500/10 pktw-text-blue-600 dark:pktw-text-blue-400'
																: message.role === 'assistant'
																	? 'pktw-bg-purple-500/10 pktw-text-purple-600 dark:pktw-text-purple-400'
																	: 'pktw-bg-gray-500/10 pktw-text-gray-600 dark:pktw-text-gray-400'
														)}
													>
														{message.role.toUpperCase()}
													</div>
													{message.starred && (
														<Star className="pktw-w-3 pktw-h-3 pktw-fill-yellow-400 pktw-text-yellow-400" />
													)}
												</div>

												{/* Message Title/Preview */}
												<div className="pktw-text-sm pktw-text-foreground/90 pktw-line-clamp-3">
													{message.title ||
														(message.content.length > 100
															? message.content.substring(0, 100) + '...'
															: message.content)}
												</div>
											</button>
										))}
									</div>
								</CollapsibleContent>
							</Collapsible>
						);
					})}
				</div>
			</ScrollArea>
		</div>
	);
};

