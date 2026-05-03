# S4 Structural Hole / Hub Detection — Implementation Plan

> Date: 2026-05-01
> Spec: `specs/2026-05-01-structural-hole-design.md`
> Status: In Progress

## Overview

Implement Brandes betweenness centrality + Burt constraint + Louvain community detection + gap analysis, then surface via inspector tool + MCP + MultiLensGraph UI.

## Tasks

### Phase 1: Core Algorithms + Data Layer

#### T1. DDL — Add 3 New Tables
- **File**: `src/core/storage/sqlite/ddl.ts` — insert after line 623 (end of existing tables)
- Add `structural_metrics`, `communities`, `structural_holes` tables (per spec §6.1)
- Add 3 indexes: `idx_structural_metrics_community`, `idx_structural_metrics_betweenness`, `idx_structural_holes_score`

#### T2. Repo — Create `StructuralMetricsRepo`
- **New file**: `src/core/storage/sqlite/repositories/StructuralMetricsRepo.ts`
- Pattern: follow `MobiusNodeRepo` — accept `Kysely<DbSchema>` in constructor
- Methods:
  - `upsertBatch(metrics: { nodeId, betweenness, constraint, communityId }[])`
  - `getByNodeIds(nodeIds: string[])`
  - `getTopByBetweenness(limit: number)`
  - `getByCommunity(communityId: number)`
  - `upsertCommunities(communities: { communityId, label, memberCount, avgBetweenness }[])`
  - `getCommunities()`
  - `upsertStructuralHoles(holes: GapPair[])`
  - `getStructuralHoles(minScore?: number)`
  - `clearAll()` — for full rebuild

#### T3. SqliteStoreManager — Wire Repo
- **File**: `src/core/storage/sqlite/SqliteStoreManager.ts`
- Add `private structuralMetricsRepo: StructuralMetricsRepo | null` field (near line 191)
- Instantiate in `init()` using `searchKdb` (vault tenant only — structural analysis is vault-level)
- Add getter `getStructuralMetricsRepo(): StructuralMetricsRepo` (near line 340)

#### T4. Brandes Betweenness + Burt Constraint
- **New file**: `src/service/search/index/helper/backbone/structuralMetrics.ts`
- Pattern: follow `documentPageRank.ts` — pure math, no repo calls, streaming callbacks for edge data
- Exports:
  - `computeBrandesBetweenness(nodeIds, scanEdges, options?)` → `Map<nodeId, number>`
  - `computeBurtConstraint(nodeIds, scanEdges)` → `Map<nodeId, number>`
- Options: `{ approximate?: boolean, kSources?: number }` for k-source sampling when V > 20K
- Input: `scanEdges: (visit: (from, to, weight) => void) => Promise<void>` — same pattern as `computeVaultPageRankStreaming`

#### T5. Community Detection (Louvain)
- **New file**: `src/service/search/index/helper/backbone/communityDetection.ts`
- Start with Louvain (simpler than Leiden, good enough for v1)
- Export: `detectCommunities(nodeIds, scanEdges, options?)` → `Map<nodeId, communityId>`
- Options: `{ resolution?: number }` (default 1.0)
- Also export `computeModularity(nodeIds, communityMap, scanEdges)` → `number`

#### T6. Gap Detection
- **New file**: `src/service/search/index/helper/backbone/gapDetection.ts`
- Export: `detectStructuralHoles(communities, edges, getEmbedding)` → `GapPair[]`
- `GapPair`: `{ communityA, communityB, gapScore, semanticSim, interDensity, bridgeCandidates: string[] }`
- Needs: community membership map + edge list + embedding vectors for centroid computation
- Uses: cosine similarity (inline, same as `find-path.ts:624`)

#### T7. Types
- **New file**: `src/service/search/index/helper/backbone/structuralTypes.ts`
- Shared types: `StructuralMetric`, `CommunityData`, `GapPair`, `StructuralAnalysisResult`

#### T8. Wire into IndexService
- **File**: `src/service/search/index/indexService.ts`
- Add step 6 in `runMobiusGlobalMaintenance` after line 1401 (after `rebuildFolderHubStatsForVaultInternal`):
  - `computeAndPersistStructuralMetricsInternal(tenant)` — new private method
  - Calls: Brandes → Louvain → gap detection → persist via `StructuralMetricsRepo`
  - Only runs for vault tenant

### Phase 2: Inspector Tool + MCP

#### T9. Input Schema
- **File**: `src/core/schemas/tools/searchGraphInspector.ts`
- Add `findStructuralHolesInputSchema` — `z.object({ min_gap_score?, limit?, include_bridges? })`

#### T10. Tool Implementation
- **New file**: `src/service/tools/search-graph-inspector/find-structural-holes.ts`
- Export: `findStructuralHoles(params, templateManager?)` → formatted output
- Reads from `StructuralMetricsRepo.getStructuralHoles()` + `.getCommunities()` + `.getTopByBetweenness()`
- Format: `buildResponse(response_format, ToolTemplateId.StructuralHoles, data, { templateManager })`

#### T11. Template
- **New file**: `templates/tools/structural-holes.hbs`
- Add `ToolTemplateId.StructuralHoles` to `src/core/template/TemplateRegistry.ts:11`
- Add metadata row at line 296 region

#### T12. Tool Factory + Agent Wiring
- **File**: `src/service/tools/search-graph-inspector.ts` — add `findStructuralHolesTool()` factory (near line 115)
- Wire into `DocSimpleAgent.ts` and `FollowupChatAgent.ts` tool maps

#### T13. MCP Tools
- **File**: `src/service/agents/vault-sdk/vaultMcpServer.ts`
- Add 3 tools: `vault_get_clusters`, `vault_get_bridges`, `vault_find_gaps`
- Pattern: same as `vault_list_folders` (line 331)

### Phase 3: Visualization UI

#### T14. Gap Analysis Lens Data Extension
- **File**: `src/ui/component/mine/multi-lens-graph/types.ts`
- Extend `LensGraphData` with `structuralHoles?: GapPairUI[]`, `communityMetrics?: CommunityMetricUI[]`
- Add `LensType = 'gap-analysis'` to the type union

#### T15. Gap Analysis Layout
- **New file**: `src/ui/component/mine/multi-lens-graph/layouts/gap-analysis-layout.ts`
- Community-force layout: group nodes by community, attract within community, repel between
- Convex hull computation for community boundaries
- Gap arc positions between community centroids

#### T16. MultiLensGraph Lens Config
- **File**: `src/ui/component/mine/multi-lens-graph/MultiLensGraph.tsx`
- Add `gap-analysis` to `LENS_CONFIG` array with `Layers` icon
- Add branch in `useLensLayout` for `lens === 'gap-analysis'`

#### T17. Gap Analysis Info Panels
- **New file**: `src/ui/component/mine/multi-lens-graph/panels/GapAnalysisInfoPanel.tsx`
- Structural Holes list + Key Bridges list + Community Summary
- Action buttons: "Open note", "Show local graph"

## Execution Order

Phase 1 (T1→T7→T4→T5→T6→T2→T3→T8) — algorithms first, data layer, then wiring
Phase 2 (T9→T10→T11→T12→T13) — surface data via tools
Phase 3 (T14→T15→T16→T17) — UI

## Dependencies

- No external dependencies needed (pure algorithms)
- Reads from existing `MobiusEdgeRepo` + `EmbeddingRepo`
- Writes to 3 new tables via `StructuralMetricsRepo`
