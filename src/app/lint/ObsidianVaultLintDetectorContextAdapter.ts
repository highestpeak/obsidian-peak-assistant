// T7 Vault Lint Ports — Obsidian + sqlite detector context adapter.
//
// This is the ONE place that wires Obsidian (`app.vault`,
// `app.metadataCache`), the sqlite Mobius repos, and the semantic
// neighbor helper into Vault Lint detectors. Before T7 each detector
// resolved those itself; T7 deletes that coupling and forces every
// read through this adapter so:
//
//   - detectors become unit-testable with a tiny fake;
//   - the boundary between "service-side algorithm" and "app-side
//     environment" is enforced by source-scan;
//   - changes to Obsidian / sqlite shape are absorbed here, not
//     scattered across signals/*.ts.
//
// The adapter projects Obsidian `TFile`, `TagCache`, sqlite `GraphNode`,
// and `SemanticNeighborNode` into the narrow types declared on
// `VaultLintDetectorContextPort`. Detectors never see raw Obsidian or
// raw DB shapes.

import { TFile } from 'obsidian';
import { AppContext } from '@/app/context/AppContext';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';
import { isIndexedNoteNodeType } from '@/core/types/graph';
import { getSemanticNeighbors } from '@/service/tools/search-graph-inspector/common';
import type {
	VaultLintDetectorContextPort,
	VaultLintDetectorDocDegree,
	VaultLintDetectorFileRef,
	VaultLintDetectorGraphNode,
	VaultLintDetectorSemanticNeighbor,
	VaultLintDetectorStaleHub,
	VaultLintDetectorTagInfo,
} from '@/core/ports/VaultLintPorts';

export class ObsidianVaultLintDetectorContextAdapter
	implements VaultLintDetectorContextPort
{
	listMarkdownFiles(): VaultLintDetectorFileRef[] {
		return AppContext.getInstance()
			.app.vault.getMarkdownFiles()
			.map((file) => ({ path: file.path, basename: file.basename }));
	}

	async readMarkdownFile(path: string): Promise<string> {
		const app = AppContext.getInstance().app;
		const file = app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			// Mirror Obsidian's behavior: missing path → empty content.
			// Detector logic treats empty content identically to a real
			// empty file, which is the safest fallback.
			return '';
		}
		return app.vault.cachedRead(file);
	}

	getTags(path: string): VaultLintDetectorTagInfo {
		const app = AppContext.getInstance().app;
		const file = app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) {
			return { inlineTags: [], frontmatterTags: [] };
		}
		const cache = app.metadataCache.getFileCache(file);
		const inlineTags = (cache?.tags ?? []).map((entry) => entry.tag);
		const frontmatterRaw = cache?.frontmatter?.tags;
		const frontmatterTags = normalizeFrontmatterTags(frontmatterRaw);
		return { inlineTags, frontmatterTags };
	}

	getUnresolvedLinks(): Record<string, Record<string, number>> {
		return AppContext.getInstance().app.metadataCache.unresolvedLinks;
	}

	getResolvedLinks(): Record<string, Record<string, number>> {
		return AppContext.getInstance().app.metadataCache.resolvedLinks;
	}

	async getHardOrphans(limit: number): Promise<string[]> {
		return sqliteStoreManager.getMobiusEdgeRepo().getHardOrphans(limit);
	}

	async getNodesByIds(
		ids: readonly string[],
	): Promise<Map<string, VaultLintDetectorGraphNode>> {
		// `getByIds` accepts a mutable array; clone to keep the port
		// signature `readonly` without leaking that to the caller.
		const nodeMap = await sqliteStoreManager
			.getMobiusNodeRepo()
			.getByIds([...ids]);
		const projected = new Map<string, VaultLintDetectorGraphNode>();
		for (const [id, node] of nodeMap) {
			projected.set(id, {
				id: node.id,
				label: node.label,
				type: node.type,
				attributes: node.attributes ?? null,
			});
		}
		return projected;
	}

	isIndexedNoteNodeType(type: string): boolean {
		return isIndexedNoteNodeType(type);
	}

	async listDocDegrees(limit: number): Promise<VaultLintDetectorDocDegree[]> {
		const rows = await sqliteStoreManager
			.getMobiusNodeRepo()
			.listDocDegreesForLint(limit);
		// Enrich with mtime from Obsidian's TFile.stat so temporal
		// detectors (T-RECENT-DRIFT, T-DECAYING-BRIDGE, T-ABANDONED-*)
		// can read note age without a separate lookup.
		const app = AppContext.getInstance().app;
		return rows.map((row) => {
			let mtimeMs: number | null = null;
			if (row.filePath) {
				const file = app.vault.getAbstractFileByPath(row.filePath);
				if (file instanceof TFile) mtimeMs = file.stat.mtime;
			}
			return { ...row, mtimeMs };
		});
	}

	async getStaleHubs(limit: number): Promise<VaultLintDetectorStaleHub[]> {
		const rows = await sqliteStoreManager
			.getMobiusNodeRepo()
			.getStaleHubs(limit);
		return rows.map((r) => ({
			nodeId: r.node_id,
			hubStaleSince: r.hub_stale_since,
			pagerank: r.pagerank,
		}));
	}

	async getSemanticNeighbors(
		nodeId: string,
		limit: number,
		excludeIds: ReadonlySet<string>,
	): Promise<VaultLintDetectorSemanticNeighbor[]> {
		// `getSemanticNeighbors` expects a mutable Set; defensively
		// clone so the caller's set cannot be mutated.
		const neighbors = await getSemanticNeighbors(
			nodeId,
			limit,
			new Set(excludeIds),
		);
		return neighbors.map((n) => ({
			id: n.id,
			label: n.label,
			type: n.type,
			attributes: n.attributes ?? null,
			similarity: n.similarity,
		}));
	}
}

/**
 * Obsidian stores frontmatter `tags` as either a string, an array of
 * strings, or `undefined`. Normalize to a string array so detectors
 * (and tests) see one shape.
 */
function normalizeFrontmatterTags(raw: unknown): string[] {
	if (typeof raw === 'string') {
		return raw
			.split(',')
			.map((s) => s.trim())
			.filter((s) => s.length > 0);
	}
	if (Array.isArray(raw)) {
		return raw.filter((entry): entry is string => typeof entry === 'string');
	}
	return [];
}
