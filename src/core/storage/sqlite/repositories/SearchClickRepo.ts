import type { Database } from 'better-sqlite3';
import { porterStem } from '@/service/search/support/porter-stemmer';

export class SearchClickRepo {
	constructor(private db: Database) {}

	record(queryStems: string, path: string, rank: number): void {
		this.db.prepare(
			`INSERT INTO search_click (query_stems, path, rank, ts) VALUES (?, ?, ?, ?)`
		).run(queryStems, path, rank, Date.now());
	}

	getClickedPaths(queryStems: string, windowDays: number = 30): Set<string> {
		const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
		const rows = this.db.prepare(
			`SELECT DISTINCT path FROM search_click WHERE query_stems = ? AND ts > ?`
		).all(queryStems, cutoff) as Array<{ path: string }>;
		return new Set(rows.map(r => r.path));
	}

	prune(windowDays: number = 30): void {
		const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
		this.db.prepare(`DELETE FROM search_click WHERE ts < ?`).run(cutoff);
	}

	/**
	 * Build canonical query_stems string from terms.
	 * Stems each, sorts alphabetically, joins with space.
	 * "running tests" and "test running" → same key "run test".
	 */
	static buildQueryStems(terms: string[]): string {
		if (!terms.length) return '';
		return terms.map(t => porterStem(t.toLowerCase())).sort().join(' ');
	}
}
