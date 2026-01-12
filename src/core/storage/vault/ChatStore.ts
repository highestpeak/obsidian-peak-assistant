import { App, normalizePath, TFile, TFolder } from 'obsidian';
import { CHAT_PROJECT_SUMMARY_FILENAME, DEFAULT_NEW_CONVERSATION_TITLE } from '@/core/constant';
import {
	ChatContextWindow,
	ChatConversationMeta,
	ChatMessage,
	ChatProjectContext,
	ChatProjectMeta,
	ChatFilePaths,
	ChatConversation,
	ChatProject,
	StarredMessageRecord,
} from '@/service/chat/types';
import { ensureFolder, joinPath, writeFile, getAbsolutePath, getRelativePath } from '@/core/utils/vault-utils';
import { ChatDocName } from './chat-docs/ChatDocName';
import { ChatConversationDoc, ChatConversationDocModel } from './chat-docs/ChatConversationDoc';
import { hashMD5 } from '@/core/utils/hash-utils';
import { ChatProjectSummaryDoc } from './chat-docs/ChatProjectSummaryDoc';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';
import type { ChatResourceRef } from '@/service/chat/types';
import { DEFAULT_AI_SERVICE_SETTINGS } from '@/app/settings/types';
import { buildTimestampedName } from '@/core/utils/id-utils';
import { ResourceKind } from '@/core/document/types';

export class ChatStorageService {
	private readonly rootFolder: string;

	constructor(private readonly app: App, paths: ChatFilePaths) {
		this.rootFolder = normalizePath(paths.rootFolder);
	}

	async init(): Promise<void> {
		await ensureFolder(this.app, this.rootFolder);
	}

	async saveProject(project: ChatProjectMeta, context?: ChatProjectContext): Promise<ChatProject> {
		await this.ensureProjectFolder(project);
		const projectFolder = await this.getProjectFolderPath(project);

		// Save summary file
		const summaryFilePath = joinPath(projectFolder, CHAT_PROJECT_SUMMARY_FILENAME);
		const initSummaryFile = this.app.vault.getAbstractFileByPath(summaryFilePath) as TFile | null;
		const summaryContent = ChatProjectSummaryDoc.buildMarkdown({
			shortSummary: context?.shortSummary ?? '',
			fullSummary: context?.fullSummary ?? '',
		});
		await writeFile(this.app, initSummaryFile, summaryFilePath, summaryContent);

		// Save meta to sqlite
		const projectRepo = sqliteStoreManager.getChatProjectRepo();
		await projectRepo.upsertProject({
			projectId: project.id,
			name: project.name,
			folderRelPath: getRelativePath(this.rootFolder, projectFolder),
			createdAtTs: project.createdAtTimestamp,
			updatedAtTs: Date.now(),
		});

		return {
			meta: project,
			context: context,
		};
	}

	/**
	 * @param project if it's a project conversation, provide the project meta
	 */
	async saveConversation(
		project: ChatProjectMeta | null,
		conversation: ChatConversationMeta,
		context?: ChatContextWindow,
		messages?: ChatMessage[]
	): Promise<ChatConversation> {
		const folder = project ? await this.getProjectFolderPath(project) : this.rootFolder;
		await ensureFolder(this.app, folder);

		// Get or build conversation file path
		const { file, path } = await this.getConvFile(conversation, folder);

		// IMPORTANT: First upsert conversation meta to ensure it exists in SQLite
		// This must happen before saveNewMessage, because saveNewMessage calls readConversation
		// which requires the meta to exist in SQLite (specifically fileRelPath must be set)
		await this.upsertConversationMeta(conversation.id, {
			...conversation,
			fileRelPath: getRelativePath(this.rootFolder, path),
		});

		// If messages are provided, save them using saveMessage
		// Now that meta is persisted, saveNewMessage can successfully read the conversation
		if (messages && messages.length > 0) {
			// console.log('[ChatStore] saveConversation saving messages', messages);
			// Save messages using saveMessage (saveMessage will load conversation and ensure file exists)
			await this.saveNewMessage(conversation.id, messages);
		}

		// Load final conversation
		const finalConv = await this.readConversation(conversation.id, true);
		if (!finalConv) {
			throw new Error(`Conversation not found after save: ${conversation.id}`);
		}

		return {
			meta: conversation,
			messages: finalConv.messages,
			context: {
				lastUpdatedTimestamp: conversation.updatedAtTimestamp,
				recentMessagesWindow: context?.recentMessagesWindow ?? finalConv.context?.recentMessagesWindow ?? [],
				shortSummary: context?.shortSummary ?? finalConv.context?.shortSummary,
				fullSummary: context?.fullSummary ?? finalConv.context?.fullSummary,
				topics: context?.topics ?? finalConv.context?.topics,
				resourceIndex: context?.resourceIndex ?? finalConv.context?.resourceIndex,
			},
			content: finalConv.content,
			file: finalConv.file,
		};
	}

