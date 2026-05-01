import React, { useState, useCallback } from 'react';
import { ChatProject, ChatConversation } from '@/service/chat/types';
import { formatRelativeDate } from '@/core/utils/date-utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { Folder, MessageSquare, FileText, Search, ClipboardList } from 'lucide-react';
import { InputModal } from '@/ui/component/shared-ui/InputModal';
import { useChatViewStore } from './store/chatViewStore';
import { useChatDataStore } from '@/ui/store/chatDataStore';
import { DEFAULT_NEW_CONVERSATION_TITLE } from '@/core/constant';
import { hydrateProjects } from '@/ui/view/project-list-view/utils';
import { Button } from '@/ui/component/shared-ui/button';
import {
	DEFAULT_CONVERSATION_TYPE,
} from '@/service/chat/conversation-types';
import { ConversationTypeIcon } from '@/ui/component/mine/ConversationTypeIcon';

const RECENT_CONVERSATIONS_LIMIT = 5;
const RECENT_PROJECTS_LIMIT = 5;

function getGreeting(): string {
	const h = new Date().getHours();
	if (h < 12) return 'Good morning';
	if (h < 18) return 'Good afternoon';
	return 'Good evening';
}

interface SuggestionCard {
	icon: React.ReactNode;
	label: string;
	description: string;
	action: () => void;
}

/**
 * Home view component showing greeting, suggestion cards, recent conversations and projects
 */
