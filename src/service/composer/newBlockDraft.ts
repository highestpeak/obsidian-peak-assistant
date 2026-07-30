import { PromptId } from '@/core/types/prompt';
import type { ComposerBlockKind } from '@/core/composer';
import { parseComposerDocument } from './documentParser';
import type { ComposerCapabilityExecutorPort } from './capabilities/executorPort';
import type { HiddenSourceRange } from './render/sourceVisualProjection';
import {
	headingTextStart,
	listItemContentStart,
} from './selection/partitionSelection';

export const COMPOSER_BLOCK_DRAFT_CAPABILITY_ID = 'composer.block-draft.generate';

export interface ComposerBlockDraftGenerationRequest {
	prompt: string;
	targetSource: string;
	before?: string;
	after?: string;
	signal?: AbortSignal;
}

export type ComposerBlockDraftGenerationEvent =
	| { type: 'text-delta'; text: string }
	| { type: 'complete' };

export interface ComposerBlockDraftGenerationPort {
	stream(
		request: ComposerBlockDraftGenerationRequest,
	): AsyncGenerator<ComposerBlockDraftGenerationEvent, void, unknown>;
}

/**
 * App-composed bridge from the shared Composer AI executor to the new-block
 * draft. The UI receives only this narrow port; it never resolves a provider or
 * embeds an inline prompt.
 */
export function createComposerBlockDraftGenerationPort(
	executor: ComposerCapabilityExecutorPort,
): ComposerBlockDraftGenerationPort {
	return {
		async *stream(request) {
			const stream = executor.stream({
				capabilityId: COMPOSER_BLOCK_DRAFT_CAPABILITY_ID,
				promptId: PromptId.ComposerBlockDraft,
				variables: {
					instruction: request.prompt,
					targetSource: request.targetSource,
					before: request.before ?? '',
					after: request.after ?? '',
				},
				...(request.signal ? { signal: request.signal } : {}),
			});
			for await (const event of stream) yield event;
		},
	};
}

export interface DraftSyntaxInsertion {
	value: string;
	selectionStart: number;
	selectionEnd: number;
}

export type ComposerDraftEditorKind =
	| 'text'
	| 'table'
	| 'formula'
	| 'reference'
	| 'ai';

export function composerDraftEditorKind(typeId: string): ComposerDraftEditorKind {
	if (typeId === 'table') return 'table';
	if (typeId === 'formula') return 'formula';
	if (typeId === 'image' || typeId === 'base' || typeId === 'canvas' || typeId === 'excalidraw') {
		return 'reference';
	}
	if (typeId === 'ai') return 'ai';
	return 'text';
}

/** Parse the live draft through the production document parser for visual semantics. */
export function composerDraftPresentationKind(source: string): ComposerBlockKind {
	return parseComposerDocument(source).blocks[0]?.kind ?? 'paragraph';
}

/**
 * Keep structural Markdown bytes in textContent for lossless writeback while
 * hiding the leading syntax in the live draft projection.
 */
export interface ComposerDraftHiddenRange extends HiddenSourceRange {
	role: 'heading' | 'list' | 'ordered-list' | 'task' | 'ordered-task';
}

export function composerDraftHiddenRanges(source: string): ComposerDraftHiddenRange[] {
	const snapshot = parseComposerDocument(source);
	const hidden: ComposerDraftHiddenRange[] = [];
	for (const block of snapshot.blocks) {
		if (block.kind === 'heading') {
			const to = headingTextStart(source, block);
			if (to > block.source.from) hidden.push({ from: block.source.from, to, role: 'heading' });
			continue;
		}
		if (block.kind !== 'list' && block.kind !== 'task') continue;
		const role = composerDraftListRole(block.kind, block.renderModel.ordered);
		for (const unit of block.units) {
			if (unit.unitKind !== 'list-item') continue;
			const to = listItemContentStart(source, unit);
			if (to > unit.from) hidden.push({ from: unit.from, to, role });
		}
	}
	return hidden;
}

