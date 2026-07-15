/**
 * File Atlas — tree view-model helpers (Phase 1).
 *
 * Pure functions over the parsed {@link DocumentBlock} tree: visibility
 * computation (preset kinds × search term, headings always visible), collapsed
 * count summaries, and flattening. No React, no side effects.
 */

import type { DocumentBlock, RawBlockKind } from '@/core/document/atlas/types';
import { RawBlockKind as Kind } from '@/core/document/atlas/types';
import type { KindConfig } from './config/fileAtlasConfig';

export interface CountSummary {
	block: number;
	resource: number;
}

/** Count descendants of a heading by category (for the collapsed summary). */
export function countDescendants(
	node: DocumentBlock,
	kinds: Record<string, KindConfig>
): CountSummary {
	const sum: CountSummary = { block: 0, resource: 0 };
	const walk = (child: DocumentBlock): void => {
		if (child.kind === Kind.Heading) {
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

/** "3 blocks · 2 res" summary shown on a collapsed heading row. */
export function foldSummary(node: DocumentBlock, kinds: Record<string, KindConfig>): string {
	const s = countDescendants(node, kinds);
	const parts: string[] = [];
	if (s.block) parts.push(`${s.block} blocks`);
	if (s.resource) parts.push(`${s.resource} res`);
	return parts.join(' · ');
}

/** Does a block's title/sub contain the (already-lowercased) search term? */
export function matchesSearch(node: DocumentBlock, term: string): boolean {
	if (!term) return true;
	return `${node.title} ${node.sub ?? ''}`.toLowerCase().includes(term);
}

export interface VisibilityResult {
	/** Set of block ids that should render. */
	visible: Set<string>;
	/** Count of visible non-heading leaf blocks (for the search hit counter). */
	hits: number;
}

/**
 * Compute which blocks render given the visible-kind set and a search term.
 *
 * Rules (spec): headings always stay visible unless a search term is active and
 * neither the heading nor any descendant matches; a non-heading block renders
 * only when its kind is enabled AND (no search OR it matches).
 */
export function computeVisibility(
	blocks: DocumentBlock[],
	visibleKinds: Set<RawBlockKind>,
	searchTerm: string
): VisibilityResult {
	const visible = new Set<string>();
	let hits = 0;

	const visit = (node: DocumentBlock): boolean => {
		if (node.kind === Kind.Heading) {
			let anyChild = false;
			for (const child of node.children ?? []) {
				if (visit(child)) anyChild = true;
			}
			const selfMatch = matchesSearch(node, searchTerm);
			const show = !searchTerm ? true : anyChild || selfMatch;
			if (show) visible.add(node.id);
			return show;
		}
		const kindOn = visibleKinds.has(node.kind);
		const show = kindOn && matchesSearch(node, searchTerm);
		if (show) {
			visible.add(node.id);
			hits += 1;
		}
		return show;
	};

	blocks.forEach(visit);
	return { visible, hits };
}

/** Collect every heading id in the tree (for expand/collapse-all). */
export function collectHeadingIds(blocks: DocumentBlock[]): string[] {
	const ids: string[] = [];
	const walk = (list: DocumentBlock[]): void => {
		for (const b of list) {
			if (b.kind === Kind.Heading) ids.push(b.id);
			if (b.children) walk(b.children);
		}
	};
	walk(blocks);
	return ids;
}
