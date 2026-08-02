import type {
	GeneratedOutputClass,
	GeneratedOutputDescriptor,
	GeneratedOutputPathRoots,
	GeneratedOutputPathVariables,
	GeneratedOutputSyncPolicy,
} from './types';

const DOCUMENTATION_ID_PATTERN = /^(UA|DR|LP|LG)-\d{2}$/;
const OUTPUT_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
const VARIABLE_PATTERN = /\{([a-z][a-zA-Z0-9]*)\}/g;

export class GeneratedOutputRegistry {
	private readonly entries: readonly GeneratedOutputDescriptor[];
	private readonly byId = new Map<string, GeneratedOutputDescriptor>();
	private readonly byDocumentationId = new Map<string, GeneratedOutputDescriptor>();

	constructor(descriptors: readonly GeneratedOutputDescriptor[]) {
		for (const descriptor of descriptors) this.register(descriptor);
		this.entries = Object.freeze([...this.byId.values()]);
	}

	list(): readonly GeneratedOutputDescriptor[] {
		return this.entries;
	}

	listByClass(outputClass: GeneratedOutputClass): readonly GeneratedOutputDescriptor[] {
		return this.entries.filter((entry) => entry.outputClass === outputClass);
	}

	listBySyncPolicy(syncPolicy: GeneratedOutputSyncPolicy): readonly GeneratedOutputDescriptor[] {
		return this.entries.filter((entry) => entry.syncPolicy === syncPolicy);
	}

	get(id: string): GeneratedOutputDescriptor | undefined {
		return this.byId.get(id);
	}

	require(id: string): GeneratedOutputDescriptor {
		const descriptor = this.get(id);
		if (!descriptor) throw new Error(`GeneratedOutputRegistry: unknown output id "${id}".`);
		return descriptor;
	}

	resolveRelativePath(id: string, variables: GeneratedOutputPathVariables = {}): string {
		const descriptor = this.require(id);
		if (descriptor.path.scope === 'user-selected') {
			throw new Error(`GeneratedOutputRegistry: output "${id}" uses a user-selected path.`);
		}
		return resolveTemplate(descriptor.path.template, variables, id);
	}

	resolvePath(
		id: string,
		roots: GeneratedOutputPathRoots,
		variables: GeneratedOutputPathVariables = {},
	): string {
		const descriptor = this.require(id);
		if (descriptor.path.scope === 'user-selected') {
			throw new Error(`GeneratedOutputRegistry: output "${id}" uses a user-selected path.`);
		}
		const relative = resolveTemplate(descriptor.path.template, variables, id);
		const root = resolveRoot(descriptor, roots);
		return joinSafe(root, relative);
	}

	private register(source: GeneratedOutputDescriptor): void {
		validateDescriptor(source);
		if (this.byId.has(source.id)) {
			throw new Error(`GeneratedOutputRegistry: duplicate output id "${source.id}".`);
		}
		if (this.byDocumentationId.has(source.documentationId)) {
			throw new Error(
				`GeneratedOutputRegistry: duplicate documentation id "${source.documentationId}".`,
			);
		}
		const descriptor = Object.freeze({
			...source,
			path: Object.freeze({ ...source.path }),
			writerEvidence: Object.freeze([...source.writerEvidence]),
		});
		this.byId.set(descriptor.id, descriptor);
		this.byDocumentationId.set(descriptor.documentationId, descriptor);
	}
}

function validateDescriptor(descriptor: GeneratedOutputDescriptor): void {
	if (!DOCUMENTATION_ID_PATTERN.test(descriptor.documentationId)) {
		throw new Error(`GeneratedOutputRegistry: invalid documentation id "${descriptor.documentationId}".`);
	}
	if (!OUTPUT_ID_PATTERN.test(descriptor.id)) {
		throw new Error(`GeneratedOutputRegistry: invalid output id "${descriptor.id}".`);
	}
	if (!descriptor.owner.trim()) {
		throw new Error(`GeneratedOutputRegistry: output "${descriptor.id}" has no owner.`);
	}
	validatePathPolicy(descriptor);
	validateSchemaVersion(descriptor);
	validateLifecycle(descriptor);
	validateOwnershipPolicy(descriptor);
	if (descriptor.writerEvidence.length === 0) {
		throw new Error(`GeneratedOutputRegistry: output "${descriptor.id}" has no writer evidence.`);
	}
}

function validatePathPolicy(descriptor: GeneratedOutputDescriptor): void {
	const template = descriptor.path.template.trim();
	if (!template) throw new Error(`GeneratedOutputRegistry: output "${descriptor.id}" has no path template.`);
	if (template.startsWith('/') || template.includes('\\')) {
		throw new Error(`GeneratedOutputRegistry: output "${descriptor.id}" has an unsafe path template.`);
	}
	const literalSegments = template.split('/').filter((segment) => !segment.includes('{'));
	if (literalSegments.some((segment) => segment === '.' || segment === '..' || segment === '')) {
		throw new Error(`GeneratedOutputRegistry: output "${descriptor.id}" has an unsafe path template.`);
	}
}

function validateSchemaVersion(descriptor: GeneratedOutputDescriptor): void {
	const needsSchema = descriptor.lifecycle !== 'migration-source'
		&& (descriptor.carrier === 'json' || descriptor.carrier === 'jsonl');
	if (!needsSchema) return;
	if (!Number.isInteger(descriptor.schemaVersion) || (descriptor.schemaVersion ?? 0) < 1) {
		throw new Error(`GeneratedOutputRegistry: output "${descriptor.id}" requires a positive schema version.`);
	}
}

