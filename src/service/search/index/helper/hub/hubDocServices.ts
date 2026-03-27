/**
 * Hub discovery, HubDoc generation, and vault lifecycle — single module with internal services.
 */

import { normalizePath, TFile } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import { getAIHubSummaryFolder, getAIManualHubFolder } from '@/app/settings/types';
import type { SearchSettings } from '@/app/settings/types';
import { HUB_FRONTMATTER_KEYS, HUB_MATERIALIZE_CONCURRENCY, SLICE_CAPS } from '@/core/constant';
import { hubDocSummaryLlmSchema } from '@/core/schemas/hubDiscoverLlm';
import {
	applyHubDocLlmPayloadToMarkdown,
	hubDocMarkdownBodyForLlm,
} from '@/core/storage/vault/hub-docs/HubDocLlmMarkdown';
import { mapWithConcurrency } from '@/core/utils/concurrent-utils';
import { hashString } from '@/core/utils/hash-utils';
import { Stopwatch } from '@/core/utils/Stopwatch';
import { parseFrontmatter } from '@/core/utils/markdown-utils';
import { escapeMermaidQuotedLabel } from '@/core/utils/mermaid-utils';
import { ensureFolder, readVaultTextSnippet } from '@/core/utils/vault-utils';
import { PromptId } from '@/service/prompt/PromptId';
import { defaultIndexDocumentOptions, IndexService } from '@/service/search/index/indexService';
import { HubCandidateDiscoveryService, listMarkdownPathsUnderFolder } from './hubDiscover';
import { resolveHubDocAssembly } from './localGraphAssembler';
import type { HubCandidate, HubDocArtifactParams, HubMaintenanceProgress } from './types';

export type { HubCandidate, HubMaintenanceProgress } from './types';

/**
 * Orchestrates hub folder lifecycle: discovery, markdown, vault writes, reindex.
 */
export class HubDocService {
	private readonly discovery = new HubCandidateDiscoveryService();
	private readonly markdown = new HubMarkdownService();

	constructor(private readonly getSearchSettings: () => SearchSettings) { }

