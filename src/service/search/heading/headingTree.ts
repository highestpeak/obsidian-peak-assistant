/**
 * Track T2b · Heading Tree Service.
 *
 * Given a markdown file path, produce a hierarchical outline:
 *
 * - Full outline in "empty" mode (queryText === '') with matchCount = 0.
 * - Filtered outline with per-heading match counts propagated to ancestors
 *   when queryText is non-empty (case-insensitive substring match on the
 *   section body — excluding the heading line itself).
 * - `outboundLinkCount` per heading: `[[...]]` + `[...](...)` in the body.
 *
 * The file is read via a narrow {@link HeadingFileReaderPort}, not fs; the
 * app layer adapts the real vault reader to this shape. All list-position
 * numbers are 1-based line indices (matches the way editors + the spec
 * quote line ranges, e.g. `12-24`).
 */

export interface HeadingTreeNode {
	level: 1 | 2 | 3 | 4 | 5 | 6;
	title: string;
	lineStart: number;
	lineEnd: number;
	matchCount: number;
	children: HeadingTreeNode[];
	outboundLinkCount: number;
}

export interface HeadingTreeInput {
	filePath: string;
	/** Empty string ('') = empty state: full tree with all matchCount = 0. */
	queryText: string;
}

export interface HeadingFileReaderPort {
	readText(path: string): Promise<string | null>;
}

export interface HeadingBacklinkReaderPort {
	getBacklinkPositions(targetPath: string): Promise<Array<{ sourcePath: string; line: number }>>;
}

export interface HeadingTreeDeps {
	fileReader: HeadingFileReaderPort;
}

export interface LinkPositionsDeps {
	fileReader: HeadingFileReaderPort;
	backlinkReader?: HeadingBacklinkReaderPort;
}

// ---------------------------------------------------------------------------
// Line-level scanning helpers
// ---------------------------------------------------------------------------

interface FlatHeading {
	level: 1 | 2 | 3 | 4 | 5 | 6;
	title: string;
	/** 1-based line number of the heading marker itself. */
	line: number;
}

interface ScanResult {
	lines: string[];
	headings: FlatHeading[];
	/** For each line index (0-based), whether it sits inside a fenced code block. */
	inCodeFence: boolean[];
	/** Line index (0-based, exclusive) where frontmatter ends; body starts here. */
	bodyStartIndex: number;
}

const ATX_HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE_RE = /^(?:```|~~~)/;

function splitLines(text: string): string[] {
	// Preserve empty trailing line if present — spec ranges are 1-based and
	// clamp to document end, so trailing structure matters.
	return text.split(/\r\n|\r|\n/);
}

function scanMarkdown(text: string): ScanResult {
	const lines = splitLines(text);
	const inCodeFence: boolean[] = new Array(lines.length).fill(false);
	const headings: FlatHeading[] = [];

	// Skip YAML frontmatter at very top: `---` on line 0, next `---` closes.
	let bodyStartIndex = 0;
	if (lines.length > 0 && lines[0].trim() === '---') {
		for (let i = 1; i < lines.length; i++) {
			if (lines[i].trim() === '---') {
				bodyStartIndex = i + 1;
				break;
			}
		}
	}

	let fenceOpen = false;
	for (let i = bodyStartIndex; i < lines.length; i++) {
		const raw = lines[i];
		if (FENCE_RE.test(raw.trimStart())) {
			// Toggle: the fence line itself is considered inside the fence
			// (so `## fake heading` on the fence marker cannot start a heading;
			// but the marker never matches ATX anyway). Content lines between
			// the two markers are inside.
			fenceOpen = !fenceOpen;
			inCodeFence[i] = true;
			continue;
		}
		inCodeFence[i] = fenceOpen;
		if (fenceOpen) continue;
		const m = ATX_HEADING_RE.exec(raw);
		if (!m) continue;
		const level = m[1].length as 1 | 2 | 3 | 4 | 5 | 6;
		headings.push({ level, title: m[2].trim(), line: i + 1 });
	}
	return { lines, headings, inCodeFence, bodyStartIndex };
}

