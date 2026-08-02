// Hub Materialization Agent: given one curator decision, prepare the local
// context, draft a hub doc via LLM, critique it (subagent loop), and finalize
// by writing markdown back to the vault. Honors `peak_user_owned` guard.
// See docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 6.

import type { AIServiceManager } from '@/service/chat/service-manager';
import type { TemplateManager } from '@/core/template/TemplateManager';
import type { MobiusNodeRepo } from '@/core/storage/sqlite/repositories/MobiusNodeRepo';
import type { HubConstituentRepo } from '@/core/storage/sqlite/repositories/HubConstituentRepo';
import { GraphNodeType } from '@/core/types/graph';
import { hashSHA256 } from '@/core/utils/hash-utils';
import {
	HubRecordStore,
	type HubManifest,
	virtualHubPath,
} from '@/service/hub/HubRecordStore';
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
import type { HubCurationDecision } from '@/core/schemas/agents/hubCuration';

const DEFAULT_CRITIQUE_ITERATIONS = 2;

export interface HubMaterializationAgentDeps {
	aiServiceManager: AIServiceManager;
	templateManager: TemplateManager;
	mobiusNodeRepo: MobiusNodeRepo;
	vaultReader: HubMaterializationVaultReaderPort;
	vaultWritePort: VaultHubDocWritePort;
	recordStore?: HubRecordStore;
	hubConstituentRepo?: HubConstituentRepo;
}

export class HubMaterializationAgent {
	constructor(private readonly deps: HubMaterializationAgentDeps) {}

	async retire(decision: HubCurationDecision, planId: string): Promise<void> {
		const existing = await this.deps.recordStore?.read(decision.nodeId);
		const now = Date.now();
		const manifest: HubManifest = existing
			? { ...existing, status: 'retired', decision, planId, updatedAt: now }
			: {
				hubId: decision.nodeId,
				label: decision.hubPath.split('/').pop()?.replace(/\.md$/i, '') ?? decision.nodeId,
				status: 'retired',
				communityIds: [...decision.scope.communityIds],
				decision,
				members: [],
				summary: { version: 0 },
				materialization: { state: 'virtual' },
				planId,
				updatedAt: now,
			};
		await this.deps.recordStore?.write(manifest, {
			kind: 'retired', hubId: manifest.hubId, planId, at: now,
			detail: { path: manifest.materialization.path ?? decision.hubPath },
		});
		await this.deps.hubConstituentRepo?.deleteByHub(manifest.hubId);
	}

	async retireByPath(path: string, planId: string): Promise<void> {
		const existing = await this.deps.recordStore?.findByPath(path);
		if (!existing) return;
		await this.retire(existing.decision, planId);
	}

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

		if (prep.isUserOwned && options.materializeMarkdown) {
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

			const existing = await this.deps.recordStore?.read(prep.hubNodeId) ?? null;
			let manifest: HubManifest = {
				hubId: prep.hubNodeId,
				label: recon.draft.title,
				status: 'active',
				communityIds: [...options.decision.scope.communityIds],
				decision: options.decision,
				members: prep.members.map((member) => ({
					nodeId: member.nodeId,
					path: member.path,
					title: member.title,
					role: member.role,
					provenance: 'curator-scope' as const,
				})),
				summary: {
					version: (existing?.summary.version ?? 0) + 1,
					draft: recon.draft,
					coverage: recon.critique.overallCoverage,
					iterations: recon.iterations,
				},
				materialization: existing?.materialization ?? { state: 'virtual' },
				planId: prep.planId,
				updatedAt: Date.now(),
			};
			await this.deps.recordStore?.write(manifest, {
				kind: 'synthesized',
				hubId: manifest.hubId,
				planId: manifest.planId,
				at: manifest.updatedAt,
				detail: { trigger: options.trigger, version: manifest.summary.version },
			});
			await this.projectManifest(manifest);

			if (!options.materializeMarkdown) {
				return {
					status: 'virtualized',
					hubPath: manifest.materialization.path ?? virtualHubPath(manifest.hubId),
					coverage: recon.critique.overallCoverage,
					draftIterations: recon.iterations,
					gapsRemaining: recon.gapsRemaining,
					draft: recon.draft,
				};
			}

			const markdown = await renderHubDocMarkdown({
				tm: this.deps.templateManager,
				draft: recon.draft,
				hubNodeId: prep.hubNodeId,
				planId: prep.planId,
				coverage: recon.critique.overallCoverage,
				userPreservedContent: prep.existingUserContent,
			});
			await this.deps.vaultWritePort.writeHubDoc(prep.hubPath, markdown);
			manifest = {
				...manifest,
				materialization: {
					state: 'materialized',
					path: prep.hubPath,
					userOwned: prep.isUserOwned,
					revision: hashSHA256(markdown),
				},
				updatedAt: Date.now(),
			};
			await this.deps.recordStore?.write(manifest, {
				kind: 'materialized',
				hubId: manifest.hubId,
				planId: manifest.planId,
				at: manifest.updatedAt,
				detail: { path: prep.hubPath, revision: manifest.materialization.revision },
			});
			await this.projectManifest(manifest);

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

	async projectManifest(manifest: HubManifest): Promise<void> {
		if (!this.deps.recordStore || !this.deps.hubConstituentRepo) return;
		const path = manifest.materialization.path ?? virtualHubPath(manifest.hubId);
		await this.deps.mobiusNodeRepo.upsert({
			id: manifest.hubId,
			type: GraphNodeType.HubDoc,
			label: manifest.label,
			attributes: JSON.stringify({
				path,
				virtual: manifest.materialization.state === 'virtual',
				materializationState: manifest.materialization.state,
				hubId: manifest.hubId,
				summaryVersion: manifest.summary.version,
			}),
			updated_at: manifest.updatedAt,
		});
		await this.deps.hubConstituentRepo.replaceHubMembers(
			manifest.hubId,
			path,
			manifest.members.map((member) => ({ nodeId: member.nodeId, path: member.path })),
		);
	}
}
