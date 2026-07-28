import * as React from 'react';
import type { ComposerFormulaAnnotationPayload } from '@/core/schemas/composer';
import { KatexFormula } from './KatexFormula';
import { formatMathCount, type MathConfig } from './mathConfig';

export function FormulaDetailBody({
	payload,
	label,
	config,
}: {
	payload: ComposerFormulaAnnotationPayload;
	label?: string;
	config: MathConfig;
}): React.ReactElement {
	if (payload.detailKind === 'explain') {
		return <FormulaExplainBody payload={payload} />;
	}
	if (payload.detailKind === 'split') {
		return <FormulaSplitBody payload={payload} config={config} />;
	}
	return <FormulaVariablesBody payload={payload} label={label} config={config} />;
}

function FormulaExplainBody({
	payload,
}: {
	payload: Extract<ComposerFormulaAnnotationPayload, { detailKind: 'explain' }>;
}): React.ReactElement {
	return (
		<div className="pk-formula-term-map" data-formula-detail-layout="explain">
			{payload.summary && <span className="pk-formula-term-map__summary">{payload.summary}</span>}
			{payload.terms.map((term, index) => (
				<div className="pk-formula-term" key={`${term.symbolTex}-${index}`}>
					<span className="pk-formula-term__index">{index + 1}</span>
					<KatexFormula latex={term.symbolTex} display={false} className="pk-formula-term__symbol" />
					<span className="pk-formula-term__arrow" aria-hidden>→</span>
					<span className="pk-formula-term__meaning">{term.meaning}</span>
				</div>
			))}
		</div>
	);
}

function FormulaSplitBody({
	payload,
	config,
}: {
	payload: Extract<ComposerFormulaAnnotationPayload, { detailKind: 'split' }>;
	config: MathConfig;
}): React.ReactElement {
	return (
		<div className="pk-formula-compare" data-formula-detail-layout="split">
			<div className="pk-formula-compare__section" data-side="original">
				<span className="pk-formula-compare__label">{config.detail.originalFormula}</span>
				<KatexFormula latex={payload.latex} display />
			</div>
			<span className="pk-formula-compare__arrow" aria-hidden>↓</span>
			<div className="pk-formula-compare__section" data-side="proposed">
				<span className="pk-formula-compare__label">{config.detail.splitFormula}</span>
				<KatexFormula latex={payload.equivalentTex} display />
				<div className="pk-formula-split-parts">
					{payload.parts.map((part, index) => (
						<div className="pk-formula-split-part" key={`${part.label}-${index}`}>
							<span className="pk-formula-split-part__label">{part.label}</span>
							<KatexFormula latex={part.tex} display />
							<span className="pk-formula-split-part__meaning">{part.contribution}</span>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}

function FormulaVariablesBody({
	payload,
	label,
	config,
}: {
	payload: Extract<ComposerFormulaAnnotationPayload, { detailKind: 'variables' }>;
	label?: string;
	config: MathConfig;
}): React.ReactElement {
	return (
		<div className="pk-formula-variable-group" role="table" data-formula-detail-layout="variables">
			<div className="pk-formula-variable-group__head" role="row">
				<span className="pk-formula-variable-group__identity">
					<span className="pk-formula-variable-group__dot" aria-hidden />
					<strong>{label ?? config.detail.variables}</strong>
					<small>{formatMathCount(config.detail.variablesCount, payload.variables.length)}</small>
				</span>
				<KatexFormula latex={payload.latex} display={false} className="pk-formula-variable-group__preview" />
			</div>
			<div className="pk-formula-variable-rows">
				{payload.variables.map((variable, index) => (
					<div className="pk-formula-variable-row" role="row" key={`${variable.symbolTex}-${index}`}>
						<span className="pk-formula-variable-symbol" role="cell">
							<KatexFormula latex={variable.symbolTex} display={false} />
							<small>{variable.role || config.detail.roleFallback}</small>
						</span>
						<span className="pk-formula-variable-meaning" role="cell">{variable.meaning}</span>
					</div>
				))}
			</div>
		</div>
	);
}
