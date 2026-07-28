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
	const stripped = trimmed.startsWith('$$') && trimmed.endsWith('$$')
		? trimmed.slice(2, -2)
		: trimmed.startsWith('$') && trimmed.endsWith('$')
			? trimmed.slice(1, -1)
			: trimmed;
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
	if (payload.detailKind === 'variables') {
		const seen = new Set<string>();
		const variables = payload.variables
			.map((variable) => ({
				...variable,
				symbolTex: latexFromSource(variable.symbolTex),
			}))
			.filter((variable) => {
				if (!isAtomicFormulaSymbol(variable.symbolTex)) return false;
				const key = variable.symbolTex.replace(/\s+/g, '');
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			});
		if (variables.length === 0) {
			throw new Error('formula variable response did not contain an atomic symbol');
		}
		return { ...payload, variables };
	}
	return payload;
}

export type FormulaSplitWritebackIssue =
	| 'equivalent-not-equation'
	| 'part-not-definition'
	| 'duplicate-definition'
	| 'definition-not-used';

export interface FormulaSplitWritebackAssessment {
	safe: boolean;
	issue?: FormulaSplitWritebackIssue;
}

/**
 * A split is safe to write only when it is a small equation system: the first
 * row is an equation, every component is a named definition, definition names
 * are unique, and every definition is referenced by the equivalent equation.
 * Explanatory fragments such as `1-d` remain renderable but cannot mutate the
 * source document.
 */
export function assessFormulaSplitWriteback(
	payload: Extract<ComposerFormulaAnnotationPayload, { detailKind: 'split' }>,
): FormulaSplitWritebackAssessment {
	const equivalent = parseEquation(payload.equivalentTex);
	if (!equivalent) return { safe: false, issue: 'equivalent-not-equation' };
	const names = new Set<string>();
	for (const part of payload.parts) {
		const definition = parseEquation(part.tex);
		if (!definition) return { safe: false, issue: 'part-not-definition' };
		const name = compactLatex(definition.left);
		if (names.has(name)) return { safe: false, issue: 'duplicate-definition' };
		names.add(name);
		if (!compactLatex(equivalent.right).includes(name)) {
			return { safe: false, issue: 'definition-not-used' };
		}
	}
	return { safe: true };
}

/** Serialize one safely accepted split as a self-contained display formula. */
export function buildFormulaSplitMarkdown(
	payload: Extract<ComposerFormulaAnnotationPayload, { detailKind: 'split' }>,
): string {
	const assessment = assessFormulaSplitWriteback(payload);
	if (!assessment.safe) {
		throw new Error(`unsafe formula split writeback: ${assessment.issue ?? 'unknown'}`);
	}
	const rows = [
		latexFromSource(payload.equivalentTex),
		...payload.parts.map((part) => latexFromSource(part.tex)),
	];
	const body = rows
		.map((row, index) => `  ${alignEquation(row)}${index < rows.length - 1 ? ' \\\\' : ''}`)
		.join('\n');
	return ['$$', '\\begin{aligned}', body, '\\end{aligned}', '$$'].join('\n');
}

function parseEquation(tex: string): { left: string; right: string } | null {
	const source = latexFromSource(tex);
	if (source.includes('\\begin{') || source.includes('\\end{')) return null;
	const first = source.indexOf('=');
	if (first <= 0 || first !== source.lastIndexOf('=') || first >= source.length - 1) {
		return null;
	}
	const left = source.slice(0, first).replace(/&/g, '').trim();
	const right = source.slice(first + 1).trim();
	if (!left || !right) return null;
	return { left, right };
}

function alignEquation(tex: string): string {
	const equation = parseEquation(tex);
	if (!equation) return tex;
	return `${equation.left}&=${equation.right}`;
}

function compactLatex(tex: string): string {
	return tex.replace(/\\left|\\right/g, '').replace(/\s+/g, '');
}

function isAtomicFormulaSymbol(tex: string): boolean {
	const source = compactLatex(tex);
	if (!source || /^[0-9.]/.test(source)) return false;
	if (/[=+\-]/.test(source)) return false;
	return !/\\(?:frac|sum|prod|int|begin|end)\b/.test(source);
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
