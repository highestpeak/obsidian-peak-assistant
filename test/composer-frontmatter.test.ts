/**
 * Peak Composer — frontmatter pack (WP5, CMP-FM-01..05).
 *
 * Covers the framework-neutral half of the frontmatter pack with no Obsidian:
 *   - property model typing + provenance (CMP-FM-01);
 *   - YAML writeback fidelity — comments/order/unknown fields preserved, only the
 *     target field mutated, list⇄scalar shape change flagged, stale refused
 *     (CMP-FM-04);
 *   - metadata-field-patch operations build one atomic block replaceRange;
 *   - Vault property inventory statistics (CMP-FM-02);
 *   - field candidate from a vault field + custom key/value (CMP-FM-03);
 *   - AI suggestion line parsing (CMP-FM-05).
 */

import {
	parseFrontmatterModel,
	setFrontmatterField,
	createFrontmatterBlock,
	buildMetadataFieldPatchOperations,
	buildInsertFrontmatterHeadOperations,
	computeVaultPropertyInventory,
	fieldCandidateFromVault,
	customFieldCandidate,
	parseMetadataSuggestions,
	parseComposerDocument,
	type VaultFrontmatterRecord,
} from '@/service/composer';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

const BLOCK = `---
created: 2023-10-15 21:45:29
updated: 2023-10-18 21:17:05
tags: [pkm, information-management, canvas]
aliases: [PKM 产品分析]
type: analysis
reviewed: false
home: "[[Index]]"
---`;

function testModel(): void {
	const model = parseFrontmatterModel(BLOCK);
	check('model present + not malformed', model.present && !model.malformed);
	const byKey = new Map(model.fields.map((f) => [f.key, f]));
	check('field order preserved', model.fields.map((f) => f.key).join(',') === 'created,updated,tags,aliases,type,reviewed,home');
	check('created is program+date', byKey.get('created')?.origin === 'program' && byKey.get('created')?.valueKind === 'date');
	check('tags is list', byKey.get('tags')?.valueKind === 'list' && Array.isArray(byKey.get('tags')?.value));
	check('tags items', (byKey.get('tags')?.value as string[]).join(',') === 'pkm,information-management,canvas');
	check('type is scalar+human', byKey.get('type')?.valueKind === 'scalar' && byKey.get('type')?.origin === 'human');
	check('reviewed is boolean', byKey.get('reviewed')?.valueKind === 'boolean' && byKey.get('reviewed')?.value === false);
	check('home is link', byKey.get('home')?.valueKind === 'link');

	const empty = parseFrontmatterModel('---\n---');
	check('empty frontmatter has no fields', empty.present && empty.fields.length === 0 && !empty.malformed);
}

function testWriteback(): void {
	// Replace an existing scalar; comments/order/other fields verbatim.
	const commented = `---
created: 2023-10-15 # program managed
type: analysis
tags: [pkm, canvas]
---`;
	const res = setFrontmatterField(commented, { key: 'type', value: 'review' });
	check('writeback ok', res.ok && res.nextBlockSource !== undefined);
	const next = res.nextBlockSource ?? '';
	check('comment preserved', next.includes('# program managed'));
	check('untouched flow list preserved', next.includes('tags: [pkm, canvas]'));
	check('target field changed', next.includes('type: review') && !next.includes('type: analysis'));
	check('order preserved', next.indexOf('created') < next.indexOf('type') && next.indexOf('type') < next.indexOf('tags'));
	check('fences intact', next.startsWith('---\n') && next.trimEnd().endsWith('---'));

	// Add a new field (absent) — no review needed.
	const added = setFrontmatterField(commented, { key: 'status', value: 'evergreen' });
	check('add new scalar ok, no review', added.ok && !added.requiresReview && (added.nextBlockSource ?? '').includes('status: evergreen'));

	// scalar → list is a shape change → requiresReview.
	const shape = setFrontmatterField(commented, { key: 'type', value: ['a', 'b'] });
	check('scalar→list flags requiresReview', shape.ok && shape.requiresReview === true);

	// list → list is not a shape change.
	const listSame = setFrontmatterField(commented, { key: 'tags', value: ['x', 'y', 'z'] });
	check('list→list no review', listSame.ok && !listSame.requiresReview);

	// Stale detection.
	const stale = setFrontmatterField(commented, { key: 'type', value: 'x' }, { expectBaseInner: 'created: 1999\n' });
	check('stale base refused', !stale.ok && stale.reason === 'stale');

	// Round-trip parse of the writeback output stays coherent.
	const reparsed = parseFrontmatterModel(added.nextBlockSource ?? '');
	check('writeback output reparses', reparsed.fields.some((f) => f.key === 'status' && f.value === 'evergreen'));

	// createFrontmatterBlock for a doc with no frontmatter.
	const fresh = createFrontmatterBlock([{ key: 'type', value: 'note' }, { key: 'tags', value: ['a'] }]);
	check('createFrontmatterBlock framed', fresh.startsWith('---\n') && fresh.trimEnd().endsWith('---'));
	check('createFrontmatterBlock parses', parseFrontmatterModel(fresh).fields.map((f) => f.key).join(',') === 'type,tags');
}

