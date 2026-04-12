import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listFoldersImpl, readFolderImpl, readNoteImpl } from '@/service/agents/vault-sdk/vaultMcpServer';

// Minimal mock of Obsidian's Vault. Only implements getMarkdownFiles().
function mockVaultWithFiles(paths: string[]) {
    const files = paths.map((p) => ({
        path: p,
        extension: 'md',
        basename: p.split('/').pop()?.replace('.md', '') ?? '',
    }));
    return {
        getMarkdownFiles: () => files,
    };
}

test('listFoldersImpl: top-level enumeration with counts', async () => {
    const vault = mockVaultWithFiles([
        'kb1-life-notes/note1.md',
        'kb1-life-notes/sub/note2.md',
        'kb2-learn-prd/a.md',
        'kb2-learn-prd/B/b.md',
        'kb2-learn-prd/B/C/c.md',
        'chatfolder/d.md',
    ]);

    const result = await listFoldersImpl(vault as unknown as Parameters<typeof listFoldersImpl>[0], { maxDepth: 1 });

    // Should have 3 top-level folders
    assert.equal(result.folders.length, 3);
    const kb1 = result.folders.find((f) => f.path === 'kb1-life-notes');
    assert.ok(kb1, 'kb1-life-notes folder should be found');
    assert.equal(kb1!.mdCount, 2); // note1.md + sub/note2.md
    const kb2 = result.folders.find((f) => f.path === 'kb2-learn-prd');
    assert.ok(kb2, 'kb2-learn-prd folder should be found');
    assert.equal(kb2!.mdCount, 3);
    assert.equal(result.totalMdFiles, 6);
});

test('listFoldersImpl: depth-2 enumeration reveals subfolders', async () => {
    const vault = mockVaultWithFiles([
        'kb2/A-sub/a.md',
        'kb2/A-sub/b.md',
        'kb2/B-sub/c.md',
    ]);

    const result = await listFoldersImpl(vault as unknown as Parameters<typeof listFoldersImpl>[0], { maxDepth: 2 });

    // Should include "kb2", "kb2/A-sub", "kb2/B-sub"
    const paths = result.folders.map((f) => f.path).sort();
    assert.deepEqual(paths, ['kb2', 'kb2/A-sub', 'kb2/B-sub']);

    // kb2 counts all 3, A-sub counts 2, B-sub counts 1
    assert.equal(result.folders.find((f) => f.path === 'kb2')!.mdCount, 3);
    assert.equal(result.folders.find((f) => f.path === 'kb2/A-sub')!.mdCount, 2);
    assert.equal(result.folders.find((f) => f.path === 'kb2/B-sub')!.mdCount, 1);
});

test('listFoldersImpl: empty vault returns empty folders', async () => {
    const vault = mockVaultWithFiles([]);
    const result = await listFoldersImpl(vault as unknown as Parameters<typeof listFoldersImpl>[0], { maxDepth: 2 });
    assert.equal(result.folders.length, 0);
    assert.equal(result.totalMdFiles, 0);
});

test('listFoldersImpl: CJK paths preserved without corruption', async () => {
    const vault = mockVaultWithFiles([
        'kb2-learn-prd/B-2-创意和想法管理/A-All Ideas/idea1.md',
        'kb2-learn-prd/B-2-创意和想法管理/A-All Ideas/idea2.md',
        'kb2-learn-prd/B-2-创意和想法管理/other.md',
    ]);
    const result = await listFoldersImpl(vault as unknown as Parameters<typeof listFoldersImpl>[0], { maxDepth: 3 });

    // The deepest folder should appear with correct CJK encoding
    const ideas = result.folders.find((f) => f.path === 'kb2-learn-prd/B-2-创意和想法管理/A-All Ideas');
    assert.ok(ideas, 'CJK-path folder should be found');
    assert.equal(ideas!.mdCount, 2);

    // Verify NO U+FFFD corruption
    for (const f of result.folders) {
        assert.ok(!f.path.includes('\uFFFD'), `path should not contain U+FFFD: ${f.path}`);
    }
});

