/**
 * Peak Composer — Intelligence Sidecar UI barrel (WP9). The Composer view mounts
 * {@link IntelligenceSidecar} with an app-owned IntelligenceRuntime; the pure
 * adapter + config are exported for host wiring and tests.
 */
export { IntelligenceSidecar } from './IntelligenceSidecar';
export type { IntelligenceSidecarProps } from './IntelligenceSidecar';
export {
	DEFAULT_SIDECAR_CONFIG,
	loadSidecarConfig,
	loadTelemetryCatalog,
	type SidecarConfig,
	type SidecarStrings,
	type TelemetryCatalog,
	type TelemetryEventSpec,
} from './sidecarConfig';
export {
	initialComposerBrowserState,
	mapRelatedSnapshotToBrowserSnapshot,
	mapComposerStateToProjectionState,
	applyComposerProjectionChange,
	localFilterItems,
	resolveSelectionAfterRevision,
	resolveComposerOpenDisposition,
	type ComposerBrowserState,
} from './ComposerResultBrowserAdapter';
export { buildFocusRunContext, resolveRelatedFocus } from './focusContext';
