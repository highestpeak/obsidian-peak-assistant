import { PromptId } from '@/core/types/prompt';
import {
	applyOperations,
	type ComposerBlockKind,
	type ComposerInlineMark,
	type ComposerOperation,
} from '@/core/composer';
import { parseComposerDocument } from './documentParser';
import type { ComposerCapabilityExecutorPort } from './capabilities/executorPort';
import {
	projectSourceVisualParts,
	type HiddenSourceRange,
} from './render/sourceVisualProjection';
import {
	headingTextStart,
	listItemContentStart,
	partitionSourceRange,
} from './selection/partitionSelection';
import {
	applyMarkToSelection,
	removeInlineMarkWrapper,
} from './selection/markSerializer';
import {
	openDelimiter,
	resolveFormattingSyntax,
} from './selection/formattingSyntax';

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

export interface ComposerDraftBlockRange {
	from: number;
	to: number;
	kind: ComposerBlockKind;
}

/** Preserve every parsed block's independent visual range inside one draft. */
export function composerDraftBlockRanges(source: string): ComposerDraftBlockRange[] {
	return parseComposerDocument(source).blocks.map((block) => ({
		from: block.source.from,
		to: block.source.to,
		kind: block.kind,
	}));
}

/**
 * Keep structural Markdown bytes in textContent for lossless writeback while
 * hiding the leading syntax in the live draft projection.
 */
export interface ComposerDraftHiddenRange extends HiddenSourceRange {
	role: 'heading' | 'list' | 'ordered-list' | 'task' | 'ordered-task';
	depth?: number;
}

