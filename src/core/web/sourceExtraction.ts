export interface CitedWebSource {
	id: string;
	url: string;
	title: string;
}

/**
 * Recover only URLs that a provider actually cited in its search answer.
 * The provider fallback exposes synthesized text rather than structured source
 * metadata, so this parser must not invent titles, fetch times or page claims.
 */
export function extractCitedWebSources(text: string): CitedWebSource[] {
	if (!text) return [];
	const titleByUrl = new Map<string, string>();
	const upsert = (rawUrl: string, title: string): void => {
		const url = rawUrl.replace(/[.,;:!?)\]]+$/, '').trim();
		if (!url) return;
		const existing = titleByUrl.get(url);
		if (existing === undefined || (!existing && title)) titleByUrl.set(url, title);
	};

	const markdownLink = /\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
	let match: RegExpExecArray | null;
	while ((match = markdownLink.exec(text)) !== null) {
		upsert(match[2], (match[1] ?? '').trim());
	}
	const bareUrl = /https?:\/\/[^\s<>()[\]]+/g;
	while ((match = bareUrl.exec(text)) !== null) upsert(match[0], '');

	return [...titleByUrl.entries()].map(([url, title], index) => ({
		id: `web-${index + 1}`,
		url,
		title: title || url,
	}));
}
