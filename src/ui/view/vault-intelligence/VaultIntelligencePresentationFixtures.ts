import type { VaultIntelligenceSnapshot } from './VaultIntelligenceModel';

export type VaultIntelligencePresentationFixture = 'normal-data' | 'zero-data';

/**
 * Deterministic presentation adapter for the real workspace component.
 * The zero state removes content, not UI regions, so parity tests can catch
 * accidental `return null` and data-dependent geometry collapse.
 */
export function applyVaultIntelligencePresentationFixture(
	fixture: VaultIntelligencePresentationFixture,
	snapshot: VaultIntelligenceSnapshot,
): VaultIntelligenceSnapshot {
	if (fixture === 'normal-data') return snapshot;
	return {
		...snapshot,
		loading: false,
		error: null,
		digest: null,
		fileTypes: [],
		availablePaths: [],
		activityDays: [],
		changedSinceScan: 0,
		changedCursorAt: null,
		indexReadiness: {
			discovered: 0,
			searchReady: 0,
			pendingOrExcluded: 0,
			builtAt: null,
			isReady: false,
		},
		objects: [],
		tasks: [],
		lastCompletedRun: null,
		recentActivity: [],
		sourceActivity: [],
		proposals: [],
		mapTextEntries: [],
		activitySessions: [],
		activityThemes: [],
		communityMembers: {},
		events: [],
	};
}
