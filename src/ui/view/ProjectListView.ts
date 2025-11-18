import { App, IconName, ItemView, Menu, Modal, Setting, TFile, TextComponent, ViewState, WorkspaceLeaf } from 'obsidian';
import { AIServiceManager } from 'src/service/chat/service-manager';
import { ParsedConversationFile, ParsedProjectFile } from 'src/service/chat/types';
import { createIcon, createChevronIcon } from 'src/core/IconHelper';
import { InputModal } from 'src/ui/component/InputModal';

export const PROJECT_LIST_VIEW_TYPE = 'peak-project-list-view';

/**
 * Left sidebar view displaying projects and conversations list
 */
export class ProjectListView extends ItemView {
	private projects: ParsedProjectFile[] = [];
	private conversations: ParsedConversationFile[] = [];
	private activeProject: ParsedProjectFile | null = null;
	private activeConversation: ParsedConversationFile | null = null;
	private expandedProjects: Set<string> = new Set(); // Track which projects are expanded
	private collapsedSections: Set<string> = new Set(); // Track which sections are collapsed ('projects' or 'conversations')

	private projectListEl?: HTMLElement;
	private conversationListEl?: HTMLElement;

	constructor(leaf: WorkspaceLeaf, private readonly manager: AIServiceManager) {
		super(leaf);
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
	 * Toggle collapse state of a section
	 */
	private toggleSection(sectionName: 'projects' | 'conversations'): void {
		if (this.collapsedSections.has(sectionName)) {
			this.collapsedSections.delete(sectionName);
		} else {
			this.collapsedSections.add(sectionName);
		}
		this.render();
	}

	/**
	 * Handle manual refresh button click or auto-refresh when view becomes active
	 */
	async handleRefresh(): Promise<void> {
		try {
			// Reset expanded state
			this.expandedProjects.clear();
			
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
		
		// Always refresh projects from filesystem
		this.projects = await this.manager.listProjects();
		
		// Sort projects by createdAtTimestamp descending (newest first)
		this.projects.sort((a, b) => {
			const timeA = a.meta.createdAtTimestamp || 0;
			const timeB = b.meta.createdAtTimestamp || 0;
			return timeB - timeA;
		});

		// Validate and update activeProject reference to use latest project object
		if (this.activeProject) {
			const latestProject = this.projects.find(
				p => p.meta.id === this.activeProject!.meta.id
			);
			if (latestProject) {
				// Update to use latest project object (in case metadata changed)
				this.activeProject = latestProject;
			} else {
				// Project no longer exists
				this.activeProject = null;
			}
		}

		// Always load root-level conversations (without project) for the Conversations section
		// Project conversations are loaded dynamically in renderProjects()
		this.conversations = await this.manager.listConversations();
		
		// Sort conversations by createdAtTimestamp descending (newest first)
		this.conversations.sort((a, b) => {
			const timeA = a.meta.createdAtTimestamp || 0;
			const timeB = b.meta.createdAtTimestamp || 0;
			return timeB - timeA;
		});
		
		// Handle activeProject based on rootMode
		if (settings.rootMode === 'project-first' && this.projects.length > 0) {
			if (!this.activeProject) {
				this.activeProject = this.projects[0];
			}
		} else {
			this.activeProject = null;
		}

		// Validate and update activeConversation reference to use latest conversation object
		if (this.activeConversation) {
			const latestConversation = this.conversations.find(
				c => c.meta.id === this.activeConversation!.meta.id
			);
			if (latestConversation) {
				// Update to use latest conversation object (in case metadata changed)
				this.activeConversation = latestConversation;
			} else {
				// Conversation no longer exists
				this.activeConversation = null;
			}
		}

		// Set default activeConversation if none is selected
		if (!this.activeConversation && this.conversations.length > 0) {
			this.activeConversation = this.conversations[0];
		}
	}

	private async render(): Promise<void> {
		const { containerEl } = this;
		containerEl.empty();

		// Toolbar above projects section
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
			this.expandedProjects.clear();
			this.render();
		});

		// Projects section
		const projectsSection = containerEl.createDiv({ cls: 'peak-project-list-view__section' });
		const isProjectsCollapsed = this.collapsedSections.has('projects');
		if (isProjectsCollapsed) {
			projectsSection.addClass('is-collapsed');
		}
		
		const projectsHeader = projectsSection.createDiv({ cls: 'peak-project-list-view__header' });
		
		// Collapse/expand icon
		const projectsCollapseIcon = projectsHeader.createSpan({ 
			cls: 'peak-project-list-view__collapse-icon'
		});
		createChevronIcon(projectsCollapseIcon, !isProjectsCollapsed, {
			size: 12,
			strokeWidth: 2.5,
			class: 'peak-icon'
		});
		
		const projectsTitle = projectsHeader.createEl('h3', { text: 'Projects' });
		
		// Make header clickable to toggle collapse
		projectsHeader.style.cursor = 'pointer';
		projectsHeader.addEventListener('click', (e) => {
			// Don't toggle if clicking on buttons
			if ((e.target as HTMLElement).closest('button')) {
				return;
			}
			this.toggleSection('projects');
		});
		
		// Note: Refresh button moved to toolbar above
		
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

		this.projectListEl = projectsSection.createDiv({ cls: 'peak-project-list-view__list' });
		await this.renderProjects();

		// Conversations section (always show, even if empty)
		const conversationsSection = containerEl.createDiv({ cls: 'peak-project-list-view__section' });
		const isConversationsCollapsed = this.collapsedSections.has('conversations');
		if (isConversationsCollapsed) {
			conversationsSection.addClass('is-collapsed');
		}
		
		const conversationsHeader = conversationsSection.createDiv({ cls: 'peak-project-list-view__header' });
		
		// Collapse/expand icon
		const conversationsCollapseIcon = conversationsHeader.createSpan({ 
			cls: 'peak-project-list-view__collapse-icon'
		});
		createChevronIcon(conversationsCollapseIcon, !isConversationsCollapsed, {
			size: 12,
			strokeWidth: 2.5,
			class: 'peak-icon'
		});
		
		const conversationsTitle = conversationsHeader.createEl('h3', { text: 'Conversations' });
		
		// Make header clickable to toggle collapse
		conversationsHeader.style.cursor = 'pointer';
		conversationsHeader.addEventListener('click', (e) => {
			// Don't toggle if clicking on buttons
			if ((e.target as HTMLElement).closest('button')) {
				return;
			}
			this.toggleSection('conversations');
		});
		
		const newConversationBtn = conversationsHeader.createEl('button', { 
			cls: 'peak-project-list-view__new-btn',
			attr: { title: 'New Conversation' }
		});
		createIcon(newConversationBtn, 'plus', {
			size: 14,
			strokeWidth: 2.5,
			class: 'peak-icon'
		});
		newConversationBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.openCreateConversationModal();
		});

		this.conversationListEl = conversationsSection.createDiv({ cls: 'peak-project-list-view__list' });
		this.renderConversations();
	}

	private async renderProjects(): Promise<void> {
		if (!this.projectListEl) return;
		this.projectListEl.empty();

		const MAX_PROJECTS_DISPLAY = 10;
		const projectsToShow = this.projects.slice(0, MAX_PROJECTS_DISPLAY);
		const hasMoreProjects = this.projects.length > MAX_PROJECTS_DISPLAY;

		// Add project items with expandable conversations (ChatGPT style)
		for (const project of projectsToShow) {
			const projectId = project.meta.id;
			const isExpanded = this.expandedProjects.has(projectId);
			const isSelected = this.activeProject?.meta.id === projectId;
			
			const projectItem = this.projectListEl.createDiv({ 
				cls: `peak-project-list-view__project-item ${isExpanded ? 'is-expanded' : ''}`
			});

			// Project header with expand/collapse
			const projectHeader = projectItem.createDiv({ cls: 'peak-project-list-view__project-header' });
			
			// Expand/collapse icon - visual only, click handled by header
			const expandIcon = projectHeader.createSpan({ 
				cls: `peak-project-list-view__expand-icon ${isExpanded ? 'is-expanded' : ''}`
			});
			// Use Lucide chevron icon
			createChevronIcon(expandIcon, isExpanded, {
				size: 14,
				strokeWidth: 2.5,
				class: 'peak-icon'
			});
			
			// Folder icon - use Lucide icon
			const folderIcon = projectHeader.createSpan({ 
				cls: 'peak-project-list-view__folder-icon'
			});
			createIcon(folderIcon, isExpanded ? 'folderOpen' : 'folder', {
				size: 16,
				strokeWidth: 2,
				class: 'peak-icon'
			});
			
			// Project name - click to expand and show conversation list in ChatView
			const projectName = projectHeader.createSpan({ 
				cls: 'peak-project-list-view__project-name',
				text: project.meta.name 
			});
			projectName.style.cursor = 'pointer';
			
			// Click on project name to expand project and show conversation list in ChatView
			projectName.addEventListener('click', async (e) => {
				e.stopPropagation();
				
				// Expand project if not already expanded
				if (!this.expandedProjects.has(projectId)) {
					this.expandedProjects.add(projectId);
				}
				
				// Set active project and clear active conversation (to show conversation list)
				this.activeProject = project;
				this.activeConversation = null;
				
				// Render to update expansion state
				await this.render();
				
				// Notify ChatView to show conversation list (this will set showingConversationList = true)
				await this.notifyChatViewShowConversationList(project);
				// Notify selection change (with null conversation to maintain conversation list view)
				await this.notifySelectionChange();
			});
			
			// Add right-click context menu for project
			this.setupProjectContextMenu(projectHeader, project);

			// Make header clickable for expand/collapse (but not project name)
			// This must be added after all child elements are created
			projectHeader.addEventListener('click', async (e) => {
				const target = e.target as HTMLElement;
				// Don't toggle if clicking on project name (it has its own handler)
				if (target.closest('.peak-project-list-view__project-name')) {
					return;
				}
				// Toggle expansion (allow multiple projects to be expanded)
				// Get current state at click time
				const currentlyExpanded = this.expandedProjects.has(projectId);
				if (currentlyExpanded) {
					this.expandedProjects.delete(projectId);
				} else {
					this.expandedProjects.add(projectId);
				}
				await this.render();
			});

			// Project conversations (nested) - always render but control visibility with CSS
			const projectConversations = projectItem.createDiv({ 
				cls: `peak-project-list-view__project-conversations ${isExpanded ? 'is-expanded' : ''}`
			});
			
			if (isExpanded) {
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
				const newConvBtn = projectConversations.createDiv({ 
					cls: 'peak-project-list-view__new-conv-btn',
					text: '+ New conversation'
				});
				newConvBtn.addEventListener('click', (e) => {
					e.stopPropagation();
					this.openCreateConversationModalForProject(project);
				});

				// List conversations under this project
				for (const conv of conversationsToShow) {
					const isActive = this.activeConversation?.meta.id === conv.meta.id && 
					                 this.activeProject?.meta.id === project.meta.id;
					const convItem = projectConversations.createDiv({ 
						cls: `peak-project-list-view__conversation-item ${isActive ? 'is-active' : ''}`
					});
					convItem.createSpan({ text: conv.meta.title });
					convItem.addEventListener('click', async (e) => {
						e.stopPropagation();
						this.activeProject = project;
						this.activeConversation = conv;
						await this.render();
						await this.notifySelectionChange();
					});
					
					// Add right-click context menu for conversation
					this.setupConversationContextMenu(convItem, conv);
				}
				
				// Add "See more" button if there are more conversations
				if (hasMoreConversations) {
					const seeMoreConvItem = projectConversations.createDiv({ 
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
						await this.notifyChatViewShowAllConversations(project);
					});
				}
			}
		}
		
		// Add "See more" button if there are more projects
		if (hasMoreProjects) {
			const seeMoreItem = this.projectListEl.createDiv({ 
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
	}

	private renderConversations(): void {
		if (!this.conversationListEl) return;
		this.conversationListEl.empty();

		// this.conversations now contains only root-level conversations (loaded from hydrateData)
		// Filter to show only conversations without projectId (safety check)
		const conversationsWithoutProject = this.conversations.filter(c => !c.meta.projectId);

		if (conversationsWithoutProject.length === 0) {
			this.conversationListEl.createDiv({ 
				cls: 'peak-project-list-view__empty',
				text: 'No conversations'
			});
			return;
		}

		for (const conversation of conversationsWithoutProject) {
			const item = this.conversationListEl.createDiv({ 
				cls: `peak-project-list-view__item ${this.activeConversation?.meta.id === conversation.meta.id ? 'is-active' : ''}`
			});
			const itemText = item.createSpan({ text: conversation.meta.title });
			item.addEventListener('click', async () => {
				this.activeProject = null;
				this.activeConversation = conversation;
				await this.render();
				await this.notifySelectionChange();
			});
			
			// Add right-click context menu for conversation
			this.setupConversationContextMenu(item, conversation);
		}
	}

	private async reloadConversations(): Promise<void> {
		this.conversations = await this.manager.listConversations(this.activeProject?.meta);
		this.activeConversation = this.conversations[0] ?? null;
	}

	private async notifySelectionChange(): Promise<void> {
		// Reload conversation to get latest data
		if (this.activeConversation) {
			const conversations = await this.manager.listConversations(this.activeProject?.meta);
			const updated = conversations.find(c => c.meta.id === this.activeConversation!.meta.id);
			if (updated) {
				this.activeConversation = updated;
			}
		}

		// Notify other views about selection change
		const chatViews = this.app.workspace.getLeavesOfType('peak-chat-view');
		chatViews.forEach(leaf => {
			const view = leaf.view as any;
			if (view && typeof view.setActiveSelection === 'function') {
				view.setActiveSelection(this.activeProject, this.activeConversation);
			}
		});

		const historyViews = this.app.workspace.getLeavesOfType('peak-message-history-view');
		historyViews.forEach(leaf => {
			const view = leaf.view as any;
			if (view && typeof view.setActiveConversation === 'function') {
				view.setActiveConversation(this.activeConversation);
			}
		});
	}

	/**
	 * Notify ChatView to show conversation list for a project
	 */
	private async notifyChatViewShowConversationList(project: ParsedProjectFile): Promise<void> {
		const chatViews = this.app.workspace.getLeavesOfType('peak-chat-view');
		chatViews.forEach(leaf => {
			const view = leaf.view as any;
			if (view && typeof view.showConversationList === 'function') {
				view.showConversationList(project);
			}
		});
	}

	/**
	 * Notify ChatView to show all projects in card view
	 */
	private async notifyChatViewShowAllProjects(): Promise<void> {
		const chatViews = this.app.workspace.getLeavesOfType('peak-chat-view');
		chatViews.forEach(leaf => {
			const view = leaf.view as any;
			if (view && typeof view.showAllProjects === 'function') {
				view.showAllProjects(this.projects);
			}
		});
	}

	/**
	 * Notify ChatView to show all conversations for a project
	 */
	private async notifyChatViewShowAllConversations(project: ParsedProjectFile): Promise<void> {
		const chatViews = this.app.workspace.getLeavesOfType('peak-chat-view');
		chatViews.forEach(leaf => {
			const view = leaf.view as any;
			if (view && typeof view.showAllConversations === 'function') {
				view.showAllConversations(project);
			}
		});
	}

	private openCreateProjectModal(): void {
		const modal = new CreateProjectModal(this.app, async (name: string) => {
			await this.manager.createProject({ name });
			await this.hydrateData();
			await this.render();
		});
		modal.open();
	}

	private openCreateConversationModal(): void {
		// Create conversation directly without modal, using default title
		// Title will be auto-generated after first message exchange
		void (async () => {
			const conversation = await this.manager.createConversation({
				title: 'New Conversation',
				project: null,
			});
			// Clear activeProject to ensure the new conversation is shown as root-level
			this.activeProject = null;
			this.conversations = [conversation, ...this.conversations];
			this.activeConversation = conversation;
			await this.render();
			await this.notifySelectionChange();
		})();
	}

	private openCreateConversationModalForProject(project: ParsedProjectFile): void {
		// Create conversation directly without modal, using default title
		// Title will be auto-generated after first message exchange
		void (async () => {
			const conversation = await this.manager.createConversation({
				title: 'New Conversation',
				project: project.meta,
			});
			this.activeProject = project;
			this.activeConversation = conversation;
			// Re-render to update project conversations list (renderProjects will reload project conversations)
			// Don't call reloadConversations() as it would overwrite root-level conversations list
			await this.render();
			await this.notifySelectionChange();
		})();
	}


	/**
	 * Get current active project and conversation
	 */
	getActiveSelection(): { project: ParsedProjectFile | null; conversation: ParsedConversationFile | null } {
		return {
			project: this.activeProject,
			conversation: this.activeConversation,
		};
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
			const latestProject = this.projects.find(p => p.meta.id === updatedProject!.meta.id);
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
		this.activeProject = updatedProject;
		this.activeConversation = updatedConversation;

		// If conversation has a project, expand that project and collapse others
		if (updatedProject) {
			// Expand the project containing the conversation
			this.expandedProjects.add(updatedProject.meta.id);
			
			// Collapse all other projects
			for (const p of this.projects) {
				if (p.meta.id !== updatedProject.meta.id) {
					this.expandedProjects.delete(p.meta.id);
				}
			}
		} else {
			// If no project, collapse all projects
			this.expandedProjects.clear();
		}

		// Re-render to reflect changes
		await this.render();
		
		// Notify other views
		await this.notifySelectionChange();
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
						this.activeProject = updatedProject;
					}

					// Refresh data and render
					await this.hydrateData();
					await this.render();
					await this.notifySelectionChange();
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

					// Update active conversation if it's the one being edited
					if (this.activeConversation?.meta.id === conversation.meta.id) {
						this.activeConversation = updatedConversation;
					}

					// Refresh data and render
					await this.hydrateData();
					await this.render();
					await this.notifySelectionChange();
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
		// Switch to document view by activating markdown view
		const existingMarkdownLeaves = this.app.workspace.getLeavesOfType('markdown');
		let centerLeaf: WorkspaceLeaf | null = null;

		if (existingMarkdownLeaves.length > 0) {
			centerLeaf = existingMarkdownLeaves[0];
		} else {
			centerLeaf = this.app.workspace.getLeaf(false);
		}

		if (centerLeaf) {
			// Switch to document view layout
			const fallbackLeft: ViewState = { type: 'file-explorer', state: {}, active: true } as ViewState;
			const fallbackRight: ViewState = { type: 'outline', state: {}, active: true } as ViewState;

			// Update left leaf to file explorer
			const existingFileExplorerLeaves = this.app.workspace.getLeavesOfType('file-explorer');
			const leftLeaf = existingFileExplorerLeaves[0] ?? this.app.workspace.getLeftLeaf(false);
			if (leftLeaf) {
				await leftLeaf.setViewState({ ...fallbackLeft, active: false });
			}

			// Update right leaf to outline
			const existingOutlineLeaves = this.app.workspace.getLeavesOfType('outline');
			const rightLeaf = existingOutlineLeaves[0] ?? this.app.workspace.getRightLeaf(false);
			if (rightLeaf) {
				await rightLeaf.setViewState({ ...fallbackRight, active: false });
			}

			// Open file in center leaf
			await centerLeaf.openFile(file);
			await centerLeaf.setViewState({ type: 'markdown', active: true });
			this.app.workspace.revealLeaf(centerLeaf);
		}
	}
}

/**
 * Modal for creating a new project - ChatGPT style
 */
class CreateProjectModal extends Modal {
	private inputValue: string = '';

	constructor(
		app: App,
		private onSubmit: (name: string) => Promise<void>
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('peak-create-project-modal');

		// Title
		const titleEl = contentEl.createDiv({ cls: 'peak-modal-title' });
		titleEl.createEl('h2', { text: 'Project name' });

		// Input field - larger, ChatGPT style
		const inputContainer = contentEl.createDiv({ cls: 'peak-modal-input-container' });
		let input: TextComponent;
		const inputWrapper = inputContainer.createDiv({ cls: 'peak-modal-input-wrapper' });
		input = new TextComponent(inputWrapper);
		input.setPlaceholder('Enter project name');
		input.setValue('');
		input.onChange((value) => {
			this.inputValue = value;
		});

		const inputEl = input.inputEl;
		inputEl.addClass('peak-modal-input');
		inputEl.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter' && !evt.shiftKey) {
				evt.preventDefault();
				this.handleSubmit();
			}
			if (evt.key === 'Escape') {
				evt.preventDefault();
				this.close();
			}
		});

		// Create button - bottom right
		const buttonContainer = contentEl.createDiv({ cls: 'peak-modal-button-container' });
		const createButton = buttonContainer.createEl('button', { 
			cls: 'peak-modal-create-button',
			text: 'Create project'
		});
		createButton.addEventListener('click', () => this.handleSubmit());

		// Focus input
		setTimeout(() => inputEl.focus(), 100);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	private async handleSubmit(): Promise<void> {
		const name = this.inputValue.trim();
		if (!name) return;

		this.close();
		await this.onSubmit(name);
	}
}

