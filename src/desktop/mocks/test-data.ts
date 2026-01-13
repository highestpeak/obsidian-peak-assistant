import { ChatConversation, ChatProject, ChatMessage } from '@/service/chat/types';

/**
 * Test data for desktop development
 * Contains sample conversations, projects, and search results
 */

export const TEST_PROJECTS: ChatProject[] = [
	{
		meta: {
			id: 'test-project-1',
			name: 'AI Development Notes',
			createdAtTimestamp: Date.now() - 7 * 24 * 60 * 60 * 1000,
			updatedAtTimestamp: Date.now() - 2 * 60 * 60 * 1000,
		},
		context: {
			shortSummary: 'Collection of notes about AI development, machine learning algorithms, and programming best practices.',
			lastUpdatedTimestamp: Date.now() - 2 * 60 * 60 * 1000,
		},
	},
	{
		meta: {
			id: 'test-project-2',
			name: 'Obsidian Plugin Development',
			createdAtTimestamp: Date.now() - 14 * 24 * 60 * 60 * 1000,
			updatedAtTimestamp: Date.now() - 1 * 24 * 60 * 60 * 1000,
		},
		context: {
			shortSummary: 'Documentation and development notes for Obsidian plugins, including API usage, UI components, and publishing.',
			lastUpdatedTimestamp: Date.now() - 1 * 24 * 60 * 60 * 1000,
		},
	},
	{
		meta: {
			id: 'test-project-3',
			name: 'Personal Knowledge Base',
			createdAtTimestamp: Date.now() - 30 * 24 * 60 * 60 * 1000,
			updatedAtTimestamp: Date.now() - 6 * 60 * 60 * 1000,
		},
		context: {
			shortSummary: 'Personal notes on various topics including productivity, learning, and technology trends.',
			lastUpdatedTimestamp: Date.now() - 6 * 60 * 60 * 1000,
		},
	},
	// Add 20 mock projects
	...Array.from({ length: 20 }, (_, i) => ({
		meta: {
			id: `project-${i + 4}`,
			name: `Mock Project ${i + 4}`,
			createdAtTimestamp: Date.now() - (518400000 + i * 86400000),
			updatedAtTimestamp: Date.now() - (518400000 + i * 86400000),
		},
	})),
];

/**
 * Generate random user questions based on topic
 */
const generateRandomUserQuestion = (topic: string): string => {
	const questionTemplates = [
		`Can you explain ${topic.toLowerCase()}?`,
		`How do I implement ${topic.toLowerCase()}?`,
		`What are the best practices for ${topic.toLowerCase()}?`,
		`I'm having trouble with ${topic.toLowerCase()}, can you help?`,
		`What's the difference between ${topic.toLowerCase()} approaches?`,
		`Can you show me an example of ${topic.toLowerCase()}?`,
		`What should I know about ${topic.toLowerCase()}?`,
		`How does ${topic.toLowerCase()} work in practice?`,
		`Are there any common mistakes with ${topic.toLowerCase()}?`,
		`What's new in ${topic.toLowerCase()}?`,
	];
	return questionTemplates[Math.floor(Math.random() * questionTemplates.length)];
};

/**
 * Generate random assistant responses based on topic
 */
const generateRandomAssistantResponse = (topic: string): string => {
	const responseTemplates = [
		`Great question about ${topic.toLowerCase()}! Let me break this down for you step by step...`,
		`I'd be happy to help you understand ${topic.toLowerCase()}. Here's a comprehensive overview...`,
		`${topic} is an important concept. Let me explain the key principles and best practices...`,
		`Excellent question! ${topic} can be quite complex, but I'll walk you through it...`,
		`When it comes to ${topic}, there are several approaches you can take. Let me explain the most effective ones...`,
		`Understanding ${topic} is crucial for modern development. Here's what you need to know...`,
		`Let me provide you with a practical example of ${topic} implementation...`,
		`${topic} has evolved significantly over time. Here's the current state of the art...`,
		`There are some common misconceptions about ${topic}. Let me clarify them for you...`,
		`The key to mastering ${topic} lies in understanding these fundamental concepts...`,
	];
	return responseTemplates[Math.floor(Math.random() * responseTemplates.length)] +
		   '\n\n' + 'Here are the main points you should consider:\n\n1. **Core Concepts**: Understanding the fundamental principles\n2. **Implementation**: How to apply these concepts in practice\n3. **Best Practices**: Industry standards and recommendations\n4. **Common Pitfalls**: What to avoid and why\n5. **Advanced Topics**: Going beyond the basics';
};

