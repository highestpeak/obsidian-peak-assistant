import React from 'react';
import { Star, ExternalLink } from 'lucide-react';
import { useConversationLoad } from '../../hooks/useConversationLoad';
import { useChatStudioStrings } from '../../chatStudioStringsContext';
import { ProjectSectionHead } from './ProjectSectionHead';
import type { StarredEntry } from '../../hooks/useProjectLoad';

interface ProjectStarredTabProps {
	entries: StarredEntry[];
}

/**
 * Starred tab (chat-studio §9, audit new-3). Section head + single bordered list
 * of two-row rows (star seat + message excerpt + conversation meta + open icon).
 */
export const ProjectStarredTab: React.FC<ProjectStarredTabProps> = ({ entries }) => {
	const strings = useChatStudioStrings().projectHome;
	const { openConvAndScroll2Msg } = useConversationLoad();

	return (
		<section className="pkchat-projsection">
			<ProjectSectionHead
				title={strings.starredSectionTitle}
				desc={strings.starredSectionDesc}
			/>
			{entries.length === 0 ? (
				<div className="pkchat-projempty">{strings.starredEmpty}</div>
			) : (
				<div className="pkchat-projlist">
					{entries.map((entry, i) => {
						const raw = entry.message.content || '';
						const preview = raw.length > 140 ? raw.substring(0, 140) + '…' : raw;
						return (
							<button
								key={`${entry.conversation.meta.id}-${entry.message.id}-${i}`}
								type="button"
								className="pkchat-projrow"
								onClick={() => openConvAndScroll2Msg(entry.conversation.meta.id, entry.message.id)}
							>
								<span className="pkchat-projrow__icon" aria-hidden>
									<Star className="pktw-fill-pk-warning pktw-text-pk-warning" />
								</span>
								<span className="pkchat-projrow__copy">
									<span className="pkchat-projrow__title">{preview || entry.conversation.meta.title}</span>
									<span className="pkchat-projrow__meta">{entry.conversation.meta.title}</span>
								</span>
								<span className="pkchat-projrow__end">
									<ExternalLink className="pkchat-projrow__chevron" aria-hidden />
								</span>
							</button>
						);
					})}
				</div>
			)}
		</section>
	);
};
