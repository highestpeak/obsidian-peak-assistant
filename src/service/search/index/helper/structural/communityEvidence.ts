import { canonicalJson, sha256Text } from '@/core/storage/generated-output/GeneratedOutputIntegrity';
import type { ResultGraphCommunityConfig } from './ResultGraphCommunityDefaults';

export function semanticSimilarityWeight(similarity: number, multiplier: number): number {
	return Math.max(0, Math.min(1, similarity)) * Math.max(0, multiplier);
}

export function inverseDocumentFrequency(totalDocuments: number, support: number): number {
	if (totalDocuments <= 0 || support <= 0) return 0;
	return Math.log((totalDocuments + 1) / (support + 1)) + 1;
}

export function isEligibleCommunitySignal(input: {
	totalDocuments: number;
	support: number;
	minimumSupport: number;
	maximumDocuments: number;
	maximumDocumentRatio: number;
}): boolean {
	if (input.support < input.minimumSupport) return false;
	if (input.support > input.maximumDocuments) return false;
	if (input.totalDocuments <= 0) return false;
	return input.support / input.totalDocuments <= input.maximumDocumentRatio;
}

export function resolveCommunityAnalysisMode(
	totalNodeCount: number,
	config: ResultGraphCommunityConfig,
): 'exact' | 'bounded' {
	return totalNodeCount > config.bounds.exactCentralityNodeLimit ? 'bounded' : 'exact';
}

export function communityFingerprint(input: {
	memberIds: readonly string[];
	descriptorKeys: readonly string[];
	analysisVersion: number;
}): string {
	const canonical = canonicalJson({
		members: [...input.memberIds].sort(),
		descriptors: [...input.descriptorKeys].sort(),
		analysisVersion: input.analysisVersion,
	});
	return `community-${sha256Text(canonical).slice(0, 24)}`;
}
