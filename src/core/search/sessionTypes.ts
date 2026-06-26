// T11I (2026-06-26): neutral session status / auto-save state types.
// Extracted from src/ui/view/quick-search/store/searchSessionStore so that
// service-side persistence and the neutral V2SessionSnapshot can refer to
// them without importing the UI Zustand module. HitlState intentionally
// stays in the UI store: it carries PlanSnapshot (service type) and is
// only consumed by the live UI session.

export type SessionStatus =
	| 'idle'
	| 'starting'
	| 'streaming'
	| 'plan_ready'
	| 'completed'
	| 'error'
	| 'canceled';

export interface AutoSaveState {
	lastRunId: string | null;
	lastSavedSummaryHash: string | null;
	lastSavedPath: string | null;
}
