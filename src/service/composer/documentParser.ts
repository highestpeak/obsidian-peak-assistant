/**
 * Peak Composer — Markdown → source snapshot parser (WP1, locked S1 route).
 *
 * Strategy (WP0 gate, locked): use the mdast tree ONLY to derive top-level
 * block boundaries (exact byte offsets via `node.position.*.offset`). Block
 * CONTENT is always the verbatim byte slice `sourceText.slice(from,to)` — we
 * never re-serialize. Round-trip is therefore a splice, and any syntax the
 * parser does not "understand" (nested callouts, `%%comments%%`, dataview,
 * mermaid, excalidraw embeds, raw HTML, escaped-pipe tables) survives verbatim
 * by construction.
 *
 * Parser stack: the project's declared `remark` + `remark-frontmatter` +
 * `remark-gfm` (already bundled; used by `documentBlockParser.ts`). remark
 * wraps `mdast-util-from-markdown`, so every node carries UTF-16 `offset`s.
 * Obsidian-specific constructs (callout / `%%comment%%` / dataview / mermaid)
 * are handled by a thin post-classification pass over the same nodes — the
 * exact pattern `documentBlockParser.ts` established. No new dependency, and
 * `mdast-util-to-markdown` is deliberately NOT used.
 *
 * Sub-block units (list items / table cells / callout bodies) are extracted
 * with their own offsets so WP4/WP6 can address and patch a single unit.
 */

import type { Root, RootContent } from 'mdast';
import { remark } from 'remark';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import {
	computeFingerprint,
	computeRevision,
	makeBlockId,
	makeUnitId,
	type ComposerBlock,
	type ComposerBlockKind,
	type ComposerDocumentSnapshot,
	type ComposerNativeKind,
	type ComposerNativeRef,
	type ComposerRenderModel,
	type ComposerSubBlockAnchor,
	type SourceAnchor,
} from '@/core/composer';

const processor = remark().use(remarkFrontmatter, ['yaml']).use(remarkGfm);

/** Extensions that classify an embed/image target as a native object kind. */
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'avif'];
const NATIVE_EXT_KIND: Record<string, ComposerNativeKind> = {
	base: 'base',
	canvas: 'canvas',
	excalidraw: 'excalidraw',
};
const ATTACHMENT_EXTS = ['pdf', 'docx', 'pptx', 'xlsx', 'zip', 'mp3', 'mp4', 'mov', 'wav'];

interface ParseOptions {
	filePath?: string;
	/** Revision id to stamp on every anchor. Defaults to a content hash. */
	revision?: string;
}

/**
 * Parse Markdown into an immutable {@link ComposerDocumentSnapshot}. The block
 * list is document-order and flat; `reconstruct()` on the result is guaranteed
 * byte-identical to `sourceText`.
 */
export function parseComposerDocument(
	sourceText: string,
	options: ParseOptions = {},
): ComposerDocumentSnapshot {
	const filePath = options.filePath ?? '';
	const revision = options.revision ?? computeRevision(sourceText);
	const tree = safeParse(sourceText);

	const blocks: ComposerBlock[] = [];
	const nativeRefs: ComposerNativeRef[] = [];

	let ordinal = 0;
	for (const node of tree.children) {
		const from = node.position?.start.offset ?? 0;
		const to = node.position?.end.offset ?? from;
		const raw = sourceText.slice(from, to);
		const kind = classifyKind(node, raw);
		const fingerprint = computeFingerprint(raw);
		const blockId = makeBlockId(kind, ordinal, fingerprint);
		const source: SourceAnchor = { revision, from, to, semanticFingerprint: fingerprint };

		blocks.push({
			blockId,
			kind,
			source,
			children: [],
			units: extractUnits(node, kind, sourceText, revision),
			renderModel: buildRenderModel(node, kind, raw),
		});

		collectNativeRefs(blockId, raw, from, revision, nativeRefs);
		ordinal += 1;
	}

	return { documentId: filePath || 'doc', filePath, revision, sourceText, blocks, nativeRefs };
}

/**
 * Losslessly rebuild the full source text from a snapshot by walking block
 * ranges and re-inserting the inter-block gaps. If this is NOT byte-identical
 * to the original, the block index has dropped or reordered bytes — the WP1
 * round-trip test asserts equality on the 8 golden fixtures.
 */
export function reconstruct(snapshot: ComposerDocumentSnapshot): string {
	const { sourceText, blocks } = snapshot;
	let cursor = 0;
	let out = '';
	for (const b of blocks) {
		out += sourceText.slice(cursor, b.source.from); // gap before block
		out += sourceText.slice(b.source.from, b.source.to); // block bytes
		cursor = b.source.to;
	}
	out += sourceText.slice(cursor); // trailing gap
	return out;
}

