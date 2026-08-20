import type { DocumentType } from '@/core/document/types';
import { ModelType } from '@/core/providers/types';
import type { ModelCapabilityRequirement } from '@/core/providers/model-selection';

export const SETTINGS_TABS = [
	{ id: 'aiModels', label: 'AI & Models' },
	{ id: 'agents', label: 'Agents' },
	{ id: 'knowledgeSearch', label: 'Knowledge & Search' },
	{ id: 'advanced', label: 'Advanced' },
] as const;

export type PeakSettingsTabId = (typeof SETTINGS_TABS)[number]['id'];

export const ONBOARDING_STEPS = [
	{ id: 'connect-ai', label: 'Connect AI', summary: 'One verified connection' },
	{ id: 'core-models', label: 'Core models', summary: 'Safe models for first use' },
	{ id: 'prepare-vault', label: 'Prepare vault', summary: 'Database and fast search' },
	{ id: 'system-check', label: 'System check', summary: 'Required dependencies' },
	{ id: 'try-peak', label: 'Try Peak', summary: 'Open a real feature' },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]['id'];

export const AGENT_SAFETY_MODES = [
	{ id: 'read', label: 'Read only', summary: 'Peak may inspect and propose, but never write.' },
	{ id: 'ask', label: 'Ask every time', summary: 'Confirm each write, command, network or costly action.', recommended: true },
	{ id: 'acceptEdits', label: 'Accept reviewed edits', summary: 'Allow edits only after a scoped review.' },
	{ id: 'bypassPermissions', label: 'Bypass confirmations', summary: 'Expert mode. Deny rules still apply.' },
] as const;

export const INDEXABLE_FILE_TYPES: ReadonlyArray<{
	type: Extract<DocumentType, 'markdown' | 'pdf' | 'image' | 'excalidraw' | 'txt' | 'csv' | 'json' | 'html' | 'canvas'>;
	label: string;
	capability: string;
}> = [
	{ type: 'markdown', label: 'Markdown', capability: 'Text, links, tags, summaries and embeddings' },
	{ type: 'pdf', label: 'PDF', capability: 'Embedded text; OCR and summaries when enabled' },
	{ type: 'image', label: 'Images', capability: 'OCR, visual description and summaries when enabled' },
	{ type: 'excalidraw', label: 'Excalidraw', capability: 'Visible labels, file references and drawing text' },
	{ type: 'txt', label: 'Plain text', capability: 'Full-text search, summaries and embeddings' },
	{ type: 'csv', label: 'CSV', capability: 'Structured text rows for search' },
	{ type: 'json', label: 'JSON', capability: 'Structured text fields for search' },
	{ type: 'html', label: 'HTML', capability: 'Readable text extracted from markup' },
	{ type: 'canvas', label: 'Canvas', capability: 'Cards, labels, links and file references' },
];

export type ProductModelAction = {
	id: string;
	label: string;
	requiredCapabilities: ModelCapabilityRequirement;
	detail?: string;
	group?: string;
	localOnly?: boolean;
};

export type ProductModelFeature = {
	id: string;
	label: string;
	summary: string;
	requiredCapabilities: ModelCapabilityRequirement;
	actions: readonly ProductModelAction[];
};

