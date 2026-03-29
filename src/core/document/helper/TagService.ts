import { z } from 'zod/v3';
import type { LLMUsage } from '@/core/providers/types';
import type { AIServiceManager } from '@/service/chat/service-manager';
import { PromptId } from '@/service/prompt/PromptId';
import { parseInferCreatedAtStringToMs, parseLooseTimestampToMs } from '@/core/utils/date-utils';
import {
	FUNCTIONAL_TAG_IDS,
	SEMANTIC_DIMENSION_IDS,
	SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS,
	type FunctionalTagId,
} from '@/core/schemas/agents/search-agent-schemas';

// --- Indexed document tags_json (SQLite mobius_node) ---

/** Axis for LLM context tags (time / geography / people). */
export type ContextTagAxis = 'time' | 'geo' | 'person';

const functionalSet = new Set<string>(FUNCTIONAL_TAG_IDS);

/** Closed-vocabulary functional tag plus optional per-document nuance (stored on doc→tag edge). */
export type FunctionalTagEntry = {
	id: FunctionalTagId;
	/** Human-readable nuance for this note (e.g. disambiguation). */
	label?: string;
};

/** Open-vocabulary topic tag: stable id for graph/search plus optional per-note label (same pattern as {@link FunctionalTagEntry}). */
export type TopicTagEntry = {
	/** Canonical topic phrase or slug for indexing and graph nodes. */
	id: string;
	/** Optional per-note nuance (how this note uses the topic). */
	label?: string;
};

/** Serialized shape stored in `mobius_node.tags_json` for indexed documents. */
export type IndexedTagsBlob = {
	/** Topic ids for search/graph (derived from {@link topicTagEntries} when present). */
	topicTags: string[];
	/** Rich topic entries when labels exist; omitted in legacy blobs. */
	topicTagEntries?: TopicTagEntry[];
	functionalTagEntries: FunctionalTagEntry[];
	/**
	 * Legacy union: user keywords + TextRank terms (same as {@link DocumentMetadata.keywordTags}).
	 * Prefer {@link userKeywordTags} + {@link textrankKeywordTerms} when present.
	 */
	keywordTags: string[];
	/** User #tags / frontmatter only; used for Mobius `KeywordTag` edges when set. */
	userKeywordTags?: string[];
	/** Unsupervised TextRank terms only; not written as graph keyword nodes. */
	textrankKeywordTerms?: string[];
	/** LLM-assigned; prefix `Time` + CamelCase rest, e.g. TimeYear2025. */
	timeTags: string[];
	/** LLM-assigned; prefix `Geo`, e.g. GeoCountryChina. */
	geoTags: string[];
	/** LLM-assigned; prefix `Person`, e.g. PersonAlice. */
	personTags: string[];
};

const EMPTY_TAGS_BLOB: IndexedTagsBlob = {
	topicTags: [],
	functionalTagEntries: [],
	keywordTags: [],
	timeTags: [],
	geoTags: [],
	personTags: [],
};

const CONTEXT_LABEL_PATTERN: Record<ContextTagAxis, RegExp> = {
	time: /^Time[A-Z][a-zA-Z0-9_]*$/,
	geo: /^Geo[A-Z][a-zA-Z0-9_]*$/,
	person: /^Person[A-Z][a-zA-Z0-9_]*$/,
};

const MAX_CONTEXT_TAGS_PER_AXIS = 8;
const MAX_FUNCTIONAL_LABEL_LEN = 240;
const MAX_TOPIC_ID_LEN = 120;
const MAX_TOPIC_LABEL_LEN = 240;

/**
 * Keep only well-formed LLM context labels for the given axis (dedupe, cap).
 */
export function sanitizeContextTagsForAxis(axis: ContextTagAxis, labels: string[]): string[] {
	const re = CONTEXT_LABEL_PATTERN[axis];
	const out: string[] = [];
	const seen = new Set<string>();
	for (const raw of labels) {
		const s = String(raw).trim();
		if (!s || !re.test(s)) continue;
		if (seen.has(s)) continue;
		seen.add(s);
		out.push(s);
		if (out.length >= MAX_CONTEXT_TAGS_PER_AXIS) break;
	}
	return out;
}

