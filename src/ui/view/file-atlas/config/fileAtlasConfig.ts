/**
 * File Atlas — domain config (typed fallback + loader).
 *
 * Mirrors templates/config/file-atlas.json. Per docs/conventions/configurability.md,
 * the kind→label/badge/category map, filter groups, preset definitions, and
 * UI strings are domain config data that a non-engineer might tweak, so they
 * live in the JSON template; this module is the compiled fallback used at
 * cold-start / in tests / when the template is unavailable.
 *
 * Icon component mapping is deliberately NOT here — React components can't live
 * in JSON. See ./kindIcons.tsx, keyed by the same RawBlockKind values.
 *
 * Drift guard: test/file-atlas-config.test.ts asserts this fallback and the
 * JSON stay shape-compatible.
 */

import { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import type { RawBlockKind } from '@/core/document/atlas/types';

/** Visual/semantic type slot driving row icon color + badge palette. */
export type KindType = 'heading' | 'block' | 'task' | 'resource';

/** Top-level category used for collapsed-heading count summaries + stats. */
export type KindCategory = 'block' | 'resource';

/** Badge palette class (maps to a `.pkfa-badge--*` variant). */
export type BadgeClass = 'meta' | 'block' | 'ok' | 'media' | 'vault' | 'external';

export interface KindConfig {
	label: string;
	badge: string;
	badgeClass: BadgeClass;
	type: KindType;
	category: KindCategory;
	/** Filter-popover group id. */
	group: string;
}

export interface FilterGroup {
	id: string;
	title: string;
}

export interface PresetConfig {
	id: string;
	label: string;
	/** Raw block kinds visible under this preset. */
	kinds: RawBlockKind[];
}

export interface FileAtlasStrings {
	modeAtlas: string;
	modeCopilot: string;
	modeAmbient: string;
	modeDisabledHint: string;
	viewTree: string;
	viewGraph: string;
	graphDisabledHint: string;
	searchPlaceholder: string;
	searchScope: string;
	filtersButton: string;
	filtersHeadingHint: string;
	expandAll: string;
	collapseAll: string;
	reliabilityBasic: string;
	reliabilityBasicHint: string;
	inspectorEmpty: string;
	reveal: string;
	addToTray: string;
	copyLink: string;
	locationCard: string;
	lines: string;
	nearestHeading: string;
	trayTitle: string;
	sendToCopilot: string;
	sendToCopilotHint: string;
}

export interface FileAtlasConfig {
	kinds: Record<string, KindConfig>;
	filterGroups: FilterGroup[];
	presets: PresetConfig[];
	strings: FileAtlasStrings;
}

/** Compiled fallback — mirrors templates/config/file-atlas.json exactly. */
export const DEFAULT_FILE_ATLAS_CONFIG: FileAtlasConfig = {
	kinds: {
		'property':      { label: 'Property',      badge: 'prop',     badgeClass: 'meta',     type: 'block',    category: 'resource', group: 'references' },
		'tag':           { label: 'Tag',           badge: 'tag',      badgeClass: 'meta',     type: 'block',    category: 'resource', group: 'references' },
		'paragraph':     { label: 'Paragraph',     badge: 'text',     badgeClass: 'block',    type: 'block',    category: 'block',    group: 'structure' },
		'list':          { label: 'List',          badge: 'list',     badgeClass: 'block',    type: 'block',    category: 'block',    group: 'structure' },
		'quote':         { label: 'Quote',         badge: 'quote',    badgeClass: 'block',    type: 'block',    category: 'block',    group: 'structure' },
		'callout':       { label: 'Callout',       badge: 'callout',  badgeClass: 'block',    type: 'block',    category: 'block',    group: 'structure' },
		'task':          { label: 'Task',          badge: 'task',     badgeClass: 'ok',       type: 'task',     category: 'block',    group: 'structure' },
		'table':         { label: 'Table',         badge: 'table',    badgeClass: 'block',    type: 'block',    category: 'block',    group: 'rich' },
		'code':          { label: 'Code',          badge: 'code',     badgeClass: 'block',    type: 'block',    category: 'block',    group: 'rich' },
		'math':          { label: 'Math',          badge: 'math',     badgeClass: 'block',    type: 'block',    category: 'block',    group: 'rich' },
		'mermaid':       { label: 'Mermaid',       badge: 'mermaid',  badgeClass: 'block',    type: 'block',    category: 'block',    group: 'rich' },
		'image':         { label: 'Image',         badge: 'image',    badgeClass: 'media',    type: 'resource', category: 'resource', group: 'media' },
		'embed':         { label: 'Embed',         badge: 'embed',    badgeClass: 'media',    type: 'resource', category: 'resource', group: 'media' },
		'attachment':    { label: 'Attachment',    badge: 'file',     badgeClass: 'media',    type: 'resource', category: 'resource', group: 'media' },
		'vault-link':    { label: 'Vault link',    badge: 'vault',    badgeClass: 'vault',    type: 'resource', category: 'resource', group: 'references' },
		'external-link': { label: 'External link', badge: 'external', badgeClass: 'external', type: 'resource', category: 'resource', group: 'references' },
		'footnote':      { label: 'Footnote',      badge: 'note',     badgeClass: 'meta',     type: 'block',    category: 'resource', group: 'references' },
	},
	filterGroups: [
		{ id: 'structure',  title: 'Structure' },
		{ id: 'rich',       title: 'Rich blocks' },
		{ id: 'media',      title: 'Media & embeds' },
		{ id: 'references', title: 'References' },
	],
	presets: [
		{ id: 'overview',  label: 'Overview',  kinds: ['task', 'table', 'code', 'math', 'mermaid', 'vault-link', 'external-link', 'tag', 'footnote', 'property', 'image', 'embed', 'attachment'] as RawBlockKind[] },
		{ id: 'reading',   label: 'Reading',   kinds: ['paragraph', 'list', 'quote', 'callout', 'task', 'image', 'table', 'mermaid'] as RawBlockKind[] },
		{ id: 'writing',   label: 'Writing',   kinds: ['task', 'callout', 'quote'] as RawBlockKind[] },
		{ id: 'resources', label: 'Resources', kinds: ['vault-link', 'external-link', 'tag', 'footnote', 'property', 'image', 'embed', 'attachment', 'table', 'code', 'math', 'mermaid'] as RawBlockKind[] },
		{ id: 'all',       label: 'All',       kinds: ['property', 'tag', 'paragraph', 'list', 'quote', 'callout', 'task', 'table', 'code', 'math', 'mermaid', 'image', 'embed', 'attachment', 'vault-link', 'external-link', 'footnote'] as RawBlockKind[] },
	],
	strings: {
		modeAtlas: 'Atlas',
		modeCopilot: 'Copilot',
		modeAmbient: 'Ambient',
		modeDisabledHint: 'Available in a later phase',
		viewTree: 'Tree',
		viewGraph: 'Graph',
		graphDisabledHint: 'Graph subview arrives in a later phase',
		searchPlaceholder: "Search this document's blocks, links, and headings...",
		searchScope: 'document',
		filtersButton: 'Filters',
		filtersHeadingHint: 'Headings always stay visible',
		expandAll: 'Expand all',
		collapseAll: 'Collapse all',
		reliabilityBasic: 'Basic anchors',
		reliabilityBasicHint:
			'Anchors matched by content hash + heading + ordinal. Git-aware anchors arrive in a later phase.',
		inspectorEmpty: 'Select a block, resource, or heading to inspect it.',
		reveal: 'Reveal',
		addToTray: 'Add to tray',
		copyLink: 'Copy link',
		locationCard: 'Location',
		lines: 'Lines',
		nearestHeading: 'Nearest heading',
		trayTitle: 'Tray',
		sendToCopilot: 'Send to Copilot',
		sendToCopilotHint: 'Copilot handoff arrives in a later phase',
	},
};

/**
 * Load the File Atlas config, preferring the runtime JSON template and falling
 * back to the compiled default on any failure (cold-start / tests / missing).
 */
export async function loadFileAtlasConfig(): Promise<FileAtlasConfig> {
	try {
		const tm = TemplateManager.getInstance();
		if (!tm) return DEFAULT_FILE_ATLAS_CONFIG;
		const parsed = await tm.loadJson<Partial<FileAtlasConfig>>(ConfigTemplateId.FileAtlas);
		if (!parsed || typeof parsed !== 'object') return DEFAULT_FILE_ATLAS_CONFIG;
		return {
			kinds: parsed.kinds ?? DEFAULT_FILE_ATLAS_CONFIG.kinds,
			filterGroups: parsed.filterGroups ?? DEFAULT_FILE_ATLAS_CONFIG.filterGroups,
			presets: parsed.presets ?? DEFAULT_FILE_ATLAS_CONFIG.presets,
			strings: { ...DEFAULT_FILE_ATLAS_CONFIG.strings, ...(parsed.strings ?? {}) },
		};
	} catch {
		return DEFAULT_FILE_ATLAS_CONFIG;
	}
}
