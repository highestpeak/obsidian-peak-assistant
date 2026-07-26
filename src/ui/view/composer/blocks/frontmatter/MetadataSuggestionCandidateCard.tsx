import * as React from 'react';
import { Check, RotateCcw, X } from 'lucide-react';
import type { ComposerResultEnvelope } from '@/core/composer';
import type { ComposerMetadataFieldPatchPayload } from '@/core/schemas/composer';
import { Button } from '@/ui/components/primitives';
import type { CandidateRendererProps } from '../../candidates/rendererRegistry';

/**
 * Peak Composer — metadata-field-patch candidate card (WP5).
 *
 * The generic candidate-host renderer for an AI property suggestion when it is
 * invoked through the block-row projection (the frontmatter block's own AI panel
 * is the richer entrance). Shows the proposed field with a shape-change review
 * hint, and accepts through the transaction hub only on confirm (§8.3/§8.4).
 */
const CONTROL = 'h-[30px] rounded-[var(--pk-radius-md)]';

function readyPayload(props: CandidateRendererProps): ComposerMetadataFieldPatchPayload | null {
	const envelope = props.candidate.proposedChange.result as ComposerResultEnvelope | undefined;
	if (!envelope || envelope.resultKind !== 'metadata-field-patch') return null;
	return envelope.payload as ComposerMetadataFieldPatchPayload;
}

export function MetadataSuggestionCandidateCard(props: CandidateRendererProps): React.ReactElement {
	const { candidate, runtime, strings, streamingText } = props;
	const streaming = streamingText !== null;
	const payload = readyPayload(props);
	const acceptable = !streaming && candidate.status === 'ready' && payload !== null;

	return (
		<span data-candidate-id={candidate.candidateId} className="flex flex-col gap-2 py-1">
			<span className="px-3 leading-relaxed">
				{streaming && <span className="whitespace-pre-wrap text-[var(--text-normal)]">{streamingText}</span>}
				{!streaming && payload && (
					<span className="text-[var(--text-normal)]">
						<b>{payload.key}</b>: {Array.isArray(payload.value) ? payload.value.join(', ') : String(payload.value)}
						{payload.evidence ? <small className="ml-1 text-[var(--text-muted)]"> · {payload.evidence}</small> : null}
						{payload.requiresReview ? <small className="ml-1 text-[var(--text-warning)]"> · ⚠</small> : null}
					</span>
				)}
				{!streaming && !payload && <span className="text-[var(--text-muted)]">{strings.streaming}</span>}
			</span>
			<span className="mx-3 border-t border-[var(--background-modifier-border)]" aria-hidden />
			<span className="flex items-center gap-1.5 px-3 flex-wrap">
				<Button variant="secondary" className={`${CONTROL} px-2 gap-1`} disabled={streaming} onClick={() => runtime.regenerate(candidate.candidateId)}>
					<RotateCcw size={14} />
					{strings.regenerate}
				</Button>
				<Button variant="primary" className={`${CONTROL} px-2 gap-1`} disabled={!acceptable} onClick={() => void runtime.accept(candidate.candidateId)}>
					<Check size={14} />
					{strings.accept}
				</Button>
				<Button variant="ghost" className={`${CONTROL} px-2 gap-1`} onClick={() => runtime.discard(candidate.candidateId)}>
					<X size={14} />
					{streaming ? strings.cancel : strings.discard}
				</Button>
			</span>
		</span>
	);
}
