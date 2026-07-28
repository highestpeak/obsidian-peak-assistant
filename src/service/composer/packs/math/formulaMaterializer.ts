/**
 * Peak Composer — formula annotation materializer (WP5, handoff §10.2 / §11.4).
 *
 * Turns one formula detail run's streamed JSON into a typed
 * `formula-annotation` envelope. All three detail kinds share one result kind;
 * `resultContext.detailKind` selects the validated explain, split, or variables
 * payload. Explain/variables stay local annotations. An accepted split is
 * separately serialized into an exact-range transaction patch below.
 * Framework-neutral: no `obsidian` import.
 */

import type {
	ComposerFormulaAnnotationPayload,
	ComposerFormulaDetailKind,
} from '@/core/schemas/composer';
import {
	ComposerFormulaAnnotationPayloadSchema,
	ComposerFormulaDetailKindSchema,
} from '@/core/schemas/composer';
import type { ComposerResultEnvelope } from '@/core/composer';
import type { ComposerOperation, ComposerTarget } from '@/core/composer';
import { COMPOSER_FORMULA_ANNOTATION_RENDERER_ID } from '@/core/composer';
import type { ComposerResultMaterializer, MaterializeArgs } from '../../capabilities/resultMaterializers';
import type { ParsedFormula } from './formulaModel';

/** Extract inner TeX from a `$$…$$` (or bare) formula source slice. */
export function latexFromSource(source: string): string {
	const trimmed = source.trim();
	const stripped = trimmed.replace(/^\$\$/, '').replace(/\$\$$/, '');
	return stripped.trim();
}

/**
 * Extract the one JSON object requested by the formula prompts. Providers
 * occasionally wrap an otherwise valid object in a Markdown code fence; strip
 * that transport decoration without ever rendering it.
 */
function parseResponseObject(text: string): Record<string, unknown> {
	let source = text.trim();
	if (source.startsWith('```')) {
		const firstNewline = source.indexOf('\n');
		const closingFence = source.lastIndexOf('```');
		if (firstNewline >= 0 && closingFence > firstNewline) {
			source = source.slice(firstNewline + 1, closingFence).trim();
		}
	}
	const objectStart = source.indexOf('{');
	const objectEnd = source.lastIndexOf('}');
	if (objectStart < 0 || objectEnd <= objectStart) {
		throw new Error('formula detail response did not contain a JSON object');
	}
	const parsed = JSON.parse(source.slice(objectStart, objectEnd + 1));
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error('formula detail response JSON must be an object');
	}
	return parsed as Record<string, unknown>;
}

/** Build a typed `formula-annotation` payload from the model's JSON response. */
export function buildFormulaAnnotationPayload(
	detailKind: ComposerFormulaDetailKind,
	latex: string,
	text: string,
): ComposerFormulaAnnotationPayload {
	const raw = parseResponseObject(text);
	const payload = ComposerFormulaAnnotationPayloadSchema.parse({
		...raw,
		detailKind,
		latex: latexFromSource(latex),
	});
	if (payload.detailKind === 'split') {
		return {
			...payload,
			equivalentTex: latexFromSource(payload.equivalentTex),
			parts: payload.parts.map((part) => ({
				...part,
				tex: latexFromSource(part.tex),
			})),
		};
	}
	return payload;
}

/** Serialize one accepted split as a self-contained standard display formula. */
export function buildFormulaSplitMarkdown(
	payload: Extract<ComposerFormulaAnnotationPayload, { detailKind: 'split' }>,
): string {
	const rows = [
		latexFromSource(payload.equivalentTex),
		...payload.parts.map((part) => latexFromSource(part.tex)),
	];
	const body = rows
		.map((row, index) => `  ${row}${index < rows.length - 1 ? ' \\\\' : ''}`)
		.join('\n');
	return ['$$', '\\begin{aligned}', body, '\\end{aligned}', '$$'].join('\n');
}

export interface FormulaSplitPatch {
	operations: readonly ComposerOperation[];
	target: ComposerTarget;
	expectedBlockDelta: number;
}

/** Address exactly one parsed formula inside its owning math block. */
export function buildFormulaSplitPatch(
	blockId: string,
	blockSourceFrom: number,
	formula: ParsedFormula,
	payload: Extract<ComposerFormulaAnnotationPayload, { detailKind: 'split' }>,
): FormulaSplitPatch {
	const from = blockSourceFrom + formula.from;
	const to = blockSourceFrom + formula.to;
	return {
		operations: [{ kind: 'replaceRange', from, to, text: buildFormulaSplitMarkdown(payload) }],
		target: { kind: 'selection', blockId, from, to },
		expectedBlockDelta: 0,
	};
}

export function createFormulaAnnotationMaterializer(): ComposerResultMaterializer {
	return {
		resultKind: 'formula-annotation',
		materialize({ definition, snapshot, text }: MaterializeArgs): ComposerResultEnvelope {
			const detailKind = ComposerFormulaDetailKindSchema.parse(definition.resultContext?.detailKind);
			const latex = latexFromSource(snapshot.targetSource);
			return {
				resultKind: 'formula-annotation',
				rendererId: COMPOSER_FORMULA_ANNOTATION_RENDERER_ID,
				payload: buildFormulaAnnotationPayload(detailKind, latex, text),
			};
		},
	};
}
