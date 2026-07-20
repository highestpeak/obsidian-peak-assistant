import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { List, ListTree, Network, X } from 'lucide-react';
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
			className="pktw-inline-flex pktw-items-center pktw-p-0.5 pktw-gap-0.5 pktw-bg-pk-surface-sunken pktw-rounded-full pktw-border pktw-border-pk-border"
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
							'pktw-relative pktw-inline-flex pktw-items-center pktw-px-3 pktw-py-1 pktw-rounded-full pktw-text-pk-sm pktw-font-medium',
							active
								? 'pktw-text-white'
								: 'pktw-text-pk-foreground-muted hover:pktw-text-pk-accent pktw-transition-colors',
						)}
					>
						{active && (
							<motion.div
								layoutId="graph-preset-thumb"
								className="pktw-absolute pktw-inset-0 pktw-rounded-full pktw-bg-pk-accent"
								transition={{ type: 'spring', stiffness: 500, damping: 34 }}
							/>
						)}
						<span className="pktw-relative pktw-z-10">{label}</span>
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
 *
 * Semantic edges come from the pre-indexed `mobius_edge` table
 * (`GraphEdgeType.SemanticRelated`) and are filtered client-side when the
 * toggle flips — so this toggle is instant, does not spend AI credits, and
 * does not depend on network. Any future change that routes the toggle
 * through a live LLM call MUST update the tooltip copy below.
 */
const SemanticToggle: React.FC = () => {
	const on = useVaultSearchStore((s) => s.graphShowSemantic);
	const toggle = useVaultSearchStore((s) => s.toggleGraphShowSemantic);
	return (
		<label
			className="pktw-inline-flex pktw-items-center pktw-gap-1.5 pktw-cursor-pointer pktw-select-none pktw-text-pk-sm pktw-text-pk-foreground-muted"
			title="Layer semantic-similarity edges on top of the current preset. Uses pre-indexed embeddings — instant, no AI credits, no network."
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
						'pktw-absolute pktw-top-0.5 pktw-left-0.5 pktw-w-3 pktw-h-3 pktw-bg-white pktw-rounded-full pktw-shadow-pk-card',
						'pktw-transition-transform',
						on ? 'pktw-translate-x-[14px]' : 'pktw-translate-x-0',
					)}
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
 * 3-way view mode toggle — List (default) / Tree view (coming soon) / Graph view.
 * Capsule-pill layout: sunken container, purple-filled active option, muted
 * inactive text. Uses framer-motion `layoutId` to slide the active thumb
 * between options. Relies on `peak-design-root` reset (applied at modal
 * root) to neutralise Obsidian's global button styles.
 */
export const ViewModeToggle: React.FC = () => {
	const resultView = useVaultSearchStore((s) => s.resultView);
	const setResultView = useVaultSearchStore((s) => s.setResultView);
	// Wrapped in <button> children as absolutely-positioned motion.div —
	// framer-motion animates a shared layoutId across mount points, so the
	// purple thumb slides from previous-active to new-active on click.
	const Thumb: React.FC = () => (
		<motion.div
			layoutId="view-mode-thumb"
			className="pktw-absolute pktw-inset-0 pktw-rounded-full pktw-bg-pk-accent"
			transition={{ type: 'spring', stiffness: 500, damping: 34 }}
		/>
	);
	const optBase = 'pktw-relative pktw-inline-flex pktw-items-center pktw-gap-1.5 pktw-px-3 pktw-py-1 pktw-rounded-full pktw-text-pk-sm pktw-font-medium';
	const activeLabel = 'pktw-relative pktw-z-10 pktw-text-white';
	const idleLabel = 'pktw-relative pktw-z-10 pktw-text-pk-foreground-muted hover:pktw-text-pk-accent pktw-transition-colors';
	return (
		<div
			role="tablist"
			aria-label="Result view mode"
			className="pktw-inline-flex pktw-items-center pktw-p-0.5 pktw-gap-0.5 pktw-bg-pk-surface-sunken pktw-rounded-full pktw-border pktw-border-pk-border"
		>
			<button type="button" title="List view"
				onClick={() => { if (resultView !== 'list') setResultView('list'); }}
				className={cn(optBase, resultView === 'list' ? activeLabel : idleLabel)}>
				{resultView === 'list' && <Thumb />}
				<span className="pktw-relative pktw-z-10 pktw-inline-flex pktw-items-center pktw-gap-1.5">
					<List className="pktw-w-3 pktw-h-3" /> List
				</span>
			</button>
			<button type="button" title="Tree — vault folder hierarchy"
				onClick={() => { if (resultView !== 'tree') setResultView('tree'); }}
				className={cn(optBase, resultView === 'tree' ? activeLabel : idleLabel)}>
				{resultView === 'tree' && <Thumb />}
				<span className="pktw-relative pktw-z-10 pktw-inline-flex pktw-items-center pktw-gap-1.5">
					<ListTree className="pktw-w-3 pktw-h-3" /> Tree
				</span>
			</button>
			<button type="button" title="Graph — relations between results"
				onClick={() => { if (resultView !== 'graph') setResultView('graph'); }}
				className={cn(optBase, resultView === 'graph' ? activeLabel : idleLabel)}>
				{resultView === 'graph' && <Thumb />}
				<span className="pktw-relative pktw-z-10 pktw-inline-flex pktw-items-center pktw-gap-1.5">
					<Network className="pktw-w-3 pktw-h-3" /> Graph
				</span>
			</button>
		</div>
	);
};

