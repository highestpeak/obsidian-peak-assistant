import React, { useState } from 'react';
import { Folder } from 'lucide-react';
import { useProjectLoad } from './hooks';
import { useChatViewStore } from './store/chatViewStore';
import { Composer } from './components/Composer';
import { ChatStartState, ChatStarters } from './components/composer/ChatStartState';
import {
	ChatStudioStringsProvider,
	useChatStudioStrings,
} from './chatStudioStringsContext';
import { useChatNavigation } from './useChatNavigation';
import { ProjectIdentityRow } from './components/project-home/ProjectIdentityRow';
import { ProjectStatsRow } from './components/project-home/ProjectStatsRow';
import { ProjectDescriptionEditor } from './components/project-home/ProjectDescriptionEditor';
import { ProjectTabsBar, type ProjectTabId } from './components/project-home/ProjectTabsBar';
import { ProjectConversationsTab } from './components/project-home/ProjectConversationsTab';
import { ProjectStarredTab } from './components/project-home/ProjectStarredTab';
import { ProjectResourcesTab } from './components/project-home/ProjectResourcesTab';
import { ProjectPlansTab } from './components/project-home/ProjectPlansTab';
import { DEFAULT_NEW_CONVERSATION_TITLE } from '@/core/constant';
import type { ChatProject, ChatConversation } from '@/service/chat/types';

/**
 * Project overview view (chat-studio §9 / Track E, audit P1-P10 + new-1..5).
 *
 * Layout (top → bottom), matching the interactive mock's project route:
 *   0. 44px header bar (project name + "Project home" scope).
 *   1. Identity hero: accent icon + PROJECT eyebrow + name + inline description
 *      + solid-accent "New conversation" CTA.
 *   2. Inline stats (conversations / messages / starred / resources).
 *   3. Start surface: project greeting → project-scoped Composer → starters.
 *   4. Tabs: Conversations / Starred / Resources / Plans (::after underline).
 */
export const ProjectOverviewViewComponent: React.FC = () => {
	return (
		<ChatStudioStringsProvider>
			<ProjectOverviewBody />
		</ChatStudioStringsProvider>
	);
};

const ProjectOverviewBody: React.FC = () => {
	const projectForOverview = useChatViewStore((s) => s.projectForOverview);
	const projectId = projectForOverview?.meta.id ?? null;
	const chatNavigation = useChatNavigation();
	const strings = useChatStudioStrings();

	const {
		project,
		conversations,
		starredEntries,
		resourceRows,
		totalMessages,
		plans,
		reloadPlans,
	} = useProjectLoad(projectId);

	const [activeTab, setActiveTab] = useState<ProjectTabId>('conversations');

	if (!projectId || !project) return <ProjectOverviewUnavailable />;

	const counts: Record<ProjectTabId, number> = {
		conversations: conversations.length,
		starred: starredEntries.length,
		resources: resourceRows.length,
		plans: plans.length,
	};

	const onNewConversation = () => {
		void chatNavigation.openPendingConversationInChat({
			title: DEFAULT_NEW_CONVERSATION_TITLE,
			project,
		});
	};

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-overflow-hidden">
			<div className="pkchat-header">
				<span className="pkchat-header__title">{project.meta.name}</span>
				<span className="pkchat-header__scope">{strings.projectHome.headerScope}</span>
			</div>

			<div className="pktw-flex-1 pktw-overflow-y-auto">
				<div className="pktw-w-full pktw-max-w-[840px] pktw-mx-auto pktw-px-7 pktw-pt-[22px] pktw-pb-[30px] pktw-flex pktw-flex-col">
					<ProjectHero project={project} conversations={conversations} onNewConversation={onNewConversation} />

					<ProjectStatsRow
						conversations={counts.conversations}
						messages={totalMessages}
						starred={counts.starred}
						resources={counts.resources}
					/>

					<div className="pktw-w-full pktw-max-w-[760px] pktw-mx-auto pktw-mt-5 pktw-mb-[18px] pktw-flex pktw-flex-col">
						<ChatStartState scope="project" />
						<Composer />
						<ChatStarters scope="project" />
					</div>

					<ProjectTabsBar
						activeTab={activeTab}
						onChange={setActiveTab}
						counts={counts}
					/>

					<div>
						{activeTab === 'conversations' && (
							<ProjectConversationsTab
								conversations={conversations}
								onNewConversation={onNewConversation}
							/>
						)}
						{activeTab === 'starred' && (
							<ProjectStarredTab entries={starredEntries} />
						)}
						{activeTab === 'resources' && (
							<ProjectResourcesTab rows={resourceRows} />
						)}
						{activeTab === 'plans' && (
							<ProjectPlansTab
								projectId={projectId}
								plans={plans}
								conversations={conversations}
								onReload={reloadPlans}
							/>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

/**
 * Keep the Project Home reference geometry when a routed project is missing or
 * still resolving. A one-line early return makes the shell jump and erases the
 * summary/tabs contract merely because its data is unavailable.
 */
const ProjectOverviewUnavailable: React.FC = () => {
	const strings = useChatStudioStrings().projectHome;
	const zeroCounts: Record<ProjectTabId, number> = {
		conversations: 0,
		starred: 0,
		resources: 0,
		plans: 0,
	};
	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-overflow-hidden">
			<div className="pkchat-header">
				<span className="pkchat-header__title">{strings.unavailableTitle}</span>
				<span className="pkchat-header__scope">{strings.headerScope}</span>
			</div>
			<div className="pktw-flex-1 pktw-overflow-y-auto">
				<div className="pktw-w-full pktw-max-w-[840px] pktw-mx-auto pktw-px-7 pktw-pt-[22px] pktw-pb-[30px] pktw-flex pktw-flex-col">
					<section className="pkchat-projhero" aria-live="polite">
						<span className="pkchat-projhero__icon" aria-hidden><Folder /></span>
						<div className="pkchat-projhero__copy">
							<span className="pkchat-projhero__eyebrow">{strings.eyebrow}</span>
							<span className="pkchat-projhero__name">{strings.unavailableTitle}</span>
							<span className="pkchat-projdesc-display pkchat-projdesc-display--empty">
								<span>{strings.unavailableDetail}</span>
							</span>
						</div>
					</section>
					<ProjectStatsRow conversations={0} messages={0} starred={0} resources={0} />
					<div className="pkchat-project-unavailable" role="status">
						{strings.unavailableDetail}
					</div>
					<ProjectTabsBar activeTab="conversations" onChange={() => undefined} counts={zeroCounts} disabled />
				</div>
			</div>
		</div>
	);
};

// ─────────────────────────────────────────────────────────────────────────────
// Hero — composes the identity grid with the inline description editor so the
// grid can top-align while the description panel is open (audit P3/P9).
// ─────────────────────────────────────────────────────────────────────────────

interface ProjectHeroProps {
	project: ChatProject;
	conversations: ChatConversation[];
	onNewConversation: () => void;
}

const ProjectHero: React.FC<ProjectHeroProps> = ({ project, conversations, onNewConversation }) => {
	const [descEditing, setDescEditing] = useState(false);
	return (
		<ProjectIdentityRow
			project={project}
			onNewConversation={onNewConversation}
			isEditing={descEditing}
			description={
				<ProjectDescriptionEditor
					project={project}
					conversations={conversations}
					onEditingChange={setDescEditing}
				/>
			}
		/>
	);
};
