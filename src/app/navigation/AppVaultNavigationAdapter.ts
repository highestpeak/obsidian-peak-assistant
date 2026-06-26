// T11N: Concrete Obsidian implementation of `VaultNavigationPort`. The
// only place in the codebase that closes over `app.workspace.openLinkText`
// for the non-Copilot UI surface (BriefingCard, PushCard, chat-view
// OpenLink event, VaultAutoRunModal history helper).

import type { App, TFile } from 'obsidian';
import type {
	VaultNavigationOpenOptions,
	VaultNavigationPort,
} from '@/service/navigation/VaultNavigationPort';

function isFile(f: unknown): f is TFile {
	return !!f && typeof f === 'object' && 'extension' in (f as Record<string, unknown>);
}

export class AppVaultNavigationAdapter implements VaultNavigationPort {
	constructor(private readonly app: App) {}

	async openLink(path: string, opts: VaultNavigationOpenOptions = {}): Promise<void> {
		const newLeaf = opts.newLeaf ?? 'tab';
		const sourcePath = opts.sourcePath ?? this.app.workspace.getActiveFile()?.path ?? '';
		const file = this.app.vault.getAbstractFileByPath(path);
		if (isFile(file)) {
			await this.app.workspace.getLeaf(newLeaf as any).openFile(file);
			return;
		}
		// Fallback for unresolved paths / wikilink targets — let Obsidian's
		// metadata cache figure it out.
		await this.app.workspace.openLinkText(path, sourcePath, newLeaf as any);
	}
}
