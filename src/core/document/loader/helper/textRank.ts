/**
 * Unsupervised TextRank: word co-occurrence graph + sentence similarity graph (Jaccard), PageRank scoring.
 * No external dependencies; safe for main-thread indexing.
 */

export type TextRankTerm = { term: string; score: number };
export type TextRankSentence = { text: string; score: number; index: number };

export type TextRankResult = {
	topTerms: TextRankTerm[];
	topSentences: TextRankSentence[];
};

/** Default when TextRank is skipped (e.g. cache-only document read). */
export const EMPTY_TEXTRANK_RESULT: TextRankResult = {
	topTerms: [],
	topSentences: [],
};

export type TextRankOptions = {
	/** Max characters before truncation (default 120000). */
	maxContentChars?: number;
	/** Co-occurrence window for word graph (default 4). */
	wordWindow?: number;
	/** Top K terms to return (default 20). */
	maxTerms?: number;
	/** Top M sentences to return (default 8). */
	maxSentences?: number;
	/** Max sentences to build sentence graph; avoids O(n²) blowup (default 80). */
	maxSentencesInGraph?: number;
	damping?: number;
	iterations?: number;
	/** Minimum token length for Latin words (default 2). */
	minWordLength?: number;
};

const DEFAULT_OPTS: Required<
	Omit<TextRankOptions, 'maxContentChars' | 'wordWindow' | 'maxTerms' | 'maxSentences' | 'maxSentencesInGraph' | 'minWordLength'>
> &
	Required<Pick<TextRankOptions, 'maxContentChars' | 'wordWindow' | 'maxTerms' | 'maxSentences' | 'maxSentencesInGraph' | 'minWordLength'>> = {
	maxContentChars: 120_000,
	wordWindow: 4,
	maxTerms: 20,
	maxSentences: 8,
	maxSentencesInGraph: 80,
	damping: 0.85,
	iterations: 40,
	minWordLength: 2,
};

/** Minimal English stopwords to reduce noise in word graph. */
const STOP = new Set(
	`the a an and or but if in on at to for of as is are was were be been being it its this that these those with from by not no
		i you he she they we our their my your what which who whom when where why how all each both than then so too very can could
		will would should may might must shall do does did done having have has had
	`.split(/\s+/).filter(Boolean),
);

/**
 * Strip fenced code blocks and inline code for cleaner co-occurrence.
 */
