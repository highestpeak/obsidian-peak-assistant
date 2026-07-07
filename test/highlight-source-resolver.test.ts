import {
  HighlightSourceResolver,
  MemoryVaultTextCache,
  type VaultTextReader,
} from '../src/service/search/query/highlight-source-resolver';
import type { SearchResultItem } from '../src/core/search/searchTypes';

function assert(condition: boolean, msg: string) {
  if (!condition) { console.error('FAIL:', msg); process.exit(1); }
}

type ChunkRow = {
  chunk_id: string;
  doc_id: string;
  chunk_type: string;
  title: string | null;
  content_raw: string;
  mtime: number | null;
};

class FakeDocChunkRepo {
  constructor(
    private readonly rows: ChunkRow[],
    private readonly indexRows: Array<{ chunk_id: string; doc_id: string; chunk_index: number }> = [],
    private readonly countByDoc: Map<string, number> = new Map(),
  ) {}
  async getByChunkIds(ids: string[]): Promise<ChunkRow[]> {
    const set = new Set(ids);
    return this.rows.filter(r => set.has(r.chunk_id));
  }
  async getChunkIndexByChunkIds(ids: string[]): Promise<Map<string, { docId: string; chunkIndex: number }>> {
    const set = new Set(ids);
    const out = new Map();
    for (const r of this.indexRows) {
      if (set.has(r.chunk_id)) out.set(r.chunk_id, { docId: r.doc_id, chunkIndex: r.chunk_index });
    }
    return out;
  }
  async countChunksByDocIds(ids: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    for (const id of ids) {
      const cnt = this.countByDoc.get(id);
      if (cnt !== undefined) out.set(id, cnt);
    }
    return out;
  }
}

function item(partial: Partial<SearchResultItem> & { id: string; path: string }): SearchResultItem {
  return {
    id: partial.id,
    path: partial.path,
    type: (partial.type ?? 'markdown') as SearchResultItem['type'],
    title: partial.title ?? partial.path,
    lastModified: partial.lastModified ?? 0,
    content: partial.content ?? '',
    contentRaw: partial.contentRaw,
    docId: partial.docId,
    chunkId: partial.chunkId,
    matchType: partial.matchType,
  };
}

