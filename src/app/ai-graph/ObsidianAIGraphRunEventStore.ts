import type { App } from 'obsidian';
import type { AIGraphRunEvent, AIGraphRunEventPort } from '@/service/ai-graph';
import {
	ensureAdapterDirectory,
	joinAdapterPath,
} from '@/app/composer/ObsidianComposerDataStore';

export class ObsidianAIGraphRunEventStore implements AIGraphRunEventPort {
	constructor(
		private readonly app: App,
		private readonly runsDir: string,
	) {}

	async append(event: AIGraphRunEvent): Promise<void> {
		await ensureAdapterDirectory(this.app, this.runsDir);
		const path = joinAdapterPath(this.runsDir, `${event.runId}.jsonl`);
		const line = `${JSON.stringify(event)}\n`;
		if (await this.app.vault.adapter.exists(path)) {
			await this.app.vault.adapter.append(path, line);
			return;
		}
		await this.app.vault.adapter.write(path, line);
	}
}
