import type { TFile } from 'obsidian';
import type { LintFinding } from '@/core/types/lint';
import type { AtlasGraphModel } from '@/ui/component/graph/AtlasGraphModel';
import type { VaultDigest } from '@/service/copilot/vault/VaultDigestService';
import type {
	VaultActivityRecord,
	VaultCompletedRun,
	VaultIntelligenceEvent,
	VaultMaintenanceProposal,
	VaultMaintenanceAtomicItem,
	VaultMaintenanceOwnerChoice,
	VaultMaintenanceTask,
	VaultMaintenanceTaskState,
	VaultScanPlan,
	VaultScanOperationRoute,
	VaultScanOperationRouteCandidate,
	VaultScanRunState,
	VaultScanScope,
	VaultMapTextEntry,
	VaultActivitySession,
	VaultActivityTheme,
} from '@/core/types/vault-intelligence';
import type { VaultIntelligenceConfig } from './VaultIntelligenceDefaults';

export interface VaultFileTypeSummary {
	extension: string;
	count: number;
	share: number;
}

export interface VaultActivityDay {
	date: string;
	count: number;
	files: Array<{ path: string; modifiedAt: number }>;
}

export interface VaultIntelligenceObjectSummary {
	id: 'files' | 'chats' | 'projects' | 'composer';
	label: string;
	count: number;
	detail: string;
	/** Canonical presentation data only. Never synthesize categories the owning store does not publish. */
	breakdown?: Array<{ id: string; label: string; count: number }>;
	/** Explicitly distinguishes a real one-bucket distribution from a store that only publishes a total. */
	breakdownStatus?: 'available' | 'unavailable';
	coverageNote?: string;
}

export interface VaultCommunityMemberProjection {
	path: string;
	label: string;
	score: number | null;
}

export interface VaultIntelligenceSnapshot {
	loading: boolean;
	error: string | null;
	digest: VaultDigest | null;
	fileTypes: VaultFileTypeSummary[];
	availablePaths: string[];
	activityDays: VaultActivityDay[];
	changedSinceScan: number | null;
	changedCursorAt: number | null;
	indexReadiness: {
		discovered: number;
		searchReady: number | null;
		pendingOrExcluded: number | null;
		builtAt: number | null;
		isReady: boolean;
	};
	objects: VaultIntelligenceObjectSummary[];
	operationRoutes: Partial<Record<VaultScanRunState['operations'][number]['id'], VaultScanOperationRoute>>;
	tasks: VaultMaintenanceTask[];
	run: VaultScanRunState;
	lastCompletedRun: VaultCompletedRun | null;
	recentActivity: VaultActivityRecord[];
	sourceActivity: VaultActivityRecord[];
	proposals: VaultMaintenanceProposal[];
	mapTextEntries: VaultMapTextEntry[];
	activitySessions: VaultActivitySession[];
	activityThemes: VaultActivityTheme[];
	communityMembers: Record<string, VaultCommunityMemberProjection[]>;
	events: VaultIntelligenceEvent[];
}

export interface VaultIntelligenceWorkspaceRuntime {
	getSnapshot: () => VaultIntelligenceSnapshot;
	subscribe: (listener: () => void) => () => void;
	refresh: () => Promise<void>;
	selectOperationRoute: (operationId: VaultScanRunState['operations'][number]['id'], candidate: VaultScanOperationRouteCandidate) => Promise<void>;
	startScan: (plan: VaultScanPlan) => Promise<void>;
	resumeScan: () => Promise<void>;
	requestStop: () => void;
	skipOperation: (operationId: VaultScanRunState['operations'][number]['id']) => void;
	choose: (taskId: string, atomicItemId: string | null, choiceId: string, choiceValue?: string | null) => Promise<void>;
	applyTask: (taskId: string) => Promise<void>;
	prepareProposal: (taskId: string) => Promise<void>;
	applyProposal: (proposalId: string) => Promise<void>;
	rejectProposal: (proposalId: string) => Promise<void>;
	setProposalChangeSelected: (proposalId: string, changeId: string, selected: boolean) => Promise<void>;
	verifyTask: (taskId: string) => Promise<void>;
	saveMapText: (communityId: string, text: string) => Promise<void>;
	publishMapText: (communityId: string) => Promise<void>;
	keepMapText: (communityId: string) => Promise<void>;
	analyzeActivityThemes: (rangeStart: number, rangeEnd: number) => Promise<void>;
	expandCommunity: (communityId: string) => Promise<void>;
	openFile: (path: string) => Promise<boolean>;
	openOwnerSurface: (surface: VaultIntelligenceObjectSummary['id']) => Promise<boolean>;
}

