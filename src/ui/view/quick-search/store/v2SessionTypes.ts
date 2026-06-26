/**
 * T11I (2026-06-26): types + serializers moved to @/core/search/v2SessionTypes.
 * This module is now a thin re-export shim so existing UI callers keep
 * compiling. The neutral V2SessionSnapshot used by service-side
 * persistence lives in @/core/search/sessionSnapshot.
 */

export type {
	Annotation,
	Round,
	V2Section,
	V2SessionState,
	V2AnalysisSnapshotData,
} from '@/core/search/v2SessionTypes';

export {
	V2_INITIAL_STATE,
	buildV2AnalysisSnapshot,
	buildV2AnalysisSnapshotFromData,
	getAllSectionsFrom,
	getAllSourcesFrom,
} from '@/core/search/v2SessionTypes';
