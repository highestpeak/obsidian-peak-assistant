import { App, normalizePath, TFile, TFolder } from 'obsidian';
import { buildConversationMarkdown, buildProjectMarkdown, parseFrontmatter } from './storage-markdown';
import { coerceModelId } from './types-models';
import {
	ChatContextWindow,
	ChatConversationMeta,
	ChatMessage,
	ChatProjectContext,
	ChatProjectMeta,
	ChatFilePaths,
	ParsedConversationFile,
	ParsedProjectFile,
	StarredMessageRecord,
} from './types';
import { buildTimestampedName, ensureFolder, slugify } from './utils';

export class ChatStorageService {
	private readonly rootFolder: string;
	private readonly starredCsvPath: string;

	constructor(private readonly app: App, paths: ChatFilePaths) {
		this.rootFolder = normalizePath(paths.rootFolder);
		this.starredCsvPath = normalizePath(paths.starredCsvPath);
	}

	async init(): Promise<void> {
		await ensureFolder(this.app, this.rootFolder);
		await this.ensureStarredCsv();
	}

	async ensureProjectFolders(project: ChatProjectMeta): Promise<void> {
		await ensureFolder(this.app, this.rootFolder);
		const projectFolder = this.getProjectFolderPath(project);
		await ensureFolder(this.app, projectFolder);
	}

	async saveProject(project: ChatProjectMeta, context?: ChatProjectContext, body?: string): Promise<TFile> {
		await this.ensureProjectFolders(project);
		const fileName = `Project-Summary.md`;
		const projectFolder = this.getProjectFolderPath(project);
		const path = this.join(projectFolder, fileName);

        // todo check if file exists. check if summary content is empty.
		const file = this.app.vault.getAbstractFileByPath(path) as TFile | null;
		const markdown = buildProjectMarkdown({ meta: project, context, bodySections: body });
		return this.writeFile(file, path, markdown);
	}

	async saveConversation(
		project: ChatProjectMeta | null,
		conversation: ChatConversationMeta,
		messages: ChatMessage[],
		context?: ChatContextWindow,
		notes?: string,
		existingFile?: TFile
	): Promise<TFile> {
		const folder = project ? this.getProjectFolderPath(project) : this.rootFolder;
		await ensureFolder(this.app, folder);

		const file = existingFile ?? ((): TFile | null => {
			const fileName = this.buildConversationFileName(conversation);
			const path = this.join(folder, `${fileName}.md`);
			return this.app.vault.getAbstractFileByPath(path) as TFile | null;
		})();

		const path = file?.path ?? this.join(folder, `${this.buildConversationFileName(conversation)}.md`);
		
		const markdown = buildConversationMarkdown({
			meta: conversation,
			context,
			messages,
			bodySections: notes,
		});

		return this.writeFile(file, path, markdown);
	}

