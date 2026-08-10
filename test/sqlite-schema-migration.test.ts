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
	migrateSqliteSchema(db);
	db.exec(`
		INSERT INTO mobius_node (
			node_id, type, label, created_at, updated_at,
			community_id, structural_analysis_version,
			betweenness_centrality, structural_constraint
		) VALUES ('a', 'document', 'A', 1, 1, 'c_1', 6, 0.4, 0.2);
		INSERT INTO structural_analysis_state (key, value)
		VALUES ('analysis_version', '6'), ('last_computed_at', '123');
		DROP TABLE community_metadata;
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
	const node = db.prepare(`
		SELECT community_id, structural_analysis_version
		FROM mobius_node WHERE node_id = 'a'
	`).get() as { community_id: string | null; structural_analysis_version: number | null };
	assert.equal(node.community_id, null, 'rebuilding community metadata invalidates stale node assignments');
	assert.equal(node.structural_analysis_version, null, 'rebuilding community metadata invalidates node analysis versions');
	assert.equal(
		Number((db.prepare('SELECT COUNT(*) AS count FROM structural_analysis_state').get() as { count: number }).count),
		0,
		'rebuilding community metadata clears stale freshness state',
	);

	db.prepare('SELECT community_id, analysis_version FROM community_metadata LIMIT 1').all();
	db.close();
	console.log('PASS: recreatesLegacyCommunityMetadataTable');
}

function testRepairsOrphanCommunityAssignments(): void {
	const db = new BetterSqlite3(':memory:');
	migrateSqliteSchema(db);
	db.exec(`
		INSERT INTO mobius_node (
			node_id, type, label, created_at, updated_at,
			community_id, structural_analysis_version
		) VALUES ('orphan', 'document', 'Orphan', 1, 1, 'missing-community', 6);
		INSERT INTO structural_analysis_state (key, value)
		VALUES ('analysis_version', '6');
	`);

	migrateSqliteSchema(db);

	const node = db.prepare(`
		SELECT community_id, structural_analysis_version
		FROM mobius_node WHERE node_id = 'orphan'
	`).get() as { community_id: string | null; structural_analysis_version: number | null };
	assert.equal(node.community_id, null, 'orphan assignments are removed even when the metadata schema is current');
	assert.equal(node.structural_analysis_version, null, 'orphan structural versions are invalidated');
	assert.equal(
		Number((db.prepare('SELECT COUNT(*) AS count FROM structural_analysis_state').get() as { count: number }).count),
		0,
		'orphan assignments invalidate stale structural freshness state',
	);
	db.close();
	console.log('PASS: repairsOrphanCommunityAssignments');
}

function testPreservesEvidenceBackedCommunityAssignments(): void {
	const db = new BetterSqlite3(':memory:');
	migrateSqliteSchema(db);
	db.exec(`
		INSERT INTO community_metadata (
			community_id, label, member_count, dominant_topics_json,
			descriptors_json, top_nodes_json, internal_density,
			internal_reference_count, fingerprint, analysis_mode,
			analyzed_node_count, total_node_count, analysis_version
		) VALUES (
			'current-community', 'Current', 1, '[]', '[]', '[]', 0,
			0, 'fingerprint', 'exact', 1, 1, 6
		);
		INSERT INTO mobius_node (
			node_id, type, label, created_at, updated_at,
			community_id, structural_analysis_version
		) VALUES ('current', 'document', 'Current', 1, 1, 'current-community', 6);
		INSERT INTO structural_analysis_state (key, value)
		VALUES ('analysis_version', '6');
	`);

	migrateSqliteSchema(db);

	const node = db.prepare(`
		SELECT community_id, structural_analysis_version
		FROM mobius_node WHERE node_id = 'current'
	`).get() as { community_id: string | null; structural_analysis_version: number | null };
	assert.equal(node.community_id, 'current-community', 'evidence-backed assignments remain intact');
	assert.equal(node.structural_analysis_version, 6, 'current structural versions remain intact');
	db.close();
	console.log('PASS: preservesEvidenceBackedCommunityAssignments');
}

testRecreatesLegacyStructuralHolesTable();
testRecreatesLegacyCommunityMetadataTable();
testRepairsOrphanCommunityAssignments();
testPreservesEvidenceBackedCommunityAssignments();
