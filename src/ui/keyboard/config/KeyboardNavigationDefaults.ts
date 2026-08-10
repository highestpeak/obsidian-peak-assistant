import type { PeakKeyboardSurfaceId } from '../KeyboardNavigationPort';

/**
 * Compiled fallback mirrored by `templates/config/keyboard-navigation.json`.
 * The JSON template is the product-owned source for labels and key assignments.
 * This fallback keeps Key Tips available during early plugin boot.
 */
export interface PeakKeyTipDefinition {
	key: string;
	label: string;
	zoneId: string;
	/** Surface adapter action used for destinations that may not be mounted yet. */
	actionId?: string;
	/** Distinguishes dynamic destinations that reuse one internal focus group. */
	zoneLabel?: string;
}

/**
 * Stable button-level Key Tips. Components publish these keys on the exact
 * focus target with `data-peak-keytip-key`; labels stay in the accessible name
 * and are deliberately not rendered in the visual badge.
 *
 * Mirrored by `templates/config/keyboard-navigation.json#controlKeys`.
 */
export const PEAK_CONTROL_KEY_TIP_KEYS = {
	search: {
		vaultTab: 'V',
		aiTab: 'A',
		aiWorkspace: 'W',
		refine: 'E',
		view: { list: 'L', tree: 'T', graph: 'G' },
		density: { compact: 'C', detailed: 'D' },
		graphPreset: {
			constellation: 'C',
			community: 'F',
			flowTb: 'D',
			flowLr: '1',
			folder: 'K',
			orbit: 'O',
		},
		graphSemantic: 'S',
		graphCanvas: { nodeList: 'Z', copyMermaid: 'J', copyImage: 'I', fullscreen: '2' },
		clearPinnedHub: 'U',
		inspector: {
			pin: 'P',
			openAtlas: 'M',
			close: 'X',
			connected: 'N',
			discovered: 'H',
			aiGraph: 'B',
			createGraph: 'Y',
		},
	},
	aiSearch: {
		web: 'B',
		cancel: 'X',
		newAnalysis: 'N',
		lifecycle: { process: 'P', report: 'R', sources: 'S', graph: 'F' },
		outline: 'O',
		sources: {
			view: { list: 'L', tree: 'T', graph: 'I' },
			density: { compact: '1', detailed: '2' },
			graphScope: { oneHop: 'J', twoHop: 'K', ai: 'Z' },
			copyLinks: '0',
			graphPreset: {
				constellation: '1',
				community: '0',
				flowTb: '2',
				flowLr: '3',
				folder: '4',
				orbit: '5',
			},
			graphSemantic: '6',
			graphCanvas: { nodeList: '7', copyMermaid: '8', copyImage: '9', fullscreen: 'Q' },
			empty: { twoHop: '1', ai: '2' },
		},
		actions: {
			copy: 'C',
			export: 'E',
			saveGraph: 'G',
			openSaved: 'D',
			synthesize: 'Y',
			continue: 'U',
			openChat: 'H',
		},
	},
	fileAtlas: {
		sort: 'O',
		tree: 'T',
		graph: 'G',
		search: 'Q',
		preset: { overview: 'P', reading: 'R', writing: 'W', resources: 'U', all: 'A' },
		filters: 'K',
		flatten: 'L',
		expandAll: 'E',
		collapseAll: 'C',
		graphScope: { oneHop: 'N', twoHop: 'H', ai: 'A' },
		graphLayout: {
			constellation: 'C',
			community: 'M',
			flowTb: 'D',
			flowLr: 'R',
			folder: 'K',
			orbit: 'P',
		},
		semantic: 'V',
		graphCanvas: { nodeList: 'L', copyMermaid: 'W', copyImage: 'B', fullscreen: 'X' },
	},
	chatStudio: {
		openLeft: 'C',
		closeLeft: 'X',
		newChat: 'N',
		searchVault: 'K',
		header: { branch: 'D', openSource: 'O', refresh: 'R', restoreIndex: 'I' },
		composer: {
			plus: 'P',
			sources: 'S',
			graph: 'G',
			assistant: 'A',
			model: 'L',
			send: 'E',
		},
		index: { collapse: 'X', outline: 'B', resources: 'U' },
	},
	composer: {
		workspaceBack: 'B',
		workspaceForward: 'F',
		display: { edit: 'E', clean: 'V', markdown: 'M' },
		reviewAll: 'R',
		comments: 'C',
		intelligence: 'I',
		undo: 'U',
		redo: 'Y',
		sidecar: {
			close: 'X',
			copilot: 'P',
			history: 'H',
			scope: 'W',
			sensing: 'N',
			ask: 'A',
			graphs: 'G',
			refresh: 'D',
		},
		modal: { close: 'X', previous: 'B', next: 'F', locate: 'L' },
	},
} as const;

