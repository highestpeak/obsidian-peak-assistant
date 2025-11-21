import { App, Menu, TFile } from 'obsidian';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { ParsedConversationFile, ParsedProjectFile } from 'src/service/chat/types';
import { createIcon, createChevronIcon } from 'src/core/IconHelper';
import { IChatView } from '../view-interfaces';
import { CreateProjectModal } from './CreateProjectModal';
import { InputModal } from 'src/ui/component/InputModal';
import { openSourceFile } from '../shared/view-utils';
import { CHAT_VIEW_TYPE } from '../ChatView';

/**
 * Context interface for ProjectsSection to access ProjectListView state and methods
 */
export interface IProjectsSectionContext {
	// Methods
	notifySelectionChange(conversation?: ParsedConversationFile | null): Promise<void>;
	isConversationActive(conversation: ParsedConversationFile): boolean;
	render(): Promise<void>;
}

/**
 * Projects section component
 */
export class ProjectsSection {
	private projectListEl?: HTMLElement;

	// State
	private projects: ParsedProjectFile[] = [];
	private expandedProjects: Set<string> = new Set(); // Track which projects are expanded
	private activeProject: ParsedProjectFile | null = null;
	private isCollapsed: boolean = false;

	constructor(
		private readonly manager: AIServiceManager,
		private readonly app: App,
		private readonly context: IProjectsSectionContext
	) { }

	/**
	 * Get projects list
	 */
	getProjects(): ParsedProjectFile[] {
		return this.projects;
	}

	/**
	 * Get expanded projects set
	 */
	getExpandedProjects(): Set<string> {
		return this.expandedProjects;
	}

	/**
	 * Clear expanded projects
	 */
	clearExpandedProjects(): void {
		this.expandedProjects.clear();
	}

	/**
	 * Get active project
	 */
	getActiveProject(): ParsedProjectFile | null {
		return this.activeProject;
	}

	/**
	 * Set active project
	 */
	setActiveProject(project: ParsedProjectFile | null): void {
		this.activeProject = project;
	}

	/**
	 * Toggle collapse state
	 */
	toggleCollapse(): void {
		this.isCollapsed = !this.isCollapsed;
	}

	/**
	 * Check if section is collapsed
	 */
	isSectionCollapsed(): boolean {
		return this.isCollapsed;
	}

	/**
	 * Hydrate projects data
	 */
	async hydrateProjects(): Promise<void> {
		// Always refresh projects from filesystem
		this.projects = await this.manager.listProjects();

		// Sort projects by createdAtTimestamp descending (newest first)
		this.projects.sort((a, b) => {
			const timeA = a.meta.createdAtTimestamp || 0;
			const timeB = b.meta.createdAtTimestamp || 0;
			return timeB - timeA;
		});
	}

	/**
	 * Render projects section with header and list
	 */
	async render(containerEl: HTMLElement): Promise<void> {
		const projectsSection = containerEl.createDiv({ cls: 'peak-project-list-view__section' });
		if (this.isCollapsed) {
			projectsSection.addClass('is-collapsed');
		}

		this.renderProjectsHeader(projectsSection);

		this.projectListEl = projectsSection.createDiv({ cls: 'peak-project-list-view__list' });
		await this.renderProjects();
	}

