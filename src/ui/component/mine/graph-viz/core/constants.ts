/**
 * Centralized constants for graph visualization.
 * Tuning these affects performance and UX (stagger, streaming, hover).
 */

/** Opacity for non-hovered nodes/links when a node is hovered. */
export const HOVER_DIM_OPACITY = 0.36;

/** Stagger delay (ms) per element for incremental enter animation. */
export const STAGGER_NODE_MS = 55;
/** Duration (ms) for node fade-in when streaming. */
export const NODE_ENTER_FADE_MS = 250;
export const STAGGER_LINK_MS = 45;

/** When graph node count exceeds this, ingest via internal streaming to avoid UI freeze. */
export const STREAM_NODE_THRESHOLD = 50;
/** Max nodes per RAF(requestAnimationFrame) tick; time slice stops earlier if frame budget exceeded. */
export const STREAM_BATCH_SIZE = 8;
/** Interval (ms) between batches to give GPU/main thread time to render. */
export const STREAM_INTERVAL_MS = 30;
/** Stop building current batch after this many ms (time slicing). */
export const STREAM_TIME_SLICE_MS = 10;

/** During streaming, coalesce renderJoin calls; min interval between runs. */
export const STREAMING_JOIN_MS = 280;

/** Lucide icon viewBox size; used to scale node icons to node radius. */
export const LUCIDE_VIEWBOX = 24;
