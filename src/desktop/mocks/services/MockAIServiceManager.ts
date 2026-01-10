import { ChatConversation, ChatProject, ChatMessage } from '@/service/chat/types';
import { LLMStreamEvent, ModelInfoForSwitch } from '@/core/providers/types';
import { TFile } from 'obsidian';
import { AIServiceSettings, DEFAULT_AI_SERVICE_SETTINGS } from '@/app/settings/types';
import { MOCK_RESPONSE_CONTENT } from './MockResponseContent';
import { TextStreamPart } from 'ai';
import { ConversationUpdatedEvent } from '@/core/eventBus';

/**
 * Mock AIServiceManager for desktop development
 */
export class MockAIServiceManager {
	private eventBus?: any;

	constructor(eventBus?: any) {
		this.eventBus = eventBus;
	}

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
	 * Create a new conversation (mock implementation)
	 */
	async createConversation(params: { title: string; project?: any; initialMessages?: ChatMessage[]; modelId?: string; provider?: string }): Promise<ChatConversation> {
		const conversationId = `mock-conv-${Date.now()}`;
		console.log('[MockAIServiceManager] createConversation:', params.title);

		return {
			meta: {
				id: conversationId,
				title: params.title,
				createdAtTimestamp: Date.now(),
				updatedAtTimestamp: Date.now(),
				activeModel: params.modelId || 'gpt-4',
				activeProvider: params.provider || 'openai',
				projectId: params.project?.id,
			},
			messages: params.initialMessages || [],
			content: `# ${params.title}\n\nMock conversation content`,
			file: this.createMockFile(`.peak-assistant/conversations/${conversationId}.md`),
			context: {
				shortSummary: `Mock conversation: ${params.title}`,
				fullSummary: `This is a mock conversation created for testing purposes.`,
				lastUpdatedTimestamp: Date.now(),
				recentMessagesWindow: [],
			},
		};
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
			context: {
				shortSummary: 'This conversation covers project management basics, getting started guides, and best practices for using the Peak Assistant plugin. Key topics include creating new projects, organizing conversations, and managing resources effectively.',
				fullSummary: 'This comprehensive conversation explores multiple aspects of project management and plugin usage:\n\n**Getting Started**: The conversation begins with introductory questions about how to create new projects and organize conversations within the Peak Assistant plugin.\n\n**Project Management**: Detailed discussions on project creation, conversation management, and resource organization. Users learn how to structure their work effectively.\n\n**Best Practices**: The conversation concludes with recommendations for optimal plugin usage, including tips on resource management and workflow optimization.\n\n**Resources**: Several image resources and a PDF document were referenced during the conversation, demonstrating the plugin\'s ability to handle various file types and provide context-aware assistance.',
				lastUpdatedTimestamp: Date.now(),
				recentMessagesWindow: [],
			},
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
				context: {
					shortSummary: 'This project focuses on developing an AI-powered assistant for Obsidian, featuring advanced conversation management, file analysis capabilities, and intelligent project organization tools. The system integrates seamlessly with Obsidian\'s ecosystem while providing powerful AI-driven insights and automation features.',
					lastUpdatedTimestamp: Date.now() - 86400000,
				},
			},
			{
				meta: {
					id: 'project-2',
					name: 'Mock Project 2',
					createdAtTimestamp: Date.now() - 345600000,
					updatedAtTimestamp: Date.now() - 345600000,
				},
				context: {
					shortSummary: 'A comprehensive knowledge management system designed to enhance productivity and creativity. This project includes advanced search capabilities, intelligent content organization, and collaborative features that help users build and maintain extensive knowledge bases with ease.',
					lastUpdatedTimestamp: Date.now() - 172800000,
				},
			},
			{
				meta: {
					id: 'project-3',
					name: 'Mock Project 3',
					createdAtTimestamp: Date.now() - 432000000,
					updatedAtTimestamp: Date.now() - 432000000,
				},
				context: {
					shortSummary: 'An innovative approach to document processing and analysis, combining machine learning techniques with user-friendly interfaces. The project aims to revolutionize how users interact with their documents through intelligent summarization, categorization, and cross-referencing capabilities.',
					lastUpdatedTimestamp: Date.now() - 259200000,
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
				icon: 'gpt-4',
			} as ModelInfoForSwitch,
			{
				id: 'claude-3-opus',
				displayName: 'Claude 3 Opus',
				provider: 'anthropic',
				icon: 'claude-3-5-sonnet',
			} as ModelInfoForSwitch,
		];
	}

	/**
	 * Get all available models (async version)
	 */
	async getAllAvailableModels(): Promise<ModelInfoForSwitch[]> {
		return this.getAvailableModels();
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
	 * Add a message to conversation (mock implementation)
	 */
	async addMessage(params: {
		conversationId: string;
		message: ChatMessage;
		model: string;
		provider: string;
		usage: any;
	}): Promise<void> {
		// Mock implementation - just log the action
		console.log('[MockAIServiceManager] addMessage called with:', {
			conversationId: params.conversationId,
			messageRole: params.message.role,
			model: params.model,
			provider: params.provider,
		});
		// In a real implementation, this would persist the message to storage
		// For mocking purposes, we just simulate success
		return Promise.resolve();
	}

	/**
	 * Update conversation's attachment handling mode override (mock implementation)
	 */
	async updateConversationAttachmentHandling(params: {
		conversationId: string;
		attachmentHandlingOverride?: 'direct' | 'degrade_to_text';
	}): Promise<void> {
		// Mock implementation - just log the action
		console.log('[MockAIServiceManager] updateConversationAttachmentHandling called with:', {
			conversationId: params.conversationId,
			attachmentHandlingOverride: params.attachmentHandlingOverride,
		});
		// In a real implementation, this would update the conversation metadata
		// For mocking purposes, we just simulate success
		return Promise.resolve();
	}

	/**
	 * Upload files and create resources (mock implementation)
	 */
	async uploadFilesAndCreateResources(files: File[]): Promise<any[]> {
		// Mock implementation - simulate resource creation
		console.log('[MockAIServiceManager] uploadFilesAndCreateResources called with', files.length, 'files');

		// Return mock resources
		return files.map((file, index) => ({
			source: URL.createObjectURL(file),
			id: `resource-${index}`,
			kind: file.type.startsWith('image/') ? 'image' : 'file',
			name: file.name,
			size: file.size,
		}));
	}

	/**
	 * Get mock response content (embedded in code for browser compatibility)
	 */
	private loadMockResponse(): string {
		console.log('[MockAIServiceManager] Using embedded mock response content, length:', MOCK_RESPONSE_CONTENT.length);
		return MOCK_RESPONSE_CONTENT;
	}

	/**
	 * Generate thinking process content based on user input
	 */
	private generateThinkingProcess(userContent: string): string {
		const thinkingSteps = [
			`Understanding user query: "${userContent.substring(0, 50)}${userContent.length > 50 ? '...' : ''}"`,
			'Analyzing query intent and context',
			'Retrieving relevant knowledge and information',
			'Organizing response structure and content',
			'Preparing detailed response content'
		];

		let thinking = '## Thinking Process\n\n';
		thinkingSteps.forEach((step, index) => {
			thinking += `${index + 1}. ${step}\n`;
		});
		thinking += '\n---\n\n';

		return thinking;
	}

	/**
	 * Stream chat messages (mock implementation)
	 * Emulates streamText API with comprehensive stream events
	 */
	streamChat(params: {
		conversation: ChatConversation;
		project?: ChatProject | null;
		userContent: string;
		attachments?: string[];
	}): AsyncGenerator<LLMStreamEvent> {
		const self = this;
		return (async function* (): AsyncGenerator<LLMStreamEvent> {
			// Load mock response content
			const mockResponse = self.loadMockResponse();
			const thinkingContent = self.generateThinkingProcess(params.userContent);

			// Combine thinking and response
			const fullContent = thinkingContent + mockResponse;

			// delay to see loader
			await new Promise(resolve => setTimeout(resolve, 2000));

			const delay = 15; // ms delay between characters for smooth streaming
			const thinkingDelay = 20; // slower delay for thinking content

			let eventId = 0;

			// Stream thinking content character by character
			const thinkingChars = (thinkingContent).split('');
			for (let i = 0; i < thinkingChars.length; i++) {
				await new Promise(resolve => setTimeout(resolve, delay));
				const char = thinkingChars[i];
				if (char) {
					yield {
						type: 'reasoning-delta',
						text: char,
					};
				}
			}

			// Tool call: Web search
			await new Promise(resolve => setTimeout(resolve, delay));
			yield {
				type: 'tool-call',
				toolName: 'web_search',
				input: { query: 'current AI developments 2024', maxResults: 5 },
			};

			// Tool result
			await new Promise(resolve => setTimeout(resolve, delay * 3));
			const searchResults = [
				'OpenAI releases GPT-4 Turbo with enhanced reasoning',
				'Google\'s Gemini 1.5 achieves breakthrough in multimodal AI',
				'Anthropic\'s Claude 3 leads in AI safety metrics',
				'Meta\'s Llama 3 shows competitive performance',
				'New AI chip developments promise faster training'
			];
			yield {
				type: 'tool-result',
				toolName: 'web_search',
				output: { results: searchResults, totalResults: searchResults.length },
			};

			// Stream response content character by character
			const responseChars = mockResponse.split('')
				// mock response too long, so we only stream the first 200 characters for testing. if need more, change it.
				.slice(0, 300);
			for (let i = 0; i < responseChars.length; i++) {
				await new Promise(resolve => setTimeout(resolve, delay));
				const char = responseChars[i];
				if (char) {
					yield {
						type: 'text-delta',
						text: char,
					};
				}
			}

			// Create final usage
			const inputTokens = Math.floor(params.userContent.length / 4);
			const outputTokens = Math.floor(fullContent.length / 4);
			const mockUsage = {
				inputTokens,
				outputTokens,
				totalTokens: inputTokens + outputTokens,
			};

			// Yield complete event
			await new Promise(resolve => setTimeout(resolve, delay));
			yield {
				type: 'complete',
				usage: mockUsage,
			};
		})();
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
				content: `## 思考过程 (Chain of Thought)

1. Understanding user query: "Hello, this is a mock user message."
2. Analyzing query intent and context
3. Retrieving relevant knowledge and information
4. Organizing response structure and content
5. Preparing detailed response content

---

Hello! This is a mock assistant response. I'm here to help you with any questions or tasks you might have.`,
				createdAtTimestamp: now - 3500000,
				createdAtZone: 'UTC',
				starred: false,
				model: 'gpt-4',
				provider: 'openai',
				tokenUsage: {
					inputTokens: 15,
					outputTokens: 25,
					totalTokens: 40,
				},
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
				topic: 'Getting Started',
			},
			{
				id: 'msg-4',
				role: 'assistant',
				content: `## 思考过程 (Chain of Thought)

1. Understanding user query: "Can you explain how this plugin works?"
2. Analyzing query intent and context
3. Retrieving relevant knowledge and information
4. Organizing response structure and content
5. Preparing detailed response content

---

This plugin is designed to help you manage conversations and projects with AI assistants. It provides:

1. **Conversation Management**: Organize your AI conversations into projects
2. **Message History**: Keep track of all your interactions
3. **Project Organization**: Group related conversations together
4. **Search Functionality**: Quickly find past conversations and messages`,
				createdAtTimestamp: now - 3300000,
				createdAtZone: 'UTC',
				starred: false,
				model: 'gpt-4',
				provider: 'openai',
				topic: 'Getting Started',
				tokenUsage: {
					inputTokens: 45,
					outputTokens: 120,
					totalTokens: 165,
				},
			},
		];
	}

	/**
	 * Regenerate conversation title (mock implementation)
	 */
	async regenerateConversationTitle(conversationId: string): Promise<void> {
		console.log('[MockAIServiceManager] regenerateConversationTitle:', conversationId);

		// Simulate async delay
		await new Promise(resolve => setTimeout(resolve, 1000));

		// Mock title regeneration - in real implementation this would analyze messages and generate a new title
		const mockTitles = [
			'Discussion about AI development',
			'Code review and optimization',
			'Project planning session',
			'Technical question and answer',
			'Implementation strategy meeting'
		];

		const newTitle = mockTitles[Math.floor(Math.random() * mockTitles.length)];

		// Create a mock updated conversation object
		const updatedConversation: ChatConversation = {
			meta: {
				id: conversationId,
				title: newTitle,
				createdAtTimestamp: Date.now() - 1000, // Mock creation time
				updatedAtTimestamp: Date.now(),
				activeModel: 'gpt-4',
				activeProvider: 'openai',
				titleManuallyEdited: false,
				titleAutoUpdated: true,
			},
			messages: [], // Empty messages for mock
			content: `# ${newTitle}\n\nMock conversation content`,
			file: this.createMockFile(`.peak-assistant/conversations/${conversationId}.md`),
		};

		// Send event to update UI
		if (this.eventBus) {
			this.eventBus.dispatch(new ConversationUpdatedEvent({
				conversation: updatedConversation,
			}));
		}

		console.log(`[MockAIServiceManager] Regenerated title to: "${newTitle}"`);
	}
}

