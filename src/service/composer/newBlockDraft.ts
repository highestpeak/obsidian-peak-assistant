import { PromptId } from '@/core/types/prompt';
import { parseComposerDocument } from './documentParser';
import type { ComposerCapabilityExecutorPort } from './capabilities/executorPort';

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
