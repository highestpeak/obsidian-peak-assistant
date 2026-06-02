import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChatConversation } from '@/service/chat/types';
import { openSourceFile } from '@/ui/view/shared/view-utils';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { openAllConversationsInChat, openConversationInChat, openPendingConversationInChat } from '@/ui/view/chat-view/chatNavigation';
import { showContextMenu } from './utils';
import { InputModal } from '@/ui/component/shared-ui/InputModal';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { Plus, MessageSquare } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { ViewEventType, ConversationUpdatedEvent, ConversationCreatedEvent } from '@/core/eventBus';
import { useTypewriterEffect } from '@/ui/component/mine/useTypewriterEffect';
import { TYPEWRITER_EFFECT_SPEED_MS, DEFAULT_NEW_CONVERSATION_TITLE, MAX_CONVERSATIONS_DISPLAY } from '@/core/constant';
import { MoreHorizontal } from 'lucide-react';

interface ConversationsSectionProps {
	/** Optional case-insensitive filter applied to conversation title. */
	query?: string;
}

/**
 * Bucket label by createdAt offset from "today midnight". Returns a stable key
 * (used for grouping + display). Buckets: Today / Yesterday / This week /
 * Earlier — designed to be skim-friendly in a tall sidebar, not exhaustive.
 */
function timeBucket(ts: number, now = Date.now()): string {
	if (!ts) return 'Earlier';
	const start = new Date(now);
	start.setHours(0, 0, 0, 0);
	const startMs = start.getTime();
	const diffDays = Math.floor((startMs - ts) / 86_400_000);
	if (ts >= startMs) return 'Today';
	if (diffDays < 1) return 'Yesterday';
	if (diffDays < 7) return 'This week';
	return 'Earlier';
}

const BUCKET_ORDER = ['Today', 'Yesterday', 'This week', 'Earlier'];


interface ConversationTitleProps {
	title: string;
	enableTypewriter?: boolean;
	onTypewriterComplete?: () => void;
}

/**
 * Pure rendering component for displaying conversation title with optional typewriter effect
 * All state management and event handling should be done in parent component
 */
export const ConversationTitle: React.FC<ConversationTitleProps> = ({ 
	title, 
	enableTypewriter = false,
	onTypewriterComplete 
}) => {
	// Apply typewriter effect only when enabled
	const typewriterTitle = useTypewriterEffect({
		text: title,
		speed: TYPEWRITER_EFFECT_SPEED_MS,
		enabled: enableTypewriter,
		onComplete: onTypewriterComplete,
	});

	// If typewriter is disabled, just show the title directly
	return <>{enableTypewriter ? typewriterTitle : title}</>;
};

interface ConversationListProps {
	conversations: ChatConversation[];
	activeConversation: ChatConversation | null;
	typewriterEnabled: Map<string, boolean>;
	onConversationClick: (conversation: ChatConversation) => void;
	onContextMenu: (e: React.MouseEvent, conversation: ChatConversation) => void;
	onTypewriterComplete: (conversationId: string) => void;
	/**
	 * Whether to show the indicator dot (used in ProjectsSection)
	 */
	showIndicator?: boolean;
}

/**
 * Reusable component for rendering a list of conversations
 */
export const ConversationList: React.FC<ConversationListProps> = ({
	conversations,
	activeConversation,
	typewriterEnabled,
	onConversationClick,
	onContextMenu,
	onTypewriterComplete,
	showIndicator = false,
}) => {
	return (
		<>
			{conversations.map((conversation) => {
				const isActive = activeConversation?.meta.id === conversation.meta.id;
				return (
					<div
						key={conversation.meta.id}
						className={cn(
							'pktw-relative pktw-px-2 pktw-py-1.5 pktw-rounded-md pktw-cursor-pointer pktw-transition-colors pktw-text-[13px] pktw-min-h-7 pktw-flex pktw-items-center pktw-gap-2 pktw-break-words',
							showIndicator && 'pktw-pl-6 pktw-pr-2 before:pktw-content-[""] before:pktw-absolute before:pktw-left-2 before:pktw-top-1/2 before:pktw--translate-y-1/2 before:pktw-w-1 before:pktw-h-1 before:pktw-rounded-full before:pktw-transition-opacity',
							// Default state
							!isActive && 'pktw-bg-transparent pktw-text-foreground/80 hover:pktw-bg-muted hover:pktw-text-foreground',
							// Indicator styles when showIndicator is true
							showIndicator && !isActive && 'before:pktw-bg-muted-foreground before:pktw-opacity-40 hover:before:pktw-opacity-80',
							showIndicator && isActive && 'before:!pktw-opacity-100'
						)}
						style={
							isActive
								? {
										background: 'var(--pk-accent-soft)',
										color: 'var(--pk-accent-text)',
										fontWeight: 500,
									}
								: undefined
						}
						data-conversation-id={conversation.meta.id}
						onClick={() => onConversationClick(conversation)}
						onContextMenu={(e) => onContextMenu(e, conversation)}
					>
						<MessageSquare
							className="pktw-shrink-0"
							style={{
								width: 14,
								height: 14,
								color: isActive
									? 'var(--pk-accent-text)'
									: 'var(--pk-text-tertiary)',
							}}
							aria-hidden
						/>
						<span className="pktw-flex-1 pktw-min-w-0 pktw-truncate">
							<ConversationTitle
								title={conversation.meta.title}
								enableTypewriter={typewriterEnabled.get(conversation.meta.id) ?? false}
								onTypewriterComplete={() => onTypewriterComplete(conversation.meta.id)}
							/>
						</span>
						{/*
						  Per-row date+calendar removed (2026-06-02). With time-bucket
						  headers (Today/Yesterday/This week/Earlier) above each group
						  the row-level repeat was redundant and competed with the
						  conversation title for horizontal space. If a precise
						  timestamp is needed, surface it on hover via a tooltip
						  rather than always-visible chrome.
						*/}
					</div>
				);
			})}
		</>
	);
};