test('listFoldersImpl: results sorted by mdCount descending', async () => {
    const vault = mockVaultWithFiles([
        'small/a.md',
        'big/a.md',
        'big/b.md',
        'big/c.md',
        'medium/a.md',
        'medium/b.md',
    ]);
    const result = await listFoldersImpl(vault as unknown as Parameters<typeof listFoldersImpl>[0], { maxDepth: 1 });
    assert.equal(result.folders[0].path, 'big');
    assert.equal(result.folders[0].mdCount, 3);
    assert.equal(result.folders[1].path, 'medium');
    assert.equal(result.folders[1].mdCount, 2);
    assert.equal(result.folders[2].path, 'small');
    assert.equal(result.folders[2].mdCount, 1);
});

test('readFolderImpl: recursive lists all files under a folder prefix', async () => {
    const files = [
        'kb2/A-sub/a.md',
        'kb2/A-sub/b.md',
        'kb2/B-sub/c.md',
        'other/d.md',
    ];
    const vault = {
        getMarkdownFiles: () =>
            files.map((p) => ({
                path: p,
                basename: p.split('/').pop()?.replace('.md', '') ?? '',
                extension: 'md',
            })),
    };

    const result = await readFolderImpl(
        vault as unknown as Parameters<typeof readFolderImpl>[0],
        { folder: 'kb2/A-sub', recursive: true }
    );
    assert.equal(result.files.length, 2);
    assert.deepEqual(
        result.files.map((f) => f.path).sort(),
        ['kb2/A-sub/a.md', 'kb2/A-sub/b.md']
    );
});

test('readFolderImpl: non-recursive returns only immediate children', async () => {
    const files = [
        'kb2/a.md',
        'kb2/A-sub/b.md',
        'kb2/A-sub/deeper/c.md',
    ];
    const vault = {
        getMarkdownFiles: () =>
            files.map((p) => ({
                path: p,
                basename: p.split('/').pop()?.replace('.md', '') ?? '',
                extension: 'md',
            })),
    };

    const result = await readFolderImpl(
        vault as unknown as Parameters<typeof readFolderImpl>[0],
        { folder: 'kb2', recursive: false }
    );
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].path, 'kb2/a.md');
});

test('readNoteImpl: returns frontmatter + body preview + wikilinks', async () => {
    const fileObj = { path: 'test/note.md', basename: 'note', extension: 'md' };
    const vault = {
        getAbstractFileByPath: (path: string) => (path === 'test/note.md' ? fileObj : null),
        cachedRead: async () => `---
status: idea
tags: [research]
---

# Note Title

This is the body. It has [[internal-link]] and more text.`,
    };
    const metadataCache = {
        getFileCache: () => ({
            frontmatter: { status: 'idea', tags: ['research'] },
            links: [{ link: 'internal-link', displayText: 'internal-link' }],
            tags: [],
        }),
    };

    const result = await readNoteImpl(
        vault as unknown as Parameters<typeof readNoteImpl>[0],
        metadataCache as unknown as Parameters<typeof readNoteImpl>[1],
        { path: 'test/note.md', maxChars: 200 }
    );
    assert.equal(result.path, 'test/note.md');
    assert.equal((result.frontmatter as { status: string }).status, 'idea');
    assert.ok(result.bodyPreview.includes('This is the body'));
    assert.deepEqual(result.wikilinks, ['internal-link']);
    assert.equal(result.error, undefined);
});

test('readNoteImpl: missing file returns error', async () => {
    const vault = {
        getAbstractFileByPath: () => null,
        cachedRead: async () => '',
    };
    const metadataCache = { getFileCache: () => null };

    const result = await readNoteImpl(
        vault as unknown as Parameters<typeof readNoteImpl>[0],
        metadataCache as unknown as Parameters<typeof readNoteImpl>[1],
        { path: 'not/exist.md' }
    );
    assert.equal(result.error, 'not found');
    assert.equal(result.bodyPreview, '');
    assert.deepEqual(result.wikilinks, []);
});
