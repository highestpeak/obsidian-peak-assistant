/**
 * Shared Result Browser controls that are not graph-specific. Graph view,
 * scope, projection and canvas actions belong to `GraphWorkspaceControl`.
 *
 * Pure presentation: every piece of state comes in as a prop and every change
 * leaves as a callback. No store, no service context, no telemetry. Host
 * adapters bind these to their own state (Quick Search → `vaultSearchStore`).
 */
import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { CodeMirrorInput } from '@/ui/component/mine/codemirror-input';
import { KeyboardShortcut } from '@/ui/component/mine/KeyboardShortcut';
import { Button } from '@/ui/component/shared-ui/button';
import { cn } from '@/ui/react/lib/utils';
import { useRovingComposite } from '@/ui/keyboard/useRovingComposite';
import { PEAK_CONTROL_KEY_TIP_KEYS } from '@/ui/keyboard/config/KeyboardNavigationDefaults';
import type {
	ResultBrowserDensity,
} from '../model/types';

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

const Thumb: React.FC<{ layoutId: string }> = ({ layoutId }) => (
	<motion.div
		layoutId={layoutId}
		className="pktw-absolute pktw-inset-0 pktw-rounded-full pktw-bg-pk-accent"
		transition={{ type: 'spring', stiffness: 500, damping: 34 }}
	/>
);

const TOOLBAR_OPT_BASE = 'pk-result-browser-toolbar__option pktw-relative pktw-inline-flex pktw-items-center pktw-gap-1.5 pktw-rounded-full pktw-text-sm pktw-font-medium';

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
