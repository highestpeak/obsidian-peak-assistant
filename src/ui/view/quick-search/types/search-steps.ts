/**
 * V2 (Agent SDK) types for the AI search UI.
 *
 * T11I (2026-06-26): types moved to @/core/search/v2ToolTypes; display
 * helpers moved to @/service/search/v2ToolDisplay. This module
 * re-exports them so existing UI callers keep compiling.
 */

export type { V2TimelineItem, V2Source, V2ToolStep } from '@/core/search/v2ToolTypes';
export { v2ToolDisplay, unwrapToolOutput, extractV2Summary } from '@/service/search/v2ToolDisplay';
