/**
 * Debug hooks for HubDiscoveryAgent: stopAt resolution and per-phase recon options.
 */

/** Where to stop or how many recon iterations to allow (see HubDiscoveryAgentOptions). */
export type HubDiscoveryStopAt =
	| 'prep'
	/** After the full folder recon loop (until should_stop or iteration cap). Skips document recon. */
	| 'folder_hub'
	| 'after_folder_recon'
	| { hook: 'folder_plan'; iteration: number }
	| { hook: 'folder_submit'; iteration: number }
	| { hook: 'document_plan'; iteration: number }
	| { hook: 'document_submit'; iteration: number };

/** @deprecated Use HubDiscoveryStopAt */
export type HubDiscoveryStopAtPhase = HubDiscoveryStopAt;

export type ReconLoopDebugOptions = {
	/** Overrides budget-derived iteration cap (clamped to 1..6). */
	maxIterations?: number;
	/** 1-based: exit after this iteration’s plan + host tool execution (before structured submit). */
	stopAfterPlanIteration?: number;
	/** 1-based: exit after this iteration’s submit and memory merge. */
	stopAfterSubmitIteration?: number;
};

function clampInt(n: number, lo: number, hi: number): number {
	return Math.max(lo, Math.min(hi, Math.floor(n)));
}

/**
 * Returns true when the pipeline should not run document recon (folder phase only or prep).
 */
export function shouldSkipDocumentRecon(stopAt: HubDiscoveryStopAt | undefined): boolean {
	if (stopAt === undefined) return false;
	if (stopAt === 'prep') return false;
	if (stopAt === 'folder_hub' || stopAt === 'after_folder_recon') return true;
	if (typeof stopAt === 'object' && stopAt !== null && 'hook' in stopAt) {
		return stopAt.hook === 'folder_plan' || stopAt.hook === 'folder_submit';
	}
	return false;
}

/**
 * Build folder recon loop debug options from agent options.
 */
export function resolveFolderReconDebug(options: {
	stopAt?: HubDiscoveryStopAt;
	folderReconMaxIterations?: number;
}): ReconLoopDebugOptions | undefined {
	const { stopAt, folderReconMaxIterations: maxCap } = options;
	const out: ReconLoopDebugOptions = {};
	if (maxCap !== undefined) out.maxIterations = clampInt(maxCap, 1, 6);
	if (typeof stopAt === 'object' && stopAt !== null && 'hook' in stopAt) {
		if (stopAt.hook === 'folder_plan') {
			out.stopAfterPlanIteration = clampInt(stopAt.iteration, 1, 99);
		}
		if (stopAt.hook === 'folder_submit') {
			out.stopAfterSubmitIteration = clampInt(stopAt.iteration, 1, 99);
		}
	}
	if (out.maxIterations === undefined && out.stopAfterPlanIteration === undefined && out.stopAfterSubmitIteration === undefined) {
		return undefined;
	}
	return out;
}

/**
 * Build document recon loop debug options from agent options.
 */
export function resolveDocumentReconDebug(options: {
	stopAt?: HubDiscoveryStopAt;
	documentReconMaxIterations?: number;
}): ReconLoopDebugOptions | undefined {
	const { stopAt, documentReconMaxIterations: maxCap } = options;
	const out: ReconLoopDebugOptions = {};
	if (maxCap !== undefined) out.maxIterations = clampInt(maxCap, 1, 6);
	if (typeof stopAt === 'object' && stopAt !== null && 'hook' in stopAt) {
		if (stopAt.hook === 'document_plan') {
			out.stopAfterPlanIteration = clampInt(stopAt.iteration, 1, 99);
		}
		if (stopAt.hook === 'document_submit') {
			out.stopAfterSubmitIteration = clampInt(stopAt.iteration, 1, 99);
		}
	}
	if (out.maxIterations === undefined && out.stopAfterPlanIteration === undefined && out.stopAfterSubmitIteration === undefined) {
		return undefined;
	}
	return out;
}

/**
 * Effective max iterations for a recon loop: budget-derived bound merged with debug cap.
 */
export function effectiveReconMaxIterations(budgetDerived: number, debug?: ReconLoopDebugOptions): number {
	const base = Math.max(1, Math.min(6, budgetDerived));
	if (debug?.maxIterations !== undefined) {
		return Math.max(1, Math.min(6, Math.min(base, debug.maxIterations)));
	}
	return base;
}
