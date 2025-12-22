import type { App } from 'obsidian';
import type { ChatStorageService } from './storage';
import type { ResourceSummaryService } from './resources/ResourceSummaryService';
import type { ParsedConversationFile, ParsedProjectFile, ChatMessage, ChatContextWindow, ChatProjectContext } from './types';
import { normalizePath } from 'obsidian';

/**
 * Migration service for upgrading conversation/project data structures
 */
export class ChatMigrationService {
	constructor(
		private readonly app: App,
		private readonly storage: ChatStorageService,
		private readonly resourceSummaryService: ResourceSummaryService
	) {}

	/**
	 * Perform one-time migration of all conversations and projects
	 */
	async migrateAll(): Promise<MigrationResult> {
		const result: MigrationResult = {
			conversationsMigrated: 0,
			projectsMigrated: 0,
			resourcesCreated: 0,
			errors: [],
		};

		try {
			// Initialize resource summary service
			await this.resourceSummaryService.init();

			// Migrate all projects
			const projects = await this.storage.listProjects();
			for (const project of projects) {
				try {
					if (await this.needsProjectMigration(project)) {
						await this.migrateProject(project);
						result.projectsMigrated++;
					}
				} catch (error) {
					const err = error instanceof Error ? error : new Error(String(error));
					result.errors.push({ type: 'project', id: project.meta.id, error: err.message });
					console.error(`[Migration] Failed to migrate project ${project.meta.id}:`, err);
				}
			}

			// Migrate all conversations (including those in projects)
			const conversations = await this.storage.listConversations();
			for (const conversation of conversations) {
				try {
					if (await this.needsConversationMigration(conversation)) {
						const resourceCount = await this.migrateConversation(conversation);
						result.conversationsMigrated++;
						result.resourcesCreated += resourceCount;
					}
				} catch (error) {
					const err = error instanceof Error ? error : new Error(String(error));
					result.errors.push({ type: 'conversation', id: conversation.meta.id, error: err.message });
					console.error(`[Migration] Failed to migrate conversation ${conversation.meta.id}:`, err);
				}
			}

			// Also migrate conversations in projects
			for (const project of projects) {
				const projectConversations = await this.storage.listConversations(project.meta);
				for (const conversation of projectConversations) {
					try {
						if (await this.needsConversationMigration(conversation)) {
							const resourceCount = await this.migrateConversation(conversation, project);
							result.conversationsMigrated++;
							result.resourcesCreated += resourceCount;
						}
					} catch (error) {
						const err = error instanceof Error ? error : new Error(String(error));
						result.errors.push({ type: 'conversation', id: conversation.meta.id, error: err.message });
						console.error(`[Migration] Failed to migrate conversation ${conversation.meta.id}:`, err);
					}
				}
			}

			console.log(`[Migration] Completed: ${result.conversationsMigrated} conversations, ${result.projectsMigrated} projects, ${result.resourcesCreated} resources`);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			result.errors.push({ type: 'general', id: '', error: err.message });
			console.error('[Migration] General migration error:', err);
		}

		return result;
	}