/**
 * Generate mock conversations using a factory function approach
 */
const createMockConversations = (base: {
	baseId: string;
	title: string;
	baseDays: number;
	projectId?: string;
	activeModel?: string;
	activeProvider?: string;
}) => {
	return Array.from({ length: 50 }).map((_, idx) => {
		const uniqId = `${base.baseId}-${idx + 1}`;
		const daysAgo = base.baseDays + idx;
		const ts = Date.now() - daysAgo * 24 * 60 * 60 * 1000;

		// Sample conversation topics for variety
		const topics = [
			'React Development', 'TypeScript Best Practices', 'Database Optimization',
			'API Design Patterns', 'Testing Strategies', 'Performance Tuning',
			'Security Considerations', 'Code Architecture', 'DevOps Practices',
			'UI/UX Design', 'Mobile Development', 'Cloud Computing', 'Machine Learning',
			'Data Structures', 'Algorithm Complexity', 'System Design', 'Microservices',
			'Container Orchestration', 'CI/CD Pipelines', 'Code Review Process'
		];

		const topic = topics[idx % topics.length];

		// Generate random number of messages (0-20)
		const messageCount = Math.floor(Math.random() * 21); // 0-20 messages
		const messages: any[] = [];

		let conversationTimestamp = ts;

		for (let msgIdx = 0; msgIdx < messageCount; msgIdx++) {
			const isUser = msgIdx % 2 === 0; // Alternate between user and assistant
			const timeOffset = msgIdx * (Math.random() * 10000 + 5000); // 5-15 seconds between messages

			messages.push({
				id: `msg-${uniqId}-${msgIdx}`,
				role: isUser ? 'user' as const : 'assistant' as const,
				content: isUser
					? generateRandomUserQuestion(topic)
					: generateRandomAssistantResponse(topic),
				createdAtTimestamp: conversationTimestamp + timeOffset,
				createdAtZone: 'UTC',
				starred: Math.random() > 0.9, // 10% chance of being starred
				model: base.activeModel || 'gpt-4o-mini',
				provider: base.activeProvider || 'openai',
				...(isUser ? {} : {
					tokenUsage: {
						inputTokens: Math.floor(Math.random() * 30) + 10,
						outputTokens: Math.floor(Math.random() * 200) + 50,
						totalTokens: Math.floor(Math.random() * 230) + 60,
					}
				}),
			});
		}

		// Update conversation timestamp to last message time
		const lastMessageTime = messages.length > 0
			? messages[messages.length - 1].createdAtTimestamp
			: ts;

		return {
			meta: {
				id: uniqId,
				title: messageCount === 0
					? `${base.title} #${idx + 1}: ${topic}`
					: `${base.title} #${idx + 1}: ${topic} (${messageCount} messages)`,
				createdAtTimestamp: ts,
				updatedAtTimestamp: lastMessageTime,
				activeModel: base.activeModel || 'gpt-4o-mini',
				activeProvider: base.activeProvider || 'openai',
				...(base.projectId ? { projectId: base.projectId } : {}),
			},
			messages: messages,
			content: messageCount === 0
				? `# ${base.title} #${idx + 1}: ${topic}\n\nDiscussion about ${topic.toLowerCase()} and related concepts.`
				: `# ${base.title} #${idx + 1}: ${topic}\n\nConversation with ${messageCount} messages about ${topic.toLowerCase()}.`,
			file: {
				path: `ChatFolder/conversations/${uniqId}.md`,
				name: `${uniqId}.md`,
				basename: uniqId,
				extension: 'md',
				stat: {
					size: Math.floor(Math.random() * 10000) + 1000,
					ctime: ts,
					mtime: lastMessageTime,
				},
				vault: {} as any,
				parent: null,
			} as any,
			context: {
				shortSummary: messageCount === 0
					? `Discussion about ${topic.toLowerCase()} and implementation strategies.`
					: `Conversation with ${messageCount} messages about ${topic.toLowerCase()}.`,
				fullSummary: messageCount === 0
					? `This conversation covers ${topic.toLowerCase()} in detail, including practical examples, common pitfalls, and best practices for implementation.`
					: `A ${messageCount}-message conversation exploring ${topic.toLowerCase()}, covering various aspects from basic concepts to advanced implementation strategies.`,
				lastUpdatedTimestamp: lastMessageTime,
				recentMessagesWindow: [],
			},
		};
	});
};

