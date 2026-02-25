import type { ZodType } from "@/core/schemas";

/**
 * Per-field handlers for update-result tools. Looked up by fieldName at runtime.
 */
export interface UpdateResultHandlers {
    identityKeyBuilder?: (item: any) => string | null;
    validatePath?: (item: any) => Promise<{ valid: boolean; reason?: string; resolvedPath?: string }>;
    validateItem?: (item: any) => Promise<{ valid: boolean; reason?: string }>;
    dataTransform?: (data: any, schema?: ZodType) => any;
    normalizeOperation?: (raw: any) => any;
}

/**
 * Current analysis session context. Set at session start, cleared on unload.
 * Tools and schemas must not close over this; they use getCurrentAnalysisContext() at runtime.
 */
export interface AnalysisContext {
    getResult: () => any;
    getVerifiedPaths: () => Set<string>;
    getHandlers: (fieldName: string) => UpdateResultHandlers | undefined;
}

let currentAnalysisContext: AnalysisContext | null = null;

/** Set the current analysis context (e.g. when starting a session). */
export function setCurrentAnalysisContext(ctx: AnalysisContext | null): void {
    currentAnalysisContext = ctx;
}

/** Get the current analysis context. Returns null after unload or when no session. */
export function getCurrentAnalysisContext(): AnalysisContext | null {
    return currentAnalysisContext;
}

/** Clear the context. Call early in plugin onunload so refs can be GC'd. */
export function clearCurrentAnalysisContext(): void {
    currentAnalysisContext = null;
}
