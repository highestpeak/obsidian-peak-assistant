/**
 * Hub discovery, HubDoc generation, and vault lifecycle — single module with internal services.
 */

import { normalizePath, TFile } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import { getAIHubSummaryFolder, getAIManualHubFolder } from '@/app/settings/types';
import type { SearchSettings } from '@/app/settings/types';
import {
	HUB_DOC_METADATA_SECTION_TITLE,
	HUB_FRONTMATTER_KEYS,
	HUB_MATERIALIZE_CONCURRENCY,
	SLICE_CAPS,
} from '@/core/constant';
import { hubDocSummaryLlmSchema } from '@/core/schemas/hubDiscoverLlm';
import {
	applyHubDocLlmPayloadToMarkdown,
	hubDocMarkdownBodyForLlm,
} from '@/core/storage/vault/hub-docs/HubDocLlmMarkdown';
import { mapWithConcurrency } from '@/core/utils/concurrent-utils';
import { hashString } from '@/core/utils/hash-utils';
import { Stopwatch } from '@/core/utils/Stopwatch';
import { hubDocFilenameSlug } from '@/core/utils/hub-path-utils';
import { mergeYamlFrontmatter, parseFrontmatter } from '@/core/utils/markdown-utils';
import { escapeMermaidQuotedLabel } from '@/core/utils/mermaid-utils';
import { ensureFolder, readVaultTextSnippet } from '@/core/utils/vault-utils';
import { PromptId } from '@/service/prompt/PromptId';
import { defaultIndexDocumentOptions, IndexService } from '@/service/search/index/indexService';
import { HubCandidateDiscoveryService, listMarkdownPathsUnderFolder } from './hubDiscover';
import { resolveHubDocAssembly } from './localGraphAssembler';
import type {
	HubCandidate,
	HubDocArtifactParams,
	HubDocAssemblyContext,
	HubMaintenanceProgress,
} from './types';

export type { HubCandidate, HubMaintenanceProgress } from './types';

/** Result of {@link materializeHubDocFromCandidate}. */
export type MaterializeHubDocFromCandidateResult = {
	writtenPath: string | null;
	skippedUserOwned: number;
};

/**
 * Orchestrates hub folder lifecycle: discovery, markdown, vault writes, reindex.
 */
export class HubDocService {
	private readonly discovery = new HubCandidateDiscoveryService();
	private readonly markdown = new HubMarkdownService();

	constructor(private readonly getSearchSettings: () => SearchSettings) { }

