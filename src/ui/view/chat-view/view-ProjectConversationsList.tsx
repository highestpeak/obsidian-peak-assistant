import React, { useState, useEffect, useCallback } from 'react';
import { ChatConversation, ChatProject } from '@/service/chat/types';
import { formatRelativeDate } from '@/ui/view/shared/date-utils';
import { cn } from '@/ui/react/lib/utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useProjectStore } from '@/ui/store/projectStore';
import { ConversationItem } from '@/ui/view/chat-view/components/conversation-item';

interface ProjectConversationsListViewProps {
	projectId: string;
	onConversationClick: (conversation: ChatConversation) => void;
}

const CONVERSATIONS_PAGE_SIZE = 20;

/**
 * View component for displaying all conversations for a specific project
 */
export const ProjectConversationsListViewComponent: React.FC<ProjectConversationsListViewProps> = ({
	projectId,
	onConversationClick,
}) => {
	const { manager } = useServiceContext();
	const projects = useProjectStore((state) => state.projects);
	const project = projectId ? projects.get(projectId) || null : null;

	const [conversations, setConversations] = useState<ChatConversation[]>([]);
	const [conversationsPage, setConversationsPage] = useState(0);
	const [loading, setLoading] = useState(true);

	// Load conversations for the project
	const loadConversations = useCallback(async (page: number, projectMeta: ChatProject['meta']) => {
		const allConversations = await manager.listConversations(projectMeta.id);
		
		// Sort by createdAtTimestamp descending (newest first)
		allConversations.sort((a, b) => {
			const timeA = a.meta.createdAtTimestamp || 0;
			const timeB = b.meta.createdAtTimestamp || 0;
			return timeB - timeA;
		});

		const startIndex = page * CONVERSATIONS_PAGE_SIZE;
		const endIndex = startIndex + CONVERSATIONS_PAGE_SIZE;
		const newConversations = allConversations.slice(startIndex, endIndex);

		return {
			conversations: newConversations,
			hasMore: endIndex < allConversations.length,
			total: allConversations.length,
		};
	}, [manager]);

	// Initial load
	useEffect(() => {
		if (!project) return;

		const loadFirstPage = async () => {
			setLoading(true);
			const result = await loadConversations(0, project.meta);
			setConversations(result.conversations);
			setConversationsPage(1);
			setLoading(false);
		};
		loadFirstPage();
	}, [project, loadConversations]);

	// Setup infinite scroll
	const sentinelRef = React.useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!sentinelRef.current || !project) return;

		const observer = new IntersectionObserver(
			async (entries) => {
				entries.forEach(async (entry) => {
					if (entry.isIntersecting) {
						const result = await loadConversations(conversationsPage, project.meta);
						if (result.conversations.length > 0) {
							setConversations((prev) => [...prev, ...result.conversations]);
							setConversationsPage((prev) => prev + 1);
						}
					}
				});
			},
			{ threshold: 0.1 }
		);

		observer.observe(sentinelRef.current);

		return () => {
			observer.disconnect();
		};
	}, [conversationsPage, project, loadConversations]);

	if (!project) {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-text-muted-foreground">
				Project not found
			</div>
		);
	}

	if (loading) {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-text-muted-foreground">
				Loading conversations...
			</div>
		);
	}

	if (conversations.length === 0) {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-text-muted-foreground">
				No conversations yet.
			</div>
		);
	}

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-overflow-y-auto">
			{/* Project Header */}
			<div className="pktw-flex pktw-items-center pktw-gap-2 pktw-p-4 pktw-border-b pktw-border-border">
				<h2 className="pktw-text-lg pktw-font-semibold pktw-text-foreground pktw-m-0">
					{project.meta.name}
				</h2>
				<span className="pktw-text-sm pktw-text-muted-foreground">
					({conversations.length} conversation{conversations.length !== 1 ? 's' : ''})
				</span>
			</div>

			{/* Conversations List */}
			<div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-p-4">
				{conversations.map((conversation) => (
					<ConversationItem
						key={conversation.meta.id}
						conversation={conversation}
						onClick={onConversationClick}
						maxPreviewLength={100}
					/>
				))}
			</div>

			{/* Scroll sentinel for infinite scroll */}
			<div
				ref={sentinelRef}
				className="pktw-h-4 pktw-w-full"
				aria-hidden="true"
			/>
		</div>
	);
};

