/**
 * Peak Composer — formula detail generator (WP5 integration, app layer).
 *
 * Bridges the math block's bespoke {@link FormulaDetailGeneratorPort} (the
 * explain / split / variables detail store — §3.3, which drives its own state
 * rather than the shared candidate host) to the real capability executor. The
 * detail kind is mapped to its registered capability id + PromptId by the math
 * pack, prompt variables are built by the pack's single source of truth, and the
 * stream is the SAME `ComposerCapabilityExecutorPort` the candidate runtime
 * uses — so math AI rides the one shared AI service, no bespoke provider path.
 *
 * When no generator is composed (read-only host / harness) the store keeps its
 * detail actions disabled with a reason (never a fake button); this factory is
 * only wired on the editing runtime.
 */

import {
	buildFormulaDetailPromptVariables,
	formulaDetailCapabilityForKind,
	type ComposerCapabilityExecutorPort,
} from '@/service/composer';
import type {
	FormulaDetailGeneratorPort,
	FormulaDetailRequest,
	FormulaDetailStreamEvent,
} from '@/ui/view/composer/blocks/math/formulaDetailStore';

/** Compose a formula-detail generator over the shared capability executor. */
export function createComposerFormulaDetailGenerator(
	executor: ComposerCapabilityExecutorPort,
): FormulaDetailGeneratorPort {
	return {
		async *stream(request: FormulaDetailRequest): AsyncGenerator<FormulaDetailStreamEvent, void, unknown> {
			const cap = formulaDetailCapabilityForKind(request.detailKind);
			if (!cap) {
				yield { type: 'complete' };
				return;
			}
			const variables = buildFormulaDetailPromptVariables({
				latex: request.latex,
				...(request.label !== undefined ? { label: request.label } : {}),
				...(request.instruction !== undefined ? { instruction: request.instruction } : {}),
				...(request.contextText !== undefined ? { contextText: request.contextText } : {}),
			});
			for await (const ev of executor.stream({
				capabilityId: cap.capabilityId,
				promptId: cap.promptId,
				variables,
				signal: request.signal,
			})) {
				if (ev.type === 'text-delta') yield { type: 'text-delta', text: ev.text };
			}
			yield { type: 'complete' };
		},
	};
}
