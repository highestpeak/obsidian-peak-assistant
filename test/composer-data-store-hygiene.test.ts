import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import type { App } from 'obsidian';
import { ObsidianComposerWorkspaceStatePersistence } from '@/app/composer/ObsidianComposerWorkspaceStatePersistence';
import { ObsidianComposerIntelligenceTelemetry } from '@/app/composer/ObsidianComposerAdapters';
import { copyLegacyFileIfNeeded } from '@/app/composer/ObsidianComposerDataStore';

class MemoryAdapter {
	readonly files = new Map<string, string>();
	readonly directories = new Set<string>();

	async exists(path: string): Promise<boolean> {
		return this.files.has(path) || this.directories.has(path);
	}

	async stat(path: string): Promise<{ type: 'file'; ctime: number; mtime: number; size: number } | null> {
		const value = this.files.get(path);
		if (value === undefined) return null;
		return { type: 'file', ctime: 1, mtime: 1, size: new TextEncoder().encode(value).byteLength };
	}

	async list(path: string): Promise<{ files: string[]; folders: string[] }> {
		const prefix = `${path}/`;
		return {
			files: [...this.files.keys()].filter((candidate) =>
				candidate.startsWith(prefix)
				&& !candidate.slice(prefix.length).includes('/')),
			folders: [],
		};
	}

	async read(path: string): Promise<string> {
		const value = this.files.get(path);
		if (value === undefined) throw new Error(`missing file: ${path}`);
		return value;
	}

	async write(path: string, value: string): Promise<void> {
		this.files.set(path, value);
	}

	async append(path: string, value: string): Promise<void> {
		this.files.set(path, `${this.files.get(path) ?? ''}${value}`);
	}

	async mkdir(path: string): Promise<void> {
		this.directories.add(path);
	}

	async rename(path: string, target: string): Promise<void> {
		const value = await this.read(path);
		this.files.delete(path);
		this.files.set(target, value);
	}

	async remove(path: string): Promise<void> {
		this.files.delete(path);
	}
}

function fakeApp(adapter: MemoryAdapter): App {
	return { vault: { adapter } } as unknown as App;
}

