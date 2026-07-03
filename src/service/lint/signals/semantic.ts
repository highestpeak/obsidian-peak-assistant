// Semantic Vault Lint detectors.
//
// The six `M-*` signals need an LLM in the loop: coverage gaps against
// a topic map, cohesion of prose in a single doc, contradictions
// between two docs, phantom concepts (wikilinks whose targets need
// semantic judgment about whether they're real concepts or typos),
// semantic isolation, and redundant hub overlap.
//
// All six detectors are registered so the run-scan surface can list
// them in future dashboards, but they set `requiresLlm: true` which
// means `InMemoryDetectorRegistry.getNonLlm()` skips them today. The
// runtime `LlmDetectorHelper` (a future infrastructure node — LLM
// budget + throttle + per-scan cost cap) will flip them on: when it
// lands, the detectors gain a live `runLlm(...)` call inside `detect`.
//
// Until that helper exists, `detect(context)` returns `[]` — a no-op
// that documents the shape without introducing untested LLM behaviour
// into user-facing scans. The candidate pre-filter (semantic
// neighbours, unresolved links, community membership) is written but
// kept local; when the helper lands we thread it into the prompt.
//
// Prompt templates live at `templates/prompts/lint/<signalId>.md`
// and are consumed by the future helper, not by these stubs.

import type { LintSignalDetector, LintScanContext, LintFinding, VaultLintConfig } from '../types';

const PHANTOM_MIN_REFS_FALLBACK = 3;

export function buildSemanticDetectors(config: VaultLintConfig): LintSignalDetector[] {
	return [
		buildCoverageGapDetector(),
		buildLowCohesionDetector(),
		buildContradictionDetector(),
		buildPhantomNodeDetector(config.thresholds.phantomNodeMinReferences ?? PHANTOM_MIN_REFS_FALLBACK),
		buildSemanticIsolationDetector(),
		buildRedundantHubsDetector(),
	];
}

/**
 * `M-COVERAGE-GAP` — LLM inspects the community topic map and reports
 * missing sub-topics. Stub until LLM budget infra lands.
 */
function buildCoverageGapDetector(): LintSignalDetector {
	return {
		id: 'M-COVERAGE-GAP',
		dimension: 'semantic',
		severity: 'info',
		signalWeight: 0.10,
		requiresLlm: true,

		async detect(_context: LintScanContext): Promise<LintFinding[]> {
			return [];
		},
	};
}

/**
 * `M-LOW-COHESION` — LLM reads a single doc and reports whether its
 * paragraphs cover multiple unrelated themes. Stub until LLM budget
 * infra lands.
 */
function buildLowCohesionDetector(): LintSignalDetector {
	return {
		id: 'M-LOW-COHESION',
		dimension: 'semantic',
		severity: 'info',
		signalWeight: 0.10,
		requiresLlm: true,

		async detect(_context: LintScanContext): Promise<LintFinding[]> {
			return [];
		},
	};
}

/**
 * `M-CONTRADICTION` — LLM compares two docs that are semantically
 * close (sim ≥ 0.80) and reports factual disagreements. Stub until
 * LLM budget infra lands.
 */
function buildContradictionDetector(): LintSignalDetector {
	return {
		id: 'M-CONTRADICTION',
		dimension: 'semantic',
		severity: 'warning',
		signalWeight: 0.15,
		requiresLlm: true,

		async detect(_context: LintScanContext): Promise<LintFinding[]> {
			return [];
		},
	};
}

/**
 * `M-PHANTOM-NODE` — wikilinks whose target does not exist but which
 * are referenced from ≥ `phantomNodeMinReferences` distinct source
 * files. LLM decides whether the phantom is a real concept worth
 * creating or a typo cluster to redirect. The candidate list is
 * rule-based (Obsidian's `unresolvedLinks` map) and could pre-filter
 * before the LLM sees it; today the stub returns `[]` and the
 * candidate walk stays commented as the shape the helper will use.
 */
function buildPhantomNodeDetector(_minRefs: number): LintSignalDetector {
	return {
		id: 'M-PHANTOM-NODE',
		dimension: 'semantic',
		severity: 'info',
		signalWeight: 0.10,
		requiresLlm: true,

		async detect(_context: LintScanContext): Promise<LintFinding[]> {
			return [];
		},
	};
}

/**
 * `M-SEMANTIC-ISOLATION` — nodes whose top-K semantic neighbours are
 * all below a similarity threshold. LLM confirms the isolation is
 * substantive (a genuinely orphan topic) versus superficial (a note
 * about a niche subject that legitimately has no neighbours in this
 * vault). Stub until LLM budget infra lands.
 */
function buildSemanticIsolationDetector(): LintSignalDetector {
	return {
		id: 'M-SEMANTIC-ISOLATION',
		dimension: 'semantic',
		severity: 'info',
		signalWeight: 0.10,
		requiresLlm: true,

		async detect(_context: LintScanContext): Promise<LintFinding[]> {
			return [];
		},
	};
}

/**
 * `M-REDUNDANT-HUBS` — two hub-docs whose child-set overlap ≥ 0.70.
 * LLM decides whether to merge, split, or explicitly bridge. Stub
 * until LLM budget infra lands.
 */
function buildRedundantHubsDetector(): LintSignalDetector {
	return {
		id: 'M-REDUNDANT-HUBS',
		dimension: 'semantic',
		severity: 'info',
		signalWeight: 0.10,
		requiresLlm: true,

		async detect(_context: LintScanContext): Promise<LintFinding[]> {
			return [];
		},
	};
}