export const TEST_CONVERSATIONS: ChatConversation[] = [
	// Generate conversations for each project
	...createMockConversations({
		baseId: 'project-1-conv',
		title: 'AI Development Discussion',
		baseDays: 0,
		projectId: 'test-project-1',
		activeModel: 'gpt-4o-mini',
		activeProvider: 'openai',
	}),
	...createMockConversations({
		baseId: 'project-2-conv',
		title: 'Plugin Development Topic',
		baseDays: 2,
		projectId: 'test-project-2',
		activeModel: 'llama3.2:latest',
		activeProvider: 'ollama',
	}),
	...createMockConversations({
		baseId: 'project-3-conv',
		title: 'Knowledge Base Entry',
		baseDays: 5,
		projectId: 'test-project-3',
		activeModel: 'gemma3:12b',
		activeProvider: 'ollama',
	}),
	// Generate standalone conversations (no project)
	...createMockConversations({
		baseId: 'standalone-conv',
		title: 'General Discussion',
		baseDays: 7,
		activeModel: 'deepseek-r1:latest',
		activeProvider: 'ollama',
	}),
];

/**
 * Test search results data
 */
export const TEST_SEARCH_RESULTS = [
	{
		id: 'search-result-1',
		title: 'React Hooks Guide',
		path: 'docs/react-hooks.md',
		content: 'React Hooks are functions that let you use state and other React features in functional components...',
		score: 0.95,
		highlights: [
			{ text: 'React Hooks are functions', start: 0, end: 25 },
			{ text: 'use state and other React features', start: 35, end: 68 }
		],
		metadata: {
			wordCount: 1200,
			lastModified: Date.now() - 86400000,
			tags: ['react', 'javascript', 'frontend']
		}
	},
	{
		id: 'search-result-2',
		title: 'Database Design Patterns',
		path: 'docs/database-patterns.md',
		content: 'Common database design patterns include Single Table Inheritance and Class Table Inheritance...',
		score: 0.88,
		highlights: [
			{ text: 'database design patterns', start: 8, end: 30 },
			{ text: 'Single Table Inheritance', start: 45, end: 67 }
		],
		metadata: {
			wordCount: 950,
			lastModified: Date.now() - 172800000,
			tags: ['database', 'design-patterns', 'sql']
		}
	},
	{
		id: 'search-result-3',
		title: 'Obsidian Plugin Development',
		path: 'docs/obsidian-plugins.md',
		content: 'Creating custom views in Obsidian plugins requires extending the View class...',
		score: 0.82,
		highlights: [
			{ text: 'Obsidian plugins', start: 0, end: 16 },
			{ text: 'custom views', start: 10, end: 22 }
		],
		metadata: {
			wordCount: 1800,
			lastModified: Date.now() - 259200000,
			tags: ['obsidian', 'plugin-development', 'typescript']
		}
	}
];