	/**
	 * Update conversation metadata only (without saving messages or context).
	 * This is a lightweight operation for updating meta fields like activeModel, activeProvider, tokenUsageTotal, etc.
	 */
	async upsertConversationMeta(
		conversationId: string,
		updates: Partial<ChatConversationMeta>
	): Promise<ChatConversationMeta | null> {
		let updatedMeta: ChatConversationMeta | null = null;
		const now = Date.now();

		// Read current meta
		const currentMeta = await this.readConversationMeta(conversationId);
		if (!currentMeta || !currentMeta.fileRelPath) {
			updatedMeta = {
				...updates,
				id: conversationId,
				title: updates.title ?? DEFAULT_NEW_CONVERSATION_TITLE,
				activeModel: updates.activeModel ?? DEFAULT_AI_SERVICE_SETTINGS.defaultModel.modelId,
				activeProvider: updates.activeProvider ?? DEFAULT_AI_SERVICE_SETTINGS.defaultModel.provider,
				tokenUsageTotal: (currentMeta?.tokenUsageTotal ?? 0) + (updates.tokenUsageTotal ?? 0),
				updatedAtTimestamp: now,
				createdAtTimestamp: now,
			};
		} else {
			updatedMeta = {
				...currentMeta,
				...updates,
				updatedAtTimestamp: now,
			}
		}

		// Update in sqlite
		await sqliteStoreManager
			.getChatConversationRepo()
			.upsertConversation({
				conversationId: updatedMeta.id,
				projectId: updatedMeta.projectId ?? null,
				title: updatedMeta.title,
				fileRelPath: updatedMeta.fileRelPath ?? '',
				createdAtTs: updatedMeta.createdAtTimestamp,
				updatedAtTs: updatedMeta.updatedAtTimestamp,
				activeModel: updatedMeta.activeModel,
				activeProvider: updatedMeta.activeProvider,
				tokenUsageTotal: updatedMeta.tokenUsageTotal ?? null,
				titleManuallyEdited: updatedMeta.titleManuallyEdited ?? false,
				titleAutoUpdated: updatedMeta.titleAutoUpdated ?? false,
				contextLastUpdatedTimestamp: updatedMeta.contextLastUpdatedTimestamp ?? null,
				contextLastMessageIndex: updatedMeta.contextLastMessageIndex ?? null,
			});

		return updatedMeta;
	}

	/**
	 * Save messages to an existing conversation (low-level operation).
	 * Directly updates the database and markdown file.
	 */
	async saveNewMessage(
		conversationId: string,
		messages: ChatMessage | ChatMessage[]
	): Promise<void> {
		// Load conversation
		const conversation = await this.readConversation(conversationId, true);
		if (!conversation) {
			throw new Error(`Conversation not found: ${conversationId}`);
		}

		// Ensure file exists, create if needed
		const contentFile = conversation.file ?? (await this.ensureConversationFile(conversation));

		// Normalize to array
		const messagesArray = Array.isArray(messages) ? messages : [messages];

		// Update conversation messages array
		const existingMessageIds = new Set(conversation.messages.map(m => m.id));
		const newMessages = messagesArray.filter(m => !existingMessageIds.has(m.id));
		// console.log('[ChatStore] saveNewMessage newMessages', conversationId, 'original messages', conversation.messages, 'new messages', newMessages);
		if (newMessages.length === 0) {
			// No new messages to save, return
			return;
		}

		// Save messages to sqlite
		await sqliteStoreManager
			.getChatMessageRepo()
			.upsertMessages(
				conversationId,
				[...conversation.messages, ...newMessages]
			);

		// Save message resources for each new message
		const resourceRepo = sqliteStoreManager.getChatMessageResourceRepo();
		for (const message of newMessages) {
			if (message.resources && message.resources.length > 0) {
				await resourceRepo.replaceForMessage(message.id, message.resources);
			}
		}

		// Append all messages to markdown file at once
		if (newMessages.length > 0) {
			const currentContent = await this.app.vault.read(contentFile);
			const newContent = ChatConversationDoc.appendMessagesToContent(currentContent, {
				messages: newMessages,
			});
			// console.log('[ChatStore] saveNewMessage newContent', conversationId, 'newContent', newContent);
			await this.app.vault.modify(contentFile, newContent);
		}
	}

