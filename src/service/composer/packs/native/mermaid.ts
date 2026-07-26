/**
 * Peak Composer — Mermaid block structural helpers (WP8, §10.11).
 *
 * A Mermaid block is a ```mermaid fenced code block whose body is the diagram
 * source. The Composer surfaces a `预览 / 源码` toggle in the header (rendered
 * preview vs raw source); AI incremental editing rewrites the SOURCE via a
 * text-patch, which is then re-rendered and reviewed. This module owns the
 * framework-neutral half: extract the source, rewrite the source while keeping
 * the fence markers, and derive a cheap diagram-type summary for the header.
 *
 * The actual SVG render is lazy-loaded in the UI (the `mermaid` package is
 * declared and loaded on demand, streamdown precedent) — never here.
 *
 * Framework-neutral: no Obsidian / DOM imports.
 */

import { parseCodeFence } from './codeBlock';

export interface MermaidBlock {
	/** Verbatim diagram source (fence stripped). */
	source: string;
	/** Detected diagram type token (`flowchart`, `sequenceDiagram`, …) or ''. */
	diagramType: string;
}

const DIAGRAM_TYPES = [
	'flowchart',
	'graph',
	'sequenceDiagram',
	'classDiagram',
	'stateDiagram',
	'stateDiagram-v2',
	'erDiagram',
	'journey',
	'gantt',
	'pie',
	'mindmap',
	'timeline',
	'gitGraph',
	'quadrantChart',
	'requirementDiagram',
	'C4Context',
	'sankey',
	'xychart-beta',
	'block-beta',
];

/** Parse a ```mermaid block into its source + detected diagram type. */
export function parseMermaidBlock(raw: string): MermaidBlock | null {
	const fence = parseCodeFence(raw);
	if (!fence || fence.language !== 'mermaid') return null;
	return { source: fence.body, diagramType: detectDiagramType(fence.body) };
}

export function detectDiagramType(source: string): string {
	const firstLine = source
		.split(/\r?\n/)
		.map((l) => l.trim())
		.find((l) => l.length > 0 && !l.startsWith('%%'));
	if (!firstLine) return '';
	for (const type of DIAGRAM_TYPES) {
		if (firstLine === type || firstLine.startsWith(`${type} `) || firstLine.startsWith(`${type}\t`)) {
			return type;
		}
	}
	return firstLine.split(/\s+/)[0] ?? '';
}

/**
 * Rewrite a ```mermaid block's source while preserving the fence markers and
 * info string. Returns the full replacement block text (what a text-patch
 * writes back for the block's source range). Throws when `raw` is not a mermaid
 * fence, so a mis-targeted patch fails closed rather than corrupting the block.
 */
export function replaceMermaidSource(raw: string, nextSource: string): string {
	const fence = parseCodeFence(raw);
	if (!fence || fence.language !== 'mermaid') {
		throw new Error('replaceMermaidSource: target is not a ```mermaid block');
	}
	const trailingNewline = /\n[ \t]*(```+|~~~+)[ \t]*$/.test(raw) ? '\n' : '';
	const body = nextSource.replace(/\n+$/, '');
	// fence.info is the verbatim info string (e.g. "mermaid"), preserved as-is.
	return `${fence.fence}${fence.info}\n${body}${trailingNewline}${fence.fence}`;
}

export interface MermaidSummary {
	diagramType: string;
	lineCount: number;
}

export function mermaidSummary(raw: string): MermaidSummary {
	const block = parseMermaidBlock(raw);
	if (!block) return { diagramType: '', lineCount: 0 };
	return {
		diagramType: block.diagramType,
		lineCount: block.source.split(/\r?\n/).filter((l) => l.trim().length > 0).length,
	};
}
