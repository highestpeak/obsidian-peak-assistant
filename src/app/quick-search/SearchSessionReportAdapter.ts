/**
 * T11I (2026-06-26): app-layer adapter for ReportSessionPort.
 *
 * Wraps the UI `useSearchSessionStore` Zustand store. Constructed once
 * per `ReportOrchestrator` instance in `useSearchSession.ts`. The
 * orchestrator never imports the store directly.
 */

import type { ReportSessionPort } from '@/core/ports/ReportSessionPort';
import type { V2Section } from '@/core/search/v2SessionTypes';
import { useSearchSessionStore } from '@/ui/view/quick-search/store/searchSessionStore';

export class SearchSessionReportAdapter implements ReportSessionPort {
	getUserInsights(): string[] {
		return useSearchSessionStore.getState().v2UserInsights;
	}

	getPlanSections(): V2Section[] {
		return useSearchSessionStore.getState().v2PlanSections;
	}

	setPlanSections(sections: V2Section[]): void {
		useSearchSessionStore.getState().setPlanSections(sections);
	}

	updatePlanSection(id: string, updater: (s: V2Section) => V2Section): void {
		useSearchSessionStore.getState().updatePlanSection(id, updater);
	}

	appendSectionChunk(id: string, chunk: string): void {
		useSearchSessionStore.getState().appendSectionChunk(id, chunk);
	}

	completeSectionContent(id: string, content: string): void {
		useSearchSessionStore.getState().completeSectionContent(id, content);
	}

	failSection(id: string, error: string): void {
		useSearchSessionStore.getState().failSection(id, error);
	}

	startSectionRegenerate(id: string): void {
		useSearchSessionStore.getState().startSectionRegenerate(id);
	}

	setSummaryStreaming(streaming: boolean): void {
		useSearchSessionStore.getState().setSummaryStreaming(streaming);
	}

	setSummary(text: string): void {
		useSearchSessionStore.getState().setSummary(text);
	}
}
