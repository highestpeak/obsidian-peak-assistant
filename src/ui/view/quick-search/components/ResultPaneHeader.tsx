import React, { useEffect } from 'react';
import { Network, X } from 'lucide-react';
import { Chip } from '@/ui/components/primitives';
import { cn } from '@/ui/react/lib/utils';
import { useVaultSearchStore } from '../store';
import type { GraphPreset, QuickSearchMode } from '../store/vaultSearchStore';

/**
 * The graph-toggle affordance rendered inline on the right side of the
 * mode-picker row. Layout follows Variant A of the 2026-07-07 header
 * prototype (see `docs/research/2026-07-07-result-graph-layout/
 * header-variants.html`):
 *
 *   [ Graph view (filled ↔ outlined) ] · [ segmented preset control ]
 *   [ Semantic toggle switch ] [ optional pinned-hub chip ]
 *
 * Only the Graph view button is present when the user is on the list
 * view; the preset control and semantic switch appear when Graph view
 * is on.
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

/**
 * macOS-style segmented control for the graph preset. The container has
 * an accent-tinted background; each active preset gets a white pill with
 * a subtle shadow. Aligns visually with a native segmented control so
 * users read it as "pick one of these" rather than "several toggles".
 */
const GraphPresetSegmented: React.FC = () => {
	const preset = useVaultSearchStore((s) => s.graphPreset);
	const setPreset = useVaultSearchStore((s) => s.setGraphPreset);
	return (
		<div
			role="tablist"
			aria-label="Graph view preset"
			className="pktw-inline-flex pktw-items-center pktw-gap-0.5 pktw-p-0.5 pktw-rounded-md"
			style={{ backgroundColor: 'rgba(124,58,237,0.06)' }}
		>
			{PRESET_LABELS.map(([id, label, title]) => {
				const active = preset === id;
				return (
					<button
						key={id}
						type="button"
						role="tab"
						aria-selected={active}
						title={title}
						onClick={() => setPreset(id)}
						className={cn(
							'pktw-shadow-none pktw-h-5 pktw-px-2.5 pktw-text-[11px] pktw-font-medium pktw-rounded-[5px]',
							'pktw-transition-colors pktw-cursor-pointer pktw-border-none pktw-bg-transparent',
							active
								? 'pktw-text-pk-accent'
								: 'pktw-text-pk-foreground-muted hover:pktw-text-pk-accent',
						)}
						style={active ? {
							backgroundColor: '#fff',
							boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(124,58,237,0.15)',
						} : undefined}
					>
						{label}
					</button>
				);
			})}
		</div>
	);
};

/**
 * True toggle switch (30 × 16 track with sliding thumb) for the Semantic
 * overlay. Reads like a setting toggle rather than a preset chip so the
 * user immediately understands it's "layer on / off", not "another mode".
 */
const SemanticToggle: React.FC = () => {
	const on = useVaultSearchStore((s) => s.graphShowSemantic);
	const toggle = useVaultSearchStore((s) => s.toggleGraphShowSemantic);
	return (
		<label
			className="pktw-inline-flex pktw-items-center pktw-gap-1.5 pktw-cursor-pointer pktw-select-none pktw-text-[11px] pktw-text-pk-foreground-muted"
			title="Layer semantic-similarity edges on top of the current preset"
		>
			<input
				type="checkbox"
				checked={on}
				onChange={toggle}
				className="pktw-sr-only peer"
				aria-label="Toggle semantic edges"
			/>
			<span
				aria-hidden="true"
				className={cn(
					'pktw-relative pktw-inline-block pktw-w-[30px] pktw-h-4 pktw-rounded-full pktw-transition-colors',
					on ? 'pktw-bg-pk-accent' : 'pktw-bg-pk-border',
				)}
			>
				<span
					className={cn(
						'pktw-absolute pktw-top-0.5 pktw-left-0.5 pktw-w-3 pktw-h-3 pktw-bg-white pktw-rounded-full',
						'pktw-transition-transform',
						on ? 'pktw-translate-x-[14px]' : 'pktw-translate-x-0',
					)}
					style={{ boxShadow: '0 1px 2px rgba(0,0,0,0.15)' }}
				/>
			</span>
			<span>Semantic</span>
		</label>
	);
};

/**
 * T7: chip showing an active hub pin ("Pinned to hub: N docs · clear").
 * Only renders when `pinnedResultDocIds` is set; clicking dismisses the
 * pin so `useVaultSearch` falls back to the normal query pipeline.
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

/**
 * "Graph view" toggle. Filled accent pill when on (clear on/off state);
 * outlined muted pill when off. Sits on the LEFT of the preset control
 * because it is the top-level state — presets and semantic overlay only
 * matter when Graph view is on.
 */
const GraphViewToggle: React.FC<{ isGraph: boolean; onToggle: () => void }> = ({ isGraph, onToggle }) => (
	<button
		type="button"
		onClick={onToggle}
		aria-pressed={isGraph}
		title={isGraph ? 'Switch to list view' : 'Switch to graph view'}
		className={cn(
			'pktw-inline-flex pktw-items-center pktw-gap-1.5 pktw-h-6 pktw-px-2.5 pktw-rounded-full',
			'pktw-text-[11px] pktw-font-medium pktw-transition-colors pktw-cursor-pointer pktw-shadow-none',
			isGraph
				? 'pktw-bg-pk-accent pktw-text-white pktw-border pktw-border-pk-accent'
				: 'pktw-text-pk-foreground-muted pktw-border pktw-border-pk-border hover:pktw-text-pk-accent hover:pktw-border-pk-accent/40',
		)}
	>
		<Network className="pktw-w-3.5 pktw-h-3.5" />
		<span>Graph view</span>
	</button>
);

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
		<div className={cn('pktw-flex pktw-items-center pktw-gap-2.5', className)}>
			<PinnedHubChip />
			<GraphViewToggle isGraph={isGraph} onToggle={toggle} />
			{isGraph && (
				<>
					{/* Vertical divider between Graph view toggle and preset controls */}
					<span aria-hidden="true" className="pktw-w-px pktw-h-5 pktw-bg-pk-border" />
					<GraphPresetSegmented />
					<SemanticToggle />
				</>
			)}
		</div>
	);
};
