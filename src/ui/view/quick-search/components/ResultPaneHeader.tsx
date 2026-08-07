/**
 * Quick Search host adapters for the shared Result Browser toolbar.
 *
 * The controlled toolbar primitives (view toggle, density toggle, graph
 * controls) live in `@/ui/component/result-browser/toolbar/ResultBrowserToolbar`.
 * These thin wrappers bind them to `vaultSearchStore` and keep the pinned-hub
 * chip (a Quick-Search-only affordance). Export names are unchanged so
 * `SearchModal` wiring stays put.
 */
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { Chip } from '@/ui/components/primitives';
import { cn } from '@/ui/react/lib/utils';
import { useVaultSearchStore } from '../store';
import type { QuickSearchMode } from '../store/vaultSearchStore';
import {
	ResultBrowserViewToggle,
	ResultBrowserDensityToggle,
	ResultBrowserGraphControls,
} from '@/ui/component/result-browser/toolbar/ResultBrowserToolbar';
import { PEAK_CONTROL_KEY_TIP_KEYS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';

interface ResultPaneHeaderProps {
	mode: QuickSearchMode;
	className?: string;
}

/**
 * T7: chip showing an active hub pin ("Pinned to hub: N docs · clear").
 * Quick-Search-only — the shared toolbar exposes a `leadingSlot` for it.
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
			data-peak-keytip-key={PEAK_CONTROL_KEY_TIP_KEYS.search.clearPinnedHub}
			data-peak-keytip-label="Clear pinned hub"
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

/** 3-way view mode toggle — bound to `vaultSearchStore.resultView`. */
export const ViewModeToggle: React.FC = () => {
	const view = useVaultSearchStore((s) => s.resultView);
	const setResultView = useVaultSearchStore((s) => s.setResultView);
	return <ResultBrowserViewToggle view={view} onViewChange={setResultView} />;
};

/** Compact / Detailed density toggle — bound to `vaultSearchStore.resultDensity`. */
export const ResultDensityToggle: React.FC = () => {
	const density = useVaultSearchStore((s) => s.resultDensity);
	const setDensity = useVaultSearchStore((s) => s.setResultDensity);
	return <ResultBrowserDensityToggle density={density} onDensityChange={setDensity} />;
};

/**
 * Right-side graph-specific controls: pinned hub chip + preset picker +
 * semantic toggle. Only visible on graph view; on list view renders just the
 * pinned-hub chip (or nothing).
 */
export const ResultPaneGraphControls: React.FC<ResultPaneHeaderProps> = ({ mode, className }) => {
	const resultView = useVaultSearchStore((s) => s.resultView);
	const preset = useVaultSearchStore((s) => s.graphPreset);
	const setPreset = useVaultSearchStore((s) => s.setGraphPreset);
	const semantic = useVaultSearchStore((s) => s.graphShowSemantic);
	const setSemantic = useVaultSearchStore((s) => s.setGraphShowSemantic);
	const pinnedResultDocIds = useVaultSearchStore((s) => s.pinnedResultDocIds);
	const setPinnedResultDocIds = useVaultSearchStore((s) => s.setPinnedResultDocIds);

	// T7: exit criterion — leaving `all` mode invalidates the pin, since heading
	// mode is scoped to a single file. `help` also clears the pin.
	useEffect(() => {
		if (mode !== 'all' && pinnedResultDocIds) {
			setPinnedResultDocIds(null);
		}
	}, [mode, pinnedResultDocIds, setPinnedResultDocIds]);

	if (mode === 'help') return null;
	if (resultView !== 'graph') return <PinnedHubChip />;

	return (
		<ResultBrowserGraphControls
			preset={preset}
			onPresetChange={setPreset}
			semantic={semantic}
			onSemanticChange={setSemantic}
			leadingSlot={<PinnedHubChip />}
			className={cn(className)}
		/>
	);
};

// Back-compat alias so the old import site still resolves during rollout.
export const ResultPaneHeader = ResultPaneGraphControls;