export const HomeViewComponent: React.FC = () => {
	const { app, manager } = useServiceContext();
	const chatViewStore = useChatViewStore();
	const { projects, conversations } = useChatDataStore();
	const { setPendingConversation } = chatViewStore;

	// State for input modal
	const [inputModalOpen, setInputModalOpen] = useState(false);
	const [inputModalConfig, setInputModalConfig] = useState<{
		message: string;
		onSubmit: (value: string | null) => Promise<void>;
		initialValue?: string;
		placeholderText?: string;
		hintText?: string;
		submitButtonText?: string;
	} | null>(null);

	// Derived data
	const allConversations = Array.from(conversations.values())
		.sort((a, b) => (b.meta.createdAtTimestamp || 0) - (a.meta.createdAtTimestamp || 0));
	const recentConversations = allConversations.slice(0, RECENT_CONVERSATIONS_LIMIT);
	const recentProjects = Array.from(projects.values())
		.sort((a, b) => (b.meta.createdAtTimestamp || 0) - (a.meta.createdAtTimestamp || 0))
		.slice(0, RECENT_PROJECTS_LIMIT);

	// Count conversations per project
	const conversationCountByProject = useCallback(() => {
		const counts = new Map<string, number>();
		for (const conv of conversations.values()) {
			const pid = conv.meta.projectId;
			if (pid) counts.set(pid, (counts.get(pid) || 0) + 1);
		}
		return counts;
	}, [conversations]);

	// ── Handlers ──

	const handleConversationClick = useCallback((conversation: ChatConversation) => {
		chatViewStore.setConversation(conversation);
	}, [chatViewStore]);

	const handleProjectClick = useCallback((project: ChatProject) => {
		chatViewStore.setProjectOverview(project);
	}, [chatViewStore]);

	const handleCreateConversation = useCallback(async () => {
		setPendingConversation({
			title: DEFAULT_NEW_CONVERSATION_TITLE,
			project: null,
		});
		await app.workspace.trigger('layout-ready');
	}, [setPendingConversation, app]);

	const handleCreateProject = useCallback(() => {
		setInputModalConfig({
			message: 'Create Project',
			placeholderText: 'Project name',
			hintText: 'Projects keep chats, files, and custom instructions in one place. Use them for ongoing work, or just to keep things tidy.',
			submitButtonText: 'Create project',
			onSubmit: async (name: string | null) => {
				if (!name || !name.trim()) return;
				await manager.createProject({ name: name.trim() });
				await hydrateProjects(manager);
			},
		});
		setInputModalOpen(true);
	}, [manager]);

	// ── Suggestion cards ──

	const suggestionCards: SuggestionCard[] = [
		{
			icon: <MessageSquare className="pktw-w-5 pktw-h-5 pktw-text-muted-foreground" />,
			label: 'Continue last chat',
			description: 'Pick up where you left off',
			action: () => {
				const latest = allConversations[0];
				if (latest) {
					chatViewStore.setConversation(latest);
				} else {
					handleCreateConversation();
				}
			},
		},
		{
			icon: <FileText className="pktw-w-5 pktw-h-5 pktw-text-muted-foreground" />,
			label: 'Summarize recent notes',
			description: 'Get a digest of what changed',
			action: () => {
				setPendingConversation({ title: 'Summarize recent notes', project: null });
				chatViewStore.setChatMode('chat');
			},
		},
		{
			icon: <Search className="pktw-w-5 pktw-h-5 pktw-text-muted-foreground" />,
			label: 'Research a topic',
			description: 'Deep-dive with an AI agent',
			action: () => {
				setPendingConversation({ title: 'Research', project: null });
				chatViewStore.setChatMode('agent');
			},
		},
		{
			icon: <ClipboardList className="pktw-w-5 pktw-h-5 pktw-text-muted-foreground" />,
			label: 'Plan a project',
			description: 'Break down goals into steps',
			action: () => {
				setPendingConversation({ title: 'New plan', project: null });
				chatViewStore.setChatMode('plan');
			},
		},
	];

	const projectCounts = conversationCountByProject();

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-overflow-y-auto">
			<div className="pktw-flex-1 pktw-p-6 pktw-space-y-6">
				{/* Greeting */}
				<div className="pktw-flex pktw-flex-col pktw-gap-1">
					<span className="pktw-text-xl pktw-font-semibold pktw-text-foreground">
						{getGreeting()}
					</span>
					<span className="pktw-text-sm pktw-text-muted-foreground">
						What would you like to explore?
					</span>
				</div>

				{/* Suggestion cards — 2x2 grid */}
				<div className="pktw-grid pktw-grid-cols-2 pktw-gap-3">
					{suggestionCards.map((card) => (
						<div
							key={card.label}
							className="pktw-flex pktw-flex-col pktw-gap-1 pktw-p-3 pktw-rounded-lg pktw-border pktw-border-border pktw-bg-card hover:pktw-border-[var(--pk-accent,#6d28d9)] hover:pktw-bg-accent/5 pktw-cursor-pointer pktw-transition-all"
							onClick={card.action}
						>
							{card.icon}
							<span className="pktw-text-sm pktw-font-medium pktw-text-foreground">
								{card.label}
							</span>
							<span className="pktw-text-xs pktw-text-muted-foreground">
								{card.description}
							</span>
						</div>
					))}
				</div>

				{/* Recent Conversations */}
				{recentConversations.length > 0 && (
					<div className="pktw-flex pktw-flex-col pktw-gap-1">
						<div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-1">
							<span className="pktw-text-sm pktw-font-semibold pktw-text-foreground">
								Recent Conversations
							</span>
							<Button
								variant="ghost"
								onClick={() => chatViewStore.setAllConversations()}
								className="pktw-text-xs pktw-font-medium pktw-h-auto pktw-py-0.5 pktw-px-1.5"
							>
								View all →
							</Button>
						</div>
						{recentConversations.map((conversation) => {
							const convType = conversation.meta.conversationType ?? DEFAULT_CONVERSATION_TYPE;
							return (
								<div
									key={conversation.meta.id}
									className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-rounded-md hover:pktw-bg-muted pktw-cursor-pointer pktw-transition-colors"
									onClick={() => handleConversationClick(conversation)}
								>
									<ConversationTypeIcon type={convType} className="pktw-w-3.5 pktw-h-3.5 pktw-text-muted-foreground pktw-flex-shrink-0" />
									<span className="pktw-flex-1 pktw-truncate pktw-text-sm">
										{conversation.meta.title}
									</span>
									<span className="pktw-text-[10px] pktw-text-muted-foreground">
										{formatRelativeDate(conversation.meta.createdAtTimestamp)}
									</span>
								</div>
							);
						})}
					</div>
				)}

				{/* Projects */}
				{recentProjects.length > 0 && (
					<div className="pktw-flex pktw-flex-col pktw-gap-1">
						<div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-1">
							<span className="pktw-text-sm pktw-font-semibold pktw-text-foreground">
								Projects
							</span>
							<Button
								variant="ghost"
								onClick={() => chatViewStore.setAllProjects()}
								className="pktw-text-xs pktw-font-medium pktw-h-auto pktw-py-0.5 pktw-px-1.5"
							>
								View all →
							</Button>
						</div>
						{recentProjects.map((project) => (
							<div
								key={project.meta.id}
								className="pktw-flex pktw-items-center pktw-gap-2 pktw-px-3 pktw-py-2 pktw-rounded-md hover:pktw-bg-muted pktw-cursor-pointer pktw-transition-colors"
								onClick={() => handleProjectClick(project)}
							>
								<Folder className="pktw-w-4 pktw-h-4 pktw-text-muted-foreground" />
								<span className="pktw-flex-1 pktw-truncate pktw-text-sm">
									{project.meta.name}
								</span>
								<span className="pktw-text-[10px] pktw-text-muted-foreground">
									{projectCounts.get(project.meta.id) || 0} chats
								</span>
							</div>
						))}
						<Button
							variant="ghost"
							onClick={handleCreateProject}
							className="pktw-flex pktw-items-center pktw-gap-2 pktw-justify-start pktw-px-3 pktw-py-2 pktw-text-xs pktw-text-muted-foreground pktw-h-auto hover:pktw-text-foreground"
						>
							+ New project
						</Button>
					</div>
				)}
			</div>

			{/* Input Modal */}
			{inputModalConfig && (
				<InputModal
					open={inputModalOpen}
					onOpenChange={(open) => {
						setInputModalOpen(open);
						if (!open) {
							setInputModalConfig(null);
						}
					}}
					message={inputModalConfig.message}
					placeholderText={inputModalConfig.placeholderText}
					hintText={inputModalConfig.hintText}
					submitButtonText={inputModalConfig.submitButtonText}
					initialValue={inputModalConfig.initialValue}
					onSubmit={inputModalConfig.onSubmit}
				/>
			)}
		</div>
	);
};