	/**
	 * Run hub discovery (merged sources, greedy coverage selection, optional whole-round LLM review), then LLM fill, materialize/update, reindex (vault only).
	 * Discovery caps come from {@link computeHubDiscoverBudgets} inside {@link HubCandidateDiscoveryService.discoverAllHubCandidates}.
	 */
	async generateAndIndexHubDocsForMaintenance(options?: {
		onProgress?: (ev: HubMaintenanceProgress) => void;
	}): Promise<{ written: string[]; skippedUserOwned: number }> {
		const sw = new Stopwatch('HubDocService.generateAndIndexHubDocsForMaintenance');
		const app = AppContext.getApp();
		const hubPath = getAIHubSummaryFolder();
		const manualHubFolder = getAIManualHubFolder();
		const searchSettings = this.getSearchSettings();
		const indexService = IndexService.getInstance();

		sw.start('ensureHubFolders');
		await ensureFolder(app, hubPath);
		await ensureFolder(app, manualHubFolder);
		sw.stop();

		sw.start('indexManualHubDocs');
		for (const p of listMarkdownPathsUnderFolder(manualHubFolder)) {
			await indexService.indexDocument(p, searchSettings, defaultIndexDocumentOptions('hub_maintenance'));
		}
		sw.stop();

		sw.start('discoverAllHubCandidates');
		const candidates = await this.discovery.discoverAllHubCandidates();
		sw.stop();

		options?.onProgress?.({
			phase: 'hub_discovery',
			batchIndex: 0,
			idsInBatch: candidates.length,
		});

		const hubNodeIdSet = new Set(
			candidates
				.filter((c) => c.sourceKind === 'document' || c.sourceKind === 'manual')
				.map((c) => c.nodeId),
		);

		let materializeCompleted = 0;
		sw.start('materializeAndIndexHubDocs');
		const materializeResults = await mapWithConcurrency<HubCandidate, { writtenPath: string | null; skippedUserOwned: number }>(
			candidates,
			{
				limit: HUB_MATERIALIZE_CONCURRENCY,
				stopwatch: sw,
			},
			async (c, _index, trace) => {
				if (c.sourceKind === 'manual') {
					trace.start('indexManual');
					await indexService.indexDocument(c.path, searchSettings, defaultIndexDocumentOptions('hub_maintenance'));
					trace.stop();
					materializeCompleted++;
					options?.onProgress?.({
						phase: 'hub_materialize',
						batchIndex: materializeCompleted,
						idsInBatch: candidates.length,
					});
					return { writtenPath: null, skippedUserOwned: 0 };
				}

				const name = `Hub-${hashString(c.stableKey, 12)}.md`;
				const fullPath = normalizePath(`${hubPath}/${name}`);
				trace.start('assembly');
				const assembly = await resolveHubDocAssembly(c, hubNodeIdSet);
				trace.stop();
				trace.start('buildMd');
				let body = this.markdown.buildHubDocMarkdown({
					candidate: c,
					generatedAt: Date.now(),
					assembly,
				});
				trace.stop();
				trace.start('llm');
				body = await this.markdown.fillHubDocWithLLMSummary(body, c);
				trace.stop();
				trace.start('vaultLookup');
				const existing = app.vault.getAbstractFileByPath(fullPath);
				trace.stop();
				if (existing instanceof TFile) {
					trace.start('vaultRead');
					const prev = await app.vault.read(existing);
					trace.stop();
					if (peekUserOwnedOrAutoOff(prev)) {
						materializeCompleted++;
						options?.onProgress?.({
							phase: 'hub_materialize',
							batchIndex: materializeCompleted,
							idsInBatch: candidates.length,
						});
						return { writtenPath: null, skippedUserOwned: 1 };
					}
					trace.start('vaultWrite');
					await app.vault.modify(existing, body);
					trace.stop();
				} else {
					trace.start('vaultWrite');
					await app.vault.create(fullPath, body);
					trace.stop();
				}
				trace.start('indexDoc');
				await indexService.indexDocument(fullPath, searchSettings, defaultIndexDocumentOptions('hub_maintenance'));
				trace.stop();
				materializeCompleted++;
				options?.onProgress?.({
					phase: 'hub_materialize',
					batchIndex: materializeCompleted,
					idsInBatch: candidates.length,
				});
				return { writtenPath: fullPath, skippedUserOwned: 0 };
			},
		);
		sw.stop();

		const written: string[] = [];
		let skippedUserOwned = 0;
		for (const r of materializeResults) {
			if (r.writtenPath) written.push(r.writtenPath);
			skippedUserOwned += r.skippedUserOwned;
		}

		options?.onProgress?.({
			phase: 'hub_index',
			batchIndex: written.length,
			idsInBatch: written.length,
		});

		sw.print(false);
		return { written, skippedUserOwned };
	}

}

// --- HubMarkdownService: template + LLM fill ---

const HUB_DOC_LLM_MAX_NOTE_CHARS = 14_000;
const HUB_DOC_LLM_MAX_CLUSTER_SNIPPET = 4_000;

/**
 * Builds HubDoc markdown skeleton and optional LLM-filled sections.
 */
class HubMarkdownService {

