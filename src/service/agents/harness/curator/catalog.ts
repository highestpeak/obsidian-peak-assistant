/**
 * Model catalog consumed by the Curator agent.
 *
 * The JSON source lives at templates/config/curator-catalog.json and is
 * loaded via TemplateManager. Hard constraints (RAM/budget/unknown id) are
 * enforced in validation.ts using the metadata loaded here.
 *
 * See spec §6.2 / §6.3.
 */

import type { TemplateManager } from '@/core/template/TemplateManager';
import { ConfigTemplateId } from '@/core/template/TemplateRegistry';
import type { ProfileKind } from '@/core/profiles/types';
import type { Capability } from './types';

export type LatencyClass = 'fast-local' | 'slow-local' | 'fast-online' | 'slow-online';

export interface CatalogEntry {
    /** Stable id (matches the catalog JSON key). */
    id: string;
    kind: ProfileKind;
    displayName: string;
    providerId: string;
    apiModelId: string;
    params: string | null;
    /** Minimum RAM in GB to load; null for hosted models. */
    ramRequiredGB: number | null;
    /** Berkeley Function Calling Leaderboard score (0-1). */
    bfcl: number;
    /** C-Eval (Chinese) score (0-1). */
    ceval: number;
    /** MMLU score (0-1). */
    mmlu: number;
    /** USD per 1M input tokens; 0 for local. */
    costPer1MInput: number;
    /** USD per 1M output tokens; 0 for local. */
    costPer1MOutput: number;
    latencyClass: LatencyClass;
    languageStrengths: string[];
    suitableTiers: Capability[];
    notes: string;
}

export interface CatalogFile {
    version: number;
    updatedAt: string;
    notes?: string[];
    models: Record<string, Omit<CatalogEntry, 'id'>>;
}

/**
 * In-memory singleton catalog. Populated by loadCuratorCatalog() during plugin
 * boot. Reads are synchronous via getCatalog() / lookupModel().
 */
let CATALOG: Map<string, CatalogEntry> | null = null;

export async function loadCuratorCatalog(tm: TemplateManager): Promise<Map<string, CatalogEntry>> {
    const raw = await tm.loadJson<CatalogFile>(ConfigTemplateId.CuratorCatalog);
    return hydrateCatalog(raw);
}

/**
 * Direct hydration for tests / non-TemplateManager callers (e.g. CLI).
 */
export function hydrateCatalog(file: CatalogFile): Map<string, CatalogEntry> {
    const map = new Map<string, CatalogEntry>();
    for (const [id, entry] of Object.entries(file.models)) {
        map.set(id, { id, ...entry });
    }
    CATALOG = map;
    return map;
}

export function getCatalog(): Map<string, CatalogEntry> {
    if (!CATALOG) throw new Error('Curator catalog not loaded yet — call loadCuratorCatalog(templateManager) during boot.');
    return CATALOG;
}

export function isCatalogLoaded(): boolean {
    return CATALOG !== null;
}

export function lookupModel(id: string): CatalogEntry | undefined {
    return CATALOG?.get(id);
}

export function listModelIds(): string[] {
    return CATALOG ? Array.from(CATALOG.keys()) : [];
}

/**
 * Return entries suitable for a given capability tier. Used by the rule-based
 * fallback when the LLM curator fails.
 */
export function filterByTier(capability: Capability): CatalogEntry[] {
    if (!CATALOG) return [];
    return Array.from(CATALOG.values()).filter((m) => m.suitableTiers.includes(capability));
}

/**
 * Serialize the catalog as a compact JSON payload for prompt injection.
 * Drops the long "notes" field for entries the LLM is unlikely to choose,
 * keeping the prompt under control.
 */
export function serializeForPrompt(): string {
    if (!CATALOG) return '{}';
    const slim: Record<string, Partial<CatalogEntry>> = {};
    for (const m of CATALOG.values()) {
        slim[m.id] = {
            kind: m.kind,
            displayName: m.displayName,
            params: m.params,
            ramRequiredGB: m.ramRequiredGB,
            bfcl: m.bfcl,
            ceval: m.ceval,
            mmlu: m.mmlu,
            costPer1MInput: m.costPer1MInput,
            costPer1MOutput: m.costPer1MOutput,
            latencyClass: m.latencyClass,
            languageStrengths: m.languageStrengths,
            suitableTiers: m.suitableTiers,
            notes: m.notes,
        };
    }
    return JSON.stringify(slim, null, 2);
}

/** Reset state — test helper only. */
export function _resetCatalogForTests(): void {
    CATALOG = null;
}
