import { MarkdownView, TFile } from 'obsidian';
import type MyPlugin from 'main';
import { parseFrontmatter } from 'src/service/chat/storage-markdown';
import { createIcon } from 'src/core/IconHelper';
import { ViewManager } from '../view/ViewManager';
import { PROJECT_LIST_VIEW_TYPE } from 'src/ui/view/ProjectListView';

/**
 * Registers workspace-level reactive events.
 */
export function registerCoreEvents(plugin: MyPlugin, viewManager: ViewManager): void {
	plugin.registerEvent(
		plugin.app.workspace.on('active-leaf-change', (leaf) => {
			viewManager.getViewSwitchConsistentHandler().handleActiveLeafChange(leaf);
		})
	);

	// Handle file open to add chat view button for conversation files
	plugin.registerEvent(
		plugin.app.workspace.on('file-open', (file: TFile | null) => {
			// Remove any existing buttons first
			removeAllChatViewButtons();
			
			if (file && file.extension === 'md') {
				handleConversationFileOpen(plugin, viewManager, file);
			}
		})
	);

	// Also handle active leaf change to update button when switching views
	plugin.registerEvent(
		plugin.app.workspace.on('active-leaf-change', (leaf) => {
			// Remove existing buttons
			removeAllChatViewButtons();
			
			// Check if new leaf is markdown view
			const markdownView = leaf?.view;
			if (markdownView && markdownView instanceof MarkdownView) {
				const file = markdownView.file;
				if (file && file.extension === 'md') {
					handleConversationFileOpen(plugin, viewManager, file);
				}
			}

			// Auto-refresh ProjectListView when it becomes active
			if (leaf?.view?.getViewType() === PROJECT_LIST_VIEW_TYPE) {
				const projectListView = leaf.view as any;
				if (projectListView && typeof projectListView.handleRefresh === 'function') {
					void projectListView.handleRefresh();
				}
			}
		})
	);
}

/**
 * Remove all chat view buttons
 */
function removeAllChatViewButtons(): void {
	const buttons = document.querySelectorAll('.peak-chat-view-button-container');
	buttons.forEach(button => button.remove());
}

/**
 * Check if file is a conversation file and add chat view button if so
 */
async function handleConversationFileOpen(
	plugin: MyPlugin,
	viewManager: ViewManager,
	file: TFile
): Promise<void> {
	// Skip Project-Summary.md files
	if (file.name === 'Project-Summary.md') {
		return;
	}

	// Read file to check frontmatter
	try {
		const content = await plugin.app.vault.read(file);
		const frontmatter = parseFrontmatter<Record<string, unknown>>(content);
		
		// Check if it's a conversation file (has id in frontmatter)
		if (frontmatter?.data?.id && typeof frontmatter.data.id === 'string') {
			const conversationId = frontmatter.data.id as string;
			
			// Wait for markdown view to be ready
			setTimeout(() => {
				addChatViewButton(plugin, viewManager, file, conversationId);
			}, 100);
		}
	} catch (error) {
		// File might not be a conversation, silently ignore
	}
}

/**
 * Add chat view button to markdown view
 */
function addChatViewButton(
	plugin: MyPlugin,
	viewManager: ViewManager,
	file: TFile,
	conversationId: string
): void {
	// Find active markdown view for this file
	const markdownView = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	if (!markdownView || markdownView.file?.path !== file.path) {
		return;
	}

	// Check if button already exists
	const existingButton = markdownView.contentEl.querySelector('.peak-chat-view-button');
	if (existingButton) {
		return;
	}

	// Ensure contentEl has position relative for absolute positioning
	if (getComputedStyle(markdownView.contentEl).position === 'static') {
		markdownView.contentEl.style.position = 'relative';
	}

	// Create button container
	const buttonContainer = markdownView.contentEl.createDiv({
		cls: 'peak-chat-view-button-container'
	});

	// Create button
	const button = buttonContainer.createEl('button', {
		cls: 'peak-chat-view-button',
		attr: {
			title: 'Switch to chat view',
			'aria-label': 'Switch to chat view'
		}
	});

	// Add icon using IconHelper
	createIcon(button, 'messageCircle', {
		size: 16,
		strokeWidth: 2,
		class: 'peak-icon'
	});

	// Add click handler
	button.addEventListener('click', async () => {
		// Switch to chat view
		await viewManager.getViewSwitchConsistentHandler().activateChatView();

		// Find conversation and open it in chat view
		// Access aiManager through plugin
		const aiManager = plugin.aiManager;
		if (!aiManager) {
			return;
		}

		// Read file again to get projectId from frontmatter
		let projectId: string | undefined;
		try {
			const content = await plugin.app.vault.read(file);
			const frontmatter = parseFrontmatter<Record<string, unknown>>(content);
			projectId = frontmatter?.data?.projectId as string | undefined;
		} catch (error) {
			console.error('Failed to read file for projectId:', error);
		}

		// Find project first if projectId exists
		let project = null;
		if (projectId) {
			const projects = await aiManager.listProjects();
			project = projects.find(p => p.meta.id === projectId) || null;
		}

		// Find conversation using the correct project context
		const conversations = await aiManager.listConversations(project?.meta);
		const conversation = conversations.find(c => c.meta.id === conversationId);
		
		if (conversation) {
			// Notify chat view to open conversation
			const chatViews = plugin.app.workspace.getLeavesOfType('peak-chat-view');
			chatViews.forEach(leaf => {
				const view = leaf.view as any;
				if (view && typeof view.setActiveSelection === 'function') {
					view.setActiveSelection(project, conversation);
				}
			});

			// Notify project list view to highlight conversation and expand project
			const projectListViews = plugin.app.workspace.getLeavesOfType('peak-project-list-view');
			projectListViews.forEach(leaf => {
				const view = leaf.view as any;
				if (view && typeof view.setActiveSelectionAndExpand === 'function') {
					view.setActiveSelectionAndExpand(project, conversation);
				}
			});
		}
	});
}

