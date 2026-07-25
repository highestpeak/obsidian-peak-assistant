/**
 * Peak Composer — candidate host (WP3).
 *
 * Container that binds ONE pending candidate to its renderer:
 *   - subscribes to the runtime's candidate projection (hub-backed);
 *   - tracks streaming text from typed run events (content-delta carries the
 *     accumulated text — the host never re-accumulates or parses logs);
 *   - dispatches to a renderer by the candidate's renderer ID via the
 *     registry (never by label);
 *   - renders nothing once the candidate is accepted or discarded.
 *
 * Mounting into the block chrome is the merged-tree integration task; this
 * component only depends on core ports + the candidates directory.
 */

import * as React from 'react';
import type { ComposerCandidate, ComposerCandidateRuntimePort } from '@/core/composer';
import type { CandidateUiStrings } from './candidateUiConfig';
import { DEFAULT_CANDIDATE_UI_STRINGS, loadCandidateUiStrings } from './candidateUiConfig';
import type { CandidateRendererRegistry } from './rendererRegistry';

export interface ComposerCandidateHostProps {
	runtime: ComposerCandidateRuntimePort;
	candidateId: string;
	registry: CandidateRendererRegistry;
	/** Injected strings (tests / storyless harness); loaded from config otherwise. */
	strings?: CandidateUiStrings;
}

function useCandidate(runtime: ComposerCandidateRuntimePort, candidateId: string): ComposerCandidate | null {
	const [candidate, setCandidate] = React.useState<ComposerCandidate | null>(null);
	React.useEffect(
		() =>
			runtime.subscribe((candidates) => {
				setCandidate(candidates.find((c) => c.candidateId === candidateId) ?? null);
			}),
		[runtime, candidateId],
	);
	return candidate;
}

function useStreamingText(runtime: ComposerCandidateRuntimePort, candidateId: string): string | null {
	const [text, setText] = React.useState<string | null>(
		runtime.isStreaming(candidateId) ? '' : null,
	);
	React.useEffect(
		() =>
			runtime.onRunEvent((event) => {
				if (event.candidateId !== candidateId) return;
				if (event.type === 'run-started') setText('');
				else if (event.type === 'content-delta') setText(event.text);
				else setText(null);
			}),
		[runtime, candidateId],
	);
	return text;
}

function useStrings(injected?: CandidateUiStrings): CandidateUiStrings {
	const [strings, setStrings] = React.useState<CandidateUiStrings>(
		injected ?? DEFAULT_CANDIDATE_UI_STRINGS,
	);
	React.useEffect(() => {
		if (injected) return;
		let cancelled = false;
		void loadCandidateUiStrings().then((loaded) => {
			if (!cancelled) setStrings(loaded);
		});
		return () => {
			cancelled = true;
		};
	}, [injected]);
	return injected ?? strings;
}

export function ComposerCandidateHost(props: ComposerCandidateHostProps): React.ReactElement | null {
	const candidate = useCandidate(props.runtime, props.candidateId);
	const streamingText = useStreamingText(props.runtime, props.candidateId);
	const strings = useStrings(props.strings);

	if (!candidate || candidate.status === 'accepted' || candidate.status === 'discarded') return null;

	const rendererId = props.runtime.rendererIdFor(candidate.candidateId);
	const { component: Renderer } = props.registry.resolve(rendererId);
	return (
		<Renderer
			candidate={candidate}
			runtime={props.runtime}
			strings={strings}
			streamingText={streamingText}
		/>
	);
}
