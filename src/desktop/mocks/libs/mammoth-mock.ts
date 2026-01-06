/**
 * Mock mammoth for browser environment
 */
const mammoth = {
	extractRawText: async (options: any) => {
		console.warn('mammoth not available in browser, returning empty text');
		return { value: '' };
	},
};

export default mammoth;

