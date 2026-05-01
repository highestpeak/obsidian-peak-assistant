import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChatConversation } from '@/service/chat/types';
import { ConversationItem } from './conversation-item';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useConversationLoad } from '../hooks';
import { cn } from '@/ui/react/lib/utils';
import { Search } from 'lucide-react';

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

function getDateGroup(timestamp: number): string {
	const now = Date.now();
	const days = Math.floor((now - timestamp) / 86400000);
	if (days === 0) return 'Today';
	if (days <= 7) return 'This Week';
	return 'Older';
}

const DATE_GROUP_ORDER: Record<string, number> = { 'Today': 0, 'This Week': 1, 'Older': 2 };

/**
 * Generic conversation list component with search, date grouping, pagination and infinite scroll
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
	const [searchQuery, setSearchQuery] = useState('');

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

	// Filter by search query and group by date
	const groupedConversations = useMemo(() => {
		const query = searchQuery.trim().toLowerCase();
		const filtered = query
			? conversations.filter((c) => c.meta.title.toLowerCase().includes(query))
			: conversations;

		const groups: Record<string, ChatConversation[]> = {};
		for (const conv of filtered) {
			const group = getDateGroup(conv.meta.createdAtTimestamp);
			if (!groups[group]) groups[group] = [];
			groups[group].push(conv);
		}

		// Sort groups by predefined order
		return Object.entries(groups)
			.sort(([a], [b]) => (DATE_GROUP_ORDER[a] ?? 99) - (DATE_GROUP_ORDER[b] ?? 99));
	}, [conversations, searchQuery]);

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
			{/* Search input */}
			<div className="pktw-px-4 pktw-pt-3 pktw-pb-1">
				<div className="pktw-relative">
					<Search className="pktw-absolute pktw-left-2.5 pktw-top-1/2 pktw--translate-y-1/2 pktw-h-3.5 pktw-w-3.5 pktw-text-muted-foreground pktw-pointer-events-none" />
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Search conversations..."
						className="pktw-w-full pktw-rounded-md pktw-border pktw-border-solid pktw-border-border-default pktw-bg-background pktw-py-1.5 pktw-pl-8 pktw-pr-3 pktw-text-sm pktw-text-foreground placeholder:pktw-text-muted-foreground focus:pktw-outline-none focus:pktw-ring-1 focus:pktw-ring-ring"
					/>
				</div>
			</div>

			{/* Grouped conversation list */}
			<div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-p-4 pktw-pt-2">
				{groupedConversations.length === 0 && (
					<div className="pktw-text-sm pktw-text-muted-foreground pktw-text-center pktw-py-6">
						No matching conversations.
					</div>
				)}
				{groupedConversations.map(([groupLabel, convs]) => (
					<div key={groupLabel}>
						<span className="pktw-text-[9px] pktw-font-semibold pktw-uppercase pktw-tracking-wider pktw-text-muted-foreground pktw-px-4 pktw-py-2">
							{groupLabel.toUpperCase()}
						</span>
						<div className="pktw-flex pktw-flex-col pktw-gap-1 pktw-mt-1">
							{convs.map((conversation) => (
								<ConversationItem
									key={conversation.meta.id}
									conversation={conversation}
									onClick={() => loadConversation(conversation.meta.id)}
									onDelete={async (c) => {
										await manager.deleteConversation(c.meta.id);
										setConversations((prev) => prev.filter((x) => x.meta.id !== c.meta.id));
									}}
									maxPreviewLength={maxPreviewLength}
								/>
							))}
						</div>
					</div>
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
