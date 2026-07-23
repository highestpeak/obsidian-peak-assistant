/**
 * One-shot companion to migrate-ai-analysis.mjs: repoint the sqlite
 * `ai_analysis_record` index (chat.sqlite) at the migrated `.json` records.
 *
 * - Rows whose vault_rel_path is a legacy `<...>/AI-Analysis/<base>.md` with a
 *   migrated `<...>/DataStore/ai-analysis/<base>.json` on disk → UPDATE path.
 * - `.json` files with no index row (early reports predating the index) →
 *   INSERT a row (id = md5(newPath), same scheme as generateDocIdFromPath).
 *
 * Safe to re-run (idempotent). Uses WAL + busy_timeout so it can run while
 * Obsidian is open; the transaction is short.
 *
 * Usage:
 *   node scripts/migrate-ai-analysis-index.mjs <chat.sqlite> <vault-root>
 * e.g.
 *   node scripts/migrate-ai-analysis-index.mjs \
 *     /Users/zhangjike/code/my-code/mobius-highestpeak-kb/ChatFolder/DataStore/chat.sqlite \
 *     /Users/zhangjike/code/my-code/mobius-highestpeak-kb
 */
import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

const [dbPath, vaultRoot] = process.argv.slice(2);
if (!dbPath || !vaultRoot) {
	console.error('usage: node scripts/migrate-ai-analysis-index.mjs <chat.sqlite> <vault-root>');
	process.exit(1);
}

const JSON_STORE_REL = 'ChatFolder/DataStore/ai-analysis';
const jsonDir = path.join(vaultRoot, JSON_STORE_REL);
const jsonFiles = fs.readdirSync(jsonDir).filter((f) => f.endsWith('.json'));
const byBase = new Map(jsonFiles.map((f) => [f.replace(/\.json$/, ''), `${JSON_STORE_REL}/${f}`]));

const md5id = (s) => createHash('md5').update(s).digest('hex');

const db = new Database(dbPath);
db.pragma('busy_timeout = 5000');

const rows = db.prepare(`SELECT id, vault_rel_path FROM ai_analysis_record`).all();
const update = db.prepare(`UPDATE ai_analysis_record SET vault_rel_path = ? WHERE id = ?`);
const insert = db.prepare(`
	INSERT OR IGNORE INTO ai_analysis_record
		(id, vault_rel_path, query, title, created_at_ts, web_enabled, sources_count, topics_count, duration)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

let updated = 0;
let alreadyJson = 0;
let orphanRows = 0;
const claimed = new Set();

db.transaction(() => {
	for (const row of rows) {
		const p = row.vault_rel_path;
		if (p.endsWith('.json')) {
			claimed.add(p.split('/').pop().replace(/\.json$/, ''));
			alreadyJson++;
			continue;
		}
		const base = p.split('/').pop().replace(/\.md$/, '');
		const newPath = byBase.get(base);
		if (!newPath) {
			orphanRows++;
			continue;
		}
		update.run(newPath, row.id);
		claimed.add(base);
		updated++;
	}

	let inserted = 0;
	for (const [base, relPath] of byBase) {
		if (claimed.has(base)) continue;
		let record;
		try {
			record = JSON.parse(fs.readFileSync(path.join(vaultRoot, relPath), 'utf8'));
		} catch {
			continue;
		}
		const snap = record.snapshot ?? {};
		insert.run(
			md5id(relPath),
			relPath,
			record.query || null,
			record.title || null,
			record.savedAt ?? Date.now(),
			record.webEnabled ? 1 : 0,
			Array.isArray(snap.sources) ? snap.sources.length : null,
			Array.isArray(snap.topics) ? snap.topics.length : null,
			typeof snap.duration === 'number' ? snap.duration : null,
		);
		inserted++;
	}
	console.log(`rows=${rows.length} updated=${updated} alreadyJson=${alreadyJson} orphanRows=${orphanRows} inserted=${inserted} jsonFiles=${jsonFiles.length}`);
})();

const finalCount = db.prepare(`SELECT count(*) AS c FROM ai_analysis_record WHERE vault_rel_path LIKE '%.json'`).get();
console.log(`index rows now pointing at .json: ${finalCount.c}`);
db.close();
