// T11B: Concrete vault port — narrowly wraps `app.vault` and
// `app.metadataCache` so service-side actions never hold a reference
// to Obsidian's `App` object.

import type { App, TFile } from 'obsidian';
import type { CopilotActionVaultPort } from '@/service/copilot/actions/CopilotActionPorts';

export class ObsidianCopilotActionVaultAdapter implements CopilotActionVaultPort {
	constructor(private readonly app: App) {}

	getMarkdownFiles(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	cachedRead(file: TFile): Promise<string> {
		return this.app.vault.cachedRead(file);
	}

	getFileCache(file: TFile) {
		return this.app.metadataCache.getFileCache(file);
	}

	getResolvedLinks(): Record<string, Record<string, number>> {
		return this.app.metadataCache.resolvedLinks;
	}

	getFirstLinkpathDest(linkpath: string, sourcePath: string): TFile | null {
		return this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
	}
}
