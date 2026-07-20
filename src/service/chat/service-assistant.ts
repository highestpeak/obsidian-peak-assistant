import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import { ChatStorageService } from '@/core/storage/vault/ChatStore';
import {
	DEFAULT_ASSISTANT_ID,
	defaultToolPolicy,
	type ChatAssistantDefinition,
} from '@/core/types/chat-studio';

/**
 * Durable user-owned Chat Assistants (chat-studio §8.6 / RUN-04).
 *
 * An Assistant is a reusable conversation identity: name, summary,
 * instructions, knowledge refs, tool policy, preferred model. It is NOT a
 * Provider Profile, a User Profile, or a Harness tier — those stay separate
 * truth sources; the Assistant only references a preferred model binding.
 *
 * AI-drafted assistants are held as UI drafts; this service only receives
 * explicit user Save calls.
 */
export class AssistantService {
	constructor(private readonly storage: ChatStorageService) {}

	async list(includeArchived: boolean = false): Promise<ChatAssistantDefinition[]> {
		return this.storage.listAssistants(includeArchived);
	}

	/** Returns null for the default assistant id or unknown ids (safe fallback). */
	async get(assistantId: string | undefined): Promise<ChatAssistantDefinition | null> {
		if (!assistantId || assistantId === DEFAULT_ASSISTANT_ID) return null;
		return this.storage.readAssistant(assistantId);
	}

	async create(input: {
		name: string;
		summary?: string;
		instructions?: string;
		knowledgeRefs?: ChatAssistantDefinition['knowledgeRefs'];
		toolPolicy?: ChatAssistantDefinition['toolPolicy'];
		preferredModel?: ChatAssistantDefinition['preferredModel'];
	}): Promise<ChatAssistantDefinition> {
		const now = Date.now();
		const definition: ChatAssistantDefinition = {
			id: generateUuidWithoutHyphens(),
			name: input.name.trim() || 'Assistant',
			summary: input.summary?.trim() ?? '',
			instructions: input.instructions?.trim() ?? '',
			knowledgeRefs: input.knowledgeRefs ?? [],
			toolPolicy: input.toolPolicy ?? defaultToolPolicy(),
			preferredModel: input.preferredModel,
			createdAt: now,
			updatedAt: now,
		};
		await this.storage.saveAssistant(definition);
		return definition;
	}

	async update(definition: ChatAssistantDefinition): Promise<ChatAssistantDefinition> {
		const updated: ChatAssistantDefinition = { ...definition, updatedAt: Date.now() };
		await this.storage.saveAssistant(updated);
		return updated;
	}

	async duplicate(assistantId: string): Promise<ChatAssistantDefinition | null> {
		const source = await this.storage.readAssistant(assistantId);
		if (!source) return null;
		return this.create({
			name: `${source.name} (copy)`,
			summary: source.summary,
			instructions: source.instructions,
			knowledgeRefs: source.knowledgeRefs,
			toolPolicy: source.toolPolicy,
			preferredModel: source.preferredModel,
		});
	}

	async setArchived(assistantId: string, archived: boolean): Promise<void> {
		const definition = await this.storage.readAssistant(assistantId);
		if (!definition) return;
		await this.storage.saveAssistant({ ...definition, archived, updatedAt: Date.now() });
	}

	/**
	 * Delete an Assistant. Conversations that referenced it fall back to the
	 * default assistant at read time (get() returns null); their historical
	 * receipts keep the original assistantId.
	 */
	async delete(assistantId: string): Promise<void> {
		await this.storage.deleteAssistant(assistantId);
	}
}
