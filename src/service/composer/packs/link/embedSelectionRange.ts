/**
 * One logical Composer preview range for a normal Obsidian embed.
 *
 * The marker stays inline with the original embed, so Obsidian's normal reader
 * still renders the full embed while Composer can resolve the exact boundary
 * range without turning a multi-paragraph selection into a fake list.
 */

export interface EmbedSelectionRange {
	version: 1;
	originalEmbed: string;
	startAnchor: string;
	endAnchor: string;
}

const RANGE_PREFIX = '%%peak-composer-embed-range:';
const RANGE_RE = /^\s*(!\[\[[^\]]+\]\])\s+%%peak-composer-embed-range:([^\r\n]*?)%%\s*$/;

export function serializeEmbedSelectionRange(
	originalEmbed: string,
	anchors: Pick<EmbedSelectionRange, 'startAnchor' | 'endAnchor'>,
): string {
	const embed = originalEmbed.trim();
	if (!/^!\[\[[^\]]+\]\]$/.test(embed)) throw new Error('Selection range requires one bare Obsidian embed');
	const payload: EmbedSelectionRange = {
		version: 1,
		originalEmbed: embed,
		startAnchor: anchors.startAnchor,
		endAnchor: anchors.endAnchor,
	};
	return `${embed} ${RANGE_PREFIX}${encodeURIComponent(JSON.stringify(payload))}%%`;
}

export function parseEmbedSelectionRange(raw: string): EmbedSelectionRange | null {
	const match = raw.match(RANGE_RE);
	if (!match) return null;
	try {
		const parsed = JSON.parse(decodeURIComponent(match[2])) as Partial<EmbedSelectionRange>;
		if (
			parsed.version !== 1
			|| parsed.originalEmbed !== match[1]
			|| !isAnchor(parsed.startAnchor)
			|| !isAnchor(parsed.endAnchor)
		) return null;
		return {
			version: 1,
			originalEmbed: parsed.originalEmbed,
			startAnchor: parsed.startAnchor,
			endAnchor: parsed.endAnchor,
		};
	} catch {
		return null;
	}
}

export function isEmbedSelectionRange(raw: string): boolean {
	return parseEmbedSelectionRange(raw) !== null;
}

function isAnchor(value: unknown): value is string {
	return typeof value === 'string' && /^[A-Za-z0-9-]+$/.test(value);
}
