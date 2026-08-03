/**
 * folder: filter regression — parser recognizes `folder:PATH` but historically
 * no retriever consulted plan.filters[folder]. The reranker's applyFolderFilter
 * closes that gap by running post-hoc across the merged result set. Guards:
 *  - exact-folder + subfolder match
 *  - leading / trailing slash normalization on both filter and path
 *  - case-insensitive
 *  - multiple folders act as OR
 *  - empty / whitespace-only folder value doesn't nuke the result set
 */

import assert from 'assert';
import { Reranker } from '@/service/search/query/reranker';
import type { SearchResultItem } from '@/service/search/types';

function item(path: string): SearchResultItem {
    return {
        id: path,
        path,
        title: path.split('/').pop() ?? path,
        type: 'markdown' as any,
        content: '',
        score: 1,
        lastModified: 0,
        highlight: null,
    };
}

const reranker = new Reranker();
const items = [
    item('kb1-life-notes/D-26/note.md'),
    item('kb1-life-notes/D-26/sub/deep.md'),
    item('kb1-life-notes/OtherFolder/x.md'),
    item('200 Areas/research/paper.md'),
    item('drafts/scratch.md'),
];

// exact folder + subfolder match
const scoped = reranker.applyFolderFilter(items, ['kb1-life-notes/D-26']);
assert.deepStrictEqual(
    scoped.map(i => i.path),
    ['kb1-life-notes/D-26/note.md', 'kb1-life-notes/D-26/sub/deep.md'],
    'folder scope should keep only in-folder + subfolder hits',
);

// trailing slash on filter value shouldn't matter
const trailing = reranker.applyFolderFilter(items, ['kb1-life-notes/D-26/']);
assert.strictEqual(trailing.length, 2, 'trailing slash on filter is normalized');

// leading slash on filter value shouldn't matter
const leading = reranker.applyFolderFilter(items, ['/kb1-life-notes/D-26']);
assert.strictEqual(leading.length, 2, 'leading slash on filter is normalized');

// case-insensitive
const upper = reranker.applyFolderFilter(items, ['KB1-Life-Notes/D-26']);
assert.strictEqual(upper.length, 2, 'folder match is case-insensitive');

// multiple folders as OR
const or = reranker.applyFolderFilter(items, ['drafts', '200 Areas/research']);
assert.deepStrictEqual(
    or.map(i => i.path).sort(),
    ['200 Areas/research/paper.md', 'drafts/scratch.md'].sort(),
    'multiple folders act as OR',
);

// empty folder list is a no-op
const noop = reranker.applyFolderFilter(items, []);
assert.strictEqual(noop.length, items.length, 'empty folder list is no-op');

// whitespace-only / bare slash filter is a no-op (defensive)
const blank = reranker.applyFolderFilter(items, ['/', '']);
assert.strictEqual(blank.length, items.length, 'blank folder filter is no-op');

// non-matching folder → empty result set (not a crash)
const empty = reranker.applyFolderFilter(items, ['nonexistent']);
assert.strictEqual(empty.length, 0, 'non-matching folder yields empty result');

// path that starts with folder-name but isn't a subfolder should not match
// (e.g. `drafts-old/x.md` must not match `folder:drafts`)
const boundary = reranker.applyFolderFilter(
    [...items, item('drafts-old/notes.md')],
    ['drafts'],
);
assert.deepStrictEqual(
    boundary.map(i => i.path),
    ['drafts/scratch.md'],
    'folder match respects folder boundary (drafts/ not drafts-old)',
);

console.log('reranker-folder-filter.test.ts: all assertions passed');
