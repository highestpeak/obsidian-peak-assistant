/**
 * Peak Composer — native-file-patch candidate card (WP-INT, WP8 §10.12).
 *
 * Structured review surface for a `native-file-patch` candidate (a Base / Canvas
 * / Excalidraw structural edit). Unlike the streaming-text card there is no prose
 * body: the model's typed patch never renders as raw JSON. Instead the card shows
 *
 *   - a format + file-name header (which native object is being edited);
 *   - a per-op change summary derived by the pure `describeNativePatches` mapping
 *     (the materializer computed it — this card only lays it out);
 *   - or, when the patch could not be applied (compressed-json Excalidraw, an
 *     out-of-range patch), the fail-closed reason with accept disabled.
 *
 * Every action goes through the `ComposerCandidateRuntimePort`: accept routes to
 * the runtime's revision-guarded native-file port write (NOT the Markdown hub),
 * so the card itself mutates nothing. Streaming shows a skeleton (typed-object
 * runs suppress their JSON body), matching the streaming-text card's contract.
 */

import * as React from 'react';
import { Check, RefreshCw, RotateCcw, X } from 'lucide-react';
import type { ComposerResultEnvelope } from '@/core/composer';
import type { NativeFilePatchEnvelopePayload } from '@/service/composer';
import { Button } from '@/ui/components/primitives';
import type { CandidateRendererProps } from './rendererRegistry';

const CONTROL = 'h-[30px] rounded-[var(--pk-radius-md)]';

/** Human labels for the three native formats (display only, never dispatch). */
const FORMAT_LABEL: Record<string, string> = {
	base: 'Base',
	canvas: 'Canvas',
	excalidraw: 'Excalidraw',
};

function nativePayload(props: CandidateRendererProps): NativeFilePatchEnvelopePayload | null {
	const envelope = props.candidate.proposedChange.result as ComposerResultEnvelope | undefined;
	if (!envelope || envelope.resultKind !== 'native-file-patch') return null;
	return (envelope.payload as NativeFilePatchEnvelopePayload) ?? null;
}

function basename(path: string): string {
	if (!path) return '';
	return path.split('/').pop() ?? path;
}

function NativeBody(props: CandidateRendererProps): React.ReactElement {
	const { strings, streamingText, candidate } = props;
	if (streamingText !== null) {
		return (
			<span className="text-[var(--text-muted)]">
				{strings.streaming}
				<span aria-hidden="true" className="inline-block w-[1px] h-[1.1em] align-text-bottom bg-[var(--text-normal)] animate-pulse" />
			</span>
		);
	}
	if (candidate.status === 'failed') return <span className="text-[var(--text-error)]">{strings.failed}</span>;
	if (candidate.status === 'stale') return <span className="text-[var(--text-muted)]">{strings.stale}</span>;

	const payload = nativePayload(props);
	if (!payload) return <span className="text-[var(--text-muted)]">{strings.streaming}</span>;
	const { core, summary } = payload;
	const label = FORMAT_LABEL[summary.format] ?? summary.format;
	const file = basename(core.targetPath);

	if (core.unsupported === true) {
		return (
			<span className="flex flex-col gap-1">
				<span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
					{label}
					{file ? ` · ${file}` : ''}
				</span>
				<span className="text-[var(--text-error)]">{core.reason ?? strings.unsupportedResult}</span>
			</span>
		);
	}

	return (
		<span className="flex flex-col gap-1">
			<span className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
				{label}
				{file ? ` · ${file}` : ''}
			</span>
			<span className="flex flex-col gap-0.5">
				{summary.ops.map((op, i) => (
					<span key={i} className="text-[var(--text-normal)]">
						• {op}
					</span>
				))}
			</span>
		</span>
	);
}

export function NativeFilePatchCandidateCard(props: CandidateRendererProps): React.ReactElement {
	const { candidate, runtime, strings } = props;
	const [instruction, setInstruction] = React.useState('');
	const streaming = props.streamingText !== null;
	const payload = nativePayload(props);
	const unsupported = payload?.core.unsupported === true;
	const acceptable = !streaming && candidate.status === 'ready' && !unsupported;
	const regenerable = !streaming && (candidate.status === 'ready' || candidate.status === 'failed');

	const submitRegenerate = () => {
		if (!regenerable) return;
		const trimmed = instruction.trim();
		runtime.regenerate(candidate.candidateId, trimmed.length > 0 ? trimmed : undefined);
	};
	const handleDiscard = () => runtime.discard(candidate.candidateId);

	if (candidate.status === 'stale') {
		const handleRerun = () => {
			if (runtime.rerunStale) runtime.rerunStale(candidate.candidateId);
			else runtime.discard(candidate.candidateId);
		};
		return (
			<span data-candidate-id={candidate.candidateId} data-candidate-native data-candidate-stale className="flex flex-col gap-2 py-1">
				<span className="px-3 leading-relaxed text-[var(--text-muted)]">{strings.stale}</span>
				<span className="mx-3 border-t border-[var(--background-modifier-border)]" aria-hidden="true" />
				<span className="flex items-center gap-1.5 px-3 flex-wrap">
					<Button variant="secondary" className={`${CONTROL} px-2 gap-1`} onClick={handleRerun}>
						<RefreshCw size={14} />
						{strings.rerun}
					</Button>
					<Button variant="ghost" className={`${CONTROL} px-2 gap-1`} onClick={handleDiscard}>
						<X size={14} />
						{strings.discard}
					</Button>
				</span>
			</span>
		);
	}

	return (
		<span data-candidate-id={candidate.candidateId} data-candidate-native className="flex flex-col gap-2 py-1">
			<span className="px-3 leading-relaxed">
				<NativeBody {...props} />
			</span>
			<span className="mx-3 border-t border-[var(--background-modifier-border)]" aria-hidden="true" />
			<span className="flex items-center gap-1.5 px-3 flex-wrap">
				<input
					type="text"
					value={instruction}
					aria-label={strings.instructionAria}
					placeholder={strings.instructionPlaceholder}
					className={`flex-1 min-w-[140px] px-2 text-sm bg-transparent border border-[var(--background-modifier-border)] text-[var(--text-normal)] ${CONTROL}`}
					onChange={(e) => setInstruction(e.target.value)}
					onKeyDown={(e) => {
						if (e.key !== 'Enter') return;
						e.preventDefault();
						submitRegenerate();
					}}
				/>
				<Button
					variant="secondary"
					className={`${CONTROL} px-2 gap-1`}
					disabled={!regenerable}
					onClick={submitRegenerate}
				>
					<RotateCcw size={14} />
					{candidate.status === 'failed' ? strings.retry : strings.regenerate}
				</Button>
				<Button
					variant="primary"
					className={`${CONTROL} px-2 gap-1`}
					disabled={!acceptable}
					title={!acceptable ? strings.acceptDisabledStreaming : undefined}
					onClick={() => void runtime.accept(candidate.candidateId)}
				>
					<Check size={14} />
					{strings.accept}
				</Button>
				<Button variant="ghost" className={`${CONTROL} px-2 gap-1`} onClick={handleDiscard}>
					<X size={14} />
					{streaming ? strings.cancel : strings.discard}
				</Button>
			</span>
		</span>
	);
}
