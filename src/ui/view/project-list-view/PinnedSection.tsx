import React, { useCallback } from 'react';
import { Pin } from 'lucide-react';
import type { ChatConversationMeta } from '@/core/types/chat';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useChatNavigation } from '@/ui/view/chat-view/useChatNavigation';
import { formatNavRowTime } from '@/core/utils/date-utils';
import { showContextMenu } from './utils';
import { NavRow } from './NavRow';
import { useChatStudioLeftStrings } from './chatStudioLeftStringsContext';

interface PinnedSectionProps {
	pinnedMetas: ChatConversationMeta[];
	onMenuAction?: () => void;
}

/**
 * PinnedSection — L-PIN-01. Renders pinned conversations at the top of the
 * left column, ordered by `pinnedAt` desc. Rows share the visual language of
 * the Recent list but are guaranteed to dedupe against Recent (the parent
 * splits pinned vs recent before rendering).
 */
export const PinnedSection: React.FC<PinnedSectionProps> = ({ pinnedMetas, onMenuAction }) => {
	const strings = useChatStudioLeftStrings();
	const { manager, vaultNavigation } = useServiceContext();
	const chatNavigation = useChatNavigation();
	const activeConversation = useChatDataStore((s) => s.activeConversation);
	const conversations = useChatDataStore((s) => s.conversations);

	const handleRowClick = useCallback(async (id: string) => {
		const conv = conversations.get(id);
		if (conv) {
			await chatNavigation.openConversationInChat(conv);
			return;
		}
		// Meta-only cache miss — hydrate then open.
		const full = await manager.readConversation(id, false);
		if (full) await chatNavigation.openConversationInChat(full);
	}, [chatNavigation, conversations, manager]);

	const handleContextMenu = useCallback((e: React.MouseEvent, meta: ChatConversationMeta) => {
		const items = [
			{
				title: strings.menuUnpin,
				icon: 'pin-off',
				onClick: async () => {
					await manager.conv.setConversationPinned(meta.id, false);
					onMenuAction?.();
				},
			},
			{
				title: strings.menuOpenSource,
				icon: 'file-text',
				onClick: async () => {
					const conv = conversations.get(meta.id) ?? await manager.readConversation(meta.id, false);
					if (conv) await vaultNavigation.openSourceFile(conv.file);
				},
			},
		];
		showContextMenu(e, items);
	}, [conversations, manager, onMenuAction, strings.menuOpenSource, strings.menuUnpin, vaultNavigation]);

	if (pinnedMetas.length === 0) return null;

	return (
		<div className="pkstudio-nav-section">
			<div className="pkstudio-section-label">
				<span className="pkstudio-section-label__lead">
					<Pin aria-hidden />
					{strings.pinnedHeader}
				</span>
				<span className="pkstudio-section-label__count">{pinnedMetas.length}</span>
			</div>
			{pinnedMetas.map((meta) => {
				const title = meta.title || strings.untitledLabel;
				return (
					<NavRow
						key={meta.id}
						leading={<Pin aria-hidden />}
						label={title}
						labelTitle={title}
						time={formatNavRowTime(meta.updatedAtTimestamp || meta.createdAtTimestamp || 0)}
						selected={activeConversation?.meta.id === meta.id}
						menuLabel={strings.rowMenuLabel}
						onClick={() => void handleRowClick(meta.id)}
						onOpenMenu={(e) => handleContextMenu(e, meta)}
					/>
				);
			})}
		</div>
	);
};
