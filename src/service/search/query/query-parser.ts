import { porterStem } from '@/service/search/support/porter-stemmer';
import { normalizeForSearch } from '@/service/search/support/segmenter';

export type QueryTerm = {
    text: string;
    stem: string;
    isPrefix: boolean;
};

export type QueryFilter = {
    field: 'tag' | 'ext' | 'folder';
    value: string;
};

export type RetrieverWeights = {
    fts: number;
    ftsStem: number;
    vector: number;
    meta: number;
    fuzzy: number;
};

export type QueryPlan = {
    terms: QueryTerm[];
    phrases: string[];
    excludes: string[];
    filters: QueryFilter[];
    raw: string;
    retrievers: RetrieverWeights;
};

const CJK_RE = /[\u3000-\u9fff\uac00-\ud7af\uf900-\ufaff]/;

function hasCJK(text: string): boolean {
    return CJK_RE.test(text);
}

function computeRetrieverWeights(
    terms: QueryTerm[],
    phrases: string[],
): RetrieverWeights {
    const weights: RetrieverWeights = {
        fts: 1.0,
        ftsStem: 0.7,
        vector: 0.6,
        meta: 0.8,
        fuzzy: 0.3,
    };

    const hasPhrase = phrases.length > 0;
    const termCount = terms.length;
    const hasCJKTerms = terms.some(t => hasCJK(t.text));

    if (hasPhrase) {
        weights.vector *= 0.3;
        weights.fts *= 1.2;
    }

    if (termCount >= 3) {
        weights.vector *= 1.5;
    } else if (termCount <= 1 && !hasPhrase) {
        weights.vector *= 0.3;
    }

    if (hasCJKTerms) {
        weights.ftsStem *= 0.1;
    }

    return weights;
}

export function parseQuery(raw: string): QueryPlan {
    const terms: QueryTerm[] = [];
    const phrases: string[] = [];
    const excludes: string[] = [];
    const filters: QueryFilter[] = [];

    if (!raw.trim()) {
        return {
            terms,
            phrases,
            excludes,
            filters,
            raw,
            retrievers: computeRetrieverWeights(terms, phrases),
        };
    }

    // Step 1: Extract quoted phrases
    let remaining = raw.replace(/"([^"]+)"/g, (_, phrase) => {
        phrases.push(phrase);
        return '';
    });

    // Step 2: Split remaining by whitespace
    const tokens = remaining.split(/\s+/).filter(t => t.length > 0);

    // Step 3: Classify each token
    for (const token of tokens) {
        if (token.startsWith('-') && token.length > 1) {
            excludes.push(normalizeForSearch(token.slice(1)));
        } else if (token.startsWith('tag:')) {
            filters.push({ field: 'tag', value: token.slice(4) });
        } else if (token.startsWith('ext:')) {
            filters.push({ field: 'ext', value: token.slice(4) });
        } else if (token.startsWith('folder:')) {
            filters.push({ field: 'folder', value: token.slice(7) });
        } else {
            const text = normalizeForSearch(token);
            const stem = hasCJK(text) ? text : porterStem(text);
            terms.push({ text, stem, isPrefix: true });
        }
    }

    return {
        terms,
        phrases,
        excludes,
        filters,
        raw,
        retrievers: computeRetrieverWeights(terms, phrases),
    };
}
