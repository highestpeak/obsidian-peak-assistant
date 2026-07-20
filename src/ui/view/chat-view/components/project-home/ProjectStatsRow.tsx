import React from 'react';
import { useChatStudioStrings } from '../../chatStudioStringsContext';

interface ProjectStatsRowProps {
	conversations: number;
	messages: number;
	starred: number;
	resources: number;
}

/**
 * Inline project stats (chat-studio §9 / PROJ-01, audit P10). Four counters
 * separated by thin vertical rules — bold number + tertiary label, no cards.
 * Indented to align with the hero copy column. Labels come from strings.
 */
export const ProjectStatsRow: React.FC<ProjectStatsRowProps> = ({
	conversations, messages, starred, resources,
}) => {
	const s = useChatStudioStrings().projectHome;
	const items: Array<{ value: number; label: string }> = [
		{ value: conversations, label: s.statsConversations },
		{ value: messages, label: s.statsMessages },
		{ value: starred, label: s.statsStarred },
		{ value: resources, label: s.statsResources },
	];
	return (
		<div className="pkchat-projstats" aria-label={s.statsConversations}>
			{items.map((item) => (
				<span key={item.label}>
					<strong>{item.value}</strong>
					<small>{item.label}</small>
				</span>
			))}
		</div>
	);
};
