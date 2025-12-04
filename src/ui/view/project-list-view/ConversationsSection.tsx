import React, { useState, useCallback, useMemo } from 'react';
import { App } from 'obsidian';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { ParsedConversationFile } from 'src/service/chat/types';
import { openSourceFile } from '../shared/view-utils';
import { useProjectStore } from '../../store/projectStore';
import { useChatViewStore } from '../../store/chatViewStore';
import { notifySelectionChange, showContextMenu } from './utils';
import { InputModal } from './InputModal';
import { Button } from '../../component/shared-ui/button';
import { ChevronDown, ChevronRight, Plus, Pencil, FileText } from 'lucide-react';

interface ConversationsSectionProps {
	manager: AIServiceManager;
	app: App;
}

/**
 * Conversations section component
 */
export const ConversationsSection: React.FC<ConversationsSectionProps> = ({
	manager,
	app,
}) => {
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
		<div
			className={`peak-project-list-view__section ${isConversationsCollapsed ? 'is-collapsed' : ''}`}
		>
			{/* Header */}
			<div
				className="peak-project-list-view__header pktw-flex pktw-items-center pktw-gap-2 pktw-cursor-pointer"
				onClick={() => toggleConversationsCollapsed()}
			>
				{isConversationsCollapsed ? (
					<ChevronRight className="peak-icon pktw-w-3 pktw-h-3" />
				) : (
					<ChevronDown className="peak-icon pktw-w-3 pktw-h-3" />
				)}
				<h3 className="pktw-flex-1">Conversations</h3>
				<Button
					variant="ghost"
					size="icon"
					className="pktw-h-6 pktw-w-6"
					onClick={(e) => {
						e.stopPropagation();
						handleNewConversation();
					}}
					title="New Conversation"
				>
					<Plus className="pktw-h-3.5 pktw-w-3.5" />
				</Button>
			</div>

			{/* Conversations List */}
			{!isConversationsCollapsed && (
				<div className="peak-project-list-view__list">
					{conversationsWithoutProject.length === 0 ? (
						<div className="peak-project-list-view__empty">No conversations</div>
					) : (
						conversationsWithoutProject.map((conversation) => {
							const isActive =
								activeConversation?.meta.id === conversation.meta.id;
							return (
								<div
									key={conversation.meta.id}
									className={`peak-project-list-view__item ${isActive ? 'is-active' : ''}`}
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
			)}

			{/* Modal */}
			{inputModalConfig && (
				<InputModal
					open={inputModalOpen}
					onOpenChange={setInputModalOpen}
					message={inputModalConfig.message}
					onSubmit={inputModalConfig.onSubmit}
					initialValue={inputModalConfig.initialValue}
				/>
			)}
		</div>
	);
};

