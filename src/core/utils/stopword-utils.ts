import { compileTemplate } from '@/core/template-engine-helper';
import type { TemplateManager } from '@/core/template/TemplateManager';
import { StopwordTemplateId, TEMPLATE_METADATA, type StopwordTemplateId as StopwordTid } from '@/core/template/TemplateRegistry';
import { detectTextLocaleStem } from '@/core/utils/text-language-detect';

const stopwordCache = new Map<string, Set<string>>();

function parseStopwordsRendered(rendered: string): Set<string> {
	const set = new Set<string>();
	for (const line of rendered.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		for (const token of trimmed.split(/\s+/)) {
			if (!token) continue;
			set.add(token.toLowerCase());
		}
	}
	return set;
}

function stemFromStopwordTemplatePath(path: string): string {
	const base = path.split('/').pop() ?? '';
	return base.replace(/\.md$/i, '');
}

function normalizeLocaleKey(locale: string): string {
	return locale.trim().toLowerCase().replace(/_/g, '-');
}

/**
 * Maps a detected locale stem to the best key present in the hydrated cache (excluding wrong-language fallbacks).
 */
export function pickLoadedStopwordStem(detected: string): string {
	const norm = normalizeLocaleKey(detected);
	const primary = norm.split('-')[0] ?? norm;
	const candidates: string[] = [norm];
	if (primary === 'cmn') candidates.push('zh');
	candidates.push(primary);

	for (const k of candidates) {
		if (k && k !== 'common' && stopwordCache.has(k)) return k;
	}
	if (stopwordCache.has('en')) return 'en';
	return primary;
}

/**
 * Detects script from plain/stripped text, then picks a loaded stopword stem.
 */
export function resolveTextRankLocaleFromStripped(strippedText: string): string {
	return pickLoadedStopwordStem(detectTextLocaleStem(strippedText));
}

/**
 * Hydrate TextRank stopwords from every entry in {@link StopwordTemplateId} (templates/stopwords/*.md).
 */
export async function hydrateTextStopwordsFromTemplateManager(
	tm: TemplateManager,
	variables: Record<string, unknown> = {},
): Promise<void> {
	stopwordCache.clear();
	const ids = Object.values(StopwordTemplateId) as StopwordTid[];
	for (const tid of ids) {
		const stem = stemFromStopwordTemplatePath(TEMPLATE_METADATA[tid].path);
		try {
			const raw = await tm.getTemplate(tid);
			const rendered = compileTemplate(raw)({ extraStopwords: [], ...variables });
			stopwordCache.set(stem, parseStopwordsRendered(rendered));
		} catch {
			stopwordCache.set(stem, new Set());
		}
	}
}

/**
 * Merges `common` stopwords with the locale-specific list for the given key.
 */
export function getTextStopwordsForLocale(locale?: string): Set<string> {
	const common = stopwordCache.get('common') ?? new Set<string>();
	if (!locale?.trim()) {
		const local = stopwordCache.get('en') ?? new Set<string>();
		return new Set([...common, ...local]);
	}
	const raw = normalizeLocaleKey(locale);
	const primary = raw.split('-')[0] ?? raw;
	const tryKeys = [raw, primary === 'cmn' ? 'zh' : '', primary].filter(Boolean) as string[];
	for (const k of tryKeys) {
		if (k === 'common') continue;
		if (stopwordCache.has(k)) {
			const local = stopwordCache.get(k)!;
			return new Set([...common, ...local]);
		}
	}
	const fallback = stopwordCache.get('en') ?? new Set<string>();
	return new Set([...common, ...fallback]);
}
