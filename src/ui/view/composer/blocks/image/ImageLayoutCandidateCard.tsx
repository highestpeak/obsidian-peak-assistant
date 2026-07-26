/**
 * Peak Composer — multi-image layout candidate card (WP7, CMP-IMG-08).
 *
 * Previews the proposed layout by rendering its Markdown-embeddable HTML in a
 * scoped container (the same HTML that lands in the document — vault paths, no
 * base64). A targeted instruction re-runs the AI smart layout; accept commits
 * the layout block through the transaction hub.
 */

import * as React from 'react';
import { LayoutGrid } from 'lucide-react';
import type { ComposerResultEnvelope } from '@/core/composer';
import type { ComposerImageLayoutPatchPayload } from '@/core/schemas/composer';
import type { CandidateRendererProps } from '../../candidates/rendererRegistry';
import { ImageReviewControls, useImageStrings } from './ImageReviewControls';

function layoutOf(props: CandidateRendererProps): ComposerImageLayoutPatchPayload | null {
	const envelope = props.candidate.proposedChange.result as ComposerResultEnvelope | undefined;
	if (!envelope || envelope.resultKind !== 'image-layout-patch') return null;
	return envelope.payload as ComposerImageLayoutPatchPayload;
}

export function ImageLayoutCandidateCard(props: CandidateRendererProps): React.ReactElement {
	const strings = useImageStrings();
	const { candidate, runtime, streamingText } = props;
	const streaming = streamingText !== null || runtime.isStreaming(candidate.candidateId);
	const [instruction, setInstruction] = React.useState('');
	const payload = layoutOf(props);

	const submit = (): void => {
		const trimmed = instruction.trim();
		runtime.regenerate(candidate.candidateId, trimmed.length > 0 ? trimmed : undefined);
	};

	return (
		<span data-candidate-id={candidate.candidateId} className="flex flex-col gap-2 py-1">
			<span className="px-3 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
				<LayoutGrid size={12} />
				{payload ? `${payload.layout.mode} · ${payload.layout.items.length}` : strings.generating}
			</span>
			{payload ? (
				<span
					className="mx-3 rounded-[var(--pk-radius-md)] border border-[var(--background-modifier-border)] p-2 overflow-hidden"
					// The exact HTML that will be committed (vault paths, no base64).
					dangerouslySetInnerHTML={{ __html: payload.html }}
				/>
			) : (
				<span className="mx-3 h-[80px] rounded-[var(--pk-radius-md)] bg-[var(--background-secondary)] animate-pulse" />
			)}
			<span className="mx-3 border-t border-[var(--background-modifier-border)]" aria-hidden="true" />
			<ImageReviewControls
				candidate={candidate}
				runtime={runtime}
				strings={strings}
				streaming={streaming}
				instruction={{ value: instruction, onChange: setInstruction, placeholder: strings.editInstructionPlaceholder, aria: strings.editInstructionAria }}
				onRegenerate={submit}
				acceptable={!streaming && candidate.status === 'ready'}
				regenerable={!streaming && (candidate.status === 'ready' || candidate.status === 'failed')}
			/>
		</span>
	);
}
