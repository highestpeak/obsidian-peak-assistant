/**
 * D1 review C1 — ArtifactReceiptCard media URI resolver.
 *
 * The card cannot hand a durable vault path to `<img src>`. `resolveArtifactMediaUri`
 * is the pure layer that decides:
 *   • existing scheme (http/https/data/blob/app/file) → pass through
 *   • bare path → treat as vault path, delegate to the injected resolver
 *   • resolver returns null → return undefined (no broken <img>)
 *   • no raw uri on the receipt → undefined
 *
 * This test file exercises the helper in isolation (no React, no
 * VaultPreviewPort) so we can guarantee the discipline without booting the
 * plugin.
 */

import assert from 'assert';
import type { ChatArtifactReceipt } from '@/core/types/chat-studio';
import {
	hasLoadableScheme,
	pickReceiptMediaUri,
	resolveArtifactMediaUri,
	type VaultPathResolver,
} from '@/ui/view/chat-view/components/messages/artifactMediaUri';

function makeReceipt(overrides: Partial<ChatArtifactReceipt>): ChatArtifactReceipt {
	return {
		artifactId: 'art-x',
		runId: 'run-x',
		messageId: 'msg-x',
		conversationId: 'conv-x',
		direction: 'generated',
		kind: 'image',
		title: 'x',
		state: 'saved',
		availableActions: [],
		createdAt: 0,
		...overrides,
	} as ChatArtifactReceipt;
}

// ─── hasLoadableScheme ─────────────────────────────────────────────────────

function testHasLoadableSchemeAcceptsCommonSchemes(): void {
	assert.strictEqual(hasLoadableScheme('http://example.com/x.png'), true);
	assert.strictEqual(hasLoadableScheme('https://example.com/x.png'), true);
	assert.strictEqual(hasLoadableScheme('data:image/png;base64,ABC'), true);
	assert.strictEqual(hasLoadableScheme('blob:https://obsidian.md/xxx'), true);
	assert.strictEqual(hasLoadableScheme('app://obsidian.md/local/foo.png'), true);
	assert.strictEqual(hasLoadableScheme('file:///Users/x/foo.png'), true);
	console.log('PASS: hasLoadableScheme accepts http/https/data/blob/app/file');
}

function testHasLoadableSchemeRejectsBarePaths(): void {
	assert.strictEqual(hasLoadableScheme('ChatFolder/Attachments/media/foo.png'), false);
	assert.strictEqual(hasLoadableScheme('/leading/slash/foo.png'), false);
	assert.strictEqual(hasLoadableScheme('foo.png'), false);
	assert.strictEqual(hasLoadableScheme(''), false);
	console.log('PASS: hasLoadableScheme rejects vault-style bare paths');
}

// ─── pickReceiptMediaUri ────────────────────────────────────────────────────

function testPickReceiptMediaUriPrefersPreview(): void {
	const receipt = makeReceipt({
		preview: { kind: 'image', uri: 'preview://x' },
		externalUri: 'external://x',
		uri: 'legacy://x',
	});
	assert.strictEqual(pickReceiptMediaUri(receipt), 'preview://x');
	console.log('PASS: pickReceiptMediaUri prefers preview.uri when present');
}

function testPickReceiptMediaUriFallsBackToExternalThenLegacy(): void {
	const noPreview = makeReceipt({ externalUri: 'external://y', uri: 'legacy://y' });
	assert.strictEqual(pickReceiptMediaUri(noPreview), 'external://y');
	const legacyOnly = makeReceipt({ uri: 'legacy://z' });
	assert.strictEqual(pickReceiptMediaUri(legacyOnly), 'legacy://z');
	console.log('PASS: pickReceiptMediaUri falls back to externalUri then uri');
}

function testPickReceiptMediaUriReturnsUndefinedWhenNothing(): void {
	const receipt = makeReceipt({});
	assert.strictEqual(pickReceiptMediaUri(receipt), undefined);
	console.log('PASS: pickReceiptMediaUri returns undefined when no reference present');
}