export function createVaultScanPlan(
	config: VaultIntelligenceConfig,
	scope: VaultScanScope,
	now = Date.now(),
): VaultScanPlan {
	return {
		scope,
		enabledCheckIds: config.checkGroups.flatMap((group) => group.checks.flatMap((check) => check.checkIds ?? [check.checkId])),
		indexOutputs: config.indexOutputs.map((output) => ({
			id: output.id,
			enabled: defaultIndexOutputEnabled(output),
			availability: output.availability,
			operationIds: output.operationIds,
		})),
		aiOperations: config.scanOperations.map((operation) => ({
			id: operation.id,
			enabled: operation.defaultEnabled,
			model: operation.model,
			provider: operation.provider,
			estimatedTokens: operation.estimatedTokens,
			estimatedCostUsd: operation.estimatedCostUsd,
		})),
		createdAt: now,
	};
}

function defaultIndexOutputEnabled(output: VaultIntelligenceConfig['indexOutputs'][number]): boolean {
	if (output.availability === 'required' || output.availability === 'automatic') return true;
	if (output.availability !== 'optional') return false;
	return output.defaultEnabled ?? true;
}

export function createEmptyVaultScanRun(): VaultScanRunState {
	return {
		id: null,
		status: 'idle',
		plan: null,
		currentStage: null,
		completedStages: [],
		stages: [
			{ id: 'discover', status: 'waiting', processed: 0, total: 0, message: 'Waiting' },
			{ id: 'index', status: 'waiting', processed: 0, total: 0, message: 'Waiting' },
			{ id: 'ai', status: 'waiting', processed: 0, total: 0, message: 'Waiting' },
			{ id: 'publish', status: 'waiting', processed: 0, total: 0, message: 'Waiting' },
		],
		operations: [],
		frozenPaths: [],
		startedAt: null,
		completedAt: null,
		warnings: [],
		error: null,
		stopRequested: false,
	};
}

