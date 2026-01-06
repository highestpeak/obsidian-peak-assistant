import { ChatConversation, ChatProject, ChatMessage } from '@/service/chat/types';
import { ModelInfoForSwitch } from '@/core/providers/types';
import { TFile } from 'obsidian';
import { AIServiceSettings, DEFAULT_AI_SERVICE_SETTINGS } from '@/app/settings/types';

/**
 * Mock AIServiceManager for desktop development
 */
export class MockAIServiceManager {
	/**
	 * Create mock TFile
	 */
	private createMockFile(path: string): TFile {
		return {
			path,
			name: path.split('/').pop() || '',
			basename: path.split('/').pop()?.replace(/\.[^/.]+$/, '') || '',
			extension: path.split('.').pop() || '',
			stat: {
				size: 0,
				ctime: Date.now(),
				mtime: Date.now(),
			},
			vault: {} as any,
			parent: null,
		} as TFile;
	}

	/**
	 * Read conversation by ID
	 */
	async readConversation(conversationId: string, includeMessages: boolean = false): Promise<ChatConversation | null> {
		// Return mock conversation
		return {
			meta: {
				id: conversationId,
				title: 'Mock Conversation',
				createdAtTimestamp: Date.now(),
				updatedAtTimestamp: Date.now(),
				activeModel: 'gpt-4',
				activeProvider: 'openai',
			},
			messages: includeMessages ? this.getMockMessages() : [],
			content: '# Mock Conversation\n\nMock conversation content',
			file: this.createMockFile('.peak-assistant/conversations/mock-conversation.md'),
		};
	}

	/**
	 * List all conversations
	 * @param projectId - If provided, only return conversations for this project. If null/undefined, return all conversations.
	 */
	async listConversations(projectId?: string | null): Promise<ChatConversation[]> {
		const allConversations: ChatConversation[] = [
			{
				meta: {
					id: 'conv-1',
					title: 'First Conversation',
					createdAtTimestamp: Date.now() - 86400000,
					updatedAtTimestamp: Date.now() - 86400000,
					activeModel: 'gpt-4',
					activeProvider: 'openai',
					// No projectId - this is a standalone conversation
				},
				messages: [],
				content: '# First Conversation\n\nContent',
				file: this.createMockFile('.peak-assistant/conversations/conv-1.md'),
			},
			{
				meta: {
					id: 'conv-2',
					title: 'Second Conversation',
					createdAtTimestamp: Date.now() - 172800000,
					updatedAtTimestamp: Date.now() - 172800000,
					projectId: 'project-1',
					activeModel: 'claude-3-opus',
					activeProvider: 'anthropic',
				},
				messages: [],
				content: '# Second Conversation\n\nContent',
				file: this.createMockFile('.peak-assistant/conversations/conv-2.md'),
			},
			{
				meta: {
					id: 'conv-3',
					title: 'Project Conversation 1',
					createdAtTimestamp: Date.now() - 259200000,
					updatedAtTimestamp: Date.now() - 259200000,
					projectId: 'project-1',
					activeModel: 'gpt-4',
					activeProvider: 'openai',
				},
				messages: [],
				content: '# Project Conversation 1\n\nContent',
				file: this.createMockFile('.peak-assistant/conversations/conv-3.md'),
			},
			{
				meta: {
					id: 'conv-4',
					title: 'Project Conversation 2',
					createdAtTimestamp: Date.now() - 345600000,
					updatedAtTimestamp: Date.now() - 345600000,
					projectId: 'project-1',
					activeModel: 'gpt-4',
					activeProvider: 'openai',
				},
				messages: [],
				content: '# Project Conversation 2\n\nContent',
				file: this.createMockFile('.peak-assistant/conversations/conv-4.md'),
			},
			{
				meta: {
					id: 'conv-5',
					title: 'Standalone Conversation',
					createdAtTimestamp: Date.now() - 432000000,
					updatedAtTimestamp: Date.now() - 432000000,
					activeModel: 'claude-3-opus',
					activeProvider: 'anthropic',
					// No projectId - standalone conversation
				},
				messages: [],
				content: '# Standalone Conversation\n\nContent',
				file: this.createMockFile('.peak-assistant/conversations/conv-5.md'),
			},
		];

		// Filter by projectId if provided
		if (projectId !== undefined && projectId !== null) {
			return allConversations.filter(conv => conv.meta.projectId === projectId);
		}

		// Return all conversations if no projectId specified
		return allConversations;
	}

	/**
	 * List all projects
	 */
	async listProjects(): Promise<ChatProject[]> {
		return [
			{
				meta: {
					id: 'project-1',
					name: 'Mock Project 1',
					createdAtTimestamp: Date.now() - 259200000,
					updatedAtTimestamp: Date.now() - 259200000,
				},
			},
			{
				meta: {
					id: 'project-2',
					name: 'Mock Project 2',
					createdAtTimestamp: Date.now() - 345600000,
					updatedAtTimestamp: Date.now() - 345600000,
				},
			},
		];
	}

	/**
	 * Get available models
	 */
	getAvailableModels(): ModelInfoForSwitch[] {
		return [
			{
				id: 'gpt-4',
				displayName: 'GPT-4',
				provider: 'openai',
			} as ModelInfoForSwitch,
			{
				id: 'claude-3-opus',
				displayName: 'Claude 3 Opus',
				provider: 'anthropic',
			} as ModelInfoForSwitch,
		];
	}

