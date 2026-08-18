// Vault Review read port — pure SQL contract for the raw rows the
// digest builder consumes.
//
// This port intentionally exposes NO top-K constants, NO scoring,
// NO aggregation, NO fingerprint algorithm. It is a thin "select these
// columns" boundary so the digest builder (service layer) can run
// against an in-memory stub in tests while production wires it to a
// sqlite adapter. The structural analysis repo already exposes its
// own typed row shapes (`CommunityInfo`, `StructuralHole`) so we
// pass those through verbatim instead of re-defining them.
//
// Pagination parameters (`limit`) are SQL-level concerns the adapter
// honors — the builder is allowed to push its top-K knobs through.
// What the builder may NOT push is "rank these", "score this", or
// "merge with lint" — those stay in the builder.

import type {
	CommunityInfo,
	StructuralHole,
} from '@/core/search/structuralTypes';

/** Row shape for the fingerprint scan. */
export interface VaultFingerprintRow {
	path: string | null;
	contentHash: string | null;
	wordCount: number | null;
	mtime: number | null;
}

/** Row shape for the full digest derivation scan over `mobius_node`. */
export interface VaultNodeDigestRow {
	path: string | null;
	wordCount: number | null;
	mtime: number | null;
	tagsJson: string | null;
	pagerank: number | null;
	docIncomingCnt: number | null;
	docOutgoingCnt: number | null;
	otherIncomingCnt: number | null;
}

/** Aggregated dangling-wikilink row. */
export interface DanglingReferenceRow {
	target: string;
	referencedBy: number;
}

/** Verified indexed references whose endpoints belong to different communities. */
export interface VaultCommunityLinkRow {
	communityAId: string;
	communityBId: string;
	referenceCount: number;
}

/** Row shape returned by the cluster drill-down. */
export interface ClusterMemberRow {
	path: string;
	title: string | null;
	wordCount: number | null;
	pagerank: number | null;
	mtime: number | null;
	incomingCount: number | null;
}

/**
 * Raw read port for the Vault Review digest pipeline.
 *
 * Implementations are responsible for SQL only. They MUST NOT:
 *   - cache the fingerprint
 *   - cap or sort results by anything other than the requested SQL limit
 *   - merge lint signals
 *   - shape the final `VaultDigest`
 */
export interface VaultReviewReadPort {
	/** Returns every node row needed to compute the vault fingerprint. */
	listFingerprintRows(): Promise<VaultFingerprintRow[]>;

	/** Returns every node row needed to derive digest categories. */
	listNodeRowsForDigest(): Promise<VaultNodeDigestRow[]>;

	/** Pass-through to the Louvain community metadata. */
	listCommunities(): Promise<CommunityInfo[]>;

	/** Aggregated real references between different Louvain communities. */
	listCommunityLinks?(): Promise<VaultCommunityLinkRow[]>;

	/** Pass-through to the structural-hole metadata. */
	listTopStructuralHoles(limit: number): Promise<StructuralHole[]>;

	/** Top dangling wikilink targets by reference count. */
	listDanglingReferences(limit: number): Promise<DanglingReferenceRow[]>;

	/** Members of a single Louvain community, sorted by PageRank desc. */
	listClusterMembers(communityId: string, limit: number): Promise<ClusterMemberRow[]>;
}