async function main(): Promise<void> {
	const adapter = new MemoryAdapter();
	const app = fakeApp(adapter);

	adapter.files.set('.obsidian/plugins/obsidian-peak-assistant/legacy.json', 'legacy');
	const migrated = await copyLegacyFileIfNeeded(
		app,
		'.obsidian/plugins/obsidian-peak-assistant/legacy.json',
		'ChatFolder/DataStore/composer/legacy.json',
	);
	assert.equal(migrated, true);
	assert.equal(adapter.files.get('ChatFolder/DataStore/composer/legacy.json'), 'legacy');
	assert.equal(
		adapter.files.has('ChatFolder/DataStore/composer/legacy.json.migration'),
		false,
		'verified migration must publish through a temporary file',
	);
	assert.equal(
		adapter.files.get('.obsidian/plugins/obsidian-peak-assistant/legacy.json'),
		'legacy',
		'verified migration must retain the legacy source until explicit cleanup',
	);

	const legacyWorkspace = '.obsidian/plugins/obsidian-peak-assistant/composer-state/composer-workspace-state.jsonl';
	adapter.files.set(legacyWorkspace, [
		{ type: 'document-tracked', at: 1, documentId: 'doc', filePath: 'A.md' },
		{ type: 'document-renamed', at: 2, documentId: 'doc', filePath: 'B.md' },
		{ type: 'document-renamed', at: 3, documentId: 'doc', filePath: 'C.md' },
		{ type: 'document-renamed', at: 4, documentId: 'doc', filePath: 'D.md' },
	].map((event) => JSON.stringify(event)).join('\n') + '\n');
	const workspace = new ObsidianComposerWorkspaceStatePersistence(
		app,
		'ChatFolder/DataStore/records/composer/workspaces',
		{
			fileName: 'current.jsonl',
			legacyFilePath: legacyWorkspace,
			compactionEventThreshold: 4,
		},
	);
	const loaded = await workspace.load();
	assert.equal(loaded.length, 1, 'legacy workspace stream should compact on migration');
	assert.equal(
		loaded[0]?.type === 'document-tracked' ? loaded[0].filePath : '',
		'D.md',
		'compaction must retain the latest path',
	);
	await workspace.append({
		type: 'scope-changed',
		at: 5,
		scope: { kind: 'document', documentId: 'doc' },
	});
	const canonicalWorkspace = 'ChatFolder/DataStore/records/composer/workspaces/current.jsonl';
	assert.equal(adapter.files.has(canonicalWorkspace), true);
	assert.equal(adapter.files.has(legacyWorkspace), true, 'workspace migration must be non-destructive');

	const recoverableWorkspacePath = 'ChatFolder/DataStore/records/composer/recoverable.jsonl';
	adapter.files.set(recoverableWorkspacePath, [
		JSON.stringify({ type: 'document-tracked', at: 1, documentId: 'safe', filePath: 'Safe.md' }),
		'{broken',
		JSON.stringify({ type: 'scope-changed', at: 2, scope: { kind: 'document', documentId: 'safe' } }),
	].join('\n') + '\n');
	const recoverableWorkspace = new ObsidianComposerWorkspaceStatePersistence(
		app,
		'ChatFolder/DataStore/records/composer',
		{
			fileName: 'recoverable.jsonl',
			compactionEventThreshold: 200,
		},
	);
	const recovered = await recoverableWorkspace.load();
	assert.equal(recovered.length, 2, 'one corrupt JSONL record must not erase valid workspace state');

	const legacyTelemetry = '.obsidian/plugins/obsidian-peak-assistant/telemetry/composer-intelligence.jsonl';
	adapter.files.set(legacyTelemetry, `${JSON.stringify({ ts: 1, event: 'legacy' })}\n`);
	const telemetry = new ObsidianComposerIntelligenceTelemetry(
		app,
		'ChatFolder/DataStore/telemetry/composer',
		{
			fileName: 'composer-intelligence.jsonl',
			legacyFilePath: legacyTelemetry,
			rotationBytes: 1_024,
			retentionFiles: 2,
		},
	);
	telemetry.emit({
		dimension: 'relevance',
		event: 'finding_ingested',
		kind: 'ai',
		fields: { findingId: 'finding-1', deduped: false },
	});
	await telemetry.drain();
	const canonicalTelemetry = 'ChatFolder/DataStore/telemetry/composer/composer-intelligence.jsonl';
	assert.match(adapter.files.get(canonicalTelemetry) ?? '', /"event":"legacy"/);
	assert.match(adapter.files.get(canonicalTelemetry) ?? '', /"event":"finding_ingested"/);
	assert.equal(adapter.files.has(legacyTelemetry), true, 'telemetry migration must retain the legacy source');

	const mainSource = readFileSync('main.ts', 'utf8');
	assert.match(mainSource, /composeDocumentComposerRuntime\(this\.app, this\.settings\.dataStorageFolder/);
	assert.match(mainSource, /legacyPluginDir: this\.manifest\.dir/);
	assert.doesNotMatch(
		mainSource,
		/composeDocumentComposerRuntime\(this\.app, this\.manifest\.dir/,
		'plugin installation directory must never be the canonical Composer data root',
	);

	const trackedRuntimeData = execFileSync(
		'git',
		['ls-files', '--', 'composer-comments', 'composer-state', 'telemetry'],
		{ encoding: 'utf8' },
	).trim();
	assert.equal(trackedRuntimeData, '', 'runtime data directories must not be tracked');
	for (const directory of ['composer-comments/', 'composer-state/', 'telemetry/']) {
		execFileSync('git', ['check-ignore', '-q', directory]);
	}

	console.log('composer-data-store-hygiene: migration, compaction, and Git boundaries passed');
}

void main();
