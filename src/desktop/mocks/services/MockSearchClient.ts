/**
 * Mock SearchClient for desktop development
 */
export class MockSearchClient {
	/**
	 * Search (mock implementation)
	 */
	async search(query: any): Promise<any> {
		console.log('MockSearchClient: search', query);

		// Return mock data for testing
		const mockResults = [
			// Markdown files
			{
				id: 'daily-notes/2024-01-15.md',
				type: 'markdown',
				title: 'Daily Note - January 15, 2024',
				path: 'daily-notes/2024-01-15.md',
				lastModified: Date.now() - 86400000, // 1 day ago
				content: 'Today I worked on the new feature...',
				highlight: null,
				score: 0.8,
				finalScore: 0.8,
				source: 'local'
			},
			{
				id: 'projects/chat-assistant/project-plan.md',
				type: 'markdown',
				title: 'Chat Assistant Project Plan',
				path: 'projects/chat-assistant/project-plan.md',
				lastModified: Date.now() - 172800000, // 2 days ago
				content: 'This project aims to build a chat assistant...',
				highlight: null,
				score: 0.7,
				finalScore: 0.7,
				source: 'local'
			},
			{
				id: 'notes/meeting-notes.md',
				type: 'markdown',
				title: 'Meeting Notes',
				path: 'notes/meeting-notes.md',
				lastModified: Date.now() - 259200000, // 3 days ago
				content: 'Meeting with the team to discuss...',
				highlight: null,
				score: 0.6,
				finalScore: 0.6,
				source: 'local'
			},
			{
				id: 'templates/daily-template.md',
				type: 'markdown',
				title: 'Daily Note Template',
				path: 'templates/daily-template.md',
				lastModified: Date.now() - 345600000, // 4 days ago
				content: '## Tasks\n- [ ] Task 1\n- [ ] Task 2',
				highlight: null,
				score: 0.5,
				finalScore: 0.5,
				source: 'local'
			},
			{
				id: 'README.md',
				type: 'markdown',
				title: 'Project README',
				path: 'README.md',
				lastModified: Date.now() - 432000000, // 5 days ago
				content: '# My Knowledge Base\n\nThis is my personal knowledge base...',
				highlight: null,
				score: 0.4,
				finalScore: 0.4,
				source: 'local'
			},
			// Image files
			{
				id: 'images/screenshots/app-interface.png',
				type: 'image',
				title: 'App Interface Screenshot',
				path: 'images/screenshots/app-interface.png',
				lastModified: Date.now() - 518400000, // 6 days ago
				content: 'Screenshot of the application interface',
				highlight: null,
				score: 0.75,
				finalScore: 0.75,
				source: 'local'
			},
			{
				id: 'images/diagrams/architecture.jpg',
				type: 'image',
				title: 'System Architecture Diagram',
				path: 'images/diagrams/architecture.jpg',
				lastModified: Date.now() - 604800000, // 7 days ago
				content: 'High-level system architecture diagram',
				highlight: null,
				score: 0.65,
				finalScore: 0.65,
				source: 'local'
			},
			// PDF files
			{
				id: 'documents/research-paper.pdf',
				type: 'pdf',
				title: 'Research Paper on AI',
				path: 'documents/research-paper.pdf',
				lastModified: Date.now() - 691200000, // 8 days ago
				content: 'Comprehensive research paper on artificial intelligence advancements...',
				highlight: null,
				score: 0.7,
				finalScore: 0.7,
				source: 'local'
			},
			{
				id: 'documents/user-manual.pdf',
				type: 'pdf',
				title: 'User Manual',
				path: 'documents/user-manual.pdf',
				lastModified: Date.now() - 777600000, // 9 days ago
				content: 'Complete user guide for the application...',
				highlight: null,
				score: 0.6,
				finalScore: 0.6,
				source: 'local'
			},
			// Folders
			{
				id: 'projects/',
				type: 'folder',
				title: 'Projects',
				path: 'projects/',
				lastModified: Date.now() - 864000000, // 10 days ago
				content: 'Folder containing all project-related files',
				highlight: null,
				score: 0.55,
				finalScore: 0.55,
				source: 'local'
			},
			{
				id: 'images/',
				type: 'folder',
				title: 'Images',
				path: 'images/',
				lastModified: Date.now() - 950400000, // 11 days ago
				content: 'Folder containing image files and screenshots',
				highlight: null,
				score: 0.5,
				finalScore: 0.5,
				source: 'local'
			},
			// Subfolders inside projects
			{
				id: 'projects/chat-assistant/',
				type: 'folder',
				title: 'Chat Assistant',
				path: 'projects/chat-assistant/',
				lastModified: Date.now() - 864000000,
				content: 'Chat assistant project folder',
				highlight: null,
				score: 0.8,
				finalScore: 0.8,
				source: 'local'
			},
			// Files inside projects folder
			{
				id: 'projects/chat-assistant/README.md',
				type: 'markdown',
				title: 'Chat Assistant README',
				path: 'projects/chat-assistant/README.md',
				lastModified: Date.now() - 864000000,
				content: 'README file for the chat assistant project',
				highlight: null,
				score: 0.75,
				finalScore: 0.75,
				source: 'local'
			},
			{
				id: 'projects/chat-assistant/design.md',
				type: 'markdown',
				title: 'Design Document',
				path: 'projects/chat-assistant/design.md',
				lastModified: Date.now() - 864000000,
				content: 'Design document for the chat assistant',
				highlight: null,
				score: 0.7,
				finalScore: 0.7,
				source: 'local'
			},
			{
				id: 'projects/chat-assistant/todo.md',
				type: 'markdown',
				title: 'TODO List',
				path: 'projects/chat-assistant/todo.md',
				lastModified: Date.now() - 864000000,
				content: 'TODO list for the chat assistant project',
				highlight: null,
				score: 0.65,
				finalScore: 0.65,
				source: 'local'
			},
			// Subfolders inside images
			{
				id: 'images/screenshots/',
				type: 'folder',
				title: 'Screenshots',
				path: 'images/screenshots/',
				lastModified: Date.now() - 950400000,
				content: 'Screenshots folder',
				highlight: null,
				score: 0.65,
				finalScore: 0.65,
				source: 'local'
			},
			{
				id: 'images/diagrams/',
				type: 'folder',
				title: 'Diagrams',
				path: 'images/diagrams/',
				lastModified: Date.now() - 950400000,
				content: 'Diagrams folder',
				highlight: null,
				score: 0.6,
				finalScore: 0.6,
				source: 'local'
			},
			// Files inside images folder
			{
				id: 'images/screenshots/login.png',
				type: 'image',
				title: 'Login Screen',
				path: 'images/screenshots/login.png',
				lastModified: Date.now() - 950400000,
				content: 'Screenshot of the login screen',
				highlight: null,
				score: 0.6,
				finalScore: 0.6,
				source: 'local'
			},
			{
				id: 'images/diagrams/flowchart.svg',
				type: 'image',
				title: 'Process Flowchart',
				path: 'images/diagrams/flowchart.svg',
				lastModified: Date.now() - 950400000,
				content: 'SVG flowchart diagram',
				highlight: null,
				score: 0.55,
				finalScore: 0.55,
				source: 'local'
			},
			// Tags
			{
				id: 'tag:development',
				type: 'tag',
				title: '#development',
				path: '#development',
				lastModified: Date.now() - 1036800000, // 12 days ago
				content: 'Tag for development-related content',
				highlight: null,
				score: 0.45,
				finalScore: 0.45,
				source: 'local'
			},
			{
				id: 'tag:meeting',
				type: 'tag',
				title: '#meeting',
				path: '#meeting',
				lastModified: Date.now() - 1123200000, // 13 days ago
				content: 'Tag for meeting notes and discussions',
				highlight: null,
				score: 0.4,
				finalScore: 0.4,
				source: 'local'
			},
			// Categories
			{
				id: 'category:work',
				type: 'category',
				title: 'Work',
				path: 'category:work',
				lastModified: Date.now() - 1209600000, // 14 days ago
				content: 'Category for work-related content',
				highlight: null,
				score: 0.35,
				finalScore: 0.35,
				source: 'local'
			},
			{
				id: 'category:personal',
				type: 'category',
				title: 'Personal',
				path: 'category:personal',
				lastModified: Date.now() - 1296000000, // 15 days ago
				content: 'Category for personal notes and thoughts',
				highlight: null,
				score: 0.3,
				finalScore: 0.3,
				source: 'local'
			}
		];

		// Limit results to topK
		const topK = query.topK || 10;
		const limitedResults = mockResults.slice(0, topK);

		return {
			query,
			items: limitedResults,
			duration: 50 // mock duration in ms
		};
	}

