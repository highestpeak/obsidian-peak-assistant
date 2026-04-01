/**
 * Topic purity and container penalty for folder hub discovery (tag/keyword statistics only).
 */

import {
	FOLDER_HUB_CONTAINER_PENALTY_MAX,
	FOLDER_HUB_CONTAINER_PENALTY_RAW_REF_MAX,
	FOLDER_HUB_FOLDER_RANK_PURITY_WEIGHT,
	FOLDER_HUB_STRONG_CHILD_TOPIC_PURITY_MIN,
	FOLDER_HUB_TOPIC_PURITY_DOMINANT_WEIGHT,
	FOLDER_HUB_TOPIC_PURITY_HHI_WEIGHT,
	FOLDER_HUB_TOPIC_PURITY_LOW_RANK_MULTIPLIER,
	FOLDER_HUB_TOPIC_PURITY_LOW_THRESHOLD,
} from '@/core/constant';
import { decodeIndexedTagsBlob } from '@/core/document/helper/TagService';
import type { IndexedTagsBlob } from '@/core/document/helper/TagService';

/** Per-folder enrichment used for ranking and parent/child compression. */
export type FolderHubEnrichment = {
	topicPurity: number;
	/** From {@link computeFolderTopicPurity}; for diagnostics. */
	dominantCoverage: number;
	/** From {@link computeFolderTopicPurity}; for diagnostics. */
	normalizedHhi: number;
	containerPenalty: number;
	folderRank: number;
	strongChildDocShare: number;
	residualRatio: number;
	strongChildCount: number;
};

/**
 * Collects normalized tag/keyword tokens from an indexed tags blob (one row per document).
 */
export function collectTagTokensFromBlob(blob: IndexedTagsBlob): string[] {
	const s = new Set<string>();
	for (const t of blob.topicTags) {
		if (t) s.add(t.toLowerCase());
	}
	for (const e of blob.topicTagEntries ?? []) {
		if (e.id) s.add(e.id.toLowerCase());
	}
	for (const k of blob.keywordTags ?? []) {
		if (k) s.add(k.toLowerCase());
	}
	for (const k of blob.userKeywordTags ?? []) {
		if (k) s.add(k.toLowerCase());
	}
	for (const k of blob.textrankKeywordTerms ?? []) {
		if (k) s.add(k.toLowerCase());
	}
	return [...s];
}

export function collectTagTokensFromTagsJson(raw: string | null | undefined): string[] {
	return collectTagTokensFromBlob(decodeIndexedTagsBlob(raw ?? null));
}

/**
 * Aggregates per-tag document frequencies from sampled docs (each doc contributes at most once per tag).
 */
export function aggregateTagDocFrequencies(tagsJsonRows: (string | null | undefined)[]): {
	docCount: number;
	tagDocFreq: Map<string, number>;
} {
	const tagDocFreq = new Map<string, number>();
	let docCount = 0;
	for (const raw of tagsJsonRows) {
		docCount++;
		const tokens = collectTagTokensFromTagsJson(raw ?? null);
		const seen = new Set(tokens);
		for (const t of seen) {
			tagDocFreq.set(t, (tagDocFreq.get(t) ?? 0) + 1);
		}
	}
	return { docCount, tagDocFreq };
}

/**
 * Dominant coverage, HHI, normalized HHI, and topic purity in [0,1].
 */
export function computeFolderTopicPurity(tagDocFreq: Map<string, number>, docCount: number): {
	topicPurity: number;
	dominantCoverage: number;
	normalizedHhi: number;
} {
	if (docCount <= 0 || tagDocFreq.size === 0) {
		return { topicPurity: 0, dominantCoverage: 0, normalizedHhi: 0 };
	}
	let maxFt = 0;
	let totalInst = 0;
	for (const ft of tagDocFreq.values()) {
		maxFt = Math.max(maxFt, ft);
		totalInst += ft;
	}
	const dominantCoverage = Math.min(1, maxFt / docCount);
	const tf = tagDocFreq.size;
	let hhi = 0;
	if (totalInst > 0) {
		for (const f of tagDocFreq.values()) {
			const p = f / totalInst;
			hhi += p * p;
		}
	}
	let normalizedHhi = 1;
	if (tf <= 1) {
		normalizedHhi = 1;
	} else {
		const minHhi = 1 / tf;
		const denom = 1 - minHhi;
		normalizedHhi = denom > 1e-9 ? Math.max(0, Math.min(1, (hhi - minHhi) / denom)) : 1;
	}
	const topicPurity = Math.min(
		1,
		FOLDER_HUB_TOPIC_PURITY_DOMINANT_WEIGHT * dominantCoverage +
			FOLDER_HUB_TOPIC_PURITY_HHI_WEIGHT * normalizedHhi,
	);
	return { topicPurity, dominantCoverage, normalizedHhi };
}

/**
 * Container penalty from strong-child coverage, parent purity, and residual mass after removing strong children.
 */
export function computeFolderContainerPenalty(input: {
	parentTopicPurity: number;
	strongChildDocShare: number;
	residualRatio: number;
}): number {
	const { parentTopicPurity, strongChildDocShare, residualRatio } = input;
	const raw =
		0.08 * strongChildDocShare +
		0.05 * (1 - parentTopicPurity) +
		0.04 * Math.max(0, 0.5 - residualRatio);
	const scaled =
		FOLDER_HUB_CONTAINER_PENALTY_RAW_REF_MAX > 1e-9
			? raw * (FOLDER_HUB_CONTAINER_PENALTY_MAX / FOLDER_HUB_CONTAINER_PENALTY_RAW_REF_MAX)
			: raw;
	return Math.min(FOLDER_HUB_CONTAINER_PENALTY_MAX, scaled);
}

/**
 * Final folder ranking score for discovery (before broadness penalty scaling).
 */
export function computeFolderRank(hubGraphScore: number, topicPurity: number, containerPenalty: number): number {
	let rank = hubGraphScore + FOLDER_HUB_FOLDER_RANK_PURITY_WEIGHT * topicPurity - containerPenalty;
	if (topicPurity < FOLDER_HUB_TOPIC_PURITY_LOW_THRESHOLD) {
		rank *= FOLDER_HUB_TOPIC_PURITY_LOW_RANK_MULTIPLIER;
	}
	return Math.max(0, rank);
}

/** Whether a direct child counts as "strong" for container statistics. */
export function isStrongTopicChildFolder(childTopicPurity: number): boolean {
	return childTopicPurity >= FOLDER_HUB_STRONG_CHILD_TOPIC_PURITY_MIN;
}
