/**
 * File Atlas — tree view-model helpers (Phase 1).
 *
 * Pure functions over the parsed {@link DocumentBlock} tree: frontmatter
 * grouping, visibility computation (preset kinds × search term, group rows
 * always visible), collapsed count summaries, the default fold (expand only the
 * current node's ancestor path), and the Inspector's naive keyword frequency.
 * No React, no side effects.
 */

import type { DocumentBlock, FileAtlasAnchor, RawBlockKind } from '@/core/document/atlas/types';
import type { DocumentSourceLocation } from '@/core/ports/VaultNavigationPort';
import { RawBlockKind as Kind } from '@/core/document/atlas/types';
import {
	DEFAULT_FILE_ATLAS_CONFIG,
	type FileAtlasConfig,
	type KeywordStopwords,
	type KindConfig,
} from './config/fileAtlasConfig';
import { atlasSearchText } from './atlasDisplayModel';
import { displayIdentity } from './atlasDisplayModel';

const ANALYSIS_METADATA_KINDS = new Set<RawBlockKind>([
	Kind.Image,
	Kind.Embed,
	Kind.Attachment,
	Kind.VaultLink,
	Kind.ExternalLink,
	Kind.Property,
	Kind.Tag,
	Kind.Footnote,
]);

const STAT_RESOURCE_KINDS = new Set<RawBlockKind>([
	Kind.Table,
	Kind.Code,
	Kind.Math,
	Kind.Mermaid,
	Kind.Image,
	Kind.Embed,
	Kind.Attachment,
	Kind.Footnote,
	Kind.VaultLink,
	Kind.ExternalLink,
]);

/** Kinds that are containers even before their children are inspected. */
export function isGroupKind(kind: RawBlockKind): boolean {
	return kind === Kind.Heading || kind === Kind.Frontmatter || kind === Kind.List;
}

/** A nested ListItem/Task may also become a container when it owns a sub-list. */
export function isGroupNode(node: DocumentBlock): boolean {
	return isGroupKind(node.kind) || Boolean(node.children?.length);
}

/** Stable id for the synthetic frontmatter group node. */
export const FRONTMATTER_GROUP_ID = 'fa-frontmatter-group';

export function documentLocationForAtlasBlock(block: DocumentBlock): DocumentSourceLocation {
	const frontmatterKey = block.detail?.propertyKey
		?? (block.kind === Kind.Tag && block.detail?.tagSource === 'frontmatter' ? 'tags' : undefined);
	return {
		line: Math.max(0, block.anchor.lineStart - 1),
		...(block.anchor.sourceFrom !== undefined ? { from: block.anchor.sourceFrom } : {}),
		...(block.anchor.sourceTo !== undefined ? { to: block.anchor.sourceTo } : {}),
		...(block.source ? { text: block.source } : {}),
		...(frontmatterKey ? { frontmatterKey } : {}),
	};
}

/**
 * Wrap the document's leading run of Property/Tag blocks into one synthetic
 * {@link Kind.Frontmatter} group so metadata reads (and folds) like a titled
 * section instead of a flat list. Returns the blocks unchanged when the file
 * has no leading frontmatter blocks. Never mutates the input.
 */
export function groupFrontmatter(blocks: DocumentBlock[], title: string): DocumentBlock[] {
	let end = 0;
	while (end < blocks.length && (blocks[end].kind === Kind.Property || blocks[end].kind === Kind.Tag)) {
		end += 1;
	}
	if (end === 0) return blocks;

	const children = blocks.slice(0, end);
	const lineStart = children[0].anchor.lineStart;
	const lineEnd = children[children.length - 1].anchor.lineEnd;
	const anchor: FileAtlasAnchor = {
		filePath: children[0].anchor.filePath,
		blockId: FRONTMATTER_GROUP_ID,
		nearestHeading: null,
		blockType: Kind.Frontmatter,
		ordinalInHeading: 0,
		contentHash: '',
		lineStart,
		lineEnd,
		sourceFrom: children[0].anchor.sourceFrom,
		sourceTo: children[children.length - 1].anchor.sourceTo,
		status: 'active',
	};
	const group: DocumentBlock = {
		id: FRONTMATTER_GROUP_ID,
		kind: Kind.Frontmatter,
		title,
		source: children.map((c) => c.source).join('\n'),
		anchor,
		children,
	};
	return [group, ...blocks.slice(end)];
}