/**
 * Mobius doc→keyword edges: user keywords only. If {@link DocumentMetadata.userKeywordTags} is absent (legacy rows), falls back to full {@link DocumentMetadata.keywordTags}.
 */
export function graphKeywordTagsForMobius(meta: {
	userKeywordTags?: string[];
	keywordTags?: string[];
}): string[] {
	if (meta.userKeywordTags !== undefined) return meta.userKeywordTags;
	return meta.keywordTags ?? [];
}

/**
 * When LLM tags are skipped on a fast index, keep prior LLM-derived axes from DB and refresh deterministic keyword/TextRank fields from the current document metadata.
 */
export function mergeIndexedTagsBlobForFastIndex(
	existingTagsJson: string | null | undefined,
	meta: {
		keywordTags?: string[];
		userKeywordTags?: string[];
		textrankKeywordTerms?: string[];
	},
): IndexedTagsBlob {
	const existing = decodeIndexedTagsBlob(existingTagsJson ?? null);
	return {
		topicTags: [...existing.topicTags],
		...(existing.topicTagEntries?.length ? { topicTagEntries: existing.topicTagEntries } : {}),
		functionalTagEntries: [...existing.functionalTagEntries],
		keywordTags: meta.keywordTags ?? [],
		...(meta.userKeywordTags !== undefined ? { userKeywordTags: meta.userKeywordTags } : {}),
		...(meta.textrankKeywordTerms?.length
			? { textrankKeywordTerms: meta.textrankKeywordTerms }
			: {}),
		timeTags: [...existing.timeTags],
		geoTags: [...existing.geoTags],
		personTags: [...existing.personTags],
	};
}

/** Encode tag blob for SQLite `tags_json`. */
export function encodeIndexedTagsBlob(blob: IndexedTagsBlob): string | null {
	const {
		topicTags,
		topicTagEntries,
		functionalTagEntries,
		keywordTags,
		userKeywordTags,
		textrankKeywordTerms,
		timeTags,
		geoTags,
		personTags,
	} = blob;
	if (
		!topicTags.length &&
		!(topicTagEntries?.length ?? 0) &&
		!functionalTagEntries.length &&
		!keywordTags.length &&
		!(userKeywordTags?.length ?? 0) &&
		!(textrankKeywordTerms?.length ?? 0) &&
		!timeTags.length &&
		!geoTags.length &&
		!personTags.length
	) {
		return null;
	}
	const payload: Record<string, unknown> = {
		topicTags,
		functionalTagEntries,
		keywordTags,
		timeTags,
		geoTags,
		personTags,
	};
	if (topicTagEntries?.length) {
		payload.topicTagEntries = topicTagEntries;
	}
	if (userKeywordTags?.length) {
		payload.userKeywordTags = userKeywordTags;
	}
	if (textrankKeywordTerms?.length) {
		payload.textrankKeywordTerms = textrankKeywordTerms;
	}
	return JSON.stringify(payload);
}

function asStrArr(v: unknown): string[] {
	return Array.isArray(v) ? v.map(String).filter(Boolean) : [];
}

function parseTopicTagEntriesFromUnknown(
	topicTagEntriesRaw: unknown,
	legacyTopicTags: unknown,
): TopicTagEntry[] {
	const fromObjects: TopicTagEntry[] = [];
	if (Array.isArray(topicTagEntriesRaw)) {
		const seen = new Set<string>();
		for (const item of topicTagEntriesRaw) {
			if (!item || typeof item !== 'object') continue;
			const o = item as Record<string, unknown>;
			const id = String(o.id ?? '').trim().slice(0, MAX_TOPIC_ID_LEN);
			if (!id || seen.has(id)) continue;
			seen.add(id);
			const labelRaw = o.label;
			const label =
				typeof labelRaw === 'string' ? labelRaw.trim().slice(0, MAX_TOPIC_LABEL_LEN) : '';
			fromObjects.push(label ? { id, label } : { id });
		}
		if (fromObjects.length) return fromObjects;
	}
	const legacy = asStrArr(legacyTopicTags).map((s) => s.trim().slice(0, MAX_TOPIC_ID_LEN)).filter(Boolean);
	return legacy.map((id) => ({ id }));
}

