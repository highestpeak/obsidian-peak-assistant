import type { GeneratedOutputRegistry } from './GeneratedOutputRegistry';

export interface ProjectionRebuildScope {
	readonly projectionId: string;
	readonly partitionKey?: string;
	readonly reason: 'boot-recovery' | 'migration' | 'manual' | 'test';
}
export interface ProjectionRebuildReport {
	readonly projectionId: string;
	readonly sourceOutputIds: readonly string[];
	readonly recordsRead: number;
	readonly recordsWritten: number;
	readonly startedAt: string;
	readonly completedAt: string;
	readonly warnings: readonly string[];
}

export interface ProjectionRebuilderPort {
	readonly projectionId: string;
	readonly sourceOutputIds: readonly string[];
	rebuild(scope: ProjectionRebuildScope): Promise<ProjectionRebuildReport>;
}

export class ProjectionRebuildRegistry {
	private readonly rebuilders = new Map<string, ProjectionRebuilderPort>();

	constructor(private readonly outputs: GeneratedOutputRegistry) {}

	register(rebuilder: ProjectionRebuilderPort): void {
		const descriptor = this.outputs.require(rebuilder.projectionId);
		if (descriptor.outputClass !== 'projection') {
			throw new Error(`ProjectionRebuildRegistry: "${rebuilder.projectionId}" is not a projection output.`);
		}
		if (this.rebuilders.has(rebuilder.projectionId)) {
			throw new Error(`ProjectionRebuildRegistry: duplicate rebuilder for "${rebuilder.projectionId}".`);
		}
		for (const sourceId of rebuilder.sourceOutputIds) this.outputs.require(sourceId);
		this.rebuilders.set(rebuilder.projectionId, rebuilder);
	}

	listProjectionIds(): readonly string[] {
		return [...this.rebuilders.keys()].sort();
	}

	async rebuild(scope: ProjectionRebuildScope): Promise<ProjectionRebuildReport> {
		const rebuilder = this.rebuilders.get(scope.projectionId);
		if (!rebuilder) {
			throw new Error(`ProjectionRebuildRegistry: no rebuilder registered for "${scope.projectionId}".`);
		}
		const report = await rebuilder.rebuild(scope);
		if (report.projectionId !== scope.projectionId) {
			throw new Error(`ProjectionRebuildRegistry: rebuilder returned a report for the wrong projection.`);
		}
		return report;
	}
}
