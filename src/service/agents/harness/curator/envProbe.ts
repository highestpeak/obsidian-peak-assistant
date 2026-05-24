/**
 * Probe the user's environment for the Curator. Best-effort: every probe has
 * a safe default so a single failure can't block bootstrap.
 *
 * See spec §5.3.
 */

import { App, TFile } from 'obsidian';
import { ProfileRegistry } from '@/core/profiles/ProfileRegistry';
import { fetchOllamaModels } from '@/core/providers/ollama/fetchOllamaModels';
import { isMobile } from '@/core/platform';
import type { EnvironmentSnapshot, ProfileSummary } from './types';

const DEFAULT_RAM_GB = 8;
const VAULT_SAMPLE_SIZE = 60;
const CHINESE_CHAR_THRESHOLD = 0.2;

export interface DetectOptions {
    app: App;
    /** Override RAM in tests. */
    ramGB?: number;
    /** Skip vault sampling (tests / mobile-cold-start). */
    skipLanguageProbe?: boolean;
}

export async function detectEnvironment(opts: DetectOptions): Promise<EnvironmentSnapshot> {
    const [ollama, profiles, chineseRatio] = await Promise.all([
        probeOllama(),
        summarizeProfiles(),
        opts.skipLanguageProbe ? Promise.resolve(0) : probeChineseRatio(opts.app),
    ]);

    return {
        ramGB: opts.ramGB ?? detectRamGB(),
        ollamaRunning: ollama.running,
        ollamaInstalledModels: ollama.models,
        profiles,
        chineseRatio,
        capturedAt: Date.now(),
        isMobile: isMobile(),
    };
}

function detectRamGB(): number {
    if (isMobile()) return 4;
    try {
        const os = (window as { require?: (m: string) => unknown }).require?.('os');
        if (os && typeof (os as { totalmem?: () => number }).totalmem === 'function') {
            const bytes = (os as { totalmem: () => number }).totalmem();
            return Math.max(1, Math.round(bytes / 1024 ** 3));
        }
    } catch {
        // Electron require not available — fall through to navigator-based hint.
    }
    const navMem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    if (typeof navMem === 'number' && navMem > 0) return navMem;
    return DEFAULT_RAM_GB;
}

async function probeOllama(): Promise<{ running: boolean; models: string[] }> {
    const reg = ProfileRegistry.getInstance();
    const baseUrls = new Set<string>();
    for (const p of reg.getAllProfiles()) {
        if (p.kind === 'ollama' && p.baseUrl) baseUrls.add(p.baseUrl);
    }
    if (baseUrls.size === 0) baseUrls.add('http://localhost:11434');

    for (const url of baseUrls) {
        const models = await fetchOllamaModels(url);
        if (models.length > 0) return { running: true, models };
    }
    // Daemon may be up with no models — distinguish that with a HEAD check.
    for (const url of baseUrls) {
        try {
            const ctl = new AbortController();
            const t = setTimeout(() => ctl.abort(), 1500);
            const res = await fetch(`${url}/api/tags`, { signal: ctl.signal });
            clearTimeout(t);
            if (res.ok) return { running: true, models: [] };
        } catch {
            // Try next url.
        }
    }
    return { running: false, models: [] };
}

function summarizeProfiles(): ProfileSummary[] {
    const reg = ProfileRegistry.getInstance();
    return reg
        .getAllProfiles()
        .filter((p) => p.enabled)
        .map(
            (p): ProfileSummary => ({
                id: p.id,
                kind: p.kind,
                name: p.name,
                hasCredentials: p.kind === 'ollama' ? true : !!(p.apiKey && p.apiKey.length > 0),
            }),
        );
}

/**
 * Sample up to {@link VAULT_SAMPLE_SIZE} markdown files and estimate the share
 * that's predominantly Chinese (>{@link CHINESE_CHAR_THRESHOLD} CJK chars by
 * length). Sampling avoids reading the entire vault during boot.
 */
async function probeChineseRatio(app: App): Promise<number> {
    try {
        const all = app.vault.getMarkdownFiles();
        if (all.length === 0) return 0;
        const sample = pickRandom(all, Math.min(VAULT_SAMPLE_SIZE, all.length));
        let chineseFiles = 0;
        await Promise.all(
            sample.map(async (f) => {
                const content = await app.vault.cachedRead(f);
                if (isChineseDominant(content)) chineseFiles++;
            }),
        );
        return chineseFiles / sample.length;
    } catch {
        return 0;
    }
}

function pickRandom<T>(arr: T[], n: number): T[] {
    if (arr.length <= n) return [...arr];
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
}

const CJK_RE = /[一-鿿㐀-䶿]/g;

function isChineseDominant(text: string): boolean {
    if (text.length < 50) return false;
    const matches = text.match(CJK_RE);
    if (!matches) return false;
    return matches.length / text.length >= CHINESE_CHAR_THRESHOLD;
}

/** Used by the Curator prompt builder to render the snapshot compactly. */
export function summarizeEnvironment(env: EnvironmentSnapshot): string {
    const profileLines = env.profiles.length
        ? env.profiles.map((p) => `  - ${p.kind} (${p.name})${p.hasCredentials ? ' ✓' : ' ⚠ no key'}`).join('\n')
        : '  (none configured)';
    const ollamaLine = env.ollamaRunning
        ? env.ollamaInstalledModels.length
            ? `Running. Installed: ${env.ollamaInstalledModels.join(', ')}`
            : 'Running, no models pulled.'
        : 'Not running / unreachable.';
    return [
        `- RAM: ${env.ramGB}GB`,
        `- Mobile: ${env.isMobile ? 'yes' : 'no'}`,
        `- Ollama: ${ollamaLine}`,
        `- Vault language: ${(env.chineseRatio * 100).toFixed(0)}% Chinese`,
        `- Configured providers:`,
        profileLines,
    ].join('\n');
}

export function summarizePreferences(p: { budget: string; speedQuality: string }): string {
    return `- Budget: ${p.budget}\n- Speed vs quality: ${p.speedQuality}`;
}
