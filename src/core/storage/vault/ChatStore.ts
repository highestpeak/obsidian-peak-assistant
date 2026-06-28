import type { AppHandle } from '@/core/ports/AppHandle';
import type { VaultFileRef, VaultFolderRef } from '@/core/ports/VaultFileRef';
import { CHAT_PROJECT_SUMMARY_FILENAME, DEFAULT_NEW_CONVERSATION_TITLE } from '@/core/constant';
import {
	ChatContextWindow,
	ChatConversationMeta,
	ChatMessage,
	ChatProjectContext,
	ChatProjectMeta,
	ChatFilePaths,
	ChatProject,
} from '@/core/types/chat';
import type { ChatConversation } from '@/core/types/chat-vault';
import { joinPath, getAbsolutePath, getRelativePath, normalizeVaultPath } from '@/core/utils/path-utils';
import {
	ensureFolderRecursive,
	getFileRef,
	getFolderRef,
	isFile,
	writeVaultFile,
} from '@/core/storage/vault/vault-ops';
import { ChatDocName } from './chat-docs/ChatDocName';
import { ChatConversationDoc, ChatConversationDocModel } from './chat-docs/ChatConversationDoc';
import { ChatProjectSummaryDoc } from './chat-docs/ChatProjectSummaryDoc';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';
import type { ChatResourceRef } from '@/core/types/chat';
import { DEFAULT_AI_SERVICE_SETTINGS } from '@/core/config/settingsTypes';
import { buildTimestampedName } from '@/core/utils/id-utils';
import { ResourceKind } from '@/core/document/types';

export class ChatStorageService {
	private readonly rootFolder: string;

	constructor(private readonly app: AppHandle, paths: ChatFilePaths) {
		this.rootFolder = normalizeVaultPath(paths.rootFolder);
	}

	private get dbReady(): boolean {
		return sqliteStoreManager.isInitialized();
	}

	async init(): Promise<void> {
		await ensureFolderRecursive(this.rootFolder, this.app);
	}

	async saveProject(project: ChatProjectMeta, context?: ChatProjectContext): Promise<ChatProject> {
		await this.ensureProjectFolder(project);
		const projectFolder = await this.getProjectFolderPath(project);

		const summaryFilePath = joinPath(projectFolder, CHAT_PROJECT_SUMMARY_FILENAME);
		const initSummaryFile = getFileRef(summaryFilePath, this.app);
		const summaryContent = ChatProjectSummaryDoc.buildMarkdown({
			shortSummary: context?.shortSummary ?? '',
			fullSummary: context?.fullSummary ?? '',
		});
		await writeVaultFile(initSummaryFile, summaryFilePath, summaryContent, this.app);

		if (!this.dbReady) {
			console.warn('[ChatStore] SQLite not ready, skipping project DB write');
			return { meta: project, context };
		}
		const projectRepo = sqliteStoreManager.getChatProjectRepo();
		await projectRepo.upsertProject({
			projectId: project.id,
			name: project.name,
			folderRelPath: getRelativePath(this.rootFolder, projectFolder),
			createdAtTs: project.createdAtTimestamp,
			updatedAtTs: Date.now(),
		});

		return { meta: project, context };
	}

	async saveConversation(
		project: ChatProjectMeta | null,
		conversation: ChatConversationMeta,
		context?: ChatContextWindow,
		messages?: ChatMessage[]
	): Promise<ChatConversation> {
		const folder = project ? await this.getProjectFolderPath(project) : this.rootFolder;
		await ensureFolderRecursive(folder, this.app);

		const { file, path } = await this.getConvFile(conversation, folder);

		await this.upsertConversationMeta(conversation.id, {
			...conversation,
			fileRelPath: getRelativePath(this.rootFolder, path),
		});

		if (messages && messages.length > 0) {
			await this.saveNewMessage(conversation.id, messages);
		}

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

	async upsertConversationMeta(
		conversationId: string,
		updates: Partial<ChatConversationMeta>
	): Promise<ChatConversationMeta | null> {
		let updatedMeta: ChatConversationMeta | null = null;
		const now = Date.now();

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
			};
		}

