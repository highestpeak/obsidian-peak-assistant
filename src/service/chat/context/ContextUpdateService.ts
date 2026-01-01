import { EventBus, MessageSentEvent, ConversationCreatedEvent, ViewEventType } from '@/core/eventBus';
import { CONVERSATION_SUMMARY_UPDATE_THRESHOLD, PROJECT_SUMMARY_UPDATE_THRESHOLD, SUMMARY_UPDATE_DEBOUNCE_MS, DEFAULT_SUMMARY } from '@/core/constant';
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
	// Count messages per conversation
	private conversationCounts = new Map<string, number>();
	// Count messages per project (across all conversations in the project)
	private projectCounts = new Map<string, number>();
	private conversationTimers = new Map<string, NodeJS.Timeout>();
	private projectTimers = new Map<string, NodeJS.Timeout>();
	private unsubscribeHandlers: (() => void)[] = [];

	constructor(
		private readonly eventBus: EventBus,
		private readonly storage: ChatStorageService,
		private readonly conversationService: ConversationService,
		private readonly projectService: ProjectService,
	) {
		// TODO: uncomment this after testing
		// this.setupListeners();
	}

	/**
	 * Setup event listeners
	 */
	private setupListeners(): void {
		const unsubscribe1 = this.eventBus.on(ViewEventType.MESSAGE_SENT, (event: MessageSentEvent) => {
			this.handleMessageSent(event);
		});
		this.unsubscribeHandlers.push(unsubscribe1);

		const unsubscribe2 = this.eventBus.on(ViewEventType.CONVERSATION_CREATED, (event: ConversationCreatedEvent) => {
			this.handleConversationCreated(event);
		});
		this.unsubscribeHandlers.push(unsubscribe2);
	}

	/**
	 * Handle message sent event
	 */
	private async handleMessageSent(event: MessageSentEvent): Promise<void> {
		const { conversationId, projectId } = event;

		// Increment conversation count
		const convCount = (this.conversationCounts.get(conversationId) || 0) + 1;
		this.conversationCounts.set(conversationId, convCount);

		// Clear existing timer
		const existingTimer = this.conversationTimers.get(conversationId);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		// Check if threshold reached
		if (convCount >= CONVERSATION_SUMMARY_UPDATE_THRESHOLD) {
			// Trigger immediate update
			this.conversationCounts.set(conversationId, 0);
			await this.updateConversationSummary(conversationId);
		} else {
			// Set debounce timer
			const timer = setTimeout(async () => {
				this.conversationCounts.set(conversationId, 0);
				await this.updateConversationSummary(conversationId);
				this.conversationTimers.delete(conversationId);
			}, SUMMARY_UPDATE_DEBOUNCE_MS);
			this.conversationTimers.set(conversationId, timer);
		}

		// Handle project update if projectId exists
		// Project summary is also based on message count
		if (projectId) {
			const projectCount = (this.projectCounts.get(projectId) || 0) + 1;
			this.projectCounts.set(projectId, projectCount);

			const existingProjectTimer = this.projectTimers.get(projectId);
			if (existingProjectTimer) {
				clearTimeout(existingProjectTimer);
			}

			if (projectCount >= PROJECT_SUMMARY_UPDATE_THRESHOLD) {
				this.projectCounts.set(projectId, 0);
				await this.updateProjectSummary(projectId);
			} else {
				const timer = setTimeout(async () => {
					this.projectCounts.set(projectId, 0);
					await this.updateProjectSummary(projectId);
					this.projectTimers.delete(projectId);
				}, SUMMARY_UPDATE_DEBOUNCE_MS);
				this.projectTimers.set(projectId, timer);
			}
		}
	}

	/**
	 * Handle conversation created event
	 */
	private async handleConversationCreated(event: ConversationCreatedEvent): Promise<void> {
		// For new conversations, we don't need to update summary immediately
		// Project summary will be updated when messages are sent to conversations in the project
	}

	/**
	 * Update conversation summary
	 */
	private async updateConversationSummary(conversationId: string): Promise<void> {
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

			// Update conversation context only (with optimistic locking)
			await this.conversationService.updateConversationContext({
				conversation,
				project,
				context,
			});

			// Update title if it hasn't been manually edited
			// Only update if context has meaningful summary (not default) and conversation has messages
			if (
				!conversation.meta.titleManuallyEdited &&
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
		try {
			// Only update title if we have at least 2 messages (user + assistant)
			// This ensures the conversation has meaningful content
			if (conversation.messages.length < 2) {
				return;
			}

			// Generate new title based on messages
			const newTitle = await this.conversationService.generateConversationTitle(conversation.messages);
			
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

			// Update title without marking as manually edited (preserve auto-update capability)
			await this.conversationService.updateConversationTitle({
				conversationId: conversation.meta.id,
				title: newTitle.trim(),
				titleManuallyEdited: false, // Keep auto-update enabled
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