	/**
	 * Read a conversation by id.
	 * Loads file path from sqlite, then parses markdown for content/title/summary.
	 * @param loadMessages If false, only loads metadata and context, not messages (faster for listing).
	 */
	async readConversation(conversationId: string, loadMessages: boolean = true): Promise<ChatConversation | null> {
		const meta = await this.readConversationMeta(conversationId);
		if (!meta || !meta.fileRelPath) {
			// console.log('[ChatStore] readConversation meta not found', conversationId);
			return null;
		}

		// read conversation file (although loadMessages is false, we still need to read the file to get the context)
		const convDoc = await this.getConvDoc(meta.fileRelPath);
		if (!convDoc) {
			// console.log('[ChatStore] readConversation convDoc not found', conversationId);
			return null;
		}
		const { file, docModel, raw } = convDoc;

		const context: ChatContextWindow = {
			lastUpdatedTimestamp: meta.updatedAtTimestamp,
			recentMessagesWindow: [],
			shortSummary: docModel.shortSummary || undefined,
			fullSummary: docModel.fullSummary || undefined,
		};

		// Only load messages if requested
		if (!loadMessages) {
			return { meta, context, messages: [], content: raw, file };
		}

		// Load messages from sqlite and merge with markdown
		console.debug('[ChatStore] readConversation loading messages', conversationId, docModel);
		const messages = await this.loadConversationMessages(conversationId, docModel);
		console.debug('[ChatStore] readConversation loaded messages', conversationId, messages);
		return { meta, context, messages, content: raw, file };
	}

	/**
	 * Read conversation meta from sqlite.
	 */
	async readConversationMeta(conversationId: string): Promise<ChatConversationMeta | null> {
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		const convRow = await convRepo.getById(conversationId);
		if (!convRow) {
			return null;
		}
		return {
			id: convRow.conversation_id,
			title: convRow.title,
			projectId: convRow.project_id ?? undefined,
			createdAtTimestamp: convRow.created_at_ts,
			updatedAtTimestamp: convRow.updated_at_ts,
			activeModel: convRow.active_model ?? '',
			activeProvider: convRow.active_provider ?? 'other',
			tokenUsageTotal: convRow.token_usage_total ?? undefined,
			titleManuallyEdited: convRow.title_manually_edited === 1,
			titleAutoUpdated: convRow.title_auto_updated === 1,
			contextLastUpdatedTimestamp: convRow.context_last_updated_ts ?? undefined,
			contextLastMessageIndex: convRow.context_last_message_index ?? undefined,
			fileRelPath: convRow.file_rel_path,
		};
	}

	/**
	 * Read a project by id.
	 * Loads folder path from sqlite, then parses markdown for summary/notes.
	 */
	async readProject(projectId: string): Promise<ChatProject | null> {
		const projectMeta = await this.readProjectMeta(projectId);
		if (!projectMeta) {
			return null;
		}

		const context = await this.readProjectContext(projectId);

		return {
			meta: projectMeta,
			context: context ?? undefined,
		};
	}

