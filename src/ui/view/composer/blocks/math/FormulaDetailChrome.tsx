import * as React from 'react';
import { Check, ChevronLeft, ChevronRight, History, RotateCcw, X } from 'lucide-react';
import { Button } from '@/ui/components/primitives';
import { getDetail } from '@/service/composer';
import type { ComposerFormulaDetailKind } from '@/core/schemas/composer';
import type { MathConfig } from './mathConfig';
import { formatMathCount, formatMathVariantCounter } from './mathConfig';

type DetailEntry = NonNullable<ReturnType<typeof getDetail>>;

export function FormulaDetailHeader({
	label,
	kind,
	count,
	counter,
	kept,
	applied,
	config,
}: {
	label?: string;
	kind: ComposerFormulaDetailKind;
	count: number;
	counter: string;
	kept: boolean;
	applied: boolean;
	config: MathConfig;
}): React.ReactElement {
	const strings = config.detail;
	const meta = detailMeta(kind, count, config);
	return (
		<div className="pk-formula-detail__head">
			<span className="pk-formula-detail__title">
				<span className="pk-formula-detail__dot" aria-hidden />
				{label ?? strings[kind]} · {strings[kind]}
			</span>
			<span className="pk-formula-detail__meta">{meta} · {counter}</span>
			{(kept || applied) && (
				<span className="pk-formula-detail__kept">
					<Check size={12} />
					{applied ? strings.splitApplied : strings.kept}
				</span>
			)}
		</div>
	);
}

function detailMeta(
	kind: ComposerFormulaDetailKind,
	count: number,
	config: MathConfig,
): string {
	if (kind === 'explain') return config.detail.explainMeta;
	if (kind === 'split') return config.detail.splitMeta;
	return formatMathCount(config.detail.variablesMeta, count);
}

export function FormulaDetailSkeleton({ config }: { config: MathConfig }): React.ReactElement {
	return (
		<div className="pk-formula-detail-skeleton" aria-label={config.detail.streaming}>
			<span />
			<span />
			<small>{config.detail.streaming}<span className="pk-formula-detail__caret" aria-hidden /></small>
		</div>
	);
}

export function FormulaDetailControls({
	entry,
	index,
	streaming,
	applying,
	instruction,
	historyOpen,
	canAccept,
	onInstruction,
	onSubmit,
	onAccept,
	onHistory,
	onPrevious,
	onNext,
	onClose,
	kind,
	kept,
	applied,
	config,
}: {
	entry: DetailEntry;
	index: number;
	streaming: boolean;
	applying: boolean;
	instruction: string;
	historyOpen: boolean;
	canAccept: boolean;
	onInstruction: (value: string) => void;
	onSubmit: () => void;
	onAccept: () => void;
	onHistory: () => void;
	onPrevious: () => void;
	onNext: () => void;
	onClose: () => void;
	kind: ComposerFormulaDetailKind;
	kept: boolean;
	applied: boolean;
	config: MathConfig;
}): React.ReactElement {
	const strings = config.detail;
	const acceptLabel = acceptedLabel(kind, kept, applied, config);
	return (
		<div className="pk-formula-detail__foot">
			<input
				type="text"
				className="pk-formula-detail__input"
				value={instruction}
				aria-label={strings.instruction}
				placeholder={strings.followUpPlaceholder}
				onChange={(event) => onInstruction(event.target.value)}
				onKeyDown={(event) => {
					if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
					event.preventDefault();
					onSubmit();
				}}
			/>
			<HistoryButton
				label={strings.history}
				open={historyOpen}
				disabled={entry.variants.length < 2}
				onClick={onHistory}
			/>
			{entry.variants.length >= 2 && (
				<VariantNavigation
					entry={entry}
					index={index}
					streaming={streaming}
					onPrevious={onPrevious}
					onNext={onNext}
					config={config}
				/>
			)}
			<Button
				variant="primary"
				size="sm"
				disabled={streaming || applying || kept || applied || !canAccept}
				onClick={onAccept}
			>
				<Check size={13} />
				{acceptLabel}
			</Button>
			<Button variant="ghost" size="sm" disabled={streaming || applying} onClick={onSubmit}>
				<RotateCcw size={13} />
				{strings.regenerate}
			</Button>
			<Button variant="ghost" size="sm" onClick={onClose}>
				<X size={13} />
				{strings.close}
			</Button>
		</div>
	);
}

function acceptedLabel(
	kind: ComposerFormulaDetailKind,
	kept: boolean,
	applied: boolean,
	config: MathConfig,
): string {
	if (kind === 'split') return applied ? config.detail.splitApplied : config.detail.applySplit;
	return kept ? config.detail.kept : config.detail.keep;
}

function HistoryButton({
	label,
	open,
	disabled,
	onClick,
}: {
	label: string;
	open: boolean;
	disabled: boolean;
	onClick: () => void;
}): React.ReactElement {
	return (
		<Button
			variant="ghost"
			size="sm"
			className="pk-formula-detail__history"
			aria-label={label}
			data-active={open || undefined}
			disabled={disabled}
			onClick={onClick}
		>
			<History size={13} />
		</Button>
	);
}

function VariantNavigation({
	entry,
	index,
	streaming,
	onPrevious,
	onNext,
	config,
}: {
	entry: DetailEntry;
	index: number;
	streaming: boolean;
	onPrevious: () => void;
	onNext: () => void;
	config: MathConfig;
}): React.ReactElement {
	const strings = config.detail;
	return (
		<span className="pk-formula-detail__nav">
			<Button variant="ghost" size="sm" aria-label={strings.prevVariant} disabled={streaming || index <= 0} onClick={onPrevious}>
				<ChevronLeft size={13} />
			</Button>
			<span className="pk-formula-detail__counter">
				{formatMathVariantCounter(strings.variantCounter, index + 1, entry.variants.length)}
			</span>
			<Button variant="ghost" size="sm" aria-label={strings.nextVariant} disabled={streaming || index >= entry.variants.length - 1} onClick={onNext}>
				<ChevronRight size={13} />
			</Button>
		</span>
	);
}

export function FormulaDetailHistory({
	entry,
	kind,
	storeSetVariant,
	onClose,
	config,
}: {
	entry: DetailEntry;
	kind: ComposerFormulaDetailKind;
	storeSetVariant: (variantId: string) => void;
	onClose: () => void;
	config: MathConfig;
}): React.ReactElement {
	return (
		<div className="pk-formula-detail-history" aria-label={config.detail.history}>
			{entry.variants.map((item, variantIndex) => (
				<Button
					key={item.variantId}
					variant="ghost"
					size="sm"
					data-active={item.variantId === entry.activeVariantId || undefined}
					onClick={() => {
						storeSetVariant(item.variantId);
						onClose();
					}}
				>
					<span>{formatMathVariantCounter(config.detail.variantCounter, variantIndex + 1, entry.variants.length)}</span>
					<small>{item.instruction ?? config.detail[kind]}</small>
					{item.status === 'ready' && <Check size={12} />}
				</Button>
			))}
		</div>
	);
}
