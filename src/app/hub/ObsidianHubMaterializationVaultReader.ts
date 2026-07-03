import { TFile, type App } from 'obsidian';
import type { HubMaterializationVaultReaderPort } from '@/service/agents/hub-materialization-helper/types';

// App-side implementation of the vault-reader port used by HubMaterializationAgent prep.
// Only reads first-N chars, title (basename), and tags — no cross-vault semantic work.

function stripFrontmatter(raw: string): { body: string; frontmatter: string } {
	const trimmed = raw.trimStart();
	if (!trimmed.startsWith('---')) return { body: raw, frontmatter: '' };
	const end = trimmed.indexOf('\n---', 3);
	if (end < 0) return { body: raw, frontmatter: '' };
	const frontmatter = trimmed.slice(3, end);
	const body = trimmed.slice(end + 4).replace(/^\r?\n/, '');
	return { body, frontmatter };
}

function parseFrontmatterTags(frontmatter: string): string[] {
	if (!frontmatter) return [];
	const rx = /^\s*tags\s*:\s*(.+)$/m;
	const m = rx.exec(frontmatter);
	if (!m) return [];
	const val = m[1].trim();
	if (val.startsWith('[') && val.endsWith(']')) {
		return val
			.slice(1, -1)
			.split(',')
			.map((s) => s.trim().replace(/^["']|["']$/g, ''))
			.filter(Boolean);
	}
	return val
		.split(/[,\s]+/)
		.map((s) => s.replace(/^["']|["']$/g, ''))
		.filter(Boolean);
}

function parseInlineTags(body: string): string[] {
	const out = new Set<string>();
	const rx = /(?:^|\s)#([A-Za-z0-9_\-\/一-鿿]+)/g;
	let m: RegExpExecArray | null;
	while ((m = rx.exec(body)) !== null) {
		out.add(m[1]);
	}
	return [...out];
}

export class ObsidianHubMaterializationVaultReader implements HubMaterializationVaultReaderPort {
	constructor(private readonly app: App) {}

	async readTitle(path: string): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return '';
		return file.basename;
	}

	async readExcerpt(path: string, maxChars: number): Promise<string> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return '';
		const raw = await this.app.vault.read(file);
		const { body } = stripFrontmatter(raw);
		const compact = body.replace(/\s+/g, ' ').trim();
		return compact.slice(0, Math.max(0, maxChars));
	}

	async readTags(path: string): Promise<string[]> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (!(file instanceof TFile)) return [];
		const raw = await this.app.vault.read(file);
		const { body, frontmatter } = stripFrontmatter(raw);
		return [...new Set([...parseFrontmatterTags(frontmatter), ...parseInlineTags(body)])];
	}
}