function composerDraftListRole(
	kind: 'list' | 'task',
	ordered: boolean,
): ComposerDraftHiddenRange['role'] {
	if (kind === 'task') return ordered ? 'ordered-task' : 'task';
	return ordered ? 'ordered-list' : 'list';
}

export interface MarkdownDraftEdit {
	value: string;
	selectionStart: number;
	selectionEnd: number;
}

/**
 * Continue the Markdown structure owned by the active line.
 *
 * Lists/tasks/quotes repeat their marker; an empty marker exits the structure.
 * Ordinary Enter starts the next Markdown block, while Shift+Enter inserts one
 * literal line break.
 */
export function insertMarkdownDraftBreak(
	value: string,
	selectionStart: number,
	selectionEnd: number,
	soft = false,
): MarkdownDraftEdit {
	const from = Math.max(0, Math.min(value.length, selectionStart));
	const to = Math.max(from, Math.min(value.length, selectionEnd));
	const lineStart = value.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
	const lineEndAt = value.indexOf('\n', from);
	const lineEnd = lineEndAt < 0 ? value.length : lineEndAt;
	const line = value.slice(lineStart, lineEnd);
	const continuation = markdownLineContinuation(line);
	if (!soft && continuation && line.slice(continuation.sourceLength).trim().length === 0) {
		const next = `${value.slice(0, lineStart)}\n${value.slice(to)}`;
		const caret = lineStart + 1;
		return { value: next, selectionStart: caret, selectionEnd: caret };
	}
	const inserted = soft
		? '\n'
		: continuation
			? `\n${continuation.nextPrefix}`
			: '\n\n';
	const next = `${value.slice(0, from)}${inserted}${value.slice(to)}`;
	const caret = from + inserted.length;
	return { value: next, selectionStart: caret, selectionEnd: caret };
}

function markdownLineContinuation(
	line: string,
): { sourceLength: number; nextPrefix: string } | null {
	let indentLength = 0;
	while (line[indentLength] === ' ' || line[indentLength] === '\t') indentLength += 1;
	const indent = line.slice(0, indentLength);
	const body = line.slice(indentLength);
	const quote = body.startsWith('> ') ? '> ' : '';
	const nestedBody = quote ? body.slice(quote.length) : body;
	const task = taskPrefix(nestedBody);
	if (task) {
		return {
			sourceLength: indentLength + quote.length + task.length,
			nextPrefix: `${indent}${quote}${task.next}`,
		};
	}
	const list = listPrefix(nestedBody);
	if (list) {
		return {
			sourceLength: indentLength + quote.length + list.length,
			nextPrefix: `${indent}${quote}${list.next}`,
		};
	}
	if (quote) {
		return {
			sourceLength: indentLength + quote.length,
			nextPrefix: `${indent}${quote}`,
		};
	}
	return null;
}

function taskPrefix(value: string): { length: number; next: string } | null {
	for (const marker of ['- ', '* ', '+ ']) {
		if (!value.startsWith(marker)) continue;
		const task = value.slice(marker.length, marker.length + 4).toLowerCase();
		if (task === '[ ] ' || task === '[x] ') {
			return { length: marker.length + 4, next: `${marker}[ ] ` };
		}
	}
	const ordered = orderedListPrefix(value);
	if (!ordered) return null;
	const task = value.slice(ordered.length, ordered.length + 4).toLowerCase();
	return task === '[ ] ' || task === '[x] '
		? { length: ordered.length + 4, next: `${ordered.next}[ ] ` }
		: null;
}

function listPrefix(value: string): { length: number; next: string } | null {
	for (const marker of ['- ', '* ', '+ ']) {
		if (value.startsWith(marker)) return { length: marker.length, next: marker };
	}
	return orderedListPrefix(value);
}

