import type { App, TFile } from 'obsidian';
import type { SearchSettings } from '@/core/config/settingsTypes';
import type { GeneratedOutputPersistenceRuntime } from '@/core/storage/generated-output';
import { ChatConversationRecordStore } from '@/core/storage/generated-output';
import { sha256Text } from '@/core/storage/generated-output/GeneratedOutputIntegrity';
import type { LintScanResult } from '@/core/types/lint';
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
	VaultScanRunState,
	VaultScanScopeMode,
	VaultScanStageId,
	VaultScanUsage,
} from '@/core/types/vault-intelligence';
import type { IndexService } from '@/service/search/index/indexService';
import type { VaultLintRuntime } from '@/service/lint/VaultLintRuntime';
import type { VaultReviewRuntime } from '@/service/copilot/vault/VaultReviewRuntime';
import type { VaultReviewSessionSnapshot } from '@/service/copilot/vault/VaultReviewSession';
import { VaultIntelligenceRecordStore } from './VaultIntelligenceRecordStore';
import { generateContentPreview } from '@/core/utils/message-preview-utils';
import {
	createEmptyVaultScanRun,
	deriveMaintenanceState,
	deriveVaultMaintenanceTasks,
	maintenanceAffectedLabel,
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
	runCoreIndex: (scope: VaultScanScopeMode, paths: string[]) => Promise<void>;
	resolveProjectCount: () => Promise<number>;
	refreshOperationRouteCandidates?: () => Promise<void>;
	openOwnerSurface?: (surface: VaultIntelligenceObjectSummary['id']) => Promise<void>;
	resolveOperationRoutes: () => Partial<Record<VaultScanAiOperationId, VaultScanOperationRoute>>;
	selectOperationRoute: (operationId: VaultScanAiOperationId, candidate: VaultScanOperationRouteCandidate) => void | Promise<void>;
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
	private snapshot: VaultIntelligenceSnapshot = {
		loading: false,
		error: null,
		digest: null,
		fileTypes: [],
		availablePaths: [],
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

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	async refresh(): Promise<void> {
		this.patch({ loading: true, error: null });
		const files = this.deps.app.vault.getFiles();
		try {
			const store = this.recordStore();
			const review = this.deps.resolveReviewRuntime();
			const outputs = this.deps.resolveGeneratedOutputs();
			await this.deps.refreshOperationRouteCandidates?.();
			const operationRoutes = this.deps.resolveOperationRoutes();
			const [persisted, digest, events, projectCount, conversationCount, composerEventCount, sourceActivity, indexStatus] = await Promise.all([
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
				this.deps.resolveIndexService()?.getIndexStatus().catch(() => null) ?? Promise.resolve(null),
			]);
			const recovered = this.recoverPersistedState(persisted);
			const changedSinceScan = recovered.changedCursorAt
				? files.filter((file) => file.stat.mtime > recovered.changedCursorAt!).length
				: null;
			const searchReady = indexStatus?.indexedDocs ?? null;
			const recentActivity = recovered.recentActivity;
			const activitySessions = buildActivitySessions([...sourceActivity, ...recentActivity]);
			this.patch({
				loading: false,
				digest,
				fileTypes: summarizeVaultFileTypes(files),
				availablePaths: files.map((file) => file.path).sort((left, right) => left.localeCompare(right)),
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
			this.patch({ loading: false, error: errorMessage(error) });
		}
	}

	async startScan(plan: VaultScanPlan): Promise<void> {
		if (this.isActive()) return;
		const config = await loadVaultIntelligenceConfig();
		this.indexErrors = [];
		this.abortController = new AbortController();
		const startedAt = this.now();
		const runId = this.idFactory();
		const normalizedPlan = normalizePlan(plan, config, this.deps.resolveOperationRoutes());
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
			})),
		};
		this.patch({ run, error: null });
		await this.recordEvent('run-started', runId, 'Vault Scan started with a frozen plan.');
		await this.flushPersist();
		await this.executeRun();
	}

	async selectOperationRoute(operationId: VaultScanAiOperationId, candidate: VaultScanOperationRouteCandidate): Promise<void> {
		await this.deps.selectOperationRoute(operationId, candidate);
		this.patch({ operationRoutes: this.deps.resolveOperationRoutes() });
	}

	async resumeScan(): Promise<void> {
		if (this.snapshot.run.status !== 'interrupted' || !this.snapshot.run.plan) return;
		this.abortController = new AbortController();
		this.patchRun({ status: 'running', stopRequested: false, error: null });
		await this.recordEvent('run-started', this.snapshot.run.id, 'Vault Scan resumed from its durable checkpoint.');
		await this.flushPersist();
		await this.executeRun();
	}

	requestStop(): void {
		if (this.snapshot.run.status !== 'running') return;
		this.patchRun({
			status: 'stopping',
			stopRequested: true,
			warnings: unique([...this.snapshot.run.warnings, 'Stop requested; completed stages remain in this run checkpoint.']),
		});
		this.queuePersist();
		this.abortController?.abort();
	}

	skipOperation(operationId: VaultScanAiOperationId): void {
		const operation = this.snapshot.run.operations.find((candidate) => candidate.id === operationId);
		if (!operation || operation.status === 'completed' || operation.status === 'failed') return;
		const group = operationExecutionGroup(operationId);
		for (const id of group) {
			const candidate = this.operation(id);
			if (!candidate || candidate.status === 'completed' || candidate.status === 'failed') continue;
			this.patchOperation(id, { status: 'skipped', currentPath: null });
		}
		if (operationExecutionGroup(operationId).includes('relationship-discovery')) this.abortController?.abort();
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
			this.replaceTask({ ...task, atomicItems, state: 'recovery', updatedAt: this.now() });
			this.patch({ error: `${staleSource} changed after the owner choice. Review current evidence before preparing file changes.` });
			await this.flushPersist();
			return;
		}
		const defaultChoice = task.defaultChoice && task.defaultChoice.choiceId !== 'later'
			&& boundaries.get(task.defaultChoice.choiceId) !== 'proposal'
			? { ...task.defaultChoice, status: 'applied' as const }
			: task.defaultChoice;
		this.replaceTask({
			...task,
			atomicItems,
			defaultChoice,
			state: hasProposal ? 'needs-proposal' : 'ready-apply',
			updatedAt: this.now(),
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
			tasks: this.snapshot.tasks.map((candidate) => candidate.id === task.id ? { ...candidate, state: 'ready-review', updatedAt: createdAt } : candidate),
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
		for (const [path, source] of sources) {
			if (!source) continue;
			let next = source.content;
			for (const change of selectedChanges.filter((candidate) => candidate.path === path)) {
				if (occurrenceCount(next, change.beforeText) !== change.matchCount) {
					await this.markProposalStale(proposal, `${path}: the prepared patch no longer has the expected source context.`);
					return;
				}
				next = next.replace(change.beforeText, change.afterText);
			}
			if (next !== source.content) await this.deps.app.vault.modify(source.file, next);
		}
		const appliedAt = this.now();
		const task = this.snapshot.tasks.find((candidate) => candidate.id === proposal.taskId) ?? null;
		const proposalItemIds = new Set(selectedChanges.flatMap((change) => change.atomicItemIds));
		this.patch({
			proposals: this.snapshot.proposals.map((candidate) => candidate.id === proposal.id ? { ...candidate, status: 'applied', appliedAt, updatedAt: appliedAt } : candidate),
			tasks: task ? this.snapshot.tasks.map((candidate) => candidate.id === task.id ? {
				...candidate,
				state: 'ready-apply',
				updatedAt: appliedAt,
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
			await this.deps.runCoreIndex('selected', proposalPaths);
			const verification = await this.deps.resolveLintRuntime()?.runFullScan().catch(() => null) ?? null;
			const stillOpen = verification?.findings.some((finding) => (
				finding.status === 'open' && task.atomicItems.some((item) => item.sourceFindingId === finding.id)
			));
			if (stillOpen) {
				this.replaceTask({ ...task, state: 'recovery', updatedAt: this.now() });
				this.patch({ error: 'The follow-up scan still reports this finding. Review the current source and create a new proposal if needed.' });
				await this.flushPersist();
				return;
			}
		}
		if (task.kind === 'unreadable-files') {
			const retryPaths = task.atomicItems.filter((item) => (
				(item.ownerChoice ?? task.defaultChoice)?.choiceId === 'retry' && item.filePath
			)).map((item) => item.filePath!);
			if (retryPaths.length > 0) await this.deps.runCoreIndex('selected', retryPaths);
		}
		const verifiedAt = this.now();
		const atomicItems = task.atomicItems.map((item) => {
			const choice = item.ownerChoice ?? task.defaultChoice!;
			return { ...item, ownerChoice: { ...choice, status: 'verified' as const } };
		});
		this.patch({
			proposals: this.snapshot.proposals.map((proposal) => proposal.taskId === task.id && proposal.status === 'applied'
				? { ...proposal, status: 'verified', verifiedAt, updatedAt: verifiedAt }
				: proposal),
		});
		this.replaceTask({ ...task, atomicItems, state: 'verified', updatedAt: verifiedAt });
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
			await Promise.all([
				this.snapshot.run.completedStages.includes('index') ? Promise.resolve() : this.performIndex(),
				this.snapshot.run.completedStages.includes('ai') ? Promise.resolve() : this.performAi(),
			]);
			if (this.stopAtCheckpoint()) return;
			if (!this.snapshot.run.completedStages.includes('publish')) await this.performPublish();
		} catch (error) {
			if (this.snapshot.run.stopRequested) {
				this.stopAtCheckpoint();
				return;
			}
			this.patchRun({ status: 'failed', error: errorMessage(error), completedAt: this.now() });
			await this.recordEvent('run-failed', this.snapshot.run.id, errorMessage(error));
			await this.flushPersist();
		}
	}

	private async performDiscover(): Promise<void> {
		this.startStage('discover', 'Freezing scope and affected inputs.');
		this.patchOperation('plan-scan', { status: 'running', startedAt: this.now(), evidence: ['Resolving selected scope and affected context.'] });
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
		this.completeStage('discover', `${frozen.length.toLocaleString()} objects frozen for this run.`, frozen.length, frozen.length);
		this.patchOperation('plan-scan', {
			status: 'completed', processed: frozen.length, total: frozen.length, currentPath: null,
			completedAt: this.now(), evidence: [`${frozen.length.toLocaleString()} selected objects and affected context frozen.`, 'No user-file write was included in this run plan.'],
		});
		await this.recordEvent('stage-changed', this.snapshot.run.id, `Discover completed with ${frozen.length} objects.`);
		await this.flushPersist();
	}

	private async performIndex(): Promise<void> {
		const run = this.snapshot.run;
		const plan = this.requirePlan();
		this.startStage('index', 'Updating full-text passages and the Knowledge Index.');
		await this.deps.runCoreIndex(plan.scope.mode, run.frozenPaths);
		const index = this.deps.resolveIndexService();
		if (!index) {
			this.addRunWarning('Knowledge Index runtime is not available; Scan continued with deterministic checks.');
			for (const id of ['embedding-refresh', 'file-summaries', 'ai-tags'] as const) {
				if (this.operation(id)?.status === 'skipped') continue;
				this.patchOperation(id, {
					status: 'failed',
					error: 'Knowledge Index runtime is unavailable.',
				});
			}
		} else {
			await this.runVectorEnrichment(index);
			await this.runLlmEnrichment(index);
		}
		const lint = this.deps.resolveLintRuntime();
		if (!lint) throw new Error('Vault maintenance checks are still loading.');
		const result = await lint.runFullScan({
			onProgress: (event) => this.patchStage('index', {
				processed: event.processed ?? this.stage('index').processed,
				total: event.total ?? this.stage('index').total,
				message: event.detector ? `Checking ${event.detector}` : 'Running maintenance checks',
			}),
			onDetectorWarning: (detectorId, error) => this.addRunWarning(`${detectorId}: ${errorMessage(error)}`),
		});
		this.completeStage('index', `${result.totalNotes.toLocaleString()} notes checked; Index layers retained independently.`, result.totalNotes, result.totalNotes);
		await this.recordEvent('stage-changed', run.id, 'Build Index completed.');
		await this.flushPersist();
	}

	private async runVectorEnrichment(index: IndexService): Promise<void> {
		const operation = this.operation('embedding-refresh');
		if (!operation || operation.status === 'skipped') return;
		this.patchOperation(operation.id, { status: 'running' });
		const result = await index.runPendingVectorIndexEnrichment(this.deps.getSearchSettings(), {
			paths: this.snapshot.run.frozenPaths,
			shouldContinue: () => !this.snapshot.run.stopRequested && this.operation(operation.id)?.status !== 'skipped',
			onProgress: (progress) => this.patchOperation(operation.id, {
				processed: progress.processed,
				total: progress.total,
				currentPath: progress.path,
			}),
		});
		if (this.snapshot.run.stopRequested) throw new Error('Vault Scan stopped during vector enrichment.');
		this.indexErrors.push(...result.errors);
		if (this.operation(operation.id)?.status === 'skipped') return;
		this.patchOperation(operation.id, {
			status: result.errors.length ? 'failed' : 'completed',
			processed: result.processed,
			currentPath: null,
			error: result.errors[0]?.message ?? null,
		});
	}

	private async runLlmEnrichment(index: IndexService): Promise<void> {
		const ids: VaultScanAiOperationId[] = ['file-summaries', 'ai-tags'];
		const enabled = ids.filter((id) => this.operation(id)?.status !== 'skipped');
		if (enabled.length === 0) return;
		for (const id of enabled) this.patchOperation(id, { status: 'running' });
		const result = await index.runPendingLlmIndexEnrichment(this.deps.getSearchSettings(), {
			paths: this.snapshot.run.frozenPaths,
			shouldContinue: () => !this.snapshot.run.stopRequested && enabled.some((id) => this.operation(id)?.status !== 'skipped'),
			onProgress: (progress) => {
				const primary = enabled[0]!;
				this.patchOperation(primary, {
					processed: progress.processed,
					total: progress.total,
					currentPath: progress.path,
					usage: {
						inputTokens: progress.sumInputTokens,
						outputTokens: progress.sumOutputTokens,
						totalTokens: progress.sumTotalTokens,
						costUsd: progress.sumCostUsd,
					},
				});
				for (const id of enabled.slice(1)) this.patchOperation(id, {
					processed: progress.processed,
					total: progress.total,
					currentPath: progress.path,
				});
			},
		});
		if (this.snapshot.run.stopRequested) throw new Error('Vault Scan stopped during LLM enrichment.');
		this.indexErrors.push(...result.errors);
		for (const id of enabled) {
			if (this.operation(id)?.status === 'skipped') continue;
			this.patchOperation(id, {
				status: result.errors.length ? 'failed' : 'completed',
				processed: result.processed,
				currentPath: null,
				error: result.errors[0]?.message ?? null,
			});
		}
	}

	private async performAi(): Promise<void> {
		this.startStage('ai', 'Reviewing Vault-wide relationships and preparing evidence.');
		const ids: VaultScanAiOperationId[] = [
			'relationship-discovery', 'semantic-review', 'community-analysis', 'hub-bridge-analysis', 'file-proposals', 'maintenance-synthesis',
		];
		const enabled = ids.filter((id) => this.operation(id)?.status !== 'skipped');
		if (enabled.length === 0) {
			this.completeStage('ai', 'Optional AI work skipped; deterministic Scan results are preserved.', 0, 0);
			return;
		}
		const review = this.deps.resolveReviewRuntime();
		if (!review) {
			for (const id of enabled) this.patchOperation(id, { status: 'failed', error: 'AI Review runtime is unavailable.' });
			this.patchStage('ai', { status: 'partial', message: 'AI Review unavailable; deterministic results retained.' });
			this.completeStage('ai', 'AI Review unavailable; deterministic results retained.', 0, 0, 'partial');
			return;
		}
		for (const id of enabled) this.patchOperation(id, {
			status: 'running',
			startedAt: this.now(),
			evidence: ['Waiting for the shared Vault Review evidence stream.'],
		});
		let finalSnapshot: VaultReviewSessionSnapshot | null = null;
		try {
			for await (const reviewSnapshot of review.run({ mode: 'fast', signal: this.abortController!.signal })) {
				finalSnapshot = reviewSnapshot;
				const processed = reviewSnapshot.rounds.filter((round) => round.endedAt).length;
				const total = Math.max(1, reviewSnapshot.rounds.length);
				this.patchStage('ai', { processed, total, message: `AI review · round ${reviewSnapshot.currentRoundIndex + 1}` });
			}
		} catch (error) {
			const skipped = enabled.every((id) => this.operation(id)?.status === 'skipped');
			if (!skipped) throw error;
			this.completeStage('ai', 'Vault Review skipped; deterministic Scan results are preserved.', 0, 0);
			await this.recordEvent('stage-changed', this.snapshot.run.id, 'Vault Review skipped by the owner.');
			await this.flushPersist();
			return;
		}
		if (this.snapshot.run.stopRequested) return;
		if (finalSnapshot?.status === 'completed') await review.saveReport(finalSnapshot);
		const usage = collectReviewUsage(finalSnapshot);
		const primaryRoute = enabled.map((id) => this.operation(id)).find(Boolean);
		if (primaryRoute && usage.totalTokens > 0) {
			usage.costUsd = await this.deps.calculateCostUsd(
				primaryRoute.provider,
				primaryRoute.model,
				usage,
			).catch(() => 0);
		}
		for (const [index, id] of enabled.entries()) {
			if (this.operation(id)?.status === 'skipped') continue;
			this.patchOperation(id, {
				status: finalSnapshot?.status === 'completed' ? 'completed' : 'failed',
				processed: finalSnapshot?.rounds.length ?? 0,
				total: finalSnapshot?.rounds.length ?? 0,
				currentPath: null,
				usage: index === 0 ? usage : { ...EMPTY_USAGE },
				completedAt: this.now(),
				evidence: finalSnapshot?.status === 'completed'
					? [`Vault Review completed ${finalSnapshot.rounds.length} evidence rounds.`, 'This row shares the same provider receipt; no duplicate provider call was made.']
					: ['The shared Vault Review runtime did not return a completed evidence stream.'],
				error: finalSnapshot?.status === 'completed' ? null : finalSnapshot?.error ?? 'AI Review did not complete.',
			});
		}
		this.completeStage('ai', finalSnapshot?.status === 'completed'
			? 'Vault-wide AI evidence completed.'
			: 'AI work completed partially; deterministic results remain valid.',
			finalSnapshot?.rounds.length ?? 0,
			finalSnapshot?.rounds.length ?? 0,
			finalSnapshot?.status === 'completed' ? 'completed' : 'partial');
		await this.recordEvent('stage-changed', this.snapshot.run.id, 'AI work completed.');
		await this.flushPersist();
	}

	private async performPublish(): Promise<void> {
		this.startStage('publish', 'Publishing verified Index layers, receipts and owner follow-up.');
		const index = this.deps.resolveIndexService();
		if (index) {
			try {
				await index.runMobiusGlobalMaintenance(['vault', 'chat'], {
					onProgress: (event) => this.patchStage('publish', {
						message: `Publishing ${event.phase.replace(/_/g, ' ')}${event.progressTextSuffix ?? ''}`,
					}),
				});
			} catch (error) {
				this.addRunWarning(`Knowledge map publish: ${errorMessage(error)}`);
			}
		}
		const lintResult = (await this.deps.resolveLintRuntime()?.loadLatestScan()) ?? null;
		const config = await loadVaultIntelligenceConfig();
		const runId = this.snapshot.run.id!;
		const plan = this.requirePlan();
		const enabledCheckIds = new Set(plan.enabledCheckIds);
		const enabledKinds = new Set(config.tasks
			.filter((definition) => definition.kind === 'unreadable-files'
				|| definition.signalIds.some((signalId) => enabledCheckIds.has(signalId)))
			.map((definition) => definition.kind));
		const frozen = new Set(this.snapshot.run.frozenPaths);
		const scopedFindings = plan.scope.mode === 'entire'
			? lintResult?.findings ?? []
			: (lintResult?.findings ?? []).filter((finding) => finding.filePath && frozen.has(finding.filePath));
		const findings = scopedFindings.filter((finding) => enabledCheckIds.has(finding.signalId));
		const derived = deriveVaultMaintenanceTasks({
			config,
			findings,
			unreadableErrors: this.indexErrors,
			previous: this.snapshot.tasks,
			runId,
			now: this.now(),
			fileMtime: (path) => this.fileMtime(path),
		}).filter((task) => enabledKinds.has(task.kind));
		const tasks = mergeScopedMaintenanceTasks({
			config,
			previous: this.snapshot.tasks,
			derived,
			enabledKinds,
			frozenPaths: this.snapshot.run.frozenPaths,
			entireVault: plan.scope.mode === 'entire',
			runId,
			now: this.now(),
		});
		const followUpTasks = tasks.filter((task) => task.sourceRunId === runId && task.state !== 'verified');
		const indexStatus = await index?.getIndexStatus().catch(() => null) ?? null;
		const completedAt = this.now();
		const completed: VaultCompletedRun = {
			runId,
			startedAt: this.snapshot.run.startedAt ?? completedAt,
			completedAt,
			scopeMode: plan.scope.mode,
			objectCount: this.snapshot.run.frozenPaths.length,
			searchableCount: indexStatus?.indexedDocs ?? null,
			usage: totalUsage(this.snapshot.run.operations),
			receipts: buildReceipts(this.snapshot.run, indexStatus?.indexedDocs ?? null, lintResult),
			maintenanceTaskIds: followUpTasks.map((task) => task.id),
			warnings: [...this.snapshot.run.warnings],
		};
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
		if (!persisted || (persisted.version !== 1 && persisted.version !== 2 && persisted.version !== 3)) {
			return {
				version: 3,
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
			plan: persisted.activeRun.plan
				? migratePlanChecks(persisted.activeRun.plan, DEFAULT_VAULT_INTELLIGENCE_CONFIG)
				: null,
		} : null;
		const migrated = {
			...persisted,
			version: 3 as const,
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
		const changedSinceScan = this.snapshot.changedCursorAt
			? files.filter((file) => file.stat.mtime > this.snapshot.changedCursorAt!).length
			: null;
		const indexStatus = await this.deps.resolveIndexService()?.getIndexStatus().catch(() => null) ?? null;
		const searchReady = indexStatus?.indexedDocs ?? null;
		this.patch({
			digest,
			fileTypes: summarizeVaultFileTypes(files),
			availablePaths: files.map((file) => file.path).sort((left, right) => left.localeCompare(right)),
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
		this.patchRun({ status: 'interrupted', currentStage: null, stopRequested: false });
		this.queuePersist();
		return true;
	}

	private startStage(id: VaultScanStageId, message: string): void {
		this.patchRun({ currentStage: id });
		this.patchStage(id, { status: 'running', message });
		void this.recordEvent('stage-changed', this.snapshot.run.id, `${id}: ${message}`);
	}

	private completeStage(
		id: VaultScanStageId,
		message: string,
		processed: number,
		total: number,
		status: 'completed' | 'partial' = 'completed',
	): void {
		this.patchStage(id, { status, message, processed, total });
		this.patchRun({ completedStages: unique([...this.snapshot.run.completedStages, id]) });
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
		this.patchRun({ operations: this.snapshot.run.operations.map((operation) => operation.id === id ? { ...operation, ...next } : operation) });
	}

	private addRunWarning(warning: string): void {
		this.patchRun({ warnings: unique([...this.snapshot.run.warnings, warning]) });
	}

	private replaceTask(task: VaultMaintenanceTask): void {
		this.patch({ tasks: this.snapshot.tasks.map((candidate) => candidate.id === task.id ? task : candidate) });
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
				? { ...task, state: 'recovery', updatedAt: now }
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

	private queuePersist(): void {
		const store = this.recordStore();
		if (!store) return;
		const activeRun = this.snapshot.run.status === 'running'
			|| this.snapshot.run.status === 'stopping'
			|| this.snapshot.run.status === 'interrupted'
			|| this.snapshot.run.status === 'failed'
			? this.snapshot.run
			: null;
		const state: VaultIntelligencePersistedState = {
			version: 3,
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
		this.patch({ run: { ...this.snapshot.run, ...next } });
	}
}

function normalizePlan(
	plan: VaultScanPlan,
	config: VaultIntelligenceConfig,
	routes: Partial<Record<VaultScanAiOperationId, VaultScanOperationRoute>>,
): VaultScanPlan {
	const migratedPlan = migratePlanChecks(plan, config);
	const incoming = new Map(migratedPlan.aiOperations.map((operation) => [
		operation.id === 'relationship-review' ? 'relationship-discovery' : operation.id,
		operation,
	]));
	const normalizedOperations = config.scanOperations.map((definition) => {
		const candidate = incoming.get(definition.id) ?? {
			id: definition.id,
			enabled: definition.defaultEnabled,
			model: definition.model,
			provider: definition.provider,
			estimatedTokens: definition.estimatedTokens,
			estimatedCostUsd: definition.estimatedCostUsd,
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
	for (const group of [
		['file-summaries', 'ai-tags'],
		['relationship-discovery', 'semantic-review', 'community-analysis', 'hub-bridge-analysis', 'file-proposals', 'maintenance-synthesis'],
	] as const) {
		const enabled = group.every((id) => normalizedOperations.find((operation) => operation.id === id)?.enabled);
		for (const operation of normalizedOperations) {
			if ((group as readonly string[]).includes(operation.id)) operation.enabled = enabled;
		}
	}
	if (migratedPlan.scope.mode !== 'entire') {
		for (const operation of normalizedOperations) {
			if (operationExecutionGroup(operation.id).includes('relationship-discovery')) operation.enabled = false;
		}
	}
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

function operationExecutionGroup(id: VaultScanAiOperationId): readonly VaultScanAiOperationId[] {
	if (id === 'file-summaries' || id === 'ai-tags') return ['file-summaries', 'ai-tags'];
	if (id === 'relationship-review' || id === 'relationship-discovery' || id === 'semantic-review' || id === 'community-analysis' || id === 'hub-bridge-analysis' || id === 'file-proposals' || id === 'maintenance-synthesis') {
		return ['relationship-discovery', 'semantic-review', 'community-analysis', 'hub-bridge-analysis', 'file-proposals', 'maintenance-synthesis'];
	}
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

function mergeScopedMaintenanceTasks(options: {
	config: VaultIntelligenceConfig;
	previous: readonly VaultMaintenanceTask[];
	derived: readonly VaultMaintenanceTask[];
	enabledKinds: ReadonlySet<VaultMaintenanceTask['kind']>;
	frozenPaths: readonly string[];
	entireVault: boolean;
	runId: string;
	now: number;
}): VaultMaintenanceTask[] {
	const previousByKind = new Map(options.previous.map((task) => [task.kind, task]));
	const derivedByKind = new Map(options.derived.map((task) => [task.kind, task]));
	const frozen = new Set(options.frozenPaths);
	const tasks: VaultMaintenanceTask[] = [];
	for (const definition of options.config.tasks) {
		const previous = previousByKind.get(definition.kind);
		if (!options.enabledKinds.has(definition.kind)) {
			if (previous) tasks.push(previous);
			continue;
		}
		const current = derivedByKind.get(definition.kind);
		const retained = options.entireVault
			? []
			: previous?.atomicItems.filter((item) => !item.filePath || !frozen.has(item.filePath)) ?? [];
		const currentIds = new Set(current?.atomicItems.map((item) => item.id) ?? []);
		const atomicItems = [
			...(current?.atomicItems ?? []),
			...retained.filter((item) => !currentIds.has(item.id)),
		];
		if (atomicItems.length === 0) continue;
		const base = current ?? previous!;
		const paths = new Set(atomicItems.flatMap((item) => item.filePath ? [item.filePath] : []));
		const touched = Boolean(current) || retained.length !== previous?.atomicItems.length;
		const task: VaultMaintenanceTask = {
			...base,
			sourceRunId: current ? options.runId : base.sourceRunId,
			atomicItems,
			affectedLabel: maintenanceAffectedLabel(definition.kind, atomicItems.length),
			contextLabel: `${paths.size.toLocaleString()} ${paths.size === 1 ? 'file' : 'files'}`,
			state: current?.state === 'recovery'
				? 'recovery'
				: deriveMaintenanceState(definition.initialState, atomicItems, base.defaultChoice),
			createdAt: previous?.createdAt ?? base.createdAt,
			updatedAt: touched ? options.now : base.updatedAt,
		};
		tasks.push(task);
	}
	return tasks;
}

function buildObjectSummaries(
	fileCount: number,
	chatCount: number,
	projectCount: number,
	composerEventCount: number,
): VaultIntelligenceObjectSummary[] {
	return [
		{ id: 'files', label: 'Files', count: fileCount, detail: 'Vault files visible to Peak', coverageNote: 'Distribution comes from actual Vault extensions.' },
		{ id: 'chats', label: 'Chats', count: chatCount, detail: 'Durable Peak conversations', breakdown: [{ id: 'canonical', label: 'Canonical conversations', count: chatCount }], breakdownStatus: 'unavailable', coverageNote: 'The Chat store does not yet publish a stable type distribution.' },
		{ id: 'projects', label: 'Projects', count: projectCount, detail: 'Current Peak projects', breakdown: [{ id: 'canonical', label: 'Current projects', count: projectCount }], breakdownStatus: 'unavailable', coverageNote: 'The Project store does not yet publish lifecycle buckets here.' },
		{ id: 'composer', label: 'Composer', count: composerEventCount, detail: 'Durable workspace events', breakdown: [{ id: 'canonical', label: 'Recorded events', count: composerEventCount }], breakdownStatus: 'unavailable', coverageNote: 'Composer publishes events, not a guessed activity taxonomy.' },
	];
}

function totalUsage(operations: readonly VaultScanOperationState[]): VaultScanUsage {
	return operations.reduce<VaultScanUsage>((total, operation) => ({
		inputTokens: total.inputTokens + operation.usage.inputTokens,
		outputTokens: total.outputTokens + operation.usage.outputTokens,
		totalTokens: total.totalTokens + operation.usage.totalTokens,
		costUsd: total.costUsd + operation.usage.costUsd,
	}), { ...EMPTY_USAGE });
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