	/**
	 * Get project meta by id (helper method).
	 */
	async readProjectMeta(projectId: string): Promise<ChatProjectMeta | null> {
		try {
			const projectRepo = sqliteStoreManager.getChatProjectRepo();
			const projectRow = await projectRepo.getById(projectId);
			if (!projectRow) {
				console.warn(`[ChatStore] Project not found in sqlite: ${projectId}`);
				return null;
			}
			return {
				id: projectRow.project_id,
				name: projectRow.name,
				folderPath: projectRow.folder_rel_path,
				createdAtTimestamp: projectRow.created_at_ts,
				updatedAtTimestamp: projectRow.updated_at_ts,
			};
		} catch (error) {
			console.warn('[ChatStore] Failed to load project meta:', error);
			return null;
		}
	}

	/**
	 * Read project context from summary file.
	 */
	async readProjectContext(projectId: string): Promise<ChatProjectContext | null> {
		const projectMeta = await this.readProjectMeta(projectId);
		if (!projectMeta) {
			return null;
		}

		if (!projectMeta.folderPath) {
			console.warn(`[ChatStore] Project folder path is not set for project: ${projectMeta.id}`);
			return null;
		}
		const folderPath = getAbsolutePath(this.rootFolder, projectMeta.folderPath);
		const summaryPath = joinPath(folderPath, CHAT_PROJECT_SUMMARY_FILENAME);
		const summaryFile = this.app.vault.getAbstractFileByPath(summaryPath);
		if (!(summaryFile instanceof TFile)) {
			throw new Error(`Project summary file not found: ${summaryPath}`);
		}
		const summaryRaw = await this.app.vault.read(summaryFile);
		const summaryDocModel = ChatProjectSummaryDoc.parse(summaryRaw);
		return {
			lastUpdatedTimestamp: projectMeta.updatedAtTimestamp,
			shortSummary: summaryDocModel.shortSummary || undefined,
			fullSummary: summaryDocModel.fullSummary || undefined,
		};
	}

	async listProjects(): Promise<ChatProject[]> {
		const projectRepo = sqliteStoreManager.getChatProjectRepo();
		const projects = await projectRepo.listProjects(false); // Exclude archived

		const result: ChatProject[] = [];
		for (const projectRow of projects) {
			try {
				const project = await this.readProject(projectRow.project_id);
				if (project) {
					result.push(project);
				}
			} catch (error) {
				console.error(`Failed to read project: ${projectRow.project_id}`, error);
			}
		}
		return result;
	}

	async listConversations(projectId: string | null, limit?: number, offset?: number): Promise<ChatConversation[]> {
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		const conversations = await convRepo.listByProject(projectId, false, limit, offset); // Exclude archived

		const result: ChatConversation[] = [];
		for (const convRow of conversations) {
			try {
				// Don't load messages for listing (only metadata and context)
				const conv = await this.readConversation(convRow.conversation_id, false);
				if (conv) {
					result.push(conv);
				}
			} catch (error) {
				console.error(`Failed to read conversation: ${convRow.conversation_id}`, error);
			}
		}
		return result;
	}

	/**
	 * Count conversations, optionally filtered by project.
	 */
	async countConversations(projectId: string | null): Promise<number> {
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		return convRepo.countByProject(projectId, false); // Exclude archived
	}

	/**
	 * Update starred status for a message.
	 */
	/**
	 * Update starred status for a message.
	 * Optionally accepts content preview and attachment summary to store when starring.
	 */
	async updateMessageStarred(
		messageId: string,
		starred: boolean,
		contentPreview?: string | null,
		attachmentSummary?: string | null
	): Promise<void> {
		const messageRepo = sqliteStoreManager.getChatMessageRepo();
		await messageRepo.updateStarred(messageId, starred, contentPreview, attachmentSummary);
	}

