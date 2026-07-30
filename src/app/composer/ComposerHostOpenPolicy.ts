/**
 * Framework-neutral policy helpers for Obsidian's host-owned `file-open`
 * lifecycle.
 *
 * The host event only provides a file. It does not identify the WorkspaceLeaf
 * that finished opening it, and `workspace.activeLeaf` may still point at the
 * previous view while the event is emitted. Keep that timing ambiguity out of
 * the router by resolving from the settled set of Markdown leaves.
 */

export interface HostOpenLeafCandidate<TLeaf> {
	leaf: TLeaf;
	filePath: string | null;
	active: boolean;
}

export function selectHostOpenedLeaf<TLeaf>(
	candidates: readonly HostOpenLeafCandidate<TLeaf>[],
	filePath: string,
): TLeaf | null {
	const matching = candidates.filter((candidate) => candidate.filePath === filePath);
	const active = matching.find((candidate) => candidate.active);
	if (active) return active.leaf;
	if (matching.length === 1) return matching[0].leaf;
	return null;
}

export interface HostOpenSuppressionToken {
	readonly filePath: string;
	readonly identity: symbol;
}

export interface HostOpenConversionToken<TLeaf extends object> {
	readonly leaf: TLeaf;
	readonly filePath: string;
	readonly identity: symbol;
}

/**
 * Latest-request-wins ownership for host conversions on one WorkspaceLeaf.
 * Obsidian can emit overlapping file-open lifecycles while reusing a tab; an
 * obsolete conversion may finish, but it can no longer roll that leaf back.
 */
export class HostOpenConversionRegistry<TLeaf extends object> {
	private readonly currentByLeaf = new WeakMap<TLeaf, HostOpenConversionToken<TLeaf>>();

	begin(leaf: TLeaf, filePath: string): HostOpenConversionToken<TLeaf> {
		const token: HostOpenConversionToken<TLeaf> = {
			leaf,
			filePath,
			identity: Symbol(filePath),
		};
		this.currentByLeaf.set(leaf, token);
		return token;
	}

	isCurrent(token: HostOpenConversionToken<TLeaf>): boolean {
		return this.currentByLeaf.get(token.leaf)?.identity === token.identity;
	}

	finish(token: HostOpenConversionToken<TLeaf>): void {
		if (!this.isCurrent(token)) return;
		this.currentByLeaf.delete(token.leaf);
	}
}

/**
 * One-shot suppressions for router-owned Markdown opens/restores.
 *
 * `file-open` can be emitted after `setViewState()` resolves, so a boolean
 * re-entry guard scoped to that promise is insufficient. A token remains
 * consumable until the host lifecycle settles; consuming or releasing it is
 * idempotent.
 */
export class HostOpenSuppressionRegistry {
	private readonly tokensByPath = new Map<string, HostOpenSuppressionToken[]>();

	begin(filePath: string): HostOpenSuppressionToken {
		const token: HostOpenSuppressionToken = {
			filePath,
			identity: Symbol(filePath),
		};
		const tokens = this.tokensByPath.get(filePath) ?? [];
		tokens.push(token);
		this.tokensByPath.set(filePath, tokens);
		return token;
	}

	consume(filePath: string): boolean {
		const tokens = this.tokensByPath.get(filePath);
		if (!tokens || tokens.length === 0) return false;
		tokens.shift();
		if (tokens.length === 0) this.tokensByPath.delete(filePath);
		return true;
	}

	release(token: HostOpenSuppressionToken): void {
		const tokens = this.tokensByPath.get(token.filePath);
		if (!tokens) return;
		const index = tokens.findIndex((candidate) => candidate.identity === token.identity);
		if (index < 0) return;
		tokens.splice(index, 1);
		if (tokens.length === 0) this.tokensByPath.delete(token.filePath);
	}
}
