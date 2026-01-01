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

interface TopicGroup {
	id: string;
	name?: string;
	messages: ChatMessage[];
}

const TOPIC_TIME_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Group messages into topics based on time gaps
 */
function groupMessagesIntoTopics(messages: ChatMessage[], topicNames?: string[]): TopicGroup[] {
	if (messages.length === 0) return [];

	const groups: TopicGroup[] = [];
	let currentGroup: ChatMessage[] = [];
	let groupStartTime = messages[0]?.createdAtTimestamp || 0;
	let groupIndex = 0;

	for (const message of messages) {
		const timeGap = message.createdAtTimestamp - groupStartTime;
		const shouldStartNewGroup = 
			currentGroup.length > 0 && 
			timeGap > TOPIC_TIME_THRESHOLD_MS && 
			message.role === 'user';

		if (shouldStartNewGroup) {
			groups.push({
				id: `topic-${groupIndex}`,
				name: topicNames?.[groupIndex],
				messages: [...currentGroup],
			});
			currentGroup = [];
			groupStartTime = message.createdAtTimestamp;
			groupIndex++;
		}

		currentGroup.push(message);
	}

	// Add the last group
	if (currentGroup.length > 0) {
		groups.push({
			id: `topic-${groupIndex}`,
			name: topicNames?.[groupIndex],
			messages: currentGroup,
		});
	}

	return groups.length > 0 ? groups : [{
		id: 'topic-0',
		name: topicNames?.[0],
		messages,
	}];
}

/**
 * Get message summary text (title or truncated content)
 */
function getMessageSummary(message: ChatMessage): string {
	if (message.title) return message.title;
	const content = message.content || '';
	return content.slice(0, 10) + (content.length > 10 ? '...' : '');
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
}

const MessageItem: React.FC<MessageItemProps> = ({ message, isActive, onClick }) => (
	<div className="pktw-flex pktw-justify-center pktw-px-2">
		<button
			data-message-id={message.id}
			data-message-role={message.role}
			onClick={onClick}
			className={cn(
				'pktw-w-full pktw-max-w-full pktw-py-2 pktw-px-3 pktw-rounded pktw-transition-colors hover:pktw-bg-accent/50',
				'pktw-flex pktw-flex-col pktw-items-center pktw-text-center',
				isActive && 'pktw-bg-accent/70'
			)}
		>
			<div className={getRoleBadgeClass(message.role)}>
				{message.role.toUpperCase()}
				{message.starred && (
					<Star className="pktw-inline-block pktw-w-3 pktw-h-3 pktw-ml-1.5 pktw-fill-yellow-400 pktw-text-yellow-400" />
				)}
			</div>
			<div className="pktw-text-sm pktw-text-center pktw-leading-relaxed pktw-break-words pktw-line-clamp-2">
				{getMessageSummary(message)}
			</div>
		</button>
	</div>
);

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
			<h3 className="pktw-text-base pktw-font-semibold pktw-text-foreground pktw-m-0 pktw-truncate pktw-flex-1">
				{title}
			</h3>
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
	const topicName = topic.name || `Topic ${index + 1}`;
	const messageCount = topic.messages.length;
	
	return (
		<CollapsibleTrigger className="pktw-w-full pktw-group">
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-pr-2 pktw-py-2 pktw-rounded hover:pktw-bg-accent/50 pktw-transition-colors pktw-cursor-pointer">
				{isOpen ? (
					<ChevronDown className="pktw-size-4 pktw-text-muted-foreground pktw-flex-shrink-0" />
				) : (
					<ChevronRight className="pktw-size-4 pktw-text-muted-foreground pktw-flex-shrink-0" />
				)}
				<div className="pktw-flex-1 pktw-text-left pktw-min-w-0">
					<div className="pktw-text-sm pktw-font-medium pktw-text-foreground">
						{topicName}
					</div>
					<div className="pktw-text-xs pktw-text-muted-foreground pktw-mt-0.5">
						{messageCount} {messageCount === 1 ? 'message' : 'messages'}
					</div>
				</div>
			</div>
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
}

const TopicGroupComponent: React.FC<TopicGroupComponentProps> = ({
	topic,
	index,
	isOpen,
	activeMessageId,
	onToggle,
	onMessageClick,
}) => (
	<Collapsible open={isOpen} onOpenChange={onToggle} className="pktw-mb-1">
		<TopicHeader topic={topic} index={index} isOpen={isOpen} />
		<CollapsibleContent>
			<div className="pktw-space-y-1">
				{topic.messages.map((message) => (
					<MessageItem
						key={message.id}
						message={message}
						isActive={activeMessageId === message.id}
						onClick={() => onMessageClick(message.id)}
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

	// Group messages into topics
	const topicGroups = useMemo(() => {
		if (!activeConversation?.messages) return [];
		return groupMessagesIntoTopics(
			activeConversation.messages,
			activeConversation.context?.topics
		);
	}, [activeConversation?.messages, activeConversation?.context?.topics]);

	// Manage open topics state
	const [openTopics, setOpenTopics] = useState<Set<string>>(() => 
		new Set(topicGroups.map(g => g.id))
	);

	// Update open topics when groups change
	useEffect(() => {
		setOpenTopics(prev => {
			const next = new Set(prev);
			topicGroups.forEach(group => {
				if (!next.has(group.id)) {
					next.add(group.id);
				}
			});
			return next;
		});
	}, [topicGroups.length]);

	// Auto-scroll to topic when opened
	const prevOpenTopicsRef = useRef<Set<string>>(new Set());
	useEffect(() => {
		const hasNamedTopics = topicGroups.some(g => g.name);
		if (hasNamedTopics) {
			topicGroups.forEach(topic => {
				const wasOpen = prevOpenTopicsRef.current.has(topic.id);
				const isOpen = openTopics.has(topic.id);
				if (!wasOpen && isOpen && topic.name && topic.messages.length > 0) {
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
	const hasNamedTopics = topicGroups.some(g => g.name);

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-overflow-hidden">
			<Header
				title={typewriterTitle}
				onOpenSource={handleOpenSource}
				showSourceButton={!!activeConversation.file}
			/>

			{!hasMessages ? (
				<div className="pktw-flex pktw-items-center pktw-justify-center pktw-flex-1 pktw-text-muted-foreground pktw-text-sm">
					No messages yet
				</div>
			) : (
				<ScrollArea className="pktw-flex-1" ref={scrollAreaRef}>
					<div ref={messageListContainerRef}>
						{hasNamedTopics ? (
							topicGroups.map((topic, index) => (
								<TopicGroupComponent
									key={topic.id}
									topic={topic}
									index={index}
									isOpen={openTopics.has(topic.id)}
									activeMessageId={activeMessageId}
									onToggle={() => toggleTopic(topic.id)}
									onMessageClick={scrollToMessage}
								/>
							))
						) : (
							<div className="pktw-space-y-1">
								{activeConversation.messages.map((message) => (
									<MessageItem
										key={message.id}
										message={message}
										isActive={activeMessageId === message.id}
										onClick={() => scrollToMessage(message.id)}
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
