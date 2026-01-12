import React, { useState, useEffect, useCallback } from 'react';
import { ChatConversation } from '@/service/chat/types';
import { ConversationItem } from './conversation-item';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useConversationLoad } from '../hooks';
import { cn } from '@/ui/react/lib/utils';

export interface ConversationListProps {
	containerClass?: string;
	/**
	 * Optional project ID to filter conversations by project
	 * If not provided, loads all standalone conversations
	 */
	projectId?: string;
	/**
	 * Maximum length of conversation preview text
	 */
	maxPreviewLength?: number;
	/**
	 * Loading text to display while loading
	 */
	loadingText?: string;
	/**
	 * Empty state text to display when no conversations
	 */
	emptyText?: string;
}

const CONVERSATIONS_PAGE_SIZE = 20;

/**
 * Generic conversation list component with pagination and infinite scroll
 */
export const ConversationList: React.FC<ConversationListProps> = ({
	containerClass,
	projectId,
	maxPreviewLength = 100,
	loadingText = "Loading conversations...",
	emptyText = "No conversations yet.",
}) => {
	const { manager } = useServiceContext();
	const { loadConversation } = useConversationLoad();

	const [conversations, setConversations] = useState<ChatConversation[]>([]);
	const [conversationsPage, setConversationsPage] = useState(0);
	const [loading, setLoading] = useState(true);
	const [hasMore, setHasMore] = useState(true);

	// Load conversations function
	const loadConversations = useCallback(async (page: number) => {
		// Load current page + 1 extra to check if there's more
		const conversationsWithExtra = await manager.listConversations(
			projectId || null,
			CONVERSATIONS_PAGE_SIZE + 1,
			page * CONVERSATIONS_PAGE_SIZE
		);

		// If projectId is provided, load all conversations for that project
		// If not, filter to only standalone conversations (no projectId)
		let filteredConversations = conversationsWithExtra;
		if (!projectId) {
			filteredConversations = conversationsWithExtra.filter(
				(c) => !c.meta.projectId
			);
		}

		const conversations = filteredConversations.slice(0, CONVERSATIONS_PAGE_SIZE);
		const hasMore = filteredConversations.length > CONVERSATIONS_PAGE_SIZE;

		return {
			conversations,
			hasMore,
		};
	}, [manager, projectId]);

	// Initial load
	useEffect(() => {
		const loadFirstPage = async () => {
			setLoading(true);
			try {
				const result = await loadConversations(0);
				setConversations(result.conversations);
				setHasMore(result.hasMore);
				setConversationsPage(1);
			} catch (error) {
				console.error('Failed to load conversations:', error);
			} finally {
				setLoading(false);
			}
		};
		loadFirstPage();
	}, [loadConversations]);

	// Setup infinite scroll
	const sentinelRef = React.useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!sentinelRef.current || !hasMore) return;

		const observer = new IntersectionObserver(
			async (entries) => {
				entries.forEach(async (entry) => {
					if (entry.isIntersecting && hasMore) {
						try {
							const result = await loadConversations(conversationsPage);
							if (result.conversations.length > 0) {
								setConversations((prev) => [...prev, ...result.conversations]);
								setHasMore(result.hasMore);
								setConversationsPage((prev) => prev + 1);
							} else {
								setHasMore(false);
							}
						} catch (error) {
							console.error('Failed to load more conversations:', error);
							setHasMore(false);
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
	}, [conversationsPage, loadConversations, hasMore]);

	if (loading && conversations.length === 0) {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-text-muted-foreground">
				{loadingText}
			</div>
		);
	}

	if (conversations.length === 0) {
		return (
			<div className="pktw-flex pktw-items-center pktw-justify-center pktw-h-full pktw-text-muted-foreground">
				{emptyText}
			</div>
		);
	}

	return (
		<div className={cn("pktw-flex pktw-flex-col pktw-h-full pktw-overflow-y-auto", containerClass)}>
			<div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-p-4">
				{conversations.map((conversation) => (
					<ConversationItem
						key={conversation.meta.id}
						conversation={conversation}
						onClick={() => loadConversation(conversation.meta.id)}
						maxPreviewLength={maxPreviewLength}
					/>
				))}
			</div>

			{/* Scroll sentinel for infinite scroll */}
			{hasMore && (
				<div
					ref={sentinelRef}
					className="pktw-h-4 pktw-w-full"
					aria-hidden="true"
				/>
			)}
		</div>
	);
};