function validateLifecycle(descriptor: GeneratedOutputDescriptor): void {
	if (descriptor.lifecycle === 'migration-source') {
		if (!descriptor.replacementId) {
			throw new Error(`GeneratedOutputRegistry: migration source "${descriptor.id}" needs a replacement id.`);
		}
		if (descriptor.retentionPolicy !== 'owner-approved-retirement') {
			throw new Error(
				`GeneratedOutputRegistry: migration source "${descriptor.id}" needs owner-approved retirement.`,
			);
		}
		return;
	}
	if (descriptor.replacementId) {
		throw new Error(`GeneratedOutputRegistry: active output "${descriptor.id}" cannot declare replacementId.`);
	}
}

function validateOwnershipPolicy(descriptor: GeneratedOutputDescriptor): void {
	if (descriptor.lifecycle === 'migration-source') return;
	if (descriptor.outputClass === 'durable-record') {
		if (descriptor.syncPolicy !== 'required') {
			throw new Error(
				`GeneratedOutputRegistry: durable record "${descriptor.id}" must use required sync.`,
			);
		}
		if (descriptor.peakIndexPolicy !== 'exclude' || descriptor.materializationPolicy !== 'never') {
			throw new Error(
				`GeneratedOutputRegistry: durable record "${descriptor.id}" must stay out of Peak index and never materialize.`,
			);
		}
	}
	if (descriptor.outputClass === 'projection'
		|| descriptor.outputClass === 'cache'
		|| descriptor.outputClass === 'telemetry') {
		if (descriptor.syncPolicy !== 'local-only' || descriptor.peakIndexPolicy !== 'exclude') {
			throw new Error(
				`GeneratedOutputRegistry: local output "${descriptor.id}" must be local-only and excluded from Peak index.`,
			);
		}
		if (descriptor.materializationPolicy !== 'never') {
			throw new Error(`GeneratedOutputRegistry: local output "${descriptor.id}" cannot materialize.`);
		}
	}
	if (descriptor.carrier === 'sqlite' && descriptor.outputClass !== 'projection') {
		throw new Error(`GeneratedOutputRegistry: SQLite output "${descriptor.id}" must be a projection.`);
	}
	if (descriptor.carrier === 'markdown' && descriptor.outputClass !== 'user-artifact') {
		throw new Error(
			`GeneratedOutputRegistry: non-legacy Markdown output "${descriptor.id}" must be user-owned.`,
		);
	}
	if (descriptor.peakIndexPolicy === 'include' && descriptor.outputClass !== 'user-artifact') {
		throw new Error(`GeneratedOutputRegistry: only user artifacts may enter Peak index (${descriptor.id}).`);
	}
}

function resolveRoot(
	descriptor: GeneratedOutputDescriptor,
	roots: GeneratedOutputPathRoots,
): string {
	if (descriptor.path.scope === 'ai-root') return safeRoot(roots.aiRoot, 'aiRoot');
	if (descriptor.path.scope === 'data-store') return safeRoot(roots.dataStore, 'dataStore');
	if (descriptor.path.scope === 'vault-root') {
		return roots.vaultRoot ? safeRoot(roots.vaultRoot, 'vaultRoot') : '';
	}
	const pluginData = roots.pluginData;
	if (!pluginData) {
		throw new Error(`GeneratedOutputRegistry: output "${descriptor.id}" requires pluginData root.`);
	}
	return safeRoot(pluginData, 'pluginData');
}

function safeRoot(root: string, label: string): string {
	const normalized = normalizePath(root);
	if (!normalized) throw new Error(`GeneratedOutputRegistry: ${label} root is empty.`);
	if (hasUnsafeSegment(normalized)) {
		throw new Error(`GeneratedOutputRegistry: ${label} root is unsafe.`);
	}
	return normalized;
}

function resolveTemplate(
	template: string,
	variables: GeneratedOutputPathVariables,
	outputId: string,
): string {
	const resolved = template.replace(VARIABLE_PATTERN, (_match, name: string) => {
		const value = variables[name];
		if (value === undefined || value.trim() === '') {
			throw new Error(
				`GeneratedOutputRegistry: missing path variable "${name}" for output "${outputId}".`,
			);
		}
		const normalized = normalizePath(value);
		if (!normalized || normalized !== value.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
			|| hasUnsafeSegment(normalized)) {
			throw new Error(
				`GeneratedOutputRegistry: unsafe path variable "${name}" for output "${outputId}".`,
			);
		}
		return normalized;
	});
	if (resolved.includes('{') || resolved.includes('}')) {
		throw new Error(`GeneratedOutputRegistry: unresolved path template for output "${outputId}".`);
	}
	const normalized = normalizePath(resolved);
	if (!normalized || hasUnsafeSegment(normalized)) {
		throw new Error(`GeneratedOutputRegistry: resolved path for output "${outputId}" is unsafe.`);
	}
	return normalized;
}

function joinSafe(root: string, relative: string): string {
	return normalizePath(`${root}/${relative}`);
}

function normalizePath(value: string): string {
	return value.trim().replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '');
}

function hasUnsafeSegment(value: string): boolean {
	return value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..');
}
