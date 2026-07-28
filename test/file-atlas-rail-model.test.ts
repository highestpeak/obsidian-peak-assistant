import assert from 'assert';
import type { OpenDocMeta } from '@/ui/view/file-atlas/FileAtlasHostPort';
import { buildFileRailSections } from '@/ui/view/file-atlas/fileRailModel';

function doc(
	path: string,
	options: Partial<OpenDocMeta> = {},
): OpenDocMeta {
	return {
		path,
		title: path.replace(/\.md$/, ''),
		open: false,
		active: false,
		lastViewedAt: 0,
		viewCount: 0,
		...options,
	};
}

const now = 1_000_000;

{
	const sections = buildFileRailSections({
		openDocs: [
			doc('A.md', { open: true, lastViewedAt: 900 }),
			doc('B.md', { open: true, active: true, lastViewedAt: 1_000 }),
		],
		historyDocs: [
			doc('A.md', { lastViewedAt: 800, viewCount: 8 }),
			doc('C.md', { lastViewedAt: 700, viewCount: 4 }),
			doc('D.md', { lastViewedAt: 600, viewCount: 2 }),
		],
		capacity: 3,
		sortMode: 'frequent',
		now,
		frequencyHalfLifeDays: 30,
	});
	assert.deepStrictEqual(sections.open.map((item) => item.path), ['A.md', 'B.md']);
	assert.deepStrictEqual(sections.recent.map((item) => item.path), ['C.md']);
	assert.strictEqual(
		sections.open.find((item) => item.path === 'A.md')?.viewCount,
		8,
		'history metrics enrich open rows',
	);
}

{
	const sections = buildFileRailSections({
		openDocs: [
			doc('A.md', { open: true }),
			doc('B.md', { open: true }),
			doc('C.md', { open: true }),
		],
		historyDocs: [doc('D.md', { lastViewedAt: 900 })],
		capacity: 2,
		sortMode: 'name',
		now,
		frequencyHalfLifeDays: 30,
	});
	assert.strictEqual(sections.open.length, 3, 'open files are never evicted by capacity');
	assert.strictEqual(sections.recent.length, 0, 'open overflow consumes every recent slot');
}

{
	const sections = buildFileRailSections({
		openDocs: [],
		historyDocs: [
			doc('OldFavorite.md', { lastViewedAt: now - 60 * 24 * 60 * 60 * 1000, viewCount: 100 }),
			doc('Current.md', { lastViewedAt: now, viewCount: 30 }),
		],
		capacity: 5,
		sortMode: 'frequent',
		now,
		frequencyHalfLifeDays: 30,
	});
	assert.deepStrictEqual(
		sections.recent.map((item) => item.path),
		['Current.md', 'OldFavorite.md'],
		'frequency is recency weighted rather than lifetime-only',
	);
}

{
	const sections = buildFileRailSections({
		openDocs: [doc('zeta.md', { open: true }), doc('Alpha.md', { open: true })],
		historyDocs: [doc('beta.md'), doc('Alpha.md', { lastViewedAt: 100 })],
		capacity: 5,
		sortMode: 'name',
		now,
		frequencyHalfLifeDays: 30,
	});
	assert.deepStrictEqual(sections.open.map((item) => item.path), ['Alpha.md', 'zeta.md']);
	assert.deepStrictEqual(sections.recent.map((item) => item.path), ['beta.md']);
}

console.log('PASS: File Atlas rail aggregation, capacity, and sorting');