function parseFunctionalTagEntriesFromUnknown(v: unknown): FunctionalTagEntry[] {
	if (!Array.isArray(v)) return [];
	const out: FunctionalTagEntry[] = [];
	const seen = new Set<string>();
	for (const item of v) {
		if (!item || typeof item !== 'object') continue;
		const o = item as Record<string, unknown>;
		const id = String(o.id ?? '').trim();
		if (!id || !functionalSet.has(id) || seen.has(id)) continue;
		seen.add(id);
		const labelRaw = o.label;
		const label =
			typeof labelRaw === 'string' ? labelRaw.trim().slice(0, MAX_FUNCTIONAL_LABEL_LEN) : '';
		out.push(label ? { id: id as FunctionalTagId, label } : { id: id as FunctionalTagId });
	}
	return out;
}

/**
 * Decode `tags_json`; supports legacy JSON array (treated as topicTags only) and legacy `functionalTags: string[]`.
 */
export function decodeIndexedTagsBlob(raw: string | null | undefined): IndexedTagsBlob {
	if (raw == null || raw === '') {
		return { ...EMPTY_TAGS_BLOB };
	}
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (Array.isArray(parsed)) {
			return {
				topicTags: parsed.map(String).filter(Boolean),
				functionalTagEntries: [],
				keywordTags: [],
				timeTags: [],
				geoTags: [],
				personTags: [],
			};
		}
		if (parsed && typeof parsed === 'object') {
			const o = parsed as Record<string, unknown>;
			const fromObjects = parseFunctionalTagEntriesFromUnknown(o.functionalTagEntries);
			const legacyIds = asStrArr(o.functionalTags).filter((id) => functionalSet.has(id));
			const functionalTagEntries =
				fromObjects.length > 0
					? fromObjects
					: legacyIds.map((id) => ({ id: id as FunctionalTagId }));
			const topicTagEntries = parseTopicTagEntriesFromUnknown(o.topicTagEntries, o.topicTags);
			const topicIds = topicTagEntries.map((e) => e.id);
			const keywordTags = asStrArr(o.keywordTags);
			const userKw = o.userKeywordTags !== undefined ? asStrArr(o.userKeywordTags) : undefined;
			const trKw = o.textrankKeywordTerms !== undefined ? asStrArr(o.textrankKeywordTerms) : undefined;
			return {
				topicTags: topicIds.length ? topicIds : asStrArr(o.topicTags),
				topicTagEntries: topicTagEntries.length ? topicTagEntries : undefined,
				functionalTagEntries,
				keywordTags,
				...(userKw !== undefined ? { userKeywordTags: userKw } : {}),
				...(trKw !== undefined ? { textrankKeywordTerms: trKw } : {}),
				timeTags: asStrArr(o.timeTags),
				geoTags: asStrArr(o.geoTags),
				personTags: asStrArr(o.personTags),
			};
		}
	} catch {
		/* ignore */
	}
	return { ...EMPTY_TAGS_BLOB };
}

// --- Functional tag validation (canonical ids: search-agent-schemas) ---

/** Dedupe by id (first wins), trim lengths; drops empty ids. */
export function filterValidTopicTagEntries(entries: TopicTagEntry[]): TopicTagEntry[] {
	const seen = new Set<string>();
	const out: TopicTagEntry[] = [];
	for (const e of entries) {
		const id = typeof e?.id === 'string' ? e.id.trim().slice(0, MAX_TOPIC_ID_LEN) : '';
		if (!id || seen.has(id)) continue;
		seen.add(id);
		const label = typeof e.label === 'string' ? e.label.trim().slice(0, MAX_TOPIC_LABEL_LEN) : '';
		out.push(label ? { id, label } : { id });
		if (out.length >= 12) break;
	}
	return out;
}

