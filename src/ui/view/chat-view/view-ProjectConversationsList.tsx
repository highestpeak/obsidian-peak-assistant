import React from 'react';
import { ConversationList } from '@/ui/view/chat-view/components/conversation-list';
import { useChatViewStore } from './store/chatViewStore';

interface ProjectConversationsListViewProps {
}

/**
 * View component for displaying all conversations for a specific project
 */
export const ProjectConversationsListViewComponent: React.FC<ProjectConversationsListViewProps> = ({
}) => {
	const store = useChatViewStore();
	const project = store.projectForOverview;

	if (!project) {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-text-muted-foreground">
				Project not found
			</div>
		);
	}

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full">
			{/* Project Header */}
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-p-4 pktw-border-b pktw-border-border">
				<h2 className="pktw-text-lg pktw-font-semibold pktw-text-foreground pktw-m-0">
					{project.meta.name}
				</h2>
			</div>

			{/* Conversations List */}
			<div className="pktw-flex-1 pktw-overflow-hidden">
				<ConversationList
					projectId={project.meta.id}
					maxPreviewLength={150}
					emptyText="No conversations in this project yet."
				/>
			</div>
		</div>
	);
};