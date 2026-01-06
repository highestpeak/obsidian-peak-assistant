/**
 * Mock SearchClient for desktop development
 */
export class MockSearchClient {
	/**
	 * Search (mock implementation)
	 */
	async search(query: string): Promise<any[]> {
		console.log('MockSearchClient: search', query);
		return [];
	}
}