export const PEAK_KEY_TIP_ACTIVATION = {
	holdDelayMs: 180,
	gesture: 'press-or-tap',
} as const;

export const PEAK_KEY_TIP_DEFINITIONS: Readonly<
	Record<PeakKeyboardSurfaceId, readonly PeakKeyTipDefinition[]>
> = {
	'vault-search': [
		{ key: 'Q', label: 'Search', zoneId: 'vs-query' },
		{ key: 'R', label: 'Results', zoneId: 'vs-results' },
	],
	'ai-search': [
		{ key: 'Q', label: 'Ask AI', zoneId: 'as-mode-query' },
		{ key: 'S', label: 'Suggestions and history', zoneId: 'as-suggestions' },
	],
	'file-atlas': [
		{ key: 'F', label: 'Files', zoneId: 'fa-file-rail' },
		{ key: 'I', label: 'Inspector', zoneId: 'fa-inspector' },
		{ key: 'S', label: 'Selection tray', zoneId: 'fa-selection-tray' },
	],
	'chat-studio': [
		{ key: 'C', label: 'Conversations', zoneId: 'cs-left-navigation' },
		{ key: 'M', label: 'Messages', zoneId: 'cs-message-timeline' },
		{ key: 'Q', label: 'Chat input', zoneId: 'cs-composer' },
		{ key: 'I', label: 'Conversation index', zoneId: 'cs-conversation-index' },
	],
	composer: [
		{ key: 'Q', label: 'Document', zoneId: 'cv-document', actionId: 'document' },
		{ key: 'T', label: 'Selection actions', zoneId: 'cv-contextual', actionId: 'selection-toolbar' },
		{ key: 'K', label: 'Block actions', zoneId: 'cv-contextual', actionId: 'block-actions' },
		{ key: 'O', label: 'Object actions', zoneId: 'cv-contextual', actionId: 'object-toolbar' },
		{ key: 'S', label: 'Intelligence content', zoneId: 'cv-sidecar-content', actionId: 'sidecar-content' },
	],
} as const;

export const PEAK_KEYBOARD_SURFACE_LABELS: Readonly<Record<PeakKeyboardSurfaceId, string>> = {
	'vault-search': 'Vault Search',
	'ai-search': 'AI Search',
	'file-atlas': 'File Atlas',
	'chat-studio': 'Chat Studio',
	composer: 'Composer',
};

export const PEAK_KEYBOARD_ZONE_LABELS = {
	'search-mode': 'Search modes',
	'vs-query': 'Query',
	'vs-view-toolbar': 'View and scope',
	'vs-results': 'Results',
	'vs-inspector': 'Inspector',
	'as-mode-query': 'AI mode and query',
	'as-suggestions': 'Suggestions and history',
	'as-lifecycle': 'Activity, report, and sources',
	'as-primary': 'Primary content',
	'as-outline': 'Report outline',
	'as-actions': 'Actions',
	'fa-file-rail': 'Files',
	'fa-view-filters': 'View tabs and filters',
	'fa-atlas-tree': 'Atlas tree',
	'fa-atlas-graph': 'Atlas graph',
	'fa-inspector': 'Inspector',
	'fa-selection-tray': 'Selection tray',
	'cs-left-navigation': 'Conversations',
	'cs-centre-content': 'Centre content',
	'cs-message-timeline': 'Messages',
	'cs-composer': 'Composer',
	'cs-conversation-index': 'Conversation index',
	'cv-controlbar': 'Document controls',
	'cv-document': 'Document',
	'cv-contextual': 'Contextual actions',
	'cv-sidecar-tabs': 'Intelligence tabs',
	'cv-sidecar-content': 'Intelligence content',
	'cv-comments': 'Comments',
} as const;

export const PEAK_KEYBOARD_A11Y_STRINGS = {
	searchSurface: 'Search surface',
	aiSearchMode: 'AI Search mode',
	searchModes: 'Search modes',
	vaultSearchResults: 'Vault Search results',
	aiSearchLifecycle: 'AI Search lifecycle',
	aiSearchActions: 'AI Search actions',
	copyAnalysis: 'Copy analysis',
	tableOfContents: 'Table of contents',
	openTableOfContents: 'Open table of contents',
	closeTableOfContents: 'Close table of contents',
	reportHeadings: 'Report headings',
	documentBlocks: 'Document blocks',
	graphNodes: 'Graph nodes',
	openGraphNodeList: 'Open graph node list',
	closeGraphNodeList: 'Close graph node list',
	graphInstructions: 'Knowledge graph. Use arrow keys to move between nodes, Enter to open, Space to select, plus and minus to zoom, and zero to fit.',
	conversations: 'Conversations',
} as const;

export const PEAK_KEY_TIP_STRINGS = {
	shownSuffix: 'shortcuts shown',
	availablePrefix: 'Available keys',
	unknownPrefix: 'No shortcut for',
} as const;
