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
