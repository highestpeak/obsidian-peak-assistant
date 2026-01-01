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
import { Button } from '@/ui/component/shared-ui/button';
import { openSourceFile } from '@/ui/view/shared/view-utils';
import { useTypewriterEffect } from '../shared/useTypewriterEffect';
import { TYPEWRITER_EFFECT_SPEED_MS } from '@/core/constant';
import type { ChatMessage } from '@/service/chat/types';

const NO_TOPIC_NAME = 'NoTopic';
const MESSAGE_SUMMARY_MAX_LENGTH = 100;

interface TopicGroup {
	id: string;
	name: string;
	messages: ChatMessage[];
}

/**
 * Group messages into topics based on message.topic field from ChatConversationDoc
 * Returns topics and NoTopic messages separately
 */
function groupMessagesIntoTopics(messages: ChatMessage[]): {
	topics: TopicGroup[];
	noTopicMessages: ChatMessage[];
} {
	console.debug('[MessageHistoryView] groupMessagesIntoTopics messages', messages);
	if (messages.length === 0) return { topics: [], noTopicMessages: [] };

	// Group messages by topic name
	const topicMap = new Map<string, ChatMessage[]>();
	const noTopicMessages: ChatMessage[] = [];

	for (const message of messages) {
		if (message.topic) {
			if (!topicMap.has(message.topic)) {
				topicMap.set(message.topic, []);
			}
			topicMap.get(message.topic)!.push(message);
		} else {
			noTopicMessages.push(message);
		}
	}

	// Convert map to array of TopicGroup
	const topics: TopicGroup[] = [];
	let groupIndex = 0;

	// Add topic groups (preserve order by first message timestamp)
	const topicEntries = Array.from(topicMap.entries()).sort((a, b) => {
		const aTime = a[1][0]?.createdAtTimestamp || 0;
		const bTime = b[1][0]?.createdAtTimestamp || 0;
		return aTime - bTime;
	});

	for (const [topicName, topicMessages] of topicEntries) {
		topics.push({
			id: `topic-${groupIndex}`,
			name: topicName,
			messages: topicMessages,
		});
		groupIndex++;
	}

	return { topics, noTopicMessages };
}

/**
 * Get message summary text (title or truncated content)
 */
function getMessageSummary(message: ChatMessage): string {
	if (message.title) return message.title;
	const content = message.content || '';
	return content.slice(0, MESSAGE_SUMMARY_MAX_LENGTH) + (content.length > MESSAGE_SUMMARY_MAX_LENGTH ? '...' : '');
}

/**
 * Get role badge className based on message role
 */
function getRoleBadgeClass(role: ChatMessage['role']): string {
	const base = 'pktw-inline-block pktw-text-xs pktw-font-medium pktw-px-2 pktw-py-0.5 pktw-rounded pktw-mb-2';
	if (role === 'user') {
		return cn(base, 'pktw-bg-blue-500/15 pktw-text-blue-700 dark:pktw-bg-blue-500/20 dark:pktw-text-blue-400');
	}
	if (role === 'assistant') {
		return cn(base, 'pktw-bg-purple-500/15 pktw-text-purple-700 dark:pktw-bg-purple-500/20 dark:pktw-text-purple-400');
	}
	return cn(base, 'pktw-bg-gray-500/15 pktw-text-gray-700 dark:pktw-bg-gray-500/20 dark:pktw-text-gray-400');
}

/**
 * Message item component
 */
interface MessageItemProps {
	message: ChatMessage;
	isActive: boolean;
	onClick: () => void;
	onStarToggle?: (messageId: string, starred: boolean) => void;
}

const MessageItem: React.FC<MessageItemProps> = ({ message, isActive, onClick, onStarToggle }) => {
	const handleStarClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		onStarToggle?.(message.id, !message.starred);
	};

	return (
		<div className="">
			<Button
				variant="ghost"
				data-message-id={message.id}
				data-message-role={message.role}
				onClick={onClick}
				className={cn(
					'pktw-w-full pktw-justify-start pktw-items-start pktw-text-left pktw-whitespace-normal pktw-h-auto pktw-min-h-[3rem] pktw-py-2',
					'focus-visible:!pktw-ring-0 focus-visible:!pktw-ring-offset-0 pktw-shadow-none focus-visible:pktw-shadow-none',
					isActive && 'pktw-bg-accent/70'
				)}
			>
				<div className="pktw-flex-1 pktw-min-w-0 pktw-line-clamp-2 pktw-text-sm pktw-leading-relaxed">
					<span className={cn(getRoleBadgeClass(message.role), 'pktw-inline-flex pktw-items-center pktw-mr-2 pktw-mb-0')}>
						{message.role.toUpperCase()}
						{message.starred && (
							<Star 
								className="pktw-inline-block pktw-w-3 pktw-h-3 pktw-ml-1.5 pktw-fill-yellow-400 pktw-text-yellow-400 pktw-cursor-pointer"
								onClick={handleStarClick}
							/>
						)}
					</span>
					<span className="pktw-break-words">{getMessageSummary(message)}</span>
				</div>
			</Button>
		</div>
	);
};

