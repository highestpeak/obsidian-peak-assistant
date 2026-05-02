import assert from 'assert';
import { SessionContextService } from '../src/service/context/SessionContextService';
import type { MobiusOperationRow } from '../src/core/storage/sqlite/repositories/MobiusOperationRepo';
import type { ActivityEntry } from '../src/service/context/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRow(overrides: Partial<MobiusOperationRow> & { id: string }): MobiusOperationRow {
	return {
		operation_type: 'chat_message',
		operation_desc: 'test op',
		created_at: Date.now(),
		related_kind: null,
		related_id: null,
		important_level: null,
		continuous_group_id: null,
		meta_json: null,
		...overrides,
	};
}

function makeActivity(overrides: Partial<ActivityEntry> & { id: string }): ActivityEntry {
	return {
		type: 'chat_message',
		timestamp: Date.now(),
		summary: 'test',
		relatedPaths: [],
		importanceLevel: 0,
		...overrides,
	};
}

// ─── buildWorkingContextFromRows ─────────────────────────────────────────────

console.log('=== buildWorkingContextFromRows ===');

// basic single row
{
	const rows: MobiusOperationRow[] = [
		makeRow({ id: 'r1', operation_type: 'search_query', operation_desc: 'searched something', created_at: 1000 }),
	];
	const ctx = SessionContextService.buildWorkingContextFromRows(rows);
	assert.strictEqual(ctx.recentActivities.length, 1);
	assert.strictEqual(ctx.recentActivities[0].type, 'search_query');
	assert.strictEqual(ctx.recentActivities[0].summary, 'searched something');
	assert.strictEqual(ctx.activeFile, null);
	console.log('PASS: single standalone row');
}

// multiple standalone rows sorted newest-first
{
	const rows: MobiusOperationRow[] = [
		makeRow({ id: 'r1', created_at: 3000 }),
		makeRow({ id: 'r2', created_at: 1000 }),
		makeRow({ id: 'r3', created_at: 2000 }),
	];
	const ctx = SessionContextService.buildWorkingContextFromRows(rows);
	assert.strictEqual(ctx.recentActivities.length, 3);
	assert.strictEqual(ctx.recentActivities[0].timestamp, 3000, 'newest first');
	assert.strictEqual(ctx.recentActivities[2].timestamp, 1000, 'oldest last');
	console.log('PASS: multiple standalone rows sorted newest-first');
}

// continuous group collapsing
{
	const groupId = 'group-aaa';
	const rows: MobiusOperationRow[] = [
		makeRow({
			id: 'g1', operation_type: 'file_open', operation_desc: 'Opened A',
			created_at: 1000, continuous_group_id: groupId,
			meta_json: JSON.stringify({ path: 'research/a.md' }),
		}),
		makeRow({
			id: 'g2', operation_type: 'file_open', operation_desc: 'Opened B',
			created_at: 2000, continuous_group_id: groupId,
			meta_json: JSON.stringify({ path: 'research/b.md' }),
		}),
		makeRow({
			id: 'g3', operation_type: 'file_open', operation_desc: 'Opened C',
			created_at: 3000, continuous_group_id: groupId,
			meta_json: JSON.stringify({ path: 'research/c.md' }),
		}),
	];
	const ctx = SessionContextService.buildWorkingContextFromRows(rows);
	assert.strictEqual(ctx.recentActivities.length, 1, 'group collapsed to 1 entry');
	const entry = ctx.recentActivities[0];
	assert.ok(entry.summary.includes('×3'), `summary should contain ×3, got: "${entry.summary}"`);
	assert.ok(entry.summary.includes('research/'), `summary should mention folder, got: "${entry.summary}"`);
	assert.strictEqual(entry.relatedPaths.length, 3, 'all paths preserved');
	assert.strictEqual(entry.type, 'file_open');
	console.log('PASS: continuous group collapsing');
}

