/**
 * Controlled toolbar for the shared Result Browser: 3-way view toggle,
 * List/Tree density toggle, and graph-only controls (preset segmented +
 * semantic switch + an optional pinned-hub chip slot). Extracted from Quick
 * Search's `ResultPaneHeader.tsx` (plan §B "Extract controlled toolbar
 * components").
 *
 * Pure presentation: every piece of state comes in as a prop and every change
 * leaves as a callback. No store, no service context, no telemetry. Host
 * adapters bind these to their own state (Quick Search → `vaultSearchStore`).
 */
import React from 'react';
import { motion } from 'framer-motion';
import { List, ListTree, Network } from 'lucide-react';
import { CodeMirrorInput } from '@/ui/component/mine/codemirror-input';
import { KeyboardShortcut } from '@/ui/component/mine/KeyboardShortcut';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import type {
	ResultBrowserDensity,
	ResultBrowserGraphPreset,
	ResultBrowserView,
} from '../model/types';

const PRESET_LABELS: Array<[ResultBrowserGraphPreset, string, string]> = [
	['constellation', 'Constellation', 'Force-directed cluster — how do these results cluster together?'],
	['flow-tb',       'Flow ↓',        'Top-down hierarchical flow — what references what?'],
	['flow-lr',       'Flow →',        'Left-right hierarchical flow — same as ↓ but sideways'],
	['folder',        'Folder tree',   'Full-depth folder tree — where in my vault do they live?'],
	['orbit',         'Orbit',         'Hubs at center, docs orbit — are hubs the center of gravity?'],
];

// ---------------------------------------------------------------------------
// Search / local-filter input
// ---------------------------------------------------------------------------

export interface ResultBrowserSearchInputProps {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
	className?: string;
	ariaLabel?: string;
}

/**
 * The canonical Result Browser query field. Quick Search and Composer's
 * frozen-snapshot browser deliberately share this component so Obsidian's
 * native input styles cannot create a second nested border.
 */
export const ResultBrowserSearchInput = React.forwardRef<
	{ focus: () => void; select: () => void },
	ResultBrowserSearchInputProps
>(({ value, onChange, placeholder, onKeyDown, className, ariaLabel }, ref) => (
	<CodeMirrorInput
		ref={ref}
		value={value}
		onChange={onChange}
		onKeyDown={onKeyDown}
		placeholder={placeholder}
		aria-label={ariaLabel ?? placeholder}
		enableSearchTags={false}
		singleLine
		containerClassName={cn(
			'pktw-flex-1 pktw-min-w-0 pktw-px-4 pktw-py-2.5',
			'pktw-bg-pk-surface-raised pktw-border pktw-border-pk-border',
			'focus-within:pktw-border-pk-accent focus-within:pktw-shadow-sm',
			'pktw-rounded-full pktw-transition-all pktw-z-0',
			className,
		)}
		className="pktw-pr-2"
	/>
));
ResultBrowserSearchInput.displayName = 'ResultBrowserSearchInput';

/** Keyboard contract shared by Search and other list-first Result Browsers. */
export const ResultBrowserFooterHints: React.FC<{ showNewTab?: boolean }> = ({
	showNewTab = true,
}) => (
	<div className="pktw-flex pktw-items-center pktw-gap-4 pktw-text-xs pktw-text-pk-text-tertiary">
		<KeyboardShortcut keys="↑↓" description="navigate" />
		<KeyboardShortcut keys="Enter" description="open" />
		{showNewTab && <KeyboardShortcut keys="Ctrl+Enter" description="new tab" />}
		<KeyboardShortcut keys="→" description="inspector" />
	</div>
);

// ---------------------------------------------------------------------------
// View mode toggle (List / Tree / Graph)
// ---------------------------------------------------------------------------

export interface ViewModeToggleProps {
	view: ResultBrowserView;
	onViewChange: (view: ResultBrowserView) => void;
}

const Thumb: React.FC<{ layoutId: string }> = ({ layoutId }) => (
	<motion.div
		layoutId={layoutId}
		className="pktw-absolute pktw-inset-0 pktw-rounded-full pktw-bg-pk-accent"
		transition={{ type: 'spring', stiffness: 500, damping: 34 }}
	/>
);

const TOOLBAR_OPT_BASE = 'pk-result-browser-toolbar__option pktw-relative pktw-inline-flex pktw-items-center pktw-gap-1.5 pktw-rounded-full pktw-text-sm pktw-font-medium';
const ACTIVE_LABEL = 'pktw-relative pktw-z-10 pktw-text-white';
const IDLE_LABEL = 'pktw-relative pktw-z-10 pktw-text-pk-foreground-muted hover:pktw-text-pk-accent pktw-transition-colors';

const VIEW_OPTIONS: Array<[ResultBrowserView, string, typeof List]> = [
	['list', 'List', List],
	['tree', 'Tree', ListTree],
	['graph', 'Graph', Network],
];

const VIEW_TITLES: Record<ResultBrowserView, string> = {
	list: 'List view',
	tree: 'Tree — vault folder hierarchy',
	graph: 'Graph — relations between results',
};

