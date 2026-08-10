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
import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { List, ListTree, Network } from 'lucide-react';
import { CodeMirrorInput } from '@/ui/component/mine/codemirror-input';
import { KeyboardShortcut } from '@/ui/component/mine/KeyboardShortcut';
import { GraphSemanticToggle } from '@/ui/component/graph/GraphSemanticToggle';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import { PEAK_CONTROL_KEY_TIP_KEYS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';
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

const GRAPH_PRESET_KEY_TIPS: Readonly<Record<ResultBrowserGraphPreset, string>> = {
	constellation: PEAK_CONTROL_KEY_TIP_KEYS.search.graphPreset.constellation,
	'flow-tb': PEAK_CONTROL_KEY_TIP_KEYS.search.graphPreset.flowTb,
	'flow-lr': PEAK_CONTROL_KEY_TIP_KEYS.search.graphPreset.flowLr,
	folder: PEAK_CONTROL_KEY_TIP_KEYS.search.graphPreset.folder,
	orbit: PEAK_CONTROL_KEY_TIP_KEYS.search.graphPreset.orbit,
};

// ---------------------------------------------------------------------------
// Search / local-filter input
// ---------------------------------------------------------------------------

export interface ResultBrowserSearchInputProps {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	layout?: 'single-line' | 'adaptive';
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
>(({ value, onChange, placeholder, layout = 'single-line', onKeyDown, className, ariaLabel }, ref) => (
	<CodeMirrorInput
		ref={ref}
		value={value}
		onChange={onChange}
		onKeyDown={onKeyDown}
		placeholder={placeholder}
		aria-label={ariaLabel ?? placeholder}
		enableSearchTags={false}
		heightMode={layout === 'adaptive' ? 'compact-adaptive' : 'compact-single-line'}
		containerClassName={cn(
			'pktw-flex-1 pktw-min-w-0 pktw-px-4',
			layout === 'adaptive' ? 'pktw-py-1' : 'pktw-py-2.5',
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
export const ResultBrowserFooterHints: React.FC<{
	showNewTab?: boolean;
	inspectorOpen?: boolean;
}> = ({
	showNewTab = true,
	inspectorOpen = false,
}) => (
	<div className="pktw-flex pktw-items-center pktw-gap-4 pktw-text-xs pktw-text-pk-text-tertiary">
		<KeyboardShortcut keys="↑↓" description="navigate" />
		<KeyboardShortcut keys="Enter" description="open" />
		{showNewTab && <KeyboardShortcut keys="Ctrl+Enter" description="new tab" />}
		<KeyboardShortcut
			keys={inspectorOpen ? '←' : '→'}
			description={inspectorOpen ? 'close inspector' : 'inspector'}
		/>
	</div>
);

// ---------------------------------------------------------------------------
// View mode toggle (List / Tree / Graph)
// ---------------------------------------------------------------------------

export interface ViewModeToggleProps {
	view: ResultBrowserView;
	onViewChange: (view: ResultBrowserView) => void;
	keyTipKeys?: Readonly<Record<ResultBrowserView, string>>;
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

export const ResultBrowserViewToggle: React.FC<ViewModeToggleProps> = ({
	view,
	onViewChange,
	keyTipKeys = PEAK_CONTROL_KEY_TIP_KEYS.search.view,
}) => {
	const rootRef = useRef<HTMLDivElement>(null);
	useRovingComposite(rootRef, {
		itemSelector: '[role="tab"]',
		orientation: 'horizontal',
		onActiveItem: (item) => onViewChange(item.dataset.resultView as ResultBrowserView),
	});
	return (
		<div
			ref={rootRef}
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
						role="tab"
						aria-selected={active}
						tabIndex={active ? 0 : -1}
						data-result-view={id}
						data-peak-keytip-key={keyTipKeys[id]}
						data-peak-keytip-label={`${label} view`}
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
};

// ---------------------------------------------------------------------------
// Density toggle (Compact / Detailed) — shared by List + Tree
// ---------------------------------------------------------------------------

export interface DensityToggleProps {
	density: ResultBrowserDensity;
	onDensityChange: (density: ResultBrowserDensity) => void;
	keyTipKeys?: Readonly<Record<ResultBrowserDensity, string>>;
}

export const ResultBrowserDensityToggle: React.FC<DensityToggleProps> = ({
	density,
	onDensityChange,
	keyTipKeys = PEAK_CONTROL_KEY_TIP_KEYS.search.density,
}) => {
	const rootRef = useRef<HTMLDivElement>(null);
	useRovingComposite(rootRef, {
		itemSelector: '[role="tab"]',
		orientation: 'horizontal',
		onActiveItem: (item) => onDensityChange(item.dataset.resultDensity as ResultBrowserDensity),
	});
	return (
		<div
			ref={rootRef}
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
						tabIndex={active ? 0 : -1}
						data-result-density={d}
						data-peak-keytip-key={keyTipKeys[d]}
						data-peak-keytip-label={`${d === 'compact' ? 'Compact' : 'Detailed'} results`}
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
};

// ---------------------------------------------------------------------------
// Graph controls (preset segmented + semantic toggle)
// ---------------------------------------------------------------------------

export interface GraphControlsProps {
	preset: ResultBrowserGraphPreset;
	onPresetChange: (preset: ResultBrowserGraphPreset) => void;
	semantic?: boolean;
	onSemanticChange?: (on: boolean) => void;
	/** Optional host-owned chip (e.g. Quick Search's pinned-hub chip). */
	leadingSlot?: React.ReactNode;
	className?: string;
	keyTipKeys?: {
		preset: Readonly<Record<ResultBrowserGraphPreset, string>>;
		semantic: string;
	};
}

const GraphPresetSegmented: React.FC<Pick<GraphControlsProps, 'preset' | 'onPresetChange' | 'keyTipKeys'>> = ({
	preset,
	onPresetChange,
	keyTipKeys,
}) => {
	const rootRef = useRef<HTMLDivElement>(null);
	useRovingComposite(rootRef, {
		itemSelector: '[role="tab"]',
		orientation: 'horizontal',
		onActiveItem: (item) => onPresetChange(item.dataset.graphPreset as ResultBrowserGraphPreset),
	});
	return (
		<div
			ref={rootRef}
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
						tabIndex={active ? 0 : -1}
						data-graph-preset={id}
						data-peak-keytip-key={(keyTipKeys?.preset ?? GRAPH_PRESET_KEY_TIPS)[id]}
						data-peak-keytip-label={`${label} graph layout`}
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
};

export const ResultBrowserGraphControls: React.FC<GraphControlsProps> = ({
	preset, onPresetChange, semantic, onSemanticChange, leadingSlot, className, keyTipKeys,
}) => (
	<div className={cn('pktw-flex pktw-items-center pktw-gap-2.5', className)}>
		{leadingSlot}
		<GraphPresetSegmented preset={preset} onPresetChange={onPresetChange} keyTipKeys={keyTipKeys} />
		{typeof semantic === 'boolean' && onSemanticChange && (
			<GraphSemanticToggle
				checked={semantic}
				onCheckedChange={onSemanticChange}
				keyTipKey={keyTipKeys?.semantic ?? PEAK_CONTROL_KEY_TIP_KEYS.search.graphSemantic}
			/>
		)}
	</div>
);