	/**
	 * List starred messages for a project.
	 * Returns messages with conversationId mapping for easy lookup.
	 * Uses content preview and attachment summary from database (no markdown parsing needed).
	 */
	async listStarredMessagesByProject(projectId: string): Promise<{
		messages: ChatMessage[];
		messageToConversationId: Map<string, string>;
	}> {
		const messageRepo = sqliteStoreManager.getChatMessageRepo();
		const messageRows = await messageRepo.listStarredByProject(projectId);
		const resourceRepo = sqliteStoreManager.getChatMessageResourceRepo();
		const messageIds = messageRows.map((m) => m.message_id);
		const resourcesMap = messageIds.length > 0 ? await resourceRepo.getByMessageIds(messageIds) : new Map();
		
		// Convert SQLite rows to ChatMessage objects
		// Use content_preview from database instead of parsing markdown
		const messages = messageRows.map((row) => {
			const msg: ChatMessage = {
				id: row.message_id,
				role: row.role as ChatMessage['role'],
				// Use preview content from database (or empty string if not available)
				content: row.content_preview || '',
				createdAtTimestamp: row.created_at_ts,
				createdAtZone: row.created_at_zone ?? 'UTC',
				starred: row.starred === 1,
				model: row.model ?? '',
				provider: row.provider ?? 'other',
			};
			if (row.is_error === 1) msg.isErrorMessage = true;
			if (row.is_visible === 0) msg.isVisible = false;
			if (row.gen_time_ms !== null) msg.genTimeMs = row.gen_time_ms;
			if (row.thinking) msg.thinking = row.thinking;
			if (row.token_usage_json) {
				try {
					msg.tokenUsage = JSON.parse(row.token_usage_json);
				} catch { }
			}
			// Note: We don't load full resources for starred messages list
			// The attachment_summary field provides a summary instead
			// If attachment_summary is available, we could add it as a metadata field
			// For now, we'll just use the preview content
			return msg;
		});
		
		// Create mapping from message ID to conversation ID
		const messageToConversationId = new Map<string, string>();
		for (const row of messageRows) {
			messageToConversationId.set(row.message_id, row.conversation_id);
		}
		
		return { messages, messageToConversationId };
	}

	/**
	 * List active starred message records from sqlite.
	 * @deprecated This method is deprecated. Starred status is now stored directly in chat_message table.
	 */
	async listStarred(): Promise<StarredMessageRecord[]> {
		const starRepo = sqliteStoreManager.getChatStarRepo();
		const rows = await starRepo.listActive();
		return rows.map((row) => ({
			id: row.id,
			sourceMessageId: row.source_message_id,
			conversationId: row.conversation_id,
			projectId: row.project_id ?? undefined,
			createdAt: row.created_at_ts,
			active: row.active === 1,
		}));
	}

	// file and path operations =================================================

	/**
	 * Get or build conversation file path and file.
	 * Returns the file if it exists, or null if it needs to be created.
	 */
	private async getConvFile(
		conversation: ChatConversationMeta,
		folder: string
	): Promise<{ file: TFile | null; path: string }> {
		let file: TFile | null = null;
		let path: string | undefined = undefined;

		// 1. Try to get path/file from conversation meta (highest priority, for renamed files)
		if (conversation.fileRelPath) {
			path = getAbsolutePath(this.rootFolder, conversation.fileRelPath);
			file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
		}

		// 2. If not found, try to get from database
		if (!path || !file) {
			try {
				const convRepo = sqliteStoreManager.getChatConversationRepo();
				const convRow = await convRepo.getById(conversation.id);

				if (convRow && convRow.file_rel_path) {
					path = getAbsolutePath(this.rootFolder, convRow.file_rel_path);
					file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
				}
			} catch (error) {
				// Ignore errors, will build new path below
			}
		}

		// 3. If still not found, build and create file
		if (!path || !file) {
			const fileName = await ChatDocName.buildConvFileName(
				conversation.createdAtTimestamp,
				conversation.title,
				this.app.vault,
				folder
			);
			path = joinPath(folder, `${fileName}.md`);
			file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
			if (!file) {
				await ensureFolder(this.app, folder);
				file = await this.app.vault.create(path, '');
			}
		}

		return { file, path };
	}

	private async getProjectFolderPath(project: ChatProjectMeta): Promise<string> {
		if (project.folderPath && project.folderPath.trim()) {
			return getAbsolutePath(this.rootFolder, project.folderPath);
		}
		// Use new naming rule - build name without conflict resolution for existing projects
		const baseName = await ChatDocName.buildProjectFolderName(project.createdAtTimestamp, project.name);
		return joinPath(this.rootFolder, baseName);
	}

