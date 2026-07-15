import type { BehaviorContextPayload, RewriteCandidate } from '@/core/schemas/queryRewrite';
import type { StageEntry } from './AIQueryRewriteService';

/**
 * Persisted record of one Suggest round. Users can hover the Suggest button
 * to browse recent rounds and click any entry to replay the modal — no LLM
 * re-call, all candidates + trace + payload rehydrate from what we saved
 * here. The store's contract: `save()` returns an id, `markPicked()` mutates
 * the same record when the user commits to a candidate.
 */
export interface SuggestHistoryEntry {
    id: string;
    savedAt: number; // Date.now()
    currentQuery: string;
    provider: string;
    modelId: string;
    candidates: RewriteCandidate[];
    payloadSnapshot: BehaviorContextPayload;
    trace: StageEntry[];
    fromFallback: boolean;
    fallbackReason?: string;
    fallbackRaw?: string;
    pickedIndex: number | null;
    pickedQuery?: string;
}

const LS_KEY = 'peak-suggest-history-v1';
const MAX_ENTRIES = 50;

/**
 * localStorage-backed ring buffer of Suggest history. localStorage is scoped
 * per-vault by Obsidian, so entries don't leak between vaults. Kept out of
 * `data.json` (plugin settings) because history churns on every Suggest and
 * would otherwise trigger a settings-save cascade.
 */
export class SuggestHistoryStore {
    private static _instance: SuggestHistoryStore | null = null;
    private cache: SuggestHistoryEntry[] | null = null;
    private readonly subscribers = new Set<() => void>();

    static getInstance(): SuggestHistoryStore {
        if (!this._instance) this._instance = new SuggestHistoryStore();
        return this._instance;
    }

    /** Read-through cache; returns entries newest-first. */
    list(): SuggestHistoryEntry[] {
        if (this.cache) return this.cache;
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (!raw) { this.cache = []; return this.cache; }
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) { this.cache = []; return this.cache; }
            // Defensive: drop any malformed entries so a bad write can't poison
            // every future read.
            this.cache = parsed
                .filter((e): e is SuggestHistoryEntry =>
                    !!e && typeof e.id === 'string' && Array.isArray(e.candidates))
                .sort((a, b) => b.savedAt - a.savedAt);
            return this.cache;
        } catch (e) {
            console.warn('[SuggestHistoryStore] list() failed:', e);
            this.cache = [];
            return this.cache;
        }
    }

    get(id: string): SuggestHistoryEntry | null {
        return this.list().find(e => e.id === id) ?? null;
    }

    save(entry: Omit<SuggestHistoryEntry, 'id' | 'savedAt' | 'pickedIndex' | 'pickedQuery'>): string {
        const id = generateId();
        const record: SuggestHistoryEntry = {
            ...entry,
            id,
            savedAt: Date.now(),
            pickedIndex: null,
        };
        const next = [record, ...this.list()].slice(0, MAX_ENTRIES);
        this.write(next);
        return id;
    }

    markPicked(id: string, index: number, pickedQuery: string): void {
        const list = this.list();
        const idx = list.findIndex(e => e.id === id);
        if (idx < 0) return;
        const updated: SuggestHistoryEntry = {
            ...list[idx],
            pickedIndex: index,
            pickedQuery,
        };
        const next = [...list];
        next[idx] = updated;
        this.write(next);
    }

    clear(): void {
        this.write([]);
    }

    /** Subscribe for hover-popover re-render on save/pick/clear. */
    subscribe(fn: () => void): () => void {
        this.subscribers.add(fn);
        return () => { this.subscribers.delete(fn); };
    }

    private write(next: SuggestHistoryEntry[]): void {
        this.cache = next;
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(next));
        } catch (e) {
            console.warn('[SuggestHistoryStore] write() failed:', e);
        }
        for (const fn of this.subscribers) {
            try { fn(); } catch { /* ignore */ }
        }
    }
}

function generateId(): string {
    // crypto.randomUUID is available in Electron/modern browsers — Obsidian
    // ships Chromium, so this is safe. Fallback is a plain timestamp+random.
    try {
        const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
        if (c?.randomUUID) return c.randomUUID();
    } catch { /* ignore */ }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export const suggestHistoryStore = SuggestHistoryStore.getInstance();