// single-item group keeps original summary
{
	const groupId = 'group-single';
	const rows: MobiusOperationRow[] = [
		makeRow({
			id: 's1', operation_type: 'search_query', operation_desc: 'searched X',
			created_at: 5000, continuous_group_id: groupId,
		}),
	];
	const ctx = SessionContextService.buildWorkingContextFromRows(rows);
	assert.strictEqual(ctx.recentActivities.length, 1);
	assert.strictEqual(ctx.recentActivities[0].summary, 'searched X', 'single-group keeps original desc');
	console.log('PASS: single-item group keeps original summary');
}

// mixed grouped and standalone
{
	const rows: MobiusOperationRow[] = [
		makeRow({ id: 'm1', created_at: 1000 }),
		makeRow({ id: 'm2', created_at: 2000, continuous_group_id: 'grp' }),
		makeRow({ id: 'm3', created_at: 3000, continuous_group_id: 'grp' }),
		makeRow({ id: 'm4', created_at: 4000 }),
	];
	const ctx = SessionContextService.buildWorkingContextFromRows(rows);
	assert.strictEqual(ctx.recentActivities.length, 3, '2 standalone + 1 collapsed group = 3');
	console.log('PASS: mixed grouped and standalone');
}

// relatedPaths extraction from meta_json
{
	const rows: MobiusOperationRow[] = [
		makeRow({
			id: 'p1', created_at: 1000,
			meta_json: JSON.stringify({ vault_rel_path: 'notes/hello.md', paths: ['a.md', 'b.md'] }),
		}),
	];
	const ctx = SessionContextService.buildWorkingContextFromRows(rows);
	const paths = ctx.recentActivities[0].relatedPaths;
	assert.ok(paths.includes('notes/hello.md'), 'extracts vault_rel_path');
	assert.ok(paths.includes('a.md'), 'extracts paths array');
	assert.ok(paths.includes('b.md'), 'extracts paths array');
	console.log('PASS: relatedPaths extraction from meta_json');
}

// legacy ai_analysis type maps to ai_analysis_complete
{
	const rows: MobiusOperationRow[] = [
		makeRow({ id: 'legacy1', operation_type: 'ai_analysis', created_at: 1000 }),
	];
	const ctx = SessionContextService.buildWorkingContextFromRows(rows);
	assert.strictEqual(ctx.recentActivities[0].type, 'ai_analysis_complete');
	console.log('PASS: legacy ai_analysis maps to ai_analysis_complete');
}

// importance level clamping
{
	const rows: MobiusOperationRow[] = [
		makeRow({ id: 'imp0', important_level: null, created_at: 1000 }),
		makeRow({ id: 'imp1', important_level: 1, created_at: 2000 }),
		makeRow({ id: 'imp2', important_level: 5, created_at: 3000 }),
		makeRow({ id: 'imp3', important_level: -1, created_at: 4000 }),
	];
	const ctx = SessionContextService.buildWorkingContextFromRows(rows);
	const byTs = ctx.recentActivities.sort((a, b) => a.timestamp - b.timestamp);
	assert.strictEqual(byTs[0].importanceLevel, 0, 'null → 0');
	assert.strictEqual(byTs[1].importanceLevel, 1, '1 → 1');
	assert.strictEqual(byTs[2].importanceLevel, 2, '5 → 2 (clamped)');
	assert.strictEqual(byTs[3].importanceLevel, 0, '-1 → 0 (clamped)');
	console.log('PASS: importance level clamping');
}

// empty rows
{
	const ctx = SessionContextService.buildWorkingContextFromRows([]);
	assert.strictEqual(ctx.recentActivities.length, 0);
	assert.strictEqual(ctx.activeFile, null);
	assert.ok(ctx.workingTheme.ruleBased.summary.length > 0, 'summary has fallback text');
	console.log('PASS: empty rows');
}

// ─── computeRuleBasedTheme ───────────────────────────────────────────────────

console.log('\n=== computeRuleBasedTheme ===');

