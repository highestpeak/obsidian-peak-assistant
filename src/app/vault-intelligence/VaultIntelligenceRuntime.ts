import type { App, TFile } from 'obsidian';
import type { SearchSettings } from '@/core/config/settingsTypes';
import type { LlmIndexingTraceEvent } from '@/core/search/indexTypes';
import { DEFAULT_INDEX_ENRICHMENT_CONFIG } from '@/core/document/IndexEnrichmentConfig';
import type { GeneratedOutputPersistenceRuntime } from '@/core/storage/generated-output';
import { ChatConversationRecordStore } from '@/core/storage/generated-output';
import { sha256Text } from '@/core/storage/generated-output/GeneratedOutputIntegrity';
import type { LintScanResult } from '@/core/types/lint';
import { VaultOperationRouteSelectionError } from '@/core/types/vault-intelligence';
import type {
	VaultCompletedRun,
	VaultIntelligenceEvent,
	VaultIntelligencePersistedState,
	VaultMaintenanceProposal,
	VaultMapTextEntry,
	VaultActivitySession,
	VaultActivityTheme,
	VaultMaintenanceOwnerChoice,
	VaultMaintenanceTask,
	VaultScanAiOperationId,
	VaultScanOperationState,
	VaultScanPlan,
	VaultScanOperationRoute,
	VaultScanOperationRouteCandidate,
	VaultScanOperationAttemptReceipt,
	VaultScanProgressLedger,
	VaultScanResolvedRoute,
	VaultScanRunState,
	VaultScanScopeMode,
	VaultScanStageId,
	VaultScanUsage,
} from '@/core/types/vault-intelligence';
import type { IndexService } from '@/service/search/index/indexService';
import type { EmbeddingCallConfig } from '@/core/profiles/materialize';
import type { VaultLintRuntime } from '@/service/lint/VaultLintRuntime';
import type { VaultReviewRuntime } from '@/service/copilot/vault/VaultReviewRuntime';
import type { VaultReviewSessionSnapshot } from '@/service/copilot/vault/VaultReviewSession';
import type { ReviewPreparationPackage, ReviewPreparationSession, ReviewWorkArtifact } from '@/core/types/review-preparation';
import type { EvidenceLedger, VaultDiscoverySession } from '@/core/types/vault-discovery';
import type { FindingProposal } from '@/service/vault-discovery/FindingRegistry';
import { VaultDiscoveryController } from '@/service/vault-discovery/VaultDiscoveryController';
import { normalizeReviewAtoms } from '@/service/vault-review-preparation/ReviewInputNormalizer';
import { ReviewPreparationController } from '@/service/vault-review-preparation/ReviewPreparationController';
import { projectReviewPreparation } from '@/service/vault-review-preparation/ReviewPreparationProgress';
import { DEFAULT_SCAN_PROGRESS_WEIGHTS } from '@/service/vault-scan/ScanProgressCalculator';
import { DiscoverController } from '@/service/vault-scan/discover/DiscoverController';
import { createVaultScanRunState } from '@/service/vault-scan/ScanStateFactory';
import { reduceScanEvent } from '@/service/vault-scan/ScanEventReducer';
import type { VaultScanRunState as VaultScanDomainRunState } from '@/core/types/vault-scan';
import { buildCompletedPackage } from '@/service/vault-scan/publish/CompletedPackageBuilder';
import { CompletedPublisher } from '@/service/vault-scan/publish/CompletedPublisher';
import { VaultIntelligenceRecordStore } from './VaultIntelligenceRecordStore';
import { VaultScanRecordStore } from './VaultScanRecordStore';
import { generateContentPreview } from '@/core/utils/message-preview-utils';
import {
	createEmptyVaultScanRun,
	deriveMaintenanceState,
	summarizeVaultActivity,
	summarizeVaultFileTypes,
	type VaultIntelligenceObjectSummary,
	type VaultIntelligenceSnapshot,
} from '@/ui/view/vault-intelligence/VaultIntelligenceModel';
import {
	DEFAULT_VAULT_INTELLIGENCE_CONFIG,
	loadVaultIntelligenceConfig,
	type VaultIntelligenceConfig,
} from '@/ui/view/vault-intelligence/VaultIntelligenceDefaults';

export interface VaultIntelligenceRuntimeDeps {
	app: App;
	resolveLintRuntime: () => VaultLintRuntime | null;
	resolveReviewRuntime: () => VaultReviewRuntime | null;
	resolveIndexService: () => IndexService | null;
	resolveGeneratedOutputs: () => GeneratedOutputPersistenceRuntime | null;
	getSearchSettings: () => SearchSettings;
	runCoreIndex: (scope: VaultScanScopeMode, paths: string[], onProgress?: (progress: { processed: number; total: number; path: string | null; failed: number; succeeded?: boolean }) => void, shouldContinue?: () => boolean) => Promise<void>;
	resolveProjectCount: () => Promise<number>;
	refreshOperationRouteCandidates?: () => Promise<void>;
	runScanPlanning?: (input: {
		route: VaultScanResolvedRoute;
		scope: VaultScanScopeMode;
		objectCount: number;
		changedCount: number | null;
		enabledOperations: string[];
		samplePaths: string[];
		signal: AbortSignal;
	}) => Promise<{ text: string; usage: VaultScanUsage }>;
	runTaskSuggestionRefresh?: (input: {
		route: VaultScanResolvedRoute;
		instruction: string;
		taskPayload: string;
		signal?: AbortSignal;
	}) => Promise<{ text: string; usage: VaultScanUsage }>;
	openOwnerSurface?: (surface: VaultIntelligenceObjectSummary['id']) => Promise<void>;
	resolveOperationRoutes: () => Partial<Record<VaultScanAiOperationId, VaultScanOperationRoute>>;
	resolveEmbeddingCallConfig?: (route: VaultScanOperationRoute) => EmbeddingCallConfig | null;
	calculateCostUsd: (provider: string, model: string, usage: VaultScanUsage) => Promise<number>;
	now?: () => number;
	idFactory?: () => string;
}

const EMPTY_USAGE: VaultScanUsage = {
	inputTokens: 0,
	outputTokens: 0,
	totalTokens: 0,
	costUsd: 0,
};

export class VaultIntelligenceRuntime {
	private readonly listeners = new Set<() => void>();
	private readonly now: () => number;
	private readonly idFactory: () => string;
	private abortController: AbortController | null = null;
	private persistenceTail: Promise<void> = Promise.resolve();
	private indexErrors: Array<{ path: string; message: string }> = [];
	private aiReviewSnapshots: VaultReviewSessionSnapshot[] = [];
	private discoverySession: VaultDiscoverySession | null = null;
	private reviewPreparationSession: ReviewPreparationSession | null = null;
	private reviewPreparationPackage: ReviewPreparationPackage | null = null;
	private scanDomainState: VaultScanDomainRunState | null = null;
	private refreshRevision = 0;
	/** Raw provider round-trips are intentionally bounded and process-local. */
	private generationTraces: LlmIndexingTraceEvent[] = [];
	/** A route override belongs to this Scan setup only. It must never rewrite a
	 * global Agent/Embedding default merely because the owner is planning a run. */
	private operationRouteOverrides: Partial<Record<VaultScanAiOperationId, VaultScanOperationRoute>> = {};
	private snapshot: VaultIntelligenceSnapshot = {
		loading: false,
		error: null,
		digest: null,
		fileTypes: [],
		availablePaths: [],
		availablePathBytes: {},
		changedPaths: [],
		activityDays: [],
		changedSinceScan: null,
		changedCursorAt: null,
		indexReadiness: { discovered: 0, searchReady: null, pendingOrExcluded: null, builtAt: null, isReady: false },
		objects: [],
		operationRoutes: {},
		tasks: [],
		run: createEmptyVaultScanRun(),
		lastCompletedRun: null,
		recentActivity: [],
		sourceActivity: [],
		proposals: [],
		mapTextEntries: [],
		activitySessions: [],
		activityThemes: [],
		communityMembers: {},
		events: [],
	};

	constructor(private readonly deps: VaultIntelligenceRuntimeDeps) {
		this.now = deps.now ?? (() => Date.now());
		this.idFactory = deps.idFactory ?? (() => `vi-${this.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`);
	}

	getSnapshot = (): VaultIntelligenceSnapshot => this.snapshot;
	getGenerationTraces = (operationId: 'file-summaries' | 'ai-tags', path: string): readonly LlmIndexingTraceEvent[] => {
		const operation = operationId === 'file-summaries' ? 'summary' : 'tags';
		return this.generationTraces.filter((trace) => trace.operation === operation && trace.path === path);
	};

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	async refresh(): Promise<void> {
		const refreshRevision = ++this.refreshRevision;
		this.patch({ loading: true, error: null });
		const files = this.deps.app.vault.getFiles();
		try {
			const store = this.recordStore();
			const review = this.deps.resolveReviewRuntime();
			const outputs = this.deps.resolveGeneratedOutputs();
			await this.deps.refreshOperationRouteCandidates?.();
			const indexService = this.deps.resolveIndexService();
			const [persisted, digest, events, projectCount, conversationCount, composerEventCount, sourceActivity, indexStatus, currentIndexedCount] = await Promise.all([
				store?.load().catch(() => null) ?? Promise.resolve(null),
				review?.getDigest().catch(() => null) ?? Promise.resolve(null),
				store?.listEvents().catch(() => []) ?? Promise.resolve([]),
				this.deps.resolveProjectCount().catch(() => 0),
				outputs
					? new ChatConversationRecordStore(outputs).listConversationIds().then((ids) => ids.length).catch(() => 0)
					: Promise.resolve(0),
				outputs
					? outputs.events.readEvents({ outputId: 'composer.workspace-events', streamKey: 'current' })
						.then((result) => result.events.length).catch(() => 0)
					: Promise.resolve(0),
				outputs ? collectSourceActivity(outputs).catch(() => []) : Promise.resolve([]),
				indexService?.getIndexStatus().catch(() => null) ?? Promise.resolve(null),
				indexService?.countIndexedDocuments(files.map((file) => file.path)).catch(() => null) ?? Promise.resolve(null),
			]);
			const recovered = this.recoverPersistedState(persisted);
			const recoveredRunId = recovered.activeRun?.id ?? null;
			const domainCheckpoint = recoveredRunId ? await this.scanRecordStore()?.loadCheckpoint(recoveredRunId).catch(() => null) ?? null : null;
			this.scanDomainState = domainCheckpoint?.state ?? null;
			this.discoverySession = domainCheckpoint?.discovery ?? null;
			this.reviewPreparationSession = domainCheckpoint?.reviewPreparation ?? null;
			const operationRoutes = this.resolveOperationRoutes(recovered.lastCompletedRun);
			const changedPaths = recovered.changedCursorAt
				? files.filter((file) => file.stat.mtime > recovered.changedCursorAt!).map((file) => file.path).sort((left, right) => left.localeCompare(right))
				: [];
			const changedSinceScan = recovered.changedCursorAt ? changedPaths.length : null;
			const searchReady = indexStatus?.isReady ? currentIndexedCount : null;
			const recentActivity = recovered.recentActivity;
			const activitySessions = buildActivitySessions([...sourceActivity, ...recentActivity]);
			// A Vault Intelligence view can mount while plugin services are still
			// booting. Once a later refresh sees the bound IndexService, an older
			// request must not replace its live readiness with "Not reported".
			if (refreshRevision !== this.refreshRevision) return;
			this.patch({
				loading: false,
				digest,
				fileTypes: summarizeVaultFileTypes(files),
				availablePaths: files.map((file) => file.path).sort((left, right) => left.localeCompare(right)),
				availablePathBytes: Object.fromEntries(files.map((file) => [file.path, file.stat.size])),
				changedPaths,
				activityDays: summarizeVaultActivity(files),
				changedSinceScan,
				changedCursorAt: recovered.changedCursorAt,
				indexReadiness: {
					discovered: files.length,
					searchReady,
					pendingOrExcluded: searchReady === null ? null : Math.max(0, files.length - searchReady),
					builtAt: indexStatus?.indexBuiltAt ?? null,
					isReady: indexStatus?.isReady ?? false,
				},
				objects: buildObjectSummaries(files.length, conversationCount, projectCount, composerEventCount),
				operationRoutes,
				tasks: recovered.tasks,
				run: recovered.activeRun ?? createEmptyVaultScanRun(),
				lastCompletedRun: recovered.lastCompletedRun,
				recentActivity,
				sourceActivity,
				proposals: recovered.proposals ?? [],
				mapTextEntries: recovered.mapTextEntries ?? [],
				activitySessions,
				activityThemes: recovered.activityThemes ?? [],
				events: events.slice(-120),
			});
			if (persisted?.activeRun?.status === 'running' || persisted?.activeRun?.status === 'stopping') {
				this.queuePersist();
			}
		} catch (error) {
			if (refreshRevision !== this.refreshRevision) return;
			this.patch({ loading: false, error: errorMessage(error) });
		}
	}

	async startScan(plan: VaultScanPlan): Promise<void> {
		if (this.isActive()) return;
		const config = await loadVaultIntelligenceConfig();
		this.indexErrors = [];
		this.aiReviewSnapshots = [];
		this.generationTraces = [];
		this.abortController = new AbortController();
		const startedAt = this.now();
		const runId = this.idFactory();
		const frozenRoutes = this.resolveOperationRoutes();
		const normalizedPlan = normalizePlan(plan, config, frozenRoutes);
		const run: VaultScanRunState = {
			...createEmptyVaultScanRun(),
			id: runId,
			status: 'running',
			plan: normalizedPlan,
			startedAt,
			operations: normalizedPlan.aiOperations.map((operation) => ({
				...operation,
				status: operation.enabled ? 'waiting' : 'skipped',
				processed: 0,
				total: 0,
				currentPath: null,
				usage: { ...EMPTY_USAGE },
				error: null,
				evidence: [],
				startedAt: null,
				completedAt: null,
				plannedRoute: resolvedRoute(frozenRoutes[operation.id]),
				actualRoute: null,
				executionId: null,
				attempts: [],
			})),
		};
		this.patch({ run, error: null });
		this.scanDomainState = createVaultScanRunState(runId, startedAt);
		await this.appendScanDomainEvent('run.status-changed', 'discover', { status: 'starting' });
		await this.recordEvent('run-started', runId, 'Vault Scan started with a frozen plan.');
		await this.flushPersist();
		await this.executeRun();
	}

	async selectOperationRoute(operationId: VaultScanAiOperationId, candidate: VaultScanOperationRouteCandidate): Promise<void> {
		const current = this.resolveOperationRoutes()[operationId];
		if (!current) throw new VaultOperationRouteSelectionError('This AI operation is not available in the current Scan setup.');
		const configuredCandidate = current.candidates?.find((item) => (
			item.profileId === candidate.profileId && item.model === candidate.model
		));
		if (!configuredCandidate) throw new VaultOperationRouteSelectionError('This model is no longer configured. Refresh the model catalog and try again.');
		if (configuredCandidate.selectable === false) {
			throw new VaultOperationRouteSelectionError(configuredCandidate.unavailableReason ?? 'This model is not compatible with the selected operation.');
		}
		this.operationRouteOverrides = {
			...this.operationRouteOverrides,
			[operationId]: {
				...current,
				profileId: configuredCandidate.profileId,
				model: configuredCandidate.model,
				provider: configuredCandidate.provider,
				available: true,
			},
		};
		this.patch({ operationRoutes: this.resolveOperationRoutes() });
	}

	async resumeScan(): Promise<void> {
		if (!['paused', 'interrupted', 'stopped-partial'].includes(this.snapshot.run.status) || !this.snapshot.run.plan) return;
		this.abortController = new AbortController();
		this.patchRun({ status: 'running', stopRequested: false, stopMode: null, error: null });
		await this.recordEvent('run-started', this.snapshot.run.id, 'Vault Scan resumed from its durable checkpoint.');
		await this.flushPersist();
		await this.executeRun();
	}

	async startNewScan(): Promise<void> {
		if (!['paused', 'interrupted', 'stopped-partial', 'failed'].includes(this.snapshot.run.status)) return;
		this.abortController?.abort();
		this.abortController = null;
		this.indexErrors = [];
		this.aiReviewSnapshots = [];
		this.generationTraces = [];
		this.patch({ run: createEmptyVaultScanRun(), error: null });
		await this.flushPersist();
	}

	requestPause(): void {
		if (this.snapshot.run.status !== 'running') return;
		this.patchRun({
			status: 'stopping',
			stopRequested: true,
			stopMode: 'pause',
			warnings: unique([...this.snapshot.run.warnings, 'Pause requested; Peak will retain the next durable checkpoint.']),
		});
		this.queuePersist();
	}

	requestStop(): void {
		if (this.snapshot.run.status !== 'running') return;
		this.patchRun({
			status: 'stopping',
			stopRequested: true,
			stopMode: 'stop',
			warnings: unique([...this.snapshot.run.warnings, 'Stop requested; completed stages remain in this run checkpoint.']),
		});
		this.queuePersist();
		this.abortController?.abort();
	}

