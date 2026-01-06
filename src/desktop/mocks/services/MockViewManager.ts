/**
 * Mock ViewManager for desktop development
 */
export class MockViewManager {
	/**
	 * Open a view (mock implementation)
	 */
	openView(viewType: string, data?: any): void {
		console.log('MockViewManager: openView', viewType, data);
	}

	/**
	 * Close a view (mock implementation)
	 */
	closeView(viewType: string): void {
		console.log('MockViewManager: closeView', viewType);
	}
}