/**
 * Compact / Detailed density toggle. Shared by List and Tree views (both
 * consume `resultDensity` from the store) so the user has one dial for
 * "how much detail per row" instead of two per-view knobs. Graph view
 * ignores density.
 */
export const ResultDensityToggle: React.FC = () => {
	const density = useVaultSearchStore((s) => s.resultDensity);
	const setDensity = useVaultSearchStore((s) => s.setResultDensity);
	const optBase = 'pktw-relative pktw-inline-flex pktw-items-center pktw-px-3 pktw-py-1 pktw-rounded-full pktw-text-pk-sm pktw-font-medium';
	const activeLabel = 'pktw-text-white';
	const idleLabel = 'pktw-text-pk-foreground-muted hover:pktw-text-pk-accent pktw-transition-colors';
	return (
		<div
			role="tablist"
			aria-label="Result panel density"
			className="pktw-inline-flex pktw-items-center pktw-p-0.5 pktw-gap-0.5 pktw-bg-pk-surface-sunken pktw-rounded-full pktw-border pktw-border-pk-border"
		>
			{(['compact', 'detailed'] as const).map((d) => {
				const active = density === d;
				return (
					<button
						key={d}
						type="button"
						role="tab"
						aria-selected={active}
						title={d === 'compact' ? 'Compact — one line per result' : 'Detailed — result title + snippet + path / anchor'}
						onClick={() => setDensity(d)}
						className={cn(optBase, active ? activeLabel : idleLabel)}
					>
						{active && (
							<motion.div
								layoutId="result-density-thumb"
								className="pktw-absolute pktw-inset-0 pktw-rounded-full pktw-bg-pk-accent"
								transition={{ type: 'spring', stiffness: 500, damping: 34 }}
							/>
						)}
						<span className="pktw-relative pktw-z-10">{d === 'compact' ? 'Compact' : 'Detailed'}</span>
					</button>
				);
			})}
		</div>
	);
};

/**
 * Right-side graph-specific controls: pinned hub chip + preset picker +
 * semantic toggle. Only visible when the user is on graph view; on list
 * view this renders nothing (returns null). The 3-way view-mode toggle
 * itself moved to `<ViewModeToggle />`, rendered on the LEFT of the same
 * toolbar row in SearchModal.
 */
export const ResultPaneGraphControls: React.FC<ResultPaneHeaderProps> = ({ mode, className }) => {
	const resultView = useVaultSearchStore((s) => s.resultView);
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
	if (resultView !== 'graph') return <PinnedHubChip />;

	return (
		<div className={cn('pktw-flex pktw-items-center pktw-gap-2.5', className)}>
			<PinnedHubChip />
			<GraphPresetSegmented />
			<SemanticToggle />
		</div>
	);
};

// Back-compat alias so the old import site still resolves during rollout.
export const ResultPaneHeader = ResultPaneGraphControls;
