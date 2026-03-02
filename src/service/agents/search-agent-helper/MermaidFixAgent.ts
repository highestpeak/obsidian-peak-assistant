/**
 * Agent that fixes invalid Mermaid code using the parser error. Used after MindFlow/Overview
 * validation fails to avoid re-running the full agent. Uses withRetryStream (max 2 retries).
 * Validation and apply logic run inside; caller passes onFixed callback to persist the result.
 */

import { AIServiceManager } from '@/service/chat/service-manager';
import { LLMStreamEvent, StreamTriggerName } from '@/core/providers/types';
import { PromptId } from '@/service/prompt/PromptId';
import { validateMermaidCode } from '@/core/utils/analysis-data-validator';
import { getMermaidInner, normalizeMermaidNodeStyleColons } from '@/core/utils/mermaid-utils';
import { withRetryStream } from '@/core/providers/helpers/stream-helper';
import type { ErrorRetryInfo } from '@/service/prompt/PromptId';

const MERMAID_FIX_MAX_RETRIES = 2;

export interface MermaidFixOptions {
	/** Called when a valid mermaid is produced; use to set context (e.g. setLastMermaid). */
	onFixed?: (mermaid: string) => void;
}

/**
 * Fixes invalid Mermaid by LLM call with invalid code + error. Uses withRetryStream to retry
 * when the fixed output still fails validation. On success calls onFixed(mermaid) and yields
 * mermaid_fix_result; on exhaustion yields mermaid_fix_failed.
 */
export class MermaidFixAgent {
	constructor(private readonly aiServiceManager: AIServiceManager) { }

	public async *ifInvalidThenFix(mermaid: string, onFixed: (mermaid: string) => void): AsyncGenerator<LLMStreamEvent> {
		const validation = await validateMermaidCode(mermaid);
		if (!validation.valid) {
			yield {
				type: 'pk-debug',
				debugName: 'mindflow_mermaid_validation_failed',
				triggerName: StreamTriggerName.SEARCH_MERMAID_FIX,
				extra: { error: validation.error },
			};
			yield* this.fix(mermaid, validation.error, {
				onFixed,
			});
		}
	}

	/**
	 * Stream fix attempts. Validation and apply are done inside; pass onFixed to persist the result.
	 */
	public async *fix(
		invalidCode: string,
		validationError: string,
		options?: MermaidFixOptions,
	): AsyncGenerator<LLMStreamEvent> {
		const triggerName = StreamTriggerName.SEARCH_MERMAID_FIX;
		const ref: { fixedMermaid: string | null; lastCode: string; lastError: string } = {
			fixedMermaid: null,
			lastCode: invalidCode.trim(),
			lastError: validationError,
		};

		const self = this;
		yield* withRetryStream(
			{ invalidCode: invalidCode.trim(), validationError },
			async function* (vars, retryCtx) {
				yield* self.runOneAttempt(vars, retryCtx, triggerName, options?.onFixed, ref);
			},
			{
				maxRetries: MERMAID_FIX_MAX_RETRIES,
				triggerName,
				eventRetryCheckFn: (e) => {
					if (e.type === 'error' && (e as any).extra?.retryPayload) {
						return { shouldRetry: true, retryText: JSON.stringify((e as any).extra.retryPayload) };
					}
					return { shouldRetry: false, retryText: '' };
				}
			},
		);

		if (ref.fixedMermaid == null) {
			yield {
				type: 'pk-debug',
				debugName: 'mermaid_fix_failed',
				triggerName,
				extra: { lastError: ref.lastError, lastCode: ref.lastCode },
			};
		}
	}

	private async *runOneAttempt(
		vars: { invalidCode: string; validationError: string },
		retryCtx: { lastRetryText?: string; lastAttemptErrorMessages?: string } | undefined,
		triggerName: StreamTriggerName,
		onFixed: ((mermaid: string) => void) | undefined,
		ref: { fixedMermaid: string | null; lastCode: string; lastError: string },
	): AsyncGenerator<LLMStreamEvent> {
		let code = vars.invalidCode.trim();
		let error = vars.validationError;
		const lastText = retryCtx && ('lastRetryText' in retryCtx ? retryCtx.lastRetryText : (retryCtx as ErrorRetryInfo).lastAttemptErrorMessages);
		if (lastText) {
			try {
				const p = JSON.parse(lastText) as { code?: string; error?: string };
				if (p.code != null) code = String(p.code).trim();
				if (p.error != null) error = String(p.error);
			} catch (_) {
				// ignore
			}
		}

		let output = '';
		// come from https://gist.github.com/yigitkonur/af07453dd812cd8a0b565fed62dd0f7d
		const stream = this.aiServiceManager.chatWithPromptStream(PromptId.AiAnalysisMermaidFix, {
			invalidCode: code,
			validationError: error,
		});
		for await (const e of stream) {
			yield { ...e, triggerName };
			if (e.type === 'prompt-stream-result' && e.output != null) {
				output = String(e.output).trim();
			}
		}

		const mermaid = getMermaidInner(output).trim();
		if (!mermaid) {
			ref.lastError = 'Fix agent returned no Mermaid code block.';
			ref.lastCode = output || code;
			yield {
				type: 'error',
				error: new Error(ref.lastError),
				triggerName,
				extra: { retryPayload: { code: ref.lastCode, error: ref.lastError } },
			};
			return;
		}

		const validation = await validateMermaidCode(mermaid);
		if (!validation.valid) {
			ref.lastCode = mermaid;
			ref.lastError = validation.error;
			yield {
				type: 'error',
				error: new Error(validation.error),
				triggerName,
				extra: { retryPayload: { code: mermaid, error: validation.error } },
			};
			return;
		}

		const normalized = normalizeMermaidNodeStyleColons(mermaid);
		ref.fixedMermaid = normalized;
		onFixed?.(normalized);
		yield {
			type: 'pk-debug',
			debugName: 'mermaid_fix_result',
			triggerName,
			extra: { fixedMermaid: normalized },
		};
	}
}
