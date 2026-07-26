/**
 * Peak Composer — formula detail store (WP5, UI wrapper over the pure model).
 *
 * A per-math-block vanilla zustand store that drives the independent detail
 * panels from the framework-neutral `formulaDetailModel`. Each ComposerRoot's
 * math block owns one store, so two open composers keep independent detail
 * state and nothing leaks to a module singleton (same discipline as foldStore).
 *
 * Streaming is delegated to an injected {@link FormulaDetailGeneratorPort}; when
 * none is provided (read-only host / harness without AI) the actions are inert
 * and the UI renders the detail affordances disabled with a reason.
 */

import { createStore } from 'zustand/vanilla';
import type {
	ComposerFormulaDetailKind,
} from '@/core/schemas/composer';
import {
	EMPTY_FORMULA_DETAIL_STATE,
	appendDelta,
	closeDetail,
	getDetail,
	keepDetail,
	markVariantFailed,
	markVariantReady,
	openDetail,
	regenerate,
	setActiveVariant,
	type FormulaDetailState,
} from '@/service/composer';
import { buildFormulaAnnotationPayload } from '@/service/composer';

export interface FormulaDetailRequest {
	formulaId: string;
	detailKind: ComposerFormulaDetailKind;
	latex: string;
	label?: string;
	instruction?: string;
	signal: AbortSignal;
}

export type FormulaDetailStreamEvent = { type: 'text-delta'; text: string } | { type: 'complete' };

/** Streams a formula detail's content. The app composes this over the executor port. */
export interface FormulaDetailGeneratorPort {
	stream(request: FormulaDetailRequest): AsyncGenerator<FormulaDetailStreamEvent, void, unknown>;
}

export interface FormulaDetailStoreState {
	model: FormulaDetailState;
	toggle: (formulaId: string, kind: ComposerFormulaDetailKind, latex: string, label?: string) => void;
	close: (formulaId: string, kind: ComposerFormulaDetailKind) => void;
	keep: (formulaId: string, kind: ComposerFormulaDetailKind) => void;
	followUp: (
		formulaId: string,
		kind: ComposerFormulaDetailKind,
		latex: string,
		instruction: string | undefined,
		label?: string,
	) => void;
	setVariant: (formulaId: string, kind: ComposerFormulaDetailKind, variantId: string) => void;
	/** True while a generation is streaming for this detail. */
	isStreaming: (formulaId: string, kind: ComposerFormulaDetailKind) => boolean;
	/** Whether AI generation is available (a generator port is wired). */
	canGenerate: boolean;
}

let seq = 0;
function nextVariantId(): string {
	seq += 1;
	return `fd-${Date.now().toString(36)}-${seq.toString(36)}`;
}

export function createFormulaDetailStore(generator?: FormulaDetailGeneratorPort) {
	const aborts = new Map<string, AbortController>();

	return createStore<FormulaDetailStoreState>((set, get) => {
		const apply = (next: FormulaDetailState) => set({ model: next });

		const runKey = (formulaId: string, kind: ComposerFormulaDetailKind) => `${formulaId}::${kind}`;

		async function run(
			formulaId: string,
			kind: ComposerFormulaDetailKind,
			variantId: string,
			latex: string,
			label?: string,
			instruction?: string,
		): Promise<void> {
			if (!generator) return;
			const abort = new AbortController();
			aborts.set(runKey(formulaId, kind), abort);
			let text = '';
			try {
				const stream = generator.stream({
					formulaId,
					detailKind: kind,
					latex,
					...(label !== undefined ? { label } : {}),
					...(instruction !== undefined ? { instruction } : {}),
					signal: abort.signal,
				});
				for await (const ev of stream) {
					if (abort.signal.aborted) break;
					if (ev.type !== 'text-delta') continue;
					text += ev.text;
					apply(appendDelta(get().model, formulaId, kind, variantId, ev.text));
				}
				const payload = buildFormulaAnnotationPayload(kind, latex, text);
				apply(markVariantReady(get().model, formulaId, kind, variantId, payload));
			} catch {
				apply(markVariantFailed(get().model, formulaId, kind, variantId));
			} finally {
				aborts.delete(runKey(formulaId, kind));
			}
		}

		return {
			model: EMPTY_FORMULA_DETAIL_STATE,
			canGenerate: Boolean(generator),
			toggle: (formulaId, kind, latex, label) => {
				const existing = getDetail(get().model, formulaId, kind);
				if (existing?.open) {
					get().close(formulaId, kind);
					return;
				}
				const hadVariants = (existing?.variants.length ?? 0) > 0;
				const variantId = nextVariantId();
				apply(openDetail(get().model, formulaId, kind, variantId));
				if (!hadVariants) void run(formulaId, kind, variantId, latex, label);
			},
			close: (formulaId, kind) => {
				aborts.get(runKey(formulaId, kind))?.abort();
				apply(closeDetail(get().model, formulaId, kind));
			},
			keep: (formulaId, kind) => apply(keepDetail(get().model, formulaId, kind)),
			followUp: (formulaId, kind, latex, instruction, label) => {
				if (get().isStreaming(formulaId, kind)) return;
				const variantId = nextVariantId();
				apply(regenerate(get().model, formulaId, kind, variantId, instruction));
				void run(formulaId, kind, variantId, latex, label, instruction);
			},
			setVariant: (formulaId, kind, variantId) => apply(setActiveVariant(get().model, formulaId, kind, variantId)),
			isStreaming: (formulaId, kind) => aborts.has(runKey(formulaId, kind)),
		};
	});
}

export type FormulaDetailStore = ReturnType<typeof createFormulaDetailStore>;