export interface CountSummary {
	block: number;
	resource: number;
}

/** Count descendants of a group by category (for the collapsed summary). */
export function countDescendants(
	node: DocumentBlock,
	kinds: Record<string, KindConfig>
): CountSummary {
	const sum: CountSummary = { block: 0, resource: 0 };
	const countListResources = (child: DocumentBlock): void => {
		if (kinds[child.kind]?.category === 'resource') sum.resource += 1;
		(child.children ?? []).forEach(countListResources);
	};
	const walk = (child: DocumentBlock): void => {
		if (child.kind === Kind.List) {
			if (kinds[child.kind]?.category === 'block') sum.block += 1;
			(child.children ?? []).forEach(countListResources);
			return;
		}
		if (isGroupKind(child.kind)) {
			(child.children ?? []).forEach(walk);
			return;
		}
		const cat = kinds[child.kind]?.category;
		if (cat === 'block') sum.block += 1;
		else if (cat === 'resource') sum.resource += 1;
		(child.children ?? []).forEach(walk);
	};
	(node.children ?? []).forEach(walk);
	return sum;
}

/** "3 blocks · 2 res" summary shown on a collapsed group row. */
export function foldSummary(node: DocumentBlock, kinds: Record<string, KindConfig>): string {
	if (node.kind === Kind.List) return '';
	const s = countDescendants(node, kinds);
	const parts: string[] = [];
	if (s.block) parts.push(`${s.block} blocks`);
	if (s.resource) parts.push(`${s.resource} res`);
	return parts.join(' · ');
}

/** Does a block's title/sub contain the (already-lowercased) search term? */
export function matchesSearch(
	node: DocumentBlock,
	term: string,
	config: FileAtlasConfig = DEFAULT_FILE_ATLAS_CONFIG,
	ownerContext?: string,
): boolean {
	if (!term) return true;
	return atlasSearchText(node, config, ownerContext).includes(term);
}

export interface VisibilityResult {
	/** Set of block ids that should render. */
	visible: Set<string>;
	/** Count of visible non-group leaf blocks (for the search hit counter). */
	hits: number;
}

export interface FlattenedAtlasRow {
	block: DocumentBlock;
	/** Structural owners, in document order, retained after hierarchy is flattened. */
	breadcrumb: string;
	ownerContext?: string;
}

/**
 * Project the visible tree into source order without losing structural context.
 * The canonical block tree remains untouched; this is a read-only presentation
 * projection used by File Atlas' explicit flatten control.
 */
export function flattenAtlasRows(
	blocks: DocumentBlock[],
	visible: Set<string>,
	visibleKinds: Set<RawBlockKind>,
	showFrontmatterSummary: boolean,
	config: FileAtlasConfig = DEFAULT_FILE_ATLAS_CONFIG,
): FlattenedAtlasRow[] {
	const rows: FlattenedAtlasRow[] = [];
	const visit = (
		node: DocumentBlock,
		owners: string[],
		ownerContext?: string,
	): void => {
		if (!visible.has(node.id)) return;
		const display = displayIdentity(node, config, { ownerContext });
		const projects = node.kind === Kind.Heading
			|| (node.kind === Kind.Frontmatter && showFrontmatterSummary)
			|| (node.kind === Kind.ListItem
				? visibleKinds.has(Kind.List)
				: visibleKinds.has(node.kind));
		if (projects) {
			rows.push({
				block: node,
				breadcrumb: owners.join(' / '),
				...(ownerContext ? { ownerContext } : {}),
			});
		}
		const nextOwners = isGroupNode(node) ? [...owners, display.primary] : owners;
		const nextOwnerContext = isGroupNode(node) ? display.primary : ownerContext;
		for (const child of node.children ?? []) {
			visit(child, nextOwners, nextOwnerContext);
		}
	};
	for (const block of blocks) visit(block, []);
	return rows.sort((left, right) =>
		left.block.anchor.lineStart - right.block.anchor.lineStart
		|| left.block.anchor.lineEnd - right.block.anchor.lineEnd);
}

/**
 * Compute which blocks render given the visible-kind set and a search term.
 *
 * Rules (spec): group rows (headings + frontmatter) always stay visible unless a
 * search term is active and neither the group nor any descendant matches; a
 * non-group block renders only when its kind is enabled AND (no search OR it
 * matches).
 */