/** Keep only entries whose `id` is in {@link FUNCTIONAL_TAG_IDS}; dedupe by id (first wins). */
export function filterValidFunctionalTagEntries(entries: FunctionalTagEntry[]): FunctionalTagEntry[] {
	const seen = new Set<FunctionalTagId>();
	const out: FunctionalTagEntry[] = [];
	for (const e of entries) {
		if (!e?.id || !functionalSet.has(e.id)) continue;
		const id = e.id as FunctionalTagId;
		if (seen.has(id)) continue;
		seen.add(id);
		const label = typeof e.label === 'string' ? e.label.trim().slice(0, MAX_FUNCTIONAL_LABEL_LEN) : '';
		out.push(label ? { id, label } : { id });
	}
	return out;
}

// --- LLM topic/functional/context extraction (TextRank keywords come from MarkdownDocumentLoader) ---

/**
 * LLM may return either canonical {@link FUNCTIONAL_TAG_IDS} or semantic dimension ids (see
 * {@link SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS}). `generateObject` uses a loose id string, then we map here.
 */
const llmFunctionalTagEntryLooseSchema = z.object({
	id: z.string().min(1).max(80),
	label: z.string().max(MAX_FUNCTIONAL_LABEL_LEN).optional(),
});

/** Map one LLM `id` to a canonical functional tag (direct match or first tag for a semantic dimension). */
export function mapLlmFunctionalIdToCanonical(raw: string): FunctionalTagId | null {
	const id = String(raw).trim();
	if (!id) return null;
	if (functionalSet.has(id)) return id as FunctionalTagId;
	if (Object.prototype.hasOwnProperty.call(SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS, id)) {
		const mapped =
			SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS[id as keyof typeof SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS];
		return (mapped?.[0] as FunctionalTagId | undefined) ?? null;
	}
	return null;
}

const topicTagEntrySchema = z.object({
	id: z.string().max(MAX_TOPIC_ID_LEN),
	label: z.string().max(MAX_TOPIC_LABEL_LEN).optional(),
});

/** Vault-oriented document role (merged into tag JSON; optional). */
const DOC_TYPE_LLM = [
	'principle',
	'profile',
	'index',
	'daily',
	'project',
	'note',
	'other',
] as const;

const docTagResponseSchema = z.object({
	topicTagEntries: z.array(topicTagEntrySchema).max(12).default([]),
	/** @deprecated LLM may still return plain strings; mapped to `{ id }` when topicTagEntries is empty. */
	topicTags: z.array(z.string()).max(12).optional(),
	/** At least one entry; ids normalized via {@link mapLlmFunctionalIdToCanonical}. */
	functionalTagEntries: z.array(llmFunctionalTagEntryLooseSchema).min(1).max(5),
	timeTags: z.array(z.string()).max(12).default([]),
	geoTags: z.array(z.string()).max(12).default([]),
	personTags: z.array(z.string()).max(12).default([]),
	/**
	 * Best estimate of first authorship / event start. Prefer compact text: `yyyyMMdd` or `yyyyMMdd HHmmss`
	 * (24h). Omit or null if unknown.
	 */
	inferCreatedAt: z.string().max(48).optional().nullable(),
	/**
	 * Optional vault role hints; merged into functional tag labels in code (not separate result fields).
	 */
	docType: z.enum(DOC_TYPE_LLM).optional(),
	docTypeConfidence: z.number().min(0).max(1).optional(),
	docTypeReasoning: z.string().max(500).optional(),
});

