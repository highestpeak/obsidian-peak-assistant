import { z } from 'zod';

/**
 * Zod schema + types for the AI Query Rewrite (Suggest) feature.
 * See spec at `docs/research/2026-07-08-ai-query-rewrite/README.md`.
 *
 * The recorder builds a `BehaviorContextPayload` and the LLM returns a
 * `QueryRewriteResponse` matching `QueryRewriteResponseSchema`.
 */

// ---------------------------------------------------------------------------
// Session events — recorded by BehaviorContextRecorder while the Search Modal
// is open. Every event has a `t` (seconds since modal open), a `kind`, and
// (optionally) type-specific payload fields. Kinds match the essential-tier
// set in the spec's Event Catalog.
// ---------------------------------------------------------------------------

export type BehaviorEventKind =
	| 'modal.opened'
	| 'typed'
	| 'clearedInput'
	| 'switchedView'
	| 'switchedResultDensity'
	| 'switchedGraphPreset'
	| 'toggledSemantic'
	| 'expandedFolder'
	| 'collapsedFolder'
	| 'focusedFile'
	| 'openedInspector'
	| 'closedInspector'
	| 'pinnedHub'
	| 'unpinnedHub'
	| 'openedFile'
	| 'clickedAI';

export interface BehaviorEvent {
	t: number; // seconds since modal open, 1 decimal
	kind: BehaviorEventKind;
	value?: string;
	path?: string;
	durationMs?: number;
}

// ---------------------------------------------------------------------------
// Full payload sent to the LLM.
// ---------------------------------------------------------------------------

/**
 * Compact summary of a search result the user can see on-screen right now.
 * We ship title + path + score so the LLM can ground its suggestions in
 * "the user actually looked at these" without paying tokens for full
 * snippets (which would add ~30x more chars for minimal grounding gain).
 */
export interface FirstScreenResultRef {
	path: string;
	title: string;
	/** Final relevance score in `[0, 1]`, if the pipeline populated one. */
	score?: number;
}

export interface BehaviorContextPayload {
	currentQuery: string;
	activeFilePath: string | null;
	currentResultView: 'list' | 'tree' | 'graph';
	recentQueries: string[];
	recentOpenedFiles: string[];
	pinnedResultDocIds: string[] | null;
	sessionEvents: BehaviorEvent[];
	/** Available folders in the vault (top-level names) — helps LLM pick real ones. */
	knownTopFolders: string[];
	/**
	 * The top ~10 results currently rendered in the vault-search modal (the
	 * "first screen" the user is looking at). No snippet — path + title +
	 * score only. Empty when the user hasn't typed anything or the search
	 * hasn't run yet.
	 */
	firstScreenResults: FirstScreenResultRef[];
}

// ---------------------------------------------------------------------------
// LLM output shape.
// ---------------------------------------------------------------------------

export const RewriteCandidateSchema = z.object({
	title: z.string().min(1).max(120),
	query: z.string().min(1).max(500),
	reason: z.string().min(1).max(400),
});

export const QueryRewriteResponseSchema = z.object({
	candidates: z.array(RewriteCandidateSchema).min(1).max(5),
});

export type RewriteCandidate = z.infer<typeof RewriteCandidateSchema>;
export type QueryRewriteResponse = z.infer<typeof QueryRewriteResponseSchema>;
