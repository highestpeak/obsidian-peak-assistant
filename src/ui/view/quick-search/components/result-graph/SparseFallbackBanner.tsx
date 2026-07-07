import React from 'react';
import { Info } from 'lucide-react';

/**
 * Result Graph View · sparse-fallback banner (spec 2026-07-07 §Empty /
 * Sparse Fallback). Shown when the result set has < 3 connected pairs
 * AND < 2 shared hub anchors — i.e. the graph has almost no structure
 * to reveal. The toggle itself stays available: seeing the sparse state
 * still teaches the user something about their vault.
 */
export const SparseFallbackBanner: React.FC = () => (
	<span className="pktw-absolute pktw-left-1/2 pktw-top-4 pktw-z-10 pktw-flex pktw-max-w-[420px] pktw--translate-x-1/2 pktw-items-start pktw-gap-2 pktw-rounded-md pktw-border pktw-border-pk-border pktw-bg-pk-surface pktw-px-3 pktw-py-2 pktw-text-[12px] pktw-text-pk-text-secondary pktw-shadow-sm">
		<Info className="pktw-mt-0.5 pktw-h-3.5 pktw-w-3.5 pktw-shrink-0 pktw-text-pk-text-tertiary" />
		<span>
			These results don't form a shared structure. Try widening the query, or stay in list view.
		</span>
	</span>
);