/**
 * Conversations section component
 */
export const ConversationsSection: React.FC<ConversationsSectionProps> = ({ query = '' }) => {
	const { app, manager, eventBus, viewManager } = useServiceContext();
	const {
		conversations,
		activeConversation,
		updateConversation,
	} = useChatDataStore();

	const [inputModalOpen, setInputModalOpen] = useState(false);
	const [inputModalConfig, setInputModalConfig] = useState<{
		message: string;
		onSubmit: (value: string | null) => Promise<void>;
		initialValue?: string;
		placeholderText?: string;
		hintText?: string;
		submitButtonText?: string;
	} | null>(null);

	// Track typewriter state for each conversation
	const [typewriterEnabled, setTypewriterEnabled] = useState<Map<string, boolean>>(new Map());

	const handleNewConversation = async () => {
		await openPendingConversationInChat({
			title: DEFAULT_NEW_CONVERSATION_TITLE,
			project: null,
		}, { viewManager, eventBus });
	};

	const handleConversationClick = async (conversation: ChatConversation) => {
		await openConversationInChat(conversation, { manager, viewManager, eventBus });
	};

	const handleEditConversationTitle = useCallback((conversation: ChatConversation) => {
		setInputModalConfig({
			message: 'Enter conversation title',
			placeholderText: 'Conversation title',
			initialValue: conversation.meta.title,
			onSubmit: async (newTitle: string | null) => {
				if (!newTitle || !newTitle.trim()) return;

				try {
					// updateConversationTitle will trigger ConversationUpdatedEvent
					// The event listener will handle updating the store and enabling typewriter effect
					await manager.conv.updateConversationTitle({
						conversationId: conversation.meta.id,
						title: newTitle.trim(),
					});
				} catch (error) {
					console.error('Failed to update conversation title', error);
				}
			},
		});
		setInputModalOpen(true);
	}, [manager]);

	// Menu item configurations
	const conversationMenuItems = useCallback((conversation: ChatConversation) => [
		{
			title: 'Edit title',
			icon: 'pencil',
			onClick: () => handleEditConversationTitle(conversation),
		},
		{
			title: 'Open source file',
			icon: 'file-text',
			onClick: async () => {
				await openSourceFile(app, conversation.file);
			},
		},
		{
			title: 'Delete',
			icon: 'trash',
			onClick: async () => {
				await manager.conv.deleteConversation(conversation.meta.id);
				const { conversations: current, setConversations: updateConversations, activeConversation: active, setActiveConversation: setActive } = useChatDataStore.getState();
				const updated = Array.from(current.values()).filter(c => c.meta.id !== conversation.meta.id);
				updateConversations(updated);
				if (active?.meta.id === conversation.meta.id) {
					setActive(null);
				}
			},
		},
	], [app, manager, handleEditConversationTitle]);

	const handleContextMenu = (e: React.MouseEvent, conversation: ChatConversation) => {
		const menuItems = conversationMenuItems(conversation);
		showContextMenu(e, menuItems);
	};

	// Listen for conversation updates and manage typewriter effect
	useEffect(() => {
		const unsubscribeUpdated = eventBus.on<ConversationUpdatedEvent>(
			ViewEventType.CONVERSATION_UPDATED,
			async (event) => {
				const conversation = event.conversation;
				console.log('[ConversationsSection] CONVERSATION_UPDATED event:', {
					conversationId: conversation.meta.id,
					title: conversation.meta.title,
					timestamp: Date.now()
				});
				// Enable typewriter effect first, then update conversation in store
				// This ensures ConversationTitle receives enableTypewriter=true before the title prop changes
				setTypewriterEnabled(prev => {
					const next = new Map(prev);
					next.set(conversation.meta.id, true);
					console.log('[ConversationsSection] Enabling typewriter for conversation:', conversation.meta.id, 'title:', conversation.meta.title);
					return next;
				});
				// Update conversation in store - this will trigger ConversationTitle to re-render
				// with the new title prop, and useTypewriterEffect will detect the text change
				updateConversation(conversation);
			}
		);

		const unsubscribeCreated = eventBus.on<ConversationCreatedEvent>(
			ViewEventType.CONVERSATION_CREATED,
			(event) => {
				console.log('[ConversationsSection] CONVERSATION_CREATED event:', {
					conversationId: event.conversationId,
					timestamp: Date.now()
				});
				// Enable typewriter effect for new conversation
				setTypewriterEnabled(prev => {
					const next = new Map(prev);
					next.set(event.conversationId, true);
					return next;
				});
			}
		);

		return () => {
			unsubscribeUpdated();
			unsubscribeCreated();
		};
	}, [eventBus, updateConversation]);

	// Get root-level conversations (without projectId)
	const conversationsWithoutProject = useMemo(() => {
		const q = query.trim().toLowerCase();
		return Array.from(conversations.values())
			.filter((c) => !c.meta.projectId)
			.filter((c) => !q || (c.meta.title || '').toLowerCase().includes(q))
			.sort((a, b) => {
				const timeA = a.meta.createdAtTimestamp || 0;
				const timeB = b.meta.createdAtTimestamp || 0;
				return timeB - timeA;
			});
	}, [conversations, query]);

	const conversationsToShow = conversationsWithoutProject.slice(0, MAX_CONVERSATIONS_DISPLAY);
	const hasMoreConversations = conversationsWithoutProject.length > MAX_CONVERSATIONS_DISPLAY;

	// Group visible conversations into Today / Yesterday / This week / Earlier
	// buckets so the sidebar reads as a timeline rather than a flat list.
	const grouped = useMemo(() => {
		const buckets = new Map<string, ChatConversation[]>();
		conversationsToShow.forEach((c) => {
			const key = timeBucket(c.meta.createdAtTimestamp || 0);
			const arr = buckets.get(key) || [];
			arr.push(c);
			buckets.set(key, arr);
		});
		return BUCKET_ORDER
			.filter((k) => buckets.has(k))
			.map((k) => ({ label: k, items: buckets.get(k)! }));
	}, [conversationsToShow]);

	/*
	 * Restructured 2026-06-02: previously this section had its own collapsible
	 * "CONVERSATIONS" header (with chevron + plus). Per the locked design,
	 * conversations sit directly under time-bucket section labels
	 * (TODAY / YESTERDAY / THIS WEEK / EARLIER) at the same hierarchy as the
	 * PROJECTS section above. The outer wrapper was redundant chrome.
	 *
	 * New-conversation `+` button now hovers over each bucket label, since
	 * the bucket label IS the new section header. Top of the conversations
	 * list also carries a low-noise "+ New conversation" affordance for
	 * discoverability when the list is empty.
	 */
	return (
		<div className="pktw-flex pktw-flex-col">
			{conversationsToShow.length === 0 ? (
				<div className="pktw-p-3 pktw-text-muted-foreground pktw-text-[13px] pktw-italic pktw-text-center">
					{query.trim() ? 'No matching conversations' : 'No conversations'}
				</div>
			) : (
				grouped.map((bucket, idx) => (
					<React.Fragment key={bucket.label}>
						<div
							className="pktw-group pktw-flex pktw-items-center pktw-justify-between pktw-px-2 pktw-pb-0.5 pktw-text-[10px] pktw-font-semibold pktw-uppercase pktw-tracking-wide pktw-text-muted-foreground"
							style={{ paddingTop: idx === 0 ? 8 : 12 }}
						>
							<span>{bucket.label}</span>
							<IconButton
								size="md"
								className="pktw-shrink-0 pktw-opacity-0 group-hover:pktw-opacity-100 pktw-transition-opacity"
								onClick={(e) => {
									e.stopPropagation();
									handleNewConversation();
								}}
								title={DEFAULT_NEW_CONVERSATION_TITLE}
							>
								<Plus className="pktw-text-foreground" />
							</IconButton>
						</div>
						<ConversationList
							conversations={bucket.items}
							activeConversation={activeConversation}
							typewriterEnabled={typewriterEnabled}
							onConversationClick={handleConversationClick}
							onContextMenu={handleContextMenu}
							onTypewriterComplete={(conversationId) => {
								setTypewriterEnabled(prev => {
									const next = new Map(prev);
									next.delete(conversationId);
									return next;
								});
							}}
						/>
					</React.Fragment>
				))
			)}
			{hasMoreConversations && (
				<div
					className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-3 pktw-py-1.5 pktw-mx-2 pktw-my-1 pktw-rounded-md pktw-text-muted-foreground pktw-text-xs pktw-transition-all pktw-cursor-pointer hover:pktw-bg-muted hover:pktw-text-foreground"
					onClick={() => {
						void openAllConversationsInChat({ viewManager, eventBus });
					}}
				>
					<MoreHorizontal className="pktw-w-3.5 pktw-h-3.5" />
					<span className="pktw-flex-1">See more</span>
				</div>
			)}

			{/* Modal */}
			{inputModalConfig && (
				<InputModal
					open={inputModalOpen}
					onOpenChange={setInputModalOpen}
					message={inputModalConfig.message}
					onSubmit={inputModalConfig.onSubmit}
					initialValue={inputModalConfig.initialValue}
					placeholderText={inputModalConfig.placeholderText}
					hintText={inputModalConfig.hintText}
					submitButtonText={inputModalConfig.submitButtonText}
				/>
			)}
		</div>
	);
};
