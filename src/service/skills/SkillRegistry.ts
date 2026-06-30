/**
 * Singleton registry that discovers and caches skill definitions.
 *
 * Skills are loaded from two sources:
 *   1. Built-in skills (bundled strings, always available)
 *   2. Vault folder (configurable, default: _skills/)
 *
 * Hot-reload: vault file changes (create/modify/delete) in the skills
 * folder trigger automatic re-parsing of the affected skill.
 */

import type { AppHandle as App } from '@/core/ports/AppHandle';
import type { VaultFileRef as TFile, VaultFolderRef } from '@/core/ports/VaultFileRef';
type TAbstractFile = TFile | VaultFolderRef;
import type { SkillDefinition } from './types';
import { parseSkillMarkdown, validateSkillDefinition } from './SkillParser';
import { loadBuiltinSkills } from './builtin';

export class SkillRegistry {
	private static instance: SkillRegistry | null = null;

	private app: App | null = null;
	private skillsFolder = '_skills';
	private skills = new Map<string, SkillDefinition>();
	private eventRefs: ReturnType<App['vault']['on']>[] = [];

	private constructor() {}

	static getInstance(): SkillRegistry {
		if (!SkillRegistry.instance) {
			SkillRegistry.instance = new SkillRegistry();
		}
		return SkillRegistry.instance;
	}

	/**
	 * Initialize the registry: load built-in skills, scan vault folder,
	 * and register file watchers for hot-reload.
	 */
	async init(app: App, skillsFolder: string): Promise<void> {
		this.app = app;
		this.skillsFolder = skillsFolder;

		// Load built-in skills
		await this.loadBuiltins();

		// Scan vault folder
		await this.scanVaultFolder();

		// Watch for changes
		this.eventRefs.push(
			app.vault.on('create', (file) => this.onFileChange(file)),
			app.vault.on('modify', (file) => this.onFileChange(file)),
			app.vault.on('delete', (file) => this.onFileDelete(file)),
			app.vault.on('rename', (file, oldPath) => {
				this.onFileRename(file, oldPath);
			}),
		);
	}

	/**
	 * Clean up watchers and release references.
	 */
	destroy(): void {
		for (const ref of this.eventRefs) {
			this.app?.vault.offref(ref);
		}
		this.eventRefs = [];
		this.skills.clear();
		this.app = null;
		SkillRegistry.instance = null;
	}

	// ── Selectors ─────────────────────────────────────────────────────

	getAll(): SkillDefinition[] {
		return Array.from(this.skills.values());
	}

	getById(id: string): SkillDefinition | undefined {
		return this.skills.get(id);
	}

	getByTag(tag: string): SkillDefinition[] {
		const lower = tag.toLowerCase();
		return this.getAll().filter((s) => s.tags.some((t) => t.toLowerCase() === lower));
	}

	getBuiltins(): SkillDefinition[] {
		return this.getAll().filter((s) => s.source === 'builtin');
	}

	getVaultSkills(): SkillDefinition[] {
		return this.getAll().filter((s) => s.source === 'vault');
	}

	/**
	 * Force re-scan of vault folder. Clears vault skills and re-reads.
	 */
	async refresh(): Promise<void> {
		// Remove existing vault skills
		for (const [id, skill] of this.skills) {
			if (skill.source === 'vault') this.skills.delete(id);
		}
		await this.scanVaultFolder();
	}

	// ── Internal ──────────────────────────────────────────────────────

	private async loadBuiltins(): Promise<void> {
		const entries = await loadBuiltinSkills();
		for (const raw of entries) {
			try {
				const skill = parseSkillMarkdown(raw.content, 'builtin');
				const errors = validateSkillDefinition(skill);
				if (errors.length > 0) {
					console.warn(`[SkillRegistry] Built-in skill "${skill.id}" has validation errors:`, errors);
					continue;
				}
				this.skills.set(skill.id, skill);
			} catch (e) {
				console.warn('[SkillRegistry] Failed to parse built-in skill:', e);
			}
		}
	}

	private async scanVaultFolder(): Promise<void> {
		if (!this.app) return;

		const folder = this.app.vault.getAbstractFileByPath(this.skillsFolder);
		if (!folder) {
			// Skills folder doesn't exist — that's fine, user may create it later
			return;
		}

		const files = this.app.vault.getMarkdownFiles().filter(
			(f) => f.path.startsWith(this.skillsFolder + '/'),
		);

		for (const file of files) {
			await this.loadVaultSkill(file);
		}
	}

	private async loadVaultSkill(file: TFile): Promise<void> {
		try {
			const content = await this.app!.vault.read(file);
			const skill = parseSkillMarkdown(content, 'vault', file.path);
			const errors = validateSkillDefinition(skill);
			if (errors.length > 0) {
				console.warn(`[SkillRegistry] Skill "${file.path}" has validation errors:`, errors);
				return;
			}
			this.skills.set(skill.id, skill);
		} catch (e) {
			// Not a valid skill file — silently ignore (user may have other .md files in folder)
			console.debug(`[SkillRegistry] Skipping "${file.path}":`, (e as Error).message);
		}
	}

	private isInSkillsFolder(path: string): boolean {
		return path.startsWith(this.skillsFolder + '/') && path.endsWith('.md');
	}

	private onFileChange(file: TAbstractFile): void {
		if (!(file instanceof (this.app!.vault.constructor as any).prototype.constructor) && 'path' in file) {
			// Duck-type check for TFile
		}
		if (!this.isInSkillsFolder(file.path)) return;
		const tFile = this.app!.vault.getAbstractFileByPath(file.path);
		if (tFile && 'stat' in tFile) {
			void this.loadVaultSkill(tFile as TFile);
		}
	}

	private onFileDelete(file: TAbstractFile): void {
		if (!this.isInSkillsFolder(file.path)) return;
		// Find and remove the skill that came from this file path
		for (const [id, skill] of this.skills) {
			if (skill.source === 'vault' && skill.filePath === file.path) {
				this.skills.delete(id);
				break;
			}
		}
	}

	private onFileRename(file: TAbstractFile, oldPath: string): void {
		// Remove skill from old path
		if (this.isInSkillsFolder(oldPath)) {
			for (const [id, skill] of this.skills) {
				if (skill.source === 'vault' && skill.filePath === oldPath) {
					this.skills.delete(id);
					break;
				}
			}
		}
		// Load from new path if it's in skills folder
		if (this.isInSkillsFolder(file.path)) {
			const tFile = this.app!.vault.getAbstractFileByPath(file.path);
			if (tFile && 'stat' in tFile) {
				void this.loadVaultSkill(tFile as TFile);
			}
		}
	}
}
