import React from 'react';
import { Network } from 'lucide-react';
import { IconButton, Pill } from '@/ui/components/primitives';
import { cn } from '@/ui/react/lib/utils';
import { useVaultSearchStore } from '../store';
import type { QuickSearchMode } from '../store/vaultSearchStore';

/**
 * T3 (2026-07-07 result graph): shell header sitting on top of the result
 * pane. It hosts:
 *  - A right-aligned Network icon toggling `resultView` between
 *    `'list'` and `'graph'`. Active state uses the accent tint via the
 *    shared `data-active` convention on `.pk-icon-btn` (see
 *    `peak-components.css` §"Active toggle state for IconButton").
 *  - Two overlay Pills (Folder / Semantic) that appear only while the
 *    graph view is on. These control `graphOverlayFolder` +
 *    `graphOverlaySemantic`; T4's ResultGraphView reads them.
 *
 * The header is intentionally light — no title, no divider — because the
 * result pane already has its own visual separation from the query bar.
 *
 * `help` mode has no graph representation, so the whole header collapses
 * to `null` in that mode (result list still renders on its own).
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

export const ResultPaneHeader: React.FC<ResultPaneHeaderProps> = ({ mode, className }) => {
	const resultView = useVaultSearchStore((s) => s.resultView);
	const setResultView = useVaultSearchStore((s) => s.setResultView);

	if (mode === 'help') return null;

	const isGraph = resultView === 'graph';
	const toggle = () => setResultView(isGraph ? 'list' : 'graph');

	return (
		<div
			className={cn(
				'pktw-flex pktw-items-center pktw-justify-end pktw-gap-2 pktw-px-3 pktw-py-1.5',
				className,
			)}
		>
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