	/**
	 * Get AI service settings
	 */
	getSettings(): AIServiceSettings {
		return {
			...DEFAULT_AI_SERVICE_SETTINGS,
			attachmentHandlingDefault: 'degrade_to_text',
		};
	}

	/**
	 * List starred messages by project
	 */
	async listStarredMessagesByProject(projectId: string): Promise<{
		messages: ChatMessage[];
		messageToConversationId: Map<string, string>;
	}> {
		// Return mock starred messages for the project
		const messages: ChatMessage[] = [
			{
				id: 'starred-msg-1',
				role: 'user',
				content: 'This is a starred user message.',
				createdAtTimestamp: Date.now() - 3600000,
				createdAtZone: 'UTC',
				starred: true,
				model: 'gpt-4',
				provider: 'openai',
			},
			{
				id: 'starred-msg-2',
				role: 'assistant',
				content: 'This is a starred assistant response.',
				createdAtTimestamp: Date.now() - 3500000,
				createdAtZone: 'UTC',
				starred: true,
				model: 'gpt-4',
				provider: 'openai',
			},
		];

		const messageToConversationId = new Map<string, string>();
		messages.forEach(msg => {
			messageToConversationId.set(msg.id, 'conv-1');
		});

		return {
			messages,
			messageToConversationId,
		};
	}

	/**
	 * Get mock messages
	 */
	private getMockMessages(): ChatMessage[] {
		const now = Date.now();
		return [
			{
				id: 'msg-1',
				role: 'user',
				content: 'Hello, this is a mock user message.',
				createdAtTimestamp: now - 3600000,
				createdAtZone: 'UTC',
				starred: false,
				model: 'gpt-4',
				provider: 'openai',
			},
			{
				id: 'msg-2',
				role: 'assistant',
				content: 'Hello! This is a mock assistant response. I\'m here to help you with any questions or tasks you might have.',
				createdAtTimestamp: now - 3500000,
				createdAtZone: 'UTC',
				starred: false,
				model: 'gpt-4',
				provider: 'openai',
			},
			{
				id: 'msg-3',
				role: 'user',
				content: 'Can you explain how this plugin works?',
				createdAtTimestamp: now - 3400000,
				createdAtZone: 'UTC',
				starred: false,
				model: 'gpt-4',
				provider: 'openai',
			},
			{
				id: 'msg-4',
				role: 'assistant',
				content: 'Sure! This plugin is designed to help you manage conversations and projects. It provides:\n\n1. **Conversation Management**: Organize your AI conversations into projects\n2. **Message History**: Keep track of all your interactions\n3. **Project Organization**: Group related conversations together\n4. **Search Functionality**: Quickly find past conversations and messages\n\nWould you like me to explain any specific feature in more detail?',
				createdAtTimestamp: now - 3300000,
				createdAtZone: 'UTC',
				starred: true,
				model: 'gpt-4',
				provider: 'openai',
			},
			{
				id: 'msg-5',
				role: 'user',
				content: 'How do I create a new project?',
				createdAtTimestamp: now - 3200000,
				createdAtZone: 'UTC',
				starred: false,
				model: 'gpt-4',
				provider: 'openai',
			},
			{
				id: 'msg-6',
				role: 'assistant',
				content: 'To create a new project, you can:\n\n1. Click the "+" button next to the "PROJECTS" section in the left sidebar\n2. Enter a name for your project\n3. The project will be created and you can start adding conversations to it\n\nProjects help you organize related conversations together, making it easier to manage your work.',
				createdAtTimestamp: now - 3100000,
				createdAtZone: 'UTC',
				starred: false,
				model: 'gpt-4',
				provider: 'openai',
			},
			{
				id: 'msg-7',
				role: 'user',
				content: 'What are the best practices for organizing conversations?',
				createdAtTimestamp: now - 3000000,
				createdAtZone: 'UTC',
				starred: false,
				model: 'gpt-4',
				provider: 'openai',
			},
			{
				id: 'msg-8',
				role: 'assistant',
				content: 'Here are some best practices for organizing conversations:\n\n**1. Use Descriptive Project Names**\n- Choose names that clearly indicate the project\'s purpose\n- Examples: "Research Project", "Code Review", "Learning Notes"\n\n**2. Group Related Conversations**\n- Keep conversations about the same topic in the same project\n- This makes it easier to find and reference past discussions\n\n**3. Star Important Messages**\n- Use the star feature to mark important messages\n- Starred messages are easily accessible in the project overview\n\n**4. Regular Cleanup**\n- Periodically review and archive old conversations\n- Keep your workspace organized and focused\n\n**5. Use Search Effectively**\n- Use the search feature to quickly find specific topics\n- Search works across all your conversations and projects',
				createdAtTimestamp: now - 2900000,
				createdAtZone: 'UTC',
				starred: true,
				model: 'gpt-4',
				provider: 'openai',
			},
			{
				id: 'msg-9',
				role: 'user',
				content: 'Thanks for the tips!',
				createdAtTimestamp: now - 2800000,
				createdAtZone: 'UTC',
				starred: false,
				model: 'gpt-4',
				provider: 'openai',
			},
			{
				id: 'msg-10',
				role: 'assistant',
				content: 'You\'re welcome! If you have any more questions or need help with anything else, feel free to ask. I\'m here to help!',
				createdAtTimestamp: now - 2700000,
				createdAtZone: 'UTC',
				starred: false,
				model: 'gpt-4',
				provider: 'openai',
			},
		];
	}
}

