import { create } from 'zustand';
import { FileChange } from '@/service/chat/types';
import { SuggestionTag } from '@/ui/component/prompt-input/SuggestionTags';
import { NavigableMenuItem } from '@/ui/component/mine/NavigableMenu';

export interface ChatTag {
	type: 'context' | 'prompt';
	text: string;
	start: number;
	end: number;
}

/**
 * Store for managing chat session data
 */
export interface ChatSessionState {
	// File changes data ===> todo update by copilot updater.
	fileChanges: FileChange[];

	// External prompts data
	promptsSuggest: NavigableMenuItem[];

	// Suggestion tags data ==> todo update by copilot updater
	suggestionTags: SuggestionTag[];

	// Search settings
	isSearchActive: boolean;
	searchProvider: 'local' | 'perplexity' | 'model-builtin';
	enableWebSearch: boolean;
	enableVaultSearch: boolean;
	enableTwitterSearch: boolean;
	enableRedditSearch: boolean;

	// Attachment handling settings
	attachmentHandlingMode: 'direct' | 'degrade_to_text';

	// LLM output control settings
	llmOutputControlSettings: Record<string, any>;

	// Tool settings
	isCodeInterpreterEnabled: boolean;

	// Chat mode settings
	chatMode: 'chat' | 'plan' | 'agent';

	// LLM model settings
	selectedModel: { provider: string; modelId: string } | undefined;

	// Current input tags
	currentInputTags: ChatTag[];

	// todo context paths suggestion ==> todo initial have vault structure. but later can be added some item by copilot updater.

	// Actions for file changes
	setFileChanges: (changes: FileChange[]) => void;
	updateFileChange: (id: string, updates: Partial<FileChange>) => void;
	acceptAllFileChanges: () => void;
	discardAllFileChanges: () => void;
	acceptFileChange: (id: string) => void;
	discardFileChange: (id: string) => void;

	// Actions for prompts
	setExternalPrompts: (prompts: NavigableMenuItem[]) => void;

	// Actions for suggestion tags
	setSuggestionTags: (tags: SuggestionTag[]) => void;

	// Actions for search settings
	setSearchActive: (active: boolean) => void;
	setSearchProvider: (provider: 'local' | 'perplexity' | 'model-builtin') => void;
	setEnableWebSearch: (enabled: boolean) => void;
	setEnableVaultSearch: (enabled: boolean) => void;
	setEnableTwitterSearch: (enabled: boolean) => void;
	setEnableRedditSearch: (enabled: boolean) => void;

	// Actions for attachment handling settings
	setAttachmentHandlingMode: (mode: 'direct' | 'degrade_to_text') => void;

	// Actions for LLM output control settings
	setLlmOutputControlSettings: (settings: Record<string, any>) => void;

	// Actions for tool settings
	setIsCodeInterpreterEnabled: (enabled: boolean) => void;

	// Actions for chat mode settings
	setChatMode: (mode: 'chat' | 'plan' | 'agent') => void;

	// Actions for LLM model settings
	setSelectedModel: (provider: string, modelId: string) => void;

	// Actions for current input tags
	setCurrentInputTags: (tags: Array<{ type: 'context' | 'prompt'; text: string; start: number; end: number; }>) => void;

	// Reset session data
	resetSession: () => void;
}

/**
 * Initial mock data - will be replaced with computed/real data later
 */
const initialFileChanges: FileChange[] = [
	{
		id: '1',
		filePath: 'src/components/Button.tsx',
		addedLines: 21,
		removedLines: 33,
		accepted: false,
		extension: 'tsx'
	},
	{
		id: '2',
		filePath: 'src/utils/helpers.ts',
		addedLines: 5,
		removedLines: 2,
		accepted: false,
		extension: 'ts'
	},
];

const initialExternalPrompts: NavigableMenuItem[] = [
	{
		id: 'chat-general',
		label: 'General Chat',
		description: 'General conversation and discussion'.repeat(10),
		value: 'chat-general',
		icon: '💡',
		showArrow: false
	},
	{
		id: 'chat-general2',
		label: 'General Chat 2 Test',
		description: 'General conversation and discussion 2 test General conversation and discussion 2 test General conversation and discussion 2 test ',
		value: 'chat-general2',
		icon: '💡',
		showArrow: false
	},
	{
		id: 'search-web',
		label: 'Web Search',
		description: 'Search and retrieve information from the web',
		value: 'search-web',
		icon: '💡',
		showArrow: false
	},
	{
		id: 'code-review',
		label: 'Code Review',
		description: 'Review and analyze code for improvements',
		value: 'code-review',
		icon: '💡',
		showArrow: false
	},
	{
		id: 'document-summary',
		label: 'Document Summary',
		description: 'Summarize documents and extract key points'.repeat(10),
		value: 'document-summary',
		icon: '💡',
		showArrow: false
	}
];

