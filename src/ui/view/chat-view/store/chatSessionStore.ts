import { create } from 'zustand';
import { FileChange } from '@/service/chat/types';
import { ExternalPromptInfo } from '@/ui/component/prompt-input/menu/PromptMenu';
import { SuggestionTag } from '@/ui/component/prompt-input/SuggestionTags';
import { ModelInfoForSwitch } from '@/core/providers/types';

/**
 * Store for managing chat session data
 */
export interface ChatSessionState {
	// File changes data ===> todo update by copilot updater.
	fileChanges: FileChange[];

	// External prompts data
	promptsSuggest: ExternalPromptInfo[];

	// Suggestion tags data ==> todo update by copilot updater
	suggestionTags: SuggestionTag[];

	// Search settings
	isSearchActive: boolean;
	searchProvider: 'local' | 'perplexity' | 'model-builtin';
	enableWebSearch: boolean;
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
	selectedModel: { provider: string; modelId: string } | null;
	models: ModelInfoForSwitch[];
	isModelsLoading: boolean;

	// todo context paths suggestion ==> todo initial have vault structure. but later can be added some item by copilot updater.

	// Actions for file changes
	setFileChanges: (changes: FileChange[]) => void;
	updateFileChange: (id: string, updates: Partial<FileChange>) => void;
	acceptAllFileChanges: () => void;
	discardAllFileChanges: () => void;
	acceptFileChange: (id: string) => void;
	discardFileChange: (id: string) => void;

	// Actions for prompts
	setExternalPrompts: (prompts: ExternalPromptInfo[]) => void;

	// Actions for suggestion tags
	setSuggestionTags: (tags: SuggestionTag[]) => void;

	// Actions for search settings
	setSearchActive: (active: boolean) => void;
	setSearchProvider: (provider: 'local' | 'perplexity' | 'model-builtin') => void;
	setEnableWebSearch: (enabled: boolean) => void;
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
	setSelectedModel: (model: { provider: string; modelId: string } | null) => void;
	setModels: (models: ModelInfoForSwitch[]) => void;
	setIsModelsLoading: (loading: boolean) => void;

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
	{
		id: '3',
		filePath: 'src/styles/main.css',
		addedLines: 10,
		removedLines: 15,
		accepted: false,
		extension: 'css'
	},
	{
		id: '4',
		filePath: 'README.md',
		addedLines: 3,
		removedLines: 1,
		accepted: false,
		extension: 'md'
	},
	{
		id: '5',
		filePath: 'package.json',
		addedLines: 2,
		removedLines: 0,
		accepted: false,
		extension: 'json'
	},
	{
		id: '6',
		filePath: 'src/hooks/useAuth.ts',
		addedLines: 45,
		removedLines: 12,
		accepted: false,
		extension: 'ts'
	},
	{
		id: '7',
		filePath: 'public/images/logo.png',
		addedLines: 0,
		removedLines: 0,
		accepted: false,
		extension: 'png'
	},
	{
		id: '8',
		filePath: 'src/types/api.ts',
		addedLines: 8,
		removedLines: 3,
		accepted: false,
		extension: 'ts'
	},
	{
		id: '9',
		filePath: '.gitignore',
		addedLines: 1,
		removedLines: 0,
		accepted: false,
		extension: 'gitignore'
	},
	{
		id: '10',
		filePath: 'src/components/forms/InputField.tsx',
		addedLines: 67,
		removedLines: 23,
		accepted: false,
		extension: 'tsx'
	},
	{
		id: '11',
		filePath: 'src/services/authService.ts',
		addedLines: 12,
		removedLines: 8,
		accepted: false,
		extension: 'ts'
	},
	{
		id: '12',
		filePath: 'tailwind.config.js',
		addedLines: 5,
		removedLines: 2,
		accepted: false,
		extension: 'js'
	},
	{
		id: '13',
		filePath: 'src/pages/dashboard/Dashboard.tsx',
		addedLines: 89,
		removedLines: 34,
		accepted: false,
		extension: 'tsx'
	},
	{
		id: '14',
		filePath: 'src/utils/date-utils.ts',
		addedLines: 0,
		removedLines: 5,
		accepted: false,
		extension: 'ts'
	},
	{
		id: '15',
		filePath: 'src/styles/components/_buttons.scss',
		addedLines: 15,
		removedLines: 7,
		accepted: false,
		extension: 'scss'
	},
	{
		id: '16',
		filePath: 'docker-compose.yml',
		addedLines: 3,
		removedLines: 1,
		accepted: false,
		extension: 'yml'
	},
	{
		id: '17',
		filePath: 'src/components/icons/SvgIcon.tsx',
		addedLines: 28,
		removedLines: 0,
		accepted: false,
		extension: 'tsx'
	},
	{
		id: '18',
		filePath: 'jest.config.js',
		addedLines: 4,
		removedLines: 2,
		accepted: false,
		extension: 'js'
	},
	{
		id: '19',
		filePath: 'src/hooks/useLocalStorage.ts',
		addedLines: 0,
		removedLines: 18,
		accepted: false,
		extension: 'ts'
	},
	{
		id: '20',
		filePath: 'public/favicon.ico',
		addedLines: 0,
		removedLines: 0,
		accepted: false,
		extension: 'ico'
	},
	{
		id: '21',
		filePath: 'src/constants/config.ts',
		addedLines: 6,
		removedLines: 3,
		accepted: false,
		extension: 'ts'
	},
	{
		id: '22',
		filePath: 'src/components/layout/Header.tsx',
		addedLines: 42,
		removedLines: 16,
		accepted: false,
		extension: 'tsx'
	}
];

