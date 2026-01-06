/**
 * Mock officeparser for browser environment
 */
const officeParser = {
	parseOfficeAsync: async (buffer: any) => {
		console.warn('officeparser not available in browser, returning empty text');
		return '';
	},
};

export default officeParser;