/**
 * Header component
 */
interface HeaderProps {
	title: string;
	onOpenSource?: () => void;
	showSourceButton?: boolean;
}

const Header: React.FC<HeaderProps> = ({ title, onOpenSource, showSourceButton }) => (
	<div className="pktw-p-4 pktw-border-b pktw-border-border">
		<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-justify-between">
			<div className="pktw-text-base pktw-font-semibold pktw-text-foreground pktw-m-0 pktw-truncate pktw-flex-1">
				{title}
			</div>
			{showSourceButton && onOpenSource && (
				<IconButton
					size="md"
					onClick={onOpenSource}
					title="Open source document"
					className="pktw-flex-shrink-0"
				>
					<ExternalLink className="pktw-w-4 pktw-h-4" />
				</IconButton>
			)}
		</div>
	</div>
);

/**
 * Topic header component
 */
interface TopicHeaderProps {
	topic: TopicGroup;
	index: number;
	isOpen: boolean;
}

const TopicHeader: React.FC<TopicHeaderProps> = ({ topic, index, isOpen }) => {
	const messageCount = topic.messages.length;
	
	return (
		<CollapsibleTrigger asChild>
			<Button
				variant="ghost"
				className={cn(
					'pktw-w-full pktw-justify-start pktw-items-start pktw-text-left pktw-h-auto pktw-py-2',
					'focus-visible:!pktw-ring-0 focus-visible:!pktw-ring-offset-0 pktw-shadow-none focus-visible:pktw-shadow-none'
				)}
			>
				{isOpen ? (
					<ChevronDown className="pktw-size-4 pktw-text-muted-foreground pktw-flex-shrink-0 pktw-mt-0.5" />
				) : (
					<ChevronRight className="pktw-size-4 pktw-text-muted-foreground pktw-flex-shrink-0 pktw-mt-0.5" />
				)}
				<div className="pktw-flex-1 pktw-text-left pktw-min-w-0 pktw-ml-2">
					<div className="pktw-text-sm pktw-font-medium">
						{topic.name}
					</div>
					<div className="pktw-text-xs pktw-mt-0.5">
						{messageCount} {messageCount === 1 ? 'message' : 'messages'}
					</div>
				</div>
			</Button>
		</CollapsibleTrigger>
	);
};

/**
 * Topic group component
 */
interface TopicGroupComponentProps {
	topic: TopicGroup;
	index: number;
	isOpen: boolean;
	activeMessageId: string | null;
	onToggle: () => void;
	onMessageClick: (messageId: string) => void;
	onStarToggle?: (messageId: string, starred: boolean) => void;
}

const TopicGroupComponent: React.FC<TopicGroupComponentProps> = ({
	topic,
	index,
	isOpen,
	activeMessageId,
	onToggle,
	onMessageClick,
	onStarToggle,
}) => (
	<Collapsible open={isOpen} onOpenChange={onToggle} className="pktw-mb-1">
		<TopicHeader topic={topic} index={index} isOpen={isOpen} />
		<CollapsibleContent className="pktw-mt-1">
			<div className="pktw-space-y-1 pktw-border-l pktw-border-t-0 pktw-border-r-0 pktw-border-b-0 pktw-border-solid pktw-border-muted-foreground/30 pktw-ml-6">
				{topic.messages.map((message) => (
					<MessageItem
						key={message.id}
						message={message}
						isActive={activeMessageId === message.id}
						onClick={() => onMessageClick(message.id)}
						onStarToggle={onStarToggle}
					/>
				))}
			</div>
		</CollapsibleContent>
	</Collapsible>
);

/**
 * Right sidebar view displaying conversation message history with topic grouping
 */
