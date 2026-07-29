/** App-owned, revision-safe persistence for selected Markdown embed blocks. */

import type { App, TFile } from 'obsidian';
import { TFile as ObsidianTFile } from 'obsidian';
import type {
	ComposerEmbedSelectionAnchorPort,
	ComposerEmbedSelectionAnchorRequest,
	ComposerEmbedSelectionAnchorResult,
} from '@/service/composer';
import { planEmbedSelectionAnchor } from '@/service/composer';

export class ObsidianComposerEmbedAnchorAdapter implements ComposerEmbedSelectionAnchorPort {
	constructor(private readonly app: App) {}

	async persistSelection(request: ComposerEmbedSelectionAnchorRequest): Promise<ComposerEmbedSelectionAnchorResult> {
		const file = this.resolve(request.targetPath);
		let result: ComposerEmbedSelectionAnchorResult | null = null;
		await this.app.vault.process(file, (current) => {
			const plan = planEmbedSelectionAnchor(current, request.selectedBlockText, this.nextAnchorId());
			if (!plan.ok) {
				throw new Error(
					plan.reason === 'selection-ambiguous'
						? 'Selected Markdown block is ambiguous in the target note'
						: 'Selection must cover one complete Markdown block before it can be anchored',
				);
			}
			result = { anchor: plan.anchor, reused: plan.reused };
			return plan.nextText;
		});
		if (!result) throw new Error('Unable to persist the selected Markdown block anchor');
		return result;
	}

	private resolve(path: string): TFile {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof ObsidianTFile)) {
			throw new Error(`Composer embed anchor target not found: ${path}`);
		}
		return file;
	}

	private nextAnchorId(): string {
		return `peak-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	}
}