export function stripForTextRank(markdown: string): string {
	let s = markdown.replace(/```[\s\S]*?```/g, ' ');
	s = s.replace(/`[^`\n]+`/g, ' ');
	return s.replace(/\s+/g, ' ').trim();
}

/**
 * Tokenize: ASCII words (length >= minLen) and single CJK codepoints.
 */
export function tokenizeForTextRank(text: string, minWordLength: number): string[] {
	const lower = text.toLowerCase();
	const out: string[] = [];
	const re = new RegExp(`[a-z]{${minWordLength},}|[\\u4e00-\\u9fff]`, 'g');
	let m: RegExpExecArray | null;
	while ((m = re.exec(lower)) !== null) {
		const t = m[0];
		if (/^[a-z]+$/.test(t) && STOP.has(t)) continue;
		out.push(t);
	}
	return out;
}

function buildWordGraph(tokens: string[], windowSize: number): Map<string, Map<string, number>> {
	const adj = new Map<string, Map<string, number>>();
	const addEdge = (a: string, b: string) => {
		if (a === b) return;
		const [x, y] = a < b ? [a, b] : [b, a];
		if (!adj.has(x)) adj.set(x, new Map());
		if (!adj.has(y)) adj.set(y, new Map());
		const mx = adj.get(x)!;
		const my = adj.get(y)!;
		mx.set(y, (mx.get(y) ?? 0) + 1);
		my.set(x, (my.get(x) ?? 0) + 1);
	};

	for (let i = 0; i < tokens.length; i++) {
		const end = Math.min(i + windowSize, tokens.length);
		for (let j = i + 1; j < end; j++) {
			addEdge(tokens[i]!, tokens[j]!);
		}
	}
	return adj;
}

function outWeightSum(node: string, adj: Map<string, Map<string, number>>): number {
	const m = adj.get(node);
	if (!m) return 0;
	let s = 0;
	for (const w of m.values()) s += w;
	return s;
}

/**
 * Weighted PageRank on undirected graph represented as adjacency maps (symmetric weights).
 */
export function pageRankWeighted(
	nodes: string[],
	adj: Map<string, Map<string, number>>,
	options: { damping: number; iterations: number },
): Map<string, number> {
	const n = nodes.length;
	if (n === 0) return new Map();
	const nodeSet = new Set(nodes);
	let scores = new Map<string, number>();
	const init = 1 / n;
	for (const v of nodes) scores.set(v, init);

	for (let it = 0; it < options.iterations; it++) {
		const next = new Map<string, number>();
		for (const vi of nodes) {
			let sum = 0;
			const neighbors = adj.get(vi);
			if (neighbors) {
				for (const [j, wji] of neighbors) {
					if (!nodeSet.has(j)) continue;
					const outJ = outWeightSum(j, adj);
					if (outJ <= 0) continue;
					const sj = scores.get(j) ?? 0;
					sum += (wji / outJ) * sj;
				}
			}
			const val = (1 - options.damping) / n + options.damping * sum;
			next.set(vi, val);
		}
		scores = next;
	}
	return scores;
}

function splitSentences(text: string): string[] {
	const parts = text.split(/(?<=[.!?。！？])\s+|\n+/);
	const out: string[] = [];
	for (const p of parts) {
		const t = p.trim().replace(/\s+/g, ' ');
		if (t.length >= 12) out.push(t);
	}
	return out;
}

function jaccard(a: Set<string>, b: Set<string>): number {
	if (!a.size && !b.size) return 0;
	let inter = 0;
	for (const x of a) {
		if (b.has(x)) inter++;
	}
	const union = a.size + b.size - inter;
	return union > 0 ? inter / union : 0;
}

function buildSentenceGraph(sentences: string[], tokenize: (s: string) => string[]): Map<string, Map<string, number>> {
	const adj = new Map<string, Map<string, number>>();
	const sets = sentences.map((s) => new Set(tokenize(s)));
	const n = sentences.length;
	const addEdge = (i: number, j: number, w: number) => {
		if (i === j || w <= 0) return;
		const a = String(i);
		const b = String(j);
		if (!adj.has(a)) adj.set(a, new Map());
		if (!adj.has(b)) adj.set(b, new Map());
		const ma = adj.get(a)!;
		const mb = adj.get(b)!;
		const cur = (ma.get(b) ?? 0);
		ma.set(b, cur + w);
		mb.set(a, cur + w);
	};

	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const sim = jaccard(sets[i]!, sets[j]!);
			if (sim > 0) addEdge(i, j, sim);
		}
	}
	// Weak ties between adjacent sentences for connectivity
	for (let i = 0; i < n - 1; i++) {
		addEdge(i, i + 1, 0.05);
	}

	return adj;
}

function sentenceNodeIds(n: number): string[] {
	return Array.from({ length: n }, (_, i) => String(i));
}

/**
 * Run TextRank on plain or markdown-like text: top terms + top sentences.
 */
export function extractTextRankFeatures(rawText: string, options?: TextRankOptions): TextRankResult {
	const o = { ...DEFAULT_OPTS, ...options };
	let text = stripForTextRank(rawText);
	if (text.length > o.maxContentChars) {
		text = text.slice(0, o.maxContentChars);
	}

	const tokens = tokenizeForTextRank(text, o.minWordLength);
	if (tokens.length === 0) {
		return { topTerms: [], topSentences: [] };
	}

	const wordAdj = buildWordGraph(tokens, o.wordWindow);
	const vocab = [...new Set(tokens)];
	const wordScores = pageRankWeighted(vocab, wordAdj, { damping: o.damping, iterations: o.iterations });
	const topTerms: TextRankTerm[] = [...wordScores.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, o.maxTerms)
		.map(([term, score]) => ({ term, score }));

	let sentences = splitSentences(text);
	if (sentences.length > o.maxSentencesInGraph) {
		sentences = sentences.slice(0, o.maxSentencesInGraph);
	}

	const tok = (s: string) => tokenizeForTextRank(s, o.minWordLength);
	if (sentences.length < 2) {
		const one = sentences[0];
		return {
			topTerms,
			topSentences: one
				? [{ text: one, score: 1, index: 0 }]
				: [],
		};
	}

	const sentAdj = buildSentenceGraph(sentences, tok);
	const sentIds = sentenceNodeIds(sentences.length);
	const sentScores = pageRankWeighted(sentIds, sentAdj, { damping: o.damping, iterations: o.iterations });

	const topSentences: TextRankSentence[] = [...sentScores.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, o.maxSentences)
		.map(([id, score]) => ({
			text: sentences[Number(id)] ?? '',
			score,
			index: Number(id),
		}))
		.filter((x) => x.text.length > 0);

	return { topTerms, topSentences };
}

/** Max keyword tags stored on document / graph (user + TextRank). */
export const KEYWORD_TAGS_MAX_TOTAL = 40;
/** Max tags contributed by TextRank when merging with user tags. */
export const KEYWORD_TAGS_MAX_TEXTRANK = 20;

/**
 * Split user-provided tags vs TextRank terms, plus merged list for FTS / legacy fields.
 * TextRank-only terms are not written to Mobius KeywordTag edges (noise reduction).
 */
export type KeywordTagBundles = {
	userKeywordTags: string[];
	textrankKeywordTerms: string[];
	/** User + TextRank, deduped; used for {@link DocumentMetadata.keywordTags} and indexing. */
	mergedKeywordTags: string[];
};

/**
 * Builds {@link KeywordTagBundles} from frontmatter / #hashtag tags and TextRank top terms.
 */
export function computeKeywordTagBundles(userTags: string[], topTerms: TextRankTerm[]): KeywordTagBundles {
	const seen = new Set<string>();
	const lower = (s: string) => s.toLowerCase();
	const mergedKeywordTags: string[] = [];
	for (const u of userTags) {
		const k = lower(u);
		if (seen.has(k)) continue;
		seen.add(k);
		mergedKeywordTags.push(u);
	}
	const userKeywordTags = [...mergedKeywordTags];
	const textrankKeywordTerms: string[] = [];
	let trAdded = 0;
	for (const { term } of topTerms) {
		if (mergedKeywordTags.length >= KEYWORD_TAGS_MAX_TOTAL) break;
		const k = lower(term);
		if (seen.has(k)) continue;
		seen.add(k);
		mergedKeywordTags.push(term);
		textrankKeywordTerms.push(term);
		trAdded++;
		if (trAdded >= KEYWORD_TAGS_MAX_TEXTRANK) break;
	}
	return { userKeywordTags, textrankKeywordTerms, mergedKeywordTags };
}

/**
 * Merges user frontmatter tags with TextRank terms (dedupe case-insensitive, cap total and TR slice).
 * @deprecated Prefer {@link computeKeywordTagBundles} when you need the split.
 */
export function mergeUserAndTextRankKeywords(userTags: string[], topTerms: TextRankTerm[]): string[] {
	return computeKeywordTagBundles(userTags, topTerms).mergedKeywordTags;
}
