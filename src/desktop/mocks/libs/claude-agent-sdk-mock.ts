/**
 * Mock @anthropic-ai/claude-agent-sdk for browser environment
 */
export function tool(_def: any) {
	return _def;
}

export function createSdkMcpServer(_options: any) {
	return {
		start: async () => {},
		stop: async () => {},
	};
}

export async function query(_options: any) {
	return { content: 'Mock SDK response' };
}

export default { tool, createSdkMcpServer, query };