export const MessageHistoryViewComponent: React.FC = () => {
	const { eventBus, app } = useServiceContext();
	const activeConversation = useProjectStore((state) => state.activeConversation);
	const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
	const [displayTitle, setDisplayTitle] = useState(activeConversation?.meta.title || '');

	// Update title from conversation updates
	useEffect(() => {
		const unsubscribe = eventBus.on<ConversationUpdatedEvent>(
			ViewEventType.CONVERSATION_UPDATED,
			(event) => {
				if (event.conversation.meta.id === activeConversation?.meta.id) {
					setDisplayTitle(event.conversation.meta.title);
				}
			}
		);
		return unsubscribe;
	}, [eventBus, activeConversation?.meta.id]);

	// Reset title when conversation changes
	useEffect(() => {
		if (activeConversation?.meta.title) {
			setDisplayTitle(activeConversation.meta.title);
		}
	}, [activeConversation?.meta.id]);

	const typewriterTitle = useTypewriterEffect({
		text: displayTitle,
		speed: TYPEWRITER_EFFECT_SPEED_MS,
		enabled: true,
	});

	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const messageListContainerRef = useRef<HTMLDivElement>(null);

	useScrollManager({
		scrollRef: scrollAreaRef,
		containerRef: messageListContainerRef,
		eventBus,
		autoScrollOnMessagesChange: false,
		messagesCount: activeConversation?.messages.length,
	});

	// Group messages into topics based on message.topic field
	const { topics: topicGroups, noTopicMessages } = useMemo(() => {
		if (!activeConversation?.messages) return { topics: [], noTopicMessages: [] };
		return groupMessagesIntoTopics(activeConversation.messages);
	}, [activeConversation?.messages]);

	// Manage open topics state - all topics default to closed
	const [openTopics, setOpenTopics] = useState<Set<string>>(() => new Set());

	// Reset open topics when conversation changes (all closed by default)
	useEffect(() => {
		setOpenTopics(new Set());
	}, [activeConversation?.meta.id]);

	// Auto-scroll to topic when opened
	const prevOpenTopicsRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		if (topicGroups.length > 0) {
			topicGroups.forEach(topic => {
				const wasOpen = prevOpenTopicsRef.current.has(topic.id);
				const isOpen = openTopics.has(topic.id);
				if (!wasOpen && isOpen && topic.messages.length > 0) {
					eventBus.dispatch(new ScrollToMessageEvent({ messageId: topic.messages[0].id }));
				}
			});
		}
		prevOpenTopicsRef.current = new Set(openTopics);
	}, [openTopics, topicGroups, eventBus]);

	const scrollToMessage = useCallback((messageId: string) => {
		setActiveMessageId(messageId);
		eventBus.dispatch(new ScrollToMessageEvent({ messageId }));
		setTimeout(() => setActiveMessageId(null), 2000);
	}, [eventBus]);

	const { manager } = useServiceContext();
	
	const handleStarToggle = useCallback(async (messageId: string, starred: boolean) => {
		if (!activeConversation || !manager) return;
		
		console.debug('[MessageHistoryView] Toggling star for message:', { messageId, starred });

		try {
			await manager.toggleStar({
				messageId,
				conversationId: activeConversation.meta.id,
				starred,
			});
			
			// Update conversation state locally
			const updatedMessages = activeConversation.messages.map(msg =>
				msg.id === messageId ? { ...msg, starred } : msg
			);
			const updatedConv = {
				...activeConversation,
				messages: updatedMessages,
			};
			
			useProjectStore.getState().updateConversation(updatedConv);
			useProjectStore.getState().setActiveConversation(updatedConv);
			
			// Dispatch event to notify other components
			eventBus.dispatch(new ConversationUpdatedEvent({ conversation: updatedConv }));
		} catch (error) {
			console.error('[MessageHistoryView] Error toggling star:', error);
		}
	}, [activeConversation, manager, eventBus]);

	const toggleTopic = useCallback((topicId: string) => {
		setOpenTopics(prev => {
			const next = new Set(prev);
			next.has(topicId) ? next.delete(topicId) : next.add(topicId);
			return next;
		});
	}, []);

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

	const hasMessages = activeConversation.messages.length > 0;

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-overflow-hidden">
			<Header
				title={typewriterTitle}
				onOpenSource={handleOpenSource}
				// abort this idea for now. i don't like this idea now.
				showSourceButton={false}
			/>

			{!hasMessages ? (
				<div className="pktw-flex pktw-items-center pktw-justify-center pktw-flex-1 pktw-text-muted-foreground pktw-text-sm">
					No messages yet
				</div>
			) : (
				<ScrollArea className="pktw-flex-1" ref={scrollAreaRef}>
					<div ref={messageListContainerRef}>
						{/* Render topics */}
					{topicGroups.map((topic, index) => (
						<TopicGroupComponent
							key={topic.id}
							topic={topic}
							index={index}
							isOpen={openTopics.has(topic.id)}
							activeMessageId={activeMessageId}
							onToggle={() => toggleTopic(topic.id)}
							onMessageClick={scrollToMessage}
							onStarToggle={handleStarToggle}
						/>
					))}
						
						{/* Render NoTopic messages directly (not in a topic group) */}
						{noTopicMessages.length > 0 && (
							<div className="pktw-space-y-1 pktw-mb-1">
								{noTopicMessages.map((message) => (
									<MessageItem
										key={message.id}
										message={message}
										isActive={activeMessageId === message.id}
										onClick={() => scrollToMessage(message.id)}
										onStarToggle={handleStarToggle}
									/>
								))}
							</div>
						)}
						
						{/* Fallback: render all messages if no topics */}
						{topicGroups.length === 0 && noTopicMessages.length === 0 && (
							<div className="pktw-space-y-1">
								{activeConversation.messages.map((message) => (
									<MessageItem
										key={message.id}
										message={message}
										isActive={activeMessageId === message.id}
										onClick={() => scrollToMessage(message.id)}
										onStarToggle={handleStarToggle}
									/>
								))}
							</div>
						)}
					</div>
				</ScrollArea>
			)}
		</div>
	);
};
