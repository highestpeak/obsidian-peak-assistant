/**
 * T11I (2026-06-26): port for ReportOrchestrator to read/write
 * report-generation session state without importing the UI Zustand
 * store directly.
 *
 * The previous design called `useSearchSessionStore.getState()` from
 * the service, which made ReportOrchestrator depend on
 * `@/ui/view/quick-search/store/searchSessionStore`. The app-layer
 * adapter (`src/app/quick-search/SearchSessionReportAdapter.ts`)
 * wraps that store; the orchestrator only sees this interface.
 */

import type { V2Section } from '@/core/search/v2SessionTypes';

export interface ReportSessionPort {
	getUserInsights(): string[];
	getPlanSections(): V2Section[];
	setPlanSections(sections: V2Section[]): void;
	updatePlanSection(id: string, updater: (s: V2Section) => V2Section): void;
	appendSectionChunk(id: string, chunk: string): void;
	completeSectionContent(id: string, content: string): void;
	failSection(id: string, error: string): void;
	startSectionRegenerate(id: string): void;
	setSummaryStreaming(streaming: boolean): void;
	setSummary(text: string): void;
}
