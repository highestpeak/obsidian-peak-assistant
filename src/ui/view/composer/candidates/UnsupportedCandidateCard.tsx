/**
 * Peak Composer — unsupported-result fallback renderer (WP3, spec §10).
 *
 * Rendered when a candidate's renderer ID has no registered binding. Visible
 * by design — a silent drop would hide a registration bug — and it still
 * offers discard so the user is never stuck with an unusable pending card.
 */

import * as React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/ui/components/primitives';
import type { CandidateRendererProps } from './rendererRegistry';

export function UnsupportedCandidateCard(props: CandidateRendererProps): React.ReactElement {
	const { strings, candidate, runtime } = props;
	return (
		<span data-candidate-id={candidate.candidateId} className="flex items-center gap-2 px-3 py-1.5">
			<span className="text-[var(--text-muted)] text-sm">{strings.unsupportedResult}</span>
			<Button
				variant="ghost"
				className="h-[30px] rounded-[var(--pk-radius-md)] px-2 gap-1"
				onClick={() => runtime.discard(candidate.candidateId)}
			>
				<X size={14} />
				{strings.discard}
			</Button>
		</span>
	);
}