// ─── resolveArtifactMediaUri ────────────────────────────────────────────────

function testResolvePassesThroughHttpsUri(): void {
	const receipt = makeReceipt({
		preview: { kind: 'image', uri: 'https://cdn.example.com/x.png' },
	});
	const resolver: VaultPathResolver = () => 'SHOULD_NOT_BE_CALLED';
	const result = resolveArtifactMediaUri(receipt, resolver);
	assert.strictEqual(result, 'https://cdn.example.com/x.png');
	console.log('PASS: resolveArtifactMediaUri passes https URI through untouched');
}

function testResolvePassesThroughDataUri(): void {
	const receipt = makeReceipt({
		preview: { kind: 'image', uri: 'data:image/png;base64,iVBORw0KGgo=' },
	});
	let resolverCalls = 0;
	const resolver: VaultPathResolver = () => { resolverCalls += 1; return null; };
	const result = resolveArtifactMediaUri(receipt, resolver);
	assert.strictEqual(result, 'data:image/png;base64,iVBORw0KGgo=');
	assert.strictEqual(resolverCalls, 0, 'resolver must NOT be called for scheme URIs');
	console.log('PASS: resolveArtifactMediaUri passes data URI through and skips resolver');
}

function testResolvePassesThroughAppUri(): void {
	// C1 discipline: we don't OWN app:// URIs but we don't want to break
	// receipts that legitimately carry one (e.g. a re-resolved cache).
	const receipt = makeReceipt({
		preview: { kind: 'image', uri: 'app://obsidian.md/local-file/xyz.png' },
	});
	const resolver: VaultPathResolver = () => null;
	const result = resolveArtifactMediaUri(receipt, resolver);
	assert.strictEqual(result, 'app://obsidian.md/local-file/xyz.png');
	console.log('PASS: resolveArtifactMediaUri passes app:// URI through untouched');
}

function testResolveVaultPathDelegatesToResolver(): void {
	const receipt = makeReceipt({
		preview: { kind: 'image', uri: 'ChatFolder/Attachments/media/panda.png' },
	});
	const calls: string[] = [];
	const resolver: VaultPathResolver = (p) => {
		calls.push(p);
		return `app://obsidian.md/local-file/${p}?session=abc`;
	};
	const result = resolveArtifactMediaUri(receipt, resolver);
	assert.strictEqual(calls.length, 1);
	assert.strictEqual(calls[0], 'ChatFolder/Attachments/media/panda.png');
	assert.strictEqual(result, 'app://obsidian.md/local-file/ChatFolder/Attachments/media/panda.png?session=abc');
	console.log('PASS: resolveArtifactMediaUri delegates bare vault path to resolver');
}

function testResolveStripsLeadingSlashBeforeResolver(): void {
	// Obsidian's getAbstractFileByPath does not want the leading slash; the
	// helper normalizes so downstream writers that accidentally include one
	// still resolve.
	const receipt = makeReceipt({
		preview: { kind: 'image', uri: '/ChatFolder/Attachments/media/panda.png' },
	});
	const seen: string[] = [];
	const resolver: VaultPathResolver = (p) => {
		seen.push(p);
		return `app://local/${p}`;
	};
	resolveArtifactMediaUri(receipt, resolver);
	assert.strictEqual(seen[0], 'ChatFolder/Attachments/media/panda.png', 'leading slash stripped');
	console.log('PASS: resolveArtifactMediaUri strips leading slash before delegating');
}

function testResolveReturnsUndefinedWhenResolverFails(): void {
	// C1 fail-loud: if the vault does not know about the path we do NOT
	// synthesize a URL that would give a broken <img> request.
	const receipt = makeReceipt({
		preview: { kind: 'image', uri: 'ChatFolder/Attachments/media/missing.png' },
	});
	const resolver: VaultPathResolver = () => null;
	assert.strictEqual(resolveArtifactMediaUri(receipt, resolver), undefined);
	console.log('PASS: resolveArtifactMediaUri returns undefined when vault resolver returns null');
}

