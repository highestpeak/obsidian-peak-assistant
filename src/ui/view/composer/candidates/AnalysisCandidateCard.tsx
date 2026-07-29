/** Read-only candidate card for source explanations; it deliberately has no accept action. */

import * as React from 'react';
import { Sparkles, X } from 'lucide-react';
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
	return (
		<article className="pk-analysis-candidate" data-candidate-id={props.candidate.candidateId} data-streaming={streaming || undefined}>
			<header className="pk-analysis-candidate__head">
				<span className="pk-analysis-candidate__title"><Sparkles size={14} />{props.strings.analysisTitle}</span>
				<Button variant="ghost" size="sm" onClick={() => props.runtime.discard(props.candidate.candidateId)}>
					<X size={13} />
					{props.strings.analysisClose}
				</Button>
			</header>
			<div className="pk-analysis-candidate__body" aria-live="polite">
				{text || (streaming ? props.strings.analysisStreaming : '')}
			</div>
		</article>
	);
}
