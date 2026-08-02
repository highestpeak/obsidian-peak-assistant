import React, { useState, useCallback, useMemo } from 'react';
import { ChatConversation } from '@/service/chat/types';
import type { ChatConversationMeta } from '@/core/types/chat';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useChatNavigation } from '@/ui/view/chat-view/useChatNavigation';
import { showContextMenu } from './utils';
import { InputModal } from '@/ui/component/shared-ui/InputModal';
import { MessageSquare } from 'lucide-react';
import { formatNavRowTime } from '@/core/utils/date-utils';
import { NavRow } from './NavRow';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useTypewriterEffect } from '@/ui/component/mine/useTypewriterEffect';
import { TYPEWRITER_EFFECT_SPEED_MS, MAX_CONVERSATIONS_DISPLAY } from '@/core/constant';
import {
	RECENT_BUCKET_ORDER,
	timeBucket,
} from '@/ui/view/chat-studio-view/chatStudioLeftLogic';
import { useChatStudioLeftStrings } from './chatStudioLeftStringsContext';

// ---------------------------------------------------------------------------
// ConversationTitle — pure, with optional typewriter (used by both Pinned /
// Recent / project rows).
// ---------------------------------------------------------------------------

interface ConversationTitleProps {
	title: string;
	enableTypewriter?: boolean;
	onTypewriterComplete?: () => void;
}

export const ConversationTitle: React.FC<ConversationTitleProps> = ({
	title,
	enableTypewriter = false,
	onTypewriterComplete,
}) => {
	const typewriterTitle = useTypewriterEffect({
		text: title,
		speed: TYPEWRITER_EFFECT_SPEED_MS,
		enabled: enableTypewriter,
		onComplete: onTypewriterComplete,
	});
	return <>{enableTypewriter ? typewriterTitle : title}</>;
};

// ---------------------------------------------------------------------------
// ConversationList — reusable list of ChatConversation rows.
// Kept public for ProjectsSection (project-scoped list).
// ---------------------------------------------------------------------------

interface ConversationListProps {
	conversations: ChatConversation[];
	activeConversation: ChatConversation | null;
	typewriterEnabled: Map<string, boolean>;
	onConversationClick: (conversation: ChatConversation) => void;
	onContextMenu: (e: React.MouseEvent, conversation: ChatConversation) => void;
	onTypewriterComplete: (conversationId: string) => void;
	onDragStart?: (e: React.DragEvent, conversation: ChatConversation) => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
	conversations,
	activeConversation,
	typewriterEnabled,
	onConversationClick,
	onContextMenu,
	onTypewriterComplete,
	onDragStart,
}) => {
	const strings = useChatStudioLeftStrings();
	return (
		<>
			{conversations.map((conversation) => {
				const meta = conversation.meta;
				const title = meta.title || strings.untitledLabel;
				return (
					<NavRow
						key={meta.id}
						isChild
						leading={<MessageSquare aria-hidden />}
						label={
							<ConversationTitle
								title={title}
								enableTypewriter={typewriterEnabled.get(meta.id) ?? false}
								onTypewriterComplete={() => onTypewriterComplete(meta.id)}
							/>
						}
						labelTitle={title}
						time={formatNavRowTime(meta.updatedAtTimestamp || meta.createdAtTimestamp || 0)}
						selected={activeConversation?.meta.id === meta.id}
						draggable={!!onDragStart}
						menuLabel={strings.rowMenuLabel}
						dataConversationId={meta.id}
						onClick={() => onConversationClick(conversation)}
						onOpenMenu={(e) => onContextMenu(e, conversation)}
						onDragStart={onDragStart ? (e) => onDragStart(e, conversation) : undefined}
					/>
				);
			})}
		</>
	);
};

// ---------------------------------------------------------------------------
// ConversationsSection — Recent-only. Consumes the parent's already-split
// recentMetas (pinned already removed, project-scoped rows excluded).
// ---------------------------------------------------------------------------