	skipOperation(operationId: VaultScanAiOperationId): void {
		const operation = this.snapshot.run.operations.find((candidate) => candidate.id === operationId);
		if (!operation || operation.status === 'completed' || operation.status === 'failed') return;
		const group = coupledIndexOperationIds(operationId);
		for (const id of group) {
			const candidate = this.operation(id);
			if (!candidate || candidate.status === 'completed' || candidate.status === 'failed') continue;
			this.patchOperation(id, { status: 'skipped', currentPath: null });
		}
		if (operationId === 'relationship-discovery') this.abortController?.abort();
		this.queuePersist();
	}

	async choose(taskId: string, atomicItemId: string | null, choiceId: string, choiceValue: string | null = null): Promise<void> {
		const config = await loadVaultIntelligenceConfig();
		const task = this.snapshot.tasks.find((candidate) => candidate.id === taskId);
		const definition = config.tasks.find((candidate) => candidate.kind === task?.kind);
		if (!task || !definition?.choices.some((choice) => choice.id === choiceId)) return;
		if (choiceId === 'another' && !choiceValue?.trim()) return;
		const now = this.now();
		const ownerChoice: VaultMaintenanceOwnerChoice = {
			choiceId,
			choiceValue: choiceValue?.trim() || null,
			chosenAt: now,
			status: 'selected',
			sourceRevision: atomicItemId
				? this.fileMtime(task.atomicItems.find((item) => item.id === atomicItemId)?.filePath ?? null)
				: null,
		};
		const atomicItems = atomicItemId
			? task.atomicItems.map((item) => item.id === atomicItemId ? { ...item, ownerChoice } : item)
			: task.atomicItems.map((item) => ({
				...item,
				ownerChoice: {
					...ownerChoice,
					sourceRevision: this.fileMtime(item.filePath),
				},
			}));
		const defaultChoice = atomicItemId ? task.defaultChoice : ownerChoice;
		const updated = {
			...task,
			atomicItems,
			defaultChoice,
			state: deriveMaintenanceState(definition.initialState, atomicItems, defaultChoice),
			updatedAt: now,
		};
		this.replaceTask(updated);
		this.patch({ error: null });
		await this.recordEvent('owner-choice', task.sourceRunId, `${task.kind} choice: ${choiceId}${ownerChoice.choiceValue ? ` · ${ownerChoice.choiceValue}` : ''}`);
		this.addActivity('owner-choice', task.title, task.atomicItems[0]?.filePath ?? null, task.sourceRunId);
		await this.flushPersist();
	}

	async refreshTaskSuggestions(taskIds: string[], instruction: string): Promise<void> {
		const normalizedInstruction = instruction.trim();
		if (!normalizedInstruction || taskIds.length === 0) return;
		const config = await loadVaultIntelligenceConfig();
		const route = resolvedRoute(this.resolveOperationRoutes()['maintenance-synthesis']);
		for (const taskId of taskIds) {
			const task = this.snapshot.tasks.find((candidate) => candidate.id === taskId);
			const definition = config.tasks.find((candidate) => candidate.kind === task?.kind);
			if (!task || !definition) continue;
			const requestedAt = this.now();
			const receiptId = this.idFactory();
			const runningReceipt: NonNullable<VaultMaintenanceTask['suggestionReceipt']> = {
				id: receiptId, status: 'running', instruction: normalizedInstruction, route, usage: { ...EMPTY_USAGE }, requestedAt, completedAt: null, error: null,
				evidence: ['Waiting for an evidence-backed suggestion refresh. Owner choices remain unchanged.'],
			};
			this.patch({ tasks: this.snapshot.tasks.map((candidate) => candidate.id === taskId ? { ...candidate, suggestionReceipt: runningReceipt, updatedAt: requestedAt } : candidate) });
			await this.flushPersist();
			if (!route || !this.deps.runTaskSuggestionRefresh) {
				this.finishTaskSuggestionReceipt(taskId, { ...runningReceipt, status: 'failed', completedAt: this.now(), error: 'No executable Vault Review model is configured.', evidence: ['Configure the Vault Review route before refreshing suggestions.'] });
				continue;
			}
			try {
				const allowedChoices = definition.choices.map((choice) => ({ id: choice.id, label: choice.label, boundary: choice.boundary }));
				const taskPayload = JSON.stringify({
					task: { id: task.id, kind: task.kind, title: task.title, state: task.state, allowedChoices },
					items: task.atomicItems.map((item) => ({ id: item.id, filePath: item.filePath, title: item.title, evidence: item.evidence, provenance: item.provenance ?? [], currentSuggestion: item.suggestedChoiceId })),
				});
				const result = await this.deps.runTaskSuggestionRefresh({ route, instruction: normalizedInstruction, taskPayload });
				const parsed = parseTaskSuggestions(result.text);
				const allowedIds = new Set(definition.choices.map((choice) => choice.id));
				const byItem = new Map(parsed.filter((suggestion) => allowedIds.has(suggestion.choiceId)).map((suggestion) => [suggestion.itemId, suggestion]));
				const completedAt = this.now();
				const costUsd = result.usage.totalTokens > 0 && result.usage.costUsd === 0
					? await this.deps.calculateCostUsd(route.provider, route.model, result.usage).catch(() => 0)
					: result.usage.costUsd;
				const usage = { ...result.usage, costUsd };
				const currentTask = this.snapshot.tasks.find((candidate) => candidate.id === taskId);
				if (!currentTask) continue;
				const refreshedCount = currentTask.atomicItems.filter((item) => byItem.has(item.id)).length;
				const receipt: NonNullable<VaultMaintenanceTask['suggestionReceipt']> = {
					...runningReceipt, status: 'completed', route, usage, completedAt, error: null,
					evidence: [`${refreshedCount} of ${currentTask.atomicItems.length} evidence items received a valid configured suggestion.`, 'Existing owner choices were preserved.'],
				};
				this.patch({
					tasks: this.snapshot.tasks.map((candidate) => candidate.id === taskId ? {
						...candidate,
						updatedAt: completedAt,
						suggestionReceipt: receipt,
						atomicItems: candidate.atomicItems.map((item) => {
							const suggestion = byItem.get(item.id);
							return suggestion ? { ...item, suggestedChoiceId: suggestion.choiceId, suggestedValue: suggestion.choiceValue ?? item.suggestedValue ?? null } : item;
						}),
					} : candidate),
					error: null,
				});
				await this.recordEvent('operation-changed', task.sourceRunId, `${task.kind} suggestions refreshed through ${route.provider} · ${route.model}.`);
				await this.flushPersist();
			} catch (error) {
				const message = errorMessage(error);
				this.finishTaskSuggestionReceipt(taskId, { ...runningReceipt, status: 'failed', completedAt: this.now(), error: message, evidence: [message, 'Existing evidence and owner choices were preserved.'] });
			}
		}
	}

	async applyTask(taskId: string): Promise<void> {
		const config = await loadVaultIntelligenceConfig();
		const task = this.snapshot.tasks.find((candidate) => candidate.id === taskId);
		const definition = config.tasks.find((candidate) => candidate.kind === task?.kind);
		if (!task || !definition) return;
		const boundaries = new Map(definition.choices.map((choice) => [choice.id, choice.boundary]));
		let hasProposal = false;
		let staleSource: string | null = null;
		const atomicItems = task.atomicItems.map((item) => {
			const choice = item.ownerChoice ?? task.defaultChoice;
			if (!choice || choice.choiceId === 'later') return item;
			if (boundaries.get(choice.choiceId) === 'proposal') {
				hasProposal = true;
				const currentRevision = this.fileMtime(item.filePath);
				if (choice.sourceRevision !== null && currentRevision !== choice.sourceRevision) {
					staleSource = item.filePath ?? item.title;
					return item;
				}
				return {
					...item,
					ownerChoice: {
						...choice,
						sourceRevision: choice.sourceRevision ?? currentRevision,
					},
				};
			}
			return { ...item, ownerChoice: { ...choice, status: 'applied' as const } };
		});
		if (staleSource) {
			const recoveredAt = this.now();
			this.replaceTask({ ...task, atomicItems, state: 'recovery', updatedAt: recoveredAt, workflow: { phase: 'recovery', processed: 0, total: atomicItems.length, currentPath: staleSource, detail: 'The source changed after the owner choice.', updatedAt: recoveredAt } });
			this.patch({ error: `${staleSource} changed after the owner choice. Review current evidence before preparing file changes.` });
			await this.flushPersist();
			return;
		}
		const defaultChoice = task.defaultChoice && task.defaultChoice.choiceId !== 'later'
			&& boundaries.get(task.defaultChoice.choiceId) !== 'proposal'
			? { ...task.defaultChoice, status: 'applied' as const }
			: task.defaultChoice;
		const appliedAt = this.now();
		this.replaceTask({
			...task,
			atomicItems,
			defaultChoice,
			state: hasProposal ? 'needs-proposal' : 'ready-apply',
			workflow: { phase: hasProposal ? 'proposal' : 'applied', processed: atomicItems.length, total: atomicItems.length, currentPath: null, detail: hasProposal ? 'Review decisions are saved; prepare a guarded diff next.' : 'Peak-owned decisions are saved; a fresh verifier is required to close the work.', updatedAt: appliedAt },
			updatedAt: appliedAt,
		});
		this.patch({ error: null });
		await this.recordEvent(hasProposal ? 'review-decisions-saved' : 'task-applied', task.sourceRunId, hasProposal
			? `${task.kind} review decisions saved; user files unchanged.`
			: `${task.kind} Peak-owned choices recorded.`);
		this.addActivity(hasProposal ? 'owner-choice' : 'apply', hasProposal ? `${task.title} review decisions saved` : task.title, task.atomicItems[0]?.filePath ?? null, task.sourceRunId);
		await this.flushPersist();
	}

	/**
	 * Materialize a narrow, deterministic source-file proposal.  The scan only
	 * records an owner choice; this is the separate transition that turns a
	 * supported choice into a reviewable diff.  Unsupported task kinds remain
	 * honest rather than emitting an invented Markdown patch.
	 */
	async prepareProposal(taskId: string): Promise<void> {
		const config = await loadVaultIntelligenceConfig();
		const task = this.snapshot.tasks.find((candidate) => candidate.id === taskId);
		const definition = config.tasks.find((candidate) => candidate.kind === task?.kind);
		if (!task || !definition) return;
		const proposalChoiceIds = new Set(definition.choices
			.filter((choice) => choice.boundary === 'proposal')
			.map((choice) => choice.id));
		const requested = task.atomicItems.flatMap((item) => {
			const choice = item.ownerChoice ?? task.defaultChoice;
			return choice && proposalChoiceIds.has(choice.choiceId) ? [{ item, choice }] : [];
		});
		if (requested.length === 0) {
			this.patch({ error: 'Choose a source-file outcome before preparing a proposal.' });
			return;
		}
		const changes: VaultMaintenanceProposal['changes'] = [];
		const warnings: string[] = [];
		for (const { item, choice } of requested) {
			if (!item.filePath) {
				warnings.push(`${item.title}: no source file is available for this reference.`);
				continue;
			}
			const patch = item.proposalPatch ?? brokenLinkPatch(item.projectionLabel, choice.choiceId, choice.choiceValue ?? item.suggestedValue ?? null);
			if (!patch) {
				warnings.push(`${item.filePath}: ${choice.choiceId} has no detector-supplied exact source patch. Keep the recorded owner decision or prepare this change in its owner editor.`);
				continue;
			}
			const source = await this.readSourceFile(item.filePath);
			if (!source) {
				warnings.push(`${item.filePath}: the source file is no longer available.`);
				continue;
			}
			const matchCount = occurrenceCount(source.content, patch.beforeText);
			if (matchCount !== 1) {
				warnings.push(`${item.filePath}: expected one ${patch.beforeText} occurrence, found ${matchCount}; prepare this repair in its owner editor.`);
				continue;
			}
			changes.push({
				id: this.idFactory(),
				atomicItemIds: [item.id],
				path: item.filePath,
				sourceMtime: source.file.stat.mtime,
				sourceHash: sha256Text(source.content),
				beforeText: patch.beforeText,
				afterText: patch.afterText,
				beforeContext: textContext(source.content, patch.beforeText),
				afterContext: textContext(source.content.replace(patch.beforeText, patch.afterText), patch.afterText),
				matchCount,
				selected: true,
			});
		}
		if (changes.length === 0) {
			this.patch({ error: warnings.join(' ') || 'No safe source-file diff could be prepared.' });
			return;
		}
		const createdAt = this.now();
		const proposal: VaultMaintenanceProposal = {
			id: this.idFactory(),
			taskId: task.id,
			sourceRunId: task.sourceRunId,
			status: 'ready-review',
			createdAt,
			updatedAt: createdAt,
			changes,
			warnings,
			appliedAt: null,
			verifiedAt: null,
		};
		this.patch({
			proposals: [...this.snapshot.proposals.filter((candidate) => candidate.taskId !== task.id || candidate.status === 'applied' || candidate.status === 'verified'), proposal],
			tasks: this.snapshot.tasks.map((candidate) => candidate.id === task.id ? { ...candidate, state: 'ready-review', updatedAt: createdAt, workflow: { phase: 'proposal', processed: 0, total: changes.length, currentPath: null, detail: `${changes.length} guarded source changes are ready for review.`, updatedAt: createdAt } } : candidate),
			error: warnings.length ? warnings.join(' ') : null,
		});
		this.addActivity('owner-choice', `${task.title} proposal prepared`, changes[0]?.path ?? null, task.sourceRunId);
		await this.recordEvent('proposal-prepared', task.sourceRunId, `${task.kind} proposal prepared with ${changes.length} guarded file change${changes.length === 1 ? '' : 's'}.`);
		await this.flushPersist();
	}

	async applyProposal(proposalId: string): Promise<void> {
		const proposal = this.snapshot.proposals.find((candidate) => candidate.id === proposalId);
		if (!proposal || proposal.status !== 'ready-review') return;
		const selectedChanges = proposal.changes.filter((change) => change.selected !== false);
		if (selectedChanges.length === 0) {
			this.patch({ error: 'Select at least one guarded file change before Apply.' });
			return;
		}
		const applyingAt = this.now();
		this.patch({
			proposals: this.snapshot.proposals.map((candidate) => candidate.id === proposal.id ? { ...candidate, status: 'applying', updatedAt: applyingAt } : candidate),
			tasks: this.snapshot.tasks.map((candidate) => candidate.id === proposal.taskId ? { ...candidate, state: 'applying', updatedAt: applyingAt, workflow: { phase: 'applying', processed: 0, total: selectedChanges.length, currentPath: selectedChanges[0]?.path ?? null, detail: 'Rechecking every selected source revision before writing.', updatedAt: applyingAt } } : candidate),
			error: null,
		});
		await this.flushPersist();
		const sources = new Map<string, Awaited<ReturnType<VaultIntelligenceRuntime['readSourceFile']>>>();
		for (const path of unique(selectedChanges.map((change) => change.path))) {
			const source = await this.readSourceFile(path);
			if (!source) {
				await this.markProposalStale(proposal, `${path}: source file is unavailable.`);
				return;
			}
			sources.set(path, source);
		}
		for (const change of selectedChanges) {
			const source = sources.get(change.path);
			if (!source || source.file.stat.mtime !== change.sourceMtime || sha256Text(source.content) !== change.sourceHash) {
				await this.markProposalStale(proposal, `${change.path}: source changed after the diff was prepared.`);
				return;
			}
		}
		let appliedFiles = 0;
		for (const [path, source] of sources) {
			if (!source) continue;
			this.patchTaskWorkflow(proposal.taskId, 'applying', 'applying', 'Applying selected changes with a matching source revision.', { processed: appliedFiles, total: sources.size, currentPath: path });
			let next = source.content;
			for (const change of selectedChanges.filter((candidate) => candidate.path === path)) {
				if (occurrenceCount(next, change.beforeText) !== change.matchCount) {
					await this.markProposalStale(proposal, `${path}: the prepared patch no longer has the expected source context.`);
					return;
				}
				next = next.replace(change.beforeText, change.afterText);
			}
			if (next !== source.content) await this.deps.app.vault.modify(source.file, next);
			appliedFiles += 1;
		}
		const appliedAt = this.now();
		const task = this.snapshot.tasks.find((candidate) => candidate.id === proposal.taskId) ?? null;
		const proposalItemIds = new Set(selectedChanges.flatMap((change) => change.atomicItemIds));
		this.patch({
			proposals: this.snapshot.proposals.map((candidate) => candidate.id === proposal.id ? { ...candidate, status: 'applied', appliedAt, updatedAt: appliedAt } : candidate),
			tasks: task ? this.snapshot.tasks.map((candidate) => candidate.id === task.id ? {
				...candidate,
				state: 'applied',
				updatedAt: appliedAt,
				workflow: { phase: 'applied', processed: appliedFiles, total: sources.size, currentPath: null, detail: `${appliedFiles} guarded source file${appliedFiles === 1 ? '' : 's'} applied; re-index and verification are still required.`, updatedAt: appliedAt },
				atomicItems: candidate.atomicItems.map((item) => proposalItemIds.has(item.id) && item.ownerChoice
					? { ...item, ownerChoice: { ...item.ownerChoice, status: 'applied' } }
					: item),
			} : candidate) : this.snapshot.tasks,
			error: null,
		});
		this.addActivity('apply', `${task?.title ?? 'Proposal'} applied`, selectedChanges[0]?.path ?? null, proposal.sourceRunId);
		await this.recordEvent('proposal-applied', proposal.sourceRunId, `${task?.kind ?? 'proposal'} applied to ${sources.size} source file${sources.size === 1 ? '' : 's'}.`);
		await this.flushPersist();
	}

