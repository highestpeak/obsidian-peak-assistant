// T11H (2026-06-26): framework-agnostic Lens graph data types.
//
// Framework-neutral data consumed by AI graph agents, persistence and the
// shared Cytoscape graph workspace. Keeping it in core prevents graph
// producers from depending on a renderer implementation.
import type { GraphEdgeDirectionality } from './graph-edge';

export type LensType = 'topology' | 'thinking-tree' | 'bridge' | 'timeline' | 'gap-analysis';

export interface LensNodeData extends Record<string, unknown> {
	label: string;
	path: string;
	/** Canonical artifact kind when the node is more than a Vault document. */
	artifactKind?:
		| 'vault-document'
		| 'web-resource'
		| 'concept'
		| 'person'
		| 'organization'
		| 'place'
		| 'event'
		| 'work'
		| 'product'
		| 'claim'
		| 'process'
		| 'dataset'
		| 'custom';
	canonicalRef?: string;
	aliases?: string[];
	evidenceQuotes?: Array<{ sourcePath: string; quote: string }>;
	role?: 'root' | 'hub' | 'bridge' | 'leaf' | 'orphan';
	group?: string;
	createdAt?: number;
	modifiedAt?: number;
	level?: number;
	parentId?: string;
	summary?: string;
	score?: number;
	clusterId?: string;
	importance?: number;
	betweenness?: number;     // [0,1] — drives node sizing in gap-analysis lens
	constraint?: number;      // Burt coefficient — drives opacity
	communityId?: string;     // Louvain community — drives color
}

export interface LensEdgeData extends Record<string, unknown> {
	kind: 'link' | 'semantic' | 'derives' | 'temporal' | 'cross-domain'
		| 'builds_on' | 'contrasts' | 'complements' | 'applies' | 'references';
	weight?: number;
	edgeLabel?: string;
	directionality?: GraphEdgeDirectionality;
	/** Stable domain relation identity retained through transient lens layout. */
	canonicalRelationId?: string;
	/** Non-visual source → predicate → target description for inspectors and AT. */
	accessibleLabel?: string;
	/** Canonical AI Graph review metadata used for uncertainty styling. */
	reviewStatus?: 'suggested' | 'accepted' | 'edited' | 'rejected';
	confidence?: number | null;
	evidenceCount?: number;
	predicate?: string;
	relationFamily?:
		| 'semantic'
		| 'taxonomic'
		| 'causal'
		| 'evidence'
		| 'temporal'
		| 'attribution'
		| 'structural'
		| 'custom';
	qualifiers?: Array<{ key: string; value: string | number | boolean }>;
	evidenceQuotes?: Array<{ sourcePath: string; quote: string }>;
	/** True when edge count > 1.2x node count — suppresses labels unless hovered */
	dense?: boolean;
}

export interface LensGraphData {
	nodes: LensNodeData[];
	edges: Array<{
		source: string;
		target: string;
		kind: LensEdgeData['kind'];
		weight?: number;
		label?: string;
		directionality?: GraphEdgeDirectionality;
		canonicalRelationId?: string;
		accessibleLabel?: string;
			reviewStatus?: LensEdgeData['reviewStatus'];
			confidence?: number | null;
			evidenceCount?: number;
			predicate?: string;
			relationFamily?: LensEdgeData['relationFamily'];
			qualifiers?: LensEdgeData['qualifiers'];
			evidenceQuotes?: LensEdgeData['evidenceQuotes'];
		}>;
	availableLenses: LensType[];
	clusters?: Array<{ id: string; name: string; description: string }>;
	bridges?: Array<{ node_path: string; connects: [string, string]; explanation: string }>;
	evolutionChains?: Array<{ chain: string[]; theme: string }>;
	insights?: {
		topology?: string;
		bridges?: string;
		timeline?: string;
	};
	gaps?: Array<{
		id: string;
		communityA: string;
		communityB: string;
		score: number;
		suggestedBridges: number;
		gapType: string;
	}>;
	communityMetrics?: Array<{
		id: string;
		label: string;
		memberCount: number;
		color: string;
	}>;
}
