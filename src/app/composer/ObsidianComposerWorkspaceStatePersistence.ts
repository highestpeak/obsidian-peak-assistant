import type { App } from 'obsidian';
import type {
	ComposerWorkspaceStateEvent,
	ComposerWorkspaceStatePersistencePort,
} from '@/service/composer';
import { compactComposerWorkspaceStateEvents } from '@/service/composer';
import {
	copyLegacyFileIfNeeded,
	ensureAdapterDirectory,
	joinAdapterPath,
} from './ObsidianComposerDataStore';

const EVENT_TYPES = new Set([
	'segment-started',
	'segment-ended',
	'document-tracked',
	'document-renamed',
	'scope-changed',
	'run-upserted',
]);

/**
 * Append-only machine state for Composer work segments, scope and Frozen Runs.
 * It is deliberately separate from evaluation telemetry and user Markdown.
 */
export class ObsidianComposerWorkspaceStatePersistence
	implements ComposerWorkspaceStatePersistencePort
{
	private queue: Promise<void> = Promise.resolve();
	private readonly filePath: string;
	private initialization: Promise<void> | null = null;
	private events: ComposerWorkspaceStateEvent[] = [];

	constructor(
		private readonly app: App,
		private readonly baseDir: string,
		private readonly options: {
			fileName: string;
			legacyFilePath?: string;
			compactionEventThreshold: number;
		},
	) {
		this.filePath = joinAdapterPath(baseDir, options.fileName);
	}

	async load(): Promise<readonly ComposerWorkspaceStateEvent[]> {
		await this.ensureInitialized();
		return this.events;
	}

	append(event: ComposerWorkspaceStateEvent): Promise<void> {
		this.queue = this.queue.then(() => this.appendNow(event), () => this.appendNow(event));
		return this.queue;
	}

	private async ensureInitialized(): Promise<void> {
		if (!this.initialization) this.initialization = this.initialize();
		await this.initialization;
	}

	private async initialize(): Promise<void> {
		try {
			await copyLegacyFileIfNeeded(this.app, this.options.legacyFilePath, this.filePath);
			if (!(await this.app.vault.adapter.exists(this.filePath))) {
				this.events = [];
				return;
			}
			const text = await this.app.vault.adapter.read(this.filePath);
			this.events = parseWorkspaceStateEvents(text, this.filePath);
			if (this.events.length < this.options.compactionEventThreshold) return;
			const compacted = compactComposerWorkspaceStateEvents(this.events);
			if (compacted.length >= this.events.length) return;
			try {
				await this.writeAll(compacted);
				this.events = compacted;
			} catch (error) {
				console.warn('[Peak Composer] workspace-state compaction failed:', error);
			}
		} catch (error) {
			console.error('[Peak Composer] workspace-state load failed:', error);
			this.events = [];
		}
	}

	private async appendNow(event: ComposerWorkspaceStateEvent): Promise<void> {
		try {
			await this.ensureInitialized();
			const next = [...this.events, event];
			if (next.length >= this.options.compactionEventThreshold) {
				const compacted = compactComposerWorkspaceStateEvents(next);
				if (compacted.length < next.length) {
					await this.writeAll(compacted);
					this.events = compacted;
					return;
				}
			}
			const line = `${JSON.stringify(event)}\n`;
			await ensureAdapterDirectory(this.app, this.baseDir);
			if (!(await this.app.vault.adapter.exists(this.filePath))) {
				await this.app.vault.adapter.write(this.filePath, line);
			} else {
				await this.app.vault.adapter.append(this.filePath, line);
			}
			this.events = next;
		} catch (error) {
			console.warn('[Peak Composer] workspace-state append failed:', error);
			// State persistence is best-effort; runtime truth stays in memory.
		}
	}

	private async writeAll(events: readonly ComposerWorkspaceStateEvent[]): Promise<void> {
		await ensureAdapterDirectory(this.app, this.baseDir);
		const text = events.map((event) => JSON.stringify(event)).join('\n');
		await this.app.vault.adapter.write(this.filePath, text ? `${text}\n` : '');
	}
}

function parseWorkspaceStateEvents(text: string, filePath: string): ComposerWorkspaceStateEvent[] {
	const nonEmpty = text.split(/\r?\n/).filter((line) => line.trim());
	const events: ComposerWorkspaceStateEvent[] = [];
	for (let index = 0; index < nonEmpty.length; index += 1) {
		const line = nonEmpty[index];
		try {
			const parsed = JSON.parse(line) as Record<string, unknown>;
			if (typeof parsed.type !== 'string' || !EVENT_TYPES.has(parsed.type)) continue;
			events.push(parsed as unknown as ComposerWorkspaceStateEvent);
		} catch {
			const position = index === nonEmpty.length - 1 ? 'tail' : `record ${index + 1}`;
			console.warn(`[Peak Composer] ignored corrupt workspace-state ${position}: ${filePath}`);
		}
	}
	return events;
}
