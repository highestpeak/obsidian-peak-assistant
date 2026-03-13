import type { RawSearchReportWithDimension } from '@/core/schemas/agents/search-agent-schemas';

/**
 * Minimal recon result: reports only. No affinity graph or cluster post-processing.
 */
export interface ReconSynthesisBundle {
	reports: RawSearchReportWithDimension[];
}
