/** Read-only candidate card for source explanations; it deliberately has no accept action. */

import * as React from 'react';
import { RefreshCw, RotateCcw, Sparkles, X } from 'lucide-react';
import type { ComposerResultEnvelope } from '@/core/composer';
import type { ComposerAnalysisPayload } from '@/core/schemas/composer';
import { Button } from '@/ui/components/primitives';
import type { CandidateRendererProps } from './rendererRegistry';

function analysisText(props: CandidateRendererProps): string | null {
	if (props.streamingText !== null) return props.streamingText;
	const result = props.candidate.proposedChange.result as ComposerResultEnvelope | undefined;
	if (result?.resultKind !== 'analysis') return null;
	const payload = result.payload as ComposerAnalysisPayload;
	return typeof payload.content === 'string' ? payload.content : null;
}

export function AnalysisCandidateCard(props: CandidateRendererProps): React.ReactElement {
	const text = analysisText(props);
	const streaming = props.streamingText !== null;
	const activeVariant = props.candidate.variants.find(
		(variant) => variant.variantId === props.candidate.activeVariantId,
	);
	const body = text
		|| (streaming
			? props.strings.analysisStreaming
			: props.candidate.status === 'failed'
				? activeVariant?.error ?? props.strings.failed
				: props.candidate.status === 'cancelled'
					? props.strings.cancelled
					: props.candidate.status === 'stale'
						? props.strings.stale
						: props.strings.analysisStreaming);
	const retry = () => {
		if (props.candidate.status === 'stale') {
			props.runtime.rerunStale?.(props.candidate.candidateId);
			return;
		}
		props.runtime.regenerate(props.candidate.candidateId);
	};
	return (
		<article
			className="pk-analysis-candidate"
			data-candidate-id={props.candidate.candidateId}
			data-candidate-status={streaming ? 'streaming' : props.candidate.status}
			data-streaming={streaming || undefined}
		>
			<header className="pk-analysis-candidate__head">
				<span className="pk-analysis-candidate__title"><Sparkles size={14} />{props.strings.analysisTitle}</span>
				<Button variant="ghost" size="sm" onClick={() => props.runtime.discard(props.candidate.candidateId)}>
					<X size={13} />
					{props.strings.analysisClose}
				</Button>
			</header>
			<div className="pk-analysis-candidate__body" aria-live="polite">
				{body}
				{streaming ? <span aria-hidden="true" className="pk-analysis-candidate__caret animate-pulse" /> : null}
			</div>
			<footer className="pk-analysis-candidate__actions">
				{streaming ? (
					<Button variant="ghost" size="sm" onClick={() => props.runtime.cancel(props.candidate.candidateId)}>
						<X size={13} />
						{props.strings.cancel}
					</Button>
				) : null}
				{props.candidate.status === 'failed' || props.candidate.status === 'cancelled' ? (
					<Button variant="ghost" size="sm" onClick={retry}>
						<RotateCcw size={13} />
						{props.strings.retry}
					</Button>
				) : null}
				{props.candidate.status === 'stale' ? (
					<Button variant="ghost" size="sm" onClick={retry}>
						<RefreshCw size={13} />
						{props.strings.rerun}
					</Button>
				) : null}
			</footer>
		</article>
	);
}
