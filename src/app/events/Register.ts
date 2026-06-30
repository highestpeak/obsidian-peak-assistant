import { MarkdownView, TFile } from 'obsidian';
import type MyPlugin from 'main';
import { ViewManager } from '@/app/view/ViewManager';
import { EventBus } from '@/core/eventBus';
import { createElement, icons } from 'lucide';
import { CHAT_PROJECT_SUMMARY_FILENAME } from '@/core/constant';
import { createChatNavigation } from '@/ui/view/chat-view/chatNavigation';

/**
 * Register workspace-level reactive events. Uses plugin.registerEvent so listeners are auto-removed on unload.
 */
export function registerCoreEvents(plugin: MyPlugin, viewManager: ViewManager): void {
	const eventBus = EventBus.getInstance(plugin.app);
	const app = plugin.app;

	plugin.registerEvent(
		app.workspace.on('active-leaf-change', (leaf) => {
			viewManager.getViewSwitchConsistentHandler().handleActiveLeafChange(leaf);
		}),
	);

	plugin.registerEvent(
		app.workspace.on('file-open', (file: TFile | null) => {
			removeAllChatViewButtons();
			if (file && file.extension === 'md') {
				handleConversationFileOpen(plugin, viewManager, file, eventBus);
			}
		}),
	);

	plugin.registerEvent(
		app.workspace.on('active-leaf-change', (leaf) => {
			removeAllChatViewButtons();
			const markdownView = leaf?.view;
			if (markdownView && markdownView instanceof MarkdownView) {
				const file = markdownView.file;
				if (file && file.extension === 'md') {
					handleConversationFileOpen(plugin, viewManager, file, eventBus);
				}
			}
		}),
	);
}

/** Pending timeouts that schedule addChatViewButton; cleared on unload to avoid holding plugin refs. */
const pendingConversationTimeouts = new Set<ReturnType<typeof setTimeout>>();

/**
 * Clear all pending conversation-file timeouts. Call from plugin onunload to avoid detached timer callbacks holding plugin/viewManager.
 */
export function clearPendingConversationTimeouts(): void {
	pendingConversationTimeouts.forEach((id) => clearTimeout(id));
	pendingConversationTimeouts.clear();
}

/**
 * Remove all chat view buttons from the DOM. Call on plugin unload so button listeners (which capture plugin/viewManager) are released.
 */
export function removeAllChatViewButtons(): void {
	const buttons = document.querySelectorAll('.peak-chat-view-button-container');
	buttons.forEach(button => button.remove());
}

/**
 * If the opened file is a tracked conversation, schedule the chat-view button.
 * Conversation identity lives in the chat sqlite store (file_rel_path → id),
 * not in the markdown file itself.
 */
async function handleConversationFileOpen(
	plugin: MyPlugin,
	viewManager: ViewManager,
	file: TFile,
	eventBus: EventBus
): Promise<void> {
	if (file.name === CHAT_PROJECT_SUMMARY_FILENAME) return;

	const aiManager = plugin.aiServiceManager;
	if (!aiManager) return;

	const conversationId = await aiManager.findConversationIdByVaultPath(file.path);
	if (!conversationId) return;

	const id = setTimeout(() => {
		pendingConversationTimeouts.delete(id);
		addChatViewButton(plugin, viewManager, file, conversationId, eventBus);
	}, 100);
	pendingConversationTimeouts.add(id);
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

	// Create button container — `peak-design-root` is required so peak tokens
	// resolve here AND obsidian-reset.css blanks Obsidian's bare `button` styles
	// (see docs/conventions/ui-design.md §4).
	const buttonContainer = markdownView.contentEl.createDiv({
		cls: 'peak-design-root peak-chat-view-button-container'
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
		const aiManager = plugin.aiServiceManager;
		if (!aiManager) {
			return;
		}
		const conversation = await aiManager.readConversation(conversationId, true);
		if (conversation) {
			const navigation = createChatNavigation({
				manager: aiManager,
				viewManager,
				eventBus,
			});
			await navigation.openConversationInChat(conversation, { loadMessages: false });
		}
	});
}
