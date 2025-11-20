import { App, IconName, ItemView, WorkspaceLeaf } from 'obsidian';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { ParsedConversationFile, ParsedProjectFile } from 'src/service/chat/types';
import { createIcon, createChevronIcon } from 'src/core/IconHelper';
import { IChatView, IMessageHistoryView, IProjectListView } from './view-interfaces';
import { ProjectsSection, IProjectsSectionContext } from './project-list-view/ProjectsSection';
import { ConversationsSection, IConversationsSectionContext } from './project-list-view/ConversationsSection';

export const PROJECT_LIST_VIEW_TYPE = 'peak-project-list-view';

/**
 * Left sidebar view displaying projects and conversations list
 */
export class ProjectListView extends ItemView implements IProjectListView {

	// Section components
	private projectsSection: ProjectsSection;
	private conversationsSection: ConversationsSection;

	constructor(leaf: WorkspaceLeaf, private readonly manager: AIServiceManager) {
		super(leaf);
		
		// Create section components with context
		this.projectsSection = new ProjectsSection(
			this.manager,
			this.app,
			{
				notifySelectionChange: (conversation) => this.notifySelectionChange(conversation),
				isConversationActive: (conversation) => {
					const activeConversation = this.conversationsSection.getActiveConversation();
					return activeConversation?.meta.id === conversation.meta.id;
				},
				render: () => this.render()
			}
		);
		this.conversationsSection = new ConversationsSection(
			this.manager,
			this.app,
			{
				notifySelectionChange: () => this.notifySelectionChange(),
				render: () => this.render()
			}
		);
	}

	getViewType(): string {
		return PROJECT_LIST_VIEW_TYPE;
	}

	getDisplayText(): string {
		return 'Projects & Conversations';
	}

	getIcon(): IconName {
		return 'message-circle';
	}

	async onOpen(): Promise<void> {
		this.containerEl.empty();
		this.containerEl.addClass('peak-project-list-view');

		// Initial render
		await this.handleRefresh();
	}

	async onClose(): Promise<void> {
		this.containerEl.empty();
	}

	/**
	 * Handle manual refresh button click or auto-refresh when view becomes active
	 */
	private async handleRefresh(): Promise<void> {
		try {
			// Reset expanded state
			this.projectsSection.clearExpandedProjects();

			// Refresh data
			await this.hydrateData();

			// Re-render
			await this.render();

			// Notify other views of selection changes
			await this.notifySelectionChange();
		} catch (error) {
			console.error('Error refreshing:', error);
		}
	}

	private async hydrateData(): Promise<void> {
		const settings = this.manager.getSettings();

		// Hydrate projects data
		await this.projectsSection.hydrateProjects();
		const projects = this.projectsSection.getProjects();

		// Validate and update activeProject reference to use latest project object
		const activeProject = this.projectsSection.getActiveProject();
		if (activeProject) {
			const latestProject = projects.find(
				p => p.meta.id === activeProject.meta.id
			);
			if (latestProject) {
				// Update to use latest project object (in case metadata changed)
				this.projectsSection.setActiveProject(latestProject);
			} else {
				// Project no longer exists
				this.projectsSection.setActiveProject(null);
			}
		}

		// Hydrate conversations data
		await this.conversationsSection.hydrateConversations();
		const conversations = this.conversationsSection.getConversations();

		// Handle activeProject based on rootMode
		if (settings.rootMode === 'project-first' && projects.length > 0) {
			if (!this.projectsSection.getActiveProject()) {
				this.projectsSection.setActiveProject(projects[0]);
			}
		} else {
			this.projectsSection.setActiveProject(null);
		}

		// Validate and update activeConversation reference to use latest conversation object
		const activeConversation = this.conversationsSection.getActiveConversation();
		if (activeConversation) {
			const latestConversation = conversations.find(
				c => c.meta.id === activeConversation.meta.id
			);
			if (latestConversation) {
				// Update to use latest conversation object (in case metadata changed)
				this.conversationsSection.setActiveConversation(latestConversation);
			} else {
				// Conversation no longer exists
				this.conversationsSection.setActiveConversation(null);
			}
		}

		// Set default activeConversation if none is selected
		if (!this.conversationsSection.getActiveConversation() && conversations.length > 0) {
			this.conversationsSection.setActiveConversation(conversations[0]);
		}
	}

	private async render(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();

		// Render toolbar
		this.renderToolbar(containerEl);

		// Render projects section
		await this.projectsSection.render(containerEl);

		// Render conversations section
		this.conversationsSection.render(containerEl);
	}

