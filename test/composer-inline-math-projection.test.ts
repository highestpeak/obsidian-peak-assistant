/**
 * Inline math is a source-led blur projection: formulas become atomic KaTeX
 * views only outside editing, while the full original `$…$` bytes remain the
 * editing source. This checks the parser contract without a browser/React DOM.
 */
import { parseInlineProjection, type InlineProjectionPart } from '@/service/composer';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

function mathParts(source: string, base = 0): Extract<InlineProjectionPart, { kind: 'math' }>[] {
	return parseInlineProjection(source, base).filter(
		(part): part is Extract<InlineProjectionPart, { kind: 'math' }> => part.kind === 'math',
	);
}

function visibleText(parts: readonly InlineProjectionPart[]): string {
	return parts.map((part) => part.kind === 'math' ? part.latex : part.run.text).join('');
}

function run(): void {
	// The visual-parity fixture's three inline formulas — including spaces and
	// LaTex commands — become atoms and retain absolute source intervals.
	const source = '行内公式也要稳：阻尼系数 $d=0.85$、复杂度 $O(V+E)$、阈值 $\\tau \\ge 4.0$ 都应该能在同一段里自然排版。';
	const base = 431;
	const parts = parseInlineProjection(source, base);
	const formulas = mathParts(source, base);
	check('reference formulas: all three become math atoms', formulas.length === 3, String(formulas.length));
	check('reference formulas: exact design LaTeX remains intact', formulas.map((part) => part.latex).join('|') === 'd=0.85|O(V+E)|\\tau \\ge 4.0');
	check('reference formulas: absolute first interval is exact', formulas[0]?.sourceFrom === base + source.indexOf('$d=') && formulas[0]?.sourceTo === base + source.indexOf('$d=') + '$d=0.85$'.length);
	check('blur projection: formula delimiters are hidden', !visibleText(parts).includes('$'), visibleText(parts));
	check('focus source: projection never changes original bytes', source === '行内公式也要稳：阻尼系数 $d=0.85$、复杂度 $O(V+E)$、阈值 $\\tau \\ge 4.0$ 都应该能在同一段里自然排版。');

	const literals = 'escaped \\$x\\$; unmatched $x; display $$y$$; code `$z$`; pair $ok$.';
	const literalParts = parseInlineProjection(literals, 17);
	const literalFormulas = mathParts(literals, 17);
	check('escape/unbalanced/display/code: only valid non-code pair projects', literalFormulas.length === 1 && literalFormulas[0]?.latex === 'ok');
	check('escape/unbalanced/display/code: literal source stays visible', visibleText(literalParts).includes('\\$x\\$') && visibleText(literalParts).includes('$$y$$') && visibleText(literalParts).includes('$z$'));

	const styled = '**$bold$** and $plain$';
	const styledParts = parseInlineProjection(styled, 90);
	const styledMath = styledParts.filter((part): part is Extract<InlineProjectionPart, { kind: 'math' }> => part.kind === 'math');
	check('styled math: nested rich run retains both atom offsets', styledMath.length === 2 && styledMath[0]?.sourceFrom === 92 && styledMath[1]?.sourceFrom === 105);

	done('composer-inline-math-projection');
}

run();