export function deriveVaultMaintenanceTasks(options: {
	config: VaultIntelligenceConfig;
	findings: readonly LintFinding[];
	unreadableErrors: readonly { path: string; message: string }[];
	previous: readonly VaultMaintenanceTask[];
	runId: string;
	now: number;
	fileMtime: (path: string) => number | null;
}): VaultMaintenanceTask[] {
	const previousByKind = new Map(options.previous.map((task) => [task.kind, task]));
	const openFindings = options.findings.filter((finding) => finding.status === 'open');
	const tasks: VaultMaintenanceTask[] = [];
	for (const definition of options.config.tasks) {
		const matching = openFindings.filter((finding) => definition.signalIds.includes(finding.signalId));
		const previous = previousByKind.get(definition.kind);
		const previousChoices = new Map(
			previous?.atomicItems.map((item) => [item.id, item.ownerChoice] as const) ?? [],
		);
		let atomicItems: VaultMaintenanceAtomicItem[] = matching.map((finding) => {
			const projection = projectionForFinding(definition.kind, finding);
			return {
				id: finding.id,
				sourceFindingId: finding.id,
				signalId: finding.signalId,
				filePath: finding.filePath,
				title: finding.title,
				evidence: finding.description,
				projectionKey: projection.key,
				projectionLabel: projection.label,
				suggestedChoiceId: suggestedChoiceFor(definition.kind, finding),
				suggestedValue: suggestedValueFor(definition.kind, finding),
				proposalPatch: proposalPatchFor(finding),
				ownerChoice: previousChoices.get(finding.id) ?? null,
			};
		});
		if (definition.kind === 'unreadable-files') {
			atomicItems = options.unreadableErrors.map((error) => ({
				id: `index-error:${error.path}`,
				sourceFindingId: null,
				signalId: null,
				filePath: error.path || null,
				title: error.path || 'Index pipeline',
				evidence: error.message,
				projectionKey: error.message,
				projectionLabel: 'Index error',
				suggestedChoiceId: 'retry',
				suggestedValue: null,
				proposalPatch: null,
				ownerChoice: previousChoices.get(`index-error:${error.path}`) ?? null,
			}));
		}
		if (atomicItems.length === 0) continue;
		const paths = new Set(atomicItems.flatMap((item) => item.filePath ? [item.filePath] : []));
		const proposalChoiceIds = new Set(definition.choices
			.filter((choice) => choice.boundary === 'proposal')
			.map((choice) => choice.id));
		const hasStaleProposal = atomicItems.some((item) => {
			const choice = item.ownerChoice ?? previous?.defaultChoice;
			if (!item.filePath || !choice || !proposalChoiceIds.has(choice.choiceId) || choice.sourceRevision === null) return false;
			return options.fileMtime(item.filePath) !== choice.sourceRevision;
		});
		const defaultChoice = previous?.defaultChoice && atomicItems.every((item) => item.ownerChoice)
			? previous.defaultChoice
			: null;
		const task: VaultMaintenanceTask = {
			id: `maintenance:${definition.kind}`,
			kind: definition.kind,
			sourceRunId: options.runId,
			category: definition.category,
			state: hasStaleProposal
				? 'recovery'
				: deriveMaintenanceState(definition.initialState, atomicItems, defaultChoice),
			title: definition.title,
			typeLabel: definition.typeLabel,
			affectedLabel: maintenanceAffectedLabel(definition.kind, atomicItems.length),
			contextLabel: `${paths.size.toLocaleString()} ${paths.size === 1 ? 'file' : 'files'}`,
			impact: definition.impact,
			atomicItems,
			defaultChoice,
			createdAt: previous?.createdAt ?? options.now,
			updatedAt: options.now,
		};
		tasks.push(task);
	}
	return tasks;
}

function proposalPatchFor(finding: LintFinding): VaultMaintenanceAtomicItem['proposalPatch'] {
	const candidate = finding.metadata.proposalPatch;
	if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
	const patch = candidate as Record<string, unknown>;
	if (typeof patch.beforeText !== 'string' || typeof patch.afterText !== 'string' || !patch.beforeText) return null;
	return {
		beforeText: patch.beforeText,
		afterText: patch.afterText,
		label: typeof patch.label === 'string' ? patch.label : undefined,
	};
}

