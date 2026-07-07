import React, { useEffect } from 'react';
import { Network, X } from 'lucide-react';
import { Chip, Pill } from '@/ui/components/primitives';
import { cn } from '@/ui/react/lib/utils';
import { useVaultSearchStore } from '../store';
import type { GraphPreset, QuickSearchMode } from '../store/vaultSearchStore';

/**
 * The graph-toggle affordance. Rendered inline on the right side of the
 * mode picker row. Hosts:
 *  - "Graph view" pill toggling `resultView` between `'list'` and `'graph'`.
 *  - Five preset chips (Constellation / Flow ↓ / Flow → / Folder tree /
 *    Orbit) shown only in graph view.
 *  - "Semantic" chip that layers semantic edges on top of any preset.
 *  - Optional pinned-hub chip.
 *
 * Preset selection is stored in `graphPreset`, semantic overlay in
 * `graphShowSemantic`. Design finalized in the 2026-07-07 sandbox — see
 * `docs/research/2026-07-07-result-graph-layout/index.html`.
 *
 * `help` mode has no graph representation → returns null.
 */
interface ResultPaneHeaderProps {
	mode: QuickSearchMode;
	className?: string;
}

const PRESET_LABELS: Array<[GraphPreset, string, string]> = [
	['constellation', 'Constellation', 'Force-directed cluster — how do these results cluster together?'],
	['flow-tb',       'Flow ↓',        'Top-down hierarchical flow — what references what?'],
	['flow-lr',       'Flow →',        'Left-right hierarchical flow — same as ↓ but sideways'],
	['folder',        'Folder tree',   'Full-depth folder tree — where in my vault do they live?'],
	['orbit',         'Orbit',         'Hubs at center, docs orbit — are hubs the center of gravity?'],
];

const GraphPresetPicker: React.FC = () => {
	const preset = useVaultSearchStore((s) => s.graphPreset);
	const setPreset = useVaultSearchStore((s) => s.setGraphPreset);
	const showSemantic = useVaultSearchStore((s) => s.graphShowSemantic);
	const toggleSemantic = useVaultSearchStore((s) => s.toggleGraphShowSemantic);
	return (
		<div className="pktw-flex pktw-items-center pktw-gap-1">
			{PRESET_LABELS.map(([id, label, title]) => (
				<Pill
					key={id}
					selected={preset === id}
					onClick={() => setPreset(id)}
					aria-label={label}
					title={title}
				>
					{label}
				</Pill>
			))}
			<span className="pktw-mx-1 pktw-text-pk-border">·</span>
			<Pill
				selected={showSemantic}
				onClick={toggleSemantic}
				aria-label="Toggle semantic edges"
				title="Layer semantic-similarity edges on top of the current preset"
			>
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
			{isGraph && <GraphPresetPicker />}
			<button
				type="button"
				onClick={toggle}
				data-active={isGraph ? 'true' : undefined}
				aria-pressed={isGraph}
				title={isGraph ? 'Switch to list view' : 'Switch to graph view'}
				className={cn(
					'pktw-inline-flex pktw-items-center pktw-gap-1.5 pktw-h-6 pktw-px-2.5 pktw-rounded-full',
					'pktw-text-[11px] pktw-font-medium pktw-transition-colors pktw-cursor-pointer pktw-shadow-none',
					isGraph
						? 'pktw-bg-pk-accent/10 pktw-text-pk-accent pktw-border pktw-border-pk-accent/25'
						: 'pktw-text-pk-foreground-muted pktw-border pktw-border-transparent hover:pktw-text-pk-accent hover:pktw-bg-pk-background-hover',
				)}
			>
				<Network className="pktw-w-3.5 pktw-h-3.5" />
				<span>Graph view</span>
			</button>
		</div>
	);
};
