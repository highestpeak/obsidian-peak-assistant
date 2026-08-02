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
import { ChatProjectBriefDoc } from './chat-docs/ChatProjectBriefDoc';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';
import type { ChatResourceRef } from '@/core/types/chat';
import { DEFAULT_AI_SERVICE_SETTINGS } from '@/core/config/settingsTypes';
import { buildTimestampedName } from '@/core/utils/id-utils';
import { ResourceKind } from '@/core/document/types';
import { MessageStatus } from '@/core/types/chat';
import {
	normalizeModelSelection,
	type ChatAssistantDefinition,
	type ChatArtifactReceipt,
	type ProjectPlanRef,
	type TurnExecutionReceipt,
} from '@/core/types/chat-studio';
import {
	canonicalJson,
	ChatConversationRecordStore,
	type GeneratedOutputPersistenceRuntime,
} from '@/core/storage/generated-output';
import { hashSHA256 } from '@/core/utils/hash-utils';
import type { MediaJob } from '@/core/types/media-generation';

interface ChatProjectStateSnapshot {
	meta: ChatProjectMeta;
	machineContext: Omit<ChatProjectContext, 'description' | 'instructions'>;
	briefPath?: string;
	legacySummaryPath?: string;
	deleted?: boolean;
	deletedAt?: number;
}

interface ChatAssistantStateSnapshot {
	assistantId: string;
	definition?: ChatAssistantDefinition;
	deleted: boolean;
	deletedAt?: number;
}

interface ChatProjectPlanStateSnapshot {
	planId: string;
	plan?: ProjectPlanRef;
	deleted: boolean;
	deletedAt?: number;
}

export class ChatStorageService {
	private readonly rootFolder: string;
	private readonly conversationRecords?: ChatConversationRecordStore;

	constructor(
		private readonly app: AppHandle,
		paths: ChatFilePaths,
		private readonly generatedOutputs?: GeneratedOutputPersistenceRuntime,
	) {
		this.rootFolder = normalizeVaultPath(paths.rootFolder);
		this.conversationRecords = generatedOutputs
			? new ChatConversationRecordStore(generatedOutputs)
			: undefined;
	}

	private get dbReady(): boolean {
		return sqliteStoreManager.isInitialized();
	}

	async init(): Promise<void> {
		if (this.generatedOutputs) return;
		await ensureFolderRecursive(this.rootFolder, this.app);
	}

	async saveProject(project: ChatProjectMeta, context?: ChatProjectContext): Promise<ChatProject> {
		const projectFolder = await this.getProjectFolderPath(project);
		if (this.generatedOutputs) {
			await this.saveProjectState(project, context, projectFolder);
		} else {
			await this.ensureProjectFolder(project);
			await this.saveLegacyProjectSummary(projectFolder, context);
		}

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
		if (this.conversationRecords && this.generatedOutputs) {
			const canonicalPath = this.generatedOutputs.resolvePath('chat.conversation-events', {
				conversationId: conversation.id,
			});
			await this.upsertConversationMeta(conversation.id, {
				...conversation,
				fileRelPath: getRelativePath(this.rootFolder, canonicalPath),
			});
			if (context) await this.conversationRecords.appendContext(conversation.id, context);
			if (messages && messages.length > 0) await this.saveNewMessage(conversation.id, messages);
			const stored = await this.readConversation(conversation.id, true);
			if (!stored) throw new Error(`Conversation not found after JSONL save: ${conversation.id}`);
			return stored;
		}
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

		await this.conversationRecords?.appendMeta(conversationId, updatedMeta);

		if (this.dbReady) {
			// Pack ALL non-column meta into meta_json so nothing is lost on
			// round-trip (chat-studio DATA-01). Every key here must be unpacked
			// in readConversationMeta.
			const metaExtras: Record<string, unknown> = {};
			if (updatedMeta.customSystemPrompt) metaExtras.customSystemPrompt = updatedMeta.customSystemPrompt;
			if (updatedMeta.conversationType) metaExtras.conversationType = updatedMeta.conversationType;
			if (updatedMeta.focusFolder) metaExtras.focusFolder = updatedMeta.focusFolder;
			if (updatedMeta.outputControlOverride) metaExtras.outputControlOverride = updatedMeta.outputControlOverride;
			if (updatedMeta.attachmentHandlingOverride) metaExtras.attachmentHandlingOverride = updatedMeta.attachmentHandlingOverride;
			if (updatedMeta.assistantId) metaExtras.assistantId = updatedMeta.assistantId;
			if (updatedMeta.modelSelection) metaExtras.modelSelection = updatedMeta.modelSelection;
			if (updatedMeta.pinned) {
				metaExtras.pinned = true;
				metaExtras.pinnedAt = updatedMeta.pinnedAt ?? now;
			}
			// Branch lineage (chat-studio §7.7). Present only on conversations
			// created via `branchFromMessage`; legacy meta stays untouched.
			if (updatedMeta.parentConversationId) metaExtras.parentConversationId = updatedMeta.parentConversationId;
			if (updatedMeta.parentMessageId) metaExtras.parentMessageId = updatedMeta.parentMessageId;
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
					archivedRelPath: updatedMeta.archived ? updatedMeta.fileRelPath ?? '' : null,
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

		const messagesArray = Array.isArray(messages) ? messages : [messages];

		const existingMessageIds = new Set(conversation.messages.map(m => m.id));
		const newMessages = messagesArray.filter(m => !existingMessageIds.has(m.id));
		if (newMessages.length === 0) return;
		if (this.conversationRecords) {
			await this.conversationRecords.appendMessages(conversationId, newMessages);
		}

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

		if (!this.conversationRecords && newMessages.length > 0) {
			const contentFile = conversation.file ?? (await this.ensureConversationFile(conversation));
			const currentContent = await this.app.vault.read(contentFile);
			const newContent = ChatConversationDoc.appendMessagesToContent(currentContent, {
				messages: newMessages,
			});
			await this.app.vault.modify(contentFile, newContent);
		}
	}

	async readConversation(conversationId: string, loadMessages: boolean = true): Promise<ChatConversation | null> {
		if (this.conversationRecords) {
			const record = await this.conversationRecords.read(conversationId);
			if (record?.deleted) return null;
			if (record) {
				return {
					meta: record.meta,
					context: record.context,
					messages: loadMessages ? record.messages : [],
					content: '',
				};
			}
		}
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
		if (this.conversationRecords && this.generatedOutputs) {
			return this.importLegacyConversation(meta, context, messages, file, raw);
		}
		return { meta, context, messages, content: raw, file };
	}

	/**
	 * Resolve a vault-relative markdown path to its conversation id, if the
	 * file belongs to a tracked conversation. Returns null for any file
	 * outside the chat root, or files that are not registered conversations.
	 */
	async findConversationIdByVaultPath(vaultRelPath: string): Promise<string | null> {
		if (!this.dbReady) return null;
		const normalized = normalizeVaultPath(vaultRelPath);
		const rootNormalized = normalizeVaultPath(this.rootFolder);
		if (rootNormalized && !normalized.startsWith(rootNormalized + '/') && normalized !== rootNormalized) {
			return null;
		}
		const fileRelPath = getRelativePath(this.rootFolder, normalized);
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		return convRepo.getIdByFileRelPath(fileRelPath);
	}

	async readConversationMeta(conversationId: string): Promise<ChatConversationMeta | null> {
		const record = await this.conversationRecords?.read(conversationId);
		if (record) return record.deleted ? null : record.meta;
		if (!this.dbReady) return null;
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		const convRow = await convRepo.getById(conversationId);
		if (!convRow) return null;

		let metaExtras: Record<string, unknown> = {};
		if (convRow.meta_json) {
			try { metaExtras = JSON.parse(convRow.meta_json); } catch { /* ignore parse errors */ }
		}

		return ChatStorageService.rowToConversationMeta(convRow, metaExtras);
	}

	/** Map a chat_conversation row + parsed meta_json extras to ChatConversationMeta. */
	static rowToConversationMeta(
		convRow: DbSchema['chat_conversation'],
		metaExtras: Record<string, unknown>
	): ChatConversationMeta {
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
			conversationType: (metaExtras.conversationType as ChatConversationMeta['conversationType']) ?? undefined,
			focusFolder: (metaExtras.focusFolder as string) ?? undefined,
			outputControlOverride: (metaExtras.outputControlOverride as ChatConversationMeta['outputControlOverride']) ?? undefined,
			attachmentHandlingOverride: (metaExtras.attachmentHandlingOverride as ChatConversationMeta['attachmentHandlingOverride']) ?? undefined,
			assistantId: (metaExtras.assistantId as string) ?? undefined,
			modelSelection: metaExtras.modelSelection
				? normalizeModelSelection(metaExtras.modelSelection)
				: undefined,
			pinned: metaExtras.pinned === true ? true : undefined,
			pinnedAt: typeof metaExtras.pinnedAt === 'number' ? metaExtras.pinnedAt : undefined,
			archived: convRow.archived_rel_path != null ? true : undefined,
			parentConversationId: typeof metaExtras.parentConversationId === 'string' ? metaExtras.parentConversationId : undefined,
			parentMessageId: typeof metaExtras.parentMessageId === 'string' ? metaExtras.parentMessageId : undefined,
		};
	}

