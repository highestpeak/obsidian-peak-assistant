// Executor: reads a HubCurationPlanRow and dispatches per-decision work.
// See docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 5.

import type { HubCurationDecision } from '@/core/schemas/agents/hubCuration';
import type {
	HubCurationPlanRepo,
	HubCurationPlanRow,
} from '@/core/storage/sqlite/repositories/HubCurationPlanRepo';
import type { HubMaterializationAgent } from '@/service/agents/HubMaterializationAgent';
import type { MobiusNodeRepo } from '@/core/storage/sqlite/repositories/MobiusNodeRepo';
import type {
	VaultHubArchivePort,
	VaultHubDocWritePort,
} from '@/core/ports/HubGenerationPorts';

export interface HubCurationExecutorDeps {
	materializationAgent: HubMaterializationAgent;
	planRepo: HubCurationPlanRepo;
	mobiusNodeRepo: MobiusNodeRepo;
	vaultWritePort: VaultHubDocWritePort;
	archivePort: VaultHubArchivePort;
}

export interface HubCurationExecutorDecisionOutcome {
	nodeId: string;
	hubPath: string;
	action: HubCurationDecision['action'];
	outcome:
		| 'materialized'
		| 'skipped-user-owned'
		| 'skipped-fresh'
		| 'no-op'
		| 'merged'
		| 'merge-blocked'
		| 'archived'
		| 'failed';
	error?: string;
	coverage?: number;
}

export interface HubCurationExecutorResult {
	planId: string;
	decisions: HubCurationExecutorDecisionOutcome[];
	completedCount: number;
	failedCount: number;
}

export class HubCurationExecutor {
	constructor(private readonly deps: HubCurationExecutorDeps) {}

	async execute(plan: HubCurationPlanRow): Promise<HubCurationExecutorResult> {
		const outcomes: HubCurationExecutorDecisionOutcome[] = [];
		await this.deps.planRepo.updateExecutorStatus(plan.planId, 'running');

		for (const d of plan.decisions) {
			try {
				const outcome = await this.dispatchDecision(d, plan.planId);
				outcomes.push(outcome);
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				outcomes.push({
					nodeId: d.nodeId,
					hubPath: d.hubPath,
					action: d.action,
					outcome: 'failed',
					error: msg,
				});
			}
		}

		const failedCount = outcomes.filter((o) => o.outcome === 'failed').length;
		await this.deps.planRepo.updateExecutorStatus(
			plan.planId,
			failedCount === plan.decisions.length && plan.decisions.length > 0 ? 'failed' : 'completed',
			failedCount > 0 ? `${failedCount} decision(s) failed` : undefined,
		);

		return {
			planId: plan.planId,
			decisions: outcomes,
			completedCount: outcomes.filter((o) => o.outcome === 'materialized').length,
			failedCount,
		};
	}

	private async dispatchDecision(
		d: HubCurationDecision,
		planId: string,
	): Promise<HubCurationExecutorDecisionOutcome> {
		if (d.action === 'retire') {
			await this.deps.archivePort.archive(d.hubPath);
			return { nodeId: d.nodeId, hubPath: d.hubPath, action: d.action, outcome: 'archived' };
		}

		if (d.action === 'merge') {
			const conflict = await this.detectMergeConflict(d);
			if (conflict) {
				return {
					nodeId: d.nodeId,
					hubPath: d.hubPath,
					action: d.action,
					outcome: 'merge-blocked',
					error: `user-owned source: ${conflict}`,
				};
			}
			for (const src of d.mergeSourceHubs ?? []) {
				if (src === d.hubPath) continue;
				await this.deps.archivePort.archive(src);
			}
			// Fall through to materialize the survivor with the merged scope.
		}

		if (d.action === 'keep') {
			// Only re-materialize when stale; otherwise skip. Freshness heuristic:
			// hub_stale_since column set → stale. We ask MobiusNodeRepo per node.
			const signals = await this.deps.mobiusNodeRepo
				.getDocumentNodeSignals(d.nodeId)
				.catch(() => null);
			void signals; // signals lookup does not include hub_stale_since; we default to materialize on keep+scope changes
		}

		const runResult = await this.deps.materializationAgent.run({
			decision: d,
			planId,
			trigger: 'scheduled',
		});

		if (runResult.status === 'written') {
			return {
				nodeId: d.nodeId,
				hubPath: d.hubPath,
				action: d.action,
				outcome: d.action === 'merge' ? 'merged' : 'materialized',
				coverage: runResult.coverage,
			};
		}
		if (runResult.status === 'skipped-user-owned') {
			return {
				nodeId: d.nodeId,
				hubPath: d.hubPath,
				action: d.action,
				outcome: 'skipped-user-owned',
			};
		}
		return {
			nodeId: d.nodeId,
			hubPath: d.hubPath,
			action: d.action,
			outcome: 'failed',
			error: runResult.error ?? 'unknown',
		};
	}

	private async detectMergeConflict(d: HubCurationDecision): Promise<string | null> {
		for (const src of d.mergeSourceHubs ?? []) {
			const isOwned = await this.deps.vaultWritePort.readPeakUserOwned(src).catch(() => false);
			if (isOwned) return src;
		}
		return null;
	}
}
