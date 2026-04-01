/**
 * Renders backbone map markdown (folder tree + highways).
 */

import { normalizeVaultPath } from '@/core/utils/vault-path-utils';
import type { BackboneEdge, BackboneFolderNode, BackbonePage, BackboneVirtualNode } from './types';

type HighwayBlock = { sortKey: string; lines: string[] };

/**
 * Renders backbone edges: reciprocal pairs as `<==>`; same-source fan-out with aligned `==>` and `: label` on each line.
 */
function buildHighwayBodyLines(edgesOrdered: BackboneEdge[]): string[] {
	const byTriple = new Map<string, BackboneEdge>();
	for (const e of edgesOrdered) {
		byTriple.set(`${e.fromId}\0${e.toId}\0${e.label}`, e);
	}

	const consumed = new Set<string>();
	const reciprocalRows: Array<{ left: string; right: string; label: string; sortKey: string }> = [];

	for (const e of edgesOrdered) {
		if (consumed.has(e.id)) continue;
		const rev = byTriple.get(`${e.toId}\0${e.fromId}\0${e.label}`);
		if (rev && rev.id !== e.id) {
			const left = e.fromId.localeCompare(e.toId) <= 0 ? e.fromId : e.toId;
			const right = e.fromId.localeCompare(e.toId) <= 0 ? e.toId : e.fromId;
			const sortKey = `${left}\0${right}\0${e.label}`;
			reciprocalRows.push({
				left,
				right,
				label: e.label,
				sortKey,
			});
			consumed.add(e.id);
			consumed.add(rev.id);
		}
	}

	const remaining: BackboneEdge[] = [];
	for (const e of edgesOrdered) {
		if (!consumed.has(e.id)) remaining.push(e);
	}

	const byFrom = new Map<string, BackboneEdge[]>();
	for (const e of remaining) {
		const arr = byFrom.get(e.fromId) ?? [];
		arr.push(e);
		byFrom.set(e.fromId, arr);
	}
	for (const arr of byFrom.values()) {
		arr.sort((a, b) => {
			if (b.weight !== a.weight) return b.weight - a.weight;
			return a.toId.localeCompare(b.toId);
		});
	}

	const blocks: HighwayBlock[] = [];

	for (const r of reciprocalRows.sort((a, b) => a.sortKey.localeCompare(b.sortKey))) {
		blocks.push({
			sortKey: r.sortKey,
			lines: [`[${r.left}] <==> [${r.right}] : ${r.label}`],
		});
	}

	for (const fromId of [...byFrom.keys()].sort((a, b) => a.localeCompare(b))) {
		const arr = byFrom.get(fromId)!;
		const lines: string[] = [];
		if (arr.length === 1) {
			const e = arr[0]!;
			lines.push(`[${e.fromId}] ==> [${e.toId}] : ${e.label}`);
		} else {
			lines.push(`[${fromId}] ==> [${arr[0]!.toId}] : ${arr[0]!.label}`);
			const pad = ' '.repeat(`[${fromId}] `.length);
			for (let i = 1; i < arr.length; i++) {
				lines.push(`${pad}==> [${arr[i]!.toId}] : ${arr[i]!.label}`);
			}
		}
		blocks.push({
			sortKey: `${fromId}\0fan`,
			lines,
		});
	}

	blocks.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

	const out: string[] = [];
	for (let i = 0; i < blocks.length; i++) {
		if (i > 0) out.push('');
		out.push(...blocks[i]!.lines);
	}
	return out;
}

function purityTier(p: number): string {
	if (p >= 0.5) return 'High';
	if (p >= 0.28) return 'Med';
	return 'Low';
}

const safeCell = (s: string) => s.replace(/\|/g, ' ');

/**
 * Keywords column: child-folder name tokens (`sub:`) + direct-file keyword tags (`kw:`).
 * Topics column: direct-file topic tags only (see digestLoader).
 */
function keywordsStatsColumn(f: BackboneFolderNode): string {
	const kw = f.topKeywords.slice(0, 8).map(safeCell).filter(Boolean).join(', ');
	if (f.childFolderCount > 0 && f.subfolderNameTokenSample.length > 0) {
		const sub = f.subfolderNameTokenSample.slice(0, 8).map(safeCell).join(', ');
		if (kw) return `sub:${sub} | kw:${kw}`;
		return `sub:${sub}`;
	}
	return kw || '—';
}

function topicsStatsColumn(f: BackboneFolderNode): string {
	const t = f.topTopicsWeighted.trim() || f.topTopics.slice(0, 4).join(', ');
	return t ? safeCell(t) : '—';
}

function statsCell(f: BackboneFolderNode): string {
	const dt = `${f.directDocCount}/${f.docCount}`;
	const pur = `${f.topicPurity.toFixed(2)} (${purityTier(f.topicPurity)})`;
	return `<| ${dt} | ${pur} | ${f.childFolderCount} | ${f.docOutgoing} | ${keywordsStatsColumn(f)} | ${topicsStatsColumn(f)} |>`;
}

/** Same grid as {@link statsCell}: cluster vs parent's direct layer, topic purity, no subfolders, sum of members' doc-outgoing. */
function virtualStatsCell(v: BackboneVirtualNode): string {
	const dt = `${v.memberCount}/${v.parentDirectDocCount}`;
	const pur = `${v.topicPurity.toFixed(2)} (${purityTier(v.topicPurity)})`;
	const kw = v.topKeywords.slice(0, 8).map(safeCell).filter(Boolean).join(', ') || '—';
	const topics = v.topTopicsWeighted.trim() || v.topTopics.slice(0, 4).map(safeCell).join(', ');
	const tcol = topics ? safeCell(topics) : '—';
	return `<| ${dt} | ${pur} | 0 | ${v.docOutgoing} | ${kw} | ${tcol} |>`;
}