	/**
	 * Get recent files (mock implementation)
	 */
	async getRecent(topK?: number): Promise<any[]> {
		console.log('MockSearchClient: getRecent', topK);

		const mockRecentFiles = [
			// Recent markdown files
			{
				id: 'daily-notes/2024-01-15.md',
				type: 'markdown',
				title: 'Daily Note - January 15, 2024',
				path: 'daily-notes/2024-01-15.md',
				lastModified: Date.now() - 86400000,
				highlight: null,
				score: 0,
				finalScore: 0
			},
			{
				id: 'projects/chat-assistant/project-plan.md',
				type: 'markdown',
				title: 'Chat Assistant Project Plan',
				path: 'projects/chat-assistant/project-plan.md',
				lastModified: Date.now() - 172800000,
				highlight: null,
				score: 0,
				finalScore: 0
			},
			// Recent image files
			{
				id: 'images/screenshots/app-interface.png',
				type: 'image',
				title: 'App Interface Screenshot',
				path: 'images/screenshots/app-interface.png',
				lastModified: Date.now() - 259200000,
				highlight: null,
				score: 0,
				finalScore: 0
			},
			// Recent PDF files
			{
				id: 'documents/research-paper.pdf',
				type: 'pdf',
				title: 'Research Paper on AI',
				path: 'documents/research-paper.pdf',
				lastModified: Date.now() - 345600000,
				highlight: null,
				score: 0,
				finalScore: 0
			},
			// Recent folders
			{
				id: 'projects/',
				type: 'folder',
				title: 'Projects',
				path: 'projects/',
				lastModified: Date.now() - 432000000,
				highlight: null,
				score: 0,
				finalScore: 0
			},
			// Recent notes (fallback)
			{
				id: 'notes/meeting-notes.md',
				type: 'markdown',
				title: 'Meeting Notes',
				path: 'notes/meeting-notes.md',
				lastModified: Date.now() - 518400000,
				highlight: null,
				score: 0,
				finalScore: 0
			}
		];

		const limit = Math.max(1, Number(topK ?? 20));
		return mockRecentFiles.slice(0, limit);
	}

