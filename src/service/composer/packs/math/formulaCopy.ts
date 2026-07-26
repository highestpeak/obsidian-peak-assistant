/**
 * Peak Composer — formula copy payloads (WP5, handoff §10.2).
 *
 * A formula copies in four formats in a fixed order: plain text, LaTeX source,
 * HTML/MathML, and the exact rendered image (§10.2). This module owns the three
 * text formats (framework-neutral, testable): the readable plain-text
 * approximation, the verbatim LaTeX, and the KaTeX HTML+MathML string. The image
 * is a DOM raster produced in the UI (shared Easy Copy `rasterize`), so it is
 * not expressible here — the UI wires it in as the fourth format.
 */

import katex from 'katex';
import { stripTexToText } from './formulaModel';

export type FormulaCopyKind = 'plain' | 'latex' | 'html' | 'image';

/** Fixed copy order for a formula (image handled by the UI raster). */
export const FORMULA_COPY_ORDER: readonly FormulaCopyKind[] = ['plain', 'latex', 'html', 'image'];

export interface FormulaCopyTextPayloads {
	plain: string;
	latex: string;
	/** KaTeX HTML with embedded MathML (self-contained, no external assets). */
	html: string;
}

/** Build the three text copy payloads for a formula's LaTeX. */
export function buildFormulaCopyPayloads(latex: string): FormulaCopyTextPayloads {
	return {
		plain: stripTexToText(latex),
		latex,
		html: renderFormulaHtml(latex),
	};
}

/** KaTeX HTML+MathML for a formula; never throws (renders an error node instead). */
export function renderFormulaHtml(latex: string): string {
	return katex.renderToString(latex, {
		throwOnError: false,
		displayMode: true,
		output: 'htmlAndMathml',
	});
}