function folderLine(
	f: BackboneFolderNode,
	endpointIds: Set<string>,
): string {
	const indent = '  '.repeat(Math.max(0, f.depth - 1));
	const name = f.displayName.endsWith('/') ? f.displayName.slice(0, -1) : f.displayName;
	const bold = f.isCity ? `**${name}/**` : `${name}/`;
	const hi = endpointIds.has(f.id) ? ' `[==>]`' : '';
	return `${indent}${f.id} ${bold} ${statsCell(f)}${hi}`;
}

function virtualLine(v: BackboneVirtualNode, depth: number, endpointIds: Set<string>): string {
	const indent = '  '.repeat(Math.max(0, depth));
	const name = v.displayName.endsWith('/') ? v.displayName.slice(0, -1) : v.displayName;
	const bold = `**${name}/**`;
	const hi = endpointIds.has(v.id) ? ' `[==>]`' : '';
	return `${indent}${v.id} ${bold} ${virtualStatsCell(v)}${hi}`;
}

/**
 * Sorts edges for reading: group by source id (all outgoing from F-062 together), then by weight desc, then target id.
 * Each edge still appears exactly once.
 */
function sortBackboneEdgesForDisplay(edges: BackboneEdge[]): BackboneEdge[] {
	return [...edges].sort((a, b) => {
		const from = a.fromId.localeCompare(b.fromId);
		if (from !== 0) return from;
		if (b.weight !== a.weight) return b.weight - a.weight;
		return a.toId.localeCompare(b.toId);
	});
}

/** Explains the `<| … |>` stats grid and optional `[==>]` marker (English; matches digestLoader). */
function folderTreeColumnLegendLines(): string[] {
	return [
		'## Column legend (stats grid)',
		'',
		'`<| direct/total | topic purity (tier) | subfolders | doc-out | keywords | topics |>`',
		'',
		'- **direct/total** — Notes directly in this folder / all indexed notes in this folder subtree (recursive).',
		'- **topic purity (tier)** — Herfindahl concentration on **topic** tags of direct files only; tier High / Med / Low.',
		'- **subfolders** — Immediate child folder count (always **0** on `V-###` virtual rows).',
		'- **doc-out** — Outgoing wiki-style doc links: materialized on the folder node, or summed over member notes for virtual rows.',
		'- **keywords** — `sub:` tokens from immediate child folder names; `kw:` keyword tags from direct files (after global de-noising).',
		'- **topics** — Topic tags from direct files; may show weighted `name(%)` when available.',
		'- **`[==>]`** — This `F-###` or `V-###` is an endpoint of at least one High-Speed Link in the section below.',
		'',
	];
}

/**
 * Renders full markdown and paginated folder-tree sections.
 */
export function renderBackboneMarkdown(options: {
	folderNodes: BackboneFolderNode[];
	virtualNodes: BackboneVirtualNode[];
	backboneEdges: BackboneEdge[];
	maxNodesPerPage: number;
	/** Tags stripped from per-row kw/topics; shown once under the tree header. */
	noiseTagLegendLines?: string[];
}): { markdown: string; pages: BackbonePage[] } {
	const { folderNodes, virtualNodes, backboneEdges, maxNodesPerPage, noiseTagLegendLines = [] } = options;

	const edgesOrdered = sortBackboneEdgesForDisplay(backboneEdges);

	const endpointIds = new Set<string>();
	for (const e of edgesOrdered) {
		endpointIds.add(e.fromId);
		endpointIds.add(e.toId);
	}

	const virtualByParent = new Map<string, BackboneVirtualNode[]>();
	for (const v of virtualNodes) {
		const p = normalizeVaultPath(v.parentFolderPath);
		const arr = virtualByParent.get(p) ?? [];
		arr.push(v);
		virtualByParent.set(p, arr);
	}
	for (const arr of virtualByParent.values()) {
		arr.sort((a, b) => a.id.localeCompare(b.id));
	}

	const treeLines: string[] = [];
	treeLines.push('# Folder Tree');
	treeLines.push('');
	if (noiseTagLegendLines.length > 0) {
		treeLines.push('## Global status & high-frequency tags (not shown in folder rows)');
		treeLines.push('');
		treeLines.push(noiseTagLegendLines.join(', '));
		treeLines.push('');
	}

	treeLines.push(...folderTreeColumnLegendLines());

	for (const f of folderNodes) {
		treeLines.push(folderLine(f, endpointIds));
		const kids = virtualByParent.get(normalizeVaultPath(f.path));
		if (kids?.length) {
			for (const v of kids) {
				treeLines.push(virtualLine(v, f.depth, endpointIds));
			}
		}
	}

	const highwayBody = buildHighwayBodyLines(edgesOrdered);

	const highwayLines: string[] = ['', '# High-Speed Links (The Backbone)', '', ...highwayBody];

	const fullMarkdown = [...treeLines, ...highwayLines].join('\n');

	const lim = Math.max(40, Math.min(500, maxNodesPerPage));
	const pageBodies: string[] = [];
	for (let i = 0; i < treeLines.length; i += lim) {
		pageBodies.push(treeLines.slice(i, i + lim).join('\n'));
	}

	const totalPages = Math.max(1, pageBodies.length);
	const pages: BackbonePage[] = pageBodies.map((markdown, pageIndex) => ({
		pageIndex,
		totalPages,
		markdown:
			pageIndex === totalPages - 1
				? `${markdown}\n${highwayLines.join('\n')}`
				: `${markdown}\n\n_(continued…)_\n`,
	}));

	return { markdown: fullMarkdown, pages };
}
