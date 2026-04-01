/**
 * Backbone map: folder tree + virtual clusters + cross-folder link backbone (deterministic).
 */

/** One real vault folder row in the map. */
export type BackboneFolderNode = {
	id: string;
	path: string;
	displayName: string;
	depth: number;
	childFolderCount: number;
	subtreeMaxDepth: number;
	subtreeAvgDepth: number;
	docCount: number;
	directDocCount: number;
	/** Keyword tags from direct child files only (not subtree). */
	topKeywords: string[];
	/** Topic tags from direct child files only (not subtree). */
	topTopics: string[];
	/** Weighted topic/keyword line from direct files only. */
	topTopicsWeighted: string;
	/** Topic concentration (Herfindahl) on direct files' topic tags only. */
	topicPurity: number;
	docOutgoing: number;
	docIncoming: number;
	/** Basename tokens from direct child files only. */
	fileNameTokenSample: string[];
	/** Tokens from immediate child folder names (navigation / structure signal). */
	subfolderNameTokenSample: string[];
	pageRankMass: number;
	semanticPageRankMass: number;
	cityScore: number;
	isCity: boolean;
	/** Short English blurb from stats only (no LLM). */
	description: string;
};

/** Virtual sub-cluster under a messy folder (prefix / topic / loose). */
export type BackboneVirtualNode = {
	id: string;
	parentFolderPath: string;
	displayName: string;
	kind: 'prefix' | 'topic' | 'loose';
	memberDocPaths: string[];
	memberCount: number;
	/** Direct files in parent folder (denominator for memberCount/total). */
	parentDirectDocCount: number;
	topKeywords: string[];
	topTopics: string[];
	topTopicsWeighted: string;
	topicPurity: number;
	/** Sum of members' `doc_outgoing_cnt` (wiki-style doc links; comparable scale to folder `docOutgoing`). */
	docOutgoing: number;
	pageRankMass: number;
	description: string;
};

/** Aggregated cross-supernode edge (highway). */
export type BackboneEdge = {
	id: string;
	fromId: string;
	toId: string;
	fromLabel: string;
	toLabel: string;
	weight: number;
	referenceCount: number;
	semanticWeightSum: number;
	bridgePageRankMass: number;
	label: string;
};

export type BackboneMetrics = {
	totalFolders: number;
	totalVirtualNodes: number;
	totalIndexedDocuments: number;
	backboneEdgeCount: number;
	cityFolderCount: number;
};

/** One paginated markdown slice (folder tree body only; backbone may repeat on last page). */
export type BackbonePage = {
	pageIndex: number;
	totalPages: number;
	markdown: string;
};

export type BuildBackboneMapOptions = {
	/** Max folder depth from vault root children. Default 10. */
	maxDepth?: number;
	/** Max folders scanned. Default 8000. */
	maxFolders?: number;
	/** Max folder lines per page. Default 120. */
	maxNodesPerPage?: number;
	/** Top backbone edges to keep. Default 32. */
	topBackboneEdges?: number;
	/** City folders: top fraction by pageRankMass. Default 0.05. */
	cityPercentile?: number;
	/** Enable virtual clusters under messy folders. Default true. */
	enableVirtualFolders?: boolean;
	/** Extra path prefixes excluded (same rules as hub snapshot). */
	extraExcludePathPrefixes?: string[];
};

export type BackboneMapResult = {
	folderNodes: BackboneFolderNode[];
	virtualNodes: BackboneVirtualNode[];
	backboneEdges: BackboneEdge[];
	metrics: BackboneMetrics;
	markdown: string;
	pages: BackbonePage[];
	/** Tags omitted from per-folder columns; listed in markdown under "Global status…". */
	noiseTagLegend: string[];
	/** Small payload for DevTools (paths, samples). */
	debug: {
		folderIdByPath: Record<string, string>;
		docCount: number;
		/** Directed cross-supernode pairs before top-K cut. */
		pairCountBeforeTopK?: number;
		edgeWeightSamples: Array<{
			fromId: string;
			toId: string;
			weight: number;
			referenceCount: number;
			semanticWeightSum: number;
		}>;
	};
};