export function computeVisibility(
	blocks: DocumentBlock[],
	visibleKinds: Set<RawBlockKind>,
	searchTerm: string,
	config: FileAtlasConfig = DEFAULT_FILE_ATLAS_CONFIG,
	options: { showFrontmatterSummary?: boolean } = {},
): VisibilityResult {
	const visible = new Set<string>();
	let hits = 0;

	const visit = (node: DocumentBlock, ownerContext?: string): boolean => {
		if (node.detail?.commentOnly) return false;
		if (isGroupNode(node)) {
			let anyChild = false;
			const childOwner = displayIdentity(node, config).primary;
			for (const child of node.children ?? []) {
				if (visit(child, childOwner)) anyChild = true;
			}
			const kindOn =
				node.kind === Kind.Heading ||
				(node.kind === Kind.Frontmatter && Boolean(options.showFrontmatterSummary)) ||
				(node.kind === Kind.ListItem
					? visibleKinds.has(Kind.List)
					: visibleKinds.has(node.kind));
			const selfMatch = matchesSearch(node, searchTerm, config, ownerContext);
			const show = !searchTerm
				? node.kind === Kind.Heading || kindOn || anyChild
				: anyChild || (kindOn && selfMatch);
			if (show) {
				visible.add(node.id);
				if (
					searchTerm &&
					kindOn &&
					selfMatch &&
					(node.kind === Kind.ListItem || node.kind === Kind.Task)
				) {
					hits += 1;
				}
			}
			return show;
		}
		const kindOn =
			node.kind === Kind.ListItem
				? visibleKinds.has(Kind.List)
				: visibleKinds.has(node.kind);
		const show = kindOn && matchesSearch(node, searchTerm, config, ownerContext);
		if (show) {
			visible.add(node.id);
			hits += 1;
		}
		return show;
	};

	blocks.forEach((block) => visit(block));
	return { visible, hits };
}

/** Collect every collapsible structural node in the tree. */
export function collectGroupIds(blocks: DocumentBlock[]): string[] {
	const ids: string[] = [];
	const walk = (list: DocumentBlock[]): void => {
		for (const b of list) {
			if (isGroupNode(b)) ids.push(b.id);
			if (b.children) walk(b.children);
		}
	};
	walk(blocks);
	return ids;
}

/**
 * Resource children should be visible as soon as their owning structural row
 * is revealed. Only intrinsic sections and items that own a nested list start
 * folded; an item does not become default-collapsed merely because it owns a
 * link, tag, image, or embed.
 */
function collectDefaultCollapsedIds(blocks: DocumentBlock[]): string[] {
	const ids: string[] = [];
	const walk = (list: DocumentBlock[]): void => {
		for (const block of list) {
			const ownsNestedList =
				(block.kind === Kind.ListItem || block.kind === Kind.Task) &&
				(block.children ?? []).some((child) => child.kind === Kind.List);
			if (isGroupKind(block.kind) || ownsNestedList) ids.push(block.id);
			if (block.children) walk(block.children);
		}
	};
	walk(blocks);
	return ids;
}

/** Find a block by id anywhere in the tree. */
export function findBlock(blocks: DocumentBlock[], id: string): DocumentBlock | null {
	for (const b of blocks) {
		if (b.id === id) return b;
		if (b.children) {
			const hit = findBlock(b.children, id);
			if (hit) return hit;
		}
	}
	return null;
}

/**
 * The group nodes on the path from the tree root down to `targetId` (excluding
 * the target itself). Drives the default fold: these are the sections that must
 * stay expanded so the current block is reachable.
 */
export function ancestorGroupsOf(blocks: DocumentBlock[], targetId: string): DocumentBlock[] {
	const path: DocumentBlock[] = [];
	const found: DocumentBlock[] = [];
	const visit = (list: DocumentBlock[]): boolean => {
		for (const node of list) {
			if (node.id === targetId) {
				found.push(...path);
				return true;
			}
			if (node.children) {
				const isGroup = isGroupNode(node);
				if (isGroup) path.push(node);
				if (visit(node.children)) return true;
				if (isGroup) path.pop();
			}
		}
		return false;
	};
	visit(blocks);
	return found;
}

/**
 * Default collapsed set: every group folds EXCEPT the ancestor path of
 * `currentId` (and `currentId` itself when it is a group). Matches the mock —
 * only the current level's section is open, everything else summarized.
 */
