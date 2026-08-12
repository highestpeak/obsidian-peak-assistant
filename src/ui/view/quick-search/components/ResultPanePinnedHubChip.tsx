import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Chip } from '@/ui/components/primitives';
import { PEAK_CONTROL_KEY_TIP_KEYS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';
import { useVaultSearchStore } from '../store';
import type { QuickSearchMode } from '../store/vaultSearchStore';

const PinnedHubChip: React.FC = () => {
	const pinned = useVaultSearchStore((state) => state.pinnedResultDocIds);
	const setPinned = useVaultSearchStore((state) => state.setPinnedResultDocIds);
	if (!pinned) return null;
	return (
		<Chip
			variant="accent"
			role="button"
			tabIndex={0}
			data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.search.clearPinnedHub}
			data-peak-keytip-label="Clear pinned hub"
			onClick={() => setPinned(null)}
			onKeyDown={(event) => {
				if (event.key !== 'Enter' && event.key !== ' ') return;
				event.preventDefault();
				setPinned(null);
			}}
			className="pktw-cursor-pointer pktw-inline-flex pktw-items-center pktw-gap-1"
			title="Clear hub pin and return to full search"
		>
			<span>Pinned to hub: {pinned.length} doc{pinned.length !== 1 ? 's' : ''}</span>
			<span aria-hidden="true">·</span>
			<X className="pktw-w-3 pktw-h-3" />
			<span>clear</span>
		</Chip>
	);
};

export const ResultPanePinnedHubChip: React.FC<{ mode: QuickSearchMode }> = ({ mode }) => {
	const pinnedResultDocIds = useVaultSearchStore((state) => state.pinnedResultDocIds);
	const setPinnedResultDocIds = useVaultSearchStore((state) => state.setPinnedResultDocIds);
	useEffect(() => {
		if (mode !== 'all' && pinnedResultDocIds) setPinnedResultDocIds(null);
	}, [mode, pinnedResultDocIds, setPinnedResultDocIds]);
	if (mode === 'help') return null;
	return <PinnedHubChip />;
};
