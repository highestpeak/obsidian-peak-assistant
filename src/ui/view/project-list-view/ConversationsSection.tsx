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
	conversationId: string;
}

/**
 * Component for displaying conversation title with typewriter effect
 * Only triggers typewriter effect when:
 * - Conversation is newly created
 * - Title is updated
 */
const ConversationTitle: React.FC<ConversationTitleProps> = ({ conversationId }) => {
	const { eventBus } = useServiceContext();
	const storeConversations = useProjectStore((state) => state.conversations);
	const conversation = storeConversations.get(conversationId);

	// Current title from store
	const currentTitle = conversation?.meta.title || '';

	// Display title state (used for typewriter effect)
	const [displayTitle, setDisplayTitle] = useState(currentTitle);

	// Whether to show typewriter effect
	const [shouldTypewriter, setShouldTypewriter] = useState(false);

	// Track the last title we've processed (to avoid duplicate updates)
	const lastProcessedTitleRef = React.useRef<string>(currentTitle);

	// Listen for conversation created event - enable typewriter for new conversations
	useEffect(() => {
		const unsubscribeCreated = eventBus.on<ConversationCreatedEvent>(
			ViewEventType.CONVERSATION_CREATED,
			(event) => {
				if (event.conversationId === conversationId) {
					setShouldTypewriter(true);
				}
			}
		);

		return () => {
			unsubscribeCreated();
		};
	}, [eventBus, conversationId]);

	// Listen for conversation title updates via event - enable typewriter effect
	useEffect(() => {
		const unsubscribe = eventBus.on<ConversationUpdatedEvent>(
			ViewEventType.CONVERSATION_UPDATED,
			(event) => {
				if (event.conversation.meta.id === conversationId) {
					const newTitle = event.conversation.meta.title;
					// Only trigger typewriter if title actually changed
					if (lastProcessedTitleRef.current !== newTitle) {
						lastProcessedTitleRef.current = newTitle;
						setDisplayTitle(newTitle);
						setShouldTypewriter(true);
					}
				}
			}
		);

		return () => {
			unsubscribe();
		};
	}, [eventBus, conversationId]);

	// Sync title from store when it changes (without typewriter effect)
	// This handles cases where conversation is updated directly in store without events
	useEffect(() => {
		if (!currentTitle) {
			return;
		}

		// Only update if title actually changed and we're not in typewriter mode
		if (lastProcessedTitleRef.current !== currentTitle && !shouldTypewriter) {
			lastProcessedTitleRef.current = currentTitle;
			setDisplayTitle(currentTitle);
		}
	}, [currentTitle, shouldTypewriter]);

	// Apply typewriter effect only when shouldTypewriter is true
	const typewriterTitle = useTypewriterEffect({
		text: displayTitle,
		speed: TYPEWRITER_EFFECT_SPEED_MS,
		enabled: shouldTypewriter,
		onComplete: () => {
			// Disable typewriter after completion
			setShouldTypewriter(false);
		},
	});

	// If typewriter is disabled, just show the title directly
	return <>{shouldTypewriter ? typewriterTitle : displayTitle}</>;
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
					await manager.updateConversationTitle({
						conversationId: conversation.meta.id,
						title: newTitle.trim(),
					});
					const updatedConversation = await manager.readConversation(conversation.meta.id, false);
					if (!updatedConversation) {
						throw new Error('Failed to update conversation title');
					}

					// Update conversation in store
					updateConversation(updatedConversation);

					// Update active conversation if it's the active one - React components will auto-update
					if (activeConversation?.meta.id === conversation.meta.id) {
						setActiveConversation(updatedConversation);
					}
				} catch (error) {
					console.error('Failed to update conversation title', error);
				}
			},
		});
		setInputModalOpen(true);
	}, [manager, updateConversation, setActiveConversation]);

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

	// Listen for conversation updates to ensure UI stays in sync
	useEffect(() => {
		const unsubscribe = eventBus.on<ConversationUpdatedEvent>(
			ViewEventType.CONVERSATION_UPDATED,
			async (event) => {
				const conversation = event.conversation;
				// Update conversation in store (if not already updated)
				// This ensures the conversation list automatically updates
				updateConversation(conversation);
			}
		);

		return () => {
			unsubscribe();
		};
	}, [eventBus, updateConversation]);

	// Get root-level conversations (without projectId)
	const conversationsWithoutProject = useMemo(() => {
		return Array.from(conversations.values())
			.filter((c) => !c.meta.projectId)
			.sort((a, b) => {
				const timeA = a.meta.createdAtTimestamp || 0;
				const timeB = b.meta.createdAtTimestamp || 0;
				return timeB - timeA;
			});
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
					conversationsToShow.map((conversation) => {
						const isActive =
							activeConversation?.meta.id === conversation.meta.id;
						return (
							<div
								key={conversation.meta.id}
								className={cn(
									'pktw-px-2 pktw-py-1.5 pktw-rounded pktw-cursor-pointer pktw-transition-colors pktw-text-[13px] pktw-min-h-7 pktw-flex pktw-items-center pktw-justify-between pktw-gap-2 pktw-break-words',
									// Default state
									!isActive && 'pktw-bg-transparent pktw-text-muted-foreground hover:pktw-bg-muted hover:pktw-text-foreground',
									// Active state
									isActive && '!pktw-bg-primary !pktw-text-primary-foreground hover:!pktw-bg-primary hover:!pktw-text-primary-foreground'
								)}
								data-conversation-id={conversation.meta.id}
								onClick={() => handleConversationClick(conversation)}
								onContextMenu={(e) => handleContextMenu(e, conversation)}
							>
								<div className="pktw-flex-1 pktw-min-w-0 pktw-truncate">
									<ConversationTitle conversationId={conversation.meta.id} />
								</div>
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
					})
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