	private async ensureProjectFolder(project: ChatProjectMeta): Promise<void> {
		await ensureFolder(this.app, this.rootFolder);
		const projectFolder = await this.getProjectFolderPath(project);
		await ensureFolder(this.app, projectFolder);
	}

	/**
	 * Ensure conversation file exists, create if needed.
	 */
	private async ensureConversationFile(conversation: ChatConversation): Promise<TFile> {
		// Get project meta to determine folder
		const projectMeta = conversation.meta.projectId
			? await this.readProjectMeta(conversation.meta.projectId)
			: null;
		const folder = projectMeta ? await this.getProjectFolderPath(projectMeta) : this.rootFolder;
		await ensureFolder(this.app, folder);

		// Build filename
		const fileName = await ChatDocName.buildConvFileName(
			conversation.meta.createdAtTimestamp,
			conversation.meta.title,
			this.app.vault,
			folder
		);
		const path = joinPath(folder, `${fileName}.md`);

		// Check if conversation file exists before creating
		const existingFile = this.app.vault.getAbstractFileByPath(path);
		if (!existingFile) {
			const emptyMarkdown = ChatConversationDoc.buildMarkdown({
				docModel: {
					attachments: [],
					shortSummary: conversation.context?.shortSummary ?? '',
					fullSummary: conversation.context?.fullSummary ?? '',
					topics: [],
					messages: [],
				},
			});
			return await writeFile(this.app, null, path, emptyMarkdown);
		} else {
			return existingFile as TFile;
		}
	}

