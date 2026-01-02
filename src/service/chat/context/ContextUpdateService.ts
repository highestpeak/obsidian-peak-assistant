import { EventBus, MessageSentEvent, ConversationCreatedEvent, ViewEventType } from '@/core/eventBus';
import { CONVERSATION_SUMMARY_UPDATE_THRESHOLD, PROJECT_SUMMARY_UPDATE_THRESHOLD, SUMMARY_UPDATE_DEBOUNCE_MS, DEFAULT_SUMMARY, MIN_MESSAGES_FOR_TITLE_GENERATION } from '@/core/constant';
import type { ConversationService } from '../service-conversation';
import type { ProjectService } from '../service-project';
import type { ChatStorageService } from '@/core/storage/vault/ChatStore';
import type { ChatContextWindow, ChatConversation } from '../types';

/**
 * Service to automatically update summaries based on events.
 * Uses debouncing and threshold-based triggering to avoid excessive updates.
 * Both conversation and project summaries are updated based on message count.
 */
export class ContextUpdateService {
	private conversationTimers = new Map<string, NodeJS.Timeout>();
	private projectTimers = new Map<string, NodeJS.Timeout>();
	private unsubscribeHandlers: (() => void)[] = [];

	constructor(
		private readonly eventBus: EventBus,
		private readonly storage: ChatStorageService,
		private readonly conversationService: ConversationService,
		private readonly projectService: ProjectService,
	) {
		this.setupListeners();
	}

	/**
	 * Setup event listeners
	 */
	private setupListeners(): void {
		const unsubscribe1 = this.eventBus.on(ViewEventType.MESSAGE_SENT, (event: MessageSentEvent) => {
			console.debug('[ContextUpdateService] Message sent event received:', event);
			this.handleMessageSent(event);
		});
		this.unsubscribeHandlers.push(unsubscribe1);
	}

	/**
	 * Handle message sent event
	 */
	private async handleMessageSent(event: MessageSentEvent): Promise<void> {
		const { conversationId, projectId } = event;

		// Debounce: if timer exists, cancel it and set a new one
		// This ensures we only update after messages stop coming for SUMMARY_UPDATE_DEBOUNCE_MS
		const existingTimer = this.conversationTimers.get(conversationId);
		if (!existingTimer) {
			console.debug('[ContextUpdateService] Setting debounce timer for conversation:', conversationId);
			// Set debounce timer - will check message count difference when timer fires
			const timer = setTimeout(async () => {
				console.debug('[ContextUpdateService] Timer triggered for conversation:', conversationId);
				// Timer triggers: count messages and compare with last update from DB
				const [currentMessageCount, conversationMeta] = await Promise.all([
					this.storage.countMessages(conversationId),
					this.storage.readConversationMeta(conversationId),
				]);
				const lastUpdateMessageIndex = conversationMeta?.contextLastMessageIndex || 0;
				const messageCountDiff = currentMessageCount - lastUpdateMessageIndex;

				// Only update if message count difference is greater than threshold
				if (messageCountDiff >= CONVERSATION_SUMMARY_UPDATE_THRESHOLD) {
					console.debug('[ContextUpdateService] Updating conversation summary:', conversationId, currentMessageCount, lastUpdateMessageIndex, messageCountDiff);
					await this.updateConversationSummary(conversationId, currentMessageCount);
				}

				// Timer completes and removes itself
				this.conversationTimers.delete(conversationId);
			}, SUMMARY_UPDATE_DEBOUNCE_MS);

			this.conversationTimers.set(conversationId, timer);
		}

		// Handle project update if projectId exists
		if (projectId) {
			const existingProjectTimer = this.projectTimers.get(projectId);
			if (!existingProjectTimer) {
				console.debug('[ContextUpdateService] Setting debounce timer for project:', projectId);
				// Simple debounce for project updates
				const timer = setTimeout(async () => {
					console.debug('[ContextUpdateService] Timer triggered for project:', projectId);
					await this.updateProjectSummary(projectId);
					this.projectTimers.delete(projectId);
				}, SUMMARY_UPDATE_DEBOUNCE_MS);
				this.projectTimers.set(projectId, timer);
			}
		}
	}

