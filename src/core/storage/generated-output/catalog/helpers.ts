import type {
	GeneratedOutputCarrier,
	GeneratedOutputClass,
	GeneratedOutputDescriptor,
	GeneratedOutputLifecycle,
	GeneratedOutputPathPolicy,
	GeneratedOutputPathScope,
	GeneratedOutputPeakIndexPolicy,
	GeneratedOutputRetentionPolicy,
	GeneratedOutputUserSurface,
} from '../types';

export function outputPath(
	scope: GeneratedOutputPathScope,
	template: string,
): GeneratedOutputPathPolicy {
	return { scope, template };
}

interface CommonOutputInput {
	documentationId: string;
	id: string;
	owner: string;
	carrier: GeneratedOutputCarrier;
	path: GeneratedOutputPathPolicy;
	writerEvidence: readonly string[];
	lifecycle?: Exclude<GeneratedOutputLifecycle, 'migration-source'>;
}

interface UserArtifactInput extends CommonOutputInput {
	peakIndexPolicy?: GeneratedOutputPeakIndexPolicy;
	userSurface: GeneratedOutputUserSurface;
}

export function userArtifact(input: UserArtifactInput): GeneratedOutputDescriptor {
	return {
		...input,
		lifecycle: input.lifecycle ?? 'active',
		outputClass: 'user-artifact',
		syncPolicy: 'required',
		peakIndexPolicy: input.peakIndexPolicy ?? 'include',
		materializationPolicy: 'explicit',
		retentionPolicy: 'user-managed',
	};
}

export function durableRecord(input: CommonOutputInput): GeneratedOutputDescriptor {
	const needsSchema = input.carrier === 'json' || input.carrier === 'jsonl';
	return {
		...input,
		lifecycle: input.lifecycle ?? 'planned',
		outputClass: 'durable-record',
		syncPolicy: 'required',
		peakIndexPolicy: 'exclude',
		materializationPolicy: 'never',
		retentionPolicy: 'durable',
		...(needsSchema ? { schemaVersion: 1 } : {}),
	};
}

interface LocalOutputInput extends CommonOutputInput {
	outputClass: Extract<GeneratedOutputClass, 'projection' | 'cache' | 'telemetry'>;
	retentionPolicy?: Extract<GeneratedOutputRetentionPolicy, 'rebuildable' | 'bounded'>;
}

export function localOutput(input: LocalOutputInput): GeneratedOutputDescriptor {
	const needsSchema = input.carrier === 'json' || input.carrier === 'jsonl';
	return {
		...input,
		lifecycle: input.lifecycle ?? 'active',
		syncPolicy: 'local-only',
		peakIndexPolicy: 'exclude',
		materializationPolicy: 'never',
		retentionPolicy: input.retentionPolicy ?? 'rebuildable',
		...(needsSchema ? { schemaVersion: 1 } : {}),
	};
}

interface LegacyOutputInput extends CommonOutputInput {
	replacementId: string;
	outputClass: GeneratedOutputClass;
}

export function legacyOutput(input: LegacyOutputInput): GeneratedOutputDescriptor {
	return {
		...input,
		lifecycle: 'migration-source',
		syncPolicy: 'optional',
		peakIndexPolicy: 'exclude',
		materializationPolicy: 'never',
		retentionPolicy: 'owner-approved-retirement',
	};
}