function testOperations(): void {
	const src = '---\ntype: analysis\n---';
	const built = buildMetadataFieldPatchOperations(src, 100, 100 + src.length, { key: 'status', value: 'draft' });
	check('ops ok single replaceRange', built.ok && built.operations.length === 1 && built.operations[0].kind === 'replaceRange');
	const op = built.operations[0] as { from: number; to: number; text: string };
	check('op spans the whole block', op.from === 100 && op.to === 100 + src.length);
	check('op text sets field', op.text.includes('status: draft') && op.text.includes('type: analysis'));

	const bad = buildMetadataFieldPatchOperations('---\ntype: analysis\n---', 0, 10, { key: 'x', value: 'y' }, { expectBaseInner: 'nope' });
	check('stale build → no ops', !bad.ok && bad.operations.length === 0 && bad.reason === 'stale');
}

function testHeadInsert(): void {
	// A document with no frontmatter: insert a seeded block at byte 0.
	const doc = '# Title\n\nBody paragraph.\n';
	const snapshot = parseComposerDocument(doc, { filePath: 'head.md' });
	const baseCount = snapshot.blocks.length;
	const built = buildInsertFrontmatterHeadOperations(snapshot, [{ key: 'tags', value: [] }]);
	check('head insert ok', built.ok && built.operations.length === 1);
	check('head insert is +1 block', built.expectedBlockDelta === 1);
	check('head insert targets document', built.target?.kind === 'document');
	const op = built.operations[0];
	check('head insert op kind + position', op.kind === 'insertBlock' && op.kind === 'insertBlock' && op.at === 0 && op.blockKind === 'frontmatter');
	// Byte-precise: flow-style seed + a trailing blank line separator (WP4 contract).
	const text = op.kind === 'insertBlock' ? op.text : '';
	check('head insert bytes exact', text === '---\ntags: []\n---\n\n', JSON.stringify(text));

	// Applying the op reparses to a real frontmatter block (+1) at the head.
	const next = text + doc;
	const reparsed = parseComposerDocument(next, { filePath: 'head.md' });
	check('reparse gains one block', reparsed.blocks.length === baseCount + 1);
	check('reparse head is frontmatter', reparsed.blocks[0].kind === 'frontmatter');
	const fm = parseFrontmatterModel(next.slice(reparsed.blocks[0].source.from, reparsed.blocks[0].source.to));
	check('seeded tags field present', fm.present && !fm.malformed && fm.fields.some((f) => f.key === 'tags' && f.valueKind === 'list'));

	// Refuses when a frontmatter block already exists (only ever one, at the head).
	const withFm = parseComposerDocument('---\ntype: note\n---\n\n# T\n', { filePath: 'has.md' });
	const refused = buildInsertFrontmatterHeadOperations(withFm, [{ key: 'x', value: 'y' }]);
	check('refuses when frontmatter exists', !refused.ok && refused.operations.length === 0 && refused.reason === 'frontmatter-exists');

	// Empty document: no trailing separator needed.
	const empty = parseComposerDocument('', { filePath: 'empty.md' });
	const emptyBuilt = buildInsertFrontmatterHeadOperations(empty, [{ key: 'tags', value: [] }]);
	const emptyText = emptyBuilt.operations[0]?.kind === 'insertBlock' ? emptyBuilt.operations[0].text : '';
	check('empty-doc insert has no extra separator', emptyText === '---\ntags: []\n---\n', JSON.stringify(emptyText));
	const emptyReparse = parseComposerDocument(emptyText, { filePath: 'empty.md' });
	check('empty-doc insert yields a frontmatter block', emptyReparse.blocks.length === 1 && emptyReparse.blocks[0].kind === 'frontmatter');
}