// ──────────────────────────────────────────────────────────────────────────
// classification
// ──────────────────────────────────────────────────────────────────────────

function classifyKind(node: RootContent, raw: string): ComposerBlockKind {
	switch (node.type) {
		case 'yaml':
			return 'frontmatter';
		case 'heading':
			return 'heading';
		case 'thematicBreak':
			return 'divider';
		case 'table':
			return 'table';
		case 'footnoteDefinition':
			return 'footnote-def';
		case 'html':
			return 'html';
		case 'code': {
			const lang = ((node as { lang?: string }).lang ?? '').toLowerCase();
			if (lang === 'mermaid') return 'mermaid';
			if (lang === 'dataview' || lang === 'dataviewjs') return 'dataview';
			return 'code';
		}
		case 'blockquote':
			// Callout = blockquote whose first line is `> [!type]`.
			return /^>\s*\[!/.test(raw) ? 'callout' : 'quote';
		case 'list':
			// Task list = list whose first item carries a checkbox.
			return listHasCheckbox(node) ? 'task' : 'list';
		case 'paragraph': {
			// remark-gfm emits no math node, so display math `$$…$$` and Obsidian
			// `%%comment%%` both arrive as paragraphs; reclassify by shape. Byte
			// content is preserved regardless of the label.
			const trimmed = raw.trim();
			if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4) return 'math';
			if (/^%%/.test(trimmed) && /%%$/.test(trimmed)) return 'comment';
			if (isBareEmbed(trimmed)) return 'embed';
			if (isBareImage(trimmed)) return 'image';
			return 'paragraph';
		}
		default:
			// Anything mdast produced that we do not model → verbatim fallback.
			return 'unknown';
	}
}

function listHasCheckbox(node: RootContent): boolean {
	const items = (node as { children?: Array<{ checked?: unknown }> }).children ?? [];
	return items.some((it) => typeof it.checked === 'boolean');
}

function isBareEmbed(raw: string): boolean {
	return /^!\[\[[^\]]+\]\]$/.test(raw);
}

function isBareImage(raw: string): boolean {
	return /^!\[[^\]]*\]\([^)]+\)$/.test(raw);
}

// ──────────────────────────────────────────────────────────────────────────
// render model
// ──────────────────────────────────────────────────────────────────────────

