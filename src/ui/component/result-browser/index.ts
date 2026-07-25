/**
 * Shared controlled Result Browser — the single production UI source of truth
 * for the List / Tree / Graph result projections, their toolbar and scoped
 * keyboard (2026-07-24 handoff §12.5). Controlled and host-neutral: no store,
 * no service context, no query, no telemetry, no open policy. Host adapters
 * (Quick Search today, Composer next) bind those concerns.
 */
export * from './model';
export {
	ResultBrowserViewToggle,
	ResultBrowserDensityToggle,
	ResultBrowserGraphControls,
} from './toolbar/ResultBrowserToolbar';
export type {
	ViewModeToggleProps,
	DensityToggleProps,
	GraphControlsProps,
} from './toolbar/ResultBrowserToolbar';
export { ResultBrowserListRow } from './list/ResultBrowserListRow';
export type { ResultBrowserListRowProps } from './list/ResultBrowserListRow';
export { ResultBrowserTree } from './tree/ResultBrowserTree';
export type { ResultBrowserTreeProps } from './tree/ResultBrowserTree';
export { ResultBrowserGraph, RESULT_BROWSER_GRAPH_NODE_CAP } from './graph/ResultBrowserGraph';
export type { ResultBrowserGraphProps } from './graph/ResultBrowserGraph';