	/**
	 * Check if a conversation needs migration
	 */
	private async needsConversationMigration(conversation: ParsedConversationFile): Promise<boolean> {
		// Check if any message has attachments (legacy) but no resources
		for (const message of conversation.messages) {
			// Check for legacy attachments field (which we'll migrate to resources)
			const hasLegacyAttachments = (message as any).attachments && (message as any).attachments.length > 0;
			const hasResources = message.resources && message.resources.length > 0;
			
			if (hasLegacyAttachments && !hasResources) {
				return true;
			}
		}
		// Always migrate if context doesn't have resourceIndex structure
		if (!conversation.context?.resourceIndex || conversation.context.resourceIndex.length === 0) {
			// Check if there are any resources in messages that should be indexed
			const hasAnyResources = conversation.messages.some(m => m.resources && m.resources.length > 0);
			if (hasAnyResources) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Check if a project needs migration
	 */
	private async needsProjectMigration(project: ParsedProjectFile): Promise<boolean> {
		// Always migrate projects to ensure they have updated context structure
		return true;
	}

	/**
	 * Migrate a single conversation
	 */
	private async migrateConversation(
		conversation: ParsedConversationFile,
		project?: ParsedProjectFile
	): Promise<number> {
		let resourceCount = 0;
		const updatedMessages: ChatMessage[] = [];
		const resourceIds = new Set<string>();

		// Migrate messages: convert legacy attachments to resources
		for (const message of conversation.messages) {
			const updatedMessage: ChatMessage = { ...message };
			
			// Check for legacy attachments field (which may exist in old data)
			const legacyAttachments = (message as any).attachments as string[] | undefined;

			if (legacyAttachments && legacyAttachments.length > 0 && (!message.resources || message.resources.length === 0)) {
				// Convert attachments to resources
				const resources = [];
				for (const attachment of legacyAttachments) {
					const resourceRef = this.resourceSummaryService.createResourceRef(attachment);
					const summaryPath = this.resourceSummaryService.getResourceSummaryPath(resourceRef.id);
					resourceRef.summaryNotePath = summaryPath;

					// Create or update resource summary
					await this.resourceSummaryService.saveResourceSummary({
						resourceId: resourceRef.id,
						source: resourceRef.source,
						kind: resourceRef.kind,
						mentionedInConversations: [conversation.meta.id],
						mentionedInProjects: project ? [project.meta.id] : undefined,
					});

					resources.push(resourceRef);
					resourceIds.add(resourceRef.id);
					resourceCount++;
				}

				updatedMessage.resources = resources;
			} else if (message.resources) {
				// If resources already exist, collect their IDs for index
				for (const resource of message.resources) {
					resourceIds.add(resource.id);
				}
			}

			updatedMessages.push(updatedMessage);
		}

		// Build resource index from created resources (using ResourceSummaryMeta)
		const resourceIndex = [];
		for (const resourceId of resourceIds) {
			const summary = await this.resourceSummaryService.readResourceSummary(resourceId);
			if (summary) {
				resourceIndex.push(summary.meta);
			}
		}

		// Update context with resource index
		const existingContext = conversation.context || {
			lastUpdatedTimestamp: Date.now(),
			recentMessagesWindow: [],
			summary: 'defaultSummary',
		};
		
		const updatedContext: ChatContextWindow = {
			...existingContext,
			lastUpdatedTimestamp: Date.now(),
			summary: existingContext.summary || 'defaultSummary',
			shortSummary: existingContext.shortSummary || existingContext.summary || 'defaultSummary',
			fullSummary: existingContext.fullSummary || existingContext.summary || undefined,
			resourceIndex,
		};

		// Update meta (no schema version tracking needed for full migration)
		const updatedMeta = {
			...conversation.meta,
		};

		// Save migrated conversation
		await this.storage.saveConversation(
			project?.meta ?? null,
			updatedMeta,
			updatedMessages,
			updatedContext,
			undefined,
			conversation.file
		);

		return resourceCount;
	}

	/**
	 * Migrate a single project
	 */
	private async migrateProject(project: ParsedProjectFile): Promise<void> {
		// Update context structure
		const updatedContext: ChatProjectContext = {
			...project.context,
			lastUpdatedTimestamp: Date.now(),
			summary: project.context?.summary || 'defaultSummary',
			shortSummary: project.context?.shortSummary || project.shortSummary || project.context?.summary || 'defaultSummary',
			fullSummary: project.context?.fullSummary || project.context?.summary || undefined,
		};

		// Update meta (no schema version tracking needed for full migration)
		const updatedMeta = {
			...project.meta,
		};

		// Save migrated project
		await this.storage.saveProject(updatedMeta, updatedContext);
	}
}

/**
 * Migration result
 */
export interface MigrationResult {
	conversationsMigrated: number;
	projectsMigrated: number;
	resourcesCreated: number;
	errors: Array<{
		type: 'conversation' | 'project' | 'general';
		id: string;
		error: string;
	}>;
}

