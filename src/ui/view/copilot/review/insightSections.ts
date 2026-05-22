/**
 * Parse an insight's markdown body into navigable sections.
 *
 * Splits on H1/H2/H3 heading lines (ignoring those inside fenced code blocks).
 * Each section carries the heading line PLUS the body content that follows it,
 * until the next heading or end of input. The text before the first heading
 * (if any) is returned as a `preamble` section with level = 0.
 */

import type { InsightArtifact } from '@/service/copilot/CopilotRunArtifacts';

export interface MarkdownSection {
	/** 0 = preamble (no heading), 1-3 = H1-H3. */
	level: 0 | 1 | 2 | 3;
	headingText: string; // empty for preamble
	/** Full markdown chunk: heading line (if any) + lines until next heading. */
	chunk: string;
	/** Stable slug derived from heading text + index. */
	slug: string;
}

export interface InsightSectionTree {
	insightId: string;
	insightTitle: string;
	preamble: MarkdownSection | null;
	sections: MarkdownSection[];
}

function slugify(text: string, fallback: string): string {
	const cleaned = text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}\s-]/gu, '')
		.trim()
		.replace(/\s+/g, '-')
		.slice(0, 60);
	return cleaned.length > 0 ? cleaned : fallback;
}

function parseSections(body: string): { preamble: MarkdownSection | null; sections: MarkdownSection[] } {
	const lines = body.split('\n');
	type RawHeading = { level: 1 | 2 | 3; text: string; lineIndex: number };
	const headings: RawHeading[] = [];

	let inFence = false;
	let fenceMarker = '';

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		// Track fence boundaries to avoid treating headings inside code as splits.
		const fenceMatch = line.match(/^(```|~~~)/);
		if (fenceMatch) {
			if (!inFence) {
				inFence = true;
				fenceMarker = fenceMatch[1];
			} else if (line.startsWith(fenceMarker)) {
				inFence = false;
				fenceMarker = '';
			}
			continue;
		}
		if (inFence) continue;

		const headingMatch = line.match(/^(#{1,3})\s+(.+?)\s*$/);
		if (headingMatch) {
			headings.push({
				level: headingMatch[1].length as 1 | 2 | 3,
				text: headingMatch[2],
				lineIndex: i,
			});
		}
	}

	// No headings → entire body is preamble.
	if (headings.length === 0) {
		return {
			preamble: body.trim().length > 0
				? { level: 0, headingText: '', chunk: body, slug: 'preamble' }
				: null,
			sections: [],
		};
	}

	// Preamble = lines[0 .. headings[0].lineIndex - 1]
	const firstHeadingIdx = headings[0].lineIndex;
	const preambleLines = lines.slice(0, firstHeadingIdx);
	const preambleText = preambleLines.join('\n');
	const preamble = preambleText.trim().length > 0
		? { level: 0 as const, headingText: '', chunk: preambleText, slug: 'preamble' }
		: null;

	const sections: MarkdownSection[] = [];
	for (let h = 0; h < headings.length; h++) {
		const start = headings[h].lineIndex;
		const end = h + 1 < headings.length ? headings[h + 1].lineIndex : lines.length;
		const chunk = lines.slice(start, end).join('\n');
		sections.push({
			level: headings[h].level,
			headingText: headings[h].text,
			chunk,
			slug: slugify(headings[h].text, `section-${h + 1}`),
		});
	}

	return { preamble, sections };
}

export function buildInsightSectionTrees(insights: InsightArtifact[]): InsightSectionTree[] {
	return insights.map(insight => {
		const { preamble, sections } = parseSections(insight.body);
		return {
			insightId: insight.id,
			insightTitle: insight.title,
			preamble,
			sections,
		};
	});
}

export function insightAnchorId(insightId: string): string {
	return `peak-insight-${insightId}`;
}

export function insightSectionAnchorId(insightId: string, slug: string): string {
	return `peak-insight-${insightId}-section-${slug}`;
}