function suggestedValueFor(kind: VaultMaintenanceTask['kind'], finding: LintFinding): string | null {
	if (kind !== 'broken-links') return null;
	const value = finding.metadata.suggestedReplacement;
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function maintenanceAffectedLabel(kind: VaultMaintenanceTask['kind'], count: number): string {
	return `${count.toLocaleString()} ${affectedUnit(kind, count)}`;
}

function affectedUnit(kind: VaultMaintenanceTask['kind'], count: number): string {
	const plural = count === 1 ? '' : 's';
	if (kind === 'broken-links') return `reference${plural}`;
	if (kind === 'knowledge-connections') return `connection${plural}`;
	if (kind === 'related-notes') return `note${plural}`;
	if (kind === 'note-split') return `split proposal${plural}`;
	if (kind === 'community-structure') return `structure proposal${plural}`;
	if (kind === 'community-hubs') return `index note${plural}`;
	if (kind === 'unreadable-files') return `document${plural}`;
	return `note${plural}`;
}

function projectionForFinding(
	kind: VaultMaintenanceTask['kind'],
	finding: LintFinding,
): { key: string; label: string } {
	const metadata = finding.metadata;
	const first = (...keys: string[]): string | null => {
		for (const key of keys) {
			const value = metadata[key];
			if (typeof value === 'string' && value.trim()) return value;
		}
		return null;
	};
	if (kind === 'file-properties') return { key: 'property-proposals', label: 'Property proposals' };
	if (kind === 'broken-links') {
		const target = first('brokenTarget', 'targetPath', 'target') ?? finding.title;
		return { key: `target:${target}`, label: target };
	}
	if (kind === 'community-membership') {
		const community = first('suggestedCommunityLabel', 'communityLabel', 'clusterLabel') ?? 'Unassigned notes';
		return { key: `community:${community}`, label: community };
	}
	if (kind === 'knowledge-connections') {
		const connection = first('connectionLabel', 'bridgeLabel', 'targetPath') ?? finding.title;
		return { key: `connection:${connection}`, label: connection };
	}
	if (kind === 'related-notes') {
		const group = first('groupLabel', 'duplicateGroupId', 'clusterLabel') ?? finding.title;
		return { key: `related:${group}`, label: group };
	}
	if (kind === 'note-split') return { key: `source:${finding.filePath ?? finding.id}`, label: finding.filePath ?? finding.title };
	if (kind === 'community-structure') {
		const community = first('clusterLabel', 'communityLabel') ?? finding.title;
		return { key: `structure:${community}`, label: community };
	}
	if (kind === 'community-hubs') {
		const community = first('communityLabel', 'clusterLabel') ?? finding.title;
		return { key: `hub:${community}`, label: community };
	}
	if (kind === 'content-lifecycle') return { key: `lifecycle:${finding.signalId}`, label: lifecycleLabel(finding.signalId) };
	if (kind === 'unusual-notes') return { key: `signal:${finding.signalId}`, label: finding.signalId };
	return { key: finding.id, label: finding.title };
}

function lifecycleLabel(signalId: string): string {
	if (signalId === 'C-STUB') return 'Incomplete notes';
	if (signalId === 'T-ABANDONED-FOLDER') return 'Inactive folder';
	return 'Lifecycle review';
}

function suggestedChoiceFor(kind: VaultMaintenanceTask['kind'], finding: LintFinding): string | null {
	if (kind === 'unreadable-files') return 'retry';
	if (kind === 'community-membership' && finding.metadata.suggestedCommunityLabel) return 'suggested';
	if (kind === 'broken-links' && finding.metadata.suggestedReplacement) return 'redirect';
	if (kind === 'content-lifecycle' && finding.signalId === 'C-STUB') return 'paused';
	return null;
}

export function deriveMaintenanceState(
	fallback: VaultMaintenanceTaskState,
	items: readonly VaultMaintenanceAtomicItem[],
	defaultChoice: VaultMaintenanceOwnerChoice | null,
): VaultMaintenanceTaskState {
	const choices = items.map((item) => item.ownerChoice ?? defaultChoice);
	if (choices.length > 0 && choices.every((choice) => choice?.status === 'verified')) return 'verified';
	if (choices.length > 0 && choices.every((choice) => choice && choice.choiceId !== 'later')) return 'ready-apply';
	return fallback;
}

export function buildVaultIntelligenceGraph(
	digest: VaultDigest | null,
	options: {
		extension?: string | null;
		expandedCommunityIds?: ReadonlySet<string>;
		communityMembers?: Record<string, VaultCommunityMemberProjection[]>;
	} = {},
): AtlasGraphModel | null {
	if (!digest || digest.clusters.length === 0) return null;
	const extension = options.extension?.toLocaleLowerCase() ?? null;
	const nodes: AtlasGraphModel['nodes'][number][] = [];
	const edges: AtlasGraphModel['edges'][number][] = [];
	for (const cluster of digest.clusters) {
		const communityId = `community:${cluster.id}`;
		nodes.push({
			id: communityId,
			path: communityId,
			label: cluster.label,
			role: 'root',
			score: Math.max(1, cluster.memberCount),
			communityId: cluster.id,
			constituentCount: cluster.memberCount,
			metadata: { kind: 'community', memberCount: cluster.memberCount, topics: cluster.dominantTopics },
		});
		const representatives = (options.expandedCommunityIds?.has(cluster.id)
			? options.communityMembers?.[cluster.id]?.map((member) => ({ path: member.path, label: member.label, betweenness: member.score ?? undefined })) ?? cluster.topNodes
			: cluster.topNodes).filter((node) => (
			!extension || node.path.toLocaleLowerCase().endsWith(`.${extension}`)
		));
		for (const node of representatives.slice(0, options.expandedCommunityIds?.has(cluster.id) ? 60 : 6)) {
			const nodeId = `note:${node.path}`;
			nodes.push({
				id: nodeId,
				path: node.path,
				label: node.label || node.path,
				role: 'document',
				score: Math.max(0.2, node.betweenness ?? 0.2),
				communityId: cluster.id,
				metadata: { kind: 'topic-or-hub', communityLabel: cluster.label },
			});
			edges.push({
				id: `contains:${cluster.id}:${node.path}`,
				source: communityId,
				target: nodeId,
				role: 'hub_constituent',
				directionality: 'undirected',
				weight: 1,
				label: 'contains',
				relationId: null,
			});
		}
	}
	for (const link of digest.communityLinks ?? []) {
		const source = `community:${link.communityAId}`;
		const target = `community:${link.communityBId}`;
		if (!nodes.some((node) => node.id === source) || !nodes.some((node) => node.id === target)) continue;
		edges.push({
			id: `reference:${link.communityAId}:${link.communityBId}`,
			source,
			target,
			role: 'reference',
			directionality: 'directed',
			weight: Math.max(1, Math.log2(link.referenceCount + 1)),
			label: `${link.referenceCount.toLocaleString()} references`,
			relationId: null,
			metadata: { kind: 'verified-cross-community-reference', referenceCount: link.referenceCount },
		});
	}
	return { id: `vault-intelligence:${digest.computedAt}:${extension ?? 'all'}`, nodes, edges, layerRole: 'semantic' };
}

export function summarizeVaultFileTypes(files: readonly TFile[]): VaultFileTypeSummary[] {
	const counts = new Map<string, number>();
	for (const file of files) {
		const extension = file.extension.toLocaleLowerCase() || '(none)';
		counts.set(extension, (counts.get(extension) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([extension, count]) => ({ extension, count, share: files.length ? count / files.length : 0 }))
		.sort((left, right) => right.count - left.count || left.extension.localeCompare(right.extension));
}

export function toLocalDateKey(value: number | Date): string {
	const date = value instanceof Date ? value : new Date(value);
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function summarizeVaultActivity(files: readonly TFile[]): VaultActivityDay[] {
	const days = new Map<string, VaultActivityDay>();
	for (const file of files.filter(isActivityFile)) {
		const date = toLocalDateKey(file.stat.mtime);
		const day = days.get(date) ?? { date, count: 0, files: [] };
		day.count += 1;
		day.files.push({ path: file.path, modifiedAt: file.stat.mtime });
		days.set(date, day);
	}
	return [...days.values()]
		.map((day) => ({ ...day, files: day.files.sort((left, right) => right.modifiedAt - left.modifiedAt) }))
		.sort((left, right) => left.date.localeCompare(right.date));
}

function isActivityFile(file: TFile): boolean {
	return file.extension.toLocaleLowerCase() !== 'sqlite';
}
