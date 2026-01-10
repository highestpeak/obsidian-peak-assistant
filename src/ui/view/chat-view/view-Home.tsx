import React, { useState, useCallback } from 'react';
import { ChatProject, ChatConversation } from '@/service/chat/types';
import { formatRelativeDate } from '@/ui/view/shared/date-utils';
import { cn } from '@/ui/react/lib/utils';
import { useServiceContext } from '@/ui/context/ServiceContext';
import { ConversationItem } from '@/ui/view/chat-view/components/conversation-item';
import { Folder, Plus, MessageSquare } from 'lucide-react';
import { InputModal } from '@/ui/component/shared-ui/InputModal';
import { useChatViewStore } from './store/chatViewStore';
import { useProjectStore } from '@/ui/store/projectStore';
import { DEFAULT_NEW_CONVERSATION_TITLE } from '@/core/constant';
import { hydrateProjects } from '@/ui/view/project-list-view/utils';
import { Button } from '@/ui/component/shared-ui/button';

const RECENT_CONVERSATIONS_LIMIT = 5;
const RECENT_PROJECTS_LIMIT = 5;

/**
 * Home view component showing recent conversations and projects with quick actions
 */
export const HomeViewComponent: React.FC = () => {
	const { app, manager } = useServiceContext();
	const chatViewStore = useChatViewStore();
	const { projects, conversations } = useProjectStore();
	const { setPendingConversation } = chatViewStore;
	const [loading, setLoading] = useState(true);

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

	// Get recent conversations and projects
	const getRecentConversations = useCallback(() => {
		const allConversations = Array.from(conversations.values());
		return allConversations
			.sort((a, b) => (b.meta.createdAtTimestamp || 0) - (a.meta.createdAtTimestamp || 0))
			.slice(0, RECENT_CONVERSATIONS_LIMIT);
	}, [conversations]);

	const getRecentProjects = useCallback(() => {
		const allProjects = Array.from(projects.values());
		return allProjects
			.sort((a, b) => (b.meta.createdAtTimestamp || 0) - (a.meta.createdAtTimestamp || 0))
			.slice(0, RECENT_PROJECTS_LIMIT);
	}, [projects]);

	// Handle project click
	const handleProjectClick = useCallback((project: ChatProject) => {
		chatViewStore.setProjectOverview(project);
	}, [chatViewStore]);

	// Handle conversation click
	const handleConversationClick = useCallback((conversation: ChatConversation) => {
		chatViewStore.setConversation(conversation);
	}, [chatViewStore]);

	// Handle create new project
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

	// Handle create new conversation
	const handleCreateConversation = useCallback(async () => {
		setPendingConversation({
			title: DEFAULT_NEW_CONVERSATION_TITLE,
			project: null,
		});
		// Trigger selection change to enter conversation mode
		await app.workspace.trigger('layout-ready');
	}, [setPendingConversation, app]);

	const recentConversations = getRecentConversations();
	const recentProjects = getRecentProjects();

	return (
		<div className="pktw-flex pktw-flex-col pktw-h-full pktw-overflow-y-auto">
			{/* Header */}
			<div className="pktw-px-6 pktw-py-4 pktw-border-b pktw-border-border">
				<h1 className="pktw-text-2xl pktw-font-semibold pktw-text-foreground">Home</h1>
				<p className="pktw-text-sm pktw-text-muted-foreground pktw-mt-1">
					Welcome back! Here's what's recent and quick actions to get started.
				</p>
			</div>

			{/* Content */}
			<div className="pktw-flex-1 pktw-p-6 pktw-space-y-8">
				{/* Quick Actions */}
				<section>
					<h2 className="pktw-text-lg pktw-font-semibold pktw-text-foreground pktw-mb-4">
						Quick Actions
					</h2>
					<div className="pktw-flex pktw-flex-row pktw-gap-6">
						<Button
							className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-6 pktw-py-4 pktw-bg-secondary pktw-text-secondary-foreground hover:pktw-bg-primary hover:pktw-text-primary-foreground pktw-rounded-lg pktw-transition-colors pktw-font-medium"
							onClick={handleCreateConversation}
							title="Start a new conversation"
						>
							<MessageSquare className="pktw-w-6 pktw-h-6" />
							<span>New Conversation</span>
						</Button>
						<Button
							className="pktw-flex pktw-items-center pktw-gap-3 pktw-px-6 pktw-py-4 pktw-bg-secondary pktw-text-secondary-foreground hover:pktw-bg-primary hover:pktw-text-primary-foreground pktw-rounded-lg pktw-transition-colors pktw-font-medium"
							onClick={handleCreateProject}
							title="Create a new project"
						>
							<Folder className="pktw-w-6 pktw-h-6" />
							<span>New Project</span>
						</Button>
					</div>
				</section>

				{/* Recent Conversations */}
				<section>
					<div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-4">
						<h2 className="pktw-text-lg pktw-font-semibold pktw-text-foreground">
							Recent Conversations
						</h2>
						{recentConversations.length > 0 && (
							<Button
								variant="ghost"
								onClick={() => chatViewStore.setAllConversations()}
								className="pktw-text-sm pktw-font-medium"
							>
								View all
							</Button>
						)}
					</div>

					{recentConversations.length === 0 ? (
						<div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-py-12 pktw-text-muted-foreground">
							<MessageSquare className="pktw-w-12 pktw-h-12 pktw-mb-4 pktw-opacity-50" />
							<p className="pktw-text-center">No conversations yet.</p>
							<p className="pktw-text-sm pktw-text-center pktw-mt-1">
								Start your first conversation to see it here.
							</p>
						</div>
					) : (
						<div className="pktw-flex pktw-flex-col pktw-gap-2">
							{recentConversations.map((conversation) => (
								<ConversationItem
									key={conversation.meta.id}
									conversation={conversation}
									onClick={handleConversationClick}
									maxPreviewLength={80}
								/>
							))}
						</div>
					)}
				</section>

				{/* Recent Projects */}
				<section>
					<div className="pktw-flex pktw-items-center pktw-justify-between pktw-mb-4">
						<h2 className="pktw-text-lg pktw-font-semibold pktw-text-foreground">
							Recent Projects
						</h2>
						{recentProjects.length > 0 && (
							<Button
								variant="ghost"
								onClick={() => chatViewStore.setAllProjects()}
								className="pktw-text-sm pktw-font-medium"
							>
								View all
							</Button>
						)}
					</div>

					{recentProjects.length === 0 ? (
						<div className="pktw-flex pktw-flex-col pktw-items-center pktw-justify-center pktw-py-12 pktw-text-muted-foreground">
							<Folder className="pktw-w-12 pktw-h-12 pktw-mb-4 pktw-opacity-50" />
							<p className="pktw-text-center">No projects yet.</p>
							<p className="pktw-text-sm pktw-text-center pktw-mt-1">
								Create your first project to see it here.
							</p>
						</div>
					) : (
						<div className="pktw-grid pktw-grid-cols-1 md:pktw-grid-cols-2 lg:pktw-grid-cols-3 pktw-gap-4">
							{recentProjects.map((project) => (
								<div
									key={project.meta.id}
									className={cn(
										'pktw-flex pktw-flex-col pktw-gap-3 pktw-p-4 pktw-rounded-lg',
										'pktw-border pktw-border-border pktw-bg-card',
										'pktw-cursor-pointer pktw-transition-all',
										'hover:pktw-shadow-md hover:pktw-border-primary/50'
									)}
									onClick={() => handleProjectClick(project)}
								>
									{/* Project name */}
									<div className="pktw-flex pktw-items-center pktw-gap-2">
										<Folder className="pktw-w-5 pktw-h-5 pktw-text-muted-foreground" />
										<h3 className="pktw-text-lg pktw-font-semibold pktw-text-foreground pktw-m-0">
											{project.meta.name}
										</h3>
									</div>

									{/* Project summary */}
									<div className="pktw-text-sm pktw-text-muted-foreground pktw-line-clamp-2">
										{project.context?.shortSummary || 'No summary available.'}
									</div>

									{/* Project metadata */}
									<div className="pktw-flex pktw-items-center pktw-justify-between pktw-text-xs pktw-text-muted-foreground">
										<span>
											{project.meta.createdAtTimestamp
												? formatRelativeDate(project.meta.createdAtTimestamp)
												: 'Unknown date'
											}
										</span>
									</div>
								</div>
							))}
						</div>
					)}
				</section>
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