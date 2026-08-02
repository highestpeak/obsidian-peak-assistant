import type { HubCurationDecision } from '@/core/schemas/agents/hubCuration';
import type { HubDraft } from '@/core/schemas/agents/hubMaterialization';
import type { GeneratedOutputPersistenceRuntime } from '@/core/storage/generated-output';
import { canonicalJson, sha256Text } from '@/core/storage/generated-output';

export const VIRTUAL_HUB_SCHEME = 'peak-hub://';

export interface HubManifestMember {
	nodeId: string;
	path: string;
	title?: string;
	role?: 'core' | 'fringe';
	provenance: 'curator-scope' | 'legacy-projection';
}

export interface HubManifest {
	hubId: string;
	label: string;
	status: 'active' | 'retired';
	communityIds: string[];
	decision: HubCurationDecision;
	members: HubManifestMember[];
	summary: {
		version: number;
		draft?: HubDraft;
		legacyMarkdown?: string;
		coverage?: number;
		iterations?: number;
	};
	materialization: {
		state: 'virtual' | 'materialized';
		path?: string;
		userOwned?: boolean;
		revision?: string;
	};
	planId: string;
	updatedAt: number;
}

export interface HubRecordEvent {
	kind: 'curated' | 'synthesized' | 'materialized' | 'retired' | 'legacy-imported';
	hubId: string;
	planId: string;
	at: number;
	detail?: Record<string, unknown>;
}

export function virtualHubPath(hubId: string): string {
	return `${VIRTUAL_HUB_SCHEME}${hubId}`;
}

export function hubIdFromVirtualPath(path: string): string | null {
	if (!path.startsWith(VIRTUAL_HUB_SCHEME)) return null;
	const hubId = path.slice(VIRTUAL_HUB_SCHEME.length).trim();
	return hubId || null;
}

export class HubRecordStore {
	constructor(private readonly runtime: GeneratedOutputPersistenceRuntime) {}

	async read(hubId: string): Promise<HubManifest | null> {
		const result = await this.runtime.snapshots.readSnapshot<HubManifest>({
			outputId: 'hub.manifest',
			recordKey: hubId,
			pathVariables: { hubId },
		});
		return result?.envelope.payload ?? null;
	}

	async write(manifest: HubManifest, event?: HubRecordEvent): Promise<void> {
		await this.runtime.snapshots.writeSnapshot<HubManifest>({
			outputId: 'hub.manifest',
			recordKey: manifest.hubId,
			pathVariables: { hubId: manifest.hubId },
			payload: manifest,
		});
		if (event) await this.appendEvent(event);
	}

	async appendEvent(event: HubRecordEvent): Promise<boolean> {
		return this.runtime.events.appendEvent({
			outputId: 'hub.events',
			streamKey: event.hubId,
			pathVariables: { hubId: event.hubId },
			eventId: `${event.kind}:${event.at}:${sha256Text(canonicalJson(event))}`,
			payload: event,
		});
	}

	async listHubIds(): Promise<string[]> {
		const sample = this.runtime.resolvePath('hub.manifest', { hubId: '__sample__' });
		const root = sample.slice(0, sample.indexOf('/__sample__/'));
		const files = await this.runtime.snapshots.listSnapshotFilesRecursive(root);
		return files
			.filter((path) => path.endsWith('/manifest.json'))
			.map((path) => {
				const segments = path.split('/');
				return segments[segments.length - 2] ?? '';
			})
			.filter(Boolean)
			.sort();
	}

	async findByPath(path: string): Promise<HubManifest | null> {
		for (const hubId of await this.listHubIds()) {
			const manifest = await this.read(hubId);
			if (!manifest) continue;
			if (manifest.materialization.path === path || manifest.decision.hubPath === path) return manifest;
		}
		return null;
	}
}
