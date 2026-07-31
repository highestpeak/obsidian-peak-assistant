import type {
	PeakKeyboardMapCategory,
	PeakKeyboardSurfaceId,
} from '../KeyboardNavigationPort';

/**
 * Compiled fallback mirrored by `templates/config/keyboard-navigation.json`.
 * The JSON template is the product-owned source for labels and discoverability;
 * this fallback keeps keyboard navigation available if templates have not
 * finished loading during early plugin boot.
 */
export interface KeyboardMapDefinition {
	id: string;
	label: string;
	category: PeakKeyboardMapCategory;
	binding: string;
	commandId?: string;
	surfaceId?: PeakKeyboardSurfaceId;
	zoneId?: string;
	context: string;
}

export const KEYBOARD_MAP_DEFINITIONS: readonly KeyboardMapDefinition[] = [
	{
		id: 'focus-vault-search',
		label: 'Focus Vault Search',
		category: 'Navigation',
		binding: '',
		commandId: 'peak-focus-vault-search',
		context: 'Global Obsidian command',
	},
	{
		id: 'focus-ai-search',
		label: 'Focus AI Search',
		category: 'Navigation',
		binding: '',
		commandId: 'peak-focus-ai-search',
		context: 'Global Obsidian command',
	},
	{
		id: 'focus-file-atlas',
		label: 'Focus File Atlas',
		category: 'Navigation',
		binding: '',
		commandId: 'peak-focus-file-atlas',
		context: 'Global Obsidian command',
	},
	{
		id: 'focus-chat-studio',
		label: 'Focus Chat Studio',
		category: 'Navigation',
		binding: '',
		commandId: 'peak-focus-chat-studio',
		context: 'Global Obsidian command',
	},
	{
		id: 'focus-next-zone',
		label: 'Focus next zone',
		category: 'Navigation',
		binding: 'F6',
		commandId: 'peak-focus-next-zone',
		context: 'Current Peak surface',
	},
	{
		id: 'focus-previous-zone',
		label: 'Focus previous zone',
		category: 'Navigation',
		binding: 'Shift+F6',
		commandId: 'peak-focus-previous-zone',
		context: 'Current Peak surface',
	},
	{
		id: 'next-component',
		label: 'Focus next component',
		category: 'Navigation',
		binding: 'Tab',
		context: 'Current zone',
	},
	{
		id: 'previous-component',
		label: 'Focus previous component',
		category: 'Navigation',
		binding: 'Shift+Tab',
		context: 'Current zone',
	},
	{
		id: 'move-item',
		label: 'Move within list, tree, tabs, toolbar, or graph',
		category: 'Navigation',
		binding: 'Arrow keys',
		context: 'Focused composite',
	},
	{
		id: 'first-last-item',
		label: 'Move to first or last item',
		category: 'Navigation',
		binding: 'Home / End',
		context: 'Focused composite',
	},
	{
		id: 'primary-action',
		label: 'Open or run primary action',
		category: 'Action',
		binding: 'Enter',
		context: 'Focused item',
	},
	{
		id: 'toggle-selection',
		label: 'Select or toggle focused item',
		category: 'Action',
		binding: 'Space',
		context: 'Selectable composite',
	},
	{
		id: 'item-actions',
		label: 'Show actions for focused item',
		category: 'Action',
		binding: 'Shift+F10',
		context: 'Focused item',
	},
	{
		id: 'escape-layer',
		label: 'Close the innermost layer and return to its trigger',
		category: 'Navigation',
		binding: 'Escape',
		context: 'Popup, modal, drawer, or content mode',
	},
	{
		id: 'show-keyboard-map',
		label: 'Show searchable keyboard map',
		category: 'Navigation',
		binding: '?',
		commandId: 'peak-show-keyboard-map',
		context: 'Peak surface outside text editing',
	},
	{
		id: 'return-last-focus',
		label: 'Return to last Peak focus',
		category: 'Navigation',
		binding: '',
		commandId: 'peak-return-last-focus',
		context: 'Global Obsidian command',
	},
	{
		id: 'vault-open-new-tab',
		label: 'Open result in a new tab',
		category: 'Surface-specific',
		binding: 'Cmd/Ctrl+Enter',
		surfaceId: 'vault-search',
		zoneId: 'vs-results',
		context: 'Vault Search results',
	},
	{
		id: 'ai-cycle-mode',
		label: 'Cycle AI Search mode',
		category: 'Surface-specific',
		binding: 'Alt+Up / Alt+Down',
		surfaceId: 'ai-search',
		zoneId: 'as-mode-query',
		context: 'AI Search mode selector outside text editing',
	},
	{
		id: 'file-atlas-tray-toggle',
		label: 'Add or remove block from selection tray',
		category: 'Surface-specific',
		binding: 'Space',
		surfaceId: 'file-atlas',
		zoneId: 'fa-atlas',
		context: 'File Atlas tree or graph',
	},
	{
		id: 'chat-focus-composer',
		label: 'Focus Chat Composer',
		category: 'Surface-specific',
		binding: 'Cmd/Ctrl+K',
		surfaceId: 'chat-studio',
		zoneId: 'cs-composer',
		context: 'Chat Studio',
	},
	{
		id: 'chat-newline',
		label: 'Insert a newline in Chat Composer',
		category: 'Editing',
		binding: 'Shift+Enter or Cmd/Ctrl+Enter',
		surfaceId: 'chat-studio',
		zoneId: 'cs-composer',
		context: 'Chat Composer',
	},
] as const;

export const PEAK_KEYBOARD_SURFACE_LABELS: Readonly<Record<PeakKeyboardSurfaceId, string>> = {
	'vault-search': 'Vault Search',
	'ai-search': 'AI Search',
	'file-atlas': 'File Atlas',
	'chat-studio': 'Chat Studio',
};

export const PEAK_KEYBOARD_ZONE_LABELS = {
	'vs-search-mode': 'Search mode',
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

export const KEYBOARD_MAP_STRINGS = {
	title: 'Peak keyboard map',
	searchPlaceholder: 'Search actions, controls, contexts, or keys…',
	showAll: 'Show all contexts',
	currentContext: 'Current context',
	noMatches: 'No keyboard actions match this search.',
	unbound: 'Unbound',
	openHotkeys: 'Open Obsidian Hotkeys',
	close: 'Close',
	defaultSurface: 'Peak',
	conflictPrefix: 'Conflict',
} as const;
