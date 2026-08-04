import { TFile, normalizePath, type App } from 'obsidian';
import type { GeneratedOutputDescriptor, GeneratedOutputRegistry } from '@/core/storage/generated-output';
import type { MyContentItem, MyContentPort } from '@/core/ports/MyContentPort';
import type { HubGenerationRuntime } from '@/service/hub/HubGenerationRuntime';

export interface MyContentRuntimeOptions {
	app: App;
	registry: GeneratedOutputRegistry;
	resolveAiRoot: () => string;
	getHubRuntime?: () => Pick<HubGenerationRuntime, 'listExplicitMaterializedHubs'> | null;
}

/**
 * Lists only materialized, user-owned files whose producer and type can be
 * verified from the current output registry. JSON/JSONL, projections, caches
 * and arbitrary Vault files never enter this surface.
 *
 * Some explicit exports use a user-selected location. Their writers do not
 * yet record a durable user-surface receipt, so guessing from file extension
 * would mislabel ordinary Vault notes. They are intentionally excluded until
 * their owners provide that receipt.
 */
export class MyContentRuntime implements MyContentPort {
	constructor(private readonly opts: MyContentRuntimeOptions) {}

	async list(): Promise<readonly MyContentItem[]> {
		const candidates = this.opts.registry.listMyContentTypes()
			.filter((descriptor) => descriptor.path.scope === 'ai-root' && descriptor.id !== 'hub.materialized-note');
		const items: MyContentItem[] = [];
		for (const file of this.opts.app.vault.getFiles()) {
			const descriptor = candidates.find((candidate) => matchesDescriptorPath(candidate, file.path, this.opts.resolveAiRoot()));
			if (!descriptor?.userSurface?.kind || !descriptor.userSurface.source || !descriptor.userSurface.label) continue;
			items.push({
				id: `${descriptor.id}:${file.path}`,
				path: file.path,
				title: file.basename,
				typeLabel: descriptor.userSurface.label,
				kind: descriptor.userSurface.kind,
				source: descriptor.userSurface.source,
				createdAt: file.stat.ctime,
				updatedAt: file.stat.mtime,
			});
		}
		const hubRuntime = this.opts.getHubRuntime?.();
		if (hubRuntime) {
			for (const hub of await hubRuntime.listExplicitMaterializedHubs()) {
				const path = hub.manifest.materialization.path;
				if (!path) continue;
				const file = this.opts.app.vault.getAbstractFileByPath(path);
				if (!(file instanceof TFile)) continue;
				items.push({
					id: `hub.materialized-note:${hub.manifest.hubId}`,
					path,
					title: hub.manifest.label,
					typeLabel: 'Materialized Hub',
					kind: 'hub',
					source: 'hub',
					createdAt: hub.materializedAt,
					updatedAt: hub.materializedAt,
				});
			}
		}
		return items.sort((a, b) => b.updatedAt - a.updatedAt || a.title.localeCompare(b.title));
	}

	async open(path: string): Promise<void> {
		const file = this.opts.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) throw new Error('This saved item is no longer in the Vault.');
		const leaf = this.opts.app.workspace.getLeaf('tab');
		await leaf.openFile(file, { active: true });
	}
}

function matchesDescriptorPath(descriptor: GeneratedOutputDescriptor, path: string, aiRoot: string): boolean {
	const root = normalizePath(aiRoot).replace(/^\/+|\/+$/g, '');
	const template = descriptor.path.template.replace(/^\/+|\/+$/g, '');
	const expected = root ? `${root}/${template}` : template;
	const escaped = expected
		.split(/(\{[a-z][a-zA-Z0-9]*\})/g)
		.map((part) => /^\{[a-z][a-zA-Z0-9]*\}$/.test(part)
			? '[^/]+'
			: part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
		.join('');
	return new RegExp(`^${escaped}$`).test(normalizePath(path));
}
