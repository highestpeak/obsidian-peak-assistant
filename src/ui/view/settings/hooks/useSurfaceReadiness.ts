/**
 * useSurfaceReadiness — Overview-tab data source (PR-E).
 *
 * Replaces PR-D's `getReadinessFromHarnessSettings(...)` stub. Polls the
 * CapabilityRegistry on mount and on a short interval, since adapters may
 * read async / settings-derived state (e.g., chat tier bindings, index
 * freshness) that can change without going through a React rerender path.
 *
 * Behaviour by registered-adapter count (Option A — show only registered):
 *
 *   - 0 adapters: returns []. OverviewTab renders an empty-state ("No
 *     surfaces have reported yet"). Happens before any surface registers,
 *     including during cold start or in test fixtures.
 *   - 1 adapter (master today, copilot only): one row with that surface's
 *     capabilities. After PR-Chat-4 merges to master we will see 2 rows.
 *   - N adapters: one row per registered surface, in stable surface-id
 *     order driven by `CapabilityRegistry.getAll()`.
 *
 * Cross-worktree note: the registry is populated by surface code (in
 * main.ts and per-surface bootstrap), NOT by this hook. Until vault-search /
 * ai-analysis / web-chat grow adapters, Overview will only show chat +
 * copilot. That gap is intentional — we are choosing "honest emptiness"
 * over "fake reassurance from stub data".
 *
 * Option B (show all 5 with a "not reported" placeholder for missing
 * surfaces) was considered and rejected — it would either resurrect the
 * stub for visual coverage, or silently lie about non-existent capabilities.
 */

import { useEffect, useState } from 'react';
import {
    CapabilityRegistry,
    type CapabilityStatus,
    type SurfaceId,
} from '@/service/capabilities';

export interface SurfaceReadinessRow {
    surfaceId: SurfaceId;
    surfaceLabel: string;
    capabilities: CapabilityStatus[];
}

/** How often to re-poll the registry. Adapters read settings-derived state
 * that can change asynchronously (e.g., a profile being toggled in another
 * tab); polling keeps Overview in sync without explicit pub/sub. */
const REFRESH_INTERVAL_MS = 5000;

export function useSurfaceReadiness(): SurfaceReadinessRow[] {
    const [rows, setRows] = useState<SurfaceReadinessRow[]>([]);

    useEffect(() => {
        let mounted = true;

        async function refresh() {
            const adapters = CapabilityRegistry.getInstance().getAll();
            const results = await Promise.all(
                adapters.map(async (adapter) => {
                    let capabilities: CapabilityStatus[] = [];
                    try {
                        capabilities = await adapter.getCapabilityStatus();
                    } catch (err) {
                        console.warn(
                            `[useSurfaceReadiness] adapter for ${adapter.surfaceId} threw:`,
                            err,
                        );
                    }
                    return {
                        surfaceId: adapter.surfaceId,
                        surfaceLabel: adapter.surfaceLabel,
                        capabilities,
                    };
                }),
            );
            if (mounted) setRows(results);
        }

        void refresh();
        const interval = window.setInterval(() => {
            void refresh();
        }, REFRESH_INTERVAL_MS);

        return () => {
            mounted = false;
            window.clearInterval(interval);
        };
    }, []);

    return rows;
}
