import React, { useEffect, useState } from 'react';
import { MessageSquare, ChevronRight, SquarePen, Trash2 } from 'lucide-react';
import { formatRelativeDate } from '@/core/utils/date-utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { useConversationLoad } from '../../hooks/useConversationLoad';
import { useChatStudioStrings } from '../../chatStudioStringsContext';
import { ProjectSectionHead } from './ProjectSectionHead';
import type { ChatConversation } from '@/service/chat/types';

interface ProjectConversationsTabProps {
	conversations: ChatConversation[];
	onNewConversation: () => void;
}

/**
 * Project conversations tab (chat-studio §9 / PROJ-01, audit P7). Purpose-built
 * for the project home — a single bordered list of compact two-row rows, NO
 * search box and NO date grouping (those live in the ALL_CONVERSATIONS view).
 * Delete is a hover-only secondary action per the mock anatomy.
 */
export const ProjectConversationsTab: React.FC<ProjectConversationsTabProps> = ({
	conversations,
	onNewConversation,
}) => {
	const allStrings = useChatStudioStrings();
	const strings = allStrings.projectHome;
	const { manager } = useServiceContext();
	const { loadConversation } = useConversationLoad();

	// Local mirror so hover-deletes drop the row without a full project reload.
	const [rows, setRows] = useState<ChatConversation[]>(conversations);
	useEffect(() => setRows(conversations), [conversations]);

	const remove = async (conversation: ChatConversation) => {
		const win = typeof window !== 'undefined' ? window : undefined;
		const confirmed = win?.confirm?.(allStrings.leftColumn.deleteConfirmTitle) ?? true;
		if (!confirmed) return;
		await manager.conv.deleteConversation(conversation.meta.id);
		setRows((prev) => prev.filter((c) => c.meta.id !== conversation.meta.id));
	};

	return (
		<section className="pkchat-projsection">
			<ProjectSectionHead
				title={strings.conversationsSectionTitle}
				desc={strings.conversationsSectionDesc}
				action={{
					label: strings.newConversationLabel,
					icon: <SquarePen />,
					onClick: onNewConversation,
				}}
			/>
			{rows.length === 0 ? (
				<div className="pkchat-projempty">{strings.conversationsEmpty}</div>
			) : (
				<div className="pkchat-projlist">
					{rows.map((conversation) => (
						<button
							key={conversation.meta.id}
							type="button"
							className="pkchat-projrow"
							onClick={() => void loadConversation(conversation.meta.id)}
						>
							<span className="pkchat-projrow__icon" aria-hidden>
								<MessageSquare />
							</span>
							<span className="pkchat-projrow__copy">
								<span className="pkchat-projrow__title">{conversation.meta.title}</span>
								{conversation.meta.createdAtTimestamp && (
									<span className="pkchat-projrow__meta">
										{formatRelativeDate(conversation.meta.createdAtTimestamp)}
									</span>
								)}
							</span>
							<span className="pkchat-projrow__end">
								<ChevronRight className="pkchat-projrow__chevron" aria-hidden />
								<span
									role="button"
									tabIndex={-1}
									aria-label={allStrings.leftColumn.menuDelete}
									className="pkchat-projrow__delete"
									onClick={(e) => { e.stopPropagation(); void remove(conversation); }}
								>
									<Trash2 aria-hidden />
								</span>
							</span>
						</button>
					))}
				</div>
			)}
		</section>
	);
};
