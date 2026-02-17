/**
 * Graph copy: format/menu state, snapshot build, serialization, and clipboard write.
 * All copy-related logic lives here for easier maintenance.
 */

import { useEffect, useRef, useState } from 'react';
import type { GraphCopyFormat } from '../config';
import { snapshotToMarkdown, snapshotToMermaid, snapshotToJson } from '../formatters';
import type { SnapshotMarkdownOptions } from '../formatters';
import type { GraphVizNode, GraphVizLink } from '../types';
import { getLinkEndpointId } from '../utils/link-key';

const COPY_RESET_MS = 1000;

export type UseGraphCopyParams = {
	nodesRef: React.MutableRefObject<GraphVizNode[]>;
	linksRef: React.MutableRefObject<GraphVizLink[]>;
	snapshotMarkdownOptions: SnapshotMarkdownOptions;
};

export function useGraphCopy({ nodesRef, linksRef, snapshotMarkdownOptions }: UseGraphCopyParams) {
	const [copyFormat, setCopyFormat] = useState<GraphCopyFormat>('markdown');
	const [copyMenuOpen, setCopyMenuOpen] = useState(false);
	const [copiedTick, setCopiedTick] = useState(0);
	const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	async function handleCopy(format: GraphCopyFormat) {
		const snapshot = {
			nodes: nodesRef.current.map((n) => ({ id: n.id, label: n.label, type: n.type, badges: n.badges })),
			edges: linksRef.current.map((e) => ({
				source: getLinkEndpointId(e.source),
				target: getLinkEndpointId(e.target),
				kind: e.kind,
				weight: e.weight,
			})),
		};
		const text =
			format === 'json'
				? snapshotToJson(snapshot)
				: format === 'mermaid'
					? snapshotToMermaid(snapshot)
					: snapshotToMarkdown(snapshot, snapshotMarkdownOptions);
		try {
			await navigator.clipboard.writeText(text);
			if (copyResetTimerRef.current != null) {
				clearTimeout(copyResetTimerRef.current);
				copyResetTimerRef.current = null;
			}
			setCopiedTick((t) => t + 1);
			copyResetTimerRef.current = setTimeout(() => {
				setCopiedTick(0);
				copyResetTimerRef.current = null;
			}, COPY_RESET_MS);
		} catch (e) {
			console.warn('[GraphVisualization] Failed to copy text:', e);
		}
	}

	useEffect(() => () => {
		if (copyResetTimerRef.current != null) clearTimeout(copyResetTimerRef.current);
	}, []);

	return {
		copyFormat,
		setCopyFormat,
		copyMenuOpen,
		setCopyMenuOpen,
		copiedTick,
		handleCopy,
	};
}