	/**
	 * Run hub discovery (merged sources, greedy coverage selection, optional whole-round LLM review), then LLM fill, materialize/update, reindex (vault only).
	 * Discovery caps come from `computeHubDiscoverBudgets` in `discoverAllHubCandidates` on `HubCandidateDiscoveryService` (see `hubDiscover.ts`).
	 * Per-round metrics: `onProgress` with `phase === 'hub_discovery'` and `roundSummary` set after each greedy-selection round; a final `hub_discovery` event without `roundSummary` reports completion (`done: …`).
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
		const candidates = await this.discovery.discoverAllHubCandidates({
			onRoundComplete: (summary) => {
				options?.onProgress?.({
					phase: 'hub_discovery',
					progressTextSuffix: `${summary.selectedHubCount} hubs · ${(summary.coverageRatio * 100).toFixed(1)}% cov`,
					roundSummary: summary,
				});
			},
		});
		sw.stop();

		options?.onProgress?.({
			phase: 'hub_discovery',
			progressTextSuffix: `done: ${candidates.length} candidate(s)`,
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
				trace.start('materializeOne');
				const r = await materializeHubDocFromCandidate(c, {
					hubPath,
					hubNodeIdSet,
					searchSettings,
					indexService,
					markdown: this.markdown,
				});
				trace.stop();
				materializeCompleted++;
				options?.onProgress?.({
					phase: 'hub_materialize',
					progressTextSuffix: `${materializeCompleted}/${candidates.length}`,
				});
				return r;
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
			progressTextSuffix: `${written.length} files`,
		});

		sw.print(false);
		return { written, skippedUserOwned };
	}

}

// --- HubMarkdownService: template + LLM fill ---

/** Builds the `# Hub Metadata` JSON payload; field documentation lives on {@link HubMarkdownService.buildHubDocMarkdown}. */
function buildHubDocBodyMetadataRecord(
	candidate: HubCandidate,
	assembly: HubDocAssemblyContext | undefined,
): Record<string, unknown> {
	const meta: Record<string, unknown> = {
		hub_source_kinds: candidate.sourceKinds,
		hub_source_consensus: Number(candidate.sourceConsensusScore.toFixed(4)),
		hub_ranking_score: Number(candidate.rankingScore.toFixed(4)),
		hub_score: Number(candidate.graphScore.toFixed(4)),
	};
	const cs = candidate.candidateScore;
	if (cs) {
		meta.hub_physical_authority = Number(cs.physicalAuthorityScore.toFixed(4));
		meta.hub_organizational = Number(cs.organizationalScore.toFixed(4));
		meta.hub_semantic_centrality = Number(cs.semanticCentralityScore.toFixed(4));
		meta.hub_manual_boost = Number(cs.manualBoost.toFixed(4));
		if (typeof cs.cohesionScore === 'number' && Number.isFinite(cs.cohesionScore)) {
			meta.hub_folder_cohesion_effective = Number(cs.cohesionScore.toFixed(4));
		}
	}
	const lg = assembly?.localHubGraph;
	if (lg) {
		meta.hub_local_graph_nodes = lg.nodes.length;
		meta.hub_local_graph_edges = lg.edges.length;
		meta.hub_frontier_reason = lg.frontierSummary.reason;
		meta.hub_frontier_depth = lg.frontierSummary.stoppedAtDepth;
	}
	const routes = assembly?.childHubRoutes ?? candidate.childHubRoutes;
	if (routes?.length) {
		meta.hub_child_routes = routes.map((r) => `${r.path}::${r.nodeId}`);
	}
	const ah = candidate.assemblyHints;
	if (ah) {
		meta.hub_assembly_topology = ah.expectedTopology;
		meta.hub_assembly_stop_at_child = ah.stopAtChildHub;
		if (ah.anchorTopicTags.length) {
			meta.hub_anchor_topic_tags = ah.anchorTopicTags.slice(0, 16);
		}
		if (ah.preferredChildHubNodeIds.length) {
			meta.hub_preferred_child_hub_ids = ah.preferredChildHubNodeIds.slice(0, 16);
		}
	}
	const members = assembly?.clusterMemberPaths ?? candidate.clusterMemberPaths;
	if (members?.length) {
		meta.hub_cluster_members = members.slice(0, SLICE_CAPS.hub.hubBodyMetadataClusterMembers);
	}
	if (candidate.mergedFromStableKeys?.length) {
		meta.hub_merged_from_keys = candidate.mergedFromStableKeys;
	}
	if (candidate.mergedFromPaths?.length) {
		meta.hub_merged_from_paths = candidate.mergedFromPaths.slice(0, 48);
	}
	if (typeof candidate.mergeConfidence === 'number' && Number.isFinite(candidate.mergeConfidence)) {
		meta.hub_merge_confidence = Number(candidate.mergeConfidence.toFixed(4));
	}
	if (candidate.mergeRationale?.trim()) {
		meta.hub_merge_rationale = candidate.mergeRationale.trim().slice(0, 2000);
	}
	return meta;
}

const HUB_DOC_LLM_MAX_NOTE_CHARS = 14_000;
const HUB_DOC_LLM_MAX_CLUSTER_SNIPPET = 4_000;

/**
 * Builds HubDoc markdown skeleton and optional LLM-filled sections.
 */
export class HubMarkdownService {

