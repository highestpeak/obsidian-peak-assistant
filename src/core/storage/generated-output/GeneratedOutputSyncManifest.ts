import type { GeneratedOutputRegistry } from './GeneratedOutputRegistry';
import type {
	GeneratedOutputLifecycle,
	GeneratedOutputPathScope,
	GeneratedOutputSyncPolicy,
} from './types';

export type GeneratedOutputSyncDisposition = 'include' | 'conditional' | 'exclude' | 'preserve-legacy';

export interface GeneratedOutputSyncEntry {
	readonly outputId: string;
	readonly documentationId: string;
	readonly disposition: GeneratedOutputSyncDisposition;
	readonly syncPolicy: GeneratedOutputSyncPolicy;
	readonly lifecycle: GeneratedOutputLifecycle;
	readonly scope: GeneratedOutputPathScope;
	readonly pathTemplate: string;
	readonly transportPattern: string;
}
export interface GeneratedOutputSyncManifest {
	readonly schemaVersion: 1;
	readonly entries: readonly GeneratedOutputSyncEntry[];
	readonly include: readonly GeneratedOutputSyncEntry[];
	readonly conditional: readonly GeneratedOutputSyncEntry[];
	readonly exclude: readonly GeneratedOutputSyncEntry[];
	readonly preserveLegacy: readonly GeneratedOutputSyncEntry[];
}

/**
 * Derived transport-neutral manifest. A sync implementation may translate the
 * logical scope prefixes to Git, iCloud, Syncthing, or backup-specific rules.
 */
export function buildGeneratedOutputSyncManifest(
	registry: GeneratedOutputRegistry,
): GeneratedOutputSyncManifest {
	const entries = registry.list().map((descriptor): GeneratedOutputSyncEntry => {
		const disposition = resolveDisposition(descriptor.lifecycle, descriptor.syncPolicy);
		return Object.freeze({
			outputId: descriptor.id,
			documentationId: descriptor.documentationId,
			disposition,
			syncPolicy: descriptor.syncPolicy,
			lifecycle: descriptor.lifecycle,
			scope: descriptor.path.scope,
			pathTemplate: descriptor.path.template,
			transportPattern: toTransportPattern(descriptor.path.scope, descriptor.path.template),
		});
	});
	return Object.freeze({
		schemaVersion: 1 as const,
		entries: Object.freeze(entries),
		include: Object.freeze(entries.filter((entry) => entry.disposition === 'include')),
		conditional: Object.freeze(entries.filter((entry) => entry.disposition === 'conditional')),
		exclude: Object.freeze(entries.filter((entry) => entry.disposition === 'exclude')),
		preserveLegacy: Object.freeze(entries.filter((entry) => entry.disposition === 'preserve-legacy')),
	});
}

function resolveDisposition(
	lifecycle: GeneratedOutputLifecycle,
	syncPolicy: GeneratedOutputSyncPolicy,
): GeneratedOutputSyncDisposition {
	if (lifecycle === 'migration-source') return 'preserve-legacy';
	if (syncPolicy === 'required') return 'include';
	if (syncPolicy === 'optional') return 'conditional';
	return 'exclude';
}

function toTransportPattern(scope: GeneratedOutputPathScope, template: string): string {
	if (scope === 'user-selected') return 'user-selected://*';
	const glob = template.replace(/\{[a-z][a-zA-Z0-9]*\}/g, '*');
	return `${scope}://${glob}`;
}