	async readConversation(file: TFile): Promise<ParsedConversationFile> {
		const raw = await this.app.vault.read(file);
		const frontmatter = parseFrontmatter<Record<string, unknown>>(raw);
		if (!frontmatter) {
			throw new Error(`File is missing frontmatter: ${file.path}`);
		}

		const meta = this.pickConversationMeta(frontmatter.data, file);
		// Try new format first (chat-conversation-summary), fallback to old format (chat-context)
		let context = this.extractContext<ChatContextWindow>(frontmatter.body, 'chat-conversation-summary') 
			?? this.extractContext<ChatContextWindow>(frontmatter.body, 'chat-context');
		
		// Extract summary from content section after meta code block
		// New format: # Conversation Summary -> ## meta (with code block) -> ## content (with text)
		if (context) {
			// Look for ## content section within Conversation Summary section
			const conversationSummaryMatch = frontmatter.body.match(/# Conversation Summary[\s\S]*?## content\n\n([\s\S]*?)(?=\n# |$)/);
			if (conversationSummaryMatch) {
				context.summary = conversationSummaryMatch[1].trim();
			} else {
				context.summary = 'defaultSummary';
			}
		} else {
			// Create default context if none exists
			context = {
				lastUpdatedTimestamp: Date.now(),
				recentMessagesWindow: [],
				summary: 'defaultSummary',
			};
		}
		
		const messages = this.extractMessages(frontmatter.body);
		return { meta, context, messages, content: frontmatter.body, file };
	}

	async readProject(file: TFile): Promise<ParsedProjectFile> {
		const raw = await this.app.vault.read(file);
		const frontmatter = parseFrontmatter<Record<string, unknown>>(raw);
		if (!frontmatter) {
			throw new Error(`File is missing frontmatter: ${file.path}`);
		}

		const meta = this.pickProjectMeta(frontmatter.data, file);
		const context = this.extractContext<ChatProjectContext>(frontmatter.body, 'chat-project-context');
		return { meta, context, content: frontmatter.body, file };
	}

	async listProjects(): Promise<ParsedProjectFile[]> {
		const folder = this.app.vault.getAbstractFileByPath(this.rootFolder);
		if (!(folder instanceof TFolder)) {
			return [];
		}

		const result: ParsedProjectFile[] = [];
		for (const child of folder.children) {
			if (!(child instanceof TFolder)) continue;
			const summaryFile = child.children.find((f) => f instanceof TFile && f.name === 'Project-Summary.md');
			if (summaryFile instanceof TFile) {
				const parsed = await this.readProject(summaryFile);
				result.push(parsed);
			}
		}
		return result;
	}

	async listConversations(project?: ChatProjectMeta): Promise<ParsedConversationFile[]> {
		const targetFolder = project ? this.getProjectFolderPath(project) : this.rootFolder;

		const folder = this.app.vault.getAbstractFileByPath(targetFolder);
		if (!(folder instanceof TFolder)) {
			return [];
		}

		const result: ParsedConversationFile[] = [];
		for (const child of folder.children) {
			// Exclude Project-Summary.md file - it's not a conversation
			if (child instanceof TFile && child.extension === 'md' && child.name !== 'Project-Summary.md') {
				result.push(await this.readConversation(child));
			}
		}
		return result;
	}

	async addStar(record: StarredMessageRecord): Promise<void> {
		const records = await this.readStarredCsv();
		const existingIndex = records.findIndex((r) => r.sourceMessageId === record.sourceMessageId);
		if (existingIndex >= 0) {
			records[existingIndex] = record;
		} else {
			records.push(record);
		}
		await this.writeStarredCsv(records);
	}

	async removeStar(messageId: string): Promise<void> {
		const records = await this.readStarredCsv();
		const next = records.map((record) => {
			if (record.sourceMessageId === messageId) {
				return { ...record, active: false };
			}
			return record;
		});
		await this.writeStarredCsv(next);
	}

	async readStarredCsv(): Promise<StarredMessageRecord[]> {
		const file = this.app.vault.getAbstractFileByPath(this.starredCsvPath);
		if (!(file instanceof TFile)) {
			return [];
		}

		const text = await this.app.vault.read(file);
		return text
			.split('\n')
			.slice(1)
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => line.split(','))
			.map(([id, sourceMessageId, conversationId, projectId, createdAt, active]) => ({
				id,
				sourceMessageId,
				conversationId,
				projectId: projectId || undefined,
				createdAt: Number(createdAt),
				active: active === 'true',
			}));
	}

	private async ensureStarredCsv(): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(this.starredCsvPath);
		if (file instanceof TFile) {
			return;
		}

