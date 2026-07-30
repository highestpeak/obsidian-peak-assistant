import type { V2Section } from '../store/searchSessionStore';

/**
 * The report becomes conversational only after every planned section has
 * reached a terminal state. A summary alone must not expose follow-up actions
 * while parallel section generation is still running.
 */
export function isReportReadyForFollowup(
	sections: readonly V2Section[],
	summary: string,
	summaryStreaming: boolean,
): boolean {
	if (summaryStreaming) return false;
	if (sections.length === 0) return summary.trim().length > 0;
	if (sections.some((section) => section.status === 'pending' || section.status === 'generating')) {
		return false;
	}
	return sections.some((section) => section.status === 'done' && section.content.trim().length > 0);
}
