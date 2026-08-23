import type { GeneratedArtifactRef } from '@/core/storage/generated-output';
import type { CompletedPackage } from '@/core/types/vault-scan';
import { validateCompletedPackage } from './CompletedPackageValidator';

export interface CompletedPublishPort {
	stageBody(pkg: CompletedPackage): Promise<GeneratedArtifactRef>;
	appendPrepared(pkg: CompletedPackage, ref: GeneratedArtifactRef): Promise<void>;
	updateCurrentPointer(pkg: CompletedPackage, ref: GeneratedArtifactRef): Promise<void>;
	appendCompleted(pkg: CompletedPackage, ref: GeneratedArtifactRef): Promise<void>;
	readBack(ref: GeneratedArtifactRef): Promise<CompletedPackage>;
}

export class CompletedPublisher {
	constructor(private readonly port: CompletedPublishPort) {}

	async publish(pkg: CompletedPackage): Promise<GeneratedArtifactRef> {
		validateCompletedPackage(pkg);
		const ref = await this.port.stageBody(pkg);
		await this.port.appendPrepared(pkg, ref);
		await this.port.updateCurrentPointer(pkg, ref);
		await this.port.appendCompleted(pkg, ref);
		const persisted = await this.port.readBack(ref);
		validateCompletedPackage(persisted);
		if (persisted.checksum !== pkg.checksum || persisted.tasks.length !== pkg.tasks.length) throw new Error('Completed package read-back did not match the staged package.');
		return ref;
	}
}
