import assert from 'node:assert/strict';
import { DEFAULT_MODEL_CATALOG_SETTINGS } from '@/core/config/settingsTypes';
import type { HttpClientPort } from '@/core/ports/HttpClientPort';
import { parseOpenRouterCatalog, refreshOpenRouterCatalog } from '@/core/providers/openrouter-catalog';

const valid = JSON.stringify({
	schemaVersion: 1,
	provider: 'openrouter',
	catalogVersion: '2026-08-13',
	models: { 'deepseek/deepseek-r1': { displayName: 'DeepSeek R1' } },
});

assert.equal(parseOpenRouterCatalog(valid).provider, 'openrouter');
assert.throws(() => parseOpenRouterCatalog(JSON.stringify({ schemaVersion: 2, provider: 'openrouter', models: {} })), /schemaVersion/);
assert.throws(() => parseOpenRouterCatalog(JSON.stringify({ schemaVersion: 1, provider: 'openai', models: {} })), /openrouter/);
assert.throws(() => parseOpenRouterCatalog(JSON.stringify({ schemaVersion: 1, provider: 'openrouter', models: [] })), /models/);

void main();

async function main() {
	const base = { ...DEFAULT_MODEL_CATALOG_SETTINGS, openRouterCatalogUrl: 'https://example.test/catalog.json' };
	const updated = await refreshOpenRouterCatalog(client(200, valid, { ETag: 'abc', 'Last-Modified': 'Thu, 13 Aug 2026 00:00:00 GMT' }), base);
	assert.equal(updated.status, 'updated');
	assert.equal(updated.settings.etag, 'abc');
	assert.equal(updated.settings.cachedOpenRouterCatalog?.catalogVersion, '2026-08-13');

	const notModified = await refreshOpenRouterCatalog(client(304, '', {}), updated.settings);
	assert.equal(notModified.status, 'not-modified');
	assert.deepEqual(notModified.catalog, updated.catalog);

	const invalid = await refreshOpenRouterCatalog(client(200, '{"schemaVersion":1,"provider":"openrouter","models":[]}'), updated.settings);
	assert.equal(invalid.status, 'failed');
	assert.deepEqual(invalid.catalog, updated.catalog, 'invalid network data keeps the last-known-good catalog');

	console.log('openrouter-catalog tests passed');
}

function client(status: number, text: string, headers: Record<string, string> = {}): HttpClientPort {
	return { request: async () => ({ status, text, headers, arrayBuffer: new ArrayBuffer(0) }) };
}