function orderedListPrefix(value: string): { length: number; next: string } | null {
	let digitEnd = 0;
	while (digitEnd < value.length && value[digitEnd] >= '0' && value[digitEnd] <= '9') {
		digitEnd += 1;
	}
	if (digitEnd === 0) return null;
	const punctuation = value[digitEnd];
	if ((punctuation !== '.' && punctuation !== ')') || value[digitEnd + 1] !== ' ') return null;
	const token = value.slice(0, digitEnd + 2);
	return { length: token.length, next: token };
}

/** Extract the editable visual body while keeping structural Markdown private. */
export function composerDraftBody(typeId: string, source: string): string {
	if (typeId === 'heading') return source.replace(/^#{1,6}\s*/, '');
	if (typeId === 'task') return source.replace(/^\s*(?:[-*+]|\d+[.)])\s+\[[ xX]\]\s*/, '');
	if (typeId === 'list') return source.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '');
	if (typeId === 'quote') return source.split('\n').map((line) => line.replace(/^>\s?/, '')).join('\n');
	if (typeId === 'callout') {
		return source
			.split('\n')
			.slice(1)
			.map((line) => line.replace(/^>\s?/, ''))
			.join('\n');
	}
	return source;
}

/** Serialize a visual text body to the selected standard Markdown block kind. */
export function composerDraftSource(typeId: string, body: string): string {
	if (typeId === 'heading') return `## ${body}`;
	if (typeId === 'task') return `- [ ] ${body}`;
	if (typeId === 'list') return `- ${body}`;
	if (typeId === 'quote') return body.split('\n').map((line) => `> ${line}`).join('\n');
	if (typeId === 'callout') {
		const lines = body.split('\n').map((line) => `> ${line}`).join('\n');
		return `> [!note]\n${lines}`;
	}
	return body;
}

export function composerDraftFormula(source: string): string {
	return source.trim().replace(/^\$\$/, '').replace(/\$\$$/, '');
}

export function composerDraftFormulaSource(latex: string): string {
	return `$$${latex}$$`;
}

export function composerDraftReferenceTarget(source: string): string {
	const wiki = /^!\[\[([\s\S]+)\]\]$/.exec(source.trim());
	if (wiki) return wiki[1];
	const markdown = /^!\[[^\]]*\]\(([\s\S]+)\)$/.exec(source.trim());
	return markdown?.[1] ?? source.trim();
}

export function composerDraftReferenceSource(target: string): string {
	return `![[${target.trim()}]]`;
}

/** True when the visual editor contains user content beyond its structural shell. */
export function composerDraftHasContent(typeId: string, source: string): boolean {
	const kind = composerDraftEditorKind(typeId);
	if (kind === 'formula') return Boolean(composerDraftFormula(source).trim());
	if (kind === 'reference') return Boolean(composerDraftReferenceTarget(source).trim());
	if (kind === 'ai') return Boolean(source.trim());
	if (kind === 'table') return Boolean(source.replace(/[\s|:-]/g, ''));
	return Boolean(composerDraftBody(typeId, source).trim());
}

/** Insert a visible Markdown shortcut at the current selection/caret. */
export function insertDraftSyntax(
	value: string,
	selectionStart: number,
	selectionEnd: number,
	prefix: string,
	suffix = '',
): DraftSyntaxInsertion {
	const from = Math.max(0, Math.min(selectionStart, value.length));
	const to = Math.max(from, Math.min(selectionEnd, value.length));
	const selected = value.slice(from, to);
	const inserted = `${prefix}${selected}${suffix}`;
	const nextValue = value.slice(0, from) + inserted + value.slice(to);
	const caret = selected
		? from + inserted.length
		: from + prefix.length;
	return {
		value: nextValue,
		selectionStart: caret,
		selectionEnd: caret,
	};
}

/** Expected transaction delta for arbitrary Markdown, including multi-block drafts. */
export function countDraftBlocks(source: string): number {
	if (!source.trim()) return 0;
	return parseComposerDocument(source, { filePath: '__composer_draft__.md' }).blocks.length;
}
