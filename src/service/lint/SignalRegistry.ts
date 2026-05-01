import type { LintSignalId, LintSignalDetector, LintScanContext, LintFinding, LintDimension } from './types';

/**
 * Registry holding signal detector definitions. Pure class with no external dependencies.
 *
 * - `register(detector)` — adds a detector
 * - `getAllDetectors()` — returns all registered detectors
 * - `getDetectorsByDimension(dim)` — filters by dimension
 * - `runAll(context)` — runs all non-LLM detectors, returns merged findings
 * - `runLlmDetectors(context)` — runs only LLM-requiring detectors (for background batch)
 */
export class SignalRegistry {
	private readonly detectors = new Map<LintSignalId, LintSignalDetector>();

	register(detector: LintSignalDetector): void {
		this.detectors.set(detector.id, detector);
	}

	getAllDetectors(): LintSignalDetector[] {
		return Array.from(this.detectors.values());
	}

	getDetector(id: LintSignalId): LintSignalDetector | undefined {
		return this.detectors.get(id);
	}

	getDetectorsByDimension(dimension: LintDimension): LintSignalDetector[] {
		return this.getAllDetectors().filter(d => d.dimension === dimension);
	}

	/**
	 * Run all detectors that do NOT require LLM. Returns merged findings array.
	 */
	async runAll(context: LintScanContext): Promise<LintFinding[]> {
		const detectors = this.getAllDetectors().filter(d => !d.requiresLlm);
		const results = await Promise.all(detectors.map(d => d.detect(context)));
		return results.flat();
	}

	/**
	 * Run only LLM-requiring detectors (intended for background batch processing).
	 */
	async runLlmDetectors(context: LintScanContext): Promise<LintFinding[]> {
		const detectors = this.getAllDetectors().filter(d => d.requiresLlm);
		const results = await Promise.all(detectors.map(d => d.detect(context)));
		return results.flat();
	}
}
