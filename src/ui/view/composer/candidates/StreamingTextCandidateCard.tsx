/**
 * Peak Composer — streaming text candidate card (WP3).
 *
 * Object-native review surface for `text-patch` candidates, per the
 * component-consistency contract (spec 2026-07-22 §Review family):
 *
 *   - the draft stays part of the document flow inside one restrained review
 *     frame: a readable streaming body above a fixed review footer;
 *   - streaming renders into the REAL candidate body with a live caret and
 *     turns complete bullet-only proposals into native list reading geometry;
 *   - the targeted-instruction field is always visible; Enter and the
 *     regenerate button are equivalent; the instruction freezes into the
 *     submitted variant and stays editable for the next one;
 *   - one candidate → NO version navigation (no useless disabled arrows);
 *     two or more → one segmented 30px control sharing the review buttons'
 *     height and vertical center;
 *   - while streaming: accept / repeat-regenerate / version navigation are
 *     disabled with reasons, the instruction stays editable, and discard acts
 *     as cancellation;
 *   - review controls are 30px high with `--pk-radius-md`; footer geometry is
 *     constant so state changes cause no layout shift.
 *
 * The card mutates NOTHING itself: every action goes through the
 * `ComposerCandidateRuntimePort` (accept → transaction hub → History/Undo).
 */

import * as React from 'react';
import { Check, ChevronLeft, ChevronRight, RefreshCw, RotateCcw, Sparkles, WandSparkles, X } from 'lucide-react';
import type { ComposerResultEnvelope } from '@/core/composer';
import type { ComposerTextPatchPayload } from '@/core/schemas/composer';
import { diffWords, type DiffSegment } from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import { cn } from '@/ui/react/lib/utils';
import { formatCandidateMeta, formatVariantCounter } from './candidateUiConfig';
import type { CandidateRendererProps } from './rendererRegistry';

const CONTROL = 'pk-text-candidate__control';

function activeVariantIndex(props: CandidateRendererProps): number {
	return props.candidate.variants.findIndex((v) => v.variantId === props.candidate.activeVariantId);
}

/**
 * The reviewable body text for a ready candidate. `text-patch` carries the
 * replacement prose directly; typed-object results (table-patch / chart-source)
 * carry a materialized string preview — the post-patch table markdown / the
 * fenced chart block — so the same streaming-text card shows a sensible
 * structured preview instead of the raw streamed JSON. Dispatch stays on the
 * typed `resultKind`, never a label.
 */
function readyText(props: CandidateRendererProps): string | null {
	const change = props.candidate.proposedChange;
	const envelope = change.result as ComposerResultEnvelope | undefined;
	if (!envelope) return null;
	if (envelope.resultKind === 'text-patch') {
		const payload = envelope.payload as ComposerTextPatchPayload;
		return typeof payload?.replacementText === 'string' ? payload.replacementText : null;
	}
	if (envelope.resultKind === 'table-patch') {
		const preview = (envelope.payload as { replacement?: unknown })?.replacement;
		return typeof preview === 'string' ? preview : null;
	}
	if (envelope.resultKind === 'chart-source') {
		const preview = (envelope.payload as { fencedSource?: unknown })?.fencedSource;
		return typeof preview === 'string' ? preview : null;
	}
	return null;
}

/**
 * Render a ready text-patch candidate as an in-place word diff (CMP-REV-02):
 * deleted words struck through at their original position, inserted words
 * highlighted — no whole-line duplicate. Falls back to plain replacement text
 * when no "before" source is available (non-text-patch, drifted revision, or no
 * resolver wired) or when nothing actually changed.
 */
function ReadyBody({ text, originalText }: { text: string; originalText: string | null }): React.ReactElement {
	const items = draftListItems(text);
	if (items) return <DraftList items={items} />;
	if (originalText === null || originalText === text) {
		return <span className="pk-text-candidate__text">{text}</span>;
	}
	const segments = diffWords(originalText, text);
	return (
		<span className="pk-text-candidate__text" data-diff="inplace">
			{segments.map((seg, i) => renderSegment(seg, i))}
		</span>
	);
}

