export interface ParsedTag {
	type: 'context' | 'prompt' | 'search';
	text: string;
	start: number;
	end: number;
}

const contextTagRegex = /@[^@]+@/g;
const promptTagRegex = /\/[^\/]*?\//g; // Non-greedy matching
const bracketTagRegex = /\[\[[^\]]+\]\]/g;
const searchTagRegex = /(@web@|@\d+@)/g; // For @web@ and @number@ highlighting in search

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

	// Parse @web@ and @number@ tags for search input
	const searchRegex = /(@web@|@\d+@)/g;
	while ((match = searchRegex.exec(text)) !== null) {
		tags.push({
			type: 'search',
			text: match[0],
			start: match.index,
			end: match.index + match[0].length,
		});
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
