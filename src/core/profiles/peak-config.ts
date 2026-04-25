import { App } from 'obsidian';

export interface PeakConfig {
    promptModelMap?: Record<string, { provider: string; modelId: string }>;
    inspectorLinks?: {
        keywordTopN?: number;
        tagTopN?: number;
        folderGroupingEnabled?: boolean;
        folderGroupMinCount?: number;
        folderGroupMaxDepth?: number;
    };
    graphViz?: {
        mstPruneDepth?: number;
        skeletonBackboneOnly?: boolean;
        mstLeafOpacity?: number;
        mstLeafWidthScale?: number;
    };
    hubDiscover?: {
        enableLlmSemanticMerge?: boolean;
        maxRounds?: number;
        maxJudgeCalls?: number;
        minCoverageGain?: number;
    };
    summaryLengths?: {
        short?: number;
        full?: number;
        sessionWordCount?: number;
    };
    indexRefreshInterval?: number;
}

const DEFAULTS: PeakConfig = {
    inspectorLinks: { keywordTopN: 10, tagTopN: 5, folderGroupingEnabled: true, folderGroupMinCount: 3, folderGroupMaxDepth: 2 },
    graphViz: { mstPruneDepth: 2, skeletonBackboneOnly: false, mstLeafOpacity: 0.25, mstLeafWidthScale: 0.6 },
    hubDiscover: { enableLlmSemanticMerge: false, maxRounds: 5, maxJudgeCalls: 20, minCoverageGain: 0.02 },
    summaryLengths: { short: 150, full: 2000, sessionWordCount: 1200 },
    indexRefreshInterval: 5000,
};

let cached: PeakConfig | null = null;

export async function loadPeakConfig(app: App): Promise<PeakConfig> {
    if (cached) return cached;
    try {
        const file = app.vault.getAbstractFileByPath('peak-config.json');
        if (!file) { cached = { ...DEFAULTS }; return cached; }
        const raw = await app.vault.read(file as any);
        const parsed = JSON.parse(raw) as Partial<PeakConfig>;
        cached = deepMerge(DEFAULTS, parsed);
        return cached;
    } catch {
        cached = { ...DEFAULTS };
        return cached;
    }
}

export function getPeakConfig(): PeakConfig {
    return cached ?? DEFAULTS;
}

function deepMerge<T extends Record<string, any>>(base: T, override: Partial<T>): T {
    const result = { ...base };
    for (const key of Object.keys(override) as (keyof T)[]) {
        const val = override[key];
        if (val != null && typeof val === 'object' && !Array.isArray(val) && typeof (base as any)[key] === 'object') {
            (result as any)[key] = deepMerge((base as any)[key], val as any);
        } else if (val !== undefined) {
            (result as any)[key] = val;
        }
    }
    return result;
}
