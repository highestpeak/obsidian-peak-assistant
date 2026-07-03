// Hub Materialization Agent: given one curator decision, prepare the local
// context, draft a hub doc via LLM, critique it (subagent loop), and finalize
// by writing markdown back to the vault. Honors `peak_user_owned` guard.
// See docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 6.

import type { AIServiceManager } from '@/service/chat/service-manager';
import type { TemplateManager } from '@/core/template/TemplateManager';
import type { MobiusNodeRepo } from '@/core/storage/sqlite/repositories/MobiusNodeRepo';
import type {
	VaultHubDocWritePort,
} from '@/core/ports/HubGenerationPorts';
import { prepareHubMaterializationContext } from './hub-materialization-helper/hubMaterializationPrep';
import { runHubMaterializationReconLoop } from './hub-materialization-helper/hubMaterializationRecon';
import { renderHubDocMarkdown } from './hub-materialization-helper/hubDocRender';
import type {
	HubMaterializationRunOptions,
	HubMaterializationRunResult,
	HubMaterializationVaultReaderPort,
} from './hub-materialization-helper/types';

const DEFAULT_CRITIQUE_ITERATIONS = 2;

export interface HubMaterializationAgentDeps {
	aiServiceManager: AIServiceManager;
	templateManager: TemplateManager;
	mobiusNodeRepo: MobiusNodeRepo;
	vaultReader: HubMaterializationVaultReaderPort;
	vaultWritePort: VaultHubDocWritePort;
}

export class HubMaterializationAgent {
	constructor(private readonly deps: HubMaterializationAgentDeps) {}

	async run(options: HubMaterializationRunOptions): Promise<HubMaterializationRunResult> {
		const vaultName = options.vaultName?.trim() || 'Vault';
		const budget = {
			maxCritiqueIterations: options.budget?.maxCritiqueIterations ?? DEFAULT_CRITIQUE_ITERATIONS,
		};

		const prep = options.prepOverride
			?? (await prepareHubMaterializationContext({
				decision: options.decision,
				planId: options.planId,
				vaultName,
				budget,
				deps: {
					mobiusNodeRepo: this.deps.mobiusNodeRepo,
					vaultReader: this.deps.vaultReader,
					vaultWritePort: this.deps.vaultWritePort,
				},
			}));

		if (prep.isUserOwned) {
			return {
				status: 'skipped-user-owned',
				hubPath: prep.hubPath,
				draftIterations: 0,
				gapsRemaining: [],
			};
		}

		if (prep.members.length === 0) {
			return {
				status: 'failed',
				hubPath: prep.hubPath,
				draftIterations: 0,
				gapsRemaining: [],
				error: 'no-members-in-scope',
			};
		}

		try {
			const recon = await runHubMaterializationReconLoop({
				prep,
				aiServiceManager: this.deps.aiServiceManager,
			});

			const markdown = await renderHubDocMarkdown({
				tm: this.deps.templateManager,
				draft: recon.draft,
				hubNodeId: prep.hubNodeId,
				planId: prep.planId,
				coverage: recon.critique.overallCoverage,
				userPreservedContent: prep.existingUserContent,
			});

			await this.deps.vaultWritePort.writeHubDoc(prep.hubPath, markdown);

			return {
				status: 'written',
				hubPath: prep.hubPath,
				coverage: recon.critique.overallCoverage,
				draftIterations: recon.iterations,
				gapsRemaining: recon.gapsRemaining,
				draft: recon.draft,
			};
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			return {
				status: 'failed',
				hubPath: prep.hubPath,
				draftIterations: 0,
				gapsRemaining: [],
				error: msg,
			};
		}
	}
}