	/**
	 * AI analyze (mock implementation)
	 */
	async aiAnalyze(req: any, callbacks?: any): Promise<any> {
		console.log('MockSearchClient: aiAnalyze', req);

		const { query, topK = 8, webEnabled = false } = req;

		// Simulate AI processing delay
		await new Promise(resolve => setTimeout(resolve, 1000));

		// Get mock search results for sources
		const searchResults = await this.search({
			text: query,
			topK: topK,
			searchMode: 'fulltext'
		});
		const sources = searchResults.items.map((item: any) => ({
			...item,
			source: 'local'
		}));

		// Simulate AI processing delay
		await new Promise(resolve => setTimeout(resolve, 3000));

		// Notify sources complete
		callbacks?.onComplete?.('other', '', { sources, duration: 100 });

		// Simulate AI processing delay
		await new Promise(resolve => setTimeout(resolve, 3000));

		// Call start callback
		callbacks?.onStart?.('summary');
		callbacks?.onStart?.('graph');
		callbacks?.onStart?.('topics');

		// Simulate streaming summary
		const summaryText = `Based on the search query "${query}", I found several relevant documents in your knowledge base. The analysis reveals key insights about your projects and daily activities.`;
		const summaryChars = summaryText.split('');
		for (let i = 0; i < summaryChars.length; i++) {
			await new Promise(resolve => setTimeout(resolve, 2));
			callbacks?.onDelta?.('summary', summaryChars[i]);
		}

		// Complete summary
		callbacks?.onComplete?.('summary', summaryText);

		// Simulate graph generation
		await new Promise(resolve => setTimeout(resolve, 500));
		const mockGraph = {
			nodes: [
				{ id: '1', label: 'Project Management', x: 100, y: 100, size: 20 },
				{ id: '2', label: 'Development', x: 200, y: 150, size: 18 },
				{ id: '3', label: 'Documentation', x: 150, y: 200, size: 16 },
				{ id: '4', label: 'Planning', x: 250, y: 100, size: 14 }
			],
			edges: [
				{ source: '1', target: '2', weight: 0.8 },
				{ source: '1', target: '3', weight: 0.6 },
				{ source: '2', target: '4', weight: 0.7 },
				{ source: '3', target: '4', weight: 0.5 }
			]
		};
		callbacks?.onComplete?.('graph', '', mockGraph);

		// Simulate topics generation
		await new Promise(resolve => setTimeout(resolve, 300));
		const mockTopics = [
			{ label: 'Project Development', weight: 0.9 },
			{ label: 'Knowledge Management', weight: 0.8 },
			{ label: 'Daily Planning', weight: 0.7 },
			{ label: 'Documentation', weight: 0.6 },
			{ label: 'Task Organization', weight: 0.5 }
		];
		callbacks?.onComplete?.('topics', '', { topics: mockTopics });

		// Return final result
		return {
			summary: summaryText,
			sources: sources,
			insights: {
				graph: mockGraph,
				topics: mockTopics
			},
			usage: {
				estimatedTokens: Math.floor(query.length * 1.5)
			},
			duration: 2000
		};
	}
}

