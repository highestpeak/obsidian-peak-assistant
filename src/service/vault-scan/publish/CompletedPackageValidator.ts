import { sha256Text } from '@/core/storage/generated-output/GeneratedOutputIntegrity';
import type { CompletedPackage } from '@/core/types/vault-scan';

export function completedPackageChecksum(value: Omit<CompletedPackage, 'checksum'>): string {
	return sha256Text(JSON.stringify(value));
}

export function validateCompletedPackage(value: CompletedPackage): void {
	const { checksum, ...withoutChecksum } = value;
	if (completedPackageChecksum(withoutChecksum) !== checksum) throw new Error('Completed package checksum does not match its body.');
	const workKeys = value.tasks.map((task) => task.workKey).filter((key): key is string => Boolean(key));
	if (new Set(workKeys).size !== workKeys.length) throw new Error('Completed package contains duplicate workKey values.');
	for (const task of value.tasks) {
		if (task.preparationState === 'prepared' && !task.reviewArtifactId) throw new Error(`Prepared task ${task.id} has no review artifact.`);
	}
}