/** Folds optional LLM `docType*` into one functional entry's label (same call as tags). */
function mergeDocVaultRoleIntoFunctionalEntries(
	entries: FunctionalTagEntry[],
	docType: (typeof DOC_TYPE_LLM)[number] | undefined,
	docTypeConfidence: number | undefined,
	docTypeReasoning: string | undefined,
): FunctionalTagEntry[] {
	if (!docType || entries.length === 0) return entries;

	const parts: string[] = [`vaultRole:${docType}`];
	if (docTypeConfidence !== undefined && Number.isFinite(docTypeConfidence)) {
		parts.push(`conf:${Math.round(Number(docTypeConfidence) * 100) / 100}`);
	}
	const reason = String(docTypeReasoning ?? '').trim().slice(0, 200);
	if (reason) parts.push(reason);
	const annotation = parts.join(' · ');

	/** Vault docType nuance attaches under semantic dimension `essence_definition` (same functional ids as slot routing). */
	const essenceIds = SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS.essence_definition;
	let i = -1;
	for (const fid of essenceIds) {
		const idx = entries.findIndex((e) => e.id === fid);
		if (idx >= 0) {
			i = idx;
			break;
		}
	}
	if (i < 0) i = 0;
	const next = entries.map((e, idx) => ({ ...e, ...(idx === i ? mergeLabel(e.label, annotation) : {}) }));
	return filterValidFunctionalTagEntries(next);
}

function mergeLabel(existing: string | undefined, annotation: string): { label?: string } {
	const prev = typeof existing === 'string' ? existing.trim() : '';
	const combined = prev ? `${prev} | ${annotation}` : annotation;
	const trimmed = combined.slice(0, MAX_FUNCTIONAL_LABEL_LEN);
	return trimmed ? { label: trimmed } : {};
}

/** LLM output for doc tagging (topic + functional + context axes). */
export type DocLlmTagResult = {
	topicTagEntries: TopicTagEntry[];
	/** Topic ids only (same order as entries); kept for search/graph helpers that expect string[]. */
	topicTags: string[];
	functionalTagEntries: FunctionalTagEntry[];
	timeTags: string[];
	geoTags: string[];
	personTags: string[];
	/** Normalized epoch ms after parsing {@link inferCreatedAt} from the model; undefined if unknown. */
	inferCreatedAtMs?: number;
	/** Runtime status for tag generation path. */
	llmTagRunStatus: 'skipped' | 'failed' | 'success';
	/** Set when an LLM call ran; used for index enrichment telemetry. */
	llmUsage?: LLMUsage;
	llmCostUsd?: number;
};

function buildDimensionFunctionalHintsTable(): string {
	const lines: string[] = [];
	for (const dim of SEMANTIC_DIMENSION_IDS) {
		const hints = SEMANTIC_DIMENSION_TO_FUNCTIONAL_TAGS[dim];
		lines.push(`- ${dim}: ${hints.join(', ')}`);
	}
	return lines.join('\n');
}

/**
 * LLM: topic + functional (closed enum) + time/geo/person context tags. Requires {@link AIServiceManager}.
 * User frontmatter tags are hints only; LLM judgment is authoritative for output fields.
 */
