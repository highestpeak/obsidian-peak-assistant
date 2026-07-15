import { useVaultSearchStore } from '@/ui/view/quick-search/store/vaultSearchStore';
import { useSharedStore } from '@/ui/view/quick-search/store/sharedStore';
import type { BehaviorEvent, BehaviorEventKind } from '@/core/schemas/queryRewrite';

/**
 * BehaviorContextRecorder — sidecar service that records what the user does
 * while the Vault Search modal is open. When the user clicks the Suggest
 * button, `AIQueryRewriteService` snapshots the recorder and ships the events
 * to the LLM as behavior context.
 *
 * Design decisions (see spec at
 * `docs/research/2026-07-08-ai-query-rewrite/README.md`):
 * - Ring buffer capped at MAX_EVENTS to bound payload size.
 * - `typed` events collapse to the LAST value only (spec's compression rule).
 * - Runs off Zustand store subscriptions rather than modifying every event
 *   source — the store is already the ground truth for view / cursor /
 *   folder / pin state, so this recorder covers the essential events for
 *   free.
 * - Hover / open-file / graph-node events are NOT store-derived; they can be
 *   pushed explicitly by future callers via `push()`.
 * - `t` is seconds since `start()` was called.
 * - Recorder is idle when not started. `start()` resets state and installs
 *   subscriptions; `stop()` uninstalls and drops the buffer.
 */

const MAX_EVENTS = 30;

class BehaviorContextRecorder {
	private static instance: BehaviorContextRecorder | null = null;

	private startedAtMs: number | null = null;
	private events: BehaviorEvent[] = [];
	private typedDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	private pendingTyped: string | null = null;
	private unsubs: Array<() => void> = [];
	private lastState: {
		vaultQuery: string;
		resultView: string;
		resultDensity: string;
		graphPreset: string;
		graphShowSemantic: boolean;
		treeCursor: string | null;
		treeCollapsedFolders: string[];
		pinnedResultDocIds: string[] | null;
		inspectorOpen: boolean;
	} | null = null;

	static getInstance(): BehaviorContextRecorder {
		if (!this.instance) this.instance = new BehaviorContextRecorder();
		return this.instance;
	}

	/** True when a session is being recorded. */
	isActive(): boolean {
		return this.startedAtMs !== null;
	}

	/** Start recording. Called from `QuickSearchModal.onOpen`. */
	start(): void {
		this.stop(); // idempotent — clean state
		this.startedAtMs = Date.now();
		this.events = [];
		this.record('modal.opened');
		this.snapshotState();
		this.installSubscriptions();
	}

	/** Stop recording. Called from `QuickSearchModal.onClose`. */
	stop(): void {
		if (this.typedDebounceTimer) {
			clearTimeout(this.typedDebounceTimer);
			this.typedDebounceTimer = null;
		}
		this.pendingTyped = null;
		for (const un of this.unsubs) {
			try { un(); } catch { /* ignore */ }
		}
		this.unsubs = [];
		this.startedAtMs = null;
		this.events = [];
		this.lastState = null;
	}

	/** Snapshot current buffer for AI Query Rewrite service. */
	snapshotEvents(): BehaviorEvent[] {
		// Flush any pending debounced typed event first — otherwise the last
		// keystroke never makes it into the snapshot.
		if (this.typedDebounceTimer) {
			clearTimeout(this.typedDebounceTimer);
			this.typedDebounceTimer = null;
			if (this.pendingTyped !== null) {
				this.recordTyped(this.pendingTyped);
				this.pendingTyped = null;
			}
		}
		return [...this.events];
	}

	/** Explicitly push an event (for cases the store doesn't cover). */
	push(kind: BehaviorEventKind, extras: Partial<BehaviorEvent> = {}): void {
		this.record(kind, extras);
	}

	// -------------------------------------------------------------------
	// Internal
	// -------------------------------------------------------------------

	private record(kind: BehaviorEventKind, extras: Partial<BehaviorEvent> = {}): void {
		if (this.startedAtMs === null) return;
		const t = Math.round(((Date.now() - this.startedAtMs) / 100)) / 10;
		this.events.push({ t, kind, ...extras });
		if (this.events.length > MAX_EVENTS) this.events.shift();
	}

	private recordTyped(value: string): void {
		// Collapse consecutive `typed` events to a single last-value entry.
		const last = this.events[this.events.length - 1];
		if (last && last.kind === 'typed') {
			last.value = value;
			last.t = this.currentT();
			return;
		}
		this.record('typed', { value });
	}

