/**
 * Mock playwright for desktop development
 * Playwright is a Node.js library and cannot run in browser environment
 */

export const chromium = {
	launch: async (options?: any) => {
		console.warn('Mock playwright.chromium.launch called - not available in browser environment');
		return {
			newPage: async () => ({
				goto: async () => {},
				content: async () => '<html></html>',
				close: async () => {},
			}),
			close: async () => {},
		};
	},
};

export type Browser = any;
export type Page = any;

