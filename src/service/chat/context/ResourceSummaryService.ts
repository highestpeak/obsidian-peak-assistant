import type { AppHandle } from '@/core/ports/AppHandle';
import type { VaultFileRef, VaultFolderRef } from '@/core/ports/VaultFileRef';
import type { ChatResourceRef, ResourceSummaryMeta, ParsedResourceSummaryFile } from '../types';
import type { ResourceKind } from '@/core/document/types';
import { parseFrontmatter } from '@/core/utils/markdown-utils';
import { normalizeVaultPath } from '@/core/utils/path-utils';
import { getFileRef, getFolderRef, isFile } from '@/core/storage/vault/vault-ops';
import { ResourceKindDetector } from '@/core/document/resource/helper/ResourceKindDetector';
import { DocumentLoaderManager } from '@/core/document/loader/helper/DocumentLoaderManager';
import { hashSHA256, hashString } from '@/core/utils/hash-utils';
import type { GeneratedOutputPersistenceRuntime } from '@/core/storage/generated-output';

interface ResourceSummarySnapshot {
	meta: ResourceSummaryMeta;
	provenance: {
		sourceFingerprint: string;
		generatedBy: 'resource-summary-service';
	};
}

/**
 * Service for managing resource summary notes.
 *
 * T11R Phase 2: `app` typed as {@link AppHandle} (neutral); vault ops via
 * the service-internal duck-typed helpers in `@/service/internal/vault-ops`
 * so this module no longer imports from `obsidian`.
 */
export class ResourceSummaryService {
	private readonly resourcesFolder: string;
	private readonly kindDetector: ResourceKindDetector;

	constructor(
		private readonly app: AppHandle,
		rootFolder: string,
		resourcesSummaryFolderName: string,
		private readonly persistence?: GeneratedOutputPersistenceRuntime,
	) {
		this.resourcesFolder = normalizeVaultPath(`${resourcesSummaryFolderName}`);
		this.kindDetector = new ResourceKindDetector(DocumentLoaderManager.getInstance().getVaultReader());
	}

	/** Machine summaries are lazy; boot must not create a Markdown cache folder. */
	async init(): Promise<void> {}

	createResourceRef(source: string, summaryNotePath?: string): ChatResourceRef {
		const id = this.generateResourceId(source);
		const kind = this.kindDetector.detectResourceKind(source);
		return {
			source,
			id,
			kind,
			summaryNotePath,
		};
	}

	getResourceSummaryPath(resourceId: string): string {
		if (this.persistence) {
			return this.persistence.resolvePath('resource.summary-snapshot', { resourceKey: resourceId });
		}
		return normalizeVaultPath(`${this.resourcesFolder}/Resource-${resourceId}.md`);
	}

	async saveResourceSummary(params: {
		resourceId: string;
		source: string;
		kind: ResourceKind;
		title?: string;
		shortSummary?: string;
		fullSummary?: string;
		mentionedInConversations?: string[];
		mentionedInProjects?: string[];
		mentionedInFiles?: string[];
	}): Promise<VaultFileRef> {
		const meta: ResourceSummaryMeta = {
			id: params.resourceId,
			source: params.source,
			kind: params.kind,
			title: params.title,
			shortSummary: params.shortSummary,
			fullSummary: params.fullSummary,
			lastUpdatedTimestamp: Date.now(),
			mentionedInConversations: params.mentionedInConversations ?? [],
			mentionedInProjects: params.mentionedInProjects ?? [],
			mentionedInFiles: params.mentionedInFiles ?? [],
		};
		if (!this.persistence) {
			throw new Error('ResourceSummaryService: generated output persistence runtime is not bound.');
		}
		await this.persistence.snapshots.writeSnapshot<ResourceSummarySnapshot>({
			outputId: 'resource.summary-snapshot',
			recordKey: params.resourceId,
			pathVariables: { resourceKey: params.resourceId },
			payload: {
				meta,
				provenance: {
					sourceFingerprint: hashSHA256(params.source),
					generatedBy: 'resource-summary-service',
				},
			},
		});
		return this.buildMachineFileRef(this.getResourceSummaryPath(params.resourceId), meta.lastUpdatedTimestamp);
	}

	async readResourceSummary(resourceId: string): Promise<ParsedResourceSummaryFile | null> {
		if (this.persistence) {
			const current = await this.persistence.snapshots.readSnapshot<ResourceSummarySnapshot>({
				outputId: 'resource.summary-snapshot',
				recordKey: resourceId,
				pathVariables: { resourceKey: resourceId },
			});
			if (current) return this.toParsedSnapshot(current.envelope.payload);
		}
		return this.readAndImportLegacySummary(resourceId);
	}

