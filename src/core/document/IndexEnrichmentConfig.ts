/**
 * Index-time generation limits and observability policy.
 * Source of truth: templates/config/index-enrichment.json.
 */
import defaults from '../../../templates/config/index-enrichment.json';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import { TemplateManager } from '@/core/template/TemplateManager';

export interface IndexEnrichmentConfig {
	outputControl: {
		summaryShortMaxTokens: number;
		summaryFullMaxTokens: number;
		tagsMaxTokens: number;
	};
	instructions: {
		summary: string;
		tags: string;
	};
	trace: {
		maxRecentCalls: number;
	};
}

export const DEFAULT_INDEX_ENRICHMENT_CONFIG = defaults as IndexEnrichmentConfig;

export async function loadIndexEnrichmentConfig(): Promise<IndexEnrichmentConfig> {
	try {
		const manager = TemplateManager.getInstance();
		if (!manager) return DEFAULT_INDEX_ENRICHMENT_CONFIG;
		const loaded = await manager.loadJson<Partial<IndexEnrichmentConfig>>(ConfigTemplateId.IndexEnrichment);
		return normalizeIndexEnrichmentConfig(loaded);
	} catch {
		return DEFAULT_INDEX_ENRICHMENT_CONFIG;
	}
}

function normalizeIndexEnrichmentConfig(loaded: Partial<IndexEnrichmentConfig> | null | undefined): IndexEnrichmentConfig {
	const outputControl = loaded?.outputControl ?? DEFAULT_INDEX_ENRICHMENT_CONFIG.outputControl;
	const instructions = loaded?.instructions ?? DEFAULT_INDEX_ENRICHMENT_CONFIG.instructions;
	const trace = loaded?.trace ?? DEFAULT_INDEX_ENRICHMENT_CONFIG.trace;
	return {
		outputControl: {
			summaryShortMaxTokens: positiveInteger(outputControl.summaryShortMaxTokens, DEFAULT_INDEX_ENRICHMENT_CONFIG.outputControl.summaryShortMaxTokens),
			summaryFullMaxTokens: positiveInteger(outputControl.summaryFullMaxTokens, DEFAULT_INDEX_ENRICHMENT_CONFIG.outputControl.summaryFullMaxTokens),
			tagsMaxTokens: positiveInteger(outputControl.tagsMaxTokens, DEFAULT_INDEX_ENRICHMENT_CONFIG.outputControl.tagsMaxTokens),
		},
		instructions: {
			summary: String(instructions.summary || DEFAULT_INDEX_ENRICHMENT_CONFIG.instructions.summary),
			tags: String(instructions.tags || DEFAULT_INDEX_ENRICHMENT_CONFIG.instructions.tags),
		},
		trace: {
			maxRecentCalls: positiveInteger(trace.maxRecentCalls, DEFAULT_INDEX_ENRICHMENT_CONFIG.trace.maxRecentCalls),
		},
	};
}

function positiveInteger(value: unknown, fallback: number): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
