import assert from 'assert';
import BetterSqlite3 from 'better-sqlite3';
import { migrateSqliteSchema } from '@/core/storage/sqlite/ddl';

function columnNames(db: BetterSqlite3.Database, tableName: string): string[] {
	return db
		.prepare(`PRAGMA table_info(${tableName})`)
		.all()
		.map((row: any) => String(row.name));
}

function testRecreatesLegacyStructuralHolesTable(): void {
	const db = new BetterSqlite3(':memory:');
	db.exec(`
		CREATE TABLE structural_holes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			community_a INTEGER NOT NULL,
			community_b INTEGER NOT NULL,
			gap_score REAL NOT NULL,
			semantic_sim REAL NOT NULL,
			inter_density REAL NOT NULL,
			bridge_candidates TEXT,
			status TEXT DEFAULT 'open',
			computed_at INTEGER NOT NULL DEFAULT 0,
			UNIQUE(community_a, community_b)
		);
		CREATE INDEX idx_structural_holes_score ON structural_holes(gap_score DESC);
	`);

	migrateSqliteSchema(db);

	const columns = columnNames(db, 'structural_holes');
	assert.ok(columns.includes('analysis_version'), 'structural_holes should have analysis_version');
	assert.ok(columns.includes('community_a_id'), 'structural_holes should have community_a_id');
	assert.ok(columns.includes('potential_bridges_json'), 'structural_holes should have potential_bridges_json');
	assert.ok(!columns.includes('semantic_sim'), 'legacy structural_holes columns should be removed');

	db.prepare('SELECT id, community_a_id, analysis_version FROM structural_holes LIMIT 1').all();
	db.close();
	console.log('PASS: recreatesLegacyStructuralHolesTable');
}

function testRecreatesLegacyCommunityMetadataTable(): void {
	const db = new BetterSqlite3(':memory:');
	db.exec(`
		CREATE TABLE community_metadata (
			community_id TEXT PRIMARY KEY,
			label TEXT NOT NULL,
			member_count INTEGER NOT NULL
		);
	`);

	migrateSqliteSchema(db);

	const columns = columnNames(db, 'community_metadata');
	assert.ok(columns.includes('analysis_version'), 'community_metadata should have analysis_version');
	assert.ok(columns.includes('dominant_topics_json'), 'community_metadata should have dominant_topics_json');
	assert.ok(columns.includes('top_nodes_json'), 'community_metadata should have top_nodes_json');

	db.prepare('SELECT community_id, analysis_version FROM community_metadata LIMIT 1').all();
	db.close();
	console.log('PASS: recreatesLegacyCommunityMetadataTable');
}

testRecreatesLegacyStructuralHolesTable();
testRecreatesLegacyCommunityMetadataTable();
