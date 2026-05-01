import {
    readFile,
    listFiles,
    grep,
    readFrontmatter,
} from '@/core/telemetry/fs-vault-mcp/fs-vault-reader';
import * as path from 'node:path';

function assert(cond: boolean, msg: string): void {
    if (!cond) {
        console.error(`FAIL: ${msg}`);
        process.exitCode = 1;
    } else {
        console.log(`PASS: ${msg}`);
    }
}

const FIXTURE_ROOT = path.resolve(process.cwd(), 'test/fixtures/vault/small');

// Test 1: listFiles returns all markdown files as vault-relative paths
{
    const files = listFiles(FIXTURE_ROOT);
    assert(files.length >= 20, `listFiles returns >=20 files (got ${files.length})`);
    assert(files.every((p) => p.endsWith('.md')), 'all returned files end with .md');
    assert(files.every((p) => !path.isAbsolute(p)), 'returned paths are vault-relative');
    assert(files.includes('refactor/provider-v2-overview.md'), 'hub file is listed');
}

// Test 2: listFiles supports simple glob filter
{
    const zhFiles = listFiles(FIXTURE_ROOT, 'multilingual/**/*.md');
    assert(zhFiles.length >= 5, `multilingual files filtered (got ${zhFiles.length})`);
    assert(zhFiles.every((p) => p.startsWith('multilingual/')), 'glob filter scoped correctly');
}

// Test 3: readFile returns file content as string
{
    const content = readFile(FIXTURE_ROOT, 'refactor/provider-v2-overview.md');
    assert(content.includes('Provider V2 Refactor'), 'hub file content returned');
    assert(content.includes('[[profile-registry]]'), 'wiki link preserved');
}

// Test 4: readFile rejects paths escaping the root (path traversal defense)
{
    let threw = false;
    try {
        readFile(FIXTURE_ROOT, '../../../etc/passwd');
    } catch {
        threw = true;
    }
    assert(threw, 'path traversal rejected');
}

// Test 5: grep finds matches across all files
{
    const hits = grep(FIXTURE_ROOT, 'cognitive burden');
    assert(hits.length >= 2, `grep finds multiple hits for "cognitive burden" (got ${hits.length})`);
    assert(hits.some((h) => h.path === 'refactor/provider-v2-overview.md'), 'overview file matched');
    for (const h of hits) {
        assert(typeof h.lineNumber === 'number', 'hit has line number');
        assert(typeof h.line === 'string', 'hit has matched line');
    }
}

// Test 6: grep scoped by optional path prefix
{
    const hits = grep(FIXTURE_ROOT, '重构', 'multilingual');
    assert(hits.length >= 1, `zh-scoped grep works (got ${hits.length})`);
    assert(hits.every((h) => h.path.startsWith('multilingual/')), 'all hits within prefix');
}

// Test 7: readFrontmatter extracts YAML frontmatter as plain object
{
    const fm = readFrontmatter(FIXTURE_ROOT, 'refactor/provider-v2-overview.md');
    assert(Array.isArray(fm?.tags), 'tags is an array');
    assert((fm?.tags as string[]).includes('hub'), 'hub tag present');
}

// Test 8: readFrontmatter returns null when no frontmatter
{
    const fm = readFrontmatter(FIXTURE_ROOT, 'orphans/another-orphan.md');
    assert(fm === null, 'no frontmatter returns null');
}
