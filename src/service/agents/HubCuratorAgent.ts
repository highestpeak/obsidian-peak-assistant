// Hub Curator Agent: decides which nodes deserve to be hubs, with LLM-driven
// coverage self-assessment. Writes the plan to hub_curation_plan for downstream
// executor dispatch. See docs/superpowers/specs/2026-07-03-hub-generation-agent.md
// §Component 4.

import { generateUuidWithoutHyphens } from '@/core/utils/id-utils';
import type { AIServiceManager } from '@/service/chat/service-manager';
import type { TemplateManager } from '@/core/template/TemplateManager';
import type { MobiusNodeRepo } from '@/core/storage/sqlite/repositories/MobiusNodeRepo';
import type { StructuralAnalysisRepo } from '@/core/storage/sqlite/repositories/StructuralAnalysisRepo';
import type { HubConstituentRepo } from '@/core/storage/sqlite/repositories/HubConstituentRepo';
import type {
	HubCurationPlanRepo,
	HubCurationPlanRow,
} from '@/core/storage/sqlite/repositories/HubCurationPlanRepo';
import type { VaultHubDocWritePort } from '@/core/ports/HubGenerationPorts';
import { prepareHubCurationContext } from './hub-curation-helper/hubCurationPrep';
import { runHubCurationLoop } from './hub-curation-helper/hubCurationRecon';
import type { HubCurationRunOptions } from './hub-curation-helper/types';

export interface HubCuratorAgentDeps {
	aiServiceManager: AIServiceManager;
	templateManager: TemplateManager;
	mobiusNodeRepo: MobiusNodeRepo;
	structuralRepo: StructuralAnalysisRepo;
	hubConstituentRepo: HubConstituentRepo;
	planRepo: HubCurationPlanRepo;
	vaultWritePort: VaultHubDocWritePort;
	hubSummaryFolder: string;
}

export class HubCuratorAgent {
	constructor(private readonly deps: HubCuratorAgentDeps) {}

	async run(options: HubCurationRunOptions = {}): Promise<HubCurationPlanRow> {
		const vaultName = options.vaultName?.trim() || 'Vault';
		const currentDateLabel = options.currentDateLabel?.trim() || new Date().toISOString().slice(0, 10);
		const trigger = options.trigger ?? 'manual';

		const prep = await prepareHubCurationContext({
			vaultName,
			currentDateLabel,
			candidateLimitOverride: options.candidateLimitOverride,
			maxIterationsOverride: options.maxIterationsOverride,
			deps: {
				tm: this.deps.templateManager,
				mobiusNodeRepo: this.deps.mobiusNodeRepo,
				structuralRepo: this.deps.structuralRepo,
				hubConstituentRepo: this.deps.hubConstituentRepo,
				vaultWritePort: this.deps.vaultWritePort,
				hubSummaryFolder: this.deps.hubSummaryFolder,
			},
		});

		const usageSessionId = generateUuidWithoutHyphens();
		const { memory } = await runHubCurationLoop({
			prep,
			aiServiceManager: this.deps.aiServiceManager,
			usageSessionId,
		});

		const planId = generateUuidWithoutHyphens();
		const curatedAt = Date.now();
		await this.deps.planRepo.insert({
			planId,
			curatedAt,
			trigger,
			coveragePct: memory.coveragePct,
			confidence: memory.confidence,
			iterations: memory.iterations,
			decisions: memory.decisions,
			worldSummary: prep.worldSnapshotMarkdown.slice(0, 12000),
		});
		await this.deps.planRepo.pruneOlderThan(20);

		const row = await this.deps.planRepo.getById(planId);
		if (!row) throw new Error(`HubCuratorAgent: plan ${planId} vanished after insert`);
		return row;
	}
}
