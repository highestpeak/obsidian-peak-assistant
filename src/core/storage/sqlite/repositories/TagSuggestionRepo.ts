import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';
import { v4 as uuidv4 } from 'uuid';

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'edited';

export interface TagSuggestionRow {
	id: string;
	doc_path: string;
	tag: string;
	category: string;
	confidence: number;
	sources: string;
	reason: string;
	is_existing: number;
	status: SuggestionStatus;
	edited_tag: string | null;
	created_at: number;
	resolved_at: number | null;
	batch_id: string | null;
}

export class TagSuggestionRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/** Insert a batch of suggestions for a document. */
	async insertBatch(params: {
		docPath: string;
		batchId: string;
		suggestions: Array<{
			tag: string;
			category: string;
			confidence: number;
			sources: string[];
			reason: string;
			isExisting: boolean;
		}>;
	}): Promise<void> {
		if (params.suggestions.length === 0) return;
		const now = Date.now();
		await this.db
			.insertInto('tag_suggestion')
			.values(
				params.suggestions.map(s => ({
					id: uuidv4(),
					doc_path: params.docPath,
					tag: s.tag,
					category: s.category,
					confidence: s.confidence,
					sources: JSON.stringify(s.sources),
					reason: s.reason,
					is_existing: s.isExisting ? 1 : 0,
					status: 'pending' as const,
					edited_tag: null,
					created_at: now,
					resolved_at: null,
					batch_id: params.batchId,
				})),
			)
			.onConflict(oc => oc.doNothing())
			.execute();
	}

	/** Resolve multiple suggestions at once (accept/reject/edit). */
	async resolveBatch(
		resolutions: Array<{
			tag: string;
			docPath: string;
			batchId: string;
			status: SuggestionStatus;
			editedTag?: string;
		}>,
	): Promise<void> {
		const now = Date.now();
		for (const r of resolutions) {
			await this.db
				.updateTable('tag_suggestion')
				.set({
					status: r.status,
					edited_tag: r.editedTag ?? null,
					resolved_at: now,
				})
				.where('doc_path', '=', r.docPath)
				.where('tag', '=', r.tag)
				.where('batch_id', '=', r.batchId)
				.execute();
		}
	}

	/** Get suggestions for a document (latest batch). */
	async getLatestForDoc(docPath: string): Promise<TagSuggestionRow[]> {
		return this.db
			.selectFrom('tag_suggestion')
			.selectAll()
			.where('doc_path', '=', docPath)
			.orderBy('created_at', 'desc')
			.limit(20)
			.execute() as Promise<TagSuggestionRow[]>;
	}

	/** Get acceptance rate for a tag (across all docs). */
	async getAcceptanceRate(tag: string): Promise<number | null> {
		const rows = await this.db
			.selectFrom('tag_suggestion')
			.select('status')
			.where('tag', '=', tag)
			.where('status', '!=', 'pending')
			.execute();
		if (rows.length === 0) return null;
		const accepted = rows.filter(
			r => r.status === 'accepted' || r.status === 'edited',
		).length;
		return accepted / rows.length;
	}
}
