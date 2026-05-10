import type { LintSignalDetector, LintDimension, LintSignalId } from './types';

/**
 * Global registry for lint signal detectors.
 * Detectors are registered at startup; the VaultLintService reads from this registry.
 */
export class SignalRegistry {
	private static instance: SignalRegistry | null = null;
	private detectors = new Map<LintSignalId, LintSignalDetector>();

	static getInstance(): SignalRegistry {
		if (!SignalRegistry.instance) SignalRegistry.instance = new SignalRegistry();
		return SignalRegistry.instance;
	}

	register(detector: LintSignalDetector): void {
		this.detectors.set(detector.id, detector);
	}

	getAll(): LintSignalDetector[] {
		return Array.from(this.detectors.values());
	}

	getByDimension(dimension: LintDimension): LintSignalDetector[] {
		return this.getAll().filter(d => d.dimension === dimension);
	}

	getNonLlm(): LintSignalDetector[] {
		return this.getAll().filter(d => !d.requiresLlm);
	}
}
