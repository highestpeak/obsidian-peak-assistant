import { Vault, normalizePath, TFile, TFolder } from 'obsidian';

/**
 * Utility for building chat document names with timestamp and conflict resolution.
 */
export class ChatDocName {

	/**
	 * Build project folder name with conflict resolution: Project-mmddhhmmss-<name>
	 * If vault and folder are not provided, returns base name without conflict resolution.
	 */
	static async buildProjectFolderName(
		timestamp: number,
		name: string,
		vault?: Vault,
		folder?: string
	): Promise<string> {
		const baseName = this.buildName('Project', timestamp, name);
		if (vault && folder) {
			return this.resolveNonConflictingPath(vault, folder, baseName);
		}
		return baseName;
	}

	/**
	 * Build conversation file name with conflict resolution: Conv-mmddhhmmss-<title>
	 * If vault and folder are not provided, returns base name without conflict resolution.
	 */
	static async buildConvFileName(
		timestamp: number,
		title: string,
		vault?: Vault,
		folder?: string
	): Promise<string> {
		const baseName = this.buildName('Conv', timestamp, title);
		if (vault && folder) {
			return this.resolveNonConflictingPath(vault, folder, baseName);
		}
		return baseName;
	}

	/**
	 * Build base name: <prefix>-mmddhhmmss-<summarytitle>
	 */
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

	/**
	 * Sanitize summary title for use in filename.
	 */
	private static sanitizeSummaryTitle(title: string, maxLength: number = 60): string {
		const sanitized = this.slugify(title);
		if (sanitized.length > maxLength) {
			return sanitized.substring(0, maxLength);
		}
		return sanitized || 'untitled';
	}

	/**
	 * Convert a string into a "slug" — a simplified, URL- and filename-safe version of the text,
	 * containing only lowercase letters, numbers, and hyphens. Slugs are often used in URLs or as filenames
	 * to avoid spaces and special characters.
	 * 
	 * Example: "Hello World!" => "hello-world"
	 */
	private static slugify(text: string): string {
		return text
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9\-]+/g, '-')
			.replace(/-{2,}/g, '-')
			.replace(/^-+|-+$/g, '');
	}

	/**
	 * Resolve non-conflicting path by checking for same-second collisions.
	 * Only adds index suffix if collision detected.
	 */
	private static async resolveNonConflictingPath(
		vault: Vault,
		folder: string,
		baseName: string
	): Promise<string> {
		const normalizedFolder = normalizePath(folder);
		const folderObj = vault.getAbstractFileByPath(normalizedFolder);
		if (!(folderObj instanceof TFolder)) {
			return baseName;
		}

		// Check if base name exists
		const basePath = normalizePath(`${normalizedFolder}/${baseName}`);
		const existing = vault.getAbstractFileByPath(basePath);
		if (!existing) {
			return baseName;
		}

		// Collision detected - add index suffix
		let index = 1;
		let candidateName: string;
		do {
			candidateName = `${baseName}-${index}`;
			const candidatePath = normalizePath(`${normalizedFolder}/${candidateName}`);
			const candidate = vault.getAbstractFileByPath(candidatePath);
			if (!candidate) {
				return candidateName;
			}
			index++;
		} while (index < 1000); // Safety limit

		// Fallback: append timestamp if still colliding
		return `${baseName}-${Date.now()}`;
	}

	private static pad(value: number): string {
		return value < 10 ? `0${value}` : `${value}`;
	}
}
