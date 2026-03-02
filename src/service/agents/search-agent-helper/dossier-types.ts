/**
 * Types for InternalDossier (water-tank model).
 * Dossier holds: MindFlow trajectory, RawSearch runs (summary + report per run), Facts, Sources.
 */

import type { RawSearchReport } from "./RawSearchAgent";

/** Single fact with quote for citation. */
export interface EvidenceFact {
	claim: string;
	quote: string;
	confidence?: 'high' | 'medium' | 'low';
}

/** Snippet of source content (extract or condensed). */
export interface EvidenceSnippet {
	type: 'extract' | 'condensed';
	content: string;
}

/** One evidence pack from RawSearchAgent (one source, multiple facts + snippet). */
export interface EvidencePack {
	evidence_id?: string;
	/**
	 * Origin of one evidence pack (vault path or URL).
	 */
	origin: {
		tool: string;
		path_or_url: string;
	};
	summary?: string;
	facts: EvidenceFact[];
	snippet?: EvidenceSnippet;
	tags?: string[];
	relevance?: string;
	/** When true, a newer pack for same origin supersedes this. */
	superseded?: boolean;
}

/** One RawSearch run: prompt (goal), execution summary, report for MindFlow, and evidence stats. */
export interface RawSearchRun {
	/** Instruction/prompt for this run (from MindFlow). */
	prompt?: string;
	executionSummary: string;
	/** Tactical summary, leads, assessment for MindFlow. */
	rawSearchReport?: RawSearchReport | null;
	evidencePackCount: number;
	factCount: number;
}

/** One verified source (vault path or URL). */
export interface DossierSourceEntry {
	path_or_url: string;
	kind: 'vault_path' | 'url';
}

/**
 * InternalDossier: single source of truth for facts and flow.
 * - rawSearchRuns: one entry per RawSearch.stream() (executionSummary + rawSearchReport + stats)
 * - facts: by path_or_url for O(1) lookup when appending
 * - sources: all path_or_url (vault + URL)
 */
export interface InternalDossier {
	rawSearchRuns: RawSearchRun[];
	/** Key = origin.path_or_url; value = packs for that path (newest appended). */
	facts: Map<string, EvidencePack[]>;
	rawSearchExecutionSummary: string[];
	sources: DossierSourceEntry[];
}

/** Max number of recent rounds to include in derived "recent messages" for prompts. */
export const DEFAULT_RECENT_ROUNDS_KEEP = 10;
export const DOSSIER_FACTS_COMPRESS_THRESHOLD = 20;
export const DOSSIER_COMPRESS_AFTER_ITERATIONS = 5;
