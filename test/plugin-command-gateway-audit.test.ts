import assert from 'assert';
import { ObsidianPluginCommandGatewayAudit } from '@/app/platform/commands/ObsidianPluginCommandGatewayAudit';
import type { PluginCommandGatewayAuditReceipt } from '@/core/types/plugin-command-gateway';

class MemoryAdapter {
	files = new Map<string, string>();
	directories = new Set<string>();

	async exists(path: string) {
		return this.files.has(path) || this.directories.has(path);
	}
	async mkdir(path: string) {
		this.directories.add(path);
	}
	async stat(path: string) {
		const content = this.files.get(path);
		return content === undefined ? null : { type: 'file', size: Buffer.byteLength(content) };
	}
	async write(path: string, content: string) {
		this.files.set(path, content);
	}
	async append(path: string, content: string) {
		this.files.set(path, (this.files.get(path) ?? '') + content);
	}
	async read(path: string) {
		return this.files.get(path) ?? '';
	}
	async rename(from: string, to: string) {
		const content = this.files.get(from);
		if (content === undefined) throw new Error('missing');
		this.files.delete(from);
		this.files.set(to, content);
	}
	async list(directory: string) {
		return {
			files: [...this.files.keys()].filter((path) => path.startsWith(`${directory}/`)),
			folders: [],
		};
	}
	async remove(path: string) {
		this.files.delete(path);
	}
}

function receipt(runId: string): PluginCommandGatewayAuditReceipt {
	return {
		schemaVersion: 1,
		runId,
		commandId: 'calendar:open-week',
		commandName: 'Open week',
		pluginId: 'calendar',
		pluginName: 'Calendar',
		sourceHash: 'hash',
		curationHash: 'curation',
		compiledSkillId: 'plugin-command-gateway.test',
		risk: 'read',
		purpose: 'navigation',
		confirmation: 'none',
		status: 'completed',
		startedAt: 1,
		endedAt: 2,
		events: [],
	};
}

async function testJsonlAppendAndRotation(): Promise<void> {
	const adapter = new MemoryAdapter();
	const audit = new ObsidianPluginCommandGatewayAudit(
		{ vault: { adapter } } as any,
		'DataStore/records/command-gateway',
		{
			fileName: 'runs.jsonl',
			rotationBytes: 350,
			retentionFiles: 1,
		},
	);
	await audit.append(receipt('run-1'));
	await audit.append(receipt('run-2'));
	await audit.append(receipt('run-3'));
	await audit.drain();
	const recent = await audit.listRecent(10);
	assert.strictEqual(recent.length, 2, 'recent reads span the current file and retained archives');
	assert.strictEqual(recent[0]!.runId, 'run-3');
	assert.strictEqual(recent[1]!.runId, 'run-2');
	const archives = [...adapter.files.keys()].filter((path) => /runs-\d+-\d+\.jsonl$/.test(path));
	assert.ok(archives.length <= 1, 'retention must prune old archives');
	const current = adapter.files.get('DataStore/records/command-gateway/runs.jsonl') ?? '';
	assert.ok(current.endsWith('\n'));
	console.log('PASS: jsonlAppendAndRotation');
}

testJsonlAppendAndRotation().catch((error) => {
	console.error(error);
	process.exit(1);
});
