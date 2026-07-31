import type { App } from 'obsidian';
import type { PluginCommandGatewayAuditPort } from '@/core/ports/PluginCommandGatewayAuditPort';
import type { PluginCommandGatewayAuditReceipt } from '@/core/types/plugin-command-gateway';

interface AuditOptions {
	readonly fileName: string;
	readonly rotationBytes: number;
	readonly retentionFiles: number;
}

export class ObsidianPluginCommandGatewayAudit
	implements PluginCommandGatewayAuditPort
{
	private queue: Promise<unknown> = Promise.resolve();
	private initialized: Promise<void> | null = null;
	private rotationSequence = 0;
	private readonly filePath: string;

	constructor(
		private readonly app: App,
		private readonly baseDir: string,
		private readonly options: AuditOptions,
	) {
		this.filePath = joinPath(baseDir, options.fileName);
	}

	append(receipt: PluginCommandGatewayAuditReceipt): Promise<void> {
		return this.enqueue(async () => {
			await this.ensureInitialized();
			const line = `${JSON.stringify(receipt)}\n`;
			const stat = await this.app.vault.adapter.stat(this.filePath);
			const incomingBytes = new TextEncoder().encode(line).byteLength;
			if (stat?.type === 'file' && stat.size + incomingBytes > this.options.rotationBytes) {
				await this.rotate();
			}
			if (await this.app.vault.adapter.exists(this.filePath)) {
				await this.app.vault.adapter.append(this.filePath, line);
				return;
			}
			await this.app.vault.adapter.write(this.filePath, line);
		});
	}

	listRecent(limit: number): Promise<readonly PluginCommandGatewayAuditReceipt[]> {
		return this.enqueue(async () => {
			await this.ensureInitialized();
			const receipts: PluginCommandGatewayAuditReceipt[] = [];
			const requested = Math.max(0, limit);
			if (requested === 0) return receipts;
			const paths = await this.recentLogPaths();
			for (const path of paths) {
				if (!(await this.app.vault.adapter.exists(path))) continue;
				const raw = await this.app.vault.adapter.read(path);
				const parsed = parseReceipts(raw).reverse();
				receipts.push(...parsed);
				if (receipts.length >= requested) break;
			}
			return receipts.slice(0, requested);
		});
	}

	async drain(): Promise<void> {
		await this.queue;
	}

	private enqueue<T>(work: () => Promise<T>): Promise<T> {
		const next = this.queue.then(work, work);
		this.queue = next.then(() => undefined, () => undefined);
		return next;
	}

	private async ensureInitialized(): Promise<void> {
		if (!this.initialized) {
			this.initialized = ensureDirectory(this.app, this.baseDir);
		}
		await this.initialized;
	}

	private async rotate(): Promise<void> {
		this.rotationSequence += 1;
		const extensionIndex = this.options.fileName.lastIndexOf('.');
		const stem = extensionIndex > 0
			? this.options.fileName.slice(0, extensionIndex)
			: this.options.fileName;
		const extension = extensionIndex > 0
			? this.options.fileName.slice(extensionIndex)
			: '.jsonl';
		const archive = joinPath(
			this.baseDir,
			`${stem}-${Date.now()}-${this.rotationSequence}${extension}`,
		);
		await this.app.vault.adapter.rename(this.filePath, archive);
		const listed = await this.app.vault.adapter.list(this.baseDir);
		const prefix = `${joinPath(this.baseDir, stem)}-`;
		const archives = listed.files
			.filter((path) => path.startsWith(prefix) && path.endsWith(extension))
			.sort()
			.reverse();
		for (const stale of archives.slice(this.options.retentionFiles)) {
			await this.app.vault.adapter.remove(stale);
		}
	}

	private async recentLogPaths(): Promise<string[]> {
		const extensionIndex = this.options.fileName.lastIndexOf('.');
		const stem = extensionIndex > 0
			? this.options.fileName.slice(0, extensionIndex)
			: this.options.fileName;
		const extension = extensionIndex > 0
			? this.options.fileName.slice(extensionIndex)
			: '.jsonl';
		const prefix = `${joinPath(this.baseDir, stem)}-`;
		const listed = await this.app.vault.adapter.list(this.baseDir);
		const archives = listed.files
			.filter((path) => path.startsWith(prefix) && path.endsWith(extension))
			.sort()
			.reverse();
		return [this.filePath, ...archives];
	}
}

function parseReceipts(raw: string): PluginCommandGatewayAuditReceipt[] {
	const receipts: PluginCommandGatewayAuditReceipt[] = [];
	for (const line of raw.split(/\r?\n/)) {
		if (!line.trim()) continue;
		try {
			const parsed = JSON.parse(line) as PluginCommandGatewayAuditReceipt;
			if (parsed.schemaVersion !== 1 || typeof parsed.runId !== 'string') continue;
			receipts.push(parsed);
		} catch {
			// One malformed tail line must not hide older valid receipts.
		}
	}
	return receipts;
}

async function ensureDirectory(app: App, directory: string): Promise<void> {
	const segments = joinPath(directory).split('/').filter(Boolean);
	let current = '';
	for (const segment of segments) {
		current = current ? `${current}/${segment}` : segment;
		if (await app.vault.adapter.exists(current)) continue;
		try {
			await app.vault.adapter.mkdir(current);
		} catch (error) {
			if (!(await app.vault.adapter.exists(current))) throw error;
		}
	}
}

function joinPath(...segments: string[]): string {
	return segments
		.filter(Boolean)
		.join('/')
		.replace(/\\/g, '/')
		.replace(/\/+/g, '/')
		.replace(/^\/+|\/+$/g, '');
}
