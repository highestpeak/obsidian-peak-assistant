import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fillVaultContext } from '@/service/context/ContextProvider';
import type { FillParams } from '@/service/context/ContextProvider';
import type { TFile, CachedMetadata } from 'obsidian';

// ---------------------------------------------------------------------------
// Helpers to build mock objects
// ---------------------------------------------------------------------------

function mockFile(overrides: {
	basename: string;
	path: string;
	parentPath?: string;
	ctime?: number;
}): TFile {
	return {
		basename: overrides.basename,
		path: overrides.path,
		extension: 'md',
		parent: overrides.parentPath !== undefined ? { path: overrides.parentPath } : undefined,
		stat: overrides.ctime !== undefined ? { ctime: overrides.ctime, mtime: overrides.ctime, size: 0 } : undefined,
	} as unknown as TFile;
}

function mockMetadata(overrides: {
	frontmatter?: Record<string, unknown>;
	headings?: Array<{ heading: string; level: number }>;
	links?: Array<{ link: string }>;
}): CachedMetadata {
	return overrides as unknown as CachedMetadata;
}

// ---------------------------------------------------------------------------
// Tests: fillVaultContext with full mock data
// ---------------------------------------------------------------------------

test('fillVaultContext: all fields populated with full data', () => {
	const now = Date.now();
	const ctimeMs = now - 3 * 24 * 60 * 60 * 1000; // 3 days ago

	const file = mockFile({
		basename: 'MyNote',
		path: 'folder/subfolder/MyNote.md',
		parentPath: 'folder/subfolder',
		ctime: ctimeMs,
	});

	const meta = mockMetadata({
		frontmatter: {
			tags: ['ai', 'research'],
			type: 'article',
			author: 'Alice',
			position: { start: { line: 0 }, end: { line: 5 } }, // should be excluded
		},
		headings: [
			{ heading: 'Introduction', level: 1 },
			{ heading: 'Background', level: 2 },
			{ heading: 'Method', level: 2 },
			{ heading: 'Section4', level: 3 }, // H3 should not appear in keywords
		],
		links: [
			{ link: 'NoteA' },
			{ link: 'NoteB' },
		],
	});

	const params: FillParams = {
		activeFile: file,
		metadata: meta,
		backlinks: ['other/Ref.md', 'other/Ref2.md'],
		recentFiles: [
			'folder/subfolder/MyNote.md',
			'folder/AnotherNote.md',
			'folder2/NoteC.md',
			'folder2/NoteD.md',
			'folder3/NoteE.md',
			'folder3/NoteF.md', // 6th — should be excluded from recentDocuments (top 5)
		],
		vaultName: 'MyVault',
	};

	const ctx = fillVaultContext(params);

	assert.equal(ctx.vaultName, 'MyVault');
	assert.equal(ctx.activeDocumentTitle, 'MyNote');
	assert.equal(ctx.activeDocumentPath, 'folder/subfolder/MyNote.md');
	assert.equal(ctx.currentFolder, 'folder/subfolder');

	// tags as array
	assert.equal(ctx.documentTags, 'ai, research');

	// keywords: title + H1 + H2, deduped, top 5
	// candidates: ['MyNote', 'Introduction', 'Background', 'Method'] — 4 items, all kept
	const keywords = ctx.documentKeywords?.split(', ') ?? [];
	assert.ok(keywords.includes('MyNote'), 'keywords should include title');
	assert.ok(keywords.includes('Introduction'), 'keywords should include H1');
	assert.ok(keywords.includes('Background'), 'keywords should include H2');
	assert.ok(!keywords.includes('Section4'), 'H3 should NOT be in keywords');
	assert.ok(keywords.length <= 5, 'at most 5 keywords');

	assert.equal(ctx.firstHeading, 'Introduction');

	// frontmatter props: exclude tags + position
	assert.ok(ctx.frontmatterProperties?.includes('type: article'), 'should include type');
	assert.ok(ctx.frontmatterProperties?.includes('author: Alice'), 'should include author');
	assert.ok(!ctx.frontmatterProperties?.includes('tags'), 'should exclude tags key');
	assert.ok(!ctx.frontmatterProperties?.includes('position'), 'should exclude position key');

	assert.equal(ctx.documentType, 'article');
	assert.equal(ctx.outgoingLinks, 'NoteA, NoteB');
	assert.equal(ctx.backlinks, 'other/Ref.md, other/Ref2.md');
	assert.equal(ctx.linkContext, null);

	// recentDocuments: top 5 of the 6 provided
	const recentDocs = ctx.recentDocuments?.split(', ') ?? [];
	assert.equal(recentDocs.length, 5);
	assert.ok(recentDocs.includes('folder/subfolder/MyNote.md'));
	assert.ok(!recentDocs.includes('folder3/NoteF.md'), '6th file should be excluded');

	// recentFolders: deduplicated folders, top 5
	const recentFolders = ctx.recentFolders?.split(', ') ?? [];
	assert.ok(recentFolders.length <= 5);
	assert.ok(recentFolders.includes('folder/subfolder'));
	assert.ok(recentFolders.includes('folder'));
	assert.ok(recentFolders.includes('folder2'));

	// documentAge: 3 days
	assert.equal(ctx.documentAge, '3');
});

// ---------------------------------------------------------------------------
// Tests: null activeFile → minimal context
// ---------------------------------------------------------------------------

