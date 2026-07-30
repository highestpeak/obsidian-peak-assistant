import {
	emptySourceReceipt,
	type ExplicitContextRef,
	type SourceReceipt,
} from '@/core/types/chat-studio';

/**
 * Per-turn accumulator for the ACTUAL sources consulted while producing an
 * answer (chat-studio §8.4 / RUN-02). Created by the submit pipeline, handed
 * to tool executors, then snapshotted into the TurnExecutionReceipt.
 */
export class SourceReceiptCollector {
	private receipt: SourceReceipt = emptySourceReceipt();

	markProjectIncluded(): void {
		this.receipt.projectIncluded = true;
	}

	recordVaultQuery(query: string): void {
		this.receipt.vaultQueries.push(query);
	}

	recordVaultDocument(doc: { id: string; path: string; title: string }): void {
		if (this.receipt.vaultDocuments.some((d) => d.path === doc.path)) return;
		this.receipt.vaultDocuments.push(doc);
	}

	recordWebQuery(query: string): void {
		this.receipt.webQueries.push(query);
	}

	recordWebSource(source: { id: string; url: string; title: string }): void {
		if (this.receipt.webSources.some((s) => s.url === source.url)) return;
		this.receipt.webSources.push(source);
	}

	/**
	 * B2 (plan §5.3.3): record an explicit ref (assistant knowledgeRef or
	 * composer attachment) that actually reached the runtime attachment pipe.
	 * Deduped by id — the resolver calls this once per surviving ref.
	 */
	recordExplicitRefUsed(ref: ExplicitContextRef): void {
		if (this.receipt.explicitRefsUsed.some((r) => r.id === ref.id)) return;
		this.receipt.explicitRefsUsed.push(ref);
	}

	snapshot(): SourceReceipt {
		return {
			projectIncluded: this.receipt.projectIncluded,
			vaultQueries: [...this.receipt.vaultQueries],
			vaultDocuments: [...this.receipt.vaultDocuments],
			webQueries: [...this.receipt.webQueries],
			webSources: [...this.receipt.webSources],
			explicitRefsUsed: [...this.receipt.explicitRefsUsed],
		};
	}
}

/**
 * Extract cited web sources from a web-search answer (chat-studio RUN-02).
 *
 * CONSTRAINT: the chat `web_search` tool runs through a provider profile
 * whose search happens server-side inside the
 * model — the CLI WebSearch tool is disallowed, so the only web signal that
 * surfaces is the model's synthesized answer TEXT with inline citations (the
 * web-search system prompt instructs "Cite URLs where possible"). There is no
 * structured per-source metadata (no title / page-age arrays) to record, so we
 * recover the real sources by parsing the URLs the model actually cited.
 * Markdown link text becomes the title when present; otherwise the URL doubles
 * as the title. This is honest recovery of what the run produced — not
 * fabricated data. Dedupes by URL; the collector dedupes again on record.
 */
export function extractWebSourcesFromText(text: string): Array<{ id: string; url: string; title: string }> {
	if (!text) return [];
	const titleByUrl = new Map<string, string>();
	const upsert = (rawUrl: string, title: string): void => {
		const url = stripTrailingPunctuation(rawUrl);
		if (!url) return;
		const existing = titleByUrl.get(url);
		// Keep the first non-empty title we see for a URL; never downgrade to ''.
		if (existing === undefined || (!existing && title)) titleByUrl.set(url, title);
	};

	// 1) Markdown links [title](url) — carry a human-readable title.
	const mdLink = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
	let m: RegExpExecArray | null;
	while ((m = mdLink.exec(text)) !== null) upsert(m[2], (m[1] ?? '').trim());

	// 2) Bare / angle-bracketed URLs — title falls back to the URL itself.
	const bareUrl = /https?:\/\/[^\s<>()[\]]+/g;
	while ((m = bareUrl.exec(text)) !== null) upsert(m[0], '');

	return Array.from(titleByUrl.entries()).map(([url, title], i) => ({
		id: `web-${i + 1}`,
		url,
		title: title || url,
	}));
}

/** Drop trailing sentence/markdown punctuation that URL regexes over-capture. */
function stripTrailingPunctuation(raw: string): string {
	return raw.replace(/[.,;:!?)\]]+$/, '').trim();
}