/**
 * The Composer owns source fidelity; the review frame only gives a list-shaped
 * draft its native reading form. This deliberately recognizes a complete
 * bullet-only proposal and never attempts broad Markdown rendering.
 */
function draftListItems(text: string): string[] | null {
	const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
	if (lines.length === 0 || !lines.every((line) => /^(?:[-*•])\s+/.test(line))) return null;
	return lines.map((line) => line.replace(/^(?:[-*•])\s+/, ''));
}

function DraftList({ items }: { items: readonly string[] }): React.ReactElement {
	return (
		<ul className="pk-text-candidate__list">
			{items.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}
		</ul>
	);
}

function renderSegment(seg: DiffSegment, key: number): React.ReactElement {
	if (seg.kind === 'del') {
		return (
			<del key={key} className="pk-diff-del">
				{seg.text}
			</del>
		);
	}
	if (seg.kind === 'ins') {
		return (
			<ins key={key} className="pk-diff-ins">
				{seg.text}
			</ins>
		);
	}
	return <React.Fragment key={key}>{seg.text}</React.Fragment>;
}

function CandidateBody(props: CandidateRendererProps): React.ReactElement {
	const { strings, streamingText, candidate } = props;
	if (streamingText !== null) {
		// Empty while streaming = skeleton: either the first prose delta has not
		// arrived, or this is a typed-object run (table-patch / chart-source) whose
		// raw JSON is deliberately never shown as the body. Show a quiet progress
		// label + caret instead of a bare blinking caret or half-formed JSON.
		if (streamingText.length === 0) {
			return (
				<span className="pk-text-candidate__text pk-text-candidate__text--muted">
					{strings.streaming}
					<span aria-hidden="true" className="pk-text-candidate__caret animate-pulse" />
				</span>
			);
		}
		const items = draftListItems(streamingText);
		if (items) {
			return (
				<span className="pk-text-candidate__streaming-list">
					<DraftList items={items} />
					<span aria-hidden="true" className="pk-text-candidate__caret animate-pulse" />
				</span>
			);
		}
		return (
			<span className="pk-text-candidate__text">
				{streamingText}
				<span aria-hidden="true" className="pk-text-candidate__caret animate-pulse" />
			</span>
		);
	}
	if (candidate.status === 'failed') {
		return <span className="pk-text-candidate__text pk-text-candidate__text--error">{strings.failed}</span>;
	}
	if (candidate.status === 'stale') {
		return <span className="pk-text-candidate__text pk-text-candidate__text--muted">{strings.stale}</span>;
	}
	const text = readyText(props);
	if (text === null) {
		return <span className="pk-text-candidate__text pk-text-candidate__text--muted">{strings.streaming}</span>;
	}
	return <ReadyBody text={text} originalText={props.originalText ?? null} />;
}

function VariantNav(props: CandidateRendererProps & { disabled: boolean }): React.ReactElement | null {
	const { candidate, runtime, strings, disabled } = props;
	if (candidate.variants.length < 2) return null;
	const index = activeVariantIndex(props);
	const goTo = (next: number) => {
		const variant = candidate.variants[next];
		if (variant) runtime.setActiveVariant(candidate.candidateId, variant.variantId);
	};
	return (
		<span className="pk-text-candidate__variant-nav">
			<Button
				variant="ghost"
				className="pk-text-candidate__variant-btn"
				aria-label={strings.prevVariant}
				disabled={disabled || index <= 0}
				onClick={() => goTo(index - 1)}
			>
				<ChevronLeft size={14} />
			</Button>
			<span className="pk-text-candidate__variant-count">
				{formatVariantCounter(strings.variantCounter, index + 1, candidate.variants.length)}
			</span>
			<Button
				variant="ghost"
				className="pk-text-candidate__variant-btn"
				aria-label={strings.nextVariant}
				disabled={disabled || index >= candidate.variants.length - 1}
				onClick={() => goTo(index + 1)}
			>
				<ChevronRight size={14} />
			</Button>
		</span>
	);
}