function buildRenderModel(node: RootContent, kind: ComposerBlockKind, raw: string): ComposerRenderModel {
	const model: ComposerRenderModel = { raw, text: firstMeaningfulLine(raw) };
	if (kind === 'heading') {
		model.level = (node as { depth?: number }).depth ?? 1;
		model.text = raw.replace(/^#+\s*/, '').trim();
		return model;
	}
	if (kind === 'code' || kind === 'dataview' || kind === 'mermaid') {
		model.language = ((node as { lang?: string }).lang ?? '').toLowerCase() || undefined;
		return model;
	}
	if (kind === 'callout') {
		const m = raw.match(/^>\s*\[!([\w-]+)\]/);
		model.calloutType = m ? m[1].toLowerCase() : undefined;
		return model;
	}
	if (kind === 'list' || kind === 'task') {
		const items = (node as { children?: unknown[]; ordered?: boolean }).children ?? [];
		model.ordered = Boolean((node as { ordered?: boolean }).ordered);
		model.itemCount = items.length;
		const firstChecked = (items[0] as { checked?: boolean | null } | undefined)?.checked;
		model.checked = typeof firstChecked === 'boolean' ? firstChecked : null;
		return model;
	}
	if (kind === 'table') {
		const rows = (node as { children?: unknown[] }).children ?? [];
		const columns = (rows[0] as { children?: unknown[] } | undefined)?.children?.length ?? 0;
		model.rows = Math.max(0, rows.length - 1);
		model.columns = columns;
		return model;
	}
	return model;
}

// ──────────────────────────────────────────────────────────────────────────
// sub-block units
// ──────────────────────────────────────────────────────────────────────────

function extractUnits(
	node: RootContent,
	kind: ComposerBlockKind,
	sourceText: string,
	revision: string,
): ComposerSubBlockAnchor[] {
	if (kind === 'list' || kind === 'task') return listUnits(node, sourceText, revision);
	if (kind === 'table') return tableUnits(node, sourceText, revision);
	if (kind === 'callout' || kind === 'quote') return calloutBodyUnits(node, sourceText, revision);
	return [];
}

function anchorFor(
	sourceText: string,
	revision: string,
	position: { start?: { offset?: number }; end?: { offset?: number } } | undefined,
): Pick<ComposerSubBlockAnchor, 'from' | 'to' | 'fingerprint'> | null {
	const from = position?.start?.offset;
	const to = position?.end?.offset;
	if (typeof from !== 'number' || typeof to !== 'number') return null;
	return { from, to, fingerprint: computeFingerprint(sourceText.slice(from, to)) };
}

function listUnits(node: RootContent, sourceText: string, revision: string): ComposerSubBlockAnchor[] {
	const out: ComposerSubBlockAnchor[] = [];
	const walk = (items: any[], prefix: string, parentUnitId?: string): void => {
		items.forEach((item, i) => {
			const base = anchorFor(sourceText, revision, item.position);
			if (!base) return;
			const unitId = makeUnitId(prefix, i);
			out.push({ unitId, unitKind: 'list-item', parentUnitId, ...base });
			// Recurse into a nested list inside this item.
			const nested = (item.children ?? []).find((c: any) => c?.type === 'list');
			if (nested?.children) walk(nested.children, unitId, unitId);
		});
	};
	walk((node as { children?: any[] }).children ?? [], 'li');
	return out;
}

function tableUnits(node: RootContent, sourceText: string, revision: string): ComposerSubBlockAnchor[] {
	const out: ComposerSubBlockAnchor[] = [];
	const rows = (node as { children?: any[] }).children ?? [];
	rows.forEach((row, r) => {
		const rowAnchor = anchorFor(sourceText, revision, row.position);
		if (rowAnchor) {
			out.push({ unitId: makeUnitId('row', r), unitKind: 'table-row', row: r, isHeader: r === 0, ...rowAnchor });
		}
		const cells = (row.children ?? []) as any[];
		cells.forEach((cell, c) => {
			const cellAnchor = anchorFor(sourceText, revision, cell.position);
			if (!cellAnchor) return;
			out.push({
				unitId: makeUnitId('cell', `r${r}c${c}`),
				unitKind: 'table-cell',
				row: r,
				col: c,
				isHeader: r === 0,
				...cellAnchor,
			});
		});
	});
	return out;
}

function calloutBodyUnits(node: RootContent, sourceText: string, revision: string): ComposerSubBlockAnchor[] {
	const out: ComposerSubBlockAnchor[] = [];
	const children = (node as { children?: any[] }).children ?? [];
	children.forEach((child, i) => {
		const base = anchorFor(sourceText, revision, child.position);
		if (!base) return;
		out.push({ unitId: makeUnitId('body', i), unitKind: 'callout-body', ...base });
	});
	return out;
}

// ──────────────────────────────────────────────────────────────────────────
// native refs (images / embeds / .base / .canvas / .excalidraw)
// ──────────────────────────────────────────────────────────────────────────

const EMBED_RE = /!\[\[([^\]]+)\]\]/g;
const MD_IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g;

function collectNativeRefs(
	blockId: string,
	raw: string,
	blockFrom: number,
	revision: string,
	out: ComposerNativeRef[],
): void {
	for (const m of raw.matchAll(EMBED_RE)) {
		const target = m[1].split('|')[0].trim();
		pushRef(out, blockId, classifyEmbed(target), target, blockFrom + m.index!, m[0], revision);
	}
	for (const m of raw.matchAll(MD_IMAGE_RE)) {
		const target = m[1];
		pushRef(out, blockId, classifyEmbed(target), target, blockFrom + m.index!, m[0], revision);
	}
}

function pushRef(
	out: ComposerNativeRef[],
	blockId: string,
	kind: ComposerNativeKind,
	target: string,
	from: number,
	token: string,
	revision: string,
): void {
	const to = from + token.length;
	out.push({
		refId: `${blockId}:ref${out.length}`,
		blockId,
		kind,
		target,
		source: { revision, from, to, semanticFingerprint: computeFingerprint(token) },
	});
}

function classifyEmbed(target: string): ComposerNativeKind {
	const ext = target.split('#')[0].split('.').pop()?.toLowerCase() ?? '';
	if (NATIVE_EXT_KIND[ext]) return NATIVE_EXT_KIND[ext];
	if (IMAGE_EXTS.includes(ext)) return 'image';
	if (ATTACHMENT_EXTS.includes(ext)) return 'attachment';
	if (/^https?:\/\//.test(target)) return 'image';
	return 'embed';
}

// ──────────────────────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────────────────────

function safeParse(content: string): Root {
	const tree = processor.parse(content) as Root;
	if (!tree || !Array.isArray(tree.children)) return { type: 'root', children: [] };
	return tree;
}

function firstMeaningfulLine(raw: string): string {
	const line = raw
		.split(/\r?\n/)
		.map((l) => l.replace(/^[>#\s|*_+-]+/, '').trim())
		.find((l) => l.length > 0);
	return (line ?? '').replace(/[|*_`]/g, '').trim();
}
