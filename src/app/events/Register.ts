import { MarkdownView, TFile } from 'obsidian';
import type MyPlugin from 'main';
import { parseFrontmatter } from '@/core/utils/markdown-utils';
import { ViewManager } from '@/app/view/ViewManager';
import { EventBus, SelectionChangedEvent } from '@/core/eventBus';
import { useChatViewStore } from '@/ui/view/chat-view/store/chatViewStore';
import { createElement, icons } from 'lucide';
import { CHAT_PROJECT_SUMMARY_FILENAME } from '@/core/constant';

/**
 * Register workspace-level reactive events
 */
export function registerCoreEvents(plugin: MyPlugin, viewManager: ViewManager): void {
	const eventBus = EventBus.getInstance(plugin.app);

	// Handle active leaf change for view switching
	eventBus.on('active-leaf-change', (leaf) => {
		viewManager.getViewSwitchConsistentHandler().handleActiveLeafChange(leaf);
	});

	// Handle file open to add chat view button for conversation files
	eventBus.on('file-open', (file) => {
		removeAllChatViewButtons();
		
		if (file && file.extension === 'md') {
			handleConversationFileOpen(plugin, viewManager, file, eventBus);
		}
	});

	// Also handle active leaf change to update button when switching views
	eventBus.on('active-leaf-change', (leaf) => {
		removeAllChatViewButtons();
		
		const markdownView = leaf?.view;
		if (markdownView && markdownView instanceof MarkdownView) {
			const file = markdownView.file;
			if (file && file.extension === 'md') {
				handleConversationFileOpen(plugin, viewManager, file, eventBus);
			}
		}
	});
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
	file: TFile,
	eventBus: EventBus
): Promise<void> {
	// Skip project summary files
	if (file.name === CHAT_PROJECT_SUMMARY_FILENAME) {
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
				addChatViewButton(plugin, viewManager, file, conversationId, eventBus);
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
	conversationId: string,
	eventBus: EventBus
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

	// Add icon using Lucide directly
	const MessageCircleIcon = icons.MessageCircle;
	if (MessageCircleIcon) {
		const svg = createElement(MessageCircleIcon, {
			class: 'peak-icon',
			width: 16,
			height: 16,
			stroke: 'currentColor',
			'stroke-width': 2
		});
		button.appendChild(svg as unknown as Node);
	}

	// Add click handler
	button.addEventListener('click', async () => {
		// Switch to chat view
		await viewManager.getViewSwitchConsistentHandler().activateChatView();

		// Find conversation and open it in chat view
		const aiManager = plugin.aiServiceManager;
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
			// Notify chat view to open conversation - directly update store
			const { setConversation } = useChatViewStore.getState();
			setConversation(conversation);

			// Dispatch selection changed event to highlight conversation and expand project
			eventBus.dispatch(new SelectionChangedEvent({
				conversationId: conversation.meta.id,
				projectId: project?.meta.id ?? null,
			}));
		}
	});
}