const initialExternalPrompts: ExternalPromptInfo[] = [
	{
		promptId: 'chat-general',
		promptNameForDisplay: 'General Chat',
		promptCategory: 'chat',
		promptDesc: 'General conversation and discussion'
	},
	{
		promptId: 'chat-general2',
		promptNameForDisplay: 'General Chat 2 Test',
		promptCategory: 'chat',
		promptDesc: 'General conversation and discussion 2 test General conversation and discussion 2 test General conversation and discussion 2 test '
	},
	{
		promptId: 'search-web',
		promptNameForDisplay: 'Web Search',
		promptCategory: 'search',
		promptDesc: 'Search and retrieve information from the web'
	},
	{
		promptId: 'code-review',
		promptNameForDisplay: 'Code Review',
		promptCategory: 'app',
		promptDesc: 'Review and analyze code for improvements'
	},
	{
		promptId: 'document-summary',
		promptNameForDisplay: 'Document Summary',
		promptCategory: 'document',
		promptDesc: 'Summarize documents and extract key points'
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
	enableTwitterSearch: true,
	enableRedditSearch: true,
	attachmentHandlingMode: 'degrade_to_text',
	llmOutputControlSettings: {},
	isCodeInterpreterEnabled: false,
	chatMode: 'chat',
	selectedModel: null,
	models: [],
	isModelsLoading: false,

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
	setExternalPrompts: (prompts: ExternalPromptInfo[]) => set({ promptsSuggest: prompts }),

	// Suggestion tags actions
	setSuggestionTags: (tags: SuggestionTag[]) => set({ suggestionTags: tags }),

	// Search settings actions
	setSearchActive: (active: boolean) => set({ isSearchActive: active }),
	setSearchProvider: (provider: 'local' | 'perplexity' | 'model-builtin') => set({ searchProvider: provider }),
	setEnableWebSearch: (enabled: boolean) => set({ enableWebSearch: enabled }),
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
	setSelectedModel: (model: { provider: string; modelId: string } | null) => set({ selectedModel: model }),
	setModels: (models: ModelInfoForSwitch[]) => set({ models }),
	setIsModelsLoading: (loading: boolean) => set({ isModelsLoading: loading }),

	// Reset session
	resetSession: () => set({
		fileChanges: initialFileChanges,
		promptsSuggest: initialExternalPrompts,
		suggestionTags: initialSuggestionTags,
		isSearchActive: false,
		searchProvider: 'local',
		enableWebSearch: false,
		enableTwitterSearch: true,
		enableRedditSearch: true,
		attachmentHandlingMode: 'degrade_to_text',
		llmOutputControlSettings: {},
		isCodeInterpreterEnabled: false,
		chatMode: 'chat',
		selectedModel: null,
		models: [],
		isModelsLoading: false
	})
}));