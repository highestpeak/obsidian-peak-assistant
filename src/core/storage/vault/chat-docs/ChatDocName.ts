import type { AppHandle } from '@/core/ports/AppHandle';
import { normalizeVaultPath } from '@/core/utils/path-utils';
import { getFileRef, getFolderRef } from '@/core/storage/vault/vault-ops';

/**
 * Utility for building chat document names with timestamp and conflict resolution.
 *
 * T11R Phase 2: parameter previously typed as Obsidian `Vault` is now an
 * {@link AppHandle} (`{ vault: ... }`) so this module no longer imports
 * from `obsidian`. Conflict detection uses the vault-ops helper duck-typing
 * instead of `instanceof TFile / TFolder`.
 */
export class ChatDocName {

	static async buildProjectFolderName(
		timestamp: number,
		name: string,
		app?: AppHandle,
		folder?: string
	): Promise<string> {
		const baseName = this.buildName('Project', timestamp, name);
		if (app && folder) {
			return this.resolveNonConflictingPath(app, folder, baseName);
		}
		return baseName;
	}

	static async buildConvFileName(
		timestamp: number,
		title: string,
		app?: AppHandle,
		folder?: string
	): Promise<string> {
		const baseName = this.buildName('Conv', timestamp, title);
		if (app && folder) {
			return this.resolveNonConflictingPath(app, folder, baseName);
		}
		return baseName;
	}

	private static buildName(prefix: string, timestamp: number, summaryTitle: string): string {
		const date = new Date(timestamp);
		const mm = this.pad(date.getMonth() + 1);
		const dd = this.pad(date.getDate());
		const hh = this.pad(date.getHours());
		const mm2 = this.pad(date.getMinutes());
		const ss = this.pad(date.getSeconds());
		const timeStr = `${mm}${dd}${hh}${mm2}${ss}`;
		const sanitized = this.sanitizeSummaryTitle(summaryTitle);
		return `${prefix}-${timeStr}-${sanitized}`;
	}

	private static sanitizeSummaryTitle(title: string, maxLength: number = 60): string {
		const sanitized = this.slugify(title);
		if (sanitized.length > maxLength) {
			return sanitized.substring(0, maxLength);
		}
		return sanitized || 'untitled';
	}

	private static slugify(text: string): string {
		return text
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9\-]+/g, '-')
			.replace(/-{2,}/g, '-')
			.replace(/^-+|-+$/g, '');
	}

	private static async resolveNonConflictingPath(
		app: AppHandle,
		folder: string,
		baseName: string
	): Promise<string> {
		const normalizedFolder = normalizeVaultPath(folder);
		const folderRef = getFolderRef(normalizedFolder, app);
		if (!folderRef) {
			return baseName;
		}

		const basePath = normalizeVaultPath(`${normalizedFolder}/${baseName}`);
		if (!getFileRef(basePath, app) && !getFolderRef(basePath, app)) {
			return baseName;
		}

		let index = 1;
		let candidateName: string;
		do {
			candidateName = `${baseName}-${index}`;
			const candidatePath = normalizeVaultPath(`${normalizedFolder}/${candidateName}`);
			if (!getFileRef(candidatePath, app) && !getFolderRef(candidatePath, app)) {
				return candidateName;
			}
			index++;
		} while (index < 1000);

		return `${baseName}-${Date.now()}`;
	}

	private static pad(value: number): string {
		return value < 10 ? `0${value}` : `${value}`;
	}
}
