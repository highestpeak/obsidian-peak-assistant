// T11J A1: Pure lint data types relocated to `@/core/types/lint`. Runtime
// context types that hold service-internal port references stay here.

export * from '@/core/types/lint';

import type { LintSeverity, LintDimension, LintFinding, LintSignalId, LintDismissal } from '@/core/types/lint';

export interface LintScanContext {
  totalNotes: number;
  allNodeIds: string[];
  lastScanTimestamp: number | null;
  dismissals: Map<string, LintDismissal>;  // key: `${signalId}:${filePath}`
  /**
   * T7: narrow surface detectors use to read the vault, metadata
   * cache, graph nodes, and semantic neighbors. The runtime
   * composition wires an Obsidian/sqlite-backed adapter at boot; tests
   * inject a fake implementation. See
   * `src/service/lint/ports/VaultLintPorts.ts`.
   */
  detectorContext: import('./ports/VaultLintPorts').VaultLintDetectorContextPort;
}

export interface LintSignalDetector {
  id: LintSignalId;
  dimension: LintDimension;
  severity: LintSeverity;
  signalWeight: number;
  requiresLlm: boolean;
  detect(context: LintScanContext): Promise<LintFinding[]>;
}
