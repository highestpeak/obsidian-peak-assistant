// App-owned runtime for the Hub Generation pipeline (Curator + Materializer +
// Executor + Scheduler). Composed at plugin boot in main.ts; consumers reach
// through AppRuntimeRegistry.getHubGenerationRuntime(). See
// docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 7.

import type { HubCuratorAgent } from '@/service/agents/HubCuratorAgent';
import type { HubMaterializationAgent } from '@/service/agents/HubMaterializationAgent';
import type { HubCurationExecutor } from '@/service/agents/hub-curation-helper/HubCurationExecutor';
import type { HubCurationPlanRepo } from '@/core/storage/sqlite/repositories/HubCurationPlanRepo';
import type { HubCurationDecision } from '@/core/schemas/agents/hubCuration';

export interface HubGenerationRuntimeDeps {
	curator: HubCuratorAgent;
	materializer: HubMaterializationAgent;
	executor: HubCurationExecutor;
	planRepo: HubCurationPlanRepo;
}

export class HubGenerationRuntime {
	constructor(private readonly deps: HubGenerationRuntimeDeps) {}

	get curator(): HubCuratorAgent {
		return this.deps.curator;
	}
	get materializer(): HubMaterializationAgent {
		return this.deps.materializer;
	}
	get executor(): HubCurationExecutor {
		return this.deps.executor;
	}
	get planRepo(): HubCurationPlanRepo {
		return this.deps.planRepo;
	}

	/**
	 * Compose the "regenerate one hub" callback used by HubRegenService.
	 * Falls back to synthesizing a single-hub decision when no plan yet mentions
	 * the requested hub — this keeps stale-triggered regen working without waiting
	 * for the next Curator run. See spec §Component 8.1 · Single-hub fallback.
	 */
	buildRegenerateFn(): (hubNodeId: string, hubPath: string) => Promise<void> {
		return async (hubNodeId, hubPath) => {
			const recent = await this.deps.planRepo.listRecent(3);
			let decision: HubCurationDecision | null = null;
			for (const plan of recent) {
				const found = plan.decisions.find((d) => d.nodeId === hubNodeId);
				if (found) {
					decision = found;
					break;
				}
			}
			const usedDecision: HubCurationDecision = decision ?? {
				nodeId: hubNodeId,
				hubPath,
				action: 'keep',
				scope: { communityIds: [], memberNodeIds: [] },
				reason: 'single-hub fallback (no curator plan referenced this hub)',
			};

			await this.deps.materializer.run({
				decision: usedDecision,
				planId: 'stale-triggered-' + Date.now(),
				trigger: 'stale-triggered',
			});
		};
	}
}
