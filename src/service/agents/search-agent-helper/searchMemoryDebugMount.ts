import type { AISearchAgent } from '../AISearchAgent';
import type { SearchMemoryDebugSnapshot } from './AgentContextManager';

const WINDOW_KEY = '__peakSearchDebug' as const;

/**
 * Mounts current search memory on window for console inspection when debug setting is on.
 * Use window.__peakSearchDebug.getSnapshot() to get latest snapshot during a run.
 */
export function mountSearchMemoryDebug(agent: AISearchAgent): void {
    if (typeof window === 'undefined') return;
    (window as unknown as Record<string, unknown>)[WINDOW_KEY] = {
        getSnapshot: (): SearchMemoryDebugSnapshot => agent.getContextManager().getDebugSnapshot(),
    };
}

/** Removes search memory from window. Call when analysis ends (success, error, or cancel). */
export function clearSearchMemoryDebug(): void {
    if (typeof window === 'undefined') return;
    delete (window as unknown as Record<string, unknown>)[WINDOW_KEY];
}