// ---------------------------------------------------------------------------
// Section boundaries: a heading owns lines from its own line through the
// line before the next heading of the same-or-shallower level.
// ---------------------------------------------------------------------------

interface HeadingWithRange extends FlatHeading {
	lineStart: number;
	lineEnd: number;
}

function computeRanges(headings: FlatHeading[], totalLines: number): HeadingWithRange[] {
	const withRange: HeadingWithRange[] = [];
	for (let i = 0; i < headings.length; i++) {
		const h = headings[i];
		let lineEnd = totalLines; // 1-based; default: to document end.
		for (let j = i + 1; j < headings.length; j++) {
			if (headings[j].level <= h.level) {
				lineEnd = headings[j].line - 1;
				break;
			}
		}
		withRange.push({ ...h, lineStart: h.line, lineEnd });
	}
	return withRange;
}

// ---------------------------------------------------------------------------
// Body slice for match/link counting: excludes the heading line itself.
// ---------------------------------------------------------------------------

/**
 * Slice a heading's *own* body (excluding descendant sections) so that
 * ancestor match counts can be aggregated correctly during propagation.
 *
 * Given headings sorted in document order, the "own" body of heading `i` is
 * the lines from `heading.line + 1` up to but not including the first
 * following heading — regardless of that following heading's level.
 * (A deeper following heading belongs to a descendant; a shallower or
 * equal following heading terminates the parent range anyway.)
 */
function sliceOwnBody(
	lines: string[],
	inCodeFence: boolean[],
	headingLine1: number,
	nextHeadingLine1OrEnd: number,
): string {
	const start0 = headingLine1; // heading line is 1-based; body starts at heading + 1 -> 0-based `headingLine1`.
	const end0 = Math.min(nextHeadingLine1OrEnd - 1, lines.length); // exclusive of next heading line
	if (start0 >= end0) return '';
	const collected: string[] = [];
	for (let i = start0; i < end0; i++) {
		// We do count matches inside code fences intentionally: users search
		// for identifiers that live in code blocks. Callers who care about
		// prose-only counts can filter later.
		void inCodeFence;
		collected.push(lines[i]);
	}
	return collected.join('\n');
}

function countCaseInsensitiveOccurrences(haystack: string, needle: string): number {
	if (!needle) return 0;
	if (haystack.length === 0) return 0;
	const h = haystack.toLowerCase();
	const n = needle.toLowerCase();
	let count = 0;
	let idx = 0;
	while (idx <= h.length - n.length) {
		const found = h.indexOf(n, idx);
		if (found === -1) break;
		count++;
		idx = found + n.length;
	}
	return count;
}

// Match either `[[wiki]]` (with optional `|alias`) or `[label](target)`
// markdown links. Kept broad; heading-text callers pre-strip the heading
// line so we only count body links.
const WIKI_LINK_RE = /\[\[([^\]]+?)\]\]/g;
const MD_LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;

function countBodyLinks(body: string): number {
	let count = 0;
	for (const _ of body.matchAll(WIKI_LINK_RE)) count++;
	for (const _ of body.matchAll(MD_LINK_RE)) count++;
	return count;
}

// ---------------------------------------------------------------------------
// Tree assembly + ancestor propagation
// ---------------------------------------------------------------------------

function nestHeadings(
	flat: HeadingWithRange[],
	self: (h: HeadingWithRange, index: number) => HeadingTreeNode,
): HeadingTreeNode[] {
	const roots: HeadingTreeNode[] = [];
	// Stack of ancestors, ordered by depth: [{ level, node }].
	const stack: Array<{ level: number; node: HeadingTreeNode }> = [];
	for (let i = 0; i < flat.length; i++) {
		const h = flat[i];
		const node = self(h, i);
		while (stack.length > 0 && stack[stack.length - 1].level >= h.level) stack.pop();
		if (stack.length === 0) roots.push(node);
		else stack[stack.length - 1].node.children.push(node);
		stack.push({ level: h.level, node });
	}
	return roots;
}