	/**
	 * Update conversation summary
	 */
	private async updateConversationSummary(conversationId: string, currentMessageCount: number): Promise<void> {
		try {
			// Load conversation with messages (needed for title generation)
			const conversation = await this.storage.readConversation(conversationId, true);
			if (!conversation) {
				return;
			}

			// Get project if exists
			const project = conversation.meta.projectId ? await this.getProjectForConversation(conversation.meta.projectId) : null;

			// Build context window which will generate summary
			const context = await this.conversationService.buildContextWindow(
				conversation.messages,
				project
			);
			console.debug('[ContextUpdateService] Built context window:', conversationId, context);

			// Update conversation context only (with optimistic locking)
			await this.conversationService.updateConversationContext({
				conversation,
				project,
				context,
				messageIndex: currentMessageCount,
			});

			// Update title if it hasn't been manually edited and hasn't been auto-updated before
			// Only update if context has meaningful summary (not default) and conversation has messages
			if (
				!conversation.meta.titleManuallyEdited &&
				!conversation.meta.titleAutoUpdated &&
				context.shortSummary &&
				context.shortSummary !== DEFAULT_SUMMARY &&
				context.shortSummary !== 'No summary available yet.' &&
				conversation.messages.length > 0
			) {
				await this.updateConversationTitleIfNeeded(conversation, context);
			}
		} catch (error) {
			console.warn('[SummaryUpdateService] Failed to update conversation summary:', error);
		}
	}

	/**
	 * Update conversation title if context has changed significantly.
	 * Only updates if the new title would be different from the current one.
	 */
	private async updateConversationTitleIfNeeded(
		conversation: ChatConversation,
		context: ChatContextWindow
	): Promise<void> {
		console.debug('[ContextUpdateService] Updating conversation title if needed:', conversation, context);
		try {
			// Only update title if we have at least MIN_MESSAGES_FOR_TITLE_GENERATION messages (user + assistant)
			// This ensures the conversation has meaningful content
			if (conversation.messages.length < MIN_MESSAGES_FOR_TITLE_GENERATION) {
				return;
			}

			// Generate new title based on messages
			const newTitle = await this.conversationService.generateConversationTitle(conversation.messages, context);

			if (!newTitle || newTitle.trim().length === 0) {
				// Title generation failed, skip update
				return;
			}

			// Normalize titles for comparison (trim and lowercase)
			const currentTitleNormalized = conversation.meta.title.trim().toLowerCase();
			const newTitleNormalized = newTitle.trim().toLowerCase();

			// Only update if title is significantly different
			// This avoids unnecessary updates when the title is similar
			if (currentTitleNormalized === newTitleNormalized) {
				return;
			}

			// Update title without marking as manually edited, but mark as auto-updated
			await this.conversationService.updateConversationTitle({
				conversationId: conversation.meta.id,
				title: newTitle.trim(),
				titleManuallyEdited: false, // Keep auto-update enabled
				titleAutoUpdated: true, // Mark as auto-updated
			});
		} catch (error) {
			console.warn('[ContextUpdateService] Failed to update conversation title:', error);
		}
	}

	/**
	 * Update project summary
	 */
	private async updateProjectSummary(projectId: string): Promise<void> {
		try {
			const projects = await this.storage.listProjects();
			const project = projects.find(p => p.meta.id === projectId);
			if (!project) {
				return;
			}

			// Generate summary
			const summary = await this.projectService.summarizeProject(project);

			// Update project context
			const updatedContext = {
				...project.context,
				summary,
				shortSummary: summary,
				lastUpdatedTimestamp: Date.now(),
			};

			// Save project with updated context
			await this.storage.saveProject(project.meta, updatedContext);
		} catch (error) {
			console.warn('[SummaryUpdateService] Failed to update project summary:', error);
		}
	}

	/**
	 * Get project for conversation
	 */
	private async getProjectForConversation(projectId: string): Promise<any> {
		const projects = await this.storage.listProjects();
		return projects.find(p => p.meta.id === projectId) || null;
	}


	/**
	 * Cleanup and unsubscribe
	 */
	cleanup(): void {
		// Clear all timers
		for (const timer of this.conversationTimers.values()) {
			clearTimeout(timer);
		}
		for (const timer of this.projectTimers.values()) {
			clearTimeout(timer);
		}
		this.conversationTimers.clear();
		this.projectTimers.clear();

		// Unsubscribe from events
		for (const unsubscribe of this.unsubscribeHandlers) {
			unsubscribe();
		}
		this.unsubscribeHandlers = [];
	}
}