export function StreamingTextCandidateCard(props: CandidateRendererProps): React.ReactElement {
	const { candidate, runtime, strings } = props;
	const [instruction, setInstruction] = React.useState('');
	const streaming = props.streamingText !== null;
	const acceptable = !streaming && candidate.status === 'ready';
	const regenerable = !streaming && (candidate.status === 'ready' || candidate.status === 'failed');
	const activeIndex = Math.max(0, activeVariantIndex(props)) + 1;
	const action = runtime.candidateLabelFor?.(candidate.candidateId) ?? strings.draftActionFallback;
	const statusTitle = streaming
		? strings.streamingTitle
		: candidate.status === 'failed'
			? strings.failed
			: candidate.status === 'stale'
				? strings.stale
				: strings.draftTitle;
	const statusMeta = formatCandidateMeta(
		streaming ? strings.streamingMeta : strings.draftMeta,
		action,
		activeIndex,
		candidate.variants.length,
	);

	const submitRegenerate = () => {
		if (!regenerable) return;
		const trimmed = instruction.trim();
		runtime.regenerate(candidate.candidateId, trimmed.length > 0 ? trimmed : undefined);
	};

	const handleDiscard = () => {
		// While streaming, discard doubles as cancellation (the runtime cancels
		// the in-flight run before dropping the candidate).
		runtime.discard(candidate.candidateId);
	};
	const rerunStale = () => {
		if (runtime.rerunStale) runtime.rerunStale(candidate.candidateId);
		else runtime.discard(candidate.candidateId);
	};

	return (
		<div
			data-candidate-id={candidate.candidateId}
			data-candidate-status={streaming ? 'streaming' : candidate.status}
			className="pk-text-candidate"
		>
			<div className="pk-text-candidate__body" aria-live="polite">
				<CandidateBody {...props} />
			</div>
			<div className="pk-text-candidate__footer">
				<div className="pk-text-candidate__status">
					<span className="pk-text-candidate__status-icon" aria-hidden="true">
						<Sparkles size={14} />
					</span>
					<span className="pk-text-candidate__status-copy">
						<strong>{statusTitle}</strong>
						<small>{statusMeta}</small>
					</span>
				</div>
				<label className="pk-text-candidate__instruction-wrap">
					<WandSparkles size={14} aria-hidden="true" />
					<input
						type="text"
						value={instruction}
						aria-label={strings.instructionAria}
						placeholder={strings.instructionPlaceholder}
						className="pk-text-candidate__instruction"
						onChange={(e) => setInstruction(e.target.value)}
						onKeyDown={(e) => {
							if (e.key !== 'Enter') return;
							e.preventDefault();
							submitRegenerate();
						}}
					/>
				</label>
				<div className="pk-text-candidate__actions">
					<VariantNav {...props} disabled={streaming || candidate.status === 'stale'} />
					{candidate.status === 'stale' ? (
						<Button variant="ghost" className={cn(CONTROL, 'pk-text-candidate__button', 'pk-text-candidate__button--quiet')} onClick={rerunStale}>
							<RefreshCw size={14} />
							{strings.rerun}
						</Button>
					) : (
						<Button
							variant="ghost"
							className={cn(CONTROL, 'pk-text-candidate__button', 'pk-text-candidate__button--quiet')}
							disabled={!regenerable}
							title={streaming ? strings.acceptDisabledStreaming : undefined}
							onClick={submitRegenerate}
						>
							<RotateCcw size={14} />
							{candidate.status === 'failed' ? strings.retry : strings.regenerate}
						</Button>
					)}
					<Button
						variant="primary"
						className={cn(CONTROL, 'pk-text-candidate__button pk-text-candidate__button--accept')}
						disabled={!acceptable}
						title={!acceptable ? strings.acceptDisabledStreaming : undefined}
						onClick={() => void runtime.accept(candidate.candidateId)}
					>
						<Check size={14} />
						{strings.accept}
					</Button>
					<Button
						variant="ghost"
						className={cn(CONTROL, 'pk-text-candidate__button', 'pk-text-candidate__button--quiet')}
						onClick={handleDiscard}
					>
						<X size={14} />
						{streaming ? strings.cancel : strings.discard}
					</Button>
				</div>
			</div>
		</div>
	);
}
