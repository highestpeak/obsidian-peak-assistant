/**
 * T4 (2026-07-07 result graph): app-layer composition for the
 * `ResultSubgraphDeps` port declared by `service/search/graph/resultSubgraph`.
 *
 * The UI component (`ResultGraphView`) must not construct these deps itself
 * (project CLAUDE.md · "Runtime ownership"). This helper lives at the app
 * layer, closes over the sqlite store manager once, and hands back a plain
 * object shaped to the port. A React hook lives next to it because there is
 * no persistent runtime state to own — every call is a stateless read of
 * whichever repos are currently registered.
 *
 * If the sqlite tenant is not yet initialised (mock harness / boot race)
 * the returned deps degrade gracefully to empty results so `ResultGraphView`
 * can still render its "no structure" fallback banner.
 */

import { GraphEdgeType } from '@/core/types/graph';
import type { ResultSubgraphDeps } from '@/service/search/graph/resultSubgraph';
import { sqliteStoreManager } from '@/core/storage/sqlite/SqliteStoreManager';

/** Top-level folder segment ("D-26年找工作/interviews/foo.md" → "D-26年找工作"). */
function topLevelFolder(path: string): string {
    if (!path) return '';
    const parts = path.split('/');
    if (parts.length <= 1) return '';
    return parts[0] ?? '';
}

/** Basename minus extension — used as fallback title when node.label is empty. */
function fallbackTitle(path: string): string {
    if (!path) return '';
    const base = path.split('/').pop() ?? path;
    const dot = base.lastIndexOf('.');
    return dot > 0 ? base.slice(0, dot) : base;
}

export function composeResultSubgraphDeps(): ResultSubgraphDeps {
    return {
        async getNodeMetadata(docIds) {
            const out = new Map<string, { path: string; title: string; communityId: string | null; folder: string }>();
            if (!docIds.length) return out;
            if (!sqliteStoreManager.isInitialized()) return out;
            const repo = sqliteStoreManager.getMobiusNodeRepo('vault');
            // First pass: treat inputs as node_id.
            const rowMap = await repo.getByIds(docIds);
            for (const [id, node] of rowMap) {
                const path = (node as { path?: string | null }).path ?? '';
                const label = (node as { label?: string | null }).label ?? '';
                const communityId = (node as { community_id?: string | null }).community_id ?? null;
                out.set(id, {
                    path,
                    title: label || fallbackTitle(path),
                    communityId,
                    folder: topLevelFolder(path),
                });
            }
            // Second pass: any input not yet resolved likely came in as a path
            // (search results carry chunk ids in `.id` and only sometimes set
            // `.docId`). Look those up by path so the graph is not silently
            // empty when callers pass path-style keys.
            const unresolved = docIds.filter((id) => !out.has(id));
            if (unresolved.length) {
                const rows = await Promise.all(unresolved.map((p) => repo.getByPath(p).catch(() => null)));
                for (let i = 0; i < unresolved.length; i++) {
                    const inputId = unresolved[i];
                    const node = rows[i];
                    if (!node) continue;
                    const path = (node as { path?: string | null }).path ?? inputId;
                    const label = (node as { label?: string | null }).label ?? '';
                    const communityId = (node as { community_id?: string | null }).community_id ?? null;
                    out.set(inputId, {
                        path,
                        title: label || fallbackTitle(path),
                        communityId,
                        folder: topLevelFolder(path),
                    });
                }
            }
            return out;
        },

        async getHubsForMemberDoc(docId) {
            if (!sqliteStoreManager.isInitialized()) return [];
            return sqliteStoreManager.getHubConstituentRepo().getHubsForMemberDoc(docId);
        },

        async getHubAnchorMetadata(hubIds) {
            const out = new Map<string, { path: string; title: string; constituentCount: number }>();
            if (!hubIds.length) return out;
            if (!sqliteStoreManager.isInitialized()) return out;
            const nodeRepo = sqliteStoreManager.getMobiusNodeRepo('vault');
            const rowMap = await nodeRepo.getByIds(hubIds);
            const hubRepo = sqliteStoreManager.getHubConstituentRepo();
            for (const id of hubIds) {
                const node = rowMap.get(id);
                const path = (node as { path?: string | null } | undefined)?.path ?? '';
                const label = (node as { label?: string | null } | undefined)?.label ?? '';
                let count = 0;
                try { count = await hubRepo.countMembersForHub(id); } catch { count = 0; }
                out.set(id, {
                    path,
                    title: label || fallbackTitle(path),
                    constituentCount: count,
                });
            }
            return out;
        },

        async getStructuralEdgesWithin(nodeIds) {
            if (!nodeIds.length) return [];
            if (!sqliteStoreManager.isInitialized()) return [];
            const repo = sqliteStoreManager.getMobiusEdgeRepo('vault');
            const scope = new Set(nodeIds);
            const structuralTypes = [
                GraphEdgeType.References,
                GraphEdgeType.ReferencesResource,
                GraphEdgeType.SemanticRelated,
            ];
            const rows = await repo.getByFromNodesAndTypes(nodeIds, structuralTypes as unknown as string[]);
            const edges: Array<{ from: string; to: string; kind: 'reference' | 'semantic' }> = [];
            for (const r of rows) {
                if (!scope.has(r.to_node_id)) continue;
                const kind: 'reference' | 'semantic' = r.type === GraphEdgeType.SemanticRelated ? 'semantic' : 'reference';
                edges.push({ from: r.from_node_id, to: r.to_node_id, kind });
            }
            return edges;
        },

        async getHubConstituentEdges(hubIds, resultDocIds) {
            if (!hubIds.length || !resultDocIds.length) return [];
            if (!sqliteStoreManager.isInitialized()) return [];
            const hubRepo = sqliteStoreManager.getHubConstituentRepo();
            const resultSet = new Set(resultDocIds);
            const edges: Array<{ from: string; to: string }> = [];
            for (const hubId of hubIds) {
                const members = await hubRepo.getMembersForHub(hubId);
                for (const m of members) {
                    const memberId = m.member_node_id;
                    if (!memberId) continue;
                    if (!resultSet.has(memberId)) continue;
                    edges.push({ from: hubId, to: memberId });
                }
            }
            return edges;
        },
    };
}
