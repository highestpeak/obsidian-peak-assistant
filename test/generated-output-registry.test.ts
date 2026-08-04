import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
	GeneratedOutputRegistry,
	createDefaultGeneratedOutputRegistry,
	type GeneratedOutputDescriptor,
} from '@/core/storage/generated-output';

const ROOT = process.cwd();
const REGISTRY_DOC = path.join(ROOT, 'docs/conventions/generated-artifact-registry.md');

function documentationIds(prefix: string, count: number): string[] {
	return Array.from({ length: count }, (_, index) => `${prefix}-${String(index + 1).padStart(2, '0')}`);
}

function testCatalogMatchesCanonicalDocumentation(): void {
	const registry = createDefaultGeneratedOutputRegistry();
	const expected = [
		...documentationIds('UA', 15),
		...documentationIds('DR', 20),
		...documentationIds('LP', 10),
		...documentationIds('LG', 8),
	].sort();
	const actual = registry.list().map((entry) => entry.documentationId).sort();
	assert.deepEqual(actual, expected, 'typed catalog must cover every canonical documentation row');

	const markdown = fs.readFileSync(REGISTRY_DOC, 'utf8');
	const documented = [...markdown.matchAll(/^\| ((?:UA|DR|LP|LG)-\d{2}) \|/gm)]
		.map((match) => match[1])
		.sort();
	assert.deepEqual(documented, expected, 'canonical registry doc must contain every typed documentation ID once');
	assert.equal(new Set(documented).size, documented.length, 'documentation IDs must stay unique');
	console.log('PASS: generated output catalog matches canonical documentation');
}

function testPolicyPartitions(): void {
	const registry = createDefaultGeneratedOutputRegistry();
	const required = registry.listBySyncPolicy('required');
	const localOnly = registry.listBySyncPolicy('local-only');

	assert.ok(required.some((entry) => entry.id === 'chat.conversation-events'));
	assert.ok(required.some((entry) => entry.id === 'ai-graph.artifact'));
	assert.ok(localOnly.some((entry) => entry.id === 'projection.vault'));
	assert.ok(localOnly.some((entry) => entry.id === 'index.embedding'));
	assert.ok(localOnly.some((entry) => entry.id === 'telemetry.composer'));

	for (const entry of localOnly) {
		assert.equal(entry.peakIndexPolicy, 'exclude', `${entry.id} local-only output must stay out of Peak index`);
	}
	for (const entry of registry.listByClass('durable-record')) {
		if (entry.lifecycle === 'migration-source') continue;
		assert.equal(entry.syncPolicy, 'required', `${entry.id} durable record must sync`);
		assert.equal(entry.materializationPolicy, 'never', `${entry.id} durable record cannot materialize Markdown`);
	}
	console.log('PASS: generated output policy partitions');
}

function testMyContentProjectionOnlyIncludesExplicitUserOutputs(): void {
	const registry = createDefaultGeneratedOutputRegistry();
	const ids = registry.listMyContentTypes().map((entry) => entry.id).sort();
	assert.deepEqual(ids, [
		'ai-graph.markdown-export',
		'analysis.markdown-export',
		'artifact.dataview',
		'artifact.drawio',
		'artifact.excalidraw',
		'artifact.extract',
		'artifact.native-file',
		'artifact.reminder',
		'hub.materialized-note',
		'media.generated-attachment',
		'project.brief',
		'user-profile.markdown',
	]);
	for (const entry of registry.listMyContentTypes()) {
		assert.equal(entry.outputClass, 'user-artifact');
		assert.equal(entry.userSurface?.visibility, 'my-content');
		assert.ok(entry.userSurface?.kind);
		assert.ok(entry.userSurface?.source);
	}
	for (const hiddenId of ['prompt.override', 'skill.vault-definition', 'document.accepted-writeback']) {
		assert.ok(!ids.includes(hiddenId), `${hiddenId} must stay in its owning surface, not My Content`);
	}
	console.log('PASS: My Content projection only includes explicit user outputs');
}