	async rejectProposal(proposalId: string): Promise<void> {
		const proposal = this.snapshot.proposals.find((candidate) => candidate.id === proposalId);
		if (!proposal || proposal.status !== 'ready-review') return;
		const task = this.snapshot.tasks.find((candidate) => candidate.id === proposal.taskId) ?? null;
		const itemIds = new Set(proposal.changes.flatMap((change) => change.atomicItemIds));
		const now = this.now();
		this.patch({
			proposals: this.snapshot.proposals.map((candidate) => candidate.id === proposalId ? { ...candidate, status: 'rejected', updatedAt: now } : candidate),
			tasks: task ? this.snapshot.tasks.map((candidate) => candidate.id === task.id ? {
				...candidate,
				state: 'needs-choice',
				updatedAt: now,
				workflow: { phase: 'decision', processed: 0, total: candidate.atomicItems.length, currentPath: null, detail: 'The proposal was rejected; user files remain unchanged.', updatedAt: now },
				atomicItems: candidate.atomicItems.map((item) => itemIds.has(item.id) ? { ...item, ownerChoice: null } : item),
			} : candidate) : this.snapshot.tasks,
			error: null,
		});
		await this.recordEvent('review-decisions-saved', proposal.sourceRunId, `${task?.kind ?? 'proposal'} diff rejected; source files remain unchanged.`);
		await this.flushPersist();
	}

	async setProposalChangeSelected(proposalId: string, changeId: string, selected: boolean): Promise<void> {
		const proposal = this.snapshot.proposals.find((candidate) => candidate.id === proposalId);
		if (!proposal || proposal.status !== 'ready-review') return;
		this.patch({
			proposals: this.snapshot.proposals.map((candidate) => candidate.id === proposalId ? {
				...candidate,
				updatedAt: this.now(),
				changes: candidate.changes.map((change) => change.id === changeId ? { ...change, selected } : change),
			} : candidate),
		});
		await this.flushPersist();
	}

	async verifyTask(taskId: string): Promise<void> {
		const config = await loadVaultIntelligenceConfig();
		const task = this.snapshot.tasks.find((candidate) => candidate.id === taskId);
		const definition = config.tasks.find((candidate) => candidate.kind === task?.kind);
		if (!task || !definition) return;
		const boundaries = new Map(definition.choices.map((choice) => [choice.id, choice.boundary]));
		const effective = task.atomicItems.map((item) => item.ownerChoice ?? task.defaultChoice).filter(Boolean);
		const appliedProposalItems = new Set(this.snapshot.proposals
			.filter((proposal) => proposal.taskId === task.id && (proposal.status === 'applied' || proposal.status === 'verified'))
			.flatMap((proposal) => proposal.changes.filter((change) => change.selected !== false).flatMap((change) => change.atomicItemIds)));
		const hasUnappliedSourceChoice = task.atomicItems.some((item) => {
			const choice = item.ownerChoice ?? task.defaultChoice;
			return Boolean(choice && boundaries.get(choice.choiceId) === 'proposal' && !appliedProposalItems.has(item.id));
		});
		if (effective.length !== task.atomicItems.length || effective.some((choice) => choice!.choiceId === 'later') || hasUnappliedSourceChoice) {
			this.patch({ error: 'File-changing proposals must be reviewed and applied in their owner surface before verification.' });
			return;
		}
		const proposalPaths = [...new Set(this.snapshot.proposals
			.filter((proposal) => proposal.taskId === task.id && proposal.status === 'applied')
			.flatMap((proposal) => proposal.changes.filter((change) => change.selected !== false).map((change) => change.path)))];
		if (proposalPaths.length > 0) {
			this.patchTaskWorkflow(task.id, 'reindexing', 'reindexing', 'Rebuilding Core Search for the applied source revisions.', { processed: 0, total: proposalPaths.length, currentPath: null });
			await this.flushPersist();
			await this.deps.runCoreIndex('selected', proposalPaths, (progress) => {
				this.patchTaskWorkflow(task.id, 'reindexing', 'reindexing', progress.path ? `Re-indexing ${progress.path}` : 'Rebuilding Core Search for the applied source revisions.', { processed: progress.processed, total: progress.total, currentPath: progress.path });
			});
		}
		this.patchTaskWorkflow(task.id, 'verifying', 'verifying', 'Running the fresh detector against the applied source and current Index.', { processed: 0, total: task.atomicItems.length, currentPath: null });
		await this.flushPersist();
		if (task.kind === 'unreadable-files') {
			const retryPaths = task.atomicItems.filter((item) => (
				(item.ownerChoice ?? task.defaultChoice)?.choiceId === 'retry' && item.filePath
			)).map((item) => item.filePath!);
			let retryFailures = 0;
			let retryProcessed = 0;
			if (retryPaths.length > 0) await this.deps.runCoreIndex('selected', retryPaths, (progress) => {
				retryFailures = Math.max(retryFailures, progress.failed);
				retryProcessed = Math.max(retryProcessed, progress.processed);
			});
			if (retryFailures > 0 || retryProcessed < retryPaths.length) {
				const verifiedAt = this.now();
				this.replaceTask({
					...task,
					state: 'recovery',
					updatedAt: verifiedAt,
					workflow: { phase: 'recovery', processed: retryProcessed, total: retryPaths.length, currentPath: null, detail: `${retryFailures} Index retries remain unresolved.`, updatedAt: verifiedAt },
					atomicItems: task.atomicItems.map((item) => ({
						...item,
						verification: {
							verifiedAt,
							status: 'failed',
							method: 'index-retry',
							detail: `${retryProcessed} of ${retryPaths.length} retry paths completed; ${retryFailures} failed.`,
							sourceRevision: this.fileMtime(item.filePath),
						},
					})),
				});
				this.patch({ error: 'One or more documents remain unreadable after the fresh Index retry.' });
				await this.flushPersist();
				return;
			}
		}
		if (task.kind !== 'unreadable-files') {
			const verifiableItems = task.atomicItems.filter((item) => item.sourceType === 'lint' && item.signalId && item.filePath);
			const verification = await this.deps.resolveLintRuntime()?.runFullScan().catch(() => null) ?? null;
			if (!verification || verifiableItems.length !== task.atomicItems.length) {
				const recoveredAt = this.now();
				this.replaceTask({ ...task, state: 'recovery', updatedAt: recoveredAt, workflow: { phase: 'recovery', processed: 0, total: task.atomicItems.length, currentPath: null, detail: 'A fresh verifier was unavailable for every affected item.', updatedAt: recoveredAt } });
				this.patch({ error: 'A fresh verifier is not available for every affected item. Peak retained the owner decision but did not close this work.' });
				await this.flushPersist();
				return;
			}
			const stillOpen = verification.findings.some((finding) => (
				finding.status === 'open' && verifiableItems.some((item) => (
					item.signalId === finding.signalId
					&& item.filePath === finding.filePath
				))
			));
			if (stillOpen) {
				const recoveredAt = this.now();
				this.replaceTask({ ...task, state: 'recovery', updatedAt: recoveredAt, workflow: { phase: 'recovery', processed: 0, total: task.atomicItems.length, currentPath: null, detail: 'The fresh verifier still reports the original finding.', updatedAt: recoveredAt } });
				this.patch({ error: 'The fresh verifier still reports this work. Review the current evidence and create a new proposal or owner decision if needed.' });
				await this.flushPersist();
				return;
			}
		}
		const verifiedAt = this.now();
		const atomicItems = task.atomicItems.map((item) => {
			const choice = item.ownerChoice ?? task.defaultChoice!;
			const method = task.kind === 'unreadable-files' ? 'index-retry' as const : 'fresh-detector' as const;
			return {
				...item,
				ownerChoice: { ...choice, status: 'verified' as const },
				verification: {
					verifiedAt,
					status: 'passed' as const,
					method,
					detail: method === 'fresh-detector'
						? 'A fresh detector run no longer reported the same signal for this source.'
						: 'The selected source completed a fresh Index retry without a reported failure.',
					sourceRevision: this.fileMtime(item.filePath),
				},
			};
		});
		this.patch({
			proposals: this.snapshot.proposals.map((proposal) => proposal.taskId === task.id && proposal.status === 'applied'
				? { ...proposal, status: 'verified', verifiedAt, updatedAt: verifiedAt }
				: proposal),
		});
		this.replaceTask({ ...task, atomicItems, state: 'verified', updatedAt: verifiedAt, workflow: { phase: 'verified', processed: atomicItems.length, total: atomicItems.length, currentPath: null, detail: 'A fresh verifier no longer reports the original finding.', updatedAt: verifiedAt } });
		this.patch({ error: null });
		await this.recordEvent('task-verified', task.sourceRunId, `${task.kind} verified.`);
		this.addActivity('verify', task.title, task.atomicItems[0]?.filePath ?? null, task.sourceRunId);
		await this.flushPersist();
	}

	async saveMapText(communityId: string, text: string): Promise<void> {
		const community = this.snapshot.digest?.clusters.find((candidate) => candidate.id === communityId);
		if (!community) {
			this.patch({ error: 'This Community is no longer present in the current Knowledge Index.' });
			return;
		}
		const now = this.now();
		const previous = this.snapshot.mapTextEntries.find((entry) => entry.communityId === communityId) ?? null;
		const revision = {
			id: this.idFactory(),
			text: text.trim(),
			sourceFingerprint: this.snapshot.digest?.fingerprint.fingerprint ?? null,
			createdAt: now,
			status: 'draft' as const,
		};
		const entry: VaultMapTextEntry = {
			id: previous?.id ?? this.idFactory(),
			communityId,
			communityLabel: community.label,
			text: text.trim(),
			sourceFingerprint: this.snapshot.digest?.fingerprint.fingerprint ?? null,
			createdAt: previous?.createdAt ?? now,
			updatedAt: now,
			revisions: [
				...(previous?.revisions ?? []).map((candidate) => candidate.status === 'draft' ? { ...candidate, status: 'superseded' as const } : candidate),
				revision,
			],
		};
		this.patch({
			mapTextEntries: [...this.snapshot.mapTextEntries.filter((candidate) => candidate.communityId !== communityId), entry],
			error: null,
		});
		await this.recordEvent('map-text-saved', null, `Map text saved for ${community.label}.`);
		await this.flushPersist();
	}

	async publishMapText(communityId: string): Promise<void> {
		const entry = this.snapshot.mapTextEntries.find((candidate) => candidate.communityId === communityId);
		if (!entry) return;
		const now = this.now();
		this.patch({
			mapTextEntries: this.snapshot.mapTextEntries.map((candidate) => candidate.communityId === communityId ? {
				...candidate,
				updatedAt: now,
				revisions: (candidate.revisions ?? []).map((revision) => revision.status === 'draft'
					? { ...revision, status: 'published' as const }
					: revision.status === 'published' ? { ...revision, status: 'superseded' as const } : revision),
			} : candidate),
			error: null,
		});
		await this.recordEvent('map-text-published', null, `Map text published for ${entry.communityLabel}.`);
		await this.flushPersist();
	}

	async keepMapText(communityId: string): Promise<void> {
		const entry = this.snapshot.mapTextEntries.find((candidate) => candidate.communityId === communityId);
		if (!entry) return;
		const now = this.now();
		this.patch({
			mapTextEntries: this.snapshot.mapTextEntries.map((candidate) => candidate.communityId === communityId ? {
				...candidate,
				updatedAt: now,
				revisions: (candidate.revisions ?? []).map((revision) => revision.status === 'draft' ? { ...revision, status: 'kept' as const } : revision),
			} : candidate),
			error: null,
		});
		await this.recordEvent('map-text-saved', null, `Current map text retained for ${entry.communityLabel}.`);
		await this.flushPersist();
	}