/**
 * Modal for creating a new conversation - ChatGPT style
 */
class CreateConversationModal extends Modal {
	private inputValue: string = '';

	constructor(
		app: App,
		private onSubmit: (title: string) => Promise<void>
	) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('peak-create-conversation-modal');

		// Title
		const titleEl = contentEl.createDiv({ cls: 'peak-modal-title' });
		titleEl.createEl('h2', { text: 'Conversation title' });

		// Input field - larger, ChatGPT style
		const inputContainer = contentEl.createDiv({ cls: 'peak-modal-input-container' });
		let input: TextComponent;
		const inputWrapper = inputContainer.createDiv({ cls: 'peak-modal-input-wrapper' });
		input = new TextComponent(inputWrapper);
		input.setPlaceholder('Enter conversation title');
		input.setValue('');
		input.onChange((value) => {
			this.inputValue = value;
		});

		const inputEl = input.inputEl;
		inputEl.addClass('peak-modal-input');
		inputEl.addEventListener('keydown', (evt) => {
			if (evt.key === 'Enter' && !evt.shiftKey) {
				evt.preventDefault();
				this.handleSubmit();
			}
			if (evt.key === 'Escape') {
				evt.preventDefault();
				this.close();
			}
		});

		// Create button - bottom right
		const buttonContainer = contentEl.createDiv({ cls: 'peak-modal-button-container' });
		const createButton = buttonContainer.createEl('button', { 
			cls: 'peak-modal-create-button',
			text: 'Create conversation'
		});
		createButton.addEventListener('click', () => this.handleSubmit());

		// Focus input
		setTimeout(() => inputEl.focus(), 100);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}

	private async handleSubmit(): Promise<void> {
		const title = this.inputValue.trim();
		if (!title) return;

		this.close();
		await this.onSubmit(title);
	}
}

