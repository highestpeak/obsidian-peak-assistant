/**
 * chatBridge.ts — Dashboard-owned context utilization registry.
 *
 * The message receipt slot is canonical at
 * `src/ui/view/chat-view/integration/messageReceiptSlot.ts`; dashboard
 * code registers with that file directly. Composer slot (carrier C) was
 * retired in T11T — chat-side never pushed updates, so the registry was
 * dead.
 *
 * Context utilization stays here because the Dashboard Overview screen
 * is the only canonical reader and the chat side will push updates via
 * `setCurrentContextUtilization()` once the chat token-usage plumbing is
 * complete.
 */

export interface ContextUtilization {
	used: number;
	max: number;
	ratio: number;
}

let currentUtilization: ContextUtilization = { used: 0, max: 0, ratio: 0 };
const utilizationSubscribers = new Set<() => void>();

/** Chat-side calls this when context usage changes (e.g. after a turn). */
export function setCurrentContextUtilization(next: ContextUtilization): void {
	currentUtilization = next;
	utilizationSubscribers.forEach((fn) => {
		try { fn(); } catch { /* ignore subscriber errors */ }
	});
}

export function getCurrentContextUtilization(): ContextUtilization {
	return currentUtilization;
}

export function subscribeContextUtilization(fn: () => void): () => void {
	utilizationSubscribers.add(fn);
	return () => { utilizationSubscribers.delete(fn); };
}
