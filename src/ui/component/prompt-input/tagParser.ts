export interface ParsedTag {
	type: 'context' | 'prompt';
	text: string;
	start: number;
	end: number;
}

const contextTagRegex = /@[^@]+@/g;
const promptTagRegex = /\/[^\/]*?\//g; // Non-greedy matching
const bracketTagRegex = /\[\[[^\]]+\]\]/g;

/**
 * Parse tags from text using the same logic as tagPlugin
 */
export function parseTagsFromText(text: string): ParsedTag[] {
	const tags: ParsedTag[] = [];

	// Parse @ tags
	const atRegex = /@[^@]+@/g;
	let match;
	while ((match = atRegex.exec(text)) !== null) {
		tags.push({
			type: 'context',
			text: match[0],
			start: match.index,
			end: match.index + match[0].length,
		});
	}

	// Parse [[ ]] tags
	const bracketRegex = /\[\[[^\]]+\]\]/g;
	while ((match = bracketRegex.exec(text)) !== null) {
		tags.push({
			type: 'context',
			text: match[0],
			start: match.index,
			end: match.index + match[0].length,
		});
	}

	// Parse / tags - find valid /.../ pairs manually
	const slashPositions: number[] = [];
	for (let i = 0; i < text.length; i++) {
		if (text[i] === '/') {
			slashPositions.push(i);
		}
	}

	for (let i = 0; i < slashPositions.length - 1; i++) {
		const startPos = slashPositions[i];
		const endPos = slashPositions[i + 1];

		// Check if this forms a valid /.../ (not empty, and not containing other slashes)
		const content = text.substring(startPos + 1, endPos);
		const hasInternalSlashes = content.includes('/');
		const isOnlyWhitespace = content.trim().length === 0;

		if (!hasInternalSlashes && !isOnlyWhitespace && content.length > 0) {
			const matchStart = startPos;
			const matchEnd = endPos + 1;

			// Check if this /.../ crosses any existing @...@ match boundaries
			const crossesTagBoundary = tags.some(existing => {
				// Check if the /.../ starts inside a tag but ends outside, or vice versa
				const startsInside = existing.start <= matchStart && existing.end > matchStart;
				const endsInside = existing.start < matchEnd && existing.end >= matchEnd;
				const crosses = startsInside !== endsInside;

				return crosses;
			});

			if (!crossesTagBoundary) {
				tags.push({
					type: 'prompt',
					text: text.substring(matchStart, matchEnd),
					start: matchStart,
					end: matchEnd,
				});
			}
		}
	}

	// Sort matches by priority: longer matches first, then by position
	tags.sort((a, b) => {
		const lengthDiff = (b.end - b.start) - (a.end - a.start);
		if (lengthDiff !== 0) return lengthDiff; // Longer matches first
		return a.start - b.start; // Then by position
	});

	// Filter out overlapping matches (keep non-overlapping ones)
	const filteredTags: ParsedTag[] = [];
	for (const tag of tags) {
		// Check if this tag overlaps with any existing tag
		const hasOverlap = filteredTags.some(existing =>
			!(tag.end <= existing.start || tag.start >= existing.end)
		);
		if (!hasOverlap) {
			filteredTags.push(tag);
		}
	}

	// Final sort by position for CodeMirror
	filteredTags.sort((a, b) => a.start - b.start);

	return filteredTags;
}