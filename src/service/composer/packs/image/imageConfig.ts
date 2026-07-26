/**
 * Peak Composer — image pack domain config (WP7).
 *
 * Typed fallback + loader for the top-level `image` key of
 * `templates/config/composer.json`. Per docs/conventions/configurability.md the
 * locale-specific "noisy" default filenames (Obsidian's `Pasted image …`,
 * `Screenshot …`, etc.) and the layout defaults are DOMAIN CONFIG DATA, not
 * inline constants — this module is the documented compiled fallback used at
 * cold-start / in tests. Pure filesystem-safety sanitisation (illegal chars) is
 * a structural constraint and stays inline in `imageNaming.ts`.
 */

import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import type { ComposerImageLayoutMode } from '@/core/schemas/composer';

export interface ImageNamingConfig {
	/** Base name used when nothing meaningful survives cleanup. */
	fallbackBaseName: string;
	/**
	 * Lower-cased noise tokens stripped from a raw filename before slugging
	 * (host auto-generated prefixes carry no meaning). Matched as whole leading
	 * words, longest-first.
	 */
	noiseTokens: readonly string[];
	/** Max slug length (characters) before truncation. */
	maxLength: number;
}

export interface ImageLayoutConfig {
	defaultMode: ComposerImageLayoutMode;
	/** Inter-image gap in px. */
	defaultGap: number;
	/** Grid / masonry column count. */
	defaultColumns: number;
}

export interface ImageConverterConfig {
	/** Default lossy quality for JPEG/WebP re-encode (0..1). */
	defaultQuality: number;
}

export interface ImageEditConfig {
	/**
	 * Media-generation preset id used for AI 改图 (instruction-first image edit).
	 * Routes through the shared MediaGenerationService; mirrors the Chat composer's
	 * `EditPresetId` ("edit-default" | "edit-fill" | "native-edit").
	 */
	presetId: string;
}

export interface ImageDomainConfig {
	naming: ImageNamingConfig;
	layout: ImageLayoutConfig;
	converter: ImageConverterConfig;
	edit: ImageEditConfig;
}

/** Compiled fallback — mirrors templates/config/composer.json `image`. */
export const DEFAULT_IMAGE_DOMAIN_CONFIG: ImageDomainConfig = {
	naming: {
		fallbackBaseName: 'image',
		noiseTokens: ['pasted image', 'pasted', 'screenshot', 'screen shot', 'screen recording', 'image', 'photo', 'img', 'untitled'],
		maxLength: 60,
	},
	layout: {
		defaultMode: 'grid',
		defaultGap: 8,
		defaultColumns: 3,
	},
	converter: {
		defaultQuality: 0.9,
	},
	edit: {
		presetId: 'edit-default',
	},
};

export type ImageDomainConfigProvider = () => ImageDomainConfig;

/** Load the image domain config (JSON template first, compiled fallback otherwise). */
export async function loadImageDomainConfig(): Promise<ImageDomainConfig> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_IMAGE_DOMAIN_CONFIG;
		const parsed = await tm.loadJson<{ image?: Partial<ImageDomainConfig> }>(ConfigTemplateId.Composer);
		const section = parsed?.image;
		if (!section || typeof section !== 'object') return DEFAULT_IMAGE_DOMAIN_CONFIG;
		return {
			naming: { ...DEFAULT_IMAGE_DOMAIN_CONFIG.naming, ...(section.naming ?? {}) },
			layout: { ...DEFAULT_IMAGE_DOMAIN_CONFIG.layout, ...(section.layout ?? {}) },
			converter: { ...DEFAULT_IMAGE_DOMAIN_CONFIG.converter, ...(section.converter ?? {}) },
			edit: { ...DEFAULT_IMAGE_DOMAIN_CONFIG.edit, ...(section.edit ?? {}) },
		};
	} catch {
		return DEFAULT_IMAGE_DOMAIN_CONFIG;
	}
}