test('fillVaultContext: null activeFile returns minimal context', () => {
	const params: FillParams = {
		activeFile: null,
		metadata: null,
		backlinks: [],
		recentFiles: ['notes/A.md', 'notes/B.md'],
		vaultName: 'TestVault',
	};

	const ctx = fillVaultContext(params);

	assert.equal(ctx.vaultName, 'TestVault');
	assert.equal(ctx.activeDocumentTitle, null);
	assert.equal(ctx.activeDocumentPath, null);
	assert.equal(ctx.currentFolder, null);
	assert.equal(ctx.documentTags, null);
	assert.equal(ctx.documentKeywords, null);
	assert.equal(ctx.firstHeading, null);
	assert.equal(ctx.frontmatterProperties, null);
	assert.equal(ctx.documentType, null);
	assert.equal(ctx.outgoingLinks, null);
	assert.equal(ctx.backlinks, null);
	assert.equal(ctx.linkContext, null);
	assert.equal(ctx.documentAge, null);

	// recentDocuments and recentFolders should still be populated
	assert.equal(ctx.recentDocuments, 'notes/A.md, notes/B.md');
	assert.equal(ctx.recentFolders, 'notes');
});

// ---------------------------------------------------------------------------
// Tests: tags as string (not array)
// ---------------------------------------------------------------------------

test('fillVaultContext: tags as string is handled', () => {
	const file = mockFile({ basename: 'TagNote', path: 'TagNote.md' });
	const meta = mockMetadata({
		frontmatter: { tags: 'singleTag' },
	});

	const ctx = fillVaultContext({
		activeFile: file,
		metadata: meta,
		backlinks: [],
		recentFiles: [],
		vaultName: 'V',
	});

	assert.equal(ctx.documentTags, 'singleTag');
});

// ---------------------------------------------------------------------------
// Tests: empty tags array → null
// ---------------------------------------------------------------------------

test('fillVaultContext: empty tags array → null documentTags', () => {
	const file = mockFile({ basename: 'EmptyTagNote', path: 'EmptyTagNote.md' });
	const meta = mockMetadata({
		frontmatter: { tags: [] },
	});

	const ctx = fillVaultContext({
		activeFile: file,
		metadata: meta,
		backlinks: [],
		recentFiles: [],
		vaultName: 'V',
	});

	assert.equal(ctx.documentTags, null);
});

// ---------------------------------------------------------------------------
// Tests: documentType falls back to category when type is absent
// ---------------------------------------------------------------------------

test('fillVaultContext: documentType falls back to frontmatter.category', () => {
	const file = mockFile({ basename: 'CatNote', path: 'CatNote.md' });
	const meta = mockMetadata({
		frontmatter: { category: 'reference' },
	});

	const ctx = fillVaultContext({
		activeFile: file,
		metadata: meta,
		backlinks: [],
		recentFiles: [],
		vaultName: 'V',
	});

	assert.equal(ctx.documentType, 'reference');
});

// ---------------------------------------------------------------------------
// Tests: duplicate title in headings → deduplicated keywords
// ---------------------------------------------------------------------------

test('fillVaultContext: title duplicated in H1 is deduplicated in keywords', () => {
	const file = mockFile({ basename: 'Intro', path: 'Intro.md' });
	const meta = mockMetadata({
		headings: [
			{ heading: 'Intro', level: 1 }, // same as basename
			{ heading: 'Section A', level: 2 },
		],
	});

	const ctx = fillVaultContext({
		activeFile: file,
		metadata: meta,
		backlinks: [],
		recentFiles: [],
		vaultName: 'V',
	});

	const keywords = ctx.documentKeywords?.split(', ') ?? [];
	// 'Intro' should appear exactly once
	assert.equal(keywords.filter((k) => k === 'Intro').length, 1);
	assert.ok(keywords.includes('Section A'));
});

// ---------------------------------------------------------------------------
// Tests: keywords capped at 5
// ---------------------------------------------------------------------------

test('fillVaultContext: keywords capped at 5 even if more headings exist', () => {
	const file = mockFile({ basename: 'BigDoc', path: 'BigDoc.md' });
	const meta = mockMetadata({
		headings: [
			{ heading: 'H1a', level: 1 },
			{ heading: 'H2a', level: 2 },
			{ heading: 'H2b', level: 2 },
			{ heading: 'H2c', level: 2 },
			{ heading: 'H2d', level: 2 },
			{ heading: 'H2e', level: 2 },
		],
	});

	const ctx = fillVaultContext({
		activeFile: file,
		metadata: meta,
		backlinks: [],
		recentFiles: [],
		vaultName: 'V',
	});

	const keywords = ctx.documentKeywords?.split(', ') ?? [];
	assert.equal(keywords.length, 5);
});

// ---------------------------------------------------------------------------
// Tests: no metadata → fields are null but title/path still populated
// ---------------------------------------------------------------------------

test('fillVaultContext: null metadata → document fields null, title/path present', () => {
	const file = mockFile({
		basename: 'Bare',
		path: 'folder/Bare.md',
		parentPath: 'folder',
	});

	const ctx = fillVaultContext({
		activeFile: file,
		metadata: null,
		backlinks: [],
		recentFiles: [],
		vaultName: 'V',
	});

	assert.equal(ctx.activeDocumentTitle, 'Bare');
	assert.equal(ctx.activeDocumentPath, 'folder/Bare.md');
	assert.equal(ctx.currentFolder, 'folder');
	assert.equal(ctx.documentTags, null);
	assert.equal(ctx.firstHeading, null);
	assert.equal(ctx.outgoingLinks, null);
	// keywords: only title, no headings
	assert.equal(ctx.documentKeywords, 'Bare');
});
