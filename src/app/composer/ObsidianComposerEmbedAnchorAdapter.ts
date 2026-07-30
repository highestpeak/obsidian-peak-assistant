/** App-owned, revision-safe persistence for selected Markdown embed blocks. */

import type { App, TFile } from 'obsidian';
import { TFile as ObsidianTFile } from 'obsidian';
import type {
	ComposerEmbedSelectionAnchorPort,
	ComposerEmbedSelectionAnchorMutation,
	ComposerEmbedSelectionAnchorRequest,
	ComposerEmbedSelectionAnchorReleaseRequest,
	ComposerEmbedSelectionAnchorResult,
} from '@/service/composer';
import {
	planEmbedSelectionAnchor,
	planEmbedSelectionRange,
	removeManagedEmbedSelectionAnchors,
} from '@/service/composer';

export class ObsidianComposerEmbedAnchorAdapter implements ComposerEmbedSelectionAnchorPort {
	constructor(private readonly app: App) {}

	async persistSelection(request: ComposerEmbedSelectionAnchorRequest): Promise<ComposerEmbedSelectionAnchorMutation> {
		const file = this.resolve(request.targetPath);
		let result: ComposerEmbedSelectionAnchorResult | null = null;
		const mutation = await this.mutate(file, (current) => {
			const groups = [request.selectedBlockTexts, ...(request.fallbackBlockTextGroups ?? [])]
				.filter((group) => group.length > 0);
			let ambiguous = false;
			for (const selectedBlockTexts of groups) {
				const plan = selectedBlockTexts.length === 1
					? planEmbedSelectionAnchor(
						current,
						selectedBlockTexts[0],
						this.nextAnchorId(),
						request.previousSelection,
					)
					: planEmbedSelectionRange(
						current,
						selectedBlockTexts,
						this.nextAnchorId(),
						request.previousSelection,
					);
				if (!plan.ok) {
					ambiguous ||= plan.reason === 'selection-ambiguous';
					continue;
				}
				result = 'anchor' in plan
					? { kind: 'block', anchor: plan.anchor, reused: plan.reused }
					: {
						kind: 'range',
						startAnchor: plan.startAnchor,
						endAnchor: plan.endAnchor,
						reused: plan.reused,
					};
				return plan.nextText;
			}
			throw new Error(
				ambiguous
					? 'Selected Markdown block is ambiguous in the target note'
					: 'Selection must resolve to one Markdown block or contiguous Markdown range before it can be anchored',
			);
		});
		if (!result) throw new Error('Unable to persist the selected Markdown block anchor');
		return { ...result, rollback: mutation.rollback };
	}

	async releaseSelection(
		request: ComposerEmbedSelectionAnchorReleaseRequest,
	): Promise<{ rollback(): Promise<void> }> {
		const file = this.resolve(request.targetPath);
		return this.mutate(
			file,
			(current) => removeManagedEmbedSelectionAnchors(current, request.selection),
		);
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

	private async mutate(
		file: TFile,
		update: (current: string) => string,
	): Promise<{ rollback(): Promise<void> }> {
		let before = '';
		let after = '';
		await this.app.vault.process(file, (current) => {
			before = current;
			after = update(current);
			return after;
		});
		let rolledBack = false;
		return {
			rollback: async () => {
				if (rolledBack || before === after) {
					rolledBack = true;
					return;
				}
				await this.app.vault.process(file, (current) => {
					if (current !== after) {
						throw new Error(`Composer embed anchor rollback conflict: ${file.path}`);
					}
					rolledBack = true;
					return before;
				});
			},
		};
	}
}
