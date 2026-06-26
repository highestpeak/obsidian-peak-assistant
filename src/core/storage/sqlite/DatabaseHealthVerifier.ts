import { Notice } from 'obsidian';
import type { AppHandle as App } from '@/core/ports/AppHandle';
import type { MyPluginSettings } from '@/core/config/settingsTypes';
import { sqliteStoreManager } from './SqliteStoreManager';
import type { SqliteDatabase } from './types';

const KEY_TABLES = ['mobius_node', 'mobius_edge', 'embedding', 'doc_chunk'] as const;

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

export async function verifyDatabaseHealth(_app: App, _settings: MyPluginSettings): Promise<void> {
	const mgr = sqliteStoreManager;
	if (!mgr.isInitialized()) {
		new Notice('Database not initialized', 3000);
		return;
	}

	const lines = [
		...checkDb('search', mgr.getSearchStore()),
		...checkDb('meta', mgr.getMetaStore()),
	];

	const ok = lines.every((l) => !l.includes('integrity:') || l.includes('ok'));
	new Notice(ok ? 'Database healthy' : 'Database issues found — see console', 3000);
	console.log('[DatabaseHealth]\n' + lines.join('\n'));
}
