import type { DocumentBlock } from '@/core/document/atlas/types';
import { RawBlockKind as Kind } from '@/core/document/atlas/types';
import type { AtlasCopilotSuggestion, AtlasQuickAction } from './FileAtlasHostPort';

const RESOURCE_KINDS = new Set<DocumentBlock['kind']>([
	Kind.Image,
	Kind.Embed,
	Kind.Attachment,
	Kind.Footnote,
	Kind.VaultLink,
	Kind.ExternalLink,
]);

export interface AtlasElementContext {
	breadcrumb: DocumentBlock[];
	parent: DocumentBlock | null;
	section: DocumentBlock | null;
	nearby: DocumentBlock[];
	children: DocumentBlock[];
	resources: DocumentBlock[];
}

export interface AtlasCopilotSuggestionGroups {
	selection: AtlasCopilotSuggestion[];
	section: AtlasCopilotSuggestion[];
	document: AtlasCopilotSuggestion[];
}

/** Keep resource rows scoped to actions that actually operate on that resource. */
export function filterAtlasQuickActions(
	actions: AtlasQuickAction[],
	kind: DocumentBlock['kind'],
): AtlasQuickAction[] {
	if (kind !== Kind.VaultLink && kind !== Kind.ExternalLink) return actions;
	return actions.filter((action) => action.capabilityId.startsWith('composer.link.'));
}

/**
 * Flatten structural list containers into compact, one-line preview rows while
 * excluding extracted resources that would repeat their owning prose/list item.
 */
export interface AtlasStructuredPreviewRow {
	block: DocumentBlock;
	depth: number;
}

export function compactStructuredPreviewRows(root: DocumentBlock): AtlasStructuredPreviewRow[] {
	const rows: AtlasStructuredPreviewRow[] = [];
	const visit = (block: DocumentBlock, depth: number): void => {
		if (RESOURCE_KINDS.has(block.kind)) return;
		if (block.kind === Kind.List) {
			for (const child of block.children ?? []) visit(child, depth);
			return;
		}
		rows.push({ block, depth });
		if (block.kind !== Kind.ListItem && block.kind !== Kind.Task) return;
		for (const child of block.children ?? []) {
			if (
				child.kind === Kind.List ||
				child.kind === Kind.ListItem ||
				child.kind === Kind.Task
			) {
				visit(child, depth + 1);
			}
		}
	};
	if (root.kind === Kind.ListItem || root.kind === Kind.Task) {
		visit(root, 0);
		return rows;
	}
	for (const child of root.children ?? []) visit(child, 0);
	return rows;
}

interface LocatedBlock {
	block: DocumentBlock;
	depth: number;
}

/** Build the focused structural context used by the Inspector's navigation board. */
export function buildAtlasElementContext(
	blocks: DocumentBlock[],
	selectedId: string,
): AtlasElementContext {
	const path: DocumentBlock[] = [];
	let selectedPath: DocumentBlock[] = [];
	let selectedSiblings: DocumentBlock[] = [];
	const visit = (siblings: DocumentBlock[]): boolean => {
		for (const block of siblings) {
			path.push(block);
			if (block.id === selectedId) {
				selectedPath = [...path];
				selectedSiblings = siblings;
				path.pop();
				return true;
			}
			if (block.children && visit(block.children)) {
				path.pop();
				return true;
			}
			path.pop();
		}
		return false;
	};
	visit(blocks);

	const selected = selectedPath[selectedPath.length - 1] ?? null;
	const ancestors = selectedPath.slice(0, -1);
	const parent = ancestors[ancestors.length - 1] ?? null;
	const section = [...selectedPath]
		.reverse()
		.find((block) => block.kind === Kind.Heading) ?? null;
	const selectedIndex = selected
		? selectedSiblings.findIndex((candidate) => candidate.id === selected.id)
		: -1;
	const nearby = selectedIndex < 0
		? []
		: selectedSiblings
			.slice(Math.max(0, selectedIndex - 2), selectedIndex + 3)
			.filter((candidate) => candidate.id !== selected?.id);
	const children = selected?.children ?? [];
	const selectedResources = selected && !RESOURCE_KINDS.has(selected.kind)
		? collectResources(selected)
		: [];
	const resources = selectedResources.length > 0
		? selectedResources
		: collectResources(section).filter((candidate) => candidate.id !== selected?.id);

	return {
		breadcrumb: selectedPath,
		parent,
		section,
		nearby,
		children,
		resources,
	};
}

