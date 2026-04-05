/**
 * Folder-level “intuition” for conversational search Orient: stored on `mobius_node` rows
 * where `type = folder`, using `attributes_json` plus existing columns (`summary`, `pagerank`, etc.).
 */

/** JSON keys under `mobius_node.attributes_json` for folder intuition (namespaced). */
export const MOBIUS_FOLDER_INTUITION = {
	ONE_LINER: 'intuition_one_liner',
	TYPICAL_QUESTIONS: 'intuition_typical_questions',
	NAVIGATION_HINTS: 'intuition_navigation_hints',
	TOP_TAGS: 'intuition_top_tags',
	TOP_KEYWORDS: 'intuition_top_keywords',
	BACKBONE_NEIGHBORS: 'intuition_backbone_neighbors',
	UPDATED_AT: 'intuition_updated_at',
} as const;

/** View model consumed by Orient / UI; mirrors the former `folder_intuition` table shape. */
export interface FolderIntuition {
	folderPath: string;
	oneLiner: string;
	typicalQuestions: string[];
	navigationHints: string[];
	topicPurity: number | null;
	docCount: number;
	hubRank: number | null;
	topTags: string[];
	topKeywords: string[];
	backboneNeighbors: string[];
	updatedAt: number;
}

export type MobiusFolderIntuitionQueryRow = {
	path: string | null;
	summary: string | null;
	attributes_json: string | null;
	tag_doc_count: number | null;
	folder_cohesion_score: number | null;
	pagerank: number | null;
	updated_at: number;
};

function safeStringArray(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	return v.filter((x): x is string => typeof x === 'string');
}

function safeParseAttrs(raw: string | null): Record<string, unknown> {
	if (!raw) return {};
	try {
		const o = JSON.parse(raw) as unknown;
		return o && typeof o === 'object' && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
	} catch {
		return {};
	}
}

/**
 * Maps one `mobius_node` folder row into {@link FolderIntuition}.
 * Returns null if `path` is empty.
 */
export function parseFolderIntuitionFromMobiusFolderRow(row: MobiusFolderIntuitionQueryRow): FolderIntuition | null {
	const folderPath = (row.path ?? '').trim();
	if (!folderPath) return null;

	const attrs = safeParseAttrs(row.attributes_json);
	const fromAttr = typeof attrs[MOBIUS_FOLDER_INTUITION.ONE_LINER] === 'string' ? attrs[MOBIUS_FOLDER_INTUITION.ONE_LINER] : '';
	const summary = typeof row.summary === 'string' ? row.summary : '';
	const oneLiner = String(fromAttr).trim() || summary.trim() || folderPath;

	const intuitionTs = attrs[MOBIUS_FOLDER_INTUITION.UPDATED_AT];
	const updatedAt =
		typeof intuitionTs === 'number' && Number.isFinite(intuitionTs)
			? Math.floor(intuitionTs)
			: row.updated_at;

	return {
		folderPath,
		oneLiner,
		typicalQuestions: safeStringArray(attrs[MOBIUS_FOLDER_INTUITION.TYPICAL_QUESTIONS]),
		navigationHints: safeStringArray(attrs[MOBIUS_FOLDER_INTUITION.NAVIGATION_HINTS]),
		topicPurity: row.folder_cohesion_score,
		docCount: Math.max(0, Math.floor(Number(row.tag_doc_count ?? 0))),
		hubRank: row.pagerank,
		topTags: safeStringArray(attrs[MOBIUS_FOLDER_INTUITION.TOP_TAGS]),
		topKeywords: safeStringArray(attrs[MOBIUS_FOLDER_INTUITION.TOP_KEYWORDS]),
		backboneNeighbors: safeStringArray(attrs[MOBIUS_FOLDER_INTUITION.BACKBONE_NEIGHBORS]),
		updatedAt,
	};
}

/**
 * Builds a shallow merge payload for `mergeJsonAttributesForFolderNode` from intuition fields.
 * Omit keys you do not want to change.
 */
export function folderIntuitionPatchToAttributesMerge(patch: {
	oneLiner?: string;
	typicalQuestions?: string[];
	navigationHints?: string[];
	topTags?: string[];
	topKeywords?: string[];
	backboneNeighbors?: string[];
	/** Defaults to `Date.now()` when any intuition field is set. */
	intuitionUpdatedAt?: number;
}): Record<string, unknown> {
	const now = patch.intuitionUpdatedAt ?? Date.now();
	const out: Record<string, unknown> = {};
	if (patch.oneLiner !== undefined) out[MOBIUS_FOLDER_INTUITION.ONE_LINER] = patch.oneLiner;
	if (patch.typicalQuestions !== undefined) out[MOBIUS_FOLDER_INTUITION.TYPICAL_QUESTIONS] = patch.typicalQuestions;
	if (patch.navigationHints !== undefined) out[MOBIUS_FOLDER_INTUITION.NAVIGATION_HINTS] = patch.navigationHints;
	if (patch.topTags !== undefined) out[MOBIUS_FOLDER_INTUITION.TOP_TAGS] = patch.topTags;
	if (patch.topKeywords !== undefined) out[MOBIUS_FOLDER_INTUITION.TOP_KEYWORDS] = patch.topKeywords;
	if (patch.backboneNeighbors !== undefined) out[MOBIUS_FOLDER_INTUITION.BACKBONE_NEIGHBORS] = patch.backboneNeighbors;
	if (Object.keys(out).length > 0) out[MOBIUS_FOLDER_INTUITION.UPDATED_AT] = now;
	return out;
}