	async readProject(projectId: string): Promise<ChatProject | null> {
		const projectMeta = await this.readProjectMeta(projectId);
		if (!projectMeta) return null;
		const context = await this.readProjectContext(projectId);
		return { meta: projectMeta, context: context ?? undefined };
	}

	async readProjectMeta(projectId: string): Promise<ChatProjectMeta | null> {
		const state = await this.readProjectState(projectId);
		if (state) return state.deleted ? null : state.meta;
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
		const state = await this.readProjectState(projectId);
		if (state) {
			const brief = await this.readProjectBrief(state.briefPath);
			return {
				...state.machineContext,
				description: brief?.description || undefined,
				instructions: brief?.instructions || undefined,
			};
		}

		if (!projectMeta.folderPath) {
			console.warn(`[ChatStore] Project folder path is not set for project: ${projectMeta.id}`);
			return null;
		}
		const folderPath = getAbsolutePath(this.rootFolder, projectMeta.folderPath);
		const summaryPath = joinPath(folderPath, CHAT_PROJECT_SUMMARY_FILENAME);
		const summaryFile = getFileRef(summaryPath, this.app);
		if (!summaryFile) {
			const context: ChatProjectContext = {
				lastUpdatedTimestamp: projectMeta.updatedAtTimestamp,
			};
			if (this.generatedOutputs) {
				await this.saveProjectState(projectMeta, context, folderPath);
			}
			return context;
		}
		const summaryRaw = await this.app.vault.read(summaryFile);
		const summaryDocModel = ChatProjectSummaryDoc.parse(summaryRaw);
		const legacyContext: ChatProjectContext = {
			lastUpdatedTimestamp: projectMeta.updatedAtTimestamp,
			description: summaryDocModel.description || undefined,
			instructions: summaryDocModel.instructions || undefined,
			shortSummary: summaryDocModel.shortSummary || undefined,
			fullSummary: summaryDocModel.fullSummary || undefined,
		};
		if (this.generatedOutputs) {
			await this.saveProjectState(projectMeta, legacyContext, folderPath, {
				legacyPath: summaryPath,
				legacyRaw: summaryRaw,
			});
		}
		return legacyContext;
	}

	private async saveLegacyProjectSummary(
		projectFolder: string,
		context?: ChatProjectContext,
	): Promise<void> {
		const summaryFilePath = joinPath(projectFolder, CHAT_PROJECT_SUMMARY_FILENAME);
		const initSummaryFile = getFileRef(summaryFilePath, this.app);
		let existingDescription = context?.description;
		let existingInstructions = context?.instructions;
		if (existingDescription === undefined || existingInstructions === undefined) {
			const existing = initSummaryFile ? ChatProjectSummaryDoc.parse(await this.app.vault.read(initSummaryFile)) : null;
			if (existingDescription === undefined) existingDescription = existing?.description ?? '';
			if (existingInstructions === undefined) existingInstructions = existing?.instructions ?? '';
		}
		const summaryContent = ChatProjectSummaryDoc.buildMarkdown({
			description: existingDescription,
			instructions: existingInstructions,
			shortSummary: context?.shortSummary ?? '',
			fullSummary: context?.fullSummary ?? '',
		});
		await writeVaultFile(initSummaryFile, summaryFilePath, summaryContent, this.app);
	}

