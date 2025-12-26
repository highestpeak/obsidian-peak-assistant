import { App, normalizePath, TFile } from 'obsidian';
import { DEFAULT_SUMMARY } from '@/core/constant';
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
import { ensureFolder } from '@/core/utils/vault-utils';
import { ChatDocName } from './chat-docs/ChatDocName';
import { ChatConversationDoc } from './chat-docs/ChatConversationDoc';
import { ChatProjectSummaryDoc } from './chat-docs/ChatProjectSummaryDoc';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';
import type { ChatResourceRef } from '@/service/chat/types';

export class ChatStorageService {
	private readonly rootFolder: string;

	constructor(private readonly app: App, paths: ChatFilePaths) {
		this.rootFolder = normalizePath(paths.rootFolder);
	}

	async init(): Promise<void> {
		await ensureFolder(this.app, this.rootFolder);
	}

	private async ensureProjectFolders(project: ChatProjectMeta): Promise<void> {
		await ensureFolder(this.app, this.rootFolder);
		const projectFolder = await this.getProjectFolderPath(project);
		await ensureFolder(this.app, projectFolder);
	}

	async saveProject(project: ChatProjectMeta, context?: ChatProjectContext): Promise<ChatProject> {
		await this.ensureProjectFolders(project);
		const fileName = `Project-Summary.md`;
		const projectFolder = await this.getProjectFolderPath(project);
		const path = this.join(projectFolder, fileName);

		const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
		const markdown = ChatProjectSummaryDoc.buildMarkdown({
			shortSummary: context?.shortSummary ?? '',
			fullSummary: context?.fullSummary ?? '',
		});
		const savedFile = await this.writeFile(file, path, markdown);

		// Save meta to sqlite
		const projectRepo = sqliteStoreManager.getChatProjectRepo();
		const folderRelPath = this.getRelativePath(projectFolder);
		await projectRepo.upsertProject({
			projectId: project.id,
			name: project.name,
			folderRelPath,
			createdAtTs: project.createdAtTimestamp,
			updatedAtTs: project.updatedAtTimestamp,
		});

		const finalContext: ChatProjectContext = {
			lastUpdatedTimestamp: project.updatedAtTimestamp,
			shortSummary: context?.shortSummary ?? undefined,
			fullSummary: context?.fullSummary ?? undefined,
			resourceIndex: context?.resourceIndex,
		};
		const finalShortSummary = context?.shortSummary ?? context?.fullSummary ?? undefined;

		return {
			meta: project,
			context: finalContext,
			content: markdown,
			file: savedFile,
			shortSummary: finalShortSummary,
		};
	}

	async saveConversation(
		project: ChatProjectMeta | null,
		conversation: ChatConversationMeta,
		messages: ChatMessage[],
		context?: ChatContextWindow,
		existingFile?: TFile
	): Promise<ChatConversation> {
		const folder = project ? await this.getProjectFolderPath(project) : this.rootFolder;
		await ensureFolder(this.app, folder);

		// Build filename with new naming rule
		let fileName: string;
		if (existingFile) {
			fileName = existingFile.basename;
		} else {
			fileName = await ChatDocName.buildConvFileName(
				conversation.createdAtTimestamp,
				conversation.title,
				this.app.vault,
				folder
			);
		}

		const path = this.join(folder, `${fileName}.md`);
		const file = existingFile ?? (this.app.vault.getAbstractFileByPath(path) as TFile | null);

		// Collect attachments from messages
		const attachments: ChatResourceRef[] = [];
		for (const msg of messages) {
			if (msg.resources) {
				attachments.push(...msg.resources);
			}
		}

		const markdown = ChatConversationDoc.buildMarkdown({
			shortSummary: context?.shortSummary ?? '',
			fullSummary: context?.fullSummary ?? '',
			messages,
			attachments,
		});
		const savedFile = await this.writeFile(file, path, markdown);

		// Save meta to sqlite
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		const fileRelPath = this.getRelativePath(path);
		await convRepo.upsertConversation({
			conversationId: conversation.id,
			projectId: project?.id ?? null,
			title: conversation.title,
			fileRelPath,
			createdAtTs: conversation.createdAtTimestamp,
			updatedAtTs: conversation.updatedAtTimestamp,
			activeModel: conversation.activeModel,
			activeProvider: conversation.activeProvider,
			tokenUsageTotal: conversation.tokenUsageTotal ?? null,
			titleManuallyEdited: conversation.titleManuallyEdited ?? false,
		});

		// Save messages to sqlite
		const messageRepo = sqliteStoreManager.getChatMessageRepo();
		await messageRepo.upsertMessages(conversation.id, messages);

		// Save message resources
		const resourceRepo = sqliteStoreManager.getChatMessageResourceRepo();
		for (const msg of messages) {
			if (msg.resources && msg.resources.length > 0) {
				await resourceRepo.replaceForMessage(msg.id, msg.resources);
			}
		}

		const finalContext: ChatContextWindow = {
			lastUpdatedTimestamp: conversation.updatedAtTimestamp,
			recentMessagesWindow: context?.recentMessagesWindow ?? [],
			shortSummary: context?.shortSummary ?? undefined,
			fullSummary: context?.fullSummary ?? undefined,
			topics: context?.topics,
			resourceIndex: context?.resourceIndex,
		};

		return {
			meta: conversation,
			messages,
			context: finalContext,
			content: markdown,
			file: savedFile,
		};
	}

