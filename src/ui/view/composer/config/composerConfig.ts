/**
 * Peak Composer — domain config (typed fallback + loader).
 *
 * Mirrors templates/config/composer.json. Per docs/conventions/configurability.md,
 * all user-facing labels (view title, lifecycle state copy, per-kind block
 * labels, fold aria) are domain config data, so they live in the JSON template;
 * this module is the compiled fallback used at cold-start / in tests / in the
 * browser harness where the TemplateManager is not available.
 *
 * No label/regex/threshold is hardcoded in the render logic — the UI reads
 * everything through {@link ComposerConfig}.
 */

import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import type { ComposerBlockKind } from '@/core/composer';

export interface ComposerStrings {
	displayText: string;
	emptyTitle: string;
	emptyHint: string;
	loading: string;
	missingTitle: string;
	missingHint: string;
	staleTitle: string;
	staleHint: string;
	revalidate: string;
	errorTitle: string;
	collapseBlock: string;
	expandBlock: string;
	collapseSection: string;
	expandSection: string;
	/** Suffix appended to a kind label for the unknown/unsupported fallback. */
	unknownFallback: string;
	/** Collapsed-block summary shown when a block has no text preview. */
	emptyPreview: string;
	/** Read-only banner label. */
	readOnlyBadge: string;
	blocksSuffix: string;
}

export interface ComposerConfig {
	/** Per-block-kind display label. */
	kinds: Record<ComposerBlockKind, string>;
	strings: ComposerStrings;
}

export const DEFAULT_COMPOSER_CONFIG: ComposerConfig = {
	kinds: {
		frontmatter: 'Frontmatter',
		heading: 'Heading',
		paragraph: 'Paragraph',
		list: 'List',
		task: 'Tasks',
		quote: 'Quote',
		callout: 'Callout',
		divider: 'Divider',
		code: 'Code',
		math: 'Formula',
		table: 'Table',
		image: 'Image',
		mermaid: 'Mermaid',
		dataview: 'Dataview',
		html: 'HTML',
		comment: 'Comment',
		'footnote-def': 'Footnote',
		embed: 'Embed',
		base: 'Base',
		canvas: 'Canvas',
		excalidraw: 'Excalidraw',
		unknown: 'Unsupported',
	},
	strings: {
		displayText: 'Composer',
		emptyTitle: 'No document open',
		emptyHint: 'Open a Markdown note to compose it here.',
		loading: 'Loading document…',
		missingTitle: 'Document removed',
		missingHint: 'The file backing this composer was deleted.',
		staleTitle: 'Document changed on disk',
		staleHint: 'This note was modified outside the composer.',
		revalidate: 'Reload from file',
		errorTitle: 'Could not open document',
		collapseBlock: 'Collapse block',
		expandBlock: 'Expand block',
		collapseSection: 'Collapse section',
		expandSection: 'Expand section',
		unknownFallback: 'shown verbatim',
		emptyPreview: '(empty)',
		readOnlyBadge: 'Read-only preview',
		blocksSuffix: 'blocks',
	},
};

/**
 * Load the composer config, preferring the runtime JSON template and falling
 * back to the compiled default on any failure.
 */
export async function loadComposerConfig(): Promise<ComposerConfig> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_COMPOSER_CONFIG;
		const parsed = await tm.loadJson<Partial<ComposerConfig>>(ConfigTemplateId.Composer);
		if (!parsed || typeof parsed !== 'object') return DEFAULT_COMPOSER_CONFIG;
		return {
			kinds: { ...DEFAULT_COMPOSER_CONFIG.kinds, ...(parsed.kinds ?? {}) },
			strings: { ...DEFAULT_COMPOSER_CONFIG.strings, ...(parsed.strings ?? {}) },
		};
	} catch {
		return DEFAULT_COMPOSER_CONFIG;
	}
}
