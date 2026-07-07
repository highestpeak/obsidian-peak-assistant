import React, { useEffect } from 'react';
import { Network, X } from 'lucide-react';
import { Chip, IconButton, Pill } from '@/ui/components/primitives';
import { cn } from '@/ui/react/lib/utils';
import { useVaultSearchStore } from '../store';
import type { QuickSearchMode } from '../store/vaultSearchStore';

/**
 * T3 (2026-07-07 result graph): the graph-toggle affordance. Rendered
 * inline on the right side of the mode picker row so it does not occupy
 * its own whitespace band. Hosts:
 *  - Network icon toggling `resultView` between `'list'` and `'graph'`.
 *  - Two overlay Pills (Folder / Semantic) shown only in graph view.
 *  - Optional pinned-hub chip.
 *
 * `help` mode has no graph representation → returns null.
 */
interface ResultPaneHeaderProps {
	mode: QuickSearchMode;
	className?: string;
}

const GraphOverlayToggles: React.FC = () => {
	const folderOn = useVaultSearchStore((s) => s.graphOverlayFolder);
	const semanticOn = useVaultSearchStore((s) => s.graphOverlaySemantic);
	const toggleFolder = useVaultSearchStore((s) => s.toggleGraphOverlayFolder);
	const toggleSemantic = useVaultSearchStore((s) => s.toggleGraphOverlaySemantic);
	return (
		<div className="pktw-flex pktw-items-center pktw-gap-1">
			<Pill selected={folderOn} onClick={toggleFolder} aria-label="Toggle folder overlay">
				Folder
			</Pill>
			<Pill selected={semanticOn} onClick={toggleSemantic} aria-label="Toggle semantic overlay">
				Semantic
			</Pill>
		</div>
	);
};

/**
 * T7: chip showing an active hub pin ("Pinned to hub: N docs · clear"). Only
 * renders when `pinnedResultDocIds` is set. Clicking dismisses the pin, which
 * lets `useVaultSearch` fall back to the normal query pipeline.
 */
const PinnedHubChip: React.FC = () => {
	const pinned = useVaultSearchStore((s) => s.pinnedResultDocIds);
	const setPinned = useVaultSearchStore((s) => s.setPinnedResultDocIds);
	if (!pinned) return null;
	return (
		<Chip
			variant="accent"
			role="button"
			tabIndex={0}
			onClick={() => setPinned(null)}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					setPinned(null);
				}
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

export const ResultPaneHeader: React.FC<ResultPaneHeaderProps> = ({ mode, className }) => {
	const resultView = useVaultSearchStore((s) => s.resultView);
	const setResultView = useVaultSearchStore((s) => s.setResultView);
	const pinnedResultDocIds = useVaultSearchStore((s) => s.pinnedResultDocIds);
	const setPinnedResultDocIds = useVaultSearchStore((s) => s.setPinnedResultDocIds);

	// T7: exit criterion — leaving `all` mode (e.g. user types `#` for
	// heading) invalidates the pin, since heading mode is scoped to a
	// single file. `help` also clears the pin so it doesn't linger.
	useEffect(() => {
		if (mode !== 'all' && pinnedResultDocIds) {
			setPinnedResultDocIds(null);
		}
	}, [mode, pinnedResultDocIds, setPinnedResultDocIds]);

	if (mode === 'help') return null;

	const isGraph = resultView === 'graph';
	const toggle = () => setResultView(isGraph ? 'list' : 'graph');

	return (
		<div className={cn('pktw-flex pktw-items-center pktw-gap-2', className)}>
			<PinnedHubChip />
			{isGraph && <GraphOverlayToggles />}
			<IconButton
				label={isGraph ? 'Switch to list view' : 'Switch to graph view'}
				onClick={toggle}
				data-active={isGraph ? 'true' : undefined}
				aria-pressed={isGraph}
			>
				<Network className="pktw-w-4 pktw-h-4" />
			</IconButton>
		</div>
	);
};