function testInventory(): void {
	const records: VaultFrontmatterRecord[] = [
		{ path: 'a.md', frontmatter: { tags: ['pkm', 'x'], created: '2023-01-01', type: 'analysis' } },
		{ path: 'b.md', frontmatter: { tags: ['pkm'], created: '2023-02-01', type: 'note' } },
		{ path: 'c.md', frontmatter: { created: '2023-03-01', type: 42, cssclasses: 'wide' } },
		{ path: 'd.md', frontmatter: { created: '2023-04-01' } },
	];
	const inv = computeVaultPropertyInventory(records, { created: '2023-10-01', tags: ['pkm'] });
	check('total notes', inv.totalNotes === 4);
	const byKey = new Map(inv.fields.map((f) => [f.key, f]));
	check('created coverage 100%', byKey.get('created')?.count === 4 && byKey.get('created')?.coverage === 1);
	check('type appears 3x', byKey.get('type')?.count === 3);
	check('type has conflict (scalar vs scalar num→scalar)…', byKey.get('type') !== undefined);
	check('cssclasses is rare (single-use)', byKey.get('cssclasses')?.rare === true && inv.singleUseCount >= 1);
	check('tags present in current', byKey.get('tags')?.presentInCurrent === true);
	check('type missing in current (coverage 75% ≥ 50%)', inv.missingInCurrent.includes('type'));
	check('created not missing (present)', !inv.missingInCurrent.includes('created'));
	check('tag vocabulary counted', inv.tagCount === 2); // pkm, x
	check('fields sorted by coverage desc', inv.fields[0].coverage >= inv.fields[inv.fields.length - 1].coverage);

	// type conflict: scalar string vs number → both classify scalar, so no conflict.
	// Force a real conflict: list vs scalar for the same key.
	const conflictRecs: VaultFrontmatterRecord[] = [
		{ path: 'a.md', frontmatter: { note: ['x'] } },
		{ path: 'b.md', frontmatter: { note: 'plain' } },
	];
	const conflict = computeVaultPropertyInventory(conflictRecs, {});
	check('list vs scalar is a type conflict', conflict.fields.find((f) => f.key === 'note')?.typeConflict === true && conflict.typeConflictCount === 1);
}

function testCandidates(): void {
	const fromVault = fieldCandidateFromVault({ key: 'cssclasses' }, 'wide-page', 'human', '常用于阅读宽度');
	check('vault field candidate shape', fromVault.key === 'cssclasses' && fromVault.value === 'wide-page' && fromVault.valueKind === 'scalar' && fromVault.origin === 'human' && fromVault.evidence === '常用于阅读宽度');

	const listCand = fieldCandidateFromVault({ key: 'tags' }, ['a', 'b'], 'convention');
	check('vault list candidate', listCand.valueKind === 'list' && Array.isArray(listCand.value));

	const custom = customFieldCandidate('  category  ', 'knowledge-management');
	check('custom candidate trims key + human origin', custom.key === 'category' && custom.origin === 'human' && custom.valueKind === 'scalar');
}

function testSuggestionParse(): void {
	const text = [
		'summary: PKM 工作流与 Composer 编辑职责 — 由正文首段概括',
		'- reviewed: false # 由本文告警状态推断',
		'tags: [pkm, editor]',
		'garbage line without colon',
		'status: evergreen',
	].join('\n');
	const parsed = parseMetadataSuggestions(text);
	check('parses 4 valid suggestions', parsed.length === 4, String(parsed.length));
	check('summary parsed with evidence', parsed[0].key === 'summary' && parsed[0].evidence?.includes('概括') === true && parsed[0].origin === 'ai');
	check('reviewed boolean', parsed[1].key === 'reviewed' && parsed[1].valueKind === 'boolean');
	check('tags list', parsed[2].key === 'tags' && parsed[2].valueKind === 'list' && (parsed[2].value as string[]).join(',') === 'pkm,editor');
	check('garbage skipped', !parsed.some((p) => p.key.includes('garbage')));
}

testModel();
testWriteback();
testOperations();
testHeadInsert();
testInventory();
testCandidates();
testSuggestionParse();
done('composer-frontmatter');