	private async saveProjectState(
		project: ChatProjectMeta,
		context: ChatProjectContext | undefined,
		projectFolder: string,
		legacy?: { legacyPath: string; legacyRaw: string },
	): Promise<void> {
		if (!this.generatedOutputs) return;
		const current = await this.readProjectState(project.id);
		const legacyPath = legacy?.legacyPath ?? joinPath(projectFolder, CHAT_PROJECT_SUMMARY_FILENAME);
		const legacyFile = getFileRef(legacyPath, this.app);
		const legacyRaw = legacy?.legacyRaw ?? (legacyFile ? await this.app.vault.read(legacyFile) : undefined);
		const legacyModel = legacyRaw === undefined ? null : ChatProjectSummaryDoc.parse(legacyRaw);
		const currentBrief = await this.readProjectBrief(current?.briefPath);
		const description = context?.description ?? currentBrief?.description ?? legacyModel?.description ?? '';
		const instructions = context?.instructions ?? currentBrief?.instructions ?? legacyModel?.instructions ?? '';
		let briefPath = current?.briefPath;
		if (description || instructions) {
			briefPath = this.generatedOutputs.resolvePath('project.brief', { projectId: project.id });
			await ensureFolderRecursive(briefPath.slice(0, briefPath.lastIndexOf('/')), this.app);
			const briefFile = getFileRef(briefPath, this.app);
			await writeVaultFile(
				briefFile,
				briefPath,
				ChatProjectBriefDoc.buildMarkdown({ description, instructions }),
				this.app,
			);
		}
		const { description: _description, instructions: _instructions, ...machineContext } = context ?? {
			lastUpdatedTimestamp: project.updatedAtTimestamp,
		};
		const state: ChatProjectStateSnapshot = {
			meta: project,
			machineContext: {
				...current?.machineContext,
				...machineContext,
				lastUpdatedTimestamp: context?.lastUpdatedTimestamp ?? project.updatedAtTimestamp,
			},
			briefPath,
			legacySummaryPath: legacyRaw === undefined ? current?.legacySummaryPath : legacyPath,
			deleted: false,
		};
		const envelope = await this.generatedOutputs.snapshots.writeSnapshot<ChatProjectStateSnapshot>({
			outputId: 'chat.project-state',
			recordKey: project.id,
			pathVariables: { projectId: project.id },
			payload: state,
		});
		if (legacyRaw === undefined) return;
		const migration = {
			migrationId: 'project-summary-to-state-and-brief-v1',
			sourceOutputId: 'legacy.project-summary-markdown',
			targetOutputId: 'chat.project-state',
			sourcePath: legacyPath,
			targetPath: this.generatedOutputs.resolvePath('chat.project-state', { projectId: project.id }),
			sourceChecksum: hashSHA256(legacyRaw),
			targetChecksum: envelope.checksum,
		};
		await this.generatedOutputs.migrations.append({ ...migration, status: 'imported' });
		await this.generatedOutputs.migrations.append({ ...migration, status: 'validated' });
	}

	private async readProjectState(projectId: string): Promise<ChatProjectStateSnapshot | null> {
		if (!this.generatedOutputs) return null;
		const result = await this.generatedOutputs.snapshots.readSnapshot<ChatProjectStateSnapshot>({
			outputId: 'chat.project-state',
			recordKey: projectId,
			pathVariables: { projectId },
		});
		return result?.envelope.payload ?? null;
	}

