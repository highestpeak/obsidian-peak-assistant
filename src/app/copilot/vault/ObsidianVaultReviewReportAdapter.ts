// T9: Obsidian-side adapter for the Vault Review report port.
//
// Owns every concrete Obsidian file/folder/Notice access the service
// used to perform via the `VaultReviewReportService` class. Pre-T9
// that class lived in `src/service/copilot/vault/VaultReviewReportService.ts`
// and imported `obsidian` directly + reached `AppContext.getInstance().app`.
// T9 moves the class here; the service file keeps only pure markdown
// build/parse helpers + the `VaultReviewHistoryRecord` type.

import { Notice, TFile, type App, type TFolder } from 'obsidian';
import { ensureFolder, joinPath } from '@/app/adapters/vault/vault-helpers';
import type { VaultReviewReportPort } from '@/core/ports/VaultReviewPorts';
import type { VaultReviewSessionSnapshot } from '@/service/copilot/vault/VaultReviewSession';
import {
	VAULT_REVIEW_FOLDER,
	SNAPSHOT_FENCE_TAG,
	type VaultReviewHistoryRecord,
	buildVaultReviewMarkdown,
	computeVaultReviewHeadline,
	parseVaultReviewFenceJson,
	sanitizeForFileName,
	summaryStats,
	uniqueId,
	isoTimestamp,
} from '@/service/copilot/vault/VaultReviewReportService';

const README_FILE = 'peak-system/README.md';
const FOLDER_NOTICE_FLAG = 'peak-assistant.notice.peakSystemFolder.v1';

const README_BODY = `# peak-system/

This folder stores internal data for the **Peak Assistant** plugin (Obsidian).

- \`auto-review/\` — saved Copilot Auto Review sessions (per-doc)
- \`vault-reviews/\` — saved Vault Auto Review reports (vault-wide)

Safe operations:
- Browse these files (they are valid markdown)
- Delete individual records to remove history
- Hide this folder from the file tree via **Obsidian Settings → Files & Links → Excluded files** (add \`peak-system\`)

Do not rename or move \`peak-system/\` or its children — the plugin looks for them by path.
`;

export class ObsidianVaultReviewReportAdapter implements VaultReviewReportPort {
	constructor(private readonly app: App) {}

	async save(
		snapshot: VaultReviewSessionSnapshot,
		existingRecord?: Pick<VaultReviewHistoryRecord, 'id' | 'storagePath'>,
	): Promise<VaultReviewHistoryRecord> {
		const stats = summaryStats(snapshot);
		const id = existingRecord?.id ?? uniqueId(stats.completedAt);
		const fingerprint = snapshot.digest?.fingerprint.fingerprint ?? '';
		const noteCount = snapshot.digest?.counts.notes ?? 0;
		const wordCount = snapshot.digest?.counts.words ?? 0;
		const record: VaultReviewHistoryRecord = {
			id,
			storagePath: existingRecord?.storagePath ?? '',
			mode: snapshot.mode,
			status: snapshot.status,
			startedAt: stats.startedAt,
			completedAt: stats.completedAt,
			headline: computeVaultReviewHeadline(snapshot),
			noteCount,
			wordCount,
			clusterCount: stats.clusterCount,
			insightCount: stats.insightCount,
			gapCount: stats.gapCount,
			actionCount: stats.actionCount,
			sourceCount: stats.sourceCount,
			roundCount: stats.roundCount,
			turnCount: stats.turnCount,
			fingerprint,
		};

		await ensureFolder(VAULT_REVIEW_FOLDER, this.app);
		await this.ensureFolderReadme();
		if (!record.storagePath) {
			const shortHash = fingerprint.slice(0, 8) || 'unknown';
			const stamp = isoTimestamp(stats.startedAt);
			const safeName = sanitizeForFileName(`${stamp}-${shortHash}`);
			record.storagePath = joinPath(VAULT_REVIEW_FOLDER, `${safeName}.md`);
		}

		const body = buildVaultReviewMarkdown(record, snapshot);
		const existing = this.app.vault.getAbstractFileByPath(record.storagePath);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, body);
		} else {
			await this.app.vault.create(record.storagePath, body);
		}
		return record;
	}

	async listAll(limit = 50): Promise<VaultReviewHistoryRecord[]> {
		const folder = this.app.vault.getAbstractFileByPath(VAULT_REVIEW_FOLDER);
		if (!folder || !('children' in folder)) return [];
		const records: VaultReviewHistoryRecord[] = [];
		for (const child of (folder as TFolder).children) {
			if (!(child instanceof TFile) || child.extension !== 'md') continue;
			const rec = await this.readMetadata(child);
			if (rec) records.push(rec);
		}
		records.sort((a, b) => b.completedAt - a.completedAt);
		return records.slice(0, limit);
	}

	async load(record: VaultReviewHistoryRecord): Promise<VaultReviewSessionSnapshot | null> {
		const file = this.app.vault.getAbstractFileByPath(record.storagePath);
		if (!(file instanceof TFile)) return null;
		const content = await this.app.vault.read(file);
		return parseVaultReviewFenceJson<VaultReviewSessionSnapshot>(content, SNAPSHOT_FENCE_TAG);
	}

	async delete(record: VaultReviewHistoryRecord): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(record.storagePath);
		if (file instanceof TFile) {
			await this.app.fileManager.trashFile(file);
		}
	}

	private async readMetadata(file: TFile): Promise<VaultReviewHistoryRecord | null> {
		const cache = this.app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter as Record<string, unknown> | undefined;
		if (!fm || fm.type !== 'peak-vault-review') return null;
		const parseDate = (v: unknown): number => {
			if (typeof v !== 'string') return 0;
			const t = Date.parse(v);
			return Number.isFinite(t) ? t : 0;
		};
		const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
		const str = (v: unknown): string => (typeof v === 'string' ? v : '');
		const headlineRaw = str(fm.headline).trim();
		return {
			id: str(fm.id) || file.basename,
			storagePath: file.path,
			mode: (str(fm.mode) === 'fast' ? 'fast' : 'complete'),
			startedAt: parseDate(fm.startedAt),
			completedAt: parseDate(fm.completedAt),
			status: str(fm.status) || 'completed',
			headline: headlineRaw || undefined,
			noteCount: num(fm.noteCount),
			wordCount: num(fm.wordCount),
			clusterCount: num(fm.clusterCount),
			insightCount: num(fm.insightCount),
			gapCount: num(fm.gapCount),
			actionCount: num(fm.actionCount),
			sourceCount: num(fm.sourceCount),
			roundCount: num(fm.roundCount),
			turnCount: num(fm.turnCount),
			fingerprint: str(fm.fingerprint),
		};
	}

	private async ensureFolderReadme(): Promise<void> {
		const existing = this.app.vault.getAbstractFileByPath(README_FILE);
		if (existing instanceof TFile) return;
		try {
			await this.app.vault.create(README_FILE, README_BODY);
		} catch (err) {
			console.debug('[ObsidianVaultReviewReportAdapter] README write skipped', err);
			return;
		}
		try {
			if (typeof window !== 'undefined' && !window.localStorage.getItem(FOLDER_NOTICE_FLAG)) {
				window.localStorage.setItem(FOLDER_NOTICE_FLAG, '1');
				new Notice(
					'Peak Assistant created a "peak-system" folder for review history. ' +
					'You can hide it via Settings → Files & Links → Excluded files.',
					8000,
				);
			}
		} catch {
			// localStorage unavailable
		}
	}
}