	/**
	 * Read a conversation by id.
	 * Loads file path from sqlite, then parses markdown for content/title/summary.
	 * @param loadMessages If false, only loads metadata and context, not messages (faster for listing).
	 */
	async readConversation(conversationId: string, loadMessages: boolean = true): Promise<ChatConversation> {
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		const convRow = await convRepo.getById(conversationId);
		if (!convRow) {
			throw new Error(`Conversation not found in sqlite: ${conversationId}`);
		}

		const filePath = this.getAbsolutePath(convRow.file_rel_path);
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			throw new Error(`Conversation file not found: ${filePath}`);
		}

		const raw = await this.app.vault.read(file);
		const docModel = ChatConversationDoc.parse(raw);

		const meta: ChatConversationMeta = {
			id: convRow.conversation_id,
			title: convRow.title,
			projectId: convRow.project_id ?? undefined,
			createdAtTimestamp: convRow.created_at_ts,
			updatedAtTimestamp: convRow.updated_at_ts,
			activeModel: convRow.active_model ?? '',
			activeProvider: convRow.active_provider ?? 'other',
			tokenUsageTotal: convRow.token_usage_total ?? undefined,
			titleManuallyEdited: convRow.title_manually_edited === 1,
		};

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

		// Load messages from sqlite
		const messageRepo = sqliteStoreManager.getChatMessageRepo();
		const messageRows = await messageRepo.listByConversation(convRow.conversation_id);
		const resourceRepo = sqliteStoreManager.getChatMessageResourceRepo();
		const messageIds = messageRows.map((m) => m.message_id);
		const resourcesMap = messageIds.length > 0 ? await resourceRepo.getByMessageIds(messageIds) : new Map();

