import type { RagSource } from '../types';
import { buildSnippet } from '../utils/snippet-builder';

/**
 * Build RAG sources list from hits.
 */
export function buildRagSources(params: { hits: Array<{ path: string; title: string; content: string; score: number }>; query: string }): RagSource[] {
	const q = params.query ?? '';
	return (params.hits ?? []).map((hit) => {
		const snippet = buildSnippet(hit.content ?? '', q);
		return {
			path: hit.path,
			title: hit.title ?? hit.path,
			snippet: snippet?.text ?? '',
			score: hit.score,
		};
	});
}

