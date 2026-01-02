import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChatConversation } from '@/service/chat/types';
import { openSourceFile } from '@/ui/view/shared/view-utils';
import { useProjectStore } from '@/ui/store/projectStore';
import { useChatViewStore } from '../chat-view/store/chatViewStore';
import { notifySelectionChange, showContextMenu } from './utils';
import { InputModal } from '@/ui/component/shared-ui/InputModal';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { ChevronDown, ChevronRight, Plus, Pencil, FileText, Calendar } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { ViewEventType, ConversationUpdatedEvent, ConversationCreatedEvent } from '@/core/eventBus';
import { useTypewriterEffect } from '@/ui/view/shared/useTypewriterEffect';
import { TYPEWRITER_EFFECT_SPEED_MS, DEFAULT_NEW_CONVERSATION_TITLE, MAX_CONVERSATIONS_DISPLAY } from '@/core/constant';
import { formatRelativeDate } from '@/ui/view/shared/date-utils';
import { MoreHorizontal } from 'lucide-react';

interface ConversationsSectionProps {
}


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
							'pktw-relative pktw-px-2 pktw-py-1.5 pktw-rounded pktw-cursor-pointer pktw-transition-colors pktw-text-[13px] pktw-min-h-7 pktw-flex pktw-items-center pktw-justify-between pktw-gap-2 pktw-break-words',
							showIndicator && 'pktw-pl-6 pktw-pr-2 before:pktw-content-[""] before:pktw-absolute before:pktw-left-2 before:pktw-top-1/2 before:pktw--translate-y-1/2 before:pktw-w-1 before:pktw-h-1 before:pktw-rounded-full before:pktw-transition-opacity',
							// Default state
							!isActive && 'pktw-bg-transparent pktw-text-muted-foreground hover:pktw-bg-muted hover:pktw-text-foreground',
							// Active state
							isActive && '!pktw-bg-primary !pktw-text-primary-foreground hover:!pktw-bg-primary hover:!pktw-text-primary-foreground',
							// Indicator styles when showIndicator is true
							showIndicator && !isActive && 'before:pktw-bg-muted-foreground before:pktw-opacity-40 hover:before:pktw-opacity-80',
							showIndicator && isActive && 'before:!pktw-opacity-100 before:!pktw-bg-primary-foreground'
						)}
						data-conversation-id={conversation.meta.id}
						onClick={() => onConversationClick(conversation)}
						onContextMenu={(e) => onContextMenu(e, conversation)}
					>
						<span className="pktw-flex-1 pktw-min-w-0 pktw-truncate">
							<ConversationTitle 
								title={conversation.meta.title} 
								enableTypewriter={typewriterEnabled.get(conversation.meta.id) ?? false}
								onTypewriterComplete={() => onTypewriterComplete(conversation.meta.id)}
							/>
						</span>
						{conversation.meta.createdAtTimestamp && (
							<div className={cn(
								'pktw-flex pktw-items-center pktw-gap-1 pktw-text-[11px] pktw-shrink-0',
								isActive ? 'pktw-text-primary-foreground/70' : 'pktw-text-muted-foreground/70'
							)}>
								<Calendar className="pktw-w-3 pktw-h-3" />
								{formatRelativeDate(conversation.meta.createdAtTimestamp)}
							</div>
						)}
					</div>
				);
			})}
		</>
	);
};

/**
 * Conversations section component
 */
