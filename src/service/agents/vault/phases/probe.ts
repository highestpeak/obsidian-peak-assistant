/**
 * Pre-Classify Probe Phase.
 *
 * Runs BEFORE queryUnderstanding to collect real vault signals:
 * - Multiple targeted keyword searches (not just the full query)
 * - Directory structure of top found paths
 *
 * These signals are passed to queryUnderstanding so the LLM can anchor
 * its intent_descriptions to files that actually exist, instead of hallucinating.
 */

import { AppContext } from '@/app/context/AppContext';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ProbeHit {
	path: string;
	title: string;
	score: number;
	keyword: string; // which search keyword found this
}

export interface ProbeResult {
	hits: ProbeHit[];
	/** Formatted string ready for injection into the classify prompt. */
	formattedContext: string;
}

// ─── Chinese/English stop words for keyword extraction ───────────────────────

const STOP_WORDS = new Set([
	// Chinese
	'的', '了', '是', '在', '我', '我的', '你', '他', '她', '它', '们',
	'这', '那', '和', '与', '或', '不', '没', '有', '也', '都', '就',
	'给', '要', '请', '来', '去', '到', '从', '把', '被', '让',
	'很', '非常', '比较', '一些', '一个', '一', '这个', '那个',
	'什么', '怎么', '为什么', '哪里', '哪个', '如何', '可以', '能',
	'会', '想', '应该', '需要', '希望', '觉得', '认为', '感觉',
	'方案', '问题', '情况', '方面', '内容', '信息', '结果', '方法',
	// English
	'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
	'of', 'with', 'by', 'from', 'my', 'your', 'his', 'her', 'its',
	'what', 'how', 'why', 'when', 'where', 'which', 'who',
	'is', 'are', 'was', 'were', 'be', 'been', 'being',
	'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
	'can', 'could', 'should', 'may', 'might', 'shall',
	'give', 'me', 'get', 'want', 'need',
]);

/**
 * Extract keyword groups from a query for targeted searches.
 * Returns 2-3 meaningful keyword strings.
 */
function extractKeywords(query: string): string[] {
	// Split on Chinese punctuation, spaces, and common delimiters
	const tokens = query
		.split(/[\s，。！？、；：""''（）【】《》\n]+/)
		.map((t) => t.trim())
		.filter((t) => t.length >= 2 && !STOP_WORDS.has(t));

	if (tokens.length === 0) return [query.slice(0, 40)];

	// Group tokens into 2-3 searches
	const groups: string[] = [];

	if (tokens.length <= 3) {
		// Few tokens: one search per token
		groups.push(...tokens.slice(0, 3));
	} else {
		// Many tokens: first half, second half, and the whole thing
		const mid = Math.floor(tokens.length / 2);
		groups.push(tokens.slice(0, mid).join(' '));
		groups.push(tokens.slice(mid).join(' '));
	}

	// Always add the raw query as a third search if not already covered
	const rawShort = query.slice(0, 40);
	if (!groups.includes(rawShort)) groups.push(rawShort);

	return groups.slice(0, 3);
}

/**
 * Derive a 2-level parent path label from a file path.
 * "kb2-learn-prd/B-2-创意和想法管理/A-All Ideas/foo.md" → "kb2-learn-prd/B-2-创意和想法管理/A-All Ideas"
 */
function parentDir(path: string): string {
	const parts = path.split('/');
	if (parts.length <= 1) return '/';
	return parts.slice(0, -1).join('/');
}

// ─── Main ────────────────────────────────────────────────────────────────────

/**
 * Run the pre-classify probe: parallel keyword searches → real vault signals.
 */
export async function runProbePhase(userQuery: string): Promise<ProbeResult> {
	const searchClient = AppContext.getInstance().searchClient;
	if (!searchClient) return { hits: [], formattedContext: '' };

	const keywords = extractKeywords(userQuery);

	// Run all keyword searches in parallel
	const searchPromises = keywords.map(async (kw) => {
		try {
			const res = await searchClient.search({
				text: kw,
				scopeMode: 'vault',
				topK: 5,
				searchMode: 'hybrid',
				indexTenant: 'vault',
			});
			return (res.items ?? []).map((item) => ({
				path: item.path,
				title: item.title ?? item.path.split('/').pop() ?? '',
				score: item.score ?? 0,
				keyword: kw,
			}));
		} catch {
			return [];
		}
	});

	const results = await Promise.all(searchPromises);

	// Deduplicate by path (keep highest score)
	const byPath = new Map<string, ProbeHit>();
	for (const batch of results) {
		for (const hit of batch) {
			const existing = byPath.get(hit.path);
			if (!existing || hit.score > existing.score) {
				byPath.set(hit.path, hit);
			}
		}
	}

	const hits = Array.from(byPath.values()).sort((a, b) => b.score - a.score);

	if (hits.length === 0) return { hits: [], formattedContext: '' };

	// Build directory structure summary
	const dirCounts = new Map<string, number>();
	for (const hit of hits) {
		const dir = parentDir(hit.path);
		dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
	}

	// Format for prompt injection
	const lines: string[] = [
		'## Vault Probe — Actual Files Found (Ground Your Descriptions Here)',
		'',
		'These files were found by searching the vault with keywords from your query.',
		'CRITICAL: Your intent_descriptions and scope_constraint paths MUST reference paths from this list.',
		'Do NOT invent paths or describe topics unrelated to what is shown here.',
		'',
	];

	// Group hits by keyword
	const hitsByKeyword = new Map<string, ProbeHit[]>();
	for (const hit of hits) {
		const group = hitsByKeyword.get(hit.keyword) ?? [];
		group.push(hit);
		hitsByKeyword.set(hit.keyword, group);
	}

	for (const [kw, kwHits] of hitsByKeyword) {
		lines.push(`**Search: "${kw}"**`);
		for (const h of kwHits.slice(0, 4)) {
			lines.push(`  - ${h.path} (score: ${h.score.toFixed(2)})`);
		}
		lines.push('');
	}

	// Relevant directories
	lines.push('**Relevant directories containing these files:**');
	for (const [dir, count] of [...dirCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
		lines.push(`  - ${dir}/ (${count} hit${count > 1 ? 's' : ''})`);
	}

	return {
		hits,
		formattedContext: lines.join('\n'),
	};
}
