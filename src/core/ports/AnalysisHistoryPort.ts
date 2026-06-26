import type { Database as DbSchema } from '@/core/storage/sqlite/ddl';

/**
 * Single record shape returned by the AI analysis history port. Re-exports
 * the underlying SQLite row type so callers don't have to import from the
 * service tier just to spell the return type.
 */
export type AnalysisHistoryRecord = DbSchema['ai_analysis_record'];

/**
 * Narrow read port over AI analysis history. Exists so that service-tier
 * code (slots, agent tools) can consume "recent analyses" without reaching
 * back into `AppContext` or the concrete `AIAnalysisHistoryService`.
 *
 * Intentionally exposes only `list` — the slot + the agent tool that need
 * recent analyses don't write history. If more methods are needed later,
 * add them here, not via a god-port.
 */
export interface AnalysisHistoryPort {
	list(opts: { limit: number; offset: number }): Promise<AnalysisHistoryRecord[]>;
}