export const PRODUCT_MODEL_FEATURES: readonly ProductModelFeature[] = [
	{
		id: 'chat-studio', label: 'Chat Studio', summary: 'Conversation, projects, attachments and media', requiredCapabilities: {},
		actions: [
			{ id: 'conversation', label: 'Everyday conversation', requiredCapabilities: {} },
			{ id: 'quick-answer', label: 'Quick answers & follow-ups', requiredCapabilities: {} },
			{ id: 'deep-research', label: 'Deep research', requiredCapabilities: { tools: true } },
			{ id: 'attachments', label: 'Web and attachment tasks', requiredCapabilities: { vision: true, pdfInput: true } },
			{ id: 'image-understanding', label: 'Understand images & documents', requiredCapabilities: { vision: true } },
			{ id: 'image-generation', label: 'Generate images', requiredCapabilities: { imageGeneration: true } },
		],
	},
	{
		id: 'composer-copilot', label: 'Composer & Copilot', summary: 'Writing, structured blocks, selections and multi-file changes', requiredCapabilities: {},
		actions: [
			{ id: 'copilot-conversation', label: 'Copilot conversation', requiredCapabilities: {} },
			{ id: 'whole-document', label: 'Whole-document rewrite & structure', requiredCapabilities: {} },
			{ id: 'text-blocks', label: 'Text, headings, lists & tasks', detail: 'Rewrite, explain, continue and restructure', group: 'Content block actions', requiredCapabilities: {} },
			{ id: 'structured-blocks', label: 'Tables, formulas & charts', detail: 'Explain, transform and produce structured patches', group: 'Content block actions', requiredCapabilities: { tools: true } },
			{ id: 'native-objects', label: 'Code, Mermaid & native objects', detail: 'Review, explain and generate typed changes', group: 'Content block actions', requiredCapabilities: { tools: true } },
			{ id: 'image-properties', label: 'Images & document properties', detail: 'Understand media or update guarded metadata', group: 'Content block actions', requiredCapabilities: { vision: true } },
			{ id: 'multi-file-change', label: 'Multi-file change sets', requiredCapabilities: { tools: true } },
			{ id: 'media-generation', label: 'Generate images & covers', requiredCapabilities: { imageGeneration: true } },
			{ id: 'markdown-formatting', label: 'Markdown formatting', requiredCapabilities: {}, localOnly: true },
		],
	},
	{
		id: 'vault-search', label: 'Vault Search & AI Search', summary: 'Local retrieval plus evidence-based analysis', requiredCapabilities: {},
		actions: [
			{ id: 'full-text', label: 'Full-text search & filters', requiredCapabilities: {}, localOnly: true },
			{ id: 'query-rewrite', label: 'Query understanding', requiredCapabilities: {} },
			{ id: 'analysis', label: 'Answer from evidence', requiredCapabilities: {} },
			{ id: 'report', label: 'Deep AI Search', requiredCapabilities: { tools: true } },
		],
	},
	{
		id: 'knowledge-index', label: 'Knowledge Index', summary: 'Embeddings and generated knowledge', requiredCapabilities: {},
		actions: [
			{ id: 'full-text', label: 'Full-text index maintenance', requiredCapabilities: {}, localOnly: true },
			{ id: 'embedding', label: 'Embeddings', requiredCapabilities: { modelType: ModelType.EMBEDDING } },
			{ id: 'summary', label: 'Document summaries', requiredCapabilities: {} },
			{ id: 'tags-entities', label: 'Tags & entities', requiredCapabilities: {} },
			{ id: 'relationships', label: 'Relationship discovery', requiredCapabilities: {} },
			{ id: 'vision-ocr', label: 'Vision & OCR', requiredCapabilities: { vision: true } },
		],
	},
	{
		id: 'file-atlas', label: 'File Atlas & AI Graph', summary: 'Browse and explain document relationships', requiredCapabilities: {},
		actions: [
			{ id: 'browse', label: 'Browse files, links & local graph', requiredCapabilities: {}, localOnly: true },
			{ id: 'graph-explanation', label: 'Graph explanations', requiredCapabilities: {} },
			{ id: 'graph-generation', label: 'AI Graph generation', requiredCapabilities: { tools: true } },
		],
	},
	{
		id: 'agent-wizard', label: 'Agent & Wizard', summary: 'Peak Hermes planning, tools, permissions and recovery', requiredCapabilities: { tools: true },
		actions: [
			{ id: 'planning', label: 'Planning', requiredCapabilities: { tools: true, reasoning: true } },
			{ id: 'tool-loop', label: 'Tool execution loop', requiredCapabilities: { tools: true } },
			{ id: 'recovery', label: 'Recovery & verification', requiredCapabilities: { tools: true } },
		],
	},
	{
		id: 'create-media', label: 'Create media', summary: 'Images, video, music and speech', requiredCapabilities: {},
		actions: [
			{ id: 'image', label: 'Image generation', requiredCapabilities: { modelType: ModelType.IMAGE } },
			{ id: 'video', label: 'Video generation', requiredCapabilities: { modelType: ModelType.VIDEO } },
			{ id: 'speech', label: 'Speech generation', requiredCapabilities: { modelType: ModelType.SOUND } },
			{ id: 'music', label: 'Music generation', requiredCapabilities: { modelType: ModelType.SOUND } },
		],
	},
] as const;