function testPathResolutionAndTraversalDefense(): void {
	const registry = createDefaultGeneratedOutputRegistry();
	assert.equal(
		registry.resolveRelativePath('ai-graph.artifact'),
		'artifacts/ai-graphs',
	);
	assert.equal(
		registry.resolveRelativePath('run.events', { domain: 'analysis' }),
		'records/analysis/runs',
	);
	assert.equal(
		registry.resolvePath(
			'chat.conversation-events',
			{ aiRoot: 'ChatFolder', dataStore: 'ChatFolder/DataStore', pluginData: '.obsidian/plugins/peak' },
			{ conversationId: 'conv-123' },
		),
		'ChatFolder/DataStore/records/chat/conversations/conv-123.jsonl',
	);
	assert.throws(
		() => registry.resolveRelativePath('run.events'),
		/missing path variable "domain"/,
	);
	assert.throws(
		() => registry.resolveRelativePath('run.events', { domain: '../outside' }),
		/unsafe path variable "domain"/,
	);
	assert.throws(
		() => registry.resolveRelativePath('document.accepted-writeback'),
		/user-selected path/,
	);
	console.log('PASS: generated output path resolution and traversal defense');
}

function testInvalidDescriptorsFailLoud(): void {
	const valid: GeneratedOutputDescriptor = {
		documentationId: 'DR-99',
		id: 'test.record',
		owner: 'test',
		lifecycle: 'active',
		outputClass: 'durable-record',
		carrier: 'json',
		syncPolicy: 'required',
		peakIndexPolicy: 'exclude',
		materializationPolicy: 'never',
		retentionPolicy: 'durable',
		path: { scope: 'data-store', template: 'records/test.json' },
		schemaVersion: 1,
		writerEvidence: ['src/test-writer.ts'],
	};
	assert.throws(
		() => new GeneratedOutputRegistry([valid, { ...valid }]),
		/duplicate output id "test.record"/,
	);
	assert.throws(
		() => new GeneratedOutputRegistry([{ ...valid, syncPolicy: 'local-only' }]),
		/durable record "test.record" must use required sync/,
	);
	assert.throws(
		() => new GeneratedOutputRegistry([{
			...valid,
			id: 'test.markdown-record',
			carrier: 'markdown',
		}]),
		/non-legacy Markdown output "test.markdown-record" must be user-owned/,
	);
	console.log('PASS: invalid generated output descriptors fail loud');
}

function walkTypeScriptFiles(directory: string): string[] {
	const files: string[] = [];
	for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
		const absolute = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...walkTypeScriptFiles(absolute));
			continue;
		}
		if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) files.push(absolute);
	}
	return files;
}

const DIRECT_WRITER_PATTERNS = [
	/\b(?:this\.)?app\.vault\.(?:create|modify|createBinary|modifyBinary)\s*\(/,
	/\b(?:this\.)?(?:vault|vaultWriter)\.(?:create|modify|createBinary|modifyBinary)\s*\(/,
	/\b(?:this\.)?app\.vault\.adapter\.(?:write|append)\s*\(/,
	/\b(?:this\.)?adapter\.(?:write|append)\s*\(/,
	/\bfs\.(?:writeFileSync|appendFileSync)\s*\(/,
];

const PERSISTENCE_INFRASTRUCTURE_ALLOWLIST = new Set([
	'src/app/composer/ObsidianComposerDataStore.ts',
	'src/app/storage/ObsidianGeneratedOutputDataAdapter.ts',
	'src/app/platform/vault/vault-helpers.ts',
	'src/core/storage/vault/vault-ops.ts',
]);

function testDirectWriterCoverage(): void {
	const registry = createDefaultGeneratedOutputRegistry();
	const evidence = new Set(registry.list().flatMap((entry) => entry.writerEvidence));
	for (const sourcePath of evidence) {
		assert.ok(fs.existsSync(path.join(ROOT, sourcePath)), `registered writer evidence must exist: ${sourcePath}`);
	}

	const detected = walkTypeScriptFiles(path.join(ROOT, 'src'))
		.filter((absolute) => {
			const source = fs.readFileSync(absolute, 'utf8');
			return DIRECT_WRITER_PATTERNS.some((pattern) => pattern.test(source));
		})
		.map((absolute) => path.relative(ROOT, absolute).replace(/\\/g, '/'))
		.sort();
	const uncovered = detected.filter((sourcePath) => (
		!evidence.has(sourcePath) && !PERSISTENCE_INFRASTRUCTURE_ALLOWLIST.has(sourcePath)
	));
	assert.deepEqual(
		uncovered,
		[],
		`direct persistent writers must register an output ID or be a generic adapter:\n${uncovered.join('\n')}`,
	);
	console.log(`PASS: direct writer coverage (${detected.length} files)`);
}

testCatalogMatchesCanonicalDocumentation();
testPolicyPartitions();
testMyContentProjectionOnlyIncludesExplicitUserOutputs();
testPathResolutionAndTraversalDefense();
testInvalidDescriptorsFailLoud();
testDirectWriterCoverage();
