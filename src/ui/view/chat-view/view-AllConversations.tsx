import React, { useState, useEffect, useCallback } from 'react';
import { ChatConversation } from '@/service/chat/types';
import { formatRelativeDate } from '@/ui/view/shared/date-utils';
import { cn } from '@/ui/react/lib/utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { ConversationItem } from '@/ui/view/chat-view/components/conversation-item';

interface AllConversationsViewProps {
	onConversationClick: (conversation: ChatConversation) => void;
}

const CONVERSATIONS_PAGE_SIZE = 20;

/**
 * View component for displaying all standalone conversations
 */
export const AllConversationsViewComponent: React.FC<AllConversationsViewProps> = ({
	onConversationClick,
}) => {
	const { manager } = useServiceContext();
	const [conversations, setConversations] = useState<ChatConversation[]>([]);
	const [conversationsPage, setConversationsPage] = useState(0);
	const [loading, setLoading] = useState(true);

	// Load conversations
	const loadConversations = useCallback(async (page: number) => {
		const allConversations = await manager.listConversations();
		
		// Sort by createdAtTimestamp descending (newest first)
		allConversations.sort((a, b) => {
			const timeA = a.meta.createdAtTimestamp || 0;
			const timeB = b.meta.createdAtTimestamp || 0;
			return timeB - timeA;
		});

		// Filter to only standalone conversations (no projectId)
		const standaloneConversations = allConversations.filter(
			(c) => !c.meta.projectId
		);

		const startIndex = page * CONVERSATIONS_PAGE_SIZE;
		const endIndex = startIndex + CONVERSATIONS_PAGE_SIZE;
		const newConversations = standaloneConversations.slice(startIndex, endIndex);

		return {
			conversations: newConversations,
			hasMore: endIndex < standaloneConversations.length,
			total: standaloneConversations.length,
		};
	}, [manager]);

	// Initial load
	useEffect(() => {
		const loadFirstPage = async () => {
			setLoading(true);
			const result = await loadConversations(0);
			setConversations(result.conversations);
			setConversationsPage(1);
			setLoading(false);
		};
		loadFirstPage();
	}, [loadConversations]);

	// Setup infinite scroll
	const sentinelRef = React.useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!sentinelRef.current) return;

		const observer = new IntersectionObserver(
			async (entries) => {
				entries.forEach(async (entry) => {
					if (entry.isIntersecting) {
						const result = await loadConversations(conversationsPage);
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
	}, [conversationsPage, loadConversations]);

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

