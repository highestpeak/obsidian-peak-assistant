/**
 * Builds deterministic prep context: backbone map, hub world snapshot, folder digests, doc shortlist.
 */

import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import type { TemplateManager } from '@/core/template/TemplateManager';
import { computeHubDiscoverBudgets } from '@/service/search/index/helper/hub/hubDiscover';
import { buildBackboneMap } from '@/service/search/index/helper/backbone';
import {
	buildDocumentHubShortlist,
	buildHubWorldSnapshot,
	getExploreFolderExcludedPrefixes,
} from '@/service/agents/hub-helper/hubDiscoverySnapshot';
import {
	buildDeepFolderDigestMarkdown,
	buildFolderDigestMarkdown,
} from '@/service/agents/hub-helper/hubDiscovery.folderHub';
import type { BackboneMapResult } from '@/service/search/index/helper/backbone';
import type { DocumentHubShortlistRow, HubWorldSnapshot } from '@/service/agents/hub-helper/types';
import type { IntuitionPrepContext } from './types';

const BACKBONE_MARKDOWN_EXCERPT_MAX = 14_000;
/** Slightly tighter caps for intuition plan prompt token budget. */
const PLAN_FOLDER_DIGEST_MAX = 80;
const PLAN_DEEP_FOLDER_DIGEST_MAX = 48;
const PLAN_DOC_SHORTLIST_MAX = 80;

function buildFolderTreePagesMarkdown(world: HubWorldSnapshot): string {
	if (world.pages.length === 0) return '_(No folder tree pages available.)_';
	return world.pages
		.map((p) => `### Folder tree page ${p.pageIndex + 1}/${p.totalPages}\n\n${p.compactTreeMarkdown}`)
		.join('\n\n');
}

/**
 * Serializes top backbone edges for submit / structured prompts (JSON).
 */
function buildBackboneEdgesJson(backbone: BackboneMapResult): string {
	const edges = backbone.backboneEdges.slice(0, 24).map((e) => ({
		fromId: e.fromId,
		toId: e.toId,
		fromLabel: e.fromLabel,
		toLabel: e.toLabel,
		label: e.label,
		weight: e.weight,
		referenceCount: e.referenceCount,
	}));
	return JSON.stringify(edges);
}

/** Compact world + backbone metrics for plan prompts (Markdown lines). */
function buildVaultSummaryMarkdown(
	world: HubWorldSnapshot,
	backbone: BackboneMapResult,
	indexBudgetRaw: ReturnType<typeof computeHubDiscoverBudgets>,
): string {
	const m = world.metrics;
	const b = backbone.metrics;
	const topOut = m.topOutgoingFolders
		.slice(0, 3)
		.map((x) => `\`${x.path}\` (${x.outgoing})`)
		.join(', ');
	return [
		`- Indexed documents (world): ${m.totalIndexedDocuments}`,
		`- Folders scanned (world): ${m.totalFoldersScanned}`,
		`- Top-level branches: ${m.topLevelBranchCount}`,
		`- Orphan risk: ${m.orphanRiskHint} (hard samples: ${m.orphanHardSampleCount})`,
		`- Top outgoing folders: ${topOut || '—'}`,
		`- Backbone: folders ${b.totalFolders}, virtual nodes ${b.totalVirtualNodes}, backbone edges ${b.backboneEdgeCount}, city folders ${b.cityFolderCount}`,
		`- Indexed documents (backbone): ${b.totalIndexedDocuments}`,
		`- Index budget limitTotal: ${indexBudgetRaw.limitTotal}`,
	].join('\n');
}

/** Top backbone edges as skimmable Markdown (plan prompt). */
function buildBackboneEdgesMarkdown(backbone: BackboneMapResult): string {
	const edges = backbone.backboneEdges.slice(0, 24);
	if (edges.length === 0) return '_(No backbone edges in excerpt.)_';
	return edges
		.map((e) => {
			const w = typeof e.weight === 'number' && !Number.isNaN(e.weight) ? e.weight.toFixed(3) : String(e.weight);
			return `- ${e.fromLabel} → ${e.toLabel} · w ${w} · refs ${e.referenceCount} · ${e.label}`;
		})
		.join('\n');
}

/** SQL-ranked document candidates as one line per row. */
function buildDocumentShortlistMarkdown(rows: DocumentHubShortlistRow[], maxLines: number): string {
	if (rows.length === 0) return '_(No document shortlist; index may be empty.)_';
	return rows
		.slice(0, maxLines)
		.map(
			(r) =>
				`- \`${r.path}\` · hub ${r.hubGraphScore.toFixed(2)} · in/out ${r.docIncoming}/${r.docOutgoing} · ${r.label}`,
		)
		.join('\n');
}

function buildBaselineExcludedMarkdown(prefixes: string[]): string {
	if (prefixes.length === 0) return '_(none)_';
	return prefixes.map((p) => `- \`${p}\``).join('\n');
}

/** Host-only: desired number of entry points for this vault (do not duplicate formula in prompts). */
function computeEntryPointsTargetCount(foldersScanned: number): number {
	const r = Math.round(foldersScanned / 11);
	return Math.min(24, Math.max(4, r));
}