function testResolveReturnsUndefinedWhenReceiptHasNoUri(): void {
	const receipt = makeReceipt({});
	const resolver: VaultPathResolver = () => 'never';
	assert.strictEqual(resolveArtifactMediaUri(receipt, resolver), undefined);
	console.log('PASS: resolveArtifactMediaUri returns undefined when receipt carries no media reference');
}

// ─── discipline check: prove the C1 bug is fixed ─────────────────────────

function testC1RegressionMediaReceiptVaultPathBecomesLoadableUrl(): void {
	// This mirrors what MediaGenerationService.buildReceipt writes today:
	// preview.uri = vault-relative path, NOT a URL. Before C1 this went
	// straight into <img src>. After C1 it must go through the resolver.
	const receipt = makeReceipt({
		state: 'saved',
		vaultPath: 'ChatFolder/Attachments/media/fal-1750000000.png',
		preview: {
			kind: 'image',
			uri: 'ChatFolder/Attachments/media/fal-1750000000.png',
		},
	});
	let observedPath: string | null = null;
	const resolver: VaultPathResolver = (p) => {
		observedPath = p;
		// Simulate what Obsidian would return.
		return `app://obsidian.md/local-file/${p}?token=deadbeef`;
	};
	const result = resolveArtifactMediaUri(receipt, resolver);
	assert.strictEqual(
		observedPath,
		'ChatFolder/Attachments/media/fal-1750000000.png',
		'resolver receives the durable vault path',
	);
	assert.ok(result?.startsWith('app://'), `render URL is app:// scoped, got: ${String(result)}`);
	assert.ok(!result?.startsWith('ChatFolder/'), 'render URL is not a raw vault path');
	console.log('PASS: C1 regression — vault-path preview.uri becomes an app:// URL at render time');
}

// ─── runner ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const tests: Array<[string, () => void | Promise<void>]> = [
		['hasLoadableScheme accepts common schemes', testHasLoadableSchemeAcceptsCommonSchemes],
		['hasLoadableScheme rejects bare paths', testHasLoadableSchemeRejectsBarePaths],
		['pickReceiptMediaUri prefers preview', testPickReceiptMediaUriPrefersPreview],
		['pickReceiptMediaUri falls back to externalUri/uri', testPickReceiptMediaUriFallsBackToExternalThenLegacy],
		['pickReceiptMediaUri returns undefined when nothing', testPickReceiptMediaUriReturnsUndefinedWhenNothing],
		['resolveArtifactMediaUri passes through https URI', testResolvePassesThroughHttpsUri],
		['resolveArtifactMediaUri passes through data URI', testResolvePassesThroughDataUri],
		['resolveArtifactMediaUri passes through app URI', testResolvePassesThroughAppUri],
		['resolveArtifactMediaUri delegates vault path to resolver', testResolveVaultPathDelegatesToResolver],
		['resolveArtifactMediaUri strips leading slash', testResolveStripsLeadingSlashBeforeResolver],
		['resolveArtifactMediaUri returns undefined when resolver fails', testResolveReturnsUndefinedWhenResolverFails],
		['resolveArtifactMediaUri returns undefined when no uri present', testResolveReturnsUndefinedWhenReceiptHasNoUri],
		['C1 regression: vault-path preview.uri → app:// URL at render', testC1RegressionMediaReceiptVaultPathBecomesLoadableUrl],
	];
	for (const [name, fn] of tests) {
		try {
			await fn();
		} catch (err) {
			console.error(`FAIL: ${name}`);
			throw err;
		}
	}
	console.log(`\nartifact-media-uri: all ${tests.length} guards passed`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