// topFolders extraction
{
	const activities: ActivityEntry[] = [
		makeActivity({ id: 'f1', relatedPaths: ['research/paper1.md', 'research/paper2.md'] }),
		makeActivity({ id: 'f2', relatedPaths: ['research/paper3.md'] }),
		makeActivity({ id: 'f3', relatedPaths: ['daily/2026-01-01.md'] }),
	];
	const theme = SessionContextService.computeRuleBasedTheme(activities);
	assert.strictEqual(theme.topFolders[0], 'research', 'most frequent folder first');
	assert.ok(theme.topFolders.includes('daily'), 'daily folder included');
	assert.ok(theme.summary.includes('research'), 'summary mentions top folder');
	console.log('PASS: topFolders extraction');
}

// topKeywords from search_query metadata
{
	const activities: ActivityEntry[] = [
		makeActivity({ id: 'k1', type: 'search_query', metadata: { query: 'semantic zoom' } }),
		makeActivity({ id: 'k2', type: 'search_query', metadata: { query: 'graph layout' } }),
		makeActivity({ id: 'k3', type: 'search_query', metadata: { query: 'semantic zoom' } }),
	];
	const theme = SessionContextService.computeRuleBasedTheme(activities);
	assert.strictEqual(theme.topKeywords[0], 'semantic zoom', 'most frequent keyword first');
	assert.ok(theme.topKeywords.includes('graph layout'));
	assert.ok(theme.summary.includes('semantic zoom'), 'summary mentions top keyword');
	console.log('PASS: topKeywords from search_query metadata');
}

// topTags from file metadata
{
	const activities: ActivityEntry[] = [
		makeActivity({ id: 't1', metadata: { tags: ['graph', 'research'] } }),
		makeActivity({ id: 't2', metadata: { tags: ['graph', 'ui'] } }),
		makeActivity({ id: 't3', metadata: { tags: ['research'] } }),
	];
	const theme = SessionContextService.computeRuleBasedTheme(activities);
	assert.strictEqual(theme.topTags[0], 'graph', 'most frequent tag first');
	assert.strictEqual(theme.topTags[1], 'research', 'second most frequent tag');
	assert.ok(theme.summary.includes('#graph'), 'summary shows tags with #');
	console.log('PASS: topTags from file metadata');
}

// non-search activities don't contribute keywords
{
	const activities: ActivityEntry[] = [
		makeActivity({ id: 'ns1', type: 'chat_message', metadata: { query: 'should be ignored' } }),
	];
	const theme = SessionContextService.computeRuleBasedTheme(activities);
	assert.strictEqual(theme.topKeywords.length, 0, 'non-search query metadata ignored');
	console.log('PASS: non-search activities ignored for keywords');
}

// empty activities
{
	const theme = SessionContextService.computeRuleBasedTheme([]);
	assert.strictEqual(theme.topFolders.length, 0);
	assert.strictEqual(theme.topKeywords.length, 0);
	assert.strictEqual(theme.topTags.length, 0);
	assert.strictEqual(theme.summary, 'No recent activity');
	console.log('PASS: empty activities fallback');
}

// combined theme with all signals
{
	const activities: ActivityEntry[] = [
		makeActivity({ id: 'c1', relatedPaths: ['notes/ideas.md'], metadata: { tags: ['design'] } }),
		makeActivity({ id: 'c2', type: 'search_query', relatedPaths: ['notes/ref.md'], metadata: { query: 'layout algo' } }),
	];
	const theme = SessionContextService.computeRuleBasedTheme(activities);
	assert.ok(theme.topFolders.includes('notes'));
	assert.ok(theme.topTags.includes('design'));
	assert.ok(theme.topKeywords.includes('layout algo'));
	assert.ok(theme.summary.includes('notes'), 'summary has folder');
	assert.ok(theme.summary.includes('#design'), 'summary has tag');
	assert.ok(theme.summary.includes('layout algo'), 'summary has keyword');
	console.log('PASS: combined theme with all signals');
}

// root-level files use "/" as folder
{
	const activities: ActivityEntry[] = [
		makeActivity({ id: 'root1', relatedPaths: ['README.md'] }),
	];
	const theme = SessionContextService.computeRuleBasedTheme(activities);
	assert.strictEqual(theme.topFolders[0], '/', 'root-level file maps to /');
	console.log('PASS: root-level files use "/" as folder');
}

console.log('\nAll session-context-service tests passed!');
