/**
 * Peak Composer — image-asset candidate card (WP7, CMP-IMG-01/02/06/07).
 *
 * Reviews a proposed image asset: paste rename review, Converter result, or an
 * AI 改图 generation. Shows a live preview (from the vault resource path — never
 * base64), a dimensions/size line, and either a filename field (paste/convert)
 * or an edit-instruction field (ai-edit). While a generation streams it renders
 * a skeleton; version navigation pages through rename versions / AI variants.
 *
 * Renders NO internal wording ("program cleanup / AI candidate" etc.) — the copy
 * is plain and user-facing (handoff §10.7).
 */

import * as React from 'react';
import { ImageIcon, RefreshCw, X } from 'lucide-react';
import type { ComposerResultEnvelope } from '@/core/composer';
import type { ComposerImageAssetCandidatePayload } from '@/core/schemas/composer';
import { Button } from '@/ui/components/primitives';
import type { CandidateRendererProps } from '../../candidates/rendererRegistry';
import { ImageReviewControls, useImageStrings } from './ImageReviewControls';
import { formatDimensions } from './imageUiConfig';

const CONTROL = 'h-[30px] rounded-[var(--pk-radius-md)]';

function payloadOf(props: CandidateRendererProps): ComposerImageAssetCandidatePayload | null {
	const envelope = props.candidate.proposedChange.result as ComposerResultEnvelope | undefined;
	if (!envelope || envelope.resultKind !== 'image-asset-candidate') return null;
	return envelope.payload as ComposerImageAssetCandidatePayload;
}

function Preview(props: { payload: ComposerImageAssetCandidatePayload; dimsTemplate: string }): React.ReactElement {
	const { payload, dimsTemplate } = props;
	return (
		<span className="flex items-center gap-3 px-3">
			<img
				src={payload.previewUri}
				alt=""
				className="max-h-[120px] max-w-[180px] rounded-[var(--pk-radius-md)] border border-[var(--background-modifier-border)] object-contain"
			/>
			<span className="flex flex-col gap-0.5 text-xs text-[var(--text-muted)]">
				<span className="inline-flex items-center gap-1">
					<ImageIcon size={12} />
					{payload.mimeType}
				</span>
				<span className="tabular-nums">{formatDimensions(dimsTemplate, payload.width, payload.height, payload.byteSize)}</span>
			</span>
		</span>
	);
}

function Skeleton(): React.ReactElement {
	return (
		<span className="mx-3 flex h-[120px] items-center justify-center rounded-[var(--pk-radius-md)] bg-[var(--background-secondary)] animate-pulse">
			<RefreshCw size={18} className="text-[var(--text-muted)] animate-spin" />
		</span>
	);
}

export function ImageAssetCandidateCard(props: CandidateRendererProps): React.ReactElement {
	const strings = useImageStrings();
	const { candidate, runtime, streamingText } = props;
	const streaming = streamingText !== null || runtime.isStreaming(candidate.candidateId);
	const payload = payloadOf(props);
	const [name, setName] = React.useState('');
	const [instruction, setInstruction] = React.useState('');

	if (candidate.status === 'stale') {
		const handleRerun = (): void => {
			if (runtime.rerunStale) runtime.rerunStale(candidate.candidateId);
			else runtime.discard(candidate.candidateId);
		};
		return (
			<span data-candidate-id={candidate.candidateId} data-candidate-stale className="flex flex-col gap-2 py-1">
				<span className="px-3 text-[var(--text-muted)]">{strings.stale}</span>
				<span className="flex items-center gap-1.5 px-3">
					<Button variant="secondary" className={`${CONTROL} px-2 gap-1`} onClick={handleRerun}>
						<RefreshCw size={14} />
						{strings.rerun}
					</Button>
					<Button variant="ghost" className={`${CONTROL} px-2 gap-1`} onClick={() => runtime.discard(candidate.candidateId)}>
						<X size={14} />
						{strings.discard}
					</Button>
				</span>
			</span>
		);
	}

	const isAiEdit = payload?.intent === 'ai-edit';
	const renameField = payload?.fileName;

	const submit = (): void => {
		if (isAiEdit) {
			const trimmed = instruction.trim();
			runtime.regenerate(candidate.candidateId, trimmed.length > 0 ? trimmed : undefined);
			return;
		}
		const trimmed = name.trim();
		runtime.regenerate(candidate.candidateId, trimmed.length > 0 ? trimmed : undefined);
	};

	const instructionField = isAiEdit
		? { value: instruction, onChange: setInstruction, placeholder: strings.editInstructionPlaceholder, aria: strings.editInstructionAria }
		: renameField
			? { value: name, onChange: setName, placeholder: strings.namePlaceholder, aria: strings.nameAria }
			: undefined;

	return (
		<span data-candidate-id={candidate.candidateId} className="flex flex-col gap-2 py-1">
			{streaming || !payload ? <Skeleton /> : <Preview payload={payload} dimsTemplate={strings.dimensionsTemplate} />}
			<span className="mx-3 border-t border-[var(--background-modifier-border)]" aria-hidden="true" />
			<ImageReviewControls
				candidate={candidate}
				runtime={runtime}
				strings={strings}
				streaming={streaming}
				{...(instructionField ? { instruction: instructionField } : {})}
				onRegenerate={submit}
				acceptable={!streaming && candidate.status === 'ready'}
				regenerable={!streaming && (candidate.status === 'ready' || candidate.status === 'failed')}
			/>
		</span>
	);
}
