import React from 'react';
import { useChatStudioStrings } from '../../chatStudioStringsContext';

export type ProjectTabId = 'conversations' | 'starred' | 'resources' | 'plans';

interface ProjectTabsBarProps {
	activeTab: ProjectTabId;
	onChange: (tab: ProjectTabId) => void;
	counts: Record<ProjectTabId, number>;
}

/**
 * Project tab bar (chat-studio §9 / PROJ-01, audit P6). Active tab is marked by
 * an ::after underline (immune to the border-style reset that blanked the old
 * `pktw-border-b-2`). Labels + counts from strings; arrow-key nav.
 */
export const ProjectTabsBar: React.FC<ProjectTabsBarProps> = ({
	activeTab, onChange, counts,
}) => {
	const strings = useChatStudioStrings().projectHome;
	const tabs: Array<{ id: ProjectTabId; label: string }> = [
		{ id: 'conversations', label: strings.tabConversations },
		{ id: 'starred', label: strings.tabStarred },
		{ id: 'resources', label: strings.tabResources },
		{ id: 'plans', label: strings.tabPlans },
	];

	const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
		if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
		e.preventDefault();
		const i = tabs.findIndex(t => t.id === activeTab);
		const next = e.key === 'ArrowLeft' ? (i - 1 + tabs.length) % tabs.length : (i + 1) % tabs.length;
		onChange(tabs[next].id);
	};

	return (
		<div
			role="tablist"
			aria-label={strings.tabsAriaLabel}
			onKeyDown={onKeyDown}
			className="pkchat-projtabs"
		>
			{tabs.map((tab) => (
				<button
					key={tab.id}
					type="button"
					role="tab"
					aria-selected={activeTab === tab.id}
					tabIndex={activeTab === tab.id ? 0 : -1}
					onClick={() => onChange(tab.id)}
					className="pkchat-projtabs__tab"
					data-active={activeTab === tab.id ? 'true' : 'false'}
				>
					<span>{tab.label}</span>
					<small className="pkchat-projtabs__count">{counts[tab.id]}</small>
				</button>
			))}
		</div>
	);
};
