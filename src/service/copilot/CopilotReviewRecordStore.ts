import type { GeneratedOutputPersistenceRuntime } from '@/core/storage/generated-output';
import { canonicalJson, sha256Text } from '@/core/storage/generated-output';

export type CopilotReviewRecordDomain = 'document-review' | 'vault-review';

export interface CopilotReviewRecordEvent<TRecord, TSnapshot, TChats = never> {
	domain: CopilotReviewRecordDomain;
	record: TRecord;
	snapshot?: TSnapshot;
	chats?: TChats;
	deleted: boolean;
	at: number;
}

export class CopilotReviewRecordStore {
	constructor(private readonly runtime: GeneratedOutputPersistenceRuntime) {}

	storagePath(domain: CopilotReviewRecordDomain, id: string): string {
		return `peak-review://${domain}/${id}`;
	}

	async save<TRecord extends { id: string }, TSnapshot, TChats = never>(
		domain: CopilotReviewRecordDomain,
		record: TRecord,
		snapshot: TSnapshot,
		chats?: TChats,
	): Promise<void> {
		const payload: CopilotReviewRecordEvent<TRecord, TSnapshot, TChats> = {
			domain,
			record,
			snapshot,
			...(chats === undefined ? {} : { chats }),
			deleted: false,
			at: Date.now(),
		};
		await this.append(domain, record.id, 'snapshot', payload);
	}

	async read<TRecord extends { id: string }, TSnapshot, TChats = never>(
		domain: CopilotReviewRecordDomain,
		id: string,
	): Promise<CopilotReviewRecordEvent<TRecord, TSnapshot, TChats> | null> {
		const stream = await this.runtime.events.readEvents<CopilotReviewRecordEvent<TRecord, TSnapshot, TChats>>(
			this.stream(domain, id),
		);
		if (stream.corruption) throw new Error(`Copilot review record ${id} is corrupt at line ${stream.corruption.lineNumber}.`);
		const latest = stream.events[stream.events.length - 1]?.payload;
		return latest && !latest.deleted ? latest : null;
	}

	async list<TRecord extends { id: string }, TSnapshot, TChats = never>(
		domain: CopilotReviewRecordDomain,
	): Promise<Array<CopilotReviewRecordEvent<TRecord, TSnapshot, TChats>>> {
		const prefix = `${domain}-`;
		const sample = this.runtime.resolvePath('composer.generation-history', { recordId: `${prefix}__sample__` });
		const root = sample.slice(0, sample.lastIndexOf('/'));
		const result: Array<CopilotReviewRecordEvent<TRecord, TSnapshot, TChats>> = [];
		for (const path of await this.runtime.events.listFilesAt(root)) {
			const filename = path.slice(path.lastIndexOf('/') + 1);
			if (!filename.startsWith(prefix) || !filename.endsWith('.jsonl')) continue;
			const id = filename.slice(prefix.length, -'.jsonl'.length);
			const record = await this.read<TRecord, TSnapshot, TChats>(domain, id);
			if (record) result.push(record);
		}
		return result;
	}

	async delete<TRecord extends { id: string }>(
		domain: CopilotReviewRecordDomain,
		record: TRecord,
	): Promise<void> {
		const payload: CopilotReviewRecordEvent<TRecord, never> = {
			domain,
			record,
			deleted: true,
			at: Date.now(),
		};
		await this.append(domain, record.id, 'deleted', payload);
	}

	private append(
		domain: CopilotReviewRecordDomain,
		id: string,
		kind: string,
		payload: CopilotReviewRecordEvent<unknown, unknown, unknown>,
	): Promise<boolean> {
		return this.runtime.events.appendEvent({
			...this.stream(domain, id),
			eventId: `${kind}:${payload.at}:${sha256Text(canonicalJson(payload))}`,
			payload,
		});
	}

	private stream(domain: CopilotReviewRecordDomain, id: string) {
		const recordId = `${domain}-${id}`;
		return {
			outputId: 'composer.generation-history',
			streamKey: recordId,
			pathVariables: { recordId },
		} as const;
	}
}
