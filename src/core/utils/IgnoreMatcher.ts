import ignore from 'ignore';

/**
 * Pure path-pattern matcher for vault-relative paths.
 *
 * Pure data + functions only — no module-level singleton, no Obsidian, no
 * service-tier reach. The owning runtime (e.g. `DocumentLoaderManager`)
 * holds the instance and exposes it to consumers; consumers do not new this
 * up themselves and do not hold a static reference.
 */
export interface IgnoreMatcher {
	shouldIgnore(path: string): boolean;
	filterPaths(paths: string[]): string[];
	updatePatterns(patterns: string[]): void;
	getPatterns(): string[];
}

function normalizeVaultRelativePath(path: string): string {
	const slashed = path.replace(/\\/g, '/');
	return slashed.startsWith('/') ? slashed.slice(1) : slashed;
}

export function createIgnoreMatcher(patterns: string[] = []): IgnoreMatcher {
	let currentPatterns = patterns.slice();
	let ig = ignore();
	if (currentPatterns.length > 0) ig.add(currentPatterns);

	return {
		shouldIgnore(path: string): boolean {
			return ig.ignores(normalizeVaultRelativePath(path));
		},
		filterPaths(paths: string[]): string[] {
			return ig.filter(paths);
		},
		updatePatterns(patterns: string[]): void {
			currentPatterns = patterns.slice();
			ig = ignore();
			if (currentPatterns.length > 0) ig.add(currentPatterns);
		},
		getPatterns(): string[] {
			return currentPatterns.slice();
		},
	};
}
