import React, { useState, useCallback, useMemo } from 'react';
import { ParsedConversationFile } from '@/service/chat/types';
import { openSourceFile } from '@/ui/view/shared/view-utils';
import { useProjectStore } from '@/ui/store/projectStore';
import { useChatViewStore } from '../chat-view/store/chatViewStore';
import { notifySelectionChange, showContextMenu } from './utils';
import { InputModal } from '@/ui/component/shared-ui/InputModal';
import { Button } from '@/ui/component/shared-ui/button';
import { IconButton } from '@/ui/component/shared-ui/icon-button';
import { ChevronDown, ChevronRight, Plus, Pencil, FileText } from 'lucide-react';
import { cn } from '@/ui/react/lib/utils';
import { useServiceContext } from '@/ui/context/ServiceContext';

interface ConversationsSectionProps {
}

/**
 * Conversations section component
 */
export const ConversationsSection: React.FC<ConversationsSectionProps> = () => {
	const { app, manager } = useServiceContext();
	const {
		conversations,
		activeConversation,
		isConversationsCollapsed,
		setActiveConversation,
		toggleConversationsCollapsed,
		updateConversation,
	} = useProjectStore();
	const { setPendingConversation } = useChatViewStore();

	const isConversationActive = useCallback((conversation: ParsedConversationFile): boolean => {
		return activeConversation?.meta.id === conversation.meta.id;
	}, [activeConversation]);

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
			title: 'New Conversation',
			project: null,
		});
		await notifySelectionChange(app);
	};

	const handleConversationClick = async (conversation: ParsedConversationFile) => {
		setActiveConversation(conversation);
		await notifySelectionChange(app, conversation);
	};

	const handleEditConversationTitle = useCallback((conversation: ParsedConversationFile) => {
		setInputModalConfig({
			message: 'Enter conversation title',
			initialValue: conversation.meta.title,
			onSubmit: async (newTitle: string | null) => {
				if (!newTitle || !newTitle.trim()) return;

				try {
					const updatedConversation = await manager.updateConversationTitle({
						conversation,
						project: null,
						title: newTitle.trim(),
					});

					// Update conversation in store
					updateConversation(updatedConversation);

					// Update active conversation if it's the active one - React components will auto-update
					if (isConversationActive(conversation)) {
						setActiveConversation(updatedConversation);
					}
				} catch (error) {
					console.error('Failed to update conversation title', error);
				}
			},
		});
		setInputModalOpen(true);
	}, [manager, updateConversation, setActiveConversation, isConversationActive]);

	// Menu item configurations
	const conversationMenuItems = useCallback((conversation: ParsedConversationFile) => [
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

	const handleContextMenu = (e: React.MouseEvent, conversation: ParsedConversationFile) => {
		const menuItems = conversationMenuItems(conversation);
		showContextMenu(e, menuItems);
	};

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
					title="New Conversation"
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
				{conversationsWithoutProject.length === 0 ? (
					<div className="pktw-p-3 pktw-text-muted-foreground pktw-text-[13px] pktw-italic pktw-text-center">No conversations</div>
				) : (
					conversationsWithoutProject.map((conversation) => {
						const isActive =
							activeConversation?.meta.id === conversation.meta.id;
						return (
							<div
								key={conversation.meta.id}
								className={cn(
									'pktw-px-2 pktw-py-1.5 pktw-rounded pktw-cursor-pointer pktw-transition-colors pktw-text-[13px] pktw-min-h-7 pktw-flex pktw-items-center pktw-break-words',
									// Default state
									!isActive && 'pktw-bg-transparent pktw-text-muted-foreground hover:pktw-bg-muted hover:pktw-text-foreground',
									// Active state
									isActive && '!pktw-bg-primary !pktw-text-primary-foreground hover:!pktw-bg-primary hover:!pktw-text-primary-foreground'
								)}
								data-conversation-id={conversation.meta.id}
								onClick={() => handleConversationClick(conversation)}
								onContextMenu={(e) => handleContextMenu(e, conversation)}
							>
								{conversation.meta.title}
							</div>
						);
					})
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