function propagateMatchCounts(node: HeadingTreeNode): number {
	let sum = node.matchCount;
	for (const child of node.children) sum += propagateMatchCounts(child);
	node.matchCount = sum;
	return sum;
}

function propagateOutboundLinks(node: HeadingTreeNode): number {
	let sum = node.outboundLinkCount;
	for (const child of node.children) sum += propagateOutboundLinks(child);
	node.outboundLinkCount = sum;
	return sum;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function extractHeadingTree(
	deps: HeadingTreeDeps,
	input: HeadingTreeInput,
): Promise<HeadingTreeNode[]> {
	const text = await deps.fileReader.readText(input.filePath);
	if (text === null) return [];

	const scan = scanMarkdown(text);
	const ranges = computeRanges(scan.headings, scan.lines.length);

	// Precompute next-heading line for each heading so `sliceOwnBody` can
	// exclude descendant sections without re-scanning.
	const nextHeadingLine: number[] = ranges.map((_, i) => {
		if (i + 1 < ranges.length) return ranges[i + 1].line;
		return scan.lines.length + 1; // sentinel: exclusive of doc end
	});

	const buildNode = (h: HeadingWithRange, i: number): HeadingTreeNode => {
		const body = sliceOwnBody(scan.lines, scan.inCodeFence, h.line, nextHeadingLine[i]);
		const outboundLinkCount = countBodyLinks(body);
		const matchCount = input.queryText.length > 0
			? countCaseInsensitiveOccurrences(body, input.queryText)
			: 0;
		return {
			level: h.level,
			title: h.title,
			lineStart: h.lineStart,
			lineEnd: h.lineEnd,
			matchCount,
			children: [],
			outboundLinkCount,
		};
	};

	const tree = nestHeadings(ranges, buildNode);
	if (input.queryText.length > 0) {
		for (const root of tree) propagateMatchCounts(root);
	}
	// Outbound link counts always propagate: the "own body" slice would
	// under-report an H1's total outgoing reach otherwise. Empty-state
	// callers still get useful numbers.
	for (const root of tree) propagateOutboundLinks(root);
	return tree;
}

// ---------------------------------------------------------------------------
// Link positions (outgoing + optional backlinks)
// ---------------------------------------------------------------------------

interface LinkOccurrence {
	line: number;
	target: string;
	kind: 'outgoing' | 'backlink';
}

function collectOutgoingLinks(scan: ScanResult): LinkOccurrence[] {
	const out: LinkOccurrence[] = [];
	for (let i = 0; i < scan.lines.length; i++) {
		if (scan.inCodeFence[i]) continue;
		const line = scan.lines[i];
		for (const m of line.matchAll(WIKI_LINK_RE)) {
			// `[[Target|Alias]]` -> raw target text preserved (spec says raw).
			out.push({ line: i + 1, target: m[1], kind: 'outgoing' });
		}
		for (const m of line.matchAll(MD_LINK_RE)) {
			out.push({ line: i + 1, target: m[1], kind: 'outgoing' });
		}
	}
	return out;
}

export async function getLinkPositions(
	deps: LinkPositionsDeps,
	filePath: string,
): Promise<Array<{ line: number; target: string; kind: 'outgoing' | 'backlink' }>> {
	const text = await deps.fileReader.readText(filePath);
	if (text === null) return [];
	const scan = scanMarkdown(text);
	const results: LinkOccurrence[] = collectOutgoingLinks(scan);

	// Backlinks: opt-in. If no cheap per-line source is available (edge repo
	// typically stores node-to-node without line offsets), the reader may
	// return []. We do NOT block on this — the spec calls backlinks
	// "optional if available cheaply".
	if (deps.backlinkReader) {
		try {
			const back = await deps.backlinkReader.getBacklinkPositions(filePath);
			for (const b of back) {
				results.push({ line: b.line, target: b.sourcePath, kind: 'backlink' });
			}
		} catch (err) {
			// Backlinks are opt-in convenience; failure should not blow up
			// heading mode. Log-and-continue.
			console.warn('[headingTree.getLinkPositions] backlink reader failed', err);
		}
	}
	return results;
}
