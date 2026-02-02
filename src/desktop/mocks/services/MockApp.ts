/**
 * Mock Obsidian App for desktop development
 */
export class MockApp {
	isMock = true;

	vault = {
		getAbstractFileByPath: (_path: string) => null,
		getAllFolders: (_includeRoot?: boolean) => [
			{ path: '', name: '', isRoot: () => true, children: [] },
			{ path: 'Analysis/AI Searches', name: 'AI Searches', isRoot: () => false, children: [] },
		],
		getMarkdownFiles: () => [],
		read: async (_path: string) => '',
		write: async (_path: string, _data: string) => {},
		exists: (_path: string) => false,
		create: async (_path: string, _data: string) => {},
		createFolder: async (_path: string) => {},
		modify: async (_path: string, _data: string) => {},
		delete: async (_path: string) => {},
		rename: async (_path: string, _newPath: string) => {},
	};

	workspace = {
		trigger: (event: string, ...args: any[]) => {},
		on: (event: string, callback: (...args: any[]) => void) => {
			return () => {};
		},
		offref: (ref: any) => {},
		getActiveFile: () => null,
		getActiveViewOfType: (type: any) => null,
		iterateAllLeaves: (callback: (leaf: any) => void) => {
			// Mock implementation: do nothing since we don't have actual leaves in mock environment
			// In a real implementation, this would iterate through all open workspace leaves
		},
	};

	metadataCache = {
		getFileCache: (file: any) => null,
	};

	fileManager = {
		trash: async (file: any) => {},
	};

	commands = {
		executeCommandById: async (id: string) => {},
	};

	plugins = {
		plugins: {},
	};

	constructor() {}
}