		const messages: ChatMessage[] = messageRows.map((row) => {
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
				} catch {}
			}
			const resources = resourcesMap.get(row.message_id);
			if (resources && resources.length > 0) {
				msg.resources = resources.map((r: DbSchema['chat_message_resource']) => ({
					source: r.source,
					id: r.id,
					kind: (r.kind as ChatResourceRef['kind']) ?? 'other',
					summaryNotePath: r.summary_note_rel_path ?? undefined,
				}));
			}
			return msg;
		});

		// Merge message content/title from markdown into sqlite messages (by index)
		for (let i = 0; i < Math.min(messages.length, docModel.messages.length); i++) {
			messages[i].content = docModel.messages[i].content;
			messages[i].title = docModel.messages[i].title;
		}

		// Merge attachments from markdown
		if (docModel.attachments.length > 0) {
			for (const msg of messages) {
				if (!msg.resources) msg.resources = [];
				for (const att of docModel.attachments) {
					if (!msg.resources.find((r) => r.source === att)) {
						msg.resources.push({ source: att, id: att, kind: 'other' });
					}
				}
			}
		}

		return { meta, context, messages, content: raw, file };
	}

	/**
	 * Read a project by id.
	 * Loads folder path from sqlite, then parses markdown for summary/notes.
	 */
	async readProject(projectId: string): Promise<ChatProject> {
		const projectRepo = sqliteStoreManager.getChatProjectRepo();
		const projectRow = await projectRepo.getById(projectId);
		if (!projectRow) {
			throw new Error(`Project not found in sqlite: ${projectId}`);
		}

		const folderPath = this.getAbsolutePath(projectRow.folder_rel_path);
		const summaryPath = this.join(folderPath, 'Project-Summary.md');
		const file = this.app.vault.getAbstractFileByPath(summaryPath);
		if (!(file instanceof TFile)) {
			throw new Error(`Project summary file not found: ${summaryPath}`);
		}

		const raw = await this.app.vault.read(file);
		const docModel = ChatProjectSummaryDoc.parse(raw);

		const meta: ChatProjectMeta = {
			id: projectRow.project_id,
			name: projectRow.name,
			folderPath: projectRow.folder_rel_path,
			createdAtTimestamp: projectRow.created_at_ts,
			updatedAtTimestamp: projectRow.updated_at_ts,
		};

		const context: ChatProjectContext = {
			lastUpdatedTimestamp: meta.updatedAtTimestamp,
			shortSummary: docModel.shortSummary || undefined,
			fullSummary: docModel.fullSummary || undefined,
		};
		const finalShortSummary = docModel.shortSummary || docModel.fullSummary || undefined;

		return { meta, context, content: raw, file, shortSummary: finalShortSummary };
	}

	async listProjects(): Promise<ChatProject[]> {
		const projectRepo = sqliteStoreManager.getChatProjectRepo();
		const projects = await projectRepo.listProjects(false); // Exclude archived

		const result: ChatProject[] = [];
		for (const projectRow of projects) {
			try {
				result.push(await this.readProject(projectRow.project_id));
			} catch (error) {
				console.error(`Failed to read project: ${projectRow.project_id}`, error);
			}
		}
		return result;
	}

	async listConversations(project?: ChatProjectMeta): Promise<ChatConversation[]> {
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		const conversations = await convRepo.listByProject(project?.id ?? null, false); // Exclude archived

		const result: ChatConversation[] = [];
		for (const convRow of conversations) {
			try {
				// Don't load messages for listing (only metadata and context)
				result.push(await this.readConversation(convRow.conversation_id, false));
			} catch (error) {
				console.error(`Failed to read conversation: ${convRow.conversation_id}`, error);
			}
		}
		return result;
	}

	/**
	 * Upsert a star record into sqlite.
	 */
	async addStar(record: StarredMessageRecord): Promise<void> {
		const starRepo = sqliteStoreManager.getChatStarRepo();
		await starRepo.upsert({
			sourceMessageId: record.sourceMessageId,
			id: record.id,
			conversationId: record.conversationId,
			projectId: record.projectId ?? null,
			createdAtTs: record.createdAt,
			active: record.active,
		});
	}

	/**
	 * Mark a star record inactive in sqlite.
	 */
	async removeStar(messageId: string): Promise<void> {
		const starRepo = sqliteStoreManager.getChatStarRepo();
		await starRepo.setActive(messageId, false);
	}

	/**
	 * List active starred message records from sqlite.
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

	async buildConversationFileName(meta: ChatConversationMeta): Promise<string> {
		return ChatDocName.buildConvFileName(meta.createdAtTimestamp, meta.title);
	}

	/**
	 * Get relative path from vault root.
	 */
	private getRelativePath(absolutePath: string): string {
		const normalized = normalizePath(absolutePath);
		const rootNormalized = normalizePath(this.rootFolder);
		if (normalized.startsWith(rootNormalized)) {
			return normalized.substring(rootNormalized.length).replace(/^\//, '');
		}
		return normalized;
	}

	/**
	 * Get absolute path from relative path.
	 */
	private getAbsolutePath(relativePath: string): string {
		return this.join(this.rootFolder, relativePath);
	}

	private async getProjectFolderPath(project: ChatProjectMeta): Promise<string> {
		if (project.folderPath && project.folderPath.trim()) {
			return this.getAbsolutePath(project.folderPath);
		}
		// Use new naming rule - build name without conflict resolution for existing projects
		const baseName = await ChatDocName.buildProjectFolderName(project.createdAtTimestamp, project.name);
		return this.join(this.rootFolder, baseName);
	}

	private join(...parts: string[]): string {
		return normalizePath(parts.join('/'));
	}

	private async writeFile(file: TFile | null, path: string, content: string): Promise<TFile> {
		if (file) {
			await this.app.vault.modify(file, content);
			return file;
		}
		return this.app.vault.create(path, content);
	}

	/**
	 * Get the app instance for vault operations
	 */
	getApp(): App {
		return this.app;
	}

	/**
	 * Get the root folder path
	 */
	getRootFolder(): string {
		return this.rootFolder;
	}
}

