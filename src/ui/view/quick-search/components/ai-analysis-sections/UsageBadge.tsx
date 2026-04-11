/**
 * UsageBadge: compact token/cost display shown after analysis completes.
 *
 * Default: "~N pages · Xs" — relatable units, no raw token counts.
 * Click to expand: "(Nin / Nout tokens)"
 */

import React, { useState } from 'react';
import { useSearchSessionStore } from '../../store/searchSessionStore';

export const UsageBadge: React.FC = () => {
	const usage = useSearchSessionStore((s) => s.usage);
	const duration = useSearchSessionStore((s) => s.duration);
	const [expanded, setExpanded] = useState(false);

	if (!usage?.totalTokens) return null;

	// Translate tokens to relatable units: ~500 tokens per "page"
	const pages = Math.max(1, Math.round(usage.totalTokens / 500));
	const durationSec = duration != null ? (duration / 1000).toFixed(1) : null;

	return (
		<div className="pktw-flex pktw-items-center pktw-gap-1 pktw-text-[10px] pktw-text-[#9ca3af]">
			<span
				className="pktw-cursor-pointer hover:pktw-text-[#7c3aed] pktw-transition-colors"
				onClick={() => setExpanded((v) => !v)}
				title="Click to see token details"
			>
				~{pages} page{pages !== 1 ? 's' : ''}{durationSec ? ` · ${durationSec}s` : ''}
			</span>
			{expanded && (
				<span className="pktw-font-mono pktw-text-[9px] pktw-text-[#9ca3af]">
					({usage.inputTokens?.toLocaleString() ?? '?'} in / {usage.outputTokens?.toLocaleString() ?? '?'} out)
				</span>
			)}
		</div>
	);
};