	private async readProjectBrief(path?: string): Promise<ReturnType<typeof ChatProjectBriefDoc.parse> | null> {
		if (!path) return null;
		const file = getFileRef(path, this.app);
		if (!file) return null;
		return ChatProjectBriefDoc.parse(await this.app.vault.read(file));
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

	/**
	 * Fast meta-only listing of recent conversations across all projects
	 * (no vault file reads). Used by the left column Recent/Pinned sections
	 * and the View All picker.
	 */
	async listRecentConversationMetas(limit?: number, includeArchived: boolean = false): Promise<ChatConversationMeta[]> {
		if (!this.dbReady) return [];
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		const rows = await convRepo.listRecent(includeArchived, limit);
		return rows.map((row) => {
			let metaExtras: Record<string, unknown> = {};
			if (row.meta_json) {
				try { metaExtras = JSON.parse(row.meta_json); } catch { /* ignore */ }
			}
			return ChatStorageService.rowToConversationMeta(row, metaExtras);
		});
	}

	async countConversations(projectId: string | null): Promise<number> {
		if (!this.dbReady) return 0;
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		return convRepo.countByProject(projectId, false);
	}

	async updateMessageStarred(
		conversationId: string,
		messageId: string,
		starred: boolean,
		contentPreview?: string | null,
		attachmentSummary?: string | null
	): Promise<void> {
		await this.updateCanonicalMessage(conversationId, messageId, { starred });
		if (!this.dbReady) return;
		const messageRepo = sqliteStoreManager.getChatMessageRepo();
		await messageRepo.updateStarred(messageId, starred, contentPreview, attachmentSummary);
	}

	async updateMessageSuggestedFollowups(
		conversationId: string,
		messageId: string,
		followups: string[],
	): Promise<void> {
		await this.updateCanonicalMessage(conversationId, messageId, { suggestedFollowups: followups });
		if (!this.dbReady) return;
		const messageRepo = sqliteStoreManager.getChatMessageRepo();
		await messageRepo.updateSuggestedFollowups(messageId, followups);
	}

	/**
	 * Patch a message's variant metadata (chat-studio §7.7 — MSG-08). Merges
	 * into the existing meta_json blob so replyToMessageId / toolCalls stay
	 * intact. Undefined values remove the key.
	 */
	async updateMessageVariantMeta(
		conversationId: string,
		messageId: string,
		patch: {
			variantGroupId?: string | undefined;
			variantIndex?: number | undefined;
			isActiveVariant?: boolean | undefined;
		},
	): Promise<void> {
		await this.updateCanonicalMessage(conversationId, messageId, patch);
		if (!this.dbReady) return;
		const messageRepo = sqliteStoreManager.getChatMessageRepo();
		await messageRepo.updateMetaJsonPatch(messageId, {
			variantGroupId: patch.variantGroupId,
			variantIndex: patch.variantIndex,
			isActiveVariant: patch.isActiveVariant,
		});
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
			ChatStorageService.applyPersistedMessageExtras(msg, row);
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
			ChatStorageService.applyPersistedMessageExtras(msg, row);
			return msg;
		});
	}

	/**
	 * Unpack persisted status + meta_json (turn relationships) onto a message.
	 * Null status = completed (legacy rows).
	 */
	private static applyPersistedMessageExtras(msg: ChatMessage, row: DbSchema['chat_message']): void {
		if (row.status === MessageStatus.ERROR || row.status === MessageStatus.CANCELLED || row.status === MessageStatus.TIMEOUT) {
			msg.status = row.status as MessageStatus;
		}
		if (!row.meta_json) return;
		try {
			const extras = JSON.parse(row.meta_json) as Record<string, unknown>;
			if (typeof extras.replyToMessageId === 'string') msg.replyToMessageId = extras.replyToMessageId;
			if (typeof extras.branchFromMessageId === 'string') msg.branchFromMessageId = extras.branchFromMessageId;
			if (typeof extras.revisionOfMessageId === 'string') msg.revisionOfMessageId = extras.revisionOfMessageId;
			// MSG-08 — assistant variant metadata (chat-studio §7.7). Missing
			// fields on legacy rows leave the message a single-variant one; UI
			// keeps rendering it identically.
			if (typeof extras.variantGroupId === 'string') msg.variantGroupId = extras.variantGroupId;
			if (typeof extras.variantIndex === 'number') msg.variantIndex = extras.variantIndex;
			if (typeof extras.isActiveVariant === 'boolean') msg.isActiveVariant = extras.isActiveVariant;
			if (Array.isArray(extras.toolCalls)) {
				msg.toolCalls = extras.toolCalls.filter((value): value is NonNullable<ChatMessage['toolCalls']>[number] => {
					if (!value || typeof value !== 'object') return false;
					return typeof (value as { toolName?: unknown }).toolName === 'string';
				});
			}
		} catch { /* ignore parse errors */ }
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
		if (this.generatedOutputs) {
			const conversation = await this.readConversation(conversationId, false);
			if (!conversation) throw new Error('Conversation not found');
			return conversation.meta.fileRelPath
				?? getRelativePath(
					this.rootFolder,
					this.generatedOutputs.resolvePath('chat.conversation-events', { conversationId }),
				);
		}
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
			if (conversation.file && f.basename === conversation.file.basename) {
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
		const folder = await this.getProjectFolder(projectId);
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		const convRows = await convRepo.listByProject(projectId, true);
		const conversationIds = convRows.map(r => r.conversation_id);
		const projectState = await this.readProjectState(projectId);
		const projectMeta = projectState?.meta ?? await this.readProjectMeta(projectId);
		if (this.generatedOutputs && projectMeta) {
			await this.generatedOutputs.snapshots.writeSnapshot<ChatProjectStateSnapshot>({
				outputId: 'chat.project-state',
				recordKey: projectId,
				pathVariables: { projectId },
				payload: {
					...(projectState ?? {
						meta: projectMeta,
						machineContext: { lastUpdatedTimestamp: projectMeta.updatedAtTimestamp },
					}),
					deleted: true,
					deletedAt: Date.now(),
				},
			});
		}
		for (const conversationId of conversationIds) {
			await this.conversationRecords?.markDeleted(conversationId, Date.now());
		}

		if (conversationIds.length > 0) {
			const messageRepo = sqliteStoreManager.getChatMessageRepo();
			await messageRepo.deleteByConversationIds(conversationIds);
			await convRepo.deleteByConversationIds(conversationIds);
			await sqliteStoreManager.getChatTurnReceiptRepo().deleteByConversationIds(conversationIds);
			await sqliteStoreManager.getChatArtifactReceiptRepo().deleteByConversationIds(conversationIds);
		}
		for (const plan of await this.listProjectPlans(projectId, true)) {
			await this.writeProjectPlanState({ planId: plan.id, plan, deleted: true, deletedAt: Date.now() });
		}
		await sqliteStoreManager.getChatProjectPlanRepo().deleteByProjectId(projectId);

		if (folder) {
			await this.app.vault.trash(folder, true);
		}

		const projectRepo = sqliteStoreManager.getChatProjectRepo();
		await projectRepo.deleteByProjectId(projectId);
	}

	async deleteConversation(conversationId: string): Promise<void> {
		await this.conversationRecords?.markDeleted(conversationId, Date.now());
		if (!this.dbReady) return;
		const conversation = await this.readConversation(conversationId, false);
		if (conversation?.file) {
			await this.app.vault.trash(conversation.file, true);
		}
		const convRepo = sqliteStoreManager.getChatConversationRepo();
		const messageRepo = sqliteStoreManager.getChatMessageRepo();
		await messageRepo.deleteByConversationIds([conversationId]);
		await convRepo.deleteByConversationIds([conversationId]);
		await sqliteStoreManager.getChatTurnReceiptRepo().deleteByConversationIds([conversationId]);
		await sqliteStoreManager.getChatArtifactReceiptRepo().deleteByConversationIds([conversationId]);
	}

	async countMessages(conversationId: string): Promise<number> {
		if (!this.dbReady) return 0;
		const messageRepo = sqliteStoreManager.getChatMessageRepo();
		return messageRepo.countByConversation(conversationId);
	}

	async listDeletedCanonicalConversationIds(): Promise<Set<string>> {
		const result = new Set<string>();
		if (!this.conversationRecords) return result;
		for (const conversationId of await this.conversationRecords.listConversationIds()) {
			const record = await this.conversationRecords.read(conversationId);
			if (record?.deleted) result.add(conversationId);
		}
		return result;
	}

	async migrateLegacyGeneratedOutputs(): Promise<{
		conversationsImported: number;
		projectsImported: number;
		warnings: string[];
	}> {
		const report = { conversationsImported: 0, projectsImported: 0, warnings: [] as string[] };
		if (!this.generatedOutputs || !this.dbReady) return report;
		const conversationRows = await sqliteStoreManager.getChatConversationRepo().listRecent(true);
		for (const row of conversationRows) {
			if (await this.conversationRecords?.read(row.conversation_id)) continue;
			try {
				const imported = await this.readConversation(row.conversation_id, true);
				if (imported) report.conversationsImported += 1;
			} catch (error) {
				report.warnings.push(`conversation ${row.conversation_id}: ${error instanceof Error ? error.message : String(error)}`);
			}
			try {
				const turnRows = await sqliteStoreManager.getChatTurnReceiptRepo().listByConversation(row.conversation_id);
				for (const receiptRow of turnRows) {
					const receipt = ChatStorageService.parseJsonOrNull<TurnExecutionReceipt>(receiptRow.receipt_json);
					if (receipt) await this.saveTurnReceipt(receipt);
				}
				const artifactRows = await sqliteStoreManager.getChatArtifactReceiptRepo().listByConversation(row.conversation_id);
				for (const receiptRow of artifactRows) {
					const receipt = ChatStorageService.parseJsonOrNull<ChatArtifactReceipt>(receiptRow.receipt_json);
					if (receipt) await this.saveArtifactReceipt(receipt);
				}
			} catch (error) {
				report.warnings.push(`receipts ${row.conversation_id}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		const projects = await sqliteStoreManager.getChatProjectRepo().listProjects(true);
		for (const row of projects) {
			if (await this.readProjectState(row.project_id)) continue;
			try {
				const imported = await this.readProjectContext(row.project_id);
				if (imported) report.projectsImported += 1;
			} catch (error) {
				report.warnings.push(`project ${row.project_id}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		for (const job of await sqliteStoreManager.getChatMediaJobRepo().listAll()) {
			try {
				await this.generatedOutputs.events.appendEvent({
					outputId: 'media.job-events',
					streamKey: job.jobId,
					pathVariables: { jobId: job.jobId },
					eventId: `imported:${job.updatedAt}:${hashSHA256(canonicalJson(job))}`,
					payload: { event: 'imported', job },
				});
			} catch (error) {
				report.warnings.push(`media job ${job.jobId}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		for (const assistantRow of await sqliteStoreManager.getChatAssistantRepo().list(true)) {
			const definition = ChatStorageService.parseAssistantRow(assistantRow);
			if (!definition) continue;
			try {
				await this.writeAssistantState({ assistantId: definition.id, definition, deleted: false });
			} catch (error) {
				report.warnings.push(`assistant ${assistantRow.assistant_id}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		for (const planRow of await sqliteStoreManager.getChatProjectPlanRepo().listAll()) {
			const plan = ChatStorageService.parsePlanRow(planRow);
			if (!plan) continue;
			try {
				await this.writeProjectPlanState({ planId: plan.id, plan, deleted: false });
			} catch (error) {
				report.warnings.push(`project plan ${planRow.plan_id}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		return report;
	}

	async rebuildChatProjection(): Promise<{
		recordsRead: number;
		recordsWritten: number;
		warnings: string[];
	}> {
		const warnings: string[] = [];
		if (!this.generatedOutputs || !this.conversationRecords || !this.dbReady) {
			return { recordsRead: 0, recordsWritten: 0, warnings: ['chat projection runtime is not ready'] };
		}
		let recordsRead = 0;
		let recordsWritten = 0;
		const projectSample = this.generatedOutputs.resolvePath('chat.project-state', { projectId: '__sample__' });
		const projectRoot = projectSample.slice(0, projectSample.indexOf('/__sample__/'));
		const projectFiles = await this.generatedOutputs.snapshots.listSnapshotFilesRecursive(projectRoot);
		for (const path of projectFiles) {
			if (!path.endsWith('/state.json')) continue;
			const segments = path.split('/');
			const projectId = segments[segments.length - 2];
			if (!projectId) continue;
			try {
				const state = await this.readProjectState(projectId);
				if (!state) continue;
				recordsRead += 1;
				if (state.deleted) {
					await sqliteStoreManager.getChatProjectPlanRepo().deleteByProjectId(projectId);
					await sqliteStoreManager.getChatProjectRepo().deleteByProjectId(projectId);
					recordsWritten += 1;
					continue;
				}
				await sqliteStoreManager.getChatProjectRepo().upsertProject({
					projectId: state.meta.id,
					name: state.meta.name,
					folderRelPath: state.meta.folderPath ?? '',
					createdAtTs: state.meta.createdAtTimestamp,
					updatedAtTs: state.meta.updatedAtTimestamp,
				});
				recordsWritten += 1;
			} catch (error) {
				warnings.push(`project projection ${projectId}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}

		for (const conversationId of await this.conversationRecords.listConversationIds()) {
			try {
				const record = await this.conversationRecords.read(conversationId);
				if (!record) continue;
				if (record.deleted) {
					await sqliteStoreManager.getChatMessageRepo().deleteByConversationIds([conversationId]);
					await sqliteStoreManager.getChatConversationRepo().deleteByConversationIds([conversationId]);
					await sqliteStoreManager.getChatTurnReceiptRepo().deleteByConversationIds([conversationId]);
					await sqliteStoreManager.getChatArtifactReceiptRepo().deleteByConversationIds([conversationId]);
					recordsRead += 1;
					recordsWritten += 1;
					continue;
				}
				recordsRead += 1 + record.messages.length;
				const metaExtras = ChatStorageService.buildConversationMetaExtras(record.meta);
				await sqliteStoreManager.getChatConversationRepo().upsertConversation({
					conversationId: record.meta.id,
					projectId: record.meta.projectId ?? null,
					title: record.meta.title,
					fileRelPath: record.meta.fileRelPath ?? '',
					createdAtTs: record.meta.createdAtTimestamp,
					updatedAtTs: record.meta.updatedAtTimestamp,
					activeModel: record.meta.activeModel,
					activeProvider: record.meta.activeProvider,
					tokenUsageTotal: record.meta.tokenUsageTotal ?? null,
					titleManuallyEdited: record.meta.titleManuallyEdited ?? false,
					titleAutoUpdated: record.meta.titleAutoUpdated ?? false,
					contextLastUpdatedTimestamp: record.meta.contextLastUpdatedTimestamp ?? null,
					contextLastMessageIndex: record.meta.contextLastMessageIndex ?? null,
					archivedRelPath: record.meta.archived ? record.meta.fileRelPath ?? '' : null,
					metaJson: Object.keys(metaExtras).length > 0 ? JSON.stringify(metaExtras) : null,
				});
				await sqliteStoreManager.getChatMessageRepo().upsertMessages(conversationId, record.messages);
				const resourceRepo = sqliteStoreManager.getChatMessageResourceRepo();
				for (const message of record.messages) {
					if (message.resources?.length) await resourceRepo.replaceForMessage(message.id, message.resources);
				}
				const turnReceipts = await this.listTurnReceipts(conversationId);
				for (const receipt of turnReceipts) {
					await sqliteStoreManager.getChatTurnReceiptRepo().upsert({
						request_id: receipt.requestId,
						conversation_id: receipt.conversationId,
						message_id: receipt.messageId,
						run_id: receipt.runId ?? null,
						status: receipt.status,
						receipt_json: JSON.stringify(receipt),
						started_at_ts: receipt.startedAt,
						finished_at_ts: receipt.finishedAt ?? null,
					});
				}
				const artifactReceipts = await this.listArtifactReceiptsByConversation(conversationId);
				for (const receipt of artifactReceipts) {
					await sqliteStoreManager.getChatArtifactReceiptRepo().upsert({
						artifact_id: receipt.artifactId,
						run_id: receipt.runId,
						message_id: receipt.messageId,
						conversation_id: receipt.conversationId,
						project_id: receipt.projectId ?? null,
						direction: receipt.direction,
						kind: receipt.kind,
						state: receipt.state,
						title: receipt.title,
						receipt_json: JSON.stringify(receipt),
						created_at_ts: receipt.createdAt,
					});
				}
				recordsRead += turnReceipts.length + artifactReceipts.length;
				recordsWritten += 1 + record.messages.length + turnReceipts.length + artifactReceipts.length;
			} catch (error) {
				warnings.push(`conversation projection ${conversationId}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		const mediaSample = this.generatedOutputs.resolvePath('media.job-events', { jobId: '__sample__' });
		const mediaRoot = mediaSample.slice(0, mediaSample.lastIndexOf('/'));
		for (const path of await this.generatedOutputs.events.listFilesRecursiveAt(mediaRoot)) {
			if (!path.endsWith('.jsonl') || path.includes('.corrupt-')) continue;
			const filename = path.slice(path.lastIndexOf('/') + 1);
			const jobId = filename.slice(0, -'.jsonl'.length);
			try {
				const stream = await this.generatedOutputs.events.readEvents<{
					event: string;
					job: MediaJob;
				}>({
					outputId: 'media.job-events',
					streamKey: jobId,
					pathVariables: { jobId },
				});
				if (stream.corruption) throw new Error(`corrupt at line ${stream.corruption.lineNumber}`);
				const latest = stream.events[stream.events.length - 1]?.payload.job;
				if (!latest) continue;
				recordsRead += stream.events.length;
				await sqliteStoreManager.getChatMediaJobRepo().upsert(latest);
				recordsWritten += 1;
			} catch (error) {
				warnings.push(`media projection ${jobId}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		for (const assistantId of await this.listSnapshotRecordIds('chat.assistant-definition', 'assistantId')) {
			try {
				const state = await this.readAssistantState(assistantId);
				if (!state) continue;
				recordsRead += 1;
				if (state.deleted || !state.definition) {
					await sqliteStoreManager.getChatAssistantRepo().deleteById(assistantId);
					recordsWritten += 1;
					continue;
				}
				const definition = state.definition;
				await sqliteStoreManager.getChatAssistantRepo().upsert({
					assistant_id: definition.id,
					name: definition.name,
					definition_json: JSON.stringify(definition),
					created_at_ts: definition.createdAt,
					updated_at_ts: definition.updatedAt,
					archived: definition.archived ? 1 : 0,
				});
				recordsWritten += 1;
			} catch (error) {
				warnings.push(`assistant projection ${assistantId}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		for (const planId of await this.listSnapshotRecordIds('chat.project-plan-state', 'planId')) {
			try {
				const state = await this.readProjectPlanState(planId);
				if (!state) continue;
				recordsRead += 1;
				if (state.deleted || !state.plan) {
					await sqliteStoreManager.getChatProjectPlanRepo().deleteById(planId);
					recordsWritten += 1;
					continue;
				}
				const plan = state.plan;
				await sqliteStoreManager.getChatProjectPlanRepo().upsert({
					plan_id: plan.id,
					project_id: plan.projectId,
					title: plan.title,
					status: plan.status,
					source_json: JSON.stringify(plan.source),
					progress_json: plan.progress ? JSON.stringify(plan.progress) : null,
					updated_at_ts: plan.updatedAt,
				});
				recordsWritten += 1;
			} catch (error) {
				warnings.push(`project plan projection ${planId}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		return { recordsRead, recordsWritten, warnings };
	}

	// Chat Studio durable contracts (2026-07-15 spec §12) ======================

	/** Pin/unpin a conversation in the left column. */
	async setConversationPinned(conversationId: string, pinned: boolean): Promise<void> {
		await this.upsertConversationMeta(conversationId, {
			pinned: pinned || undefined,
			pinnedAt: pinned ? Date.now() : undefined,
		});
	}

	/**
	 * Archive/restore a conversation. Archive marks archived_rel_path with the
	 * current file path (file stays in place); listByProject filters archived
	 * rows out by default.
	 */
	async setConversationArchived(conversationId: string, archived: boolean): Promise<void> {
		const updated = await this.upsertConversationMeta(conversationId, {
			archived: archived || undefined,
		});
		if (!updated) throw new Error(`Conversation not found: ${conversationId}`);
	}

	// Assistants ---------------------------------------------------------------

	async saveAssistant(definition: ChatAssistantDefinition): Promise<void> {
		await this.writeAssistantState({ assistantId: definition.id, definition, deleted: false });
		if (!this.dbReady) return;
		await sqliteStoreManager.getChatAssistantRepo().upsert({
			assistant_id: definition.id,
			name: definition.name,
			definition_json: JSON.stringify(definition),
			created_at_ts: definition.createdAt,
			updated_at_ts: definition.updatedAt,
			archived: definition.archived ? 1 : 0,
		});
	}

	async readAssistant(assistantId: string): Promise<ChatAssistantDefinition | null> {
		const state = await this.readAssistantState(assistantId);
		if (state) return state.deleted ? null : state.definition ?? null;
		if (!this.dbReady) return null;
		const row = await sqliteStoreManager.getChatAssistantRepo().getById(assistantId);
		return row ? ChatStorageService.parseAssistantRow(row) : null;
	}

	async listAssistants(includeArchived: boolean = false): Promise<ChatAssistantDefinition[]> {
		if (this.generatedOutputs) {
			const result: ChatAssistantDefinition[] = [];
			for (const assistantId of await this.listSnapshotRecordIds('chat.assistant-definition', 'assistantId')) {
				const state = await this.readAssistantState(assistantId);
				if (!state?.definition || state.deleted) continue;
				if (!includeArchived && state.definition.archived) continue;
				result.push(state.definition);
			}
			return result.sort((a, b) => b.updatedAt - a.updatedAt);
		}
		if (!this.dbReady) return [];
		const rows = await sqliteStoreManager.getChatAssistantRepo().list(includeArchived);
		return rows
			.map((row) => ChatStorageService.parseAssistantRow(row))
			.filter((a): a is ChatAssistantDefinition => a !== null);
	}

	async deleteAssistant(assistantId: string): Promise<void> {
		const current = await this.readAssistant(assistantId);
		await this.writeAssistantState({
			assistantId,
			definition: current ?? undefined,
			deleted: true,
			deletedAt: Date.now(),
		});
		if (!this.dbReady) return;
		await sqliteStoreManager.getChatAssistantRepo().deleteById(assistantId);
	}

	private static parseAssistantRow(row: DbSchema['chat_assistant']): ChatAssistantDefinition | null {
		try {
			const parsed = JSON.parse(row.definition_json) as ChatAssistantDefinition;
			parsed.archived = row.archived === 1;
			return parsed;
		} catch {
			return null;
		}
	}

	// Project plans ------------------------------------------------------------

	async saveProjectPlan(plan: ProjectPlanRef): Promise<void> {
		await this.writeProjectPlanState({ planId: plan.id, plan, deleted: false });
		if (!this.dbReady) return;
		await sqliteStoreManager.getChatProjectPlanRepo().upsert({
			plan_id: plan.id,
			project_id: plan.projectId,
			title: plan.title,
			status: plan.status,
			source_json: JSON.stringify(plan.source),
			progress_json: plan.progress ? JSON.stringify(plan.progress) : null,
			updated_at_ts: plan.updatedAt,
		});
	}

	async listProjectPlans(projectId: string, includeArchived: boolean = false): Promise<ProjectPlanRef[]> {
		if (this.generatedOutputs) {
			const result: ProjectPlanRef[] = [];
			for (const planId of await this.listSnapshotRecordIds('chat.project-plan-state', 'planId')) {
				const state = await this.readProjectPlanState(planId);
				if (!state?.plan || state.deleted || state.plan.projectId !== projectId) continue;
				if (!includeArchived && state.plan.status === 'archived') continue;
				result.push(state.plan);
			}
			return result.sort((a, b) => b.updatedAt - a.updatedAt);
		}
		if (!this.dbReady) return [];
		const rows = await sqliteStoreManager.getChatProjectPlanRepo().listByProject(projectId, includeArchived);
		return rows
			.map((row) => ChatStorageService.parsePlanRow(row))
			.filter((p): p is ProjectPlanRef => p !== null);
	}

	async deleteProjectPlan(planId: string): Promise<void> {
		const current = await this.readProjectPlanState(planId);
		await this.writeProjectPlanState({
			planId,
			plan: current?.plan,
			deleted: true,
			deletedAt: Date.now(),
		});
		if (!this.dbReady) return;
		await sqliteStoreManager.getChatProjectPlanRepo().deleteById(planId);
	}

	private static parsePlanRow(row: DbSchema['chat_project_plan']): ProjectPlanRef | null {
		try {
			return {
				id: row.plan_id,
				projectId: row.project_id,
				title: row.title,
				status: row.status as ProjectPlanRef['status'],
				source: JSON.parse(row.source_json) as ProjectPlanRef['source'],
				progress: row.progress_json ? JSON.parse(row.progress_json) as ProjectPlanRef['progress'] : undefined,
				updatedAt: row.updated_at_ts,
			};
		} catch {
			return null;
		}
	}

	private writeAssistantState(state: ChatAssistantStateSnapshot): Promise<unknown> {
		if (!this.generatedOutputs) return Promise.resolve();
		return this.generatedOutputs.snapshots.writeSnapshot<ChatAssistantStateSnapshot>({
			outputId: 'chat.assistant-definition',
			recordKey: state.assistantId,
			pathVariables: { assistantId: state.assistantId },
			payload: state,
		});
	}

	private async readAssistantState(assistantId: string): Promise<ChatAssistantStateSnapshot | null> {
		if (!this.generatedOutputs) return null;
		const result = await this.generatedOutputs.snapshots.readSnapshot<ChatAssistantStateSnapshot>({
			outputId: 'chat.assistant-definition',
			recordKey: assistantId,
			pathVariables: { assistantId },
		});
		return result?.envelope.payload ?? null;
	}

	private writeProjectPlanState(state: ChatProjectPlanStateSnapshot): Promise<unknown> {
		if (!this.generatedOutputs) return Promise.resolve();
		return this.generatedOutputs.snapshots.writeSnapshot<ChatProjectPlanStateSnapshot>({
			outputId: 'chat.project-plan-state',
			recordKey: state.planId,
			pathVariables: { planId: state.planId },
			payload: state,
		});
	}

	private async readProjectPlanState(planId: string): Promise<ChatProjectPlanStateSnapshot | null> {
		if (!this.generatedOutputs) return null;
		const result = await this.generatedOutputs.snapshots.readSnapshot<ChatProjectPlanStateSnapshot>({
			outputId: 'chat.project-plan-state',
			recordKey: planId,
			pathVariables: { planId },
		});
		return result?.envelope.payload ?? null;
	}

	private async listSnapshotRecordIds(
		outputId: 'chat.assistant-definition' | 'chat.project-plan-state',
		variable: 'assistantId' | 'planId',
	): Promise<string[]> {
		if (!this.generatedOutputs) return [];
		const sample = this.generatedOutputs.resolvePath(outputId, { [variable]: '__sample__' });
		const root = sample.slice(0, sample.lastIndexOf('/'));
		const paths = await this.generatedOutputs.snapshots.listSnapshotFiles(root);
		return paths
			.filter((path) => path.endsWith('.json') && !path.includes('.tmp-'))
			.map((path) => path.slice(path.lastIndexOf('/') + 1, -'.json'.length))
			.sort();
	}

	// Turn receipts --------------------------------------------------------------

	async saveTurnReceipt(receipt: TurnExecutionReceipt): Promise<void> {
		if (this.generatedOutputs) {
			await this.generatedOutputs.events.appendEvent({
				outputId: 'run.events',
				streamKey: receipt.conversationId,
				pathVariables: { domain: 'chat' },
				partitionFilename: `${receipt.conversationId}.jsonl`,
				eventId: `turn-receipt:${receipt.requestId}:${hashSHA256(canonicalJson(receipt))}`,
				payload: { kind: 'turn-receipt' as const, receipt },
			});
		}
		if (!this.dbReady) return;
		await sqliteStoreManager.getChatTurnReceiptRepo().upsert({
			request_id: receipt.requestId,
			conversation_id: receipt.conversationId,
			message_id: receipt.messageId,
			run_id: receipt.runId ?? null,
			status: receipt.status,
			receipt_json: JSON.stringify(receipt),
			started_at_ts: receipt.startedAt,
			finished_at_ts: receipt.finishedAt ?? null,
		});
	}

	async readTurnReceiptByMessage(messageId: string): Promise<TurnExecutionReceipt | null> {
		if (!this.dbReady) return null;
		const row = await sqliteStoreManager.getChatTurnReceiptRepo().getByMessageId(messageId);
		return row ? ChatStorageService.parseJsonOrNull<TurnExecutionReceipt>(row.receipt_json) : null;
	}

	async listTurnReceipts(conversationId: string): Promise<TurnExecutionReceipt[]> {
		if (this.generatedOutputs) {
			const stream = await this.generatedOutputs.events.readEvents<{
				kind: 'turn-receipt';
				receipt: TurnExecutionReceipt;
			}>({
				outputId: 'run.events',
				streamKey: conversationId,
				pathVariables: { domain: 'chat' },
				partitionFilename: `${conversationId}.jsonl`,
			});
			if (stream.corruption) throw new Error(`Chat turn receipt stream is corrupt at line ${stream.corruption.lineNumber}.`);
			const latest = new Map<string, TurnExecutionReceipt>();
			for (const event of stream.events) {
				if (event.payload.kind === 'turn-receipt') latest.set(event.payload.receipt.requestId, event.payload.receipt);
			}
			if (latest.size > 0) return [...latest.values()].sort((a, b) => a.startedAt - b.startedAt);
		}
		if (!this.dbReady) return [];
		const rows = await sqliteStoreManager.getChatTurnReceiptRepo().listByConversation(conversationId);
		return rows
			.map((row) => ChatStorageService.parseJsonOrNull<TurnExecutionReceipt>(row.receipt_json))
			.filter((r): r is TurnExecutionReceipt => r !== null);
	}

	// Artifact receipts ----------------------------------------------------------

	async saveArtifactReceipt(receipt: ChatArtifactReceipt): Promise<void> {
		if (this.generatedOutputs) {
			await this.generatedOutputs.events.appendEvent({
				outputId: 'chat.artifact-receipt',
				streamKey: receipt.conversationId,
				pathVariables: { conversationId: receipt.conversationId },
				eventId: `artifact-receipt:${receipt.artifactId}:${hashSHA256(canonicalJson(receipt))}`,
				payload: receipt,
			});
		}
		if (!this.dbReady) return;
		await sqliteStoreManager.getChatArtifactReceiptRepo().upsert({
			artifact_id: receipt.artifactId,
			run_id: receipt.runId,
			message_id: receipt.messageId,
			conversation_id: receipt.conversationId,
			project_id: receipt.projectId ?? null,
			direction: receipt.direction,
			kind: receipt.kind,
			state: receipt.state,
			title: receipt.title,
			receipt_json: JSON.stringify(receipt),
			created_at_ts: receipt.createdAt,
		});
	}

	async listArtifactReceiptsByConversation(conversationId: string): Promise<ChatArtifactReceipt[]> {
		if (this.generatedOutputs) {
			const stream = await this.generatedOutputs.events.readEvents<ChatArtifactReceipt>({
				outputId: 'chat.artifact-receipt',
				streamKey: conversationId,
				pathVariables: { conversationId },
			});
			if (stream.corruption) throw new Error(`Chat artifact receipt stream is corrupt at line ${stream.corruption.lineNumber}.`);
			const latest = new Map<string, ChatArtifactReceipt>();
			for (const event of stream.events) latest.set(event.payload.artifactId, event.payload);
			if (latest.size > 0) return [...latest.values()].sort((a, b) => a.createdAt - b.createdAt);
		}
		if (!this.dbReady) return [];
		const rows = await sqliteStoreManager.getChatArtifactReceiptRepo().listByConversation(conversationId);
		return rows
			.map((row) => ChatStorageService.parseJsonOrNull<ChatArtifactReceipt>(row.receipt_json))
			.filter((r): r is ChatArtifactReceipt => r !== null);
	}

	async listArtifactReceiptsByMessage(messageId: string): Promise<ChatArtifactReceipt[]> {
		if (!this.dbReady) return [];
		const rows = await sqliteStoreManager.getChatArtifactReceiptRepo().listByMessage(messageId);
		return rows
			.map((row) => ChatStorageService.parseJsonOrNull<ChatArtifactReceipt>(row.receipt_json))
			.filter((r): r is ChatArtifactReceipt => r !== null);
	}

	async listArtifactReceiptsByProject(projectId: string): Promise<ChatArtifactReceipt[]> {
		if (!this.dbReady) return [];
		const rows = await sqliteStoreManager.getChatArtifactReceiptRepo().listByProject(projectId);
		return rows
			.map((row) => ChatStorageService.parseJsonOrNull<ChatArtifactReceipt>(row.receipt_json))
			.filter((r): r is ChatArtifactReceipt => r !== null);
	}

	/**
	 * Zero-gap Track D (2026-07-21): reminder-scoped scan for the
	 * ReminderSchedulerService. Filtered by `kind` at the SQL layer so a
	 * growing artifact set does not slow the poll loop.
	 */
	async listArtifactReceiptsByKind(kind: string): Promise<ChatArtifactReceipt[]> {
		if (!this.dbReady) return [];
		const rows = await sqliteStoreManager.getChatArtifactReceiptRepo().listByKind(kind);
		return rows
			.map((row) => ChatStorageService.parseJsonOrNull<ChatArtifactReceipt>(row.receipt_json))
			.filter((r): r is ChatArtifactReceipt => r !== null);
	}

	private static parseJsonOrNull<T>(json: string): T | null {
		try {
			return JSON.parse(json) as T;
		} catch {
			return null;
		}
	}

	private static buildConversationMetaExtras(meta: ChatConversationMeta): Record<string, unknown> {
		const extras: Record<string, unknown> = {};
		if (meta.customSystemPrompt) extras.customSystemPrompt = meta.customSystemPrompt;
		if (meta.conversationType) extras.conversationType = meta.conversationType;
		if (meta.focusFolder) extras.focusFolder = meta.focusFolder;
		if (meta.outputControlOverride) extras.outputControlOverride = meta.outputControlOverride;
		if (meta.attachmentHandlingOverride) extras.attachmentHandlingOverride = meta.attachmentHandlingOverride;
		if (meta.assistantId) extras.assistantId = meta.assistantId;
		if (meta.modelSelection) extras.modelSelection = meta.modelSelection;
		if (meta.pinned) {
			extras.pinned = true;
			extras.pinnedAt = meta.pinnedAt;
		}
		if (meta.parentConversationId) extras.parentConversationId = meta.parentConversationId;
		if (meta.parentMessageId) extras.parentMessageId = meta.parentMessageId;
		return extras;
	}

	private async updateCanonicalMessage(
		conversationId: string,
		messageId: string,
		patch: Partial<ChatMessage>,
	): Promise<void> {
		if (!this.conversationRecords) return;
		const record = await this.conversationRecords.read(conversationId);
		const message = record?.messages.find((candidate) => candidate.id === messageId);
		if (!message) return;
		await this.conversationRecords.appendMessages(conversationId, [{ ...message, ...patch }]);
	}

	private async importLegacyConversation(
		meta: ChatConversationMeta,
		context: ChatContextWindow,
		messages: ChatMessage[],
		legacyFile: VaultFileRef,
		legacyRaw: string,
	): Promise<ChatConversation> {
		if (!this.conversationRecords || !this.generatedOutputs) {
			return { meta, context, messages, content: legacyRaw, file: legacyFile };
		}
		const targetPath = this.generatedOutputs.resolvePath('chat.conversation-events', {
			conversationId: meta.id,
		});
		const canonicalMeta = {
			...meta,
			fileRelPath: getRelativePath(this.rootFolder, targetPath),
		};
		const migration = {
			migrationId: 'chat-markdown-to-jsonl-v1',
			sourceOutputId: 'legacy.chat-markdown',
			targetOutputId: 'chat.conversation-events',
			sourcePath: legacyFile.path,
			targetPath,
			sourceChecksum: hashSHA256(legacyRaw),
		};
		await this.generatedOutputs.migrations.append({ ...migration, status: 'discovered' });
		await this.conversationRecords.appendMeta(meta.id, canonicalMeta);
		await this.conversationRecords.appendContext(meta.id, context);
		await this.conversationRecords.appendMessages(meta.id, messages);
		const targetChecksum = hashSHA256(canonicalJson({ meta: canonicalMeta, context, messages }));
		await this.generatedOutputs.migrations.append({ ...migration, status: 'imported', targetChecksum });
		const replay = await this.conversationRecords.read(meta.id);
		if (!replay || replay.messages.length !== messages.length) {
			throw new Error(`Chat JSONL replay mismatch for ${meta.id}.`);
		}
		await this.generatedOutputs.migrations.append({ ...migration, status: 'validated', targetChecksum });
		return { meta: canonicalMeta, context, messages, content: '' };
	}
}
