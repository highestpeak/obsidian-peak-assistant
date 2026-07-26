/**
 * Peak Composer — formula parsing (WP5, handoff §10.2).
 *
 * Splits a `math` block's verbatim source into its constituent display formulas
 * — one `$$…$$` segment each, with byte offsets RELATIVE to the block source so
 * a selection target can address exactly one formula (§3.3: clicking PageRank
 * operates on PageRank only). A block usually holds one formula; the mock's
 * three-formula stack is handled by the same scan. Byte content is never
 * re-serialized. Framework-neutral: no `obsidian` import.
 */

export interface ParsedFormula {
	/** Stable-within-block id: `f{ordinal}`. */
	id: string;
	ordinal: number;
	/** Inner TeX (delimiters stripped, trimmed). */
	latex: string;
	/** Short display label derived from the equation head (or `Formula n`). */
	label: string;
	/** Byte range of the whole `$$…$$` segment within the block source. */
	from: number;
	to: number;
}

const FORMULA_RE = /\$\$([\s\S]*?)\$\$/g;

/** Parse a math block source into its display formulas (in document order). */
export function parseFormulaBlock(blockSource: string): ParsedFormula[] {
	const out: ParsedFormula[] = [];
	let ordinal = 0;
	for (const m of blockSource.matchAll(FORMULA_RE)) {
		const latex = m[1].trim();
		if (latex.length === 0) continue;
		out.push({
			id: `f${ordinal}`,
			ordinal,
			latex,
			label: deriveFormulaLabel(latex, ordinal),
			from: m.index ?? 0,
			to: (m.index ?? 0) + m[0].length,
		});
		ordinal += 1;
	}
	return out;
}

/**
 * Derive a short label from the equation head (LHS of the first top-level `=`),
 * stripped of TeX noise. Falls back to `Formula n` (1-based) when there is no
 * usable head. Deterministic — no AI.
 */
export function deriveFormulaLabel(latex: string, ordinal: number): string {
	const eq = latex.indexOf('=');
	const head = eq > 0 ? latex.slice(0, eq) : '';
	const cleaned = stripTexToText(head).trim();
	if (cleaned.length > 0 && cleaned.length <= 24) return cleaned;
	return `Formula ${ordinal + 1}`;
}

/** Rough TeX → readable text: resolve a small symbol set, drop commands/braces. */
export function stripTexToText(tex: string): string {
	return tex
		.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '($1)/($2)')
		.replace(/\\sqrt\s*\{([^{}]*)\}/g, 'sqrt($1)')
		.replace(/\\sum/g, 'Σ')
		.replace(/\\prod/g, 'Π')
		.replace(/\\int/g, '∫')
		.replace(/\\infty/g, '∞')
		.replace(/\\in\b/g, '∈')
		.replace(/\\ge\b/g, '≥')
		.replace(/\\le\b/g, '≤')
		.replace(/\\times/g, '×')
		.replace(/\\cdot/g, '·')
		.replace(/\\Delta/g, 'Δ')
		.replace(/\\Sigma/g, 'Σ')
		.replace(/\\alpha/g, 'α')
		.replace(/\\beta/g, 'β')
		.replace(/\\tau/g, 'τ')
		.replace(/\\[a-zA-Z]+/g, ' ') // drop remaining commands
		.replace(/[{}]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}
