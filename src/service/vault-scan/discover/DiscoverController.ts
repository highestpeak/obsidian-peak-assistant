import { sha256Text } from '@/core/storage/generated-output/GeneratedOutputIntegrity';
import type { VaultScanPlan, VaultScanOperationRoute } from '@/core/types/vault-intelligence';
import type { FrozenModelRoute, FrozenRoutePolicy, FrozenScanPlan, FrozenScopeManifest, ScanProgressPlan, VaultScanIndexLayerId, WorkGraphManifest } from '@/core/types/vault-scan';
import { DEFAULT_SCAN_PROGRESS_WEIGHTS } from '../ScanProgressCalculator';

export interface DiscoverSourceFile {
	path: string;
	mtime: number;
	size: number;
	sha256?: string | null;
}

export interface DiscoverInput {
	scanRunId: string;
	draft: VaultScanPlan;
	files: readonly DiscoverSourceFile[];
	routes: Partial<Record<string, VaultScanOperationRoute>>;
	selectedTaskIds: readonly string[];
	discoveryObjectives: readonly string[];
	now: number;
}

export class DiscoverController {
	build(input: DiscoverInput): FrozenScanPlan {
		const files = [...input.files].sort((left, right) => left.path.localeCompare(right.path));
		const snapshotId = `snapshot-${sha256Text(JSON.stringify(files.map((file) => [file.path, file.mtime, file.size, file.sha256 ?? null]))).slice(0, 16)}`;
		const scope = this.freezeScope(input.draft, snapshotId, files, input.now);
		const layers = enabledIndexLayers(input.draft);
		const routePolicies = Object.fromEntries(Object.entries(input.routes).map(([operationId, route]) => [operationId, freezeRoutePolicy(operationId, route!)]));
		const progressPlan = buildProgressPlan(layers, files.length, input.discoveryObjectives.length, input.now);
		const workGraph = buildWorkGraph(snapshotId, scope.paths, layers);
		const withoutFingerprint = {
			schemaVersion: 1 as const,
			scanRunId: input.scanRunId,
			snapshotId,
			scope,
			selectedTaskIds: [...input.selectedTaskIds],
			enabledIndexLayers: layers,
			discoveryObjectives: [...input.discoveryObjectives],
			routePolicies,
			progressPlan,
			workGraph,
			createdAt: input.now,
		};
		return { ...withoutFingerprint, fingerprint: sha256Text(JSON.stringify(withoutFingerprint)) };
	}

	private freezeScope(draft: VaultScanPlan, snapshotId: string, files: readonly DiscoverSourceFile[], now: number): FrozenScopeManifest {
		const selected = new Set(draft.scope.selectedPaths);
		const scoped = draft.scope.mode === 'selected' ? files.filter((file) => selected.has(file.path)) : files;
		const revisions = scoped.map((file) => ({ path: file.path, mtime: file.mtime, size: file.size, sha256: file.sha256 ?? null }));
		const withoutFingerprint = { snapshotId, mode: draft.scope.mode, paths: revisions.map((file) => file.path), sourceRevisions: revisions, excluded: [], unreadable: [], frozenAt: now };
		return { ...withoutFingerprint, fingerprint: sha256Text(JSON.stringify(withoutFingerprint)) };
	}
}

function enabledIndexLayers(plan: VaultScanPlan): VaultScanIndexLayerId[] {
	const outputs = plan.indexOutputs ?? [];
	const layers: VaultScanIndexLayerId[] = [];
	if (outputs.some((output) => output.enabled && ['fulltext', 'keywords', 'pdf-text', 'canvas-text'].includes(output.id)) || outputs.length === 0) layers.push('full-text');
	if (outputs.some((output) => output.enabled && output.id === 'embeddings')) layers.push('embedding');
	if (outputs.some((output) => output.enabled && ['markdown-summary', 'pdf-summary', 'image-summary', 'canvas-summary', 'ai-topic-tags', 'functional-tags', 'context-entities', 'inferred-date', 'image-description'].includes(output.id))) layers.push('ai-enrichment');
	return layers;
}

function freezeRoutePolicy(operationId: string, route: VaultScanOperationRoute): FrozenRoutePolicy {
	const candidates: FrozenModelRoute[] = (route.candidates?.length ? route.candidates : route.profileId ? [{ profileId: route.profileId, provider: route.provider, model: route.model, selectable: route.available }] : []).map((candidate) => ({ profileId: candidate.profileId, provider: candidate.provider, model: candidate.model, selectable: candidate.selectable !== false, local: ['ollama', 'lmstudio', 'lm-studio'].includes(candidate.provider.toLowerCase()) }));
	const withoutFingerprint = { operationId, candidates, strategy: candidates.length > 1 ? 'capacity-aware' as const : 'single' as const, maxConcurrency: 4, localMaxConcurrency: 1, retryPolicy: { maxAttempts: 2, baseDelayMs: 500 } };
	return { ...withoutFingerprint, fingerprint: sha256Text(JSON.stringify(withoutFingerprint)) };
}

function buildProgressPlan(layers: readonly VaultScanIndexLayerId[], files: number, objectives: number, now: number): ScanProgressPlan {
	const withoutFingerprint = { schemaVersion: 1 as const, weights: DEFAULT_SCAN_PROGRESS_WEIGHTS, discoverGateIds: ['scope-frozen', 'evidence-snapshot-pinned', 'execution-plan-resolved', 'work-graph-published'] as const, indexUnitCount: files * layers.length, discoveryObjectiveCount: objectives, createdAt: now };
	return { ...withoutFingerprint, fingerprint: sha256Text(JSON.stringify(withoutFingerprint)) };
}

function buildWorkGraph(snapshotId: string, paths: readonly string[], layers: readonly VaultScanIndexLayerId[]): WorkGraphManifest {
	const workUnitKeys = paths.flatMap((path) => layers.map((layer) => `${snapshotId}\u0000${path}\u0000${layer}\u0000v1`));
	const nodes = [
		{ id: 'discover', stageId: 'discover' as const, dependsOn: [] },
		{ id: 'full-text', stageId: 'index' as const, dependsOn: ['discover'] },
		{ id: 'embedding', stageId: 'index' as const, dependsOn: ['full-text'] },
		{ id: 'ai-enrichment', stageId: 'index' as const, dependsOn: ['full-text'] },
		{ id: 'evidence', stageId: 'ai' as const, dependsOn: ['full-text'] },
		{ id: 'discovery', stageId: 'ai' as const, dependsOn: ['evidence'] },
		{ id: 'prepare-review', stageId: 'prepare-review' as const, dependsOn: ['embedding', 'ai-enrichment', 'discovery'] },
		{ id: 'publish', stageId: 'publish' as const, dependsOn: ['prepare-review'] },
	];
	const withoutFingerprint = { snapshotId, nodes, workUnitKeys, evidenceFloor: ['full-text-terminal', 'graph-snapshot-pinned', 'strong-dependencies-accounted'] };
	return { ...withoutFingerprint, fingerprint: sha256Text(JSON.stringify(withoutFingerprint)) };
}
