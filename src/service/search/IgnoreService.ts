import ignore from 'ignore';

/**
 * Service for handling file/directory ignore patterns similar to .gitignore.
 * Uses the node-ignore library to filter files during indexing.
 */
export class IgnoreService {
	private static instance: IgnoreService | null = null;
	private ig: ReturnType<typeof ignore>;
	private patterns: string[] = [];

	/**
	 * Get the global singleton instance.
	 * Must be initialized with init() before first use.
	 */
	static getInstance(): IgnoreService {
		if (!IgnoreService.instance) {
			throw new Error('IgnoreService not initialized. Call init() first.');
		}
		return IgnoreService.instance;
	}

	/**
	 * Initialize the global singleton instance.
	 * Should be called once during plugin initialization.
	 */
	static init(ignorePatterns: string[] = []): IgnoreService {
		if (IgnoreService.instance) {
			console.warn('IgnoreService already initialized. Reinitializing with new patterns.');
		}
		IgnoreService.instance = new IgnoreService(ignorePatterns);
		return IgnoreService.instance;
	}

	private constructor(ignorePatterns: string[] = []) {
		this.ig = ignore();
		this.updateSettings(ignorePatterns);
	}

	/**
	 * Update ignore patterns and reload the service.
	 * Should be called when ignore patterns are updated.
	 */
	updateSettings(ignorePatterns: string[]): void {
		this.patterns = ignorePatterns;
		// Reset the ignore instance
		this.ig = ignore();

		// Add all patterns
		if (ignorePatterns && ignorePatterns.length > 0) {
			this.ig.add(ignorePatterns);
		}
	}

	/**
	 * Check if a path should be ignored.
	 * @param path Relative path to check (should be relative to vault root)
	 * @returns true if the path should be ignored, false otherwise
	 */
	shouldIgnore(path: string): boolean {
		// Normalize path separators for cross-platform compatibility
		const normalizedPath = path.replace(/\\/g, '/');

		// Remove leading slash if present
		const cleanPath = normalizedPath.startsWith('/') ? normalizedPath.slice(1) : normalizedPath;

		return this.ig.ignores(cleanPath);
	}

	/**
	 * Filter an array of paths, removing ignored ones.
	 * @param paths Array of relative paths to filter
	 * @returns Array of paths that are not ignored
	 */
	filterPaths(paths: string[]): string[] {
		return this.ig.filter(paths);
	}

	/**
	 * Get the current ignore patterns.
	 * @returns Array of current ignore patterns
	 */
	getPatterns(): string[] {
		// Note: node-ignore doesn't provide a direct way to get patterns,
		// so we'll need to track them separately if needed
		return this.patterns;
	}

	/**
	 * Test ignore functionality with detailed result.
	 * @param path Path to test
	 * @returns Test result with ignore status and rule information
	 */
	test(path: string): { ignored: boolean; unignored: boolean; rule?: any } {
		const normalizedPath = path.replace(/\\/g, '/');
		const cleanPath = normalizedPath.startsWith('/') ? normalizedPath.slice(1) : normalizedPath;

		return this.ig.test(cleanPath);
	}
}
