// T11Y-2b: narrow read port for Morning Briefing data.
//
// The previous SqliteAmbientBriefingAdapter mixed three concerns in
// one place: raw queries, category-specific filtering (e.g.
// "incoming >= 2 && outgoing < incoming * 0.5"), score formulas, and
// the human-readable reason strings. The port below exposes only the
// raw rows; the briefing item construction (categorization, decay
// window, score, reason text, per-category cap) lives in
// `src/service/ambient/briefing/BriefingItemBuilder.ts`.
//
// Sibling to SemanticGraphTraversalReadPort (T11Y-2a): both read from
// the mobius graph + index_state surfaces, but the briefing surface
// is intentionally narrower (briefing reads doc_statistics columns
// the serendipity traversal never touches).

/** Document-like node row needed for the "unresolved connections" category. */
export interface BriefingCandidateRow {
	readonly path: string;
	readonly label: string;
	readonly mtime: number | null;
	readonly docIncomingCnt: number | null;
	readonly docOutgoingCnt: number | null;
	readonly pagerank: number | null;
}

/** Hub document row needed for the "changed hubs" category. */
export interface BriefingHubRow {
	readonly path: string;
	readonly label: string;
	readonly updatedAt: number | null;
}

/** Document-like node row needed for the "decaying engagement" category. */
export interface BriefingDecayingRow {
	readonly path: string;
	readonly label: string;
	readonly pagerank: number;
	readonly lastOpenTs: number | null;
}

export interface AmbientBriefingReadPort {
	isReady(): boolean;

	getLastBriefingTimestamp(): Promise<number>;
	getLastSessionTimestamp(fallback: number): Promise<number>;
	recordSessionTimestamps(now: number): Promise<void>;

	/**
	 * Document-like nodes modified since `sinceTs`. Adapter applies
	 * `mtime >= sinceTs`, `path is not null`, and orders by `mtime
	 * desc`. Scoring + the "incoming >= 2 && outgoing < incoming*0.5"
	 * rule live in the builder, NOT here.
	 */
	listChangedCandidates(sinceTs: number, limit: number): Promise<BriefingCandidateRow[]>;

	/**
	 * Hub nodes (`type='hub_doc'`) updated since `sinceTs`, ordered by
	 * `updated_at desc`.
	 */
	listChangedHubs(sinceTs: number, limit: number): Promise<BriefingHubRow[]>;

	/**
	 * Document-like nodes with pagerank > 0 whose `last_open_ts` is
	 * either null or strictly less than `cutoffTs`. Ordered by
	 * pagerank desc.
	 */
	listDecayingCandidates(cutoffTs: number, limit: number): Promise<BriefingDecayingRow[]>;
}