	/**
	 * Materializes one HubDoc file: minimal YAML frontmatter, section skeleton, then `# Hub Metadata` JSON.
	 *
	 * **YAML (`fm`)** — identity + maintenance flags (Obsidian-friendly, used by `peekUserOwnedOrAutoOff`):
	 * - `type`: `hub_doc` for graph / index typing.
	 * - `source_kind`: primary discovery kind after merge (highest priority among `hub_source_kinds` in JSON).
	 * - `source_path`: vault path of the hub center note.
	 * - `source_node_id`: `mobius_node.node_id` for the center.
	 * - `hub_role`: semantic role label (authority, index, bridge, …); not a DB tier.
	 * - `peak_auto_hub`: false disables auto body overwrite for this file.
	 * - `peak_user_owned`: true skips maintenance overwrite entirely.
	 * - `generated_at`: epoch ms when this file was written.
	 * - `hub_title`: human-readable title (starts as candidate label; LLM may refine).
	 * - `hub_fill_status`: `pending` before LLM fill, then `ok` or `failed`.
	 *
	 * **`# Hub Metadata` JSON** (built by {@link buildHubDocBodyMetadataRecord}; types in `types.ts`):
	 * - `hub_source_kinds`: distinct discovery kinds merged into this candidate (`folder` | `document` | `cluster` | `manual`).
	 * - `hub_source_consensus`: multi-source agreement bonus 0..1 (capped); boosts ranking when several lines agree.
	 * - `hub_ranking_score`: selection score `min(1, graphScore + sourceConsensusScore)`.
	 * - `hub_score`: base graph hub score 0..1 from authority / organization / semantic blend (`hubDiscover` scoring).
	 * - `hub_physical_authority` *(if `candidateScore`)*: PageRank-heavy term + mild long-doc lift; component of `hub_score`.
	 * - `hub_organizational` *(if `candidateScore`)*: in/out link degree signal; “organizational” center in the doc graph.
	 * - `hub_semantic_centrality` *(if `candidateScore`)*: semantic PageRank term; centrality in the semantic graph.
	 * - `hub_manual_boost` *(if `candidateScore`)*: policy weight (e.g. manual hubs); small contribution to blended score.
	 * - `hub_folder_cohesion_effective` *(folder hubs)*: cohesion × size reliability; component of folder `hub_graph_score`.
	 * - `hub_local_graph_nodes` *(if local graph)*: node count in the bounded neighborhood used for assembly.
	 * - `hub_local_graph_edges` *(if local graph)*: edge count in that graph (capped during build).
	 * - `hub_frontier_reason` *(if local graph)*: why expansion stopped (e.g. `max_depth_reached`, `child_hub`, `anti_explosion_novelty`).
	 * - `hub_frontier_depth` *(if local graph)*: BFS depth where expansion stopped (`localGraphAssembler` `frontierSummary`).
	 * - `hub_child_routes` *(if any)*: child hub docs hit during expansion; strings `path::nodeId` for stable cross-ref.
	 * - `hub_assembly_topology` *(if `assemblyHints`)*: expected shape — `hierarchical` | `clustered` | `mixed`.
	 * - `hub_assembly_stop_at_child` *(if `assemblyHints`)*: when true, do not expand through peer/preferred child hubs.
	 * - `hub_anchor_topic_tags` *(if non-empty)*: canonical topic tag ids for assembly / LLM alignment (capped at 16).
	 * - `hub_preferred_child_hub_ids` *(if non-empty)*: child hub node ids as preferred frontier boundaries (capped at 16).
	 * - `hub_cluster_members` *(if any)*: member vault paths (cluster/manual scope); truncated per `SLICE_CAPS.hub.hubBodyMetadataClusterMembers`.
	 */
	buildHubDocMarkdown(params: HubDocArtifactParams): string {
		const { candidate, generatedAt, assembly } = params;
		const fm: Record<string, unknown> = {
			type: 'hub_doc',
			source_kind: candidate.sourceKind,
			source_path: candidate.path,
			source_node_id: candidate.nodeId,
			hub_role: candidate.role,
			[HUB_FRONTMATTER_KEYS.autoHub]: true,
			[HUB_FRONTMATTER_KEYS.userOwned]: false,
			[HUB_FRONTMATTER_KEYS.hubTitle]: candidate.label,
			[HUB_FRONTMATTER_KEYS.fillStatus]: 'pending',
			generated_at: generatedAt,
		};
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

		const bodyMeta = buildHubDocBodyMetadataRecord(candidate, assembly);

		const routes = assembly?.childHubRoutes ?? candidate.childHubRoutes;
		const topoLines =
			routes
				?.map(
					(r) =>
						`- Sub-hub: \`${r.path}\` — ${escapeMermaidQuotedLabel(r.label)}`,
				)
				.join('\n') ?? `- Scope: \`${candidate.path}\``;

		const members = assembly?.clusterMemberPaths ?? candidate.clusterMemberPaths;
		const memberBlock =
			((members ?? assembly?.memberPathsSample) ?? [])
				.slice(0, SLICE_CAPS.hub.markdownMemberWikiLines)
				.map((p) => `- \`${p}\``)
				.join('\n') || '_N/A_';

		const metadataJson = JSON.stringify(bodyMeta, null, 2);

		const displayTitle = String(candidate.label ?? '').trim() || 'Hub';
		return `---\n${yamlLines}\n---\n\n# ${displayTitle.replace(/#/g, '')}\n\n# Short Summary\n\n_TODO: one or two sentences for retrieval anchors._\n\n# Full Summary\n\n_TODO: 1000–1500 chars dense overview._\n\n# Topology Routes\n\n${topoLines}\n\n# Cluster / members\n\n${memberBlock}\n\n# Core Facts\n\n1. _TODO_\n\n# Tag / Topic Distribution\n\n_TODO_\n\n# Time Dimension\n\n_TODO_\n\n# Mermaid\n\n\`\`\`mermaid\nflowchart LR\n  center["${escapeMermaidQuotedLabel(candidate.label)}"]\n\`\`\`\n\n# Query Anchors\n\n_TODO: high-recall phrases._\n\n# Source scope\n\n- \`${candidate.path}\`\n\n# ${HUB_DOC_METADATA_SECTION_TITLE}\n\n\`\`\`json\n${metadataJson}\n\`\`\`\n`;
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
				{ noReasoning: false },
			);
			return applyHubDocLlmPayloadToMarkdown(markdown, parsed);
		} catch (e) {
			console.warn('[fillHubDocWithLLMSummary] LLM fill failed:', e);
			return mergeYamlFrontmatter(markdown, { [HUB_FRONTMATTER_KEYS.fillStatus]: 'failed' });
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

/**
 * Materialize one hub candidate: re-index manual hubs only, or write/update `Hub-*.md` under `hubPath` then index.
 * Same behavior as one iteration of {@link HubDocService.generateAndIndexHubDocsForMaintenance} (non-manual branch includes assembly, LLM fill, user-owned skip).
 */
export async function materializeHubDocFromCandidate(
	candidate: HubCandidate,
	options: {
		hubPath: string;
		hubNodeIdSet: Set<string>;
		searchSettings: SearchSettings;
		indexService: IndexService;
		/** Reuse service instance from {@link HubDocService} to avoid duplicate template/LLM state. */
		markdown?: HubMarkdownService;
	},
): Promise<MaterializeHubDocFromCandidateResult> {
	const app = AppContext.getApp();
	const { hubPath, hubNodeIdSet, searchSettings, indexService } = options;
	const markdown = options.markdown ?? new HubMarkdownService();

	if (candidate.sourceKind === 'manual') {
		await indexService.indexDocument(candidate.path, searchSettings, defaultIndexDocumentOptions('hub_maintenance'));
		return { writtenPath: null, skippedUserOwned: 0 };
	}

	const keyHash = hashString(candidate.stableKey, 12);
	const slug = hubDocFilenameSlug(candidate.label);
	const preferredPath = normalizePath(`${hubPath}/Hub-${slug}-${keyHash}.md`);
	const legacyPath = normalizePath(`${hubPath}/Hub-${keyHash}.md`);
	let fullPath: string;
	const existingPreferred = app.vault.getAbstractFileByPath(preferredPath);
	const existingLegacy = app.vault.getAbstractFileByPath(legacyPath);
	if (existingPreferred instanceof TFile) fullPath = preferredPath;
	else if (existingLegacy instanceof TFile) fullPath = legacyPath;
	else fullPath = preferredPath;

	const assembly = await resolveHubDocAssembly(candidate, hubNodeIdSet);
	let body = markdown.buildHubDocMarkdown({
		candidate,
		generatedAt: Date.now(),
		assembly,
	});
	body = await markdown.fillHubDocWithLLMSummary(body, candidate);

	const existing = app.vault.getAbstractFileByPath(fullPath);
	if (existing instanceof TFile) {
		const prev = await app.vault.read(existing);
		if (peekUserOwnedOrAutoOff(prev)) {
			return { writtenPath: null, skippedUserOwned: 1 };
		}
		await app.vault.modify(existing, body);
	} else {
		await app.vault.create(fullPath, body);
	}
	await indexService.indexDocument(fullPath, searchSettings, defaultIndexDocumentOptions('hub_maintenance'));
	return { writtenPath: fullPath, skippedUserOwned: 0 };
}