async function run() {
  // ---------------------------------------------------------------------------
  // Case 1: Vault-first for markdown — even if content_raw exists, resolver
  // prefers the current file on disk. This kills the "stale chunk_raw" problem
  // and drops the storage duplicate.
  // ---------------------------------------------------------------------------
  const vaultReader1: VaultTextReader = {
    async readText(path) {
      if (path === 'note.md') return '这是当前 Vault 文件里的原文，表格编辑协议改造。';
      return null;
    },
  };
  const repo1 = new FakeDocChunkRepo(
    [
      { chunk_id: 'c1', doc_id: 'd1', chunk_type: 'body', title: null, content_raw: '过时的 chunk 文本', mtime: 0 },
    ],
    [{ chunk_id: 'c1', doc_id: 'd1', chunk_index: 0 }],
    new Map([['d1', 1]]),
  );
  const resolver1 = new HighlightSourceResolver(repo1 as any, vaultReader1, null);
  const items1: SearchResultItem[] = [
    item({ id: 'a', path: 'note.md', type: 'markdown', chunkId: 'c1', docId: 'd1', content: '表 格 编 辑', matchType: 'exact' }),
  ];
  const r1 = (await resolver1.resolveMany(items1)).get('a')!;
  assert(r1.kind === 'vault_raw', `Case 1 kind should be vault_raw, got ${r1.kind}`);
  assert(r1.text.includes('当前 Vault 文件'), 'Case 1 must use Vault text, not stale chunk_raw');
  assert(r1.hintOffset !== undefined, 'Case 1 must produce hintOffset when chunk index is known');

  // ---------------------------------------------------------------------------
  // Case 2: hintOffset scales chunk_index / total * fileLength.
  // ---------------------------------------------------------------------------
  const bigText = 'A'.repeat(1000);
  const vaultReader2: VaultTextReader = { async readText() { return bigText; } };
  const repo2 = new FakeDocChunkRepo(
    [],
    [
      { chunk_id: 'c0', doc_id: 'd2', chunk_index: 0 },
      { chunk_id: 'c3', doc_id: 'd2', chunk_index: 3 },
    ],
    new Map([['d2', 4]]),
  );
  const resolver2 = new HighlightSourceResolver(repo2 as any, vaultReader2, null);
  const items2: SearchResultItem[] = [
    item({ id: 'first', path: 'a.md', type: 'markdown', chunkId: 'c0', docId: 'd2' }),
    item({ id: 'last', path: 'a.md', type: 'markdown', chunkId: 'c3', docId: 'd2' }),
  ];
  const r2 = await resolver2.resolveMany(items2);
  assert(r2.get('first')!.hintOffset === 0, `first chunk hint should be 0, got ${r2.get('first')!.hintOffset}`);
  assert(r2.get('last')!.hintOffset === 750, `last chunk (3/4 * 1000) should be 750, got ${r2.get('last')!.hintOffset}`);

  // ---------------------------------------------------------------------------
  // Case 3: Binary type (PDF) still uses content_raw (indexed extracted text
  // is the single source of truth — no re-parse at query time).
  // ---------------------------------------------------------------------------
  const repo3 = new FakeDocChunkRepo(
    [{ chunk_id: 'cx', doc_id: 'dpdf', chunk_type: 'body', title: null, content_raw: '提取自 PDF 的文本片段。', mtime: 0 }],
    [{ chunk_id: 'cx', doc_id: 'dpdf', chunk_index: 0 }],
    new Map([['dpdf', 1]]),
  );
  const resolver3 = new HighlightSourceResolver(
    repo3 as any,
    { async readText() { throw new Error('should not read Vault for PDF'); } },
    null,
  );
  const items3: SearchResultItem[] = [
    item({ id: 'p', path: 'doc.pdf', type: 'pdf', chunkId: 'cx', docId: 'dpdf', matchType: 'exact' }),
  ];
  const r3 = (await resolver3.resolveMany(items3)).get('p')!;
  assert(r3.kind === 'chunk_raw', `Case 3 kind should be chunk_raw, got ${r3.kind}`);
  assert(r3.text.includes('提取自 PDF'), 'Case 3 must use content_raw for binary');

  // ---------------------------------------------------------------------------
  // Case 4: Vault read timeout — slow reader is bounded; resolver falls back.
  // ---------------------------------------------------------------------------
  const slowReader: VaultTextReader = {
    async readText() {
      await new Promise(res => setTimeout(res, 200));
      return 'too late';
    },
  };
  const repo4 = new FakeDocChunkRepo(
    [{ chunk_id: 'ct', doc_id: 'dt', chunk_type: 'body', title: null, content_raw: '快速兜底文本', mtime: 0 }],
    [{ chunk_id: 'ct', doc_id: 'dt', chunk_index: 0 }],
    new Map([['dt', 1]]),
  );
  const resolver4 = new HighlightSourceResolver(repo4 as any, slowReader, null, /* timeout ms */ 20);
  const items4: SearchResultItem[] = [
    item({ id: 't', path: 'slow.md', type: 'markdown', chunkId: 'ct', docId: 'dt', matchType: 'exact' }),
  ];
  const r4 = (await resolver4.resolveMany(items4)).get('t')!;
  assert(r4.kind !== 'vault_raw', `Case 4 must NOT be vault_raw, got ${r4.kind}`);
  // Vault-readable + timeout + no content_raw for markdown (we still put one to prove fallback works):
  // resolver should have fallen through to chunk_raw since we did register a row.
  assert(r4.kind === 'chunk_raw', `Case 4 should fall to chunk_raw, got ${r4.kind}`);

  // ---------------------------------------------------------------------------
  // Case 5: Cross-query LRU cache — second query for the same path returns
  // vaultReadMs === 0 (served from cache).
  // ---------------------------------------------------------------------------
  let reads = 0;
  const countingReader: VaultTextReader = {
    async readText() { reads++; return '文件内容'; },
  };
  const cache = new MemoryVaultTextCache(4);
  const resolver5 = new HighlightSourceResolver(
    new FakeDocChunkRepo([], [], new Map()) as any,
    countingReader,
    cache,
  );
  const items5: SearchResultItem[] = [item({ id: 'q1', path: 'cache.md', type: 'markdown' })];
  await resolver5.resolveMany(items5);
  await resolver5.resolveMany([item({ id: 'q2', path: 'cache.md', type: 'markdown' })]);
  assert(reads === 1, `Case 5 reader must be called once across two queries, got ${reads}`);

  // ---------------------------------------------------------------------------
  // Case 6: Meta match — never leaks normalized FTS text to UI.
  // ---------------------------------------------------------------------------
  const resolver6 = new HighlightSourceResolver(
    new FakeDocChunkRepo([], [], new Map()) as any,
    null,
    null,
  );
  const items6: SearchResultItem[] = [
    item({ id: 'm', path: 'notes/foo.md', type: 'markdown', title: 'foo', content: 'f o o', matchType: 'meta' }),
  ];
  const r6 = (await resolver6.resolveMany(items6)).get('m')!;
  assert(r6.kind === 'title_or_path', `Case 6 kind should be title_or_path, got ${r6.kind}`);
  assert(!r6.text.includes('f o o'), 'Case 6 must not fall back to normalized content');

  // ---------------------------------------------------------------------------
  // Case 7: Semantic summary from vector retriever (contentRaw carries
  // summary text) is labeled summary_raw, not misused as normalized.
  // ---------------------------------------------------------------------------
  const resolver7 = new HighlightSourceResolver(
    new FakeDocChunkRepo([], [], new Map()) as any,
    null,
    null,
  );
  const items7: SearchResultItem[] = [
    item({ id: 's', path: 'binary.pdf', type: 'pdf', content: '', contentRaw: '语义摘要片段。', matchType: 'semantic' }),
  ];
  const r7 = (await resolver7.resolveMany(items7)).get('s')!;
  assert(r7.kind === 'summary_raw', `Case 7 kind should be summary_raw, got ${r7.kind}`);

  // ---------------------------------------------------------------------------
  // Case 8: Normalized fallback only when literally nothing else is available.
  // ---------------------------------------------------------------------------
  const resolver8 = new HighlightSourceResolver(
    new FakeDocChunkRepo([], [], new Map()) as any,
    null,
    null,
  );
  const items8: SearchResultItem[] = [
    item({ id: 'z', path: 'binary.pdf', type: 'pdf', content: 'norm content', matchType: 'exact' }),
  ];
  const r8 = (await resolver8.resolveMany(items8)).get('z')!;
  assert(r8.kind === 'normalized_fallback', `Case 8 kind should be normalized_fallback, got ${r8.kind}`);

  // ---------------------------------------------------------------------------
  // Case 9 (regression): retriever forgot to set `type` — SearchResultItem.type
  // ends up 'unknown'. Path-based fallback must still route Vault-first so
  // the user never sees segmented FTS content in markdown snippets. This is
  // the exact bug from the 2026-07-07 live report (query "算法", results
  // showed "算 法 ot 算 法 …" segmented text).
  // ---------------------------------------------------------------------------
  const vaultReader9: VaultTextReader = {
    async readText(path) {
      if (path === 'notes/algo.md') return '算法讨论：这里是原文，没有分词空格。';
      return null;
    },
  };
  const resolver9 = new HighlightSourceResolver(
    new FakeDocChunkRepo([], [{ chunk_id: 'c9', doc_id: 'd9', chunk_index: 0 }], new Map([['d9', 1]])) as any,
    vaultReader9,
    null,
  );
  const items9: SearchResultItem[] = [
    // Simulate the buggy retriever path: type is 'unknown', chunkId set, path
    // is a .md file, content is the segmented FTS text that leaked before.
    item({
      id: 'bug',
      path: 'notes/algo.md',
      type: 'unknown' as any,
      chunkId: 'c9',
      docId: 'd9',
      content: '算 法 讨 论',
      matchType: 'exact',
    }),
  ];
  const r9 = (await resolver9.resolveMany(items9)).get('bug')!;
  assert(r9.kind === 'vault_raw', `Case 9 kind should be vault_raw via path fallback, got ${r9.kind}`);
  assert(!r9.text.includes('算 法'), `Case 9 must not contain segmented CJK, got: ${r9.text.slice(0, 40)}`);
  assert(r9.text.includes('算法讨论'), 'Case 9 must contain unsegmented CJK');

  // ---------------------------------------------------------------------------
  // Case 10: Vault-readable item whose file read failed (timeout / missing)
  // falls to title/path label, NOT to normalized content. This prevents
  // re-leaking segmented text just because a file went missing.
  // ---------------------------------------------------------------------------
  const failReader: VaultTextReader = { async readText() { return null; } };
  const resolver10 = new HighlightSourceResolver(
    new FakeDocChunkRepo([], [], new Map()) as any,
    failReader,
    null,
  );
  const items10: SearchResultItem[] = [
    item({
      id: 'fail',
      path: 'notes/gone.md',
      type: 'markdown',
      title: 'gone',
      content: '算 法 讨 论',
      matchType: 'exact',
    }),
  ];
  const r10 = (await resolver10.resolveMany(items10)).get('fail')!;
  assert(r10.kind === 'title_or_path', `Case 10 kind should be title_or_path, got ${r10.kind}`);
  assert(!r10.text.includes('算 法'), 'Case 10 must not include segmented content');

  console.log('All highlight-source-resolver tests passed');
}

run().catch((e) => { console.error(e); process.exit(1); });
