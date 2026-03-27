/**
 * Lightweight script-based locale stem detection for indexing (TextRank, stopwords).
 * No ML; tuned for CJK / Hangul / Kana / Latin / Cyrillic. Keep in sync with
 * {@link stripForTextRank} when changing markdown stripping rules.
 */

const SAMPLE_MAX = 12_000;

/**
 * Same stripping as {@link stripForTextRank} to avoid importing loader graph cycles.
 */
function stripLikeTextRank(markdown: string): string {
	let s = markdown.replace(/```[\s\S]*?```/g, ' ');
	s = s.replace(/`[^`\n]+`/g, ' ');
	return s.replace(/\s+/g, ' ').trim();
}

/**
 * Returns a BCP47-style primary stem (e.g. en, zh, ja) for segmenter + stopword lookup.
 * Add a `templates/stopwords/{stem}.md` file and register it in the plugin template registry to support new languages.
 */
export function detectTextLocaleStem(text: string): string {
	const s = stripLikeTextRank(text).slice(0, SAMPLE_MAX);
	if (!s) return 'en';

	let hir = 0;
	let kat = 0;
	let hang = 0;
	let cjk = 0;
	let lat = 0;
	let cyr = 0;

	for (let i = 0; i < s.length; i++) {
		const c = s.charCodeAt(i);
		if (c >= 0x3040 && c <= 0x309f) hir++;
		else if (c >= 0x30a0 && c <= 0x30ff) kat++;
		else if (c >= 0xac00 && c <= 0xd7af) hang++;
		else if (c >= 0x4e00 && c <= 0x9fff) cjk++;
		else if ((c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a)) lat++;
		else if (c >= 0x400 && c <= 0x4ff) cyr++;
	}

	const kana = hir + kat;
	const letters = lat + cyr;

	// Japanese: any meaningful kana usually implies Japanese (disambiguates from Chinese).
	if (kana >= 3) return 'ja';

	if (hang >= 10 && hang >= (hang + cjk + kana + letters) * 0.2) return 'ko';

	// Chinese: Han-heavy, little kana (already filtered).
	if (cjk >= 24 && cjk >= (cjk + letters) * 0.32) return 'zh';

	if (cyr >= 16 && cyr >= (cyr + lat) * 0.22) return 'ru';

	return 'en';
}
