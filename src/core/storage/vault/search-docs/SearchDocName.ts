import { Vault, normalizePath, TFolder } from 'obsidian';

/**
 * Utility for building AI search analysis document names.
 * Similar to ChatDocName but for search-docs.
 */
export class SearchDocName {

	/**
	 * Build analysis file name: AI-Analysis-mmddhhmmss-<query-slug>
	 * If vault and folder provided, resolves conflicts.
	 */
	static async buildAnalysisFileName(
		timestamp: number,
		query: string,
		vault?: Vault,
		folder?: string
	): Promise<string> {
		const baseName = this.buildName('AI-Analysis', timestamp, query);
		if (vault && folder) {
			return this.resolveNonConflictingPath(vault, folder, baseName + '.md');
		}
		return baseName + '.md';
	}

	private static buildName(prefix: string, timestamp: number, query: string): string {
		const date = new Date(timestamp);
		const mm = this.pad(date.getMonth() + 1);
		const dd = this.pad(date.getDate());
		const hh = this.pad(date.getHours());
		const mm2 = this.pad(date.getMinutes());
		const ss = this.pad(date.getSeconds());
		const timeStr = `${mm}${dd}${hh}${mm2}${ss}`;
		const sanitized = this.sanitizeQuery(query);
		return `${prefix}-${timeStr}-${sanitized}`;
	}

	private static sanitizeQuery(query: string, maxLength: number = 48): string {
		const sanitized = this.slugify(query);
		if (sanitized.length > maxLength) {
			return sanitized.substring(0, maxLength);
		}
		return sanitized || 'query';
	}

	private static slugify(text: string): string {
		return String(text ?? '')
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9\u4e00-\u9fff\-]+/g, '-')
			.replace(/-{2,}/g, '-')
			.replace(/^-+|-+$/g, '');
	}

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
		const basePath = normalizePath(`${normalizedFolder}/${baseName}`);
		const existing = vault.getAbstractFileByPath(basePath);
		if (!existing) {
			return baseName;
		}
		const baseWithoutExt = baseName.replace(/\.md$/, '');
		let index = 1;
		do {
			const candidate = `${baseWithoutExt}-${index}.md`;
			const candidatePath = normalizePath(`${normalizedFolder}/${candidate}`);
			if (!vault.getAbstractFileByPath(candidatePath)) {
				return candidate;
			}
			index++;
		} while (index < 1000);
		return `${baseWithoutExt}-${Date.now()}.md`;
	}

	private static pad(value: number): string {
		return value < 10 ? `0${value}` : `${value}`;
	}
}
