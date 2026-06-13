// T10: Foreground-session port adapter.
//
// Wraps the Zustand `useSearchSessionStore` plus the `sessionRefs`
// hook-module global so the service-side runtime never touches them
// directly. This is the only file that consults the Zustand store on
// behalf of the background runtime.

import type {
	QuickSearchForegroundSessionPort,
} from '@/service/search/background/ports/QuickSearchBackgroundPorts';
import type {
	QuickSearchAgentHandle,
	QuickSearchForegroundDetachIntent,
	QuickSearchForegroundSnapshot,
} from '@/service/search/background/QuickSearchBackgroundTypes';
import { useSearchSessionStore } from '@/ui/view/quick-search/store/searchSessionStore';
import type { V2SessionSnapshot } from '@/ui/view/quick-search/store/sessionSnapshot';
import { sessionRefs } from '@/ui/view/quick-search/hooks/useSearchSession';

export class AppForegroundSessionAdapter implements QuickSearchForegroundSessionPort {
	detachIntent(): QuickSearchForegroundDetachIntent {
		const state = useSearchSessionStore.getState();
		const isActive = state.status === 'streaming' || state.status === 'starting';
		const hasPlanPending = state.v2PlanSections.length > 0 && !state.v2PlanApproved;
		return { isActive, hasPlanPending };
	}

	snapshot(): QuickSearchForegroundSnapshot {
		return useSearchSessionStore.getState().snapshotState();
	}

	resetForeground(): void {
		useSearchSessionStore.getState().resetAll();
	}

	restore(snapshot: QuickSearchForegroundSnapshot): void {
		// The opaque snapshot type accepts an arbitrary structural extra
		// payload; in practice it is always a `V2SessionSnapshot`.
		useSearchSessionStore.getState().restoreFromSnapshot(snapshot as V2SessionSnapshot);
	}

	getAgentHandle(): QuickSearchAgentHandle | null {
		// Capture both refs even if either is null so the background
		// runtime gets a stable record. The handle stays attached to the
		// session even when the foreground side clears its own copy.
		if (!sessionRefs.agentRef && !sessionRefs.abortController) return null;
		return {
			agentRef: sessionRefs.agentRef,
			abortController: sessionRefs.abortController,
		};
	}

	clearAgentHandle(): void {
		sessionRefs.agentRef = null;
		sessionRefs.abortController = null;
	}

	bindAgentHandle(handle: QuickSearchAgentHandle | null): void {
		sessionRefs.agentRef = (handle?.agentRef ?? null) as typeof sessionRefs.agentRef;
		sessionRefs.abortController = handle?.abortController ?? null;
	}
}