	private async readAndImportLegacySummary(resourceId: string): Promise<ParsedResourceSummaryFile | null> {
		const path = normalizeVaultPath(`${this.resourcesFolder}/Resource-${resourceId}.md`);
		const file = getFileRef(path, this.app);
		if (!file) return null;

		const raw = await this.app.vault.read(file);
		const frontmatter = parseFrontmatter<Record<string, unknown>>(raw);
		if (!frontmatter) return null;

		const meta: ResourceSummaryMeta = {
			id: String(frontmatter.data.id ?? resourceId),
			source: String(frontmatter.data.source ?? ''),
			kind: (frontmatter.data.kind as ResourceKind) || 'other',
			title: frontmatter.data.title ? String(frontmatter.data.title) : undefined,
			shortSummary: frontmatter.data.shortSummary ? String(frontmatter.data.shortSummary) : undefined,
			fullSummary: frontmatter.data.fullSummary ? String(frontmatter.data.fullSummary) : undefined,
			lastUpdatedTimestamp: Number(frontmatter.data.lastUpdatedTimestamp ?? Date.now()),
			mentionedInConversations: Array.isArray(frontmatter.data.mentionedInConversations)
				? frontmatter.data.mentionedInConversations.map(String)
				: [],
			mentionedInProjects: Array.isArray(frontmatter.data.mentionedInProjects)
				? frontmatter.data.mentionedInProjects.map(String)
				: [],
			mentionedInFiles: Array.isArray(frontmatter.data.mentionedInFiles)
				? frontmatter.data.mentionedInFiles.map(String)
				: [],
		};

		const parsed = {
			meta,
			content: frontmatter.body,
			file,
		};
		if (this.persistence) await this.importLegacySummary(path, raw, meta);
		return parsed;
	}

	async listResourceSummaries(): Promise<ParsedResourceSummaryFile[]> {
		const byId = new Map<string, ParsedResourceSummaryFile>();
		if (this.persistence) {
			const samplePath = this.persistence.resolvePath('resource.summary-snapshot', { resourceKey: '__sample__' });
			const directory = samplePath.slice(0, samplePath.lastIndexOf('/'));
			const files = await this.persistence.snapshots.listSnapshotFiles(directory);
			for (const path of files) {
				const name = path.slice(path.lastIndexOf('/') + 1);
				if (!name.endsWith('.json') || name.includes('.backup') || name.includes('.tmp')) continue;
				const resourceId = name.slice(0, -'.json'.length);
				const parsed = await this.readResourceSummary(resourceId);
				if (parsed) byId.set(parsed.meta.id, parsed);
			}
		}
		const folder = getFolderRef(this.resourcesFolder, this.app);
		if (!folder) return [...byId.values()];
		const children = (folder as VaultFolderRef & { children?: ReadonlyArray<unknown> }).children ?? [];
		for (const child of children) {
			if (isFile(child)) {
				const f = child as VaultFileRef;
				if (f.name.startsWith('Resource-') && f.extension === 'md') {
					const resourceId = f.basename.replace(/^Resource-/, '');
					const parsed = await this.readResourceSummary(resourceId);
					if (parsed) byId.set(parsed.meta.id, parsed);
				}
			}
		}
		return [...byId.values()];
	}

	private generateResourceId(source: string): string {
		return hashString(source, 8);
	}

	private toParsedSnapshot(snapshot: ResourceSummarySnapshot): ParsedResourceSummaryFile {
		return {
			meta: snapshot.meta,
			content: snapshot.meta.fullSummary ?? snapshot.meta.shortSummary ?? '',
			file: this.buildMachineFileRef(
				this.getResourceSummaryPath(snapshot.meta.id),
				snapshot.meta.lastUpdatedTimestamp,
			),
		};
	}

	private async importLegacySummary(path: string, raw: string, meta: ResourceSummaryMeta): Promise<void> {
		if (!this.persistence) return;
		const targetPath = this.getResourceSummaryPath(meta.id);
		const migration = {
			migrationId: 'resource-summary-markdown-to-json-v1',
			sourceOutputId: 'legacy.resource-summary-markdown',
			targetOutputId: 'resource.summary-snapshot',
			sourcePath: path,
			targetPath,
			sourceChecksum: hashSHA256(raw),
		};
		await this.persistence.migrations.append({ ...migration, status: 'discovered' });
		const envelope = await this.persistence.snapshots.writeSnapshot<ResourceSummarySnapshot>({
			outputId: 'resource.summary-snapshot',
			recordKey: meta.id,
			pathVariables: { resourceKey: meta.id },
			payload: {
				meta,
				provenance: { sourceFingerprint: hashSHA256(meta.source), generatedBy: 'resource-summary-service' },
			},
		});
		await this.persistence.migrations.append({ ...migration, status: 'imported', targetChecksum: envelope.checksum });
		await this.persistence.migrations.append({ ...migration, status: 'validated', targetChecksum: envelope.checksum });
	}

	private buildMachineFileRef(path: string, timestamp: number): VaultFileRef {
		const name = path.slice(path.lastIndexOf('/') + 1);
		const extension = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
		return {
			path,
			name,
			basename: extension ? name.slice(0, -(extension.length + 1)) : name,
			extension,
			stat: { size: 0, ctime: timestamp, mtime: timestamp },
		};
	}
}