		const folderPath = this.starredCsvPath.substring(0, this.starredCsvPath.lastIndexOf('/'));
		if (folderPath) {
			await ensureFolder(this.app, folderPath);
		}
		await this.app.vault.create(this.starredCsvPath, 'id,sourceMessageId,conversationId,projectId,createdAt,active\n');
	}

	private async writeStarredCsv(records: StarredMessageRecord[]): Promise<void> {
		const header = 'id,sourceMessageId,conversationId,projectId,createdAt,active\n';
		const body = records
			.map((record) => [
				record.id,
				record.sourceMessageId,
				record.conversationId,
				record.projectId ?? '',
				record.createdAt,
				String(record.active),
			].join(','))
			.join('\n');

		await this.app.vault.modify(
			this.app.vault.getAbstractFileByPath(this.starredCsvPath) as TFile,
			header + (body ? body + '\n' : '')
		);
	}

	private extractContext<T extends object>(body: string, block: string): T | undefined {
		const regex = new RegExp('```' + block + '\\n([\\s\\S]*?)```', 'm');
		const match = body.match(regex);
		if (!match) return undefined;
		return parseFrontmatter<T>('---\n' + match[1] + '\n---\n')?.data ?? undefined;
	}

	private extractMessages(body: string): ChatMessage[] {
		// New format: # MS-Bot-{summary} or # MS-User-{summary} etc.
		const messageHeaderRegex = /^# MS-(Bot|User|System)-/m;
		const sections = body.split(/\n(?=# MS-)/).filter(section => messageHeaderRegex.test(section));
		
		return sections
			.map((section) => {
				// Extract meta section (## meta with code block containing YAML list format)
				const metaMatch = section.match(/## meta\n\n```yaml\n([\s\S]*?)```/);
				if (!metaMatch) return null;
				
				// Parse YAML-like list format from code block
				const metaText = metaMatch[1];
				const meta: Partial<ChatMessage> = {};
				
				// Extract id
				const idMatch = metaText.match(/id:\s*([^\n]+)/);
				if (!idMatch) return null;
				meta.id = idMatch[1].trim();
				
				// Extract other fields
				const roleMatch = metaText.match(/role:\s*([^\n]+)/);
				if (roleMatch) meta.role = roleMatch[1].trim() as ChatMessage['role'];
				
				const zoneMatch = metaText.match(/createdAtZone:\s*([^\n]+)/);
				if (zoneMatch) meta.createdAtZone = zoneMatch[1].trim();
				
				const timestampMatch = metaText.match(/createdAtTimestamp:\s*(\d+)/);
				if (timestampMatch) meta.createdAtTimestamp = Number(timestampMatch[1]);
				
				const starredMatch = metaText.match(/starred:\s*(true|false)/);
				if (starredMatch) meta.starred = starredMatch[1] === 'true';
				
				const modelMatch = metaText.match(/model:\s*"([^"]+)"/);
				if (modelMatch) meta.model = coerceModelId(modelMatch[1]);
				
				// Extract attachments (JSON array format)
				let attachments: string[] = [];
				const attachmentsMatch = metaText.match(/attachments:\s*(\[[^\]]*\])/);
				if (attachmentsMatch) {
					try {
						attachments = JSON.parse(attachmentsMatch[1]);
					} catch (e) {
						// If parsing fails, use empty array
						attachments = [];
					}
				}
				
				// Extract content section (## content with markdown code block)
				const contentMatch = section.match(/## content\n\n```markdown\n([\s\S]*?)```/);
				if (!contentMatch) return null;
				meta.content = contentMatch[1].trim();
				
				if (!meta.id || !meta.role || !meta.content || !meta.model) {
					return null;
				}
				
				return {
					id: meta.id,
					role: meta.role,
					content: meta.content,
					createdAtTimestamp: meta.createdAtTimestamp ?? Date.now(),
					createdAtZone: meta.createdAtZone ?? 'UTC',
					starred: meta.starred ?? false,
					model: meta.model,
					attachments,
				} as ChatMessage;
			})
			.filter((message): message is ChatMessage => !!message);
	}

	private pickConversationMeta(data: Record<string, unknown>, file: TFile): ChatConversationMeta {
		// Get title from filename (file name without extension)
		const fileName = file.basename;
		// Extract title from filename (format: Conv-{timestamp}-{title})
		let title = '';
		const match = fileName.match(/^Conv-\d+-(.+)$/);
		if (match) {
			title = match[1];
		} else {
			title = fileName;
		}
		
		return {
			id: String(data.id ?? ''),
			title,
			projectId: data.projectId ? String(data.projectId) : undefined,
			createdAtTimestamp: Number(data.createdAtTimestamp ?? Date.now()),
			updatedAtTimestamp: Number(data.updatedAtTimestamp ?? Date.now()),
			activeModel: coerceModelId(data.activeModel as string | undefined),
			tokenUsageTotal: data.tokenUsageTotal as number | undefined,
			titleManuallyEdited: data.titleManuallyEdited === true,
		};
	}

	private pickProjectMeta(data: Record<string, unknown>, file: TFile): ChatProjectMeta {
		// Get name from folder name (parent folder of Project-Summary.md)
		const folder = file.parent;
		let name = '';
		if (folder instanceof TFolder) {
			// Extract name from folder name (format: Project-{name})
			const folderName = folder.name;
			const match = folderName.match(/^Project-(.+)$/);
			if (match) {
				name = match[1];
			} else {
				name = folderName;
			}
		} else {
			name = String(data.name ?? '');
		}
		
		return {
			id: String(data.id ?? ''),
			name,
			folderPath: this.pickProjectFolderPath(data, file),
			createdAtTimestamp: Number(data.createdAtTimestamp ?? Date.now()),
			updatedAtTimestamp: Number(data.updatedAtTimestamp ?? Date.now()),
		};
	}

	buildConversationFileName(meta: ChatConversationMeta): string {
		return buildTimestampedName('Conv', meta.title || meta.id, meta.createdAtTimestamp);
	}

	private pickProjectFolderPath(data: Record<string, unknown>, file: TFile): string | undefined {
		// Get folder path from file's parent folder
		const folder = file.parent;
		if (folder instanceof TFolder) {
			return normalizePath(folder.path);
		}
		
		const folderPath = typeof data.folderPath === 'string' ? data.folderPath.trim() : '';
		if (folderPath) {
			return normalizePath(folderPath);
		}

		const chatPath = typeof data.chatFolderPath === 'string' ? data.chatFolderPath.trim() : '';
		if (chatPath) {
			if (chatPath.endsWith('/conversations')) {
				return normalizePath(chatPath.slice(0, -'/conversations'.length));
			}
			return normalizePath(chatPath);
		}

		const basePath = typeof data.baseFolderPath === 'string' ? data.baseFolderPath.trim() : '';
		if (basePath) {
			if (basePath.endsWith('/base')) {
				return normalizePath(basePath.slice(0, -'/base'.length));
			}
			return normalizePath(basePath);
		}

		return undefined;
	}

	private getProjectFolderPath(project: ChatProjectMeta): string {
		if (project.folderPath && project.folderPath.trim()) {
			return normalizePath(project.folderPath);
		}
		const sanitized = slugify(project.name || project.id);
		return this.join(this.rootFolder, `Project-${sanitized || project.id}`);
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
}

