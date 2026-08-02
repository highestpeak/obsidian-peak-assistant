import type { ChatContextWindow, ChatConversationMeta, ChatMessage } from '@/core/types/chat';
import { canonicalJson } from './GeneratedOutputIntegrity';
import type { GeneratedOutputPersistenceRuntime } from './GeneratedOutputPersistenceRuntime';
import { sha256Text } from './GeneratedOutputIntegrity';

export type ChatConversationRecordEvent =
	| { type: 'meta-upserted'; meta: ChatConversationMeta }
	| { type: 'context-upserted'; context: ChatContextWindow }
	| { type: 'message-upserted'; message: ChatMessage }
	| { type: 'deleted'; deletedAt: number };

export interface ChatConversationRecord {
	meta: ChatConversationMeta;
	context?: ChatContextWindow;
	messages: ChatMessage[];
	deleted: boolean;
}

export class ChatConversationRecordStore {
	constructor(private readonly runtime: GeneratedOutputPersistenceRuntime) {}

	appendMeta(conversationId: string, meta: ChatConversationMeta): Promise<boolean> {
		return this.append(conversationId, 'meta-upserted', { type: 'meta-upserted', meta }, meta.updatedAtTimestamp);
	}

	appendContext(conversationId: string, context: ChatContextWindow): Promise<boolean> {
		return this.append(
			conversationId,
			'context-upserted',
			{ type: 'context-upserted', context },
			context.lastUpdatedTimestamp,
		);
	}

	async appendMessages(conversationId: string, messages: readonly ChatMessage[]): Promise<void> {
		for (const message of messages) {
			await this.append(
				conversationId,
				`message-upserted:${message.id}`,
				{ type: 'message-upserted', message },
				message.createdAtTimestamp,
			);
		}
	}

	markDeleted(conversationId: string, deletedAt: number): Promise<boolean> {
		return this.append(conversationId, 'deleted', { type: 'deleted', deletedAt }, deletedAt);
	}

	async read(conversationId: string): Promise<ChatConversationRecord | null> {
		const stream = await this.runtime.events.readEvents<ChatConversationRecordEvent>(this.stream(conversationId));
		if (stream.corruption) {
			throw new Error(
				`ChatConversationRecordStore: ${conversationId} is corrupt at line ${stream.corruption.lineNumber}.`,
			);
		}
		let meta: ChatConversationMeta | undefined;
		let context: ChatContextWindow | undefined;
		let deleted = false;
		const messages = new Map<string, ChatMessage>();
		for (const envelope of stream.events) {
			const event = envelope.payload;
			if (event.type === 'meta-upserted') meta = event.meta;
			if (event.type === 'context-upserted') context = event.context;
			if (event.type === 'message-upserted') messages.set(event.message.id, event.message);
			if (event.type === 'deleted') deleted = true;
		}
		if (!meta) return null;
		return {
			meta,
			context,
			messages: [...messages.values()].sort((a, b) => a.createdAtTimestamp - b.createdAtTimestamp),
			deleted,
		};
	}

	async listConversationIds(): Promise<readonly string[]> {
		const sample = this.runtime.resolvePath('chat.conversation-events', { conversationId: '__sample__' });
		const directory = sample.slice(0, sample.lastIndexOf('/'));
		const files = await this.runtime.events.listFilesAt(directory);
		return files
			.map((path) => path.slice(path.lastIndexOf('/') + 1))
			.filter((name) => name.endsWith('.jsonl') && !name.includes('.corrupt-'))
			.map((name) => name.slice(0, -'.jsonl'.length))
			.sort();
	}

	private append(
		conversationId: string,
		kind: string,
		payload: ChatConversationRecordEvent,
		timestamp: number,
	): Promise<boolean> {
		const fingerprint = sha256Text(canonicalJson(payload));
		return this.runtime.events.appendEvent({
			...this.stream(conversationId),
			eventId: `${kind}:${timestamp}:${fingerprint}`,
			payload,
		});
	}

	private stream(conversationId: string) {
		return {
			outputId: 'chat.conversation-events',
			streamKey: conversationId,
			pathVariables: { conversationId },
		} as const;
	}
}