export function defaultCollapsedIds(blocks: DocumentBlock[], currentId: string | null): Set<string> {
	const collapsed = new Set(collectDefaultCollapsedIds(blocks));
	if (!currentId) return collapsed;
	for (const group of ancestorGroupsOf(blocks, currentId)) collapsed.delete(group.id);
	const current = findBlock(blocks, currentId);
	if (current && isGroupNode(current)) collapsed.delete(current.id);
	return collapsed;
}

/**
 * Deepest block whose 1-based line range contains `line` — used to frame the tree
 * on the editor's cursor position. Recurses into children first so a cursor inside
 * a heading's section resolves to the specific block under it (whose ancestor
 * headings then expand), not the enclosing heading. Returns null if no block owns
 * the line.
 */
export function blockIdAtLine(blocks: DocumentBlock[], line: number): string | null {
	const search = (list: DocumentBlock[]): string | null => {
		for (const b of list) {
			if (line < b.anchor.lineStart || line > b.anchor.lineEnd) continue;
			const child = b.children ? search(b.children) : null;
			return child ?? b.id;
		}
		return null;
	};
	return search(blocks);
}

/** First block worth selecting/framing on open: the first heading, else the first non-group leaf. */
export function firstSelectableId(blocks: DocumentBlock[]): string | null {
	let firstLeaf: string | null = null;
	const visit = (list: DocumentBlock[]): string | null => {
		for (const node of list) {
			if (node.kind === Kind.Heading) return node.id;
			if (!isGroupNode(node) && firstLeaf === null) firstLeaf = node.id;
			if (node.children) {
				const hit = visit(node.children);
				if (hit) return hit;
			}
		}
		return null;
	};
	return visit(blocks) ?? firstLeaf;
}

/**
 * Concatenate a group's own source with every descendant block's source. Drives
 * the heading keyword card: a heading's own line has almost no signal, so we roll
 * up the whole section's prose to compute meaningful term frequencies.
 */
export function sectionText(node: DocumentBlock): string {
	const parts: string[] = [];
	const walk = (b: DocumentBlock): void => {
		if (b.source) parts.push(b.source);
		// List and frontmatter sources already span their descendants. Recursing
		// would double-count every list item/property in metrics and keywords.
		if (b.kind === Kind.List || b.kind === Kind.ListItem || b.kind === Kind.Task || b.kind === Kind.Frontmatter) {
			return;
		}
		for (const child of b.children ?? []) {
			if (child.source && b.source.includes(child.source)) continue;
			walk(child);
		}
	};
	walk(node);
	return parts.join('\n');
}

export interface BlockStatistics {
	words: number;
	characters: number;
	lines: number;
	items?: number;
	tasks?: number;
	checked?: number;
	unchecked?: number;
	rows?: number;
	columns?: number;
	codeLines?: number;
	language?: string;
	status?: string;
	paragraphs?: number;
	resources?: number;
	nestedLists?: number;
}

/** Clean, kind-aware text used by both Keywords and Statistics. */
export function analysisText(node: DocumentBlock): string {
	const raw = node.kind === Kind.Heading ? sectionText(node) : node.source || node.title || '';
	const withoutFences = raw.replace(/^\s*```[^\n]*$/gm, ' ');
	const withoutMarkers = withoutFences
		.replace(/^\s{0,3}(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s*)?/gm, ' ')
		.replace(/^\s*>\s?(?:\[![^\]]+\][+-]?\s*)?/gm, ' ')
		.replace(/!\[\[([^\]]+)\]\]/g, '$1')
		.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2')
		.replace(/\[\[([^\]]+)\]\]/g, '$1')
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 $2')
		.replace(/[#*_`~|]/g, ' ');
	const metadata = ANALYSIS_METADATA_KINDS.has(node.kind)
		? [
			node.title,
			node.detail?.target,
			node.detail?.domain,
			node.detail?.fileTarget,
		].filter(Boolean).join(' ')
		: '';
	return `${withoutMarkers} ${metadata}`.replace(/\s+/g, ' ').trim();
}

