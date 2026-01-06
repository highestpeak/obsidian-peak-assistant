/**
 * Mock @langchain/community/document_loaders/web/playwright for desktop development
 */

export class PlaywrightWebBaseLoader {
	constructor(url: string, options?: any) {
		console.warn('Mock PlaywrightWebBaseLoader created - not available in browser environment');
	}

	async load() {
		return [];
	}
}

