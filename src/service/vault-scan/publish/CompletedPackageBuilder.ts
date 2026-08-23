import type { ReviewPreparationPackage } from '@/core/types/review-preparation';
import type { VaultScanUsage } from '@/core/types/vault-intelligence';
import type { CompletedPackage } from '@/core/types/vault-scan';
import { completedPackageChecksum } from './CompletedPackageValidator';

export function buildCompletedPackage(input: {
	packageId: string;
	scanRunId: string;
	snapshotId: string;
	indexReceiptRefs: readonly string[];
	discoveryArtifactRefs: readonly string[];
	review: ReviewPreparationPackage;
	usage: VaultScanUsage;
	warnings: readonly string[];
	now: number;
}): CompletedPackage {
	const withoutChecksum = { schemaVersion: 1 as const, packageId: input.packageId, scanRunId: input.scanRunId, snapshotId: input.snapshotId, builtAt: input.now, indexReceiptRefs: [...input.indexReceiptRefs], discoveryArtifactRefs: [...input.discoveryArtifactRefs], reviewArtifactRefs: input.review.reviewArtifacts.map((artifact) => artifact.artifactId), tasks: [...input.review.tasks], usage: input.usage, warnings: [...input.warnings] };
	return { ...withoutChecksum, checksum: completedPackageChecksum(withoutChecksum) };
}