	/**
	 * Render projects section header
	 */
	private renderProjectsHeader(projectsSection: HTMLElement): void {
		const projectsHeader = projectsSection.createDiv({ cls: 'peak-project-list-view__header' });

		// Collapse/expand icon
		const projectsCollapseIcon = projectsHeader.createSpan({
			cls: 'peak-project-list-view__collapse-icon'
		});
		createChevronIcon(projectsCollapseIcon, !this.isCollapsed, {
			size: 12,
			strokeWidth: 2.5,
			class: 'peak-icon'
		});

		projectsHeader.createEl('h3', { text: 'Projects' });

		// Make header clickable to toggle collapse
		projectsHeader.style.cursor = 'pointer';
		projectsHeader.addEventListener('click', (e) => {
			// Don't toggle if clicking on buttons
			if ((e.target as HTMLElement).closest('button')) {
				return;
			}
			this.toggleCollapse();
			this.context.render();
		});

		// New project button
		const newProjectBtn = projectsHeader.createEl('button', {
			cls: 'peak-project-list-view__new-btn',
			attr: { title: 'New Project' }
		});
		createIcon(newProjectBtn, 'plus', {
			size: 14,
			strokeWidth: 2.5,
			class: 'peak-icon'
		});
		newProjectBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.openCreateProjectModal();
		});
	}

	/**
	 * Render projects list
	 */
	private async renderProjects(): Promise<void> {
		if (!this.projectListEl) return;
		this.projectListEl.empty();

		const MAX_PROJECTS_DISPLAY = 10;
		const projectsToShow = this.projects.slice(0, MAX_PROJECTS_DISPLAY);
		const hasMoreProjects = this.projects.length > MAX_PROJECTS_DISPLAY;

		// Render project items
		for (const project of projectsToShow) {
			await this.renderProjectItem(project);
		}

		// Add "See more" button if there are more projects
		if (hasMoreProjects) {
			this.renderSeeMoreProjects();
		}
	}

	/**
	 * Render a single project item with header and conversations
	 */
	private async renderProjectItem(project: ParsedProjectFile): Promise<void> {
		const projectId = project.meta.id;
		const isExpanded = this.expandedProjects.has(projectId);

		const projectItem = this.projectListEl!.createDiv({
			cls: `peak-project-list-view__project-item ${isExpanded ? 'is-expanded' : ''}`,
			attr: { 'data-project-id': projectId }
		});

		// Render project header
		const projectHeader = this.renderProjectHeader(projectItem, project, isExpanded);

		// Setup project header click handlers
		this.setupProjectHeaderHandlers(projectItem, projectHeader, project, projectId);

		// Render project conversations (if expanded)
		if (isExpanded) {
			const projectConversations = projectItem.createDiv({
				cls: `peak-project-list-view__project-conversations is-expanded`
			});
			await this.renderProjectConversations(projectConversations, project);
		}
	}

	/**
	 * Render project header with icons and name
	 */
	private renderProjectHeader(
		projectItem: HTMLElement,
		project: ParsedProjectFile,
		isExpanded: boolean
	): HTMLElement {
		const projectHeader = projectItem.createDiv({ cls: 'peak-project-list-view__project-header' });

		// Expand/collapse icon
		const expandIcon = projectHeader.createSpan({
			cls: `peak-project-list-view__expand-icon ${isExpanded ? 'is-expanded' : ''}`
		});
		createChevronIcon(expandIcon, isExpanded, {
			size: 14,
			strokeWidth: 2.5,
			class: 'peak-icon'
		});

		// Folder icon
		const folderIcon = projectHeader.createSpan({
			cls: 'peak-project-list-view__folder-icon'
		});
		createIcon(folderIcon, isExpanded ? 'folderOpen' : 'folder', {
			size: 16,
			strokeWidth: 2,
			class: 'peak-icon'
		});

		// Project name
		const projectName = projectHeader.createSpan({
			cls: 'peak-project-list-view__project-name',
			text: project.meta.name,
			attr: { 'data-project-name': project.meta.id }
		});

		return projectHeader;
	}

	/**
	 * Setup click handlers for project header
	 */
	private setupProjectHeaderHandlers(
		projectItem: HTMLElement,
		projectHeader: HTMLElement,
		project: ParsedProjectFile,
		projectId: string
	): void {
		// Add right-click context menu for project
		this.setupProjectContextMenu(projectHeader, project);

		// Make header clickable to expand project and show conversation list in ChatView
		projectHeader.style.cursor = 'pointer';
		projectHeader.addEventListener('click', async (e) => {
			// Don't handle if clicking on buttons (if any are added in the future)
			if ((e.target as HTMLElement).closest('button')) {
				return;
			}

			// Toggle expand/collapse state
			const wasExpanded = this.expandedProjects.has(projectId);
			let projectConversations = projectItem.querySelector(
				'.peak-project-list-view__project-conversations'
			) as HTMLElement | null;

			if (wasExpanded) {
				// Collapse: remove from expanded set and hide conversations
				this.expandedProjects.delete(projectId);
				if (projectConversations) {
					projectConversations.remove();
				}
			} else {
				// Expand: add to expanded set and show conversations
				this.expandedProjects.add(projectId);
				projectConversations = projectItem.createDiv({
					cls: `peak-project-list-view__project-conversations is-expanded`
				});
				await this.renderProjectConversations(projectConversations, project);
			}

			// Update DOM classes and icons to reflect new state
			const isExpanded = this.expandedProjects.has(projectId);
			projectItem.classList.toggle('is-expanded', isExpanded);

			// Update expand icon
			const expandIcon = projectHeader.querySelector('.peak-project-list-view__expand-icon') as HTMLElement | null;
			if (expandIcon) {
				expandIcon.empty();
				expandIcon.classList.toggle('is-expanded', isExpanded);
				createChevronIcon(expandIcon, isExpanded, {
					size: 14,
					strokeWidth: 2.5,
					class: 'peak-icon'
				});
			}

			// Update folder icon
			const folderIcon = projectHeader.querySelector('.peak-project-list-view__folder-icon') as HTMLElement | null;
			if (folderIcon) {
				folderIcon.empty();
				createIcon(folderIcon, isExpanded ? 'folderOpen' : 'folder', {
					size: 16,
					strokeWidth: 2,
					class: 'peak-icon'
				});
			}

			// Set active project
			this.setActiveProject(project);

			// Notify ChatView to show conversation list (this will set showingConversationList = true)
			await this.notifyChatViewShowConversationList(project);
			// Notify selection change (with null conversation to maintain conversation list view)
			// await this.context.notifySelectionChange(null);
		});
	}

	/**
	 * Render conversations list for a project
	 */
	private async renderProjectConversations(
		container: HTMLElement,
		project: ParsedProjectFile
	): Promise<void> {
		const projectConvs = await this.manager.listConversations(project.meta);

		// Sort conversations by createdAtTimestamp descending (newest first)
		projectConvs.sort((a, b) => {
			const timeA = a.meta.createdAtTimestamp || 0;
			const timeB = b.meta.createdAtTimestamp || 0;
			return timeB - timeA;
		});

		const MAX_CONVERSATIONS_DISPLAY = 10;
		const conversationsToShow = projectConvs.slice(0, MAX_CONVERSATIONS_DISPLAY);
		const hasMoreConversations = projectConvs.length > MAX_CONVERSATIONS_DISPLAY;

		// New conversation button for this project
		const newConvBtn = container.createDiv({
			cls: 'peak-project-list-view__new-conv-btn',
			text: '+ New conversation'
		});
		newConvBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.openCreateConversationModalForProject(project);
		});

		// List conversations under this project
		for (const conv of conversationsToShow) {
			this.renderProjectConversationItem(container, project, conv);
		}

		// Add "See more" button if there are more conversations
		if (hasMoreConversations) {
			this.renderSeeMoreConversations(container);
		}
	}

	/**
	 * Render a single conversation item under a project
	 */
	private renderProjectConversationItem(
		container: HTMLElement,
		project: ParsedProjectFile,
		conv: ParsedConversationFile
	): void {
		// Check if this conversation is active
		// Active conversation should match the current active conversation and belong to this project
		const isActive = this.context.isConversationActive(conv);
		
		// Find the "New conversation" button to insert before it
		const newConvBtn = container.querySelector('.peak-project-list-view__new-conv-btn');
		const convItem = container.createDiv({
			cls: `peak-project-list-view__conversation-item ${isActive ? 'is-active' : ''}`,
			attr: { 'data-conversation-id': conv.meta.id }
		});
		
		// Insert before the "New conversation" button if it exists
		if (newConvBtn && newConvBtn.parentElement === container) {
			container.insertAfter(convItem, newConvBtn);
		}
		
		convItem.createSpan({ text: conv.meta.title });
		convItem.addEventListener('click', async (e) => {
			e.stopPropagation();
			this.setActiveProject(project);
			// notifySelectionChange will handle re-rendering conversations to update active state
			await this.context.notifySelectionChange(conv);
		});

		// Add right-click context menu for conversation
		this.setupConversationContextMenu(convItem, conv);
	}

	/**
	 * Update a single conversation item's title in a project without re-rendering the entire list
	 */
	updateProjectConversationTitle(project: ParsedProjectFile, conversation: ParsedConversationFile): void {
		if (!this.projectListEl) return;

		const projectId = project.meta.id;
		// Find the project item element by data attribute
		const projectItem = this.projectListEl.querySelector(
			`[data-project-id="${projectId}"]`
		) as HTMLElement | null;

		if (!projectItem) {
			return;
		}

		// Find the conversations container
		const conversationsContainer = projectItem.querySelector(
			'.peak-project-list-view__project-conversations'
		) as HTMLElement | null;

		if (!conversationsContainer) {
			// Project is not expanded, no need to update
			return;
		}

		// Find the conversation item by ID
		const convItem = conversationsContainer.querySelector(
			`[data-conversation-id="${conversation.meta.id}"]`
		) as HTMLElement | null;

		if (convItem) {
			// Update the title text
			const titleSpan = convItem.querySelector('span');
			if (titleSpan) {
				titleSpan.textContent = conversation.meta.title;
			}

			// Update active state if needed
			const isActive = this.context.isConversationActive(conversation);
			convItem.classList.toggle('is-active', isActive);
		} else {
			// If item doesn't exist, it's a new conversation, need to render it
			// Render the new conversation item before the "New conversation" button
			this.renderProjectConversationItem(conversationsContainer, project, conversation);
		}
	}

	/**
	 * Update a single project's name without re-rendering the entire list
	 */
	updateProjectName(project: ParsedProjectFile): void {
		if (!this.projectListEl) return;

		const projectId = project.meta.id;
		// Find the project item element by data attribute
		const projectItem = this.projectListEl.querySelector(
			`[data-project-id="${projectId}"]`
		) as HTMLElement | null;

		if (projectItem) {
			// Find the project name span
			const projectNameSpan = projectItem.querySelector(
				'[data-project-name]'
			) as HTMLElement | null;

			if (projectNameSpan) {
				projectNameSpan.textContent = project.meta.name;
			}
		}
	}

	/**
	 * Re-render conversations list for a specific project only
	 */
	async renderProjectConversationsOnly(project: ParsedProjectFile | null | undefined): Promise<void> {
		if (!project) return;

		if (!this.projectListEl) return;

		const projectId = project.meta.id;
		// Find the project item element by data attribute
		const projectItem = this.projectListEl.querySelector(
			`[data-project-id="${projectId}"]`
		) as HTMLElement | null;

		if (!projectItem) {
			// Project item not found, might not be rendered yet
			return;
		}

		// Find the conversations container
		const conversationsContainer = projectItem.querySelector(
			'.peak-project-list-view__project-conversations'
		) as HTMLElement | null;

		if (!conversationsContainer) {
			// Project is not expanded, no need to render conversations
			return;
		}

		// Clear and re-render conversations
		conversationsContainer.empty();
		await this.renderProjectConversations(conversationsContainer, project);
	}

	/**
	 * Re-render conversations lists for all expanded projects
	 * Used to update active state highlighting
	 */
	async renderAllExpandedProjectConversations(): Promise<void> {
		if (!this.projectListEl) return;

		// Find all expanded project items
		const expandedProjectItems = this.projectListEl.querySelectorAll(
			'.peak-project-list-view__project-item.is-expanded'
		);

		for (const projectItem of Array.from(expandedProjectItems)) {
			const projectId = (projectItem as HTMLElement).getAttribute('data-project-id');
			if (!projectId) continue;

			const project = this.projects.find(p => p.meta.id === projectId);
			if (!project) continue;

			// Find the conversations container
			const conversationsContainer = projectItem.querySelector(
				'.peak-project-list-view__project-conversations'
			) as HTMLElement | null;

			if (conversationsContainer) {
				// Clear and re-render conversations to update active state
				conversationsContainer.empty();
				await this.renderProjectConversations(conversationsContainer, project);
			}
		}
	}

	/**
	 * Render "See more" button for project conversations
	 */
	private renderSeeMoreConversations(container: HTMLElement): void {
		const seeMoreConvItem = container.createDiv({
			cls: 'peak-project-list-view__see-more-conv'
		});
		const seeMoreConvIcon = seeMoreConvItem.createSpan({
			cls: 'peak-project-list-view__see-more-icon'
		});
		createIcon(seeMoreConvIcon, 'moreHorizontal', {
			size: 14,
			strokeWidth: 2,
			class: 'peak-icon'
		});
		seeMoreConvItem.createSpan({
			cls: 'peak-project-list-view__see-more-text',
			text: 'See more'
		});
		seeMoreConvItem.style.cursor = 'pointer';
		seeMoreConvItem.addEventListener('click', async (e) => {
			e.stopPropagation();
			await this.notifyChatViewShowAllConversations();
		});
	}

	/**
	 * Render "See more" button for projects list
	 */
	private renderSeeMoreProjects(): void {
		const seeMoreItem = this.projectListEl!.createDiv({
			cls: 'peak-project-list-view__see-more'
		});
		const seeMoreIcon = seeMoreItem.createSpan({
			cls: 'peak-project-list-view__see-more-icon'
		});
		createIcon(seeMoreIcon, 'moreHorizontal', {
			size: 16,
			strokeWidth: 2,
			class: 'peak-icon'
		});
		seeMoreItem.createSpan({
			cls: 'peak-project-list-view__see-more-text',
			text: 'See more'
		});
		seeMoreItem.style.cursor = 'pointer';
		seeMoreItem.addEventListener('click', async (e) => {
			e.stopPropagation();
			await this.notifyChatViewShowAllProjects();
		});
	}

	/**
	 * Notify ChatView to show conversation list for a project
	 */
	private async notifyChatViewShowConversationList(project: ParsedProjectFile): Promise<void> {
		const chatViews = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		chatViews.forEach(leaf => {
			const view = leaf.view as unknown as IChatView;
			view.showProjectOverview(project);
		});
	}

	/**
	 * Notify ChatView to show all projects in card view
	 */
	private async notifyChatViewShowAllProjects(): Promise<void> {
		const chatViews = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		chatViews.forEach(leaf => {
			const view = leaf.view as unknown as IChatView;
			view.showAllProjects();
		});
	}

	/**
	 * Notify ChatView to show all standalone conversations (not in any project)
	 */
	private async notifyChatViewShowAllConversations(): Promise<void> {
		const chatViews = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
		chatViews.forEach(leaf => {
			const view = leaf.view as unknown as IChatView;
			view.showAllConversations();
		});
	}

	/**
	 * Open create project modal
	 */
	private openCreateProjectModal(): void {
		const modal = new CreateProjectModal(this.app, async (name: string) => {
			await this.manager.createProject({ name });
			await this.hydrateProjects();
			await this.context.render();
		});
		modal.open();
	}

	/**
	 * Open create conversation modal for a project
	 * Now only sets a pending state, actual creation happens on first message
	 */
	private openCreateConversationModalForProject(project: ParsedProjectFile): void {
		// Set pending conversation state instead of creating immediately
		// Actual creation will happen when user sends first message
		void (async () => {
			this.setActiveProject(project);
			// Notify ChatView to set pending conversation state
			const chatViews = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE);
			chatViews.forEach(leaf => {
				const view = leaf.view as unknown as IChatView;
				view.setPendingConversation({
					title: 'New Conversation',
					project: project,
				});
			});
			// Switch to conversation view to show input area
			await this.context.notifySelectionChange(null);
		})();
	}

	/**
	 * Setup context menu for project item
	 */
	private setupProjectContextMenu(itemEl: HTMLElement, project: ParsedProjectFile): void {
		itemEl.addEventListener('contextmenu', async (e) => {
			e.preventDefault();
			e.stopPropagation();

			const menu = new Menu();

			// Rename project option
			menu.addItem((item) => {
				item.setTitle('Rename project');
				item.setIcon('pencil');
				item.onClick(async () => {
					await this.editProjectName(project);
				});
			});

			// Open source file option
			menu.addItem((item) => {
				item.setTitle('Open source file');
				item.setIcon('file-text');
				item.onClick(async () => {
					await this.openSourceFile(project.file);
				});
			});

			// Show menu at cursor position
			menu.showAtPosition({ x: e.clientX, y: e.clientY });
		});
	}

	/**
	 * Setup context menu for conversation item
	 */
	private setupConversationContextMenu(itemEl: HTMLElement, conversation: ParsedConversationFile): void {
		itemEl.addEventListener('contextmenu', async (e) => {
			e.preventDefault();
			e.stopPropagation();

			const menu = new Menu();

			// Edit title option
			menu.addItem((item) => {
				item.setTitle('Edit title');
				item.setIcon('pencil');
				item.onClick(async () => {
					await this.editConversationTitle(conversation);
				});
			});

			// Open source file option
			menu.addItem((item) => {
				item.setTitle('Open source file');
				item.setIcon('file-text');
				item.onClick(async () => {
					await this.openSourceFile(conversation.file);
				});
			});

			// Show menu at cursor position
			menu.showAtPosition({ x: e.clientX, y: e.clientY });
		});
	}

	/**
	 * Edit project name
	 */
	private async editProjectName(project: ParsedProjectFile): Promise<void> {
		const modal = new InputModal(
			this.app,
			'Enter project name',
			async (newName: string | null) => {
				if (!newName || !newName.trim()) {
					return; // User cancelled or entered empty name
				}

				try {
					// Rename project
					const updatedProject = await this.manager.renameProject(project, newName.trim());

					// Update active project if it's the one being renamed
					if (this.activeProject?.meta.id === project.meta.id) {
						this.setActiveProject(updatedProject);
					}

					// Refresh data and render
					await this.hydrateProjects();
					await this.context.render();
					await this.context.notifySelectionChange();
				} catch (error) {
					console.error('Failed to rename project', error);
				}
			},
			project.meta.name // Pass current name as initial value
		);

		modal.open();
	}

	/**
	 * Edit conversation title
	 */
	private async editConversationTitle(conversation: ParsedConversationFile): Promise<void> {
		const modal = new InputModal(
			this.app,
			'Enter conversation title',
			async (newTitle: string | null) => {
				if (!newTitle || !newTitle.trim()) {
					return; // User cancelled or entered empty title
				}

				try {
					// Find the project for this conversation
					const project = conversation.meta.projectId
						? this.projects.find(p => p.meta.id === conversation.meta.projectId)
						: null;

					// Update conversation title
					const updatedConversation = await this.manager.updateConversationTitle({
						conversation,
						project: project ?? null,
						title: newTitle.trim(),
					});

					// Refresh data
					await this.hydrateProjects();
					await this.renderProjectConversationsOnly(project);

					// Update active conversation if it's the one being edited
					if (this.context.isConversationActive(conversation)) {
						await this.context.notifySelectionChange(updatedConversation);
					}
				} catch (error) {
					console.error('Failed to update conversation title', error);
				}
			},
			conversation.meta.title // Pass current title as initial value
		);

		modal.open();
	}

	/**
	 * Switch to document view and open the source file
	 */
	private async openSourceFile(file: TFile): Promise<void> {
		await openSourceFile(this.app, file);
	}
}

