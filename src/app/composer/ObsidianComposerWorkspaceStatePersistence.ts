import type { App } from 'obsidian';
import type {
	ComposerWorkspaceStateEvent,
	ComposerWorkspaceStatePersistencePort,
} from '@/service/composer';

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
	private ensured = false;
	private readonly filePath: string;

	constructor(
		private readonly app: App,
		private readonly baseDir: string,
		fileName = 'composer-workspace-state.jsonl',
	) {
		this.filePath = `${baseDir}/${fileName}`;
	}

	async load(): Promise<readonly ComposerWorkspaceStateEvent[]> {
		try {
			if (!(await this.app.vault.adapter.exists(this.filePath))) return [];
			const text = await this.app.vault.adapter.read(this.filePath);
			const events: ComposerWorkspaceStateEvent[] = [];
			for (const line of text.split(/\r?\n/)) {
				if (!line.trim()) continue;
				try {
					const parsed = JSON.parse(line) as Record<string, unknown>;
					if (typeof parsed.type !== 'string' || !EVENT_TYPES.has(parsed.type)) continue;
					events.push(parsed as unknown as ComposerWorkspaceStateEvent);
				} catch {
					// One corrupt tail line must not prevent earlier state replay.
				}
			}
			return events;
		} catch {
			return [];
		}
	}

	append(event: ComposerWorkspaceStateEvent): Promise<void> {
		this.queue = this.queue.then(() => this.appendNow(event), () => this.appendNow(event));
		return this.queue;
	}

	private async appendNow(event: ComposerWorkspaceStateEvent): Promise<void> {
		try {
			if (!this.ensured) {
				if (!(await this.app.vault.adapter.exists(this.baseDir))) {
					await this.app.vault.adapter.mkdir(this.baseDir);
				}
				this.ensured = true;
			}
			const line = `${JSON.stringify(event)}\n`;
			if (!(await this.app.vault.adapter.exists(this.filePath))) {
				await this.app.vault.adapter.write(this.filePath, line);
				return;
			}
			await this.app.vault.adapter.append(this.filePath, line);
		} catch {
			// State persistence is best-effort; runtime truth stays in memory.
		}
	}
}