	/**
	 * Read conversation file and parse markdown document.
	 */
	private async getConvDoc(fileRelPath: string): Promise<{ file: TFile; docModel: ChatConversationDocModel; raw: string } | null> {
		const filePath = getAbsolutePath(this.rootFolder, fileRelPath);
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			return null;
		}
		const raw = await this.app.vault.read(file);
		console.debug('[ChatStore] getConvDoc raw', fileRelPath, 'raw', { raw: raw });
		const docModel = ChatConversationDoc.parse(raw);
		console.debug('[ChatStore] getConvDoc docModel', fileRelPath, 'docModel', docModel);
		return { file, docModel, raw };
	}

	/**
	 * Load conversation messages from sqlite and merge with markdown content.
	 */
	private async loadConversationMessages(
		conversationId: string,
		docModel?: ChatConversationDocModel
	): Promise<ChatMessage[]> {
		if (!docModel) {
			const meta = await this.readConversationMeta(conversationId);
			if (!meta || !meta.fileRelPath) {
				throw new Error(`Conversation meta or file path not found for: ${conversationId}`);
			}
			docModel = (await this.getConvDoc(meta.fileRelPath))?.docModel;
			if (!docModel) {
				throw new Error(`Conversation file not found: ${conversationId}`);
			}
		}

		// Load messages from sqlite
		const messageRepo = sqliteStoreManager.getChatMessageRepo();
		const messageRows = await messageRepo.listByConversation(conversationId);
		const resourceRepo = sqliteStoreManager.getChatMessageResourceRepo();
		const messageIds = messageRows.map((m) => m.message_id);
		const resourcesMap = messageIds.length > 0 ? await resourceRepo.getByMessageIds(messageIds) : new Map();
		console.debug('[ChatStore][loadConversationMessages] conversationId:', conversationId, 'messageIds:', messageIds,
			'messageRows:', messageRows, 'docModel:', docModel, 'resourcesMap:', resourcesMap);

		const messages = this.convertSqliteRowsToMessages(messageRows, resourcesMap);
		const allMarkdownMessages = ChatStorageService.collectAllMarkdownMessages(docModel);
		this.mergeMarkdownContentIntoMessages(messages, allMarkdownMessages);

		// Warn if message counts don't match
		const totalMarkdownMessages = allMarkdownMessages.length;
		const totalTopicMessages = docModel.topics.reduce((sum, t) => sum + t.messages.length, 0);
		if (messages.length !== totalMarkdownMessages) {
			console.warn(`[ChatStore] Message count mismatch: sqlite=${messages.length}, markdown=${totalMarkdownMessages} (topics: ${totalTopicMessages}, NoTopic: ${docModel.messages.length})`);
		}

		return messages;
	}

	/**
	 * Convert SQLite message rows to ChatMessage array.
	 */
	private convertSqliteRowsToMessages(
		messageRows: DbSchema['chat_message'][],
		resourcesMap: Map<string, DbSchema['chat_message_resource'][]>
	): ChatMessage[] {
		return messageRows.map((row) => {
			const msg: ChatMessage = {
				id: row.message_id,
				role: row.role as ChatMessage['role'],
				content: '', // Filled from markdown
				createdAtTimestamp: row.created_at_ts,
				createdAtZone: row.created_at_zone ?? 'UTC',
				starred: row.starred === 1,
				model: row.model ?? '',
				provider: row.provider ?? 'other',
			};
			if (row.is_error === 1) msg.isErrorMessage = true;
			if (row.is_visible === 0) msg.isVisible = false;
			if (row.gen_time_ms !== null) msg.genTimeMs = row.gen_time_ms;
			if (row.thinking) msg.thinking = row.thinking;
			if (row.token_usage_json) {
				try {
					msg.tokenUsage = JSON.parse(row.token_usage_json);
				} catch { }
			}
			const resources = resourcesMap.get(row.message_id);
			if (resources && resources.length > 0) {
				msg.resources = resources.map((r: DbSchema['chat_message_resource']) => ({
					source: r.source,
					id: r.id,
					kind: (r.kind as ResourceKind) ?? 'unknown',
					summaryNotePath: r.summary_note_rel_path ?? undefined,
				}));
			}
			return msg;
		});
	}

	/**
	 * Collect all messages from docModel (topics + NoTopic) in chronological order.
	 */
	private static collectAllMarkdownMessages(docModel: ChatConversationDocModel): Array<{
		content: string;
		title?: string;
		role: 'user' | 'assistant' | 'system';
		topic?: string;
	}> {
		const allMessages: Array<{
			content: string;
			title?: string;
			role: 'user' | 'assistant' | 'system';
			topic?: string;
		}> = [];

		// Add messages from topics (in topic order, message order within each topic)
		for (const topic of docModel.topics) {
			for (const topicMsg of topic.messages) {
				allMessages.push({
					content: topicMsg.content,
					title: topicMsg.title,
					role: topicMsg.role,
					topic: topic.title,
				});
			}
		}

		// Add messages from NoTopic section
		for (const noTopicMsg of docModel.messages) {
			allMessages.push({
				content: noTopicMsg.content,
				title: noTopicMsg.title,
				role: noTopicMsg.role,
				topic: undefined, // NoTopic messages have no topic
			});
		}

		return allMessages;
	}

	/**
	 * Merge markdown content (content, title, role, topic) into SQLite messages.
	 */
	private mergeMarkdownContentIntoMessages(
		messages: ChatMessage[],
		allMarkdownMessages: Array<{
			content: string;
			title?: string;
			role: 'user' | 'assistant' | 'system';
			topic?: string;
		}>
	): void {
		// Build a map of message keys to message data for fast lookup
		const messageKeyToDocData = new Map<string, {
			content: string;
			title?: string;
			role: 'user' | 'assistant' | 'system';
			topic?: string;
		}>();

		for (const docMsg of allMarkdownMessages) {
			const key = ChatStorageService.createMessageKey(docMsg.role, docMsg.content, docMsg.title);
			messageKeyToDocData.set(key, docMsg);
		}

		// Merge message content/title/role/topic from markdown into sqlite messages
		// Strategy: Use index-based matching (assuming chronological order), then verify/correct by message key
		const minLength = Math.min(messages.length, allMarkdownMessages.length);
		for (let i = 0; i < minLength; i++) {
			const docData = allMarkdownMessages[i];
			messages[i].content = docData.content;
			messages[i].title = docData.title;
			messages[i].role = docData.role; // Use role from markdown as source of truth
			messages[i].topic = docData.topic; // Assign topic (undefined for NoTopic messages)
		}

		// Verify and correct matches using message key (handles cases where order might differ)
		for (const msg of messages) {
			if (!msg.content) {
				continue; // Skip if no content (shouldn't happen after above loop, but be safe)
			}
			const msgKey = ChatStorageService.createMessageKey(msg.role, msg.content, msg.title);
			const docData = messageKeyToDocData.get(msgKey);
			if (docData) {
				// Update topic if it doesn't match (content/role/title should already match)
				if (msg.topic !== docData.topic) {
					msg.topic = docData.topic;
				}
			}
		}
	}

	/**
	 * Create message key for matching (same as ChatConversationDoc.createMessageKey).
	 */
	private static createMessageKey(role: string, content: string, title?: string): string {
		const contentHash = hashMD5(content);
		return `${role}|${contentHash}|${title || ''}`;
	}

	// Project folder operations =================================================

	/**
	 * Get project folder by project id.
	 */
	async getProjectFolder(projectId: string): Promise<TFolder | null> {
		const projectMeta = await this.readProjectMeta(projectId);
		if (!projectMeta || !projectMeta.folderPath) {
			return null;
		}
		const folderPath = getAbsolutePath(this.rootFolder, projectMeta.folderPath);
		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		return folder instanceof TFolder ? folder : null;
	}

	/**
	 * Build project folder relative path.
	 */
	buildProjectFolderRelPath(name: string, timestamp: number, projectId: string, customFolderPath?: string): string {
		if (customFolderPath?.trim()) {
			return getRelativePath(this.rootFolder, normalizePath(customFolderPath));
		}
		const folderName = buildTimestampedName('Project', name, timestamp, projectId);
		return getRelativePath(this.rootFolder, joinPath(this.rootFolder, folderName));
	}

	/**
	 * Rename project folder and return new relative path.
	 */
	async renameProjectFolder(projectId: string, newName: string): Promise<string> {
		const folder = await this.getProjectFolder(projectId);
		if (!folder) {
			throw new Error('Project folder not found');
		}

		const projectMeta = await this.readProjectMeta(projectId);
		if (!projectMeta) {
			throw new Error('Project meta not found');
		}

		const timestamp = Date.now();
		const newFolderName = buildTimestampedName('Project', newName, timestamp, projectId);
		const parentPath = folder.parent?.path ?? this.rootFolder;
		const newFolderPath = normalizePath(`${parentPath}/${newFolderName}`);

		// Rename the folder
		await this.app.vault.rename(folder, newFolderName);

		// Return new relative path
		return getRelativePath(this.rootFolder, newFolderPath);
	}

	// Conversation file operations =================================================

	/**
	 * Rename conversation file and return new relative path.
	 */
	async renameConversationFile(conversationId: string, title: string): Promise<string> {
		const conversation = await this.readConversation(conversationId, false);
		if (!conversation || !conversation.file) {
			throw new Error('Conversation not found');
		}

		const folder = conversation.file.parent;
		const fileToRename = this.findConversationFile(folder, conversation) ?? conversation.file;

		// Build new filename with the updated title
		const newFileName = await ChatDocName.buildConvFileName(
			conversation.meta.createdAtTimestamp,
			title,
			this.app.vault,
			folder?.path
		);
		const newPath = normalizePath(
			folder?.path?.trim()
				? `${folder.path}/${newFileName}.md`
				: `${newFileName}.md`
		);

		// Rename the file
		await this.app.vault.rename(fileToRename, newPath);

		// Return new relative path
		return getRelativePath(this.rootFolder, newPath);
	}

	/**
	 * Locate the conversation file under the provided folder by matching the id suffix.
	 */
	private findConversationFile(folder: TFolder | null | undefined, conversation: ChatConversation): TFile | null {
		if (!folder) {
			return null;
		}

		const suffix = `-${conversation.meta.id}`;
		for (const child of folder.children) {
			if (!(child instanceof TFile) || child.extension !== 'md') {
				continue;
			}
			if (child.basename === conversation.file.basename) {
				return child;
			}
			if (child.basename.startsWith('Conv-') && child.basename.endsWith(suffix)) {
				return child;
			}
		}

		return null;
	}

	/**
	 * Count messages for a conversation (lightweight operation).
	 */
	async countMessages(conversationId: string): Promise<number> {
		const messageRepo = sqliteStoreManager.getChatMessageRepo();
		return messageRepo.countByConversation(conversationId);
	}
}