export function composerDraftHiddenRanges(source: string): ComposerDraftHiddenRange[] {
	const snapshot = parseComposerDocument(source);
	const hidden: ComposerDraftHiddenRange[] = [];
	for (const block of snapshot.blocks) {
		if (block.kind === 'heading') {
			const to = headingTextStart(source, block.source);
			if (to > block.source.from) hidden.push({ from: block.source.from, to, role: 'heading' });
			continue;
		}
		if (block.kind !== 'list' && block.kind !== 'task') continue;
		const role = composerDraftListRole(block.kind, block.renderModel.ordered);
		for (const unit of block.units) {
			if (unit.unitKind !== 'list-item') continue;
			const lineStart = source.lastIndexOf('\n', Math.max(0, unit.from - 1)) + 1;
			const to = listItemContentStart(source, { from: lineStart, to: unit.to });
			if (to <= lineStart) continue;
			const indent = leadingMarkdownWhitespace(source.slice(lineStart, to));
			hidden.push({
				from: lineStart,
				to,
				role,
				depth: markdownListIndentDepth(indent),
			});
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

export type MarkdownDraftInlineMark = Extract<
	ComposerInlineMark,
	'bold' | 'italic' | 'underline'
>;

/**
 * Serialize draft formatting shortcuts through Markdown source.
 *
 * Native contenteditable formatting creates browser-owned `<b>/<i>/<u>` DOM
 * that disappears when the draft is read back through `textContent`. This
 * helper routes the same gesture through Composer's mark serializer so the
 * source remains canonical, reversible and compatible with the live projector.
 */
export function formatMarkdownDraftSelection(
	value: string,
	selectionStart: number,
	selectionEnd: number,
	mark: MarkdownDraftInlineMark,
): MarkdownDraftEdit | null {
	const from = Math.max(0, Math.min(value.length, Math.min(selectionStart, selectionEnd)));
	const to = Math.max(from, Math.min(value.length, Math.max(selectionStart, selectionEnd)));
	const snapshot = parseComposerDocument(value);
	if (from === to) {
		const block = snapshot.blocks.find(
			(candidate) => candidate.source.from <= from && candidate.source.to >= to,
		);
		if (block?.kind === 'code') return null;
		const syntax = resolveFormattingSyntax()[mark];
		const open = openDelimiter(syntax);
		const inserted = `${open}${syntax.close}`;
		const next = `${value.slice(0, from)}${inserted}${value.slice(to)}`;
		const caret = from + open.length;
		return { value: next, selectionStart: caret, selectionEnd: caret };
	}
	const removal = draftMarkRemovalOperations(value, from, to, mark);
	if (removal) {
		const next = applyOperations(value, removal);
		const mapped = formattedDraftSelectionRange(removal);
		return mapped
			? { value: next, selectionStart: mapped.from, selectionEnd: mapped.to }
			: { value: next, selectionStart: from, selectionEnd: from };
	}
	const selection = partitionSourceRange(snapshot, from, to);
	const result = applyMarkToSelection(selection, mark);
	if (!result.ok) return null;
	const next = applyOperations(value, result.operations);
	const mapped = formattedDraftSelectionRange(result.operations);
	if (!mapped) return { value: next, selectionStart: from, selectionEnd: from };
	return {
		value: next,
		selectionStart: mapped.from,
		selectionEnd: mapped.to,
	};
}

function draftMarkRemovalOperations(
	value: string,
	from: number,
	to: number,
	mark: MarkdownDraftInlineMark,
): ComposerOperation[] | null {
	const runs = projectSourceVisualParts(value, 0, { mathMode: 'source' })
		.filter((part) => part.kind === 'run' && part.from < to && part.to > from);
	if (runs.length === 0) return null;
	const ranges = new Map<string, { from: number; to: number }>();
	for (const run of runs) {
		if (run.kind !== 'run' || !draftRunHasMark(run.style, mark)) return null;
		const range = run.markRanges?.[mark];
		if (!range) return null;
		ranges.set(`${range.from}:${range.to}`, range);
	}
	for (const range of ranges.values()) {
		const markedRuns = projectSourceVisualParts(value, 0, { mathMode: 'source' })
			.filter((part) =>
				part.kind === 'run'
				&& part.markRanges?.[mark]?.from === range.from
				&& part.markRanges?.[mark]?.to === range.to,
			);
		const visibleFrom = Math.min(...markedRuns.map((run) => run.from));
		const visibleTo = Math.max(...markedRuns.map((run) => run.to));
		if (from > visibleFrom || to < visibleTo) return null;
	}
	const operations = [...ranges.values()]
		.map((range) => removeInlineMarkWrapper(value, mark, range))
		.filter((operation): operation is ComposerOperation => Boolean(operation));
	return operations.length === ranges.size ? operations : null;
}

function draftRunHasMark(
	style: {
		bold?: boolean;
		italic?: boolean;
		underline?: boolean;
	},
	mark: MarkdownDraftInlineMark,
): boolean {
	if (mark === 'bold') return Boolean(style.bold);
	if (mark === 'italic') return Boolean(style.italic);
	return Boolean(style.underline);
}

function formattedDraftSelectionRange(
	operations: readonly ComposerOperation[],
): { from: number; to: number } | null {
	const replacements = operations
		.filter(
			(operation): operation is Extract<ComposerOperation, { kind: 'replaceRange' }> =>
				operation.kind === 'replaceRange',
		)
		.sort((left, right) => left.from - right.from);
	let delta = 0;
	let selectionFrom = Number.POSITIVE_INFINITY;
	let selectionTo = Number.NEGATIVE_INFINITY;
	for (const replacement of replacements) {
		const nextFrom = replacement.from + delta;
		const visible = projectSourceVisualParts(replacement.text, nextFrom, {
			mathMode: 'source',
		}).filter((part) => part.kind !== 'hidden');
		if (visible.length > 0) {
			const first = visible[0];
			const last = visible[visible.length - 1];
			selectionFrom = Math.min(
				selectionFrom,
				first.kind === 'math' ? first.visibleFrom : first.from,
			);
			selectionTo = Math.max(
				selectionTo,
				last.kind === 'math' ? last.visibleTo : last.to,
			);
		}
		delta += replacement.text.length - (replacement.to - replacement.from);
	}
	return Number.isFinite(selectionFrom) && Number.isFinite(selectionTo)
		? { from: selectionFrom, to: selectionTo }
		: null;
}

interface MarkdownListLine {
	start: number;
	end: number;
	indentColumns: number;
}

interface MarkdownLineEdit {
	at: number;
	remove: number;
	insert: string;
}

/**
 * Own Tab/Shift+Tab while the draft selection touches list items.
 *
 * Tab inserts one Markdown tab before every selected item. The first item at a
 * level cannot indent without a preceding sibling, but the key is still
 * handled so focus never escapes the editor. Shift+Tab removes one indentation
 * level and accepts either tabs or pasted space indentation.
 */
export function indentMarkdownDraftListItems(
	value: string,
	selectionStart: number,
	selectionEnd: number,
	outdent = false,
): MarkdownDraftEdit | null {
	const from = Math.max(0, Math.min(value.length, Math.min(selectionStart, selectionEnd)));
	const to = Math.max(from, Math.min(value.length, Math.max(selectionStart, selectionEnd)));
	const lines = selectedMarkdownListLines(value, from, to);
	if (lines.length === 0) return null;
	if (!outdent && !hasPreviousListSibling(value, lines[0])) {
		return { value, selectionStart: from, selectionEnd: to };
	}
	const edits = lines
		.map((line): MarkdownLineEdit | null => {
			if (!outdent) return { at: line.start, remove: 0, insert: '\t' };
			const removable = removableMarkdownIndent(value.slice(line.start, line.end));
			return removable > 0
				? { at: line.start, remove: removable, insert: '' }
				: null;
		})
		.filter((edit): edit is MarkdownLineEdit => Boolean(edit));
	if (edits.length === 0) return { value, selectionStart: from, selectionEnd: to };
	const next = applyMarkdownLineEdits(value, edits);
	return {
		value: next,
		selectionStart: mapMarkdownEditOffset(from, edits),
		selectionEnd: mapMarkdownEditOffset(to, edits),
	};
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
	const selectionFrom = Math.max(
		0,
		Math.min(value.length, Math.min(selectionStart, selectionEnd)),
	);
	const selectionTo = Math.max(
		selectionFrom,
		Math.min(value.length, Math.max(selectionStart, selectionEnd)),
	);
	const from = selectionFrom === selectionTo
		? exitInlineMarkdownBeforeBreak(value, selectionFrom)
		: selectionFrom;
	const to = selectionFrom === selectionTo ? from : selectionTo;
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

/**
 * A visible caret at the end of a formatted run maps before its hidden closing
 * source token. Move it past every adjacent close token before inserting a
 * structural break so the next paragraph/list item does not inherit the mark.
 */
function exitInlineMarkdownBeforeBreak(value: string, offset: number): number {
	let cursor = Math.max(0, Math.min(value.length, offset));
	const lineStart = value.lastIndexOf('\n', Math.max(0, cursor - 1)) + 1;
	const pairs = [
		{ open: '<span', close: '</span>' },
		{ open: '<u', close: '</u>' },
		{ open: '<mark', close: '</mark>' },
		{ open: '<a ', close: '</a>' },
		{ open: '***', close: '***' },
		{ open: '___', close: '___' },
		{ open: '**', close: '**' },
		{ open: '__', close: '__' },
		{ open: '~~', close: '~~' },
		{ open: '*', close: '*' },
		{ open: '_', close: '_' },
		{ open: '`', close: '`' },
	] as const;
	while (cursor < value.length) {
		const pair = pairs.find((candidate) => {
			if (!value.startsWith(candidate.close, cursor)) return false;
			return value.lastIndexOf(candidate.open, cursor - 1) >= lineStart;
		});
		if (!pair) break;
		cursor += pair.close.length;
	}
	return cursor;
}

/**
 * Delete a source selection and remove any now-empty adjacent inline wrappers.
 *
 * Browsers otherwise delete only the visible run and leave hidden Markdown or
 * canonical HTML delimiters in the unmanaged contenteditable subtree.
 */
export function deleteMarkdownDraftSelection(
	value: string,
	selectionStart: number,
	selectionEnd: number,
): MarkdownDraftEdit | null {
	const from = Math.max(
		0,
		Math.min(value.length, Math.min(selectionStart, selectionEnd)),
	);
	const to = Math.max(from, Math.min(value.length, Math.max(selectionStart, selectionEnd)));
	if (from === to) return null;
	let next = `${value.slice(0, from)}${value.slice(to)}`;
	let caret = from;
	let removed = true;
	while (removed) {
		removed = false;
		const html = emptyHtmlWrapperAt(next, caret);
		if (html) {
			next = `${next.slice(0, html.from)}${next.slice(html.to)}`;
			caret = html.from;
			removed = true;
			continue;
		}
		for (const shell of [
			{ open: '***', close: '***' },
			{ open: '___', close: '___' },
			{ open: '**', close: '**' },
			{ open: '__', close: '__' },
			{ open: '~~', close: '~~' },
			{ open: '*', close: '*' },
			{ open: '_', close: '_' },
			{ open: '`', close: '`' },
		]) {
			const openAt = caret - shell.open.length;
			if (openAt < 0) continue;
			if (next.slice(openAt, caret) !== shell.open) continue;
			if (next.slice(caret, caret + shell.close.length) !== shell.close) continue;
			next = `${next.slice(0, openAt)}${next.slice(caret + shell.close.length)}`;
			caret = openAt;
			removed = true;
			break;
		}
	}
	return { value: next, selectionStart: caret, selectionEnd: caret };
}

function emptyHtmlWrapperAt(
	value: string,
	caret: number,
): { from: number; to: number } | null {
	const opening = /<(span|u|mark|a)\b[^>]*>$/i.exec(value.slice(0, caret));
	if (!opening) return null;
	const tag = opening[1];
	const closing = new RegExp(`^<\\/${tag}\\s*>`, 'i').exec(value.slice(caret));
	if (!closing) return null;
	return {
		from: caret - opening[0].length,
		to: caret + closing[0].length,
	};
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

function selectedMarkdownListLines(
	value: string,
	from: number,
	to: number,
): MarkdownListLine[] {
	const selected: MarkdownListLine[] = [];
	let lineStart = value.lastIndexOf('\n', Math.max(0, from - 1)) + 1;
	const effectiveEnd = to > from && value[to - 1] === '\n' ? to - 1 : to;
	while (lineStart <= effectiveEnd) {
		const lineEndAt = value.indexOf('\n', lineStart);
		const lineEnd = lineEndAt < 0 ? value.length : lineEndAt;
		const line = markdownListLine(value, lineStart, lineEnd);
		if (line) selected.push(line);
		if (lineEndAt < 0 || lineEndAt >= effectiveEnd) break;
		lineStart = lineEndAt + 1;
	}
	return selected;
}

function markdownListLine(
	value: string,
	start: number,
	end: number,
): MarkdownListLine | null {
	const line = value.slice(start, end);
	const indent = leadingMarkdownWhitespace(line);
	const body = line.slice(indent.length);
	if (!taskPrefix(body) && !listPrefix(body)) return null;
	return {
		start,
		end,
		indentColumns: markdownIndentColumns(indent),
	};
}

function hasPreviousListSibling(value: string, line: MarkdownListLine): boolean {
	let cursor = line.start;
	while (cursor > 0) {
		const previousEnd = cursor - 1;
		const previousStart = value.lastIndexOf('\n', Math.max(0, previousEnd - 1)) + 1;
		const previousText = value.slice(previousStart, previousEnd);
		if (previousText.trim().length === 0) return false;
		const previous = markdownListLine(value, previousStart, previousEnd);
		if (!previous) return false;
		if (previous.indentColumns === line.indentColumns) return true;
		if (previous.indentColumns < line.indentColumns) return false;
		cursor = previousStart;
	}
	return false;
}

function removableMarkdownIndent(line: string): number {
	if (line.startsWith('\t')) return 1;
	let spaces = 0;
	while (spaces < line.length && line[spaces] === ' ' && spaces < 4) spaces += 1;
	return spaces;
}

function applyMarkdownLineEdits(value: string, edits: readonly MarkdownLineEdit[]): string {
	let next = '';
	let cursor = 0;
	for (const edit of edits) {
		next += value.slice(cursor, edit.at);
		next += edit.insert;
		cursor = edit.at + edit.remove;
	}
	return next + value.slice(cursor);
}

function mapMarkdownEditOffset(
	offset: number,
	edits: readonly MarkdownLineEdit[],
): number {
	let delta = 0;
	for (const edit of edits) {
		if (offset < edit.at) break;
		if (offset <= edit.at + edit.remove) {
			return edit.at + delta + edit.insert.length;
		}
		delta += edit.insert.length - edit.remove;
	}
	return offset + delta;
}

function leadingMarkdownWhitespace(value: string): string {
	let end = 0;
	while (value[end] === ' ' || value[end] === '\t') end += 1;
	return value.slice(0, end);
}

function markdownIndentColumns(indent: string): number {
	let columns = 0;
	for (const character of indent) {
		if (character === '\t') {
			columns += 4 - (columns % 4);
			continue;
		}
		columns += 1;
	}
	return columns;
}

function markdownListIndentDepth(indent: string): number {
	const columns = markdownIndentColumns(indent);
	return columns === 0 ? 0 : Math.ceil(columns / 4);
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