	/**
	 * Full HubDoc markdown body + YAML frontmatter.
	 */
	buildHubDocMarkdown(params: HubDocArtifactParams): string {
		const { candidate, generatedAt, assembly } = params;
		const cs = candidate.candidateScore;
		const fm: Record<string, unknown> = {
			type: 'hub_doc',
			source_kind: candidate.sourceKind,
			hub_source_kinds: candidate.sourceKinds,
			hub_source_consensus: Number(candidate.sourceConsensusScore.toFixed(4)),
			hub_ranking_score: Number(candidate.rankingScore.toFixed(4)),
			source_path: candidate.path,
			source_node_id: candidate.nodeId,
			hub_role: candidate.role,
			hub_score: Number(candidate.graphScore.toFixed(4)),
			[HUB_FRONTMATTER_KEYS.autoHub]: true,
			[HUB_FRONTMATTER_KEYS.userOwned]: false,
			generated_at: generatedAt,
		};
		if (cs) {
			fm.hub_physical_authority = Number(cs.physicalAuthorityScore.toFixed(4));
			fm.hub_organizational = Number(cs.organizationalScore.toFixed(4));
			fm.hub_semantic_centrality = Number(cs.semanticCentralityScore.toFixed(4));
			fm.hub_manual_boost = Number(cs.manualBoost.toFixed(4));
		}
		const lg = assembly?.localHubGraph;
		if (lg) {
			fm.hub_local_graph_nodes = lg.nodes.length;
			fm.hub_local_graph_edges = lg.edges.length;
			fm.hub_frontier_reason = lg.frontierSummary.reason;
			fm.hub_frontier_depth = lg.frontierSummary.stoppedAtDepth;
		}
		const routes = assembly?.childHubRoutes ?? candidate.childHubRoutes;
		if (routes?.length) {
			fm.hub_child_routes = routes.map((r) => `${r.path}::${r.nodeId}`);
		}
		const ah = candidate.assemblyHints;
		if (ah) {
			fm.hub_assembly_topology = ah.expectedTopology;
			fm.hub_assembly_stop_at_child = ah.stopAtChildHub;
			if (ah.anchorTopicTags.length) {
				fm.hub_anchor_topic_tags = ah.anchorTopicTags.slice(0, 16);
			}
			if (ah.preferredChildHubNodeIds.length) {
				fm.hub_preferred_child_hub_ids = ah.preferredChildHubNodeIds.slice(0, 16);
			}
		}
		const members = assembly?.clusterMemberPaths ?? candidate.clusterMemberPaths;
		if (members?.length) {
			fm.hub_cluster_members = members.slice(0, SLICE_CAPS.hub.frontmatterClusterMembers);
		}
		const yamlLines = Object.entries(fm)
			.filter(([, v]) => v !== undefined && v !== null)
			.map(([k, v]) => {
				if (Array.isArray(v)) {
					return `${k}: [${v.map((p) => JSON.stringify(p)).join(', ')}]`;
				}
				if (typeof v === 'string') {
					return `${k}: ${JSON.stringify(v)}`;
				}
				if (typeof v === 'boolean') {
					return `${k}: ${v}`;
				}
				return `${k}: ${v}`;
			})
			.join('\n');

		const topoLines =
			routes?.map((r) => `- Sub-hub: [[${r.path}]] (${escapeMermaidQuotedLabel(r.label)})`).join('\n') ??
			`- Scope: \`${candidate.path}\``;

		const memberBlock =
			((members ?? assembly?.memberPathsSample) ?? [])
				.slice(0, SLICE_CAPS.hub.markdownMemberWikiLines)
				.map((p) => `- [[${p}]]`)
				.join('\n') || '_N/A_';

		return `---\n${yamlLines}\n---\n\n# Short Summary\n\n_TODO: one or two sentences for retrieval anchors._\n\n# Full Summary\n\n_TODO: 1000–1500 chars dense overview._\n\n# Topology Routes\n\n${topoLines}\n\n# Cluster / members\n\n${memberBlock}\n\n# Core Facts\n\n1. _TODO_\n\n# Tag / Topic Distribution\n\n_TODO_\n\n# Time Dimension\n\n_TODO_\n\n# Mermaid\n\n\`\`\`mermaid\nflowchart LR\n  center["${escapeMermaidQuotedLabel(candidate.label)}"]\n\`\`\`\n\n# Query Anchors\n\n_TODO: high-recall phrases._\n\n# Source scope\n\n- [[${candidate.path}]]\n`;
	}

