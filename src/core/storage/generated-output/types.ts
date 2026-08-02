export type GeneratedOutputClass =
	| 'user-artifact'
	| 'durable-record'
	| 'projection'
	| 'cache'
	| 'telemetry';

export type GeneratedOutputCarrier =
	| 'markdown'
	| 'native'
	| 'json'
	| 'jsonl'
	| 'sqlite'
	| 'binary';

export type GeneratedOutputLifecycle = 'active' | 'planned' | 'migration-source';
export type GeneratedOutputSyncPolicy = 'required' | 'optional' | 'local-only';
export type GeneratedOutputPeakIndexPolicy = 'include' | 'exclude';
export type GeneratedOutputMaterializationPolicy = 'automatic' | 'explicit' | 'never';
export type GeneratedOutputRetentionPolicy =
	| 'user-managed'
	| 'durable'
	| 'rebuildable'
	| 'bounded'
	| 'owner-approved-retirement';
export type GeneratedOutputPathScope =
	| 'vault-root'
	| 'ai-root'
	| 'data-store'
	| 'plugin-data'
	| 'user-selected';

export interface GeneratedOutputPathPolicy {
	readonly scope: GeneratedOutputPathScope;
	/** Relative path template. Placeholders use `{name}` and are resolved safely. */
	readonly template: string;
}

export interface GeneratedOutputDescriptor {
	/** Stable ID in docs/conventions/generated-artifact-registry.md, e.g. DR-10. */
	readonly documentationId: string;
	/** Stable runtime ID used by writers and storage routing. */
	readonly id: string;
	readonly owner: string;
	readonly lifecycle: GeneratedOutputLifecycle;
	readonly outputClass: GeneratedOutputClass;
	readonly carrier: GeneratedOutputCarrier;
	readonly syncPolicy: GeneratedOutputSyncPolicy;
	readonly peakIndexPolicy: GeneratedOutputPeakIndexPolicy;
	readonly materializationPolicy: GeneratedOutputMaterializationPolicy;
	readonly retentionPolicy: GeneratedOutputRetentionPolicy;
	readonly path: GeneratedOutputPathPolicy;
	readonly schemaVersion?: number;
	/** Required when lifecycle is migration-source. */
	readonly replacementId?: string;
	/** Source files that currently own or adapt writes for this output. */
	readonly writerEvidence: readonly string[];
}

export interface GeneratedOutputPathRoots {
	readonly vaultRoot?: string;
	readonly aiRoot: string;
	readonly dataStore: string;
	readonly pluginData?: string;
}

export type GeneratedOutputPathVariables = Readonly<Record<string, string>>;
