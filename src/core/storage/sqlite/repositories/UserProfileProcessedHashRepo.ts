import type { Kysely } from 'kysely';
import type { Database as DbSchema } from '../ddl';

/**
 * Stores content hashes of documents already summarized for user profile.
 * All data are hashes; use full load or DB lookup to skip processed docs.
 */
export class UserProfileProcessedHashRepo {
	constructor(private readonly db: Kysely<DbSchema>) {}

	/**
	 * Insert a hash (idempotent: ignore if exists).
	 */
	async insert(contentHash: string): Promise<void> {
		const now = Date.now();
		await this.db
			.insertInto('user_profile_processed_hash')
			.values({ content_hash: contentHash, processed_at: now })
			.onConflict((oc) => oc.column('content_hash').doNothing())
			.execute();
	}

	/**
	 * Insert multiple hashes in one go.
	 */
	async insertMany(hashes: string[]): Promise<void> {
		if (hashes.length === 0) return;
		const now = Date.now();
		await this.db
			.insertInto('user_profile_processed_hash')
			.values(hashes.map((content_hash) => ({ content_hash, processed_at: now })))
			.onConflict((oc) => oc.column('content_hash').doNothing())
			.execute();
	}

	/**
	 * Check if hash exists (single lookup).
	 */
	async has(contentHash: string): Promise<boolean> {
		const row = await this.db
			.selectFrom('user_profile_processed_hash')
			.select('content_hash')
			.where('content_hash', '=', contentHash)
			.executeTakeFirst();
		return row != null;
	}

	/**
	 * Load all hashes into a Set (for batch filter). Or return array.
	 */
	async loadAllHashes(): Promise<Set<string>> {
		const rows = await this.db
			.selectFrom('user_profile_processed_hash')
			.select('content_hash')
			.execute();
		return new Set(rows.map((r) => r.content_hash));
	}

	/**
	 * Clear all records (e.g. for full re-run).
	 */
	async clearAll(): Promise<void> {
		await this.db.deleteFrom('user_profile_processed_hash').execute();
	}
}
