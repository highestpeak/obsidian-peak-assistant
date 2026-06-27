import { sqliteStoreManager } from './SqliteStoreManager';
import type { SqliteDatabase } from './types';

const KEY_TABLES = ['mobius_node', 'mobius_edge', 'embedding', 'doc_chunk'] as const;

/**
 * T11Q: pure result. The app layer reports the outcome (e.g. via Notice +
 * console). Core no longer imports Obsidian `Notice`.
 */
export type DatabaseHealthReport = {
	initialized: boolean;
	ok: boolean;
	lines: string[];
};

function checkDb(label: string, db: SqliteDatabase | null): string[] {
	if (!db) return [`${label}: not initialized`];
	const lines: string[] = [];

	const integrity = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
	lines.push(`${label} integrity: ${integrity.integrity_check}`);

	for (const table of KEY_TABLES) {
		try {
			const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${table}`).get() as { cnt: number };
			lines.push(`  ${table}: ${row.cnt} rows`);
		} catch {
			lines.push(`  ${table}: missing`);
		}
	}
	return lines;
}

export function verifyDatabaseHealth(): DatabaseHealthReport {
	const mgr = sqliteStoreManager;
	if (!mgr.isInitialized()) {
		return { initialized: false, ok: false, lines: ['Database not initialized'] };
	}

	const lines = [
		...checkDb('search', mgr.getSearchStore()),
		...checkDb('meta', mgr.getMetaStore()),
	];
	const ok = lines.every((l) => !l.includes('integrity:') || l.includes('ok'));
	return { initialized: true, ok, lines };
}
