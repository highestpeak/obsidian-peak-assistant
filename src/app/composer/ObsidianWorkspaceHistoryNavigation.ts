import type { EventRef, WorkspaceLeaf } from 'obsidian';
import type {
	ComposerWorkspaceNavigationPort,
	ComposerWorkspaceNavigationSnapshot,
} from '@/core/composer';

interface ObsidianLeafHistory {
	backHistory: readonly unknown[];
	forwardHistory: readonly unknown[];
	go(delta: number): void | Promise<void>;
}

type NavigationLeaf = WorkspaceLeaf & {
	history?: ObsidianLeafHistory;
	on(name: 'history-change', callback: () => void): EventRef;
};

const EMPTY_NAVIGATION_SNAPSHOT: ComposerWorkspaceNavigationSnapshot = Object.freeze({
	canBack: false,
	canForward: false,
});

/**
 * Thin app-owned adapter over the same leaf history used by Obsidian's native
 * view-header arrows. The private history shape is isolated here and fails
 * closed if a future host version removes it.
 */
export class ObsidianWorkspaceHistoryNavigation implements ComposerWorkspaceNavigationPort {
	private snapshot: ComposerWorkspaceNavigationSnapshot;

	constructor(private readonly leaf: WorkspaceLeaf) {
		this.snapshot = this.readSnapshot();
	}

	getSnapshot(): ComposerWorkspaceNavigationSnapshot {
		return this.refreshSnapshot();
	}

	subscribe(listener: () => void): () => void {
		const leaf = this.navigationLeaf();
		const ref = leaf.on('history-change', () => {
			const previous = this.snapshot;
			const current = this.refreshSnapshot();
			if (current !== previous) listener();
		});
		return () => leaf.offref(ref);
	}

	async back(): Promise<void> {
		const history = this.availableHistory();
		if (!history || history.backHistory.length === 0) return;
		await history.go(-1);
	}

	async forward(): Promise<void> {
		const history = this.availableHistory();
		if (!history || history.forwardHistory.length === 0) return;
		await history.go(1);
	}

	private refreshSnapshot(): ComposerWorkspaceNavigationSnapshot {
		const next = this.readSnapshot();
		if (
			next.canBack === this.snapshot.canBack
			&& next.canForward === this.snapshot.canForward
		) return this.snapshot;
		this.snapshot = next;
		return next;
	}

	private readSnapshot(): ComposerWorkspaceNavigationSnapshot {
		const history = this.availableHistory();
		if (!history) return EMPTY_NAVIGATION_SNAPSHOT;
		return {
			canBack: history.backHistory.length > 0,
			canForward: history.forwardHistory.length > 0,
		};
	}

	private availableHistory(): ObsidianLeafHistory | null {
		const leaf = this.navigationLeaf();
		if (!leaf.view.navigation) return null;
		const history = leaf.history;
		if (!history || !Array.isArray(history.backHistory) || !Array.isArray(history.forwardHistory)) {
			return null;
		}
		if (typeof history.go !== 'function') return null;
		return history;
	}

	private navigationLeaf(): NavigationLeaf {
		return this.leaf as NavigationLeaf;
	}
}