/** Compact scale metrics so the submit step can choose how many entry points to emit. */
function buildVaultScaleHintMarkdown(world: HubWorldSnapshot, backbone: BackboneMapResult): string {
	const m = world.metrics;
	const b = backbone.metrics;
	const f = m.totalFoldersScanned;
	const n = computeEntryPointsTargetCount(f);
	return [
		`- **Folders scanned** (snapshot) = **F**: ${f}`,
		`- **Target entry point count N** (host-computed): **${n}** — emit **exactly ${n}** distinct \`entryPoints\` objects.`,
		`- **Indexed documents** (world): ${m.totalIndexedDocuments}`,
		`- **Top-level branches**: ${m.topLevelBranchCount}`,
		`- **Backbone folder nodes** (map): ${b.totalFolders}`,
		`- **City folders** (navigation hubs): ${b.cityFolderCount}`,
	].join('\n');
}

/** Merges ranked + deep folder tables under one heading block. */
function buildFolderSignalsMarkdown(folderTable: string, deepTable: string): string {
	return [
		'### Ranked folders (sample)',
		'',
		folderTable,
		'',
		'### Deep folder candidates (depth ≥ 3)',
		'',
		deepTable,
	].join('\n');
}

/**
 * Prepares template-ready context for knowledge intuition prompts.
 */
export async function prepareIntuitionContext(options: {
	userGoal: string;
	vaultName: string;
	currentDateLabel: string;
	tm: TemplateManager;
}): Promise<IntuitionPrepContext> {
	const { userGoal, vaultName, currentDateLabel, tm } = options;

	const documentNodeCount = sqliteStoreManager.isInitialized()
		? await sqliteStoreManager.getMobiusNodeRepo().countAllDocumentStatisticsRows()
		: 0;
	const indexBudgetRaw = computeHubDiscoverBudgets(documentNodeCount);
	const { limitTotal, documentFetchLimit, folderFetchLimit } = indexBudgetRaw;

	const globalTreeMaxDepth = Math.min(10, Math.max(6, 6 + Math.floor(limitTotal / 100)));
	const maxFoldersInSnapshot = Math.min(8000, Math.max(400, Math.floor(folderFetchLimit * 28)));
	const maxNodesPerPage = Math.min(2000, Math.max(320, Math.floor(limitTotal * 7)));
	const docShortlistLimit = Math.min(500, Math.max(50, Math.floor(documentFetchLimit * 2)));

	const baselineExcludedPrefixes = getExploreFolderExcludedPrefixes();

	const world = await buildHubWorldSnapshot(
		{
			maxDepth: globalTreeMaxDepth,
			maxFolders: maxFoldersInSnapshot,
			maxNodesPerPage,
			extraExcludePathPrefixes: [],
		},
		tm,
	);

	const backbone = await buildBackboneMap({
		maxDepth: globalTreeMaxDepth,
		maxFolders: maxFoldersInSnapshot,
		maxNodesPerPage,
		topBackboneEdges: Math.min(48, Math.max(16, Math.floor(limitTotal / 8))),
		extraExcludePathPrefixes: [],
	});

	const documentShortlist = await buildDocumentHubShortlist(docShortlistLimit);

	const folderDigestMarkdown = buildFolderDigestMarkdown(world.nodes, PLAN_FOLDER_DIGEST_MAX);
	const deepFolderDigestMarkdown = buildDeepFolderDigestMarkdown(world.nodes, PLAN_DEEP_FOLDER_DIGEST_MAX);
	const folderSignalsMarkdown = buildFolderSignalsMarkdown(folderDigestMarkdown, deepFolderDigestMarkdown);

	const folderTreeMarkdown = buildFolderTreePagesMarkdown(world);

	const backboneMarkdownExcerpt =
		backbone.markdown.length <= BACKBONE_MARKDOWN_EXCERPT_MAX
			? backbone.markdown
			: `${backbone.markdown.slice(0, BACKBONE_MARKDOWN_EXCERPT_MAX)}\n\n_(truncated)_`;

	const backboneEdgesJson = buildBackboneEdgesJson(backbone);
	const backboneEdgesMarkdown = buildBackboneEdgesMarkdown(backbone);
	const vaultSummaryMarkdown = buildVaultSummaryMarkdown(world, backbone, indexBudgetRaw);
	const documentShortlistMarkdown = buildDocumentShortlistMarkdown(documentShortlist, PLAN_DOC_SHORTLIST_MAX);
	const baselineExcludedMarkdown = buildBaselineExcludedMarkdown(baselineExcludedPrefixes);
	const vaultScaleHintMarkdown = buildVaultScaleHintMarkdown(world, backbone);

	const worldMetricsForPrompt: Record<string, unknown> = {
		...world.metrics,
		indexBudgetRaw,
		backboneMetrics: backbone.metrics,
	};

	return {
		tm,
		userGoal,
		vaultName,
		currentDateLabel,
		baselineExcludedPrefixes,
		worldMetricsForPrompt,
		backbone,
		world,
		documentShortlist,
		folderSignalsMarkdown,
		vaultSummaryMarkdown,
		backboneEdgesMarkdown,
		documentShortlistMarkdown,
		baselineExcludedMarkdown,
		vaultScaleHintMarkdown,
		folderTreeMarkdown,
		backboneMarkdownExcerpt,
		backboneEdgesJson,
		indexBudgetRaw,
	};
}