	private currentT(): number {
		if (this.startedAtMs === null) return 0;
		return Math.round(((Date.now() - this.startedAtMs) / 100)) / 10;
	}

	private snapshotState(): void {
		const shared = useSharedStore.getState();
		const vault = useVaultSearchStore.getState();
		this.lastState = {
			vaultQuery: shared.vaultSearchQuery ?? '',
			resultView: vault.resultView,
			resultDensity: vault.resultDensity,
			graphPreset: vault.graphPreset,
			graphShowSemantic: vault.graphShowSemantic,
			treeCursor: vault.treeCursor,
			treeCollapsedFolders: [...vault.treeCollapsedFolders],
			pinnedResultDocIds: vault.pinnedResultDocIds ? [...vault.pinnedResultDocIds] : null,
			inspectorOpen: vault.inspectorOpen,
		};
	}

	private installSubscriptions(): void {
		this.unsubs.push(useSharedStore.subscribe((s) => this.onSharedChange(s)));
		this.unsubs.push(useVaultSearchStore.subscribe((s) => this.onVaultChange(s)));
	}

	private onSharedChange(s: ReturnType<typeof useSharedStore.getState>): void {
		if (!this.lastState) return;
		const next = s.vaultSearchQuery ?? '';
		if (next !== this.lastState.vaultQuery) {
			this.lastState.vaultQuery = next;
			this.handleTypedChange(next);
		}
	}

	private handleTypedChange(value: string): void {
		if (value.length === 0) {
			// Immediate clearedInput signal — no debounce.
			if (this.typedDebounceTimer) {
				clearTimeout(this.typedDebounceTimer);
				this.typedDebounceTimer = null;
			}
			this.pendingTyped = null;
			this.record('clearedInput');
			return;
		}
		// Debounce typed events 500ms — records only the last keystroke in a
		// burst, matching the spec's Input tier rules.
		this.pendingTyped = value;
		if (this.typedDebounceTimer) clearTimeout(this.typedDebounceTimer);
		this.typedDebounceTimer = setTimeout(() => {
			if (this.pendingTyped !== null) this.recordTyped(this.pendingTyped);
			this.pendingTyped = null;
			this.typedDebounceTimer = null;
		}, 500);
	}

	private onVaultChange(s: ReturnType<typeof useVaultSearchStore.getState>): void {
		if (!this.lastState) return;
		const prev = this.lastState;

		if (s.resultView !== prev.resultView) {
			this.record('switchedView', { value: s.resultView });
			prev.resultView = s.resultView;
		}
		if (s.resultDensity !== prev.resultDensity) {
			this.record('switchedResultDensity', { value: s.resultDensity });
			prev.resultDensity = s.resultDensity;
		}
		if (s.graphPreset !== prev.graphPreset) {
			this.record('switchedGraphPreset', { value: s.graphPreset });
			prev.graphPreset = s.graphPreset;
		}
		if (s.graphShowSemantic !== prev.graphShowSemantic) {
			this.record('toggledSemantic', { value: s.graphShowSemantic ? 'on' : 'off' });
			prev.graphShowSemantic = s.graphShowSemantic;
		}
		if (s.treeCursor !== prev.treeCursor) {
			if (s.treeCursor) this.record('focusedFile', { path: s.treeCursor });
			prev.treeCursor = s.treeCursor;
		}
		if (s.inspectorOpen !== prev.inspectorOpen) {
			this.record(s.inspectorOpen ? 'openedInspector' : 'closedInspector');
			prev.inspectorOpen = s.inspectorOpen;
		}
		// Folder expand/collapse: diff the arrays.
		const prevCollapsed = new Set(prev.treeCollapsedFolders);
		const nextCollapsed = new Set(s.treeCollapsedFolders);
		for (const p of nextCollapsed) {
			if (!prevCollapsed.has(p)) this.record('collapsedFolder', { path: p });
		}
		for (const p of prevCollapsed) {
			if (!nextCollapsed.has(p)) this.record('expandedFolder', { path: p });
		}
		prev.treeCollapsedFolders = [...s.treeCollapsedFolders];
		// Pinned hub — pin vs unpin.
		const prevPinned = prev.pinnedResultDocIds !== null;
		const nextPinned = s.pinnedResultDocIds !== null;
		if (prevPinned !== nextPinned) {
			this.record(nextPinned ? 'pinnedHub' : 'unpinnedHub');
			prev.pinnedResultDocIds = s.pinnedResultDocIds ? [...s.pinnedResultDocIds] : null;
		}
	}
}

export const behaviorRecorder = BehaviorContextRecorder.getInstance();
