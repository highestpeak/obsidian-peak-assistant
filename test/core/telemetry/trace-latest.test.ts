import { findLatestTrace } from '../../../scripts/trace-latest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

function assert(cond: boolean, msg: string): void {
    if (!cond) {
        console.error(`FAIL: ${msg}`);
        process.exitCode = 1;
    } else {
        console.log(`PASS: ${msg}`);
    }
}

function touch(filePath: string, mtimeMs: number): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{}\n', 'utf8');
    fs.utimesSync(filePath, mtimeMs / 1000, mtimeMs / 1000);
}

// Test 1: picks newest meta file across date dirs
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracelatest-'));
    touch(path.join(dir, '2026-04-10', 'a.meta.jsonl'), 1_000_000);
    touch(path.join(dir, '2026-04-11', 'b.meta.jsonl'), 2_000_000);
    touch(path.join(dir, '2026-04-12', 'c.meta.jsonl'), 3_000_000);
    const latest = findLatestTrace(dir);
    assert(latest?.endsWith('c.meta.jsonl') === true, `newest picked (got ${latest})`);
}

// Test 2: filter by substring returns the newest matching
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracelatest-'));
    touch(path.join(dir, '2026-04-10', 'vault-search-hub.meta.jsonl'), 1_000_000);
    touch(path.join(dir, '2026-04-11', 'vault-search-direct.meta.jsonl'), 2_000_000);
    touch(path.join(dir, '2026-04-12', 'chat.meta.jsonl'), 3_000_000);
    const latest = findLatestTrace(dir, 'vault-search');
    assert(
        latest?.endsWith('vault-search-direct.meta.jsonl') === true,
        `newest matching filter (got ${latest})`,
    );
}

// Test 3: no files returns null
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracelatest-'));
    const latest = findLatestTrace(dir);
    assert(latest === null, 'no traces returns null');
}

// Test 4: ignores non-meta files
{
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracelatest-'));
    touch(path.join(dir, '2026-04-12', 'a.full.jsonl'), 3_000_000);
    touch(path.join(dir, '2026-04-11', 'b.meta.jsonl'), 2_000_000);
    const latest = findLatestTrace(dir);
    assert(latest?.endsWith('b.meta.jsonl') === true, 'full.jsonl not picked');
}