export async function extractTopicAndFunctionalTags(
	text: string,
	ai: AIServiceManager,
	options?: {
		title?: string;
		existingTopicTags?: string[];
		/** User #tags + frontmatter tags (comma-separated) for context; LLM still assigns final topic/functional/context. */
		existingUserTags?: string;
		/** TextRank top terms (comma-separated). */
		textrankKeywords?: string;
		/** TextRank numbered sentences. */
		textrankSentences?: string;
		provider?: string;
		modelId?: string;
	},
): Promise<DocLlmTagResult> {
	const empty: DocLlmTagResult = {
		topicTagEntries: [],
		topicTags: [],
		functionalTagEntries: [],
		timeTags: [],
		geoTags: [],
		personTags: [],
		llmTagRunStatus: 'skipped',
	};
	if (!text.trim()) {
		return empty;
	}

	const functionalHintsTable = buildDimensionFunctionalHintsTable();
	const variables = {
		content: text,
		title: options?.title ?? '',
		existingTopicTags: options?.existingTopicTags?.length
			? options.existingTopicTags.join(', ')
			: '',
		existingUserTags: options?.existingUserTags?.trim() ?? '',
		...(options?.textrankKeywords?.trim() ? { textrankKeywords: options.textrankKeywords.trim() } : {}),
		...(options?.textrankSentences?.trim() ? { textrankSentences: options.textrankSentences.trim() } : {}),
		functionalHintsTable,
		functionalTagList: FUNCTIONAL_TAG_IDS.join(', '),
	};

	let normalized: z.infer<typeof docTagResponseSchema>;
	let tagUsage: LLMUsage | undefined;
	let tagCostUsd: number | undefined;
	const tTag = Date.now();
	console.info('[MarkdownDocumentLoader] DocTagGenerateJson LLM start', {
		title: options?.title ?? '',
		contentChars: text.length,
	});
	try {
		const tagResult = await ai.streamObjectWithPromptWithUsage(
			PromptId.DocTagGenerateJson,
			variables,
			docTagResponseSchema,
			options?.provider && options?.modelId
				? { provider: options.provider, modelId: options.modelId }
				: undefined,
		);
		normalized = tagResult.object;
		tagUsage = tagResult.usage;
		tagCostUsd = tagResult.costUsd;
		console.info('[MarkdownDocumentLoader] DocTagGenerateJson LLM done', {
			title: options?.title ?? '',
			elapsedMs: Date.now() - tTag,
		});
	} catch (err) {
		console.warn('[MarkdownDocumentLoader] DocTagGenerateJson LLM failed or skipped', {
			title: options?.title ?? '',
			elapsedMs: Date.now() - tTag,
			error: err instanceof Error ? err.message : String(err),
		});
		return {
			...empty,
			llmTagRunStatus: 'failed',
		};
	}

	let inferCreatedAtMs: number | undefined;
	if (normalized.inferCreatedAt != null && String(normalized.inferCreatedAt).trim()) {
		const raw = String(normalized.inferCreatedAt).trim();
		inferCreatedAtMs =
			parseInferCreatedAtStringToMs(raw) ?? parseLooseTimestampToMs(raw);
	}

	const fromLlmObjects = normalized.topicTagEntries.map((e) => ({
		id: e.id,
		...(e.label ? { label: e.label } : {}),
	}));
	const legacyStrings = (normalized.topicTags ?? []).map((id) => ({ id }));
	const topicTagEntries = filterValidTopicTagEntries(
		fromLlmObjects.length > 0 ? fromLlmObjects : legacyStrings,
	);
	const topicTags = topicTagEntries.map((e) => e.id);

	const mappedFunctional: FunctionalTagEntry[] = [];
	for (const e of normalized.functionalTagEntries) {
		const canonical = mapLlmFunctionalIdToCanonical(e.id);
		if (!canonical) continue;
		const label =
			typeof e.label === 'string' ? e.label.trim().slice(0, MAX_FUNCTIONAL_LABEL_LEN) : '';
		mappedFunctional.push(label ? { id: canonical, label } : { id: canonical });
	}
	let functionalTagEntries = filterValidFunctionalTagEntries(mappedFunctional);
	if (functionalTagEntries.length === 0) {
		console.info('[MarkdownDocumentLoader] DocTagGenerateJson: no valid functional tags after filter', {
			title: options?.title ?? '',
		});
		return {
			...empty,
			topicTagEntries,
			topicTags,
			llmTagRunStatus: 'failed',
			...(tagUsage ? { llmUsage: tagUsage, llmCostUsd: tagCostUsd } : {}),
		};
	}

	functionalTagEntries = mergeDocVaultRoleIntoFunctionalEntries(
		functionalTagEntries,
		normalized.docType,
		normalized.docTypeConfidence,
		normalized.docTypeReasoning,
	);

	return {
		topicTagEntries,
		topicTags,
		functionalTagEntries,
		timeTags: sanitizeContextTagsForAxis('time', normalized.timeTags),
		geoTags: sanitizeContextTagsForAxis('geo', normalized.geoTags),
		personTags: sanitizeContextTagsForAxis('person', normalized.personTags),
		llmTagRunStatus: 'success',
		...(inferCreatedAtMs !== undefined ? { inferCreatedAtMs } : {}),
		...(tagUsage ? { llmUsage: tagUsage, llmCostUsd: tagCostUsd } : {}),
	};
}

/** @deprecated Use {@link DocLlmTagResult}. */
export type TopicFunctionalTagResult = DocLlmTagResult;
