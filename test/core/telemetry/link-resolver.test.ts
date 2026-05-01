import {
    extractWikiLinks,
    buildLinkIndex,
    resolveLink,
    listBacklinks,
} from '@/core/telemetry/fs-vault-mcp/link-resolver';
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

// Test 1: extract wiki links from text
{
    const text = `See [[profile-registry]] and [[subprocess-ipc|IPC layer]].`;
    const links = extractWikiLinks(text);
    assert(links.length === 2, 'two wiki links extracted');
    assert(links[0].target === 'profile-registry', 'first target extracted');
    assert(links[1].target === 'subprocess-ipc', 'pipe-aliased target extracted');
    assert(links[1].alias === 'IPC layer', 'alias preserved');
}

// Test 2: extract wiki links ignores escaped brackets
{
    const text = `Normal [[link-a]] but not \\[[escaped-b]].`;
    const links = extractWikiLinks(text);
    assert(links.length === 1, 'escaped link ignored');
    assert(links[0].target === 'link-a', 'normal link kept');
}

// Test 3: build link index over the whole fixture vault
{
    const index = buildLinkIndex(FIXTURE_ROOT);
    assert(index.forwardLinks.size > 0, 'forward link map non-empty');
    assert(index.backLinks.size > 0, 'back link map non-empty');
}

// Test 4: resolve a link by target name (first file whose basename matches)
{
    const index = buildLinkIndex(FIXTURE_ROOT);
    const target = resolveLink(index, 'profile-registry');
    assert(target === 'refactor/profile-registry.md', 'link resolved to full path');
}

// Test 5: unresolved link returns null
{
    const index = buildLinkIndex(FIXTURE_ROOT);
    const target = resolveLink(index, 'does-not-exist-anywhere');
    assert(target === null, 'missing link returns null');
}

// Test 6: backlinks of the hub file include every spoke
{
    const index = buildLinkIndex(FIXTURE_ROOT);
    const backlinks = listBacklinks(index, 'refactor/provider-v2-overview.md');
    assert(backlinks.length >= 5, `hub has >=5 backlinks (got ${backlinks.length})`);
    assert(backlinks.includes('refactor/profile-registry.md'), 'profile-registry backlinks to hub');
    assert(backlinks.includes('refactor/subprocess-ipc.md'), 'subprocess-ipc backlinks to hub');
}
