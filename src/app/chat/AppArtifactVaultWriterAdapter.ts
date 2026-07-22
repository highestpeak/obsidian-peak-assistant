/**
 * Concrete Obsidian implementation of `ArtifactVaultWriterPort`. The only
 * place in the codebase that closes over `app.vault.createFolder` +
 * `app.vault.create` for the structured `artifact_create` producers
 * (Chat Studio zero-gap Track D, 2026-07-21).
 */

import { normalizePath, TFile, type App } from 'obsidian';
import type { ArtifactVaultWriterPort } from '@/core/ports/ArtifactVaultWriterPort';

export class AppArtifactVaultWriterAdapter implements ArtifactVaultWriterPort {
	constructor(private readonly app: App) {}

	async writeTextFile(
		folder: string,
		basename: string,
		ext: string,
		content: string,
	): Promise<string> {
		const folderPath = normalizePath(folder);
		// Ensure every intermediate folder exists — `createFolder` on an
		// existing folder throws so we probe first.
		const parts = folderPath.split('/').filter(Boolean);
		let cur = '';
		for (const part of parts) {
			cur = cur ? `${cur}/${part}` : part;
			if (!this.app.vault.getAbstractFileByPath(cur)) {
				try {
					await this.app.vault.createFolder(cur);
				} catch {
					/* race: another writer created it; safe to ignore */
				}
			}
		}
		const sanitized = sanitizeBasename(basename);
		let candidate = normalizePath(`${folderPath}/${sanitized}.${ext}`);
		let counter = 2;
		while (this.app.vault.getAbstractFileByPath(candidate)) {
			candidate = normalizePath(`${folderPath}/${sanitized}-${counter}.${ext}`);
			counter += 1;
			if (counter > 500) throw new Error('artifact writer: too many name collisions');
		}
		await this.app.vault.create(candidate, content);
		return candidate;
	}

	async readTextFile(path: string): Promise<string | null> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(path));
		if (!(file instanceof TFile)) return null;
		return this.app.vault.read(file);
	}

	async modifyFrontmatterField(vaultPath: string, field: string, value: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(normalizePath(vaultPath));
		if (!(file instanceof TFile)) return;
		const current = await this.app.vault.read(file);
		const next = replaceOrInsertFrontmatterField(current, field, value);
		if (next !== current) await this.app.vault.modify(file, next);
	}
}

/**
 * Rewrite a single YAML frontmatter field. Contract (kept intentionally
 * narrow to sidestep a full YAML parser dependency):
 *
 *   - Frontmatter must be delimited by a leading `---\n` and a matching
 *     `\n---` line (Obsidian convention). If missing, we synthesize a fresh
 *     one that just carries `field: value` and prepend it.
 *   - We match `^field:\s*.+$` on its own line inside the frontmatter block
 *     and replace the value. Nested / list-shaped values are left alone.
 *   - When the field is absent from an existing frontmatter, we append it
 *     as a new line before the closing `---`.
 *   - Body content after the frontmatter is preserved byte-for-byte.
 */
export function replaceOrInsertFrontmatterField(body: string, field: string, value: string): string {
	const trimmedField = field.trim();
	const trimmedValue = value.trim();
	if (!trimmedField) return body;
	const line = `${trimmedField}: ${trimmedValue}`;
	const frontmatterMatch = body.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
	if (!frontmatterMatch) {
		// No frontmatter — synthesize one. Keep newline discipline so the
		// resulting note round-trips cleanly through Obsidian's parser.
		return `---\n${line}\n---\n\n${body}`;
	}
	const fmBlock = frontmatterMatch[1];
	const fieldRegex = new RegExp(`^${escapeRegExp(trimmedField)}:\\s*.*$`, 'm');
	let nextBlock: string;
	if (fieldRegex.test(fmBlock)) {
		nextBlock = fmBlock.replace(fieldRegex, line);
	} else {
		nextBlock = fmBlock.trimEnd() + `\n${line}`;
	}
	const rebuilt = `---\n${nextBlock}\n---\n`;
	return body.replace(frontmatterMatch[0], rebuilt);
}

function escapeRegExp(input: string): string {
	return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Sanitize a user-facing title into a safe filename basename. */
function sanitizeBasename(raw: string): string {
	const trimmed = (raw || '').trim().replace(/\s+/g, '-');
	// Strip characters Obsidian / OS filesystems dislike.
	const cleaned = trimmed.replace(/[\\/:*?"<>|#^\[\]]/g, '-');
	// Collapse repeated dashes and enforce a fallback.
	const collapsed = cleaned.replace(/-+/g, '-').replace(/^-+|-+$/g, '');
	return collapsed || `artifact-${Date.now()}`;
}
