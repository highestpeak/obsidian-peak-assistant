// App-owned runtime for the Hub Generation pipeline (Curator + Materializer +
// Executor + Scheduler). Composed at plugin boot in main.ts; consumers reach
// through AppRuntimeRegistry.getHubGenerationRuntime(). See
// docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 7.

import type { HubCuratorAgent } from '@/service/agents/HubCuratorAgent';
import type { HubMaterializationAgent } from '@/service/agents/HubMaterializationAgent';
import type { HubCurationExecutor } from '@/service/agents/hub-curation-helper/HubCurationExecutor';
import type { HubCurationPlanRepo } from '@/core/storage/sqlite/repositories/HubCurationPlanRepo';
import type { HubCurationDecision } from '@/core/schemas/agents/hubCuration';
import type { VaultHubDocWritePort } from '@/core/ports/HubGenerationPorts';
import type { HubConstituentRepo } from '@/core/storage/sqlite/repositories/HubConstituentRepo';
import type { GeneratedOutputPersistenceRuntime } from '@/core/storage/generated-output';
import { hashSHA256 } from '@/core/utils/hash-utils';
import {
	HubRecordStore,
	type HubManifest,
} from './HubRecordStore';

export interface HubGenerationRuntimeDeps {
	curator: HubCuratorAgent;
	materializer: HubMaterializationAgent;
	executor: HubCurationExecutor;
	planRepo: HubCurationPlanRepo;
	recordStore: HubRecordStore;
	hubConstituentRepo: HubConstituentRepo;
	vaultWritePort: VaultHubDocWritePort;
	hubSummaryFolder: string;
	generatedOutputs: GeneratedOutputPersistenceRuntime;
}

export interface ExplicitMaterializedHub {
	readonly manifest: HubManifest;
	/** The user-initiated Materialize event, not the file's modified timestamp. */
	readonly materializedAt: number;
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

	readManifest(hubId: string): Promise<HubManifest | null> {
		return this.deps.recordStore.read(hubId);
	}

	/**
	 * My Content uses this projection rather than scanning Hub-Summaries. A
	 * migrated legacy Markdown note has a materialized path, but no
	 * user-initiated `materialized` event, so it must remain outside the user
	 * content surface.
	 */
	async listExplicitMaterializedHubs(): Promise<readonly ExplicitMaterializedHub[]> {
		const items: ExplicitMaterializedHub[] = [];
		for (const hubId of await this.deps.recordStore.listHubIds()) {
			const manifest = await this.deps.recordStore.read(hubId);
			if (!manifest || manifest.status !== 'active') continue;
			if (manifest.materialization.state !== 'materialized' || !manifest.materialization.path) continue;
			const materializedAt = [...await this.deps.recordStore.readEvents(hubId)]
				.reverse()
				.find((event) => event.kind === 'materialized')?.at;
			if (materializedAt === undefined) continue;
			items.push({ manifest, materializedAt });
		}
		return items.sort((a, b) => b.materializedAt - a.materializedAt || a.manifest.label.localeCompare(b.manifest.label));
	}

	async materializeHub(hubId: string): Promise<void> {
		const manifest = await this.deps.recordStore.read(hubId);
		if (!manifest || manifest.status === 'retired') throw new Error(`Hub not found: ${hubId}`);
		const result = await this.deps.materializer.run({
			decision: manifest.decision,
			planId: `materialize-${Date.now()}`,
			trigger: 'manual',
			materializeMarkdown: true,
		});
		if (result.status === 'failed') throw new Error(result.error ?? 'Hub materialization failed');
		if (result.status === 'skipped-user-owned') throw new Error('Hub note is user-owned and was not overwritten.');
	}

