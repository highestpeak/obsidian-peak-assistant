/**
 * Peak Composer — image caption (annotation) candidate card (WP7, CMP-IMG-05).
 *
 * Streams the caption into the review body with a live caret, then shows the
 * ready caption. The caption belongs to the SAME image block (the accepted patch
 * rebuilds that block) — this card never implies a separate prose block. A
 * targeted instruction refines the caption via regenerate.
 */

import * as React from 'react';
import type { ComposerResultEnvelope } from '@/core/composer';
import type { ComposerImageAnnotationPatchPayload } from '@/core/schemas/composer';
import type { CandidateRendererProps } from '../../candidates/rendererRegistry';
import { ImageReviewControls, useImageStrings } from './ImageReviewControls';

function captionOf(props: CandidateRendererProps): string | null {
	const envelope = props.candidate.proposedChange.result as ComposerResultEnvelope | undefined;
	if (!envelope || envelope.resultKind !== 'image-annotation-patch') return null;
	return (envelope.payload as ComposerImageAnnotationPatchPayload).caption ?? '';
}

export function ImageAnnotationCandidateCard(props: CandidateRendererProps): React.ReactElement {
	const strings = useImageStrings();
	const { candidate, runtime, streamingText } = props;
	const streaming = streamingText !== null || runtime.isStreaming(candidate.candidateId);
	const [instruction, setInstruction] = React.useState('');
	const caption = streamingText ?? captionOf(props) ?? '';

	const submit = (): void => {
		const trimmed = instruction.trim();
		runtime.regenerate(candidate.candidateId, trimmed.length > 0 ? trimmed : undefined);
	};

	return (
		<span data-candidate-id={candidate.candidateId} className="flex flex-col gap-2 py-1">
			<span className="px-3 leading-relaxed text-[var(--text-normal)] italic">
				{caption.length > 0 ? caption : <span className="text-[var(--text-muted)] not-italic">{streaming ? strings.generating : ''}</span>}
				{streaming ? (
					<span aria-hidden="true" className="inline-block w-[1px] h-[1.1em] align-text-bottom bg-[var(--text-normal)] animate-pulse" />
				) : null}
			</span>
			<span className="mx-3 border-t border-[var(--background-modifier-border)]" aria-hidden="true" />
			<ImageReviewControls
				candidate={candidate}
				runtime={runtime}
				strings={strings}
				streaming={streaming}
				instruction={{ value: instruction, onChange: setInstruction, placeholder: strings.captionPlaceholder, aria: strings.captionAria }}
				onRegenerate={submit}
				acceptable={!streaming && candidate.status === 'ready'}
				regenerable={!streaming && (candidate.status === 'ready' || candidate.status === 'failed')}
			/>
		</span>
	);
}