/** Group one document-level finding snapshot without starting another runtime. */
export function groupAtlasCopilotSuggestions(
	suggestions: AtlasCopilotSuggestion[],
	selected: DocumentBlock,
	section: DocumentBlock | null,
): AtlasCopilotSuggestionGroups {
	const selectionRange = ownBlockRange(selected);
	const sectionRange = section ? blockRange(section) : null;
	const selection: AtlasCopilotSuggestion[] = [];
	const sectionSuggestions: AtlasCopilotSuggestion[] = [];
	const document: AtlasCopilotSuggestion[] = [];

	for (const suggestion of suggestions) {
		const range = suggestionRange(suggestion);
		if (
			suggestion.targetBlockId === selected.id ||
			(range && overlaps(range, selectionRange))
		) {
			selection.push(suggestion);
			continue;
		}
		if (range && sectionRange && overlaps(range, sectionRange)) {
			sectionSuggestions.push(suggestion);
			continue;
		}
		document.push(suggestion);
	}

	return {
		selection,
		section: sectionSuggestions,
		document,
	};
}

/** Resolve a Composer finding range back to the most specific Atlas tree row. */
export function atlasBlockForSuggestion(
	blocks: DocumentBlock[],
	suggestion: AtlasCopilotSuggestion,
): DocumentBlock | null {
	const located = flattenLocatedBlocks(blocks);
	const exactId = suggestion.targetBlockId
		? located.find(({ block }) => block.id === suggestion.targetBlockId)?.block
		: undefined;
	if (exactId) return exactId;

	const range = suggestionRange(suggestion);
	if (!range) return null;
	const candidates = located.filter(({ block }) => overlaps(blockRange(block), range));
	if (candidates.length === 0) return null;
	return candidates.sort((left, right) => {
		const leftSpan = rangeSpan(blockRange(left.block));
		const rightSpan = rangeSpan(blockRange(right.block));
		return leftSpan - rightSpan || right.depth - left.depth;
	})[0]?.block ?? null;
}

export function atlasScopeKind(block: DocumentBlock): 'section' | 'item' | 'resource' | 'block' {
	if (block.kind === Kind.Heading || block.kind === Kind.List) return 'section';
	if (block.kind === Kind.ListItem || block.kind === Kind.Task) return 'item';
	if (RESOURCE_KINDS.has(block.kind)) return 'resource';
	return 'block';
}

function collectResources(root: DocumentBlock | null): DocumentBlock[] {
	if (!root) return [];
	const resources: DocumentBlock[] = [];
	const visit = (block: DocumentBlock): void => {
		if (RESOURCE_KINDS.has(block.kind)) resources.push(block);
		for (const child of block.children ?? []) visit(child);
	};
	visit(root);
	return resources;
}

function blockRange(block: DocumentBlock): { from: number; to: number } {
	let { from, to } = ownBlockRange(block);
	const visit = (candidate: DocumentBlock): void => {
		from = Math.min(from, candidate.anchor.sourceFrom ?? from);
		to = Math.max(to, candidate.anchor.sourceTo ?? to);
		for (const child of candidate.children ?? []) visit(child);
	};
	visit(block);
	return { from, to };
}

function ownBlockRange(block: DocumentBlock): { from: number; to: number } {
	const from = block.anchor.sourceFrom ?? 0;
	return { from, to: block.anchor.sourceTo ?? from };
}

function suggestionRange(
	suggestion: AtlasCopilotSuggestion,
): { from: number; to: number } | null {
	if (suggestion.targetFrom === null || suggestion.targetTo === null) return null;
	return {
		from: suggestion.targetFrom,
		to: suggestion.targetTo,
	};
}

function overlaps(
	left: { from: number; to: number },
	right: { from: number; to: number },
): boolean {
	return left.to > right.from && left.from < right.to;
}

function rangeSpan(range: { from: number; to: number }): number {
	return Math.max(0, range.to - range.from);
}

function flattenLocatedBlocks(blocks: DocumentBlock[]): LocatedBlock[] {
	const located: LocatedBlock[] = [];
	const visit = (list: DocumentBlock[], depth: number): void => {
		for (const block of list) {
			located.push({ block, depth });
			if (block.children) visit(block.children, depth + 1);
		}
	};
	visit(blocks, 0);
	return located;
}