export const ConversationsSection: React.FC<ConversationsSectionProps> = () => {
	const { app, manager, eventBus } = useServiceContext();
	const {
		conversations,
		activeConversation,
		isConversationsCollapsed,
		setActiveConversation,
		toggleConversationsCollapsed,
		updateConversation,
	} = useProjectStore();
	const { setPendingConversation, setAllConversations } = useChatViewStore();

	const [inputModalOpen, setInputModalOpen] = useState(false);
	const [inputModalConfig, setInputModalConfig] = useState<{
		message: string;
		onSubmit: (value: string | null) => Promise<void>;
		initialValue?: string;
		hintText?: string;
		submitButtonText?: string;
	} | null>(null);

	// Track typewriter state for each conversation
	const [typewriterEnabled, setTypewriterEnabled] = useState<Map<string, boolean>>(new Map());

	const handleNewConversation = async () => {
		setPendingConversation({
			title: DEFAULT_NEW_CONVERSATION_TITLE,
			project: null,
		});
		await notifySelectionChange(app);
	};

	const handleConversationClick = async (conversation: ChatConversation) => {
		setActiveConversation(conversation);
		await notifySelectionChange(app, conversation);
	};

	const handleEditConversationTitle = useCallback((conversation: ChatConversation) => {
		setInputModalConfig({
			message: 'Enter conversation title',
			initialValue: conversation.meta.title,
			onSubmit: async (newTitle: string | null) => {
				if (!newTitle || !newTitle.trim()) return;

				try {
					// updateConversationTitle will trigger ConversationUpdatedEvent
					// The event listener will handle updating the store and enabling typewriter effect
					await manager.updateConversationTitle({
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
	], [app, handleEditConversationTitle]);

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
		const result = Array.from(conversations.values())
			.filter((c) => !c.meta.projectId)
			.sort((a, b) => {
				const timeA = a.meta.createdAtTimestamp || 0;
				const timeB = b.meta.createdAtTimestamp || 0;
				return timeB - timeA;
			});
		console.log('[ConversationsSection] conversationsWithoutProject updated:', {
			count: result.length,
			ids: result.map(c => c.meta.id),
			timestamp: Date.now()
		});
		return result;
	}, [conversations]);

	const conversationsToShow = conversationsWithoutProject.slice(0, MAX_CONVERSATIONS_DISPLAY);
	const hasMoreConversations = conversationsWithoutProject.length > MAX_CONVERSATIONS_DISPLAY;

	return (
		<div className="pktw-flex pktw-flex-col">
			{/* Header */}
			<div
				className="pktw-flex pktw-items-center pktw-justify-between pktw-gap-2 pktw-cursor-pointer pktw-rounded pktw-transition-all hover:pktw-bg-muted hover:pktw-shadow-sm"
				onClick={() => toggleConversationsCollapsed()}
			>
				<div className="pktw-flex pktw-items-center pktw-gap-2">
					{isConversationsCollapsed ? (
						<ChevronRight className="pktw-w-3 pktw-h-3 pktw-shrink-0" />
					) : (
						<ChevronDown className="pktw-w-3 pktw-h-3 pktw-shrink-0" />
					)}
					<h3 className="pktw-flex-1 pktw-m-0 pktw-text-[13px] pktw-font-semibold pktw-text-foreground pktw-uppercase pktw-tracking-wide">Conversations</h3>
				</div>
				<IconButton
					size="lg"
					className="pktw-shrink-0"
					onClick={(e) => {
						e.stopPropagation();
						handleNewConversation();
					}}
					title={DEFAULT_NEW_CONVERSATION_TITLE}
				>
					<Plus />
				</IconButton>
			</div>

			{/* Conversations List */}
			<div className={cn(
				'pktw-flex pktw-flex-col pktw-gap-px pktw-overflow-hidden pktw-transition-all pktw-duration-150 pktw-ease-in-out',
				isConversationsCollapsed
					? 'pktw-max-h-0 pktw-opacity-0'
					: 'pktw-max-h-[5000px] pktw-opacity-100'
			)}>
				{conversationsToShow.length === 0 ? (
					<div className="pktw-p-3 pktw-text-muted-foreground pktw-text-[13px] pktw-italic pktw-text-center">No conversations</div>
				) : (
					<ConversationList
						conversations={conversationsToShow}
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
				)}
				{hasMoreConversations && (
					<div
						className="pktw-flex pktw-items-center pktw-gap-1.5 pktw-px-3 pktw-py-1.5 pktw-mx-2 pktw-my-1 pktw-rounded-md pktw-text-muted-foreground pktw-text-xs pktw-transition-all pktw-cursor-pointer hover:pktw-bg-muted hover:pktw-text-foreground"
						onClick={() => setAllConversations()}
					>
						<MoreHorizontal className="pktw-w-3.5 pktw-h-3.5" />
						<span className="pktw-flex-1">See more</span>
					</div>
				)}
			</div>

			{/* Modal */}
			{inputModalConfig && (
				<InputModal
					open={inputModalOpen}
					onOpenChange={setInputModalOpen}
					message={inputModalConfig.message}
					onSubmit={inputModalConfig.onSubmit}
					initialValue={inputModalConfig.initialValue}
					hintText={inputModalConfig.hintText}
					submitButtonText={inputModalConfig.submitButtonText}
				/>
			)}
		</div>
	);
};