const initialSuggestionTags: SuggestionTag[] = [
	{
		id: 'transfer',
		label: 'Transfer To Project',
		color: 'blue',
		tooltip: 'Move this conversation to a project',
		action: 'transfer'
	},
	{
		id: 'update',
		label: 'Update Articles',
		color: 'green',
		tooltip: 'Update related articles in the knowledge base',
		action: 'update'
	},
	{
		id: 'review',
		label: 'Code Review',
		color: 'purple',
		tooltip: 'Request code review for changes',
		action: 'review'
	}
];

export const useChatSessionStore = create<ChatSessionState>((set, get) => ({
	// Initial state
	fileChanges: initialFileChanges,
	promptsSuggest: initialExternalPrompts,
	suggestionTags: initialSuggestionTags,
	isSearchActive: false,
	searchProvider: 'local',
	enableWebSearch: false,
	enableVaultSearch: false,
	enableTwitterSearch: true,
	enableRedditSearch: true,
	attachmentHandlingMode: 'degrade_to_text',
	llmOutputControlSettings: {},
	isCodeInterpreterEnabled: false,
	chatMode: 'chat',
	selectedModel: undefined,
	currentInputTags: [],

	// File changes actions
	setFileChanges: (changes: FileChange[]) => set({ fileChanges: changes }),

	updateFileChange: (id: string, updates: Partial<FileChange>) =>
		set((state) => ({
			fileChanges: state.fileChanges.map(change =>
				change.id === id ? { ...change, ...updates } : change
			)
		})),

	acceptAllFileChanges: () =>
		set((state) => ({
			fileChanges: state.fileChanges.map(change => ({ ...change, accepted: true }))
		})),

	discardAllFileChanges: () =>
		set((state) => ({
			fileChanges: state.fileChanges.map(change => ({ ...change, accepted: false }))
		})),

	acceptFileChange: (id: string) =>
		set((state) => ({
			fileChanges: state.fileChanges.map(change =>
				change.id === id ? { ...change, accepted: true } : change
			)
		})),

	discardFileChange: (id: string) =>
		set((state) => ({
			fileChanges: state.fileChanges.map(change =>
				change.id === id ? { ...change, accepted: false } : change
			)
		})),

	// Prompts actions
	setExternalPrompts: (prompts: NavigableMenuItem[]) => set({ promptsSuggest: prompts }),

	// Suggestion tags actions
	setSuggestionTags: (tags: SuggestionTag[]) => set({ suggestionTags: tags }),

	// Search settings actions
	setSearchActive: (active: boolean) => set({ isSearchActive: active }),
	setSearchProvider: (provider: 'local' | 'perplexity' | 'model-builtin') => set({ searchProvider: provider }),
	setEnableWebSearch: (enabled: boolean) => set({ enableWebSearch: enabled }),
	setEnableVaultSearch: (enabled: boolean) => set({ enableVaultSearch: enabled }),
	setEnableTwitterSearch: (enabled: boolean) => set({ enableTwitterSearch: enabled }),
	setEnableRedditSearch: (enabled: boolean) => set({ enableRedditSearch: enabled }),

	// Attachment handling actions
	setAttachmentHandlingMode: (mode: 'direct' | 'degrade_to_text') => set({ attachmentHandlingMode: mode }),

	// LLM output control actions
	setLlmOutputControlSettings: (settings: Record<string, any>) => set({ llmOutputControlSettings: settings }),

	// Tool settings actions
	setIsCodeInterpreterEnabled: (enabled: boolean) => set({ isCodeInterpreterEnabled: enabled }),

	// Chat mode actions
	setChatMode: (mode: 'chat' | 'plan' | 'agent') => set({ chatMode: mode }),

	// LLM model actions
	setSelectedModel: (provider: string, modelId: string) => set({ selectedModel: { provider, modelId } }),

	// Current input tags actions
	setCurrentInputTags: (tags: ChatTag[]) => set({ currentInputTags: tags }),

	// Reset session
	resetSession: () => set({
		fileChanges: initialFileChanges,
		promptsSuggest: initialExternalPrompts,
		suggestionTags: initialSuggestionTags,
		isSearchActive: false,
		searchProvider: 'local',
		enableWebSearch: false,
		enableVaultSearch: false,
		enableTwitterSearch: true,
		enableRedditSearch: true,
		attachmentHandlingMode: 'degrade_to_text',
		llmOutputControlSettings: {},
		isCodeInterpreterEnabled: false,
		chatMode: 'chat',
		selectedModel: undefined,
		currentInputTags: []
	})
}));