interface ConversationsSectionProps {
	recentMetas: ChatConversationMeta[];
	typewriterEnabled: Map<string, boolean>;
	onTypewriterComplete: (conversationId: string) => void;
	onViewAll: () => void;
	onMenuAction?: () => void;
}

export const ConversationsSection: React.FC<ConversationsSectionProps> = ({
	recentMetas,
	typewriterEnabled,
	onTypewriterComplete,
	onViewAll,
	onMenuAction,
}) => {
	const strings = useChatStudioLeftStrings();
	const { manager, vaultNavigation } = useServiceContext();
	const chatNavigation = useChatNavigation();
	const conversations = useChatDataStore((s) => s.conversations);
	const activeConversation = useChatDataStore((s) => s.activeConversation);

	const [inputModalOpen, setInputModalOpen] = useState(false);
	const [inputModalConfig, setInputModalConfig] = useState<{
		message: string;
		onSubmit: (value: string | null) => Promise<void>;
		initialValue?: string;
		placeholderText?: string;
	} | null>(null);

	// Recent shows only root-level (no projectId) items — project rows live in
	// the Projects section.
	const rootRecentMetas = useMemo(
		() => recentMetas.filter((m) => !m.projectId),
		[recentMetas]
	);

	// The Recent list caps at MAX_CONVERSATIONS_DISPLAY; the header "View all"
	// link (always present) is the single overflow affordance — the mock has no
	// inline "see more" row at the bottom of Recent.
	const visibleRecent = useMemo(
		() => rootRecentMetas.slice(0, MAX_CONVERSATIONS_DISPLAY),
		[rootRecentMetas]
	);

	const grouped = useMemo(() => {
		const buckets = new Map<string, ChatConversationMeta[]>();
		visibleRecent.forEach((meta) => {
			const key = timeBucket(meta.updatedAtTimestamp || meta.createdAtTimestamp || 0);
			const arr = buckets.get(key) || [];
			arr.push(meta);
			buckets.set(key, arr);
		});
		return RECENT_BUCKET_ORDER
			.filter((k) => buckets.has(k))
			.map((k) => ({ label: bucketLabel(k, strings), items: buckets.get(k)! }));
	}, [visibleRecent, strings]);

	const openConversationById = useCallback(async (id: string) => {
		const conv = conversations.get(id) ?? await manager.readConversation(id, false);
		if (conv) await chatNavigation.openConversationInChat(conv);
	}, [chatNavigation, conversations, manager]);

	const handleEditTitle = useCallback((id: string, currentTitle: string) => {
		setInputModalConfig({
			message: strings.menuRename,
			placeholderText: strings.conversationTitlePlaceholder,
			initialValue: currentTitle,
			onSubmit: async (newTitle) => {
				if (!newTitle || !newTitle.trim()) return;
				try {
					await manager.conv.updateConversationTitle({
						conversationId: id,
						title: newTitle.trim(),
					});
				} catch (error) {
					console.error('Failed to update conversation title', error);
				}
			},
		});
		setInputModalOpen(true);
	}, [manager, strings.menuRename]);

	const handleContextMenu = useCallback((e: React.MouseEvent, meta: ChatConversationMeta) => {
		const items: Array<{ title: string; icon: string; onClick: () => void | Promise<void> }> = [];
		items.push({
			title: meta.pinned ? strings.menuUnpin : strings.menuPin,
			icon: meta.pinned ? 'pin-off' : 'pin',
			onClick: async () => {
				await manager.conv.setConversationPinned(meta.id, !meta.pinned);
				onMenuAction?.();
			},
		});
		items.push({
			title: strings.menuRename,
			icon: 'pencil',
			onClick: () => handleEditTitle(meta.id, meta.title),
		});
		items.push({
			title: strings.menuOpenSource,
			icon: 'file-text',
			onClick: async () => {
				const conv = conversations.get(meta.id) ?? await manager.readConversation(meta.id, false);
				if (conv?.file) await vaultNavigation.openSourceFile(conv.file);
			},
		});
		items.push({
			title: meta.archived ? strings.menuRestore : strings.menuArchive,
			icon: meta.archived ? 'archive-restore' : 'archive',
			onClick: async () => {
				await manager.conv.setConversationArchived(meta.id, !meta.archived);
				onMenuAction?.();
			},
		});
		items.push({
			title: strings.menuDelete,
			icon: 'trash',
			onClick: async () => {
				const doc = e.currentTarget?.ownerDocument ?? document;
				const win = doc.defaultView ?? window;
				const ok = win.confirm(`${strings.deleteConfirmTitle}\n\n${strings.deleteConfirmBody}`);
				if (!ok) return;
				await manager.conv.deleteConversation(meta.id);
				const { conversations: current, setConversations, activeConversation: active, setActiveConversation } = useChatDataStore.getState();
				const updated = Array.from(current.values()).filter((c) => c.meta.id !== meta.id);
				setConversations(updated);
				if (active?.meta.id === meta.id) setActiveConversation(null);
				onMenuAction?.();
			},
		});
		showContextMenu(e, items);
	}, [conversations, handleEditTitle, manager, onMenuAction, strings, vaultNavigation]);

	return (
		<div className="pkstudio-nav-section">
			<div className="pkstudio-section-label">
				<span className="pkstudio-section-label__lead">{strings.recentHeader}</span>
				<button type="button" className="pkstudio-section-link" onClick={onViewAll}>
					{strings.viewAllLabel}
				</button>
			</div>

			{visibleRecent.length === 0 ? (
				<div className="pktw-p-3 pktw-text-muted-foreground pktw-text-pk-md pktw-italic pktw-text-center">
					{strings.recentEmpty}
				</div>
			) : (
				grouped.map((bucket) => (
					<div className="pkstudio-recent-group" key={bucket.label}>
						<div className="pkstudio-section-label pkstudio-subsection-label">
							<span className="pkstudio-section-label__lead">{bucket.label}</span>
						</div>
						{bucket.items.map((meta) => {
							const title = meta.title || strings.untitledLabel;
							return (
								<NavRow
									key={meta.id}
									leading={<MessageSquare aria-hidden />}
									label={
										<ConversationTitle
											title={title}
											enableTypewriter={typewriterEnabled.get(meta.id) ?? false}
											onTypewriterComplete={() => onTypewriterComplete(meta.id)}
										/>
									}
									labelTitle={title}
									time={formatNavRowTime(meta.updatedAtTimestamp || meta.createdAtTimestamp || 0)}
									selected={activeConversation?.meta.id === meta.id}
									draggable
									menuLabel={strings.rowMenuLabel}
									dataConversationId={meta.id}
									onClick={() => void openConversationById(meta.id)}
									onOpenMenu={(e) => handleContextMenu(e, meta)}
									onDragStart={(e) => {
										e.dataTransfer.setData('application/x-peak-conversation-id', meta.id);
										e.dataTransfer.effectAllowed = 'move';
									}}
								/>
							);
						})}
					</div>
				))
			)}

			{inputModalConfig && (
				<InputModal
					open={inputModalOpen}
					onOpenChange={setInputModalOpen}
					message={inputModalConfig.message}
					onSubmit={inputModalConfig.onSubmit}
					initialValue={inputModalConfig.initialValue}
					placeholderText={inputModalConfig.placeholderText}
				/>
			)}
		</div>
	);
};

function bucketLabel(k: string, strings: ReturnType<typeof useChatStudioLeftStrings>): string {
	if (k === 'Today') return strings.groupToday;
	if (k === 'Yesterday') return strings.groupYesterday;
	if (k === 'This week') return strings.groupThisWeek;
	if (k === 'Earlier') return strings.groupEarlier;
	return k;
}
