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
export type KindCategory = 'block' | 'metadata' | 'resource';

/** Badge palette class (maps to a `.pkfa-badge--*` variant). */
export type BadgeClass = 'meta' | 'block' | 'ok' | 'media' | 'vault' | 'external';

export interface KindConfig {
	label: string;
	/** User-facing plural label used in the advanced filter popover. */
	filterLabel?: string;
	badge: string;
	badgeClass: BadgeClass;
	type: KindType;
	category: KindCategory;
	/** Filter-popover group id. */
	group: string;
	/** False for structural child kinds controlled by their parent filter. */
	filterable?: boolean;
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

export interface FileAtlasRailConfig {
	/** Fixed Open + Recent target capacity; open files may overflow it. */
	capacity: number;
	defaultWidthPx: number;
	minWidthPx: number;
	maxWidthPx: number;
	/** Half-life for recency-weighted "Most used" ordering. */
	frequencyHalfLifeDays: number;
}

export interface FileAtlasIdentityLabels {
	bulletedList: string;
	numberedList: string;
	table: string;
	displayMath: string;
	diagram: string;
	flowchart: string;
	open: string;
	done: string;
	yes: string;
	no: string;
	htmlBlock: string;
	vaultNote: string;
	heading: string;
	block: string;
	noteSection: string;
	embeddedNote: string;
	canvas: string;
	base: string;
	video: string;
	audio: string;
	archive: string;
	attachment: string;
	frontmatter: string;
	inline: string;
	itemSingular: string;
	itemPlural: string;
	propertySingular: string;
	propertyPlural: string;
	tagSingular: string;
	tagPlural: string;
	lineSingular: string;
	linePlural: string;
	nodeSingular: string;
	nodePlural: string;
	paragraphSingular: string;
	paragraphPlural: string;
	resourceSingular: string;
	resourcePlural: string;
	nestedListSingular: string;
	nestedListPlural: string;
	taskSingular: string;
	taskPlural: string;
	occurrenceSingular: string;
	occurrencePlural: string;
	referencedOnce: string;
	referencedTwice: string;
	references: string;
}

export interface FileAtlasIdentityConfig {
	labels: FileAtlasIdentityLabels;
	providers: Record<string, string>;
	languages: Record<string, string>;
	fileTypes: Record<string, string>;
	valueTypes: Record<string, string>;
	/** RegExp source strings for transient import/enrichment placeholders. */
	placeholderTitlePatterns: string[];
	/** RegExp source strings stripped from imported companion-title suffixes. */
	companionTitleSuffixPatterns: string[];
}

export interface FileAtlasStrings {
	modeAtlas: string;
	modeCopilot: string;
	modeAmbient: string;
	modeDisabledHint: string;
	viewTree: string;
	viewGraph: string;
	graphDisabledHint: string;
	/** Read-only hint shown in the graph subview's atlas bar. */
	graphReadonlyHint: string;
	/** Tree subview hint shown in the tab row. */
	treeHint: string;
	graphScopeLocal: string;
	graphScopeTwoHop: string;
	graphScopeAI: string;
	graphSemanticLabel: string;
	graphSearchPlaceholder: string;
	graphSearchScope: string;
	searchPlaceholder: string;
	searchScope: string;
	filtersButton: string;
	flattenView: string;
	treeView: string;
	/** Filter popover header title. */
	filtersTitle: string;
	filtersHeadingHint: string;
	filtersSelectAll: string;
	filtersClearAll: string;
	expandAll: string;
	collapseAll: string;
	/** Synthetic frontmatter group row title. */
	frontmatterTitle: string;
	/** Inspector keyword-frequency card title. */
	keywordsTitle: string;
	keywordsEmpty: string;
	statisticsTitle: string;
	statWords: string;
	statCharacters: string;
	statLines: string;
	statItems: string;
	statTasks: string;
	statChecked: string;
	statUnchecked: string;
	statRows: string;
	statColumns: string;
	statCodeLines: string;
	statLanguage: string;
	statStatus: string;
	statParagraphs: string;
	statResources: string;
	statNestedLists: string;
	/** Left rail (open + recent documents) labels. */
	railTitle: string;
	railOpenTitle: string;
	railRecentTitle: string;
	railSortLabel: string;
	railSortFrequent: string;
	railSortName: string;
	railResizeLabel: string;
	/** Copy-button resting + copied labels. */
	copyLabel: string;
	copiedLabel: string;
	reliabilityBasic: string;
	reliabilityBasicHint: string;
	inspectorEmpty: string;
	treeEmpty: string;
	reveal: string;
	addToTray: string;
	copyLink: string;
	openTarget: string;
	sourceDetails: string;
	valueLabel: string;
	typeLabel: string;
	targetLabel: string;
	pathLabel: string;
	ownerContextLabel: string;
	occurrencesLabel: string;
	locationCard: string;
	lines: string;
	nearestHeading: string;
	trayTitle: string;
	sendToCopilot: string;
	sendToCopilotHint: string;
	copilotSuggestionsTitle: string;
	copilotSuggestionsEmpty: string;
	copilotSuggestionsLoading: string;
	copilotOpen: string;
}

/**
 * Stopword lists for the Inspector's naive term-frequency keyword card. Domain
 * data (not logic) per docs/conventions/configurability.md, so it lives in the
 * config template. `latin` drops common English function words; `cjk` drops
 * frequent Chinese bigrams that would otherwise dominate the count.
 */
export interface KeywordStopwords {
	latin: string[];
	cjk: string[];
}

export interface FileAtlasConfig {
	kinds: Record<string, KindConfig>;
	filterGroups: FilterGroup[];
	presets: PresetConfig[];
	identity: FileAtlasIdentityConfig;
	rail: FileAtlasRailConfig;
	strings: FileAtlasStrings;
	keywordStopwords: KeywordStopwords;
}

/** Default active preset on open — the compact owner-facing overview. */
export const DEFAULT_PRESET_ID = 'overview';

/** Compiled fallback — mirrors templates/config/file-atlas.json exactly. */
export const DEFAULT_FILE_ATLAS_CONFIG: FileAtlasConfig = {
	kinds: {
		'property':      { label: 'Property',      filterLabel: 'Properties',     badge: 'prop',     badgeClass: 'meta',     type: 'block',    category: 'metadata', group: 'metadata' },
		'tag':           { label: 'Tag',           filterLabel: 'Tags',           badge: 'tag',      badgeClass: 'meta',     type: 'block',    category: 'metadata', group: 'metadata' },
		'paragraph':     { label: 'Paragraph',     filterLabel: 'Paragraphs',     badge: 'text',     badgeClass: 'block',    type: 'block',    category: 'block',    group: 'content' },
		'list':          { label: 'List',          filterLabel: 'Lists',          badge: 'list',     badgeClass: 'block',    type: 'block',    category: 'block',    group: 'content' },
		'list-item':     { label: 'List item',                                      badge: 'item',     badgeClass: 'block',    type: 'block',    category: 'block',    group: 'content', filterable: false },
		'quote':         { label: 'Quote',         filterLabel: 'Quotes',         badge: 'quote',    badgeClass: 'block',    type: 'block',    category: 'block',    group: 'content' },
		'callout':       { label: 'Callout',       filterLabel: 'Callouts',       badge: 'callout',  badgeClass: 'block',    type: 'block',    category: 'block',    group: 'content' },
		'task':          { label: 'Task',          filterLabel: 'Tasks',          badge: 'task',     badgeClass: 'ok',       type: 'task',     category: 'block',    group: 'content' },
		'table':         { label: 'Table',         filterLabel: 'Tables',         badge: 'table',    badgeClass: 'block',    type: 'block',    category: 'resource', group: 'structured' },
		'code':          { label: 'Code',          filterLabel: 'Code',           badge: 'code',     badgeClass: 'block',    type: 'block',    category: 'resource', group: 'structured' },
		'math':          { label: 'Math',          filterLabel: 'Math',           badge: 'math',     badgeClass: 'block',    type: 'block',    category: 'resource', group: 'structured' },
		'mermaid':       { label: 'Mermaid',       filterLabel: 'Diagrams',       badge: 'mermaid',  badgeClass: 'block',    type: 'block',    category: 'resource', group: 'structured' },
		'image':         { label: 'Image',         filterLabel: 'Images',         badge: 'image',    badgeClass: 'media',    type: 'resource', category: 'resource', group: 'media' },
		'embed':         { label: 'Embed',         filterLabel: 'Embeds',         badge: 'embed',    badgeClass: 'media',    type: 'resource', category: 'resource', group: 'media' },
		'attachment':    { label: 'Attachment',    filterLabel: 'Attachments',    badge: 'file',     badgeClass: 'media',    type: 'resource', category: 'resource', group: 'media' },
		'vault-link':    { label: 'Vault link',    filterLabel: 'Vault links',    badge: 'vault',    badgeClass: 'vault',    type: 'resource', category: 'resource', group: 'links' },
		'external-link': { label: 'External link', filterLabel: 'External links', badge: 'external', badgeClass: 'external', type: 'resource', category: 'resource', group: 'links' },
		'footnote':      { label: 'Footnote',      filterLabel: 'Footnotes',      badge: 'note',     badgeClass: 'meta',     type: 'block',    category: 'resource', group: 'links' },
	},
	filterGroups: [
		{ id: 'content',    title: 'Content' },
		{ id: 'links',      title: 'Links & references' },
		{ id: 'media',      title: 'Media & files' },
		{ id: 'structured', title: 'Structured blocks' },
		{ id: 'metadata',   title: 'Metadata' },
	],
	presets: [
		{ id: 'overview',  label: 'Overview',     kinds: ['task', 'callout', 'table', 'mermaid', 'image', 'embed', 'attachment', 'vault-link', 'external-link', 'footnote'] as RawBlockKind[] },
		{ id: 'reading',   label: 'Read',         kinds: ['paragraph', 'list', 'quote', 'callout', 'task', 'image', 'embed', 'table', 'code', 'math', 'mermaid'] as RawBlockKind[] },
		{ id: 'writing',   label: 'Actions',      kinds: ['task', 'callout'] as RawBlockKind[] },
		{ id: 'resources', label: 'Resources',    kinds: ['vault-link', 'external-link', 'footnote', 'image', 'embed', 'attachment', 'table', 'code', 'math', 'mermaid'] as RawBlockKind[] },
		{ id: 'all',       label: 'All elements', kinds: ['property', 'tag', 'paragraph', 'list', 'quote', 'callout', 'task', 'table', 'code', 'math', 'mermaid', 'image', 'embed', 'attachment', 'vault-link', 'external-link', 'footnote'] as RawBlockKind[] },
	],
	identity: {
		labels: {
			bulletedList: 'Bulleted list',
			numberedList: 'Numbered list',
			table: 'Table',
			displayMath: 'Display math',
			diagram: 'Diagram',
			flowchart: 'Flowchart',
			open: 'Open',
			done: 'Done',
			yes: 'Yes',
			no: 'No',
			htmlBlock: 'HTML block',
			vaultNote: 'Vault note',
			heading: 'Heading',
			block: 'Block',
			noteSection: 'note section',
			embeddedNote: 'Embedded note',
			canvas: 'Canvas',
			base: 'Base',
			video: 'Video',
			audio: 'Audio',
			archive: 'Archive',
			attachment: 'Attachment',
			frontmatter: 'Frontmatter',
			inline: 'Inline',
			itemSingular: 'item',
			itemPlural: 'items',
			propertySingular: 'property',
			propertyPlural: 'properties',
			tagSingular: 'tag',
			tagPlural: 'tags',
			lineSingular: 'line',
			linePlural: 'lines',
			nodeSingular: 'node',
			nodePlural: 'nodes',
			paragraphSingular: 'paragraph',
			paragraphPlural: 'paragraphs',
			resourceSingular: 'resource',
			resourcePlural: 'resources',
			nestedListSingular: 'nested list',
			nestedListPlural: 'nested lists',
			taskSingular: 'task',
			taskPlural: 'tasks',
			occurrenceSingular: 'occurrence',
			occurrencePlural: 'occurrences',
			referencedOnce: 'referenced once',
			referencedTwice: 'referenced twice',
			references: 'references',
		},
		providers: {
			'en.wikipedia.org': 'Wikipedia',
			'wikipedia.org': 'Wikipedia',
			'github.com': 'GitHub',
			'help.obsidian.md': 'Obsidian Help',
			'obsidian.md': 'Obsidian',
			'developer.mozilla.org': 'MDN',
			'platform.openai.com': 'OpenAI',
			'openai.com': 'OpenAI',
			'notion.so': 'Notion',
			'www.notion.so': 'Notion',
		},
		languages: {
			ts: 'TypeScript',
			typescript: 'TypeScript',
			js: 'JavaScript',
			javascript: 'JavaScript',
			py: 'Python',
			python: 'Python',
			json: 'JSON',
			css: 'CSS',
			html: 'HTML',
			text: 'Text',
		},
		fileTypes: {
			pdf: 'PDF',
			mp4: 'Video',
			mov: 'Video',
			webm: 'Video',
			mkv: 'Video',
			mp3: 'Audio',
			wav: 'Audio',
			ogg: 'Audio',
			m4a: 'Audio',
			zip: 'Archive',
			docx: 'Word',
			pptx: 'PowerPoint',
			xlsx: 'Excel',
			epub: 'EPUB',
		},
		valueTypes: {
			array: 'List',
			boolean: 'Boolean',
			date: 'Date',
			number: 'Number',
			object: 'Object',
			text: 'Text',
			url: 'URL',
			'vault-link': 'Vault link',
		},
		placeholderTitlePatterns: ['^Fetching Title(?:#.*)?$'],
		companionTitleSuffixPatterns: ['\\s+-\\s+(?:Wikipedia|维基百科)$'],
	},
	rail: {
		capacity: 24,
		defaultWidthPx: 300,
		minWidthPx: 260,
		maxWidthPx: 420,
		frequencyHalfLifeDays: 30,
	},
	strings: {
		modeAtlas: 'Atlas',
		modeCopilot: 'Copilot',
		modeAmbient: 'Ambient',
		modeDisabledHint: 'Available in a later phase',
		viewTree: 'Tree',
		viewGraph: 'Graph',
		graphDisabledHint: 'Graph subview arrives in a later phase',
		graphReadonlyHint: 'Read-only neighborhood from vault links around this note',
		treeHint: 'Outline of every block, resource & heading in this note',
		graphScopeLocal: 'One hop',
		graphScopeTwoHop: 'Two hop',
		graphScopeAI: 'AI Graph',
		graphSemanticLabel: 'Semantic links',
		graphSearchPlaceholder: 'Search notes in this graph...',
		graphSearchScope: 'graph notes',
		searchPlaceholder: "Search this document's blocks, links, and headings...",
		searchScope: 'document',
		filtersButton: 'Filters',
		flattenView: 'Flatten document order',
		treeView: 'Restore hierarchy',
		filtersTitle: 'Visible block types',
		filtersHeadingHint: 'Headings always stay visible',
		filtersSelectAll: 'Select all',
		filtersClearAll: 'Clear all',
		expandAll: 'Expand all',
		collapseAll: 'Collapse all',
		frontmatterTitle: 'Metadata',
		keywordsTitle: 'Keywords · term frequency',
		keywordsEmpty: 'No meaningful keywords',
		statisticsTitle: 'Statistics',
		statWords: 'Words',
		statCharacters: 'Characters',
		statLines: 'Lines',
		statItems: 'Items',
		statTasks: 'Tasks',
		statChecked: 'Checked',
		statUnchecked: 'Unchecked',
		statRows: 'Rows',
		statColumns: 'Columns',
		statCodeLines: 'Code lines',
		statLanguage: 'Language',
		statStatus: 'Status',
		statParagraphs: 'Paragraphs',
		statResources: 'Resources',
		statNestedLists: 'Nested lists',
		railTitle: 'Files',
		railOpenTitle: 'Open',
		railRecentTitle: 'Recent',
		railSortLabel: 'Sort files',
		railSortFrequent: 'Most used',
		railSortName: 'Name',
		railResizeLabel: 'Resize file rail',
		copyLabel: 'Copy',
		copiedLabel: 'Copied',
		reliabilityBasic: 'Basic anchors',
		reliabilityBasicHint:
			'Anchors matched by content hash + heading + ordinal. Git-aware anchors arrive in a later phase.',
		inspectorEmpty: 'Select a block, resource, or heading to inspect it.',
		treeEmpty: 'No elements match this view.',
		reveal: 'Reveal',
		addToTray: 'Add to tray',
		copyLink: 'Copy link',
		openTarget: 'Open target',
		sourceDetails: 'Technical details',
		valueLabel: 'Value',
		typeLabel: 'Type',
		targetLabel: 'Target',
		pathLabel: 'Path',
		ownerContextLabel: 'Owner context',
		occurrencesLabel: 'Occurrences',
		locationCard: 'Facts',
		lines: 'Lines',
		nearestHeading: 'Nearest heading',
		trayTitle: 'Tray',
		sendToCopilot: 'Send to Copilot',
		sendToCopilotHint: 'Opens the same document Copilot runtime; File Atlas remains read-only',
		copilotSuggestionsTitle: 'Copilot suggestions',
		copilotSuggestionsEmpty: 'No current suggestions for this note.',
		copilotSuggestionsLoading: 'Loading document suggestions…',
		copilotOpen: 'Discuss in Copilot',
	},
	keywordStopwords: {
		latin: ['the', 'and', 'for', 'that', 'this', 'with', 'you', 'are', 'but', 'not', 'can', 'has', 'was', 'from', 'into', 'per', 'its'],
		cjk: ['一种', '一个', '自己', '的时', '时候', '就是', '可以', '这个', '那个', '起来', '一些', '然后', '但是', '这种'],
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
			identity: {
				...DEFAULT_FILE_ATLAS_CONFIG.identity,
				...(parsed.identity ?? {}),
				labels: {
					...DEFAULT_FILE_ATLAS_CONFIG.identity.labels,
					...(parsed.identity?.labels ?? {}),
				},
				providers: {
					...DEFAULT_FILE_ATLAS_CONFIG.identity.providers,
					...(parsed.identity?.providers ?? {}),
				},
				languages: {
					...DEFAULT_FILE_ATLAS_CONFIG.identity.languages,
					...(parsed.identity?.languages ?? {}),
				},
				fileTypes: {
					...DEFAULT_FILE_ATLAS_CONFIG.identity.fileTypes,
					...(parsed.identity?.fileTypes ?? {}),
				},
				valueTypes: {
					...DEFAULT_FILE_ATLAS_CONFIG.identity.valueTypes,
					...(parsed.identity?.valueTypes ?? {}),
				},
			},
			rail: { ...DEFAULT_FILE_ATLAS_CONFIG.rail, ...(parsed.rail ?? {}) },
			strings: { ...DEFAULT_FILE_ATLAS_CONFIG.strings, ...(parsed.strings ?? {}) },
			keywordStopwords: parsed.keywordStopwords ?? DEFAULT_FILE_ATLAS_CONFIG.keywordStopwords,
		};
	} catch {
		return DEFAULT_FILE_ATLAS_CONFIG;
	}
}