		if (this.dbReady) {
			const metaExtras: Record<string, unknown> = {};
			if (updatedMeta.customSystemPrompt) metaExtras.customSystemPrompt = updatedMeta.customSystemPrompt;
			const metaJson = Object.keys(metaExtras).length > 0 ? JSON.stringify(metaExtras) : null;

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
					metaJson,
				});
		}

		return updatedMeta;
	}

	async saveNewMessage(
		conversationId: string,
		messages: ChatMessage | ChatMessage[]
	): Promise<void> {
		const conversation = await this.readConversation(conversationId, true);
		if (!conversation) {
			throw new Error(`Conversation not found: ${conversationId}`);
		}

		const contentFile = conversation.file ?? (await this.ensureConversationFile(conversation));

		const messagesArray = Array.isArray(messages) ? messages : [messages];

		const existingMessageIds = new Set(conversation.messages.map(m => m.id));
		const newMessages = messagesArray.filter(m => !existingMessageIds.has(m.id));
		if (newMessages.length === 0) return;

		if (this.dbReady) {
			await sqliteStoreManager
				.getChatMessageRepo()
				.upsertMessages(conversationId, [...conversation.messages, ...newMessages]);

			const resourceRepo = sqliteStoreManager.getChatMessageResourceRepo();
			for (const message of newMessages) {
				if (message.resources && message.resources.length > 0) {
					await resourceRepo.replaceForMessage(message.id, message.resources);
				}
			}
		}

		if (newMessages.length > 0) {
			const currentContent = await this.app.vault.read(contentFile);
			const newContent = ChatConversationDoc.appendMessagesToContent(currentContent, {
				messages: newMessages,
			});
			await this.app.vault.modify(contentFile, newContent);
		}
	}

	async readConversation(conversationId: string, loadMessages: boolean = true): Promise<ChatConversation | null> {
		const meta = await this.readConversationMeta(conversationId);
		if (!meta || !meta.fileRelPath) return null;

		const convDoc = await this.getConvDoc(meta.fileRelPath);
		if (!convDoc) return null;
		const { file, docModel, raw } = convDoc;

		const context: ChatContextWindow = {
			lastUpdatedTimestamp: meta.updatedAtTimestamp,
			recentMessagesWindow: [],
			shortSummary: docModel.shortSummary || undefined,
			fullSummary: docModel.fullSummary || undefined,
		};

		if (!loadMessages) {
			return { meta, context, messages: [], content: raw, file };
		}

		const messages = await this.loadConversationMessages(conversationId, docModel);
		return { meta, context, messages, content: raw, file };
	}

	async readConversationMeta(conversationId: string): Promise<ChatConversationMeta | null> {
		if (!this.dbReady) return null;
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		const convRow = await convRepo.getById(conversationId);
		if (!convRow) return null;

		let metaExtras: Record<string, unknown> = {};
		if (convRow.meta_json) {
			try { metaExtras = JSON.parse(convRow.meta_json); } catch { /* ignore parse errors */ }
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
			customSystemPrompt: (metaExtras.customSystemPrompt as string) ?? undefined,
		};
	}

	async readProject(projectId: string): Promise<ChatProject | null> {
		const projectMeta = await this.readProjectMeta(projectId);
		if (!projectMeta) return null;
		const context = await this.readProjectContext(projectId);
		return { meta: projectMeta, context: context ?? undefined };
	}

	async readProjectMeta(projectId: string): Promise<ChatProjectMeta | null> {
		if (!this.dbReady) return null;
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

	async readProjectContext(projectId: string): Promise<ChatProjectContext | null> {
		const projectMeta = await this.readProjectMeta(projectId);
		if (!projectMeta) return null;

		if (!projectMeta.folderPath) {
			console.warn(`[ChatStore] Project folder path is not set for project: ${projectMeta.id}`);
			return null;
		}
		const folderPath = getAbsolutePath(this.rootFolder, projectMeta.folderPath);
		const summaryPath = joinPath(folderPath, CHAT_PROJECT_SUMMARY_FILENAME);
		const summaryFile = getFileRef(summaryPath, this.app);
		if (!summaryFile) {
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
		if (!this.dbReady) return [];
		const projectRepo = sqliteStoreManager.getChatProjectRepo();
		const projects = await projectRepo.listProjects(false);
		const result: ChatProject[] = [];
		for (const projectRow of projects) {
			try {
				const project = await this.readProject(projectRow.project_id);
				if (project) result.push(project);
			} catch (error) {
				console.error(`Failed to read project: ${projectRow.project_id}`, error);
			}
		}
		return result;
	}

	async listConversations(projectId: string | null, limit?: number, offset?: number): Promise<ChatConversation[]> {
		if (!this.dbReady) return [];
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		const conversations = await convRepo.listByProject(projectId, false, limit, offset);
		const result: ChatConversation[] = [];
		for (const convRow of conversations) {
			try {
				const conv = await this.readConversation(convRow.conversation_id, false);
				if (conv) result.push(conv);
			} catch (error) {
				console.error(`Failed to read conversation: ${convRow.conversation_id}`, error);
			}
		}
		return result;
	}

	async countConversations(projectId: string | null): Promise<number> {
		if (!this.dbReady) return 0;
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		return convRepo.countByProject(projectId, false);
	}

	async updateMessageStarred(
		messageId: string,
		starred: boolean,
		contentPreview?: string | null,
		attachmentSummary?: string | null
	): Promise<void> {
		if (!this.dbReady) return;
		const messageRepo = sqliteStoreManager.getChatMessageRepo();
		await messageRepo.updateStarred(messageId, starred, contentPreview, attachmentSummary);
	}

	async updateMessageSuggestedFollowups(messageId: string, followups: string[]): Promise<void> {
		if (!this.dbReady) return;
		const messageRepo = sqliteStoreManager.getChatMessageRepo();
		await messageRepo.updateSuggestedFollowups(messageId, followups);
	}

	async listStarredMessagesByProject(projectId: string): Promise<{
		messages: ChatMessage[];
		messageToConversationId: Map<string, string>;
	}> {
		if (!this.dbReady) return { messages: [], messageToConversationId: new Map() };
		const messageRepo = sqliteStoreManager.getChatMessageRepo();
		const messageRows = await messageRepo.listStarredByProject(projectId);
		const resourceRepo = sqliteStoreManager.getChatMessageResourceRepo();
		const messageIds = messageRows.map((m) => m.message_id);
		const resourcesMap = messageIds.length > 0 ? await resourceRepo.getByMessageIds(messageIds) : new Map();

		const messages = messageRows.map((row) => {
			const msg: ChatMessage = {
				id: row.message_id,
				role: row.role as ChatMessage['role'],
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
			if (row.thinking) msg.reasoning = { content: row.thinking };
			if (row.token_usage_json) {
				try { msg.tokenUsage = JSON.parse(row.token_usage_json); } catch { /* ignore */ }
			}
			if (row.suggested_followups_json) {
				try {
					const parsed = JSON.parse(row.suggested_followups_json);
					if (Array.isArray(parsed)) {
						msg.suggestedFollowups = parsed.filter((s) => typeof s === 'string');
					}
				} catch { /* ignore */ }
			}
			return msg;
		});

		const messageToConversationId = new Map<string, string>();
		for (const row of messageRows) {
			messageToConversationId.set(row.message_id, row.conversation_id);
		}

		return { messages, messageToConversationId };
	}

	// file and path operations =================================================

	private async getConvFile(
		conversation: ChatConversationMeta,
		folder: string
	): Promise<{ file: VaultFileRef | null; path: string }> {
		let file: VaultFileRef | null = null;
		let path: string | undefined = undefined;

		if (conversation.fileRelPath) {
			path = getAbsolutePath(this.rootFolder, conversation.fileRelPath);
			file = getFileRef(path, this.app);
		}

		if (!path || !file) {
			try {
				const convRepo = sqliteStoreManager.getChatConversationRepo();
				const convRow = await convRepo.getById(conversation.id);
				if (convRow && convRow.file_rel_path) {
					path = getAbsolutePath(this.rootFolder, convRow.file_rel_path);
					file = getFileRef(path, this.app);
				}
			} catch {
				// ignore — fall through to build new path
			}
		}

		if (!path || !file) {
			const fileName = await ChatDocName.buildConvFileName(
				conversation.createdAtTimestamp,
				conversation.title,
				this.app,
				folder
			);
			path = joinPath(folder, `${fileName}.md`);
			file = getFileRef(path, this.app);
			if (!file) {
				await ensureFolderRecursive(folder, this.app);
				const created = await this.app.vault.create(path, '');
				file = created as VaultFileRef;
			}
		}

		return { file, path };
	}

	private async getProjectFolderPath(project: ChatProjectMeta): Promise<string> {
		if (project.folderPath && project.folderPath.trim()) {
			return getAbsolutePath(this.rootFolder, project.folderPath);
		}
		const baseName = await ChatDocName.buildProjectFolderName(project.createdAtTimestamp, project.name);
		return joinPath(this.rootFolder, baseName);
	}

	private async ensureProjectFolder(project: ChatProjectMeta): Promise<void> {
		await ensureFolderRecursive(this.rootFolder, this.app);
		const projectFolder = await this.getProjectFolderPath(project);
		await ensureFolderRecursive(projectFolder, this.app);
	}

	private async ensureConversationFile(conversation: ChatConversation): Promise<VaultFileRef> {
		const projectMeta = conversation.meta.projectId
			? await this.readProjectMeta(conversation.meta.projectId)
			: null;
		const folder = projectMeta ? await this.getProjectFolderPath(projectMeta) : this.rootFolder;
		await ensureFolderRecursive(folder, this.app);

		const fileName = await ChatDocName.buildConvFileName(
			conversation.meta.createdAtTimestamp,
			conversation.meta.title,
			this.app,
			folder
		);
		const path = joinPath(folder, `${fileName}.md`);

		const existingFile = getFileRef(path, this.app);
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
			return writeVaultFile(null, path, emptyMarkdown, this.app);
		}
		return existingFile;
	}

	private async getConvDoc(fileRelPath: string): Promise<{ file: VaultFileRef; docModel: ChatConversationDocModel; raw: string } | null> {
		const filePath = getAbsolutePath(this.rootFolder, fileRelPath);
		const file = getFileRef(filePath, this.app);
		if (!file) return null;
		const raw = await this.app.vault.read(file);
		const docModel = ChatConversationDoc.parse(raw);
		return { file, docModel, raw };
	}

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

		if (!this.dbReady) return [];
		const messageRepo = sqliteStoreManager.getChatMessageRepo();
		const messageRows = await messageRepo.listByConversation(conversationId);
		const resourceRepo = sqliteStoreManager.getChatMessageResourceRepo();
		const messageIds = messageRows.map((m) => m.message_id);
		const resourcesMap = messageIds.length > 0 ? await resourceRepo.getByMessageIds(messageIds) : new Map();
		const messages = this.convertSqliteRowsToMessages(messageRows, resourcesMap);
		const allMarkdownMessages = ChatStorageService.collectAllMarkdownMessages(docModel);
		this.mergeMarkdownContentIntoMessages(messages, allMarkdownMessages);

		const totalMarkdownMessages = allMarkdownMessages.length;
		const totalTopicMessages = docModel.topics.reduce((sum, t) => sum + t.messages.length, 0);
		if (messages.length !== totalMarkdownMessages) {
			console.warn(`[ChatStore] Message count mismatch: sqlite=${messages.length}, markdown=${totalMarkdownMessages} (topics: ${totalTopicMessages}, NoTopic: ${docModel.messages.length})`);
		}

		return messages;
	}

	private convertSqliteRowsToMessages(
		messageRows: DbSchema['chat_message'][],
		resourcesMap: Map<string, DbSchema['chat_message_resource'][]>
	): ChatMessage[] {
		return messageRows.map((row) => {
			const msg: ChatMessage = {
				id: row.message_id,
				role: row.role as ChatMessage['role'],
				content: '',
				createdAtTimestamp: row.created_at_ts,
				createdAtZone: row.created_at_zone ?? 'UTC',
				starred: row.starred === 1,
				model: row.model ?? '',
				provider: row.provider ?? 'other',
			};
			if (row.topic) msg.topic = row.topic;
			if (row.is_error === 1) msg.isErrorMessage = true;
			if (row.is_visible === 0) msg.isVisible = false;
			if (row.gen_time_ms !== null) msg.genTimeMs = row.gen_time_ms;
			if (row.thinking) msg.reasoning = { content: row.thinking };
			if (row.token_usage_json) {
				try { msg.tokenUsage = JSON.parse(row.token_usage_json); } catch { /* ignore */ }
			}
			if (row.suggested_followups_json) {
				try {
					const parsed = JSON.parse(row.suggested_followups_json);
					if (Array.isArray(parsed)) {
						msg.suggestedFollowups = parsed.filter((s) => typeof s === 'string');
					}
				} catch { /* ignore */ }
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

		for (const noTopicMsg of docModel.messages) {
			allMessages.push({
				content: noTopicMsg.content,
				title: noTopicMsg.title,
				role: noTopicMsg.role,
				topic: undefined,
			});
		}

		return allMessages;
	}

	private mergeMarkdownContentIntoMessages(
		messages: ChatMessage[],
		allMarkdownMessages: Array<{
			content: string;
			title?: string;
			role: 'user' | 'assistant' | 'system';
			topic?: string;
		}>
	): void {
		const minLength = Math.min(messages.length, allMarkdownMessages.length);
		for (let i = 0; i < minLength; i++) {
			const docData = allMarkdownMessages[i];
			messages[i].content = docData.content;
			messages[i].title = docData.title;
			messages[i].role = docData.role;
			if (docData.topic) messages[i].topic = docData.topic;
		}
	}

	// Project folder operations =================================================

	async getProjectFolder(projectId: string): Promise<VaultFolderRef | null> {
		const projectMeta = await this.readProjectMeta(projectId);
		if (!projectMeta || !projectMeta.folderPath) return null;
		const folderPath = getAbsolutePath(this.rootFolder, projectMeta.folderPath);
		return getFolderRef(folderPath, this.app);
	}

	buildProjectFolderRelPath(name: string, timestamp: number, projectId: string, customFolderPath?: string): string {
		if (customFolderPath?.trim()) {
			return getRelativePath(this.rootFolder, normalizeVaultPath(customFolderPath));
		}
		const folderName = buildTimestampedName('Project', name, timestamp, projectId);
		return getRelativePath(this.rootFolder, joinPath(this.rootFolder, folderName));
	}

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
		const newFolderPath = normalizeVaultPath(`${parentPath}/${newFolderName}`);

		await this.app.vault.rename(folder, newFolderName);

		return getRelativePath(this.rootFolder, newFolderPath);
	}

	// Conversation file operations =================================================

	async renameConversationFile(conversationId: string, title: string): Promise<string> {
		const conversation = await this.readConversation(conversationId, false);
		if (!conversation || !conversation.file) {
			throw new Error('Conversation not found');
		}

		const folder = conversation.file.parent ?? null;
		const fileToRename = this.findConversationFile(folder ?? null, conversation) ?? conversation.file;

		const newFileName = await ChatDocName.buildConvFileName(
			conversation.meta.createdAtTimestamp,
			title,
			this.app,
			folder?.path
		);
		const newPath = normalizeVaultPath(
			folder?.path?.trim()
				? `${folder.path}/${newFileName}.md`
				: `${newFileName}.md`
		);

		await this.app.vault.rename(fileToRename, newPath);

		return getRelativePath(this.rootFolder, newPath);
	}

	private findConversationFile(folder: VaultFolderRef | null | undefined, conversation: ChatConversation): VaultFileRef | null {
		if (!folder) return null;

		const suffix = `-${conversation.meta.id}`;
		const children = (folder as VaultFolderRef & { children?: ReadonlyArray<unknown> }).children ?? [];
		for (const child of children) {
			if (!isFile(child)) continue;
			const f = child as VaultFileRef;
			if (f.extension !== 'md') continue;
			if (f.basename === conversation.file.basename) {
				return f;
			}
			if (f.basename.startsWith('Conv-') && f.basename.endsWith(suffix)) {
				return f;
			}
		}

		return null;
	}

	async deleteProject(projectId: string): Promise<void> {
		if (!this.dbReady) return;
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		const convRows = await convRepo.listByProject(projectId, true);
		const conversationIds = convRows.map(r => r.conversation_id);

		if (conversationIds.length > 0) {
			const messageRepo = sqliteStoreManager.getChatMessageRepo();
			await messageRepo.deleteByConversationIds(conversationIds);
			await convRepo.deleteByConversationIds(conversationIds);
		}

		const folder = await this.getProjectFolder(projectId);
		if (folder) {
			await this.app.vault.trash(folder, true);
		}

		const projectRepo = sqliteStoreManager.getChatProjectRepo();
		await projectRepo.deleteByProjectId(projectId);
	}

	async deleteConversation(conversationId: string): Promise<void> {
		if (!this.dbReady) return;
		const conversation = await this.readConversation(conversationId, false);
		if (conversation?.file) {
			await this.app.vault.trash(conversation.file, true);
		}
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		const messageRepo = sqliteStoreManager.getChatMessageRepo();
		await messageRepo.deleteByConversationIds([conversationId]);
		await convRepo.deleteByConversationIds([conversationId]);
	}

	async countMessages(conversationId: string): Promise<number> {
		if (!this.dbReady) return 0;
		const messageRepo = sqliteStoreManager.getChatMessageRepo();
		return messageRepo.countByConversation(conversationId);
	}
}