	/**
	 * Fill sections via {@link PromptId.HubDocSummary} and structured output; returns original markdown on failure.
	 */
	async fillHubDocWithLLMSummary(markdown: string, candidate: HubCandidate): Promise<string> {
		try {
			const ctx = AppContext.getInstance();
			if (ctx.isMockEnv) return markdown;

			const ai = ctx.settings.ai;
			if (!ai?.defaultModel?.provider?.trim() || !ai?.defaultModel?.modelId?.trim()) {
				console.warn('[fillHubDocWithLLMSummary] No defaultModel; skipping LLM fill.');
				return markdown;
			}

			const excerpts = await this.buildHubVaultExcerpts(candidate);
			const bodyPreview = hubDocMarkdownBodyForLlm(markdown).slice(0, SLICE_CAPS.hub.llmDraftBodyChars);
			const hubMetadataJson = JSON.stringify({
				label: candidate.label,
				path: candidate.path,
				sourceKind: candidate.sourceKind,
				sourceKinds: candidate.sourceKinds,
				sourceConsensusScore: candidate.sourceConsensusScore,
				rankingScore: candidate.rankingScore,
				sourceEvidence: candidate.sourceEvidence,
				role: candidate.role,
				graphScore: candidate.graphScore,
				candidateScore: candidate.candidateScore ?? null,
				pagerank: candidate.pagerank,
				semanticPagerank: candidate.semanticPagerank,
				docIncomingCnt: candidate.docIncomingCnt,
				docOutgoingCnt: candidate.docOutgoingCnt,
				childHubRoutes: candidate.childHubRoutes?.slice(0, SLICE_CAPS.hub.llmMetadataRoutes) ?? [],
				clusterMemberPaths: candidate.clusterMemberPaths?.slice(0, SLICE_CAPS.hub.llmMetadataRoutes) ?? [],
				assemblyHints: candidate.assemblyHints ?? null,
			});
			const parsed = await ctx.manager.streamObjectWithPrompt(
				PromptId.HubDocSummary,
				{
					hubMetadataJson,
					draftMarkdownBody: bodyPreview,
					vaultExcerpts: excerpts || '_No excerpts available._',
				},
				hubDocSummaryLlmSchema,
			);
			return applyHubDocLlmPayloadToMarkdown(markdown, parsed);
		} catch (e) {
			console.warn('[fillHubDocWithLLMSummary] LLM fill failed:', e);
			return markdown;
		}
	}

	private async buildHubVaultExcerpts(candidate: HubCandidate): Promise<string> {
		const app = AppContext.getApp();
		const chunks: string[] = [];
		const primary = await readVaultTextSnippet(app, candidate.path, HUB_DOC_LLM_MAX_NOTE_CHARS);
		if (primary) {
			chunks.push(`### Primary path: ${candidate.path}\n${primary}`);
		}
		if (candidate.clusterMemberPaths?.length) {
			let budget = HUB_DOC_LLM_MAX_CLUSTER_SNIPPET * 3;
			for (const mp of candidate.clusterMemberPaths.slice(0, SLICE_CAPS.hub.llmClusterMemberSnippets)) {
				if (budget <= 0) break;
				const sn = await readVaultTextSnippet(
					app,
					mp,
					Math.min(HUB_DOC_LLM_MAX_CLUSTER_SNIPPET, budget),
				);
				if (sn) {
					chunks.push(`### Member: ${mp}\n${sn}`);
					budget -= sn.length;
				}
			}
		}
		return chunks.join('\n\n---\n\n');
	}
}

function peekUserOwnedOrAutoOff(body: string): boolean {
	const parsed = parseFrontmatter<Record<string, unknown>>(body);
	if (!parsed) return false;
	const d = parsed.data;
	const userOwned = d[HUB_FRONTMATTER_KEYS.userOwned];
	if (userOwned === true || userOwned === 'true') return true;
	const autoHub = d[HUB_FRONTMATTER_KEYS.autoHub];
	if (autoHub === false || autoHub === 'false') return true;
	return false;
}
