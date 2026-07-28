import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComposerFormulaAnnotationPayload } from '@/core/schemas/composer';
import { FormulaDetailBody } from '@/ui/view/composer/blocks/math/FormulaDetailBody';
import { DEFAULT_MATH_CONFIG } from '@/ui/view/composer/blocks/math/mathConfig';
import { makeChecker } from './helpers/composer-fakes';

const { check, done } = makeChecker();

function render(payload: ComposerFormulaAnnotationPayload): string {
	return renderToStaticMarkup(React.createElement(FormulaDetailBody, {
		payload,
		label: 'PageRank',
		config: DEFAULT_MATH_CONFIG,
	}));
}

const explain = render({
	detailKind: 'explain',
	latex: 'PR(A)=x+y',
	summary: 'Balances a base value and link contribution.',
	terms: [
		{ symbolTex: 'PR(A)', meaning: 'Page importance' },
		{ symbolTex: 'd', meaning: 'Damping factor' },
	],
});
check('explain uses the typed term-map layout', explain.includes('data-formula-detail-layout="explain"'));
check('explain renders every symbol as a math atom', (explain.match(/data-formula-render/g) ?? []).length === 2);
check('explain exposes no model Markdown markers', !explain.includes('**'));

const split = render({
	detailKind: 'split',
	latex: 'PR(A)=x+y',
	equivalentTex: 'PR(A)=B+V(A)',
	parts: [
		{ label: 'Base', tex: 'B=x', contribution: 'Base probability' },
		{ label: 'Vote', tex: 'V(A)=y', contribution: 'Incoming contribution' },
	],
});
check('split uses the vertical typed comparison layout', split.includes('data-formula-detail-layout="split"'));
check('split renders original, equivalent and every part as math', (split.match(/data-formula-render/g) ?? []).length === 4);
check('split carries component labels and contributions', split.includes('Base') && split.includes('Incoming contribution'));

const variables = render({
	detailKind: 'variables',
	latex: 'PR(A)=x+y',
	variables: [
		{ symbolTex: 'PR(A)', role: 'output', meaning: 'Page importance' },
		{ symbolTex: 'd', role: 'parameter', meaning: 'Damping factor' },
	],
});
check('variables uses the formula-local table layout', variables.includes('data-formula-detail-layout="variables"'));
check('variables renders preview and symbols as math', (variables.match(/data-formula-render/g) ?? []).length === 3);
check('variables preserves semantic role chips', variables.includes('output') && variables.includes('parameter'));
check('variables states the clicked formula identity', variables.includes('PageRank'));

done('composer-formula-structured-ui');
