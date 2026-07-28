import * as React from 'react';
import { RotateCcw, X } from 'lucide-react';
import type { ComposerResultEnvelope } from '@/core/composer';
import type { ComposerFormulaAnnotationPayload } from '@/core/schemas/composer';
import { Button } from '@/ui/components/primitives';
import type { CandidateRendererProps } from '../../candidates/rendererRegistry';
import { FormulaDetailBody } from './FormulaDetailBody';
import { DEFAULT_MATH_CONFIG } from './mathConfig';

/**
 * Peak Composer — formula-annotation candidate card (WP5) — safety-net renderer.
 *
 * The bespoke formula-detail store owns the primary formula AI experience (three
 * INDEPENDENT details per formula — §3.3), which the single-candidate block host
 * cannot express. This renderer only exists so that if a formula-annotation
 * result ever reaches the generic candidate host it renders its content (never
 * the "unsupported result" fallback). Formula details are analyze results, so
 * there is no accept-commit here — only regenerate / close.
 */
const CONTROL = 'h-[30px] rounded-[var(--pk-radius-md)]';

function readyPayload(props: CandidateRendererProps): ComposerFormulaAnnotationPayload | null {
	const envelope = props.candidate.proposedChange.result as ComposerResultEnvelope | undefined;
	if (!envelope || envelope.resultKind !== 'formula-annotation') return null;
	return envelope.payload as ComposerFormulaAnnotationPayload;
}

export function FormulaAnnotationCandidateCard(props: CandidateRendererProps): React.ReactElement {
	const { candidate, runtime, strings } = props;
	const streaming = props.streamingText !== null;
	const payload = readyPayload(props);

	return (
		<span data-candidate-id={candidate.candidateId} className="flex flex-col gap-2 py-1">
			<span className="px-3 leading-relaxed text-[var(--text-normal)]">
				{streaming && <span>{DEFAULT_MATH_CONFIG.detail.streaming}</span>}
				{!streaming && payload && (
					<FormulaDetailBody payload={payload} config={DEFAULT_MATH_CONFIG} />
				)}
				{!streaming && !payload && <span className="text-[var(--text-muted)]">{strings.streaming}</span>}
			</span>
			<span className="mx-3 border-t border-[var(--background-modifier-border)]" aria-hidden />
			<span className="flex items-center gap-1.5 px-3 flex-wrap">
				<Button variant="secondary" className={`${CONTROL} px-2 gap-1`} disabled={streaming} onClick={() => runtime.regenerate(candidate.candidateId)}>
					<RotateCcw size={14} />
					{strings.regenerate}
				</Button>
				<Button variant="ghost" className={`${CONTROL} px-2 gap-1`} onClick={() => runtime.discard(candidate.candidateId)}>
					<X size={14} />
					{streaming ? strings.cancel : strings.discard}
				</Button>
			</span>
		</span>
	);
}