	/**
	 * Render toolbar with refresh and collapse all buttons
	 */
	private renderToolbar(containerEl: HTMLElement): void {
		const toolbar = containerEl.createDiv({ cls: 'peak-project-list-view__toolbar' });

		// Refresh button
		const refreshBtn = toolbar.createEl('button', {
			cls: 'peak-project-list-view__toolbar-btn',
			attr: { title: 'Refresh projects and conversations' }
		});
		createIcon(refreshBtn, 'refreshCw', {
			size: 14,
			strokeWidth: 2,
			class: 'peak-icon'
		});
		refreshBtn.addEventListener('click', () => {
			this.handleRefresh();
		});

		// Collapse all button
		const collapseAllBtn = toolbar.createEl('button', {
			cls: 'peak-project-list-view__toolbar-btn',
			attr: { title: 'Collapse all projects' }
		});
		collapseAllBtn.createSpan({ text: '−' });
		collapseAllBtn.addEventListener('click', () => {
			this.projectsSection.clearExpandedProjects();
			this.render();
		});
	}

	/**
	 * Notify other views about selection change
	 */
	private async notifySelectionChange(conversation?: ParsedConversationFile | null): Promise<void> {
		// Update ConversationsSection state if conversation is provided
		if (conversation !== undefined) {
			this.conversationsSection.setActiveConversation(conversation);
		}
		
		const activeConversation = this.conversationsSection.getActiveConversation();
		
		// If a root-level conversation is selected, clear activeProject
		if (activeConversation && !activeConversation.meta.projectId) {
			this.projectsSection.setActiveProject(null);
		}
		
		const activeProject = this.projectsSection.getActiveProject();
		
		// Reload conversation to get latest data
		if (activeConversation) {
			const conversations = await this.manager.listConversations(activeProject?.meta);
			const updated = conversations.find(c => c.meta.id === activeConversation.meta.id);
			if (updated) {
				this.conversationsSection.setActiveConversation(updated);
			}
		}

		// Update active state highlighting in projects section (without full re-render)
		await this.projectsSection.renderAllExpandedProjectConversations();
		
		// Update active state highlighting in conversations section (without full re-render)
		this.conversationsSection.updateActiveState();

		// Notify other views about selection change
		const chatViews = this.app.workspace.getLeavesOfType('peak-chat-view');
		chatViews.forEach(leaf => {
			const view = leaf.view as unknown as IChatView;
			const currentActiveConversation = this.conversationsSection.getActiveConversation();
			if (currentActiveConversation) {
				view.showMessagesForOneConvsation(currentActiveConversation);
			}
		});

		const historyViews = this.app.workspace.getLeavesOfType('peak-message-history-view');
		historyViews.forEach(leaf => {
			const view = leaf.view as unknown as IMessageHistoryView;
			view.setActiveConversation(this.conversationsSection.getActiveConversation());
		});
	}


	/**
	 * Set active project and conversation, expand the project, and collapse others
	 */
	async setActiveSelectionAndExpand(
		project: ParsedProjectFile | null,
		conversation: ParsedConversationFile | null
	): Promise<void> {
		// Refresh data to ensure we have the latest projects and conversations
		await this.hydrateData();

		// Update project reference if provided
		let updatedProject = project;
		if (updatedProject) {
			const projects = this.projectsSection.getProjects();
			const latestProject = projects.find(p => p.meta.id === updatedProject!.meta.id);
			if (latestProject) {
				updatedProject = latestProject;
			}
		}

		// Update conversation reference if provided
		let updatedConversation = conversation;
		if (updatedConversation) {
			const conversations = updatedProject
				? await this.manager.listConversations(updatedProject.meta)
				: await this.manager.listConversations();
			const latestConversation = conversations.find(c => c.meta.id === updatedConversation!.meta.id);
			if (latestConversation) {
				updatedConversation = latestConversation;
			}
		}

		// Set active selection
		this.projectsSection.setActiveProject(updatedProject);
		this.conversationsSection.setActiveConversation(updatedConversation);

		// If conversation has a project, expand that project and collapse others
		if (updatedProject) {
			const expandedProjects = this.projectsSection.getExpandedProjects();
			// Expand the project containing the conversation
			expandedProjects.add(updatedProject.meta.id);

			// Collapse all other projects
			const projects = this.projectsSection.getProjects();
			for (const p of projects) {
				if (p.meta.id !== updatedProject.meta.id) {
					expandedProjects.delete(p.meta.id);
				}
			}
		} else {
			// If no project, collapse all projects
			this.projectsSection.clearExpandedProjects();
		}

		// Re-render to reflect changes
		await this.render();

		// Notify other views
		await this.notifySelectionChange();
	}

}

