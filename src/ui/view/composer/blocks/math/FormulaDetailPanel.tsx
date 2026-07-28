import * as React from 'react';
import { useStore } from 'zustand';
import { activeVariant, getDetail } from '@/service/composer';
import type {
	ComposerFormulaAnnotationPayload,
	ComposerFormulaDetailKind,
} from '@/core/schemas/composer';
import type { FormulaDetailStore } from './formulaDetailStore';
import { FormulaDetailBody } from './FormulaDetailBody';
import {
	FormulaDetailControls,
	FormulaDetailHeader,
	FormulaDetailHistory,
	FormulaDetailSkeleton,
} from './FormulaDetailChrome';
import { formatMathVariantCounter, type MathConfig } from './mathConfig';

type SplitPayload = Extract<ComposerFormulaAnnotationPayload, { detailKind: 'split' }>;

/**
 * One independently reviewable typed formula result. The model's transport
 * JSON never reaches this component: ready variants contain validated payloads,
 * while in-flight variants render a local structured skeleton.
 */
export function FormulaDetailPanel({
	store,
	formulaId,
	kind,
	latex,
	label,
	contextText,
	config,
	onApplySplit,
}: {
	store: FormulaDetailStore;
	formulaId: string;
	kind: ComposerFormulaDetailKind;
	latex: string;
	label?: string;
	contextText?: string;
	config: MathConfig;
	onApplySplit?: (payload: SplitPayload) => Promise<void>;
}): React.ReactElement | null {
	const model = useStore(store, (state) => state.model);
	const [instruction, setInstruction] = React.useState('');
	const [historyOpen, setHistoryOpen] = React.useState(false);
	const [applying, setApplying] = React.useState(false);
	const [applyError, setApplyError] = React.useState<string | null>(null);
	const entry = getDetail(model, formulaId, kind);
	if (!entry || !entry.open) return null;

	const strings = config.detail;
	const variant = activeVariant(entry);
	const streaming = store.getState().isStreaming(formulaId, kind);
	const index = entry.variants.findIndex((item) => item.variantId === entry.activeVariantId);
	const counter = formatMathVariantCounter(strings.variantCounter, index + 1, entry.variants.length);
	const payload = variant?.payload;

	const submitFollowUp = () => {
		if (streaming) return;
		const trimmed = instruction.trim();
		store.getState().followUp(
			formulaId,
			kind,
			latex,
			trimmed.length > 0 ? trimmed : undefined,
			label,
			contextText,
		);
		setApplyError(null);
	};

	const accept = async () => {
		if (!payload || streaming || applying) return;
		if (payload.detailKind !== 'split') {
			store.getState().keep(formulaId, kind);
			return;
		}
		if (!onApplySplit) return;
		setApplying(true);
		setApplyError(null);
		try {
			await onApplySplit(payload);
			store.getState().keep(formulaId, kind);
		} catch {
			setApplyError(strings.applyFailed);
		} finally {
			setApplying(false);
		}
	};

	return (
		<div className="pk-formula-detail" data-detail-kind={kind} data-chrome="true">
			<FormulaDetailHeader
				label={label}
				kind={kind}
				count={payload?.detailKind === 'variables' ? payload.variables.length : 0}
				counter={counter}
				kept={entry.kept}
				config={config}
			/>
			<div className="pk-formula-detail__body">
				{streaming && <FormulaDetailSkeleton config={config} />}
				{!streaming && variant?.status === 'failed' && (
					<span className="pk-formula-detail__failed">{strings.failed}</span>
				)}
				{!streaming && variant?.status !== 'failed' && payload && (
					<FormulaDetailBody payload={payload} label={label} config={config} />
				)}
				{!streaming && variant?.status !== 'failed' && !payload && (
					<span className="pk-formula-detail__muted">{strings.empty}</span>
				)}
			</div>
			{applyError && <span className="pk-formula-detail__error">{applyError}</span>}
			<FormulaDetailControls
				entry={entry}
				index={index}
				streaming={streaming}
				applying={applying}
				instruction={instruction}
				historyOpen={historyOpen}
				canAccept={Boolean(payload && (payload.detailKind !== 'split' || onApplySplit))}
				onInstruction={setInstruction}
				onSubmit={submitFollowUp}
				onAccept={() => void accept()}
				onHistory={() => setHistoryOpen((open) => !open)}
				onPrevious={() => store.getState().setVariant(formulaId, kind, entry.variants[index - 1].variantId)}
				onNext={() => store.getState().setVariant(formulaId, kind, entry.variants[index + 1].variantId)}
				onClose={() => store.getState().close(formulaId, kind)}
				kind={kind}
				kept={entry.kept}
				config={config}
			/>
			{historyOpen && entry.variants.length > 1 && (
				<FormulaDetailHistory
					entry={entry}
					kind={kind}
					storeSetVariant={(variantId) => store.getState().setVariant(formulaId, kind, variantId)}
					onClose={() => setHistoryOpen(false)}
					config={config}
				/>
			)}
		</div>
	);
}