function wordCount(text: string): number {
	const Segmenter = (Intl as unknown as {
		Segmenter?: new (
			locales?: string | string[],
			options?: { granularity: 'word' },
		) => { segment(input: string): Iterable<{ isWordLike?: boolean }> };
	}).Segmenter;
	if (Segmenter) {
		const segments = new Segmenter(undefined, { granularity: 'word' }).segment(text);
		let count = 0;
		for (const segment of segments) if (segment.isWordLike) count += 1;
		return count;
	}
	const latin = text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) ?? [];
	const cjk = text.match(/[一-鿿]/g) ?? [];
	return latin.length + cjk.length;
}

/** Deterministic common + kind-specific statistics for an Inspector block. */
export function statisticsOf(node: DocumentBlock): BlockStatistics {
	const text = analysisText(node);
	const taskNodes: DocumentBlock[] = [];
	let listItemCount = 0;
	let paragraphCount = 0;
	let resourceCount = 0;
	let nestedListCount = 0;
	const collectListUnits = (current: DocumentBlock): void => {
		if (current !== node && (current.kind === Kind.ListItem || current.kind === Kind.Task)) {
			listItemCount += 1;
		}
		if (current.kind === Kind.Task) taskNodes.push(current);
		(current.children ?? []).forEach(collectListUnits);
	};
	const collectStructure = (current: DocumentBlock): void => {
		if (current !== node && current.kind === Kind.Paragraph) paragraphCount += 1;
		if (current !== node && STAT_RESOURCE_KINDS.has(current.kind)) resourceCount += 1;
		if (current !== node && current.kind === Kind.List) nestedListCount += 1;
		(current.children ?? []).forEach(collectStructure);
	};
	collectStructure(node);
	if (node.kind === Kind.List) collectListUnits(node);
	const checked = taskNodes.filter((task) => task.detail?.checked === true).length;
	const unchecked = taskNodes.filter((task) => task.detail?.checked === false).length;
	const result: BlockStatistics = {
		words: wordCount(text),
		characters: Array.from(text.replace(/\s/g, '')).length,
		lines: node.kind === Kind.Heading
			? Math.max(0, node.anchor.lineEnd - node.anchor.lineStart + 1)
			: node.source
				? node.source.split(/\r?\n/).length
				: 0,
	};
	if (node.kind === Kind.List) {
		result.items = listItemCount > 0
			? listItemCount
			: node.detail?.itemCount ?? node.children?.length ?? 0;
		result.tasks = taskNodes.length;
		result.checked = checked;
		result.unchecked = unchecked;
		result.nestedLists = nestedListCount;
	}
	if (node.kind === Kind.Heading) {
		result.paragraphs = paragraphCount;
		result.resources = resourceCount;
	}
	if (node.kind === Kind.Callout) {
		result.paragraphs = node.source
			.split(/\r?\n/)
			.slice(1)
			.filter((line) => line.replace(/^>\s?/, '').trim().length > 0)
			.length;
		result.resources = resourceCount;
	}
	if (node.kind === Kind.Table) {
		result.rows = node.detail?.rows;
		result.columns = node.detail?.columns;
	}
	if (node.kind === Kind.Code || node.kind === Kind.Mermaid) {
		result.codeLines = node.detail?.lineCount;
		result.language = node.detail?.language ?? (node.kind === Kind.Mermaid ? 'mermaid' : undefined);
	}
	if (node.kind === Kind.Task) result.status = node.detail?.checked ? 'Checked' : 'Unchecked';
	return result;
}

/**
 * Naive term-frequency keywords for a block's text — a deterministic stand-in
 * for the real indexer (spec: "keywords computed by program"). Latin words plus
 * CJK bigrams, stopwords dropped, ranked by count then length. Returns up to
 * `limit` `[word, count]` pairs.
 */
export function keywordsOf(
	text: string,
	stopwords: KeywordStopwords,
	limit = 8
): Array<[string, number]> {
	const stopLatin = new Set(stopwords.latin);
	const stopCjk = new Set(stopwords.cjk);
	const counts = new Map<string, number>();
	const bump = (word: string): void => {
		counts.set(word, (counts.get(word) ?? 0) + 1);
	};

	const latin = String(text).toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) ?? [];
	for (const word of latin) if (!stopLatin.has(word)) bump(word);

	const cjkRuns = String(text).match(/[一-鿿]+/g) ?? [];
	for (const run of cjkRuns) {
		for (let i = 0; i < run.length - 1; i += 1) {
			const bigram = run.slice(i, i + 2);
			if (!stopCjk.has(bigram)) bump(bigram);
		}
	}

	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
		.slice(0, limit);
}