export const ResultBrowserViewToggle: React.FC<ViewModeToggleProps> = ({ view, onViewChange }) => (
	<div
		role="tablist"
		aria-label="Result view mode"
		className="pktw-inline-flex pktw-items-center pktw-p-0.5 pktw-gap-0.5 pktw-bg-pk-surface-sunken pktw-rounded-full pktw-border pktw-border-pk-border"
	>
		{VIEW_OPTIONS.map(([id, label, Icon]) => {
			const active = view === id;
			return (
					<Button
						key={id}
						type="button"
						variant="unstyled"
						size="sm"
						title={VIEW_TITLES[id]}
						onClick={() => { if (view !== id) onViewChange(id); }}
						className={cn(TOOLBAR_OPT_BASE, active ? ACTIVE_LABEL : IDLE_LABEL)}
				>
					{active && <Thumb layoutId="view-mode-thumb" />}
					<span className="pktw-relative pktw-z-10 pktw-inline-flex pktw-items-center pktw-gap-1.5">
							<Icon className="pktw-w-3.5 pktw-h-3.5" /> {label}
						</span>
					</Button>
			);
		})}
	</div>
);

// ---------------------------------------------------------------------------
// Density toggle (Compact / Detailed) — shared by List + Tree
// ---------------------------------------------------------------------------

export interface DensityToggleProps {
	density: ResultBrowserDensity;
	onDensityChange: (density: ResultBrowserDensity) => void;
}

export const ResultBrowserDensityToggle: React.FC<DensityToggleProps> = ({ density, onDensityChange }) => (
	<div
		role="tablist"
		aria-label="Result panel density"
		className="pktw-inline-flex pktw-items-center pktw-p-0.5 pktw-gap-0.5 pktw-bg-pk-surface-sunken pktw-rounded-full pktw-border pktw-border-pk-border"
	>
		{(['compact', 'detailed'] as const).map((d) => {
			const active = density === d;
			return (
					<Button
						key={d}
						type="button"
						variant="unstyled"
						size="sm"
						role="tab"
					aria-selected={active}
					title={d === 'compact' ? 'Compact — one line per result' : 'Detailed — result title + snippet + path / anchor'}
					onClick={() => onDensityChange(d)}
					className={cn(TOOLBAR_OPT_BASE, active ? 'pktw-text-white' : 'pktw-text-pk-foreground-muted hover:pktw-text-pk-accent pktw-transition-colors')}
				>
					{active && <Thumb layoutId="result-density-thumb" />}
					<span className="pktw-relative pktw-z-10">{d === 'compact' ? 'Compact' : 'Detailed'}</span>
					</Button>
			);
		})}
	</div>
);

// ---------------------------------------------------------------------------
// Graph controls (preset segmented + semantic toggle)
// ---------------------------------------------------------------------------

export interface GraphControlsProps {
	preset: ResultBrowserGraphPreset;
	onPresetChange: (preset: ResultBrowserGraphPreset) => void;
	semantic: boolean;
	onSemanticChange: (on: boolean) => void;
	/** Optional host-owned chip (e.g. Quick Search's pinned-hub chip). */
	leadingSlot?: React.ReactNode;
	className?: string;
}

const GraphPresetSegmented: React.FC<Pick<GraphControlsProps, 'preset' | 'onPresetChange'>> = ({ preset, onPresetChange }) => (
	<div
		role="tablist"
		aria-label="Graph view preset"
		className="pktw-inline-flex pktw-items-center pktw-p-0.5 pktw-gap-0.5 pktw-bg-pk-surface-sunken pktw-rounded-full pktw-border pktw-border-pk-border"
	>
		{PRESET_LABELS.map(([id, label, title]) => {
			const active = preset === id;
			return (
					<Button
						key={id}
						type="button"
						variant="unstyled"
						size="sm"
						role="tab"
					aria-selected={active}
					title={title}
					onClick={() => onPresetChange(id)}
						className={cn(
							TOOLBAR_OPT_BASE,
							active ? 'pktw-text-white' : 'pktw-text-pk-foreground-muted hover:pktw-text-pk-accent pktw-transition-colors',
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
					</Button>
			);
		})}
	</div>
);

const SemanticToggle: React.FC<Pick<GraphControlsProps, 'semantic' | 'onSemanticChange'>> = ({ semantic, onSemanticChange }) => (
	<label
		className="pktw-inline-flex pktw-min-h-8 pktw-items-center pktw-gap-1.5 pktw-cursor-pointer pktw-select-none pktw-text-sm pktw-text-pk-foreground-muted"
		title="Layer semantic-similarity edges on top of the current preset. Uses pre-indexed embeddings — instant, no AI credits, no network."
	>
		<input
			type="checkbox"
			checked={semantic}
			onChange={(e) => onSemanticChange(e.target.checked)}
			className="pktw-sr-only peer"
			aria-label="Toggle semantic edges"
		/>
		<span
			aria-hidden="true"
			className={cn(
				'pktw-relative pktw-inline-block pktw-w-[30px] pktw-h-4 pktw-rounded-full pktw-transition-colors',
				semantic ? 'pktw-bg-pk-accent' : 'pktw-bg-pk-border',
			)}
		>
			<span
				className={cn(
					'pktw-absolute pktw-top-0.5 pktw-left-0.5 pktw-w-3 pktw-h-3 pktw-bg-white pktw-rounded-full pktw-shadow-pk-card',
					'pktw-transition-transform',
					semantic ? 'pktw-translate-x-[14px]' : 'pktw-translate-x-0',
				)}
			/>
		</span>
		<span>Semantic</span>
	</label>
);

export const ResultBrowserGraphControls: React.FC<GraphControlsProps> = ({
	preset, onPresetChange, semantic, onSemanticChange, leadingSlot, className,
}) => (
	<div className={cn('pktw-flex pktw-items-center pktw-gap-2.5', className)}>
		{leadingSlot}
		<GraphPresetSegmented preset={preset} onPresetChange={onPresetChange} />
		<SemanticToggle semantic={semantic} onSemanticChange={onSemanticChange} />
	</div>
);
