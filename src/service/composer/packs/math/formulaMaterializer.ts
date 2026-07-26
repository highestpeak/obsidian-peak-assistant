/**
 * Peak Composer — formula annotation materializer (WP5, handoff §10.2 / §11.4).
 *
 * Turns one formula detail run's streamed text into a typed `formula-annotation`
 * envelope. All three detail kinds share the ONE result kind (so validateBindings
 * has a single materializer); the per-definition `resultContext.detailKind` hint
 * selects the layout — explain/split keep the narrative text, variables parse the
 * streamed rows into a symbol→meaning table. Formula details are analyze results
 * (§10.2 accept-keep-annotation / close), so there is no writeback adapter.
 * Framework-neutral: no `obsidian` import.
 */

import type {
	ComposerFormulaAnnotationPayload,
	ComposerFormulaDetailKind,
	ComposerFormulaVariable,
} from '@/core/schemas/composer';
import {
	ComposerFormulaAnnotationPayloadSchema,
	ComposerFormulaDetailKindSchema,
} from '@/core/schemas/composer';
import type { ComposerResultEnvelope } from '@/core/composer';
import { COMPOSER_FORMULA_ANNOTATION_RENDERER_ID } from '@/core/composer';
import type { ComposerResultMaterializer, MaterializeArgs } from '../../capabilities/resultMaterializers';

/** Extract inner TeX from a `$$…$$` (or bare) formula source slice. */
export function latexFromSource(source: string): string {
	const trimmed = source.trim();
	const stripped = trimmed.replace(/^\$\$/, '').replace(/\$\$$/, '');
	return stripped.trim();
}

const VARIABLE_LINE_RE = /^\s*(?:[-*]\s*)?(.+?)\s*(?:—|--|:|=|\t)\s*(.+?)\s*$/;

/**
 * Parse streamed text into variable rows. Accepts `symbol — meaning`,
 * `symbol: meaning`, `symbol = meaning`, or tab-separated. Lenient: lines
 * without a separator are skipped.
 */
export function parseVariableTable(text: string): ComposerFormulaVariable[] {
	const out: ComposerFormulaVariable[] = [];
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line.length === 0) continue;
		const m = VARIABLE_LINE_RE.exec(line);
		if (!m) continue;
		const symbol = m[1].trim();
		const meaning = m[2].trim();
		if (symbol.length === 0 || meaning.length === 0) continue;
		out.push({ symbol, meaning });
	}
	return out;
}

/** Build a `formula-annotation` payload for a detail kind from streamed text. */
export function buildFormulaAnnotationPayload(
	detailKind: ComposerFormulaDetailKind,
	latex: string,
	text: string,
): ComposerFormulaAnnotationPayload {
	if (detailKind === 'variables') {
		return ComposerFormulaAnnotationPayloadSchema.parse({
			detailKind,
			latex,
			variables: parseVariableTable(text),
		});
	}
	return ComposerFormulaAnnotationPayloadSchema.parse({ detailKind, latex, text: text.trim() });
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