	async migrateLegacyHubs(): Promise<{ imported: number; warnings: string[] }> {
		let imported = 0;
		const warnings: string[] = [];
		for (const path of await this.deps.vaultWritePort.listMarkdownUnder(this.deps.hubSummaryFolder)) {
			try {
				const raw = await this.deps.vaultWritePort.read(path);
				if (raw === null) continue;
				const declaredId = readFrontmatterString(raw, 'peak_hub_node_id');
				const hubId = declaredId || `legacy-${hashSHA256(path).slice(0, 24)}`;
				if (await this.deps.recordStore.read(hubId)) continue;
				const rows = await this.deps.hubConstituentRepo.getMembersForHub(hubId);
				const planId = readFrontmatterString(raw, 'peak_hub_plan_id') || 'legacy-import';
				const label = /^#\s+(.+)$/m.exec(raw)?.[1]?.trim()
					?? path.split('/').pop()?.replace(/\.md$/i, '')
					?? hubId;
				const now = Date.now();
				const decision: HubCurationDecision = {
					nodeId: hubId,
					hubPath: path,
					action: 'keep',
					scope: {
						communityIds: [],
						memberNodeIds: rows.map((row) => row.member_node_id).filter((id): id is string => Boolean(id)),
					},
					reason: 'legacy Hub Markdown import',
				};
				const manifest: HubManifest = {
					hubId,
					label,
					status: 'active',
					communityIds: [],
					decision,
					members: rows.map((row) => ({
						nodeId: row.member_node_id ?? `path-${hashSHA256(row.member_path).slice(0, 16)}`,
						path: row.member_path,
						provenance: 'legacy-projection' as const,
					})),
					summary: { version: 1, legacyMarkdown: raw },
					materialization: {
						state: 'materialized',
						path,
						userOwned: await this.deps.vaultWritePort.readPeakUserOwned(path),
						revision: hashSHA256(raw),
					},
					planId,
					updatedAt: now,
				};
				await this.deps.recordStore.write(manifest, {
					kind: 'legacy-imported', hubId, planId, at: now, detail: { path },
				});
				await this.deps.materializer.projectManifest(manifest);
				const target = await this.deps.generatedOutputs.snapshots.readSnapshot<HubManifest>({
					outputId: 'hub.manifest', recordKey: hubId, pathVariables: { hubId },
				});
				const migration = {
					migrationId: 'hub-markdown-to-manifest-v1',
					sourceOutputId: 'legacy.hub-auto-markdown',
					targetOutputId: 'hub.manifest',
					sourcePath: path,
					targetPath: this.deps.generatedOutputs.resolvePath('hub.manifest', { hubId }),
					sourceChecksum: hashSHA256(raw),
					targetChecksum: target?.envelope.checksum,
				};
				await this.deps.generatedOutputs.migrations.append({ ...migration, status: 'imported' });
				await this.deps.generatedOutputs.migrations.append({ ...migration, status: 'validated' });
				imported += 1;
			} catch (error) {
				warnings.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		return { imported, warnings };
	}

	async rebuildProjection(): Promise<{ recordsRead: number; recordsWritten: number; warnings: string[] }> {
		let recordsRead = 0;
		let recordsWritten = 0;
		const warnings: string[] = [];
		for (const hubId of await this.deps.recordStore.listHubIds()) {
			try {
				const manifest = await this.deps.recordStore.read(hubId);
				if (!manifest) continue;
				recordsRead += 1 + manifest.members.length;
				if (manifest.status === 'retired') {
					await this.deps.hubConstituentRepo.deleteByHub(hubId);
					recordsWritten += 1;
					continue;
				}
				await this.deps.materializer.projectManifest(manifest);
				recordsWritten += 1 + manifest.members.length;
			} catch (error) {
				warnings.push(`${hubId}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		return { recordsRead, recordsWritten, warnings };
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
			const currentManifest = decision
				? null
				: await this.deps.recordStore.read(hubNodeId);
			const usedDecision: HubCurationDecision = decision ?? currentManifest?.decision ?? {
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

function readFrontmatterString(raw: string, key: string): string | null {
	const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1];
	if (!block) return null;
	const match = new RegExp(`^\\s*${key}\\s*:\\s*["']?([^"'\\n]+)["']?\\s*$`, 'm').exec(block);
	return match?.[1]?.trim() || null;
}
