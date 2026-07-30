import type { MarkdownView } from 'obsidian';

export interface NativeMarkdownIntelligenceContext {
	blockId?: string;
	findingId?: string;
	sourceFrom?: number;
	sourceTo?: number;
	selectionText?: string;
	heading?: string;
}

function offsetAt(source: string, position: { line: number; ch: number }): number {
	const lines = source.split('\n');
	let offset = 0;
	const lastLine = Math.min(Math.max(0, position.line), Math.max(0, lines.length - 1));
	for (let index = 0; index < lastLine; index += 1) {
		offset += (lines[index]?.length ?? 0) + 1;
	}
	return offset + Math.min(Math.max(0, position.ch), lines[lastLine]?.length ?? 0);
}

function headingAt(source: string, line: number): string | undefined {
	const lines = source.split('\n');
	for (let index = Math.min(line, lines.length - 1); index >= 0; index -= 1) {
		const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[index] ?? '');
		if (match) return match[2];
	}
	return undefined;
}

/** Capture the editor state before opening a modal changes active focus. */
export function captureNativeMarkdownIntelligenceContext(
	view: MarkdownView,
): NativeMarkdownIntelligenceContext {
	const source = view.editor.getValue();
	const from = view.editor.getCursor('from');
	const to = view.editor.getCursor('to');
	const sourceFrom = offsetAt(source, from);
	const sourceTo = offsetAt(source, to);
	const selectionText = view.editor.getSelection().trim();
	const heading = headingAt(source, from.line);
	return {
		sourceFrom,
		sourceTo,
		...(selectionText ? { selectionText } : {}),
		...(heading ? { heading } : {}),
	};
}
