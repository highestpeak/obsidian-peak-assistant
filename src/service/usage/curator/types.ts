// T11E (2026-06-25): Curator runtime push payload shape.
//
// Moved out of `src/ui/view/usage-dashboard/runtime/curatorPushStore.ts`
// so the service-side runtime can produce payloads without importing UI
// code. The Zustand store re-imports these types.

export type CuratorPushReason =
	| 'context-near-limit'
	| 'high-spend'
	| 'low-mpg'
	| 'model-recommendation';

export interface CuratorPushPayload {
	reason: CuratorPushReason;
	title: string;
	body: string;
	/** When provided, applying the recommendation runs this callback. */
	apply?: () => void | Promise<void>;
	/** Persistent across "Don't show this session" dismissal. */
	dismissKey?: string;
}
