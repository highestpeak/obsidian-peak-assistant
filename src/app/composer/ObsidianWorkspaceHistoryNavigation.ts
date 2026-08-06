import type { EventRef, WorkspaceLeaf } from 'obsidian';
import {
	normalizeComposerViewState,
	type ComposerWorkspaceNavigationPort,
	type ComposerWorkspaceNavigationSnapshot,
} from '@/core/composer';
import { DOCUMENT_COMPOSER_VIEW_TYPE } from './viewType';

interface ObsidianLeafHistoryEntry {
	state?: unknown;
}

interface ObsidianLeafHistory {
	backHistory: readonly ObsidianLeafHistoryEntry[];
	forwardHistory: readonly ObsidianLeafHistoryEntry[];
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
 * App-owned document projection over the same leaf history used by Obsidian's
 * native view-header arrows. Same-file view states and non-document surfaces
 * are skipped in one native `go()` call so they never render as intermediate
 * navigation steps. The private history shape is isolated here and fails
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
		const target = this.documentTarget('back');
		if (!target) return;
		await target.history.go(target.delta);
	}

	async forward(): Promise<void> {
		const target = this.documentTarget('forward');
		if (!target) return;
		await target.history.go(target.delta);
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
		const back = this.documentTarget('back');
		const forward = this.documentTarget('forward');
		if (!back && !forward) return EMPTY_NAVIGATION_SNAPSHOT;
		return {
			canBack: back !== null,
			canForward: forward !== null,
		};
	}

	private documentTarget(
		direction: 'back' | 'forward',
	): { history: ObsidianLeafHistory; delta: number } | null {
		const history = this.availableHistory();
		if (!history) return null;
		const currentPath = documentPathForViewState(this.leaf.getViewState());
		if (!currentPath) return null;
		const entries = direction === 'back' ? history.backHistory : history.forwardHistory;
		for (let index = entries.length - 1; index >= 0; index -= 1) {
			const candidatePath = documentPathForHistoryEntry(entries[index]);
			if (!candidatePath || candidatePath === currentPath) continue;
			const distance = entries.length - index;
			return {
				history,
				delta: direction === 'back' ? -distance : distance,
			};
		}
		return null;
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

function documentPathForHistoryEntry(entry: ObsidianLeafHistoryEntry): string | null {
	return documentPathForViewState(entry.state);
}

function documentPathForViewState(value: unknown): string | null {
	const viewState = asRecord(value);
	const type = typeof viewState.type === 'string' ? viewState.type : '';
	const state = asRecord(viewState.state);
	if (type === DOCUMENT_COMPOSER_VIEW_TYPE) {
		return normalizeComposerViewState(state)?.filePath ?? null;
	}
	if (type !== 'markdown') return null;
	return normalizePath(state.file);
}

function normalizePath(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === 'object'
		? value as Record<string, unknown>
		: {};
}