	async analyzeActivityThemes(rangeStart: number, rangeEnd: number): Promise<void> {
		const records = [...this.snapshot.sourceActivity, ...this.snapshot.recentActivity]
			.filter((record) => record.timestamp >= rangeStart && record.timestamp <= rangeEnd);
		if (records.length === 0) {
			this.patch({ error: 'There are no timestamped records in this range to analyze.' });
			return;
		}
		const sessions = buildActivitySessions(records);
		const sourceRevision = activitySourceRevision(records);
		const groups = new Map<string, typeof records>();
		for (const record of records) {
			const label = activityThemeLabel(record);
			groups.set(label, [...(groups.get(label) ?? []), record]);
		}
		const generatedAt = this.now();
		const themes: VaultActivityTheme[] = [...groups.entries()].map(([label, grouped]) => ({
			id: `theme:${sourceRevision}:${label.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
			label,
			recordIds: grouped.map((record) => record.id),
			sessionIds: sessions.filter((session) => session.recordIds.some((id) => grouped.some((record) => record.id === id))).map((session) => session.id),
			confidence: 1,
			citations: grouped.slice(0, 12).map((record) => ({ recordId: record.id, objectPath: record.objectPath })),
			generatedAt,
			sourceRevision,
		})).sort((left, right) => right.recordIds.length - left.recordIds.length || left.label.localeCompare(right.label));
		this.patch({ activityThemes: themes, activitySessions: sessions, error: null });
		await this.recordEvent('activity-themes-generated', null, `Activity themes grouped ${records.length} explicit records; every theme retains its source record citations.`);
		await this.flushPersist();
	}

	async expandCommunity(communityId: string): Promise<void> {
		if (this.snapshot.communityMembers[communityId]) return;
		const review = this.deps.resolveReviewRuntime();
		if (!review) {
			this.patch({ error: 'Community members are unavailable until the Vault Review runtime is ready.' });
			return;
		}
		try {
			const members = await review.listClusterMembers(communityId, 60);
			this.patch({
				communityMembers: {
					...this.snapshot.communityMembers,
					[communityId]: members.map((member) => ({
						path: member.path,
						label: member.title ?? member.path,
						score: member.pagerank,
					})),
				},
				error: null,
			});
		} catch (error) {
			this.patch({ error: `Could not expand this Community: ${errorMessage(error)}` });
		}
	}

	async openFile(path: string): Promise<boolean> {
		const file = this.deps.app.vault.getAbstractFileByPath(path);
		if (!file || !('extension' in file)) return false;
		await this.deps.app.workspace.getLeaf(false).openFile(file as TFile);
		return true;
	}

	async openOwnerSurface(surface: VaultIntelligenceObjectSummary['id']): Promise<boolean> {
		if (!this.deps.openOwnerSurface) return false;
		await this.deps.openOwnerSurface(surface);
		return true;
	}

	dispose(): void {
		this.abortController?.abort();
		this.abortController = null;
		this.listeners.clear();
	}

	private async executeRun(): Promise<void> {
		try {
			if (!this.snapshot.run.completedStages.includes('discover')) await this.performDiscover();
			if (this.stopAtCheckpoint()) return;
			if (!this.snapshot.run.completedStages.includes('index')) await this.performIndex();
			if (this.stopAtCheckpoint()) return;
			if (!this.snapshot.run.completedStages.includes('ai')) await this.performAi();
			if (this.stopAtCheckpoint()) return;
			if (!this.snapshot.run.completedStages.includes('prepare-review')) await this.performPrepareReview();
			if (this.stopAtCheckpoint()) return;
			if (!this.snapshot.run.completedStages.includes('publish')) await this.performPublish();
		} catch (error) {
			if (this.snapshot.run.stopRequested) {
				this.stopAtCheckpoint();
				return;
			}
			const message = errorMessage(error);
			const completedAt = this.now();
			const activeStage = this.snapshot.run.currentStage;
			if (activeStage && this.stage(activeStage).status === 'running') {
				this.patchStage(activeStage, { status: 'failed', message: `Scan stopped: ${message}`, completedAt });
			}
			for (const operation of this.snapshot.run.operations.filter((candidate) => candidate.status === 'running')) {
				const hasCompletedWork = (operation.attempts ?? []).some((attempt) => ['produced', 'already-current'].includes(attempt.status));
				this.patchOperation(operation.id, {
					status: hasCompletedWork ? 'partial' : 'failed',
					completedAt,
					error: operation.error ?? `Stopped because the Scan failed: ${message}`,
					currentPath: null,
				});
			}
			this.patchRun({ status: 'failed', error: message, completedAt });
			await this.recordEvent('run-failed', this.snapshot.run.id, message);
			await this.flushPersist();
		}
	}

	private async performDiscover(): Promise<void> {
		this.startStage('discover', 'Freezing scope and affected inputs.');
		const startedAt = this.now();
		const executionId = this.idFactory();
		this.patchOperation('plan-scan', { status: 'running', startedAt, executionId, evidence: ['Resolving selected scope and affected context.'], liveEvidence: [{ kind: 'status', text: 'Freezing the selected scope before AI planning.', updatedAt: startedAt }] });
		const plan = this.requirePlan();
		const allFiles = this.deps.app.vault.getFiles();
		let frozen = allFiles.map((file) => file.path);
		if (plan.scope.mode === 'selected') {
			const selected = new Set(plan.scope.selectedPaths);
			frozen = frozen.filter((path) => selected.has(path));
		}
		if (plan.scope.mode === 'changed' && this.snapshot.changedCursorAt) {
			frozen = allFiles
				.filter((file) => file.stat.mtime > this.snapshot.changedCursorAt!)
				.map((file) => file.path);
		}
		this.patchRun({ frozenPaths: frozen });
		const discoverController = new DiscoverController();
		const frozenPlan = discoverController.build({
			scanRunId: this.snapshot.run.id!,
			draft: plan,
			files: allFiles.filter((file) => frozen.includes(file.path)).map((file) => ({ path: file.path, mtime: file.stat.mtime, size: file.stat.size, sha256: null })),
			routes: this.resolveOperationRoutes(),
			selectedTaskIds: this.snapshot.tasks.filter((task) => task.state !== 'verified').map((task) => task.id),
			discoveryObjectives: plan.aiOperations.filter((operation) => operation.enabled && ['relationship-discovery', 'relationship-review', 'semantic-review', 'community-analysis', 'hub-bridge-analysis'].includes(operation.id)).map((operation) => operation.id),
			now: this.now(),
		});
		const scanStore = this.scanRecordStore();
		if (scanStore) {
			const ref = await scanStore.putArtifact(frozenPlan.scanRunId, `frozen-plan-${frozenPlan.fingerprint}`, frozenPlan);
			await this.appendScanDomainEvent('plan.frozen', 'discover', { plan: frozenPlan, ref }, [ref]);
		}
		await this.performScanPlanning(frozen, executionId, startedAt);
		this.completeStage('discover', `${frozen.length.toLocaleString()} objects frozen for this run.`, frozen.length, frozen.length);
		await this.recordEvent('stage-changed', this.snapshot.run.id, `Discover completed with ${frozen.length} objects.`);
		await this.flushPersist();
	}

	private async performScanPlanning(frozenPaths: string[], executionId: string, startedAt: number): Promise<void> {
		const operation = this.operation('plan-scan');
		if (!operation || operation.status === 'skipped') return;
		const route = operation.plannedRoute ?? resolvedRoute(this.resolveOperationRoutes()['plan-scan']);
		if (!route || !this.deps.runScanPlanning) {
			throw new Error('No executable AI route is configured for Scan planning. Runtime model fallback is disabled.');
		}
		this.patchOperation('plan-scan', {
			plannedRoute: route,
			currentPath: 'Preparing execution plan',
			liveEvidence: [{ kind: 'status', text: `Waiting for ${route.provider} · ${route.model} to plan this Scan.`, updatedAt: this.now() }],
		});
		try {
			const result = await this.deps.runScanPlanning({
				route,
				scope: this.requirePlan().scope.mode,
				objectCount: frozenPaths.length,
				changedCount: this.snapshot.changedSinceScan,
				enabledOperations: this.requirePlan().aiOperations.filter((candidate) => candidate.enabled).map((candidate) => candidate.id),
				samplePaths: frozenPaths.slice(0, 12),
				signal: this.abortController!.signal,
			});
			const completedAt = this.now();
			const costUsd = result.usage.totalTokens > 0 && result.usage.costUsd === 0
				? await this.deps.calculateCostUsd(route.provider, route.model, result.usage).catch(() => 0)
				: result.usage.costUsd;
			const usage = { ...result.usage, costUsd };
			const evidence = result.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 8);
			const receipt: VaultScanOperationAttemptReceipt = {
				id: this.idFactory(), executionId, path: null, status: 'produced', plannedRoute: route, actualRoute: route,
				startedAt, completedAt, usage, error: null,
				evidence: evidence.length > 0 ? evidence : ['The provider returned an empty Scan plan.'],
			};
			this.patchOperation('plan-scan', {
				status: 'completed', processed: 1, total: 1, currentPath: null, completedAt, actualRoute: route,
				usage, attempts: [receipt], error: null, evidence: receipt.evidence, liveEvidence: receipt.evidence.map((text) => ({ kind: 'text' as const, text, updatedAt: completedAt })),
			});
		} catch (error) {
			const completedAt = this.now();
			const message = errorMessage(error);
			const receipt: VaultScanOperationAttemptReceipt = {
				id: this.idFactory(), executionId, path: null,
				status: this.snapshot.run.stopRequested ? 'cancelled' : 'failed', plannedRoute: route, actualRoute: null,
				startedAt, completedAt, usage: { ...EMPTY_USAGE }, error: message, evidence: [message],
			};
			this.patchOperation('plan-scan', { status: 'failed', processed: 1, total: 1, currentPath: null, completedAt, error: message, attempts: [receipt], liveEvidence: [], evidence: [message] });
			throw error;
		}
	}

	private async performIndex(): Promise<void> {
		const runId = this.snapshot.run.id;
		const plan = this.requirePlan();
		const frozenPaths = this.snapshot.run.frozenPaths;
		const completedCore = new Set(this.snapshot.run.coreIndexedPaths ?? []);
		const remainingPaths = frozenPaths.filter((path) => !completedCore.has(path));
		const index = this.deps.resolveIndexService();
		if (!index) throw new Error('Knowledge Index runtime is unavailable. Scan cannot execute the configured Index operations.');
		const pathEligibility = Object.fromEntries(frozenPaths.map((path) => [path, index.getPathIndexEligibility(path)]));
		const fullTextPaths = frozenPaths.filter((path) => pathEligibility[path]?.fullText);
		const eligibleFullText = new Set(fullTextPaths);
		for (const path of [...completedCore]) if (!eligibleFullText.has(path)) completedCore.delete(path);
		this.patchRun({ pathEligibility });
		this.startStage('index', 'Updating full-text passages and the Knowledge Index.');
		this.patchStage('index', { processed: completedCore.size, total: fullTextPaths.length, currentPath: null });
		this.preparePerDocumentOperations(index, pathEligibility);
		let embeddingTail = Promise.resolve();
		let aiEnrichmentTail = Promise.resolve();
		let enrichmentFailure: unknown = null;
		const haltForEnrichmentFailure = (error: unknown, failedIds: readonly VaultScanAiOperationId[]) => {
			if (enrichmentFailure) return;
			enrichmentFailure = error;
			this.abortController?.abort();
			const message = errorMessage(error);
			const completedAt = this.now();
			this.patchStage('index', {
				status: 'failed',
				message: `Scan stopped: ${message}`,
				completedAt,
			});
			for (const id of failedIds) {
				const operation = this.operation(id);
				if (!operation || operation.status === 'skipped') continue;
				this.patchOperation(id, {
					status: 'failed',
					completedAt,
					error: message,
					liveEvidence: [...(operation.liveEvidence ?? []), {
						kind: 'status',
						text: `Stopped: ${message}`,
						updatedAt: completedAt,
					}].slice(-8),
				});
			}
		};
		const enqueueEnrichment = (path: string) => {
			embeddingTail = embeddingTail.then(async () => {
				if (this.snapshot.run.stopRequested || enrichmentFailure || !index) return;
				try {
					await this.runVectorEnrichmentForPath(index, path);
				} catch (error) {
					haltForEnrichmentFailure(error, ['embedding-refresh']);
				}
			});
			aiEnrichmentTail = aiEnrichmentTail.then(async () => {
				if (this.snapshot.run.stopRequested || enrichmentFailure || !index) return;
				try {
					await this.runLlmEnrichmentForPath(index, path);
				} catch (error) {
					haltForEnrichmentFailure(error, ['file-summaries', 'ai-tags']);
				}
			});
		};
		for (const path of fullTextPaths.filter((candidate) => completedCore.has(candidate))) enqueueEnrichment(path);
		let coreIndexFailure: unknown = null;
		try {
			await this.deps.runCoreIndex(
				'selected',
				remainingPaths.filter((path) => eligibleFullText.has(path)),
				(progress) => {
					if (progress.path && progress.succeeded !== false) {
						completedCore.add(progress.path);
						this.patchRun({ coreIndexedPaths: [...completedCore] });
						enqueueEnrichment(progress.path);
					}
					this.patchStage('index', {
						processed: completedCore.size,
						total: fullTextPaths.length,
						currentPath: progress.path,
						message: progress.path ? `Indexing ${progress.path}` : 'Updating full-text passages and the Knowledge Index.',
					});
				},
				() => !this.snapshot.run.stopRequested && !enrichmentFailure,
			);
		} catch (error) {
			coreIndexFailure = error;
		}
		await Promise.all([embeddingTail, aiEnrichmentTail]);
		if (enrichmentFailure) throw enrichmentFailure;
		if (coreIndexFailure) throw coreIndexFailure;
		if (this.snapshot.run.stopRequested) throw new Error('Vault Scan stopped at the next core-index document checkpoint.');
		this.finalizePerDocumentOperations();
		const lint = this.deps.resolveLintRuntime();
		if (!lint) throw new Error('Vault maintenance checks are still loading.');
		const result = await lint.runFullScan({
			onProgress: (event) => this.patchStage('index', {
				message: event.detector ? `Checking ${event.detector}` : 'Running maintenance checks',
			}),
			onDetectorWarning: (detectorId, error) => this.addRunWarning(`${detectorId}: ${errorMessage(error)}`),
		});
		const hasPartialEnrichment = (['embedding-refresh', 'file-summaries', 'ai-tags'] as const).some((id) => {
			const status = this.operation(id)?.status;
			return status === 'partial' || status === 'failed';
		});
		const coreComplete = completedCore.size === fullTextPaths.length;
		this.completeStage('index', `${result.totalNotes.toLocaleString()} notes checked; unsupported files were retained as Not supported.`, completedCore.size, fullTextPaths.length, coreComplete && !hasPartialEnrichment ? 'completed' : 'partial');
		await this.recordEvent('stage-changed', runId, coreComplete && !hasPartialEnrichment ? 'Build Index completed.' : 'Build Index retained partial, resumable results.');
		await this.flushPersist();
	}

	private preparePerDocumentOperations(index: IndexService, eligibility: NonNullable<VaultScanRunState['pathEligibility']>): void {
		for (const id of ['embedding-refresh', 'file-summaries', 'ai-tags'] as const) {
			const operation = this.operation(id);
			if (!operation || operation.status === 'skipped') continue;
			const plannedRoute = operation.plannedRoute ?? resolvedRoute(this.resolveOperationRoutes()[id]);
			if (!plannedRoute) {
				throw new Error(`The configured model route for ${id} is no longer executable. Runtime model fallback is disabled.`);
			}
			const isEligible = (path: string) => id === 'embedding-refresh' ? eligibility[path]?.embeddings === true : eligibility[path]?.aiEnrichment === true;
			const eligiblePaths = this.snapshot.run.frozenPaths.filter(isEligible);
			const existing = operation.attempts ?? [];
			const existingPaths = new Set(existing.map((attempt) => attempt.path));
			const ineligibleReceipts = this.snapshot.run.frozenPaths.filter((path) => !isEligible(path) && !existingPaths.has(path)).map((path): VaultScanOperationAttemptReceipt => {
				const at = this.now();
				return { id: this.idFactory(), executionId: operation.executionId ?? this.idFactory(), path, status: 'not-eligible', plannedRoute, actualRoute: null, startedAt: at, completedAt: at, usage: { ...EMPTY_USAGE }, error: null, evidence: [eligibility[path]?.reason ?? 'This file is not eligible for the selected Index layer.'] };
			});
			this.patchOperation(id, { status: 'running', total: eligiblePaths.length, processed: existing.filter((attempt) => attempt.status !== 'not-eligible').length, plannedRoute, startedAt: operation.startedAt ?? this.now(), executionId: operation.executionId ?? this.idFactory(), attempts: [...existing, ...ineligibleReceipts], error: null });
		}
	}

	private async runVectorEnrichmentForPath(index: IndexService, path: string): Promise<void> {
		const operation = this.operation('embedding-refresh');
		if (!operation || operation.status === 'skipped' || operation.status === 'failed') return;
		if (this.snapshot.run.pathEligibility?.[path]?.embeddings !== true) return;
		if (operation.attempts?.some((attempt) => attempt.path === path && ['produced', 'already-current'].includes(attempt.status))) return;
		const plannedRoute = operation.plannedRoute ?? resolvedRoute(this.resolveOperationRoutes()['embedding-refresh']);
		const route = this.resolveOperationRoutes()['embedding-refresh'];
		const embeddingConfig = route && plannedRoute ? this.deps.resolveEmbeddingCallConfig?.(route) : null;
		if (!embeddingConfig) {
			throw new Error('The configured embedding model is not executable. Runtime model fallback is disabled.');
		}
		const startedAt = this.now();
		this.patchOperation(operation.id, { status: 'running', currentPath: path });
		const result = await index.runPendingVectorIndexEnrichment(this.deps.getSearchSettings(), {
			paths: [path], embeddingConfig,
			shouldContinue: () => !this.snapshot.run.stopRequested && this.operation(operation.id)?.status !== 'skipped',
			onProgress: (progress) => this.patchOperation(operation.id, { currentPath: progress.path }),
		});
		this.indexErrors.push(...result.errors);
		if (this.operation(operation.id)?.status === 'skipped') return;
		const failed = result.errors.length > 0;
		const produced = !failed && result.processed > 0;
		const attempt: VaultScanOperationAttemptReceipt = {
			id: this.idFactory(), executionId: operation.executionId ?? this.idFactory(), path,
			status: failed ? 'failed' : produced ? 'produced' : 'already-current',
			plannedRoute, actualRoute: produced ? plannedRoute : null,
			startedAt, completedAt: this.now(), usage: { ...EMPTY_USAGE }, error: result.errors[0]?.message ?? null,
			evidence: [failed ? `Embedding refresh failed for ${path}.` : produced ? `Embedding produced for ${path}.` : `Embedding was already current for ${path}.`],
		};
		const attempts = [...(this.operation(operation.id)?.attempts ?? []), attempt];
		this.patchOperation(operation.id, { status: 'running', processed: attempts.filter((candidate) => candidate.status !== 'not-eligible').length, currentPath: null, actualRoute: produced ? plannedRoute : this.operation(operation.id)?.actualRoute ?? null, attempts, error: result.errors[0]?.message ?? this.operation(operation.id)?.error ?? null });
		if (failed) throw new Error(`Embedding route ${plannedRoute?.provider}/${plannedRoute?.model} failed for ${path}: ${result.errors[0]?.message ?? 'unknown provider error'}`);
		if (!produced) throw new Error(`Embedding route ${plannedRoute?.provider}/${plannedRoute?.model} returned without a verifiable document receipt for ${path}.`);
	}

	private async runLlmEnrichmentForPath(index: IndexService, path: string): Promise<void> {
		if (this.snapshot.run.pathEligibility?.[path]?.aiEnrichment !== true) return;
		const ids: VaultScanAiOperationId[] = ['file-summaries', 'ai-tags'];
		const enabled = ids.filter((id) => {
			const operation = this.operation(id);
			return Boolean(operation && !['skipped', 'failed'].includes(operation.status) && !operation.attempts?.some((attempt) => attempt.path === path && ['produced', 'already-current'].includes(attempt.status)));
		});
		const groups = new Map<string, { route: VaultScanResolvedRoute; ids: VaultScanAiOperationId[] }>();
		for (const id of enabled) {
			const route = this.operation(id)!.plannedRoute!;
			const key = `${route.profileId}\u0000${route.model}\u0000${route.provider}`;
			const group = groups.get(key) ?? { route, ids: [] };
			group.ids.push(id);
			groups.set(key, group);
		}
		for (const group of groups.values()) {
			if (this.snapshot.run.stopRequested) return;
			const executionId = this.operation(group.ids[0]!)?.executionId ?? this.idFactory();
			const startedAt = this.now();
			for (const id of group.ids) this.patchOperation(id, {
				status: 'running', executionId, currentPath: path,
				liveEvidence: [{ kind: 'status', text: `Preparing ${id === 'file-summaries' ? 'Summary' : 'AI Tags'} for ${path}.`, updatedAt: startedAt }],
			});
			const result = await index.runPendingLlmIndexEnrichment(this.deps.getSearchSettings(), {
				signal: this.abortController?.signal,
				paths: [path], includeSummary: group.ids.includes('file-summaries'), includeTags: group.ids.includes('ai-tags'),
				llmRoute: { profileId: group.route.profileId, modelId: group.route.model, provider: group.route.provider },
				shouldContinue: () => !this.snapshot.run.stopRequested && group.ids.some((id) => this.operation(id)?.status !== 'skipped'),
				onProgress: (progress) => { for (const id of group.ids) this.patchOperation(id, { currentPath: progress.path }); },
				onActivity: (activity) => {
					const operationId: VaultScanAiOperationId = activity.operation === 'summary' ? 'file-summaries' : 'ai-tags';
					if (!group.ids.includes(operationId)) return;
					const operation = this.operation(operationId);
					const liveEvidence = [...(operation?.liveEvidence ?? []), {
						kind: activity.phase === 'response-received' ? 'text' as const : 'status' as const,
						text: activity.text,
						updatedAt: activity.updatedAt,
					}].slice(-8);
					this.patchOperation(operationId, { currentPath: activity.path, liveEvidence });
				},
				onTrace: (trace) => {
					const index = this.generationTraces.findIndex((candidate) => (
						candidate.requestId === trace.requestId
						&& candidate.operation === trace.operation
						&& candidate.path === trace.path
					));
					const next = index < 0
						? [...this.generationTraces, trace]
						: this.generationTraces.map((candidate, candidateIndex) => candidateIndex === index ? trace : candidate);
					const maxRecent = DEFAULT_INDEX_ENRICHMENT_CONFIG.trace.maxRecentCalls;
					const failedTraces = next.filter((candidate) => candidate.phase === 'failed');
					const nonFailedTraces = next.filter((candidate) => candidate.phase !== 'failed');
					this.generationTraces = [
						...nonFailedTraces.slice(-Math.max(0, maxRecent - Math.min(maxRecent, failedTraces.length))),
						...failedTraces.slice(-maxRecent),
					].sort((left, right) => left.startedAt - right.startedAt);
					const operationId: VaultScanAiOperationId = trace.operation === 'summary' ? 'file-summaries' : 'ai-tags';
					if (group.ids.includes(operationId)) this.patchOperation(operationId, { currentPath: trace.path });
				},
			});
			this.indexErrors.push(...result.errors);
			if (result.attempts.length === 0) throw new Error(`AI enrichment route ${group.route.provider}/${group.route.model} returned without a terminal receipt for ${path}.`);
			const sourceAttempts = result.attempts;
			const receiptUsage = sourceAttempts.reduce<VaultScanUsage>((total, attempt) => {
				return addVaultUsage(total, normalizeUsage(attempt.usage, attempt.costUsd));
			}, { ...EMPTY_USAGE });
			if (receiptUsage.totalTokens > 0 && receiptUsage.costUsd === 0) receiptUsage.costUsd = await this.deps.calculateCostUsd(group.route.provider, group.route.model, receiptUsage);
			for (const id of group.ids) {
				const current = this.operation(id)!;
				const outputKey = id === 'file-summaries' ? 'summary' : 'tags';
				const receipts: VaultScanOperationAttemptReceipt[] = sourceAttempts.map((attempt) => {
					const outputStatus = attempt.outputs?.[outputKey];
					const status: VaultScanOperationAttemptReceipt['status'] = outputStatus === 'produced'
						? 'produced'
						: outputStatus === 'failed'
							? 'failed'
							: attempt.status;
					const produced = status === 'produced' || status === 'partial';
					const attributedUsage = attempt.outputUsage?.[outputKey] ?? (group.ids.length === 1 ? attempt.usage : {
						inputTokens: Math.round((attempt.usage.inputTokens ?? 0) / group.ids.length),
						outputTokens: Math.round((attempt.usage.outputTokens ?? 0) / group.ids.length),
						totalTokens: Math.round((attempt.usage.totalTokens ?? 0) / group.ids.length),
						reasoningTokens: Math.round((attempt.usage.reasoningTokens ?? 0) / group.ids.length),
						cachedInputTokens: Math.round((attempt.usage.cachedInputTokens ?? 0) / group.ids.length),
					});
					return {
						id: this.idFactory(), executionId, path: attempt.path, status,
						plannedRoute: group.route, actualRoute: produced ? group.route : null,
						startedAt: attempt.startedAt, completedAt: attempt.completedAt, usage: normalizeUsage(attributedUsage, 0), error: status === 'produced' ? null : attempt.error,
						evidence: [attempt.status === 'not-eligible' ? `${id === 'file-summaries' ? 'Summary' : 'AI Tags'} is not supported for ${attempt.path}.` : status === 'produced' ? `${id === 'file-summaries' ? 'Summary' : 'AI Tags'} was produced for ${attempt.path}.` : attempt.error ?? `${id === 'file-summaries' ? 'Summary' : 'AI Tags'} did not complete for ${attempt.path}.`],
						generatedKnowledge: id === 'file-summaries'
							? { summary: attempt.generatedKnowledge?.summary ?? null }
							: { tags: attempt.generatedKnowledge?.tags ?? [] },
					};
				});
				const attempts = [...(current.attempts ?? []), ...receipts];
				const usage = sumAttemptUsage(attempts);
				if (usage.totalTokens > 0 && usage.costUsd === 0) usage.costUsd = await this.deps.calculateCostUsd(group.route.provider, group.route.model, usage);
				this.patchOperation(id, { status: 'running', processed: attempts.filter((candidate) => candidate.status !== 'not-eligible').length, currentPath: null, usage, actualRoute: receipts.some((attempt) => attempt.actualRoute) ? group.route : current.actualRoute ?? null, attempts, error: result.errors[0]?.message ?? current.error ?? null, evidence: [`${attempts.filter((attempt) => attempt.status === 'produced').length.toLocaleString()} provider-produced and ${attempts.filter((attempt) => attempt.status === 'already-current').length.toLocaleString()} already-current document receipts.`] });
			}
			const failed = sourceAttempts.find((attempt) => ['failed', 'partial', 'cancelled'].includes(attempt.status));
			if (failed) throw new Error(`AI enrichment route ${group.route.provider}/${group.route.model} failed for ${path}: ${failed.error ?? 'provider completion was not produced'}`);
		}
	}

	private finalizePerDocumentOperations(): void {
		for (const id of ['embedding-refresh', 'file-summaries', 'ai-tags'] as const) {
			const operation = this.operation(id);
			if (!operation || operation.status === 'skipped' || (operation.status === 'failed' && !operation.attempts?.length)) continue;
			const attempts = operation.attempts ?? [];
			const successes = attempts.filter((attempt) => attempt.status === 'produced' || attempt.status === 'already-current').length;
			const failures = attempts.filter((attempt) => ['failed', 'partial', 'cancelled'].includes(attempt.status)).length;
			const total = operation.total;
			const status = failures === 0 && successes === total ? 'completed' : successes > 0 ? 'partial' : 'failed';
			this.patchOperation(id, { status, processed: successes + failures, total, currentPath: null, completedAt: status === 'completed' ? this.now() : null, error: status === 'completed' ? null : operation.error ?? `${successes} of ${total} eligible documents reached a successful receipt.` });
		}
	}

	private async performAi(): Promise<void> {
		this.startStage('ai', 'Assembling deterministic evidence for Vault-wide discovery.');
		const index = this.deps.resolveIndexService();
		if (!index) throw new Error('Knowledge Index runtime is unavailable for Vault-wide discovery.');
		await index.runMobiusGlobalMaintenance(['vault', 'chat'], {
			signal: this.abortController?.signal,
			onProgress: (event) => this.patchStage('ai', { message: `Evidence assembly · ${event.phase.replace(/_/g, ' ')}${event.progressTextSuffix ?? ''}` }),
		});
		const discoveryIds: VaultScanAiOperationId[] = ['relationship-discovery', 'semantic-review', 'community-analysis', 'hub-bridge-analysis'];
		const enabled = discoveryIds.filter((id) => this.operation(id)?.status !== 'skipped');
		if (enabled.length === 0) {
			this.completeStage('ai', 'Vault-wide discovery was not selected; deterministic evidence remains available.', 0, 0, 'skipped');
			return;
		}
		const review = this.deps.resolveReviewRuntime();
		if (!review) throw new Error('Vault Discovery Agent runtime is unavailable.');
		const runId = this.snapshot.run.id!;
		const evidence = buildDiscoveryEvidenceLedger(runId, enabled);
		const snapshots: VaultReviewSessionSnapshot[] = [];
		const controller = new VaultDiscoveryController({
			run: async ({ investigation, signal }) => {
				const objectiveId = investigation.id.replace(/^investigation:/, '') as VaultScanAiOperationId;
				const operation = this.operation(objectiveId);
				const route = operation?.plannedRoute ?? resolvedRoute(this.resolveOperationRoutes()[objectiveId]);
				if (!operation || !route) throw new Error(`The configured route for ${objectiveId} is unavailable. Runtime model fallback is disabled.`);
				const executionId = operation.executionId ?? this.idFactory();
				const startedAt = this.now();
				const objectiveEvidenceRef = evidence.eligibleRefs.find((ref) => ref.endsWith(`:${objectiveId}`));
				if (!objectiveEvidenceRef) throw new Error(`The frozen evidence packet for ${objectiveId} is missing.`);
				this.patchOperation(objectiveId, { status: 'running', startedAt: operation.startedAt ?? startedAt, executionId, plannedRoute: route, currentPath: investigation.question, total: 1, attempts: operation.attempts ?? [] });
				let finalSnapshot: VaultReviewSessionSnapshot | null = null;
				for await (const reviewSnapshot of review.run({
					mode: 'complete', signal,
					route: { profileId: route.profileId, modelId: route.model, provider: route.provider },
					focus: { objectiveId, instruction: discoveryObjectiveInstruction(objectiveId), evidenceRefs: [objectiveEvidenceRef] },
				})) {
					finalSnapshot = reviewSnapshot;
					const liveEvidence = reviewLiveEvidence(reviewSnapshot, this.now());
					this.patchOperation(objectiveId, { currentPath: `Investigation ${reviewSnapshot.currentRoundIndex + 1} · ${reviewSnapshot.status}`, liveEvidence, evidence: liveEvidence.map((entry) => entry.text) });
				}
				const completionEvents = countReviewCompletionEvents(finalSnapshot);
				if (!finalSnapshot || finalSnapshot.status !== 'completed' || completionEvents === 0) throw new Error(finalSnapshot?.error ?? `${objectiveId} ended without a provider completion receipt.`);
				snapshots.push(finalSnapshot);
				const usage = collectReviewUsage(finalSnapshot);
				if (usage.totalTokens > 0) usage.costUsd = await this.deps.calculateCostUsd(route.provider, route.model, usage);
				const completedAt = this.now();
				const proposals = discoveryProposalsForObjective(objectiveId, investigation.id, finalSnapshot, [objectiveEvidenceRef]);
				const evidenceCount = reviewEvidenceCount(finalSnapshot);
				const receipt: VaultScanOperationAttemptReceipt = { id: this.idFactory(), executionId, path: null, status: 'produced', plannedRoute: route, actualRoute: route, startedAt, completedAt, usage, error: null, evidence: [`${completionEvents} provider completion event(s).`, `${evidenceCount} structured evidence item(s).`, `${proposals.length} retained proposal candidate(s).`] };
				this.patchOperation(objectiveId, { status: 'completed', processed: 1, total: 1, currentPath: null, usage, actualRoute: route, completedAt, attempts: [...(this.operation(objectiveId)?.attempts ?? []), receipt], evidence: receipt.evidence, error: null });
				return { attemptId: receipt.id, stream: reviewLiveEvidence(finalSnapshot, this.now()).map((event) => ({ type: event.kind === 'tool' ? 'tool-result' as const : 'reasoning' as const, text: event.text, route: `${route.provider}/${route.model}`, evidenceRef: objectiveEvidenceRef })), inspectedEvidenceRefs: [objectiveEvidenceRef], proposals, terminalObjectiveIds: [objectiveId], usage, error: null };
			},
		}, { now: this.now, id: this.idFactory, onCheckpoint: async (session) => {
			this.discoverySession = session;
			this.patchRun({ discoveryFindings: projectDiscoverySessionFindings(session) });
			this.patchStage('ai', { processed: session.terminalObjectiveIds.length, total: session.objectiveIds.length, message: discoverySessionMessage(session) });
			const store = this.scanRecordStore();
			if (store && this.scanDomainState) await store.saveCheckpoint({ schemaVersion: 1, state: this.scanDomainState, discovery: session, reviewPreparation: this.reviewPreparationSession, lastEventSequence: this.scanDomainState.eventSequence, updatedAt: this.now() });
		} });
		const session = controller.create({ sessionId: `${runId}:discovery`, scanRunId: runId, snapshotId: this.scanDomainState?.snapshotId ?? runId, evidence, objectiveIds: enabled });
		this.discoverySession = await controller.run(session, this.abortController!.signal);
		if (this.snapshot.run.stopRequested || this.discoverySession.status === 'paused') throw new Error('Vault-wide discovery stopped at an Agent checkpoint.');
		if (this.discoverySession.status !== 'completed' || !this.discoverySession.completionReceiptId) throw new Error(`Vault-wide discovery did not satisfy its strict completion gate (${this.discoverySession.status}).`);
		this.aiReviewSnapshots = snapshots;
		this.patchRun({ discoveryFindings: projectDiscoverySessionFindings(this.discoverySession) });
		this.completeStage('ai', 'Vault-wide discovery completed with validated objective receipts.', this.discoverySession.terminalObjectiveIds.length, enabled.length);
		await this.recordEvent('stage-changed', this.snapshot.run.id, 'AI work completed.');
		await this.flushPersist();
	}

	private async performPrepareReview(): Promise<void> {
		this.startStage('prepare-review', 'Freezing findings and planning owner review work.');
		const config = await loadVaultIntelligenceConfig();
		const lintResult = await this.deps.resolveLintRuntime()?.loadLatestScan() ?? null;
		const frozen = new Set(this.snapshot.run.frozenPaths);
		const findings = (lintResult?.findings ?? []).filter((finding) => this.requirePlan().scope.mode === 'entire' || Boolean(finding.filePath && frozen.has(finding.filePath)));
		const atoms = normalizeReviewAtoms({ config, findings, indexErrors: this.indexErrors, reviewSnapshots: this.aiReviewSnapshots, sourceRevision: (path) => `${path}:${this.fileMtime(path) ?? 'missing'}` });
		const reviewRuntime = this.deps.resolveReviewRuntime();
		const controller = new ReviewPreparationController({
			run: async ({ job, atoms: jobAtoms, signal }) => {
				if (!reviewRuntime) throw new Error('Review Preparation Agent runtime is unavailable.');
				let final: VaultReviewSessionSnapshot | null = null;
				let artifactRoute: VaultScanResolvedRoute | null = null;
				let combinedUsage = { ...EMPTY_USAGE };
				for (const operationId of ['maintenance-synthesis', 'file-proposals'] as const) {
					const operation = this.operation(operationId);
					if (!operation || operation.status === 'skipped') continue;
					const route = operation.plannedRoute ?? resolvedRoute(this.resolveOperationRoutes()[operationId]);
					if (!route) throw new Error(`The configured ${operationId} route is unavailable. Runtime model fallback is disabled.`);
					const executionId = this.idFactory();
					const startedAt = this.now();
					this.patchOperation(operationId, { status: 'running', startedAt: operation.startedAt ?? startedAt, executionId, plannedRoute: route, currentPath: job.jobId });
					let snapshot: VaultReviewSessionSnapshot | null = null;
					for await (const next of reviewRuntime.run({ mode: 'fast', signal, route: { profileId: route.profileId, modelId: route.model, provider: route.provider }, focus: { objectiveId: operationId, instruction: `Complete ${operationId} for review job ${job.jobId}.`, evidenceRefs: unique(jobAtoms.flatMap((atom) => atom.evidenceRefs)) } })) snapshot = next;
					if (!snapshot || snapshot.status !== 'completed' || countReviewCompletionEvents(snapshot) === 0) throw new Error(snapshot?.error ?? `${operationId} ended without a provider completion receipt.`);
					const usage = collectReviewUsage(snapshot);
					if (usage.totalTokens > 0) usage.costUsd = await this.deps.calculateCostUsd(route.provider, route.model, usage);
					const completedAt = this.now();
					const receipt: VaultScanOperationAttemptReceipt = { id: this.idFactory(), executionId, path: null, status: 'produced', plannedRoute: route, actualRoute: route, startedAt, completedAt, usage, error: null, evidence: [`Review job ${job.jobId} completed with ${countReviewCompletionEvents(snapshot)} provider completion event(s).`] };
					const attempts = [...(this.operation(operationId)?.attempts ?? []), receipt];
					this.patchOperation(operationId, { status: 'running', processed: attempts.length, total: Math.max(attempts.length, this.operation(operationId)?.total ?? 0), currentPath: null, actualRoute: route, usage: sumAttemptUsage(attempts), attempts, evidence: receipt.evidence, error: null });
					combinedUsage = addVaultUsage(combinedUsage, usage);
					final = snapshot;
					artifactRoute = route;
				}
				if (!final || !artifactRoute) throw new Error('No configured Review Preparation operation executed for this review job.');
				const evidenceSummary = reviewLiveEvidence(final, this.now()).map((entry) => entry.text).slice(-3).join(' ') || `${jobAtoms.length} frozen findings were inspected.`;
				const objectRefs = unique(jobAtoms.flatMap((atom) => atom.objectRefs));
				const citations = jobAtoms.flatMap((atom) => atom.evidenceRefs.map((evidenceRef, index) => ({ evidenceRef, sourceRevisionRef: atom.sourceRevisionRefs[index] ?? atom.sourceRevisionRefs[0]! })));
				return { attemptId: this.idFactory(), usage: combinedUsage, stream: reviewLiveEvidence(final, this.now()).map((event) => ({ type: event.kind === 'tool' ? 'tool-result' as const : 'reasoning-delta' as const, text: event.text })), artifact: { schemaVersion: 1, scanRunId: this.snapshot.run.id!, title: reviewTaskTitle(jobAtoms), ownerQuestion: reviewOwnerQuestion(jobAtoms), evidenceSummary, affectedObjectRefs: objectRefs, citations, choices: jobAtoms[0]?.writeBoundary === 'proposal' ? [{ id: 'review', label: 'Review proposal', description: 'Prepare a revision-guarded proposal after owner confirmation.' }, { id: 'keep', label: 'Keep current', description: 'Record a no-change owner decision.' }] : [], recommendedChoiceId: jobAtoms[0]?.writeBoundary === 'proposal' ? 'review' : null, recommendationReason: evidenceSummary, impact: 'medium', caveats: ['No user file is changed by Scan or Prepare review.'], writeBoundary: jobAtoms[0]?.writeBoundary ?? 'no-change', verificationKind: jobAtoms[0]?.verificationKind ?? 'fresh-detector', exitCondition: jobAtoms[0]?.exitCondition ?? 'Owner disposition recorded.', sourceRevisionRefs: unique(jobAtoms.flatMap((atom) => atom.sourceRevisionRefs)), generatedBy: { attemptId: '', route: artifactRoute, usage: combinedUsage } } };
			},
		}, { now: this.now, id: this.idFactory, onCheckpoint: (session) => {
			this.reviewPreparationSession = session;
			this.patchRun({ reviewPreparation: projectReviewPreparation(session) });
			this.patchStage('prepare-review', { processed: session.dispositions.length, total: session.atoms.length, message: reviewPreparationMessage(session) });
			this.persistenceTail = this.persistenceTail.then(() => this.appendScanDomainEvent('review.checkpoint', 'prepare-review', { sessionId: session.id, status: session.status, phase: session.phase, planRevision: session.planRevision }));
		} });
		const initial = controller.create({ sessionId: this.idFactory(), scanRunId: this.snapshot.run.id!, inputSnapshotId: `review:${this.snapshot.run.id}`, atoms });
		const result = await controller.run(initial, this.abortController!.signal);
		this.reviewPreparationSession = result.session;
		this.reviewPreparationPackage = result.package;
		await this.persistenceTail;
		this.patchRun({ reviewPreparation: projectReviewPreparation(result.session) });
		if (!result.package) throw new Error('Prepare review stopped before its package was frozen.');
		for (const operationId of ['maintenance-synthesis', 'file-proposals'] as const) {
			const operation = this.operation(operationId);
			if (!operation || operation.status === 'skipped') continue;
			const attempts = operation.attempts ?? [];
			if (atoms.length === 0) {
				this.patchOperation(operationId, { status: 'skipped', processed: 0, total: 0, completedAt: this.now(), evidence: ['No reviewable atoms required this configured operation.'], error: null });
				continue;
			}
			if (attempts.length === 0 || attempts.some((attempt) => attempt.status !== 'produced' || !attempt.actualRoute)) throw new Error(`${operationId} did not produce all required Review Preparation receipts.`);
			this.patchOperation(operationId, { status: 'completed', processed: attempts.length, total: attempts.length, completedAt: this.now(), error: null });
		}
		if (result.session.status !== 'completed') throw new Error(`Review Preparation did not satisfy its strict completion gate (${result.session.status}).`);
		this.completeStage('prepare-review', `${result.package.tasks.length} review work item(s) validated.`, result.session.dispositions.length, result.session.atoms.length);
		await this.recordEvent('stage-changed', this.snapshot.run.id, 'Prepare review completed.');
		await this.flushPersist();
	}

	private async performPublish(): Promise<void> {
		const index = this.deps.resolveIndexService();
		if (this.snapshot.run.stopRequested) throw new Error('Vault Scan stopped while publishing Peak-owned machine state.');
		if (!this.reviewPreparationPackage) throw new Error('Publish requires a frozen Review Preparation package.');
		const incompleteStages = this.snapshot.run.stages.filter((stage) => stage.id !== 'publish' && !['completed', 'skipped'].includes(stage.status));
		if (incompleteStages.length > 0) throw new Error(`Publish blocked: required stages are not complete (${incompleteStages.map((stage) => `${stage.id}:${stage.status}`).join(', ')}).`);
		const incompleteOperations = this.snapshot.run.operations.filter((operation) => operation.enabled && !['completed', 'skipped'].includes(operation.status));
		if (incompleteOperations.length > 0) throw new Error(`Publish blocked: configured operations lack terminal success receipts (${incompleteOperations.map((operation) => `${operation.id}:${operation.status}`).join(', ')}).`);
		const receiptViolations = this.snapshot.run.operations.filter((operation) => operation.enabled && operation.status === 'completed' && operation.total > 0 && !(operation.attempts ?? []).some((attempt) => attempt.status === 'produced' && attempt.actualRoute));
		if (receiptViolations.length > 0) throw new Error(`Publish blocked: configured operations completed without actual provider receipts (${receiptViolations.map((operation) => operation.id).join(', ')}).`);
		if (this.discoverySession && !this.discoverySession.completionReceiptId) throw new Error('Publish blocked: Vault-wide discovery has no controller completion receipt.');
		this.startStage('publish', 'Atomically publishing the frozen Completed package.');
		const lintResult = (await this.deps.resolveLintRuntime()?.loadLatestScan()) ?? null;
		const runId = this.snapshot.run.id!;
		const plan = this.requirePlan();
		const tasks = mergePreparedTasks(this.snapshot.tasks, this.reviewPreparationPackage.tasks, runId, this.now());
		const followUpTasks = tasks.filter((task) => task.sourceRunId === runId && task.state !== 'verified');
		const indexStatus = await index?.getIndexStatus().catch(() => null) ?? null;
		const completedAt = this.now();
		const resolvedRoutes = this.resolveOperationRoutes();
		const completed: VaultCompletedRun = {
			runId,
			startedAt: this.snapshot.run.startedAt ?? completedAt,
			completedAt,
			scopeMode: plan.scope.mode,
			objectCount: this.snapshot.run.frozenPaths.length,
			searchableCount: indexStatus?.indexedDocs ?? null,
			usage: totalUsage(this.snapshot.run.operations),
			providerReceiptCount: providerReceiptCount(this.snapshot.run.operations),
			receipts: buildReceipts(this.snapshot.run, indexStatus?.indexedDocs ?? null, lintResult),
			maintenanceTaskIds: followUpTasks.map((task) => task.id),
			warnings: [...this.snapshot.run.warnings],
			aiOperations: plan.aiOperations.map(({ id, model, provider }) => ({
				id,
				model,
				provider,
				profileId: resolvedRoutes[id]?.profileId ?? null,
			})),
		};
		const scanStore = this.scanRecordStore();
		if (scanStore && this.scanDomainState?.snapshotId) {
			const completedPackage = buildCompletedPackage({
				packageId: this.idFactory(),
				scanRunId: runId,
				snapshotId: this.scanDomainState.snapshotId,
				indexReceiptRefs: this.snapshot.run.operations.flatMap((operation) => operation.attempts?.map((attempt) => attempt.id) ?? []),
				discoveryArtifactRefs: (this.snapshot.run.discoveryFindings ?? []).map((finding) => finding.id),
				review: this.reviewPreparationPackage,
				usage: totalUsage(this.snapshot.run.operations),
				warnings: this.snapshot.run.warnings,
				now: completedAt,
			});
			const publisher = new CompletedPublisher({
				stageBody: (pkg) => scanStore.putArtifact(runId, `completed-${pkg.checksum}`, pkg),
				appendPrepared: async (pkg, ref) => { await this.appendScanDomainEvent('package.prepared', 'publish', { packageId: pkg.packageId }, [ref]); },
				updateCurrentPointer: async (_pkg, ref) => {
					if (!this.scanDomainState) return;
					this.scanDomainState = { ...this.scanDomainState, completedPackageRef: ref, updatedAt: this.now() };
					await scanStore.saveCheckpoint({ schemaVersion: 1, state: this.scanDomainState, discovery: null, reviewPreparation: this.reviewPreparationSession, lastEventSequence: this.scanDomainState.eventSequence, updatedAt: this.now() });
				},
				appendCompleted: async (pkg, ref) => { await this.appendScanDomainEvent('package.completed', 'publish', { packageId: pkg.packageId }, [ref]); },
				readBack: (ref) => scanStore.readArtifact(ref),
			});
			await publisher.publish(completedPackage);
			await this.appendScanDomainEvent('run.status-changed', 'publish', { status: 'completed' });
		}
		this.completeStage('publish', `${followUpTasks.length} maintenance tasks need owner follow-up.`, followUpTasks.length, followUpTasks.length);
		this.patchRun({ status: 'completed', completedAt, currentStage: null });
		const changedCursorAt = plan.scope.mode === 'selected'
			? this.snapshot.changedCursorAt
			: this.snapshot.run.startedAt;
		this.patch({ tasks, lastCompletedRun: completed, changedCursorAt });
		this.addActivity('scan', 'Vault Scan completed', null, runId);
		await this.recordEvent('run-completed', runId, `Vault Scan completed with ${followUpTasks.length} maintenance tasks.`);
		await this.flushPersist();
		await this.refreshAfterRun();
	}

	private recoverPersistedState(persisted: VaultIntelligencePersistedState | null): VaultIntelligencePersistedState {
		if (!persisted || (persisted.version !== 1 && persisted.version !== 2 && persisted.version !== 3 && persisted.version !== 4)) {
			return {
				version: 4,
				updatedAt: this.now(),
				changedCursorAt: null,
				activeRun: null,
				lastCompletedRun: null,
				tasks: [],
				recentActivity: [],
				proposals: [],
				mapTextEntries: [],
				activityThemes: [],
			};
		}
		const legacy = persisted as VaultIntelligencePersistedState & { changedCursorAt?: number | null };
		if (legacy.changedCursorAt === undefined) {
			persisted = {
				...legacy,
				changedCursorAt: legacy.lastCompletedRun?.scopeMode === 'selected'
					? null
					: legacy.lastCompletedRun?.startedAt ?? null,
			};
		}
		const activeRun = persisted.activeRun ? {
			...persisted.activeRun,
			stages: migrateRunStages(persisted.activeRun.stages),
			plan: persisted.activeRun.plan
				? migratePlanChecks(persisted.activeRun.plan, DEFAULT_VAULT_INTELLIGENCE_CONFIG)
				: null,
		} : null;
		const migrated = {
			...persisted,
			version: 4 as const,
			proposals: persisted.proposals ?? [],
			mapTextEntries: persisted.mapTextEntries ?? [],
			activityThemes: persisted.activityThemes ?? [],
			activeRun,
		};
		if (activeRun?.status !== 'running' && activeRun?.status !== 'stopping') return migrated;
		return {
			...migrated,
			activeRun: { ...activeRun, status: 'interrupted', stopRequested: false },
		};
	}

	private async refreshAfterRun(): Promise<void> {
		const files = this.deps.app.vault.getFiles();
		const digest = await this.deps.resolveReviewRuntime()?.getDigest().catch(() => null) ?? null;
		const changedPaths = this.snapshot.changedCursorAt
			? files.filter((file) => file.stat.mtime > this.snapshot.changedCursorAt!).map((file) => file.path).sort((left, right) => left.localeCompare(right))
			: [];
		const changedSinceScan = this.snapshot.changedCursorAt ? changedPaths.length : null;
		const indexStatus = await this.deps.resolveIndexService()?.getIndexStatus().catch(() => null) ?? null;
		const searchReady = indexStatus?.isReady
			? await this.deps.resolveIndexService()?.countIndexedDocuments(files.map((file) => file.path)).catch(() => null) ?? null
			: null;
		this.patch({
			digest,
			fileTypes: summarizeVaultFileTypes(files),
			availablePaths: files.map((file) => file.path).sort((left, right) => left.localeCompare(right)),
			availablePathBytes: Object.fromEntries(files.map((file) => [file.path, file.stat.size])),
			changedPaths,
			activityDays: summarizeVaultActivity(files),
			changedSinceScan,
			indexReadiness: {
				discovered: files.length,
				searchReady,
				pendingOrExcluded: searchReady === null ? null : Math.max(0, files.length - searchReady),
				builtAt: indexStatus?.indexBuiltAt ?? null,
				isReady: indexStatus?.isReady ?? false,
			},
		});
	}

	private stopAtCheckpoint(): boolean {
		if (!this.snapshot.run.stopRequested) return false;
		const status = this.snapshot.run.stopMode === 'pause' ? 'paused' : 'stopped-partial';
		this.patchRun({ status, currentStage: null, stopRequested: false, stopMode: null });
		this.queuePersist();
		return true;
	}

	private startStage(id: VaultScanStageId, message: string): void {
		this.patchRun({ currentStage: id });
		this.patchStage(id, { status: 'running', message, startedAt: this.now(), completedAt: null });
		void this.recordEvent('stage-changed', this.snapshot.run.id, `${id}: ${message}`);
	}

	private completeStage(
		id: VaultScanStageId,
		message: string,
		processed: number,
		total: number,
		status: 'completed' | 'partial' | 'skipped' = 'completed',
	): void {
		this.patchStage(id, { status, message, processed, total, currentPath: null, completedAt: this.now() });
		if (status === 'completed') this.patchRun({ completedStages: unique([...this.snapshot.run.completedStages, id]) });
	}

	private stage(id: VaultScanStageId) {
		return this.snapshot.run.stages.find((stage) => stage.id === id)!;
	}

	private operation(id: VaultScanAiOperationId) {
		return this.snapshot.run.operations.find((operation) => operation.id === id);
	}

	private patchStage(id: VaultScanStageId, next: Partial<VaultScanRunState['stages'][number]>): void {
		this.patchRun({ stages: this.snapshot.run.stages.map((stage) => stage.id === id ? { ...stage, ...next } : stage) });
	}

	private patchOperation(id: VaultScanAiOperationId, next: Partial<VaultScanOperationState>): void {
		const previous = this.operation(id);
		this.patchRun({ operations: this.snapshot.run.operations.map((operation) => operation.id === id ? { ...operation, ...next } : operation) });
		if (next.status && previous?.status !== next.status) {
			void this.recordEvent('operation-changed', this.snapshot.run.id, `${id}: ${next.status}`);
		}
	}

	private addRunWarning(warning: string): void {
		this.patchRun({ warnings: unique([...this.snapshot.run.warnings, warning]) });
	}

	private replaceTask(task: VaultMaintenanceTask): void {
		this.patch({ tasks: this.snapshot.tasks.map((candidate) => candidate.id === task.id ? task : candidate) });
		this.queuePersist();
	}

	private patchTaskWorkflow(
		taskId: string,
		state: VaultMaintenanceTask['state'],
		phase: NonNullable<VaultMaintenanceTask['workflow']>['phase'],
		detail: string,
		progress: Partial<Pick<NonNullable<VaultMaintenanceTask['workflow']>, 'processed' | 'total' | 'currentPath'>> = {},
	): void {
		const updatedAt = this.now();
		this.patch({
			tasks: this.snapshot.tasks.map((task) => task.id === taskId ? {
				...task,
				state,
				updatedAt,
				workflow: {
					phase,
					processed: progress.processed ?? task.workflow?.processed ?? 0,
					total: progress.total ?? task.workflow?.total ?? task.atomicItems.length,
					currentPath: progress.currentPath === undefined ? task.workflow?.currentPath ?? null : progress.currentPath,
					detail,
					updatedAt,
				},
			} : task),
		});
	}

	private finishTaskSuggestionReceipt(taskId: string, receipt: NonNullable<VaultMaintenanceTask['suggestionReceipt']>): void {
		this.patch({
			tasks: this.snapshot.tasks.map((task) => task.id === taskId ? { ...task, suggestionReceipt: receipt, updatedAt: receipt.completedAt ?? task.updatedAt } : task),
			error: receipt.error,
		});
		this.queuePersist();
	}

	private addActivity(
		kind: 'scan' | 'owner-choice' | 'apply' | 'verify',
		label: string,
		objectPath: string | null,
		runId: string | null,
	): void {
		const record = { id: this.idFactory(), timestamp: this.now(), kind, label, objectPath, runId } as const;
		this.patch({ recentActivity: [...this.snapshot.recentActivity, record].slice(-500) });
	}

	private fileMtime(path: string | null): number | null {
		if (!path) return null;
		const file = this.deps.app.vault.getAbstractFileByPath(path);
		return file && 'stat' in file ? (file as TFile).stat.mtime : null;
	}

	private async readSourceFile(path: string): Promise<{ file: TFile; content: string } | null> {
		const file = this.deps.app.vault.getAbstractFileByPath(path);
		if (!file || !('extension' in file)) return null;
		try {
			return { file: file as TFile, content: await this.deps.app.vault.read(file as TFile) };
		} catch {
			return null;
		}
	}

	private async markProposalStale(proposal: VaultMaintenanceProposal, error: string): Promise<void> {
		const now = this.now();
		this.patch({
			proposals: this.snapshot.proposals.map((candidate) => candidate.id === proposal.id
				? { ...candidate, status: 'stale', updatedAt: now, warnings: unique([...candidate.warnings, error]) }
				: candidate),
			tasks: this.snapshot.tasks.map((task) => task.id === proposal.taskId
				? { ...task, state: 'recovery', updatedAt: now, workflow: { phase: 'recovery', processed: 0, total: task.atomicItems.length, currentPath: null, detail: error, updatedAt: now } }
				: task),
			error,
		});
		await this.flushPersist();
	}

	private requirePlan(): VaultScanPlan {
		if (!this.snapshot.run.plan) throw new Error('Vault Scan has no frozen plan.');
		return this.snapshot.run.plan;
	}

	private isActive(): boolean {
		return this.snapshot.run.status === 'running' || this.snapshot.run.status === 'stopping';
	}

	private recordStore(): VaultIntelligenceRecordStore | null {
		const outputs = this.deps.resolveGeneratedOutputs();
		return outputs ? new VaultIntelligenceRecordStore(outputs) : null;
	}

	private scanRecordStore(): VaultScanRecordStore | null {
		const outputs = this.deps.resolveGeneratedOutputs();
		return outputs ? new VaultScanRecordStore(outputs) : null;
	}

	private async appendScanDomainEvent(eventType: string, stageId: VaultScanStageId | null, payload: unknown, artifactRefs: import('@/core/storage/generated-output').GeneratedArtifactRef[] = []): Promise<void> {
		if (!this.scanDomainState) return;
		const event = {
			schemaVersion: 1 as const,
			eventId: this.idFactory(),
			scanRunId: this.scanDomainState.scanRunId,
			sequence: this.scanDomainState.eventSequence + 1,
			eventType,
			idempotencyKey: `${this.scanDomainState.scanRunId}:${this.scanDomainState.eventSequence + 1}:${eventType}`,
			stageId,
			sessionId: null,
			attemptId: null,
			artifactRefs,
			occurredAt: this.now(),
			payload,
		};
		const store = this.scanRecordStore();
		if (store) await store.appendEvent(event);
		this.scanDomainState = reduceScanEvent(this.scanDomainState, event);
		if (store) await store.saveCheckpoint({ schemaVersion: 1, state: this.scanDomainState, discovery: null, reviewPreparation: this.reviewPreparationSession, lastEventSequence: event.sequence, updatedAt: event.occurredAt });
	}

	private queuePersist(): void {
		const store = this.recordStore();
		if (!store) return;
		const activeRun = this.snapshot.run.status === 'running'
			|| this.snapshot.run.status === 'stopping'
			|| this.snapshot.run.status === 'paused'
			|| this.snapshot.run.status === 'interrupted'
			|| this.snapshot.run.status === 'stopped-partial'
			|| this.snapshot.run.status === 'failed'
			? this.snapshot.run
			: null;
		const state: VaultIntelligencePersistedState = {
			version: 4,
			updatedAt: this.now(),
			changedCursorAt: this.snapshot.changedCursorAt,
			activeRun,
			lastCompletedRun: this.snapshot.lastCompletedRun,
			tasks: this.snapshot.tasks,
			recentActivity: this.snapshot.recentActivity.slice(-500),
			proposals: this.snapshot.proposals.slice(-120),
			mapTextEntries: this.snapshot.mapTextEntries.slice(-120),
			activityThemes: this.snapshot.activityThemes.slice(-80),
		};
		this.persistenceTail = this.persistenceTail.catch(() => undefined).then(() => store.save(state));
	}

	private async flushPersist(): Promise<void> {
		this.queuePersist();
		await this.persistenceTail;
	}

	private async recordEvent(
		type: VaultIntelligenceEvent['type'],
		runId: string | null,
		detail: string,
	): Promise<void> {
		const event: VaultIntelligenceEvent = { id: this.idFactory(), timestamp: this.now(), type, runId, detail };
		this.patch({ events: [...this.snapshot.events, event].slice(-120) });
		await this.recordStore()?.append(event).catch((error) => {
			this.patch({ error: `Could not persist Vault Intelligence event: ${errorMessage(error)}` });
		});
	}

	private patch(next: Partial<VaultIntelligenceSnapshot>): void {
		this.snapshot = { ...this.snapshot, ...next };
		for (const listener of this.listeners) listener();
	}

	private patchRun(next: Partial<VaultScanRunState>): void {
		const run = { ...this.snapshot.run, ...next };
		this.patch({ run: { ...run, progress: deriveProgressLedger(this.snapshot.run.progress, run, this.now()) } });
	}

	private resolveOperationRoutes(lastCompletedRun = this.snapshot.lastCompletedRun): Partial<Record<VaultScanAiOperationId, VaultScanOperationRoute>> {
		const defaults = this.deps.resolveOperationRoutes();
		const resolved = preferLastCompletedOperationRoutes(defaults, lastCompletedRun);
		for (const [operationId, override] of Object.entries(this.operationRouteOverrides) as Array<[VaultScanAiOperationId, VaultScanOperationRoute]>) {
			const current = defaults[operationId];
			resolved[operationId] = {
				...(current ?? override),
				...override,
				// Discovery may refresh while the Scan setup stays open. Keep its
				// fresh candidate list while preserving the owner-selected route.
				candidates: current?.candidates ?? override.candidates,
			};
		}
		return resolved;
	}
}

export function preferLastCompletedOperationRoutes(
	defaults: Partial<Record<VaultScanAiOperationId, VaultScanOperationRoute>>,
	lastCompletedRun: VaultCompletedRun | null,
): Partial<Record<VaultScanAiOperationId, VaultScanOperationRoute>> {
	if (!lastCompletedRun?.aiOperations?.length) return { ...defaults };
	const previousByOperation = new Map(lastCompletedRun.aiOperations.map((operation) => [operation.id, operation]));
	const resolved = { ...defaults };
	for (const [operationId, route] of Object.entries(defaults) as Array<[VaultScanAiOperationId, VaultScanOperationRoute]>) {
		const previous = previousByOperation.get(operationId);
		if (!previous) continue;
		const candidate = route.candidates?.find((item) => (
			item.profileId === previous.profileId
			&& item.model === previous.model
			&& item.selectable !== false
		));
		if (!candidate) continue;
		resolved[operationId] = {
			...route,
			profileId: candidate.profileId,
			model: candidate.model,
			provider: candidate.provider,
			available: true,
		};
	}
	return resolved;
}

function migrateRunStages(stages: readonly VaultScanRunState['stages'][number][]): VaultScanRunState['stages'] {
	const byId = new Map(stages.map((stage) => [stage.id, stage]));
	return (['discover', 'index', 'ai', 'prepare-review', 'publish'] as const).map((id) => byId.get(id) ?? { id, status: 'waiting', processed: 0, total: 0, message: 'Waiting' });
}

function normalizePlan(
	plan: VaultScanPlan,
	config: VaultIntelligenceConfig,
	routes: Partial<Record<VaultScanAiOperationId, VaultScanOperationRoute>>,
): VaultScanPlan {
	const migratedPlan = migratePlanChecks(plan, config);
	const incoming = new Map<VaultScanAiOperationId, VaultScanPlan['aiOperations'][number]>(migratedPlan.aiOperations.map((operation) => [
		operation.id === 'relationship-review' ? 'relationship-discovery' as const : operation.id,
		operation,
	]));
	const normalizedOperations = config.scanOperations.map((definition) => {
		const candidate = incoming.get(definition.id) ?? {
			id: definition.id,
			enabled: definition.defaultEnabled,
			model: definition.model,
			provider: definition.provider,
			estimatedTokens: 0,
			estimatedCostUsd: 0,
		};
		const route = routes[definition.id];
		if (!route) return candidate;
		return {
			...candidate,
			enabled: candidate.enabled && route.available,
			model: route.model,
			provider: route.provider,
		};
	});
	return {
		...migratedPlan,
		scope: { ...migratedPlan.scope, selectedPaths: unique(migratedPlan.scope.selectedPaths) },
			enabledCheckIds: unique(migratedPlan.enabledCheckIds).filter((checkId) => (
				config.checkGroups.some((group) => group.checks.some((check) => (check.checkIds ?? [check.checkId]).includes(checkId)))
			)),
			indexOutputs: normalizeIndexOutputs(migratedPlan, config),
		aiOperations: normalizedOperations,
	};
}

function migratePlanChecks(plan: VaultScanPlan, config: VaultIntelligenceConfig): VaultScanPlan {
	const legacy = plan as VaultScanPlan & { enabledTaskKinds?: VaultMaintenanceTask['kind'][] };
	if (Array.isArray(legacy.enabledCheckIds)) return plan;
	const enabledKinds = new Set(legacy.enabledTaskKinds ?? config.tasks.map((task) => task.kind));
	return {
		...plan,
		enabledCheckIds: unique(config.tasks
			.filter((task) => enabledKinds.has(task.kind))
			.flatMap((task) => task.signalIds)),
	};
}

function coupledIndexOperationIds(id: VaultScanAiOperationId): readonly VaultScanAiOperationId[] {
	if (id === 'file-summaries' || id === 'ai-tags') return ['file-summaries', 'ai-tags'];
	return [id];
}

function normalizeIndexOutputs(plan: VaultScanPlan, config: VaultIntelligenceConfig): NonNullable<VaultScanPlan['indexOutputs']> {
	const incoming = new Map((plan.indexOutputs ?? []).map((output) => [output.id, output]));
	return config.indexOutputs.map((definition) => {
		const current = incoming.get(definition.id);
		return {
			id: definition.id,
			enabled: definition.availability === 'required' || definition.availability === 'automatic'
				? true
				: (current?.enabled ?? (definition.availability === 'optional' && (definition.defaultEnabled ?? true))),
			availability: definition.availability,
			operationIds: definition.operationIds,
		};
	});
}

function mergePreparedTasks(previous: readonly VaultMaintenanceTask[], prepared: readonly VaultMaintenanceTask[], runId: string, now: number): VaultMaintenanceTask[] {
	const preparedByWorkKey = new Map(prepared.map((task) => [task.workKey ?? task.id, task]));
	const merged: VaultMaintenanceTask[] = [];
	for (const task of previous) {
		const key = task.workKey ?? task.id;
		const replacement = preparedByWorkKey.get(key);
		if (!replacement) {
			merged.push(task);
			continue;
		}
		const choices = new Map(task.atomicItems.filter((item) => item.ownerChoice).map((item) => [item.identityKey ?? item.id, item.ownerChoice]));
		merged.push({ ...replacement, sourceRunId: runId, createdAt: task.createdAt, updatedAt: now, atomicItems: replacement.atomicItems.map((item) => ({ ...item, ownerChoice: choices.get(item.identityKey ?? item.id) ?? item.ownerChoice })) });
		preparedByWorkKey.delete(key);
	}
	merged.push(...[...preparedByWorkKey.values()]);
	return merged;
}

function reviewTaskTitle(atoms: readonly import('@/core/types/review-preparation').ReviewAtom[]): string {
	const kind = atoms[0]?.kindId ?? 'vault finding';
	return `Review ${kind.replace(/-/g, ' ')}`;
}

function reviewOwnerQuestion(atoms: readonly import('@/core/types/review-preparation').ReviewAtom[]): string {
	const count = atoms.length;
	return `How should Peak handle ${count} ${atoms[0]?.kindId.replace(/-/g, ' ') ?? 'finding'} ${count === 1 ? 'item' : 'items'}?`;
}

function reviewPreparationMessage(session: ReviewPreparationSession): string {
	if (session.planFrozenAt === null) return 'Planning review work.';
	const active = session.jobs.find((job) => ['inspecting', 'drafting', 'validating', 'revising'].includes(job.status));
	if (active) return `${active.status.replace(/-/g, ' ')} · ${active.atomRefs.length} frozen finding${active.atomRefs.length === 1 ? '' : 's'}`;
	return `${session.dispositions.length} of ${session.atoms.length} findings accounted.`;
}

function projectDiscoveryFindings(snapshot: VaultReviewSessionSnapshot): NonNullable<VaultScanRunState['discoveryFindings']> {
	const projected: NonNullable<VaultScanRunState['discoveryFindings']> = [];
	for (const finding of snapshot.collectorSnapshot.findings) projected.push({ id: finding.id, kind: 'relationship', title: finding.text, evidenceCount: 0 });
	for (const cluster of snapshot.collectorSnapshot.clusterObservations) projected.push({ id: cluster.id, kind: 'community', title: cluster.headline, evidenceCount: cluster.representativeNotes.length });
	for (const gap of snapshot.collectorSnapshot.gaps) projected.push({ id: gap.id, kind: gap.kind === 'structural-hole' ? 'bridge' : 'island', title: gap.title, evidenceCount: gap.references.length });
	return projected;
}

function buildDiscoveryEvidenceLedger(runId: string, objectiveIds: readonly VaultScanAiOperationId[]): EvidenceLedger {
	const manifestRef = `scan:${runId}:maintained-vault-evidence`;
	const eligibleRefs = objectiveIds.map((objectiveId) => `${manifestRef}:${objectiveId}`);
	return { manifestRef, eligibleRefs, inspectedRefs: [], excludedRefs: [], failedRefs: [], derivedFactRefs: [`${manifestRef}:mobius-maintenance`] };
}

function discoveryObjectiveInstruction(objectiveId: VaultScanAiOperationId): string {
	if (objectiveId === 'relationship-discovery') return 'Inspect real Vault references and affected notes with the Vault tools. Retain only evidence-backed relationship findings or actions, then submit an explicit review receipt.';
	if (objectiveId === 'semantic-review') return 'Use semantic search and source reads to test meaning-level similarity, drift, or contradiction. Cite inspected sources through output tools, then submit an explicit review receipt.';
	if (objectiveId === 'community-analysis') return 'Analyze the freshly recomputed Louvain Communities in the Vault digest. Use propose_cluster_observation for supported community structure and read representative notes when validation is needed, then submit an explicit review receipt.';
	if (objectiveId === 'hub-bridge-analysis') return 'Analyze freshly recomputed PageRank hubs, structural holes, and community links. Use propose_gap and propose_action only for supported hub or bridge findings, then submit an explicit review receipt.';
	return `Complete ${objectiveId} against the frozen evidence and submit an explicit review receipt.`;
}

function discoveryProposalsForObjective(objectiveId: VaultScanAiOperationId, investigationId: string, snapshot: VaultReviewSessionSnapshot, evidenceRefs: readonly string[]): FindingProposal[] {
	if (evidenceRefs.length === 0) return [];
	if (objectiveId === 'community-analysis') return snapshot.collectorSnapshot.clusterObservations.map((cluster) => ({ kindId: 'community', anchors: [cluster.id, ...cluster.representativeNotes], statement: cluster.headline, evidenceRefs, investigationId }));
	if (objectiveId === 'hub-bridge-analysis') return snapshot.collectorSnapshot.gaps.map((gap) => ({ kindId: gap.kind === 'structural-hole' ? 'bridge' : 'structural-gap', anchors: [gap.id, ...gap.references], statement: gap.title, evidenceRefs, investigationId }));
	return snapshot.collectorSnapshot.findings.map((finding) => ({ kindId: objectiveId === 'semantic-review' ? 'drift' : 'relationship', anchors: [finding.id], statement: finding.text, evidenceRefs, investigationId }));
}

function projectDiscoverySessionFindings(session: VaultDiscoverySession): NonNullable<VaultScanRunState['discoveryFindings']> {
	return Object.values(session.findings).filter((finding) => finding.state === 'retained' || finding.state === 'revised').map((finding) => ({ id: finding.id, kind: finding.kindId === 'structural-gap' || finding.kindId === 'anomaly' ? 'island' : finding.kindId, title: finding.statement, evidenceCount: finding.evidenceRefs.length }));
}

function discoverySessionMessage(session: VaultDiscoverySession): string {
	const active = Object.values(session.investigations).find((investigation) => ['gathering', 'testing'].includes(investigation.state));
	if (active) return active.question;
	return `${session.terminalObjectiveIds.length} of ${session.objectiveIds.length} required discovery probes reached terminal receipts.`;
}

function buildObjectSummaries(
	fileCount: number,
	chatCount: number,
	projectCount: number,
	composerEventCount: number,
): VaultIntelligenceObjectSummary[] {
	return [
		{ id: 'files', label: 'Files', count: fileCount, detail: 'Vault files visible to Peak', coverageNote: 'Distribution comes from actual Vault extensions.' },
		{ id: 'chats', label: 'Chats', count: chatCount, detail: 'Durable Peak conversations', breakdown: [{ id: 'canonical', label: 'Recorded conversations', count: chatCount }], breakdownStatus: 'available', coverageNote: 'Conversation type is shown only when Chat Studio publishes it explicitly.' },
		{ id: 'projects', label: 'Projects', count: projectCount, detail: 'Current Peak projects', breakdown: [{ id: 'canonical', label: 'Current projects', count: projectCount }], breakdownStatus: 'available', coverageNote: 'Lifecycle state is shown only when the Project store publishes it explicitly.' },
		{ id: 'composer', label: 'Composer', count: composerEventCount, detail: 'Durable workspace events', breakdown: [{ id: 'canonical', label: 'Recorded workspace events', count: composerEventCount }], breakdownStatus: 'available', coverageNote: 'Result state is shown only when Composer history publishes it explicitly.' },
	];
}

function totalUsage(operations: readonly VaultScanOperationState[]): VaultScanUsage {
	const seenExecutions = new Set<string>();
	return operations.reduce<VaultScanUsage>((total, operation) => {
		const executionKey = operation.executionId ?? `operation:${operation.id}`;
		if (seenExecutions.has(executionKey)) return total;
		seenExecutions.add(executionKey);
		return {
			inputTokens: total.inputTokens + operation.usage.inputTokens,
			outputTokens: total.outputTokens + operation.usage.outputTokens,
			totalTokens: total.totalTokens + operation.usage.totalTokens,
			costUsd: total.costUsd + operation.usage.costUsd,
		};
	}, { ...EMPTY_USAGE });
}

function providerReceiptCount(operations: readonly VaultScanOperationState[]): number {
	const receipts = new Set<string>();
	for (const operation of operations) {
		for (const attempt of operation.attempts ?? []) {
			if (!attempt.actualRoute) continue;
			receipts.add(`${attempt.executionId}:${attempt.path ?? 'vault'}:${attempt.startedAt}`);
		}
		if (!operation.attempts?.length && operation.actualRoute) receipts.add(operation.executionId ?? `operation:${operation.id}`);
	}
	return receipts.size;
}

function deriveProgressLedger(
	previous: VaultScanProgressLedger | undefined,
	run: VaultScanRunState,
	now: number,
): VaultScanProgressLedger | undefined {
	const frozenCount = run.frozenPaths.length;
	if (frozenCount === 0 && !previous) return undefined;
	const weights = DEFAULT_SCAN_PROGRESS_WEIGHTS;
	const fraction = (id: VaultScanStageId): number => {
		const stage = run.stages.find((candidate) => candidate.id === id);
		if (!stage) return 0;
		if (stage.status === 'completed' || stage.status === 'partial' || stage.status === 'skipped') return 1;
		if (stage.total <= 0) return 0;
		return Math.min(1, Math.max(0, stage.processed / stage.total));
	};
	const earned = Math.floor((Object.keys(weights) as VaultScanStageId[]).reduce((sum, id) => sum + weights[id] * fraction(id), 0));
	const terminalUnits = Math.max(previous?.terminalUnits ?? 0, earned);
	const failedUnits = run.stages.filter((stage) => stage.status === 'failed' || stage.status === 'partial').length;
	const skippedUnits = run.stages.filter((stage) => stage.status === 'skipped').length;
	return {
		terminalUnits,
		successfulUnits: Math.max(previous?.successfulUnits ?? 0, terminalUnits - failedUnits - skippedUnits),
		failedUnits: Math.max(previous?.failedUnits ?? 0, failedUnits),
		skippedUnits: Math.max(previous?.skippedUnits ?? 0, skippedUnits),
		totalUnits: 100,
		percent: terminalUnits,
		source: 'frozen-plan-work-units',
		frozenAt: previous?.frozenAt ?? now,
	};
}

function resolvedRoute(route: VaultScanOperationRoute | undefined): VaultScanResolvedRoute | null {
	if (!route?.available || !route.profileId || !route.model || !route.provider) return null;
	return { profileId: route.profileId, model: route.model, provider: route.provider };
}

function normalizeUsage(
	usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number },
	costUsd: number,
): VaultScanUsage {
	const inputTokens = usage.inputTokens ?? 0;
	const outputTokens = usage.outputTokens ?? 0;
	return {
		inputTokens,
		outputTokens,
		totalTokens: usage.totalTokens ?? inputTokens + outputTokens,
		costUsd,
	};
}

function parseTaskSuggestions(text: string): Array<{ itemId: string; choiceId: string; choiceValue?: string | null; reason?: string }> {
	const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
	const parsed = JSON.parse(normalized) as { suggestions?: unknown };
	if (!Array.isArray(parsed.suggestions)) throw new Error('The suggestion provider did not return a suggestions array.');
	return parsed.suggestions.flatMap((candidate) => {
		if (!candidate || typeof candidate !== 'object') return [];
		const value = candidate as Record<string, unknown>;
		if (typeof value.itemId !== 'string' || typeof value.choiceId !== 'string') return [];
		return [{
			itemId: value.itemId,
			choiceId: value.choiceId,
			choiceValue: typeof value.choiceValue === 'string' ? value.choiceValue : null,
			reason: typeof value.reason === 'string' ? value.reason : undefined,
		}];
	});
}

function sumAttemptUsage(attempts: NonNullable<VaultScanOperationState['attempts']>): VaultScanUsage {
	return attempts.reduce<VaultScanUsage>((total, attempt) => ({
		inputTokens: total.inputTokens + attempt.usage.inputTokens,
		outputTokens: total.outputTokens + attempt.usage.outputTokens,
		totalTokens: total.totalTokens + attempt.usage.totalTokens,
		costUsd: total.costUsd + attempt.usage.costUsd,
	}), { ...EMPTY_USAGE });
}

function addVaultUsage(left: VaultScanUsage, right: VaultScanUsage): VaultScanUsage {
	return { inputTokens: left.inputTokens + right.inputTokens, outputTokens: left.outputTokens + right.outputTokens, totalTokens: left.totalTokens + right.totalTokens, costUsd: left.costUsd + right.costUsd };
}

function collectReviewUsage(snapshot: VaultReviewSessionSnapshot | null): VaultScanUsage {
	if (!snapshot) return { ...EMPTY_USAGE };
	const usage = { ...EMPTY_USAGE };
	for (const round of snapshot.rounds) {
		for (const event of round.events) {
			if (event.type !== 'complete') continue;
			usage.inputTokens += event.usage.inputTokens ?? 0;
			usage.outputTokens += event.usage.outputTokens ?? 0;
			usage.totalTokens += event.usage.totalTokens ?? 0;
		}
	}
	return usage;
}

function countReviewCompletionEvents(snapshot: VaultReviewSessionSnapshot | null): number {
	if (!snapshot) return 0;
	return snapshot.rounds.reduce((count, round) => (
		count + round.events.filter((event) => event.type === 'complete').length
	), 0);
}

function reviewLiveEvidence(
	snapshot: VaultReviewSessionSnapshot,
	now: number,
): NonNullable<VaultScanOperationState['liveEvidence']> {
	const events = snapshot.rounds.flatMap((round) => round.events);
	const text = events
		.filter((event): event is typeof event & { text: string } => (
			(event.type === 'text-delta' || event.type === 'reasoning-delta')
			&& typeof (event as { text?: unknown }).text === 'string'
		))
		.map((event) => event.text)
		.join('')
		.trim();
	const tools = events
		.filter((event): event is typeof event & { toolName: string } => event.type === 'tool-call' && typeof (event as { toolName?: unknown }).toolName === 'string')
		.slice(-4)
		.map((event) => ({ kind: 'tool' as const, text: `Tool · ${event.toolName.replace(/^mcp__[^_]+__/, '').replace(/_/g, ' ')}`, updatedAt: now }));
	const status = { kind: 'status' as const, text: `Vault Review · ${snapshot.status.replace(/-/g, ' ')} · round ${snapshot.currentRoundIndex + 1}`, updatedAt: now };
	const textEntry = text
		? [{ kind: 'text' as const, text: text.slice(-900), updatedAt: now }]
		: [];
	return [status, ...tools, ...textEntry].slice(-6);
}

function reviewEvidenceCount(snapshot: VaultReviewSessionSnapshot): number {
	const collector = snapshot.collectorSnapshot;
	return collector.findings.length + collector.clusterObservations.length + collector.gaps.length + collector.actions.length;
}

function buildReceipts(
	run: VaultScanRunState,
	indexedDocs: number | null,
	lintResult: LintScanResult | null,
): VaultCompletedRun['receipts'] {
	const indexOperationIds = new Set<VaultScanAiOperationId>(['embedding-refresh', 'file-summaries', 'ai-tags']);
	const indexOperations = run.operations.filter((operation) => indexOperationIds.has(operation.id));
	const indexFailures = indexOperations.filter((operation) => operation.status === 'failed').length;
	const enabledMachineOperations = run.operations.filter((operation) => operation.status !== 'skipped');
	const machineCompleted = enabledMachineOperations.filter((operation) => operation.status === 'completed').length;
	const machineFailures = enabledMachineOperations.filter((operation) => operation.status === 'failed').length;
	return [
		{
			id: 'knowledge-index',
			label: 'Knowledge Index · Core Search',
			detail: 'Full-text passages and enabled enrichment layers were published independently.',
			result: indexedDocs === null ? 'Readiness unavailable' : `${indexedDocs.toLocaleString()} searchable`,
			status: indexFailures ? 'partial' : 'completed',
			ownerBoundary: 'peak-owned',
		},
		{
			id: 'machine-knowledge',
			label: 'Machine summaries, AI Tags and review evidence',
			detail: 'These outputs stay in Peak-owned machine state and do not edit Markdown or YAML.',
			result: `${machineCompleted.toLocaleString()} of ${enabledMachineOperations.length.toLocaleString()} enabled operations completed`,
			status: machineFailures ? 'partial' : 'completed',
			ownerBoundary: 'peak-owned',
		},
		{
			id: 'knowledge-map',
			label: 'Knowledge map',
			detail: 'Deterministic graph facts were refreshed; owner decisions remain reviewable.',
			result: 'Current graph projection published',
			status: run.warnings.some((warning) => warning.includes('map')) ? 'partial' : 'completed',
			ownerBoundary: 'peak-owned',
		},
	];
}

function brokenLinkPatch(
	target: string,
	choiceId: string,
	replacement: string | null,
): { beforeText: string; afterText: string } | null {
	const cleanTarget = target.trim();
	if (!cleanTarget) return null;
	const beforeText = `[[${cleanTarget}]]`;
	if (choiceId === 'remove') return { beforeText, afterText: cleanTarget };
	if (choiceId !== 'redirect' || !replacement?.trim()) return null;
	return { beforeText, afterText: `[[${replacement.trim()}]]` };
}

function occurrenceCount(source: string, fragment: string): number {
	if (!fragment) return 0;
	let count = 0;
	let start = 0;
	while (start < source.length) {
		const index = source.indexOf(fragment, start);
		if (index < 0) return count;
		count += 1;
		start = index + fragment.length;
	}
	return count;
}

function textContext(source: string, fragment: string, radius = 96): string {
	const index = source.indexOf(fragment);
	if (index < 0) return '';
	const start = Math.max(0, index - radius);
	const end = Math.min(source.length, index + fragment.length + radius);
	return source.slice(start, end);
}

async function collectSourceActivity(outputs: GeneratedOutputPersistenceRuntime): Promise<import('@/core/types/vault-intelligence').VaultActivityRecord[]> {
	const chatStore = new ChatConversationRecordStore(outputs);
	const chatIds = await chatStore.listConversationIds();
	const chatRecords = await Promise.all(chatIds.slice(-120).map((conversationId) => chatStore.read(conversationId).catch(() => null)));
	const chats = chatRecords.flatMap((record) => record?.messages.map((message) => {
		const preview = activityTextPreview(message.title || message.content);
		return {
			id: `chat:${message.id}`,
			timestamp: message.createdAtTimestamp,
			kind: 'chat' as const,
			label: preview || `${message.role === 'user' ? 'You' : 'Peak'} message`,
			objectPath: record.meta.title.trim() || 'Untitled conversation',
			runId: null,
		};
	}) ?? []);
	const composer = await outputs.events.readEvents<unknown>({ outputId: 'composer.workspace-events', streamKey: 'current' }).catch(() => null);
	const composerRecords = composer?.events.flatMap((event, index) => {
		const payload = event.payload as Record<string, unknown>;
		const timestamp = eventTimestamp(payload);
		if (!timestamp) return [];
		return [{
			id: `composer:${String((event as { eventId?: string }).eventId ?? index)}`,
			timestamp,
			kind: 'composer' as const,
			label: 'Composer workspace event',
			objectPath: typeof payload.filePath === 'string' ? payload.filePath : null,
			runId: null,
		}];
	}) ?? [];
	return [...chats, ...composerRecords]
		.filter((record) => Number.isFinite(record.timestamp) && record.timestamp > 0)
		.sort((left, right) => right.timestamp - left.timestamp)
		.slice(0, 500);
}

function activityTextPreview(content: string): string {
	return generateContentPreview(content)
		.replace(/\s+/g, ' ')
		.replace(/[#*_`>\[\]]/g, '')
		.trim()
		.slice(0, 120);
}

function buildActivitySessions(records: readonly import('@/core/types/vault-intelligence').VaultActivityRecord[]): VaultActivitySession[] {
	const ordered = [...records]
		.filter((record) => Number.isFinite(record.timestamp) && record.timestamp > 0)
		.sort((left, right) => left.timestamp - right.timestamp);
	const sessions: VaultActivitySession[] = [];
	for (const record of ordered) {
		const previous = sessions[sessions.length - 1];
		const sharedObject = previous?.objectPaths.some((path) => path && path === record.objectPath) ?? false;
		const adjacent = previous ? record.timestamp - previous.endedAt <= 45 * 60 * 1000 : false;
		if (!previous || (!sharedObject && !adjacent)) {
			sessions.push({
				id: `session:${record.id}`,
				startedAt: record.timestamp,
				endedAt: record.timestamp,
				recordIds: [record.id],
				objectPaths: record.objectPath ? [record.objectPath] : [],
				reason: 'single-record',
				label: record.label,
			});
			continue;
		}
		previous.endedAt = record.timestamp;
		previous.recordIds.push(record.id);
		if (record.objectPath && !previous.objectPaths.includes(record.objectPath)) previous.objectPaths.push(record.objectPath);
		previous.reason = sharedObject ? 'shared-object' : 'adjacent-time';
		previous.label = previous.objectPaths[0] ?? previous.label;
	}
	return sessions.reverse().slice(0, 160);
}

function activitySourceRevision(records: readonly import('@/core/types/vault-intelligence').VaultActivityRecord[]): string {
	return sha256Text(records
		.slice()
		.sort((left, right) => left.id.localeCompare(right.id))
		.map((record) => `${record.id}:${record.timestamp}:${record.objectPath ?? ''}`)
		.join('|'));
}

function activityThemeLabel(record: import('@/core/types/vault-intelligence').VaultActivityRecord): string {
	if (record.kind === 'chat') return 'Chat context';
	if (record.kind === 'composer') return 'Composer work';
	if (record.kind === 'project') return 'Project changes';
	if (record.kind === 'scan' || record.kind === 'owner-choice' || record.kind === 'apply' || record.kind === 'verify') return 'Vault Intelligence';
	const folder = record.objectPath?.includes('/') ? record.objectPath.slice(0, record.objectPath.indexOf('/')) : null;
	return folder ? `Files · ${folder}` : 'File edits';
}

function eventTimestamp(payload: Record<string, unknown>): number | null {
	for (const key of ['timestamp', 'createdAt', 'updatedAt', 'createdAtTimestamp', 'updatedAtTimestamp']) {
		const value = payload[key];
		if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
	}
	return null;
}

function unique<T>(values: readonly T[]): T[] {
	return [...new Set(values)];
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
