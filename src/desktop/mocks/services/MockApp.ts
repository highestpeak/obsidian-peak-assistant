/**
 * Mock Obsidian App for desktop development
 */
export class MockApp {
	isMock = true;

	vault = {
		getAbstractFileByPath: (path: string) => null,
		getMarkdownFiles: () => [],
		read: async (path: string) => '',
		write: async (path: string, data: string) => {},
		exists: (path: string) => false,
		create: async (path: string, data: string) => {},
		modify: async (path: string, data: string) => {},
		delete: async (path: string) => {},
		rename: async (path: string, newPath: string) => {},
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

