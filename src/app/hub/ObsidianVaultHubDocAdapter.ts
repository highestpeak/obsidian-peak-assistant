import { TFile, type App } from 'obsidian';
import { ensureFolder } from '@/app/platform/vault/vault-helpers';
import type {
	VaultHubDocWritePort,
	VaultHubArchivePort,
} from '@/core/ports/HubGenerationPorts';

// See docs/superpowers/specs/2026-07-03-hub-generation-agent.md §Component 7.

const USER_SECTIONS_MARKER = '<!-- USER_SECTIONS_BELOW -->';
const ARCHIVE_ROOT = '_archive/hub';

function parseFrontmatterFlag(raw: string, key: string): boolean {
	// Minimal YAML-frontmatter reader: look for `--- ... ---` at file start and read `key: value` lines.
	const trimmed = raw.trimStart();
	if (!trimmed.startsWith('---')) return false;
	const end = trimmed.indexOf('\n---', 3);
	if (end < 0) return false;
	const block = trimmed.slice(3, end);
	const rx = new RegExp(`^\\s*${key}\\s*:\\s*([^\\n]+)$`, 'm');
	const m = rx.exec(block);
	if (!m) return false;
	const val = m[1].trim().replace(/^"|"$/g, '').toLowerCase();
	return val === 'true' || val === 'yes' || val === '1';
}

function extractUserContent(raw: string): string {
	const idx = raw.indexOf(USER_SECTIONS_MARKER);
	if (idx < 0) return '';
	const rest = raw.slice(idx + USER_SECTIONS_MARKER.length);
	return rest.replace(/^\r?\n/, '');
}

export class ObsidianVaultHubDocAdapter implements VaultHubDocWritePort {
	constructor(private readonly app: App) {}

	async listMarkdownUnder(folderPath: string): Promise<string[]> {
		const prefix = folderPath.replace(/\/+$/, '');
		return this.app.vault.getMarkdownFiles()
			.map((file) => file.path)
			.filter((path) => path === prefix || path.startsWith(`${prefix}/`))
			.sort();
	}

	async read(path: string): Promise<string | null> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return null;
		return this.app.vault.read(file);
	}

	async readPeakUserOwned(path: string): Promise<boolean> {
		const raw = await this.read(path);
		if (!raw) return false;
		return parseFrontmatterFlag(raw, 'peak_user_owned');
	}

	async extractUserPreservedContent(path: string): Promise<string> {
		const raw = await this.read(path);
		if (!raw) return '';
		return extractUserContent(raw);
	}

	async writeHubDoc(path: string, markdown: string): Promise<void> {
		const lastSlash = path.lastIndexOf('/');
		if (lastSlash > 0) {
			await ensureFolder(path.slice(0, lastSlash), this.app);
		}
		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, markdown);
			return;
		}
		await this.app.vault.create(path, markdown);
	}
}

export class ObsidianVaultHubArchiveAdapter implements VaultHubArchivePort {
	constructor(private readonly app: App) {}

	async archive(srcPath: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(srcPath);
		if (!(file instanceof TFile)) return srcPath;
		const safeName = srcPath.replace(/\//g, '__');
		const dest = `${ARCHIVE_ROOT}/${safeName}`;
		await ensureFolder(ARCHIVE_ROOT, this.app);
		const collision = this.app.vault.getAbstractFileByPath(dest);
		const finalDest = collision
			? `${ARCHIVE_ROOT}/${Date.now()}-${safeName}`
			: dest;
		await this.app.fileManager.renameFile(file, finalDest);
		return finalDest;
	}
}
