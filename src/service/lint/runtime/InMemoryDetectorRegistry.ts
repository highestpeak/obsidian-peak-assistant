// T6 Vault Lint Ports — pure detector registry adapter.
//
// Before T6 `SignalRegistry.getInstance()` was a process-level singleton
// that held the built-in detectors in a Map. T6 deletes that singleton.
// `InMemoryDetectorRegistry` is the same Map-of-detectors logic, but as
// a per-runtime instance: the runtime composition constructs ONE
// registry, registers the built-in detectors during boot, hands it to
// the service via the port, and the service reads detectors out of it.
//
// No `getInstance`. No `static instance`. No module-level Map. The
// `ensureInitialized` method is idempotent so a second call during
// `runFullScan` (defense in depth) is a no-op.

import { brokenLinkDetector, buildStructuralDetectors, orphanDetector } from '../signals/structural';
import { emptyDetector, buildContentDetectors } from '../signals/content';
import { buildTagDetectors, untaggedDetector } from '../signals/tags';
import { buildHubDetectors } from '../signals/hub';
import type {
	LintSignalDetector,
	LintSignalId,
	VaultLintConfig,
} from '../types';
import type { VaultLintDetectorRegistryPort } from '../ports/VaultLintPorts';

export class InMemoryDetectorRegistry implements VaultLintDetectorRegistryPort {
	private readonly detectors = new Map<LintSignalId, LintSignalDetector>();
	private initialized = false;

	ensureInitialized(config: VaultLintConfig): void {
		if (this.initialized) return;
		this.detectors.set(orphanDetector.id, orphanDetector);
		this.detectors.set(brokenLinkDetector.id, brokenLinkDetector);
		for (const detector of buildStructuralDetectors(config)) {
			this.detectors.set(detector.id, detector);
		}
		this.detectors.set(emptyDetector.id, emptyDetector);
		for (const detector of buildContentDetectors(config)) {
			// `C-EMPTY` is already registered above; `buildContentDetectors`
			// emits it as part of its bundle but we keep the explicit
			// registration so the order matches the pre-T6 behavior. New
			// content detectors (`C-STUB`, `C-OVERSIZED`, ...) all flow in
			// through `buildContentDetectors`.
			if (detector.id !== 'C-EMPTY') this.detectors.set(detector.id, detector);
		}
		for (const detector of buildTagDetectors(config)) {
			// `G-UNTAGGED` is already the anchor; `buildTagDetectors`
			// re-emits it plus the new tag-explosion signal.
			if (detector.id !== 'G-UNTAGGED') this.detectors.set(detector.id, detector);
		}
		this.detectors.set(untaggedDetector.id, untaggedDetector);
		for (const detector of buildHubDetectors(config)) {
			this.detectors.set(detector.id, detector);
		}
		this.initialized = true;
	}

	getNonLlm(): LintSignalDetector[] {
		return Array.from(this.detectors.values()).filter((d) => !d.requiresLlm);
	}
}
