import * as React from 'react';
import { useStore } from 'zustand';
import { Check, ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import { Button } from '@/ui/components/primitives';
import { activeVariant, getDetail } from '@/service/composer';
import type { ComposerFormulaDetailKind } from '@/core/schemas/composer';
import type { FormulaDetailStore } from './formulaDetailStore';
import { formatMathVariantCounter, type MathConfig } from './mathConfig';

/**
 * Peak Composer — one formula detail panel (WP5, §10.2).
 *
 * Renders the active variant of ONE (formula, detailKind) result — explain/split
 * narrative or the variable table — with its own targeted follow-up field,
 * variant-history navigation, accept-keep-annotation and close. It reads and
 * mutates ONLY its own store entry, so panels are fully independent (no global
 * accordion, §3.3).
 */
export function FormulaDetailPanel({
	store,
	formulaId,
	kind,
	latex,
	label,
	config,
}: {
	store: FormulaDetailStore;
	formulaId: string;
	kind: ComposerFormulaDetailKind;
	latex: string;
	label?: string;
	config: MathConfig;
}): React.ReactElement | null {
	const model = useStore(store, (s) => s.model);
	const [instruction, setInstruction] = React.useState('');
	const entry = getDetail(model, formulaId, kind);
	if (!entry || !entry.open) return null;

	const strings = config.detail;
	const variant = activeVariant(entry);
	const streaming = store.getState().isStreaming(formulaId, kind);
	const index = entry.variants.findIndex((v) => v.variantId === entry.activeVariantId);

	const submitFollowUp = () => {
		if (streaming) return;
		const trimmed = instruction.trim();
		store.getState().followUp(formulaId, kind, latex, trimmed.length > 0 ? trimmed : undefined, label);
		setInstruction('');
	};

	return (
		<div className="pk-formula-detail" data-detail-kind={kind} data-chrome="true">
			<div className="pk-formula-detail__head">
				<span className="pk-formula-detail__title">{strings[kind]}</span>
				{entry.kept && <span className="pk-formula-detail__kept">✓</span>}
			</div>
			<div className="pk-formula-detail__body">
				<DetailBody entry={entry} variant={variant} streaming={streaming} config={config} />
			</div>
			<div className="pk-formula-detail__foot">
				<input
					type="text"
					className="pk-formula-detail__input"
					value={instruction}
					aria-label={strings.instruction}
					placeholder={strings.followUpPlaceholder}
					onChange={(e) => setInstruction(e.target.value)}
					onKeyDown={(e) => {
						if (e.key !== 'Enter') return;
						e.preventDefault();
						submitFollowUp();
					}}
				/>
				{entry.variants.length >= 2 && (
					<span className="pk-formula-detail__nav">
						<Button
							variant="ghost"
							size="sm"
							aria-label={strings.prevVariant}
							disabled={streaming || index <= 0}
							onClick={() => store.getState().setVariant(formulaId, kind, entry.variants[index - 1].variantId)}
						>
							<ChevronLeft size={13} />
						</Button>
						<span className="pk-formula-detail__counter">
							{formatMathVariantCounter(strings.variantCounter, index + 1, entry.variants.length)}
						</span>
						<Button
							variant="ghost"
							size="sm"
							aria-label={strings.nextVariant}
							disabled={streaming || index >= entry.variants.length - 1}
							onClick={() => store.getState().setVariant(formulaId, kind, entry.variants[index + 1].variantId)}
						>
							<ChevronRight size={13} />
						</Button>
					</span>
				)}
				<Button variant="secondary" size="sm" disabled={streaming} onClick={submitFollowUp}>
					<RotateCcw size={13} />
					{strings.regenerate}
				</Button>
				<Button variant="ghost" size="sm" disabled={entry.kept} onClick={() => store.getState().keep(formulaId, kind)}>
					<Check size={13} />
					{strings.keep}
				</Button>
				<Button variant="ghost" size="sm" onClick={() => store.getState().close(formulaId, kind)}>
					<X size={13} />
					{strings.close}
				</Button>
			</div>
		</div>
	);
}

function DetailBody({
	entry,
	variant,
	streaming,
	config,
}: {
	entry: ReturnType<typeof getDetail>;
	variant: ReturnType<typeof activeVariant>;
	streaming: boolean;
	config: MathConfig;
}): React.ReactElement {
	const strings = config.detail;
	if (streaming) {
		return (
			<span className="pk-formula-detail__stream">
				{variant?.streamingText || strings.streaming}
				<span aria-hidden className="pk-formula-detail__caret" />
			</span>
		);
	}
	if (variant?.status === 'failed') return <span className="pk-formula-detail__failed">{strings.failed}</span>;
	const payload = variant?.payload;
	if (!payload) return <span className="pk-formula-detail__muted">{strings.empty}</span>;
	if (payload.detailKind === 'variables') {
		const rows = payload.variables ?? [];
		if (rows.length === 0) return <span className="pk-formula-detail__muted">{strings.empty}</span>;
		return (
			<div className="pk-formula-vartable" role="table">
				<div role="row" className="pk-formula-vartable__head">
					<span role="columnheader">{strings.colSymbol}</span>
					<span role="columnheader">{strings.colMeaning}</span>
				</div>
				{rows.map((r, i) => (
					<div role="row" key={`${r.symbol}-${i}`}>
						<span role="cell" className="pk-formula-vartable__sym">{r.symbol}</span>
						<span role="cell">{r.meaning}</span>
					</div>
				))}
			</div>
		);
	}
	return <span className="pk-formula-detail__text">{payload.text || entry?.variants.at(-1)?.streamingText || ''}</span>;
}
